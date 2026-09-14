"""Derive a small PNG for the in-app logo and the touch icon.

The repository asset is a 1024x1024 JPEG (named .png), which is right for a
social preview and far too much to hand a phone that displays it at 76 pixels.
"""

from PIL import Image

source = Image.open("public/trimcad-logo.png").convert("RGB")
print("source:", source.size, source.mode)
small = source.resize((180, 180), Image.LANCZOS)
small.save("public/trimcad-logo-180.png", format="PNG", optimize=True)
print("wrote public/trimcad-logo-180.png", small.size)
