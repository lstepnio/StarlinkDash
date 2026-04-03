from backend.stream_health import normalize_tautulli_session, score_stream_session


def test_direct_play_scores_excellent():
    session = score_stream_session(
        {
            "transcode_decision": "direct play",
            "video_decision": "direct play",
            "audio_decision": "direct play",
            "source_video_bitrate": 12000,
            "stream_video_bitrate": 12000,
            "video_resolution": "1080p",
            "stream_video_resolution": "1080p",
        }
    )

    assert session["streamHealthScore"] == 100
    assert session["streamHealthStatus"] == "Excellent"
    assert session["streamHealthConfidence"] == "high"
    assert "Direct Play" in session["streamHealthReasons"]


def test_direct_stream_scores_good():
    session = score_stream_session(
        {
            "transcode_decision": "copy",
            "video_decision": "copy",
            "audio_decision": "direct play",
            "source_video_bitrate": 10000,
            "stream_video_bitrate": 10000,
            "video_resolution": "1080p",
            "stream_video_resolution": "1080p",
        }
    )

    assert session["streamHealthScore"] == 92
    assert session["streamHealthStatus"] == "Excellent"
    assert "Direct Stream" in session["streamHealthReasons"]


def test_audio_transcode_only_scores_good():
    session = score_stream_session(
        {
            "transcode_decision": "transcode",
            "audio_decision": "transcode",
            "video_decision": "direct play",
            "transcode_speed": 1.8,
            "source_video_bitrate": 8000,
            "stream_video_bitrate": 8000,
            "video_resolution": "1080p",
            "stream_video_resolution": "1080p",
        }
    )

    assert session["streamHealthScore"] == 85
    assert session["streamHealthStatus"] == "Good"
    assert "Audio transcoding" in session["streamHealthReasons"]


def test_video_transcode_with_good_speed_scores_watch():
    session = score_stream_session(
        {
            "transcode_decision": "transcode",
            "video_decision": "transcode",
            "audio_decision": "direct play",
            "transcode_speed": 1.6,
            "source_video_bitrate": 12000,
            "stream_video_bitrate": 7000,
            "video_resolution": "4k",
            "stream_video_resolution": "1080p",
        }
    )

    assert session["streamHealthScore"] == 48
    assert session["streamHealthStatus"] == "Poor"
    assert "Video transcoding" in session["streamHealthReasons"]
    assert "Transcode speed 1.60x" in session["streamHealthReasons"]


def test_video_transcode_with_bad_speed_scores_critical():
    session = score_stream_session(
        {
            "transcode_decision": "transcode",
            "video_decision": "transcode",
            "audio_decision": "transcode",
            "transcode_speed": 0.82,
            "source_video_bitrate": 20000,
            "stream_video_bitrate": 5000,
            "video_resolution": "4k",
            "stream_video_resolution": "720p",
        }
    )

    assert session["streamHealthScore"] == 0
    assert session["streamHealthStatus"] == "Critical"


def test_error_session_forces_zero():
    session = score_stream_session(
        {
            "state": "error",
            "transcode_decision": "direct play",
        }
    )

    assert session["streamHealthScore"] == 0
    assert session["streamHealthStatus"] == "Critical"
    assert session["streamHealthReasons"] == ["Session error detected"]


def test_missing_bitrate_fields_reduce_confidence_without_tanking_score():
    session = score_stream_session(
        {
            "transcode_decision": "direct play",
            "video_decision": "direct play",
            "audio_decision": "direct play",
            "video_resolution": "1080p",
            "stream_video_resolution": "1080p",
        }
    )

    assert session["streamHealthScore"] == 100
    assert session["streamHealthConfidence"] == "medium"


def test_missing_speed_reduces_confidence_for_transcode():
    session = score_stream_session(
        {
            "transcode_decision": "transcode",
            "video_decision": "transcode",
            "audio_decision": "direct play",
            "source_video_bitrate": 10000,
            "stream_video_bitrate": 8000,
            "video_resolution": "1080p",
            "stream_video_resolution": "1080p",
        }
    )

    assert session["streamHealthScore"] == 65
    assert session["streamHealthStatus"] == "Watch"
    assert session["streamHealthConfidence"] == "medium"
    assert "Missing transcode speed" in session["streamHealthReasons"]


def test_resolution_reduction_two_tiers_penalizes():
    session = score_stream_session(
        {
            "transcode_decision": "copy",
            "video_decision": "copy",
            "audio_decision": "direct play",
            "source_video_bitrate": 16000,
            "stream_video_bitrate": 8000,
            "video_resolution": "4k",
            "stream_video_resolution": "720p",
        }
    )

    assert session["streamHealthScore"] == 58
    assert session["streamHealthStatus"] == "Watch"
    assert "Resolution reduced from 4K to 720p" in session["streamHealthReasons"]


def test_normalize_tautulli_session_maps_aliases_and_scores():
    session = normalize_tautulli_session(
        {
            "friendly_name": "Alex",
            "full_title": "Movie Night",
            "media_type": "movie",
            "state": "playing",
            "progress_percent": "44",
            "transcode_decision": "copy",
            "platform": "Apple TV",
            "player": "Plex for tvOS",
            "location": "lan",
            "bandwidth": "4000",
            "video_bitrate": "12000",
            "stream_bitrate": "9000",
            "video_resolution": "1080",
            "stream_resolution": "720",
        }
    )

    assert session["user"] == "Alex"
    assert session["title"] == "Movie Night"
    assert session["progress_pct"] == 44
    assert session["bandwidth_mbps"] == 4.0
    assert session["streamHealthScore"] == 77
    assert session["streamHealthStatus"] == "Good"
