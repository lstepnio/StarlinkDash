# Deployment

## Recommended Pattern

Deploy StarlinkDash behind a reverse proxy and use the published GHCR image or a locally built image.

## Docker Compose

```bash
docker compose pull
docker compose up -d --force-recreate
```

The container includes:

- non-root runtime user
- HTTP healthcheck
- `no-new-privileges` compose security option

## Health Endpoints

- `/healthz`
- `/readyz`
- `/api/health`

## Reverse Proxy Notes

- Proxy `8000/tcp`
- Preserve `Host`
- If you expose the app cross-origin, set `CORS_ALLOWED_ORIGINS` explicitly
- Terminate TLS at the proxy
- Forward `X-Forwarded-Proto` so HTTPS deployments receive HSTS
- Add authentication, VPN access, or IP allowlists before exposing the dashboard on the public internet
- Avoid caching API responses or WebSocket upgrades

## Persistence

Persist `/data` to retain SQLite history.

## Updating

```bash
docker compose pull starlinkdash
docker compose up -d --force-recreate starlinkdash
```

## Production Recommendations

- use a dedicated volume for `/data`
- restrict network access to internal dashboards when possible
- set log retention externally if you centralize logs
- monitor `/healthz` and container health status
