#!/usr/bin/env python3
"""Re-export a round card's webp from the full-resolution Figma export.

WHY
    assets/images/*.webp are about 918px wide. The post-game pops a card to three
    times ring size, which draws that image 1132px wide - a 1.23x upscale of a
    lossy file, and it is visible: "when the 1st scene comes its image quality is
    too bad".

    output/figma-exact-10/scene-NN.png is the SAME artwork at 1919x1080. Downsampled
    to a common size the two agree to 1.3/255, and the next-nearest scene is 51/255
    away, so the match is not a guess. That is 2.09x the linear resolution, which
    turns the pop's 1.23x upscale into a 0.6x downscale - i.e. into detail the
    browser can throw away rather than invent.

WHAT IT DOES NOT DO, and this is the whole safety argument
    IT DOES NOT RE-FRAME ANYTHING. app.js positions each card's artwork with four
    hand-placed percentages of the card's own box, and those are only valid for the
    aspect ratio they were measured against - r1-house is 918x517, i.e. 1.77563,
    while the export is 1919x1080, i.e. 1.77685. A tenth of a percent, but the whole
    point of this file is that nobody has to re-measure anything, so the export is
    resized to EXACTLY 2x the current file's pixel dimensions rather than to its own.
    The aspect is then bit-identical to what the crop percentages were measured on,
    and every number in ROUNDS, in SCENE_FX, in assets/images/recap-manifest.json and in the
    sprite cutter keeps meaning what it meant.

    IT DOES NOT GUESS THE PAIRING. The export is chosen by image similarity against
    the file being replaced, and the run fails if the best match is not clearly
    better than the second best.

    IT DOES NOT TOUCH THE OTHER TEN CARDS unless you name them. Only the two the
    post-game currently brings alive have been checked on screen.

VERIFYING IT
    The residual against the original, downsampled to a common size, is printed. It
    is the same picture or it is not: anything over about 3/255 means the export is
    a different render and the crop percentages may no longer frame it.

RUN IT
    python tools/upres-round-cards.py                # the two live post-game cards
    python tools/upres-round-cards.py r3-dog         # or name your own
    python tools/upres-round-cards.py --all          # every round card with a match

    Bump BUILD in app.js afterwards, and the ?v= tokens in index.html AND styles.css
    with it, or the browser keeps serving the old bytes.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ROUNDS = ROOT / "assets" / "images"
EXPORTS = ROOT / "output" / "figma-exact-10"

# The two cards the post-game animates today. Everything else is opt-in.
DEFAULT = ["r1-house", "r1-sneeze"]

SCALE = 2          # exactly 2x the current pixels - see the docstring
QUALITY = 92       # webp; the originals are around 80 and it shows on the plaster
MATCH_TOL = 3.0    # mean |diff| over a 320x180 downsample, in 0..255
MATCH_MARGIN = 4.0  # the runner-up has to be at least this much worse


def thumb(im):
    return np.asarray(im.convert("RGB").resize((320, 180), Image.LANCZOS), float)


def best_export(cur):
    """The scene-NN.png that IS this card, or a SystemExit saying why not."""
    a = thumb(cur)
    scored = sorted((float(np.abs(a - thumb(Image.open(p))).mean()), p)
                    for p in sorted(EXPORTS.glob("scene-*.png")))
    if not scored:
        raise SystemExit("no exports in %s" % EXPORTS)
    (d0, p0), (d1, _) = scored[0], scored[1]
    if d0 > MATCH_TOL:
        raise SystemExit("closest export is %.1f/255 away (limit %.1f) - not the "
                         "same picture" % (d0, MATCH_TOL))
    if d1 - d0 < MATCH_MARGIN:
        raise SystemExit("two exports are equally close (%.1f and %.1f) - ambiguous"
                         % (d0, d1))
    return p0, d0, d1


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    names = (sorted(p.stem for p in ROUNDS.glob("*.webp")) if "--all" in sys.argv
             else (args or DEFAULT))
    for name in names:
        dst = ROUNDS / (name + ".webp")
        if not dst.is_file():
            print("%-12s no such card" % name)
            continue
        cur = Image.open(dst)
        w, h = cur.size
        try:
            src, d0, d1 = best_export(cur)
        except SystemExit as e:
            print("%-12s SKIPPED - %s" % (name, e))
            continue

        big = Image.open(src).convert("RGB").resize((w * SCALE, h * SCALE),
                                                    Image.LANCZOS)
        before = dst.stat().st_size
        big.save(dst, "WEBP", quality=QUALITY, method=6)

        # The proof: the file that is now on disk is still the same picture.
        resid = float(np.abs(thumb(cur) - thumb(Image.open(dst))).mean())
        print("%-12s %s -> %s from %s   match %.2f (next %.1f)   "
              "residual %.2f/255   %.0fKB -> %.0fKB"
              % (name, (w, h), big.size, src.name, d0, d1, resid,
                 before / 1024, dst.stat().st_size / 1024))
        if resid > MATCH_TOL:
            print("             ^^ RESIDUAL IS HIGH - check the framing before you "
                  "ship this")


if __name__ == "__main__":
    main()
