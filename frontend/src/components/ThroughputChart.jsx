import { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import ChartCard from './ChartCard';
import { formatTime, tooltipStyle } from '../utils/chart';

function formatBpsValue(mbps) {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`;
  if (mbps >= 1) return `${mbps.toFixed(1)} Mbps`;
  return `${(mbps * 1000).toFixed(0)} Kbps`;
}

export default function ThroughputChart({ history, bulkHistory, timeRange }) {
  const { data, isBulk } = useMemo(() => {
    // Use bulk history (per-second from dish) only for the 15m time range
    if (timeRange <= 0.25 && bulkHistory?.downlink_throughput_bps?.length) {
      const down = bulkHistory.downlink_throughput_bps;
      const up = bulkHistory.uplink_throughput_bps || [];
      const now = Date.now();
      const len = down.length;
      const points = [];
      for (let i = 0; i < len; i++) {
        points.push({
          ts: now - (len - 1 - i) * 1000,
          download: (down[i] || 0) / 1e6,
          upload: (up[i] || 0) / 1e6,
        });
      }
      return { data: points, isBulk: true };
    }
    // SQLite history for all other time ranges
    if (history?.length) {
      return {
        data: history.map((r) => ({
          ts: r.ts * 1000,
          download: (r.downlink_bps || 0) / 1e6,
          upload: (r.uplink_bps || 0) / 1e6,
        })),
        isBulk: false,
      };
    }
    return { data: [], isBulk: false };
  }, [history, bulkHistory, timeRange]);

  if (!data.length) {
    return (
      <ChartCard title="Throughput">
        <div className="h-[240px] flex items-center justify-center text-slate-600 text-sm">
          Collecting data…
        </div>
      </ChartCard>
    );
  }

  const downs = data.map((d) => d.download);
  const ups = data.map((d) => d.upload);
  const avgDown = downs.reduce((a, b) => a + b, 0) / downs.length;
  const maxDown = Math.max(...downs);
  const avgUp = ups.reduce((a, b) => a + b, 0) / ups.length;

  const maxVal = Math.max(maxDown, Math.max(...ups), 0.1);
  const yMax = maxVal < 1 ? Math.ceil(maxVal * 10) / 10 : Math.ceil(maxVal / 5) * 5 || 5;

  const stats = (
    <div className="flex gap-4 text-xs">
      <span className="text-slate-500">Avg DL: <span className="text-cyan-400 font-semibold">{formatBpsValue(avgDown)}</span></span>
      <span className="text-slate-500">Peak: <span className="text-slate-300 font-semibold">{formatBpsValue(maxDown)}</span></span>
      <span className="text-slate-500">Avg UL: <span className="text-violet-400 font-semibold">{formatBpsValue(avgUp)}</span></span>
      {isBulk && <span className="text-slate-600 text-[10px] ml-auto">1-sec samples</span>}
    </div>
  );

  return (
    <ChartCard title="Throughput" action={stats}>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="gDown" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gUp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="ts" type="number" domain={['dataMin', 'dataMax']} scale="time"
            tick={{ fontSize: 10, fill: '#475569' }} tickFormatter={formatTime}
            stroke="transparent" minTickGap={60}
          />
          <YAxis
            domain={[0, yMax]}
            tick={{ fontSize: 10, fill: '#475569' }}
            tickFormatter={(v) => v < 1 ? `${(v * 1000).toFixed(0)}K` : `${v}`}
            stroke="transparent" width={38}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(v) => new Date(v).toLocaleTimeString()}
            formatter={(v, name) => [`${formatBpsValue(v)}`, name]}
          />
          <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, color: '#64748b', paddingTop: 6 }} />
          <Area type="monotone" dataKey="download" stroke="#06b6d4" fill="url(#gDown)"
            strokeWidth={2} name="Download" dot={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="upload" stroke="#8b5cf6" fill="url(#gUp)"
            strokeWidth={2} name="Upload" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="text-center text-[10px] text-slate-700 mt-1">Mbps</div>
    </ChartCard>
  );
}
