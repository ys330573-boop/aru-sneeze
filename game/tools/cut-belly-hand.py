#!/usr/bin/env python3
"""Cut small features off a recap card - eyes, and once a forearm - and inpaint the
holes they leave.

THE FOREARM IS NOT CUT ANY MORE, and this file is where that decision is recorded
because it is this file's own method that failed. The "belly-hand" entry lifted
Aaru's forearm off card 1 over a Voronoi patch, and the patch could not be made
right: what is behind that arm is his own striped t-shirt, and the fill's only
options were to copy a stripe from above (wrong stripe) or skin from his other arm
(an orange blob). Measured on the shipped result - the artist's silhouette line
missing from the matte, a rim 52.9/255 RMS out with 106 pixels railed, and the patch
~26/255 wrong at every angle it was ever seen at. The arm is a WARP now: see
tools/warp-masks.py, which inpaints nothing. Everything below about the skin
classifier is still true and still used - by the warp tool, and by the eyes here.

WHY THIS IS NOT tools/cut-recap-sprites.py
    That script is the right tool for nine of the ten cards and the wrong one for
    this element, and the reason is its step 2. It rebuilds the background by
    interpolating ALONG ROWS - measured on 05-fall, where a row of sky moves less
    than 10/255 across the whole card - and then calls anything far from that field
    "the element".

    Neither half of that survives here.

      THE DETECTOR. What is behind this forearm is his own striped t-shirt above it
      and his blue shorts below it, and to its lower left is the OUTSIDE of his
      silhouette: pale step and cream wall. A row through the middle of the forearm
      therefore runs wall -> skin -> shirt, so np.interp across the gap blends grey
      plaster into an orange stripe and the "distance from background" test lights
      up the whole torso. This is the failure 08-home's note predicted in advance:
      "what is behind it is his own striped shirt and his arms, so the patch would
      have had to invent a t-shirt."

      THE PATCH. Row interpolation is the wrong direction for this artwork anyway.
      The stripes are horizontal BANDS, so the flat direction here is across a row
      only by luck and never across the silhouette edge. What is actually true is
      that every pixel the forearm covers is within a few pixels of a pixel of the
      same thing - shirt above, shorts below, wall to the left - so the honest
      reconstruction is NEAREST-NEIGHBOUR from outside the mask in whatever
      direction is closest, not interpolation along one axis.

    So: a colour classifier for the mask, and a Voronoi fill for the patch. Both are
    checked the same way the other script checks itself, and the numbers are printed.

WHAT MOVES, AND WHY IT IS THE WHOLE FOREARM
    The user asked to "show only aaru hand movement on his stomach". The hand alone
    cannot be cut: hand, wrist and forearm are one continuous run of skin at one
    tone, with no edge between them to cut along - see the 13x view this was
    measured on. Cutting at the wrist would put a hard line across bare skin, which
    is a worse artefact than the thing it was avoiding.

    The forearm is a real element with real edges on every side (shirt above and
    right, shorts below, his own silhouette lower-left), and rocking it about the
    ELBOW moves the hand and leaves the elbow where the sleeve is - which is what an
    arm does. So the cut is elbow-to-fingertips and the pivot is the elbow.

THE MASK IS A COLOUR TEST, and the ratios rather than the channels
    Skin and the shirt's orange stripes are both "high red", so R alone cannot
    separate them; what separates them is how much green and blue is left.

        thing            RGB               G/R    B/R
        forearm          255 159  92       0.62   0.36
        hand, shaded     234 145  85       0.62   0.36
        elbow, in shadow 202 114  59       0.56   0.29
        orange stripe    200  63   8       0.32   0.04   <- the thing to reject
        stripe, lit      214  88  28       0.41   0.13
        white stripe     255 223 189       0.87   0.74
        step / wall      216 177 135       0.82   0.63
        blue shorts       23  52  84       R too low

    G/R in 0.48..0.76 with B/R in 0.24..0.55 and R > 150 puts a clean gap either
    side of skin: the nearest reject is the lit stripe at 0.41 and the step at 0.82.

    THE ROI IS PART OF THE MASK, not a speed-up. His face, his other arm and his
    legs are the same skin at the same ratios, so the test has to be told which
    limb. The box is measured off the 3x card and is quoted below.

RUN IT
    python tools/cut-belly-hand.py            # cut, verify, write
    python tools/cut-belly-hand.py --check    # verify and write the check strip only

    The scratchpad is per-session, so set AARU_SCRATCH if the default below is not
    yours. Every other tool in here has that path hard-coded to a session that has
    since ended; this one takes the override.
"""
import json
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

HD = 3                      # cards-hd is rendered at 3x, matching the pop-out

