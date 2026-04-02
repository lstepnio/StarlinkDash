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

## AI Assistant

- `AI_PROVIDER`
  Default: `openai`
  Supports the default OpenAI API and OpenAI-compatible gateways that expose `/chat/completions` with JSON responses.

- `AI_BASE_URL`
  Default: `https://api.openai.com/v1`

- `AI_MODEL`
- `AI_API_KEY`
- `AI_TIMEOUT_S`
- `AI_TEMPERATURE`
- `AI_MAX_OUTPUT_TOKENS`
- `AI_MAX_PROMPT_CHARS`
- `AI_CACHE_TTL_S`
- `AI_RATE_LIMIT_REQUESTS`
- `AI_RATE_LIMIT_WINDOW_S`
- `AI_DAILY_REQUEST_LIMIT`
- `AI_DAILY_TOKEN_BUDGET`

Notes:

- The assistant stays disabled unless both `AI_MODEL` and `AI_API_KEY` are set.
- Requests are read-only and use sanitized metric summaries instead of raw URLs, hostnames, IPs, or environment variables.
- Caching plus request and token budgets are the built-in cost controls.
- Reducing `AI_MAX_OUTPUT_TOKENS` and tightening rate limits will lower spend the most.

## Operator Guidance

- Leave integrations unset unless you actively use them.
- Prefer Docker secrets or platform secret stores over committing or baking credentials into images.
- Rotate any secret that has been exposed outside a trusted secret store.
