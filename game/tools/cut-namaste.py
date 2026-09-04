# -*- coding: utf-8 -*-
"""Cut the reference layout's own Aaru out of it, for the post-game formation.

WHY THIS ASSET EXISTS. The post-game screen is meant to end up looking like the
user's reference (assets/_source/postgame-reference.png), and the boy in the middle
of that picture is not a pose the game has: he is smaller, higher up, and standing
with his hands together rather than snapping his fingers. The finale's snap pose is
323px wide with its sandals on the floor; his is ~150px wide with his feet at 76%
of the canvas. Placing the ten cards around the SNAP pose is what forced the two
largest departures from the reference - its bottom row runs straight through where
the snap pose stands. Using the reference's own boy removes that conflict instead
of negotiating with it.

HOW HE IS KEYED, and the two things that went wrong first:

  THE PLATE. The ground is a vertical-plank wood texture, rgb(247,210,182) on
  average, varying across x with the planks and hardly at all down y. So the plate
  is a PER-COLUMN median of the clean wood in each column, which models the planks
  exactly where a single mean colour does not - the plank edges are 8-10 levels
  darker than their middles and would key as him.

  WHICH WOOD IS CLEAN is not obvious and I got it wrong twice. There is no clean
  strip BESIDE him: the sneeze card reaches x 742 and down to y 397, the pot card
  starts at x 851, and the two bottom cards start at y 778. The two strips that are
  clean across his whole width are both outside the cut window - see PLATE_ROWS -
  and that is fine, because a plank is constant down y, so any clean row of a
  column describes that column.

  HIS SKIN. Light tan against light peach wood; no threshold separates them. What
  does is topology - his skin is enclosed by his own drawn outline - so everything
  more than SOLID_R inside that outline is pinned opaque whatever colour it is.
  Lifted from tools/cut-pose-assets.py, which found this out on his shirt.

  AND A HOLE HAS TO BE BIG TO COUNT AS BACKGROUND. Distance from the plate alone is
  not enough: the white stripes of his shirt sit within HOLE_D of the wood, so
  eight of them were classified as see-through and came out as specks. The gap
  between his legs is 1646px and every speck was 1 to 3px, so a size floor splits
  them cleanly. That gap IS real, and it is enclosed at the bottom by the soft
  ground shadow the reference draws between his sandals - which is why filling
  every hole would have webbed his legs together.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join('c:', os.sep, 'Users', 'Ananya Goswami', 'OneDrive',
                    'Desktop', 'Aaru_ki_cheenk')
SRC = os.path.join(ROOT, 'assets', '_source', 'postgame-reference.png')
OUT = os.path.join(ROOT, 'assets', 'images', 'aaru-namaste.png')

WIN = (690, 392, 862, 778)          # tight to him: he is x 700..850, y 398..770

# THE PLATE IS BUILT FROM ROWS OUTSIDE THE WINDOW, because there are none inside
# it. The planks run down y and are constant along it, so any clean row of a column
# describes that column - and these two strips are clean across the whole window's
# width, which is what a strip beside him is not:
#
#     y 158..190   between the banner (ends 156) and the top cards (start 194)
#     y 774..778   between his sandals (end 768) and the bottom cards (start 778)
#
# 37 rows per column. The first attempt sampled strips INSIDE a tall window and 155
# of 245 columns had no clean rows at all, so their plate came out NaN, alpha came
# out NaN, and NaN > 0.5 is false - he was cut down to the 92px of himself that
# happened to sit over sampled columns. The warnings said "Mean of empty slice" and
# I nearly read the 92px as a keying failure.
PLATE_ROWS = ((158, 191), (774, 779))

# the two card corners that poke into the window; a card is never him
CORNERS = ((690, 392, 743, 399), (850, 392, 862, 400))

LO, HI = 11.0, 36.0                 # the alpha ramp, in distance from the plate
CLOSE_R, SOLID_R, HOLE_D = 6, 3, 12.0
HOLE_MIN = 200                      # under this, a hole is a shirt stripe, not a gap
FEATHER = 0.6


def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y) <= r * r + 0.5


def main():
    full = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float64)
    x0, y0, x1, y1 = WIN
    a = full[y0:y1, x0:x1]
    h, w, _ = a.shape

    rows = np.concatenate([np.arange(r0, r1) for r0, r1 in PLATE_ROWS])
    plate = np.median(full[np.ix_(rows, np.arange(x0, x1))], axis=0)   # w x 3
    assert np.isfinite(plate).all(), 'plate has holes'
    print('window %dx%d from (%d,%d);  plate from %d rows per column'
          % (w, h, x0, y0, len(rows)))

    d = np.sqrt(((a - plate[None, :, :]) ** 2).sum(axis=2))
    ref = np.sqrt(((full[np.ix_(rows, np.arange(x0, x1))]
                    - plate[None, :, :]) ** 2).sum(axis=2))
    print('plate residual on the wood it was built from: mean %.2f, 99th %.2f'
          '   (the ramp starts at %.0f)'
          % (ref.mean(), np.percentile(ref, 99), LO))

    alpha = np.clip((d - LO) / (HI - LO), 0.0, 1.0)
    for cx0, cy0, cx1, cy1 in CORNERS:
        alpha[cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0] = 0.0

    lab, n = ndimage.label(alpha > 0.5)
    if n == 0:
        raise SystemExit('nothing found')
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    keep = int(np.argmax(sizes)) + 1
    comp = lab == keep
    print('%d components above the ramp; his is %d px, the next is %d'
          % (n, int(sizes[keep - 1]), int(sorted(sizes)[-2]) if n > 1 else 0))
    alpha = alpha * comp

    closed = ndimage.binary_closing(comp, disk(CLOSE_R))
    filled = ndimage.binary_fill_holes(closed)
    holes = filled & ~comp
    hl, hn = ndimage.label(holes)
    gaps = 0
    kept = 0
    for i in range(1, hn + 1):
        m = hl == i
        n_px = int(m.sum())
        if d[m].mean() <= HOLE_D and n_px >= HOLE_MIN:
            filled[m] = False          # real background, e.g. between his legs
            gaps += n_px
            kept += 1
    solid = ndimage.binary_erosion(filled, disk(SOLID_R))
    print('holes: %d found; %d kept open as background (%d px), the rest filled'
          % (hn, kept, gaps))
    alpha = np.maximum(alpha, solid.astype(np.float64))
    alpha = alpha * ndimage.binary_dilation(filled, disk(1))
    alpha = ndimage.gaussian_filter(alpha, FEATHER)

    ys, xs = np.where(alpha > 0.05)
    bx0, bx1, by0, by1 = xs.min(), xs.max(), ys.min(), ys.max()
    out = np.dstack([np.clip(a, 0, 255).astype(np.uint8),
                     np.clip(alpha * 255, 0, 255).astype(np.uint8)])
    out = out[by0:by1 + 1, bx0:bx1 + 1]
    Image.fromarray(out, 'RGBA').save(OUT)

    gx0, gy0 = x0 + bx0, y0 + by0
    gx1, gy1 = x0 + bx1, y0 + by1
    cw, ch = bx1 - bx0 + 1, by1 - by0 + 1
    print()
    print('IN THE REFERENCE: x %d..%d, y %d..%d   %dx%d'
          % (gx0, gx1, gy0, gy1, cw, ch))
    print('  of its 1535x1024 canvas -')
    print('    centre  %.3f%% , %.3f%%' % ((gx0 + cw / 2.0) / 1535 * 100,
                                           (gy0 + ch / 2.0) / 1024 * 100))
    print('    size    %.3f%% wide, %.3f%% tall'
          % (cw / 1535.0 * 100, ch / 1024.0 * 100))
    print('    feet at %.3f%% of the height' % (gy1 / 1024.0 * 100))
    core = alpha[by0:by1 + 1, bx0:bx1 + 1]
    print('  opaque >0.98: %.1f%%   clear <0.02: %.1f%%   in between: %.1f%%'
          % ((core > 0.98).mean() * 100, (core < 0.02).mean() * 100,
             ((core >= 0.02) & (core <= 0.98)).mean() * 100))
    print()
    print('wrote %s' % OUT)


if __name__ == '__main__':
    main()
