import asyncio
import json
import os
import sqlite3
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

import starlink_grpc

STATIC_DIR = Path(os.environ.get("STATIC_DIR", "../frontend/dist"))
STARLINK_TARGET = os.environ.get("STARLINK_TARGET", "192.168.100.1:9200")
DB_PATH = os.environ.get("DB_PATH", "/data/starlinkdash.db")
POLL_INTERVAL = int(os.environ.get("STARLINK_POLL_INTERVAL", "3"))
OUTAGE_THRESHOLD = 15  # seconds before declaring an outage

# Router (ERLite3) SNMP settings
ROUTER_TARGET = os.environ.get("ROUTER_TARGET", "192.168.10.1")
ROUTER_COMMUNITY = os.environ.get("ROUTER_COMMUNITY", "root123")
ROUTER_LAN_IFACE = os.environ.get("ROUTER_LAN_IFACE", "eth0")
ROUTER_WAN_IFACE = os.environ.get("ROUTER_WAN_IFACE", "eth1")
ROUTER_WAN2_IFACE = os.environ.get("ROUTER_WAN2_IFACE", "eth2")
ROUTER_POLL_INTERVAL = int(os.environ.get("ROUTER_POLL_INTERVAL", "10"))

# Speedtest Tracker integration
SPEEDTEST_URL = os.environ.get("SPEEDTEST_URL", "").rstrip("/")
SPEEDTEST_API_TOKEN = os.environ.get("SPEEDTEST_API_TOKEN", "")
SPEEDTEST_POLL_INTERVAL = int(os.environ.get("SPEEDTEST_POLL_INTERVAL", "300"))  # 5 min

# Uptime Kuma integration
UPTIME_KUMA_URL = os.environ.get("UPTIME_KUMA_URL", "").rstrip("/")
UPTIME_KUMA_API_KEY = os.environ.get("UPTIME_KUMA_API_KEY", "")
UPTIME_KUMA_POLL_INTERVAL = int(os.environ.get("UPTIME_KUMA_POLL_INTERVAL", "30"))

# Data retention
RETENTION_STARLINK_DAYS = int(os.environ.get("RETENTION_STARLINK_DAYS", "30"))
RETENTION_ROUTER_DAYS   = int(os.environ.get("RETENTION_ROUTER_DAYS",   "30"))
RETENTION_SPEEDTEST_DAYS = int(os.environ.get("RETENTION_SPEEDTEST_DAYS", "365"))

latest_status: dict[str, Any] = {}
latest_router: dict[str, Any] = {}
latest_uptime_monitors: list[dict] = []
connected_clients: set[WebSocket] = set()

# ---------------------------------------------------------------------------
# SQLite
# ---------------------------------------------------------------------------

_db_lock = threading.Lock()


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = _get_conn()
    # Core status history - create with all columns
    conn.execute("""
        CREATE TABLE IF NOT EXISTS status_history (
            ts REAL PRIMARY KEY,
            downlink_bps REAL,
            uplink_bps REAL,
            latency_ms REAL,
            drop_rate REAL,
            snr REAL,
            power_w REAL,
            obstructed_frac REAL,
            state TEXT,
            snr_above_noise_floor INTEGER,
            gps_sats INTEGER,
            gps_valid INTEGER,
            currently_obstructed INTEGER,
            scheduling_slot_s REAL
        )
    """)
    # Migrate existing DBs that have fewer columns
    existing = {row[1] for row in conn.execute("PRAGMA table_info(status_history)")}
    for col, typedef in [
        ("snr_above_noise_floor", "INTEGER"),
        ("gps_sats", "INTEGER"),
        ("gps_valid", "INTEGER"),
        ("currently_obstructed", "INTEGER"),
        ("scheduling_slot_s", "REAL"),
    ]:
        if col not in existing:
            conn.execute(f"ALTER TABLE status_history ADD COLUMN {col} {typedef}")

    # Alert log - records every transition (alert fires / clears)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS alert_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts REAL NOT NULL,
            alert_name TEXT NOT NULL,
            active INTEGER NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS alert_log_ts ON alert_log(ts)")

    # Outage log
    conn.execute("""
        CREATE TABLE IF NOT EXISTS outages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_ts REAL NOT NULL,
            end_ts REAL,
            duration_s REAL,
            cause TEXT
        )
    """)

    # Obstruction map (single row, latest only)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS obstruction_map (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            ts REAL,
            snr_json TEXT,
            num_rows INTEGER,
            num_cols INTEGER
        )
    """)

    # Router (ERLite3) history — drop+recreate if schema is outdated
    existing_router_cols = {
        row[1] for row in conn.execute("PRAGMA table_info(router_history)").fetchall()
    }
    if existing_router_cols and "wan1_in_bps" not in existing_router_cols:
        conn.execute("DROP TABLE router_history")
        existing_router_cols = set()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS router_history (
            ts REAL PRIMARY KEY,
            cpu_pct REAL,
            mem_used_mb REAL,
            mem_total_mb REAL,
            wan1_in_bps REAL,
            wan1_out_bps REAL,
            wan2_in_bps REAL,
            wan2_out_bps REAL,
            lan_in_bps REAL,
            lan_out_bps REAL,
            uptime_s REAL,
            active_wan TEXT,
            wan1_up INTEGER,
            wan2_up INTEGER,
            wan1_ip TEXT,
            wan2_ip TEXT
        )
    """)

    # Speedtest Tracker results
    conn.execute("""
        CREATE TABLE IF NOT EXISTS speedtest_results (
            id              INTEGER PRIMARY KEY,
            ts              REAL    NOT NULL,
            ping_ms         REAL,
            jitter_ms       REAL,
            download_mbps   REAL,
            upload_mbps     REAL,
            isp             TEXT,
            server_name     TEXT,
            server_location TEXT,
            result_url      TEXT,
            scheduled       INTEGER DEFAULT 1
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_speedtest_ts ON speedtest_results(ts)")
    conn.commit()
    conn.close()


def store_status(status: dict):
    h = status.get("header", {})
    if not h or not h.get("state"):
        return
    # Parse scheduling slot: huge value means "no slot scheduled" → treat as None
    raw_slot = h.get("seconds_to_first_nonempty_slot")
    slot_s = raw_slot if (raw_slot is not None and raw_slot < 1e9) else None
    with _db_lock:
        try:
            conn = _get_conn()
            conn.execute(
                """INSERT OR REPLACE INTO status_history
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    status["timestamp"],
                    h.get("downlink_throughput_bps"),
                    h.get("uplink_throughput_bps"),
                    h.get("pop_ping_latency_ms"),
                    h.get("pop_ping_drop_rate"),
                    h.get("snr"),
                    None,  # power_w filled later from bulk history
                    h.get("fraction_obstructed"),
                    h.get("state"),
                    int(bool(h.get("is_snr_above_noise_floor"))),
                    h.get("gps_sats"),
                    int(bool(h.get("gps_ready"))),
                    int(bool(h.get("currently_obstructed"))),
                    slot_s,
                ),
            )
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[DB] store_status error: {e}")


