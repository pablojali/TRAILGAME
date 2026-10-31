#!/usr/bin/env python3
"""Prepares the owner's layered avatar artwork for the game (see docs/AVATAR_ART_SPEC.md).

Reads the original PNGs (all on the same 1024x1536 transparent canvas) and writes WebP layers on a
640x960 canvas, keeping the alignment between all parts:

    bodies/{men|women}_body_01_tone{n}.png         -> avatar/bodies/{male|female}-{n}.webp
    heads/lvl{L}_{men|women}_head_{NN}_tone{n}.png -> avatar/heads/lvl{L}_{men|women}_head_{NN}_tone{n}.webp
    Clothing/lvl{L}_{men|women}_shirt_{NN}.png     -> avatar/clothing/lvl{L}_{men|women}_shirt_{NN}.webp
    footwear/{source}.png                          -> avatar/footwear/{item id}.webp (FOOTWEAR below)

Heads and shirts keep their file name: the game reads level, sex, design (and tone) from it. They are cleaned
on the way, because they were cut out of a white background:
  - loose specks (small separate blobs) are removed;
  - leftover white is taken out of the semi-transparent edge, and near-white edge pixels are
    dropped;
  - the bottom of the neck fades out over a few pixels, so the join with the body's neck does not
    show as a line.

Shirts and shoes arrive with clean edges and are only converted. Shoe art is named by the
equipment item it shows; a source not listed in FOOTWEAR is reported and skipped. Outputs whose
source is gone (renamed or removed art) are deleted, so the game never shows stale layers.

The originals are never modified. Needs Pillow:
pip install pillow

    python3 scripts/prepare_avatar_art.py
"""

import re
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "runner"
TARGET = SOURCE / "avatar"
CANVAS = (1024, 1536)
SIZE = (640, 960)
QUALITY = 88

BODY_NAME = re.compile(r"^(men|women)_body_01_tone(\d)\.png$")
HEAD_NAME = re.compile(r"^lvl(\d+)_(men|women)_head_(\d{2})_tone(\d)\.png$")
SHIRT_NAME = re.compile(r"^lvl(\d+)_(men|women)_shirt_(\d{2})\.png$")
# Shoe art by equipment item id (owner decision, 31 October 2026). lvl3_shoes_01 has no shop item
# yet; it is prepared so it is ready when one is added.
FOOTWEAR = {
    "starter-shoes": "footwear/starter_shoes_01.png",
    "trail-shoes-basic": "footwear/lvl1_shoes_01.png",
    "trail-shoes": "footwear/lvl2_shoes_01.png",
    "trail-shoes-light": "footwear/lvl2_shoes_02.png",
    "lvl3-shoes-01": "footwear/lvl3_shoes_01.png",
}
SEX = {"men": "male", "women": "female"}

# Head cleanup (source pixels).
MIN_BLOB_SHARE = 0.02  # blobs smaller than 2 % of the largest one are specks
NECK_FADE_PX = 22  # the lowest pixels of each column fade out over this height
EDGE_PASSES = 2  # near-white edge pixels are peeled this many times (halos up to 2 px)


def load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise SystemExit(f"{path.name}: expected a 1024x1536 canvas, got {image.size}")
    return image


WRITTEN: set[Path] = set()


def save(image: Image.Image, folder: str, name: str, source: Path) -> None:
    out = TARGET / folder / f"{name}.webp"
    out.parent.mkdir(parents=True, exist_ok=True)
    WRITTEN.add(out)
    image.resize(SIZE, Image.LANCZOS).save(out, "WEBP", quality=QUALITY, method=6)
    print(f"{source.relative_to(SOURCE)} -> {out.relative_to(ROOT)} ({out.stat().st_size // 1024} kB)")


