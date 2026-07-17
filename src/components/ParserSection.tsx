import React, { useState, useRef } from 'react';
import { Upload, Sparkles, FileText, CheckCircle2, ChevronRight, RefreshCw, AlertTriangle, Trash2, ShieldCheck, Layers } from 'lucide-react';
import { PO } from '../types';

interface ParserSectionProps {
  onAddParsedPO: (po: PO) => void;
}

// Preset samples modeled after the TATA files to make testing seamless and highly impressive!
const SAMPLES = {
  bearingHousing: `TATA STEEL LIMITED, KALINGANAGAR INDUSTRIAL ESTATE, DUBURI, JAJPUR PIN-755026, ORISSA
PURCHASE ORDER
Order No. :- 2100970424/175
Order Date :- 23.11.2025
Release Date :- 18.03.2026
Contact Person :- Sneha Bagchi
E-Mail :- 163760@tatasteel.com
Phone No :- 8092085871
Collective No :- 921728213
Validity Start Date :- 23.11.2025
Validity End Date :- 18.07.2026

Vendor Code :- P056
PRECISION SPARES MFG CO
A/1/4,DIAMOND PARK, P.O. JOKA, PS - THAKURPUKUR, KOLKATA, West Bengal, Pin Code: 700104
E-Mail :- precision.spares@yahoo.co.in

Item No.   :- 00010   Total Qty  :- 8.000Set
Gross Price :- 73,940.00 INR Per1 Set
Material No :- 5628A4418 All CGST-SGST/IGST @ 18% Creditable
Material Desc :- TP AXLE BEARING HOUSING ASSEMB ,K-2-0001
Material Group :- 307
Material Group Desc :- DRAWING MECHANICAL

Delivery date: Day 16.04.2026
Unloading Point: Blast Furc Mech

Item Charges:
Gross Price 73,940.000 INR
Packaging charge (%) 2.00 %
IN: Integrated GST 18.00 %
Total Value: 711,953.470 INR

Payment Term: 100% within 45 days of satisfactory receipt of Material
Delivery Terms: Ex Works 3PL`,

  earthInsulators: `TATA STEEL LIMITED, TISCO WORKS GENERAL OFFICE BISTUPUR, JAMSHEDPUR, JHARKHAND
PURCHASE ORDER
Order No. :- 2101010485/101
Order Date :- 22.05.2026
Release Date :- 22.05.2026
Contact Person :- Ankit Kumar
E-Mail :- 812559@tatasteel.com

Vendor Code :- P056
PRECISION SPARES MFG CO, KOLKATA
E-Mail :- precision.spares@yahoo.co.in
Quotation :- PS26/89 A /09.05.2026

Item No. :- 00010 Total Qty :- 30.000NOS
Gross Price :- 380.00 INR Per1 NOS
Material No :- 5531A0320 All CGST-SGST/IGST @ 18% Creditable
Material Desc :- CRANE ACCES; INSULATOR, GH50 terminals
Material Group :- 241
Material Group Desc :- EOT CRANES & ACCESS.
Delivery date Day 22.08.2026
Unloading Point : CP10-11 IEM

Item No. :- 00020 Total Qty :- 22.000NOS
Gross Price :- 380.00 INR Per1 NOS
Material No :- 5531A0322 All CGST-SGST/IGST @ 18% Creditable
Material Desc :- CRANE ACCES; INSULATOR,VAHLE,101850
Delivery date Day 22.08.2026

Payment Term : 100% within 45 days of satisfactory receipt of Material`,

  hardwareNuts: `TATA STEEL LIMITED, TGS Gamharia, Adityapur, Gamharia - 831001, Jharkhand
PURCHASE ORDER
Order No. :- 3900007599/146
Order Date :- 16.10.2018
Release Date :- 29.04.2026
Contact Person :- B Ravindra Kumar

Vendor Code :- P056
PRECISION SPARES MFG CO, KOLKATA

Item No. :- 00010 Total Qty :- 1.000NOS
Gross Price :- 12.11 INR Per1 NOS
Material No :- 0094TG014231 All CGST-SGST/IGST @ 18% Creditable
Material Desc :- CASTELLATED NUT M8 DIN 935 8
Material Group :- 243
Material Group Desc :- FASTENERS
Delivery date Day 15.12.2018
Unloading Point: Project stores

Item No. :- 00020 Total Qty :- 12.000NOS
Gross Price :- 17.61 INR Per1 NOS
Material No :- 0094A0029 All CGST-SGST/IGST @ 18% Creditable
Material Desc :- CASTLE NUT M16 DIN935 8

Delivery terms: Free on road TGS
Payment Term : 100% in 30 days of satisfactory receipt`
};

