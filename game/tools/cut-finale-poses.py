#!/usr/bin/env python3
"""Cut Aaru's landing and cheering poses out of the four-panel storyboard.

    python tools/cut-finale-poses.py           inspect, write previews only
    python tools/cut-finale-poses.py --apply   write the sprites

    in:  assets/_source/finale-storyboard.png   (untouched, 1686x933, 4 panels)
    out: assets/images/finale-land.png            (transparent, the all-fours pose)
         assets/images/finale-cheer.png           (transparent, arms raised)

WHAT THIS IS FOR
----------------
The finale's last two beats - he lands on the box, then stands and cheers - have
never had artwork. entry.mp4 is the swing and correct_ans.mp4 is a clap, so the
clap has been standing in for both. The storyboard draws the two missing poses,
and this lifts them out so the finale can hold a real pose at each beat.

They are STILLS, not clips. The drop and the squash are done in CSS; these only
have to be the right shape at the moment each beat lands.

HOW THE BACKGROUND IS RECOVERED
-------------------------------
There is no key to pull - he is drawn on the game's own wood wall, not on a
checkerboard like the two videos were. The plate is instead the per-pixel MEDIAN
OF THE OTHER THREE PANELS (see wall_plate), because the four share one wall and
he is somewhere different in each, so at most one of the three can contain him
at any pixel.

A band of clean rows CANNOT work, which is worth stating because it is the
obvious idea and it was tried twice: the pink banner occupies rows 3..67 of every
panel and his raised fists and hair start around row 70, so in the columns he
occupies there is no band that is wall. Sampling 58..92 caught the banner;
sampling 72..93 caught his hair, which put an rgb(101,65,45) plate under his head
so his own hair matched the background and the matte punched a hole in it.

THIS IS NOT CLEAN, AND THE REMAINING FAULT IS NOT IN THE PLATE. All four panels
are centred compositions, so at his columns two of the other three also carry
art; the median picks some of it up and the matte then keeps this panel's wall
wherever that happened. What survives is faint ghosting around him and a thin
line from the tray's rim behind his ankles. Two attempts to remove the rim made
it worse and are recorded at the code, not here. The fix is single-pose art on a
flat background, not a better plate.

WHAT IS DELIBERATELY NOT CUT
----------------------------
The tray. It is already a live element in the game (.tray), drawn and animated
there, so a sprite carrying a second copy of it would double it on screen. The
cut stops at his sandals; where they meet the tray the boundary is his outline
against flat cream, which is the easiest edge in the picture.

The yellow impact flashes beside him in panel 4. They were kept at first - they
belong to the cheer and they sit on plain wood - and then cropped off, because
including them made the cheer sprite 303px of content for a boy who is about 190
of it, which at display size ran straight through the cards that used to sit
either side of him. The game also throws confetti around him at exactly this
moment, so they were doubling sparkle he already has. See the note on PANELS.
"""
import io
import os
import sys

import numpy as np
from scipy import ndimage
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', '_source', 'finale-storyboard.png')
OUT = os.path.join(ROOT, 'assets', 'images')

