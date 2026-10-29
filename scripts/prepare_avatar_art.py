#!/usr/bin/env python3
"""Prepares the owner's layered avatar artwork for the game.

Reads the original PNGs (all on the same 1024x1536 transparent canvas) and writes WebP layers on a
640x960 canvas, keeping the alignment between bodies, clothing and footwear:

    assets/runner/bodies/*.png    -> assets/runner/avatar/bodies/{sex}-{tone}.webp
    assets/runner/clothing/*.png  -> assets/runner/avatar/clothing/{id}.webp
    assets/runner/footwear/*.png  -> assets/runner/avatar/footwear/{id}.webp

The originals are never modified. Needs Pillow: pip install pillow

    python3 scripts/prepare_avatar_art.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "runner"
TARGET = ROOT / "assets" / "runner" / "avatar"
SIZE = (640, 960)
QUALITY = 88

# Bodies ordered by measured skin lightness, lightest first (tone 1).
BODIES = {
    "female-1": "bodies/woman_03.png",
    "female-2": "bodies/woman_02.png",
    "female-3": "bodies/woman_01.png",
    "male-1": "bodies/mens_04.png",
    "male-2": "bodies/mens_03.png",
    "male-3": "bodies/mens_02.png",
    "male-4": "bodies/male_01.png",
}
CLOTHING = {"white-tshirt": "clothing/male_white_shirt_01.png"}
FOOTWEAR = {"starter-shoes": "footwear/starter_shoes_01.png"}

# Leftover white patch next to the neck of woman_03 (source pixels, inclusive box).
CLEANUP = {"bodies/woman_03.png": [(528, 228, 610, 302)]}


def clean(image: Image.Image, boxes) -> Image.Image:
    """Makes near-white or light-grey pixels inside each box fully transparent."""
    pixels = image.load()
    for left, top, right, bottom in boxes:
        for y in range(top, bottom + 1):
            for x in range(left, right + 1):
                r, g, b, a = pixels[x, y]
                if a and min(r, g, b) > 150 and max(r, g, b) - min(r, g, b) < 40:
                    pixels[x, y] = (0, 0, 0, 0)
    return image


def prepare(name: str, source: str, folder: str) -> None:
    image = Image.open(SOURCE / source).convert("RGBA")
    if image.size != (1024, 1536):
        raise SystemExit(f"{source}: expected a 1024x1536 canvas, got {image.size}")
    image = clean(image, CLEANUP.get(source, []))
    out = TARGET / folder / f"{name}.webp"
    out.parent.mkdir(parents=True, exist_ok=True)
    image.resize(SIZE, Image.LANCZOS).save(out, "WEBP", quality=QUALITY, method=6)
    print(f"{source} -> {out.relative_to(ROOT)} ({out.stat().st_size // 1024} kB)")


def main() -> None:
    for name, source in BODIES.items():
        prepare(name, source, "bodies")
    for name, source in CLOTHING.items():
        prepare(name, source, "clothing")
    for name, source in FOOTWEAR.items():
        prepare(name, source, "footwear")


if __name__ == "__main__":
    main()
