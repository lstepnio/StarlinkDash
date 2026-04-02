import { useState, useEffect, useCallback, useRef } from 'react';

async function fetchJson(url, { timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function useStarlink() {
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [bulkHistory, setBulkHistory] = useState(null);
  const [obstruction, setObstruction] = useState(null);
  const [alerts, setAlerts] = useState({ events: [], active: {} });
  const [outages, setOutages] = useState({ outages: [], current: false });
  const [routerStatus, setRouterStatus] = useState(null);
  const [routerHistory, setRouterHistory] = useState([]);
  const [speedtestLatest, setSpeedtestLatest] = useState(null);
  const [speedtestHistory, setSpeedtestHistory] = useState([]);
  const [uptimeMonitors, setUptimeMonitors] = useState([]);
  const [tautulliData, setTautulliData] = useState(null);
  const [failoverData, setFailoverData] = useState(null);
  const [connected, setConnected] = useState(false);
  const [timeRange, setTimeRange] = useState(1); // hours
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  // WebSocket for real-time status
  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'status') {
        setStatus(msg.data);
      }
    };
    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await fetchJson('/api/config');
      setConfig(data);
    } catch { /* ignore */ }
  }, []);

  // Fetch persisted history from SQLite
  const fetchHistory = useCallback(async () => {
    try {
      const data = await fetchJson(`/api/history?hours=${timeRange}`);
      if (data.rows) setHistory(data.rows);
    } catch { /* ignore */ }
  }, [timeRange]);

  // Fetch bulk history (power data from dish)
  const fetchBulk = useCallback(async () => {
    try {
      const data = await fetchJson('/api/history/bulk');
      if (!data.error) setBulkHistory(data);
    } catch { /* ignore */ }
  }, []);

  // Fetch obstruction map
  const fetchObstruction = useCallback(async () => {
    try {
      const data = await fetchJson('/api/obstruction');
      if (data.snr) setObstruction(data);
    } catch { /* ignore */ }
  }, []);

  // Fetch alert log
  const fetchAlerts = useCallback(async () => {
    try {
      const data = await fetchJson('/api/alerts?hours=24');
      setAlerts(data);
    } catch { /* ignore */ }
  }, []);

  // Fetch outage log
  const fetchOutages = useCallback(async () => {
    try {
      const data = await fetchJson('/api/outages?hours=24');
      setOutages(data);
    } catch { /* ignore */ }
  }, []);

  // Fetch router status + history
  const fetchRouter = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        fetchJson('/api/router/status'),
        fetchJson(`/api/router/history?hours=${timeRange}`),
      ]);
      setRouterStatus(s);
      if (h.rows) setRouterHistory(h.rows);
    } catch { /* ignore */ }
  }, [timeRange]);

  // Fetch failover event history
  const fetchFailover = useCallback(async () => {
    try {
      const data = await fetchJson('/api/failover/history?hours=168');
      setFailoverData(data);
    } catch { /* ignore */ }
  }, []);

  // Fetch Tautulli (Plex) data
  const fetchTautulli = useCallback(async () => {
    try {
      const data = await fetchJson('/api/tautulli');
      if (data && Object.keys(data).length) setTautulliData(data);
    } catch { /* ignore */ }
  }, []);

  // Fetch Uptime Kuma monitor statuses
  const fetchUptime = useCallback(async () => {
    try {
      const data = await fetchJson('/api/uptime');
      if (data.monitors) setUptimeMonitors(data.monitors);
    } catch { /* ignore */ }
  }, []);

  // Fetch speedtest latest + history (last 7 days)
  const fetchSpeedtest = useCallback(async () => {
    try {
      const [l, h] = await Promise.all([
        fetchJson('/api/speedtest/latest'),
        fetchJson('/api/speedtest/history?hours=168'),
      ]);
      if (!l.error) setSpeedtestLatest(l);
      if (h.rows) setSpeedtestHistory(h.rows);
    } catch { /* ignore */ }
  }, []);

  // Initial load + polling for always-on data
  useEffect(() => {
    fetchConfig();
    fetchHistory();
    fetchBulk();
    fetchObstruction();
    fetchAlerts();
    fetchOutages();
    fetchRouter();
    fetchFailover();
    const interval = setInterval(() => {
      fetchHistory();
      fetchBulk();
      fetchObstruction();
      fetchAlerts();
      fetchOutages();
      fetchRouter();
      fetchFailover();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchConfig, fetchHistory, fetchBulk, fetchObstruction, fetchAlerts, fetchOutages, fetchRouter, fetchFailover]);

  // Optional integrations poll only when enabled
  useEffect(() => {
    if (!config) return;

    if (config.speedtest_enabled) {
      fetchSpeedtest();
    } else {
      setSpeedtestLatest(null);
      setSpeedtestHistory([]);
    }

    if (config.uptime_kuma_enabled) {
      fetchUptime();
    } else {
      setUptimeMonitors([]);
    }

    if (config.tautulli_enabled) {
      fetchTautulli();
    } else {
      setTautulliData(null);
    }

    const interval = setInterval(() => {
      if (config.speedtest_enabled) fetchSpeedtest();
      if (config.uptime_kuma_enabled) fetchUptime();
      if (config.tautulli_enabled) fetchTautulli();
    }, 15000);

    return () => clearInterval(interval);
  }, [config, fetchSpeedtest, fetchUptime, fetchTautulli]);

  return {
    config,
    status, history, bulkHistory, obstruction,
    alerts, outages,
    routerStatus, routerHistory, failoverData,
    speedtestLatest, speedtestHistory,
    uptimeMonitors, tautulliData,
    connected, timeRange, setTimeRange,
  };
}