# Panel grid: the storyboard is 2x2. Row 1 is the swing and the drop, which the
# game already has; row 2 is the two poses that are missing.
# HIS BODY ONLY - the flash and speed marks are deliberately cropped OFF.
# They are drawn well out to the sides, and including them made the cheer
# sprite 303px of content for a boy who is about 190 of it. At the size he
# displays that is 444px across the stage, straight through the recap's card
# blocks either side of him. The game already throws confetti around him at
# exactly this moment, so the marks were also doubling up on sparkle he already
# has. Widen these boxes to put them back.
# The bottom of each box is HIS LAST DRAWN ROW, measured: the blue of his
# sandals ends at panel row 353 in the cheer and 351 in the landing. The boxes
# ran to 362 at first, which is below the tray's top edge, so a strip of the
# tray's rim was cut out with him - and since each sprite is then placed by its
# own bottom, he stood on that strip and floated above the real box.
#
# THE OTHER THREE EDGES ARE NOT HIS EDGES, and that was the mistake here for a
# long time. A box drawn snugly around him CLIPS him, because a sprite whose
# content runs edge to edge has had its outermost content cut - "full bleed" and
# "clipped" are the same measurement. Every edge below is now his own extent plus
# a margin, bounded by whatever is next to him in the panel.
PANELS = {
    # 'band+tray': the band plate for the wall, and the per-row tray plate
    # below TRAY_TOP, because down there the ground is the tray and not planks.
    # (312, 150, 522, 358). His HANDS are the lowest thing he has, not his
    # sandals: skin runs to row 357 where the blue ends at 352, because on all
    # fours the hands are drawn nearer the viewer. The box stopped at 353 and
    # took five rows off them. His forward hand also reaches x ~314 and the box
    # started at 322.
    'land':  {'cell': (0, 1), 'box': (312, 150, 522, 358), 'plate': 'band+tray'},
    # (310, 68, 513, 355), measured against his NEIGHBOURS rather than snugly
    # around him: the nearest flash on the left ends at x 302 and the one on the
    # right begins at x 514, so 310 and 513 clear both. The old (316, 78, 508,
    # 355) cut eleven rows off his hair crown, which starts at row 68, and four
    # columns off each fist, which span x 312..511.
    #
    # 68 AND NOT 66. The hard pink test put the banner's bottom at row 65, and
    # its ANTIALIASED edge runs two rows further - so 66 pulled in a full-width
    # pink bar at rgb(230,164,178), which showed up as the only row in the sprite
    # over 85% opaque. 68 is his crown's first drawn pixel, one px at x 430, so
    # nothing of his is given up for it.
    'cheer': {'cell': (1, 1), 'box': (310, 68,  513, 355), 'plate': 'band+tray'},
    # The free fall. `roi` is applied before anything else because the BANNER is
    # bigger than he is (~750x65 against his 217x202), so the largest-component
    # pass keeps the banner unless the banner is never in the picture. `rope` is
    # the row band the clothesline crosses; runs of ROPE_RUN px or less inside
    # it are cleared. No `box`: the crop is whatever survives, because the
    # streaks and seams around him are removed rather than cropped away.
    'fall':  {'cell': (1, 0), 'plate': 'band',
              'roi': (76, 278), 'rope': (85, 132)},
}
BAND_ROWS = (330, 440)      # panel 1's clean third - the 'band' plate
ROPE_RUN = 7                # a vertical run this short in the rope band is rope
MIN_COMPONENT = 1000        # smaller than this is a seam or a streak, not him
# THE WALL PLATE COMES FROM ALL FOUR PANELS, not from a band of rows.
#
# Two attempts at a band failed, and the reason is worth keeping. The pink
# banner occupies rows 3..67 of every panel, and in the cheer panel his raised
# fists and hair start around row 70 - so there is NO band of rows that is clean
# wall in the columns he occupies. Sampling 58..92 caught the banner; sampling
# 72..93 caught his hair, which put a dark-brown plate under his head (measured:
# rgb(101,65,45) where the wall is rgb(249,215,185)) so his own hair matched the
# background and the matte punched a hole in the top of his head.
#
# What is actually true: the four panels share ONE wall, and he is somewhere
# different in each. So at any given pixel at most one or two panels have him,
# and the per-pixel MEDIAN across the four is the wall with him removed. No band
# to choose and nothing to re-measure if the layout moves.
#
# This holds only above the tray - the tray is in two panels of four, so the
# median is ambiguous there. Below TRAY_TOP the plate is built per row instead,
# from columns clear of him.
# MEASURED, not estimated: scanning a column range clear of him, the wall
# (rgb 250,212,178) steps to the tray's rim (238,195,154 then 225,174,124) at
# row 317, and the rim runs to 325 before the cream top begins. This was 330 for
# a long time, which put the whole rim ABOVE the line - so every rule written
# for the tray region skipped it, and the rim survived as a thin dark bar under
# his feet that looked like a plank he was balancing on.
TRAY_TOP = 316              # below this the ground is the tray, not the wall

