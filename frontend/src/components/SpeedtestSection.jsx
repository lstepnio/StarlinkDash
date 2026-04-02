import { useMemo } from 'react';
import {
  ComposedChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts';
import { Zap, ArrowDown, ArrowUp, Clock, Wifi, Server } from 'lucide-react';
import ChartCard from './ChartCard';
import { tooltipStyle } from '../utils/chart';

function fmtTs(ts) {
  return new Date(ts * 1000).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtAge(ts) {
  const diffMin = Math.round((Date.now() / 1000 - ts) / 60);
  if (diffMin < 2) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function MetricBadge({ icon: Icon, label, value, unit, color }) {
  return (
    <div className="metric-card accent-slate p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        <Icon size={10} strokeWidth={2.5} /> {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold tabular-nums leading-none ${color}`}>{value}</span>
        {unit && <span className="text-xs text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}

export default function SpeedtestSection({ latest, history }) {
  const chartData = useMemo(() => {
    if (!history?.length) return [];
    return history.map((r) => ({
      ts: r.ts,
      download: r.download_mbps,
      upload: r.upload_mbps,
      ping: r.ping_ms,
    }));
  }, [history]);

  const stats = useMemo(() => {
    if (!chartData.length) return null;
    const downs = chartData.map((d) => d.download).filter(Boolean);
    const ups   = chartData.map((d) => d.upload).filter(Boolean);
    const pings = chartData.map((d) => d.ping).filter(Boolean);
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    return {
      avgDown: avg(downs), maxDown: Math.max(...downs), minDown: Math.min(...downs),
      avgUp:   avg(ups),   maxUp:   Math.max(...ups),
      avgPing: avg(pings), minPing: Math.min(...pings), maxPing: Math.max(...pings),
    };
  }, [chartData]);

  const downMax = stats ? Math.ceil(stats.maxDown / 50) * 50 || 100 : 100;
  const pingMax = stats ? Math.ceil(stats.maxPing / 10) * 10 || 50 : 50;

  return (
    <div className="space-y-4">
      {/* Latest result cards */}
      {latest && latest.ts ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              <Zap size={11} /> Latest Speedtest · {fmtAge(latest.ts)}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              {latest.isp && <span className="flex items-center gap-1"><Server size={10}/>{latest.isp}</span>}
              {latest.server_location && <span>{latest.server_location}</span>}
              {latest.result_url && (
                <a href={latest.result_url} target="_blank" rel="noopener noreferrer"
                   className="text-blue-500/60 hover:text-blue-400 transition-colors">
                  View result ↗
                </a>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricBadge icon={ArrowDown} label="Download" color="text-cyan-400"
              value={(latest.download_mbps || 0).toFixed(1)} unit="Mbps" />
            <MetricBadge icon={ArrowUp} label="Upload" color="text-violet-400"
              value={(latest.upload_mbps || 0).toFixed(1)} unit="Mbps" />
            <MetricBadge icon={Wifi} label="Ping" color={
              latest.ping_ms < 20 ? 'text-emerald-400' : latest.ping_ms < 50 ? 'text-amber-400' : 'text-red-400'
            } value={(latest.ping_ms || 0).toFixed(1)} unit="ms" />
            <MetricBadge icon={Clock} label="Jitter" color="text-blue-400"
              value={latest.jitter_ms != null ? (latest.jitter_ms).toFixed(1) : '—'} unit={latest.jitter_ms != null ? 'ms' : ''} />
          </div>
        </div>
      ) : (
        <div className="chart-card py-4 flex items-center gap-3 text-slate-400 text-sm">
          <Zap size={15} /> No speedtest results yet — waiting for first sync…
        </div>
      )}

      {/* Charts */}
      {chartData.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Download / Upload history */}
          <ChartCard
            title="Speedtest Throughput History"
            subtitle={stats ? `Avg DL: ${stats.avgDown.toFixed(1)} Mbps · Avg UL: ${stats.avgUp.toFixed(1)} Mbps · Peak: ${stats.maxDown.toFixed(1)} Mbps` : undefined}
          >
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="gStDown" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gStUp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="ts" type="number" domain={['dataMin','dataMax']} scale="time"
                  tick={{ fontSize: 10, fill: '#475569' }}
                  tickFormatter={(v) => new Date(v * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  stroke="transparent" minTickGap={80} />
                <YAxis domain={[0, downMax]} tick={{ fontSize: 10, fill: '#475569' }}
                  stroke="transparent" width={38} tickFormatter={(v) => `${v}`} />
                {stats && <ReferenceLine y={stats.avgDown} stroke="#06b6d4" strokeDasharray="4 6" strokeOpacity={0.3} />}
                <Tooltip {...tooltipStyle}
                  labelFormatter={(v) => fmtTs(v)}
                  formatter={(v, name) => [`${v != null ? v.toFixed(1) : '—'} Mbps`, name]} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, color: '#64748b', paddingTop: 6 }} />
                <Area type="monotone" dataKey="download" stroke="#06b6d4" fill="url(#gStDown)"
                  strokeWidth={2} name="Download" dot={{ r: 3, fill: '#06b6d4' }} isAnimationActive={false} />
                <Area type="monotone" dataKey="upload" stroke="#8b5cf6" fill="url(#gStUp)"
                  strokeWidth={2} name="Upload" dot={{ r: 3, fill: '#8b5cf6' }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="text-center text-[10px] text-slate-500 mt-1">Mbps</div>
          </ChartCard>

          {/* Ping / Jitter history */}
          <ChartCard
            title="Speedtest Latency History"
            subtitle={stats ? `Avg: ${stats.avgPing.toFixed(1)} ms · Min: ${stats.minPing.toFixed(1)} ms · Max: ${stats.maxPing.toFixed(1)} ms` : undefined}
          >
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="gStPing" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="ts" type="number" domain={['dataMin','dataMax']} scale="time"
                  tick={{ fontSize: 10, fill: '#475569' }}
                  tickFormatter={(v) => new Date(v * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  stroke="transparent" minTickGap={80} />
                <YAxis domain={[0, pingMax]} tick={{ fontSize: 10, fill: '#475569' }}
                  stroke="transparent" width={35} tickFormatter={(v) => `${v}`} />
                {stats && <ReferenceLine y={stats.avgPing} stroke="#10b981" strokeDasharray="4 6" strokeOpacity={0.3} />}
                <Tooltip {...tooltipStyle}
                  labelFormatter={(v) => fmtTs(v)}
                  formatter={(v, name) => [`${v != null ? v.toFixed(1) : '—'} ms`, name]} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, color: '#64748b', paddingTop: 6 }} />
                <Area type="monotone" dataKey="ping" stroke="#10b981" fill="url(#gStPing)"
                  strokeWidth={2} name="Ping" dot={{ r: 3, fill: '#10b981' }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="text-center text-[10px] text-slate-500 mt-1">ms</div>
          </ChartCard>
        </div>
      )}
    </div>
  );
}
