"""Generates the image fixtures the checks upload. Usage: make_images.py <outdir>  (needs Pillow)"""

import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
random.seed(3)


def food(name, base, w=1600, h=1200):
    """A blurry «plate of something»: enough to tell photos apart in screenshots."""
    im = Image.new('RGB', (w, h), base)
    d = ImageDraw.Draw(im)
    d.ellipse((w * 0.15, h * 0.12, w * 0.85, h * 0.88), fill=(250, 248, 244))
    for _ in range(14):
        x = random.randint(int(w * 0.3), int(w * 0.7))
        y = random.randint(int(h * 0.3), int(h * 0.7))
        r = random.randint(50, 110)
        c = (random.randint(200, 240), random.randint(140, 180), random.randint(70, 110))
        d.ellipse((x - r, y - r * 0.8, x + r, y + r * 0.8), fill=c)
    im.filter(ImageFilter.GaussianBlur(3)).save(f'{out}/{name}', quality=88)


for name, tint in [
    ('syrnyky.jpg', (214, 230, 217)),
    ('step1.jpg', (243, 231, 184)),
    ('step2.jpg', (221, 215, 240)),
    ('borshch.jpg', (245, 220, 205)),
]:
    food(name, tint)

# 3000×2000 pixels stored sideways: EXIF orientation 6 (display rotated 90° CW) plus a GPS tag
# that must not survive. The blue bar on the top-left ends up on the right edge once rotated.
im = Image.new('RGB', (3000, 2000), (200, 120, 80))
ImageDraw.Draw(im).rectangle((0, 0, 1500, 40), fill=(0, 0, 255))
exif = Image.Exif()
exif[0x0112] = 6
exif[0x8825] = {1: 'N', 2: (50.0, 27.0, 0.0)}
im.save(f'{out}/rot.jpg', exif=exif, quality=90)

Image.new('RGBA', (400, 300), (0, 0, 0, 0)).save(f'{out}/alpha.png')
with open(f'{out}/fake.heic', 'wb') as f:
    f.write(b'\x00\x00\x00\x18ftypheic' + b'\x00' * 2000)
with open(f'{out}/big.jpg', 'wb') as f:
    f.write(os.urandom(1_300_000))
# tiny file declaring a 10000×10000 canvas: a decompression bomb the server must refuse
Image.new('1', (10000, 10000)).save(f'{out}/bomb.png')
