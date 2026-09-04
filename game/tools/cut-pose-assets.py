# -*- coding: utf-8 -*-
"""Cut the single-pose assets: one pose per canvas, on a wall with nothing else.

WHY THIS IS A SEPARATE TOOL FROM cut-finale-poses.py, and why it is a fifth of the
size. That one cuts a 2x2 STORYBOARD, where every panel is crowded: a pink banner
across the top, a cream box across the bottom, yellow impact flashes either side
of him, and three other panels sharing the wall. It needed a band plate borrowed
from another panel, a rope filter, a seam filter, a shadow-aware tray plate and a
protection mask, and it still left single-digit residue.

These are what that art never was - 2172x724, one pose, and the only other thing
on the wall is the clothesline. Measured: the median distance from a per-column
plate taken from the image's OWN clean bottom band is 2.4 to 3.2 out of 255. The
storyboard's equivalent residual was 33, which is why every threshold there had to
be argued for. Here the matte is arithmetic.

He also lands at about 550x450 in this frame against roughly 200x290 in a
storyboard panel, so these cut at about 2.5x the resolution and the edges are the
art's own antialiasing rather than something reconstructed.

WHAT STILL HAS TO COME OUT:

  THE CLOTHESLINE, at the top of every frame. It is a live element in the game
  (.rope) - a sprite carrying a piece of it would drag a floating rope around. It
  sags, so it is a row BAND per asset rather than a row.

  THE PLANK SEAMS. The wall is drawn with a slight barrel curve, so a seam's x
  drifts with y and a per-column plate cannot sit on it perfectly. They come out
  as thin vertical lines: 2-4 px wide against his narrowest feature, a finger, at
  20+ px in this resolution. Cleared by run width, the same way the storyboard's
  were - see SEAM_RUN.

  HIS DRAWN CONTACT SHADOW, on the landing pose only, and this one is KEPT rather
  than cut. See KEEP_SHADOW.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', '_source')
OUT = os.path.join(ROOT, 'assets', 'images')

# LO/HI are the alpha ramp in colour distance, and they can be tighter than the
# storyboard's 14/46 because the plate is this much better: p90 of the distance
# over the whole image is 13 in the snap asset. 12/40 keeps his antialiased edge
# while putting the wall firmly at zero.
LO, HI = 12.0, 40.0
FEATHER = 0.6
SEAM_RUN = 9          # residual plank seams reach 7-8 px; his fingers are 20+ here
MIN_COMPONENT = 3000  # at this resolution a seam fragment is hundreds, he is 100k+
CLOSE_R = 7           # seals the leaks in his outline before holes are filled
SOLID_R = 3           # everything this far inside his outline is HIM, any colour

# SMALL THINGS THAT ARE PART OF THE PICTURE and fall under MIN_COMPONENT. The snap
# pose draws a tiny sparkle beside his fingers - it is the point of that pose and
# it is a few hundred px, so the component floor throws it away. Anything listed
# here is kept if it sits within KEEP_NEAR px of him.
KEEP_SPECKS = {}       # see the sparkle note below
KEEP_NEAR = 90

# THIN THINGS WELDED TO HIM, which run width cannot reach. A plank seam that
# passes BESIDE his hair is 2-4px wide, but where it touches him the row's run
# includes his hair and is not narrow - so clear_narrow_cols sees nothing. A
# reviewer found 40px of exactly that at the top of the snap pose, the one that
# holds at the end.
#
# An OPENING sees it: a thin strip attached to a large body vanishes under one and
# the body does not. His narrowest real feature at this resolution is a finger at
# 20+px, so 4 (an 8px structure) is clear of anything of his. Same "shape, not
# level" move as SEAM_RUN, one step on: run width for a free-standing line, an
# opening for one that is welded on.
OPEN_R = 6

# THE DUST IS ITS OWN SPRITE, so it can spread. A still cannot animate, and the
# user asked for the landing dust to move - so it is cut out of the landing pose
# and driven separately.
#
# It separates by SATURATION, not brightness: the dust is rgb(247,222,202) at
# saturation 44-47, the wall under it is rgb(249,206,173) at 75, and his own
# palette is 120+. Light AND grey is only ever the dust.
DUST_FROM = 'land2'
# Loose, because the test only ever runs INSIDE the matte - so "light and grey"
# cannot pick up the wall, and his own palette is saturated well past this.
DUST_LUM = 185.0
DUST_SAT = 68.0
DUST_MIN = 300         # the puffs break into wisps; 1500 kept only the cores

# ...but it DOES pick up his shirt: the light stripes are rgb(253,228,205) at
# saturation 48, which is dust by every colour test there is. They are separated
# by WHERE they are - the dust sits on the ground and his shirt does not.
# Measured in the source: dust rows 551..659, his shirt around 430..500.
DUST_FROM_ROW = 520

# THE DUST'S HALO GOES WITH IT. Subtracting only the pixels that pass the colour
# test leaves the puff's soft outer edge behind as a grey smudge on his body -
# measured and looked at: worse than the baked-in dust it replaced. Dilating the
# mask by 10 takes the halo; 18 starts eating his own ground shadow.
DUST_DILATE = 10

# THE SPARKLE IS NOT CUT AND IS NOT MEANT TO BE. It is a soft glow with thin rays
# and the component floor, the opening and the alpha ramp all take a piece of it -
# and it should not be a still anyway: the user's brief says it APPEARS beside his
# fingers, which is an animation. It is drawn in CSS at the snap instead, so
# KEEP_SPECKS no longer has to fight for it.
MARGIN = 6            # transparent margin kept around him, so nothing is clipped

# `rope` is the rows the clothesline crosses, cleared outright. Nothing else is
# per-asset any more: the plate works itself out from the frame. See cut().
POSES = {
    'fall2': {'src': 'aaru-fall.png', 'rope': (0, 130)},
    'land2': {'src': 'aaru-land.png', 'rope': (0, 130)},
    'snap':  {'src': 'aaru-snap.png', 'rope': (0, 130)},
}

# THE ROPE COMES OUT BY BRIGHTNESS INSIDE THAT BAND, NOT WHOLESALE - and getting
# this wrong cut half his head off.
#
# The band used to be cleared outright. In the FALL pose his hair crown starts at
# row 42 and the rope sags to row 72, so they OVERLAP: clearing rows 0..100 erased
# 58 rows of his head. The user reported it as "half his head is not visible",
# which is exactly what it was.
#
# Measured, and the gap is wide: the rope is rgb(244,204,171) at luminance 206
# (p10 203, p90 213) while his hair in those same rows is 47 in the fall pose, 139
# in the landing and 118 in the snap - a p90 of 148 at worst. 175 sits in a
# 55-level gap and cannot mistake either for the other.
#
# The wall is as bright as the rope, which is harmless: it is background already
# and the plate has it at alpha 0. And because the test now protects him, the BAND
# can be GENEROUS - 130 rather than 100 - instead of being trimmed to miss his
# head. Trimming it was the wrong lever; the rope sags past any flat line.
ROPE_LUM = 175.0

ROUGH_D = 25.0        # first-pass "this might be him", for excluding him from the plate
HOLE_D = 12.0         # an enclosed hole further than this from the plate is HIM
MIN_CLEAN_ROWS = 40   # a column with fewer clean rows gets its profile interpolated

# THE LANDING POSE'S DUST AND SHADOW ARE PART OF THE PICTURE. The art draws two
# puffs either side of his feet and a soft contact shadow under him, and they are
# what makes that pose read as an impact. They are pale, so a ramp tuned to his
# outline drops them; this one starts low enough to keep them.
KEEP_SHADOW = {}

# Keep the shipped canvases and their source-space origins stable while cleaning
# the matte. CSS positions, feet anchors, and the snap's measured fingertip all
# depend on this mapping; newly transparent edge pixels must not resize Aaru.
FIXED_CROPS = {
    'fall2': (842, 31, 492, 665),
    'land2': (912, 291, 391, 404),
    'snap':  (879, 110, 421, 584),
}
FIXED_DUST_CROP = (808, 543, 557, 141)


def disk(r):
    """A round structuring element. Square ones leave corners on his outline."""
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def separable_plate(a, rope):
    """The wall, as a row profile plus a column deviation.

    He is TALL AND NARROW in this frame - about a quarter of the columns - so the
    median along any row is the wall, and that gives the vertical shading. The
    columns then need their own profile for the plank seams and the barrel
    curve, taken from the rows that are not him.

    A single band cannot do this. Picking clean rows put the band inside his legs
    (he spans y 99..723 in the fall pose) and the plate came out part boy."""
    H, W, _ = a.shape
    rowprof = np.median(a, axis=1)                       # (H,3) - the wall down y
    plate0 = np.broadcast_to(rowprof[:, None, :], a.shape)
    d0 = np.sqrt(((a - plate0) ** 2).sum(axis=2))
    rough = ndimage.binary_dilation(d0 > ROUGH_D, np.ones((9, 9), bool))

    clean = ~rough
    clean[rope[0]:rope[1]] = False                        # never sample the rope
    n = clean.sum(axis=0)
    colprof = np.zeros((W, 3))
    ok = n > MIN_CLEAN_ROWS
    for c in range(3):
        tot = np.where(clean, a[..., c], 0).sum(axis=0)
        colprof[ok, c] = tot[ok] / n[ok]
    if (~ok).any():                                      # his own columns, if any
        idx = np.arange(W)
        for c in range(3):
            colprof[~ok, c] = np.interp(idx[~ok], idx[ok], colprof[ok, c])
    base = np.median(colprof, axis=0)
    return plate0 + (colprof[None, :, :] - base[None, None, :]), int((~ok).sum())


def dust_mask(a):
    """The landing pose's two dust puffs: light AND unsaturated. See DUST_SAT."""
    lum = a.mean(axis=2)
    sat = a.max(axis=2) - a.min(axis=2)
    m = (lum > DUST_LUM) & (sat < DUST_SAT)
    m[:DUST_FROM_ROW] = False        # his shirt is light and grey too. See above.
    m = ndimage.binary_opening(m, np.ones((3, 3), bool))
    lab, n = ndimage.label(m)
    keep = np.zeros_like(m)
    for i in range(1, n + 1):
        blob = lab == i
        if blob.sum() >= DUST_MIN:
            keep |= blob
    return ndimage.binary_dilation(keep, disk(3))