def store_history_snapshot(history: dict):
    power = history.get("power_w", [])
    if not power:
        return
    latest_power = next((v for v in reversed(power) if v and v > 0), None)
    if latest_power is None:
        return
    with _db_lock:
        try:
            conn = _get_conn()
            conn.execute(
                "UPDATE status_history SET power_w=? WHERE ts=(SELECT MAX(ts) FROM status_history)",
                (latest_power,),
            )
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[DB] store_history_snapshot error: {e}")


def store_obstruction(data: dict):
    if data.get("error") or not data.get("snr"):
        return
    with _db_lock:
        try:
            conn = _get_conn()
            conn.execute(
                "INSERT OR REPLACE INTO obstruction_map VALUES (1,?,?,?,?)",
                (time.time(), json.dumps(data["snr"]), data["rows"], data["cols"]),
            )
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[DB] store_obstruction error: {e}")


# Alert state tracking (in-memory, persisted on change)
_prev_alerts: dict[str, bool] = {}


def store_alert_changes(alerts: dict, ts: float):
    global _prev_alerts
    rows_to_insert = []
    for name, active in alerts.items():
        if not isinstance(active, bool):
            continue
        prev = _prev_alerts.get(name)
        if prev is None:
            _prev_alerts[name] = active
            if active:  # Only log if already active on first seen
                rows_to_insert.append((ts, name, 1))
        elif active != prev:
            _prev_alerts[name] = active
            rows_to_insert.append((ts, name, int(active)))

    if not rows_to_insert:
        return
    with _db_lock:
        try:
            conn = _get_conn()
            conn.executemany(
                "INSERT INTO alert_log(ts,alert_name,active) VALUES (?,?,?)",
                rows_to_insert,
            )
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[DB] store_alert_changes error: {e}")


# Outage tracking
_outage_start: float | None = None
_last_connected_ts: float = 0.0


def update_outage(state: str, ts: float):
    global _outage_start, _last_connected_ts
    connected = state == "CONNECTED"
    if connected:
        _last_connected_ts = ts
        if _outage_start is not None:
            # Outage ended
            duration = ts - _outage_start
            with _db_lock:
                try:
                    conn = _get_conn()
                    conn.execute(
                        "UPDATE outages SET end_ts=?,duration_s=? WHERE end_ts IS NULL",
                        (ts, duration),
                    )
                    conn.commit()
                    conn.close()
                except Exception as e:
                    print(f"[DB] update_outage (end) error: {e}")
            _outage_start = None
    else:
        if _outage_start is None and _last_connected_ts > 0:
            gap = ts - _last_connected_ts
            if gap >= OUTAGE_THRESHOLD:
                _outage_start = _last_connected_ts + POLL_INTERVAL
                with _db_lock:
                    try:
                        conn = _get_conn()
                        conn.execute(
                            "INSERT INTO outages(start_ts,cause) VALUES (?,?)",
                            (_outage_start, state),
                        )
                        conn.commit()
                        conn.close()
                    except Exception as e:
                        print(f"[DB] update_outage (start) error: {e}")


