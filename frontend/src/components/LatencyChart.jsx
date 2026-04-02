import { useMemo } from 'react';
import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine
} from 'recharts';
import ChartCard from './ChartCard';
import { formatTime, tooltipStyle } from '../utils/chart';

export default function LatencyChart({ history, bulkHistory, timeRange }) {
  const { data, isBulk } = useMemo(() => {
    // Use bulk history (1-sec samples) only for the 15m time range
    if (timeRange <= 0.25 && bulkHistory?.pop_ping_latency_ms?.length) {
      const latency = bulkHistory.pop_ping_latency_ms;
      const dropRate = bulkHistory.pop_ping_drop_rate || [];
      const now = Date.now();
      const len = latency.length;
      const points = [];
      for (let i = 0; i < len; i++) {
        const lat = latency[i];
        const drop = dropRate[i] || 0;
        if (lat === null || lat === undefined) continue;
        points.push({
          ts: now - (len - 1 - i) * 1000,
          latency: lat,
          dropPct: drop * 100,
        });
      }
      return { data: points, isBulk: true };
    }
    // SQLite history for all other time ranges
    if (history?.length) {
      return {
        data: history.map((r) => ({
          ts: r.ts * 1000,
          latency: r.latency_ms || 0,
          dropPct: (r.drop_rate || 0) * 100,
        })),
        isBulk: false,
      };
    }
    return { data: [], isBulk: false };
  }, [history, bulkHistory, timeRange]);

  if (!data.length) {
    return (
      <ChartCard title="Latency & Packet Loss">
        <div className="h-[240px] flex items-center justify-center text-slate-400 text-sm">
          Collecting data…
        </div>
      </ChartCard>
    );
  }

  const lats = data.map((d) => d.latency).filter(Boolean);
  const avgLat = lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : 0;
  const maxLat = lats.length ? Math.max(...lats) : 0;
  const dropEvents = data.filter((d) => d.dropPct > 0).length;
  const totalDropPct = data.length ? ((dropEvents / data.length) * 100).toFixed(2) : '0';

  const stats = (
    <div className="flex gap-4 text-xs">
      <span className="text-slate-500">Avg: <span className="text-emerald-400 font-semibold">{avgLat.toFixed(1)} ms</span></span>
      <span className="text-slate-500">Peak: <span className="text-slate-300 font-semibold">{maxLat.toFixed(1)} ms</span></span>
      <span className="text-slate-500">Drops: <span className={`font-semibold ${dropEvents > 0 ? 'text-red-400' : 'text-slate-400'}`}>{dropEvents} ({totalDropPct}%)</span></span>
      {isBulk && <span className="text-slate-400 text-[10px] ml-auto">1-sec samples</span>}
    </div>
  );

  return (
    <ChartCard title="Latency & Packet Loss" action={stats}>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="gLat" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="ts" type="number" domain={['dataMin', 'dataMax']} scale="time"
            tick={{ fontSize: 10, fill: '#475569' }} tickFormatter={formatTime}
            stroke="transparent" minTickGap={60}
          />
          <YAxis yAxisId="lat" tick={{ fontSize: 10, fill: '#475569' }} stroke="transparent"
            width={35} domain={[0, (max) => Math.ceil(max * 1.3)]} />
          <YAxis yAxisId="drop" orientation="right" tick={{ fontSize: 10, fill: '#475569' }}
            stroke="transparent" width={35}
            domain={[0, (max) => Math.max(Math.ceil(max * 1.5), 10)]}
            tickFormatter={(v) => `${v.toFixed(0)}%`} />
          <ReferenceLine yAxisId="lat" y={avgLat} stroke="#10b981" strokeDasharray="4 6" strokeOpacity={0.35} />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(v) => new Date(v).toLocaleTimeString()}
            formatter={(v, name) => {
              if (name === 'Latency') return [`${v.toFixed(1)} ms`, name];
              return [`${v.toFixed(2)}%`, 'Packet Loss'];
            }}
          />
          <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, color: '#64748b', paddingTop: 6 }} />
          <Area yAxisId="lat" type="monotone" dataKey="latency" stroke="#10b981" fill="url(#gLat)"
            strokeWidth={2} name="Latency" dot={false} isAnimationActive={false} />
          <Bar yAxisId="drop" dataKey="dropPct" fill="#ef4444" opacity={0.75}
            name="Drop Events" barSize={isBulk ? 3 : 6} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="text-center text-[10px] text-slate-500 mt-1">ms (left axis) · % packet loss (right axis)</div>
    </ChartCard>
  );
}
