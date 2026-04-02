import { useMemo } from 'react';

const SLOT_MINUTES = 15;
const SLOTS = (24 * 60) / SLOT_MINUTES; // 96 blocks

function getSlotIndex(ts, now) {
  const ageMs = now - ts * 1000;
  return Math.floor(ageMs / (SLOT_MINUTES * 60 * 1000));
}

const COLOR = {
  online:   'bg-emerald-500/60 hover:bg-emerald-500/90',
  degraded: 'bg-amber-400/60 hover:bg-amber-400/90',
  offline:  'bg-red-500/65 hover:bg-red-500/90',
  unknown:  'bg-white/[0.04]',
};

export default function UptimeTimeline({ history, outages }) {
  const now = Date.now();

  const slots = useMemo(() => {
    const arr = Array(SLOTS).fill('unknown');

    if (history?.length) {
      for (const row of history) {
        const idx = getSlotIndex(row.ts, now);
        if (idx < 0 || idx >= SLOTS) continue;
        if (row.state === 'CONNECTED') {
          if (arr[idx] === 'unknown') arr[idx] = 'online';
        } else if (row.state) {
          if (arr[idx] !== 'offline') arr[idx] = 'degraded';
        }
      }
    }

    if (outages?.outages?.length) {
      for (const o of outages.outages) {
        const startIdx = getSlotIndex(o.start_ts, now);
        const endTs = o.end_ts ?? now / 1000;
        const endIdx = getSlotIndex(endTs, now);
        const from = Math.min(startIdx, endIdx);
        const to = Math.max(startIdx, endIdx);
        for (let i = Math.max(0, from); i <= to && i < SLOTS; i++) arr[i] = 'offline';
      }
    }
    if (outages?.current) arr[0] = 'offline';

    return arr;
  }, [history, outages, now]);

  const knownSlots = slots.filter((s) => s !== 'unknown').length;
  const onlineSlots = slots.filter((s) => s === 'online').length;
  const uptimePct = knownSlots > 0 ? ((onlineSlots / knownSlots) * 100).toFixed(2) : null;

  // Hour tick marks every 4 blocks (= every hour)
  const hourTicks = [];
  for (let i = 0; i < SLOTS; i += 4) {
    const hoursAgo = (i * SLOT_MINUTES) / 60;
    hourTicks.push({ i, label: hoursAgo === 0 ? 'now' : `${hoursAgo}h` });
  }

  return (
    <div className="chart-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200 tracking-tight">Uptime — last 24h</h3>
        <div className="flex items-center gap-4 text-[11px]">
          {uptimePct != null && (
            <span className="text-slate-500">
              <span className="text-emerald-400 font-semibold">{uptimePct}%</span> online
            </span>
          )}
          <div className="flex items-center gap-3 text-slate-400">
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500/60"/>Online</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-amber-400/60"/>Degraded</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-red-500/65"/>Offline</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-white/[0.04] border border-white/10"/>No data</span>
          </div>
        </div>
      </div>

      {/* Blocks — reversed so index 0 (now) is right */}
      <div className="flex gap-[2px]">
        {[...slots].reverse().map((s, i) => {
          const slotIdx = SLOTS - 1 - i;
          const hoursAgo = (slotIdx * SLOT_MINUTES) / 60;
          return (
            <div
              key={i}
              title={`${hoursAgo.toFixed(2)}h ago: ${s}`}
              className={`flex-1 h-7 rounded-[3px] transition-colors cursor-default ${COLOR[s]}`}
            />
          );
        })}
      </div>

      {/* Time labels */}
      <div className="relative h-4">
        {hourTicks.map(({ i, label }) => {
          const pct = ((SLOTS - 1 - i) / (SLOTS - 1)) * 100;
          return (
            <span
              key={i}
              className="absolute text-[9px] text-slate-500 -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${pct}%` }}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
