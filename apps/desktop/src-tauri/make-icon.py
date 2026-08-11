"""Produce a market-style rounded (squircle) app icon from the raw logo art.

Steps:
1. Trim the opaque black margin around the rounded tile.
2. Center-crop to a square.
3. Apply a supersampled superellipse (squircle) alpha mask -> transparent corners.
"""
from PIL import Image
import numpy as np
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else "flux-logo-source-raw.png"
OUT = sys.argv[2] if len(sys.argv) > 2 else "flux-logo-source.png"
SIZE = 1024
SS = 4  # supersample factor for smooth edges
N = 5.0  # superellipse exponent (Apple squircle ~5)

img = Image.open(SRC).convert("RGB")

# --- 1. trim near-black margin ---
gray = img.convert("L")
bbox = gray.point(lambda p: 255 if p > 10 else 0).getbbox()
if bbox:
    img = img.crop(bbox)
print("trimmed bbox:", bbox, "-> size", img.size)

# --- 2. center to square ---
w, h = img.size
side = max(w, h)
square = Image.new("RGB", (side, side), (0, 0, 0))
square.paste(img, ((side - w) // 2, (side - h) // 2))
img = square.resize((SIZE, SIZE), Image.LANCZOS)

# --- 3. squircle alpha mask (supersampled, vectorized) ---
big = SIZE * SS
half = big / 2.0
coords = (np.arange(big) + 0.5 - half) / half
dxn = np.abs(coords) ** N
field = dxn[None, :] + dxn[:, None]
mask_arr = (field <= 1.0).astype(np.uint8) * 255
mask = Image.fromarray(mask_arr, "L").resize((SIZE, SIZE), Image.LANCZOS)

out = img.convert("RGBA")
out.putalpha(mask)
out.save(OUT)
print("saved", OUT, out.size, out.mode)