# --------------------------------------------------------------------------- #
# THE TABLE. One entry per element this script cuts. EVERY NUMBER IS IN 3x CARD
# PIXELS, measured on cards-hd/<card>. Divide by HD for the 1x numbers app.js
# carries.
#
#   card      the file in cards-hd/
#   stem      what the sprite/patch are written as, and the app.js `file`
#   rois      one or more (x0,y0,x1,y1) windows the classifier may look in. The
#             window IS part of the mask definition: the same skin, the same dark
#             brown, appear all over a drawing, so the test has to be told WHERE.
#   test      'skin' keeps skin-coloured pixels; 'not_skin' keeps everything that
#             is not skin, which is how an eye (white + iris + lash, three very
#             different colours) is caught by one rule.
#   keep      'largest' keeps one blob; an integer keeps every blob at least that
#             many pixels, which is how TWO eyes come out as one sprite.
#   fill      optional (y, x) cost for the inpaint's idea of "nearest" - see
#             inpaint_nearest. (6, 1) follows a horizontal grain; omit for circles.
#   pivot     the transform origin, in 3x card px, reported back as a percentage
#             of the sprite's own box for app.js's `org`. May instead be
#             ('box', fx, fy) - fractions of the box the cut turns out to have,
#             which is what an eye wants: its pivot is "88% down MY OWN box", and
#             the box is not known until the mask has been built.
#   patch     'voronoi' (the default, inpaint_nearest) or 'laplace'. See
#             laplace_fill for why an eye needs the second one.
#   src       optional 'skin' - restrict the inpaint's SOURCES to skin, so a fill
#             behind an eye cannot reach into the lash or the iris next door.
#   strip     'rock' (the default) rotates the sprite for the check strip;
#             'squash' scales it vertically instead, which is what a blink does.
#   motion    what the manifest records this cut is for.
# --------------------------------------------------------------------------- #
ELEMENTS = {
    # ----------------------------------------------------------------------- #
    # AARU'S FOREARM AND HAND ON CARD 1, and this element has now been done three
    # ways. Worth all three lines, because each one failed for a different reason.
    #
    #   1. a cut with a VORONOI patch. The fill copies one nearby pixel, and the
    #      nearest pixel to the middle of his fist along a row is his OTHER ARM - so
    #      the patch was an orange blob, ~26/255 wrong at every angle it was seen at.
    #   2. a WARP - the card's own art under a soft mask, nothing inpainted. Correct
    #      in the crescent and wrong everywhere else: a warp turns EVERYTHING inside
    #      its mask, and the mask must be bigger than the arm or the arm has nowhere
    #      to move into. The user, twice: "his whole stomach is now moving".
    #   3. a cut with the HARMONIC patch, which is this. Only the arm moves, because
    #      only the arm is in the sprite; and the fill is right where it is SEEN,
    #      because Laplace leaves the rim at the rim's own colour and the excursion
    #      only ever uncovers three or four pixels next to that rim.
    #
    # src="not_skin" IS THE OTHER HALF OF IT. What is behind this forearm is shirt
    # and shorts, so skin is not a boundary condition - it is part of the hole. That
    # is what stops the fill reaching into his other arm the way the Voronoi one did.
    # ----------------------------------------------------------------------- #
    "belly-hand": dict(
        card="01-house.png",
        stem="01-belly",
        element="his forearm and hand, resting on his stomach",
        # cut-belly-hand's own window, widened 4px on the left where it was dropping
        # drawn skin at x 679-680. The window IS part of the mask: his face, his other
        # arm and his legs are the same skin at the same ratios.
        rois=[(676, 492, 721, 524)],
        test="skin",
        keep="largest",
        ink=(2, 145),
        pad_box=4,
        # 1.0, AND IN SCREEN PIXELS. The popped card is 1:1 with the 3x render, so
        # this is a one-pixel edge on the hand the child sees. It was 2.0 once, on
        # the reasoning that a 3x source feather becomes two thirds of a pixel "at
        # card scale" - there is no downscale, and the measured transition was 3.16
        # screen px, i.e. 11% of the arm's width per side.
        feather=1.0,
        reach_pad=0,
        pad_patch=2,
        patch="laplace",
        src="not_skin",
        pivot=(687.0, 500.0),
        motion=[0, 0, 9.0, 1180, "cubic-bezier(.37,0,.63,1)"],
    ),
    # AN EARLIER "belly-hand" cut this element with a Voronoi patch. It is gone, and the
    # docstring above has the measurement that retired it: an inpaint cannot rebuild
    # a striped t-shirt it has never seen. tools/warp-masks.py does that element now
    # and inpaints nothing. Its numbers, if they are ever wanted again -
    #   rois=[(680, 494, 721, 524)], test="skin", keep="largest", fill=(6, 1),
    #   pad_box=4, feather=2.0, reach_pad=0, pad_patch=2, pivot=(687.0, 500.0)
    # - and note `feather=2.0` was tuned against a 3x downscale that does not happen:
    # the popped card is 1:1 with the 3x render, so that 2 was 2 SCREEN px.
    # ----------------------------------------------------------------------- #
    # BOTH EYES AS ONE SPRITE, and that is the whole trick of the eye-pop. The
    # cartoon gag is not "each eye gets bigger" - it is the pair bulging out of
    # the head, which means they grow AND splay apart. One sprite whose box spans
    # both of them, scaled about its own centre, does both at once for free: the
    # mask holds only the eyes, so the skin between them is transparent and does
    # not stretch, and scaling the box pushes the two eyes away from each other
    # by exactly as much as it magnifies them.
    #
    # THE TEST IS INVERTED because an eye is three colours and the face is one.
    # Sampled on the 3x card:
    #     skin        250 167  88   G/R 0.67  B/R 0.35
    #     eye white   248 232 208   G/R 0.94  B/R 0.84
    #     iris         93  32   4   R far too low
    #     pupil/lash   31  14   3   R far too low
    # so "not skin" is (B/R > 0.55) or (R < 150), and skin at B/R 0.32-0.37 with
    # R over 240 clears both by a mile. The EYEBROWS are the same dark brown as
    # the lashes, which is why each roi starts BELOW its own brow: the left brow
    # ends at y=205 and the right, which dips further, at y=225.
    # ----------------------------------------------------------------------- #
    # ONE ENTRY PER EYE, and that split is the whole difference between "his eyes
    # get bigger" and the gag the user actually asked for. A Tom-and-Jerry pop has
    # each eyeball LEAVING its own socket along its own axis, and the two diverge as
    # they go - which a single sprite scaled about a shared point cannot do, because
    # a scale can only ever move them along the line joining them.
    "pot-eye-l": dict(
        card="03-pot.png",
        stem="03-eye-l",
        element="his right eye (the viewer's left) - white, iris, pupil and lash",
        rois=[(514, 210, 580, 272)],
        test="not_skin",
        keep=200,
        # THE DRAWN LID LINE HAS TO BE IN THE SPRITE. The inverted skin test stops
        # INSIDE the dark arc the illustrator draws round an eye, so a sliver of that
        # arc stayed on the card - and when the eye widened, the sliver sat still
        # beside it as a separate dark crescent. That is what the user saw: "a small
        # portion is separately cut from the eye". Two dilations onto anything under
        # luminance 120 takes the line with the eye. The ROIs already start below the
        # brows, which are the same dark brown, so the growth cannot reach them.
        ink=(2, 120),
        pad_box=5,
        feather=1.0,
        # 0, for the same reason as the belly-hand above: the ring of inpaint the
        # patch used to lay round the element was landing on his FACE, and a smudge
        # round an eye is as visible as a smudge on a striped shirt. It cost the
        # right eye 2.24/255 mean over its box before anything moved.
        #
        # AND THE EYES CAN AFFORD IT MORE EASILY THAN THE HAND CAN, because all
        # they do now is grow. A sprite that only ever scales UP covers its own
        # footprint in every frame, so whatever rim is left behind in the card is
        # never uncovered - the rim only matters for an element that moves OFF the
        # place it was drawn.
        reach_pad=0,
        pad_patch=2,
        # THE HARMONIC PATCH, as card 10's eyes use. This card's right eye was the
        # worst patch in the set - 306 pixels inside its own footprint still read as
        # eye after the Voronoi fill, i.e. a third of the eye was still there under
        # the sprite - and the user could see it: "his right side eye is not cut
        # properly". A copied neighbour cannot follow a cheek's gradient; the smooth
        # interpolant leaves the rim at the rim's own colour. src="skin" keeps the
        # lash and the brow out of the boundary condition.
        patch="laplace",
        src="skin",
        pivot=(546.0, 241.0),
        motion=[0, 0, 0.0, 1500, "cubic-bezier(0.34,0,0.2,1)"],
    ),
    "pot-eye-r": dict(
        card="03-pot.png",
        stem="03-eye-r",
        element="his left eye (the viewer's right) - white, iris, pupil and lash",
        # Stop before the ear and hair at x=653. The earlier ROI continued to 670,
        # so the inverted skin test selected their dark edge as part of the eye.
        rois=[(604, 230, 652, 290)],
        test="not_skin",
        # THE DRAWN LID LINE HAS TO BE IN THE SPRITE. The inverted skin test stops
        # INSIDE the dark arc the illustrator draws round an eye, so a sliver of that
        # arc stayed on the card - and when the eye widened, the sliver sat still
        # beside it as a separate dark crescent. That is what the user saw: "a small
        # portion is separately cut from the eye". Two dilations onto anything under
        # luminance 120 takes the line with the eye. The ROIs already start below the
        # brows, which are the same dark brown, so the growth cannot reach them.
        ink=(2, 120),
        # 120 AND NOT "largest". The user: "scene 3 eye right, a small portion is
        # separately cut from the eye". It was: build_mask reported THREE components
        # for this eye and `keep` took only the biggest, so the other two stayed
        # behind on the card and sat still while the eye widened. An eye is a white,
        # an iris, a pupil and a lash - four very different colours with the lash
        # line cutting across them - so it arrives in pieces more often than not.
        keep=120,
        pad_box=5,
        feather=1.0,
        # 0, for the same reason as the belly-hand above: the ring of inpaint the
        # patch used to lay round the element was landing on his FACE, and a smudge
        # round an eye is as visible as a smudge on a striped shirt. It cost the
        # right eye 2.24/255 mean over its box before anything moved.
        #
        # AND THE EYES CAN AFFORD IT MORE EASILY THAN THE HAND CAN, because all
        # they do now is grow. A sprite that only ever scales UP covers its own
        # footprint in every frame, so whatever rim is left behind in the card is
        # never uncovered - the rim only matters for an element that moves OFF the
        # place it was drawn.
        reach_pad=0,
        pad_patch=2,
        patch="laplace",
        src="skin",
        pivot=(635.0, 259.0),
        motion=[0, 0, 0.0, 1900, "cubic-bezier(.2,1.1,.3,1)"],
    ),
    # ----------------------------------------------------------------------- #
    # AARU'S TWO EYES ON CARD 10, so he can blink as his mother hands the locket
    # back. Same inverted test as the card-3 eyes and a different PATCH, and the
    # patch is the whole difference: a blink SHRINKS the eye onto its own lower lid,
    # so the fill behind it is on screen at the moment the beat lands, where card
    # 3's eyes only ever grow and never uncover theirs at all.
    #
    # MEASURED FIRST. The skin round these eyes runs #f6a866 with a peak-to-peak
    # spread of 10-22/255 and a 7-16 unit ramp across the eye's own footprint, so a
    # Voronoi copy of one neighbour shows as a flat pale socket. laplace_fill leaves
    # the rim at the rim's colour and carries the ramp across. src="skin" keeps the
    # lash and the eyebrow out of the boundary condition.
    #
    # THE ROIs START BELOW THE BROWS: brow L occupies y 375-392 and brow R y 383-410,
    # and they are the same dark brown as the lashes. Eye R's window stops at x=735
    # because the head's silhouette ink starts at 740, and at y=450 because the top
    # of his mouth is at 451.
    #
    # RE-MEASURED, AND THE OLD NUMBERS WERE CUTTING HIS EAR AND HIS NOSE. The ROIs
    # here were measured on the artwork that r4-earring.webp carried BEFORE
    # tools/recut-r4-earring.py swapped the card to story slide 24 - the pose where
    # his hand is up at his head - and Aaru stands about 10 card px further right in
    # the new drawing. Nothing reported it, because a cut whose ROI has moved off its
    # element still finds SOMETHING non-skin in the window and cuts that: eye L's old
    # window (596,407)-(637,449) lands on his ear and the left rim of his eye, eye
    # R's on the bridge of his nose. So the blink beat was inpainting a patch of skin
    # over his ear and squashing a piece of his old face onto his nose - which is
    # where the "does Aaru have four eyes" report came from as much as the eyebrow
    # did. Re-measured on the corrected 3x card: eye L is x 627-660 / y 399-429 and
    # eye R x 690-727 / y 413-446.
    # ----------------------------------------------------------------------- #
    "earring-eye-l": dict(
        card="10-earring.png",
        stem="10-eye-l",
        element="his right eye (the viewer's left) - white, iris, pupil and lash",
        rois=[(615, 394, 668, 436)],
        test="not_skin",
        keep="largest",
        pad_box=3,
        # 1.0, AND IN SCREEN PIXELS. The popped card is 1:1 with the 3x render, so
        # this is a one-pixel edge on the eye the child sees - not something a
        # downscale will tighten later. See the docstring.
        feather=1.0,
        reach_pad=0,
        pad_patch=2,
        patch="laplace",
        src="skin",
        # 88% DOWN ITS OWN BOX. spr-blink squashes onto this line, and at 100% the
        # lash lands below where a lid actually closes.
        pivot=("box", 0.5, 0.88),
        strip="squash",
        motion=[0, 0, 0.0, 1300, "cubic-bezier(.4,0,.6,1)"],
    ),
    "earring-eye-r": dict(
        card="10-earring.png",
        stem="10-eye-r",
        element="his left eye (the viewer's right) - white, iris, pupil and lash",
        rois=[(683, 412, 735, 450)],
        test="not_skin",
        keep="largest",
        pad_box=3,
        feather=1.0,
        reach_pad=0,
        pad_patch=2,
        patch="laplace",
        src="skin",
        pivot=("box", 0.5, 0.88),
        strip="squash",
        motion=[0, 0, 0.0, 1300, "cubic-bezier(.4,0,.6,1)"],
    ),
    # ----------------------------------------------------------------------- #
    # HIS TWO EYES ON CARD 8, so the sad boy walking home can blink and NOTHING ELSE
    # on that card moves. The user, twice: "his whole upper body is cut when only his
    # expression should change".
    #
    # THE EYES ARE THE ONLY THING ON THAT FACE THAT CAN CARRY IT, and the rest was
    # measured before being ruled out. His mouth is 18 x 8 of the 3x card - 6.0 x 2.7
    # at the size this plays - drawn with a stroke under a pixel wide, so any offset
    # small enough to be a mouth is invisible and any offset visible is a smear. His
    # head can move and does it cleanly, and that is still his upper body moving.
    #
    # MEASURED: the left eye is the safest cut on the card - clean skin on all four
    # sides with 27-39px of margin, a 7/255 skin spread and a 2-7 unit gradient across
    # its own footprint. The right eye is the least safe: its outer corner has ZERO
    # clean skin before the dark face contour at x 593-598, so the cut necessarily
    # takes silhouette ink with it. That is what `ink` is for - the line goes WITH the
    # eye instead of staying behind as a separate mark - and the harmonic patch fills
    # what is left.
    # ----------------------------------------------------------------------- #
    "home-eye-l": dict(
        card="08-home.png",
        stem="08-eye-l",
        element="his right eye (the viewer's left), on the sad walk home",
        rois=[(526, 270, 560, 298)],
        test="not_skin",
        keep="largest",
        ink=(2, 120),
        pad_box=3,
        feather=1.0,
        reach_pad=0,
        pad_patch=2,
        patch="laplace",
        src="skin",
        pivot=("box", 0.5, 0.90),
        strip="squash",
        motion=[0, 0, 0.0, 1500, "cubic-bezier(.4,0,.6,1)"],
    ),
    "home-eye-r": dict(
        card="08-home.png",
        stem="08-eye-r",
        element="his left eye (the viewer's right), on the sad walk home",
        # Stops at x=592: the face contour is at 593-598 and the silhouette at ~600,
        # so the window ends before the head's own edge and `ink` brings in only the
        # part of the line the eye actually owns.
        rois=[(570, 281, 592, 303)],
        test="not_skin",
        keep="largest",
        ink=(2, 120),
        pad_box=3,
        feather=1.0,
        reach_pad=0,
        pad_patch=2,
        patch="laplace",
        src="skin",
        pivot=("box", 0.5, 0.90),
        strip="squash",
        motion=[0, 0, 0.0, 1500, "cubic-bezier(.4,0,.6,1)"],
    ),
    # "pot-eyes" WAS HERE and cut BOTH eyes as one sprite. It is gone, and the
    # reason is worth keeping: one sprite can only be SCALED, and a scale moves two
    # eyes along the line joining them. The gag needs each eyeball to leave its own
    # socket along its own angle and for the two to DIVERGE, so it is two cuts.
    # See the note on SCENE_FX card 3 in app.js for the rest of the beat.
}

