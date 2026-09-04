#!/usr/bin/env python3
"""Turn the supplied entrance clip into a WebM sprite that can hang off the
game's own clothesline.

    python tools/dekey-entry.py

    in:  assets/_source/entry.mp4      (supplied, untouched)
    out: assets/video/entry.webm        (what the game plays)

It shares the checkerboard problem with tools/dekey-video.py and the whole
argument for how that is solved — border-connected key, unioned with a fitted
32x32 tile, then the fringe un-mixed — lives in that file's docstring and is
not repeated here. Read it first; only the parts that are DIFFERENT are below.
The keying code is duplicated rather than imported because these are one-shot
asset builders and a hyphenated filename is not importable anyway; the price of
the copy is that a fix to the keying has to be made twice, and that is cheaper
than making the celebration clip depend on this one.

Two things are new, and both come from the same fact: this clip is not a
character standing on his own, it is a character HANGING FROM A ROPE, and the
game already has a rope.


1. THE DRAWN ROPE HAS TO GO
---------------------------
The clip draws its own rope, and it cannot be reconciled with the line in
styles.css. Measured off the 36 frames:

  it is 15px thick on a boy 330px tall, i.e. 4.5% of him. The game's line is
  6px against a 440px Aaru, 1.4%. Scaling the clip until the two ropes agree
  would leave the boy a third of the size he needs to be.

  it sags four times harder. Its tangent runs -15deg at the grip; the game's
  line never exceeds -5.4deg anywhere on the stage.

  it ends in mid-air, at x=74 and x=660 of a 736px frame. Scaling it until it
  spanned the stage would put the boy at three times life size.

So the drawn rope is erased and the boy is hung on the game's line instead,
which is the one that is already pegged to the screen and already twists when
the line is hauled.


NOTHING IS ERASED INSIDE THE GRIP, and three separate attempts to do so are the
reason this paragraph is long.

The grip columns are the ones where a column of foreground is hand and rope
fused, so the geometric mask below cannot go there. It is natural to assume a
stub of painted rope survives on the line between his two hands, because at 1:1
on the board something brown certainly appears to. Zoomed 30x on the SOURCE with
the pixel values read out, it is not rope. Between the two hands sits his own
ink outline where the left hand overlaps the right fist - rgb(127,53,17) to
(152,80,30) - against rope that measures rgb(185,140,100). It is three times
darker and it is his drawing.

  BY HUE. Erase band pixels inside the grip whose R-G is under 70. It takes
  about 50px a frame and every one of them is his outline: the stroke between
  his fingers and the contour along the top of both hands. Rendered as a red
  overlay on the source it is unmistakable - the mask lies on the hands, not on
  any rope. It reads afterwards as both fists being nicked down their sides.

  BY BRIGHTNESS. Seed on the one dark blob the band contains and grow it to its
  own colour. This one is worse: the blob IS the shadowed inner edge of his
  right fist - rgb(176,96,52) at luma 103 against rgb(242,162,100) for his lit
  left hand, the SAME hue, R-G 80 for both - and removing it returns the fist
  with a bite out of its left edge.

  BY TEMPORAL MEDIAN, on the argument that the rope is static and his hands
  move. His hands are static too: their topmost row does not shift by a single
  pixel across the 36 frames. The median cannot separate them and classifies
  both as background, taking his hands off at the wrist.

So the grip is left exactly as the artist drew it. If the grip reads as too
heavy against the game's line, the fix is the LINE - it is 6px against fists
that are 79 display px across - and not more erasing.

DO NOT instead try to key it out on the ground that the rope is static and his
hands move. His hands are static too — their topmost row does not shift by even
one pixel across the 36 frames. A per-pixel temporal median cannot tell the two
apart, and if you build one it classifies BOTH as background and takes his
hands off at the wrist. That was tried, and that is exactly what it did.

Erasing it is easy for one reason worth writing down: THE ROPE DOES NOT MOVE.
A robust quadratic fitted per frame lands within 1.5px of the same curve in all
36 (slope at the grip -0.273 +/- 0.004), so the mask can be computed ONCE from
the median of the frames and applied to all of them. A mask recomputed per
frame would have to be right 36 times to avoid flickering; a static one cannot
flicker at all.

The mask is built per column, from the run of foreground that contains the
fitted centreline, and the boy is protected by that run's own height rather
than by a colour test - his skin and the rope are both mid-tan and a colour key
between them is not a fight worth having. A column of exposed rope is ~15px
tall. A column where a fist is closed over the rope is 33 to 131px tall,
because the hand carries on down into the arm. Thresholding at 28px separates
them exactly, and the fists come out as ONE contiguous group, x=388..445 - so
the erase runs from the rope's left end up to the left fist, and from the right
fist to the rope's right end, and nothing inside the grip is touched.

WHAT IS ERASED IN A ROPE COLUMN IS THE ROPE, and getting that right took three
goes, because the run through the centreline is not the rope wherever his hands
are near it.

  ERASE EVERYTHING ABOVE THE RUN. Carries the streaks drawn along the line away
  in the same pass, and slices his hands off: a full-height cut squares the
  flank columns against a vertical edge and both hands come out clipped at the
  wrist.

  ERASE THE RUN. Better, and still wrong by 58px a frame. Either side of the
  grip the run is fist FUSED TO rope while still measuring under ROPE_RUN_MAX -
  15, 17, 19, 24, 28 over x=374..387, and 28, 27, 23, 21, 17 coming back down
  over x=446..452 - so fifteen columns are called clean and the fused run is
  erased whole. That takes the outer-lower corner off each fist, 3-5px deep,
  and it reads as both hands cut where the line meets them.

  ERASE THE RUN, CLIPPED TO THE FITTED BAND. What is here. The rope's own top
  and bottom edges are fitted over the columns that are unambiguously rope, and
  the run is intersected with them. On a real rope column the two coincide and
  nothing changes; on the fifteen the mask stops at the rope and the fist
  survives.

The streaks are dropped by shape instead (3, below).

ONE THING IS LOST AND CANNOT BE HAD BACK. Where he kicks a foot up to the line
- frames 4-7 and 22-26 - the artist drew the rope IN FRONT of his flip-flop, so
those pixels of the sandal do not exist in the source. Erasing the rope leaves
the toe ending flat where the line crossed it. The game's own line is drawn
through that gap, which covers 6 of the ~17px, and what is left is a nick in a
sandal that is moving fast, four frames out of thirty-six. Inpainting it is the
only fix and it is not worth inventing pixels for.


3. THE MOTION STREAKS GO, AND ONLY SHAPE CAN TELL THEM APART
------------------------------------------------------------
The clip draws pale speed strokes around him, and they cannot be keyed. They
are achromatic and light - luma 196-240 - and the transparency checkerboard is
achromatic and light, at 180-220. About a third of every stroke falls inside
the window that DEFINES background, so the key eats holes through it and what
survives is a dashed, grey-fringed remnant. That reads as dirt on the screen,
not as speed, and no threshold fixes it: the two things are genuinely the same
colour.

TWO OBVIOUS WAYS TO DROP THEM DO NOT WORK, and both were tried on this clip:

  CONNECTIVITY - keep the largest keyed component and throw away the rest. It
  gets most of them and leaves exactly the ones that show. Measured: the
  strokes at his hands in frames 14, 15, 30 and 32 and the one under his sandal
  in frame 22 are 4-CONNECTED to his silhouette, because they are drawn
  touching him. They are part of the largest component and survive it. Frame
  22's is 954px of ragged pale blue.

  COLOUR - drop keyed pixels that are achromatic. His own outline is a dark
  brown stroke whose chroma runs 8 at the 1st percentile to 50 at the median;
  the streaks run 22 to 32. The two distributions sit on top of each other. Any
  threshold that takes the streaks takes his outline with it, and losing the
  outline means losing the silhouette.

SHAPE SEPARATES THEM CLEANLY, because the one thing a speed line is is THIN.
Erode the keyed mask by STREAK_ERODE, which leaves only what was more than
2*STREAK_ERODE across; keep the largest surviving piece, which is him; then let
it grow back, but only into pixels the key already called foreground and only
STREAK_REGROW steps. The strokes are 2-8px wide and vanish at the erosion. He
is 46,800-50,100px of solid body and does not. His thinnest real parts - the
fingers, the outer curls of his hair - are 10-12px, keep a 2-4px core, and the
regrow puts them back.

It removes about 2,100px a frame and costs him 4%, all of it fringe the alpha
solve re-derives anyway.

Nothing the finale needs goes with them. He crosses 1360px of stage on his way
in, leaning as he travels; a boy who is actually moving does not need lines
drawn on him to say so, and the clapping Aaru in correct_ans.webm has none
either. They were also actively wrong at the end of the ride, where he hangs
still in the middle of a bare board with speed lines on him.


2. THE GRIP HAS TO BE LEVEL, AND IT HAS TO BE FINDABLE
------------------------------------------------------
With the drawn rope gone his fists close on nothing, so the game's line has to
pass through them - which needs the fists level with it and needs app.js to
know where they are.

LEVEL — AND THE ANSWER IS: YES, ALL OF IT. The clip's rope runs -15.05deg
through his fists, so the two fists are not level with each other: they sit on
that slope, 16 display px apart. The game's clothesline is STRAIGHT, and a
straight line cannot pass through two points 16px apart vertically.

That is the whole argument. Without the rotation there is no anchor that puts
both hands on the rope: anchor on one fist and the other floats 16px clear of
the line, anchor between them and it touches neither — measured in the rendered
page, his fingertips sat 13 to 30px above the line for the entire ride, and it
reads as a boy gripping a rope that is not there.

The case against is real and it is about gravity. Rotating the sprite rotates
HIM, and a boy hangs at the same absolute angle whether the line is steep or
flat, so levelling the grip swings his body 15deg further out than the artist
drew it — he reads as slung, rather than hanging. That was tried at 0, 5 and 10
degrees of bake and it is a visible cost. It is a cost in POSE. The alternative
is a cost in PHYSICS, and a correct body angle is worth nothing if his hands are
not touching the thing he is hanging from.

The remaining tilt is paid for once, here, and app.js adds the line's own
tangent on top as he rides the sag.

FINDABLE. The output is cropped to the boy and the grip lands wherever it lands
inside that crop, so its position is printed at the end as a PERCENTAGE of the
sprite box and belongs in --entry-grip-x/y in styles.css. Percentages rather
than pixels so the game can scale him without recomputing anything.


4. TIMING
---------
36 frames at the source's own 10fps, 3.6s, no interpolation. 10 divides 60, 90
and 120, so it is even on every panel - which is the whole rule dekey-video.py
arrived at the hard way, and this clip happens to be shot on a rate that
already obeys it. There is nothing to re-time here.

The swing is a loop: the game plays it on `loop` and he keeps swinging once he
has arrived, so the last frame runs into the first. They are not identical -
frame 35 and frame 0 differ by about as much as any other consecutive pair -
which is what a continuous swing looks like, and it reads as one.
"""

