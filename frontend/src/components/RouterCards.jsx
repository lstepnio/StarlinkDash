import { Cpu, ArrowDown, ArrowUp, Router, Clock, MemoryStick, AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react';

function formatBps(bps) {
  if (bps == null) return { value: '—', unit: '' };
  if (bps >= 1e9) return { value: (bps / 1e9).toFixed(2), unit: 'Gbps' };
  if (bps >= 1e6) return { value: (bps / 1e6).toFixed(1), unit: 'Mbps' };
  if (bps >= 1e3) return { value: (bps / 1e3).toFixed(0), unit: 'Kbps' };
  return { value: Math.round(bps).toString(), unit: 'bps' };
}

function formatUptime(s) {
  if (!s) return '—';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatLinkSpeed(mbps) {
  if (mbps == null) return 'Unknown';
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(mbps % 1000 === 0 ? 0 : 1)} Gbps`;
  return `${mbps} Mbps`;
}

function formatAge(s) {
  if (s == null) return 'Unknown';
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function StatChip({ icon: Icon, label, value, unit, color = 'text-slate-300', sub }) {
  return (
    <div className="metric-card accent-slate p-4 flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
        <Icon size={10} strokeWidth={2.5} />
        {label}
      </div>
      <div className="flex items-baseline gap-1 min-w-0">
        <span className={`text-lg font-bold tabular-nums leading-tight truncate ${color}`}>{value}</span>
        {unit && <span className="text-xs text-slate-400 shrink-0">{unit}</span>}
      </div>
      {sub && <div className="text-[10px] text-slate-400 truncate">{sub}</div>}
    </div>
  );
}

function WanCard({ label, up, adminUp, ip, inBps, outBps, errors, discards, speedMbps, lastChangeS, isActive, isFailover }) {
  const { value: inVal, unit: inUnit } = formatBps(inBps);
  const { value: outVal, unit: outUnit } = formatBps(outBps);
  const statusText = adminUp === false ? 'Admin Down' : up ? 'Link Up' : 'Link Down';
  const statusColor = adminUp === false ? 'text-slate-400' : up ? 'text-emerald-400' : 'text-red-400';

  const accent = isActive
    ? (isFailover ? 'accent-amber' : 'accent-green')
    : (up ? 'accent-slate' : 'accent-red');

  return (
    <div className={`metric-card ${accent} p-4 space-y-2`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          <Router size={10} strokeWidth={2.5} />
          {label}
        </div>
        <div className="flex items-center gap-1.5">
          {isActive && (
            <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full ${
              isFailover
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
            }`}>
              {isFailover ? 'FAILOVER' : 'ACTIVE'}
            </span>
          )}
          <div className={`w-1.5 h-1.5 rounded-full ${up ? 'bg-emerald-400' : 'bg-red-500'}`} />
        </div>
      </div>

      {/* IP address */}
      <div className="text-[11px] font-mono text-slate-500 truncate">
        {ip ?? (up ? 'Acquiring IP…' : 'No link')}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        <div className="text-slate-400">Admin: <span className={adminUp ? 'text-slate-200' : 'text-slate-500'}>{adminUp == null ? 'Unknown' : adminUp ? 'Up' : 'Down'}</span></div>
        <div className="text-slate-400">Oper: <span className={statusColor}>{statusText}</span></div>
        <div className="text-slate-400">Speed: <span className="text-slate-300">{formatLinkSpeed(speedMbps)}</span></div>
        <div className="text-slate-400">Last change: <span className="text-slate-300">{formatAge(lastChangeS)}</span></div>
      </div>

      {/* Traffic */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[9px] text-slate-400 uppercase tracking-widest flex items-center gap-1">
            <ArrowDown size={9} /> In
          </div>
          <span className="text-sm font-bold text-cyan-400 tabular-nums">{inVal}</span>
          <span className="text-[10px] text-slate-400 ml-1">{inUnit}</span>
        </div>
        <div>
          <div className="text-[9px] text-slate-400 uppercase tracking-widest flex items-center gap-1">
            <ArrowUp size={9} /> Out
          </div>
          <span className="text-sm font-bold text-violet-400 tabular-nums">{outVal}</span>
          <span className="text-[10px] text-slate-400 ml-1">{outUnit}</span>
        </div>
      </div>

      {/* Errors */}
      {((errors || 0) > 0 || (discards || 0) > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-amber-400">
          <AlertTriangle size={10} />
          {(errors || 0) > 0 && <span>{errors} errors</span>}
          {(discards || 0) > 0 && <span>{discards} discards</span>}
        </div>
      )}
    </div>
  );
}

