import {
  Tv, Film, Play, Eye, CircleHelp, Wifi,
} from 'lucide-react';

function fmtDuration(s) {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtAge(ts) {
  if (!ts) return '';
  const diffMin = Math.round((Date.now() / 1000 - ts) / 60);
  if (diffMin < 2) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function healthTone(status) {
  switch (status) {
    case 'Excellent':
      return 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20';
    case 'Good':
      return 'bg-cyan-500/12 text-cyan-300 border-cyan-400/20';
    case 'Watch':
      return 'bg-amber-500/12 text-amber-300 border-amber-400/20';
    case 'Poor':
      return 'bg-orange-500/12 text-orange-300 border-orange-400/20';
    default:
      return 'bg-red-500/12 text-red-300 border-red-400/20';
  }
}

function StreamDecisionBadge({ decision }) {
  const value = (decision || '').toLowerCase();
  const label = value === 'transcode' ? 'Transcode' : value === 'copy' ? 'Direct Stream' : 'Direct Play';
  const tone = value === 'transcode'
    ? 'bg-amber-500/10 text-amber-300 border-amber-400/20'
    : 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20';

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
      {label}
    </span>
  );
}

function StreamLocationBadge({ location }) {
  const value = (location || '').toLowerCase();
  const label = value === 'wan' ? 'WAN' : value === 'lan' ? 'LAN' : 'Unknown';
  const tone = value === 'wan'
    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-400/20'
    : value === 'lan'
      ? 'bg-blue-500/10 text-blue-300 border-blue-400/20'
      : 'bg-slate-500/10 text-slate-300 border-slate-400/20';

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
      {label}
    </span>
  );
}

function fmtBandwidth(mbps) {
  if (mbps == null) return '—';
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`;
  return `${mbps.toFixed(1)} Mbps`;
}

function fmtHistoryNetworkUsage(item) {
  if (item.bandwidth_mbps != null) {
    return fmtBandwidth(item.bandwidth_mbps);
  }
  if (item.stream_video_bitrate != null) {
    return `~${fmtBandwidth(item.stream_video_bitrate / 1000)}`;
  }
  if (item.source_video_bitrate != null) {
    return `src ${fmtBandwidth(item.source_video_bitrate / 1000)}`;
  }
  return '—';
}

function summaryTone(score) {
  if (score == null) return 'text-slate-300';
  if (score >= 90) return 'text-emerald-400';
  if (score >= 75) return 'text-cyan-400';
  if (score >= 55) return 'text-amber-400';
  return 'text-red-400';
}

function SummaryPill({ label, value, sub, tone = 'text-slate-100', icon: Icon }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 min-w-[112px]">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        {Icon && <Icon size={10} strokeWidth={2.4} />}
        {label}
      </div>
      <div className={`mt-1.5 text-base font-semibold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="sr-only">{sub}</div>}
    </div>
  );
}