import os
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'assets', '_source', 'entry.mp4')
OUT = os.path.join(ROOT, 'assets', 'video', 'entry.webm')
WORK = os.path.join(ROOT, 'tools', '_entry_work')

# --- keying. Same constants as dekey-video.py; same clip source, same editor.
PERIOD = 32
RESID_T = 12.0
CHROMA_T = 18
LUMA_LO, LUMA_HI = 168, 234
EXTEND = 10
FEATHER = 0.35

# How far in from the keyed silhouette the pixels are that can still be trusted
# to be all boy, and how wide a ring of uncertain ones is solved outside it.
#
# dekey-video.py uses 1 and 2, and 1 is not enough HERE. Where a light square
# of the checkerboard meets him, the blend is chromatic enough to fail the
# background test and light enough to be obvious, so it survives as `boy`; a
# single-pixel erosion leaves the outer one of those inside `interior`, where
# alpha is forced to 1. It came out as a comb of white teeth along his legs and
# arms, spaced at the checker's own period, on the light squares only. Eroding
# 2 and solving 3 hands that pixel to the alpha solver, which reads it for what
# it is - mostly background - and the teeth are gone.
#
# The celebration clip does not need this because its outline is a dark stroke
# all the way round: the same blend happens there and lands dark, on dark.
ERODE = 2
BAND = 3

