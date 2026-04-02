import { useState, useEffect, useCallback, useRef } from 'react';

export function useStarlink() {
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

  // Fetch persisted history from SQLite
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/history?hours=${timeRange}`);
      const data = await res.json();
      if (data.rows) setHistory(data.rows);
    } catch { /* ignore */ }
  }, [timeRange]);

  // Fetch bulk history (power data from dish)
  const fetchBulk = useCallback(async () => {
    try {
      const res = await fetch('/api/history/bulk');
      const data = await res.json();
      if (!data.error) setBulkHistory(data);
    } catch { /* ignore */ }
  }, []);

  // Fetch obstruction map
  const fetchObstruction = useCallback(async () => {
    try {
      const res = await fetch('/api/obstruction');
      const data = await res.json();
      if (data.snr) setObstruction(data);
    } catch { /* ignore */ }
  }, []);

  // Fetch alert log
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts?hours=24');
      const data = await res.json();
      setAlerts(data);
    } catch { /* ignore */ }
  }, []);

  // Fetch outage log
  const fetchOutages = useCallback(async () => {
    try {
      const res = await fetch('/api/outages?hours=24');
      const data = await res.json();
      setOutages(data);
    } catch { /* ignore */ }
  }, []);

  // Fetch router status + history
  const fetchRouter = useCallback(async () => {
    try {
      const [sRes, hRes] = await Promise.all([
        fetch('/api/router/status'),
        fetch(`/api/router/history?hours=${timeRange}`),
      ]);
      const s = await sRes.json();
      const h = await hRes.json();
      setRouterStatus(s);
      if (h.rows) setRouterHistory(h.rows);
    } catch { /* ignore */ }
  }, [timeRange]);

  // Fetch failover event history
  const fetchFailover = useCallback(async () => {
    try {
      const res = await fetch('/api/failover/history?hours=168');
      const data = await res.json();
      setFailoverData(data);
    } catch { /* ignore */ }
  }, []);

  // Fetch Uptime Kuma monitor statuses
  const fetchUptime = useCallback(async () => {
    try {
      const res = await fetch('/api/uptime');
      const data = await res.json();
      if (data.monitors) setUptimeMonitors(data.monitors);
    } catch { /* ignore */ }
  }, []);

  // Fetch speedtest latest + history (last 7 days)
  const fetchSpeedtest = useCallback(async () => {
    try {
      const [lRes, hRes] = await Promise.all([
        fetch('/api/speedtest/latest'),
        fetch('/api/speedtest/history?hours=168'),
      ]);
      const l = await lRes.json();
      const h = await hRes.json();
      if (!l.error) setSpeedtestLatest(l);
      if (h.rows) setSpeedtestHistory(h.rows);
    } catch { /* ignore */ }
  }, []);

  // Initial load + polling
  useEffect(() => {
    fetchHistory();
    fetchBulk();
    fetchObstruction();
    fetchAlerts();
    fetchOutages();
    fetchRouter();
    fetchFailover();
    fetchSpeedtest();
    fetchUptime();
    const interval = setInterval(() => {
      fetchHistory();
      fetchBulk();
      fetchObstruction();
      fetchAlerts();
      fetchOutages();
      fetchRouter();
      fetchFailover();
      fetchSpeedtest();
      fetchUptime();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchHistory, fetchBulk, fetchObstruction, fetchAlerts, fetchOutages, fetchRouter, fetchFailover, fetchSpeedtest, fetchUptime]);

  return {
    status, history, bulkHistory, obstruction,
    alerts, outages,
    routerStatus, routerHistory, failoverData,
    speedtestLatest, speedtestHistory,
    uptimeMonitors,
    connected, timeRange, setTimeRange,
  };
}