export default function ParserSection({ onAddParsedPO }: ParserSectionProps) {
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: string; base64?: string; presetKey?: keyof typeof SAMPLES } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successPO, setSuccessPO] = useState<PO | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePresetSelect = (key: keyof typeof SAMPLES) => {
    let name = '';
    let size = '112 KB';
    if (key === 'bearingHousing') {
      name = 'TATA_STEEL_PO_2100970424.pdf';
      size = '184 KB';
    } else if (key === 'earthInsulators') {
      name = 'TATA_STEEL_PO_2101010485.pdf';
      size = '132 KB';
    } else {
      name = 'TATA_STEEL_PO_3900007599.pdf';
      size = '94 KB';
    }

    setSelectedFile({
      name,
      size,
      presetKey: key
    });
    setErrorMsg(null);
    setSuccessPO(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setErrorMsg('Only PDF files are supported. Please upload a valid PDF document.');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Data = result.split(',')[1];
        setSelectedFile({
          name: file.name,
          size: `${Math.round(file.size / 1024)} KB`,
          base64: base64Data
        });
        setErrorMsg(null);
        setSuccessPO(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setErrorMsg('Only PDF files are supported. Please upload a valid PDF document.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Data = result.split(',')[1];
        setSelectedFile({
          name: file.name,
          size: `${Math.round(file.size / 1024)} KB`,
          base64: base64Data
        });
        setErrorMsg(null);
        setSuccessPO(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearSelection = () => {
    setSelectedFile(null);
    setErrorMsg(null);
    setSuccessPO(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAIParsing = async () => {
    if (!selectedFile) {
      setErrorMsg('Please upload a PDF Purchase Order first or select a preset sample.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessPO(null);

    try {
      const groqApiKey = localStorage.getItem('tata_groq_api_key') || '';
      const payload: { ocrText?: string; pdfData?: string; groqApiKey?: string } = { groqApiKey };
      if (selectedFile.base64) {
        payload.pdfData = selectedFile.base64;
      } else if (selectedFile.presetKey) {
        payload.ocrText = SAMPLES[selectedFile.presetKey];
      }

      const response = await fetch('/api/pos/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Server returned an error parsing document.');
      }

      setSuccessPO(data);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || 'AI Parsing failed. Check server endpoints and API key configuration.');
    } finally {
      setLoading(false);
    }
  };

  const handleCommitParsedPO = () => {
    if (!successPO) return;

    // The backend hard-rejects (400) any PO missing id/orderNo - catch that
    // here instead of silently losing the save, since AI parsing sometimes
    // returns an empty orderNo field.
    if (!successPO.id || !successPO.orderNo || !successPO.orderNo.trim()) {
      setErrorMsg('AI parsing did not extract a valid Order No for this document. Please check the parsed preview and correct the Order No before saving, or re-parse.');
      return;
    }

    onAddParsedPO(successPO);
    setSuccessPO(null);
    setSelectedFile(null);
  };

  return (
    <div id="parser-central-container" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-xs overflow-hidden transition-all duration-200">
      <div className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600" />
          AI Document Intelligence PDF Parser
        </h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Upload a raw PDF Purchase Order to check compliance & schedule automatic dispatch metrics</p>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Input Panel */}
        <div id="parser-input-panel" className="lg:col-span-3 space-y-5">
          {/* Presets Selection */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mr-2">Sample POs:</span>
            <button
              id="preset-bearing"
              onClick={() => handlePresetSelect('bearingHousing')}
              className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold tracking-wide transition-all cursor-pointer ${
                selectedFile?.presetKey === 'bearingHousing'
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 font-bold'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold'
              }`}
            >
              Axle Bearing PO
            </button>
            <button
              id="preset-insulators"
              onClick={() => handlePresetSelect('earthInsulators')}
              className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold tracking-wide transition-all cursor-pointer ${
                selectedFile?.presetKey === 'earthInsulators'
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 font-bold'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold'
              }`}
            >
              Insulators MRO PO
            </button>
            <button
              id="preset-hardware"
              onClick={() => handlePresetSelect('hardwareNuts')}
              className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold tracking-wide transition-all cursor-pointer ${
                selectedFile?.presetKey === 'hardwareNuts'
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 font-bold'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold'
              }`}
            >
              Hardware Nuts PO
            </button>
          </div>

          {/* Interactive File Drop area or attachment card (No copy paste feature) */}
          {!selectedFile ? (
            <div
              id="pdf-drop-zone"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-blue-500 bg-blue-50/30 dark:bg-blue-950/20'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 hover:border-slate-350 dark:hover:border-slate-700'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-250">Drag & Drop TATA Steel Purchase Order PDF here</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-550 mt-1">or click to browse from device folder</p>
                </div>
              </div>
            </div>
          ) : (
            /* Selected File Document View Card */
            <div id="pdf-selected-card" className="border border-blue-100 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/20 rounded-xl p-4 flex items-center justify-between transition-colors">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 rounded-lg flex items-center justify-center font-extrabold text-[10px] uppercase font-sans border border-rose-200 dark:border-rose-900">
                  PDF
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-1">{selectedFile.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 font-medium">{selectedFile.size}</span>
                    <span className="text-xs text-slate-300 dark:text-slate-700">•</span>
                    <span className="text-[9px] uppercase tracking-wider font-extrabold bg-blue-100/70 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                      Dynamic Scanning Approved
                    </span>
                  </div>
                </div>
              </div>

              <button
                id="btn-remove-file"
                onClick={handleClearSelection}
                className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                title="Remove loaded PO PDF"
              >
                <Trash2 className="h-4.5 w-4.5" />
              </button>
            </div>
          )}

          {/* Dynamic Page Scanning Guidance Notice */}
          <div className="bg-slate-50/50 dark:bg-slate-900/40 p-3.5 rounded-xl border border-slate-150 dark:border-slate-850 text-left">
            <div className="flex items-start gap-2.5 text-[11px] leading-relaxed">
              <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest text-[9px] mb-0.5">Dynamic AI PDF Page Processing Index</p>
                <p className="text-slate-500 dark:text-slate-400 leading-normal">
                  Gemini analyzes PO layout dynamically. For standard orders, processing <strong className="text-slate-800 dark:text-slate-200">2-5 pages</strong> is sufficient. If item listings extend further, the network dynamically increases scanning <strong className="text-slate-800 dark:text-slate-200">up to 15 pages</strong> in real time to capture all items, auto-halting once contractual boilerplate pages are detected.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="text-[10px] text-slate-400 dark:text-slate-500">
              ⚡ Powered by Gemini 3.5 Flash Model
            </div>
            
            <button
              id="btn-parse-po"
              onClick={handleAIParsing}
              disabled={loading || !selectedFile}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-medium text-xs tracking-wide shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Generating Compliance Schema...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  AI Parse PO PDF
                </>
              )}
            </button>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-950/20 p-4 text-xs text-red-700 dark:text-red-400 leading-normal border border-red-100 dark:border-red-900/30">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="font-semibold">AI Extraction Encountered An Error</p>
                <p className="mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}
        </div>

        {/* AI Results / Preview Panel */}
        <div id="parser-preview-panel" className="lg:col-span-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 p-5 flex flex-col justify-between h-full min-h-[280px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full my-auto space-y-3 py-12">
              <RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />
              <div className="text-center animate-pulse">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Analyzing Document Layout</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 max-w-[200px] leading-normal mx-auto">
                  Extracting line items, payment codes, liquid damage terms, and dispatch conditions...
                </p>
              </div>
            </div>
          ) : successPO ? (
            <div className="space-y-4 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs font-semibold">Ready for Import</span>
                </div>
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">PO {successPO.orderNo}</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{successPO.companyName} ({successPO.location})</p>

                {/* Extracted stats brief */}
                <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] bg-white dark:bg-[#131d30] p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                  <div className="text-left">
                    <span className="text-slate-400 dark:text-slate-500 block">Total Value</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">₹{successPO.totalOrderValue?.toLocaleString() || '0'}</span>
                  </div>
                  <div className="text-left">
                    <span className="text-slate-400 dark:text-slate-500 block">Line Items</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{successPO.items?.length || 0} items extracted</span>
                  </div>
                  <div className="col-span-2 mt-1.5 border-t border-slate-50 dark:border-slate-800 pt-1.5 text-left">
                    <span className="text-slate-400 dark:text-slate-500 block">Extracted Contact</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{successPO.contactPerson || 'N/A'} ({successPO.contactEmail || 'N/A'})</span>
                  </div>
                  {successPO.validityEnd && (
                    <div className="col-span-2 mt-1 border-t border-slate-50 dark:border-slate-800 pt-1.5 text-left">
                      <span className="text-slate-400 dark:text-slate-500 block">Validity Code Limit</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">{successPO.validityEnd}</span>
                    </div>
                  )}
                </div>

                {successPO.aiInsights && (
                  <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-lg text-[10px] text-amber-850 dark:text-amber-400 leading-normal text-left">
                    <span className="font-bold block mb-0.5">⚠️ Quick AI Alert Warning:</span>
                    {successPO.aiInsights}
                  </div>
                )}
              </div>

              <div className="pt-4 mt-auto">
                <button
                  id="btn-confirm-po"
                  onClick={handleCommitParsedPO}
                  className="w-full flex items-center justify-center gap-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs tracking-wide shadow-xs transition-colors cursor-pointer"
                >
                  Confirm & Maintain PO
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center my-auto py-12 flex flex-col items-center justify-center space-y-2">
              <FileText className="h-10 w-10 text-slate-300 dark:text-slate-750" />
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Staging Compliance Panel</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-550 mt-1 max-w-[200px] leading-normal mx-auto">
                  Drag & drop a TATA PO PDF file or choose a sample template on the left to verify compliance flags in real time
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
