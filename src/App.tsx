/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Shield, 
  Upload, 
  Zap, 
  CheckCircle2, 
  AlertCircle, 
  BarChart3, 
  Activity, 
  Database,
  Info
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';
import { parseFile, processDashboardData } from './utils/dataProcessor';
import { DashboardStats } from './types';
import { cn } from './utils/cn';

export default function App() {
  const [files, setFiles] = useState<{ rf: File | null; trn: File | null; radio: File | null }>({
    rf: null,
    trn: null,
    radio: null,
  });
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activeTab, setActiveTab] = useState('summary');

  const handleFileUpload = async (type: keyof typeof files, file: File) => {
    setFiles((prev) => ({ ...prev, [type]: file }));
  };

  const analyzeData = async () => {
    if (!files.rf || !files.radio) return;
    const rf = await parseFile(files.rf);
    const trn = files.trn ? await parseFile(files.trn) : null;
    const radio = await parseFile(files.radio);
    const processed = processDashboardData(rf, trn, radio);
    setStats(processed);
  };

  return (
    <div className="flex h-screen relative font-sans">
      <div className="atmosphere" />
      
      {/* Sidebar */}
      <aside className="w-72 glass-sidebar text-white p-6 flex flex-col gap-8 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
          <h1 className="text-xl font-bold tracking-tight text-white">Kavach Expert</h1>
        </div>

        {/* Mentorship Section */}
        <div className="bg-white/5 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
          <p className="text-[10px] uppercase font-bold text-emerald-400 tracking-widest mb-1">Technical Supervision</p>
          <p className="text-sm font-semibold text-white">Mentored by CELE Sir</p>
          <p className="text-[10px] text-slate-400 mt-1 italic">Expert Guidance in Traction Operations</p>
        </div>

        <div className="flex flex-col gap-6">
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Data Input Center</h3>
            <div className="space-y-3">
              <FileDrop zone="rf" label="1. RFCOMM (Comm Health)" onUpload={handleFileUpload} file={files.rf} />
              <FileDrop zone="trn" label="2. TRNMSNMA (Software)" onUpload={handleFileUpload} file={files.trn} />
              <FileDrop zone="radio" label="3. RADIO_1 (Packet Logs)" onUpload={handleFileUpload} file={files.radio} />
            </div>
          </div>

          <button
            onClick={analyzeData}
            disabled={!files.rf || !files.radio}
            className={cn(
              "w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg",
              files.rf && files.radio 
                ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/20" 
                : "bg-white/5 text-slate-500 cursor-not-allowed border border-white/5"
            )}
          >
            <Zap className="w-4 h-4" />
            Analyze Logs
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 z-10">
        {!stats ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
            <div className="w-24 h-24 glass-card rounded-3xl flex items-center justify-center animate-pulse">
              <Shield className="w-12 h-12 text-emerald-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold text-white">Ready for Analysis</h2>
              <p className="text-slate-400 max-w-md mx-auto">
                Upload your Kavach RF, TRN, and Radio logs to generate a comprehensive diagnostic report.
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex justify-between items-end">
              <div>
                <p className="text-emerald-400 font-bold text-sm tracking-widest uppercase mb-1">Diagnostic Report</p>
                <h2 className="text-4xl font-bold text-white tracking-tight">Loco {stats.locoId}</h2>
              </div>
              <div className="flex gap-1 p-1 glass-card rounded-xl overflow-x-auto max-w-2xl">
                <TabButton active={activeTab === 'summary'} onClick={() => setActiveTab('summary')} label="Summary" />
                <TabButton active={activeTab === 'mapping'} onClick={() => setActiveTab('mapping')} label="Mapping" />
                <TabButton active={activeTab === 'nms'} onClick={() => setActiveTab('nms')} label="NMS Correlation" />
                <TabButton active={activeTab === 'sync'} onClick={() => setActiveTab('sync')} label="Sync Analysis" />
                <TabButton active={activeTab === 'interval'} onClick={() => setActiveTab('interval')} label="Interval Analysis" />
              </div>
            </div>

            {activeTab === 'summary' && <ExecutiveSummary stats={stats} />}
            {activeTab === 'mapping' && <DeepMapping stats={stats} files={files} />}
            {activeTab === 'nms' && <NMSAnalysis stats={stats} />}
            {activeTab === 'sync' && <SyncAnalysis stats={stats} />}
            {activeTab === 'interval' && <IntervalAnalysis stats={stats} />}
          </div>
        )}
      </main>
    </div>
  );
}

