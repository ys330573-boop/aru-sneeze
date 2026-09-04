#!/usr/bin/env python3
"""Swap round 4's `earring` card to the artwork story slide 24 actually draws.

    python tools/recut-r4-earring.py

    in:  assets/_source/r4-earring-brows.png  (preferred when present - the Figma
         export with Aaru's right eyebrow moved off the eye it was drawn over; see
         tools/fix-aaru-brows.py), else
         assets/_source/r4-earring-figma.png  (untouched; re-exportable from
         figma.com/design/i5spwg0NKSC0kfYp4zNmuN node 305:134, STORY section,
         "Slide 16:9 - 24", PNG at 2x -> 3838x2160)
    out: assets/images/r4-earring.webp        (2442x1374, what the game serves)

THIS IS A SWAP, NOT AN UPRES, and the difference is the reason this file exists
rather than a line in tools/upres-round-cards.py. That tool pairs a card with its
export by image similarity and REFUSES when the best match is over 3/255 away,
because for its job a mismatch means the crop percentages are about to be applied
to a picture they were never measured on. Here the pictures genuinely differ - the
card that was shipping drew Aaru with his hand on his hip, and slide 24 draws him
with it up at his head, scratching, which is the beat the story is on - so that
tool would correctly refuse and is not the thing to reach for.

What makes the swap safe is not similarity of pixels but similarity of STAGING,
and that is measured rather than assumed. See check_framing() below.


WHY 2442x1374 AND NOT THE EXPORT'S OWN 3838x2160
------------------------------------------------
app.js positions this card's artwork with four hand-placed percentages of the
card's own 394x272 box, and those are only valid for the aspect ratio they were
measured against. The file they were measured against is 1221x687, i.e. 1.777293.
The export is 1919x1080 doubled, i.e. 1.776852. A quarter of a tenth of a percent
- but the whole point of this file is that nobody has to re-measure anything, so
the export is resized to EXACTLY 2x the retiring file's pixel dimensions rather
than to its own. The aspect is then bit-identical to what the crop percentages
were measured on, and every number in ROUNDS keeps meaning what it meant.

2x, specifically, because the card draws 643 stage px wide and the post-game pops
it larger still; 1221 was a hair under even the flat 2x-DPR requirement of 1286.

OUT_W/OUT_H are written down rather than read off the file being replaced, which
would be tidier and would be wrong the second time this is run: after one pass the
file on disk is already 2442 wide and reading it would ask for 4884.


WHY THE ALPHA IS DROPPED AND NOT COMPOSITED
-------------------------------------------
The export carries an alpha channel that is a uniform 242 over every pixel - a
flat 95% on the slide, not a cutout. Dropping it and compositing it onto white are
therefore two different global tints of the same picture, and the one to keep is
whichever leaves this card sitting in the same light as the other eleven. Measured
on the wall patch at 70-90% across, 15-35% down:

    old r4-earring.webp   229.4 199.5 165.5
    export, alpha dropped 233.2 199.7 164.4   <- G and B inside 1.1
    export, over white    234.2 202.7 169.2   <- further off on all three

So: dropped. The residual +3.8 on red is a difference between the two renders, not
something this file can or should correct.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
EXPORT = ROOT / "assets" / "_source" / "r4-earring-figma.png"
# ...AND THE BROW CORRECTION IN FRONT OF IT, when there is one. Aaru's right eyebrow
# is drawn over the eye beneath it in the export and the face reads as four eyes;
# tools/fix-aaru-brows.py moves it and writes this sibling. Preferring it here rather
# than painting on the export means a re-export from Figma comes back with the brow
# broken and VISIBLY so - the file is simply older - instead of quietly dropping a
# correction nobody would think to re-apply. Delete the sibling to ship the export.
FIXED = ROOT / "assets" / "_source" / "r4-earring-brows.png"
SRC = FIXED if FIXED.is_file() else EXPORT
DST = ROOT / "assets" / "images" / "r4-earring.webp"

OUT_W, OUT_H = 2442, 1374   # 2x 1221x687 - see the docstring
QUALITY = 92                # webp; what upres-round-cards.py settled on

# The card, from app.js. The frame is 394x272 with a 10px border, so the picture
# window is 374x252, and ROUNDS gives the artwork's box as percentages OF THE
# FRAME - not of the window, which is the easy mistake to make here.
FRAME_W, FRAME_H = 394, 272
BORDER = 10
WIN_W, WIN_H = FRAME_W - 2 * BORDER, FRAME_H - 2 * BORDER
CROP_W, CROP_H, CROP_X, CROP_Y = 163.25, 133.09, -0.15, -3.68


def visible_window():
    """The fraction of the source the card actually shows: (x0, x1, y0, y1)."""
    dw, dh = FRAME_W * CROP_W / 100, FRAME_H * CROP_H / 100
    ox, oy = FRAME_W * CROP_X / 100, FRAME_H * CROP_Y / 100
    return ((BORDER - ox) / dw, (BORDER - ox + WIN_W) / dw,
            (BORDER - oy) / dh, (BORDER - oy + WIN_H) / dh)


def ink_runs(path):
    """Where the drawing is, as fractions of width, plus the top of the ink.

    The wall is not flat enough in absolute terms to threshold on saturation -
    it is a warm beige whose own saturation is around 72/255, i.e. squarely in
    the range a figure would occupy. So the background is MODELLED PER ROW, as
    the median of the rightmost 18% of columns, which is clean wall on every row
    of this composition, and ink is what departs from its own row by over 42.
    That copes with the vignette down the right edge and with the floor being a
    different tone from the wall, neither of which a global threshold survives.
    """
    a = np.asarray(Image.open(path).convert("RGB"), float)
    h, w, _ = a.shape
    bg = np.median(a[:, int(w * 0.82):, :], axis=1)[:, None, :]
    mask = np.abs(a - bg).max(2) > 42

    cols, rows = mask.sum(0), mask.sum(1)
    runs, start = [], None
    for i, on in enumerate(cols > int(h * 0.008)):
        if on and start is None:
            start = i
        elif not on and start is not None:
            if i - start > w * 0.008:
                runs.append((start / w, i / w))
            start = None
    if start is not None:
        runs.append((start / w, 1.0))
    top = np.where(rows > int(w * 0.008))[0][0] / h
    return runs, top


def check_framing():
    """Fail loudly if the new staging does not land where the old one did.

    This is the whole safety argument for reusing the ROUNDS numbers. It is not
    "the pictures look alike" - they do not - it is "both figures sit inside the
    window the card was cropped to, and nothing that used to be inside it has
    moved out". Anything that fails here means the four percentages in app.js
    have to be re-measured by hand and this script is not enough.
    """
    x0, x1, y0, y1 = visible_window()
    print("card window   x %.2f%%-%.2f%%   y %.2f%%-%.2f%%"
          % (x0 * 100, x1 * 100, y0 * 100, y1 * 100))

    old_runs, old_top = ink_runs(DST) if DST.is_file() else (None, None)
    new_runs, new_top = ink_runs(SRC)
    if old_runs:
        print("old staging   %s   ink top %.1f%%"
              % ("  ".join("%.1f-%.1f%%" % (a * 100, b * 100) for a, b in old_runs),
                 old_top * 100))
    print("new staging   %s   ink top %.1f%%"
          % ("  ".join("%.1f-%.1f%%" % (a * 100, b * 100) for a, b in new_runs),
             new_top * 100))

    bad = []
    if len(new_runs) != 2:
        bad.append("expected two figures, found %d" % len(new_runs))
    for i, (a, b) in enumerate(new_runs):
        if b > x1:
            bad.append("figure %d runs to %.1f%%, past the window's %.1f%%"
                       % (i + 1, b * 100, x1 * 100))
        if a < x0:
            bad.append("figure %d starts at %.1f%%, before the window's %.1f%%"
                       % (i + 1, a * 100, x0 * 100))
    if new_top < y0:
        bad.append("ink starts at %.1f%%, above the window's %.1f%%"
                   % (new_top * 100, y0 * 100))
    if bad:
        raise SystemExit("FRAMING CHECK FAILED - re-measure the ROUNDS crop:\n  "
                         + "\n  ".join(bad))
    print("framing OK    both figures and the top of the ink are inside the window")


def main():
    if not SRC.is_file():
        raise SystemExit("missing %s - export node 305:134 as PNG 2x" % SRC)
    print("in            %s%s" % (SRC.name,
          "" if SRC is EXPORT else "   (brow-corrected; see fix-aaru-brows.py)"))
    check_framing()

    src = Image.open(SRC)
    print("source        %dx%d %s" % (src.width, src.height, src.mode))
    big = src.convert("RGB").resize((OUT_W, OUT_H), Image.LANCZOS)

    before = DST.stat().st_size if DST.is_file() else 0
    if "--dry-run" in sys.argv:
        print("dry run       would write %dx%d to %s" % (OUT_W, OUT_H, DST))
        return
    big.save(DST, "WEBP", quality=QUALITY, method=6)
    print("wrote         %dx%d  %.0fKB -> %.0fKB  aspect %.6f (was %.6f)"
          % (OUT_W, OUT_H, before / 1024, DST.stat().st_size / 1024,
             OUT_W / OUT_H, 1221 / 687))
    print("\nNow bump BUILD in app.js and the matching ?v= in index.html, or the "
          "browser keeps serving the old bytes.")


if __name__ == "__main__":
    main()
