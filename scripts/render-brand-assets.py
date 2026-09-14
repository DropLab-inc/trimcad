"""Derive TrimCAD's brand images from the master logo.

The master is `public/trimcad-logo-scissors.png`: a 1024px mark-only icon — the scissors
drawing centred on a dark teal tile (RGB 9,44,48) — with the tile's corners rounded by
19.7% of the side and pure black outside them. The master is never edited here.

Three decisions, all measured rather than guessed:

  * the corners are masked to the artwork's own radius, so the black outside the tile
    becomes transparency instead of showing as a black square on a light surface;
  * the home-screen icon is full-bleed and square, because iOS applies its own mask and
    a twice-rounded corner looks like a mistake;
  * every size is drawn from the 1024 master with Lanczos, so nothing is upscaled.

    python3 scripts/render-brand-assets.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SOURCE = 'public/trimcad-logo-scissors.png'
RADIUS_FRACTION = 0.197   # measured: the tile's corner radius, 202px of 1024
TILE = (9, 44, 48, 255)   # the tile colour, for the icons that must be full-bleed
INK = (241, 247, 248)
ACCENT = (53, 200, 210)
SURFACE = (12, 22, 29)

# Measured on the master: the scissors sits in rows 240-767 and columns 254-770, so the
# drawing fills only half the tile. Framing it tighter is the difference between a legible
# 16px icon and a smudge, and it is framing, not redrawing: the artwork is untouched.
MARK_BOX = (254, 240, 770, 767)
MARK_MARGIN = 0.14        # breathing room around the drawing, as a fraction of its size

master = Image.open(SOURCE).convert('RGBA')


def framed() -> Image.Image:
    """The master re-framed around the drawing, on its own tile colour."""
    left, top, right, bottom = MARK_BOX
    side = max(right - left, bottom - top)
    margin = round(side * MARK_MARGIN)
    centre_x = (left + right) // 2
    centre_y = (top + bottom) // 2
    half = side // 2 + margin
    box = (centre_x - half, centre_y - half, centre_x + half, centre_y + half)

    # The crop is interior, so it is all tile — no black edge survives to fringe on a light
    # background once the corners are cut.
    canvas = Image.new('RGB', (half * 2, half * 2), TILE[:3])
    canvas.paste(master.crop(box), (0, 0))
    return canvas.convert('RGBA')


framed_master = framed()


def rounded(image: Image.Image, size: int, radius_fraction: float = RADIUS_FRACTION) -> Image.Image:
    """Scale to size with the tile's corners cut to its own radius."""
    scaled = image.resize((size, size), Image.LANCZOS)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=round(size * radius_fraction), fill=255
    )
    scaled.putalpha(mask)
    return scaled


# Browser tab, bookmark, desktop shortcut.
for size in (16, 32, 48):
    rounded(framed_master, size).save(f'public/favicon-{size}.png', optimize=True)
    print(f'  public/favicon-{size}.png')
rounded(framed_master, 256).save('public/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
print('  public/favicon.ico (16, 32, 48)')

# In the app: the title bar draws it at 30px, the Support hero at 76px.
rounded(framed_master, 256).save('public/trimcad-logo-256.png', optimize=True)
print('  public/trimcad-logo-256.png')

# Home screen: square and full-bleed. iOS masks the corners itself, so the tile is drawn to
# the edge and only the artwork's own rounding is applied on top of it.
flat = Image.new('RGB', (180, 180), TILE[:3])
flat.paste(framed_master.resize((180, 180), Image.LANCZOS), (0, 0), rounded(framed_master, 180))
flat.save('public/apple-touch-icon.png', optimize=True)
print('  public/apple-touch-icon.png (180, full bleed)')

# Social preview: the one place a wordmark earns its keep.
#
# The file name is load-bearing: crawlers (Telegram, Slack, X) cache a preview against the image
# URL and will keep showing a retired card for a long time. Changing this name — and the og:image
# in index.html with it — is how a new card reaches them.
FONTS = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
]
font_path = next((p for p in FONTS if Path(p).exists()), None)
if font_path is None:
    print('  skipped public/og-card.png: no font file found')
else:
    W, H = 1200, 630
    card = Image.new('RGB', (W, H), SURFACE)
    pen = ImageDraw.Draw(card)
    pen.rectangle([0, 0, W, 8], fill=ACCENT)

    mark = rounded(framed_master, 340)
    card.paste(mark, (96, 145), mark)

    wordmark = ImageFont.truetype(font_path, 112)
    tagline = ImageFont.truetype(font_path, 34)
    pen.text((500, 250), 'Trim', font=wordmark, fill=INK)
    width = pen.textlength('Trim', font=wordmark)
    pen.text((500 + width, 250), 'CAD', font=wordmark, fill=ACCENT)
    pen.text((504, 396), '2D CAD drafting in the browser', font=tagline, fill=(143, 179, 187))

    card.save('public/og-card.png', optimize=True)
    print('  public/og-card.png (1200x630)')
