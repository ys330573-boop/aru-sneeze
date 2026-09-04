#!/usr/bin/env python3
"""Soft masks for the recap's WARPS - the third way of making a flat picture move.

WHY THIS EXISTS, AND WHY IT IS NOT tools/cut-recap-sprites.py OR cut-belly-hand.py
    Those two CUT: they lift an element out of the card as its own RGBA sprite and
    inpaint the hole it leaves, so the sprite can be carried anywhere. That is the
    right method when a thing genuinely LEAVES - a lid falls out of a hand, a samosa
    goes into a dog, six tumblers come off two shelves.

    It is the wrong method when a thing merely SHIFTS a few pixels against its own
    body, and card 1 is the proof. Measured on the shipped cut of Aaru's forearm:

        the drawn silhouette line is not in the mask   716 of 1042 dark px dropped
        the matte's rim is a rainbow fringe            RMS 52.9/255, 106 px railed
        the inpaint under it is wrong wherever seen    mean 26/255 at every angle
        and the hand only ever travels                 5.3 screen px, 0.24 px/frame

    Three of those four are the inpaint and the matte, and none of them is fixable
    in principle: what is behind that forearm is his own striped t-shirt, and no
    method reconstructs a stripe it has never seen.

THE WARP, WHICH INVENTS NOTHING
    Put a SECOND COPY OF THE WHOLE CARD on top of the card, under a soft mask of
    the element, and transform the copy. Then

        at rest              the copy is pixel-identical to what is under it, so
                             the card is exactly the artist's picture
        moved                the element moves, and what fills the place it left is
                             THE ART THAT WAS BESIDE IT, sliding in. A hand pressing
                             a belly drags the shirt with it, which is what a hand
                             pressing a belly does
        at the mask's edge   the moved copy cross-fades into the untouched card over
                             the feather, so there is no cut line, no matte, no
                             fringe and nothing to unmix

    The whole asset is therefore ONE GREYSCALE MASK. There is no sprite PNG and no
    patch PNG, because there is nothing to lift and nothing to fill.

WHAT IT COSTS
    The deformation is not free of artefacts, it just has a different one: a stripe
    that crosses the feather is drawn twice, a couple of pixels apart, at partial
    alpha - i.e. that stripe's edge goes soft while the element moves. That is a
    blur on two edges rather than a smear over a whole belly, and it is bounded by
    the excursion, so the knob is `swing` and not the mask.

    It also caps the excursion. A rigid rotation of a neighbourhood only reads as an
    articulation while the neighbourhood is small compared to the body part; past
    about 15 degrees on card 1 the waistband of his shorts visibly bends. Check the
    strip, do not trust the number.

WHAT IT WORKS FROM
    scratchpad/cards-hd/NN-id.png - each card rendered at HD (3x) from the artwork by
    tools/make-hd-cards.py, which is 932 x 637. THAT IS 1:1 WITH THE SCREEN: a card
    pops to scale RING_SCALE * 3 on a 398px box, i.e. 931.7 CSS px, so one pixel in
    those files is one pixel the child sees. Every number in this table is therefore
    in SCREEN pixels, and a feather of 5 is a five-pixel cross-fade - not something
    that will be shrunk by a downscale later. cut-belly-hand.py's feather was tuned
    against a 3x downscale that does not happen; do not repeat that here.

RUN IT
    python tools/warp-masks.py                 every element
    python tools/warp-masks.py 01-belly        just one
    python tools/warp-masks.py --check         verify and write the strips only

    AARU_SCRATCH overrides the scratchpad, which is per session.
"""
import json
import math
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
SCRATCH = Path(os.environ.get(
    "AARU_SCRATCH",
    "C:/Users/ANANYA~1/AppData/Local/Temp/claude/"
    "c--Users-Ananya-Goswami-OneDrive-Desktop-Aaru-ki-cheenk/"
    "672c9ba2-d32b-447a-b17f-a5b8f9adc2e0/scratchpad"))
CHECK_DIR = SCRATCH / "recap-check"
OUT_DIR = ROOT / "assets" / "images"

HD = 3            # cards-hd's scale, and the recap's pop, and therefore the screen

