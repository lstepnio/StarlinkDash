import asyncio
import hashlib
import json
import logging
import os
import re
import sqlite3
import threading
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import starlink_grpc
try:
    from backend.stream_health import normalize_tautulli_session, summarize_stream_health
except ModuleNotFoundError:  # Container runtime copies modules into /app without the backend package path.
    from stream_health import normalize_tautulli_session, summarize_stream_health

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("starlinkdash")

CONFIG_ERRORS: list[str] = []
startup_time = time.time()


def _env_int(name: str, default: int, *, min_value: int | None = None, max_value: int | None = None) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        value = default
    else:
        try:
            value = int(raw)
        except ValueError:
            CONFIG_ERRORS.append(f"{name} must be an integer")
            return default
    if min_value is not None and value < min_value:
        CONFIG_ERRORS.append(f"{name} must be >= {min_value}")
        return default
    if max_value is not None and value > max_value:
        CONFIG_ERRORS.append(f"{name} must be <= {max_value}")
        return default
    return value


def _env_float(name: str, default: float, *, min_value: float | None = None, max_value: float | None = None) -> float:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        value = default
    else:
        try:
            value = float(raw)
        except ValueError:
            CONFIG_ERRORS.append(f"{name} must be a number")
            return default
    if min_value is not None and value < min_value:
        CONFIG_ERRORS.append(f"{name} must be >= {min_value}")
        return default
    if max_value is not None and value > max_value:
        CONFIG_ERRORS.append(f"{name} must be <= {max_value}")
        return default
    return value


def _env_path(name: str, default: str) -> str:
    raw = os.environ.get(name, default).strip()
    if not raw:
        CONFIG_ERRORS.append(f"{name} must not be empty")
        return default
    return raw


def _parse_cors_origins() -> list[str]:
    raw = os.environ.get(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5199,http://127.0.0.1:5199",
    ).strip()
    if not raw:
        return []
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def _origin_allowed(origin: str | None, host: str | None) -> bool:
    if not origin:
        return True
    if origin in CORS_ALLOWED_ORIGINS:
        return True
    if host:
        for scheme in ("http", "https"):
            if origin == f"{scheme}://{host}":
                return True
    return False

STATIC_DIR = Path(os.environ.get("STATIC_DIR", "../frontend/dist"))
STARLINK_TARGET = os.environ.get("STARLINK_TARGET", "192.168.100.1:9200")
DB_PATH = _env_path("DB_PATH", "/data/starlinkdash.db")
POLL_INTERVAL = _env_int("STARLINK_POLL_INTERVAL", 10, min_value=5, max_value=300)
OUTAGE_THRESHOLD = 15  # seconds before declaring an outage

# Router (ERLite3) SNMP settings
ROUTER_TARGET = os.environ.get("ROUTER_TARGET", "")
ROUTER_COMMUNITY = os.environ.get("ROUTER_COMMUNITY", "")
ROUTER_LAN_IFACE = os.environ.get("ROUTER_LAN_IFACE", "eth0")
ROUTER_WAN_IFACE = os.environ.get("ROUTER_WAN_IFACE", "eth1")
ROUTER_WAN2_IFACE = os.environ.get("ROUTER_WAN2_IFACE", "eth2")
ROUTER_POLL_INTERVAL = _env_int("ROUTER_POLL_INTERVAL", 30, min_value=10, max_value=600)

# Speedtest Tracker integration
SPEEDTEST_URL = os.environ.get("SPEEDTEST_URL", "").rstrip("/")
SPEEDTEST_API_TOKEN = os.environ.get("SPEEDTEST_API_TOKEN", "")
SPEEDTEST_POLL_INTERVAL = _env_int("SPEEDTEST_POLL_INTERVAL", 300, min_value=60, max_value=86400)  # 5 min

# Uptime Kuma integration
UPTIME_KUMA_URL = os.environ.get("UPTIME_KUMA_URL", "").rstrip("/")
UPTIME_KUMA_API_KEY = os.environ.get("UPTIME_KUMA_API_KEY", "")
UPTIME_KUMA_POLL_INTERVAL = _env_int("UPTIME_KUMA_POLL_INTERVAL", 60, min_value=15, max_value=3600)

# Tautulli (Plex monitoring) integration
TAUTULLI_URL = os.environ.get("TAUTULLI_URL", "").rstrip("/")
TAUTULLI_API_KEY = os.environ.get("TAUTULLI_API_KEY", "")
TAUTULLI_POLL_INTERVAL = _env_int("TAUTULLI_POLL_INTERVAL", 30, min_value=15, max_value=3600)