# WHERE THE TRAY PLATE IS SAMPLED FROM, and it has to be INSIDE THE BOX.
#
# This was 120..280 and 600..760, which straddles the box's own edges: the box
# spans x 155..687 (measured off its cream top), so ~40% of each of those
# samples was WALL. The per-row median then landed between wall and rim, and
# under him the real rim was 79 to 123 away from it - so the rim came out as
# FOREGROUND and baked a full-width bar into the sprite behind his ankles. That
# bar is what a user pointed at and called "the line behind Aaru".
#
# Clear of him in both panels: he occupies x 312..511 in the cheer and
# x 350..506 in the landing, and his feet stay inside those columns below
# TRAY_TOP.
TRAY_COLS = ((180, 300), (530, 660))

# A PLANK SEAM IS A THIN LINE ROTATED 90 DEGREES, and that is the whole reason
# this constant exists separately from ROPE_RUN. Each panel was drawn on its own,
# so panel 2's plank seams sit a couple of px off panel 1's and the per-column
# band plate has plank FACE where the panel has SEAM. The residual is 33 from the
# plate, which lands mid-ramp at alpha ~0.59 - measured in finale-fall.png col
# 144: rgb(239,191,153) at alpha 155..184 for rows 100..190.
#
# It is 3-4 px wide. His narrowest vertical feature is a finger at 8-12 px.
SEAM_RUN = 5

# ...and the LAST of it, which is neither a seam nor a slab but a DASH. The box's
# top edge wobbles +-4 rows across x (step at row 312 at x=360, 319 at x=180), so
# a per-row plate cannot sit on it everywhere and one or two rows leak through
# between his ankles - measured in the cheer at rows 248 and 250, runs of 10..35
# px at rgb(255,224,193) and rgb(199,127,63). One to three rows tall is not any
# part of him: his legs run the height of the region and are pinned opaque before
# this, so their runs are long and survive it.
DASH_RUN = 3

# THE TRAY PLATE IS BLURRED TO CAPTURE HIS CONTACT SHADOW, and anisotropically.
# The shadow is a smooth darkening of the box's cream centred under him; the flat
# per-row median is taken from columns clear of him and so misses it entirely,
# leaving it 42 from the plate and baked in as a slab between his sandals.
#
# WIDE ACROSS X, NARROW DOWN Y. The shadow needs filling in horizontally under
# him. The rim is a SHARP horizontal step, and an isotropic blur destroys it in
# the plate - which puts a hard brown line across his ankles, worse than the slab
# it removed. Tried at 12,12 and seen at 4x.
SHADOW_SIGMA = (1, 25)

# WHO IS PROTECTED IN THE TRAY REGION, and why the number is 78 and not 45.
# Down there his skin and the box's rim are close enough that anything strong
# enough to remove the rim also thins his shins: shin rgb(231,139,73) against rim
# rgb(205,145,80) is 27.6. But their HUE separates cleanly - the rim runs R-G
# 56..66 across the panel while his shaded shin is 92 - so pixels above 78 are
# unmistakably his and are pinned fully opaque.
#   his shaded shin  R-G 92      the rim        R-G 56..66
#   the box cream    R-G 20      his shadow     R-G 31
TRAY_PROT_RG = 78

# ...and the DARK bound, which has to be tight for the same reason. His outlines
# are the thing being protected here and they are very dark - measured
# rgb(44,10,1) at lum 18 and rgb(73,32,14) at lum 40. This was 120, and the box
# rim's own dark edge sits at lum 78..118: rgb(180,118,56) has a mean of 118 and
# was being pinned as if it were his outline, so the dash filter cleared it and
# this pinned it straight back. That was the last line visible between his legs.
#
# Everything of his in this region is caught without needing 120: his sandals by
# B > R (rgb 85,104,107), his shaded shin by R-G > 78 (rgb 231,139,73).
TRAY_PROT_LUM = 70
LO, HI = 14.0, 46.0         # colour distance -> alpha ramp
FEATHER = 0.6


