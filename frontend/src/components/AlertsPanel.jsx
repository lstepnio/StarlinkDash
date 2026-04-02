import { useState } from 'react';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import ChartCard from './ChartCard';

const ALERT_LABELS = {
  alert_motors_stuck: 'Motors Stuck',
  alert_thermal_throttle: 'Thermal Throttle',
  alert_thermal_shutdown: 'Thermal Shutdown',
  alert_mast_not_near_vertical: 'Mast Not Vertical',
  alert_unexpected_location: 'Unexpected Location',
  alert_slow_ethernet_speeds: 'Slow Ethernet',
  alert_roaming: 'Roaming',
  alert_install_pending: 'Install Pending',
  alert_is_heating: 'Heating',
  alert_power_supply_thermal_throttle: 'PSU Thermal Throttle',
  alert_is_power_save_idle: 'Power Save Idle',
  alert_moving_while_not_mobile: 'Moving (Not Mobile Mode)',
  alert_moving_too_fast_for_policy: 'Moving Too Fast',
  alert_dbf_telem_stale: 'DBF Telemetry Stale',
  alert_low_motor_current: 'Low Motor Current',
  alert_bypass_mode: 'Bypass Mode',
};

function humanizeAlert(name) {
  return ALERT_LABELS[name] || name.replace(/^alert_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTs(ts) {
  return new Date(ts * 1000).toLocaleTimeString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AlertsPanel({ alerts }) {
  const [expanded, setExpanded] = useState(false);
  const active = Object.entries(alerts?.active || {}).filter(([, v]) => v === true);
  const events = alerts?.events || [];

  return (
    <ChartCard title="Alerts">
      {/* Active alerts */}
      {active.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-3">
          {active.map(([name]) => (
            <span
              key={name}
              className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-2.5 py-1 rounded-full"
            >
              <AlertTriangle size={11} />
              {humanizeAlert(name)}
            </span>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-emerald-400 text-sm mb-3">
          <CheckCircle size={15} />
          <span>No active alerts</span>
        </div>
      )}

      {/* Event history toggle */}
      {events.length > 0 && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-2"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? 'Hide' : 'Show'} alert history ({events.length})
          </button>
          {expanded && (
            <div className="overflow-y-auto max-h-52 space-y-1 pr-1">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className={`flex items-center justify-between text-xs px-3 py-1.5 rounded-lg ${
                    ev.active
                      ? 'bg-red-500/8 border border-red-500/20 text-red-300'
                      : 'bg-slate-800/40 border border-slate-700/30 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {ev.active ? (
                      <AlertTriangle size={11} className="text-red-400 shrink-0" />
                    ) : (
                      <CheckCircle size={11} className="text-slate-500 shrink-0" />
                    )}
                    <span>{humanizeAlert(ev.alert_name)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className={`text-[10px] font-medium ${ev.active ? 'text-red-400' : 'text-slate-500'}`}>
                      {ev.active ? 'FIRED' : 'CLEARED'}
                    </span>
                    <span className="text-slate-400 text-[10px] tabular-nums">{formatTs(ev.ts)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {events.length === 0 && active.length === 0 && (
        <div className="text-xs text-slate-400 mt-1">No alert history in the last 24 hours</div>
      )}
    </ChartCard>
  );
}
