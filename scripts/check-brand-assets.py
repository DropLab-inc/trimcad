"""Check that every generated brand image really carries the scissors artwork.

The tile is a flat dark teal, so the share of tile-coloured pixels and the share of bright
(pale teal) pixels together say whether an icon is the mark on its tile or something else.
"""
from pathlib import Path

from PIL import Image

names = [
    'favicon-16.png',
    'favicon-32.png',
    'favicon-48.png',
    'apple-touch-icon.png',
    'trimcad-logo-256.png',
    'og-card.png',
]

base = Path('public')
for name in names:
    path = base / name
    if not path.exists():
        print(f'  {name:26s} MISSING')
        continue
    im = Image.open(path).convert('RGB')
    px = list(im.getdata())
    tile = sum(1 for r, g, b in px if abs(r - 9) < 26 and abs(g - 44) < 26 and abs(b - 48) < 26) / len(px)
    ink = sum(1 for r, g, b in px if g > 120 and b > 120) / len(px)
    print(f'  {name:26s} {im.size[0]:>4}x{im.size[1]:<4} tile {tile * 100:5.1f}%  bright mark {ink * 100:5.1f}%')
