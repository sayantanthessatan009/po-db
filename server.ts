import express from 'express';
import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { INITIAL_POS, INITIAL_ALERTS } from './src/data.js';
import { PO, POItem, SystemAlert } from './src/types.js';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Paths for persistence within the server environment
const DB_FILE = path.join(process.cwd(), 'pos-db.json');
const ALERTS_FILE = path.join(process.cwd(), 'alerts-db.json');

// Initialize local DB files if they don't exist
function initDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_POS, null, 2));
      console.log('Seeded pos-db.json with initial TATA POs.');
    }
    if (!fs.existsSync(ALERTS_FILE)) {
      fs.writeFileSync(ALERTS_FILE, JSON.stringify(INITIAL_ALERTS, null, 2));
      console.log('Seeded alerts-db.json with initial alarms.');
    }
  } catch (error) {
    console.error('Error seeding databases:', error);
  }
}
initDB();

// Helper functions for reading/writing persistent data
async function readPOs(): Promise<PO[]> {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = await fs.promises.readFile(DB_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error reading PO db:', e);
  }
  return INITIAL_POS;
}

async function writePOs(pos: PO[]) {
  const seen = new Set<string>();
  const uniquePos = pos.filter(p => {
    if (!p || !p.id) return false;
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  await fs.promises.writeFile(DB_FILE, JSON.stringify(uniquePos, null, 2), 'utf8');
}

async function readAlerts(): Promise<SystemAlert[]> {
  try {
    if (fs.existsSync(ALERTS_FILE)) {
      const data = await fs.promises.readFile(ALERTS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error reading alerts db:', e);
  }
  return INITIAL_ALERTS;
}

async function writeAlerts(alerts: SystemAlert[]) {
  await fs.promises.writeFile(ALERTS_FILE, JSON.stringify(alerts, null, 2), 'utf8');
}

// Lazy-loaded pdf-parse module cache.
// NOTE: We intentionally avoid `createRequire(import.meta.url)` here.
// That pattern only works when the *runtime* module format is real ESM.
// Depending on build config (tsc/esbuild/etc.), this file can get compiled
// down to CommonJS (e.g. dist/server.cjs), in which case `import.meta.url`
// is undefined and `createRequire(undefined)` throws:
//   TypeError [ERR_INVALID_ARG_VALUE]: The argument 'filename' must be a
//   file URL object, file URL string, or absolute path string. Received undefined
// A dynamic import() works correctly in both ESM and CJS-compiled output,
// so we use that instead, and only load it the first time it's needed.
let pdfParseModule: any = null;
async function getPdfParse() {
  if (!pdfParseModule) {
    const mod = (await import('pdf-parse')) as any;
    pdfParseModule = mod.default || mod;
  }
  return pdfParseModule;
}

// Instantiate Google Gen AI Client on the server side
// The GEMINI_API_KEY is pre-configured and automatically loaded
let aiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  aiClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// -------------------------------------------------------------
// REST API ENDPOINTS
// -------------------------------------------------------------

// 0. Serve Supabase Credentials at runtime to bypass static build compilation limits
app.get('/api/supabase-config', (req, res) => {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  res.json({
    supabaseUrl: url.trim(),
    supabaseAnonKey: anonKey.trim()
  });
});

// 1. Get all POs
app.get('/api/pos', async (req, res) => {
  const pos = await readPOs();
  res.json(pos);
});

// 2. Create high-fidelity Purchase Order manually
app.post('/api/pos', async (req, res) => {
  try {
    const newPO = req.body as PO;
    if (!newPO.id || !newPO.orderNo) {
      res.status(400).json({ error: 'Order ID and Order No are required.' });
      return;
    }
    let pos = await readPOs();
    pos = pos.filter(p => p.id !== newPO.id);
    pos.unshift(newPO);
    await writePOs(pos);

    // Auto-trigger alerts on certain states
    const alerts = await readAlerts();
    if (newPO.status === 'Delayed') {
      alerts.unshift({
        id: `alert_auto_${Date.now()}`,
        poId: newPO.id,
        poNo: newPO.orderNo,
        type: 'eta_warning',
        title: 'Delayed PO Schedule Alert',
        message: `High risk delivery tracking on PO ${newPO.orderNo}. Estimated ETA conflicts with TATA production timelines.`,
        severity: 'high',
        date: new Date().toISOString().split('T')[0],
        read: false
      });
      await writeAlerts(alerts);
    }

    res.status(201).json(newPO);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Update Purchase Order status/dates/compliance details
app.put('/api/pos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedPO = req.body as Partial<PO>;
    const pos = await readPOs();
    const idx = pos.findIndex(p => p.id === id);

    if (idx === -1) {
      res.status(404).json({ error: 'PO not found.' });
      return;
    }

    const merged = { ...pos[idx], ...updatedPO };
    pos[idx] = merged;
    await writePOs(pos);

    // If status changed to 'Dispatched', we can trigger an info alert!
    if (updatedPO.status === 'Dispatched') {
      const alerts = await readAlerts();
      alerts.unshift({
        id: `alert_auto_dispatch_${Date.now()}`,
        poId: merged.id,
        poNo: merged.orderNo,
        type: 'dispatch_due',
        title: 'PO Dispatched Successfully',
        message: `Purchase Order ${merged.orderNo} has been dispatched. Track compliance via TRK code ${merged.trackingNumber || 'Pending'}.`,
        severity: 'info',
        date: new Date().toISOString().split('T')[0],
        read: false
      });
      await writeAlerts(alerts);
    }

    res.json(merged);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Delete Purchase Order
app.delete('/api/pos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let pos = await readPOs();
    pos = pos.filter(p => p.id !== id);
    await writePOs(pos);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Get all system alarms/alerts
app.get('/api/alerts', async (req, res) => {
  const alerts = await readAlerts();
  res.json(alerts);
});

// 6. Dismiss/Read alarms/alerts
app.post('/api/alerts/read', async (req, res) => {
  try {
    const { alertId } = req.body;
    const alerts = await readAlerts();
    const index = alerts.findIndex(a => a.id === alertId);
    if (index !== -1) {
      alerts[index].read = true;
      await writeAlerts(alerts);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Clear all items
app.post('/api/alerts/clear-all', async (req, res) => {
  try {
    const alerts = await readAlerts();
    const updated = alerts.map(a => ({ ...a, read: true }));
    await writeAlerts(updated);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Bulk Sync POs (Auto-healing client-state restore)
app.post('/api/pos/sync', async (req, res) => {
  try {
    const pos = req.body as PO[];
    if (Array.isArray(pos)) {
      await writePOs(pos);
      console.log(`Sync complete: ${pos.length} POs restored to pos-db.json.`);
      res.json({ success: true, count: pos.length });
    } else {
      res.status(400).json({ error: 'Body must be an array of PO objects.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Bulk Sync Alerts (Auto-healing client-state restore)
app.post('/api/alerts/sync', async (req, res) => {
  try {
    const alerts = req.body as SystemAlert[];
    if (Array.isArray(alerts)) {
      await writeAlerts(alerts);
      console.log(`Sync complete: ${alerts.length} alerts restored to alerts-db.json.`);
      res.json({ success: true, count: alerts.length });
    } else {
      res.status(400).json({ error: 'Body must be an array of Alert objects.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// BACKEND AI ENGINES (GEMINI INTELLIGENCE)
// -------------------------------------------------------------

// Parse raw TATA Purchase Order text pasted or uploaded
app.post('/api/pos/upload', async (req, res) => {
  try {
    const { ocrText, pdfData, groqApiKey } = req.body;
    if ((!ocrText || !ocrText.trim()) && (!pdfData || !pdfData.trim())) {
      res.status(400).json({ error: 'No purchase order PDF or custom text received.' });
      return;
    }

    const activeGroqKey = (groqApiKey || '').trim() || (process.env.GROQ_API_KEY || '').trim();

    if (!aiClient && !activeGroqKey) {
      res.status(500).json({ error: 'Gemini AI API key (GEMINI_API_KEY) and Groq API key are both missing on this server environment. Please open Settings or paste a valid Groq API Key.' });
      return;
    }

    const instruction = `
You are an expert procurement and logistics data parser specializing in industrial TATA STEEL Purchase Orders. Your goal is to parse raw text or PDF documents and return a robust JSON object matching the exact JSON schema defined below.

Expected Output Schema (must output STRICT VALID JSON):
{
  "orderNo": "Order No or string like: 2100970424/175",
  "companyName": "Usually TATA STEEL LIMITED if not mentioned",
  "location": "Specify location of work such as Jamshedpur, Kalinganagar, Adityapur, etc.",
  "orderDate": "YYYY-MM-DD",
  "releaseDate": "YYYY-MM-DD",
  "validityStart": "YYYY-MM-DD (optional)",
  "validityEnd": "YYYY-MM-DD (optional)",
  "contactPerson": "Contact person name, e.g. Sneha Bagchi",
  "contactEmail": "Email e.g., 163760@tatasteel.com",
  "contactPhone": "Phone no string (optional)",
  "vendorCode": "P056 (or vendor code string)",
  "vendorName": "PRECISION SPARES MFG CO (or matching name)",
  "vendorEmail": "precision.spares@yahoo.co.in (or matching email)",
  "vendorPhone": "Vendor phone (optional)",
  "totalOrderValue": 711953.47,
  "currency": "INR",
  "paymentTerm": "Payment term string, such as 100% within 45 days of sat receipt",
  "deliveryTerms": "e.g., Ex Works 3PL, Free on road TGS",
  "logisticsPartner": "e.g. O.W.M. Logistics (extract if available, otherwise suggest based on delivery terms)",
  "status": "Released (must be one of: 'Released', 'In Production', 'Dispatched', 'Delivered', 'Delayed', 'Preponement of Delivery Schedule')",
  "complianceRating": 85,
  "liquidatedDamagesClause": "liquidated damages clause such as 0.5% per week max 5%",
  "notes": "Short general summary of requirements, packaging rules (such as page 1 packing carton requirements), or drawing approval requirement",
  "items": [
    {
      "itemNo": "00010 (item index)",
      "materialNo": "5628A4418 or part number",
      "materialDesc": "Full descriptive name of material",
      "materialGroup": "material group number e.g. 307 or 241",
      "materialGroupDesc": "matching description e.g. DRAWING MECHANICAL",
      "qty": 8.0,
      "unit": "Set or NOS",
      "grossPrice": 73940.0,
      "totalValue": 591520.0,
      "unloadingPoint": "delivery location e.g., CP10-11 IEM, Blast BF",
      "packingCharges": 1200.50,
      "forwardingCharges": 450.00,
      "delDays": 45,
      "umc": "Set",
      "drawingNo": "TSK-BF-2025-091",
      "partNo": "5628A4418",
      "modelNo": "GH-50-PRO",
      "make": "VAHLE"
    }
  ],
  "aiInsights": "Brief 1-2 sentence AI advisor bullet summarizing compliance status, key delivery date warning, and if validation of gate-pass is needed."
}

Do not include any wrapping markdown formatting like \`\`\`json. Output ONLY strict JSON.
`;

    let textContent = ocrText || '';
    if (pdfData) {
      console.log(`Starting text extraction on uploaded PDF (base64 size: ${pdfData.length})...`);
      try {
        const buffer = Buffer.from(pdfData, 'base64');
        const pdf = await getPdfParse();
        const pdfDataParsed = await pdf(buffer);
        textContent = pdfDataParsed.text;
        console.log(`Extracted ${textContent.length} characters of text from PDF using pdf-parse`);
      } catch (pdfErr: any) {
        console.error('pdf-parse failed:', pdfErr);
        if (!aiClient) {
          res.status(500).json({ error: `Failed to extract text from PDF: ${pdfErr.message}. Cannot parse with Groq.` });
          return;
        }
      }
    }

    // 1. If Groq Key is available, prioritize it
    if (activeGroqKey) {
      console.log('Using Groq model llama-3.3-70b-versatile for PDF parsing...');
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeGroqKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: instruction },
            { role: 'user', content: `Please parse this Purchase Order content and output STRICT JSON format matching the schema instructions:\n\n${textContent}` }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1
        })
      });

      const groqData = await groqRes.json() as any;
      if (!groqRes.ok) {
        console.error('Groq external API failure:', groqData);
        throw new Error(groqData.error?.message || `Groq responded with status code ${groqRes.status}`);
      }

      const parsedJsonText = groqData.choices?.[0]?.message?.content || '{}';
      console.log('Groq finished parsing successfully. Sample output:', parsedJsonText.substring(0, 150));
      const parsedData = JSON.parse(parsedJsonText);

      // Enrich with a unique ID format client-side expects
      parsedData.id = parsedData.orderNo ? parsedData.orderNo.replace(/\//g, '_') : `auto_${Date.now()}`;
      parsedData.complianceChecked = true;

      // Apply incremental items ID
      if (parsedData.items && Array.isArray(parsedData.items)) {
        parsedData.items = parsedData.items.map((it: any, i: number) => ({
          ...it,
          id: `parsed_it_${it.itemNo || i}_${Date.now()}`
        }));
      }

      res.json(parsedData);
      return;
    }

    // 2. Otherwise try Gemini client
    if (aiClient) {
      let contentsPayload: any;
      if (pdfData) {
        contentsPayload = {
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: pdfData
              }
            },
            {
              text: 'Parse the attached PO PDF. Carry out dynamic page scanning (up to 15 pages if needed, usually 2-5 pages is sufficient for standard documents) to determine where item details end and terms boilerplate starts, and output the strict compliant schema.'
            }
          ]
        };
      } else {
        contentsPayload = ocrText;
      }

      const normalizedContents = [
        {
          role: 'user',
          parts: contentsPayload && typeof contentsPayload === 'object' && Array.isArray(contentsPayload.parts)
            ? contentsPayload.parts
            : [{ text: typeof contentsPayload === 'string' ? contentsPayload : String(contentsPayload || '') }]
        }
      ];

      const response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: normalizedContents,
        config: {
          systemInstruction: instruction,
          responseMimeType: 'application/json'
        }
      });

      const parsedJsonText = response.text || '{}';
      console.log('Gemini finished parsing successfully. Sample output:', parsedJsonText.substring(0, 150));

      const parsedData = JSON.parse(parsedJsonText);

      // Enrich with a unique ID format client-side expects
      parsedData.id = parsedData.orderNo ? parsedData.orderNo.replace(/\//g, '_') : `auto_${Date.now()}`;
      parsedData.complianceChecked = true;

      // Apply incremental items ID
      if (parsedData.items && Array.isArray(parsedData.items)) {
        parsedData.items = parsedData.items.map((it: any, i: number) => ({
          ...it,
          id: `parsed_it_${it.itemNo || i}_${Date.now()}`
        }));
      }

      res.json(parsedData);
      return;
    }
  } catch (err: any) {
    console.error('Failed to parse PO:', err);
    res.status(500).json({ error: `AI Parsing failed. Details: ${err.message}` });
  }
});

// PO Smart Advisor Chat Assistant
app.post('/api/pos/chat-analyze', async (req, res) => {
  try {
    const { messages, poContext } = req.body;

    if (!aiClient) {
      res.status(500).json({ error: 'Gemini AI API key (GEMINI_API_KEY) is not provisioned on the server environment.' });
      return;
    }

    const latestMessage = messages[messages.length - 1];

    // Construct rich system instructions carrying context about the active TATA Steel PO and compliance instructions.
    const systemPrompt = `
You are the "TATA Steel Compliance & Dispatch AI Assistant". You help suppliers and managers review Purchase Orders, track dispatch alerts, calculate potential Liquidated Damages (penalty details: 0.5% per week up to a maximum of 5% of order value), and understand warehouse packaging norms (such as: pallet size 1m x 1m x 1m, metallic/recyclable polypropylene pallets for >20kg, no loose supply, 15-year vehicle limits outside general gates).

Here is the active PO context under discussion:
${poContext ? JSON.stringify(poContext, null, 2) : 'No specific PO chosen. Respond in context of general TATA Steel PO standards.'}

Respond directly to the user's inquiry:
- Reference specific clauses (e.g. Clause 4.2.2 for packaging, Clause 3.0 or 8.0 for LD limits, or Clause 32 for Gate Entry Invoicing rules).
- Support with real calculations where needed.
- Keep the tone encouraging, professional, and procurement-intelligent.
`;

    // Format chat history for Gemini
    const chat = aiClient.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: systemPrompt,
      }
    });

    const response = await chat.sendMessage({
      message: latestMessage.text || latestMessage.content || 'Calculate compliance summary of this purchase order'
    });

    res.json({ text: response.text });
  } catch (err: any) {
    console.error('Advisor Chat Error:', err);
    res.status(500).json({ error: `AI Advisor failed. Details: ${err.message}` });
  }
});

// Helper functions to compress POs list and alerts log for extreme token economy
function shrinkPOs(pos: PO[]): any[] {
  if (!Array.isArray(pos)) return [];
  return pos.map(p => ({
    orderNo: p.orderNo || '',
    vendor: p.vendorName || '',
    totalValue: p.totalOrderValue || 0,
    status: p.status || '',
    location: p.location || '',
    date: p.orderDate || '',
    validityEnd: p.validityEnd || '',
    rating: p.complianceRating || 0,
    items: (p.items || []).map(i => ({
      no: i.itemNo || '',
      desc: i.materialDesc || '',
      qty: i.qty || 0,
      unit: i.unit || '',
      price: i.grossPrice || 0,
      total: i.totalValue || 0,
      make: i.make || '',
      drawing: i.drawingNo || '',
      part: i.partNo || '',
      delDays: i.delDays || '',
      packing: i.packingCharges || 0,
      forwarding: i.forwardingCharges || 0
    }))
  }));
}

function shrinkAlerts(alerts: SystemAlert[]): any[] {
  if (!Array.isArray(alerts)) return [];
  return alerts.map(a => ({
    title: a.title || '',
    desc: a.message || '',
    poNo: a.poNo || '',
    type: a.type || '',
    read: !!a.read
  }));
}

// Deterministic offline professional report compiler for quota/429 fallback compliance
function buildLocalStrategicReport(pos: PO[], alerts: SystemAlert[]): string {
  const totalOutstanding = pos.reduce((sum, p) => sum + (p.totalOrderValue || 0), 0);
  const averageRating = pos.length > 0
    ? Math.round(pos.reduce((sum, p) => sum + (p.complianceRating || 0), 0) / pos.length)
    : 85;
  const activeAlerts = alerts.filter(a => !a.read);

  const delayedPOs = pos.filter(p => p.status === 'Delayed');
  const delayedItemsCount = pos.reduce((sum, p) => sum + (p.status === 'Delayed' ? (p.items?.length || 0) : 0), 0);

  let delayedTable = `| Order No | Vendor | Total PO Value | Delayed Weeks | Est. LD Liquidated Damages (0.5%/wk, max 5%) |\n|:---|:---|:---:|:---:|:---:|\n`;
  if (delayedPOs.length === 0) {
    delayedTable += `| - | No active delayed POs | - | - | - |\n`;
  } else {
    delayedPOs.forEach(p => {
      const ldPct = 0.02; // 2% average delayed damages
      const ldVal = Math.round(p.totalOrderValue * ldPct);
      delayedTable += `| **${p.orderNo}** | ${p.vendorName} | ₹${p.totalOrderValue.toLocaleString()} | ~4 weeks | ₹${ldVal.toLocaleString()} (2.0%) |\n`;
    });
  }

  const heavyItems = pos.flatMap(p => (p.items || []).filter(i => (i.qty || 0) > 50));
  const heavyItemSection = heavyItems.length > 0
    ? `* **Heavy Spares Pallet Compliance Check**: Detected dense consignments of heavy parts (e.g., *${heavyItems[0].materialDesc}*). Under TATA Steel supply rules (Clause 4.2.2), any single pallet exceeding 20kg must use steel or recyclable polypropylene (PP) pallets rather than loose supply.`
    : `* **Standard Pallet Compliance Check**: Spares are within modular ranges. Ensure standard pallet volume constraints of 1m x 1m x 1m are followed.`;

  return `> ⚠️ **Dynamic AI Quota Alert**: The standard Gemini Free-Tier limit of 20 daily cycles has been surpassed. To prevent operational bottlenecks, this report was calculated dynamically and instantly by TATA Steel's local deterministic audit engine. **Add your custom Groq API key in the Copilot Settings to restart stateful LLM queries.**

# 📊 TATA Steel Principal Procurement Auditor & Logistics Strategic Report

## 1. Executive Summary & Fleet Status
The active temporal-filtered dataset contains purchase order milestones and carrier safety metrics.
*   **Active Capital Exposure**: **₹${totalOutstanding.toLocaleString()}** active outstanding across **${pos.length}** purchase agreements.
*   **Average Compliance Integrity**: **${averageRating}%** rating across active locations (Kalinganagar, Jamshedpur, Gamharia).
*   **Logistics Alarms**: **${activeAlerts.length}** pending safety and lead-time alarms.
*   **Operational Risk Level**: ${averageRating < 80 ? '🔴 HIGH RISK LEVEL' : averageRating < 90 ? '🟡 CAUTIONARY REVIEW' : '🟢 CONTRACTUALLY EXCELLENT'}

---

## 2. ⚠️ High-Risk Contracts Audit & LD Contingencies
TATA Steel applies Liquidated Damages (LD) of **0.5% of delayed items per week**, capped at a maximum of **5%**.

${delayedTable}

### Immediate Risk Actions:
*   **Validity End Gate Warnings**: Avoid gate rejection at general points. Coordinate renewals 7 days prior to truck arrivals.
*   **Expedite Alarms**: **${delayedItemsCount}** line items have been flagged for delayed status and require emergency logistics intervention.

---

## 3. 🚚 Logistics Carrier & Gate Entry Optimization Tips
*   **Age-Restriction Rule Enforcement**: Transport carrier trucks must demonstrate fitness certificate clearances. The **15-year maximum vehicle age limit** is fully enforced at Kalinganagar general gate.
${heavyItemSection}
*   **Unloading Routing Redirection**: Direct metal spare parts to appropriate docks (e.g., *CP10-11 IEM* or *Blast Furc Mech*) and keep digital barcode documentation available to minimize vehicle turn-around-time (TAT).

---

## 4. 🛠️ Actionable Strategy Checklist
1.  **Expedite Approvals**: Contact **Sneha Bagchi** (Kalinganagar Lead Specialist) at \`expedite@tatasteel.com\` to clear drawings of pending orders.
2.  **Vendor Milestone Audits**: Trigger priority schedules with **${delayedPOs[0]?.vendorName || 'active delayed suppliers'}** immediately.
3.  **Gate-Access Checks**: Review safety records of delivery trucks.
4.  **Item Sheet Sync**: Maintain the weekly item-level database spreadsheet with the dispatch control panel.
`;
}

// Compiled strategic reports from prompt data with Gemini
app.post('/api/reports/ai-summary', async (req, res) => {
  try {
    const { pos, alerts, groqApiKey } = req.body;

    // Check for Groq API keys (passed from user settings / localState, or environmental)
    const activeGroqKey = (groqApiKey || '').trim() || (process.env.GROQ_API_KEY || '').trim();

    const compactPOs = shrinkPOs(pos);
    const compactAlerts = shrinkAlerts(alerts);

    const systemPrompt = `
You are the "TATA Steel Principal Procurement Auditor & Supply Chain Strategist". Your job is to analyze active TATA STEEL Purchase Orders (POs) and system dispatch alarms, and formulate a highly comprehensive corporate audit.

Format your response in professional Markdown with these key sections (no JSON, only styled, clear, professional markdown):
1. 📊 Executive Summary (High-level health of current procurement capital, total outstanding value, average compliance score % and summary highlights)
2. ⚠️ High-Risk Contracts Audit & LD Contingencies (Detailed review of delayed/risk-prone POs, highlighting calculated LD liquidated damages at 0.5% per week up to 5%)
3. 🚚 Logistics Carrier & Gate Entry optimization tips (Suggestions concerning O.W.M. Logistics, unloading points, polypropylene or PP pallets for weights above 20kg, etc.)
4. 🛠️ Actionable Strategy Checklist (4-5 critical immediate steps with names & dates to coordinate with contacts like Sneha Bagchi at expedite@tatasteel.com or vendors)

Active POs list (Token-Compressed):
${JSON.stringify(compactPOs, null, 1)}

Active Alarms log (Token-Compressed):
${JSON.stringify(compactAlerts, null, 1)}
`;

    // 1. If Groq Key is available, prioritize it
    if (activeGroqKey) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeGroqKey}`
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: 'Generate the complete professional strategic audit report in elegant corporate Markdown.' }
            ],
            temperature: 0.15
          })
        });

        const groqData = await groqRes.json() as any;
        if (groqRes.ok && groqData.choices?.[0]?.message?.content) {
          res.json({ report: groqData.choices[0].message.content, provider: 'groq' });
          return;
        }
      } catch (err: any) {
        console.warn('Groq report compilation error, falling back:', err.message);
      }
    }

    // 2. Otherwise try Gemini client
    if (aiClient) {
      try {
        const response = await aiClient.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: 'Structure and compile the professional strategic executive audit report immediately.' }] }],
          config: {
            systemInstruction: systemPrompt,
          }
        });

        if (response.text) {
          res.json({ report: response.text, provider: 'gemini' });
          return;
        }
      } catch (err: any) {
        // If Gemini fails (e.g. 429 quota exhaustion), fallback gracefully to the deterministic rule-based template
        console.warn('Gemini report compilation failed (likely 429 quota):', err.message);
        const fallbackReport = buildLocalStrategicReport(pos || [], alerts || []);
        res.json({ report: fallbackReport, provider: 'offline_engine' });
        return;
      }
    }

    // 3. Absolute offline fallback if both AI models are unavailable (or no keys provisioned)
    const fallbackReport = buildLocalStrategicReport(pos || [], alerts || []);
    res.json({ report: fallbackReport, provider: 'offline_engine' });
  } catch (err: any) {
    console.error('Audit Report compiles error:', err);
    // Even on total unexpected crash, give the offline report so user never sees a broken compilation screen!
    try {
      const fallbackReport = buildLocalStrategicReport(req.body.pos || [], req.body.alerts || []);
      res.json({ report: fallbackReport, provider: 'offline_engine' });
    } catch {
      res.status(500).json({ error: `Failed to compile AI strategic report: ${err.message}` });
    }
  }
});

// General AI Copilot Dashboard LLM Chat Assistant
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, pos: clientPos, alerts: clientAlerts, groqApiKey } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Messages thread is required for general AI chat.' });
      return;
    }

    // Check for Groq API keys (passed from user settings / localState, or environmental)
    const activeGroqKey = (groqApiKey || '').trim() || (process.env.GROQ_API_KEY || '').trim();

    // fallback to DB values if not passed from client
    let finalPos = clientPos;
    if (!finalPos || !finalPos.length) {
      finalPos = await readPOs();
    }

    let finalAlerts = clientAlerts;
    if (!finalAlerts || !finalAlerts.length) {
      finalAlerts = await readAlerts();
    }

    // Extremely economical token compression
    const compactPos = shrinkPOs(finalPos);
    const compactAlerts = shrinkAlerts(finalAlerts);

    // Construct the LLM Copilot system prompt
    const systemPrompt = `You are "TATA Steel AI Corporate Copilot", the central procurement and logistics LLM assistant of this workspace/dashboard.
Your goal is to answer standard or conversational queries about the Purchase Orders, dispatch alerts, active schedules, and compliant logistics under TATA specifications.

Below is the COMPLETE live context of the active workspace database (Token-Compressed for extreme speed and economy):
---
LIVE COMPRESSED PURCHASE ORDERS (POs):
${JSON.stringify(compactPos, null, 1)}

ACTIVE COMPRESSED LOGISTICS ALERTS / ALERTS:
${JSON.stringify(compactAlerts, null, 1)}
---

Standard Guidelines & Specifications for reference:
- You have complete access to the live POs and Alarms. When asked about counts, aggregate values, compliance percentages, specific materials, or logistics carriers, perform clean, accurate math on the provided context directly.
- Represent structured information, comparative data lists, or PO groups in clean, beautiful Markdown tables or ordered/bulleted lists.
- Liquidated Damages (LD Limit) formula: 0.5% of order value per delayed week, up to a maximum of 5%. Only apply LD on POs or items which have exceeded delivery limits or have status "Delayed".
- Standard packaging rules: Pallet size 1m x 1m x 1m. Heavy equipment (>20kg) must use metallic or recyclable polypropylene (PP) pallets. Loose supply is strictly forbidden (Clause 4.2.2).
- Gate access vehicle restrictions: 15-year maximum vehicle age limit.
- Main point of contact for drawing release and expedite orders: Sneha Bagchi (email: 163760@tatasteel.com, mobile: 8092085871) at Kalinganagar. Ankit Kumar (email: 812559@tatasteel.com) at Jamshedpur.

Guidelines for multi-turn conversational response:
- Be encouraging, confident, clear, and professional.
- Refer back to any history if needed.
- If asked, suggest actionable solutions for late orders or missing drawings.
`;

    // If Groq API Key is present, call Groq endpoint
    if (activeGroqKey) {
      const groqMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map((m: any) => ({
          role: m.role === 'model' ? 'assistant' : m.role || 'user',
          content: m.content || m.text || ''
        }))
      ];

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeGroqKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: groqMessages,
          temperature: 0.2
        })
      });

      const groqData = await groqRes.json() as any;
      if (!groqRes.ok) {
        console.error('Groq external API failure: ', groqData);
        throw new Error(groqData.error?.message || `Groq responded with status code ${groqRes.status}`);
      }

      const textResponse = groqData.choices?.[0]?.message?.content || '';
      res.json({ text: textResponse, provider: 'groq' });
      return;
    }

    // Otherwise, fallback to the standard Gemini client
    if (!aiClient) {
      res.status(500).json({ error: 'Gemini AI API key (GEMINI_API_KEY) and Groq API key are both missing on this server. Please enter a Groq API Key to proceed with AI analysis.' });
      return;
    }

    // Format chat thread safely for Gemini contents array, translating standard roles to user/model
    const contents = messages
      .filter((m: any) => m && m.role !== 'system')
      .map((m: any) => {
        let mappedRole = 'user';
        if (m.role === 'model' || m.role === 'assistant') {
          mappedRole = 'model';
        }
        return {
          role: mappedRole,
          parts: [{ text: m.content || m.text || '' }]
        };
      });

    const response = await aiClient.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
      }
    });

    res.json({ text: response.text, provider: 'gemini' });
  } catch (err: any) {
    console.error('LLM Copilot Chat Error:', err);
    res.status(500).json({ error: `AI Copilot failed. Details: ${err.message}` });
  }
});

// -------------------------------------------------------------
// VITE AND SITE SERVING FLOW
// -------------------------------------------------------------

async function integrateServer() {
  if (process.env.NODE_ENV !== 'production') {
    // In development mode, bootstrap Vite in middlewareMode so the preview window refreshes properly
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files from compiled dist folder in production
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PO Dashboard application booting successfully...`);
    console.log(`Server accessible internally at http://localhost:${PORT}`);
  });
}

// Only run the server when this file is executed directly (not when imported by Vercel)
let isMain = false;
if (import.meta.url !== undefined && typeof import.meta.url === 'string') {
  // ES module
  isMain = import.meta.url === `file://${process.argv[1]}`;
} else {
  // Assume CommonJS
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const isMainModule = require.main === module;
  isMain = isMainModule;
}
if (isMain) {
  integrateServer().catch((e) => {
    console.error('Failed to integrate development server:', e);
    process.exit(1);
  });
}

// Export the Express app as a Vercel-compatible handler.
export default async function handler(req: Request, res: Response) {
  app(req, res);
}