# --------------------------------------------------------------------------- #
# THE TABLE. Every number in 3x card pixels = screen pixels. Divide by HD for the
# 1x numbers app.js carries; the script prints both.
#
#   card      the file in cards-hd/
#   stem      what the mask is written as, and app.js's `file`
#   slot      the manifest key. It MUST start with the zero-padded ring slot,
#             because tools/sim.js does parseInt(key, 10) - 1 to find the scene.
#   find      how to separate the element from what is round it:
#               ('skin', rois)          the colour-ratio classifier, for a limb
#               ('body', rois, cols)    everything that is not the flat wall, whose
#                                       colour is measured per row from a clean
#                                       column band at `cols`
#               ('blue', rois)          a saturated blue, for the locket's gem
#   ink       grow the mask onto the artist's drawn contour: (passes, max_lum).
#             A colour classifier stops INSIDE the black line an illustrator draws
#             round a limb, and a moving element that leaves its own outline behind
#             is the single most visible fault a cut can have. Cheap here and worth
#             it anyway: the outline is what gives the moving thing an edge.
#   dilate    how far past the element the mask reaches, in px. This is the room
#             the deformation has to die out in, so it scales with the excursion.
#   feather   sigma of the cross-fade, in px.
#   ramp      (lo, hi) contrast window on the blurred mask. Wider = softer.
#   cut       optional dict of hard walls applied to the mask AFTER `find`:
#               y_max / y_min / x_max / x_min. A head is cut at the neck so the
#               shirt does not swing with it.
#   pivot     the transform origin, in 3x card px.
#   swing     what the check strip rocks it by, in degrees - the element's own
#             excursion, so the strip shows the real thing.
#   drift     (dx, dy) in 3x px the strip also translates it by, for elements whose
#             motion is a slide rather than a turn.
#   motion    recorded in the manifest so a re-cut can be matched to its scene.
# --------------------------------------------------------------------------- #
ELEMENTS = {
    # ----------------------------------------------------------------------- #
    # "01-belly" WAS HERE and warped Aaru's forearm on card 1. It is gone, and the
    # reason is the one thing a warp cannot do: a warp turns EVERYTHING inside its
    # mask, and the mask has to be BIGGER than the element or the element has nowhere
    # to move into - so the shirt round the arm always goes with it. Tightened twice
    # and the user saw it both times: "his whole stomach is now moving". That element
    # is a CUT again, in tools/cut-belly-hand.py, and this time with the harmonic
    # patch that made card 10's blink work - which is what the Voronoi fill was
    # missing when it was a cut before.
    # "08-head" WAS HERE and drooped the boy's head on card 8. It is gone. The
    # droop worked - the mask held his head and nothing else, verified - and it was
    # still the wrong beat: the user asked for that scene to be "sad animation on his
    # face expression thats it", and a head going down is his whole upper body
    # moving, whatever the mask holds. His EYES do it now, as cuts, in
    # tools/cut-belly-hand.py: a slow heavy blink and nothing else on the card moves
    # at all. His mouth was measured and ruled out for this - 6.0 x 2.7 px at the
    # size that plays, drawn with a stroke under a pixel wide.
    # ----------------------------------------------------------------------- #
    "10-gem": dict(
        card="10-earring.png",
        stem="10-gem",
        slot="10-gem",
        element="the blue gem of Amma's locket, on its cord",
        # app.js SAID THIS COULD NOT BE CUT, and for the CORD plus the gold cap that
        # is true: the cap meets the left edge of her yellow sleeve and there is no
        # background either side of it. The GEM is not that. Measured on the 3x card
        # it sits against flat cream on its left, its right and its whole underside;
        # only its top touches the cap.
        #
        # AND A WARP DOES NOT NEED IT TO BE CUTTABLE ANYWAY. Nothing is inpainted, so
        # the question is only whether the mask can hold the gem without holding
        # something that must not move - and the cream round it can move as much as
        # it likes, because it is flat.
        find=("blue", [(112, 330, 175, 392)]),
        ink=(2, 150),
        dilate=5,
        feather=3.5,
        ramp=(0.32, 0.68),
        # THE CORD'S OWN ANCHOR, well ABOVE the mask: the point where the two strands
        # leave her fingers. A pendulum turns about its hanger, not about itself, and
        # transform-origin is free to sit outside the element it turns.
        # THE PIVOT SITS AT THE TOP OF THE MASK, and that placement is doing more
        # work than the angle is. A rigid turn moves every pixel in the mask, and
        # the mask cannot help holding a little of Amma's forearm just above the
        # gem - her arm carries drawn crease lines, and sliding those 10px is
        # instantly visible. Put the origin at the BAIL and everything near it
        # barely moves: at 12 degrees the art 3px above the pivot travels 0.6px
        # while the gem, 25px below it, travels 5.3px. The cord's true anchor is
        # 130px further up at her fingers, which is the honest pendulum and the
        # wrong choice - it would swing her arm with the gem.
        cut=dict(y_min=336),
        ceil=338,                # ...and again on the finished alpha, see soft_alpha
        pivot=(142.0, 336.0),
        swing=12.0,
        motion="sway",
    ),
    # ----------------------------------------------------------------------- #
    "10-aaru": dict(
        card="10-earring.png",
        stem="10-aaru",
        slot="10-aaru",
        element="Aaru's head, tipping shyly as the locket is handed back",
        # THE WINDOW HAS TO START ABOVE HIS HAIR. It began at y=330 for one run and
        # the top 46px of his curls fell outside it, so the crown stayed put while
        # the face tipped - a shear across the middle of his head.
        #
        # AND IT HAS TO END CLEAR OF IT TOO, which the old x=800 did not. Aaru moved
        # about 10 card px right when tools/recut-r4-earring.py swapped this card to
        # story slide 24, and his hair now reaches x=795 - five pixels inside a window
        # that the dilate and the feather below both grow past. Re-measured on the
        # corrected card his head is x 549-795, y 284-506, so the window is given real
        # margin on every side instead of grazing him on one.
        find=("body", [(520, 270, 815, 515)], (800, 900)),
        ink=None,
        cut=dict(y_max=506),
        floor=506,
        # SMALL, for card 8's reason: everything outside this head is flat wall, so
        # the cross-fade needs almost no room, and every pixel of room it is given
        # below the jaw is a pixel of striped shirt that turns with him.
        dilate=3,
        feather=3.5,
        ramp=(0.34, 0.72),
        # His neck's narrowest row, y 502-505 running x 652..688, centred. Unlike
        # card 8 this boy HAS a neck, and it is flanked by wall on both sides.
        # RE-MEASURED after the card swap: it was y 507-510 running x 636..673, so the
        # head had been tipping about a point 5 card px off its own neck.
        pivot=(670.0, 503.5),
        # NEGATIVE, so the top of his head goes TOWARDS his mother rather than away
        # from her. Both directions read as a tilt; only one of them reads as shy.
        swing=-3.5,
        drift=(0, 3),
        motion="shy",
    ),
}

