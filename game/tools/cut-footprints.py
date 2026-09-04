# -*- coding: utf-8 -*-
"""Cut the reference layout's footprints out of it - both kinds.

THE TRAIL IN THE REFERENCE IS TWO DIFFERENT MARKS, which is what the CSS version
missed. Magnified, each run is:

    a PAIR of footprints near the start - a sole blob and a separate toe blob, a
    bare foot rather than a shoe, in solid warm brown with a WHITE OUTLINE round
    it;
    then a dotted line of small DASHES in the same brown and the same white
    outline, curving along to the next frame;
    then another pair of footprints at the far end, on the longer runs.

The CSS version had one mark for all of it - a translucent grey-brown oval with a
small blob for toes and no outline at all - so it read as smudges rather than as
footprints. The white outline is most of why: it is what lifts them off the wood.

SO THEY ARE CUT, not drawn. Same keying as tools/cut-namaste.py: a per-column
median of the wood makes the plate, alpha is the distance from it, and BOTH the
brown and the white outline are further from the wood than the ramp, so both come
through. Cutting rather than approximating is the only way to get "exactly those
marks", and the marks are 22x30 - far too small to redraw convincingly in CSS.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join('c:', os.sep, 'Users', 'Ananya Goswami', 'OneDrive',
                    'Desktop', 'Aaru_ki_cheenk')
SRC = os.path.join(ROOT, 'assets', '_source', 'postgame-reference.png')
OUT_DIR = os.path.join(ROOT, 'assets', 'images')

# Two windows of open wood carrying nothing but trail. Their limits are the cards
# and the badges around them, and both were checked by eye at 3x and 4x.
WINDOWS = [
    (386, 246, 496, 336),      # between card 1 and card 2 - a pair and three dashes
    (44, 380, 188, 552),       # card 1 down to card 10 - a pair, a line, a pair
]
LO, HI = 9.0, 26.0             # the alpha ramp, in distance from the plate
MIN_MARK = 40                  # below this it is a stray antialiased pixel
FEATHER = 0.45


def plate_of(a):
    """Per-column median. The marks are a small fraction of each column, so the
    median IS the wood - no clean strip needed, unlike the boy."""
    return np.median(a, axis=0)


def marks(win):
    x0, y0, x1, y1 = win
    full = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float64)
    a = full[y0:y1, x0:x1]
    plate = plate_of(a)
    d = np.sqrt(((a - plate[None, :, :]) ** 2).sum(axis=2))
    alpha = np.clip((d - LO) / (HI - LO), 0.0, 1.0)
    lab, n = ndimage.label(alpha > 0.45)
    out = []
    H, W = alpha.shape
    for i in range(1, n + 1):
        m = lab == i
        if m.sum() < MIN_MARK:
            continue
        ys, xs = np.where(m)
        # a mark touching the window edge is CLIPPED, and the first run of this
        #    picked exactly such a dash - 18x13 with its outline sliced off - and
        #    also let a 3702px lump through that was a card border, not a mark.
        if (xs.min() <= 1 or ys.min() <= 1
                or xs.max() >= W - 2 or ys.max() >= H - 2):
            continue
        out.append({
            'n': int(m.sum()),
            'box': (xs.min(), ys.min(), xs.max(), ys.max()),
            'w': int(xs.max() - xs.min() + 1),
            'h': int(ys.max() - ys.min() + 1),
            'mask': m, 'alpha': alpha, 'rgb': a, 'win': win,
        })
    return sorted(out, key=lambda r: -r['n'])


def save(mark, name, pad=2):
    x0, y0, x1, y1 = mark['box']
    a, alpha = mark['rgb'], mark['alpha']
    h, w = alpha.shape
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(w - 1, x1 + pad); y1 = min(h - 1, y1 + pad)
    # keep only THIS mark, so a neighbour a few px away does not come with it
    only = ndimage.binary_dilation(mark['mask'], np.ones((5, 5)))
    al = np.where(only, alpha, 0.0)
    al = ndimage.gaussian_filter(al, FEATHER)
    cut = np.dstack([np.clip(a, 0, 255).astype(np.uint8),
                     np.clip(al * 255, 0, 255).astype(np.uint8)])[y0:y1 + 1, x0:x1 + 1]
    p = os.path.join(OUT_DIR, name)
    Image.fromarray(cut, 'RGBA').save(p)
    gx, gy = mark['win'][0] + x0, mark['win'][1] + y0
    print('  %-18s %2dx%-2d  from reference (%d,%d)  %d px of ink'
          % (name, x1 - x0 + 1, y1 - y0 + 1, gx, gy, mark['n']))
    return (x1 - x0 + 1, y1 - y0 + 1)


def main():
    print('marks found, biggest first:')
    allm = []
    for win in WINDOWS:
        got = marks(win)
        print('  window %s: %d marks, sizes %s'
              % (str(win), len(got), [m['n'] for m in got[:12]]))
        allm += got

    # a FOOTPRINT is one of the big ones; a DASH is one of the small ones. The gap
    # between the two populations is what makes this a threshold rather than a
    # guess - see the printed sizes.
    big = [m for m in allm if m['n'] >= 220]
    small = [m for m in allm if 40 <= m['n'] < 220]
    print()
    print('  %d footprint-sized (>=220 px), %d dash-sized' % (len(big), len(small)))
    if not big or not small:
        raise SystemExit('the two populations did not separate; look at the sizes')

    # the cleanest of each: the one closest to its population's median size, so a
    # clipped or merged one does not get picked
    def pick(pop):
        med = np.median([m['n'] for m in pop])
        return min(pop, key=lambda m: abs(m['n'] - med))

    print()
    fw, fh = save(pick(big), 'footprint.png')
    dw, dh = save(pick(small), 'trail-dash.png')
    print()
    print('  at the stage scale (the reference maps by 1.2508):')
    print('    footprint %.1f x %.1f px' % (fw * 1.2508, fh * 1.2508))
    print('    dash      %.1f x %.1f px' % (dw * 1.2508, dh * 1.2508))


if __name__ == '__main__':
    main()
