#!/usr/bin/env python3
"""Cut one live element out of each recap card, and inpaint the hole it leaves.

WHY THIS EXISTS
    The recap walks a sparkle round ten story pictures and each picture is meant to
    twitch as the sparkle arrives - the flour flies, the bicycle moves, Aaru falls.
    Every card is ONE FLAT IMAGE, so there is nothing to animate until we cut
    something out of the artwork. Cut naively and you get a GHOST: the element
    animates on top while the original sits there underneath, so the thing appears
    twice. Hence two files per card:

        <slot>-<id>-sprite.png   the element, RGBA, edge feathered ~1.5px
        <slot>-<id>-patch.png    the background that was behind it, inpainted,
                                 SAME BOX as the sprite, alpha 1 over the element
                                 footprint and ramping to 0 across a 3px ring

    At runtime: draw patch over the original element (it disappears), draw sprite on
    top, transform the sprite. Clean cut-and-move, no ghost.

WHAT WE WORK FROM
    scratchpad/cards/NN-id.png - each card cropped out of a real screenshot at
    310x212, which is EXACTLY the size the ring draws it. One pixel in that file is
    one pixel on screen, so every box below is literal screen pixels: no scaling, no
    crop maths, no resampling. Do NOT retarget this at assets/images/*.webp - the
    card shows a hand-placed crop of those and the two do not agree. (The `hd` knob
    below is the ONE exception, and it is not a retarget: tools/make-hd-cards.py
    reproduces the very same crop by parsing app.js's own four percentages, so the two
    do agree, by construction.)

THE METHOD, and what it measured
    There is no chroma key - the element sits on painted background. So:

    1. ROUGH BACKGROUND, per row. A clean strip of the card (bg_strip, clear of the
       element) gives one background colour per row, smoothed down y. Distance from
       it, D, finds the element confidently but also lights up honest background
       texture, because a single colour per row cannot describe clouds or haze.

    2. REFINED BACKGROUND FIELD, per row, by horizontal interpolation. Measured on
       05-fall: along a row the background moves less than 10 units across the whole
       310px width, while down a column it moves 20+ per 10px where sky turns to
       sand. So rows are the flat direction - interpolate along rows. For each row,
       take every pixel NOT under the rough element mask and np.interp across the
       gaps; blur the result (sigma 2 down y, 7 across x). Residual in clean sky
       fell from unusable to a median of 1.4/255. That field is both the detector's
       reference AND the patch.

    3. MASK by hysteresis on the refined distance D2: seed on D2 > t_hi (confident
       core, and at t_hi the element is a separate connected component from its
       neighbours), then binary_propagation out to D2 > t_lo so soft edges come in
       without leaking into background texture. binary_fill_holes closes interiors.
       A guard lets a card fence off a neighbour that the low threshold would bridge
       to - on 05-fall the boy's wrist passes ~3px from the bicycle handlebar.

    4. FEATHER. sprite alpha = blur(mask, feather) then a contrast lift, which gives
       a ~1.5px edge instead of a jagged cut.

    5. PATCH ALPHA from a distance transform, not a blur: dilate the mask by
       pad_patch and ramp alpha 0 -> 1 over that ring. Alpha is a solid 1 across the
       whole element footprint (so the element is definitely gone) and dies to 0
       outside it (so the patch melts into untouched art instead of ending on a
       rectangle). Anything the guard protects is subtracted, so a patch never paints
       over a neighbour it merely passed close to.

    6. VERIFY, three assertions, printed per card:
         a. sprite over the original at zero offset == original, exactly.
         b. patch + sprite at zero offset == original except inside the patch's
            3px ramp ring - reported as mean abs diff over the box.
         c. element really gone: with the patch applied, max distance from the
            background field inside the mask. Big number = element still showing.
       Plus a side-by-side to scratchpad/recap-check/: original | patched | patched
       with the sprite offset by the recommended motion.

OPTIONAL KNOBS, all default-off, so a card that does not set them runs the
pipeline above unchanged
    guard used as a WALL rather than as a neighbour
        07-dog's samosa tip is 1px from the dog's open mouth, which is DARKER than
        the samosa, so the grow bridges into the dog through x=139,y=190 (D2 57)
        and swallows the head. That guard is a plain vertical wall at x<=138 plus a
        floor at y>=204, held to a small window so the second-pass field still has
        plenty of clean sand to interpolate from. The floor matters because `art`
        stops the MASK entering the cream frame but nothing stops a_patch's ramp:
        without it the patch smears sand 2px across the white border.

    unmix + replay_tol
        Test (b) can only ever be near-exact while the sprite carries the card's
        own RGB: at a feathered edge the runtime composites patch-then-sprite and
        gets patch*(1-a) + card*a, so the patch bleeds through the element's own
        soft rim. With unmix the sprite RGB is SOLVED for instead,
            sprite = (card - under*(1-a)) / a,  under = patch over card,
        using the alphas as they were actually quantised into the PNGs, which makes
        patch+sprite at zero offset bit-exact. replay_tol then turns test (b) from
        a printed number into an assert. The cost is that the sprite's rim pixels
        are no longer literally the card's pixels, so test (a) no longer applies
        and is skipped - (b) is the stronger statement anyway.

    hd (and art_hd)
        `"hd": 3` cuts from scratchpad/cards-hd/ instead, where the same view is
        rendered at 3x from the native artwork rather than screen-grabbed - because
        the recap POPS a card to 3x and a sprite cut at ring size has no detail to
        give it. Every number in the entry stays a 1x number and _hd_spec scales the
        ones measured in pixels; the reported box is divided back down, so the
        manifest and app.js are unaffected. See _hd_spec for what does and does not
        scale, and note the WHAT WE WORK FROM paragraph above applies to the 1x path.

    scale / origin / zoom
        scale shrinks the sprite (07-dog: the samosa is being eaten, so it slides
        left AND shrinks away); origin is the transform-origin in CARD pixels for
        both the rotation and the scale, defaulting to the box centre so a card
        that omits it renders exactly as before; zoom adds a magnified second row
        to the check strip, because a 19px element cannot be judged at 1:1.

ADDING A CARD
    Several people work in here at once. Add ONE entry to CARDS and do not touch
    anyone else's numbers. If your cut needs behaviour the table cannot express, add
    a callable under GUARDS and name it from your entry. Retune a number here before
    you rewrite the cut.

    python tools/cut-recap-sprites.py          # every card in the table
    python tools/cut-recap-sprites.py 05       # just slot 05
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

# PER-SESSION, so the default below is stale the moment that session ends - which
# it has. AARU_SCRATCH overrides it, and tools/make-hd-cards.py and
# tools/cut-belly-hand.py read the same variable so all three agree.
SCRATCH = Path(os.environ.get(
    "AARU_SCRATCH",
    "C:/Users/ANANYA~1/AppData/Local/Temp/claude/"
    "c--Users-Ananya-Goswami-OneDrive-Desktop-Aaru-ki-cheenk/"
    "939edda1-434e-4af3-8894-236eb1ad9195/scratchpad"
))
CARDS_DIR = SCRATCH / "cards"
CARDS_HD_DIR = SCRATCH / "cards-hd"
CHECK_DIR = SCRATCH / "recap-check"
OUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "images"


# --------------------------------------------------------------------------- #
# THE TABLE. One row per card. Boxes are pixels of the 310x212 card as drawn.
#
#   card      file in scratchpad/cards/
#   seed      (x, y) inside the element - picks the connected component to keep
#   t_hi      threshold for the confident core (element must be its OWN component)
#   t_lo      threshold the core grows out to (soft edges in, texture out)
#   pad_box   pixels of slack added around the mask bbox to make the sprite canvas
#   pad_patch width of the patch's alpha ramp, in pixels, outside the mask
#   feather   gaussian sigma on the sprite alpha (~1.5px edge at 0.8)
#   bg_strip  (x0, x1) of a column strip that is background on EVERY row we care
#             about - seeds the rough per-row colour
#   guard     name in GUARDS, or None. Fences off a neighbour the grow would bridge
#   sweep     (radius, max_px) or None. Loose flecks near the element that the grow
#             could not follow - thin spray, dust, a detached highlight. The PATCH
#             erases them, the SPRITE does not carry them, so they vanish rather
#             than sit still while the element moves. Never touches guarded pixels.
#             An optional 3rd number overrides t_lo for the fleck test alone.
#   addon     name in ADDONS, or None. Hand-drawn geometry unioned INTO the mask,
#             for element parts the distance test cannot hold on to.
#   close     size of a square closing on the mask, or None. Swallows slivers that
#             open onto the silhouette (a highlight that reads as background and so
#             cannot be closed by binary_fill_holes).
#   art       (x0, y0, x1, y1) of the painted picture inside the cream frame, or
#             None for the default (14, 12, w-13, h-11). Set it when the element
#             runs to the very edge of the art: the frame is white, so smoothing the
#             per-row background down y washes out the last rows, and the patch comes
#             out pale there. Measured on 04-ride: the bottom 3 rows were 45/255 too
#             blue until this clamped them.
#   scale     end scale of the sprite (default 1.0)
#   origin    (x, y) transform-origin in CARD pixels (default: the box centre)
#   unmix     solve the sprite RGB so patch+sprite at zero offset is bit-exact
#   reach_pad extra px the patch's solid-alpha region takes beyond the sprite's
#             feathered rim, so no antialiased edge pixel keeps its card value and
#             leaves a standing outline (unmix only)
#   replay_tol assert ceiling for test (b); only meaningful together with unmix
#   zoom      integer magnification for a second row on the check strip
#   motion    what the recap should animate, as (dx, dy, deg, ms, easing)
# --------------------------------------------------------------------------- #
def _merge_json_cards(table):
    """Fold in one file per card from tools/recap-cards/*.json.

    WHY THIS EXISTS. Six agents cutting six cards all edited the CARDS table below at
    once, and one of them lost: 06-cart's sprite and patch are on disk with no table
    entry to say how they were made, so they cannot be re-cut or re-tuned. One file
    per card cannot collide.

    A JSON entry is merged OVER the literal below, so a card can live in either place
    and the file wins - which is also how a tuning pass overrides a number without
    editing this script. Tuples arrive from JSON as lists; motion and seed are turned
    back into tuples because the code below unpacks them.
    """
    d = Path(__file__).resolve().parent / "recap-cards"
    if not d.is_dir():
        return table
    for f in sorted(d.glob("*.json")):
        slot = f.stem
        spec = json.loads(f.read_text(encoding="utf-8"))
        if "motion" in spec:
            spec["motion"] = tuple(spec["motion"])
        if "seed" in spec and spec["seed"] and isinstance(spec["seed"][0], list):
            spec["seed"] = [tuple(x) for x in spec["seed"]]
        elif "seed" in spec:
            spec["seed"] = tuple(spec["seed"])
        for k in ("bg_strip", "art", "sweep", "origin"):
            if isinstance(spec.get(k), list):
                spec[k] = tuple(spec[k])
        base = dict(table.get(slot, {}))
        base.update(spec)
        table[slot] = base
    return table


CARDS = {
    "04": dict(
        card="04-ride.png",
        element="Aaru and the whole bicycle - the biggest cut in the set",
        seed=(165, 60),          # inside his hair
        t_hi=110,
        t_lo=80,
        pad_box=5,
        pad_patch=4,
        feather=0.8,
        bg_strip=(20, 52),       # sky / haze / sand left of the rear wheel
        guard=None,
        addon="ride_wheel_discs",
        close=7,
        sweep=None,              # it ate the bell; see _ride_wheel_discs
        art=(10, 9, 302, 204),
        unmix=True,
        reach_pad=2,             # or a dashed ghost outline stays behind
        replay_tol=45.0,         # NOT bit-exact, and it cannot be - see the note
        motion=(7, -2, 0.0, 620, "cubic-bezier(.2,.85,.3,1)"),
        note=(
            "The brief warned this cut would probably fail because the patch has to "
            "invent sky, sand and a dust plume across 165x190 of a 310x212 card. It "
            "does not fail, and the reason is measurable: this background is flat "
            "ALONG ROWS. Sampled at y=40/100/120/160, x=40 and x=270 agree to within "
            "4/255 in the sky and 20/255 through the haze, so the row interpolation "
            "has real information to work with and reconstructs the horizon rather "
            "than smearing it. Ring residual (patch vs untouched art where the alpha "
            "ramp starts) came out at 2-4/255 over most of the outline. "
            "SUBJECT ISOLATION was the easy part: the boy and bike are painted sharp "
            "on a bokeh background, so distance from the row field separates them by "
            "a mile - the core at t_hi=110 is already one connected component and the "
            "grow to 80 only picks up soft edges. t_lo must stay ABOVE ~75: the soft "
            "contact shadow under the tyres sits at 40-75 and is deliberately left in "
            "the card, because a shadow belongs to the ground, not to the bicycle. "
            "close=7 swallows the shirt-highlight slivers that open onto the "
            "silhouette; sweep at 55 takes the bell's chrome fleck. "
            "MOTION: a forward surge, +7px x with a 2px bob, easing out. Do NOT "
            "rotate this sprite - it is the full bike, and it is cropped by the card "
            "frame at the bottom, so any rotation swings the tyres off their contact "
            "shadow."
        ),
    ),
    "05": dict(
        card="05-fall.png",
        element="Aaru himself, airborne off the bicycle",
        seed=(165, 50),          # inside his hair
        t_hi=55,
        t_lo=22,
        pad_box=4,
        pad_patch=3,
        feather=0.8,
        bg_strip=(18, 46),       # sky/sand left of him, clear of boy and bike
        guard="bike_below_y88",
        sweep=(10, 60),
        motion=(2, 13, 8.0, 420, "cubic-bezier(.36,0,.7,.35)"),
        note=(
            "Cut the BOY only - the bicycle tips over separately at lower right and "
            "stays part of the card. His wrist passes ~3px from the handlebar grip, "
            "which is what the guard is for. The thin sneeze-spray arc off his mouth "
            "is NOT in the sprite: it is 1px of near-sky white and it breaks into "
            "dashes, so the grow cannot follow it. Four flecks of it (21px total, a "
            "~20/255 tint) survived outside the mask, so sweep erases them with the "
            "patch - it is airborne spray, not part of him, and vanishing beats "
            "sitting still while he drops."
        ),
    ),
    "07": dict(
        card="07-dog.png",
        element="the samosa - golden triangle on the sand at the running dog's snout",
        seed=(152, 187),         # solid orange inside the upper right of the triangle
        t_hi=60,                 # at 60 the samosa is its OWN 4-connected component;
                                 # the nearest dog pixels sit across D2 43 / 14 / 57
        t_lo=20,                 # keeps the soft lower-left rim; sand noise here <=16
        pad_box=3,
        pad_patch=3,
        feather=0.8,
        bg_strip=(161, 168),     # sand right of the samosa: (229,182,119) +-3 on EVERY
                                 # row 179..203.  x168+ catches the boy's sandal at 203.
        guard="samosa_wall",
        sweep=None,              # nothing detached - sand around the triangle reads <=16
        art=(11, 8, 301, 204),   # measured on this card: row 7 and col 10/301 are the
                                 # frame blend, row 204 is the bottom blend. The samosa
                                 # runs to y=202, so this clamp is load-bearing here.
        unmix=True,
        replay_tol=0.51,
        zoom=6,
        scale=0.55,
        origin=(139.0, 193.0),   # the left tip: the point that enters the mouth
        motion=(-12, -3, -10.0, 420, "cubic-bezier(.4,0,.9,.45)"),
        note=(
            "The dog grabs the samosa, so the samosa is what moves: 12px LEFT and 3px "
            "up into the open snout while it shrinks to 0.55 about its own left tip, as "
            "if taken. Cut the samosa ONLY - the dog stays part of the card, and the "
            "wall guard exists because the tip and the mouth are 1px apart. There is no "
            "cast shadow to worry about: the sand immediately under the triangle reads "
            "<=5/255 from its neighbours, so the dark lower-left edge is the samosa's "
            "own shading and travels with it. Do NOT push the slide past ~14px: at -14 "
            "the sprite's right edge reaches x=143 and the bare right half of the patch "
            "is exposed as flat inpainted sand, and beyond that the shrinking triangle "
            "is drawn ON TOP of the dog's nose."
        ),
    ),
}


# --------------------------------------------------------------------------- #
# GUARDS. A guard receives the confident core (hi), the kept element, and the card
# shape, and returns a boolean map of "never grow into this, never patch over this".
# --------------------------------------------------------------------------- #
def _bike_below_y88(hi, keep, shape):
    """05-fall: everything confidently-foreground below y=88 that is not the boy is
    the bicycle. Dilate it 2px so the grow cannot bridge the wrist-to-handlebar gap
    and the patch cannot spill sky onto the grip.

    HD-AWARE, and it has to be: _hd_spec scales the TABLE, not the guards, so a bare
    y=88 on the 637-tall HD card would fence off the boy's own knees instead of the
    bicycle - the split line has to ride the card. k comes from the card height rather
    than an argument so the GUARDS signature stays what everyone else's guard expects;
    at 1x it is 1 and this is byte-for-byte the old wall."""
    h, _ = shape
    k = max(1, int(round(h / 212.0)))
    other = hi & ~keep & (np.arange(h)[:, None] > 88 * k)
    return ndi.binary_dilation(other, np.ones((4 * k + 1,) * 2, bool))


def _pot_lid_wall(hi, keep, shape):
    """03-pot: 05's wall below y=88, MINUS the lid's own rim striations.

    Same job as _bike_below_y88 - everything confidently foreground below y=88 that is
    not the lid is the boy or the pot, and it is the only thing between the grow and
    his shirt - but it drops SPECKS from the wall, and that is the whole point.

    WHY. The wall is built from `hi & ~keep`, so every fragment of the LID'S OWN rim
    that clears t_hi without touching the lid's face gets fenced off as if it were the
    boy, and the fence's dilation then blocks the grow through the rim band beside it.
    At 1x that was paid for with 23 extra seeds, one per fragment. On the 3x card it
    cannot be: at t_hi=200 there are 52 such fragments and 47 of them are 1-2px, so
    they contain no pixel whose coordinates are both multiples of 3 and a 1x seed
    (which is what tools/recap-cards/03.json can express, seeds being scaled by k)
    cannot address them at all. Measured on 03: 53 hi-components fall inside the
    known-good 1x lid mask, 52 of them 1-6px and one 423px band of top rim - so a size
    filter separates the striations from real structure by two orders of magnitude, and
    the one real band is seeded by hand.

    The filter is on the WALL, not on the mask: a speck that stops being fenced is
    merely reachable, and it is only taken if the grow can actually walk to it through
    pixels above t_lo. The boy and the pot are thousands of pixels each and stay
    walled, dilation and all. 25 * k*k is 25px at 1x and 225px at 3x - an AREA, so it
    scales by k squared. k rides the card height for the same reason it does in
    _bike_below_y88: _hd_spec scales the table, not the guards."""
    h, _ = shape
    k = max(1, int(round(h / 212.0)))
    other = hi & ~keep & (np.arange(h)[:, None] > 88 * k)
    lbl, n = ndi.label(other)
    if n:
        sizes = np.bincount(lbl.ravel())
        speck = np.zeros(sizes.size, bool)
        speck[1:] = sizes[1:] < 25 * k * k
        other = other & ~speck[lbl]
    return ndi.binary_dilation(other, np.ones((4 * k + 1,) * 2, bool))


def _samosa_wall(hi, keep, shape):
    """07-dog: a wall, not a neighbour.  x<=138 is the dog's open mouth and foreleg,
    1px from the samosa's tip and DARKER than it, so the grow would bridge into the
    head at x=139,y=190.

    The wall has to run all the way to x=0, not just past the mouth, and that is the
    interesting measurement here.  This dog is TAN on tan sand: its lit fur reads
    (211,151,94) against sand (229,182,119), a distance of 43, which is under the
    engine's d1>62 block, so the first-pass field happily uses dog fur as a
    background sample.  With the wall stopping at x=128 the row interpolation reached
    left into the head and pulled the field at x=139 down to (203,148,90) - 33/255
    dark - which both poisons the patch and inflates D2 on clean sand.  Walling the
    whole left side leaves the row with only right-hand samples, so it extrapolates
    flat off the sand at x>=143, which is the right answer: the sand under the samosa
    is flat to +-2/255.

    It must NOT also fence the cream frame, tempting as that is: a guard is fed to
    block2, so a floor at y>=204 dilates up four rows and blanks rows 200-203 for the
    background field, which then extrapolates flat off the boy's sandal at x=175
    (198,142,85) and drags 30/255 of brown into the patch under the samosa's own
    bottom corner. Keeping a_patch off the frame is the job of the `if art:` clamp
    further down cut().

    The numbers below are 1x CARD pixels, and this guard is handed the shape of
    whatever the cut is reading - which with `"hd": 3` is the 932x637 HD render of the
    same view. _hd_spec scales the table's parameters but it cannot reach inside a
    guard, so scale here off the width: 310 -> 1, 932 -> 3. `xx <= 139 * k - 1` is
    `xx <= 138` written so it keeps meaning "up to and including all of 1x column
    138", i.e. HD column 416, rather than losing the last two HD columns of the
    wall.

    AND IT MUST NEVER FENCE THE SAMOSA ITSELF, which is why `& ~keep` is on the end.
    At 1x the wall stopped at x=138 and the confident core began at x=139 - a margin
    of exactly zero, which held only because a 25px-wide triangle cannot resolve its
    own tip. At 3x it can: the core reaches HD x=414 (1x 138.0) while the dog's nose
    reaches HD x=418 (1x 139.3), so the two INTERLEAVE in x by about one 1x pixel and
    no vertical line separates them. They are still cleanly separated in y - at every
    column from 414 to 418 the dog's band ends by y=572 and the samosa's starts at
    y>=573, a gap of 2-4 rows with no t_lo pixels in it, so the grow cannot bridge
    even with the wall opened. Subtracting the core hands those three columns back to
    the samosa; without it they stay guarded, a_patch is held at 0 over part of the
    element, and the "element gone" test reads 171 instead of ~5. Subtracting `keep`
    UNDILATED is deliberate: at 1x the core never touches the wall, so this is a
    no-op there and the 1x cut is unchanged."""
    h, w = shape
    k = max(1, int(round(w / 310.0)))
    yy, xx = np.mgrid[0:h, 0:w]
    return (yy >= 170 * k) & (xx <= 139 * k - 1) & ~keep


GUARDS = {"bike_below_y88": _bike_below_y88,
          "pot_lid_wall": _pot_lid_wall,
          "samosa_wall": _samosa_wall}


# --------------------------------------------------------------------------- #
# ADDONS. The opposite of a guard: hand-drawn geometry unioned INTO the mask, for
# element parts the distance test cannot hold on to. An addon gets the card shape
# and returns a boolean map.
# --------------------------------------------------------------------------- #
def _ride_wheel_discs(shape):
    """04-ride: both wheels are spoked, and spokes are 1px of near-sand grey, so the
    threshold keeps the tyre ring and the hub and drops everything between them -
    which leaves a faint spoke starburst standing in the patch. Take each wheel as a
    SOLID DISC instead. The sprite then carries the sand that showed through the
    spokes, but the recap only pans this card sideways and the sand behind the wheels
    is flat within ~4/255 across 60px, so sliding it 7px is invisible. Measured off
    the tyre outlines: rear 79..133 x 141..200, front 176..243 x 143..211 (the front
    wheel runs off the bottom of the card, which is why its box does).

    Third disc: the BELL on the handlebar. Its chrome highlight is a 12px near-white
    blob (x 209..212, y 99..101) that sits within 20/255 of the haze behind it, so
    the threshold drops it, and it opens onto the silhouette so fill_holes cannot
    close it. sweep would erase it into the patch - but the bell is bicycle, it has
    to MOVE rather than vanish, and it is the thing making the trin-trin. So: disc.

    The three boxes below are 1x CARD pixels and this addon is handed the shape of
    whatever the cut is reading - with `"hd": 3` that is the 932x637 HD render of the
    same view. _hd_spec scales the table but it cannot reach inside an addon, so scale
    here off the width the way the guards do: 310 -> 1, 932 -> 3. The boxes are
    INCLUSIVE pixel ranges (PIL draws both ends), so a 1x range a..b becomes
    a*k..(b+1)*k-1 rather than a*k..b*k - otherwise each disc comes out k-1 px short
    on its right and bottom and the tyre's outer rim is left standing in the patch.
    At k=1 that reduces to a..b exactly, so the 1x cut is unchanged."""
    h, w = shape
    k = max(1, int(round(w / 310.0)))
    disc = Image.new("L", (w, h), 0)
    dr = ImageDraw.Draw(disc)
    for (x0, y0, x1, y1) in ((79, 141, 133, 200),      # rear wheel
                             (176, 143, 243, 211),     # front wheel, off the card
                             (204, 96, 217, 110)):     # the bell, highlight and all
        dr.ellipse((x0 * k, y0 * k, (x1 + 1) * k - 1, (y1 + 1) * k - 1), fill=255)
    return np.asarray(disc) > 0


ADDONS = {"ride_wheel_discs": _ride_wheel_discs}


# --------------------------------------------------------------------------- #
# The cut itself - generic, driven entirely by the table.
# --------------------------------------------------------------------------- #
def _art_rect(shape, art):
    """(x0, y0, x1, y1) of the painted picture inside the card's cream frame."""
    h, w = shape[:2]
    return art if art else (14, 12, w - 13, h - 11)


def _row_background(rgb, strip, art=None):
    med = np.median(rgb[:, strip[0]:strip[1], :], axis=1)
    _, y0, _, y1 = _art_rect(rgb.shape, art)
    med[:y0] = med[y0]                         # the frame is white; smoothing across
    med[y1:] = med[y1 - 1]                     # it washes out the last rows of art
    return ndi.gaussian_filter1d(med, 2.0, axis=0)


def background_field(rgb, block, strip, art=None):
    """Smooth background estimate: per row, np.interp across the blocked spans using
    that row's own surviving pixels, then blur. Rows vary less along x than along y
    on these cards, which is why the interpolation runs along rows."""
    h, w, _ = rgb.shape
    rough = _row_background(rgb, strip, art)
    ax0, ay0, ax1, ay1 = _art_rect((h, w), art)
    frame = np.ones((h, w), bool)
    frame[ay0:ay1, ax0:ax1] = False            # keep the card's cream frame out of it
    ok = ~block & ~frame
    xs = np.arange(w)
    field = np.empty_like(rgb)
    for y in range(h):
        row = ok[y]
        if row.sum() < 6:
            field[y] = rough[y]
            continue
        for c in range(3):
            field[y, :, c] = np.interp(xs, xs[row], rgb[y, row, c])
    return ndi.gaussian_filter(field, (2.0, 7.0, 0))


def _place(sprite, box, origin, deg, scale, dx, dy):
    """Rotate then scale an RGBA sprite about `origin` (CARD pixels, i.e. the CSS
    transform-origin) and translate by (dx, dy).  Returns the padded array plus the
    (ox, oy) that over() wants - offsets relative to the box's top-left.  We pad,
    rotate about the tracked centre with expand=False so that centre keeps its
    coordinates, then resize the whole canvas, which moves the centre to
    centre*scale.  With scale=1 and origin=None this reduces exactly to
    rotate(-deg, expand=False) pasted at (dx, dy)."""
    x0, y0, x1, y1 = box
    sh, sw = sprite.shape[:2]
    pad = 32
    canv = np.zeros((sh + 2 * pad, sw + 2 * pad, 4), np.uint8)
    canv[pad:pad + sh, pad:pad + sw] = sprite
    cx = (origin[0] - x0 + pad) if origin else (sw / 2.0 + pad)
    cy = (origin[1] - y0 + pad) if origin else (sh / 2.0 + pad)
    im = Image.fromarray(canv).rotate(-deg, resample=Image.BICUBIC, center=(cx, cy))
    if scale != 1.0:
        im = im.resize((max(1, int(round(im.width * scale))),
                        max(1, int(round(im.height * scale)))), Image.LANCZOS)
        cx, cy = cx * scale, cy * scale
    ax = (origin[0] if origin else x0 + sw / 2.0) + dx - cx - x0
    ay = (origin[1] if origin else y0 + sh / 2.0) + dy - cy - y0
    return np.asarray(im).astype(np.float32), int(round(ax)), int(round(ay))


def _hd_spec(spec):
    """Opt-in `"hd": k`: cut from scratchpad/cards-hd/ instead of scratchpad/cards/.

    WHY. The recap pops a card out of the ring and blows it up 3x, so a sprite cut
    from the 310x212 card - one screen pixel per card pixel while it sat in the ring -
    is being upscaled from a source that has no more detail, and it looks it. The HD
    card is the SAME VIEW rendered at k x from the native artwork in assets/rounds
    (~2.4 native pixels per card pixel, so the detail is really there), which means a
    coordinate in it is just k times the 1x coordinate and a tuned 1x card moves over
    by multiplying.

    So this returns a scaled COPY of the spec and leaves the caller's 1x spec alone -
    the manifest, and app.js, still speak 1x. What scales is anything measured in
    pixels; what must NOT is anything measured in colour. Thresholds (t_hi, t_lo, the
    optional 3rd sweep number, replay_tol) are distances in RGB and are untouched.
    sweep's max_px is an AREA, so it scales by k*k, not k - a 6px fleck at 1x is a
    ~54px fleck at 3x, and scaling it by k alone would silently stop sweeping.
    motion's dx/dy scale so the check strip previews the real move; its degrees, ms
    and easing do not.
    """
    k = int(spec.get("hd", 1) or 1)
    if k == 1:
        return spec, 1
    s = dict(spec)
    seeds = s["seed"]
    if seeds and isinstance(seeds[0], (list, tuple)):
        s["seed"] = [(x * k, y * k) for (x, y) in seeds]
    else:
        s["seed"] = (seeds[0] * k, seeds[1] * k)
    for key in ("bg_strip", "art", "origin"):
        if s.get(key) is not None:
            s[key] = tuple(v * k for v in s[key])
    if s.get("art_hd"):
        # OPT-IN ESCAPE HATCH, because `art` is the one rect that k * (1x) cannot
        # always reach. The hd card's cream frame is a FIXED 24px inset (see
        # cards-hd/hd.json), not k times the 1x screenshot's ~7px frame, so the hd
        # art rect is not a multiple of k. art's y1 has to be EXACTLY the first
        # pure-white row: one short and a full row of the element is left standing
        # outside `inside`, alpha 0, a static ghost of a moving thing; one long and
        # that white row's own distance from the whitening field (~44 on 10-earring)
        # clears t_lo and bridges the grow across the whole width of the card.
        # 10-earring needs y1=613, and 613/3 is not an integer. So state it directly.
        s["art"] = tuple(int(v) for v in s["art_hd"])
    for key in ("pad_box", "pad_patch", "close", "reach_pad"):
        if s.get(key):
            s[key] = int(round(s[key] * k))
    if s.get("feather"):
        s["feather"] = s["feather"] * k
    if s.get("sweep"):
        sw = list(s["sweep"])
        sw[0] = int(round(sw[0] * k))            # radius: a length
        sw[1] = int(round(sw[1] * k * k))        # max_px: an area
        s["sweep"] = tuple(sw)
    dx, dy, deg, ms, ease = s["motion"]
    s["motion"] = (dx * k, dy * k, deg, ms, ease)
    return s, k


def cut(slot, spec, verbose=True):
    spec, hd = _hd_spec(spec)
    src = (CARDS_HD_DIR if hd > 1 else CARDS_DIR) / spec["card"]
    rgb = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    h, w, _ = rgb.shape
    # SEVERAL SEEDS, NOT ONE, because some elements are not one object. The falling
    # utensils are six separate pieces of steel with wall between them, so a single
    # seed keeps one tumbler and the cutter's own message ("seed is not in the core")
    # is no help at all - the seed IS in a core, just not in the only one that
    # matters. A list unions the components those seeds land in.
    seeds = spec["seed"]
    if seeds and not isinstance(seeds[0], (list, tuple)):
        seeds = [seeds]
    art = spec.get("art")
    ax0, ay0, ax1, ay1 = _art_rect((h, w), art)
    inside = np.zeros((h, w), bool)
    inside[ay0:ay1, ax0:ax1] = True

    # 1. rough distance, only to decide what to hide from the interpolation
    rough = _row_background(rgb, spec["bg_strip"], art)
    d1 = np.linalg.norm(rgb - rough[:, None, :], axis=2)
    # the 7 and the 9 below are MARGINS IN CARD PIXELS around the element, so under
    # hd they have to grow with everything else or the field starts sampling the
    # element's own soft rim as background (hd=1 leaves them exactly 7 and 9)
    block = ndi.binary_dilation(d1 > 62, np.ones((7 * hd, 7 * hd), bool))

    # 2. refined field, and the distance that actually gets thresholded
    field = background_field(rgb, block, spec["bg_strip"], art)
    d2 = np.linalg.norm(rgb - field, axis=2)

    # 3. hysteresis, guarded
    hi = d2 > spec["t_hi"]
    lo = d2 > spec["t_lo"]
    if art:
        # the cream frame is a bright ring right around the art, so an element that
        # runs to the edge (04-ride's tyres) can grow into it and then all the way
        # round the card, and fill_holes swallows the whole picture. 62698px, once.
        hi &= inside
        lo &= inside
    lbl, _ = ndi.label(hi)
    keep = np.zeros((h, w), bool)
    for (sx, sy) in seeds:
        if lbl[sy, sx] == 0:
            raise SystemExit(
                "[%s] seed (%d,%d) is not in the core - lower t_hi (d2 there is %.1f, "
                "t_hi is %s)" % (slot, sx, sy, d2[sy, sx], spec["t_hi"]))
        keep |= lbl == lbl[sy, sx]
    guard = (GUARDS[spec["guard"]](hi, keep, (h, w)) if spec.get("guard")
             else np.zeros((h, w), bool))
    mask = ndi.binary_fill_holes(
        ndi.binary_propagation(keep, mask=lo & ~guard)
    )
    if spec.get("addon"):
        mask |= ADDONS[spec["addon"]]((h, w)) & ~guard
    if spec.get("close"):
        mask = ndi.binary_closing(mask, np.ones((spec["close"],) * 2, bool)) & ~guard
    mask = ndi.binary_fill_holes(mask)
    if art:
        mask &= inside                         # never cut into the cream frame

    # second pass on the field now that we know the element properly
    block2 = ndi.binary_dilation(mask | guard, np.ones((9 * hd, 9 * hd), bool))
    field = background_field(rgb, block2, spec["bg_strip"], art)
    d2 = np.linalg.norm(rgb - field, axis=2)

    # 4/5. alphas
    a_sprite = ndi.gaussian_filter(mask.astype(np.float32), spec["feather"])
    a_sprite = np.clip((a_sprite - 0.5) * 2.2 + 0.5, 0, 1)

    # loose flecks the grow could not follow: the patch erases them, the sprite does
    # not carry them, so they vanish instead of sitting still while the element moves
    footprint = mask.copy()
    swept = 0
    if spec.get("sweep"):
        radius, max_px = spec["sweep"][:2]
        t_sweep = spec["sweep"][2] if len(spec["sweep"]) > 2 else spec["t_lo"]
        near = ndi.binary_dilation(mask, ndi.generate_binary_structure(2, 2),
                                   iterations=radius)
        cand = (d2 > t_sweep) & near & ~mask & \
               ~ndi.binary_dilation(guard, np.ones((5, 5), bool))
        if art:
            cand &= inside
        lab, nlab = ndi.label(cand)
        for i in range(1, nlab + 1):
            blob = lab == i
            if blob.sum() <= max_px:
                footprint |= blob
                swept += int(blob.sum())
        footprint = ndi.binary_fill_holes(footprint)

    pad = spec["pad_patch"]
    grown = ndi.binary_dilation(footprint, ndi.generate_binary_structure(2, 1),
                                iterations=pad)
    a_patch = np.clip(ndi.distance_transform_edt(grown) / float(pad), 0, 1)
    # SOLID 1 OVER THE FOOTPRINT, which is what the header above promises but the
    # distance transform alone does not deliver: `grown` is a CITY-BLOCK dilation, so
    # at a convex corner of the silhouette the nearest outside pixel is closer than
    # pad and alpha lands under 1 - and the shortfall is proportional to pad, so it
    # hides at pad=3 and bites at pad=9. Measured on 06-cart at hd 3: the outermost
    # ring of the glass held a_patch 0.868, which left 13% of the original element
    # standing as a 1px rim (test c 10.7, against a noise floor of 8). With this line
    # test c is 0.00 there, and it moves NO other card: every unmix card already
    # forces alpha to 1 over `reach`, which contains the footprint.
    a_patch = np.maximum(a_patch, footprint.astype(np.float32))
    a_patch = np.minimum(a_patch, 1.0 - ndi.gaussian_filter(guard.astype(np.float32), 1.0))
    a_patch = np.maximum(a_patch, a_sprite)      # never leave the sprite's edge uncovered
    patch_rgb = field

    if spec.get("unmix"):
        # For the replay to be exact, the patch must be a TRUE NO-OP everywhere the
        # sprite does not cover - otherwise the ramp ring paints field over real art
        # at partial alpha and nothing can correct it (measured: 1-5/255 across the
        # ring, 50/255 while the field was still poisoned). So: reach = every pixel
        # the element touches at all, mask plus its feathered rim. Over reach the
        # patch is a solid 1 of field, so the element is definitely gone AND the
        # sprite's own soft rim is covered rather than left as a 1/3-strength ghost.
        # Outside reach the patch carries the REAL ART, so its alpha ramp changes
        # nothing at all. The patch therefore ends on the element's silhouette - not
        # on a rectangle - and there field and art agree to ~2/255 on this sand.
        reach = footprint | (a_sprite > 0)
        if spec.get("reach_pad"):
            # a_sprite > 0 only reaches ~1px past the mask, but a painted element's
            # antialiased rim can run 2-3px, and every one of those pixels that stays
            # outside reach keeps its CARD value - which on 04-ride drew a faint
            # dashed outline of the whole bicycle standing still behind the moving
            # one. Exactly the ghost this file exists to prevent. So push reach out.
            reach = ndi.binary_dilation(
                reach, ndi.generate_binary_structure(2, 2),
                iterations=int(spec["reach_pad"]))
        reach &= ~guard
        if art:
            reach &= inside & inside
        a_patch = np.maximum(a_patch, reach.astype(np.float32))
        patch_rgb = np.where(reach[:, :, None], field, rgb)
    if art:
        # the element is cropped by the frame, so the cut is too: without this the
        # patch ramp paints sand over the white border below 04-ride's tyres
        a_sprite = a_sprite * inside
        a_patch = a_patch * inside

    # box
    ys, xs_ = np.where(footprint)
    p = spec["pad_box"]
    box = (max(0, int(xs_.min()) - p), max(0, int(ys.min()) - p),
           min(w, int(xs_.max()) + 1 + p), min(h, int(ys.max()) + 1 + p))
    if hd > 1:
        # app.js places the sprite by a 1x box and scales the PNG up, so the HD box
        # has to divide back down to whole 1x pixels or the sprite lands off by up to
        # half a card pixel. Snap outwards - it only ever adds slack.
        box = (box[0] // hd * hd, box[1] // hd * hd,
               min(w, -(-box[2] // hd) * hd), min(h, -(-box[3] // hd) * hd))
    x0, y0, x1, y1 = box

    def crop(arr):
        return arr[y0:y1, x0:x1]

    sprite = np.dstack([crop(rgb), crop(a_sprite) * 255.0]).round().clip(0, 255).astype(np.uint8)
    patch = np.dstack([crop(patch_rgb), crop(a_patch) * 255.0]).round().clip(0, 255).astype(np.uint8)

    if spec.get("unmix"):
        # Solve the sprite RGB against the QUANTISED patch so that patch-then-sprite
        # at zero offset returns the card exactly, instead of letting the patch bleed
        # through the element's own feathered rim.
        base = crop(rgb)
        p_q = patch[:, :, 3].astype(np.float32) / 255.0
        under = (base * (1 - p_q[:, :, None])
                 + patch[:, :, :3].astype(np.float32) * p_q[:, :, None])

        # The solve is only IN GAMUT above a certain alpha. Requiring
        #     0 <= (base - under*(1-a))/a <= 255
        # gives a >= 1 - base/under and a >= (base-under)/(255-under) per channel, so
        # take the worst channel and let the feather's alpha be raised to meet it.
        # Without this, two pixels of this samosa clipped: its faint right-edge glow
        # at (157,186) is a lone mask pixel the feather had taken to alpha 0, and the
        # dark corner at (156,202) wanted a negative blue - 7.0 and 1.4 of 255. The
        # raise is tiny (worst here 0.08 -> 0.66) and it lands on rim pixels only, so
        # the moving sprite gains a barely-there fleck and the replay becomes exact.
        with np.errstate(divide="ignore", invalid="ignore"):
            need_lo = np.where(under > 1e-3, 1.0 - base / np.maximum(under, 1e-3), 0.0)
            need_hi = np.where(under < 255.0 - 1e-3,
                               (base - under) / np.maximum(255.0 - under, 1e-3), 0.0)
        need = np.clip(np.maximum(need_lo, need_hi).max(axis=2), 0.0, 1.0)
        a_use = np.clip(np.maximum(crop(a_sprite), need + 1.5 / 255.0), 0.0, 1.0)
        a_u8 = (a_use * 255.0).round().clip(0, 255).astype(np.uint8)
        a_q = a_u8.astype(np.float32) / 255.0
        with np.errstate(divide="ignore", invalid="ignore"):
            solved = (base - under * (1 - a_q[:, :, None])) / a_q[:, :, None]
        solved = np.where(a_q[:, :, None] > 0.004, solved, base)
        sprite = np.dstack([solved, a_u8]).round().clip(0, 255).astype(np.uint8)
        if verbose:
            bumped = int(((a_u8.astype(np.float32) / 255.0) - crop(a_sprite) > 0.01).sum())
            print("      unmix          %d px alpha raised for gamut (max +%.3f)"
                  % (bumped, float((a_q - crop(a_sprite)).max())))

    # 6. verification
    def over(base, top_rgb, top_a, ox=0, oy=0):
        out = base.copy()
        ah, aw = top_a.shape
        for yy in range(ah):
            ty = y0 + yy + oy
            if not 0 <= ty < h:
                continue
            xa, xb = x0 + ox, x0 + ox + aw
            sa = max(0, -xa)
            xa, xb = max(0, xa), min(w, xb)
            if xb <= xa:
                continue
            n = xb - xa
            al = top_a[yy, sa:sa + n][:, None]
            out[ty, xa:xb] = out[ty, xa:xb] * (1 - al) + top_rgb[yy, sa:sa + n] * al
        return out

    if spec.get("unmix"):
        # replay the ACTUAL PNGs, alphas and all, not their float ancestors
        sa_f = sprite[:, :, 3].astype(np.float32) / 255.0
        pa_f = patch[:, :, 3].astype(np.float32) / 255.0
        sr = sprite[:, :, :3].astype(np.float32)
        pr = patch[:, :, :3].astype(np.float32)
    else:
        sa_f, pa_f = crop(a_sprite), crop(a_patch)
        sr, pr = crop(rgb), crop(patch_rgb)

    zero = over(rgb, sr, sa_f)
    err_a = float(np.abs(zero - rgb).max())
    if not spec.get("unmix"):
        assert err_a < 0.51, "[%s] sprite@0 is not the original (max %.2f)" % (slot, err_a)

    patched = over(rgb, pr, pa_f)
    both = over(patched, sr, sa_f)
    err_b = float(np.abs(both - rgb)[y0:y1, x0:x1].mean())
    err_bmax = float(np.abs(both - rgb)[y0:y1, x0:x1].max())
    if spec.get("replay_tol") is not None:
        assert err_bmax <= spec["replay_tol"], (
            "[%s] patch+sprite@0 is not the card (max %.2f > %.2f)"
            % (slot, err_bmax, spec["replay_tol"]))

    resid = np.linalg.norm(patched - field, axis=2)
    err_c = float(resid[footprint].max())

    dx, dy, deg, ms, ease = spec["motion"]
    scale = float(spec.get("scale", 1.0))
    origin = spec.get("origin")
    if scale == 1.0 and origin is None:
        moved = Image.fromarray(sprite).rotate(-deg, resample=Image.BICUBIC, expand=False)
        ma = np.asarray(moved).astype(np.float32)
        mox, moy = dx, dy
    else:
        ma, mox, moy = _place(sprite, box, origin, deg, scale, dx, dy)
    shown = over(patched, ma[:, :, :3], ma[:, :, 3] / 255.0, mox, moy)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    CHECK_DIR.mkdir(parents=True, exist_ok=True)
    stem = "%s-%s" % (slot, spec["card"].split("-", 1)[1].rsplit(".", 1)[0])
    Image.fromarray(sprite).save(OUT_DIR / ("%s-sprite.png" % stem))
    Image.fromarray(patch).save(OUT_DIR / ("%s-patch.png" % stem))

    gap = 6
    z = int(spec.get("zoom", 0) or 0)
    zw = zh = 0
    if z:
        zx0, zy0 = max(0, x0 - 10), max(0, y0 - 8)
        zx1, zy1 = min(w, x1 + 10), min(h, y1 + 6)
        zw, zh = (zx1 - zx0) * z, (zy1 - zy0) * z
    cw = max(w, zw)
    strip_img = Image.new("RGB",
                          (cw * 3 + gap * 4, h + zh + gap * (3 if z else 2)),
                          (24, 24, 28))
    for i, arr in enumerate((rgb, patched, shown)):
        im8 = Image.fromarray(arr.round().clip(0, 255).astype(np.uint8))
        strip_img.paste(im8, (gap + i * (cw + gap) + (cw - w) // 2, gap))
        if z:
            strip_img.paste(
                im8.crop((zx0, zy0, zx1, zy1)).resize((zw, zh), Image.NEAREST),
                (gap + i * (cw + gap) + (cw - zw) // 2, gap * 2 + h))
    strip_img.save(CHECK_DIR / ("%s.png" % stem))

    if verbose:
        print("[%s] %s" % (slot, stem))
        print("      box            %s  (%dx%d)%s"
              % (box, x1 - x0, y1 - y0,
                 "  [hd %dx source; box reported to app.js as %s]"
                 % (hd, tuple(v // hd for v in box)) if hd > 1 else ""))
        print("      mask px        %d   (+%d swept flecks in the patch only)"
              % (int(mask.sum()), swept))
        print("      a. sprite@0    max abs diff %.3f   (must be ~0)" % err_a)
        print("      b. patch+spr@0 mean abs diff %.3f over the box (ramp ring only)" % err_b)
        print("      c. element gone: max bg-distance under mask %.1f (sky noise ~8)" % err_c)
        if spec.get("replay_tol") is not None:
            print("      b. max         %.3f  (asserted <= %.2f - unmixed sprite)"
                  % (err_bmax, spec["replay_tol"]))
        print("      motion         dx %s dy %s rot %sdeg %sms %s" % (dx, dy, deg, ms, ease))
        if scale != 1.0 or origin is not None:
            print("      transform      scale %.2f about origin %s (card px)"
                  % (scale, origin))
    return dict(box=tuple(v // hd for v in box), err_a=err_a, err_b=err_b,
                err_c=err_c)


def write_manifest(rows):
    """Emit the numbers app.js needs, as data and as a paste-ready block.

    app.js CANNOT READ THIS AT LOAD - it is a classic script and the recap has to
    place a sprite synchronously - so the boxes and motions live in SCENE_FX as
    literals. That is a second copy of the truth, which is the drift this project
    keeps paying for, so it is handled the two ways that actually work: the block
    below is GENERATED (nobody types a box by hand), and the manifest beside it lets
    tools/sim.js assert that what app.js carries is still what the cutter produced.
    A number that drifts becomes a failing harness line instead of a sprite sitting
    beside itself.
    """
    # MERGED, NOT REPLACED. Running one slot must not delete the other nine: this
    # script is called per card while tuning, and a manifest holding only the last
    # card cut would make tools/sim.js's drift check pass by knowing about nothing.
    man = {}
    mf = OUT_DIR / "manifest.json"
    if mf.is_file():
        try:
            man = json.loads(mf.read_text(encoding="utf-8"))
        except ValueError:
            man = {}
    for slot, stem, r, spec in rows:
        dx, dy, deg, ms, ease = spec["motion"]
        man[slot] = dict(file=stem, box=list(r["box"]), motion=spec["motion"],
                         scale=spec.get("scale", 1.0), origin=spec.get("origin"),
                         err_b=round(r["err_b"], 3), err_c=round(r["err_c"], 2))
    mf.write_text(
        json.dumps(man, indent=1, sort_keys=True), encoding="utf-8")
    print("")
    print("wrote %s" % (OUT_DIR / "manifest.json"))
    print("")
    print("--- paste into SCENE_FX in app.js, one `sprite:` per card -------------")
    for slot in sorted(man):
        m = man[slot]
        dx, dy, deg, ms, ease = m["motion"]
        print("  /* slot %s */ sprite: { file: '%s', box: [%d, %d, %d, %d],"
              % (slot, m["file"], *m["box"]))
        print("      motion: '<one of fall|drop|swing|slide|tilt|bob>',"
              " ms: %d, dx: %s, dy: %s, rot: %s," % (ms, dx, dy, deg))
        print("      ease: '%s' }," % ease)
    print("----------------------------------------------------------------------")


CARDS = _merge_json_cards(CARDS)

if __name__ == "__main__":
    want = sys.argv[1:] or sorted(CARDS)
    rows = []
    for slot in want:
        if slot not in CARDS:
            print("no table entry for slot %s; have %s" % (slot, sorted(CARDS)))
            continue
        spec = CARDS[slot]
        r = cut(slot, spec)
        rows.append((slot, Path(spec["card"]).stem, r, spec))
    if rows:
        write_manifest(rows)
