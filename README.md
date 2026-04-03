# StarlinkDash

StarlinkDash is a self-hosted operations dashboard for Starlink dish telemetry with optional integrations for an EdgeRouter Lite, Speedtest Tracker, Uptime Kuma, and Tautulli.

It is designed for operators who want one place to view Starlink health, WAN failover state, packet loss, throughput, outages, service checks, and supporting context.

## Highlights

- Live Starlink dish status, throughput, latency, packet loss, obstructions, and outages
- Router WAN failover monitoring over SNMP, including richer interface state details
- Optional Speedtest Tracker benchmark history
- Optional Uptime Kuma service health
- Optional Tautulli media activity and inferred stream health scoring
- Optional read-only AI assistant for concise operational summaries
- Docker-first deployment with health endpoints and container healthcheck

## Quick Start

```bash
cp .env.example .env
docker compose up --build
```

Open [http://localhost:8088](http://localhost:8088).

For a fuller first-run guide, see [QUICKSTART.md](/Users/lukasz.stepniowski/Development/StarlinkDash/QUICKSTART.md).

## Architecture

- Backend: FastAPI + SQLite + Starlink gRPC + optional HTTP/SNMP integrations
- Frontend: React + Vite + Recharts
- Packaging: multi-stage Docker image and Docker Compose

See [ARCHITECTURE.md](/Users/lukasz.stepniowski/Development/StarlinkDash/ARCHITECTURE.md) for more detail.

For the Plex/Tautulli stream health model, see [STREAM_HEALTH.md](/Users/lukasz.stepniowski/Development/StarlinkDash/STREAM_HEALTH.md).

## Configuration

All runtime configuration is environment-variable driven.

Core:

- `STARLINK_TARGET`
- `DB_PATH`
- `LOG_LEVEL`
- `CORS_ALLOWED_ORIGINS`

Optional integrations:

- Router SNMP: `ROUTER_TARGET`, `ROUTER_COMMUNITY`, `ROUTER_LAN_IFACE`, `ROUTER_WAN_IFACE`, `ROUTER_WAN2_IFACE`
  Leave `ROUTER_TARGET` and `ROUTER_COMMUNITY` empty to disable router polling.
- Speedtest Tracker: `SPEEDTEST_URL`, `SPEEDTEST_API_TOKEN`
- Uptime Kuma: `UPTIME_KUMA_URL`, `UPTIME_KUMA_API_KEY`
- Tautulli: `TAUTULLI_URL`, `TAUTULLI_API_KEY`
- AI assistant: `AI_API_KEY`, `AI_MODEL`, optional `AI_BASE_URL`

Retention and polling controls are also configurable. See:

- [CONFIGURATION.md](/Users/lukasz.stepniowski/Development/StarlinkDash/CONFIGURATION.md)
- [.env.example](/Users/lukasz.stepniowski/Development/StarlinkDash/.env.example)

## Deployment

The primary deployment target is Docker Compose. The image is also published to GHCR.

See:

- [DEPLOYMENT.md](/Users/lukasz.stepniowski/Development/StarlinkDash/DEPLOYMENT.md)
- [TROUBLESHOOTING.md](/Users/lukasz.stepniowski/Development/StarlinkDash/TROUBLESHOOTING.md)

## Security Notes

- Do not commit `.env` files, SNMP community strings, API tokens, or deployment credentials.
- Rotate any credential that has been pasted into chat, screenshots, terminal history, or previous commits.
- The app now exposes health endpoints at `/healthz`, `/readyz`, and `/api/health`.
- Default CORS is limited to local development origins; production reverse-proxy deployments should set `CORS_ALLOWED_ORIGINS` explicitly when cross-origin access is needed.

See [SECURITY.md](/Users/lukasz.stepniowski/Development/StarlinkDash/SECURITY.md).

## Project Status

The project is functional and actively being hardened for public release. Current limitations and launch blockers are tracked in [RELEASE_READINESS.md](/Users/lukasz.stepniowski/Development/StarlinkDash/RELEASE_READINESS.md).

## Contributing

Contribution guidelines, development workflow, and repository expectations are documented in [CONTRIBUTING.md](/Users/lukasz.stepniowski/Development/StarlinkDash/CONTRIBUTING.md).
