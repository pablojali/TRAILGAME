"""Prepare a runner creation illustration for the game.

Removes a plain white/light background (only the area connected to the image border), crops to the
runner and places it on a transparent 2:3 canvas with consistent framing, then saves WebP with alpha.

Usage: python3 scripts/prepare_creation_art.py <input image> <output .webp>
Example: python3 scripts/prepare_creation_art.py assets/runner/Climber_women.jpg \
             assets/runner/creation/female/climber.webp
Requires Pillow (pip install pillow). Development tool only; not used by the app at runtime.
"""

import sys
from collections import deque

from PIL import Image, ImageFilter

CANVAS = (640, 960)  # 2:3, as in docs/UI_IMPROVEMENTS.md
MARGIN = 0.04  # free space around the runner, as a fraction of the canvas
BACKGROUND_MIN = 222  # a pixel is background-like if all channels are at least this light...
BACKGROUND_SPREAD = 28  # ...and it is close to grey (max - min channel)
MIN_ENCLOSED_FRACTION = 0.0010  # enclosed light regions at least this share of the image are background


def background_mask(img: Image.Image) -> list[bool]:
    """Background-like pixels: every light region connected to the border (flood fill), plus enclosed
    light regions large enough to be background seen between limbs and poles. Small light areas inside
    the runner (highlights) are kept."""
    w, h = img.size
    px = img.load()
    light = [False] * (w * h)
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y][:3]
            light[y * w + x] = min(r, g, b) >= BACKGROUND_MIN and max(r, g, b) - min(r, g, b) <= BACKGROUND_SPREAD

    background = [False] * (w * h)
    seen = [False] * (w * h)
    min_enclosed = int(w * h * MIN_ENCLOSED_FRACTION)
    for start in range(w * h):
        if seen[start] or not light[start]:
            continue
        # Collect one connected light region.
        region, touches_border = [], False
        queue = deque([start])
        seen[start] = True
        while queue:
            i = queue.popleft()
            region.append(i)
            x, y = i % w, i // w
            if x in (0, w - 1) or y in (0, h - 1):
                touches_border = True
            for j in (i - 1 if x > 0 else -1, i + 1 if x < w - 1 else -1, i - w, i + w):
                if 0 <= j < w * h and not seen[j] and light[j]:
                    seen[j] = True
                    queue.append(j)
        if touches_border or len(region) >= min_enclosed:
            for i in region:
                background[i] = True
    return background


def main(src: str, dst: str) -> None:
    img = Image.open(src).convert('RGB')
    w, h = img.size
    bg = background_mask(img)

    alpha = Image.new('L', (w, h))
    alpha.putdata([0 if is_bg else 255 for is_bg in bg])
    # Soften the cut-out edge slightly to avoid jagged outlines.
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))

    # Remove the white fringe from semi-transparent edge pixels (un-premultiply against white).
    rgba = img.convert('RGBA')
    px, ap = rgba.load(), alpha.load()
    for y in range(h):
        for x in range(w):
            a = ap[x, y]
            r, g, b, _ = px[x, y]
            if 0 < a < 255:
                f = a / 255
                r, g, b = (max(0, min(255, round((c - (1 - f) * 255) / f))) for c in (r, g, b))
            px[x, y] = (r, g, b, a)

    runner = rgba.crop(alpha.point(lambda v: 255 if v > 8 else 0).getbbox())
    cw, ch = CANVAS
    scale = min(cw * (1 - 2 * MARGIN) / runner.width, ch * (1 - 2 * MARGIN) / runner.height)
    runner = runner.resize((round(runner.width * scale), round(runner.height * scale)), Image.LANCZOS)

    canvas = Image.new('RGBA', CANVAS, (0, 0, 0, 0))
    # Centred horizontally; feet on the same baseline for every image.
    canvas.paste(runner, ((cw - runner.width) // 2, round(ch * (1 - MARGIN)) - runner.height), runner)
    canvas.save(dst, 'WEBP', quality=88, method=6)
    print(f'{src} ({w}x{h}) -> {dst} ({cw}x{ch}), runner {runner.width}x{runner.height}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
