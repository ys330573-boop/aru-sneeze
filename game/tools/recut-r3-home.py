#!/usr/bin/env python3
"""Cut round 3's `home` card out of the storybook page it comes from.

    python tools/recut-r3-home.py

    in:  assets/_source/r3-home-figma.png   (untouched; re-exportable from
         figma.com/design/i5spwg0NKSC0kfYp4zNmuN node 284:97, STORY section)
    out: assets/images/r3-home.webp         (748x504, what the game serves)

The picture is story page 10 of the Figma file's STORY section - "उदास आरु ने
आटा लिया और घर लौट आया। थोड़ी ही देर में अम्मा भी वापस आ गई।" - and it is a
storybook page, not a card. Three things are wrong with it as supplied and all
three are fixed here.


1. IT HAS THE STORY WRITTEN ON IT
---------------------------------
The caption is painted into the bitmap. There is no text layer to switch off:
the node is a single image fill, generated with the words already in it, which
is why this is a pixel repair and not an export setting.

The caption cannot be cropped away either. It sits at x 988-1613, y 122-317, and
the card is 3:2-ish while the page is 16:9 - so a card-shaped crop that keeps the
window and the whole boy is 1383px wide and runs 395px into the text. Cropping
short enough to miss it means either beheading the window or losing his feet.

So the caption is painted out. The wall it sits on is the flattest thing in the
picture - per-row standard deviation of 2 to 6 out of 255, no drawing in it at
all - so the repair only has to reproduce a gradient and a paper grain:

  GRADIENT. Taken from the picture itself, not modelled: the mean of the 24 rows
  above the box and the mean of the 24 rows below it, per column, interpolated
  down the box. Per column, so the vignette that darkens the right-hand edge is
  carried across rather than averaged away.

  GRAIN. The band immediately below the caption is the same wall, clean, and
  tall enough to cover the box. It is flipped vertically (so the seam at the
  bottom edge meets pixels it was next to, not pixels 200 rows away), its own
  low frequencies are subtracted off, and what is left - the grain alone - is
  laid over the reconstructed gradient.

Then the box is feathered into its surroundings over FEATHER px, because the
gradient is right to about a level and a half but not to the exact level, and a
hard edge at that scale is visible where a ramp is not.

The reconstruction is self-checking: run with CHECK=1 and it does the identical
thing to a clean band of the same wall, where the answer is known, and reports
the error. It comes out under a level on every channel, against a grain that is
itself several levels - i.e. the repair is inside the noise of what it replaces.


2. IT HAS A BLACK BORDER
------------------------
Not letterboxing - a few pixels of frame the export carries on three sides:
columns 0-3, columns 1670-1675 and rows 932-938. Trimmed before anything else,
which is why every coordinate in this file is in trimmed space.


3. IT IS THE WRONG SHAPE, AND THE CARD IS 2x
--------------------------------------------
The card's picture window is 374x252 (the 394x272 frame less its 10px border),
so the served file is 748x504 - 2x, like the other eleven, and unlike the
r3-home.webp this replaces, which was 378x252 at 1x and visibly softer than its
neighbours above a 1920-wide viewport.

The crop is the full trimmed height and the width that height implies, from the
left edge: 1383x932. That is the framing the storybook page has - window hard
left, boy centre, wall to the right - and it lands the window at 1.4-34% of the
card's width and the boy at 44-69%, against 2-37% and 41-75% on the card it
replaces. Close enough that the round reads the same.

WebP at quality 88, the same as the other eleven; see the asset note in
styles.css for why 88.

If this is ever re-cut, note that CARD_W/CARD_H and the ROUNDS entry in app.js
are tied together: app.js sizes the image to exactly the 374x252 window, so the
file must carry the 374:252 aspect itself, and CARD_W/CARD_H is where that is
held - the crop width is DERIVED from them at line 180, not written down. Change
the crop and the numbers in ROUNDS do not need to change, but only because the
aspect is held here.
"""

import os
import sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, 'assets', '_source', 'r3-home-figma.png')
DST  = os.path.join(ROOT, 'assets', 'images', 'r3-home.webp')

# The export's black frame. Right and bottom are exclusive.
TRIM = (4, 0, 1670, 932)

# The caption, with room for its antialiasing. Measured at x 988-1613,
# y 122-317; this is that box with a margin, and it clears the boy - his
# rightmost pixel in these rows is at x 942.
TEXT = (970, 108, 1625, 332)