function NMSAnalysis({ stats }: { stats: DashboardStats }) {
  const nmsColors: Record<string, string> = {
    '0': '#0066cc', '8': '#80ccff', '1': '#ff3333', '-': '#ffb3b3',
    '16': '#33b3a6', '32': '#80ffaa', '40': '#ff9900', 'default': '#64748b'
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-8 rounded-2xl">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Database className="w-6 h-6 text-emerald-400" />
          NMS Health Status Correlation
        </h3>
        <div className="grid grid-cols-2 gap-8 items-center">
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.nmsStatus}
                  cx="50%" cy="50%"
                  outerRadius={140}
                  dataKey="value"
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                >
                  {stats.nmsStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={nmsColors[entry.name] || nmsColors.default} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-4">
            <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
              <p className="text-sm text-slate-400 mb-2">Failure Rate Analysis</p>
              <p className="text-4xl font-bold text-rose-400">{stats.nmsFailRate.toFixed(1)}%</p>
              <p className="text-xs text-slate-500 mt-2">Percentage of logs where NMS Health was not 32.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {stats.nmsStatus.map((d, i) => (
                <div key={i} className="bg-white/5 p-3 rounded-xl flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: nmsColors[d.name] || nmsColors.default }} />
                  <span className="text-xs text-slate-300 font-mono">{d.name}: {d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SyncAnalysis({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-6">
      <div className="glass-card p-8 rounded-2xl">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Activity className="w-6 h-6 text-emerald-400" />
          Movement Authority (MA) Packet Sync Analysis
        </h3>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.maPackets}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time" hide />
              <YAxis stroke="#64748b" label={{ value: 'Delay (s)', angle: -90, position: 'insideLeft', fill: '#64748b' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px' }}
                itemStyle={{ color: '#10b981' }}
              />
              <Line 
                type="monotone" 
                dataKey="delay" 
                stroke="#10b981" 
                strokeWidth={2} 
                dot={false}
                activeDot={{ r: 4, fill: '#10b981' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-8 grid grid-cols-3 gap-6">
          <div className="bg-white/5 p-4 rounded-xl">
            <p className="text-xs text-slate-500 uppercase font-bold mb-1">Avg Refresh Lag</p>
            <p className="text-2xl font-bold text-white">{stats.avgLag.toFixed(2)}s</p>
          </div>
          <div className="bg-white/5 p-4 rounded-xl">
            <p className="text-xs text-slate-500 uppercase font-bold mb-1">Total MA Packets</p>
            <p className="text-2xl font-bold text-white">{stats.maCount}</p>
          </div>
          <div className="bg-white/5 p-4 rounded-xl">
            <p className="text-xs text-slate-500 uppercase font-bold mb-1">Access Requests</p>
            <p className="text-2xl font-bold text-white">{stats.arCount}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntervalAnalysis({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-6">
      <div className="glass-card p-8 rounded-2xl">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-emerald-400" />
          Packet Interval Distribution (RDSO Compliance)
        </h3>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.intervalDist}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="category" stroke="#64748b" />
              <YAxis stroke="#64748b" unit="%" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px' }}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              />
              <Bar dataKey="percentage" radius={[8, 8, 0, 0]}>
                {stats.intervalDist.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={['#10b981', '#f59e0b', '#ef4444'][index]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-8 p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
          <p className="text-sm text-slate-300 leading-relaxed">
            <span className="font-bold text-emerald-400 mr-2">RDSO Standard:</span>
            Movement Authority (MA) packets must be refreshed every 1.0 seconds. Any delay exceeding 1.2 seconds triggers a session drop by the Loco system. Currently, <span className="font-bold text-white">{stats.intervalDist[0].percentage.toFixed(1)}%</span> of your packets are within the healthy range.
          </p>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-6 py-2 rounded-lg text-sm font-bold transition-all",
        active ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "text-slate-400 hover:text-white"
      )}
    >
      {label}
    </button>
  );
}

function StatusBox({ title, items }: { title: string; items: { label: string; status: string; reason: string }[] }) {
  return (
    <div className="glass-card p-6 rounded-2xl space-y-4">
      <h4 className="font-bold text-white text-sm uppercase tracking-wider opacity-70">{title}</h4>
      <div className="grid grid-cols-2 gap-4">
        {items.map((item, i) => (
          <div key={i} className="bg-white/5 p-4 rounded-xl border border-white/5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase">{item.label}</span>
              <span className={cn(
                "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter",
                item.status === 'Healthy' ? "bg-emerald-500/20 text-emerald-400" : 
                item.status === 'Marginal' ? "bg-amber-500/20 text-amber-400" : "bg-rose-500/20 text-rose-400"
              )}>
                {item.status}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{item.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExecutiveSummary({ stats }: { stats: DashboardStats }) {
  const nmsColors: Record<string, string> = {
    '0': '#0066cc',
    '8': '#80ccff',
    '1': '#ff3333',
    '-': '#ffb3b3',
    '16': '#33b3a6',
    '32': '#80ffaa',
    '40': '#ff9900',
    'default': '#64748b'
  };

  return (
    <div className="grid grid-cols-3 gap-8">
      <div className="col-span-2 space-y-6">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-emerald-400" />
          System-Level Insights
        </h3>
        
        <div className="grid gap-4">
          <StatusBox 
            title="1. Hardware Analysis"
            items={[
              { label: `Loco ${stats.locoId} Performance`, status: stats.locoPerformance >= 98 ? "Healthy" : "Marginal", reason: `Loco ${stats.locoId} achieved ${stats.locoPerformance.toFixed(1)}% performance across all stations.` },
              { label: "Station Hardware", status: stats.badStns.length > 0 ? "Marginal" : "Healthy", reason: stats.badStns.length > 0 ? `Significant drops detected at ${stats.badStns.join(', ')}.` : "All stations performing optimally." }
            ]}
          />

          <StatusBox 
            title="2. Protocol Analysis"
            items={[
              { label: "Sync Analysis", status: stats.avgLag <= 1.2 ? "Healthy" : "Marginal", reason: `AR: ${stats.arCount} | MA: ${stats.maCount}. Ratio: ${((stats.maCount / (stats.arCount || 1)) * 100).toFixed(1)}%.` },
              { label: "Packet Interval Analysis", status: stats.avgLag <= 1.0 ? "Healthy" : "Marginal", reason: `Average MA interval: ${stats.avgLag.toFixed(2)}s. RDSO standard is 1.0s.` }
            ]}
          />
          
          <div className="glass-card p-6 rounded-2xl border-l-4 border-emerald-500 space-y-4">
            <h4 className="font-bold text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-emerald-400" />
              Dynamic Diagnostic Advice
            </h4>
            <div className="space-y-4">
              {stats.diagnosticAdvice.map((advice, i) => (
                <div key={i} className={cn(
                  "p-4 rounded-xl border backdrop-blur-sm",
                  advice.severity === 'high' ? "bg-rose-500/10 border-rose-500/20" : 
                  advice.severity === 'medium' ? "bg-amber-500/10 border-amber-500/20" : "bg-emerald-500/10 border-emerald-500/20"
                )}>
                  <p className="font-bold text-sm mb-1 text-white">{advice.title}</p>
                  <p className="text-xs text-slate-400 mb-2">{advice.detail}</p>
                  <div className="flex gap-2 items-start mt-2 pt-2 border-t border-white/5">
                    <Zap className="w-3 h-3 mt-0.5 text-emerald-400" />
                    <p className="text-xs font-medium text-slate-300"><span className="text-slate-500 uppercase text-[9px] font-bold mr-1">Action:</span> {advice.action}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="glass-card p-6 rounded-2xl">
          <h4 className="font-bold text-white text-sm mb-6 uppercase tracking-wider opacity-70">Interval Distribution</h4>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.intervalDist}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="percentage"
                >
                  {stats.intervalDist.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#10b981', '#f59e0b', '#ef4444'][index]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {stats.intervalDist.map((d, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-slate-400">{d.category}</span>
                <span className="font-bold text-white">{d.percentage.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl">
          <h4 className="font-bold text-white text-sm mb-4 uppercase tracking-wider opacity-70">NMS Status Correlation</h4>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.nmsStatus}
                  cx="50%"
                  cy="50%"
                  outerRadius={65}
                  dataKey="value"
                  labelLine={false}
                  label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                >
                  {stats.nmsStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={nmsColors[entry.name] || nmsColors.default} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {stats.nmsStatus.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: nmsColors[d.name] || nmsColors.default }} />
                <span className="text-slate-400 truncate">{d.name}:</span>
                <span className="font-bold text-white">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DeepMapping({ stats, files }: { stats: DashboardStats; files: { rf: File | null; trn: File | null; radio: File | null } }) {
  const failures = [
    {
      id: 1,
      title: `NMS Health Critical Failure (${stats.nmsFailRate.toFixed(1)}%)`,
      source: files.trn?.name || 'N/A',
      column: "'NMS Health'",
      detail: `The NMS Health column should ideally maintain a value of 32 (Healthy). Your data contains anomalous values in ${stats.nmsFailRate.toFixed(1)}% of rows, indicating persistent NMS server connection issues.`
    },
    {
      id: 2,
      title: "Session Persistence / Access Request Ratio",
      source: files.radio?.name || 'N/A',
      column: "'Packet Type'",
      detail: `The system transmitted ${stats.arCount} Access Requests, but only ${stats.maCount} Movement Authorities were registered. This significant mismatch confirms session stability failures.`
    },
    {
      id: 3,
      title: "Station Hardware Marginal Status",
      source: files.rf?.name || 'N/A',
      column: "'Station Id' and 'Percentage'",
      detail: `Average percentage analysis indicates that signal strength at stations ${stats.badStns.join(', ') || 'None'} has fallen below the 95% threshold.`
    },
    {
      id: 4,
      title: "Sync Loss / Refresh Lag Analysis",
      source: files.radio?.name || 'N/A',
      column: "'Time'",
      detail: `The average interval between MA packets was recorded at ${stats.avgLag.toFixed(2)} seconds. Any deviation from the RDSO standard (1.0s) triggers a session drop by the Loco system.`
    }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-blue-500/10 border-l-4 border-blue-500 p-4 rounded-r-xl backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400" />
          <p className="text-sm text-blue-200 font-medium">This tab is dynamically updated based on the real-time analysis of your uploaded logs.</p>
        </div>
      </div>

      <div className="grid gap-6">
        {failures.map((f) => (
          <div key={f.id} className="glass-card p-6 rounded-2xl flex gap-6 group hover:border-emerald-500/50 transition-all">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0 border border-emerald-500/20">
              <span className="text-emerald-400 font-bold">0{f.id}</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <h4 className="text-lg font-bold text-white">{f.title}</h4>
                <div className="flex gap-2">
                  <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-slate-400 border border-white/10">Source: {f.source}</span>
                  <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-emerald-400 border border-white/10">Col: {f.column}</span>
                </div>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">{f.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FileDrop({ zone, label, onUpload, file }: { zone: string; label: string; onUpload: any; file: File | null }) {
  return (
    <div className={cn(
      "relative group cursor-pointer rounded-xl border-2 border-dashed transition-all p-4 text-center",
      file ? "bg-emerald-500/10 border-emerald-500/50" : "bg-white/5 border-white/10 hover:border-emerald-500/30"
    )}>
      <input
        type="file"
        className="absolute inset-0 opacity-0 cursor-pointer"
        onChange={(e) => e.target.files?.[0] && onUpload(zone, e.target.files[0])}
      />
      <div className="flex flex-col items-center gap-2">
        {file ? (
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
        ) : (
          <Upload className="w-6 h-6 text-slate-500 group-hover:text-emerald-400 transition-colors" />
        )}
        <span className={cn("text-xs font-medium", file ? "text-emerald-400" : "text-slate-400")}>
          {file ? file.name : label}
        </span>
      </div>
    </div>
  );
}
