import { useMemo } from 'react';
import {
  ComposedChart, AreaChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import ChartCard from './ChartCard';
import { formatTime, tooltipStyle } from '../utils/chart';

function fmtBps(bps) {
  if (bps == null) return '—';
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} Kbps`;
  return `${Math.round(bps)} bps`;
}

export default function RouterChart({ routerHistory }) {
  const { wan, system } = useMemo(() => {
    if (!routerHistory?.length) return { wan: [], system: [] };

    const wan = routerHistory.map((r) => ({
      ts: r.ts * 1000,
      wan1In:  (r.wan1_in_bps  || 0) / 1e6,
      wan1Out: (r.wan1_out_bps || 0) / 1e6,
      wan2In:  (r.wan2_in_bps  || 0) / 1e6,
      wan2Out: (r.wan2_out_bps || 0) / 1e6,
      failover: r.active_wan === 'wan2' ? 1 : 0,
    }));

    const system = routerHistory.map((r) => ({
      ts: r.ts * 1000,
      cpu: r.cpu_pct,
      mem: r.mem_total_mb ? ((r.mem_used_mb / r.mem_total_mb) * 100) : null,
    }));

    return { wan, system };
  }, [routerHistory]);

  if (!wan.length) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {['Router WAN Throughput', 'Router CPU & Memory'].map((t) => (
          <ChartCard key={t} title={t}>
            <div className="h-[180px] flex items-center justify-center text-slate-400 text-sm">
              Collecting router data…
            </div>
          </ChartCard>
        ))}
      </div>
    );
  }

  // Stats
  const avgW1In  = wan.reduce((s, d) => s + d.wan1In,  0) / wan.length;
  const avgW1Out = wan.reduce((s, d) => s + d.wan1Out, 0) / wan.length;
  const avgW2In  = wan.reduce((s, d) => s + d.wan2In,  0) / wan.length;
  const peakIn   = Math.max(...wan.map((d) => Math.max(d.wan1In, d.wan2In)));

  const allVals = wan.flatMap((d) => [d.wan1In, d.wan1Out, d.wan2In, d.wan2Out]);
  const maxVal  = Math.max(...allVals, 0.01);
  const yMax    = maxVal < 1 ? Math.ceil(maxVal * 10) / 10 : Math.ceil(maxVal / 5) * 5 || 1;

  const wanStats = (
    <div className="flex flex-wrap gap-3 text-xs">
      <span className="text-slate-500">WAN1 avg: <span className="text-blue-400 font-semibold">{fmtBps(avgW1In * 1e6)} ↓</span></span>
      <span className="text-slate-500">WAN2: <span className="text-amber-400 font-semibold">{fmtBps(avgW2In * 1e6)} ↓</span></span>
      <span className="text-slate-500">Peak: <span className="text-slate-300 font-semibold">{fmtBps(peakIn * 1e6)}</span></span>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* WAN Throughput — both interfaces */}
      <ChartCard title="Router WAN Throughput" action={wanStats}>
        <ResponsiveContainer width="100%" height={185}>
          <AreaChart data={wan} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="gW1In" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gW2In" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="ts" type="number" domain={['dataMin','dataMax']} scale="time"
              tick={{ fontSize: 10, fill: '#475569' }} tickFormatter={formatTime}
              stroke="transparent" minTickGap={60} />
            <YAxis domain={[0, yMax]} tick={{ fontSize: 10, fill: '#475569' }} stroke="transparent"
              width={38} tickFormatter={(v) => v < 1 ? `${(v*1000).toFixed(0)}K` : `${v}`} />
            <Tooltip {...tooltipStyle}
              labelFormatter={(v) => new Date(v).toLocaleTimeString()}
              formatter={(v, name) => [`${fmtBps(v * 1e6)}`, name]} />
            <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, color: '#64748b', paddingTop: 6 }} />
            <Area type="monotone" dataKey="wan1In"  stroke="#3b82f6" fill="url(#gW1In)"
              strokeWidth={2} name="WAN1 In (ForceBB)" dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="wan1Out" stroke="#6366f1" fill="none"
              strokeWidth={1.5} strokeDasharray="4 3" name="WAN1 Out" dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="wan2In"  stroke="#f59e0b" fill="url(#gW2In)"
              strokeWidth={2} name="WAN2 In (Starlink)" dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="wan2Out" stroke="#f97316" fill="none"
              strokeWidth={1.5} strokeDasharray="4 3" name="WAN2 Out" dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="text-center text-[10px] text-slate-500 mt-1">Mbps — solid=in, dashed=out</div>
      </ChartCard>

      {/* CPU + Memory */}
      <ChartCard title="Router CPU & Memory">
        <ResponsiveContainer width="100%" height={185}>
          <ComposedChart data={system} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="gCpu" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gMem" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="ts" type="number" domain={['dataMin','dataMax']} scale="time"
              tick={{ fontSize: 10, fill: '#475569' }} tickFormatter={formatTime}
              stroke="transparent" minTickGap={60} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#475569' }} stroke="transparent"
              width={35} tickFormatter={(v) => `${v}%`} />
            <Tooltip {...tooltipStyle}
              labelFormatter={(v) => new Date(v).toLocaleTimeString()}
              formatter={(v, name) => [`${v != null ? v.toFixed(1) : '—'}%`, name]} />
            <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, color: '#64748b', paddingTop: 6 }} />
            <Area type="monotone" dataKey="cpu" stroke="#f59e0b" fill="url(#gCpu)"
              strokeWidth={2} name="CPU" dot={false} isAnimationActive={false} connectNulls />
            <Area type="monotone" dataKey="mem" stroke="#3b82f6" fill="url(#gMem)"
              strokeWidth={2} name="Memory" dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="text-center text-[10px] text-slate-500 mt-1">% utilization</div>
      </ChartCard>
    </div>
  );
}
