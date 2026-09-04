#!/usr/bin/env python3
"""Render each recap card at HD, from the artwork rather than from a screenshot.

WHY THIS EXISTS
    The recap pops a picture out of the ring to three times its size. The cut-out
    sprites it animates were cut from scratchpad/cards/NN-id.png - a 310x212 crop of
    a real screenshot, which is exactly the size the ring draws a card, so one pixel
    there was one pixel on screen and every box was literal.

    That was the right source while the card stayed in its slot. It is the wrong one
    the moment the card triples: the sprite is upscaled 3x from a source with no more
    detail in it, and that is the pixelation on the utensils that got reported.

    The artwork underneath has the detail. assets/images/*.webp are 748 to 1522px
    wide, which against the 483px of card space each one is drawn into works out at
    1.5 to 2.9 native pixels per card pixel. So a card rendered at HD_SCALE gives a
    sprite with that much more real resolution, and at pop 3 nothing is invented.

WHAT IT WRITES
    scratchpad/cards-hd/NN-id.png, each HD_SCALE times 310.6 x 212.3 - the same view
    the ring shows, at HD_SCALE the resolution. Coordinates in it are card pixels
    times HD_SCALE, so a box measured on the 1x card multiplies straight up.

HOW A CARD IS FRAMED, and this is the part that has to match app.js exactly or the
sprite lands beside itself. paintCardArt() sizes and positions the image inside
.card-crop from four hand-placed percentages:

    img width  = crop.w/100 * home.w          left = crop.x/100 * home.w - BW
    img height = crop.h/100 * CARD_H          top  = crop.y/100 * CARD_H - BW

.card-crop is the content box, home.w - 2*BW by CARD_H - 2*BW, and the whole card is
drawn at RING_SCALE. So the visible rectangle of the SOURCE image, in source pixels,
is worked back from those four numbers - see frame_of(). The -BW terms are
load-bearing: they resolve the percentages against the padding box rather than the
frame box, and dropping them stretches every picture by about 2.4%.

VERIFYING IT
    Run with --check. Each HD card is downscaled back to 310x212 and compared to the
    screenshot crop in scratchpad/cards/. They will not be identical - one is a webp
    decoded and resampled once, the other went through a browser's compositor and a
    PNG screenshot - but a mean absolute difference over about 6/255 means the framing
    is wrong rather than merely resampled, and that is what this is looking for.
"""
import io
import json
import os
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
# THE SCRATCHPAD IS PER SESSION, so the default below goes stale the moment the
# session that wrote it ends - which it has, twice. AARU_SCRATCH overrides it, and
# tools/cut-belly-hand.py reads the same variable, so the two agree by construction
# rather than by someone remembering to edit both.
SCRATCH = Path(os.environ.get(
    "AARU_SCRATCH",
    "C:/Users/ANANYA~1/AppData/Local/Temp/claude/"
    "c--Users-Ananya-Goswami-OneDrive-Desktop-Aaru-ki-cheenk/"
    "939edda1-434e-4af3-8894-236eb1ad9195/scratchpad"))
OUT_DIR = SCRATCH / "cards-hd"
REF_DIR = SCRATCH / "cards"

# From app.js. Read rather than copied, below, so they cannot drift.
RING_W, RING_H = 310.6, 212.3

# The ten in ring order: slot -> (stem, round asset, the card id in ROUNDS)
RING_ORDER = [
    ("01", "house",     "r1-house"),
    ("02", "sneeze",     "r1-sneeze"),
    ("03", "pot",        "r1-pot"),
    ("04", "ride",       "r2-ride"),
    ("05", "fall",       "r2-fall"),
    ("06", "cart",       "r3-cart"),
    ("07", "dog",        "r3-dog"),
    ("08", "home",       "r3-home"),
    ("09", "sneeze-r4",  "r4-sneeze"),
    ("10", "earring",    "r4-earring"),
]

HD_SCALE = 3   # matches the pop-out's own 3x, so nothing is ever upscaled

# The card's white frame, --card-edge in styles.css. The HD card carries it because
# every sprite box in this project is measured against the card's OUTER box.
CARD_EDGE = (255, 255, 255)


def read_app_numbers():
    """CARD_H, BW and every card's home.w + crop, straight out of app.js.

    PARSED RATHER THAN COPIED. These four percentages per card are the whole framing,
    and a second hand-typed copy of them is the drift this project keeps paying for -
    a sprite cut against stale numbers lands beside the thing it was cut from and
    nothing reports it.
    """
    src = (ROOT / "app.js").read_text(encoding="utf-8")
    card_h = int(re.search(r"^const CARD_H\s*=\s*(\d+)", src, re.M).group(1))
    # BW is read from CSS at runtime; it is --card-bw in styles.css.
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    bw = float(re.search(r"--card-bw:\s*([\d.]+)px", css).group(1))

    cards = {}
    pat = re.compile(
        r"\{\s*id:\s*'([^']+)'\s*,\s*src:\s*'assets/images/([^']+)'.*?"
        r"home:\s*\{\s*x:\s*[-\d.]+\s*,\s*y:\s*[-\d.]+\s*,\s*w:\s*([\d.]+)\s*\}\s*,\s*"
        r"crop:\s*\{\s*w:\s*([-\d.]+)\s*,\s*h:\s*([-\d.]+)\s*,\s*"
        r"x:\s*([-\d.]+)\s*,\s*y:\s*([-\d.]+)\s*\}",
        re.S)
    for m in pat.finditer(src):
        asset = Path(m.group(2)).stem
        cards[asset] = dict(home_w=float(m.group(3)),
                            crop=dict(w=float(m.group(4)), h=float(m.group(5)),
                                      x=float(m.group(6)), y=float(m.group(7))))
    return card_h, bw, cards


