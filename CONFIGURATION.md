# Configuration

## Core Variables

- `STARLINK_TARGET`
  Default: `192.168.100.1:9200`
  Starlink gRPC endpoint.

- `DB_PATH`
  Default: `/data/starlinkdash.db`
  SQLite database path inside the container.

- `LOG_LEVEL`
  Default: `INFO`
  Backend logging verbosity.

- `CORS_ALLOWED_ORIGINS`
  Default: localhost development origins
  Comma-separated list of allowed browser origins for cross-origin API usage.

## Polling

- `STARLINK_POLL_INTERVAL`
  Default: `10`
- `ROUTER_POLL_INTERVAL`
  Default: `30`
- `SPEEDTEST_POLL_INTERVAL`
  Default: `300`
- `UPTIME_KUMA_POLL_INTERVAL`
  Default: `60`
- `TAUTULLI_POLL_INTERVAL`
  Default: `30`

## Retention

- `RETENTION_STARLINK_DAYS`
- `RETENTION_ROUTER_DAYS`
- `RETENTION_SPEEDTEST_DAYS`

## Router SNMP

- `ROUTER_TARGET`
- `ROUTER_COMMUNITY`
- `ROUTER_LAN_IFACE`
- `ROUTER_WAN_IFACE`
- `ROUTER_WAN2_IFACE`

Notes:

- `ROUTER_COMMUNITY` has no default for security reasons.
- Leave `ROUTER_TARGET` and `ROUTER_COMMUNITY` empty to disable router polling.
- If router SNMP is not configured, the router section remains visible but reports that configuration is missing.

## Speedtest Tracker

- `SPEEDTEST_URL`
- `SPEEDTEST_API_TOKEN`

## Uptime Kuma

- `UPTIME_KUMA_URL`
- `UPTIME_KUMA_API_KEY`

## Tautulli

- `TAUTULLI_URL`
- `TAUTULLI_API_KEY`

## Operator Guidance

- Leave integrations unset unless you actively use them.
- Prefer Docker secrets or platform secret stores over committing or baking credentials into images.
- Rotate any secret that has been exposed outside a trusted secret store.