GR = (0.48, 0.80)               # green/red, the band skin sits in
BR = (0.24, 0.55)               # blue/red
R_MIN = 150


def is_skin(card):
    """The colour-ratio test, as its own function so the patch can use it too."""
    R = card[..., 0]
    G = card[..., 1]
    B = card[..., 2]
    Rs = np.maximum(R, 1.0)
    return ((R > R_MIN)
            & (G / Rs > GR[0]) & (G / Rs < GR[1])
            & (B / Rs > BR[0]) & (B / Rs < BR[1]))


def build_mask(card, spec):
    """The element, as a boolean mask on the whole card."""
    hit = is_skin(card) if spec["test"] == "skin" else ~is_skin(card)

    roi = np.zeros(card.shape[:2], bool)
    for (x0, y0, x1, y1) in spec["rois"]:
        roi[y0:y1, x0:x1] = True
    m = hit & roi

    # Close the creases - the finger gaps on a hand, the lash line splitting an
    # eye white from its iris - then fill, then pick the blobs to keep.
    m = ndi.binary_closing(m, np.ones((3, 3)))
    m = ndi.binary_fill_holes(m)
    lab, n = ndi.label(m)
    if n == 0:
        raise SystemExit("nothing matched in the roi - the test or the box is wrong")
    sizes = ndi.sum(m, lab, range(1, n + 1))
    if spec["keep"] == "largest":
        m = lab == (int(np.argmax(sizes)) + 1)
    else:
        keep = [i + 1 for i, sz in enumerate(sizes) if sz >= spec["keep"]]
        if not keep:
            raise SystemExit("no blob reached keep=%s (biggest was %d)"
                             % (spec["keep"], int(max(sizes))))
        m = np.isin(lab, keep)
    m = ndi.binary_fill_holes(m)

    # THE ARTIST'S DRAWN CONTOUR, grown onto one dilation at a time. A colour test
    # stops INSIDE the dark line an illustrator draws round a limb, so without this
    # the outline stays on the card while the element moves off it - a soft blob
    # sliding under a crisp line, which is the single most visible fault a cut has.
    if spec.get("ink"):
        passes, lum_max = spec["ink"]
        lum = card.mean(axis=2)
        wide = np.zeros(card.shape[:2], bool)
        for (x0, y0, x1, y1) in spec["rois"]:
            wide[max(0, y0 - 8):y1 + 8, max(0, x0 - 8):x1 + 8] = True
        for _ in range(passes):
            edge = ndi.binary_dilation(m, np.ones((3, 3))) & ~m
            m = m | (edge & (lum < lum_max) & wide)
        m = ndi.binary_fill_holes(ndi.binary_closing(m, np.ones((3, 3))))
    return m, n


