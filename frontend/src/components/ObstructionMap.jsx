import { useEffect, useMemo, useRef } from 'react';
import ChartCard from './ChartCard';

const EPSILON = 0.001;

function classifyObstructionCell(value) {
  if (value === -1.0) return 'unknown';
  if (value >= 1 - EPSILON) return 'clear';
  if (value <= EPSILON) return 'blocked';
  return 'marginal';
}

export default function ObstructionMap({ obstruction }) {
  const canvasRef = useRef(null);
  const summary = useMemo(() => {
    if (!obstruction?.snr?.length) {
      return { clearPct: 0, marginalPct: 0, blockedPct: 0, sampledPct: 0, hasData: false };
    }

    let clear = 0;
    let marginal = 0;
    let blocked = 0;
    let sampled = 0;

    for (const value of obstruction.snr) {
      const classification = classifyObstructionCell(value);
      if (classification === 'unknown') continue;
      sampled += 1;
      if (classification === 'clear') clear += 1;
      else if (classification === 'marginal') marginal += 1;
      else blocked += 1;
    }

    const denom = sampled || 1;
    return {
      clearPct: (clear / denom) * 100,
      marginalPct: (marginal / denom) * 100,
      blockedPct: (blocked / denom) * 100,
      sampledPct: (sampled / obstruction.snr.length) * 100,
      hasData: sampled > 0,
    };
  }, [obstruction]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !obstruction?.snr?.length) return;

    const ctx = canvas.getContext('2d');
    const { snr, rows, cols } = obstruction;
    if (!rows || !cols) return;

    // Check if all values are -1 (no data yet)
    const hasData = snr.some((v) => v !== -1.0);

    const size = 320;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 16;

    // Background
    ctx.fillStyle = 'rgba(5, 10, 24, 0.92)';
    ctx.fillRect(0, 0, size, size);

    const halo = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
    halo.addColorStop(0, 'rgba(37, 99, 235, 0.18)');
    halo.addColorStop(0.65, 'rgba(15, 23, 42, 0.05)');
    halo.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Concentric guide circles
    for (let r = 1; r <= 4; r++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (radius / 4) * r, 0, Math.PI * 2);
      ctx.strokeStyle = r === 4 ? 'rgba(59, 130, 246, 0.14)' : 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Cardinal and diagonal guide lines
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI / 4) * i - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.04)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    if (hasData) {
      // The obstruction map is a polar grid: rows = radial (center to edge),
      // cols = angular (around the circle)
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const idx = row * cols + col;
          const val = snr[idx];

          const classification = classifyObstructionCell(val);
          if (classification === 'unknown') continue; // no data for this cell

          const theta = (col / cols) * Math.PI * 2 - Math.PI / 2;
          const thetaNext = ((col + 1) / cols) * Math.PI * 2 - Math.PI / 2;
          const r1 = (row / rows) * radius;
          const r2 = ((row + 1) / rows) * radius;

          let color;
          if (classification === 'clear') {
            color = 'rgba(16, 185, 129, 0.78)'; // clear
          } else if (classification === 'marginal') {
            color = 'rgba(245, 158, 11, 0.74)'; // marginal
          } else {
            color = 'rgba(239, 68, 68, 0.82)'; // obstructed
          }

          ctx.beginPath();
          ctx.arc(cx, cy, r2, theta, thetaNext);
          ctx.arc(cx, cy, r1, thetaNext, theta, true);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
        }
      }
    }

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.28)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();

    // Cardinal labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 10px Inter, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', cx, 9);
    ctx.fillText('S', cx, size - 9);
    ctx.fillText('E', size - 9, cy);
    ctx.fillText('W', 9, cy);

    if (!hasData) {
      ctx.fillStyle = '#475569';
      ctx.font = '12px Inter, system-ui';
      ctx.fillText('Collecting map data...', cx, cy);
    }
  }, [obstruction]);

  const action = summary.hasData ? (
    <div className="flex flex-wrap gap-3 text-[11px] text-slate-400">
      <span>Clear: <span className="font-semibold text-emerald-400">{summary.clearPct.toFixed(0)}%</span></span>
      <span>Marginal: <span className="font-semibold text-amber-400">{summary.marginalPct.toFixed(0)}%</span></span>
      <span>Blocked: <span className="font-semibold text-red-400">{summary.blockedPct.toFixed(0)}%</span></span>
    </div>
  ) : null;

  return (
    <ChartCard
      title="Obstruction Map"
      subtitle="Polar sky view from the dish perspective. Green is clear sky, amber is partial obstruction, and red marks blocked sectors."
      className="flex flex-col items-center"
      action={action}
    >
      <div className="flex justify-center w-full">
        <canvas
          ref={canvasRef}
          className="rounded-full border border-white/6 shadow-[0_16px_40px_rgba(2,6,23,0.45)] max-w-full"
          style={{ width: 'min(320px, 100%)', height: 'auto', aspectRatio: '1 / 1' }}
        />
      </div>
      <div className="mt-4 grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="text-[11px] leading-relaxed text-slate-500">
          {summary.hasData
            ? `Map coverage reflects ${summary.sampledPct.toFixed(0)}% of sampled sectors from the latest obstruction snapshot.`
            : 'The dish is still gathering enough samples to build a reliable sky map.'}
        </div>
        <div className="flex justify-center gap-5 text-[10px] text-slate-500 sm:justify-end">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
            Clear
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
            Marginal
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
            Obstructed
          </div>
        </div>
      </div>
    </ChartCard>
  );
}