def wall_plate(im, skip):
    """SUPERSEDED by band_plate, and kept for the reasoning rather than the result.

    This was the plate for land and cheer until the storyboard's own panel 1 was
    found to carry a clean full-width band under him. Measured against it, with
    the tray region handled identically in both:

                     coverage   faint/ghost px
      land  median     60.6%     2837  (6.99% of crop)
      land  band       48.2%     1801  (4.44%)
      cheer median     54.5%     4670  (8.78%)
      cheer band       48.2%     3885  (7.30%)

    The coverage drop is the improvement: this plate called ghost wall solid
    foreground. And what the numbers do not say, but looking does: this one put
    white speckle across his face, right arm, shirt and shorts, where the median
    happened to match his own colours and punched pinholes through him.

    Read on anyway before trying a plate here. The paragraph below about why a
    median of FOUR fails is what led to the band, and it is still true.

    The wall with Aaru removed: the per-pixel median of the OTHER three panels.

    Not all four. Panels 3 and 4 both put him in the lower middle, so at his own
    position two of the four samples are him - and the median of four averages
    the two middle values, which blends him into his own background. The matte
    then reads his outlines and his shirt stripes as background and punches
    holes straight through him.

    Excluding the panel being cut leaves three, of which at most ONE can contain
    him at any pixel, so the median is the wall by a clear majority."""
    W, H = im.size
    pw, ph = W // 2, H // 2
    cells = [(cx, cy) for cy in (0, 1) for cx in (0, 1)]
    panels = [np.asarray(im.crop((cx * pw, cy * ph, (cx + 1) * pw, (cy + 1) * ph))).astype(np.float64)
              for (cx, cy) in cells if (cx, cy) != skip]
    return np.median(np.stack(panels, axis=0), axis=0)


def alpha_from_plate(rgb, plate):
    d = np.sqrt(((rgb - plate) ** 2).sum(axis=2))
    a = (d - LO) / (HI - LO)
    return np.clip(a, 0.0, 1.0)


def largest_blob(mask, seed=None):
    """Keep the one connected region that is him, drop everything detached.

    SEEDED, not largest. "The biggest component is him" was true of the median
    plate this was written for and is not true of the picture: in the free-fall
    panel the BANNER is 46880 px against his 17586, and re-plating the tray in
    the landing panel re-shaped the components until the biggest was something
    else and the cut died with "nothing survived the matte" - which is what it
    looks like when the wrong component wins and the crop comes out empty.

    `seed` is the crop box's centre. That box is measured and it exists because
    we know where he is, so it is a fact rather than a guess about relative
    sizes. Falls back to largest when no seed is given.

    What this separates him FROM: the panels are all CENTRED compositions, so at
    his columns two of the other three carry art; the plate picks some of it up
    and the matte then keeps this panel's wall wherever that happened. Those
    leftovers come out as pale DETACHED shapes around him - a stray arm, a
    chevron, curved strokes - and detached is the whole point. A size floor
    cannot do this: every one of them is well over any sensible floor."""
    lab, n = ndimage.label(mask > 0.35)
    if n <= 1:
        return mask
    sizes = ndimage.sum(mask > 0.35, lab, range(1, n + 1))
    pick = None
    if seed is not None:
        sy, sx = seed
        # the seed can land in a pinhole, so look outward a little for him
        for r in (0, 3, 7, 12, 20, 30):
            ys = slice(max(0, sy - r), sy + r + 1)
            xs = slice(max(0, sx - r), sx + r + 1)
            vals = lab[ys, xs]
            vals = vals[vals > 0]
            if vals.size:
                ids, counts = np.unique(vals, return_counts=True)
                pick = int(ids[int(np.argmax(counts))])
                break
        if pick is None:
            raise SystemExit('the seed at (%d,%d) is not on anything - check the box'
                             % (sy, sx))
    else:
        pick = int(np.argmax(sizes)) + 1
    keep = (lab == pick)
    # ...and close the speckle inside him. The same bad plate punched pinholes
    # in his cheek and shirt; they are holes in a solid body, so filling them is
    # exact rather than a guess.
    keep = ndimage.binary_fill_holes(keep)
    return mask * keep