def query_history(hours: float = 1.0) -> list[dict]:
    cutoff = time.time() - hours * 3600
    with _db_lock:
        try:
            conn = _get_conn()
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM status_history WHERE ts>? ORDER BY ts ASC",
                (cutoff,),
            ).fetchall()
            conn.close()
            return [dict(r) for r in rows]
        except Exception:
            return []


def query_alert_log(hours: float = 24.0) -> list[dict]:
    cutoff = time.time() - hours * 3600
    with _db_lock:
        try:
            conn = _get_conn()
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM alert_log WHERE ts>? ORDER BY ts DESC LIMIT 200",
                (cutoff,),
            ).fetchall()
            conn.close()
            return [dict(r) for r in rows]
        except Exception:
            return []


def query_outages(hours: float = 24.0) -> list[dict]:
    cutoff = time.time() - hours * 3600
    with _db_lock:
        try:
            conn = _get_conn()
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM outages WHERE start_ts>? ORDER BY start_ts DESC LIMIT 100",
                (cutoff,),
            ).fetchall()
            conn.close()
            return [dict(r) for r in rows]
        except Exception:
            return []


def query_obstruction() -> dict | None:
    with _db_lock:
        try:
            conn = _get_conn()
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT * FROM obstruction_map WHERE id=1").fetchone()
            conn.close()
            if row:
                return {
                    "snr": json.loads(row["snr_json"]),
                    "rows": row["num_rows"],
                    "cols": row["num_cols"],
                    "timestamp": row["ts"],
                }
        except Exception:
            pass
    return None


# ---------------------------------------------------------------------------
# Router SNMP (ERLite3)  — uses pysnmp v7 asyncio API run in a sync wrapper
# ---------------------------------------------------------------------------

try:
    from pysnmp.hlapi.v1arch.asyncio import (
        SnmpDispatcher, CommunityData, UdpTransportTarget,
        get_cmd, next_cmd,
    )
    _snmp_available = True
except ImportError:
    _snmp_available = False
    print("[SNMP] pysnmp not installed — router integration disabled")

_router_iface_map: dict[str, int] = {}
_router_iface_lock = threading.Lock()
_router_prev: dict = {}
_router_ip_cache: dict[int, str] = {}   # ifIndex -> IP address
_router_ip_ts: float = 0                # last time IP cache was refreshed


