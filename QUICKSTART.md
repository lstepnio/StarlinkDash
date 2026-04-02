# Quick Start

## Prerequisites

- Docker with Compose support
- Local network access to the Starlink dish at `192.168.100.1`

Optional integrations need their own reachable services and credentials.

## Local Start

1. Copy the sample configuration:

```bash
cp .env.example .env
```

2. Edit `.env` and set only the integrations you actually use.

3. Start the stack:

```bash
docker compose up --build
```

4. Open `http://localhost:8088`.

## Verify the App

Basic checks:

```bash
curl http://localhost:8088/healthz
curl http://localhost:8088/api/config
```

If Starlink is reachable, the dashboard should begin populating within a few polling intervals.

## Common First-Run Problems

- Starlink unreachable:
  check `STARLINK_TARGET`, local routing, and whether the dish is reachable from the host running Docker.
- Router section shows SNMP error:
  set `ROUTER_COMMUNITY` and confirm SNMP is enabled on the router.
- Optional panels do not appear:
  the UI hides integrations that are not fully configured.

See [TROUBLESHOOTING.md](/Users/lukasz.stepniowski/Development/StarlinkDash/TROUBLESHOOTING.md) for more.

