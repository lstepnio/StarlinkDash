const ranges = [
  { label: '15m', value: 0.25 },
  { label: '1h',  value: 1 },
  { label: '6h',  value: 6 },
  { label: '24h', value: 24 },
];

export default function TimeRangeSelector({ value, onChange }) {
  return (
    <div className="flex gap-0.5 p-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
      {ranges.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
            value === r.value
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/25'
              : 'text-slate-500 hover:text-slate-300 border border-transparent'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