def _snmp_run(coro):
    """Run an async SNMP coroutine synchronously in a fresh event loop."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _async_snmp_get(oids: list[tuple]) -> dict | None:
    dispatcher = SnmpDispatcher()
    try:
        transport = await UdpTransportTarget.create(
            (ROUTER_TARGET, 161), timeout=3, retries=1
        )
        errorIndication, errorStatus, _, varBinds = await get_cmd(
            dispatcher,
            CommunityData(ROUTER_COMMUNITY, mpModel=0),
            transport,
            *oids,
        )
        if errorIndication or errorStatus:
            print(f"[SNMP] get error: {errorIndication or errorStatus}")
            return None
        return {str(name): int(val) for name, val in varBinds}
    except Exception as e:
        print(f"[SNMP] get exception: {e}")
        return None
    finally:
        dispatcher.transport_dispatcher.close_dispatcher()


async def _async_snmp_walk(base_oid: str) -> dict:
    """Walk an OID subtree using repeated next_cmd calls."""
    results = {}
    dispatcher = SnmpDispatcher()
    try:
        transport = await UdpTransportTarget.create(
            (ROUTER_TARGET, 161), timeout=3, retries=1
        )
        current = (base_oid, None)
        while True:
            errorIndication, errorStatus, _, varBinds = await next_cmd(
                dispatcher,
                CommunityData(ROUTER_COMMUNITY, mpModel=0),
                transport,
                current,
                lexicographic_mode=False,
            )
            if errorIndication or errorStatus or not varBinds:
                break
            name, val = varBinds[0]
            oid_str = str(name)
            if not oid_str.startswith(base_oid):
                break
            results[oid_str] = val
            current = (oid_str, None)
    except Exception as e:
        print(f"[SNMP] walk exception: {e}")
    finally:
        dispatcher.transport_dispatcher.close_dispatcher()
    return results


def _discover_interfaces() -> dict[str, int]:
    rows = _snmp_run(_async_snmp_walk("1.3.6.1.2.1.2.2.1.2"))  # ifDescr
    iface_map = {}
    for oid_str, name in rows.items():
        idx = int(oid_str.split(".")[-1])
        iface_map[str(name)] = idx
    return iface_map


def _refresh_ip_cache(iface_map: dict[str, int]):
    """Walk ipAddrTable to map ifIndex -> IP. Cached for 60s."""
    global _router_ip_cache, _router_ip_ts
    now = time.time()
    if now - _router_ip_ts < 60:
        return
    # Walk ipAdEntIfIndex: OID suffix is the IP, value is ifIndex
    rows = _snmp_run(_async_snmp_walk("1.3.6.1.2.1.4.20.1.2"))
    new_cache: dict[int, str] = {}
    for oid_str, ifidx_val in rows.items():
        # OID = ...ipAdEntIfIndex.a.b.c.d
        parts = oid_str.split(".")
        ip = ".".join(parts[-4:])
        try:
            new_cache[int(ifidx_val)] = ip
        except (ValueError, TypeError):
            pass
    _router_ip_cache = new_cache
    _router_ip_ts = now


def fetch_router_status() -> dict[str, Any]:
    global _router_iface_map, _router_prev

    if not _snmp_available:
        return {"error": "pysnmp not installed", "timestamp": time.time()}

    with _router_iface_lock:
        if not _router_iface_map:
            _router_iface_map = _discover_interfaces()
            print(f"[SNMP] Discovered interfaces: {_router_iface_map}")

    iface_map = _router_iface_map.copy()
    wan1_idx = iface_map.get(ROUTER_WAN_IFACE)   # eth1 Primary
    wan2_idx = iface_map.get(ROUTER_WAN2_IFACE)  # eth2 Failover/Starlink
    lan_idx  = iface_map.get(ROUTER_LAN_IFACE)   # eth0 LAN

    oids: list[tuple] = [
        ("1.3.6.1.4.1.2021.11.11.0", None),  # ssCpuIdle
        ("1.3.6.1.4.1.2021.4.5.0",   None),  # memTotalReal KB
        ("1.3.6.1.4.1.2021.4.6.0",   None),  # memAvailReal KB
        ("1.3.6.1.2.1.1.3.0",        None),  # sysUpTime
        ("1.3.6.1.2.1.4.21.1.2.0.0.0.0", None),  # ipRouteIfIndex default route
    ]

    def _iface_oids(idx):
        return [
            (f"1.3.6.1.2.1.2.2.1.8.{idx}",  None),  # ifOperStatus
            (f"1.3.6.1.2.1.2.2.1.10.{idx}", None),  # ifInOctets
            (f"1.3.6.1.2.1.2.2.1.16.{idx}", None),  # ifOutOctets
            (f"1.3.6.1.2.1.2.2.1.14.{idx}", None),  # ifInErrors
            (f"1.3.6.1.2.1.2.2.1.20.{idx}", None),  # ifOutErrors
        ]

    if wan1_idx: oids += _iface_oids(wan1_idx)
    if wan2_idx: oids += _iface_oids(wan2_idx)
    if lan_idx:  oids += _iface_oids(lan_idx)

    data = _snmp_run(_async_snmp_get(oids))
    if data is None:
        with _router_iface_lock:
            _router_iface_map = {}
        return {"error": "SNMP unreachable", "timestamp": time.time()}

    now = time.time()

    # Refresh IP cache in background (non-blocking if cache is fresh)
    try:
        _refresh_ip_cache(iface_map)
    except Exception:
        pass

    cpu_idle = data.get("1.3.6.1.4.1.2021.11.11.0")
    cpu_pct = (100 - cpu_idle) if cpu_idle is not None else None
    mem_total_kb = data.get("1.3.6.1.4.1.2021.4.5.0")
    mem_avail_kb = data.get("1.3.6.1.4.1.2021.4.6.0")
    mem_total_mb = (mem_total_kb / 1024) if mem_total_kb else None
    mem_used_mb  = ((mem_total_kb - mem_avail_kb) / 1024) if (mem_total_kb and mem_avail_kb) else None
    uptime_raw = data.get("1.3.6.1.2.1.1.3.0")
    uptime_s = (uptime_raw / 100) if uptime_raw else None

    # Interface status
    def _oper(idx): return data.get(f"1.3.6.1.2.1.2.2.1.8.{idx}") == 1 if idx else False
    def _errs(idx): return (
        (data.get(f"1.3.6.1.2.1.2.2.1.14.{idx}") or 0) +
        (data.get(f"1.3.6.1.2.1.2.2.1.20.{idx}") or 0)
    ) if idx else 0

    wan1_up = _oper(wan1_idx)
    wan2_up = _oper(wan2_idx)

    # Active WAN: first check routing table, fall back to ifOperStatus
    route_iface_idx = data.get("1.3.6.1.2.1.4.21.1.2.0.0.0.0")
    if route_iface_idx == wan1_idx:
        active_wan = "wan1"
    elif route_iface_idx == wan2_idx:
        active_wan = "wan2"
    else:
        # Fallback: eth2 is failover-only, so if eth1 is up → primary active
        active_wan = "wan1" if wan1_up else ("wan2" if wan2_up else "none")

    # IPs from cache
    wan1_ip = _router_ip_cache.get(wan1_idx) if wan1_idx else None
    wan2_ip = _router_ip_cache.get(wan2_idx) if wan2_idx else None

    def _ckey(idx, direction):
        sfx = "10" if direction == "in" else "16"
        return f"1.3.6.1.2.1.2.2.1.{sfx}.{idx}"

    def _rate(key):
        cur = data.get(key)
        if cur is None: return None
        prev_ts  = _router_prev.get("ts", 0)
        prev_val = _router_prev.get(key)
        if prev_val is None or prev_ts == 0: return None
        dt = now - prev_ts
        if dt <= 0: return None
        delta = cur - prev_val
        if delta < 0:
            delta += 2 ** 32  # 32-bit counter wrap
        return (delta * 8) / dt

    wan1_in  = _rate(_ckey(wan1_idx, "in"))  if wan1_idx else None
    wan1_out = _rate(_ckey(wan1_idx, "out")) if wan1_idx else None
    wan2_in  = _rate(_ckey(wan2_idx, "in"))  if wan2_idx else None
    wan2_out = _rate(_ckey(wan2_idx, "out")) if wan2_idx else None
    lan_in   = _rate(_ckey(lan_idx,  "in"))  if lan_idx  else None
    lan_out  = _rate(_ckey(lan_idx,  "out")) if lan_idx  else None

    # Save counter snapshot
    new_prev: dict = {"ts": now}
    for idx in filter(None, [wan1_idx, wan2_idx, lan_idx]):
        for d in ("in", "out"):
            k = _ckey(idx, d)
            new_prev[k] = data.get(k)
    _router_prev = new_prev

    return {
        "timestamp": now,
        "error": None,
        "cpu_pct": cpu_pct,
        "mem_used_mb": mem_used_mb,
        "mem_total_mb": mem_total_mb,
        # WAN1 (Primary / ForceBB)
        "wan1_in_bps":  wan1_in,
        "wan1_out_bps": wan1_out,
        "wan1_up":   wan1_up,
        "wan1_ip":   wan1_ip,
        "wan1_iface": ROUTER_WAN_IFACE,
        "wan1_errors": _errs(wan1_idx),
        # WAN2 (Secondary / Starlink failover)
        "wan2_in_bps":  wan2_in,
        "wan2_out_bps": wan2_out,
        "wan2_up":   wan2_up,
        "wan2_ip":   wan2_ip,
        "wan2_iface": ROUTER_WAN2_IFACE,
        "wan2_errors": _errs(wan2_idx),
        # LAN
        "lan_in_bps":  lan_in,
        "lan_out_bps": lan_out,
        "lan_iface": ROUTER_LAN_IFACE,
        # Failover state
        "active_wan": active_wan,   # 'wan1' | 'wan2' | 'none'
        "failover_active": active_wan == "wan2",
        "uptime_s": uptime_s,
    }


def store_router_status(r: dict):
    # Skip if no rate data yet (first poll) or SNMP error
    if r.get("error") or (r.get("wan1_in_bps") is None and r.get("wan2_in_bps") is None):
        return
    with _db_lock:
        try:
            conn = _get_conn()
            conn.execute(
                """INSERT OR REPLACE INTO router_history
                   (ts, cpu_pct, mem_used_mb, mem_total_mb,
                    wan1_in_bps, wan1_out_bps, wan2_in_bps, wan2_out_bps,
                    lan_in_bps, lan_out_bps, uptime_s,
                    active_wan, wan1_up, wan2_up, wan1_ip, wan2_ip)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    r["timestamp"], r.get("cpu_pct"), r.get("mem_used_mb"), r.get("mem_total_mb"),
                    r.get("wan1_in_bps"), r.get("wan1_out_bps"),
                    r.get("wan2_in_bps"), r.get("wan2_out_bps"),
                    r.get("lan_in_bps"),  r.get("lan_out_bps"),
                    r.get("uptime_s"), r.get("active_wan"),
                    1 if r.get("wan1_up") else 0,
                    1 if r.get("wan2_up") else 0,
                    r.get("wan1_ip"), r.get("wan2_ip"),
                ),
            )
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[DB] store_router_status error: {e}")


