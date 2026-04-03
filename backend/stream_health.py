"""Stream health scoring for Plex/Tautulli sessions.

The goal is not to pretend we have direct end-user QoE telemetry. Instead, we
infer likely stream health from session delivery signals that Plex/Tautulli
typically expose: playback method, transcode speed, bitrate reduction,
resolution changes, and remote-session constraints.
"""

from __future__ import annotations

import math
import re
from typing import Any, Mapping


PLAYBACK_PENALTIES = {
    "direct_play": 0,
    "direct_stream": 8,
    "audio_transcode": 15,
    "video_transcode": 30,
    "video_audio_transcode": 40,
}

STATUS_BUCKETS = (
    (90, "Excellent"),
    (75, "Good"),
    (55, "Watch"),
    (35, "Poor"),
    (0, "Critical"),
)

TRANSCODE_SPEED_PENALTIES = (
    (1.5, 0),
    (1.1, 8),
    (1.0, 15),
    (0.85, 30),
    (-math.inf, 45),
)

BITRATE_RATIO_PENALTIES = (
    (0.85, 0),
    (0.70, 5),
    (0.50, 12),
    (0.30, 22),
    (-math.inf, 35),
)

WAN_RATIO_PENALTIES = (
    (0.50, 10),
    (0.70, 6),
)

RESOLUTION_TIER_ALIASES = {
    "sd": 0,
    "480": 0,
    "480p": 0,
    "576": 0,
    "576p": 0,
    "720": 1,
    "720p": 1,
    "1080": 2,
    "1080p": 2,
    "2k": 2,
    "1440": 2,
    "1440p": 2,
    "4k": 3,
    "2160": 3,
    "2160p": 3,
}

ERROR_STATES = {"error", "stopped", "buffering-error"}


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _clean_lower(value: Any) -> str:
    return _clean_text(value).lower()


