# Race clips

One short video per race segment, played after **Start race** and after each aid station
(owner request, 3 November 2026). Segment 1 runs from the start to aid station 1; the last segment
ends at the finish line. A missing clip is skipped (the game goes straight to the aid station).

    assets/race/clips/RACE-001/segment-1.mp4   start → aid station 1
    assets/race/clips/RACE-001/segment-2.mp4   aid station 1 → finish (Forest First Steps has 2 segments)

Segments per race: RACE-001…004: 2 · RACE-005, 006: 3 · RACE-007: 4 · RACE-008: 5 · RACE-009: 6 ·
RACE-010: 7 · RACE-011, 012: 8.

- **Format:** MP4 (H.264). A `.webm` with the same name is used first when present.
- **Picture:** vertical 9:16, 720 × 1280 (at most 1080 × 1920).
- **Length:** 4–8 seconds. **No sound** (phones only autoplay muted video).
- **Size:** aim for 3 MB or less per clip.
- **Poster (optional):** `segment-1.jpg` or `.webp`, shown while the video loads.

The player can skip a clip; with "reduce motion" on, clips are skipped. A clip that has not started
after 5 seconds is skipped too. Clips are only pictures: the segment is already run by the server.