def query_router_history(hours: float = 1.0) -> list[dict]:
    cutoff = time.time() - hours * 3600
    with _db_lock:
        try:
            conn = _get_conn()
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM router_history WHERE ts>? ORDER BY ts ASC",
                (cutoff,),
            ).fetchall()
            conn.close()
            return [dict(r) for r in rows]
        except Exception:
            return []


# ---------------------------------------------------------------------------
# gRPC fetchers (reused channel)
# ---------------------------------------------------------------------------

_grpc_context: starlink_grpc.ChannelContext | None = None
_grpc_lock = threading.Lock()


def _get_context() -> starlink_grpc.ChannelContext:
    global _grpc_context
    with _grpc_lock:
        if _grpc_context is None:
            _grpc_context = starlink_grpc.ChannelContext(target=STARLINK_TARGET)
        return _grpc_context


def _reset_context():
    global _grpc_context
    with _grpc_lock:
        if _grpc_context is not None:
            try:
                _grpc_context.close()
            except Exception:
                pass
            _grpc_context = None


def fetch_status() -> dict[str, Any]:
    try:
        ctx = _get_context()
        header, body, alerts = starlink_grpc.status_data(ctx)
        return {
            "header": header or {},
            "body": body or {},
            "alerts": alerts or {},
            "timestamp": time.time(),
            "error": None,
        }
    except Exception as e:
        _reset_context()
        return {"header": {}, "body": {}, "alerts": {}, "timestamp": time.time(), "error": str(e)}


