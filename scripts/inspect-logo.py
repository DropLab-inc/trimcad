"""Locate the mark inside the logo lockup, and cut a square that holds it.

The master is a lockup: a drawing on top, the word "TrimCAD" underneath. At 32px
the wordmark is an unreadable smear and the drawing is half the size it could be,
so the small sizes want the drawing alone — still on the logo's own chip, just
cropped, nothing redrawn.

Ink is measured against the chip colour rather than a fixed threshold, and the
outer edge is ignored because the chip's anti-aliased border reads as ink.
"""

from collections import Counter

from PIL import Image

im = Image.open("public/trimcad-logo.png").convert("RGB")
W, H = im.size
EDGE = int(W * 0.12)  # skip the chip's border and its anti-aliasing

interior = im.crop((EDGE, EDGE, W - EDGE, H - EDGE))
chip = Counter(interior.getpixel((x, y)) for y in range(0, interior.height, 4) for x in range(0, interior.width, 4)).most_common(1)[0][0]


def is_ink(pixel):
    return sum((a - b) ** 2 for a, b in zip(pixel, chip)) ** 0.5 > 70


ink_rows = [y for y in range(interior.height) if any(is_ink(interior.getpixel((x, y))) for x in range(0, interior.width, 2))]
bands: list[tuple[int, int]] = []
start = previous = ink_rows[0]
for y in ink_rows[1:]:
    if y - previous > 12:
        bands.append((start, previous))
        start = y
    previous = y
bands.append((start, previous))

print("chip colour:", chip)
print("bands inside the interior (top, bottom, height):")
for top, bottom in bands:
    print(f"  {top:4d} {bottom:4d}  {bottom - top + 1:4d}")

# The wordmark is the lower band; the mark is the tallest band above it.
mark_band = max(bands[:-1], key=lambda band: band[1] - band[0]) if len(bands) > 1 else bands[0]
ink_cols = [
    x
    for x in range(interior.width)
    if any(is_ink(interior.getpixel((x, y))) for y in range(mark_band[0], mark_band[1] + 1, 2))
]
print(f"mark band rows {mark_band}, columns {ink_cols[0]}..{ink_cols[-1]} inside the interior")

# Back to master coordinates, then square it around the drawing's centre.
left = EDGE + ink_cols[0]
right = EDGE + ink_cols[-1]
top = EDGE + mark_band[0]
bottom = EDGE + mark_band[1]
print(f"mark box in the master: x {left}..{right}, y {top}..{bottom}")

cx, cy = (left + right) // 2, (top + bottom) // 2
# A square that holds the drawing with a little air, but never reaches the
# wordmark band below it or the chip's edge above it.
wordmark_top = EDGE + bands[1][0] if len(bands) > 1 else H
desired = int(max(right - left, bottom - top) / 2 * 1.18)
half = min(desired, cy - EDGE, max(0, wordmark_top - 6 - cy))
box = (cx - half, cy - half, cx + half, cy + half)
print(f"mark box: x {left}..{right}, y {top}..{bottom}")
print(f"wordmark starts at y={wordmark_top}; square half {half} (wanted {desired})")
print("square crop:", box, "side", box[2] - box[0])

im.crop(box).save("/tmp/logo-mark-source.png")
print("wrote /tmp/logo-mark-source.png for inspection")