def solidify(alpha, comp, d):
    """Pin his whole interior opaque, and keep the real gaps open.

    EVERYTHING MORE THAN SOLID_R INSIDE HIS OUTLINE IS HIM, whatever colour it is.
    That is what finally fixed his shirt: its light stripes are 19..52 from the
    plate, inside the ramp, so no threshold lifts them and - because they leak out
    through his own antialiased outline - no hole-filling reaches them either.
    Being interior is a fact about where they are, not what colour they are.

    The exception is a hole that really is background. In the snap pose his hand
    rests on his hip and his arm encloses a triangle of wall: 3 from the plate,
    against the stripes' 19..52, which is what HOLE_D splits. Those stay open.

    CLOSE_R first, because his outline has thin leaks at this threshold and an
    unclosed silhouette has no interior to speak of."""
    closed = ndimage.binary_closing(comp, disk(CLOSE_R))
    filled = ndimage.binary_fill_holes(closed)
    holes = filled & ~comp
    lab, n = ndimage.label(holes)
    gaps = 0
    for i in range(1, n + 1):
        m = lab == i
        if d[m].mean() <= HOLE_D:
            filled[m] = False                            # a real gap, e.g. his hip
            gaps += int(m.sum())
    solid = ndimage.binary_erosion(filled, disk(SOLID_R))
    was = float(alpha[solid].mean()) if solid.any() else 1.0
    alpha = np.maximum(alpha, solid.astype(np.float64))
    alpha = alpha * ndimage.binary_dilation(filled, disk(1))
    return alpha, gaps, was