def fetch_history_bulk() -> dict[str, Any]:
    try:
        ctx = _get_context()
        result = starlink_grpc.history_bulk_data(parse_samples=900, context=ctx)
        if result is None:
            return {"error": "No history data"}
        general, bulk = result
        out: dict[str, Any] = {"general": general or {}, "error": None}
        if bulk:
            for key, values in bulk.items():
                out[key] = list(values) if isinstance(values, (list, tuple)) else values
        return out
    except Exception as e:
        _reset_context()
        return {"error": str(e)}


def fetch_obstruction_map() -> dict[str, Any]:
    try:
        ctx = _get_context()
        result = starlink_grpc.obstruction_map(ctx)
        if result is None:
            return {"error": "No obstruction data"}
        rows = len(result)
        cols = len(result[0]) if rows > 0 else 0
        flat = [v for row in result for v in row]
        return {"snr": flat, "rows": rows, "cols": cols, "error": None}
    except Exception as e:
        _reset_context()
        return {"error": str(e)}


# ---------------------------------------------------------------------------
# Background poll thread
# ---------------------------------------------------------------------------

_broadcast_queue: asyncio.Queue | None = None


def _poll_thread():
    global latest_status
    tick = 0
    while True:
        t0 = time.time()
        status = fetch_status()
        latest_status = status

        if not status.get("error"):
            store_status(status)
            store_alert_changes(status.get("alerts", {}), status["timestamp"])
            update_outage(status.get("header", {}).get("state", ""), status["timestamp"])

        if _broadcast_queue is not None:
            try:
                _broadcast_queue.put_nowait(status)
            except Exception:
                pass

        tick += 1
        if tick >= 10:
            tick = 0
            hist = fetch_history_bulk()
            if not hist.get("error"):
                store_history_snapshot(hist)
            obs = fetch_obstruction_map()
            if not obs.get("error"):
                store_obstruction(obs)

        time.sleep(max(0, POLL_INTERVAL - (time.time() - t0)))


# ---------------------------------------------------------------------------
# Speedtest Tracker integration
# ---------------------------------------------------------------------------

import urllib.request
import urllib.error
from datetime import datetime, timezone


def _safe_float(v) -> float | None:
    try:
        return float(v) if v is not None else None
    except (ValueError, TypeError):
        return None


def _speedtest_api_get(path: str) -> dict | None:
    if not SPEEDTEST_URL or not SPEEDTEST_API_TOKEN:
        return None
    url = f"{SPEEDTEST_URL}/api/v1{path}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {SPEEDTEST_API_TOKEN}",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"[Speedtest] API error: {e}")
        return None


def _parse_speedtest_result(r: dict) -> dict | None:
    """Normalize a raw API result object into our storage format."""
    if r.get("status") != "completed":
        return None
    try:
        # created_at is local server time, no tz — parse as-is then store
        ts = datetime.fromisoformat(r["created_at"].replace(" ", "T")).replace(
            tzinfo=timezone.utc
        ).timestamp()
    except Exception:
        return None

    nested = r.get("data") or {}
    ping_nested = nested.get("ping") or {}
    return {
        "id":              r["id"],
        "ts":              ts,
        "ping_ms":         _safe_float(r.get("ping")),
        "jitter_ms":       _safe_float(ping_nested.get("jitter")),
        "download_mbps":   (r.get("download_bits") or 0) / 1_000_000,
        "upload_mbps":     (r.get("upload_bits")   or 0) / 1_000_000,
        "isp":             nested.get("isp"),
        "server_name":     (nested.get("server") or {}).get("name"),
        "server_location": (nested.get("server") or {}).get("location"),
        "result_url":      (nested.get("result") or {}).get("url"),
        "scheduled":       1 if r.get("scheduled") else 0,
    }


def sync_speedtest_results(backfill: bool = False):
    """Fetch results from speedtest-tracker and INSERT OR IGNORE into local DB."""
    if not SPEEDTEST_URL or not SPEEDTEST_API_TOKEN:
        return

    pages = range(1, 8) if backfill else range(1, 2)  # up to 7 pages on backfill
    inserted = 0

    for page in pages:
        resp = _speedtest_api_get(f"/results?page%5Bnumber%5D={page}")
        if not resp or "data" not in resp:
            break
        items = resp["data"]
        if not items:
            break

        with _db_lock:
            conn = _get_conn()
            for raw in items:
                parsed = _parse_speedtest_result(raw)
                if not parsed:
                    continue
                cur = conn.execute(
                    "INSERT OR IGNORE INTO speedtest_results "
                    "(id,ts,ping_ms,jitter_ms,download_mbps,upload_mbps,"
                    " isp,server_name,server_location,result_url,scheduled) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (parsed["id"], parsed["ts"], parsed["ping_ms"], parsed["jitter_ms"],
                     parsed["download_mbps"], parsed["upload_mbps"], parsed["isp"],
                     parsed["server_name"], parsed["server_location"],
                     parsed["result_url"], parsed["scheduled"]),
                )
                inserted += cur.rowcount
            conn.commit()
            conn.close()

        # Stop early pages if we stopped inserting new rows (already synced)
        if not backfill and inserted == 0:
            break

    if inserted:
        print(f"[Speedtest] Synced {inserted} new result(s)")


