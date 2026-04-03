import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Tv, Film, Play, Users, Wifi, Monitor, Eye, CircleHelp,
} from 'lucide-react';
import ChartCard from './ChartCard';
import { tooltipStyle } from '../utils/chart';

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

function StatCard({ icon: Icon, label, value, sub, color = 'text-slate-200' }) {
  return (
    <div className="metric-card px-6 py-5 pb-6 flex min-h-[140px] flex-col gap-4">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        <Icon size={10} strokeWidth={2.5} /> {label}
      </div>
      <span className={`text-4xl font-bold tabular-nums leading-none ${color}`}>{value}</span>
      {sub && <span className="mt-auto text-xs text-slate-500 leading-snug">{sub}</span>}
    </div>
  );
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

function confidenceTone(confidence) {
  switch (confidence) {
    case 'high':
      return 'text-emerald-300';
    case 'medium':
      return 'text-amber-300';
    default:
      return 'text-slate-400';
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
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tabular-nums text-slate-100">{session.streamHealthScore ?? '—'}</span>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${healthTone(session.streamHealthStatus)}`}>
              {session.streamHealthStatus || 'Unknown'}
            </span>
          </div>
          <div className={`text-[10px] uppercase tracking-wide ${confidenceTone(session.streamHealthConfidence)}`}>
            {session.streamHealthConfidence || 'low'} confidence
          </div>
        </div>
      </td>
      <td className="py-2 px-3 tabular-nums text-slate-400">{session.progress_pct}%</td>
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
  return (
    <tr className="border-b border-white/[0.02]">
      <td className="py-2 px-3">
        <div className="flex items-center gap-2">
          {item.media_type === 'movie' ? <Film size={11} className="text-violet-400 shrink-0" /> : <Tv size={11} className="text-cyan-400 shrink-0" />}
          <span className="text-slate-300 truncate max-w-[250px]">{item.title}</span>
        </div>
      </td>
      <td className="py-2 px-3 text-slate-400">{item.user}</td>
      <td className="py-2 px-3 text-slate-400">{item.platform}</td>
      <td className="py-2 px-3 tabular-nums text-slate-400">{fmtDuration(item.duration_s)}</td>
      <td className="py-2 px-3 text-slate-500 text-[10px]">{fmtAge(item.date)}</td>
    </tr>
  );
}

export default function TautulliSection({ data }) {
  const chartData = useMemo(() => {
    if (!data?.plays_by_date?.dates) return [];
    const { dates, series } = data.plays_by_date;
    return dates.map((d, i) => ({
      date: d,
      tv: series.tv?.[i] || 0,
      movies: series.movies?.[i] || 0,
    }));
  }, [data]);

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
  const lanStreams = quality.lan_stream_count ?? data.lan_stream_count ?? 0;
  const wanStreams = quality.wan_stream_count ?? data.wan_stream_count ?? 0;
  const avgScore = quality.avg_score;
  const statusCounts = quality.status_counts || {};
  const qualityHelp = 'Inferred stream health score from playback method, transcode speed, bitrate reduction, resolution changes, and remote-session constraints. It is a delivery health estimate, not a direct viewer QoE measurement.';

  return (
    <div className="space-y-4">
      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard icon={Play} label="Active Streams" color={streams > 0 ? 'text-emerald-400' : 'text-slate-300'}
          value={streams} sub={streams > 0 ? `${data.total_bandwidth_mbps || 0} Mbps total` : 'No active streams'} />
        <StatCard icon={Wifi} label="Bandwidth" value={`${data.total_bandwidth_mbps || 0}`}
          sub={`LAN: ${data.lan_bandwidth_mbps || 0} · WAN: ${data.wan_bandwidth_mbps || 0} Mbps`}
          color={data.total_bandwidth_mbps > 0 ? 'text-cyan-400' : 'text-slate-300'} />
        <StatCard icon={Monitor} label="Stream Health" value={avgScore ?? '—'}
          sub={streams > 0 ? `${statusCounts.Excellent || 0} excellent · ${statusCounts.Good || 0} good · ${statusCounts.Watch || 0} watch · ${statusCounts.Poor || 0} poor · ${statusCounts.Critical || 0} critical` : 'No active streams to score'}
          color={avgScore >= 90 ? 'text-emerald-400' : avgScore >= 75 ? 'text-cyan-400' : avgScore >= 55 ? 'text-amber-400' : avgScore != null ? 'text-red-400' : 'text-slate-300'} />
        <StatCard icon={Users} label="Network Path" value={lanStreams}
          sub={streams > 0 ? `LAN: ${lanStreams} · WAN: ${wanStreams}` : 'No active streams'}
          color={wanStreams > 0 ? 'text-cyan-400' : streams > 0 ? 'text-blue-400' : 'text-slate-300'} />
      </div>

      {/* Active sessions table */}
      {sessions.length > 0 && (
          <div className="chart-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-white/[0.04]">
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
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-white/[0.04]">
                <th className="text-left py-2 px-3 font-semibold">Title</th>
                <th className="text-left py-2 px-3 font-semibold">User</th>
                <th className="text-left py-2 px-3 font-semibold">Player</th>
                <th className="text-left py-2 px-3 font-semibold">Health</th>
                <th className="text-left py-2 px-3 font-semibold">Progress</th>
                <th className="text-left py-2 px-3 font-semibold">Delivery</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => <SessionRow key={i} session={s} />)}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Plays by date chart */}
        {chartData.length > 0 && (
          <ChartCard title="Plays — Last 30 Days">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} stroke="transparent"
                  tickFormatter={(v) => { const d = new Date(v + 'T00:00:00'); return d.toLocaleDateString([], { month: 'short', day: 'numeric' }); }}
                  minTickGap={40} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} stroke="transparent" width={24} allowDecimals={false} />
                <Tooltip {...tooltipStyle}
                  labelFormatter={(v) => { const d = new Date(v + 'T00:00:00'); return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); }} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 6 }} />
                <Bar dataKey="tv" fill="#06b6d4" name="TV" radius={[3, 3, 0, 0]} />
                <Bar dataKey="movies" fill="#8b5cf6" name="Movies" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Recent history */}
        {recent.length > 0 && (
          <div className="chart-card overflow-hidden min-h-[320px] flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04]">
              <Eye size={12} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-300">Recently Watched</span>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-white/[0.04]">
                    <th className="text-left py-2 px-3 font-semibold">Title</th>
                    <th className="text-left py-2 px-3 font-semibold">User</th>
                    <th className="text-left py-2 px-3 font-semibold">Platform</th>
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
