#!/usr/bin/env python3
r"""Move Aaru's right eyebrow to where the left one says it belongs.

    python tools/fix-aaru-brows.py            # writes the corrected source
    python tools/fix-aaru-brows.py --preview  # measures and renders, writes nothing

    in:  assets/_source/r4-earring-figma.png   (the Figma export, UNTOUCHED)
    out: assets/_source/r4-earring-brows.png   (same 3838x2160 RGBA, one brow moved)

Then re-run tools/recut-r4-earring.py, which prefers this file when it exists, and
bump BUILD in app.js plus the ?v= in index.html.


THE REPORT: "does Aaru have four eyes here?"
--------------------------------------------
He has two, and the picture reads as four because HIS RIGHT EYEBROW IS DRAWN IN THE
WRONG PLACE. It is a long dark bar slanting down toward his temple, and its lower
tip runs into the top-outer rim of the eye beneath it - the two touch and fuse into
one heavy diagonal mass, while the upper half of the bar still reads as its own dark
almond. So the face offers four dark marks in a 2x2 arrangement: brow, eye, brow,
eye, with the right pair welded together. His left brow is a clean arch clear of its
eye and reads correctly as a brow.

IT IS THE RIGHT BROW AND NOT THE BROW WEIGHT, and that took measuring to establish
rather than assume, because "the brows are too heavy" is the obvious first theory and
it is wrong. Amma is in the same picture in the same style and is the control:

                    brow ink / eye ink     brow aspect     gap / eye height
    Amma                    0.87           1.49  1.80        0.04   0.30
    Aaru                    0.71           2.84  3.57        0.18  -0.16

Aaru's brows are LIGHTER relative to his eyes than his mother's and far less
eye-shaped, and hers do not read as eyes. The one number that is off the scale is the
last one: every brow in the picture sits above its eye except this one, whose gap is
NEGATIVE - it overlaps the eye it belongs to. That is the defect, and thinning or
darkening anything would have been treating a symptom that measures fine.

WHERE IT SHOULD GO, AND WHY THAT IS MEASURED AND NOT CHOSEN
    The other half of the same face is the reference. Both eye centroids give the
    head's roll (12.7 degrees, clockwise); in a frame rotated by that, the left brow's
    centroid sits at (4.9, -87.8) from its own eye's centroid - 4.9 toward the nose,
    87.8 above. Mirror x for the other side and the right brow belongs at (-4.9,
    -87.8) from the right eye. It is actually at (11.0, -68.0):

        15.9 px too far OUT and 19.8 px too LOW      (figma px)

    which is exactly the collision. Rotated back into image axes that is a
    translation of about (-11, -23) - and the brow's own ANGLE is left alone, because
    it is already almost right: the left brow is at -21.0 degrees in the face frame,
    this one at +16.6, and a perfect mirror would be +21.0. Four and a half degrees.
    Nothing here rotates, scales or redraws the stroke: this is the artist's own brow,
    translated onto the spot the artist's own other brow nominates.

    So the correction has no free parameters. TARGET below is derived from the four
    measurements every time the script runs, and if a re-export moves the face the
    numbers move with it.

WHAT MOVES, AND WHY THE MASK IS FAT
    The brow stroke is found by threshold and grown by hysteresis, then DILATED 16 px
    before anything is cut. The dilation is not slop - the artist painted a soft light
    rim into the skin under each brow, and a cut tight to the dark stroke leaves that
    rim behind as a ghost brow in the old position. 16 px carries the rim along with
    the stroke it belongs to.

    The hole is filled harmonically, not by copying a nearby pixel, for the reason
    tools/cut-belly-hand.py records about eyes: this is a forehead with a gradient
    across it, and a Voronoi fill of a gradient is a flat patch with a visible edge.
    Laplace leaves the rim at the rim's own colour and carries the gradient over.

    AND THE SPRITE'S SKIN IS TONE-MATCHED to where it lands. Moving a patch of
    forehead 23 px up means its skin came from 23 px lower on a face that is lit from
    above, so the feathered edge would show as a faint dark halo. The offset is
    measured - the mean of the skin ring around the source footprint against the mean
    of the same ring at the destination - and added to the sprite. Measured here at
    about 2 units on each channel, which is small, visible on a flat forehead at the
    pop-out's 3x, and free to correct.

WHY A SEPARATE FILE AND NOT AN EDIT TO THE EXPORT
    assets/_source/r4-earring-figma.png is re-exportable from Figma (node 305:134,
    see recut-r4-earring.py) and painting on it would be lost the next time anyone
    does that, silently. This writes a sibling instead, so a re-export re-runs this
    script rather than quietly dropping it, and the diff between the two files is
    exactly one eyebrow.
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "_source" / "r4-earring-figma.png"
DST = ROOT / "assets" / "_source" / "r4-earring-brows.png"
PREVIEW = ROOT / "assets" / "_source" / "r4-earring-brows-preview.png"

# WINDOWS, in figma px, one per feature. Each has to hold exactly one of the four
# features and no hair, no ear and no hand - the threshold below cannot tell a brow
# from a curl, and the left brow's outer tip passes 15 px from his hair. They are
# checked, not trusted: measure() fails if what it finds is not brow-shaped or
# eye-shaped, so a re-export that moves the face reports rather than mis-edits.
WINDOWS = {
    "brow_l": (1585, 1005, 1700, 1070),
    "brow_r": (1750, 1045, 1870, 1140),
    "eye_l":  (1580, 1072, 1680, 1180),
    "eye_r":  (1738, 1108, 1845, 1212),
}
# What each window held when this was written, as a tripwire on a re-export.
EXPECT = {
    "brow_l": dict(size=2419, aspect=2.84),
    "brow_r": dict(size=2756, aspect=3.57),
    "eye_l":  dict(size=3503, aspect=1.38),
    "eye_r":  dict(size=3813, aspect=1.23),
}
SIZE_TOL = 0.25      # fractional
ASPECT_TOL = 0.6

# THE SKIN TEST, the same colour-ratio one as tools/cut-belly-hand.py's is_skin,
# because a LUMINANCE test cannot do this job here and quietly gets it backwards:
# this forehead is #f6a866, mean 172, which is DARKER than the sclera beside it and
# barely brighter than the brow's soft edge. A first pass filtered the tone-match
# ring on "lum > 195" and so averaged his eye-whites and highlights - 248,234,214,
# which is not skin at all - and asked for a -13 blue shift on the forehead.
GR = (0.48, 0.80)    # green/red, the band skin sits in
BR = (0.24, 0.55)    # blue/red
R_MIN = 150

DARK = 150           # lum below this is ink, not skin. Separates brow from hair.
GROW = 195           # ...and hysteresis out to here, for the stroke's soft edge.
DILATE = 16          # px, to carry the painted light rim under the brow with it
FEATHER = 5.0        # px, the sprite's alpha rolloff
ITERS = 1200         # Jacobi sweeps for the harmonic fill


def is_skin(img):
    """The colour-ratio test. Borrowed from tools/cut-belly-hand.py, same numbers."""
    R, G, B = img[..., 0], img[..., 1], img[..., 2]
    Rs = np.maximum(R, 1.0)
    return ((R > R_MIN) & (G / Rs > GR[0]) & (G / Rs < GR[1])
            & (B / Rs > BR[0]) & (B / Rs < BR[1]))


def measure(a, name, wall=None):
    """The one feature in its window: size, centroid, bbox, principal axis.

    The axis is folded mod 180 because a brow has no head and no tail - SVD returns
    whichever end it likes, and abs() would fold -21 and +21 onto the same number,
    which are the two things this script most needs to tell apart.

    `wall` IS WHY THE EYES ARE MEASURED FIRST, and without it this script destroys
    the eye it is trying to rescue. The whole defect is that the right brow's tip
    TOUCHES the top rim of the right eye: at DARK the two are still separate
    components, but the hysteresis out to GROW walks straight across the join, so the
    grown "brow" swallows the eye, the 16 px dilation buries it, and the harmonic fill
    paints a grey band over both. Measured: with no wall the grown brow is 13k px and
    reaches y 1204, the bottom of the eye. So the eyes' own seeds, dilated 3 px, are
    passed in as a wall the propagation may not cross - the same trick and the same
    word as the samosa/dog-mouth guard in tools/cut-recap-sprites.py.
    """
    x0, y0, x1, y1 = WINDOWS[name]
    lum = a[y0:y1, x0:x1].sum(2) / 3.0
    lab, n = ndi.label(lum < DARK)
    if not n:
        raise SystemExit("nothing dark in the %s window - has the face moved?" % name)
    sizes = ndi.sum(lum < DARK, lab, range(1, n + 1))
    idx = int(np.argmax(sizes)) + 1
    seed = lab == idx
    # hysteresis out to GROW, so the stroke's antialiased edge comes in without the
    # brow bridging to the hair the way it does at a single loose threshold.
    soft = lum < GROW
    if wall is not None:
        soft = soft & ~wall[y0:y1, x0:x1]
    grown = ndi.binary_propagation(seed, mask=soft)
    # EVERY NUMBER REPORTED IS THE SEED'S, and only the mask that gets cut is the
    # grown one. The soft edge roughly doubles a brow's area and halves its aspect,
    # so measuring the grown mask would make the tripwire below meaningless and the
    # face-frame angles softer than the stroke they are meant to describe.
    ys, xs = np.where(seed)
    pts = np.stack([xs.astype(float), ys.astype(float)])
    c = pts.mean(1)
    p = pts - c[:, None]
    u, sv, _ = np.linalg.svd(p @ p.T / p.shape[1])
    sig = (math.sqrt(sv[0]), math.sqrt(sv[1]))
    ang = math.degrees(math.atan2(u[1, 0], u[0, 0])) % 180.0
    full = np.zeros(a.shape[:2], bool)
    full[y0:y1, x0:x1] = grown
    seed_full = np.zeros(a.shape[:2], bool)
    seed_full[y0:y1, x0:x1] = seed
    return dict(name=name, size=int(seed.sum()), mask=full, seed=seed_full,
                c=(c[0] + x0, c[1] + y0), ang=ang, sig=sig,
                aspect=sig[0] / max(sig[1], 1e-6),
                bb=(xs.min() + x0, xs.max() + x0, ys.min() + y0, ys.max() + y0))


def check(m):
    """Fail loudly if a window no longer holds the feature it is named for."""
    e = EXPECT[m["name"]]
    bad = []
    if abs(m["size"] - e["size"]) > SIZE_TOL * e["size"]:
        bad.append("%d px of ink, expected about %d" % (m["size"], e["size"]))
    if abs(m["aspect"] - e["aspect"]) > ASPECT_TOL:
        bad.append("aspect %.2f, expected %.2f" % (m["aspect"], e["aspect"]))
    if bad:
        raise SystemExit("the %s window does not hold a %s any more:\n  %s\n"
                         "Re-measure WINDOWS against the export before editing it."
                         % (m["name"], m["name"].split("_")[0], "\n  ".join(bad)))


def laplace_fill(img, hole, iters=ITERS):
    """Harmonic inpainting: the smoothest surface that meets the art at the rim.

    Lifted in shape from tools/cut-belly-hand.py, whose note explains why a copied
    pixel will not do on skin with a gradient across it. No src_ok here: the ring
    round a brow is forehead all the way round, which is the boundary condition
    wanted, so there is nothing to fence off.
    """
    band = ndi.binary_dilation(hole, np.ones((3, 3)), iterations=6)
    ys, xs = np.where(band)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    sub = img[y0:y1, x0:x1].astype(np.float64).copy()
    m = hole[y0:y1, x0:x1]
    rim = ndi.binary_dilation(m, np.ones((3, 3))) & ~m
    if not rim.any():
        raise SystemExit("the fill has no rim to solve from")
    for ch in range(3):
        f = sub[..., ch]
        f[m] = f[rim].mean()
        for _ in range(iters):
            avg = (np.roll(f, 1, 0) + np.roll(f, -1, 0)
                   + np.roll(f, 1, 1) + np.roll(f, -1, 1)) * 0.25
            f[m] = avg[m]
        sub[..., ch] = f
    out = img.astype(np.float64).copy()
    out[y0:y1, x0:x1][m] = sub[m]
    return out


def ring_mean(img, mask, lo=6, hi=14):
    """Mean colour of the skin annulus just outside `mask`.

    lo..hi rather than 0..hi so the stroke's own soft edge is not in the average.
    """
    inner = ndi.binary_dilation(mask, np.ones((3, 3)), iterations=lo)
    outer = ndi.binary_dilation(mask, np.ones((3, 3)), iterations=hi)
    # SKIN ONLY. The annulus above the brow grazes his hair, and eight dark pixels
    # in it move the mean enough to matter on a correction this small.
    ring = outer & ~inner & is_skin(img)
    return img[ring].reshape(-1, 3).mean(0), ring


def main():
    preview = "--preview" in sys.argv[1:]
    if not SRC.is_file():
        raise SystemExit("missing %s - export node 305:134 as PNG 2x" % SRC)

    im = Image.open(SRC)
    rgba = np.asarray(im.convert("RGBA")).astype(np.uint8)
    rgb = rgba[..., :3].astype(np.float64)

    ink = rgba[..., :3].astype(int)
    # EYES FIRST, so their seeds can wall the brows off - see measure().
    M = {k: measure(ink, k) for k in ("eye_l", "eye_r")}
    wall = ndi.binary_dilation(M["eye_l"]["seed"] | M["eye_r"]["seed"],
                               np.ones((3, 3)), iterations=3)
    for k in ("brow_l", "brow_r"):
        M[k] = measure(ink, k, wall=wall)
    for m in M.values():
        check(m)
        print("%-7s size %6d  bbox x %4d-%4d y %4d-%4d  c (%7.1f,%7.1f)  "
              "axis %5.1f  sigma %5.1f/%5.1f  aspect %.2f"
              % (m["name"], m["size"], *m["bb"], m["c"][0], m["c"][1],
                 m["ang"], m["sig"][0], m["sig"][1], m["aspect"]))

    # --- the head's roll, from its own eyes -----------------------------------
    EL, ER = M["eye_l"]["c"], M["eye_r"]["c"]
    roll = math.atan2(ER[1] - EL[1], ER[0] - EL[0])
    ca, sa = math.cos(roll), math.sin(roll)

    def to_face(p, o):
        dx, dy = p[0] - o[0], p[1] - o[1]
        return (dx * ca + dy * sa, -dx * sa + dy * ca)

    def to_image(d, o):
        return (o[0] + d[0] * ca - d[1] * sa, o[1] + d[0] * sa + d[1] * ca)

    dL = to_face(M["brow_l"]["c"], EL)
    dR = to_face(M["brow_r"]["c"], ER)
    want = (-dL[0], dL[1])                      # mirror x, keep the height
    target = to_image(want, ER)
    dx = target[0] - M["brow_r"]["c"][0]
    dy = target[1] - M["brow_r"]["c"][1]

    print("\nroll from the eye line   %+.2f deg" % math.degrees(roll))
    print("left  brow, face frame   (%+7.1f, %+7.1f) from its eye" % dL)
    print("right brow, face frame   (%+7.1f, %+7.1f) from its eye" % dR)
    print("the mirror wants         (%+7.1f, %+7.1f)" % want)
    print("so it is                 %.1f px too far out, %.1f px too low"
          % (dR[0] - want[0], want[1] - dR[1]))
    print("move the right brow by   (%+.1f, %+.1f) figma px" % (dx, dy))
    print("brow angles, face frame  left %+.1f  right %+.1f  (mirror wants %+.1f)"
          % (((M["brow_l"]["ang"] - math.degrees(roll) + 90) % 180) - 90,
             ((M["brow_r"]["ang"] - math.degrees(roll) + 90) % 180) - 90,
             -(((M["brow_l"]["ang"] - math.degrees(roll) + 90) % 180) - 90)))

    # --- lift the brow, fill the hole, put it back one place over --------------
    grown = M["brow_r"]["mask"]
    if (grown & wall).any():
        raise SystemExit("the grown right brow still reaches the eye - lower GROW")
    # THE PATCH IS FENCED OFF THE EYE, not merely grown from a brow that no longer
    # includes it. 16 px of dilation from a stroke whose tip is 3 px from the eye rim
    # reaches 2115 px into the eye, and the harmonic fill would then solve the eye
    # away - which is what the first render did. Subtracting the wall is the same
    # rule tools/cut-recap-sprites.py states for its guards: a patch never paints
    # over a neighbour it merely passed close to.
    fat = ndi.binary_dilation(grown, np.ones((3, 3)), iterations=DILATE) & ~wall
    alpha = ndi.gaussian_filter(fat.astype(np.float64), FEATHER)
    alpha = np.clip((alpha - 0.30) / 0.40, 0, 1)      # a ~5px edge, not a jagged cut
    print("\ncut                      %d px of stroke, %d px of patch, %d px of eye"
          % (grown.sum(), fat.sum(), (fat & wall).sum()))

    filled = laplace_fill(rgb, fat)

    idx = np.round([dy, dx]).astype(int)
    sprite = np.roll(np.roll(rgb, idx[0], axis=0), idx[1], axis=1)
    sa_ = np.roll(np.roll(alpha, idx[0], axis=0), idx[1], axis=1)

    # THE TONE MATCH IS WEIGHTED BY SKINNESS, and unweighted it tints the brow.
    # The patch is mostly forehead with one dark stroke in it; the correction belongs
    # to the forehead, so `skinny` is 1 where the pixel is skin, 0 on the stroke and
    # ramps between over the stroke's own soft edge. Adding a flat shift instead put
    # +8.8 on the red channel of the ink as well, which is a 3% lighter eyebrow.
    skinny = ndi.gaussian_filter(is_skin(rgb).astype(np.float64), 1.5)
    skinny = np.roll(np.roll(skinny, idx[0], axis=0), idx[1], axis=1)

    src_mean, _ = ring_mean(rgb, fat)
    dst_mean, _ = ring_mean(filled, np.roll(np.roll(fat, idx[0], 0), idx[1], 1))
    shift = dst_mean - src_mean
    print("tone match               source ring %s  destination %s  shift %s"
          % (np.round(src_mean, 1), np.round(dst_mean, 1), np.round(shift, 2)))
    sprite = sprite + shift * skinny[..., None]

    out = filled * (1 - sa_[..., None]) + sprite * sa_[..., None]
    out = np.clip(np.round(out), 0, 255).astype(np.uint8)

    res = rgba.copy()
    res[..., :3] = out                 # alpha is a uniform 242 and is left alone

    if preview:
        x0, y0, x1, y1 = 1520, 940, 1920, 1260
        before = Image.fromarray(rgba[y0:y1, x0:x1, :3])
        after = Image.fromarray(res[y0:y1, x0:x1, :3])
        pan = Image.new("RGB", (before.width * 2 + 30, before.height), (245, 240, 232))
        pan.paste(before, (0, 0))
        pan.paste(after, (before.width + 30, 0))
        pan.save(PREVIEW)
        print("\npreview                  %s (before | after)" % PREVIEW.name)
        print("wrote nothing else")
        return

    Image.fromarray(res, "RGBA").save(DST)
    print("\nwrote                    %s  %dx%d  %.1fMB"
          % (DST.name, res.shape[1], res.shape[0], DST.stat().st_size / 1e6))
    print("\nNow: python tools/recut-r4-earring.py   (it prefers this file), then\n"
          "re-cut card 10's eye sprites and bump BUILD in app.js + ?v= in index.html.")


if __name__ == "__main__":
    main()