def band_plate(im):
    """The wall as a PER-COLUMN estimate, from panel 1's clean lower third.

    The planks run vertically: their colour varies across x and hardly at all
    down y, so one row of per-column values holds all the way down the column.
    Measured on rows 330..440 of panel 1, the per-column sigma down y is 0.78 out
    of 255, and the other panels' wall matches these values to a median of 2-4.

    This is the band the file's own header says would be ideal and could not be
    found. It was looked for ABOVE him, where the banner is. Panel 1 is the one
    panel with nothing below him, so the band is under him instead."""
    W, H = im.size
    pw, ph = W // 2, H // 2
    rel = np.asarray(im.crop((0, 0, pw, ph))).astype(np.float64)
    return np.median(rel[BAND_ROWS[0]:BAND_ROWS[1]], axis=0)


def clear_short_runs(alpha, y0, y1, limit):
    """Zero vertical runs of `limit` px or shorter, in the row band y0..y1.

    This is how the clothesline comes out of the free-fall panel. Measured: the
    rope is 3-4 px tall in any column it crosses, while his head fills all 45
    rows of the band. Neither of the other two tools works here - a hue test
    takes his hair with the rope (both are dark, rope R-G 36), and a component
    filter cannot separate them because the rope touches his head where it
    passes behind it."""
    h = y1 - y0
    for x in range(alpha.shape[1]):
        col = alpha[y0:y1, x] > 0.5
        start = None
        for i in range(h + 1):
            on = bool(col[i]) if i < h else False
            if on and start is None:
                start = i
            elif not on and start is not None:
                if i - start <= limit:
                    alpha[y0 + start:y0 + i, x] = 0.0
                start = None
    return alpha


def clear_narrow_cols(alpha, limit, protect=None):
    """Zero horizontal runs of `limit` px or shorter: the TRANSPOSE of
    clear_short_runs, and what takes a vertical plank seam out.

    clear_short_runs clears short VERTICAL runs, which removes the horizontal
    clothesline. A seam is the same kind of object turned 90 degrees, so it needs
    the other axis. Keeping only one of the two is how a rule that reads as
    "remove thin lines" ended up removing ropes and preserving seams.

    `protect` counts as ink when measuring a run, so pinned-opaque pixels of his
    cannot be split into short runs and cleared."""
    h, w = alpha.shape
    for y in range(h):
        row = alpha[y] > 0.5
        if protect is not None:
            row = row | protect[y]
        start = None
        for i in range(w + 1):
            on = bool(row[i]) if i < w else False
            if on and start is None:
                start = i
            elif not on and start is not None:
                if i - start <= limit:
                    alpha[y, start:i] = 0.0
                start = None
    return alpha


def tray_protect(a):
    """Pixels in the tray region that are unmistakably him, to be pinned opaque.

    See TRAY_PROT_RG. Blue is his sandals, dark is his outlines, and R-G over 78
    is his skin with the rim's 56..66 excluded."""
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    lum = a.mean(axis=2)
    m = (lum < TRAY_PROT_LUM) | (B > R) | ((R - G) > TRAY_PROT_RG)
    out = np.zeros(a.shape[:2], bool)
    out[TRAY_TOP:] = m[TRAY_TOP:]
    return out


def confident_him(a):
    """A looser 'this is him' than tray_protect, for keeping his own pixels OUT
    of the plate estimate before it is blurred. Loose is right here: anything of
    his left in would smear into the shadow estimate."""
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    lum = a.mean(axis=2)
    return (lum < 120) | (B > R) | ((R - G) > 45)


