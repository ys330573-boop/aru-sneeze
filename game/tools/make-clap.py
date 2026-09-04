# -*- coding: utf-8 -*-
"""ATTEMPT AT AN OPEN-HANDS FRAME. IT DOES NOT WORK. Kept so nobody spends the
afternoon on it again, and so the reason is on record rather than in a chat log.

THE OUTPUT IS NOT SHIPPED. Run this and look at what it makes before believing any
of it can be salvaged by tuning.

THE IDEA, which is sound as far as it goes. Magnified, his anatomy does separate:
his forearms cross horizontally over his lower chest, the praying hands rise as a
distinct vertical shape from where they meet, and above the forearms what is behind
the hands is shirt - horizontal stripes - not more arm. So the hands can be cut and
hinged apart about their base, and the gap above filled by copying shirt sideways,
which is exact because the stripes are horizontal.

WHY IT FAILS ANYWAY, and this is the part that no threshold fixes: BEHIND THE LOWER
HALF OF HIS HANDS THERE ARE NO PIXELS. Where the hands meet the forearms, the
artwork simply does not draw what is underneath them. So:

  fill that region and there is nothing to fill it with - the neighbours at those
  rows are forearm, not shirt;
  leave it and the original hands stay visible while the hinged copy sits a few
  degrees off them, which is the doubling in the output;
  and hinging 15 degrees about the base splays the fingers rather than parting the
  palms, so even the part that composites cleanly reads as fingers spreading.

The measured facts, for anyone re-opening this: the hands key out as 298px, 19x31,
at x 65..83 y 167..197. The forearms begin at row 173, so only rows 167..172 have
shirt beside them - six rows out of thirty-one.

SO IT NEEDS ONE DRAWING: the same pose, same size, same everything, with his hands
open. Then the two alternate on each hop and it is a three-frame clap - about ten
minutes of wiring. That claim is scoped to cut-and-hinge from THIS sprite; a
generative inpaint of the region behind his hands might well work, and has not
been tried.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join('c:', os.sep, 'Users', 'Ananya Goswami', 'OneDrive',
                    'Desktop', 'Aaru_ki_cheenk')
SRC = os.path.join(ROOT, 'assets', 'images', 'aaru-namaste.png')
OUT = os.path.join(ROOT, 'assets', 'images', 'aaru-clap.png')

# Where to look for the hands. Tight, because his face and forearms are the same
# skin and the largest-blob rule has to pick the hands and not one of those.
BOX = (56, 150, 92, 214)      # x0, y0, x1, y1 in the 147x378 sprite
OPEN_DEG = 15.0               # how far each half hinges out
LIFT_PX = 1.0                 # ...and a touch upward, as hands do when they part


def skin(rgb, al):
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    return (al > 0.5) & (r > 200) & (g > 130) & (g < 215) & (b > 60) & (b < 175) \
        & (sat > 0.20) & (sat < 0.62)


def main():
    im = Image.open(SRC).convert('RGBA')
    W, H = im.size
    a = np.asarray(im).astype(np.float64)
    rgb, al = a[:, :, :3], a[:, :, 3] / 255.0

    # --- the hands -----------------------------------------------------------
    win = np.zeros((H, W), bool)
    win[BOX[1]:BOX[3], BOX[0]:BOX[2]] = True
    cand = skin(rgb, al) & win
    lab, n = ndimage.label(cand)
    if n == 0:
        raise SystemExit('no skin found in the box')
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    hands = lab == int(np.argmax(sizes)) + 1
    ys, xs = np.where(hands)
    hx0, hx1, hy0, hy1 = xs.min(), xs.max(), ys.min(), ys.max()
    print('hands: %d px, x %d..%d, y %d..%d  (%dx%d)'
          % (hands.sum(), hx0, hx1, hy0, hy1, hx1 - hx0 + 1, hy1 - hy0 + 1))
    if n > 1:
        print('   %d other skin blobs in the box, largest %d px - not used'
              % (n - 1, int(sorted(sizes)[-2])))

    pivot = ((hx0 + hx1) / 2.0, hy1 + 1.0)      # the base, where they meet the arms
    print('   hinge at (%.1f, %.1f)' % pivot)

    # --- the shirt behind them ----------------------------------------------
    # Only the part ABOVE the forearms needs filling: below that the base does not
    # move. The forearm line is where the skin either side of the hands begins.
    side = skin(rgb, al).copy()
    side[:, hx0:hx1 + 1] = False
    arm_top = H
    for r in range(hy0, hy1 + 1):
        near = side[r, max(0, hx0 - 8):hx0] | side[r, hx1 + 1:min(W, hx1 + 9)]
        if near.any():
            arm_top = r
            break
    print('   forearms start at row %d, so rows %d..%d need filling'
          % (arm_top, hy0, arm_top - 1))

    filled = np.array(a, dtype=np.float64)
    for r in range(hy0, arm_top):
        lo = hx0 - 1
        hi = hx1 + 1
        while lo > 0 and hands[r, lo]:
            lo -= 1
        while hi < W - 1 and hands[r, hi]:
            hi += 1
        span = hx1 - hx0 + 1
        for i, c in enumerate(range(hx0, hx1 + 1)):
            if not hands[r, c]:
                continue
            # nearer edge wins, so a stripe boundary is not dragged across
            filled[r, c] = a[r, lo] if i < span / 2 else a[r, hi]

    base = Image.fromarray(np.clip(filled, 0, 255).astype(np.uint8), 'RGBA')

    # --- the two halves, hinged ---------------------------------------------
    midx = (hx0 + hx1 + 1) / 2.0
    out = base.copy()
    for sign, name in ((-1, 'left'), (1, 'right')):
        part = np.zeros_like(a)
        m = hands.copy()
        if sign < 0:
            m[:, int(np.ceil(midx)):] = False
        else:
            m[:, :int(midx)] = False
        part[m] = a[m]
        layer = Image.fromarray(np.clip(part, 0, 255).astype(np.uint8), 'RGBA')
        layer = layer.rotate(-sign * OPEN_DEG, resample=Image.BICUBIC,
                            center=pivot)
        if LIFT_PX:
            layer = layer.transform(layer.size, Image.AFFINE,
                                    (1, 0, 0, 0, 1, LIFT_PX),
                                    resample=Image.BICUBIC)
        out.alpha_composite(layer)
        print('   %-5s half: %d px, hinged %+.0f deg' % (name, m.sum(), -sign * OPEN_DEG))

    # the silhouette must not grow outside his own alpha by much
    o = np.asarray(out).astype(np.float64)
    grew = ((o[:, :, 3] > 128) & (a[:, :, 3] <= 128)).sum()
    print('   pixels now opaque that were not: %d' % grew)
    out.save(OUT)
    print()
    print('wrote %s  %dx%d' % (OUT, W, H))


if __name__ == '__main__':
    main()
