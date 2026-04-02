import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Tv, Film, Play, Users, Wifi, Monitor, Clock, Eye,
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
    <div className="metric-card accent-slate p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        <Icon size={10} strokeWidth={2.5} /> {label}
      </div>
      <span className={`text-2xl font-bold tabular-nums leading-none ${color}`}>{value}</span>
      {sub && <span className="text-[10px] text-slate-500 mt-0.5">{sub}</span>}
    </div>
  );
}

function SessionRow({ session }) {
  const stateColor = session.state === 'playing' ? 'text-emerald-400' : session.state === 'paused' ? 'text-amber-400' : 'text-slate-500';
  return (
    <tr className="border-b border-white/[0.02]">
      <td className="py-2 px-3">
        <div className="flex items-center gap-2">
          {session.media_type === 'movie' ? <Film size={11} className="text-violet-400 shrink-0" /> : <Tv size={11} className="text-cyan-400 shrink-0" />}
          <span className="text-slate-300 truncate max-w-[200px]">{session.title}</span>
        </div>
      </td>
      <td className="py-2 px-3 text-slate-400">{session.user}</td>
      <td className="py-2 px-3 text-slate-400">{session.player || session.platform}</td>
      <td className={`py-2 px-3 font-medium capitalize ${stateColor}`}>{session.state || '—'}</td>
      <td className="py-2 px-3 tabular-nums text-slate-400">{session.progress_pct}%</td>
      <td className="py-2 px-3 text-slate-500 text-[10px]">{session.transcode_decision === 'transcode' ? 'Transcode' : 'Direct'}</td>
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
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="chart-card py-4 flex items-center gap-3 text-slate-400 text-sm">
        <Tv size={15} /> Connecting to Tautulli…
      </div>
    );
  }

  const streams = data.stream_count || 0;
  const sessions = data.sessions || [];
  const libraries = data.libraries || [];
  const recent = data.recent || [];

  const totalItems = libraries.reduce((sum, l) => sum + l.count, 0);
  const libSummary = libraries.map((l) => `${l.count} ${l.name}`).join(' · ');

  // Plays by date chart data
  const chartData = useMemo(() => {
    if (!data.plays_by_date?.dates) return [];
    const { dates, series } = data.plays_by_date;
    return dates.map((d, i) => ({
      date: d,
      tv: series.tv?.[i] || 0,
      movies: series.movies?.[i] || 0,
    }));
  }, [data.plays_by_date]);

  return (
    <div className="space-y-4">
      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Play} label="Active Streams" color={streams > 0 ? 'text-emerald-400' : 'text-slate-300'}
          value={streams} sub={streams > 0 ? `${data.total_bandwidth_mbps || 0} Mbps total` : 'No active streams'} />
        <StatCard icon={Film} label="Library" value={totalItems} sub={libSummary} />
        <StatCard icon={Users} label="Recent Plays" value={recent.length}
          sub={recent[0] ? `Last: ${fmtAge(recent[0].date)}` : '—'} />
        <StatCard icon={Wifi} label="Bandwidth" value={`${data.total_bandwidth_mbps || 0}`}
          sub={`LAN: ${data.lan_bandwidth_mbps || 0} · WAN: ${data.wan_bandwidth_mbps || 0} Mbps`}
          color={data.total_bandwidth_mbps > 0 ? 'text-cyan-400' : 'text-slate-300'} />
      </div>

      {/* Active sessions table */}
      {sessions.length > 0 && (
        <div className="chart-card overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04]">
            <Play size={12} className="text-emerald-400" />
            <span className="text-xs font-semibold text-slate-300">Active Sessions</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-white/[0.04]">
                <th className="text-left py-2 px-3 font-semibold">Title</th>
                <th className="text-left py-2 px-3 font-semibold">User</th>
                <th className="text-left py-2 px-3 font-semibold">Player</th>
                <th className="text-left py-2 px-3 font-semibold">State</th>
                <th className="text-left py-2 px-3 font-semibold">Progress</th>
                <th className="text-left py-2 px-3 font-semibold">Type</th>
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
          <div className="chart-card overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04]">
              <Eye size={12} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-300">Recently Watched</span>
            </div>
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
        )}
      </div>
    </div>
  );
}
