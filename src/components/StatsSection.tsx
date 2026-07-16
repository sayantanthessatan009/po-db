import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { PO } from '../types';
import { Layers, MapPin, CheckCircle, Database } from 'lucide-react';

interface StatsSectionProps {
  pos: PO[];
}

export default function StatsSection({ pos }: StatsSectionProps) {
  // 1. Prepare data for status counts
  const statusData = [
    { name: 'Released', value: pos.filter(p => p.status === 'Released').length },
    { name: 'In Production', value: pos.filter(p => p.status === 'In Production').length },
    { name: 'Dispatched', value: pos.filter(p => p.status === 'Dispatched').length },
    { name: 'Delivered', value: pos.filter(p => p.status === 'Delivered').length },
    { name: 'Delayed', value: pos.filter(p => p.status === 'Delayed').length },
    { name: 'Preponed', value: pos.filter(p => p.status === 'Preponement of Delivery Schedule').length },
  ].filter(d => d.value > 0);

  // 2. Prepare data for Location distribution & totals
  const locationSummary = pos.reduce((acc: { [key: string]: number }, po) => {
    let loc = 'Other Location';
    if (po.location.toLowerCase().includes('kalinganagar') || po.location.toLowerCase().includes('orissa')) {
      loc = 'Kalinganagar (TSK)';
    } else if (po.location.toLowerCase().includes('gamharia')) {
      loc = 'Gamharia (TGS)';
    } else if (po.location.toLowerCase().includes('bistupur') || po.location.toLowerCase().includes('jamshedpur')) {
      loc = 'Jamshedpur (Works)';
    }
    acc[loc] = (acc[loc] || 0) + po.totalOrderValue;
    return acc;
  }, {});

  const locationData = Object.keys(locationSummary).map(key => ({
    name: key,
    value: Math.round(locationSummary[key]),
  }));

  // 3. Prepare items value aggregation by PO
  const poValueData = pos.map(po => ({
    orderNo: po.orderNo.split('/')[0], // Short order no
    totalValue: Math.round(po.totalOrderValue),
    itemsCount: po.items.length,
  }));

  const COLORS = ['#0f172a', '#475569', '#3b82f6', '#10b981', '#ef4444', '#f59e0b'];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Chart 1: PO Values Bar Comparison */}
      <div id="chart-po-values" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 shadow-xs lg:col-span-2">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">PO Financial Breakdown (INR)</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">Total accumulated purchase volumes by Order ID</p>
          </div>
          <Layers className="h-4 w-4 text-slate-400" />
        </div>
        <div className="h-64 w-full">
          {poValueData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">No PO data to graph.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={poValueData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="orderNo" tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} />
                <YAxis tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} />
                <Tooltip
                  formatter={(value) => [`₹${(value as number).toLocaleString()}`, 'Total Value']}
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                />
                <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="totalValue" name="PO Value incl. GST" fill="#0f172a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Chart 2: Location Distribution (Pie Chart) */}
      <div id="chart-po-locations" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Location Distribution</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">Order volumes split across TATA sites</p>
          </div>
          <MapPin className="h-4 w-4 text-slate-400" />
        </div>
        <div className="relative flex h-64 items-center justify-center">
          {locationData.length === 0 ? (
            <div className="text-xs text-slate-400">No location data.</div>
          ) : (
            <div className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={locationData}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {locationData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `₹${(v as number).toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-[80%] left-0 right-0 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
                {locationData.map((d, index) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="font-medium text-slate-700 dark:text-slate-350">{d.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
