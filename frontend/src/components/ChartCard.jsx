export default function ChartCard({ title, subtitle, children, className = '', action }) {
  return (
    <div className={`chart-card ${className}`}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-100 tracking-tight">{title}</h3>
          {subtitle && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0 max-w-full overflow-x-auto">{action}</div>}
      </div>
      {children}
    </div>
  );
}
