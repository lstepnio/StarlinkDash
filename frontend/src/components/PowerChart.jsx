import { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import ChartCard from './ChartCard';
import { formatTime, tooltipStyle } from '../utils/chart';

export default function PowerChart({ bulkHistory, history, timeRange }) {
  const { data, isBulk } = useMemo(() => {
    // Use per-second bulk data only for 15m range
    if (timeRange <= 0.25 && bulkHistory?.power_w?.length) {
      const power = bulkHistory.power_w;
      const now = Date.now();
      return {
        data: power.map((v, i) => ({
          ts: now - (power.length - 1 - i) * 1000,
          power: v || 0,
        })),
        isBulk: true,
      };
    }
    // SQLite history for longer ranges (power_w updated every ~90s)
    if (history?.length) {
      const rows = history.filter((r) => r.power_w != null && r.power_w > 0);
      if (rows.length) {
        return {
          data: rows.map((r) => ({ ts: r.ts * 1000, power: r.power_w })),
          isBulk: false,
        };
      }
    }
    return { data: [], isBulk: false };
  }, [bulkHistory, history, timeRange]);

  if (!data.length) {
    return (
      <ChartCard title="Power Consumption">
        <div className="h-[180px] flex items-center justify-center text-slate-600 text-sm">
          Collecting data…
        </div>
      </ChartCard>
    );
  }

  const vals = data.map((d) => d.power).filter(Boolean);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const min = Math.min(...vals);
  const max = Math.max(...vals);

  const stats = (
    <div className="flex gap-4 text-xs">
      <span className="text-slate-500">Avg: <span className="text-amber-400 font-semibold">{avg.toFixed(0)} W</span></span>
      <span className="text-slate-500">Min: <span className="text-slate-300 font-semibold">{min.toFixed(0)} W</span></span>
      <span className="text-slate-500">Max: <span className="text-slate-300 font-semibold">{max.toFixed(0)} W</span></span>
      {isBulk && <span className="text-slate-600 text-[10px] ml-auto">1-sec samples</span>}
    </div>
  );

  return (
    <ChartCard title="Power Consumption" action={stats}>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="gPow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="ts" type="number" domain={['dataMin', 'dataMax']} scale="time"
            tick={{ fontSize: 10, fill: '#475569' }} tickFormatter={formatTime}
            stroke="transparent" minTickGap={60}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#475569' }} stroke="transparent"
            width={35} domain={['auto', 'auto']}
            tickFormatter={(v) => `${v.toFixed(0)}`}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(v) => new Date(v).toLocaleTimeString()}
            formatter={(v) => [`${v.toFixed(1)} W`, 'Power']}
          />
          <Area type="monotone" dataKey="power" stroke="#f59e0b" fill="url(#gPow)"
            strokeWidth={2} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="text-center text-[10px] text-slate-700 mt-1">Watts</div>
    </ChartCard>
  );
}
