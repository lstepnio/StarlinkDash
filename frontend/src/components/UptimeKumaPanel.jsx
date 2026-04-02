import { Activity, Globe, Wifi, Server, Shield, Clock, ExternalLink } from 'lucide-react';

const STATUS_MAP = {
  1: { label: 'UP',          color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  0: { label: 'DOWN',        color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20',         dot: 'bg-red-500 animate-pulse' },
  2: { label: 'PENDING',     color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20',     dot: 'bg-amber-400' },
  3: { label: 'MAINTENANCE', color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20',       dot: 'bg-blue-400' },
};

const TYPE_ICON = {
  ping: Wifi,
  http: Globe,
  dns:  Server,
  push: Activity,
};

function typeIcon(type) {
  const Icon = TYPE_ICON[type] || Activity;
  return Icon;
}

function cleanUrl(url) {
  if (!url || url === 'https://') return null;
  try { return new URL(url).hostname; } catch { return url; }
}

function MonitorCard({ monitor }) {
  const s = STATUS_MAP[monitor.status] ?? STATUS_MAP[2];
  const Icon = typeIcon(monitor.type);
  const displayHost = cleanUrl(monitor.url) || monitor.hostname || '';

  return (
    <div className={`metric-card accent-slate p-3 flex flex-col gap-2`}>
      {/* Top row: icon + name + status badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={11} className="text-slate-500 shrink-0 mt-0.5" strokeWidth={2} />
          <span className="text-xs font-semibold text-slate-300 truncate leading-snug">{monitor.name}</span>
        </div>
        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-widest shrink-0 ${s.bg} ${s.color}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </div>
      </div>

      {/* Bottom row: host + response time + cert */}
      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-600">
        {displayHost && (
          <span className="font-mono truncate">{displayHost}</span>
        )}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {monitor.response_time_ms != null && (
            <span className={`tabular-nums font-medium ${
              monitor.response_time_ms < 100 ? 'text-emerald-500/70'
              : monitor.response_time_ms < 500 ? 'text-amber-500/70'
              : 'text-red-500/70'
            }`}>{Math.round(monitor.response_time_ms)}ms</span>
          )}
          {monitor.cert_days != null && (
            <span className={`flex items-center gap-0.5 ${
              monitor.cert_days < 14 ? 'text-red-400' : monitor.cert_days < 30 ? 'text-amber-400' : 'text-slate-600'
            }`}>
              <Shield size={9} />
              {monitor.cert_days}d
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UptimeKumaPanel({ monitors }) {
  if (!monitors?.length) {
    return (
      <div className="chart-card py-4 flex items-center gap-3 text-slate-600 text-sm">
        <Activity size={15} /> Connecting to Uptime Kuma…
      </div>
    );
  }

  const upCount   = monitors.filter((m) => m.status === 1).length;
  const downCount = monitors.filter((m) => m.status === 0).length;
  const total     = monitors.length;
  const allUp     = downCount === 0;

  // Sort: DOWN first, then by name
  const sorted = [...monitors].sort((a, b) => {
    if (a.status === 0 && b.status !== 0) return -1;
    if (b.status === 0 && a.status !== 0) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-3">
      {/* Summary banner */}
      <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${
        allUp
          ? 'bg-emerald-500/5 border-emerald-500/15'
          : 'bg-red-500/8 border-red-500/20'
      }`}>
        <Activity size={14} className={allUp ? 'text-emerald-500/70' : 'text-red-400'} />
        <span className={`text-xs font-medium ${allUp ? 'text-emerald-500/70' : 'text-red-300'}`}>
          {allUp
            ? `All ${total} services operational`
            : `${downCount} service${downCount > 1 ? 's' : ''} down · ${upCount}/${total} operational`}
        </span>
        <a href="https://status.majjix.com" target="_blank" rel="noopener noreferrer"
           className="ml-auto flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
          <ExternalLink size={9} /> status.majjix.com
        </a>
      </div>

      {/* Monitor grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {sorted.map((m) => (
          <MonitorCard key={m.name} monitor={m} />
        ))}
      </div>
    </div>
  );
}
