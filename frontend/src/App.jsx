import { useStarlink } from './hooks/useStarlink';
import { useNotifications } from './hooks/useNotifications';
import StatusCards from './components/StatusCards';
import ThroughputChart from './components/ThroughputChart';
import LatencyChart from './components/LatencyChart';
import ObstructionMap from './components/ObstructionMap';
import SignalChart from './components/SignalChart';
import PowerChart from './components/PowerChart';
import AlertsPanel from './components/AlertsPanel';
import UptimeTimeline from './components/UptimeTimeline';
import OutageLog from './components/OutageLog';
import RouterCards from './components/RouterCards';
import RouterChart from './components/RouterChart';
import SpeedtestSection from './components/SpeedtestSection';
import UptimeKumaPanel from './components/UptimeKumaPanel';
import FailoverLog from './components/FailoverLog';
import TautulliSection from './components/TautulliSection';
import ConnectionIndicator from './components/ConnectionIndicator';
import TimeRangeSelector from './components/TimeRangeSelector';
import { Activity, Gauge, Network, Satellite, ShieldCheck } from 'lucide-react';

function SectionBlock({ eyebrow, title, description, children, action }) {
  return (
    <section className="surface-panel space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="section-eyebrow">{eyebrow}</div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-slate-100">{title}</h2>
            {description && <p className="max-w-3xl text-[13px] leading-relaxed text-slate-400">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function SummaryChip({ icon: Icon, label, value }) {
  return (
    <div className="summary-chip">
      <Icon size={14} className="text-slate-400" />
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
        <div className="truncate text-sm font-medium text-slate-200">{value}</div>
      </div>
    </div>
  );
}

function App() {
  const {
    config,
    status, history, bulkHistory, obstruction,
    alerts, outages,
    routerStatus, routerHistory, failoverData,
    speedtestLatest, speedtestHistory,
    uptimeMonitors, tautulliData,
    connected, timeRange, setTimeRange,
  } = useStarlink();

  useNotifications(status, outages);

  const dishState = status?.header?.state || 'Unknown';
  const serviceCount = uptimeMonitors?.length || 0;
  const activeAlertCount = Object.values(alerts?.active || {}).filter(Boolean).length;
  const enabledAddons = [
    config?.uptime_kuma_enabled,
    config?.tautulli_enabled,
    config?.speedtest_enabled,
  ].filter(Boolean).length;

  return (
    <div className="app-shell min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#030712]/92">
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-5 py-4 md:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.05)]">
              <Network className="text-cyan-300" size={22} />
            </div>
            <div className="space-y-1">
              <div className="section-eyebrow">Home Dashboard</div>
              <div className="space-y-1">
                <h1 className="text-xl font-semibold tracking-tight text-slate-50 md:text-2xl">Network and service visibility in one place</h1>
                <p className="max-w-2xl text-sm text-slate-400">
                  Starlink health, router failover, service monitoring, and media activity with live telemetry.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap items-center gap-2.5">
              <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
              <ConnectionIndicator connected={connected} status={status} />
            </div>
            <div className="flex flex-wrap gap-2">
              <SummaryChip icon={Satellite} label="Dish State" value={dishState} />
              <SummaryChip icon={ShieldCheck} label="Service Checks" value={`${serviceCount} monitors`} />
              <SummaryChip icon={Activity} label="Active Alerts" value={`${activeAlertCount} live`} />
              <SummaryChip icon={Gauge} label="Enabled Integrations" value={`${enabledAddons}/3 optional`} />
            </div>
          </div>
        </div>
      </header>

      {/* Dish error banner */}
      {status?.error && (
        <div className="mx-auto mt-5 flex w-full max-w-[1680px] items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-300 md:px-8">
          <span className="text-red-400 font-semibold shrink-0">Dish unreachable</span>
          <span className="text-red-400/50 text-xs truncate">{status.error}</span>
        </div>
      )}

      {/* Main */}
      <main className="mx-auto flex-1 w-full max-w-[1680px] px-5 py-6 md:px-8 md:py-8 space-y-6">

        {/* ── 1. Router — ERLite3 ── */}
        <SectionBlock
          eyebrow="Router"
          title="Edge router and failover"
          description="Primary WAN, Starlink failover, and router load presented together so route changes are easy to spot."
        >
          <div className="space-y-4">
            <RouterCards routerStatus={routerStatus} />
            <RouterChart routerHistory={routerHistory} timeRange={timeRange} />
            <FailoverLog failoverData={failoverData} />
          </div>
        </SectionBlock>

        {/* ── 2. Service health (Uptime Kuma) ── */}
        {config?.uptime_kuma_enabled && (
          <SectionBlock
            eyebrow="Health"
            title="Service health"
            description="External checks from Uptime Kuma with down services surfaced first."
          >
            <UptimeKumaPanel monitors={uptimeMonitors} />
          </SectionBlock>
        )}

        {/* ── 3. Plex / Tautulli ── */}
        {config?.tautulli_enabled && (
          <SectionBlock
            eyebrow="Media"
            title="Plex activity"
            description="Current streams, bandwidth, and recent playback history from Tautulli."
          >
            <TautulliSection data={tautulliData} />
          </SectionBlock>
        )}

        {/* ── 4. Speedtest ── */}
        {config?.speedtest_enabled && (
          <SectionBlock
            eyebrow="Benchmarks"
            title="Speedtest history"
            description="Periodic WAN benchmarks for trend checking outside the live Starlink telemetry stream."
          >
            <SpeedtestSection latest={speedtestLatest} history={speedtestHistory} />
          </SectionBlock>
        )}

        <SectionBlock
          eyebrow="Dish"
          title="Starlink status"
          description="Live Starlink throughput, latency, packet loss, and environmental indicators."
        >
          <StatusCards status={status} />
        </SectionBlock>

        <SectionBlock
          eyebrow="Availability"
          title="Uptime timeline"
          description="Connection continuity over time with outage segments called out explicitly."
        >
          <UptimeTimeline history={history} outages={outages} />
        </SectionBlock>

        {/* Throughput & Latency */}
        <SectionBlock
          eyebrow="Performance"
          title="Throughput and latency"
          description="Short-term traffic and packet-loss behavior with the selected time window applied consistently."
        >
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ThroughputChart history={history} bulkHistory={bulkHistory} timeRange={timeRange} />
            <LatencyChart history={history} bulkHistory={bulkHistory} timeRange={timeRange} />
          </div>
        </SectionBlock>

        {/* Signal & Hardware */}
        <SectionBlock
          eyebrow="Signal"
          title="Signal and hardware"
          description="Obstruction visibility, signal trends, and power behavior for diagnosing environmental issues."
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-4">
              <ObstructionMap obstruction={obstruction} />
            </div>
            <div className="lg:col-span-8 grid grid-cols-1 gap-4">
              <SignalChart history={history} />
              <PowerChart bulkHistory={bulkHistory} history={history} timeRange={timeRange} />
            </div>
          </div>
        </SectionBlock>

        <SectionBlock
          eyebrow="Incidents"
          title="Alerts and outage history"
          description="Current Starlink alerts and recent outage windows grouped together for faster incident review."
        >
          <div className="grid grid-cols-1 gap-4">
            <AlertsPanel alerts={alerts} />
            <OutageLog outages={outages} />
          </div>
        </SectionBlock>

      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.05] px-5 py-4 md:px-8">
        <div className="mx-auto flex w-full max-w-[1680px] items-center justify-between text-[10px] text-slate-500">
          <span className="font-medium">Home Dashboard</span>
          <span>Starlink, router, and service telemetry</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
