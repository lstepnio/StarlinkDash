import asyncio

from fastapi import Response

import backend.app as app_module


def test_health_report_includes_service_states():
    report = app_module._health_report()

    assert report["status"] in {"ok", "degraded"}
    assert "services" in report
    assert "starlink" in report["services"]
    assert "router" in report["services"]


def test_readyz_returns_503_when_config_errors_present(monkeypatch):
    response = Response()
    monkeypatch.setattr(app_module, "CONFIG_ERRORS", ["bad config"])

    report = asyncio.run(app_module.readyz(response))

    assert response.status_code == 503
    assert report["status"] == "degraded"
    assert report["config_errors"] == ["bad config"]


def test_get_config_exposes_flags_without_secrets():
    config = asyncio.run(app_module.get_config())

    assert "ai_api_key" not in config
    assert "speedtest_api_token" not in config
    assert "uptime_kuma_api_key" not in config
    assert "tautulli_api_key" not in config
    assert {"ai_enabled", "speedtest_enabled", "router_enabled", "uptime_kuma_enabled", "tautulli_enabled"} <= set(config)


def test_get_history_clamps_requested_hours(monkeypatch):
    captured = {}

    def fake_query_history(hours):
        captured["hours"] = hours
        return []

    monkeypatch.setattr(app_module, "query_history", fake_query_history)

    result = asyncio.run(app_module.get_history(999))

    assert captured["hours"] == 24.0
    assert result["count"] == 0


def test_normalize_user_prompt_redacts_hosts_and_ips():
    prompt = app_module._normalize_user_prompt("Why is https://status.example.com slow from 192.168.10.1?")

    assert "status.example.com" not in prompt
    assert "192.168.10.1" not in prompt
    assert "[url]" in prompt or "[host]" in prompt
