"""Derive the app's brand images from the master logo.

`public/trimcad-logo.png` is the master and is never touched by this script. It is
a 1024px lockup — a drawing on top, "TrimCAD" underneath — drawn as a dark rounded
square on pure white. Three things about it decide what the derived files look
like:

  * the white surround is 19px in from the edge (MARGIN);
  * the chip's corners are rounded by 18.8% of its width (RADIUS_FRACTION);
  * the lockup is too busy below about 100px: at 32px the wordmark is a smear and
    the drawing is half the size it could be, so the small sizes use the drawing
    alone (MARK_BOX).

The numbers are measured, not guessed: `scripts/inspect-logo.py` re-measures them
and prints the mark's box if the master is replaced.

    python3 scripts/make-logo-derivatives.py
"""

from PIL import Image, ImageDraw

SOURCE = "public/trimcad-logo.png"
MARGIN = 19
RADIUS_FRACTION = 0.188
MARK_BOX = (202, 122, 816, 736)  # the drawing alone, in master coordinates

# The lockup, at the sizes where its wordmark is legible.
LOCKUP = {
    "public/trimcad-logo-180.png": 180,  # home-screen icon, Support page mark
}

# The drawing alone, for anything the size of a title bar or a browser tab.
MARK = {
    "public/trimcad-mark-64.png": 64,  # title bar (32px at 2x)
    "public/favicon-48.png": 48,
    "public/favicon-32.png": 32,
    "public/favicon-16.png": 16,
}


def rounded(image: Image.Image, size: int) -> Image.Image:
    """Scale to size, corners cut to the chip's own radius, everything else transparent."""
    scaled = image.resize((size, size), Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=round(size * RADIUS_FRACTION), fill=255
    )
    scaled.putalpha(mask)
    return scaled


master = Image.open(SOURCE).convert("RGB")
artwork = master.crop((MARGIN, MARGIN, master.width - MARGIN, master.height - MARGIN))
mark = master.crop(MARK_BOX)
print(f"master {master.size}; artwork {artwork.size}; mark {mark.size}")

for path, size in LOCKUP.items():
    rounded(artwork, size).save(path, optimize=True)
    print(f"  wrote {path} ({size}x{size}, full lockup)")

for path, size in MARK.items():
    rounded(mark, size).save(path, optimize=True)
    print(f"  wrote {path} ({size}x{size}, mark only)")

# A multi-resolution .ico: 16 for the tab, 32 for a bookmark, 48 for a shortcut.
rounded(mark, 48).save("public/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
print("  wrote public/favicon.ico (16, 32, 48)")