def cut_band(name, spec, im, a, pw, ph):
    """The free fall. See PANELS for why it cannot share the other path."""
    ry0, ry1 = spec['roi']
    sub = a[ry0:ry1]                       # the banner is excluded HERE, first,
    plate = band_plate(im)                 # because it is bigger than he is
    d = np.sqrt(((sub - plate[None]) ** 2).sum(axis=2))
    alpha = np.clip((d - LO) / (HI - LO), 0.0, 1.0)

    if 'rope' in spec:
        r0, r1 = spec['rope']
        alpha = clear_short_runs(alpha, r0 - ry0, r1 - ry0, ROPE_RUN)
    # ...and the plank seams, which are the same thing on the other axis.
    alpha = clear_narrow_cols(alpha, SEAM_RUN)

    core = alpha > 0.5
    lab, ncomp = ndimage.label(core)
    if ncomp == 0:
        raise SystemExit('%s: nothing survived the matte' % name)
    sizes = ndimage.sum(core, lab, range(1, ncomp + 1))
    order = np.argsort(sizes)[::-1]
    keep = np.zeros_like(core)
    dropped = 0
    for i in order:
        if sizes[i] >= MIN_COMPONENT:
            keep |= (lab == (i + 1))
        else:
            dropped += int(sizes[i])
    print('  %-6s %d components, kept %d px, dropped %d px of seams and streaks'
          % (name, ncomp, int(keep.sum()), dropped))
    keep = ndimage.binary_fill_holes(keep)
    alpha = ndimage.gaussian_filter(alpha * keep, FEATHER)

    ys, xs = np.where(alpha > 0.03)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    print('  %-6s crop x %d..%d y %d..%d  (%d x %d drawn)'
          % (name, x0, x1 - 1, y0 + ry0, y1 - 1 + ry0, x1 - x0, y1 - y0))
    out = np.dstack([sub[y0:y1, x0:x1], alpha[y0:y1, x0:x1] * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def cut(name, spec, im):
    W, H = im.size
    pw, ph = W // 2, H // 2
    cx, cy = spec['cell']
    panel = im.crop((cx * pw, cy * ph, (cx + 1) * pw, (cy + 1) * ph))
    a = np.asarray(panel).astype(np.float64)
    if spec.get('plate') == 'band':
        return cut_band(name, spec, im, a, pw, ph)
    x0, y0, x1, y1 = spec['box']

    # --- the background plate ---------------------------------------------
    # The band plate, per column, from panel 1's clean lower third. See
    # band_plate, and see wall_plate for what this replaced and why.
    plate = np.broadcast_to(band_plate(im)[None], a.shape).copy()
    conf = confident_him(a)

    # Below the tray's top edge the ground stops being planks and becomes the
    # tray, which runs ACROSS the picture - a cream top with a darker rim under
    # it. That is uniform along x and varies down y, the exact opposite of the
    # wall, so it is estimated per ROW from columns well clear of him. Sampling
    # a single flat cream (as this first did) leaves the rim behind as a tan
    # band welded to his sandals.
    for y in range(TRAY_TOP, ph):
        row = np.concatenate([a[y, TRAY_COLS[0][0]:TRAY_COLS[0][1], :],
                              a[y, TRAY_COLS[1][0]:TRAY_COLS[1][1], :]], axis=0)
        plate[y, :, :] = np.median(row, axis=0)

    # ...and then HIS CONTACT SHADOW, which that median cannot see because it is
    # sampled from columns he is not standing on. Estimated from the panel itself
    # with his own pixels swapped out for the flat plate first, then blurred wide
    # across x and barely at all down y. See SHADOW_SIGMA for why not isotropic.
    base = a.copy()
    for c in range(3):
        ch = base[..., c]
        ch[conf] = plate[..., c][conf]
    smooth = np.dstack([ndimage.gaussian_filter(base[..., c], SHADOW_SIGMA)
                        for c in range(3)])
    plate[TRAY_TOP:] = smooth[TRAY_TOP:]

    alpha = alpha_from_plate(a, plate)

    # HIS SHINS ARE PINNED before anything else runs, because down here his skin
    # is 27.6 from the rim and everything that removes the rim also thins his
    # legs. See TRAY_PROT_RG.
    prot = tray_protect(a)
    alpha = np.maximum(alpha, prot.astype(np.float64))

    # The plank seams. Protected pixels count as ink so he cannot be fragmented.
    alpha = clear_narrow_cols(alpha, SEAM_RUN, prot)

    # ...and the one-to-three-row dashes the box's wobbling top edge leaks
    # through. Re-pinned afterwards so this can never take a piece of him.
    alpha = clear_short_runs(alpha, TRAY_TOP, alpha.shape[0], DASH_RUN)
    alpha = np.maximum(alpha, prot.astype(np.float64))

    # NOTE: no special ramp for the tray region. One was tried at 40/65 and it
    # cut gaps out of his shins where the rim crosses them - his skin is not far
    # enough from the rim's dark tan for a threshold that kills the rim to spare
    # his legs. A vertical opening to erase the rim by shape ate his flatter
    # sandal instead. Both are recorded because both looked reasonable and both
    # made the sprite worse than the thin line they were removing.

    # Seeded on the crop box's centre, which is him by construction.
    alpha = largest_blob(alpha, seed=((y0 + y1) // 2, (x0 + x1) // 2))

    # soften the edge a hair so the outline does not alias against the board.
    # NOT a local `from scipy import ndimage` any more: that made the name local
    # to this whole function, so the shadow-plate code above it - which runs
    # first - died with UnboundLocalError. scipy is imported at the top now, and
    # the band path needs it unconditionally anyway.
    alpha = ndimage.gaussian_filter(alpha, FEATHER)

    sub_rgb = a[y0:y1, x0:x1]
    sub_a = alpha[y0:y1, x0:x1]
    ys, xs = np.where(sub_a > 0.5)
    if not len(xs):
        raise SystemExit('%s: nothing survived the matte - check the box' % name)
    print('  %-6s kept x %d..%d, y %d..%d of the crop  (%d x %d drawn)'
          % (name, xs.min(), xs.max(), ys.min(), ys.max(),
             xs.max() - xs.min(), ys.max() - ys.min()))
    print('         coverage %.1f%% of the crop, mean edge alpha %.2f'
          % (100 * (sub_a > 0.5).mean(),
             sub_a[(sub_a > 0.05) & (sub_a < 0.95)].mean() if ((sub_a > 0.05) & (sub_a < 0.95)).any() else 0))

    out = np.dstack([sub_rgb, sub_a * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def main():
    if not os.path.exists(SRC):
        print('NOT FOUND: %s' % SRC)
        print('Copy the four-panel storyboard there first.')
        return 1
    im = Image.open(SRC).convert('RGB')
    print('storyboard %dx%d' % im.size)
    apply = '--apply' in sys.argv
    for name, spec in PANELS.items():
        sprite = cut(name, spec, im)
        prev = os.path.join(ROOT, 'tools', '_pose_%s.png' % name)
        # preview on the game's own wood, so the edge is judged where it lands
        bg = Image.new('RGBA', sprite.size, (249, 215, 185, 255))
        Image.alpha_composite(bg, sprite).save(prev)
        if apply:
            os.makedirs(OUT, exist_ok=True)
            dst = os.path.join(OUT, 'finale-%s.png' % name)
            sprite.save(dst)
            print('         wrote %s (%d bytes)'
                  % (os.path.relpath(dst, ROOT), os.path.getsize(dst)))
    print('\npreviews in tools/_pose_*.png (composited on the wall colour)')
    if not apply:
        print('re-run with --apply to write the sprites')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
