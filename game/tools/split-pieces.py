#!/usr/bin/env python3
"""Split a multi-object sprite into one MASK PER OBJECT, so each can move alone.

WHAT THIS FIXES, in the user's words: "the utensils are not cut perfectly as per
their shapes so untidy small cut parts are visible".

09-sneeze-r4 is six pieces of steel coming off two shelves, and app.js moved them
independently with `clip-path: inset(t% r% b% l%)` - an AXIS-ALIGNED RECTANGLE per
piece. The utensils are not separated by axis-aligned lines: they overlap in x and
in y, so every rectangle cuts across its neighbours. On screen a katori arrives in
two halves with a diagonal gap through it and a tumbler loses a wedge off its side.

THE SPRITE ALREADY KNOWS THE SHAPES. Its matte is five connected components -
18187, 4008, 3857, 3277 and 3185 px - so the honest clip is the component itself.
This writes one greyscale mask per component, sized exactly like the sprite, and
app.js applies it with mask-image (the same mechanism the warps use, see
.pspr.is-warp). A piece then moves as the shape the artist drew.

FIVE, NOT SIX. app.js listed six clip rectangles for five objects, which is part of
how the fault went unnoticed: two of the rectangles were splitting one bowl.

    python tools/split-pieces.py 09-sneeze-r4            # report
    python tools/split-pieces.py 09-sneeze-r4 --write    # write the masks
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "images"
MIN_BLOB = 200      # tools/despeckle-sprites.py's threshold, same reasoning


def split(stem, write):
    src = OUT_DIR / ("%s-sprite.png" % stem)
    a = np.array(Image.open(src).convert("RGBA"))
    al = a[..., 3]
    lab, n = ndi.label(al > 40)
    sizes = ndi.sum(al > 40, lab, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s >= MIN_BLOB]
    keep.sort(key=lambda i: -sizes[i - 1])
    h, w = al.shape
    print("%s: %dx%d, %d component(s) over %d px" % (stem, w, h, len(keep), MIN_BLOB))
    rows = []
    for k, comp in enumerate(keep, 1):
        m = lab == comp
        ys, xs = np.where(m)
        # THE ORIGIN IS THE COMPONENT'S OWN CENTROID, as a percentage of the SPRITE's
        # box - because that is what transform-origin resolves against, and a piece
        # that rotates about the whole sprite's centre swings across the picture
        # instead of turning on the spot.
        ox = xs.mean() / w * 100.0
        oy = ys.mean() / h * 100.0
        # A LITTLE FEATHER, or the mask's own edge is a hard stair through the
        # sprite's already-soft matte and the piece gets a jagged rim back.
        soft = ndi.gaussian_filter(m.astype(float), 0.8)
        soft = np.clip((soft - 0.30) / 0.45, 0, 1)
        rows.append((k, int(sizes[comp - 1]), ox, oy,
                     [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]))
        if write:
            png = np.dstack([np.full(m.shape, 255.0)] * 3 + [soft * 255.0]).astype("uint8")
            Image.fromarray(png).save(OUT_DIR / ("%s-m%d.png" % (stem, k)))
    print("")
    print("app.js wants, one per piece:")
    for k, sz, ox, oy, bb in rows:
        print("   { mask: '%s-m%d', org: '%.1f%% %.1f%%' },   /* %5d px, bbox %s */"
              % (stem, k, ox, oy, sz, bb))
    if write:
        print("")
        print("wrote %d mask(s) as %s-m1..m%d.png" % (len(rows), stem, len(rows)))


def main():
    write = "--write" in sys.argv
    want = [x for x in sys.argv[1:] if not x.startswith("--")]
    if not want:
        raise SystemExit("name a sprite stem, e.g. 09-sneeze-r4")
    for stem in want:
        split(stem, write)


if __name__ == "__main__":
    main()
