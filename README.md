# StarlinkDash

StarlinkDash is a self-hosted dashboard for Starlink dish telemetry with optional integrations for router SNMP, Speedtest Tracker, Uptime Kuma, and Tautulli.

## Features

- Live Starlink status, latency, packet loss, obstructions, and outage views
- Router WAN/failover visibility via SNMP
- Optional Speedtest Tracker history
- Optional Uptime Kuma service health
- Optional Tautulli Plex activity

Optional sections are automatically hidden when their integration is not configured.

## Quick Start

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Fill in the values you want to enable.

3. Start the app:

```bash
docker compose up --build
```

4. Open the dashboard at [http://localhost:8088](http://localhost:8088).

## Configuration

Core variables:

- `STARLINK_TARGET`: Starlink gRPC target. Default is `192.168.100.1:9200`.
- `DB_PATH`: SQLite database path inside the container.

Optional integrations:

- `ROUTER_TARGET`, `ROUTER_COMMUNITY`, `ROUTER_LAN_IFACE`, `ROUTER_WAN_IFACE`, `ROUTER_WAN2_IFACE`
- `SPEEDTEST_URL`, `SPEEDTEST_API_TOKEN`
- `UPTIME_KUMA_URL`, `UPTIME_KUMA_API_KEY`
- `TAUTULLI_URL`, `TAUTULLI_API_KEY`

If an optional integration is left unset, its section will not appear in the UI.

## Security Notes

- Do not commit `.env` files or deployment secrets.
- Rotate any token or API key that has been pasted into chat, terminal history, screenshots, or commits.
- Set `ROUTER_COMMUNITY` explicitly if you use SNMP. This repo no longer ships a default community string.

## Repo Hygiene

Current protections in this repo:

- `.env` and `deploy/.env` are ignored by git
- SQLite databases are ignored by git
- build output is ignored by git

Before pushing, it is still worth checking:

```bash
git diff
git status
rg -n "(API_KEY|TOKEN|SECRET|PASSWORD)" .
```