GR = (0.48, 0.80)          # green/red, the band skin sits in - cut-belly-hand.py's
BR = (0.24, 0.55)          # blue/red
R_MIN = 150


def is_skin(card):
    R, G, B = card[..., 0], card[..., 1], card[..., 2]
    Rs = np.maximum(R, 1.0)
    return ((R > R_MIN)
            & (G / Rs > GR[0]) & (G / Rs < GR[1])
            & (B / Rs > BR[0]) & (B / Rs < BR[1]))


def roi_of(shape, rois):
    m = np.zeros(shape[:2], bool)
    for (x0, y0, x1, y1) in rois:
        m[y0:y1, x0:x1] = True
    return m


def wall_field(card, cols):
    """The flat background's colour, one value per row.

    A wall painted in watercolour is not one colour: on card 8 it runs 230,200,165 at
    the top to 242,212,174 near the floor. Along a ROW it barely moves, so a clean
    column band gives the field and the residual is the boy."""
    strip = card[:, cols[0]:cols[1], :].mean(axis=1)
    return np.dstack([ndi.gaussian_filter1d(strip[:, c], 6) for c in range(3)])[0]


def build_mask(card, spec):
    kind = spec["find"][0]
    rois = spec["find"][1]
    roi = roi_of(card.shape, rois)

    if kind == "skin":
        hit = is_skin(card)
    elif kind == "body":
        fld = wall_field(card, spec["find"][2])
        hit = np.sqrt(((card - fld[:, None, :]) ** 2).sum(axis=2)) > 26
    elif kind == "blue":
        R, G, B = card[..., 0], card[..., 1], card[..., 2]
        hit = (B > 110) & (B > R + 28) & (B > G + 18)
    else:
        raise SystemExit("no such find %r" % kind)

    m = hit & roi
    m = ndi.binary_closing(m, np.ones((5, 5)))
    m = ndi.binary_fill_holes(m)
    lab, n = ndi.label(m)
    if n == 0:
        raise SystemExit("nothing matched in the roi - the test or the window is wrong")
    sizes = ndi.sum(m, lab, range(1, n + 1))
    m = ndi.binary_fill_holes(lab == int(np.argmax(sizes)) + 1)

    # THE DRAWN CONTOUR, grown onto one dilation at a time so the mask stops at the
    # line rather than jumping past it into whatever is dark next door.
    if spec.get("ink"):
        passes, lum_max = spec["ink"]
        lum = card.mean(axis=2)
        wide = roi_of(card.shape, [(x0 - 8, y0 - 8, x1 + 8, y1 + 8) for (x0, y0, x1, y1) in rois])
        for _ in range(passes):
            edge = ndi.binary_dilation(m, np.ones((3, 3))) & ~m
            m = m | (edge & (lum < lum_max) & wide)
        m = ndi.binary_fill_holes(ndi.binary_closing(m, np.ones((3, 3))))

    for key, val in (spec.get("cut") or {}).items():
        if key == "y_max": m[val:, :] = False
        elif key == "y_min": m[:val, :] = False
        elif key == "x_max": m[:, val:] = False
        elif key == "x_min": m[:, :val] = False
    return m


