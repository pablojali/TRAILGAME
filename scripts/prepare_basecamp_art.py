#!/usr/bin/env python3
"""Prepares the owner's Base Camp art for the game (see docs/UI_ART_SPEC.md, Base Camp).

Trail Studio uploads every piece of the cabin (backgrounds, cabins, decor) to

    assets/ui/basecamp/source/{exterior|interior}/{art}.{png|jpg|jpeg|webp}

and this script writes what the game loads:

    assets/ui/basecamp/{exterior|interior}/{art}.webp

Transparency is kept (cabins and decor are drawn over the background). Pictures taller than
1600 px are scaled down to 1600 (the canvases are 3200 x 1600 outside, 2600 x 1600 inside). A WebP source is copied as it is.
Outputs whose source is gone are deleted, so the game never shows stale art. Run by CI before
every build; the originals are never modified. Needs Pillow:

    python3 scripts/prepare_basecamp_art.py
"""

import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "assets" / "ui" / "basecamp"
SOURCE = BASE / "source"
SCENES = ("exterior", "interior")
MAX_HEIGHT = 1600
QUALITY = 82
EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")


def prepare(source: Path, target: Path) -> None:
    if source.suffix == ".webp":
        shutil.copyfile(source, target)
        return
    with Image.open(source) as image:
        image = image.convert("RGBA" if image.mode in ("RGBA", "LA", "P") else "RGB")
        if image.height > MAX_HEIGHT:
            width = round(image.width * MAX_HEIGHT / image.height)
            image = image.resize((width, MAX_HEIGHT), Image.Resampling.LANCZOS)
        image.save(target, "WEBP", quality=QUALITY, method=6)


def main() -> None:
    for scene in SCENES:
        sources = SOURCE / scene
        targets = BASE / scene
        targets.mkdir(parents=True, exist_ok=True)
        wanted = set()
        for source in sorted(sources.glob("*")) if sources.exists() else []:
            if source.suffix.lower() not in EXTENSIONS:
                continue
            target = targets / f"{source.stem}.webp"
            wanted.add(target.name)
            prepare(source, target)
            print(f"basecamp: {scene}/{source.name} -> {scene}/{target.name}")
        for stale in targets.glob("*.webp"):
            if stale.name not in wanted:
                stale.unlink()
                print(f"basecamp: removed {scene}/{stale.name} (its source is gone)")


if __name__ == "__main__":
    main()