def remove_specks(image: Image.Image) -> int:
    """Clears visible blobs much smaller than the largest one. Returns the pixels cleared."""
    pixels = image.load()
    left, top, right, bottom = image.getbbox()
    seen = set()
    blobs = []
    for y in range(top, bottom):
        for x in range(left, right):
            if (x, y) in seen or pixels[x, y][3] == 0:
                continue
            blob, queue = [], deque([(x, y)])
            seen.add((x, y))
            while queue:
                cx, cy = queue.popleft()
                blob.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if left <= nx < right and top <= ny < bottom and (nx, ny) not in seen and pixels[nx, ny][3]:
                        seen.add((nx, ny))
                        queue.append((nx, ny))
            blobs.append(blob)
    largest = max(len(b) for b in blobs)
    cleared = 0
    for blob in blobs:
        if len(blob) < largest * MIN_BLOB_SHARE:
            for x, y in blob:
                pixels[x, y] = (0, 0, 0, 0)
            cleared += len(blob)
    return cleared


def defringe(image: Image.Image) -> None:
    """Takes the white background out of semi-transparent pixels and peels near-white edge pixels."""
    pixels = image.load()
    width, height = image.size
    left, top, right, bottom = image.getbbox()
    for y in range(top, bottom):
        for x in range(left, right):
            r, g, b, a = pixels[x, y]
            if 0 < a < 255:
                alpha = a / 255
                # The edge was blended over white: colour = true · alpha + 255 · (1 − alpha).
                r, g, b = (max(0, min(255, round((c - 255 * (1 - alpha)) / alpha))) for c in (r, g, b))
                pixels[x, y] = (r, g, b, a)
    for _ in range(EDGE_PASSES):
        peel = []
        for y in range(top, bottom):
            for x in range(left, right):
                r, g, b, a = pixels[x, y]
                if a == 0 or min(r, g, b) <= 165 or max(r, g, b) - min(r, g, b) >= 40:
                    continue
                if any(
                    not (0 <= nx < width and 0 <= ny < height) or pixels[nx, ny][3] == 0
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                ):
                    peel.append((x, y))
        for x, y in peel:
            pixels[x, y] = (0, 0, 0, 0)


def fade_neck(image: Image.Image) -> None:
    """Fades the lowest NECK_FADE_PX pixels of each column, so the head blends into the body."""
    pixels = image.load()
    left, top, right, bottom = image.getbbox()
    for x in range(left, right):
        lowest = next((y for y in range(bottom - 1, top - 1, -1) if pixels[x, y][3]), None)
        if lowest is None:
            continue
        for step in range(NECK_FADE_PX):
            y = lowest - step
            r, g, b, a = pixels[x, y]
            pixels[x, y] = (r, g, b, round(a * (step + 1) / (NECK_FADE_PX + 1)))


def main() -> None:
    for path in sorted((SOURCE / "bodies").glob("*.png")):
        match = BODY_NAME.match(path.name)
        if not match:
            print(f"skipped {path.name}: not named {{men|women}}_body_01_tone{{n}}.png")
            continue
        sex, tone = match.groups()
        save(load(path), "bodies", f"{SEX[sex]}-{tone}", path)
    for path in sorted((SOURCE / "heads").glob("*.png")):
        if not HEAD_NAME.match(path.name):
            print(f"skipped {path.name}: not named lvl{{L}}_{{men|women}}_head_{{NN}}_tone{{n}}.png")
            continue
        image = load(path)
        specks = remove_specks(image)
        defringe(image)
        fade_neck(image)
        if specks:
            print(f"  {path.name}: removed {specks} speck pixels")
        save(image, "heads", path.stem, path)
    for path in sorted((SOURCE / "Clothing").glob("*.png")):
        if not SHIRT_NAME.match(path.name):
            print(f"skipped {path.name}: not named lvl{{L}}_{{men|women}}_shirt_{{NN}}.png")
            continue
        save(load(path), "clothing", path.stem, path)
    for name, source in FOOTWEAR.items():
        save(load(SOURCE / source), "footwear", name, SOURCE / source)
    listed = {Path(source).name for source in FOOTWEAR.values()}
    for path in sorted((SOURCE / "footwear").glob("*.png")):
        if path.name not in listed:
            print(f"skipped footwear/{path.name}: not assigned to an item in FOOTWEAR")
    for stale in sorted(set(TARGET.rglob("*.webp")) - WRITTEN):
        stale.unlink()
        print(f"removed {stale.relative_to(ROOT)} (no source)")


if __name__ == "__main__":
    main()