def soft_alpha(mask, dilate, feather, ramp, floor=None, ceil=None):
    big = ndi.binary_dilation(mask, np.ones((3, 3)), iterations=dilate) if dilate else mask
    a = ndi.gaussian_filter(big.astype(float), feather)
    a = np.clip((a - ramp[0]) / (ramp[1] - ramp[0]), 0, 1)
    # `floor` IS A WALL ON THE FINISHED ALPHA, and it has to be applied here rather
    # than to the mask, because `cut` runs BEFORE the dilation and the feather and
    # both of them put it back: cutting a head at the collar and then growing the
    # mask 3px with a 3.5px fade returns six rows of striped shirt to it, which is
    # the shirt then turning with the head. The user's word on that: "his whole
    # shoulder and head is in movement, which is so wrong".
    #
    # A HARD EDGE HERE IS FREE because the wall is put on a line the artist already
    # drew - the collar - so the discontinuity coincides with a high-contrast
    # boundary and there is nothing for the eye to catch on. Do not use it anywhere
    # the cut-off is in the middle of flat colour.
    if floor is not None:
        a[floor:, :] = 0.0
    # `ceil` is the same wall the other way up, and the locket needs it: `cut`'s
    # y_min put the mask below Amma's forearm and then the dilation and the feather
    # handed eight rows of it back, so her arm's drawn crease lines slid 5px with the
    # gem. The user: "mom hand is also moving along with pendant". The gem's own top
    # edge is at 343, so a wall at 338 keeps the stone whole and her arm out.
    if ceil is not None:
        a[:ceil, :] = 0.0
    return a


def warped(card, a, deg, drift, pivot):
    """What the browser will draw: the card, transformed about `pivot`, under `a`.

    PIL rather than an affine by hand, because this has to match a CSS
    `rotate()`/`translate()` on an <img> and PIL's rotate is the same convention -
    positive is anticlockwise there and clockwise in CSS, so the sign is flipped
    here and only here."""
    img = Image.fromarray(np.clip(card, 0, 255).astype("uint8"))
    if deg:
        img = img.rotate(-deg, resample=Image.BICUBIC, center=pivot)
    out = np.array(img).astype(float)
    if drift and (drift[0] or drift[1]):
        yy, xx = np.mgrid[0:card.shape[0], 0:card.shape[1]].astype(float)
        out = np.dstack([ndi.map_coordinates(out[..., c], [yy - drift[1], xx - drift[0]],
                                             order=3, mode="nearest") for c in range(3)])
    return card * (1 - a[..., None]) + out * a[..., None]


