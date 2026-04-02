export default function ConnectionIndicator({ connected, status }) {
  const dishError = status?.error;
  const hasData = status && !dishError;

  const dot = connected && hasData
    ? 'bg-emerald-400 pulse-glow'
    : connected
    ? 'bg-amber-400'
    : 'bg-red-500';

  const label = connected && hasData
    ? 'Live'
    : connected
    ? 'Dish error'
    : 'Reconnecting';

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <span className="text-xs font-medium text-slate-400">{label}</span>
    </div>
  );
}
