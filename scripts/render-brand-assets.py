"""Render the brand's raster files from the mark's own geometry.

`public/logo.svg` is the source of truth and the file the app and the browser tab
use. Some places still want a bitmap — the .ico fallback, the home-screen icon, the
social preview — and this draws them from the same numbers, supersampled 8x and
reduced with Lanczos so the small sizes are sharp rather than jagged.

If the mark changes, change it in `public/logo.svg` and in the constants below
together; the SVG is what everything else is measured against.

    python3 scripts/render-brand-assets.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# The mark, in the SVG's own 64-unit viewBox.
BOX = 64
RADIUS = 15
TILE = (53, 200, 210, 255)   # --accent
GLYPH = (12, 22, 29, 255)    # --chip
HEAD = (15, 16, 34, 10)      # x, y, w, h
STEM = (26.5, 26, 11, 21)
SUPERSAMPLE = 8


def draw(size, radius_units=RADIUS, background=None):
    """The mark at `size` px, drawn big and reduced so the edges are clean."""
    scale = size * SUPERSAMPLE / BOX
    big = Image.new("RGBA", (size * SUPERSAMPLE, size * SUPERSAMPLE), background or (0, 0, 0, 0))
    pen = ImageDraw.Draw(big)

    def box(rect):
        x, y, w, h = rect
        return [c * scale for c in (x, y, x + w, y + h)]

    pen.rounded_rectangle(
        [0, 0, size * SUPERSAMPLE - 1, size * SUPERSAMPLE - 1],
        radius=radius_units * scale,
        fill=TILE,
    )
    pen.rectangle(box(HEAD), fill=GLYPH)
    pen.rectangle(box(STEM), fill=GLYPH)
    return big.resize((size, size), Image.LANCZOS)


# Browser tab, bookmark, desktop shortcut.
for size in (16, 32, 48):
    draw(size).save(f"public/favicon-{size}.png", optimize=True)
    print(f"  public/favicon-{size}.png")

# A multi-resolution .ico for the older paths that still look for one, built from
# the artwork at full size so each layer is drawn by PIL rather than resampled.
draw(256).save("public/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
print("  public/favicon.ico (16, 32, 48)")

# Home-screen icon: square and full-bleed, because iOS applies its own mask and
# double-rounded corners look like a mistake.
draw(180, radius_units=0).save("public/apple-touch-icon.png", optimize=True)
print("  public/apple-touch-icon.png")

# Social preview: the one place a wordmark helps, since it is seen large and in a
# feed next to other people's cards. Needs a real font file; skipped without one.
FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]
font_path = next((path for path in FONT_PATHS if Path(path).exists()), None)
if font_path is None:
    print("  skipped public/og.png: no font file found")
else:
    W, H = 1200, 630
    card = Image.new("RGB", (W, H), (12, 22, 29))
    pen = ImageDraw.Draw(card)
    pen.rectangle([0, 0, W, 8], fill=TILE)
    card.paste(draw(150), (96, 210), draw(150))

    wordmark = ImageFont.truetype(font_path, 104)
    tagline = ImageFont.truetype(font_path, 34)
    pen.text((296, 236), "Trim", font=wordmark, fill=(241, 247, 248))
    width = pen.textlength("Trim", font=wordmark)
    pen.text((296 + width, 236), "CAD", font=wordmark, fill=TILE)
    pen.text((300, 372), "2D CAD drafting in the browser", font=tagline, fill=(143, 179, 187))

    card.save("public/og.png", optimize=True)
    print("  public/og.png (1200x630)")