def cut(name, spec, check_only):
    src = SCRATCH / "cards-hd" / spec["card"]
    if not src.is_file():
        raise SystemExit("no %s - run tools/make-hd-cards.py first (AARU_SCRATCH=%s)"
                         % (src, SCRATCH))
    card = np.array(Image.open(src).convert("RGB")).astype(float)
    print("=== %s: %s" % (name, spec["element"]))

    mask = build_mask(card, spec)
    a = soft_alpha(mask, spec["dilate"], spec["feather"], spec["ramp"],
                   spec.get("floor"), spec.get("ceil"))
    ys, xs = np.where(a > 0.004)
    if not len(ys):
        raise SystemExit("the feathered mask is empty")

    # THE BOX, snapped OUTWARD to a multiple of HD so the 1x box app.js carries is an
    # integer and the mask is an exact 3x of it. The mask is applied with
    # `mask-size: 100% 100%`, so the PNG's pixels and the box's screen pixels have to
    # agree exactly or the whole cross-fade slides.
    x0 = int(np.floor(xs.min() / HD)) * HD
    y0 = int(np.floor(ys.min() / HD)) * HD
    x1 = int(np.ceil((xs.max() + 1) / HD)) * HD
    y1 = int(np.ceil((ys.max() + 1) / HD)) * HD
    box1x = [x0 // HD, y0 // HD, x1 // HD, y1 // HD]
    print("mask          : %d px hard, %d px soft   feather %.1f, dilate %d"
          % (mask.sum(), int((a > 0.004).sum()), spec["feather"], spec["dilate"]))
    print("box           : 3x (%d,%d,%d,%d)  ->  1x %s   mask %dx%d px"
          % (x0, y0, x1, y1, box1x, x1 - x0, y1 - y0))

    pivot = spec["pivot"]
    swing = spec["swing"]
    drift = spec.get("drift", (0, 0))

    # VERIFY (a): AT REST THE CARD IS THE CARD. A warp has no matte and no inpaint,
    # so this is not "close" - it is exact, and if it is not, the mask has been
    # written or read at the wrong size.
    rest = warped(card, a, 0.0, (0, 0), pivot)
    print("rest          : %.4f/255 max over the whole card (0 is the point)"
          % np.abs(rest - card).max())

    # VERIFY (b): HOW MUCH ART CROSSES THE FEATHER, which is the warp's own artefact
    # and the number to watch when the swing is raised. For each pixel in the
    # cross-fade band, how far the transform moves it: the band's own displacement is
    # what gets drawn twice.
    band = (a > 0.06) & (a < 0.94)
    yy, xx = np.where(band)
    r = math.radians(swing)
    dx = (math.cos(r) - 1) * (xx - pivot[0]) - math.sin(r) * (yy - pivot[1]) + drift[0]
    dy = math.sin(r) * (xx - pivot[0]) + (math.cos(r) - 1) * (yy - pivot[1]) + drift[1]
    disp = np.hypot(dx, dy)
    print("feather band  : %d px, displaced %.2f px mean / %.2f max at %.1f deg "
          "- the width of the double-drawn edge" % (band.sum(), disp.mean(),
                                                    disp.max(), swing))

    # AND WHAT THE GESTURE ITSELF IS WORTH, in the only unit that matters: how far
    # the far end of the element travels on the screen. Under about 6px a rub is a
    # shimmer, whichever way it is drawn - this is the number card 1's old cut was
    # failing on (5.3px), and no matte fix would have moved it.
    hy, hx = np.where(mask)
    d0 = np.hypot(hx - pivot[0], hy - pivot[1])
    far = d0.max()
    travel = math.hypot(far * math.sin(abs(r)) + 0, 0) + math.hypot(*drift)
    print("gesture       : farthest masked px is %.1f px from the pivot, so %.1f deg "
          "+ drift moves it %.1f screen px" % (far, swing, travel))

    # THE CHECK STRIP: at rest, then rocked through its own excursion both ways. If
    # the first panel is not the artist's picture the mask is wrong; if a middle
    # panel bends something that should not bend, the swing is too big.
    CHECK_DIR.mkdir(parents=True, exist_ok=True)
    pad = 26
    view = (slice(max(0, y0 - pad), min(card.shape[0], y1 + pad)),
            slice(max(0, x0 - pad), min(card.shape[1], x1 + pad)))
    steps = [(0.0, (0, 0)), (swing * 0.5, (drift[0] * 0.5, drift[1] * 0.5)),
             (swing, drift), (-swing, (-drift[0], -drift[1]))]
    panels = [card[view]] + [warped(card, a, d, t, pivot)[view] for d, t in steps]
    K = 4
    strip = Image.new("RGB", (sum(int(p.shape[1] * K) for p in panels),
                              int(panels[0].shape[0] * K)), (255, 255, 255))
    ox = 0
    for p in panels:
        img = Image.fromarray(np.clip(p, 0, 255).astype("uint8"))
        img = img.resize((img.width * K, img.height * K), Image.NEAREST)
        strip.paste(img, (ox, 0))
        ox += img.width
    strip.save(CHECK_DIR / (spec["stem"] + "-warp.png"))
    print("check strip   : %s" % (CHECK_DIR / (spec["stem"] + "-warp.png")))

    if check_only:
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # WHITE RGB, ALPHA IS THE MASK. `mask-image` on a PNG defaults to
    # mask-mode: match-source, i.e. the alpha channel, and white under it means a
    # luminance reading of the same file would say the same thing.
    sub = a[y0:y1, x0:x1]
    png = np.dstack([np.full(sub.shape, 255.0)] * 3 + [sub * 255.0]).astype("uint8")
    Image.fromarray(png).save(OUT_DIR / ("%s-mask.png" % spec["stem"]))

    # THE MANIFEST IS WHAT tools/sim.js CHECKS app.js AGAINST: it walks the manifest
    # and demands a SCENE_FX sprite with the same `file` and a byte-equal `box`. So
    # the row goes in or slot N reports as drifted.
    # AND IT IS recap-manifest.json, NOT manifest.json, which this wrote for a
    # while and which nothing read. sim.js has always looked for
    # assets/images/recap-manifest.json - the tracked file with all fifteen rows
    # in it - so a cut written to the shorter name updated an untracked stray and
    # the drift check went on comparing app.js against whatever was last written
    # to the real one. It reported nothing wrong, which is the failure mode this
    # guard exists to prevent, one level up.
    mpath = OUT_DIR / "recap-manifest.json"
    man = json.loads(mpath.read_text(encoding="utf-8")) if mpath.is_file() else {}
    org = [(pivot[0] - x0) / (x1 - x0) * 100.0, (pivot[1] - y0) / (y1 - y0) * 100.0]
    man[spec["slot"]] = {
        "box": box1x,
        "file": spec["stem"],
        "kind": "warp",
        "cut_by": "tools/warp-masks.py",
        "element": spec["element"],
        "motion": spec["motion"],
        "origin": [round(pivot[0] / HD, 2), round(pivot[1] / HD, 2)],
        "org_pct": [round(org[0], 1), round(org[1], 1)],
        "swing": swing,
        "drift": list(drift),
    }
    mpath.write_text(json.dumps(man, indent=1, sort_keys=True), encoding="utf-8")
    print("wrote         : %s-mask.png at %dx%d, manifest %s updated"
          % (spec["stem"], x1 - x0, y1 - y0, spec["slot"]))
    print("app.js wants  : box: [%d, %d, %d, %d], org: '%.1f%% %.1f%%'"
          % (box1x[0], box1x[1], box1x[2], box1x[3], org[0], org[1]))


def main():
    check_only = "--check" in sys.argv
    want = [a for a in sys.argv[1:] if not a.startswith("--")] or list(ELEMENTS)
    for name in want:
        if name not in ELEMENTS:
            raise SystemExit("no such element %r - have %s" % (name, list(ELEMENTS)))
        cut(name, ELEMENTS[name], check_only)
        print("")


if __name__ == "__main__":
    main()
