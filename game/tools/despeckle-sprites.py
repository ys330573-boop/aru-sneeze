#!/usr/bin/env python3
"""Clear the loose specks out of a cut sprite's matte.

WHAT THIS FIXES, in the user's words: "the utensils are not cut perfectly as per
their shapes so untidy small cut parts are visible in this scene and others too."

They are, and they are countable. Every cut in assets/recap is a threshold on a
distance field, and a threshold picks up more than the element: on 09-sneeze-r4 the
matte holds FIVE pieces of steel - 18187, 4008, 3857, 3277 and 3185 px - and 106
fragments of 18 px and under. At rest they are invisible, because the patch under
them covers exactly the same footprint. The moment the sprite MOVES they slide off
their own patch and become 106 grey flecks drifting across the picture.

    02-sneeze     35 specks,  97 px   the lid
    04-ride       25 specks, 105 px   the bicycle
    09-sneeze-r4 106 specks, 387 px   the utensils

WHY IT IS SAFE TO JUST DELETE THEM. The patch is not touched, so where a speck was
the card shows the patch's inpainted background - which is what it shows at rest
already, and what it should show once the element has left. Nothing has to be
re-cut, no box changes, and the manifest is untouched.

WHY A SEPARATE TOOL AND NOT A FIX IN THE CUTTERS. Because it is not one cutter: the
three affected sprites come from tools/cut-recap-sprites.py, and the same threshold
shape will do it again to the next card. A guard that runs over the OUTPUT catches
every producer, and it prints what it removed so a speck that was actually a teaspoon
cannot vanish silently. If it ever reports removing a blob within about 10x of the
smallest real piece, look at the picture before believing it.

RUN IT
    python tools/despeckle-sprites.py            # every sprite, report only
    python tools/despeckle-sprites.py --write    # ...and rewrite the ones that need it
    python tools/despeckle-sprites.py --write 09-sneeze-r4
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "images"

# A BLOB UNDER THIS MANY PIXELS IS NOT AN ELEMENT. The smallest thing anybody has
# deliberately cut in this set is card 9's sixth tumbler at 3185 px and card 10's
# eye at 1055; the largest speck is 18. 200 sits two orders of magnitude clear of
# both, which is why one number can serve every card.
MIN_BLOB = 200
# Alpha at or under this is already invisible, so it does not count as coverage.
A_FLOOR = 40


def despeckle(path, write):
    im = Image.open(path).convert("RGBA")
    a = np.array(im)
    al = a[..., 3]
    solid = al > A_FLOOR
    lab, n = ndi.label(solid)
    if n == 0:
        return False
    sizes = ndi.sum(solid, lab, range(1, n + 1))
    drop = [i + 1 for i, s in enumerate(sizes) if s < MIN_BLOB]
    keep = [int(s) for s in sorted(sizes, reverse=True) if s >= MIN_BLOB]
    if not drop:
        print("%-24s %d blob(s), no specks" % (path.name, n))
        return False
    mask = np.isin(lab, drop)
    biggest = int(max(sizes[i - 1] for i in drop))
    print("%-24s kept %s   removed %d speck(s), %d px, biggest %d"
          % (path.name, keep[:6], len(drop), int(mask.sum()), biggest))
    if keep and biggest * 10 > min(keep):
        print("   << LOOK AT THE PICTURE: the biggest speck is within 10x of the "
              "smallest kept piece, so one of them is classified wrong")
    if not write:
        return True
    # ALPHA ONLY. The RGB under a speck is left alone: it is never composited again,
    # and zeroing it would make a future diff of these files unreadable.
    a[..., 3] = np.where(mask, 0, al)
    Image.fromarray(a).save(path)
    return True


def main():
    write = "--write" in sys.argv
    want = [x for x in sys.argv[1:] if not x.startswith("--")]
    files = sorted(OUT_DIR.glob("*-sprite.png"))
    if want:
        files = [f for f in files if any(w in f.name for w in want)]
    if not files:
        raise SystemExit("no sprites matched %s in %s" % (want, OUT_DIR))
    hit = sum(despeckle(f, write) for f in files)
    print("")
    print("%d of %d sprite(s) had specks%s" % (hit, len(files),
                                               "" if write else " - pass --write to fix"))


if __name__ == "__main__":
    main()