export default function RouterCards({ routerStatus }) {
  if (!routerStatus) {
    return (
      <div className="chart-card flex items-center gap-3 py-3">
        <Router size={15} className="text-slate-400 shrink-0" />
        <span className="text-sm text-slate-500">Connecting to ERLite3…</span>
      </div>
    );
  }

  if (routerStatus.error) {
    return (
      <div className="chart-card flex items-center gap-3 py-3">
        <Router size={15} className="text-red-500/60 shrink-0" />
        <div>
          <span className="text-sm font-semibold text-slate-400">ERLite3</span>
          <span className="text-xs text-red-400/70 ml-3">{routerStatus.error}</span>
        </div>
      </div>
    );
  }

  const r = routerStatus;
  const memPct = r.mem_total_mb ? ((r.mem_used_mb / r.mem_total_mb) * 100) : null;
  const isFailover = r.active_wan === 'wan2';

  return (
    <div className="space-y-3">
      {/* Failover status banner */}
      {isFailover ? (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20">
          <ShieldAlert size={15} className="text-amber-400 shrink-0" />
          <div>
            <span className="text-sm font-semibold text-amber-300">Failover Active</span>
            <span className="text-xs text-amber-400/60 ml-3">
              Traffic is currently routing via {r.wan2_iface ?? 'eth2'} instead of the primary uplink {r.wan1_iface ?? 'eth1'}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
          <CheckCircle size={14} className="text-emerald-500/70 shrink-0" />
          <span className="text-xs text-emerald-500/70 font-medium">
            Primary WAN active · {r.wan1_iface ?? 'eth1'}
            {r.wan1_ip && <span className="text-emerald-500/50 font-mono ml-2">{r.wan1_ip}</span>}
          </span>
        </div>
      )}

      {/* WAN cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <WanCard
          label={`WAN1 · ${r.wan1_iface ?? 'eth1'} · Primary`}
          up={r.wan1_up}
          adminUp={r.wan1_admin_up}
          ip={r.wan1_ip}
          inBps={r.wan1_in_bps}
          outBps={r.wan1_out_bps}
          errors={r.wan1_errors}
          discards={r.wan1_discards}
          speedMbps={r.wan1_speed_mbps}
          lastChangeS={r.wan1_last_change_s}
          isActive={r.active_wan === 'wan1'}
          isFailover={false}
        />
        <WanCard
          label={`WAN2 · ${r.wan2_iface ?? 'eth2'} · Failover`}
          up={r.wan2_up}
          adminUp={r.wan2_admin_up}
          ip={r.wan2_ip}
          inBps={r.wan2_in_bps}
          outBps={r.wan2_out_bps}
          errors={r.wan2_errors}
          discards={r.wan2_discards}
          speedMbps={r.wan2_speed_mbps}
          lastChangeS={r.wan2_last_change_s}
          isActive={r.active_wan === 'wan2'}
          isFailover={true}
        />
      </div>

      {/* System metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatChip
          icon={Cpu}
          label="CPU"
          value={r.cpu_pct != null ? r.cpu_pct.toFixed(1) : '—'}
          unit={r.cpu_pct != null ? '%' : ''}
          color={r.cpu_pct > 80 ? 'text-red-400' : r.cpu_pct > 60 ? 'text-amber-400' : 'text-emerald-400'}
        />
        <StatChip
          icon={MemoryStick}
          label="Memory"
          value={memPct != null ? memPct.toFixed(0) : '—'}
          unit={memPct != null ? '%' : ''}
          color={memPct > 85 ? 'text-red-400' : memPct > 70 ? 'text-amber-400' : 'text-blue-400'}
          sub={r.mem_used_mb != null ? `${r.mem_used_mb.toFixed(0)} / ${r.mem_total_mb?.toFixed(0)} MB` : ''}
        />
        <StatChip
          icon={ArrowDown}
          label="LAN In"
          value={formatBps(r.lan_in_bps).value}
          unit={formatBps(r.lan_in_bps).unit}
          color="text-teal-400"
        />
        <StatChip
          icon={Clock}
          label="Uptime"
          value={formatUptime(r.uptime_s)}
          color="text-blue-400"
        />
      </div>
    </div>
  );
}