# --- the rope. A column of foreground taller than this, measured through the
# fitted centreline, is a hand and not the rope: exposed rope is ~15px and the
# thinnest occluded column is 33. See the docstring.
ROPE_RUN_MAX = 28
ROPE_GROW = 1             # px of fringe to take with it, each way

# COLUMNS EITHER SIDE OF THE GRIP THAT ARE LEFT ALONE TOO.
#
# The grip is found by asking which columns have a run through the rope's
# centreline taller than ROPE_RUN_MAX, and that answers x=388..445. It is the
# right answer to that question and the wrong boundary for this mask, because
# his fingers do not stop where the run stops being tall - they thin out over a
# few more columns while still lying INSIDE the rope's band. Erase the band
# there and you take a slice out of the outside of each hand.
#
# Measured on frame 18, skin pixels sitting inside the band that the mask would
# remove, by column:
#
#   ...372-385: 6-9 each   386: 13   387: 17  | grip |  446: 13   447: 14   448-458: 4-6
#
# The jump at 386/387 and 446/447 is the fingers. Three columns of margin
# covers it. What it costs is three columns of drawn rope surviving on each
# side, immediately against his hands, about 45px a side - and the game's own
# line runs through exactly there, so most of it is behind the rope anyway.
# That is a far better trade than a vertical cut down both fists.
GRIP_MARGIN = 3

