# Architecture

## Overview

StarlinkDash has two major parts:

- a FastAPI backend that polls Starlink and optional integrations
- a React frontend served as static assets by the backend

## Backend Responsibilities

- poll Starlink dish telemetry via `starlink-grpc-core`
- poll optional integrations:
  - ERLite via SNMP
  - Speedtest Tracker via HTTP API
  - Uptime Kuma via Prometheus metrics endpoint
  - Tautulli via API
- persist history to SQLite
- expose REST endpoints and a WebSocket stream
- provide health and readiness information

## Frontend Responsibilities

- fetch persisted history and integration data
- subscribe to real-time status updates over WebSocket
- render dashboards and charts
- hide optional sections when integrations are not configured

## Data Model

SQLite tables currently include:

- `status_history`
- `alert_log`
- `outages`
- `obstruction_map`
- `router_history`
- `speedtest_results`
- `failover_events`

## Reliability Model

- background threads poll upstream systems at configured intervals
- the backend degrades gracefully when optional integrations fail
- health endpoints expose overall config and integration health state