def inpaint_nearest(card, mask, sampling=(1, 1)):
    """Fill `mask` from the nearest pixel OUTSIDE it, then soften the seams.

    distance_transform_edt on the inverse mask hands back, for every masked pixel,
    the index of the closest unmasked one - a Voronoi fill. Over this element that
    means shirt pulls down from above, shorts pull up from below and plaster pulls
    in from the left, each only as far as it is the nearest thing, which is exactly
    the reconstruction the artwork supports.

    THE BLUR IS SMALL AND IS APPLIED TO THE FILL ONLY. A Voronoi fill has hard
    ridges where two sources meet; 1.5px of gaussian turns them into a soft
    gradient. Blurring further would drag the shirt's stripes into grey, and the
    stripes are the thing that has to survive - the patch is only ever SEEN in the
    two or three pixels the forearm swings off, so a soft-but-striped fill reads
    and a clean-but-flat one does not.

    `sampling` STRETCHES WHAT "NEAREST" MEANS, and card 1 needs it. Nearest is
    measured in circles by default, so the pixels hidden behind the boy's fist come
    back from the white stripe directly above them and the ORANGE stripe that ran
    behind his hand is simply gone - which is the pale blob that appears the instant
    the arm swings. His shirt is striped horizontally, so making a vertical step
    cost six times a horizontal one turns those circles into ellipses lying ALONG
    the stripes, and every hidden pixel is filled from its own stripe instead of
    from its neighbour's. Pass (6, 1) - the order is (y, x), as scipy takes it.

    IT IS A PER-ELEMENT CHOICE, not a better default. An eye sits on a smooth cheek
    where there is no grain to follow, and stretching the metric there would only
    make the fill reach further for no reason.
    """
    _, idx = ndi.distance_transform_edt(mask, sampling=sampling, return_indices=True)
    fill = card[idx[0], idx[1]]
    soft = np.dstack([ndi.gaussian_filter(fill[..., c], 1.5) for c in range(3)])
    out = card.copy()
    out[mask] = soft[mask]
    return out


