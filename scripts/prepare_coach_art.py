#!/usr/bin/env python3
"""Prepares the owner's Trail Coach portraits (owner request, 8 November 2026).

Each source in assets/coach is one skin tone, coach_{dark|asian|light}.jpg, with two round
portraits: the men's coach on top, the women's coach below, on black, with a light checkerboard
drawn where the background should be transparent. Each portrait becomes

    assets/coach/portraits/{men|women}_{dark|asian|light}.webp   (512 x 512, transparent)

keeping only the coach: outside the circle, the checkerboard reaching the circle's edge and the
large enclosed patches of checkerboard (between an arm and the body) become transparent. The originals are never modified. Needs Pillow; runs in CI like prepare_avatar_art.py.

    python3 scripts/prepare_coach_art.py
"""

import math
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "coach"
TARGET = SOURCE / "portraits"
SIZE = 512
TONES = ("dark", "asian", "light")
ENCLOSED_MIN = 600  # pixels in the source half (768 x 688)


def is_checker(pixel: tuple[int, int, int]) -> bool:
    """A checkerboard square: light grey or white, without colour."""
    r, g, b = pixel
    return min(r, g, b) >= 200 and max(r, g, b) - min(r, g, b) <= 12


def portrait(half: Image.Image) -> Image.Image:
    width, height = half.size
    pixels = half.load()
    # The circle: everything that is not the black surround.
    xs, ys = [], []
    for y in range(0, height, 2):
        for x in range(0, width, 2):
            if max(pixels[x, y]) > 24:
                xs.append(x)
                ys.append(y)
    left, right, top, bottom = min(xs), max(xs), min(ys), max(ys)
    cx, cy = (left + right) / 2, (top + bottom) / 2
    radius = min(right - left, bottom - top) / 2 - 3
    inside = lambda x, y: (x - cx) ** 2 + (y - cy) ** 2 <= radius**2

    # Checkerboard connected to the circle's edge (flood fill from just inside the edge).
    transparent = [[False] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()
    for step in range(720):
        angle = step / 720 * 2 * math.pi
        x = int(cx + (radius - 2) * math.cos(angle))
        y = int(cy + (radius - 2) * math.sin(angle))
        if 0 <= x < width and 0 <= y < height and is_checker(pixels[x, y]) and not transparent[y][x]:
            transparent[y][x] = True
            queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < width and 0 <= ny < height and not transparent[ny][nx] and inside(nx, ny) and is_checker(pixels[nx, ny]):
                transparent[ny][nx] = True
                queue.append((nx, ny))

    # Enclosed checkerboard (e.g. between an arm and the body): large light patches holding both
    # checker shades. Eyes, teeth and highlights are far smaller than ENCLOSED_MIN.
    seen = [row[:] for row in transparent]
    for y0 in range(height):
        for x0 in range(width):
            if seen[y0][x0] or not inside(x0, y0) or not is_checker(pixels[x0, y0]):
                continue
            component = [(x0, y0)]
            seen[y0][x0] = True
            index = 0
            while index < len(component):
                x, y = component[index]
                index += 1
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < width and 0 <= ny < height and not seen[ny][nx] and inside(nx, ny) and is_checker(pixels[nx, ny]):
                        seen[ny][nx] = True
                        component.append((nx, ny))
            if len(component) < ENCLOSED_MIN:
                continue
            grey = sum(1 for x, y in component if min(pixels[x, y]) < 244)
            if 0.2 <= grey / len(component) <= 0.8:
                for x, y in component:
                    transparent[y][x] = True

    out = Image.new("RGBA", (width, height))
    out_pixels = out.load()
    for y in range(height):
        for x in range(width):
            if inside(x, y) and not transparent[y][x]:
                r, g, b = pixels[x, y]
                out_pixels[x, y] = (r, g, b, 255)
    # A soft edge on the circle so the cut does not look jagged.
    mask = Image.new("L", (width * 4, height * 4), 0)
    ImageDraw.Draw(mask).ellipse(((cx - radius) * 4, (cy - radius) * 4, (cx + radius) * 4, (cy + radius) * 4), fill=255)
    mask = mask.resize((width, height), Image.LANCZOS)
    a = out.getchannel("A")
    out.putalpha(Image.composite(a, Image.new("L", out.size, 0), mask))
    box = (int(cx - radius), int(cy - radius), int(cx + radius), int(cy + radius))
    return out.crop(box).resize((SIZE, SIZE), Image.LANCZOS)


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    written = set()
    for tone in TONES:
        path = SOURCE / f"coach_{tone}.jpg"
        if not path.exists():
            print(f"missing {path.relative_to(ROOT)}")
            continue
        image = Image.open(path).convert("RGB")
        width, height = image.size
        for sex, box in (("men", (0, 0, width, height // 2)), ("women", (0, height // 2, width, height))):
            out = TARGET / f"{sex}_{tone}.webp"
            portrait(image.crop(box)).save(out, "WEBP", quality=88, method=6)
            written.add(out)
            print(f"{path.relative_to(ROOT)} ({sex}) -> {out.relative_to(ROOT)} ({out.stat().st_size // 1024} kB)")
    for stale in set(TARGET.glob("*.webp")) - written:
        stale.unlink()
        print(f"removed {stale.relative_to(ROOT)} (no source)")


if __name__ == "__main__":
    main()