def query_speedtest_history(hours: float = 24.0) -> list[dict]:
    cutoff = time.time() - hours * 3600
    with _db_lock:
        try:
            conn = _get_conn()
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM speedtest_results WHERE ts>? ORDER BY ts ASC",
                (cutoff,),
            ).fetchall()
            conn.close()
            return [dict(r) for r in rows]
        except Exception:
            return []


def query_speedtest_latest() -> dict | None:
    with _db_lock:
        try:
            conn = _get_conn()
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM speedtest_results ORDER BY ts DESC LIMIT 1"
            ).fetchone()
            conn.close()
            return dict(row) if row else None
        except Exception:
            return None


# ---------------------------------------------------------------------------
# Data retention cleanup
# ---------------------------------------------------------------------------

def run_retention_cleanup():
    now = time.time()
    with _db_lock:
        try:
            conn = _get_conn()
            conn.execute("DELETE FROM status_history WHERE ts < ?",
                         (now - RETENTION_STARLINK_DAYS * 86400,))
            conn.execute("DELETE FROM alert_log WHERE ts < ?",
                         (now - RETENTION_STARLINK_DAYS * 86400,))
            conn.execute("DELETE FROM outages WHERE start_ts < ?",
                         (now - RETENTION_STARLINK_DAYS * 86400,))
            conn.execute("DELETE FROM router_history WHERE ts < ?",
                         (now - RETENTION_ROUTER_DAYS * 86400,))
            conn.execute("DELETE FROM speedtest_results WHERE ts < ?",
                         (now - RETENTION_SPEEDTEST_DAYS * 86400,))
            conn.commit()
            conn.close()
            print("[Retention] Cleanup complete")
        except Exception as e:
            print(f"[Retention] Cleanup error: {e}")


# ---------------------------------------------------------------------------
# Uptime Kuma — Prometheus /metrics scraper
# ---------------------------------------------------------------------------

def _fetch_uk_metrics() -> str | None:
    """Fetch the raw Prometheus metrics text from Uptime Kuma."""
    if not UPTIME_KUMA_URL or not UPTIME_KUMA_API_KEY:
        return None
    import urllib.request, base64
    url = f"{UPTIME_KUMA_URL}/metrics"
    creds = base64.b64encode(f"admin:{UPTIME_KUMA_API_KEY}".encode()).decode()
    req = urllib.request.Request(url, headers={"Authorization": f"Basic {creds}"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.read().decode("utf-8")
    except Exception as e:
        print(f"[UptimeKuma] Metrics fetch error: {e}")
        return None


def _parse_uk_metrics(text: str) -> list[dict]:
    """Parse Prometheus text format into a list of monitor dicts."""
    import re
    metric_re = re.compile(r'^(\w+)\{([^}]*)\}\s+([\d.eE+\-]+)', re.MULTILINE)
    label_re  = re.compile(r'(\w+)="([^"]*)"')

    raw: dict[str, dict] = {}  # keyed by monitor_name

    for m in metric_re.finditer(text):
        metric_name = m.group(1)
        if not metric_name.startswith("monitor_"):
            continue
        labels = dict(label_re.findall(m.group(2)))
        value  = float(m.group(3))
        name   = labels.get("monitor_name", "")
        mtype  = labels.get("monitor_type", "")

        if mtype == "group" or not name:
            continue

        if name not in raw:
            raw[name] = {
                "name":             name,
                "type":             mtype,
                "url":              labels.get("monitor_url", ""),
                "hostname":         labels.get("monitor_hostname", ""),
                "port":             labels.get("monitor_port", ""),
                "status":           None,
                "response_time_ms": None,
                "cert_days":        None,
                "cert_valid":       None,
            }

        if metric_name == "monitor_status":
            raw[name]["status"] = int(value)
        elif metric_name == "monitor_response_time" and value >= 0:
            raw[name]["response_time_ms"] = value
        elif metric_name == "monitor_cert_days_remaining":
            raw[name]["cert_days"] = int(value)
        elif metric_name == "monitor_cert_is_valid":
            raw[name]["cert_valid"] = (int(value) == 1)

    return list(raw.values())


def _uptime_kuma_poll_thread():
    global latest_uptime_monitors
    while True:
        t0 = time.time()
        try:
            text = _fetch_uk_metrics()
            if text:
                monitors = _parse_uk_metrics(text)
                latest_uptime_monitors = monitors
        except Exception as e:
            print(f"[UptimeKuma] Poll error: {e}")
        time.sleep(max(0, UPTIME_KUMA_POLL_INTERVAL - (time.time() - t0)))


def _speedtest_poll_thread():
    # Backfill on first run if DB is empty
    with _db_lock:
        try:
            conn = _get_conn()
            count = conn.execute("SELECT COUNT(*) FROM speedtest_results").fetchone()[0]
            conn.close()
        except Exception:
            count = 0
    if count == 0:
        print("[Speedtest] Empty DB — backfilling up to 7 pages of history…")
        sync_speedtest_results(backfill=True)

    _cleanup_tick = 0
    while True:
        t0 = time.time()
        sync_speedtest_results()
        _cleanup_tick += 1
        if _cleanup_tick >= 12:   # run retention cleanup every ~hour (12 × 5 min)
            _cleanup_tick = 0
            run_retention_cleanup()
        time.sleep(max(0, SPEEDTEST_POLL_INTERVAL - (time.time() - t0)))


def _router_poll_thread():
    global latest_router
    while True:
        t0 = time.time()
        r = fetch_router_status()
        latest_router = r
        if not r.get("error"):
            store_router_status(r)
        time.sleep(max(0, ROUTER_POLL_INTERVAL - (time.time() - t0)))


async def _broadcast_loop():
    while True:
        status = await _broadcast_queue.get()
        msg = json.dumps({"type": "status", "data": status}, default=str)
        stale = set()
        for ws in connected_clients:
            try:
                await ws.send_text(msg)
            except Exception:
                stale.add(ws)
        connected_clients -= stale


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _broadcast_queue
    init_db()
    _broadcast_queue = asyncio.Queue()
    threading.Thread(target=_poll_thread, daemon=True).start()
    threading.Thread(target=_router_poll_thread, daemon=True).start()
    threading.Thread(target=_speedtest_poll_thread, daemon=True).start()
    threading.Thread(target=_uptime_kuma_poll_thread, daemon=True).start()
    broadcast_task = asyncio.create_task(_broadcast_loop())
    yield
    broadcast_task.cancel()


app = FastAPI(title="StarlinkDash API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/status")
async def get_status():
    return latest_status


@app.get("/api/history")
async def get_history(hours: float = 1.0):
    hours = min(max(hours, 0.05), 24.0)
    loop = asyncio.get_event_loop()
    rows = await loop.run_in_executor(None, query_history, hours)
    return {"rows": rows, "count": len(rows)}


@app.get("/api/history/bulk")
async def get_history_bulk():
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fetch_history_bulk)


@app.get("/api/obstruction")
async def get_obstruction():
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, query_obstruction)
    if data:
        return data
    return await loop.run_in_executor(None, fetch_obstruction_map)