def laplace_fill(card, mask, src_ok=None, iters=900):
    """Harmonic inpainting: the smoothest surface that meets the art at the rim.

    WHY AN EYE NEEDS THIS AND A FOREARM DID NOT. inpaint_nearest COPIES one nearby
    pixel per hole pixel, so the fill inherits that pixel's lightness. Behind a
    forearm the neighbours are a striped shirt and copying one is the best available
    answer. Behind an eye the neighbour is a cheek with a gradient across it, and a
    copied pixel shows as a flat pale oval with a visible edge - which is exactly
    what a closed eye must not look like. Measured round Aaru's eyes on card 10: the
    skin is #f6a866 +/- 10 units with a 7-16 unit ramp across the eye's own
    footprint, and a Voronoi fill of that reads as a socket.

    Solving Laplace's equation instead means the fill LEAVES THE RIM AT THE RIM'S OWN
    COLOUR and carries the surrounding gradient across the hole, so on a painted
    cheek it is indistinguishable from the cheek. Jacobi iteration rather than a
    sparse solve: the holes here are 30 px across, 1200 sweeps of a 4-neighbour
    average is a few milliseconds, and it needs no extra dependency.

    `src_ok` KEEPS THE RIM HONEST. Without it the boundary condition includes the
    lash line and the eyebrow above the eye, and the fill drags a dark smudge down
    into the socket. With src_ok=skin only the cheek is a boundary; anything else is
    treated as part of the hole and solved for too.
    """
    out = card.copy()
    # `src_ok` IS A NEIGHBOURHOOD RULE, NOT A CARD-WIDE ONE, and getting that wrong
    # is a hang rather than a wrong picture: `mask | ~src_ok` over a whole card makes
    # every hair, sari and wall pixel an unknown, and the solve is then the size of
    # the frame. Only non-skin WITHIN 10px of the element is treated as unknown.
    near = ndi.binary_dilation(mask, np.ones((3, 3)), iterations=10)
    hole = mask if src_ok is None else (mask | (near & ~src_ok))
    band = ndi.binary_dilation(hole, np.ones((3, 3)), iterations=6)
    ys, xs = np.where(band)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    sub = out[y0:y1, x0:x1].copy()
    m = hole[y0:y1, x0:x1]
    rim = ndi.binary_dilation(m, np.ones((3, 3))) & ~m
    if not rim.any():
        raise SystemExit("the laplace fill has no rim to solve from - the src is too tight")
    for c in range(3):
        f = sub[..., c]
        f[m] = f[rim].mean()
        for _ in range(iters):
            avg = (np.roll(f, 1, 0) + np.roll(f, -1, 0)
                   + np.roll(f, 1, 1) + np.roll(f, -1, 1)) * 0.25
            f[m] = avg[m]
        sub[..., c] = f
    out[y0:y1, x0:x1] = sub
    res = card.copy()
    res[mask] = out[mask]
    return res


