import React from 'react';
import { Calculator, Info, CheckCircle2, AlertCircle, ArrowRight, Layers, Divide } from 'lucide-react';
import { motion } from 'motion/react';

export const CalculationMethodology: React.FC = () => {
  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex items-center gap-4 mb-2">
        <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
          <Calculator className="w-6 h-6 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Calculation Methodology</h2>
          <p className="text-slate-400 text-sm font-medium">How we ensure 100% accuracy in station performance metrics</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Rule 1: Deduplication */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="glass-card p-6 rounded-2xl relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Layers className="w-24 h-24 text-emerald-400" />
          </div>
          
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-white font-black text-sm">1</span>
              <h3 className="text-xl font-bold text-white">Deduplicate First</h3>
            </div>
            
            <p className="text-slate-300 text-sm leading-relaxed">
              Every row in the raw XLS appears <span className="text-emerald-400 font-bold">exactly twice</span> due to the logging mechanism. 
              If we skip this step, both numerator and denominator double. While the percentage remains the same, 
              your packet counts become inflated and incorrect for deep analysis.
            </p>

            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center justify-between text-xs font-mono mb-4">
                <span className="text-slate-500 uppercase">Raw Data (2x)</span>
                <ArrowRight className="w-4 h-4 text-slate-600" />
                <span className="text-emerald-400 uppercase">Processed Data (1x)</span>
              </div>
              
              <div className="space-y-2">
                <div className="flex gap-2 opacity-50">
                  <div className="h-4 w-full bg-white/10 rounded border border-white/5" />
                  <div className="h-4 w-12 bg-rose-500/20 rounded border border-rose-500/20" />
                </div>
                <div className="flex gap-2">
                  <div className="h-4 w-full bg-white/10 rounded border border-white/5" />
                  <div className="h-4 w-12 bg-emerald-500/40 rounded border border-emerald-500/40" />
                </div>
                <div className="flex gap-2 opacity-50">
                  <div className="h-4 w-full bg-white/10 rounded border border-white/5" />
                  <div className="h-4 w-12 bg-rose-500/20 rounded border border-rose-500/20" />
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-3 italic text-center">
                We use a composite key (Loco + Station + Direction + Time + Date) to filter out duplicate logs.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Rule 2: Sum then Divide */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6 rounded-2xl relative overflow-hidden group border-l-4 border-emerald-500"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Divide className="w-24 h-24 text-emerald-400" />
          </div>

          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-white font-black text-sm">2</span>
              <h3 className="text-xl font-bold text-white">Sum Then Divide</h3>
            </div>
            
            <p className="text-slate-300 text-sm leading-relaxed">
              Never average the percentage column. A short 48-packet trip should not have the same "weight" as a 559-packet trip. 
              We sum all expected packets and all received packets separately, then perform a single division.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-rose-500/5 rounded-xl border border-rose-500/10">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-3 h-3 text-rose-400" />
                  <span className="text-[10px] font-black text-rose-400 uppercase">Wrong Way</span>
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  (98.2% + 99.1% + ...) / N
                  <div className="mt-1 text-rose-400 font-bold">Result: 98.49%</div>
                </div>
              </div>
              <div className="p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-black text-emerald-400 uppercase">Correct Way</span>
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  Σ Received / Σ Expected
                  <div className="mt-1 text-emerald-400 font-bold">Result: 98.61%</div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Real-world Example */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-8"
      >
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="shrink-0 text-center md:text-left">
            <h4 className="text-emerald-400 font-black uppercase tracking-widest text-xs mb-1">Case Study</h4>
            <div className="text-4xl font-black text-white tracking-tighter">BL Station</div>
            <p className="text-slate-400 text-sm mt-2 max-w-xs">
              Actual data comparison showing the impact of weighted averages on reporting accuracy.
            </p>
          </div>
          
          <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white/5 p-4 rounded-xl border border-white/10 flex flex-col justify-center">
              <span className="text-[10px] text-slate-500 uppercase font-bold mb-1">Total Expected</span>
              <span className="text-2xl font-mono font-bold text-white">2,735</span>
            </div>
            <div className="bg-white/5 p-4 rounded-xl border border-white/10 flex flex-col justify-center">
              <span className="text-[10px] text-slate-500 uppercase font-bold mb-1">Total Received</span>
              <span className="text-2xl font-mono font-bold text-white">2,697</span>
            </div>
            <div className="bg-emerald-500 p-4 rounded-xl flex flex-col justify-center shadow-lg shadow-emerald-500/20">
              <span className="text-[10px] text-white/70 uppercase font-bold mb-1">Final Weighted %</span>
              <span className="text-3xl font-mono font-black text-white">98.61%</span>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="flex items-center gap-2 text-slate-500 text-xs italic justify-center">
        <Info className="w-3 h-3" />
        <span>This logic is applied globally across all station and locomotive performance reports in this dashboard.</span>
      </div>
    </div>
  );
};