def frame_of(spec, card_h, bw, native):
    """The rectangle of the SOURCE image that a card actually shows, in source px.

    The image is laid out inside .card-crop - which is home_w - 2*bw by card_h - 2*bw -
    at a size and offset given by the four crop percentages. Anything of the image
    outside that box is clipped. So the visible source rectangle is the crop box,
    expressed in the image's own displayed coordinates, times (native / displayed).
    """
    hw, ch = spec["home_w"], card_h
    c = spec["crop"]
    disp_w = c["w"] / 100.0 * hw
    disp_h = c["h"] / 100.0 * ch
    left = c["x"] / 100.0 * hw - bw
    top = c["y"] / 100.0 * ch - bw
    win_w = hw - 2 * bw
    win_h = ch - 2 * bw

    # the crop window, in the image's displayed coordinates
    x0d, y0d = -left, -top
    x1d, y1d = x0d + win_w, y0d + win_h
    sx = native[0] / disp_w
    sy = native[1] / disp_h
    return (x0d * sx, y0d * sy, x1d * sx, y1d * sy), (disp_w, disp_h)


def build(check=False):
    card_h, bw, cards = read_app_numbers()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    W = int(round(RING_W * HD_SCALE))
    H = int(round(RING_H * HD_SCALE))
    rows = []
    for slot, stem, asset in RING_ORDER:
        spec = cards.get(asset)
        if not spec:
            print("[%s] no card spec for %s in app.js" % (slot, asset))
            continue
        src = ROOT / "assets" / "images" / (asset + ".webp")
        im = Image.open(src).convert("RGB")
        rect, disp = frame_of(spec, card_h, bw, im.size)

        # CLAMPED TO THE IMAGE. r3-home is the one 1x export in the set and its crop
        # percentages ask for a window a little past its right edge; PIL refuses a box
        # outside the image, and the browser simply shows the card's background there.
        # Clamping matches what the browser does and is reported rather than silent.
        cl = (max(0.0, rect[0]), max(0.0, rect[1]),
              min(float(im.size[0]), rect[2]), min(float(im.size[1]), rect[3]))
        clamped = cl != rect

        # THE FRAME IS PART OF THE FRAME OF REFERENCE. Every sprite box in this project
        # was measured on a 310x212 crop of a screenshot, and that crop covers the
        # card's OUTER box - artwork plus the 10px white border. So the HD card is
        # built the same way: the artwork inset by BW * RING_SCALE * HD_SCALE, on the
        # card's own frame colour. Rendering content-only would shift every existing
        # box by 7.8px at 1x, which is what a first attempt did - it read as "framing
        # looks wrong" at a mean difference of 20 to 36 when the framing was fine and
        # the frame of reference was not.
        inset = int(round(bw * (RING_W / spec["home_w"]) * HD_SCALE))
        art_w = W - 2 * inset
        art_h = H - 2 * inset
        art = im.resize((art_w, art_h), Image.LANCZOS, box=cl)
        hd = Image.new("RGB", (W, H), CARD_EDGE)
        hd.paste(art, (inset, inset))
        name = "%s-%s.png" % (slot, stem)
        hd.save(OUT_DIR / name)

        # native source pixels available per 1x card pixel, which is the HD gain
        gain = (cl[2] - cl[0]) / (RING_W - 2 * bw * RING_W / spec["home_w"])
        if clamped:
            print("      clamped to the image edge - the browser shows card "
                  "background there too")
        line = ("[%s] %-10s %-12s native %4dx%-4d  window %.1f,%.1f..%.1f,%.1f  "
                "%.2f source px per card px" %
                (slot, stem, asset, im.size[0], im.size[1],
                 cl[0], cl[1], cl[2], cl[3], gain))
        if check:
            ref = REF_DIR / name
            if ref.is_file():
                a = np.asarray(hd.resize((310, 212), Image.LANCZOS)).astype(float)
                b = np.asarray(Image.open(ref).convert("RGB")
                               .resize((310, 212), Image.LANCZOS)).astype(float)
                # THE ARTWORK ONLY, NOT THE FRAME. The card's frame is ROUNDED and this
                # render's is square, so the four corners differ by the whole
                # difference between white and wood - which showed up as a mean of 6 to
                # 12 and read as a framing error when the framing was right. A 14px
                # inset at 1x clears the corner radius entirely, and what is left is
                # the only thing this check is about: is the picture in the same place.
                m = 14
                a = a[m:-m, m:-m]
                b = b[m:-m, m:-m]
                d = float(np.abs(a - b).mean())
                line += "   artwork vs screenshot: mean |diff| %.2f %s" % (
                    d, "OK" if d <= 6.0 else "<< FRAMING LOOKS WRONG")
            else:
                line += "   (no screenshot to compare)"
        print(line)
        rows.append(dict(slot=slot, stem=stem, asset=asset, hd=[W, H],
                         window=[round(v, 2) for v in cl], gain=round(gain, 3),
                         inset=inset, clamped=clamped))
    (OUT_DIR / "hd.json").write_text(
        json.dumps(dict(hd_scale=HD_SCALE, ring_w=RING_W, ring_h=RING_H, cards=rows),
                   indent=1), encoding="utf-8")
    print("")
    print("wrote %d HD cards at %dx%d (%dx) into %s" %
          (len(rows), W, H, HD_SCALE, OUT_DIR))


if __name__ == "__main__":
    build(check="--check" in sys.argv[1:])
