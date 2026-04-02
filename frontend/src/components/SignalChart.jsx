import { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import ChartCard from './ChartCard';
import { formatTime, tooltipStyle } from '../utils/chart';

export default function SignalChart({ history }) {
  const data = useMemo(() => {
    if (!history?.length) return [];
    return history
      .filter((r) => r.obstructed_frac != null)
      .map((r) => ({
        ts: r.ts * 1000,
        obstruction: (r.obstructed_frac || 0) * 100,
      }));
  }, [history]);

  if (!data.length) {
    return (
      <ChartCard title="Obstruction Over Time">
        <div className="h-[200px] flex items-center justify-center text-slate-500">
          Collecting data...
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Obstruction Over Time">
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="gObs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.07)" vertical={false} />
          <XAxis
            dataKey="ts"
            type="number"
            domain={['dataMin', 'dataMax']}
            scale="time"
            tick={{ fontSize: 10, fill: '#64748b' }}
            tickFormatter={formatTime}
            stroke="transparent"
            minTickGap={60}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#64748b' }}
            stroke="transparent"
            width={35}
            domain={[0, (max) => Math.max(max * 1.2, 2)]}
            tickFormatter={(v) => `${v.toFixed(1)}%`}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(v) => new Date(v).toLocaleTimeString()}
            formatter={(v) => [`${v.toFixed(3)}%`, 'Obstruction']}
          />
          <Area
            type="monotone" dataKey="obstruction" stroke="#f97316" fill="url(#gObs)"
            strokeWidth={1.5} dot={false} isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="text-center text-[10px] text-slate-400 mt-1">% of sky obstructed</div>
    </ChartCard>
  );
}