def cut(name, spec):
    path = os.path.join(SRC, spec['src'])
    if not os.path.exists(path):
        print('  MISSING %s' % os.path.relpath(path, ROOT))
        return None
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.float64)
    H, W, _ = a.shape

    plate, interp = separable_plate(a, spec['rope'])
    d = np.sqrt(((a - plate) ** 2).sum(axis=2))

    lo, hi = KEEP_SHADOW.get(name, (LO, HI))
    alpha = np.clip((d - lo) / (hi - lo), 0.0, 1.0)
    # The clothesline, BY BRIGHTNESS so his head survives it - see ROPE_LUM. This
    # line used to clear the band outright, and in the fall pose his hair crown is
    # inside that band, so 58 rows of his head went with the rope.
    #
    # It is applied here AND AGAIN AFTER solidify(), which is not redundant: see
    # the second call for why.
    r0, r1 = spec['rope']
    bandlum = a[r0:r1].mean(axis=2)
    alpha[r0:r1] = np.where(bandlum > ROPE_LUM, 0.0, alpha[r0:r1])
    alpha = clear_narrow_cols(alpha, SEAM_RUN)            # the plank seams

    core = alpha > 0.5
    lab, n = ndimage.label(core)
    if not n:
        print('  %s: nothing survived the matte' % name)
        return None
    sizes = ndimage.sum(core, lab, range(1, n + 1))
    comp = np.zeros_like(core)
    dropped = 0
    small = []
    for i in np.argsort(sizes)[::-1]:
        if sizes[i] >= MIN_COMPONENT:
            comp |= (lab == (i + 1))
        else:
            small.append(i + 1)
            dropped += int(sizes[i])

    # ...and the specks that ARE the picture. The snap pose's sparkle is a few
    # hundred px, so the component floor throws it out along with the seams. Kept
    # by being NEAR him rather than by being big, which is what tells a sparkle
    # beside his fingers apart from a plank seam across the frame.
    floor = KEEP_SPECKS.get(name)
    kept_specks = 0
    speck_mask = np.zeros_like(core)
    if floor and small:
        near = ndimage.binary_dilation(comp, disk(KEEP_NEAR))
        for i in small:
            m = lab == i
            if m.sum() >= floor and near[m].any():
                comp |= m
                speck_mask |= m
                kept_specks += int(m.sum())
                dropped -= int(m.sum())

    alpha, gaps, was = solidify(alpha, comp, d)

    # THE ROPE AGAIN, because solidify() puts some of it back. Bits of rope show
    # through the GAPS BETWEEN HIS HAIR CURLS, and those bits are enclosed by hair
    # on every side - so "everything inside his outline is him" is true of them by
    # construction and pins them opaque. Measured in the fall pose: two nubs of 58
    # and 43 px at luma 206..220 and alpha 246..255, sitting in hair whose own
    # luma is 44.
    #
    # Two rules that disagree about the same pixels, and the later one wins. The
    # rope rule is the more specific of the two, so it goes last.
    alpha[r0:r1] = np.where(bandlum > ROPE_LUM, 0.0, alpha[r0:r1])

    # ...and the thin things welded to him, which run width could not reach. See
    # OPEN_R: a reviewer found 40px of plank seam attached to his hair this way.
    # NEVER SHAVE THE SPECKS WE DELIBERATELY KEPT. The snap pose's sparkle is a
    # small star with thin rays, which is precisely what an opening destroys - it
    # took the sprite from 574px wide to 421 the first time this ran, because the
    # sparkle IS the right-hand edge of that pose. The opening is for things welded
    # to him by accident, not for the ones kept on purpose.
    opened = ndimage.binary_opening(alpha > 0.5, disk(OPEN_R))
    # EXEMPT THE SPECKS ENTIRELY, not just where they are solid. The sparkle is a
    # soft glow - most of it is below alpha 0.5 - so `speck_mask & (alpha>0.5)`
    # protected its core and let the opening shave its rays, which is 85px of the
    # snap pose's width and the whole point of that beat.
    opened |= ndimage.binary_dilation(speck_mask, disk(OPEN_R + 2))
    # Re-label after the opening. Narrow plank remnants can begin attached to his
    # hair, become correctly detached here, and still survive if we merely multiply
    # by `opened`. Keep Aaru's main silhouette, plus only low, wide ground material
    # on the two standing poses. This removes the pale vertical bars without
    # sacrificing fingers, curls, the landing dust, or the contact shadow.
    olab, on = ndimage.label(opened)
    if on > 1:
        osizes = ndimage.sum(opened, olab, range(1, on + 1))
        main = int(np.argmax(osizes)) + 1
        clean_opened = olab == main
        if name in ('land2', 'snap'):
            for oid in range(1, on + 1):
                if oid == main:
                    continue
                yy, xx = np.where(olab == oid)
                if (len(xx) and yy.min() > H * 0.72
                        and (xx.max() - xx.min()) > 36
                        and (yy.max() - yy.min()) < H * 0.24):
                    clean_opened |= olab == oid
        opened = clean_opened
    shaved = int((alpha > 0.5).sum() - opened.sum())
    alpha = alpha * ndimage.binary_dilation(opened, disk(2))

    dust = None
    if name == DUST_FROM:
        dm = ndimage.binary_dilation(dust_mask(a), disk(DUST_DILATE))
        dm = dm & (alpha > 0.03)
        if dm.any():
            dust = alpha * dm
            alpha = alpha * ~dm          # his body, without the dust painted on
    alpha = ndimage.gaussian_filter(alpha, FEATHER)

    ys, xs = np.where(alpha > 0.03)
    x0 = max(0, xs.min() - MARGIN)
    x1 = min(W, xs.max() + 1 + MARGIN)
    y0 = max(0, ys.min() - MARGIN)
    y1 = min(H, ys.max() + 1 + MARGIN)
    if name in FIXED_CROPS:
        x0, y0, fw, fh = FIXED_CROPS[name]
        x1, y1 = x0 + fw, y0 + fh
    out = np.dstack([a[y0:y1, x0:x1], alpha[y0:y1, x0:x1] * 255]).astype(np.uint8)

    if dust is not None:
        dust = ndimage.gaussian_filter(dust, FEATHER)
        dy, dx = np.where(dust > 0.03)
        # its own crop, and its own origin recorded RELATIVE to his, so app.js can
        # place it against him rather than against the stage
        dx0, dy0, dw, dh = FIXED_DUST_CROP
        dx1, dy1 = dx0 + dw, dy0 + dh
        dout = np.dstack([a[dy0:dy1, dx0:dx1],
                          dust[dy0:dy1, dx0:dx1] * 255]).astype(np.uint8)
        print('         DUST %dx%d, its top-left sits at (%+d,%+d) from his'
              % (dx1 - dx0, dy1 - dy0, dx0 - x0, dy0 - y0))
        globals()['_DUST'] = (Image.fromarray(dout, 'RGBA'), dx0 - x0, dy0 - y0)

    print('  %-6s median d %.1f  seams %d px  shaved %d px  gaps %d px  '
          'interior %.3f -> 1.000%s'
          % (name, np.median(d), dropped, shaved, gaps, was,
             '  sparkle %d px' % kept_specks if kept_specks else ''))
    print('         %d columns interpolated, source crop (%d,%d)   -> %dx%d, content x %d..%d y %d..%d'
          % (interp, x0, y0, x1 - x0, y1 - y0, xs.min() - x0, xs.max() - x0,
             ys.min() - y0, ys.max() - y0))
    return Image.fromarray(out, 'RGBA')