def cut(name, spec, check_only):
    src = SCRATCH / "cards-hd" / spec["card"]
    if not src.is_file():
        raise SystemExit("no %s - run tools/make-hd-cards.py first (AARU_SCRATCH=%s)"
                         % (src, SCRATCH))
    card = np.array(Image.open(src).convert("RGB")).astype(float)
    PAD_BOX, FEATHER = spec["pad_box"], spec["feather"]
    REACH_PAD, PAD_PATCH = spec["reach_pad"], spec["pad_patch"]
    PIVOT, STEM = spec["pivot"], spec["stem"]
    PIVOT_REL = isinstance(PIVOT, tuple) and PIVOT and PIVOT[0] == "box"
    print("=== %s: %s" % (name, spec["element"]))

    mask, ncomp = build_mask(card, spec)
    ys, xs = np.where(mask)
    print("mask          : %d px, %d component(s) before the pick, bbox x %d..%d y %d..%d"
          % (mask.sum(), ncomp, xs.min(), xs.max(), ys.min(), ys.max()))

    # THE BOX, snapped to a multiple of HD so the 1x box app.js carries is an
    # integer and the sprite is an exact 3x of it. Snapping outward only.
    x0 = int(np.floor((xs.min() - PAD_BOX) / HD)) * HD
    y0 = int(np.floor((ys.min() - PAD_BOX) / HD)) * HD
    x1 = int(np.ceil((xs.max() + 1 + PAD_BOX) / HD)) * HD
    y1 = int(np.ceil((ys.max() + 1 + PAD_BOX) / HD)) * HD
    box1x = [x0 // HD, y0 // HD, x1 // HD, y1 // HD]
    print("box           : 3x (%d,%d,%d,%d)  ->  1x %s   sprite %dx%d px"
          % (x0, y0, x1, y1, box1x, x1 - x0, y1 - y0))

    # A BOX-RELATIVE PIVOT is resolved here and not in the table, because it is a
    # fraction of a box that only exists once the mask has been built.
    if PIVOT_REL:
        PIVOT = (x0 + (x1 - x0) * PIVOT[1], y0 + (y1 - y0) * PIVOT[2])
        print("pivot         : box-relative -> 3x (%.1f, %.1f)" % PIVOT)

    # SPRITE ALPHA. Blur the mask and lift the contrast, which gives a ~1.5px edge
    # rather than a jagged cut. The lift is what stops a wide sigma turning the
    # whole rim translucent.
    a = ndi.gaussian_filter(mask.astype(float), FEATHER)
    a = np.clip((a - 0.22) / 0.56, 0, 1)

    # PATCH. Solid across the element and REACH_PAD past its feathered rim - any
    # rim pixel left carrying its card value stands as a second, static forearm -
    # then a ramp to nothing over PAD_PATCH so the patch melts into untouched art
    # instead of ending on a rectangle.
    # REACH_PAD 0 MEANS NO DILATION, AND IT HAS TO BE SPELT OUT. scipy reads
    # iterations < 1 as "repeat until the result stops changing", so passing 0 here
    # does not skip the dilation - it floods `solid` over the entire card, and every
    # cut comes back with its whole box inpainted. It looks like a catastrophic
    # regression in the patch quality and it is a one-word bug.
    solid = a > 0.02
    if REACH_PAD:
        solid = ndi.binary_dilation(solid, np.ones((3, 3)), iterations=REACH_PAD)
    d_out = ndi.distance_transform_edt(~solid)
    pa = np.clip(1.0 - d_out / PAD_PATCH, 0, 1)
    if spec.get("patch") == "laplace":
        src_ok = None
        if spec.get("src") == "skin":
            src_ok = is_skin(card)
        elif spec.get("src") == "not_skin":
            # What is behind a forearm is his shirt and his shorts, never more skin -
            # so skin is not a boundary condition here, it is part of the hole.
            src_ok = ~is_skin(card)
        patch_rgb = laplace_fill(card, solid, src_ok)
    else:
        patch_rgb = inpaint_nearest(card, solid, spec.get("fill", (1, 1)))

    # UNMIX. The runtime composites patch, then sprite, so at zero offset it shows
    # patch*(1-a) + sprite*a. Solving the sprite's own RGB for that identity is what
    # makes the card replay itself exactly at rest - and this sprite DOES come back
    # to rest, because a rub ends where it started. A feathered rim carrying the
    # card's own pixels would leave a permanent halo round his forearm otherwise.
    under = patch_rgb * pa[..., None] + card * (1 - pa[..., None])
    with np.errstate(divide="ignore", invalid="ignore"):
        spr_rgb = np.where(a[..., None] > 0.004,
                           (card - under * (1 - a[..., None])) / np.maximum(a[..., None], 1e-6),
                           card)
    clipped = ((spr_rgb < -0.5) | (spr_rgb > 255.5)).sum()
    spr_rgb = np.clip(spr_rgb, 0, 255)

    # VERIFY (b): patch over card, sprite over that, at zero offset, is the card
    # again - EXCEPT in the ring REACH_PAD/PAD_PATCH deliberately paint over, which
    # is the price of erasing the element's antialiased rim and is measured
    # separately. Scoring the ring as an error would be scoring the design.
    replay = spr_rgb * a[..., None] + under * (1 - a[..., None])
    sub = (slice(y0, y1), slice(x0, x1))
    err = np.abs(replay[sub] - card[sub])
    ring = (a[sub] <= 0.02) & (pa[sub] > 0.001)
    kept = ~ring
    print("replay at 0   : max %.2f/255, mean %.4f over %d px "
          "(%d rim px needed clipping)"
          % (err[kept].max(), err[kept].mean(), kept.sum(), clipped))
    print("overpaint ring: %d px, %.1f/255 mean, %.1f max - the cost of erasing the "
          "element's soft rim" % (ring.sum(), err[ring].mean() if ring.any() else 0,
                                  err[ring].max() if ring.any() else 0))
    # AND THE SAME SUM WITH NOTHING EXCLUDED, which is the number a viewer sees.
    # The two above are the designer's view: the sprite's own area has to replay
    # exactly, and the ring is a deliberate trade. This one is the AUDIENCE's view -
    # the still card, before a single frame of animation, against what the artist
    # drew - and it is the number that caught card 1, where the ring the split above
    # was quietly forgiving happened to fall across a striped t-shirt. If this is
    # over ~1.0 mean, look at the card before believing the cut.
    print("still card    : %.2f/255 mean over the whole box, %d px past 24 of %d "
          "- what is seen before anything moves"
          % (err.mean(), int((err > 24).sum()), err.size))

    # VERIFY (c): the element is really GONE. Not "how different is the patch" - it
    # is meant to be very different - but "does the patched card still read as an
    # arm": run the same classifier over the patched image inside the footprint and
    # count what still tests as skin. Anything left there is forearm the patch
    # missed, and it will stand still while the sprite moves.
    patched = patch_rgb * pa[..., None] + card * (1 - pa[..., None])
    # A PERFECT PATCH MAKES THIS RAISE, which is not a failure - it is the best
    # possible result. build_mask stops with "nothing matched in the roi" when the
    # classifier finds no element left, and for an INVERTED test (an eye, caught as
    # "not skin") a patch that worked leaves exactly that: nothing. The left eye's
    # cut died here on its first run with a flawless patch behind it.
    try:
        left, _ = build_mask(patched, spec)
        stuck = int((left & mask).sum())
    except SystemExit:
        stuck = 0
    print("element gone  : %d px inside the footprint still read as skin after "
          "patching (0 is clean)" % stuck)

    spr = np.dstack([spr_rgb[sub], a[sub] * 255]).astype("uint8")
    pat = np.dstack([patch_rgb[sub], pa[sub] * 255]).astype("uint8")

    # THE CHECK STRIP: the card, the card with the element painted out, and the
    # patch with the sprite rocked to the far end of its travel. If the middle panel
    # still shows a forearm, the mask is wrong; if the right panel shows two, the
    # patch is.
    CHECK_DIR.mkdir(parents=True, exist_ok=True)
    view = (slice(max(0, y0 - 22), y1 + 22), slice(max(0, x0 - 22), x1 + 22))
    panels = [card[view], patched[view]]
    px = (PIVOT[0] - x0, PIVOT[1] - y0)
    # The strip rocks the sprite by the element's OWN rotation, both ways, so what
    # it shows is the real excursion rather than a fixed nine degrees. Push `motion`
    # and this follows.
    if spec.get("strip") == "squash":
        # A BLINK IS A SQUASH, so the strip has to squash. Rocking a shut eye by nine
        # degrees shows nothing that ever happens on screen, and the strip is the
        # only instrument this script has.
        for k in (0.55, 0.22, 0.08):
            moved = Image.fromarray(np.clip(patched[view], 0, 255).astype("uint8"))
            h = max(1, int(round(spr.shape[0] * k)))
            art = Image.fromarray(spr).resize((spr.shape[1], h), Image.LANCZOS)
            # --org sits at 88% down, so the lid closes onto the lower lash rather
            # than onto the bottom edge of the box.
            top = y0 + int(round((y1 - y0) * 0.88)) - h
            moved.paste(art, (x0 - view[1].start, top - view[0].start), art)
            panels.append(np.array(moved).astype(float))
    else:
        swing = float(spec["motion"][2]) or 9.0
        for deg in (swing, -swing):
            moved = Image.fromarray(np.clip(patched[view], 0, 255).astype("uint8"))
            art = Image.fromarray(spr).rotate(deg, resample=Image.BICUBIC, center=px)
            moved.paste(art, (x0 - view[1].start, y0 - view[0].start), art)
            panels.append(np.array(moved).astype(float))
    K = 5
    strip = Image.new("RGB", (sum(int(p.shape[1] * K) for p in panels),
                              int(panels[0].shape[0] * K)), (255, 255, 255))
    ox = 0
    for p in panels:
        img = Image.fromarray(np.clip(p, 0, 255).astype("uint8"))
        img = img.resize((img.width * K, img.height * K), Image.NEAREST)
        strip.paste(img, (ox, 0))
        ox += img.width
    strip.save(CHECK_DIR / (STEM + "-cut.png"))
    print("check strip   : %s" % (CHECK_DIR / (STEM + "-cut.png")))

    if check_only:
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    Image.fromarray(spr).save(OUT_DIR / ("%s-sprite.png" % STEM))
    Image.fromarray(pat).save(OUT_DIR / ("%s-patch.png" % STEM))

    # THE MANIFEST IS WHAT tools/sim.js CHECKS app.js AGAINST, so the box and the
    # origin go back into it or the harness reports slot 1 as drifted.
    # AND IT IS recap-manifest.json, NOT manifest.json, which this wrote for a
    # while and which nothing read. sim.js has always looked for
    # assets/images/recap-manifest.json - the tracked file with all fifteen rows
    # in it - so a cut written to the shorter name updated an untracked stray and
    # the drift check went on comparing app.js against whatever was last written
    # to the real one. It reported nothing wrong, which is the failure mode this
    # guard exists to prevent, one level up.
    mpath = OUT_DIR / "recap-manifest.json"
    man = json.loads(mpath.read_text(encoding="utf-8")) if mpath.is_file() else {}
    key = STEM.split("-")[0] if STEM == "01-house" else STEM
    org = [(PIVOT[0] - x0) / (x1 - x0) * 100.0, (PIVOT[1] - y0) / (y1 - y0) * 100.0]
    man[key] = {
        "box": box1x,
        "file": STEM,
        "cut_by": "tools/cut-belly-hand.py",
        "element": spec["element"],
        "err_b": round(float(err[kept].max()), 3),
        "err_c": float(stuck),
        "err_rest": round(float(err.mean()), 3),
        "motion": spec["motion"],
        "origin": [round(PIVOT[0] / HD, 1), round(PIVOT[1] / HD, 1)],
        "org_pct": [round(org[0], 1), round(org[1], 1)],
        "scale": 1.0,
    }
    mpath.write_text(json.dumps(man, indent=1, sort_keys=True), encoding="utf-8")
    print("wrote         : %s-sprite.png / -patch.png at %dx%d, manifest %s updated"
          % (STEM, x1 - x0, y1 - y0, key))
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
