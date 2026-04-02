import {
  Wifi, Clock, ArrowDown, ArrowUp, Activity,
  Thermometer, AlertTriangle, Satellite, MapPin, Radio, Navigation, Signal
} from 'lucide-react';

function formatUptime(seconds) {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatThroughput(bps) {
  if (!bps || bps === 0) return { value: '0', unit: 'Kbps' };
  if (bps >= 1e9) return { value: (bps / 1e9).toFixed(2), unit: 'Gbps' };
  if (bps >= 1e6) return { value: (bps / 1e6).toFixed(1), unit: 'Mbps' };
  if (bps >= 1e3) return { value: (bps / 1e3).toFixed(0), unit: 'Kbps' };
  return { value: Math.round(bps).toString(), unit: 'bps' };
}

// Primary hero metric card
function HeroCard({ icon: Icon, label, value, unit, accent = 'accent-blue', sub }) {
  return (
    <div className={`metric-card ${accent} p-5 flex flex-col gap-1`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
        <Icon size={11} strokeWidth={2.5} />
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className="text-3xl font-bold tabular-nums text-slate-100 leading-none truncate">{value}</span>
        {unit && <span className="text-sm text-slate-500 font-medium shrink-0">{unit}</span>}
      </div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

// Smaller detail card
function DetailCard({ icon: Icon, label, value, unit, color = 'text-slate-300', sub }) {
  return (
    <div className="metric-card accent-slate p-4 flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-1">
        <Icon size={10} strokeWidth={2.5} />
        {label}
      </div>
      <div className="flex items-baseline gap-1 min-w-0">
        <span className={`text-lg font-bold tabular-nums leading-tight truncate ${color}`}>{value}</span>
        {unit && <span className="text-xs text-slate-600 shrink-0">{unit}</span>}
      </div>
      {sub && <div className="text-[10px] text-slate-600 truncate">{sub}</div>}
    </div>
  );
}

export default function StatusCards({ status }) {
  const h = status?.header || {};
  const alerts = status?.alerts || {};

  const state = h.state;
  const isOnline = state === 'CONNECTED';

  const down = formatThroughput(h.downlink_throughput_bps);
  const up = formatThroughput(h.uplink_throughput_bps);
  const latency = h.pop_ping_latency_ms;
  const dropRate = h.pop_ping_drop_rate;

  const isHeating = alerts.alert_is_heating;
  const thermalThrottle = alerts.alert_thermal_throttle;
  const activeAlerts = Object.entries(alerts).filter(([, v]) => v === true);

  const snrAboveFloor = h.is_snr_above_noise_floor;
  const rawSlot = h.seconds_to_first_nonempty_slot;
  const slotSec = rawSlot != null && rawSlot < 1e9 ? rawSlot : null;
  const slotLabel = slotSec == null ? 'None' : slotSec < 60 ? `${slotSec.toFixed(0)}s` : `${(slotSec / 60).toFixed(1)}m`;

  return (
    <div className="space-y-3">
      {/* Hero row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <HeroCard
          icon={Satellite}
          label="Status"
          value={isOnline ? 'Online' : (state || 'Unknown')}
          accent={isOnline ? 'accent-green' : 'accent-amber'}
          sub={h.id ? h.id.slice(-8) : undefined}
        />
        <HeroCard
          icon={ArrowDown}
          label="Download"
          value={down.value}
          unit={down.unit}
          accent="accent-cyan"
        />
        <HeroCard
          icon={ArrowUp}
          label="Upload"
          value={up.value}
          unit={up.unit}
          accent="accent-violet"
        />
        <HeroCard
          icon={Activity}
          label="Latency"
          value={latency != null ? latency.toFixed(1) : '—'}
          unit={latency != null ? 'ms' : ''}
          accent={latency > 100 ? 'accent-red' : latency > 50 ? 'accent-amber' : 'accent-green'}
        />
        <HeroCard
          icon={Wifi}
          label="Packet Loss"
          value={dropRate != null ? (dropRate * 100).toFixed(2) : '—'}
          unit={dropRate != null ? '%' : ''}
          accent={dropRate > 0.05 ? 'accent-red' : dropRate > 0.01 ? 'accent-amber' : 'accent-green'}
        />
      </div>

      {/* Detail row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <DetailCard
          icon={Clock}
          label="Uptime"
          value={formatUptime(h.uptime)}
          color="text-blue-400"
        />
        <DetailCard
          icon={AlertTriangle}
          label="Obstruction"
          value={h.fraction_obstructed != null ? (h.fraction_obstructed * 100).toFixed(2) : '—'}
          unit={h.fraction_obstructed != null ? '%' : ''}
          color={h.fraction_obstructed > 0.05 ? 'text-red-400' : h.fraction_obstructed > 0.01 ? 'text-amber-400' : 'text-emerald-400'}
          sub={h.currently_obstructed ? 'Currently blocked' : 'Path clear'}
        />
        <DetailCard
          icon={Thermometer}
          label="Thermal"
          value={thermalThrottle ? 'Throttled' : isHeating ? 'Heating' : 'Normal'}
          color={thermalThrottle ? 'text-red-400' : isHeating ? 'text-amber-400' : 'text-emerald-400'}
        />
        <DetailCard
          icon={MapPin}
          label="Pointing"
          value={h.direction_azimuth != null ? `${h.direction_azimuth.toFixed(1)}°` : '—'}
          color="text-slate-300"
          sub={h.direction_elevation != null ? `${h.direction_elevation.toFixed(1)}° el` : ''}
        />
        <DetailCard
          icon={Navigation}
          label="GPS"
          value={h.gps_sats != null ? h.gps_sats : '—'}
          unit={h.gps_sats != null ? 'sats' : ''}
          color={h.gps_ready ? 'text-emerald-400' : 'text-amber-400'}
          sub={h.gps_ready ? 'Fix acquired' : 'No fix'}
        />
        <DetailCard
          icon={Signal}
          label="SNR Floor"
          value={snrAboveFloor == null ? '—' : snrAboveFloor ? 'Above' : 'Below'}
          color={snrAboveFloor ? 'text-emerald-400' : snrAboveFloor === false ? 'text-red-400' : 'text-slate-500'}
        />
        <DetailCard
          icon={Radio}
          label="Next Slot"
          value={slotLabel}
          color={slotSec == null ? 'text-slate-500' : slotSec < 60 ? 'text-emerald-400' : 'text-amber-400'}
        />
      </div>

      {/* Active alerts banner */}
      {activeAlerts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/8 border border-red-500/20">
          <AlertTriangle size={13} className="text-red-400 shrink-0" />
          <span className="text-xs text-red-400 font-semibold shrink-0">{activeAlerts.length} active alert{activeAlerts.length > 1 ? 's' : ''}:</span>
          {activeAlerts.map(([k]) => (
            <span key={k} className="text-xs text-red-300/80 bg-red-500/10 px-2 py-0.5 rounded-full">
              {k.replace('alert_', '').replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