def _first_present(data: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        value = data.get(key)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return None


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    match = re.search(r"-?\d+(?:\.\d+)?", str(value))
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def _safe_int(value: Any) -> int | None:
    parsed = _safe_float(value)
    if parsed is None:
        return None
    return int(parsed)


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    return _clean_lower(value) in {"1", "true", "yes", "on"}


def _extract_resolution_label(value: Any) -> str | None:
    text = _clean_lower(value)
    if not text:
        return None
    if text in RESOLUTION_TIER_ALIASES:
        return text
    if "4k" in text:
        return "4k"
    match = re.search(r"(2160|1440|1080|720|576|480)p?", text)
    if match:
        digits = match.group(1)
        return f"{digits}p" if not digits.endswith("p") else digits
    if "sd" in text:
        return "sd"
    return None


def _resolution_tier(value: Any) -> int | None:
    label = _extract_resolution_label(value)
    if not label:
        return None
    return RESOLUTION_TIER_ALIASES.get(label)


def _pretty_resolution(value: Any) -> str | None:
    label = _extract_resolution_label(value)
    if not label:
        return None
    if label == "sd":
        return "SD"
    return label.upper() if label == "4k" else label


def classify_playback_method(session: Mapping[str, Any]) -> tuple[str, int, list[str]]:
    """Classify playback mode from Plex/Tautulli decision fields."""
    transcode_decision = _clean_lower(_first_present(session, "transcode_decision", "decision"))
    video_decision = _clean_lower(_first_present(session, "video_decision"))
    audio_decision = _clean_lower(_first_present(session, "audio_decision"))

    video_transcoding = video_decision == "transcode"
    audio_transcoding = audio_decision == "transcode"
    copy_present = any(v in {"copy", "direct stream"} for v in (transcode_decision, video_decision, audio_decision))
    direct_play_present = any(v in {"direct play", "directplay"} for v in (transcode_decision, video_decision, audio_decision))

    if transcode_decision == "transcode" and video_transcoding and audio_transcoding:
        return "video_audio_transcode", PLAYBACK_PENALTIES["video_audio_transcode"], ["Video and audio transcoding"]
    if video_transcoding and audio_transcoding:
        return "video_audio_transcode", PLAYBACK_PENALTIES["video_audio_transcode"], ["Video and audio transcoding"]
    if video_transcoding:
        return "video_transcode", PLAYBACK_PENALTIES["video_transcode"], ["Video transcoding"]
    if audio_transcoding:
        return "audio_transcode", PLAYBACK_PENALTIES["audio_transcode"], ["Audio transcoding"]
    if transcode_decision == "transcode":
        return "video_transcode", PLAYBACK_PENALTIES["video_transcode"], ["Transcoding in progress"]
    if transcode_decision in {"copy", "direct stream"} or copy_present:
        return "direct_stream", PLAYBACK_PENALTIES["direct_stream"], ["Direct Stream"]
    if transcode_decision in {"direct play", "directplay"} or direct_play_present:
        return "direct_play", PLAYBACK_PENALTIES["direct_play"], ["Direct Play"]
    return "unknown", 0, ["Playback method unavailable"]


def compute_bitrate_ratio(session: Mapping[str, Any]) -> float | None:
    source = _safe_float(_first_present(session, "source_video_bitrate", "video_bitrate", "source_bitrate"))
    stream = _safe_float(_first_present(session, "stream_video_bitrate", "stream_bitrate"))
    if not source or not stream or source <= 0 or stream <= 0:
        return None
    ratio = stream / source
    if ratio <= 0:
        return None
    if ratio > 1.35:
        return None
    return min(ratio, 1.0)


def compute_resolution_drop(session: Mapping[str, Any]) -> tuple[int | None, str | None]:
    source_tier = _resolution_tier(_first_present(session, "source_video_resolution", "video_resolution"))
    stream_tier = _resolution_tier(_first_present(session, "stream_video_resolution", "stream_resolution"))
    if source_tier is None or stream_tier is None:
        return None, None
    drop = max(0, source_tier - stream_tier)
    if drop <= 0:
        return 0, None
    source_label = _pretty_resolution(_first_present(session, "source_video_resolution", "video_resolution"))
    stream_label = _pretty_resolution(_first_present(session, "stream_video_resolution", "stream_resolution"))
    return drop, f"Resolution reduced from {source_label} to {stream_label}"


def _speed_penalty(speed: float) -> int:
    for threshold, penalty in TRANSCODE_SPEED_PENALTIES:
        if speed >= threshold:
            return penalty
    return 45


def _bitrate_penalty(ratio: float) -> int:
    for threshold, penalty in BITRATE_RATIO_PENALTIES:
        if ratio >= threshold:
            return penalty
    return 35


def _status_for_score(score: int) -> str:
    for minimum, label in STATUS_BUCKETS:
        if score >= minimum:
            return label
    return "Critical"


def score_stream_session(session: Mapping[str, Any]) -> dict[str, Any]:
    """Infer stream health from normalized session delivery signals."""
    reasons: list[str] = []
    score = 100
    missing_speed = False
    missing_bitrate = False
    missing_resolution = False

    state = _clean_lower(_first_present(session, "state"))
    if state in ERROR_STATES or _truthy(_first_present(session, "error", "session_error", "has_error")):
        return {
            "streamHealthScore": 0,
            "streamHealthStatus": "Critical",
            "streamHealthReasons": ["Session error detected"],
            "streamHealthConfidence": "high",
        }

    playback_method, playback_penalty, playback_reasons = classify_playback_method(session)
    reasons.extend(playback_reasons)
    score -= playback_penalty

    transcode_active = playback_method in {"audio_transcode", "video_transcode", "video_audio_transcode"}
    transcode_speed = _safe_float(_first_present(session, "transcode_speed", "speed"))
    transcode_throttled = _truthy(_first_present(session, "transcode_throttled", "throttled"))

    if transcode_active:
        if transcode_speed is None:
            missing_speed = True
            reasons.append("Missing transcode speed")
        else:
            score -= _speed_penalty(transcode_speed)
            reasons.append(f"Transcode speed {transcode_speed:.2f}x")
            if transcode_throttled and transcode_speed >= 1.1:
                reasons.append("Transcode is throttled with healthy headroom")
    elif transcode_throttled:
        reasons.append("Playback is throttled")

    bitrate_ratio = compute_bitrate_ratio(session)
    if bitrate_ratio is None:
        missing_bitrate = True
    else:
        bitrate_penalty = _bitrate_penalty(bitrate_ratio)
        score -= bitrate_penalty
        if bitrate_penalty > 0:
            reasons.append(f"Bitrate reduced {round((1 - bitrate_ratio) * 100)}%")

    resolution_drop, resolution_reason = compute_resolution_drop(session)
    if resolution_drop is None:
        missing_resolution = True
    elif resolution_drop == 1:
        score -= 10
        reasons.append(resolution_reason)
    elif resolution_drop >= 2:
        score -= 22
        reasons.append(resolution_reason)

    location = _clean_lower(_first_present(session, "location"))
    if location == "wan" and bitrate_ratio is not None:
        for threshold, penalty in WAN_RATIO_PENALTIES:
            if bitrate_ratio < threshold:
                score -= penalty
                reasons.append("Remote session appears bitrate-constrained")
                break

    score = max(0, min(100, round(score)))

    if playback_method == "unknown":
        confidence = "low"
    elif transcode_active and missing_speed and missing_bitrate and missing_resolution:
        confidence = "low"
    elif missing_speed or missing_bitrate or missing_resolution:
        confidence = "medium"
    else:
        confidence = "high"

    return {
        "streamHealthScore": score,
        "streamHealthStatus": _status_for_score(score),
        "streamHealthReasons": reasons[:4],
        "streamHealthConfidence": confidence,
    }


def summarize_stream_health(sessions: list[Mapping[str, Any]]) -> dict[str, Any]:
    if not sessions:
        return {
            "avg_score": None,
            "status_counts": {"Excellent": 0, "Good": 0, "Watch": 0, "Poor": 0, "Critical": 0},
            "healthy_stream_count": 0,
            "critical_stream_count": 0,
        }

    scores = [session.get("streamHealthScore") for session in sessions if session.get("streamHealthScore") is not None]
    status_counts = {"Excellent": 0, "Good": 0, "Watch": 0, "Poor": 0, "Critical": 0}
    for session in sessions:
        status = session.get("streamHealthStatus")
        if status in status_counts:
            status_counts[status] += 1

    healthy = status_counts["Excellent"] + status_counts["Good"]
    return {
        "avg_score": round(sum(scores) / len(scores)) if scores else None,
        "status_counts": status_counts,
        "healthy_stream_count": healthy,
        "critical_stream_count": status_counts["Critical"],
    }


def normalize_tautulli_session(raw_session: Mapping[str, Any]) -> dict[str, Any]:
    """Normalize a Tautulli session into the app's stable session shape."""
    raw_bandwidth_kbps = _safe_float(_first_present(raw_session, "bandwidth"))
    source_video_bitrate = _safe_float(_first_present(raw_session, "source_video_bitrate", "video_bitrate", "source_bitrate"))
    stream_video_bitrate = _safe_float(_first_present(raw_session, "stream_video_bitrate", "stream_bitrate"))

    normalized = {
        "user": _clean_text(_first_present(raw_session, "friendly_name", "user")),
        "title": _clean_text(_first_present(raw_session, "full_title", "title")),
        "media_type": _clean_text(_first_present(raw_session, "media_type")),
        "state": _clean_text(_first_present(raw_session, "state")),
        "progress_pct": _safe_int(_first_present(raw_session, "progress_percent")) or 0,
        "transcode_decision": _clean_text(_first_present(raw_session, "transcode_decision")),
        "video_decision": _clean_text(_first_present(raw_session, "video_decision")),
        "audio_decision": _clean_text(_first_present(raw_session, "audio_decision")),
        "platform": _clean_text(_first_present(raw_session, "platform")),
        "player": _clean_text(_first_present(raw_session, "player")),
        "quality": _clean_text(_first_present(raw_session, "quality_profile")),
        "bandwidth_mbps": round(raw_bandwidth_kbps / 1000, 1) if raw_bandwidth_kbps is not None else None,
        "location": _clean_text(_first_present(raw_session, "location")),
        "transcode_speed": _safe_float(_first_present(raw_session, "transcode_speed", "speed")),
        "transcode_throttled": _truthy(_first_present(raw_session, "transcode_throttled", "throttled")),
        "source_video_bitrate": source_video_bitrate,
        "stream_video_bitrate": stream_video_bitrate,
        "source_video_resolution": _clean_text(_first_present(raw_session, "source_video_resolution", "video_resolution")),
        "stream_video_resolution": _clean_text(_first_present(raw_session, "stream_video_resolution", "stream_resolution")),
        "has_error": _truthy(_first_present(raw_session, "error", "session_error", "has_error")),
    }
    normalized.update(score_stream_session(normalized))
    return normalized
