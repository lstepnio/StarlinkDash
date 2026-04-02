import { WifiOff, CheckCircle } from 'lucide-react';
import ChartCard from './ChartCard';

function formatTs(ts) {
  return new Date(ts * 1000).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatDuration(s) {
  if (s == null) return 'ongoing';
  if (s < 60) return `${s.toFixed(0)}s`;
  if (s < 3600) return `${(s / 60).toFixed(1)} min`;
  return `${(s / 3600).toFixed(2)} hr`;
}

function humanizeCause(cause) {
  if (!cause) return 'Unknown';
  return cause.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function OutageLog({ outages }) {
  const list = outages?.outages || [];
  const current = outages?.current;
  const isQuiet = !current && list.length === 0;

  return (
    <ChartCard
      title="Outage Log (24h)"
      subtitle={isQuiet ? 'No disconnect windows recorded in the last 24 hours.' : 'Recent outage windows with duration and reported dish state.'}
      className={isQuiet ? 'py-5' : ''}
    >
      {current && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-300 text-xs px-3 py-2 rounded-lg mb-3 animate-pulse">
          <WifiOff size={13} />
          <span className="font-medium">Outage in progress</span>
        </div>
      )}

      {list.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.03] px-3 py-3 text-emerald-400 text-sm">
          <CheckCircle size={15} />
          <span>No outages in the last 24 hours</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800/60">
                <th className="pb-2 pr-4 font-medium">Start</th>
                <th className="pb-2 pr-4 font-medium">End</th>
                <th className="pb-2 pr-4 font-medium">Duration</th>
                <th className="pb-2 font-medium">Cause</th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors"
                >
                  <td className="py-2 pr-4 text-slate-300 tabular-nums whitespace-nowrap">
                    {formatTs(o.start_ts)}
                  </td>
                  <td className="py-2 pr-4 text-slate-400 tabular-nums whitespace-nowrap">
                    {o.end_ts ? formatTs(o.end_ts) : <span className="text-red-400">Ongoing</span>}
                  </td>
                  <td className={`py-2 pr-4 font-medium tabular-nums whitespace-nowrap ${o.end_ts ? 'text-amber-400' : 'text-red-400'}`}>
                    {formatDuration(o.duration_s)}
                  </td>
                  <td className="py-2 text-slate-500">
                    {humanizeCause(o.cause)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
