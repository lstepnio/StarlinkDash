const ranges = [
  { label: '15m', value: 0.25 },
  { label: '1h',  value: 1 },
  { label: '6h',  value: 6 },
  { label: '24h', value: 24 },
];

export default function TimeRangeSelector({ value, onChange }) {
  return (
    <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.04] p-1.5 backdrop-blur-sm">
      {ranges.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            value === r.value
              ? 'border border-cyan-400/20 bg-cyan-400/15 text-cyan-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
              : 'border border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
