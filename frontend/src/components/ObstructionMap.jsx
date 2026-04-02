import { useRef, useEffect } from 'react';
import ChartCard from './ChartCard';

export default function ObstructionMap({ obstruction }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !obstruction?.snr?.length) return;

    const ctx = canvas.getContext('2d');
    const { snr, rows, cols } = obstruction;
    if (!rows || !cols) return;

    // Check if all values are -1 (no data yet)
    const hasData = snr.some((v) => v !== -1.0);

    const size = 280;
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
    ctx.fillStyle = 'rgba(5, 10, 24, 0.5)';
    ctx.fillRect(0, 0, size, size);

    // Concentric guide circles
    for (let r = 1; r <= 4; r++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (radius / 4) * r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Cross lines
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    if (hasData) {
      // The obstruction map is a polar grid: rows = radial (center to edge),
      // cols = angular (around the circle)
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const idx = row * cols + col;
          const val = snr[idx];

          if (val === -1.0) continue; // no data for this cell

          const theta = (col / cols) * Math.PI * 2 - Math.PI / 2;
          const thetaNext = ((col + 1) / cols) * Math.PI * 2 - Math.PI / 2;
          const r1 = (row / rows) * radius;
          const r2 = ((row + 1) / rows) * radius;

          let color;
          if (val > 1) {
            color = 'rgba(52, 211, 153, 0.5)'; // clear - green
          } else if (val > 0) {
            color = 'rgba(251, 191, 36, 0.5)'; // marginal - yellow
          } else {
            color = 'rgba(248, 113, 113, 0.6)'; // obstructed - red
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
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#3b82f6';
    ctx.fill();

    // Cardinal labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', cx, 6);
    ctx.fillText('S', cx, size - 6);
    ctx.fillText('E', size - 6, cy);
    ctx.fillText('W', 6, cy);

    if (!hasData) {
      ctx.fillStyle = '#475569';
      ctx.font = '12px Inter, system-ui';
      ctx.fillText('Collecting map data...', cx, cy);
    }
  }, [obstruction]);

  return (
    <ChartCard title="Obstruction Map" className="flex flex-col items-center">
      <div className="flex justify-center">
        <canvas ref={canvasRef} className="rounded-full" style={{ width: 280, height: 280 }} />
      </div>
      <div className="flex justify-center gap-5 mt-3 text-[10px] text-slate-500">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/50" />
          Clear
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400/50" />
          Marginal
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
          Obstructed
        </div>
      </div>
    </ChartCard>
  );
}
