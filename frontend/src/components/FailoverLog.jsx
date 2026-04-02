import { ArrowRightLeft, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function fmtDuration(s) {
  if (s == null) return 'ongoing';
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function wanLabel(wan) {
  if (wan === 'wan1') return 'Primary (ForceBB)';
  if (wan === 'wan2') return 'Failover (Starlink)';
  return wan || '—';
}

export default function FailoverLog({ failoverData }) {
  const events = failoverData?.events || [];
  const isActive = failoverData?.failover_active;

  if (!events.length && !isActive) {
    return (
      <div className="chart-card py-3 px-4 flex items-center gap-3 text-slate-400 text-xs">
        <CheckCircle2 size={13} className="text-emerald-500/60" />
        No failover events recorded in the last 7 days
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Active failover banner */}
      {isActive && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border bg-amber-500/8 border-amber-500/20">
          <AlertTriangle size={13} className="text-amber-400 animate-pulse" />
          <span className="text-xs font-medium text-amber-300">
            Failover active — running on Starlink since {fmtTime(failoverData?.failover_since)}
          </span>
        </div>
      )}

      {/* Events table */}
      {events.length > 0 && (
        <div className="chart-card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-white/[0.04]">
                <th className="text-left py-2 px-3 font-semibold">Started</th>
                <th className="text-left py-2 px-3 font-semibold">Ended</th>
                <th className="text-left py-2 px-3 font-semibold">Duration</th>
                <th className="text-left py-2 px-3 font-semibold">From</th>
                <th className="text-left py-2 px-3 font-semibold">To</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => {
                const ongoing = e.end_ts == null;
                return (
                  <tr key={e.id || i}
                      className={`border-b border-white/[0.02] ${ongoing ? 'bg-amber-500/5' : ''}`}>
                    <td className="py-2 px-3 tabular-nums text-slate-400">{fmtTime(e.start_ts)}</td>
                    <td className="py-2 px-3 tabular-nums text-slate-400">
                      {ongoing
                        ? <span className="text-amber-400 font-medium">ongoing</span>
                        : fmtTime(e.end_ts)}
                    </td>
                    <td className={`py-2 px-3 tabular-nums font-medium ${
                      ongoing ? 'text-amber-400' : 'text-slate-300'
                    }`}>
                      {fmtDuration(e.duration_s)}
                    </td>
                    <td className="py-2 px-3 text-slate-500">{wanLabel(e.from_wan)}</td>
                    <td className="py-2 px-3 text-slate-500">{wanLabel(e.to_wan)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
