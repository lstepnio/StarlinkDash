import { useStarlink } from './hooks/useStarlink';
import { useNotifications } from './hooks/useNotifications';
import StatusCards from './components/StatusCards';
import ThroughputChart from './components/ThroughputChart';
import LatencyChart from './components/LatencyChart';
import ObstructionMap from './components/ObstructionMap';
import SignalChart from './components/SignalChart';
import PowerChart from './components/PowerChart';
import SpeedQualityScore from './components/SpeedQualityScore';
import AlertsPanel from './components/AlertsPanel';
import UptimeTimeline from './components/UptimeTimeline';
import OutageLog from './components/OutageLog';
import RouterCards from './components/RouterCards';
import RouterChart from './components/RouterChart';
import SpeedtestSection from './components/SpeedtestSection';
import UptimeKumaPanel from './components/UptimeKumaPanel';
import FailoverLog from './components/FailoverLog';
import ConnectionIndicator from './components/ConnectionIndicator';
import TimeRangeSelector from './components/TimeRangeSelector';
import { Network } from 'lucide-react';

function SectionLabel({ children }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 px-0.5 mb-1">
      {children}
    </div>
  );
}

function App() {
  const {
    status, history, bulkHistory, obstruction,
    alerts, outages,
    routerStatus, routerHistory, failoverData,
    speedtestLatest, speedtestHistory,
    uptimeMonitors,
    connected, timeRange, setTimeRange,
  } = useStarlink();

  useNotifications(status, outages);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 px-5 md:px-8 py-3 flex items-center justify-between border-b border-white/[0.05] bg-[#030712]/85 backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500/10 p-2 rounded-xl border border-blue-500/15">
            <Network className="text-blue-400" size={20} />
          </div>
          <h1 className="text-base font-bold tracking-tight leading-tight text-slate-100">Network &amp; Service Dashboard</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          <ConnectionIndicator connected={connected} status={status} />
        </div>
      </header>

      {/* Dish error banner */}
      {status?.error && (
        <div className="mx-5 md:mx-8 mt-4 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300 flex items-center gap-3">
          <span className="text-red-400 font-semibold shrink-0">Dish unreachable</span>
          <span className="text-red-400/50 text-xs truncate">{status.error}</span>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 px-5 md:px-8 py-5 max-w-[1800px] w-full mx-auto space-y-5">

        {/* ── 1. Router — ERLite3 ── */}
        <div>
          <SectionLabel>Router — ERLite3</SectionLabel>
          <div className="space-y-4">
            <RouterCards routerStatus={routerStatus} />
            <RouterChart routerHistory={routerHistory} timeRange={timeRange} />
            <FailoverLog failoverData={failoverData} />
          </div>
        </div>

        {/* ── 2. Service health (Uptime Kuma) ── */}
        <div>
          <SectionLabel>Service Health</SectionLabel>
          <UptimeKumaPanel monitors={uptimeMonitors} />
        </div>

        {/* ── 3. Speedtest ── */}
        <div>
          <SectionLabel>Speedtest History</SectionLabel>
          <SpeedtestSection latest={speedtestLatest} history={speedtestHistory} />
        </div>

        {/* ── 4. Starlink status metrics ── */}
        <div>
          <SectionLabel>Starlink Dish</SectionLabel>
          <StatusCards status={status} />
        </div>

        {/* Uptime timeline */}
        <UptimeTimeline history={history} outages={outages} />

        {/* Throughput & Latency */}
        <div>
          <SectionLabel>Throughput &amp; Latency</SectionLabel>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ThroughputChart history={history} bulkHistory={bulkHistory} timeRange={timeRange} />
            <LatencyChart history={history} bulkHistory={bulkHistory} timeRange={timeRange} />
          </div>
        </div>

        {/* Quality + Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SpeedQualityScore status={status} history={history} />
          <AlertsPanel alerts={alerts} />
        </div>

        {/* Signal & Hardware */}
        <div>
          <SectionLabel>Signal &amp; Hardware</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-4">
              <ObstructionMap obstruction={obstruction} />
            </div>
            <div className="lg:col-span-8 grid grid-cols-1 gap-4">
              <SignalChart history={history} />
              <PowerChart bulkHistory={bulkHistory} history={history} timeRange={timeRange} />
            </div>
          </div>
        </div>

        {/* Outage log */}
        <OutageLog outages={outages} />

      </main>

      {/* Footer */}
      <footer className="px-5 md:px-8 py-3 border-t border-white/[0.04] flex items-center justify-between text-[10px] text-slate-500">
        <span className="font-medium">Network &amp; Service Dashboard</span>
      </footer>
    </div>
  );
}

export default App;
