# Troubleshooting

## Health Checks

```bash
curl http://localhost:8088/healthz
curl http://localhost:8088/readyz
curl http://localhost:8088/api/config
```

## Starlink Not Updating

- confirm the host can reach `STARLINK_TARGET`
- check backend logs
- verify the dish is reachable from the same network namespace as Docker

## Router SNMP Errors

- verify `ROUTER_TARGET`
- verify `ROUTER_COMMUNITY`
- confirm SNMP is enabled on the ERLite
- verify interface names match the router (`eth0`, `eth1`, `eth2` by default)

## Tautulli Says Not Configured

- set both `TAUTULLI_URL` and `TAUTULLI_API_KEY`
- restart the container after changing environment variables

## Uptime Kuma Missing

- set both `UPTIME_KUMA_URL` and `UPTIME_KUMA_API_KEY`
- ensure the metrics endpoint is reachable from the app container

## Speedtest History Missing

- set `SPEEDTEST_URL` and `SPEEDTEST_API_TOKEN`
- review backend logs for API or backfill errors

## Container Unhealthy

- inspect logs:

```bash
docker compose logs --tail=200 starlinkdash
```

- inspect health:

```bash
docker inspect starlinkdash --format '{{json .State.Health}}'
```