@app.get("/api/alerts")
async def get_alerts(hours: float = 24.0):
    hours = min(max(hours, 1.0), 168.0)
    loop = asyncio.get_event_loop()
    rows = await loop.run_in_executor(None, query_alert_log, hours)
    active = {k: v for k, v in latest_status.get("alerts", {}).items() if v is True}
    return {"events": rows, "active": active}


@app.get("/api/outages")
async def get_outages(hours: float = 24.0):
    hours = min(max(hours, 1.0), 168.0)
    loop = asyncio.get_event_loop()
    rows = await loop.run_in_executor(None, query_outages, hours)
    return {"outages": rows, "current": _outage_start is not None}


@app.get("/api/router/status")
async def get_router_status():
    return latest_router


@app.get("/api/router/history")
async def get_router_history(hours: float = 1.0):
    hours = min(max(hours, 0.05), 24.0)
    loop = asyncio.get_event_loop()
    rows = await loop.run_in_executor(None, query_router_history, hours)
    return {"rows": rows, "count": len(rows)}


@app.get("/api/speedtest/latest")
async def get_speedtest_latest():
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, query_speedtest_latest)
    return result or {}


@app.get("/api/speedtest/history")
async def get_speedtest_history(hours: float = 168.0):  # default 7 days
    hours = min(max(hours, 1.0), 8760.0)  # 1h – 1yr
    loop = asyncio.get_event_loop()
    rows = await loop.run_in_executor(None, query_speedtest_history, hours)
    return {"rows": rows, "count": len(rows)}


@app.get("/api/uptime")
async def get_uptime():
    return {"monitors": latest_uptime_monitors}


@app.get("/api/config")
async def get_config():
    """Expose non-secret runtime configuration for the UI."""
    return {
        "starlink_poll_interval": POLL_INTERVAL,
        "router_poll_interval": ROUTER_POLL_INTERVAL,
        "speedtest_poll_interval": SPEEDTEST_POLL_INTERVAL,
        "retention_starlink_days": RETENTION_STARLINK_DAYS,
        "retention_router_days": RETENTION_ROUTER_DAYS,
        "retention_speedtest_days": RETENTION_SPEEDTEST_DAYS,
        "speedtest_enabled": bool(SPEEDTEST_URL and SPEEDTEST_API_TOKEN),
        "router_enabled": bool(ROUTER_TARGET),
        "uptime_kuma_enabled": bool(UPTIME_KUMA_URL and UPTIME_KUMA_API_KEY),
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)
    try:
        if latest_status:
            await websocket.send_text(
                json.dumps({"type": "status", "data": latest_status}, default=str)
            )
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        connected_clients.discard(websocket)


if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        p = STATIC_DIR / full_path
        return FileResponse(p if p.is_file() else STATIC_DIR / "index.html")
