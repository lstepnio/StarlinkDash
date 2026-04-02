import { useMemo } from 'react';
import ChartCard from './ChartCard';
import { Gauge } from 'lucide-react';

// Compute 0-100 quality score from live status + recent history
function computeScore(status, history) {
  const h = status?.header || {};

  // --- Latency score (0-30 pts) ---
  // <20ms=30, 20-50ms=25, 50-100ms=15, 100-200ms=5, >200ms=0
  const lat = h.pop_ping_latency_ms;
  let latScore = 0;
  if (lat != null) {
    if (lat < 20) latScore = 30;
    else if (lat < 50) latScore = 25;
    else if (lat < 100) latScore = 15;
    else if (lat < 200) latScore = 5;
    else latScore = 0;
  }

  // --- Packet loss score (0-30 pts) ---
  const drop = h.pop_ping_drop_rate;
  let dropScore = 0;
  if (drop != null) {
    if (drop === 0) dropScore = 30;
    else if (drop < 0.005) dropScore = 25;
    else if (drop < 0.01) dropScore = 18;
    else if (drop < 0.05) dropScore = 8;
    else dropScore = 0;
  }

  // --- Throughput score (0-25 pts) ---
  // Relative to expected Starlink speeds: >100 Mbps down = max
  const down = h.downlink_throughput_bps;
  let downScore = 0;
  if (down != null) {
    const mbps = down / 1e6;
    if (mbps >= 100) downScore = 25;
    else if (mbps >= 50) downScore = 20;
    else if (mbps >= 20) downScore = 14;
    else if (mbps >= 5) downScore = 7;
    else downScore = 2;
  }

  // --- Obstruction score (0-15 pts) ---
  const obs = h.fraction_obstructed;
  let obsScore = 0;
  if (obs != null) {
    if (obs === 0) obsScore = 15;
    else if (obs < 0.01) obsScore = 12;
    else if (obs < 0.05) obsScore = 6;
    else obsScore = 0;
  }

  const total = latScore + dropScore + downScore + obsScore;
  return Math.min(100, Math.max(0, total));
}

function scoreLabel(score) {
  if (score >= 90) return { label: 'Excellent', color: '#10b981' };
  if (score >= 75) return { label: 'Good', color: '#34d399' };
  if (score >= 55) return { label: 'Fair', color: '#fbbf24' };
  if (score >= 35) return { label: 'Poor', color: '#f97316' };
  return { label: 'Critical', color: '#ef4444' };
}

function GaugeArc({ score }) {
  const size = 160;
  const cx = size / 2;
  const cy = size / 2 + 10;
  const r = 62;
  // Arc spans from 210° to -30° (240° total sweep)
  const startAngle = 210;
  const sweepAngle = 240;
  const endAngle = startAngle - sweepAngle; // -30

  function polarToXY(angleDeg, radius) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
  }

  function describeArc(start, end) {
    const s = polarToXY(start, r);
    const e = polarToXY(end, r);
    const largeArc = (start - end) > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  }

  const fillAngle = startAngle - (score / 100) * sweepAngle;
  const { label, color } = scoreLabel(score);

  // Needle
  const needleAngle = startAngle - (score / 100) * sweepAngle;
  const needleTip = polarToXY(needleAngle, r - 8);
  const needleBase1 = polarToXY(needleAngle + 90, 7);
  const needleBase2 = polarToXY(needleAngle - 90, 7);

  return (
    <svg width={size} height={size * 0.8} viewBox={`0 0 ${size} ${size * 0.8}`}>
      {/* Track */}
      <path
        d={describeArc(startAngle, endAngle)}
        fill="none"
        stroke="rgba(148,163,184,0.1)"
        strokeWidth={12}
        strokeLinecap="round"
      />
      {/* Fill */}
      <path
        d={describeArc(startAngle, fillAngle)}
        fill="none"
        stroke={color}
        strokeWidth={12}
        strokeLinecap="round"
        opacity={0.85}
      />
      {/* Needle */}
      <polygon
        points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
        fill={color}
        opacity={0.9}
      />
      {/* Center hub */}
      <circle cx={cx} cy={cy} r={5} fill={color} />
      {/* Score text */}
      <text x={cx} y={cy - 18} textAnchor="middle" fill={color} fontSize={26} fontWeight="bold" fontFamily="system-ui">
        {score}
      </text>
      <text x={cx} y={cy - 4} textAnchor="middle" fill="#94a3b8" fontSize={11} fontFamily="system-ui">
        {label}
      </text>
    </svg>
  );
}

export default function SpeedQualityScore({ status, history }) {
  const score = useMemo(() => computeScore(status, history), [status, history]);
  const { label, color } = scoreLabel(score);

  const h = status?.header || {};
  const breakdown = [
    { label: 'Latency', value: h.pop_ping_latency_ms != null ? `${h.pop_ping_latency_ms.toFixed(1)} ms` : '--' },
    { label: 'Packet Loss', value: h.pop_ping_drop_rate != null ? `${(h.pop_ping_drop_rate * 100).toFixed(2)}%` : '--' },
    { label: 'Download', value: h.downlink_throughput_bps != null ? `${(h.downlink_throughput_bps / 1e6).toFixed(1)} Mbps` : '--' },
    { label: 'Obstruction', value: h.fraction_obstructed != null ? `${(h.fraction_obstructed * 100).toFixed(2)}%` : '--' },
  ];

  return (
    <ChartCard title="Speed Quality Score">
      <div className="flex flex-col items-center gap-2">
        <GaugeArc score={score} />
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-1 w-full max-w-[220px]">
          {breakdown.map((b) => (
            <div key={b.label} className="flex justify-between text-xs">
              <span className="text-slate-500">{b.label}</span>
              <span className="text-slate-300 font-medium tabular-nums">{b.value}</span>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-slate-600 mt-1">Composite score: latency + loss + throughput + obstruction</div>
      </div>
    </ChartCard>
  );
}