def clear_narrow_cols(alpha, limit):
    """Zero horizontal runs of `limit` px or shorter - the plank seams.

    The wall is drawn with a slight barrel curve, so a seam drifts sideways as it
    goes down and a per-column plate cannot sit on it for its whole length. What
    is left is 2-4 px wide and hundreds of px long. His narrowest vertical
    feature at this resolution is a finger at 20+ px."""
    h, w = alpha.shape
    for y in range(h):
        row = alpha[y] > 0.5
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


def main():
    apply = '--apply' in sys.argv
    print('cutting from %s' % os.path.relpath(SRC, ROOT))
    for name, spec in POSES.items():
        sprite = cut(name, spec)
        if sprite is None:
            continue
        prev = os.path.join(ROOT, 'tools', '_pose_%s.png' % name)
        bg = Image.new('RGBA', sprite.size, (249, 215, 185, 255))
        Image.alpha_composite(bg, sprite).save(prev)
        if apply:
            os.makedirs(OUT, exist_ok=True)
            dst = os.path.join(OUT, 'aaru-%s.png' % name)
            sprite.save(dst)
            print('         wrote %s (%d bytes)'
                  % (os.path.relpath(dst, ROOT), os.path.getsize(dst)))
            if name == DUST_FROM and '_DUST' in globals():
                dimg, ox, oy = globals()['_DUST']
                dd = os.path.join(OUT, 'aaru-dust.png')
                dimg.save(dd)
                print('         wrote %s (%d bytes)  offset (%+d,%+d) from his crop'
                      % (os.path.relpath(dd, ROOT), os.path.getsize(dd), ox, oy))
    print('')
    print('previews in tools/_pose_*.png, composited on the board colour')
    if not apply:
        print('re-run with --apply to write the sprites')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
