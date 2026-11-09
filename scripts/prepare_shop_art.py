#!/usr/bin/env python3
"""Shop pictures without their empty margins (owner request, 9 November 2026: bigger shop images).

The owner's shop pictures (assets/ui/thumbnails/*.png) and the ones cut from the avatar art
(assets/ui/equipment/*.webp, from prepare_avatar_art.py) are 512 x 512 with the item somewhere
inside. Each one is cropped to the item itself plus a small margin and saved as

    assets/ui/shop/{name}.webp

so the cards can show the item as large as they allow. The originals are never modified. Needs
Pillow; runs in CI after prepare_avatar_art.py.

    python3 scripts/prepare_shop_art.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [ROOT / "assets" / "ui" / "thumbnails", ROOT / "assets" / "ui" / "equipment"]
TARGET = ROOT / "assets" / "ui" / "shop"
MARGIN = 0.04
MAX_SIDE = 400


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    written = set()
    for folder in SOURCES:
        for path in sorted([*folder.glob("*.png"), *folder.glob("*.webp")]):
            out = TARGET / f"{path.stem}.webp"
            image = Image.open(path).convert("RGBA")
            # Ignore nearly invisible pixels (soft shadows, compression noise) when finding the item.
            box = image.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox()
            if box is None:
                continue
            left, top, right, bottom = box
            pad = round(max(right - left, bottom - top) * MARGIN)
            box = (max(0, left - pad), max(0, top - pad), min(image.width, right + pad), min(image.height, bottom + pad))
            item = image.crop(box)
            item.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
            item.save(out, "WEBP", quality=90, method=6)
            written.add(out)
            print(f"{path.relative_to(ROOT)} -> {out.relative_to(ROOT)} {item.size[0]}x{item.size[1]}")
    for stale in set(TARGET.glob("*.webp")) - written:
        stale.unlink()
        print(f"removed {stale.relative_to(ROOT)} (no source)")


if __name__ == "__main__":
    main()