# AI assistant integration
AI_PROVIDER = os.environ.get("AI_PROVIDER", "openai").strip() or "openai"
AI_BASE_URL = os.environ.get("AI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
AI_MODEL = os.environ.get("AI_MODEL", "").strip()
AI_API_KEY = os.environ.get("AI_API_KEY", "").strip()
AI_TIMEOUT_S = _env_int("AI_TIMEOUT_S", 20, min_value=5, max_value=120)
AI_TEMPERATURE = _env_float("AI_TEMPERATURE", 0.2, min_value=0.0, max_value=1.0)
AI_MAX_OUTPUT_TOKENS = _env_int("AI_MAX_OUTPUT_TOKENS", 220, min_value=64, max_value=2048)
AI_MAX_PROMPT_CHARS = _env_int("AI_MAX_PROMPT_CHARS", 300, min_value=40, max_value=2000)
AI_CACHE_TTL_S = _env_int("AI_CACHE_TTL_S", 120, min_value=10, max_value=3600)
AI_RATE_LIMIT_REQUESTS = _env_int("AI_RATE_LIMIT_REQUESTS", 6, min_value=1, max_value=100)
AI_RATE_LIMIT_WINDOW_S = _env_int("AI_RATE_LIMIT_WINDOW_S", 300, min_value=10, max_value=3600)
AI_DAILY_REQUEST_LIMIT = _env_int("AI_DAILY_REQUEST_LIMIT", 100, min_value=1, max_value=10000)
AI_DAILY_TOKEN_BUDGET = _env_int("AI_DAILY_TOKEN_BUDGET", 50000, min_value=500, max_value=5000000)
AI_SUGGESTED_PROMPTS = [
    "What changed recently?",
    "Why is performance poor?",
    "Summarize the last 24 hours",
]

# Data retention
RETENTION_STARLINK_DAYS = _env_int("RETENTION_STARLINK_DAYS", 30, min_value=1, max_value=3650)
RETENTION_ROUTER_DAYS   = _env_int("RETENTION_ROUTER_DAYS",   30, min_value=1, max_value=3650)
RETENTION_SPEEDTEST_DAYS = _env_int("RETENTION_SPEEDTEST_DAYS", 365, min_value=1, max_value=3650)
CORS_ALLOWED_ORIGINS = _parse_cors_origins()

latest_status: dict[str, Any] = {}
latest_router: dict[str, Any] = {}
latest_uptime_monitors: list[dict] = []
latest_tautulli: dict[str, Any] = {}
latest_tautulli_error: str | None = None
connected_clients: set[WebSocket] = set()
service_status: dict[str, dict[str, Any]] = {
    "starlink": {"enabled": True, "healthy": False, "last_ok": None, "last_error": None},
    "router": {"enabled": bool(ROUTER_TARGET and ROUTER_COMMUNITY), "healthy": False, "last_ok": None, "last_error": None},
    "speedtest": {"enabled": bool(SPEEDTEST_URL and SPEEDTEST_API_TOKEN), "healthy": False, "last_ok": None, "last_error": None},
    "uptime_kuma": {"enabled": bool(UPTIME_KUMA_URL and UPTIME_KUMA_API_KEY), "healthy": False, "last_ok": None, "last_error": None},
    "tautulli": {"enabled": bool(TAUTULLI_URL and TAUTULLI_API_KEY), "healthy": False, "last_ok": None, "last_error": None},
    "ai": {"enabled": bool(AI_API_KEY and AI_MODEL), "healthy": False, "last_ok": None, "last_error": None},
}

_ai_lock = threading.Lock()
_ai_rate_limit: dict[str, list[float]] = {}
_ai_cache: dict[str, dict[str, Any]] = {}
_ai_usage_day = time.strftime("%Y-%m-%d", time.gmtime())
_ai_usage_requests = 0
_ai_usage_tokens = 0

# Failover state tracking
_last_active_wan: str | None = None
_failover_start_ts: float | None = None

# ---------------------------------------------------------------------------
# SQLite
# ---------------------------------------------------------------------------

_db_lock = threading.Lock()


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _record_service_ok(name: str):
    service_status[name]["healthy"] = True
    service_status[name]["last_ok"] = time.time()
    service_status[name]["last_error"] = None


def _record_service_error(name: str, message: str):
    service_status[name]["healthy"] = False
    service_status[name]["last_error"] = message


def _public_error(message: str, *, code: str) -> dict[str, str]:
    return {"code": code, "message": message}


def _health_report() -> dict[str, Any]:
    return {
        "status": "ok" if not CONFIG_ERRORS else "degraded",
        "uptime_s": round(time.time() - startup_time, 1),
        "config_errors": CONFIG_ERRORS,
        "services": service_status,
    }


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

    # Failover events log
    conn.execute("""
        CREATE TABLE IF NOT EXISTS failover_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            start_ts    REAL NOT NULL,
            end_ts      REAL,
            duration_s  REAL,
            from_wan    TEXT,
            to_wan      TEXT
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_failover_start ON failover_events(start_ts)")

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
_router_hc_support: dict[int, bool] = {}


def _snmp_run(coro):
    """Run an async SNMP coroutine synchronously in a fresh event loop."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _async_snmp_get(oids: list[tuple]) -> dict | None:
    def _hc_idx_for_oid(oid_str: str) -> int | None:
        prefixes = (
            "1.3.6.1.2.1.31.1.1.1.6.",
            "1.3.6.1.2.1.31.1.1.1.10.",
        )
        for prefix in prefixes:
            if oid_str.startswith(prefix):
                try:
                    return int(oid_str[len(prefix):])
                except ValueError:
                    return None
        return None
    async def _read_single(dispatcher, transport, oid: tuple):
        errorIndication, errorStatus, _, varBinds = await get_cmd(
            dispatcher,
            CommunityData(ROUTER_COMMUNITY, mpModel=0),
            transport,
            oid,
        )
        if errorIndication:
            raise RuntimeError(str(errorIndication))
        if errorStatus or not varBinds:
            return oid[0], None, False
        name, val = varBinds[0]
        try:
            return str(name), int(val), True
        except (ValueError, TypeError):
            return str(name), None, True

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
        if errorIndication:
            print(f"[SNMP] get error: {errorIndication}")
            return None
        if errorStatus:
            # SNMPv1 returns noSuchName for the whole GET if any requested OID is unsupported.
            # Fall back to one-by-one GETs so older agents can still return partial data.
            print(f"[SNMP] batched get fallback after error: {errorStatus}")
            out = {}
            for oid in oids:
                try:
                    item = await _read_single(dispatcher, transport, oid)
                except Exception as e:
                    print(f"[SNMP] single get exception for {oid[0]}: {e}")
                    continue
                name, value, found = item
                hc_idx = _hc_idx_for_oid(name)
                if hc_idx is not None:
                    _router_hc_support[hc_idx] = found
                if not found:
                    continue
                out[name] = value
            return out or None
        out = {}
        for name, val in varBinds:
            try:
                out[str(name)] = int(val)
            except (ValueError, TypeError):
                out[str(name)] = None
        return out
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

    if not ROUTER_TARGET or not ROUTER_COMMUNITY:
        msg = "Router SNMP is not configured. Set ROUTER_TARGET and ROUTER_COMMUNITY."
        _record_service_error("router", msg)
        return {"error": msg, "timestamp": time.time()}

    if not _snmp_available:
        msg = "Router SNMP support is unavailable because pysnmp is not installed."
        _record_service_error("router", msg)
        return {"error": msg, "timestamp": time.time()}

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
        oids = [
            (f"1.3.6.1.2.1.2.2.1.7.{idx}",  None),  # ifAdminStatus
            (f"1.3.6.1.2.1.2.2.1.8.{idx}",  None),  # ifOperStatus
            (f"1.3.6.1.2.1.2.2.1.5.{idx}",  None),  # ifSpeed
            (f"1.3.6.1.2.1.31.1.1.1.15.{idx}", None),  # ifHighSpeed Mbps
            (f"1.3.6.1.2.1.2.2.1.9.{idx}",  None),  # ifLastChange
            (f"1.3.6.1.2.1.2.2.1.10.{idx}", None),  # ifInOctets
            (f"1.3.6.1.2.1.2.2.1.16.{idx}", None),  # ifOutOctets
            (f"1.3.6.1.2.1.2.2.1.14.{idx}", None),  # ifInErrors
            (f"1.3.6.1.2.1.2.2.1.20.{idx}", None),  # ifOutErrors
            (f"1.3.6.1.2.1.2.2.1.13.{idx}", None),  # ifInDiscards
            (f"1.3.6.1.2.1.2.2.1.19.{idx}", None),  # ifOutDiscards
        ]
        if _router_hc_support.get(idx, True):
            oids += [
                (f"1.3.6.1.2.1.31.1.1.1.6.{idx}", None),   # ifHCInOctets
                (f"1.3.6.1.2.1.31.1.1.1.10.{idx}", None),  # ifHCOutOctets
            ]
        return oids

    if wan1_idx: oids += _iface_oids(wan1_idx)
    if wan2_idx: oids += _iface_oids(wan2_idx)
    if lan_idx:  oids += _iface_oids(lan_idx)

    data = _snmp_run(_async_snmp_get(oids))
    if data is None:
        with _router_iface_lock:
            _router_iface_map = {}
        msg = "Router SNMP query failed. Check reachability, community string, and SNMP enablement."
        _record_service_error("router", msg)
        return {"error": msg, "timestamp": time.time()}

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
    def _admin(idx): return data.get(f"1.3.6.1.2.1.2.2.1.7.{idx}") if idx else None
    def _oper(idx): return data.get(f"1.3.6.1.2.1.2.2.1.8.{idx}") == 1 if idx else False
    def _errs(idx): return (
        (data.get(f"1.3.6.1.2.1.2.2.1.14.{idx}") or 0) +
        (data.get(f"1.3.6.1.2.1.2.2.1.20.{idx}") or 0)
    ) if idx else 0
    def _discards(idx): return (
        (data.get(f"1.3.6.1.2.1.2.2.1.13.{idx}") or 0) +
        (data.get(f"1.3.6.1.2.1.2.2.1.19.{idx}") or 0)
    ) if idx else 0
    def _speed_mbps(idx):
        if not idx:
            return None
        hi = data.get(f"1.3.6.1.2.1.31.1.1.1.15.{idx}")
        if hi:
            return hi
        speed = data.get(f"1.3.6.1.2.1.2.2.1.5.{idx}")
        return round(speed / 1_000_000) if speed else None
    def _last_change_age_s(idx):
        if not idx or not uptime_raw:
            return None
        last_change = data.get(f"1.3.6.1.2.1.2.2.1.9.{idx}")
        if not last_change:
            return None
        return max(0, (uptime_raw - last_change) / 100)

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

    def _counter_keys(idx, direction):
        if direction == "in":
            return (
                f"1.3.6.1.2.1.31.1.1.1.6.{idx}",
                f"1.3.6.1.2.1.2.2.1.10.{idx}",
            )
        return (
            f"1.3.6.1.2.1.31.1.1.1.10.{idx}",
            f"1.3.6.1.2.1.2.2.1.16.{idx}",
        )

    def _rate(keys):
        primary_key, fallback_key = keys
        cur = data.get(primary_key)
        key = primary_key
        bits = 64
        if cur is None:
            cur = data.get(fallback_key)
            key = fallback_key
            bits = 32
        cur = data.get(key)
        if cur is None:
            return None
        prev_ts  = _router_prev.get("ts", 0)
        prev_val = _router_prev.get(key)
        if prev_val is None or prev_ts == 0:
            return None
        dt = now - prev_ts
        if dt <= 0:
            return None
        delta = cur - prev_val
        if delta < 0:
            delta += 2 ** bits
        return (delta * 8) / dt

    wan1_in  = _rate(_counter_keys(wan1_idx, "in"))  if wan1_idx else None
    wan1_out = _rate(_counter_keys(wan1_idx, "out")) if wan1_idx else None
    wan2_in  = _rate(_counter_keys(wan2_idx, "in"))  if wan2_idx else None
    wan2_out = _rate(_counter_keys(wan2_idx, "out")) if wan2_idx else None
    lan_in   = _rate(_counter_keys(lan_idx,  "in"))  if lan_idx  else None
    lan_out  = _rate(_counter_keys(lan_idx,  "out")) if lan_idx  else None

    # Save counter snapshot
    new_prev: dict = {"ts": now}
    for idx in filter(None, [wan1_idx, wan2_idx, lan_idx]):
        for d in ("in", "out"):
            primary_key, fallback_key = _counter_keys(idx, d)
            if data.get(primary_key) is not None:
                new_prev[primary_key] = data.get(primary_key)
            elif data.get(fallback_key) is not None:
                new_prev[fallback_key] = data.get(fallback_key)
    _router_prev = new_prev
    _record_service_ok("router")

    return {
        "timestamp": now,
        "error": None,
        "cpu_pct": cpu_pct,
        "mem_used_mb": mem_used_mb,
        "mem_total_mb": mem_total_mb,
        # WAN1 (primary uplink)
        "wan1_in_bps":  wan1_in,
        "wan1_out_bps": wan1_out,
        "wan1_up":   wan1_up,
        "wan1_admin_up": _admin(wan1_idx) == 1 if wan1_idx else None,
        "wan1_ip":   wan1_ip,
        "wan1_iface": ROUTER_WAN_IFACE,
        "wan1_errors": _errs(wan1_idx),
        "wan1_discards": _discards(wan1_idx),
        "wan1_speed_mbps": _speed_mbps(wan1_idx),
        "wan1_last_change_s": _last_change_age_s(wan1_idx),
        # WAN2 (secondary / failover uplink)
        "wan2_in_bps":  wan2_in,
        "wan2_out_bps": wan2_out,
        "wan2_up":   wan2_up,
        "wan2_admin_up": _admin(wan2_idx) == 1 if wan2_idx else None,
        "wan2_ip":   wan2_ip,
        "wan2_iface": ROUTER_WAN2_IFACE,
        "wan2_errors": _errs(wan2_idx),
        "wan2_discards": _discards(wan2_idx),
        "wan2_speed_mbps": _speed_mbps(wan2_idx),
        "wan2_last_change_s": _last_change_age_s(wan2_idx),
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
# Failover event tracking
# ---------------------------------------------------------------------------

def _track_failover(active_wan: str):
    """Track WAN failover state transitions."""
    global _last_active_wan, _failover_start_ts

    if _last_active_wan is None:
        # First poll — just record current state, don't create an event
        _last_active_wan = active_wan
        if active_wan == "wan2":
            _failover_start_ts = time.time()
        return

    if active_wan == _last_active_wan:
        return  # No change

    now = time.time()

    if active_wan == "wan2" and _last_active_wan != "wan2":
        # Failover started: primary → failover
        _failover_start_ts = now
        with _db_lock:
            try:
                conn = _get_conn()
                conn.execute(
                    "INSERT INTO failover_events (start_ts, from_wan, to_wan) VALUES (?,?,?)",
                    (now, _last_active_wan, active_wan),
                )
                conn.commit()
                conn.close()
            except Exception as e:
                print(f"[Failover] Insert error: {e}")
        print(f"[Failover] STARTED — switched from {_last_active_wan} to {active_wan}")

    elif _last_active_wan == "wan2" and active_wan != "wan2":
        # Failover ended: failover → primary
        duration = now - _failover_start_ts if _failover_start_ts else None
        with _db_lock:
            try:
                conn = _get_conn()
                conn.execute(
                    "UPDATE failover_events SET end_ts=?, duration_s=? "
                    "WHERE end_ts IS NULL ORDER BY start_ts DESC LIMIT 1",
                    (now, duration),
                )
                conn.commit()
                conn.close()
            except Exception as e:
                print(f"[Failover] Update error: {e}")
        dur_str = f" ({duration:.0f}s)" if duration else ""
        print(f"[Failover] ENDED — back to {active_wan}{dur_str}")
        _failover_start_ts = None

    _last_active_wan = active_wan


def query_failover_events(hours: float = 168.0) -> list[dict]:
    cutoff = time.time() - hours * 3600
    with _db_lock:
        try:
            conn = _get_conn()
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM failover_events WHERE start_ts>? ORDER BY start_ts DESC",
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
        _record_service_ok("starlink")
        return {
            "header": header or {},
            "body": body or {},
            "alerts": alerts or {},
            "timestamp": time.time(),
            "error": None,
        }
    except Exception as e:
        log.warning("Starlink status fetch failed: %s", e)
        _reset_context()
        msg = "Unable to reach the Starlink dish. Check STARLINK_TARGET and local network connectivity."
        _record_service_error("starlink", msg)
        return {"header": {}, "body": {}, "alerts": {}, "timestamp": time.time(), "error": msg}


def fetch_history_bulk() -> dict[str, Any]:
    try:
        ctx = _get_context()
        result = starlink_grpc.history_bulk_data(parse_samples=900, context=ctx)
        if result is None:
            msg = "No Starlink history data is currently available."
            _record_service_error("starlink", msg)
            return {"error": msg}
        general, bulk = result
        out: dict[str, Any] = {"general": general or {}, "error": None}
        if bulk:
            for key, values in bulk.items():
                out[key] = list(values) if isinstance(values, (list, tuple)) else values
        _record_service_ok("starlink")
        return out
    except Exception as e:
        log.warning("Starlink bulk history fetch failed: %s", e)
        _reset_context()
        msg = "Unable to fetch Starlink bulk history."
        _record_service_error("starlink", msg)
        return {"error": msg}


def fetch_obstruction_map() -> dict[str, Any]:
    try:
        ctx = _get_context()
        result = starlink_grpc.obstruction_map(ctx)
        if result is None:
            return {"error": "No obstruction data is currently available."}
        rows = len(result)
        cols = len(result[0]) if rows > 0 else 0
        flat = [v for row in result for v in row]
        _record_service_ok("starlink")
        return {"snr": flat, "rows": rows, "cols": cols, "error": None}
    except Exception as e:
        log.warning("Starlink obstruction fetch failed: %s", e)
        _reset_context()
        msg = "Unable to fetch Starlink obstruction data."
        _record_service_error("starlink", msg)
        return {"error": msg}


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
                log.debug("Broadcast queue full or unavailable; dropping status update")

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
            _record_service_ok("speedtest")
            return json.loads(resp.read().decode())
    except Exception as e:
        msg = "Speedtest Tracker API request failed."
        _record_service_error("speedtest", msg)
        log.warning("Speedtest API error: %s", e)
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


def _find_last_page() -> int:
    """Discover the last page number (newest results) from the API."""
    resp = _speedtest_api_get("/results?page%5Bnumber%5D=1")
    if not resp or "meta" not in resp:
        return 1
    return resp["meta"].get("last_page", 1)


def sync_speedtest_results(backfill: bool = False):
    """Fetch results from speedtest-tracker and INSERT OR IGNORE into local DB.

    The API returns oldest-first, so we fetch from the last page (newest)
    backwards to get the most recent results first.
    """
    if not SPEEDTEST_URL or not SPEEDTEST_API_TOKEN:
        return

    last_page = _find_last_page()

    if backfill:
        # Fetch the last 7 pages (newest ~175 results)
        pages = range(last_page, max(last_page - 7, 0), -1)
    else:
        # Normal sync: just the last page (25 most recent)
        pages = [last_page]

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

        # For normal sync, stop if nothing new was inserted
        if not backfill and inserted == 0:
            break

    if inserted:
        log.info("Speedtest sync inserted %s new result(s) from page %s", inserted, last_page)


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
            conn.execute("DELETE FROM failover_events WHERE start_ts < ?",
                         (now - RETENTION_ROUTER_DAYS * 86400,))
            conn.commit()
            conn.close()
            log.info("Retention cleanup complete")
        except Exception as e:
            log.warning("Retention cleanup error: %s", e)


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
            _record_service_ok("uptime_kuma")
            return r.read().decode("utf-8")
    except Exception as e:
        msg = "Uptime Kuma metrics request failed."
        _record_service_error("uptime_kuma", msg)
        log.warning("Uptime Kuma metrics fetch error: %s", e)
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
            log.warning("Uptime Kuma poll error: %s", e)
        time.sleep(max(0, UPTIME_KUMA_POLL_INTERVAL - (time.time() - t0)))


# ---------------------------------------------------------------------------
# Tautulli (Plex monitoring) integration
# ---------------------------------------------------------------------------

def _tautulli_api(cmd: str, **params) -> dict | None:
    global latest_tautulli_error
    if not TAUTULLI_URL or not TAUTULLI_API_KEY:
        latest_tautulli_error = "Tautulli is not configured: set TAUTULLI_URL and TAUTULLI_API_KEY."
        return None
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"{TAUTULLI_URL}/api/v2?apikey={TAUTULLI_API_KEY}&cmd={cmd}"
    if qs:
        url += f"&{qs}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
            response = data.get("response", {})
            if response.get("result") != "success":
                latest_tautulli_error = response.get("message") or f"Tautulli API command failed: {cmd}"
                _record_service_error("tautulli", latest_tautulli_error)
                return None
            latest_tautulli_error = None
            _record_service_ok("tautulli")
            return response.get("data")
    except Exception as e:
        latest_tautulli_error = str(e)
        _record_service_error("tautulli", "Tautulli API request failed.")
        log.warning("Tautulli API error (%s): %s", cmd, e)
        return None


def fetch_tautulli_status() -> dict:
    """Aggregate Tautulli data into a single status dict."""
    result: dict[str, Any] = {
        "configured": bool(TAUTULLI_URL and TAUTULLI_API_KEY),
        "connected": False,
        "error": None,
    }

    if not result["configured"]:
        result["error"] = "Missing TAUTULLI_URL or TAUTULLI_API_KEY."
        return result

    # Active streams
    activity = _tautulli_api("get_activity")
    if activity:
        result["connected"] = True
        sessions = activity.get("sessions", [])
        result["stream_count"] = int(activity.get("stream_count", 0))
        result["total_bandwidth_mbps"] = round(int(activity.get("total_bandwidth", 0)) / 1000, 1)
        result["lan_bandwidth_mbps"] = round(int(activity.get("lan_bandwidth", 0)) / 1000, 1)
        result["wan_bandwidth_mbps"] = round(int(activity.get("wan_bandwidth", 0)) / 1000, 1)
        result["transcode_count"] = int(activity.get("stream_count_transcode", 0))
        result["direct_play_count"] = int(activity.get("stream_count_direct_play", 0))
        normalized_sessions = []
        lan_sessions = 0
        wan_sessions = 0
        transcode_streams = 0
        direct_stream_count = int(activity.get("stream_count_direct_stream", 0))
        direct_play_count = int(activity.get("stream_count_direct_play", 0))
        paused_sessions = 0

        for s in sessions:
            normalized = normalize_tautulli_session(s)
            decision = (normalized.get("transcode_decision") or "").strip().lower()
            location = (normalized.get("location") or "").strip().lower()
            state = (normalized.get("state") or "").strip().lower()
            if location == "lan":
                lan_sessions += 1
            elif location == "wan":
                wan_sessions += 1
            if decision == "transcode":
                transcode_streams += 1
            if state == "paused":
                paused_sessions += 1

            normalized_sessions.append(normalized)

        result["direct_stream_count"] = direct_stream_count
        result["lan_stream_count"] = lan_sessions
        result["wan_stream_count"] = wan_sessions
        result["paused_stream_count"] = paused_sessions
        stream_health_summary = summarize_stream_health(normalized_sessions)
        result["quality_summary"] = {
            "direct_play_count": direct_play_count,
            "direct_stream_count": direct_stream_count,
            "transcode_count": transcode_streams,
            "lan_stream_count": lan_sessions,
            "wan_stream_count": wan_sessions,
            "healthy_stream_count": stream_health_summary["healthy_stream_count"],
            "critical_stream_count": stream_health_summary["critical_stream_count"],
            "avg_score": stream_health_summary["avg_score"],
            "status_counts": stream_health_summary["status_counts"],
        }
        result["sessions"] = normalized_sessions

    # Libraries
    libs = _tautulli_api("get_libraries")
    if libs:
        result["libraries"] = [
            {
                "name": l.get("section_name", ""),
                "type": l.get("section_type", ""),
                "count": int(l.get("count", 0)),
                "child_count": int(l.get("child_count", 0)) if l.get("child_count") else None,
            }
            for l in libs
        ]

    # Recent history (last 5)
    hist = _tautulli_api("get_history", length="8")
    if hist and hist.get("data"):
        result["recent"] = [
            {
                "title": h.get("full_title") or h.get("title", ""),
                "media_type": h.get("media_type", ""),
                "user": h.get("friendly_name", ""),
                "platform": h.get("platform", ""),
                "player": h.get("player", ""),
                "date": h.get("date"),
                "duration_s": h.get("duration"),
                "transcode_decision": h.get("transcode_decision", ""),
                "watched_status": h.get("watched_status"),
                "percent_complete": h.get("percent_complete"),
            }
            for h in hist["data"]
        ]

    # Plays by date (last 30 days)
    plays = _tautulli_api("get_plays_by_date", time_range="30")
    if plays:
        result["plays_by_date"] = {
            "dates": plays.get("categories", []),
            "series": {
                s["name"].lower(): s["data"]
                for s in plays.get("series", [])
            },
        }

    if not result["connected"]:
        result["error"] = latest_tautulli_error or "Unable to fetch data from Tautulli."

    return result


def _tautulli_poll_thread():
    global latest_tautulli
    while True:
        t0 = time.time()
        try:
            latest_tautulli = fetch_tautulli_status()
        except Exception as e:
            log.warning("Tautulli poll error: %s", e)
        time.sleep(max(0, TAUTULLI_POLL_INTERVAL - (time.time() - t0)))


# ---------------------------------------------------------------------------
# AI assistant
# ---------------------------------------------------------------------------

_SANITIZE_URL_RE = re.compile(r"\b(?:https?://|wss?://)\S+\b", re.IGNORECASE)
_SANITIZE_HOST_RE = re.compile(r"\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b", re.IGNORECASE)
_SANITIZE_IP_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b")


class AssistantAskRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)


def _sanitize_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    text = _SANITIZE_URL_RE.sub("[url]", text)
    text = _SANITIZE_IP_RE.sub("[ip]", text)
    text = _SANITIZE_HOST_RE.sub("[host]", text)
    return text.strip()


def _normalize_user_prompt(prompt: str) -> str:
    clean = _sanitize_text(prompt)
    clean = " ".join(clean.split())
    return clean[:AI_MAX_PROMPT_CHARS]


def _humanize_key(name: str) -> str:
    return name.replace("alert_", "").replace("_", " ").title()


def _current_day_key() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def _reset_ai_daily_usage_if_needed():
    global _ai_usage_day, _ai_usage_requests, _ai_usage_tokens
    day = _current_day_key()
    if day != _ai_usage_day:
        _ai_usage_day = day
        _ai_usage_requests = 0
        _ai_usage_tokens = 0


def _check_ai_request_limits(client_id: str):
    global _ai_usage_requests
    now = time.time()
    with _ai_lock:
        _reset_ai_daily_usage_if_needed()
        timestamps = [ts for ts in _ai_rate_limit.get(client_id, []) if now - ts < AI_RATE_LIMIT_WINDOW_S]
        if len(timestamps) >= AI_RATE_LIMIT_REQUESTS:
            raise HTTPException(status_code=429, detail=_public_error("AI request rate limit exceeded. Please try again shortly.", code="ai_rate_limited"))
        if _ai_usage_requests >= AI_DAILY_REQUEST_LIMIT:
            raise HTTPException(status_code=429, detail=_public_error("AI daily request limit reached for this process.", code="ai_daily_request_limit"))
        if _ai_usage_tokens >= AI_DAILY_TOKEN_BUDGET:
            raise HTTPException(status_code=429, detail=_public_error("AI daily token budget reached for this process.", code="ai_daily_token_limit"))
        timestamps.append(now)
        _ai_rate_limit[client_id] = timestamps
        _ai_usage_requests += 1


def _record_ai_usage(total_tokens: int):
    global _ai_usage_tokens
    with _ai_lock:
        _reset_ai_daily_usage_if_needed()
        _ai_usage_tokens += max(0, total_tokens)


def _get_ai_cache(cache_key: str) -> dict[str, Any] | None:
    now = time.time()
    with _ai_lock:
        cached = _ai_cache.get(cache_key)
        if not cached:
            return None
        if now - cached["ts"] > AI_CACHE_TTL_S:
            _ai_cache.pop(cache_key, None)
            return None
        return cached["value"]


def _set_ai_cache(cache_key: str, value: dict[str, Any]):
    with _ai_lock:
        _ai_cache[cache_key] = {"ts": time.time(), "value": value}


def _safe_number(value: Any, digits: int = 1) -> str:
    try:
        return f"{float(value):.{digits}f}"
    except (TypeError, ValueError):
        return "unknown"


def _build_ai_fact_pack() -> tuple[list[dict[str, str]], dict[str, str]]:
    facts: list[dict[str, str]] = []
    labels: dict[str, str] = {}

    def add_fact(fid: str, label: str, value: str | int | float | None):
        if value is None:
            return
        statement = f"{label}: {_sanitize_text(value)}"
        facts.append({"id": fid, "statement": statement})
        labels[fid] = statement

    status = latest_status or {}
    header = status.get("header", {}) or {}
    alerts = status.get("alerts", {}) or {}
    if status.get("error"):
        add_fact("dish_error", "Dish status", status.get("error"))
    else:
        add_fact("dish_state", "Dish state", header.get("state") or "Unknown")
        if header.get("pop_ping_latency_ms") is not None:
            add_fact("latency_now", "Current latency", f"{_safe_number(header.get('pop_ping_latency_ms'))} ms")
        if header.get("pop_ping_drop_rate") is not None:
            add_fact("loss_now", "Current packet loss", f"{_safe_number((header.get('pop_ping_drop_rate') or 0) * 100, 2)}%")
        if header.get("downlink_throughput_bps") is not None:
            add_fact("download_now", "Current download", f"{_safe_number((header.get('downlink_throughput_bps') or 0) / 1_000_000, 2)} Mbps")
        if header.get("uplink_throughput_bps") is not None:
            add_fact("upload_now", "Current upload", f"{_safe_number((header.get('uplink_throughput_bps') or 0) / 1_000_000, 2)} Mbps")
        if header.get("fraction_obstructed") is not None:
            add_fact("obstruction_now", "Current obstruction", f"{_safe_number((header.get('fraction_obstructed') or 0) * 100, 2)}%")
        active_alerts = [_humanize_key(name) for name, is_active in alerts.items() if is_active]
        add_fact("active_alerts_count", "Active Starlink alerts", len(active_alerts))
        if active_alerts:
            add_fact("active_alerts_list", "Active alert names", ", ".join(active_alerts[:5]))

    history_1h = query_history(1)
    history_24h = query_history(24)
    if history_1h:
        latencies = [r["latency_ms"] for r in history_1h if r.get("latency_ms") is not None]
        if latencies:
            add_fact("latency_avg_1h", "Average latency over 1 hour", f"{sum(latencies) / len(latencies):.1f} ms")
            add_fact("latency_peak_1h", "Peak latency over 1 hour", f"{max(latencies):.1f} ms")
        losses = [(r.get("drop_rate") or 0) * 100 for r in history_1h]
        add_fact("loss_avg_1h", "Average packet loss over 1 hour", f"{sum(losses) / len(losses):.2f}%")
        add_fact("loss_impaired_1h", "Samples with non-zero loss over 1 hour", sum(1 for value in losses if value > 0))
        add_fact("loss_full_1h", "Samples with full packet loss over 1 hour", sum(1 for value in losses if value >= 100))
    if history_24h:
        connected = [r for r in history_24h if r.get("state")]
        if connected:
            pct = (sum(1 for r in connected if r.get("state") == "CONNECTED") / len(connected)) * 100
            add_fact("connected_pct_24h", "Connected samples over 24 hours", f"{pct:.2f}%")

    outages_24h = query_outages(24)
    add_fact("outage_count_24h", "Outages in the last 24 hours", len(outages_24h))
    if outages_24h:
        longest = max((o.get("duration_s") or 0) for o in outages_24h)
        add_fact("outage_longest_24h", "Longest outage in the last 24 hours", f"{longest:.0f} s")
    add_fact("outage_current", "Outage in progress", "yes" if _outage_start is not None else "no")

    router = latest_router or {}
    if router.get("error"):
        add_fact("router_error", "Router polling", router.get("error"))
    elif router:
        add_fact("router_active_wan", "Active WAN", router.get("active_wan") or "unknown")
        add_fact("router_failover", "Failover active", "yes" if router.get("failover_active") else "no")
        if router.get("cpu_pct") is not None:
            add_fact("router_cpu", "Router CPU", f"{_safe_number(router.get('cpu_pct'))}%")
        if router.get("mem_used_mb") is not None and router.get("mem_total_mb"):
            mem_pct = (router.get("mem_used_mb") / router.get("mem_total_mb")) * 100
            add_fact("router_memory", "Router memory used", f"{mem_pct:.0f}%")
        add_fact("wan1_up", "Primary WAN link up", "yes" if router.get("wan1_up") else "no")
        add_fact("wan2_up", "Failover WAN link up", "yes" if router.get("wan2_up") else "no")

    failovers_7d = query_failover_events(168)
    add_fact("failover_events_7d", "Failover events in 7 days", len(failovers_7d))

    speedtest = query_speedtest_latest()
    if speedtest:
        add_fact("speedtest_download", "Latest speedtest download", f"{_safe_number(speedtest.get('download_mbps'))} Mbps")
        add_fact("speedtest_upload", "Latest speedtest upload", f"{_safe_number(speedtest.get('upload_mbps'))} Mbps")
        add_fact("speedtest_ping", "Latest speedtest ping", f"{_safe_number(speedtest.get('ping_ms'))} ms")
        age_m = max(0, round((time.time() - (speedtest.get("ts") or time.time())) / 60))
        add_fact("speedtest_age", "Latest speedtest age", f"{age_m} minutes")

    monitors = latest_uptime_monitors or []
    if monitors:
        up_count = sum(1 for m in monitors if m.get("status") == 1)
        down_count = sum(1 for m in monitors if m.get("status") == 0)
        add_fact("services_up", "Healthy monitored services", f"{up_count}/{len(monitors)}")
        add_fact("services_down", "Down monitored services", down_count)

    tautulli = latest_tautulli or {}
    if tautulli.get("configured") is not False:
        add_fact("streams_active", "Active media streams", tautulli.get("stream_count"))
        if tautulli.get("total_bandwidth_mbps") is not None:
            add_fact("streams_bandwidth", "Media bandwidth", f"{_safe_number(tautulli.get('total_bandwidth_mbps'))} Mbps")

    return facts[:60], labels


def _build_ai_cache_key(prompt: str, facts: list[dict[str, str]]) -> tuple[str, str]:
    prompt_hash = hashlib.sha256(prompt.encode()).hexdigest()[:12]
    facts_hash = hashlib.sha256(json.dumps(facts, sort_keys=True).encode()).hexdigest()[:12]
    return f"{AI_PROVIDER}:{AI_MODEL}:{prompt_hash}:{facts_hash}", prompt_hash


def _approx_tokens(*parts: str) -> int:
    return max(1, sum(len(part) for part in parts) // 4)


def _extract_message_content(message: Any) -> str:
    if isinstance(message, str):
        return message
    if isinstance(message, list):
        text_parts = [item.get("text", "") for item in message if isinstance(item, dict) and item.get("type") == "text"]
        return "\n".join(part for part in text_parts if part)
    return str(message or "")


def _ai_uses_max_completion_tokens() -> bool:
    return AI_PROVIDER == "openai" and AI_MODEL.lower().startswith("gpt-5")


def _ai_supports_temperature_override() -> bool:
    return not (AI_PROVIDER == "openai" and AI_MODEL.lower().startswith("gpt-5"))


def _call_ai_completion(prompt: str, facts: list[dict[str, str]], labels: dict[str, str], prompt_hash: str) -> dict[str, Any]:
    system_prompt = (
        "You are the Home Dashboard operations assistant. "
        "You only answer from the provided fact list. "
        "Stay read-only. Do not mention secrets, configuration keys, raw URLs, hostnames, IPs, or environment variables. "
        "Answer in 2 to 4 concise operational sentences. "
        "If the question asks for diagnosis, explain the most likely cause and uncertainty. "
        "Return strict JSON with keys: answer, used_fact_ids."
    )
    body = {
        "model": AI_MODEL,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps({"question": prompt, "facts": facts}, ensure_ascii=False)},
        ],
    }
    if _ai_supports_temperature_override():
        body["temperature"] = AI_TEMPERATURE
    token_limit_key = "max_completion_tokens" if _ai_uses_max_completion_tokens() else "max_tokens"
    body[token_limit_key] = AI_MAX_OUTPUT_TOKENS
    req = urllib.request.Request(
        f"{AI_BASE_URL}/chat/completions",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {AI_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=AI_TIMEOUT_S) as resp:
            payload = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        _record_service_error("ai", "AI provider rejected the request.")
        error_body = ""
        try:
            error_body = e.read().decode(errors="replace")[:400]
        except Exception:
            error_body = ""
        log.warning(
            "AI request failed prompt_hash=%s provider=%s model=%s status=%s body=%s",
            prompt_hash,
            AI_PROVIDER,
            AI_MODEL,
            e.code,
            error_body,
        )
        raise HTTPException(status_code=502, detail=_public_error("AI provider request failed.", code="ai_upstream_error"))
    except Exception as e:
        _record_service_error("ai", "AI provider is unavailable.")
        log.warning("AI request exception prompt_hash=%s provider=%s model=%s error=%s", prompt_hash, AI_PROVIDER, AI_MODEL, e)
        raise HTTPException(status_code=502, detail=_public_error("AI provider is unavailable.", code="ai_unavailable"))

    choice = (payload.get("choices") or [{}])[0]
    message = _extract_message_content((choice.get("message") or {}).get("content"))
    try:
        parsed = json.loads(message)
    except json.JSONDecodeError:
        _record_service_error("ai", "AI response could not be parsed.")
        raise HTTPException(status_code=502, detail=_public_error("AI provider returned an unexpected response.", code="ai_invalid_response"))

    answer = _sanitize_text(parsed.get("answer", ""))[:1200]
    used_ids = [fid for fid in parsed.get("used_fact_ids", []) if fid in labels][:6]
    citations = [labels[fid] for fid in used_ids]
    usage = payload.get("usage") or {}
    total_tokens = int(usage.get("total_tokens") or _approx_tokens(system_prompt, json.dumps(facts), answer))
    _record_ai_usage(total_tokens)
    _record_service_ok("ai")
    latency_ms = round((time.time() - started) * 1000)
    log.info(
        "AI request complete prompt_hash=%s provider=%s model=%s tokens=%s latency_ms=%s cited_facts=%s",
        prompt_hash,
        AI_PROVIDER,
        AI_MODEL,
        total_tokens,
        latency_ms,
        len(citations),
    )
    return {
        "answer": answer,
        "citations": citations,
        "cached": False,
        "provider": AI_PROVIDER,
        "model": AI_MODEL,
        "read_only": True,
        "usage": {"total_tokens": total_tokens},
    }


def _speedtest_poll_thread():
    log.info("Speedtest sync thread started")
    # Backfill on first run if DB is empty
    try:
        with _db_lock:
            conn = _get_conn()
            count = conn.execute("SELECT COUNT(*) FROM speedtest_results").fetchone()[0]
            conn.close()
    except Exception as e:
        log.warning("Speedtest DB check error: %s", e)
        count = 0
    if count == 0:
        log.info("Speedtest DB empty; backfilling recent history")
        try:
            sync_speedtest_results(backfill=True)
        except Exception as e:
            log.warning("Speedtest backfill error: %s", e)

    _cleanup_tick = 0
    while True:
        t0 = time.time()
        try:
            sync_speedtest_results()
        except Exception as e:
            log.warning("Speedtest sync error: %s", e)
        _cleanup_tick += 1
        if _cleanup_tick >= 12:   # run retention cleanup every ~hour (12 × 5 min)
            _cleanup_tick = 0
            try:
                run_retention_cleanup()
            except Exception as e:
                log.warning("Speedtest cleanup error: %s", e)
        time.sleep(max(0, SPEEDTEST_POLL_INTERVAL - (time.time() - t0)))


def _router_poll_thread():
    global latest_router
    while True:
        t0 = time.time()
        r = fetch_router_status()
        latest_router = r
        if not r.get("error"):
            store_router_status(r)
            if r.get("active_wan"):
                _track_failover(r["active_wan"])
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
    if CONFIG_ERRORS:
        for error in CONFIG_ERRORS:
            log.error("Configuration error: %s", error)
    else:
        log.info("Configuration validation passed")
    init_db()
    _broadcast_queue = asyncio.Queue()
    threading.Thread(target=_poll_thread, daemon=True).start()
    if service_status["router"]["enabled"]:
        threading.Thread(target=_router_poll_thread, daemon=True).start()
    else:
        latest_router.update({"error": "Router SNMP is not configured.", "timestamp": time.time()})
    if service_status["speedtest"]["enabled"]:
        threading.Thread(target=_speedtest_poll_thread, daemon=True).start()
    if service_status["uptime_kuma"]["enabled"]:
        threading.Thread(target=_uptime_kuma_poll_thread, daemon=True).start()
    if service_status["tautulli"]["enabled"]:
        threading.Thread(target=_tautulli_poll_thread, daemon=True).start()
    broadcast_task = asyncio.create_task(_broadcast_loop())
    yield
    broadcast_task.cancel()


app = FastAPI(title="StarlinkDash API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["Accept", "Content-Type", "Origin"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    forwarded_proto = request.headers.get("X-Forwarded-Proto", request.url.scheme)
    try:
        response = await call_next(request)
    except Exception:
        log.exception("Unhandled error for %s %s request_id=%s", request.method, request.url.path, request_id)
        response = JSONResponse(
            status_code=500,
            content={"error": _public_error("Internal server error", code="internal_error")},
        )
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "connect-src 'self' ws: wss:; "
        "img-src 'self' data: blob:; "
        "style-src 'self' 'unsafe-inline'; "
        "script-src 'self'; "
        "font-src 'self' data:; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "form-action 'self'; "
        "frame-ancestors 'none'"
    )
    if forwarded_proto == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.get("/healthz")
async def healthz():
    return _health_report()


@app.get("/api/health")
async def api_health():
    return _health_report()


@app.get("/readyz")
async def readyz(response: Response):
    report = _health_report()
    if CONFIG_ERRORS:
        response.status_code = 503
    return report


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


@app.get("/api/failover/history")
async def get_failover_history(hours: float = 168.0):
    hours = min(max(hours, 1.0), 8760.0)
    loop = asyncio.get_event_loop()
    rows = await loop.run_in_executor(None, query_failover_events, hours)
    # Include current failover state
    active = _failover_start_ts is not None
    return {
        "events": rows,
        "count": len(rows),
        "failover_active": active,
        "failover_since": _failover_start_ts,
    }


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


@app.get("/api/tautulli")
async def get_tautulli():
    return latest_tautulli or {}


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
        "router_enabled": bool(ROUTER_TARGET and ROUTER_COMMUNITY),
        "uptime_kuma_enabled": bool(UPTIME_KUMA_URL and UPTIME_KUMA_API_KEY),
        "tautulli_enabled": bool(TAUTULLI_URL and TAUTULLI_API_KEY),
        "ai_enabled": bool(AI_API_KEY and AI_MODEL),
        "ai_provider": AI_PROVIDER,
        "ai_model": AI_MODEL,
        "ai_read_only": True,
        "ai_suggested_prompts": AI_SUGGESTED_PROMPTS,
    }


@app.post("/api/assistant/ask")
async def ask_assistant(payload: AssistantAskRequest, request: Request):
    if not AI_API_KEY or not AI_MODEL:
        raise HTTPException(status_code=503, detail=_public_error("AI assistant is not configured.", code="ai_disabled"))

    prompt = _normalize_user_prompt(payload.prompt)
    if not prompt:
        raise HTTPException(status_code=400, detail=_public_error("Prompt must not be empty.", code="ai_invalid_prompt"))

    client_id = (
        (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )
    facts, labels = _build_ai_fact_pack()
    cache_key, prompt_hash = _build_ai_cache_key(prompt, facts)

    cached = _get_ai_cache(cache_key)
    if cached:
        log.info(
            "AI cache hit prompt_hash=%s provider=%s model=%s client=%s cited_facts=%s",
            prompt_hash,
            AI_PROVIDER,
            AI_MODEL,
            client_id,
            len(cached.get("citations") or []),
        )
        return {**cached, "cached": True}

    _check_ai_request_limits(client_id)
    log.info(
        "AI request start prompt_hash=%s provider=%s model=%s client=%s prompt_chars=%s facts=%s",
        prompt_hash,
        AI_PROVIDER,
        AI_MODEL,
        client_id,
        len(prompt),
        len(facts),
    )
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _call_ai_completion, prompt, facts, labels, prompt_hash)
    _set_ai_cache(cache_key, result)
    return result


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    origin = websocket.headers.get("origin")
    host = websocket.headers.get("x-forwarded-host") or websocket.headers.get("host")
    if CORS_ALLOWED_ORIGINS and not _origin_allowed(origin, host):
        await websocket.close(code=1008)
        return
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