# ...and inside those margin columns the rope is taken out BY COLOUR, because
# skipping them wholesale leaves a stub. Measured on frame 18, foreground
# pixels of the band in the three columns either side of the grip:
#
#   left  (385-387)   40 skin,  3 rope, 15 outline   <- almost all hand
#   right (446-448)   25 skin, 21 rope, 19 outline   <- a real 21px stub
#
# so the right-hand margin keeps a visible lump of painted rope against his
# fist unless it is removed. Hue separates them HERE, in six columns, where the
# only three things present are his skin (R-G 78-86), the rope (R-G under 70)
# and his own outline stroke (dark). The luma floor is what protects the
# outline: take the low-R-G pixels and you would take his ink with them.
#
# This is the ONLY place in this file a colour test is allowed, and the reason
# it is safe here and nowhere else is that the population is six columns wide
# and has been counted. Applied to the whole grip it removes 50px a frame of
# his outline and nicks both fists; see the docstring.
MARGIN_ROPE_RG = 70
MARGIN_ROPE_LUM = 110




# The motion streaks are removed by SHAPE. See the docstring for why nothing
# else works. STREAK_ERODE is how many pixels come off every edge to find his
# core, so it sets the width of the widest thing that can be thrown away: 4
# kills anything under 8px across. The strokes measure 2-8; his thinnest real
# part is a finger at 10-12, and it survives as a 2-4px core. STREAK_REGROW is
# how far that core is then allowed back out, INSIDE the keyed silhouette, to
# recover the fingertips and the outer curls of his hair. It is 7 rather than 4
# because a geodesic dilation only reaches what is connected, so the extra
# three are free where he is concave and are the difference between a whole
# hand and a rounded-off one.
#
# It is 5 and not 7 because the regrow is also the only way a stroke gets back
# in: where one is drawn touching him, the regrow walks that many pixels into
# it and leaves a stub. 7 left about 30 px a frame of stub, in ones and twos
# near his sandals and his hip, which at 1:1 on the board reads as exactly the
# smudge the streaks did. 5 still recovers the fingertips and the outer curls
# — measured, they are 10-12px across and keep a 2-4px core — and halves what
# a touching stroke can drag back in.
STREAK_ERODE = 4
STREAK_REGROW = 5

# What must survive: the filter may not cost him more than this fraction of the
# silhouette it started from. Measured, it costs 4%. A frame that trips this has
# had something real taken off it and wants looking at rather than shipping.
BODY_MIN_KEPT = 0.90

# HOW MUCH OF THE DRAWN ROPE'S TILT TO TAKE OUT OF THE SPRITE, as a fraction.
# It is 1.0 — the whole of it — and it went to 0 and back, so both arguments are
# written down.
#
# The clip's rope runs -15.05 degrees through his fists, so his two fists are
# not level with each other: they sit on that slope, 11 sprite px apart, 16 on
# screen at --entry-w 680. THE GAME'S CLOTHESLINE IS STRAIGHT. A straight line
# cannot pass through two points 16px apart vertically, so with no rotation
# there is no anchor that puts both hands on the rope — anchor on one and the
# other floats 16px off it; anchor between them, which is what a median of the
# fist columns gives you, and the line passes through NEITHER. Measured in the
# rendered page, his fingertips sat 13 to 30px clear of the line for the whole
# ride. It reads exactly as what it is: a boy holding a rope that is not there.
#
# The case for 0 is real and it is about gravity: rotating the sprite rotates
# HIM, and a boy hangs at the same angle whether the line is steep or flat, so
# levelling the grip swings his body 15 degrees further out than the artist drew
# it. That is a genuine cost and it is visible. But it is a cost in POSE, and
# the alternative is a cost in PHYSICS — his hands not touching the thing he is
# hanging from — and no amount of correct body angle survives that.
#
# So: 1.0, his fists come out level, and both of them sit on the line.
LEVEL_FRACTION = 1.0

OUT_FPS = 10              # the source's own rate; divides 60, 90 and 120
CRF = 30                  # as the celebration: this is a reward moment
PAD = 6


def run(*args):
    """ffmpeg, retried once — see the note in tools/dekey-video.py."""
    try:
        subprocess.run(list(args), check=True)
    except subprocess.CalledProcessError as first:
        print('   ffmpeg failed (%s), retrying once' % first.returncode)
        subprocess.run(list(args), check=True)


def border_background(a):
    """Background-looking AND reachable from the frame edge."""
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    lum = (R + G + B) / 3.0
    chroma = np.abs(R - G) + np.abs(G - B) + np.abs(R - B)
    bgish = (chroma < CHROMA_T) & (lum > LUMA_LO) & (lum < LUMA_HI)
    lab, _ = ndimage.label(bgish)
    edge = np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])
    keep = [int(v) for v in np.unique(edge) if v != 0]
    return (np.isin(lab, keep) if keep else np.zeros_like(bgish)), chroma


def runs(col):
    """[(top, bottom), ...] for the set rows of one column."""
    out = []
    if not len(col):
        return out
    s = p = col[0]
    for v in col[1:]:
        if v != p + 1:
            out.append((s, p))
            s = v
        p = v
    out.append((s, p))
    return out