function SessionRow({ session }) {
  const stateColor = session.state === 'playing' ? 'text-emerald-400' : session.state === 'paused' ? 'text-amber-400' : 'text-slate-500';
  const reasons = session.streamHealthReasons || [];
  const reasonText = reasons.join(' · ');
  return (
    <tr className="border-b border-white/[0.02]">
      <td className="py-2 px-3">
        <div className="flex min-w-0 items-start gap-2">
          {session.media_type === 'movie' ? <Film size={11} className="text-violet-400 shrink-0 mt-0.5" /> : <Tv size={11} className="text-cyan-400 shrink-0 mt-0.5" />}
          <div className="min-w-0">
            <div className="text-slate-300 truncate max-w-[280px]">{session.title}</div>
            {reasonText && (
              <div className="mt-1 truncate text-[10px] text-slate-500" title={reasonText}>
                {reasonText}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="py-2 px-3 text-slate-400">{session.user}</td>
      <td className="py-2 px-3 text-slate-400">{session.player || session.platform}</td>
      <td className="py-2 px-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-slate-100">{session.streamHealthScore ?? '—'}</span>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${healthTone(session.streamHealthStatus)}`}>
            {session.streamHealthStatus || 'Unknown'}
          </span>
        </div>
      </td>
      <td className="py-2 px-3 tabular-nums text-slate-400">{session.progress_pct}%</td>
      <td className="py-2 px-3 tabular-nums text-slate-400">{fmtBandwidth(session.bandwidth_mbps)}</td>
      <td className="py-2 px-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`text-[10px] font-medium capitalize ${stateColor}`}>{session.state || '—'}</span>
          <StreamDecisionBadge decision={session.transcode_decision} />
          <StreamLocationBadge location={session.location} />
        </div>
      </td>
    </tr>
  );
}

function RecentRow({ item }) {
  const reasons = item.streamHealthReasons || [];
  const reasonText = reasons.join(' · ');
  return (
    <tr className="border-b border-white/[0.02]">
      <td className="py-2 px-3">
        <div className="flex min-w-0 items-start gap-2">
          {item.media_type === 'movie' ? <Film size={11} className="text-violet-400 shrink-0 mt-0.5" /> : <Tv size={11} className="text-cyan-400 shrink-0 mt-0.5" />}
          <div className="min-w-0">
            <div className="text-slate-300 truncate max-w-[380px]">{item.title}</div>
            {reasonText && (
              <div className="mt-1 truncate text-[10px] text-slate-500" title={reasonText}>
                {reasonText}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="py-2 px-3 text-slate-400">{item.user}</td>
      <td className="py-2 px-3 text-slate-400">{item.player || item.platform || '—'}</td>
      <td className="py-2 px-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-slate-100">{item.streamHealthScore ?? '—'}</span>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${healthTone(item.streamHealthStatus)}`}>
            {item.streamHealthStatus || 'Unknown'}
          </span>
        </div>
      </td>
      <td className="py-2 px-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <StreamDecisionBadge decision={item.transcode_decision} />
          <StreamLocationBadge location={item.location} />
        </div>
      </td>
      <td className="py-2 px-3 tabular-nums text-slate-400">{fmtHistoryNetworkUsage(item)}</td>
      <td className="py-2 px-3 tabular-nums text-slate-400">{fmtDuration(item.duration_s)}</td>
      <td className="py-2 px-3 text-slate-500 text-[10px]">{fmtAge(item.date)}</td>
    </tr>
  );
}

export default function TautulliSection({ data }) {
  if (!data) {
    return (
      <div className="chart-card py-4 flex items-center gap-3 text-slate-400 text-sm">
        <Tv size={15} /> Connecting to Tautulli…
      </div>
    );
  }

  if (data.configured === false) {
    return (
      <div className="chart-card py-4 px-4 flex flex-col gap-1 text-sm">
        <div className="flex items-center gap-3 text-amber-300">
          <Tv size={15} /> Tautulli not configured
        </div>
        <div className="text-slate-400 text-xs">
          Set <code>TAUTULLI_URL</code> and <code>TAUTULLI_API_KEY</code>, then restart the backend/container.
        </div>
      </div>
    );
  }

  if (data.connected === false) {
    return (
      <div className="chart-card py-4 px-4 flex flex-col gap-1 text-sm">
        <div className="flex items-center gap-3 text-red-300">
          <Tv size={15} /> Tautulli connection failed
        </div>
        <div className="text-slate-400 text-xs break-all">
          {data.error || 'Unable to fetch data from Tautulli.'}
        </div>
      </div>
    );
  }

  const streams = data.stream_count || 0;
  const sessions = data.sessions || [];
  const recent = data.recent || [];
  const quality = data.quality_summary || {};
  const avgScore = quality.avg_score;
  const qualityHelp = 'Inferred stream health score from playback method, transcode speed, bitrate reduction, resolution changes, and remote-session constraints. It is a delivery health estimate, not a direct viewer QoE measurement.';

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="chart-card overflow-hidden">
          <div className="flex flex-col gap-4 px-3 py-3 border-b border-white/[0.04]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
              <Play size={12} className="text-emerald-400" />
              <span className="text-xs font-semibold text-slate-300">Active Sessions</span>
              </div>
              <div
                className="flex items-center gap-1 text-[10px] text-slate-500"
                title={qualityHelp}
              >
                <CircleHelp size={12} className="text-slate-500" />
                <span>Inferred stream health</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <SummaryPill
                label="Streams"
                value={streams}
                tone={streams > 0 ? 'text-emerald-400' : 'text-slate-300'}
              />
              <SummaryPill
                label="Total BW"
                value={fmtBandwidth(data.total_bandwidth_mbps || 0)}
                tone={data.total_bandwidth_mbps > 0 ? 'text-cyan-400' : 'text-slate-300'}
                icon={Wifi}
              />
              <SummaryPill
                label="LAN BW"
                value={fmtBandwidth(data.lan_bandwidth_mbps || 0)}
                tone={(data.lan_bandwidth_mbps || 0) > 0 ? 'text-blue-400' : 'text-slate-300'}
              />
              <SummaryPill
                label="WAN BW"
                value={fmtBandwidth(data.wan_bandwidth_mbps || 0)}
                tone={(data.wan_bandwidth_mbps || 0) > 0 ? 'text-cyan-400' : 'text-slate-300'}
              />
              <SummaryPill
                label="Overall Health"
                value={avgScore ?? '—'}
                tone={summaryTone(avgScore)}
              />
            </div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-white/[0.04]">
                <th className="text-left py-2 px-3 font-semibold">Title</th>
                <th className="text-left py-2 px-3 font-semibold">User</th>
                <th className="text-left py-2 px-3 font-semibold">Player</th>
                <th className="text-left py-2 px-3 font-semibold">Health</th>
                <th className="text-left py-2 px-3 font-semibold">Progress</th>
                <th className="text-left py-2 px-3 font-semibold">Bandwidth</th>
                <th className="text-left py-2 px-3 font-semibold">Delivery</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length > 0 ? sessions.map((s, i) => <SessionRow key={i} session={s} />) : (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-sm text-slate-500 text-center">
                    No active sessions right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {recent.length > 0 && (
          <div className="chart-card overflow-hidden min-h-[280px] flex flex-col">
            <div className="flex items-center gap-2 px-3 py-3 border-b border-white/[0.04]">
              <Eye size={12} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-300">Recently Watched</span>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-white/[0.04]">
                    <th className="text-left py-2 px-3 font-semibold">Title</th>
                    <th className="text-left py-2 px-3 font-semibold">User</th>
                    <th className="text-left py-2 px-3 font-semibold">Player</th>
                    <th className="text-left py-2 px-3 font-semibold">Health</th>
                    <th className="text-left py-2 px-3 font-semibold">Delivery</th>
                    <th className="text-left py-2 px-3 font-semibold">Bandwidth</th>
                    <th className="text-left py-2 px-3 font-semibold">Duration</th>
                    <th className="text-left py-2 px-3 font-semibold">When</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r, i) => <RecentRow key={i} item={r} />)}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
