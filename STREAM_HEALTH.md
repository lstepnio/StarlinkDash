# Stream Health Score

StarlinkDash includes an inferred stream health score for active Plex/Tautulli sessions.

This score is meant to answer a practical operator question:

- is this stream likely healthy right now?

It does **not** claim to be a perfect viewer QoE metric. It is a delivery-health estimate based on the session data that Plex and Tautulli expose.

## Output Per Session

Each active session includes:

- `streamHealthScore`
- `streamHealthStatus`
- `streamHealthReasons`
- `streamHealthConfidence`

Statuses map to score bands:

- `90–100`: `Excellent`
- `75–89`: `Good`
- `55–74`: `Watch`
- `35–54`: `Poor`
- `0–34`: `Critical`

## Signals Used

The model starts at `100` and subtracts penalties.

### Playback Method

- Direct Play: `0`
- Direct Stream / Copy: `8`
- Audio transcode only: `15`
- Video transcode: `30`
- Video + audio transcode: `40`

### Transcode Speed

Applied only when transcoding is active and a speed is available.

- `>= 1.5x`: `0`
- `1.1x to < 1.5x`: `8`
- `1.0x to < 1.1x`: `15`
- `0.85x to < 1.0x`: `30`
- `< 0.85x`: `45`

If transcode speed is missing, the score does not invent one. Confidence is reduced instead.

### Error State

If the session is clearly in an error state, the score is forced to `0`.

### Bitrate Reduction

When both source and delivered bitrates are available:

`bitrate_ratio = stream_video_bitrate / source_video_bitrate`

Penalties:

- `>= 0.85`: `0`
- `0.70 to < 0.85`: `5`
- `0.50 to < 0.70`: `12`
- `0.30 to < 0.50`: `22`
- `< 0.30`: `35`

### Resolution Reduction

The score compares broad resolution tiers rather than exact pixel math so the user-facing behavior stays intuitive:

- `4K -> 1080p`: one tier
- `1080p -> 720p`: one tier
- `4K -> 720p`: two tiers

Penalties:

- no drop: `0`
- one tier down: `10`
- two or more tiers down: `22`

### WAN Constraint Penalty

Remote sessions can receive a small extra penalty only when there is evidence that delivered bitrate is materially constrained relative to source bitrate.

This is intentionally conservative.

## Confidence

Confidence is not a hidden implementation detail. Missing data lowers confidence without automatically tanking the score.

- `high`: the model has the main delivery signals it expects
- `medium`: one or more supporting fields are missing
- `low`: playback classification is weak, or a transcode lacks the key fields needed to judge whether it is keeping up

## Current Limitations

- The score depends on the fields Tautulli exposes for the current session.
- It cannot observe end-user device decode problems, Wi-Fi issues in the client’s home, or subjective viewer perception.
- Some Plex/Tautulli installs expose richer bitrate and transcode metadata than others, which affects confidence.
- Throttling by itself is not treated as a problem; it is often normal when the transcode has buffered ahead.

## Implementation Notes

- Backend scoring logic lives in [backend/stream_health.py](/Users/lukasz.stepniowski/Development/StarlinkDash/backend/stream_health.py).
- Tautulli session normalization happens in [backend/app.py](/Users/lukasz.stepniowski/Development/StarlinkDash/backend/app.py).
- The active-session UI is rendered in [frontend/src/components/TautulliSection.jsx](/Users/lukasz.stepniowski/Development/StarlinkDash/frontend/src/components/TautulliSection.jsx).