def fit_rope(masks):
    """Robust quadratic through the rope's centreline, pooled over every frame.

    The candidate in each column is the topmost run 10-22px tall, which is the
    rope wherever it is exposed and a motion line or a stray nowhere else; four
    passes of reweighting drop the strays. Pooling is what makes this stable -
    the rope is the same curve in all 36 frames, so 36 frames' worth of columns
    are 36 samples of one curve, not 36 curves.
    """
    pts = []
    for fg in masks:
        for x in range(fg.shape[1]):
            for (s, e) in runs(np.where(fg[:, x])[0]):
                if 10 <= e - s + 1 <= 22:
                    pts.append((x, (s + e) / 2.0))
                    break
    pts = np.array(pts)
    x, y = pts[:, 0], pts[:, 1]
    w = np.ones_like(x)
    for _ in range(5):
        c = np.polyfit(x, y, 2, w=w)
        r = np.abs(np.polyval(c, x) - y)
        s = max(1.0, 1.4826 * np.median(r))
        w = (r < 2.5 * s).astype(float)
    c = np.polyfit(x[w > 0], y[w > 0], 2)
    rms = float(np.sqrt(np.mean((np.polyval(c, x[w > 0]) - y[w > 0]) ** 2)))
    return c, rms


def rope_mask(masks, c):
    """The static rope, as one mask for all frames, and the grip's x range.

    Per column: the run of foreground the fitted centreline falls inside,
    medianed over the frames. Short run — exposed rope, erase it. Tall run — a
    fist is closed over the line there, leave the column alone.

    ONLY THE ROPE IS ERASED — not everything above it, and not even the whole
    run. Both of those were tried and both cut his hands; see the comments in
    the body. The streaks are dealt with separately, by shape, in main().
    """
    H, W = masks[0].shape
    top = np.full(W, np.nan)
    bot = np.full(W, np.nan)
    for x in range(W):
        yc = int(round(np.polyval(c, x)))
        if not 0 <= yc < H:
            continue
        t, b = [], []
        for fg in masks:
            if not fg[yc, x]:
                continue
            for (s, e) in runs(np.where(fg[:, x])[0]):
                if s <= yc <= e:
                    t.append(s)
                    b.append(e)
                    break
        # Half the frames must agree that there is something on the line here,
        # which is true of every column the rope crosses and of nothing else.
        if len(t) >= len(masks) // 2:
            top[x] = np.median(t)
            bot[x] = np.median(b)

    have = ~np.isnan(top)
    tall = have & ((bot - top) > ROPE_RUN_MAX)
    grip = np.where(tall)[0]
    if not len(grip):
        sys.exit('no occluded columns found — the grip could not be located')
    # Contiguity is the check that this found the fists and not scattered
    # noise: two hands side by side on a rope are one run of columns.
    if len(grip) != grip.max() - grip.min() + 1:
        sys.exit('the occluded columns are not contiguous (%d over x=%d..%d) — '
                 'ROPE_RUN_MAX is picking up something that is not the grip'
                 % (len(grip), grip.min(), grip.max()))

    clean = have & ~tall
    thick = float(np.median((bot - top)[clean]))

    # THE ROPE'S OWN EDGES, fitted, and the reason this function is not just
    # "erase the run". Either side of the grip the run through the centreline
    # is already fist FUSED TO ROPE while still measuring under ROPE_RUN_MAX -
    # it climbs 15, 17, 19, 24, 28 over x=374..387 and comes back down 27, 23,
    # 21, 17 over x=446..452 - so those columns are called clean and the whole
    # fused run is erased. That takes the outer-lower corner off each fist:
    # measured, 58 px a frame, all of it in those fifteen columns, and it reads
    # as both hands squared off exactly where the line meets them.
    #
    # Fitting top(x) and bot(x) over the columns that are unambiguously rope
    # gives the band itself, and intersecting the run with it stops the mask at
    # the rope. On a real rope column the two coincide and this changes
    # nothing; on the fifteen it is the whole difference. The fit is a quadratic
    # like the centreline and just as tight - 1.5px rms on the top edge, 0.9 on
    # the bottom - and it extrapolates across the grip to a thickness of 15.1px
    # against the 15.0 measured either side of it, so it can be trusted where
    # there is nothing to measure.
    pure = clean & (np.abs((bot - top) - thick) <= 2)   # before the margin is applied
    if pure.sum() < 100:
        sys.exit('only %d unambiguous rope columns; cannot fit the band' % pure.sum())
    px = np.where(pure)[0]
    c_top = np.polyfit(px, top[pure], 2)
    c_bot = np.polyfit(px, bot[pure], 2)

    ys, xs = np.mgrid[0:H, 0:W]
    # ...and the grip, plus the margin either side of it, is off limits to the
    # geometric mask. The margin columns get the colour test instead, in
    # main() — see MARGIN_ROPE_RG.
    clean[max(0, grip.min() - GRIP_MARGIN):grip.max() + GRIP_MARGIN + 1] = False

    mask = np.zeros((H, W), bool)
    for x in np.where(clean)[0]:
        y0 = max(0, int(np.floor(max(top[x], np.polyval(c_top, x)))) - ROPE_GROW)
        y1 = min(H, int(np.ceil(min(bot[x], np.polyval(c_bot, x)))) + 1 + ROPE_GROW)
        if y1 > y0:
            mask[y0:y1, x] = True
    # The band across the MARGIN columns only — the three either side of the
    # grip that the loop above had to skip, because his fingers still lie in
    # the band there and a geometric cut takes them off. main() clears the rope
    # out of these by hue instead; see MARGIN_ROPE_RG. Nothing inside the grip
    # itself is ever handed back for erasing.
    marginband = ((ys >= np.polyval(c_top, xs) - ROPE_GROW) &
                  (ys <= np.polyval(c_bot, xs) + ROPE_GROW) &
                  (((xs >= grip.min() - GRIP_MARGIN) & (xs < grip.min())) |
                   ((xs > grip.max()) & (xs <= grip.max() + GRIP_MARGIN))))
    return mask, (int(grip.min()), int(grip.max())), thick, (c_top, c_bot), marginband