BAND    = 24   # rows above and below TEXT the gradient is read from
FEATHER = 12   # px the repair is ramped into the original over
QUALITY = 88

CARD_W, CARD_H = 748, 504   # 2x the card's 374x252 picture window


def gaussian1d(n, sigma):
    x = np.arange(n) - (n - 1) / 2.0
    k = np.exp(-(x ** 2) / (2.0 * sigma ** 2))
    return k / k.sum()


def blur(a, sigma, axis):
    """Gaussian along one axis of an HxWx3 array, edges extended."""
    n = int(sigma * 4) | 1
    k = gaussian1d(n, sigma)
    pad = n // 2
    pw = [(0, 0), (0, 0), (0, 0)]
    pw[axis] = (pad, pad)
    p = np.pad(a, pw, mode='edge')
    return np.apply_along_axis(lambda r: np.convolve(r, k, 'valid'), axis, p)


def repair(img, box, band=BAND, feather=FEATHER):
    """Paint `box` out of `img` with the wall it is standing on.

    Returns a new array. `img` is float, HxWx3."""
    x0, y0, x1, y1 = box
    h, w = y1 - y0, x1 - x0

    # The gradient, per column, from the clean rows either side.
    top = img[y0 - band:y0, x0:x1].mean(axis=0)
    bot = img[y1:y1 + band, x0:x1].mean(axis=0)
    # Smooth along x: the boundary rows carry grain too, and averaging 24 of
    # them cuts it by ~5x but does not remove it. Anything left would be
    # smeared the full height of the box as a vertical streak.
    top = blur(top[None, :, :], 8.0, axis=1)[0]
    bot = blur(bot[None, :, :], 8.0, axis=1)[0]
    t = (np.arange(h)[:, None, None] + 0.5) / h
    grad = top[None, :, :] * (1 - t) + bot[None, :, :] * t

    # The grain, from the clean wall directly below, flipped so the seam that
    # matters meets its own neighbours. Its own low frequencies - in both
    # directions - are subtracted off, so what is laid over the reconstructed
    # gradient is the grain and nothing else.
    src = img[y1:y1 + h, x0:x1][::-1]
    grain = src - blur(blur(src, 24.0, axis=1), 24.0, axis=0)

    patch = grad + grain

    # Feather: 1 inside, ramping to 0 across the last `feather` px.
    ry = np.minimum(np.arange(h), np.arange(h)[::-1]) / float(feather)
    rx = np.minimum(np.arange(w), np.arange(w)[::-1]) / float(feather)
    a = np.clip(np.minimum(ry[:, None], rx[None, :]), 0, 1)[..., None]

    out = img.copy()
    out[y0:y1, x0:x1] = patch * a + img[y0:y1, x0:x1] * (1 - a)
    return out


def main():
    im = Image.open(SRC).convert('RGB')
    a = np.asarray(im).astype(np.float64)
    a = a[TRIM[1]:TRIM[3], TRIM[0]:TRIM[2]]
    H, W = a.shape[:2]
    print('trimmed to %dx%d' % (W, H))

    if os.environ.get('CHECK'):
        # Same repair, on a clean band of the same wall, where the truth is on
        # hand. Placed below the caption and clear of the boy.
        x0, y0, x1, y1 = TEXT
        probe = (x0, y1 + 60, x1, y1 + 60 + (y1 - y0))
        got = repair(a, probe)[probe[1]:probe[3], probe[0]:probe[2]]
        want = a[probe[1]:probe[3], probe[0]:probe[2]]
        err = np.abs(got - want)
        print('self-check on clean wall %s' % (probe,))
        print('  mean err  %s' % err.mean(axis=(0, 1)).round(3))
        print('  max  err  %s' % err.max(axis=(0, 1)).round(3))
        print('  wall grain std %s' % want.std(axis=(0, 1)).round(3))

    a = repair(a, TEXT)

    crop_w = int(round(H * CARD_W / float(CARD_H)))
    print('crop %dx%d from (0,0)  aspect %.5f (card %.5f)'
          % (crop_w, H, crop_w / float(H), CARD_W / float(CARD_H)))
    a = a[:, :crop_w]

    out = Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8))
    out = out.resize((CARD_W, CARD_H), Image.LANCZOS)
    out.save(DST, 'WEBP', quality=QUALITY, method=6)
    print('wrote %s  %dx%d  %d bytes'
          % (os.path.relpath(DST, ROOT), CARD_W, CARD_H, os.path.getsize(DST)))


if __name__ == '__main__':
    sys.exit(main())