def rotate_stack(rgbs, alphas, pivot, theta):
    """Rotate every frame about `pivot` by `theta` radians, clockwise on screen.

    Output→input, so every output pixel is sampled once. Cubic, because the
    sprite is scaled UP again in the browser and a bilinear rotation would
    arrive there already soft; the overshoot cubic can produce is clipped, and
    on alpha that is the whole of the damage it can do.
    """
    H, W = alphas[0].shape
    ct, st = np.cos(theta), np.sin(theta)
    fwd = np.array([[ct, -st], [st, ct]])          # (x, y), screen-clockwise
    inv = fwd.T

    corners = np.array([[0, 0], [W, 0], [0, H], [W, H]], float) - pivot
    out = corners @ fwd.T
    lo = np.floor(out.min(axis=0)).astype(int)
    hi = np.ceil(out.max(axis=0)).astype(int)
    OW, OH = int(hi[0] - lo[0]), int(hi[1] - lo[1])
    grip_out = -lo.astype(float)                   # where `pivot` lands

    # affine_transform works in (row, col); the matrix above is in (x, y).
    m = np.array([[inv[1, 1], inv[1, 0]], [inv[0, 1], inv[0, 0]]])
    off_xy = pivot + (np.array([lo[0], lo[1]], float) @ inv.T)
    off = np.array([off_xy[1], off_xy[0]])

    def warp(img, order):
        return ndimage.affine_transform(img, m, offset=off, output_shape=(OH, OW),
                                        order=order, mode='nearest')

    r_rgb, r_a = [], []
    for rgb, a in zip(rgbs, alphas):
        r_rgb.append(np.dstack([warp(rgb[..., k], 3) for k in range(3)]))
        # Outside the source frame there is nothing, and `nearest` would smear
        # the edge row outward for ever; the alpha is warped with zero fill so
        # anything off the original canvas is simply not there.
        r_a.append(np.clip(ndimage.affine_transform(a, m, offset=off, output_shape=(OH, OW),
                                                    order=3, mode='constant', cval=0.0), 0, 1))
    return r_rgb, r_a, grip_out


def main():
    if not os.path.exists(SRC):
        sys.exit('missing source: ' + SRC)
    shutil.rmtree(WORK, ignore_errors=True)
    for d in ('raw', 'rgba'):
        os.makedirs(os.path.join(WORK, d), exist_ok=True)

    print('1. extracting', os.path.relpath(SRC, ROOT))
    run('ffmpeg', '-v', 'error', '-i', SRC, os.path.join(WORK, 'raw', 'f%03d.png'), '-y')
    names = sorted(os.listdir(os.path.join(WORK, 'raw')))
    frames = [np.asarray(Image.open(os.path.join(WORK, 'raw', n)).convert('RGB')).astype(float)
              for n in names]
    H, W, _ = frames[0].shape
    print('   %d frames, %dx%d' % (len(frames), W, H))

    ys, xs = np.mgrid[0:H, 0:W]
    ty, tx = ys % PERIOD, xs % PERIOD

    print('2. fitting the %dx%d checkerboard tile' % (PERIOD, PERIOD))
    acc_s = np.zeros((PERIOD, PERIOD, 3))
    acc_n = np.zeros((PERIOD, PERIOD))
    borders = []
    for a in frames:
        bg, _ = border_background(a)
        borders.append(bg)
        np.add.at(acc_s, (ty[bg], tx[bg]), a[bg])
        np.add.at(acc_n, (ty[bg], tx[bg]), 1)
    if (acc_n == 0).any():
        sys.exit('tile underdetermined: %d cells had no samples' % int((acc_n == 0).sum()))
    model = (acc_s / acc_n[..., None])[ty, tx]
    print('   min %d samples per cell' % int(acc_n.min()))

    print('3. locating the drawn rope')
    fgs = [~bg for bg in borders]
    c, rms = fit_rope(fgs)
    rope, grip_x, thick, band, marginband = rope_mask(fgs, c)
    gx = (grip_x[0] + grip_x[1]) / 2.0
    gy = float(np.polyval(c, gx))
    slope = float(np.polyval(np.polyder(c), gx))
    theta = np.arctan(slope)
    print('   y = %.6g x^2 + %.6g x + %.6g   (rms %.2f px, %.0fpx thick)'
          % (c[0], c[1], c[2], rms, thick))
    print('   grip at x=%d..%d, so the pivot is (%.1f, %.1f)' % (grip_x + (gx, gy)))
    bake = -theta * LEVEL_FRACTION
    print('   tangent there is %+.2f deg; %.0f%% of it is taken out (%+.2f deg)'
          % (np.degrees(theta), 100 * LEVEL_FRACTION, np.degrees(bake)))
    print('   erasing %d px of rope, clipped to a band fitted at %.1fpx thick'
          % (int(rope.sum()),
             np.polyval(band[1], gx) - np.polyval(band[0], gx)))

    print('4. keying')
    alphas, rgbs, pocket_px, streak_px, knot_px = [], [], 0, 0, 0
    for a, bg in zip(frames, borders):
        R, G, B = a[..., 0], a[..., 1], a[..., 2]
        chroma = np.abs(R - G) + np.abs(G - B) + np.abs(R - B)
        pattern = (np.abs(a - model).mean(axis=2) < RESID_T) & (chroma < CHROMA_T)
        pocket_px += int((pattern & ~bg).sum())

        # ...and the last of it, in the margin columns either side of his fists -
        # three each side - where the geometric mask cannot run without cutting
        # his fingers. ONE mask, two conditions, both of which must hold:
        #
        #   (R - G) < MARGIN_ROPE_RG   his skin measures R-G 78-86 in these
        #                              columns and the rope under 70, so a hue
        #                              ceiling keeps the rope, drops his hands.
        #   mean > MARGIN_ROPE_LUM     a luma FLOOR, and not a second pass. It
        #                              is what protects his OUTLINE STROKE:
        #                              take the low-R-G pixels alone and his
        #                              ink goes with them.
        #
        # Both numbers - and why a colour test is safe in these six columns and
        # nowhere else in this file - are measured where they are defined; read
        # MARGIN_ROPE_RG for that rather than trusting this paragraph. NOTHING
        # is erased inside the grip itself; see the docstring. What is in there
        # is his hands.
        #
        # (This described "two passes" over a block "in shadow", seeded and
        # grown, naming GRIP_ROPE_RG and STUB_SEED_LUM. Neither constant has
        # ever existed, there is no seed-and-grow here, and the luma term
        # EXCLUDES dark pixels rather than selecting them. Rewritten from the
        # expression and from the definitions above it.)
        knot = (marginband & ((R - G) < MARGIN_ROPE_RG) &
                (((R + G + B) / 3.0) > MARGIN_ROPE_LUM))
        knot_px += int((knot & ~(bg | pattern | rope)).sum())

        boy = ~(bg | pattern | rope | knot)

        # HIM, AND ONLY HIM. What is in `boy` at this point is the boy AND the
        # motion streaks, and the streaks are thrown away here BY SHAPE: erode
        # until only thick things survive, keep the one that is him, and let it
        # grow back only into pixels the key already called foreground and only
        # so far. See the docstring for why shape, and why neither colour nor
        # connectivity does it.
        core = ndimage.binary_erosion(boy, iterations=STREAK_ERODE, border_value=0)
        lab, n = ndimage.label(core)
        if not n:
            sys.exit('frame %d: eroding by %d left nothing at all'
                     % (len(alphas), STREAK_ERODE))
        areas = np.bincount(lab.ravel())
        areas[0] = 0
        body = lab == int(areas.argmax())
        for _ in range(STREAK_REGROW):
            body = ndimage.binary_dilation(body) & boy
        kept = body.sum() / max(1, boy.sum())
        if kept < BODY_MIN_KEPT:
            sys.exit('frame %d: the streak filter kept only %.0f%% of the keyed '
                     'silhouette; see STREAK_ERODE / BODY_MIN_KEPT'
                     % (len(alphas), 100 * kept))
        streak_px += int((boy & ~body).sum())
        boy = body

        interior = ndimage.binary_erosion(boy, iterations=ERODE, border_value=0)
        if not interior.any():
            interior = boy

        dist, (iy, ix) = ndimage.distance_transform_edt(~interior, return_indices=True)
        extended = a[iy, ix].astype(float)
        far = dist > EXTEND
        if far.any() and interior.any():
            extended[far] = a[interior].mean(axis=0)

        near = ndimage.binary_dilation(interior, iterations=BAND, border_value=0)
        band = near & ~interior
        d = extended - model
        den = (d * d).sum(axis=2)
        num = ((a - model) * d).sum(axis=2)
        solved = np.where(den > 64, num / np.maximum(den, 1e-6), 1.0)

        alpha = np.zeros(a.shape[:2])
        alpha[interior] = 1.0
        alpha[band] = np.clip(solved[band], 0.0, 1.0)
        if FEATHER:
            alpha = ndimage.gaussian_filter(alpha, FEATHER)
        alpha[interior] = 1.0
        # ...and the rope goes last, so nothing above can put it back. The
        # solved band reaches into it wherever the two touched.
        alpha[rope] = 0.0
        alpha[knot] = 0.0

        alphas.append(np.clip(alpha, 0.0, 1.0))
        rgbs.append(extended)
    print('   pattern match caught %d px connectivity could not reach' % pocket_px)
    print('   dropped %d px of motion streaks, %d a frame'
          % (streak_px, streak_px / len(frames)))
    print('   and %d px of rope from between his fists, %d a frame'
          % (knot_px, knot_px / len(frames)))

    if abs(bake) > 1e-9:
        print('5. levelling the grip')
        rgbs, alphas, grip = rotate_stack(rgbs, alphas, np.array([gx, gy]), bake)
    else:
        # Nothing to rotate, so nothing is resampled: every pixel that reaches
        # the encoder is the source's own. A cubic warp for a no-op would only
        # soften him, and he is scaled up again in the browser.
        print('5. no rotation to bake in — frames pass through untouched')
        grip = np.array([gx, gy])
    alphas = np.array(alphas)

    solid = (alphas > 0.02).any(axis=0)
    yy, xx = np.where(solid)
    y0, y1 = max(0, yy.min() - PAD), min(alphas.shape[1], yy.max() + 1 + PAD)
    x0, x1 = max(0, xx.min() - PAD), min(alphas.shape[2], xx.max() + 1 + PAD)
    if (y1 - y0) % 2:
        y1 = y1 + 1 if y1 < alphas.shape[1] else y1 - 1
    if (x1 - x0) % 2:
        x1 = x1 + 1 if x1 < alphas.shape[2] else x1 - 1
    ow, oh = x1 - x0, y1 - y0
    print('   cropped to %dx%d' % (ow, oh))

    print('6. recombining')
    for i in range(len(rgbs)):
        rgb = np.clip(np.round(rgbs[i][y0:y1, x0:x1]), 0, 255).astype(np.uint8)
        a = np.round(alphas[i][y0:y1, x0:x1] * 255).astype(np.uint8)
        Image.fromarray(np.dstack([rgb, a]), 'RGBA').save(
            os.path.join(WORK, 'rgba', 'k%04d.png' % i))

    print('7. encoding VP9 + alpha at crf %d' % CRF)
    run('ffmpeg', '-v', 'error', '-framerate', '%.6f' % OUT_FPS,
        '-i', os.path.join(WORK, 'rgba', 'k%04d.png'),
        '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p',
        '-auto-alt-ref', '0',                 # without this the alpha is dropped
        '-b:v', '0', '-crf', str(CRF), '-row-mt', '1',
        OUT, '-y')

    if os.environ.get('DEKEY_KEEP'):
        print('   (DEKEY_KEEP set: intermediates left in %s)' % os.path.relpath(WORK, ROOT))
    else:
        shutil.rmtree(WORK, ignore_errors=True)

    fx = 100.0 * (grip[0] - x0) / ow
    fy = 100.0 * (grip[1] - y0) / oh
    print()
    print('wrote %s  (%.0f KB, %dx%d, %.2fs, %g fps)'
          % (os.path.relpath(OUT, ROOT), os.path.getsize(OUT) / 1024.0, ow, oh,
             len(rgbs) / float(OUT_FPS), OUT_FPS))
    print()
    print('   the grip is at %.2f%% across and %.2f%% down the sprite.' % (fx, fy))
    print('   styles.css:  --entry-grip-x: %.2f%%;  --entry-grip-y: %.2f%%;' % (fx, fy))
    print()
    print('check it in a browser over the wood — ffprobe will report no alpha')
    print('even when the alpha is there.')


if __name__ == '__main__':
    main()
