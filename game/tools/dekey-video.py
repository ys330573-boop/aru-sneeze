#!/usr/bin/env python3
"""Turn the supplied celebration clip into a smooth WebM with a real alpha
channel.

    python tools/dekey-video.py

    in:  assets/_source/correct_ans.mp4     (supplied, untouched)
    out: assets/video/correct_ans.webm       (what the game plays)

Three problems, and they are independent of each other.


1. THERE IS NO ALPHA, THERE IS A PICTURE OF ALPHA
-------------------------------------------------
The clip was exported with the editor's transparency checkerboard rendered into
the pixels: achromatic, sweeping between luma 180 and 220, on a period measured
by autocorrelation at exactly 32x32, with the ramps smeared over about 12px by
the h264 encode. So the alpha has to be reconstructed. Two tests, unioned:

  BORDER-CONNECTED. Mark everything that looks like background - achromatic and
  mid-luma - then keep only the part of it reachable from the frame edge. This
  is what protects the boy: his shirt has white stripes and his eyes have
  whites, and a plain colour key punches holes straight through them. He is
  drawn with a closed dark outline, so nothing inside him connects to the edge.

  PATTERN-MATCHED. The checkerboard does not move and does not change between
  frames, so it can be modelled once as a 32x32 tile fitted from every
  known-background pixel of every frame. All 1024 cells land upwards of 10,000
  samples, and the model then predicts known background to a median residual of
  0.31. Anything matching that model within RESID_T, and achromatic, is
  background wherever it happens to be.

  The second test exists because the first has a blind spot, and it showed. When
  his legs or flip-flops close the gap between them - frames 6, 23 and 24 - the
  background in that gap stops being reachable from the border, so connectivity
  alone keeps it OPAQUE, and about 6,900 pixels of checkerboard sit on his legs
  for a fifth of a second. Pattern matching catches those pockets. Measured over
  the whole clip, adding it turns 19,057 extra pixels transparent, every one of
  them inside those three frames, and touches 9 pixels anywhere else - so it
  fixes the legs without undoing the stripe protection.

Then the fringe is un-mixed. An anti-aliased edge pixel is a blend of boy and
grey checker; left alone it haloes against the game's wood. With alpha known and
the local background estimated from nearby background pixels only, the boy's own
colour comes back out: F = (C - (1-a)*B) / a.


2. IT IS NOT SMOOTH, AND INTERPOLATION IS NOT WORTH THE DAMAGE
--------------------------------------------------------------
Measured in Chrome first, because fixing the wrong thing would have been easy:
the browser presents every frame with ZERO dropped and a frame gap holding to
within 0.1ms of the ideal, with or without the CSS transform running over it.
Playback was never the problem.

The clip is 12fps and it SNAPS between poses. Consecutive frames differ by
between 7 and 50 (mean 27.6), alternating small and large, with alpha changing
by up to 56 on the jumps - the whole silhouette moves, not just the hands. The
only way to smooth that is to invent frames, and inventing frames was tried
properly before being abandoned. What it cost:

  Interpolator chosen by holding frames out - feed a method only the even frames
  at half rate, ask for full rate back, score what it invented against the odd
  frames it never saw. mci with scd=none won (silhouette error 17.2 against 27.4
  for no interpolation). scd matters enormously: it defaults to a threshold of
  10 and this clip's frames differ by 7 to 50, so by default every large jump
  was treated as a cut and duplicated instead of interpolated.

  But mci mangles the clasped hands. They are the fastest thing in the clip, and
  the invented frames turn them into a smeared double image of overlapping
  fingers. At ratio 2 that is half of all frames.

So INTERPOLATION IS OFF: ratio 1, and minterpolate is skipped rather than run as
a no-op, so every frame is provably the source's own rather than a re-render.

TO TURN IT BACK ON, set OUT_FPS = 20 with TARGET_SECONDS = 3.6 (ratio 2). Two
rules constrain any such choice and breaking either one is what produced the two
worst versions of this file:

  OUT_FPS MUST DIVIDE THE DISPLAY REFRESH. A rate that does not cannot be
  presented evenly - the compositor holds some frames longer than others and it
  reads as judder even though nothing is dropped. Measured at 24fps on a 59.9Hz
  screen: of 72 gaps, 35 were three refreshes and 33 were two. That is 3:2
  pulldown, and it was worse than the snapping it was meant to fix. 10, 15, 20
  and 30 all divide 60; 15 and 30 also divide 90; all of them divide 120. 24
  divides none of them.

  OUT_FPS / in_fps MUST BE A WHOLE NUMBER. At a fractional ratio no output frame
  lands on a source frame's timestamp, so minterpolate re-synthesises EVERY
  frame instead of letting the real ones through. Measured at ratio 3.5: 110 of
  120 frames were blends and detail (Laplacian variance) fell from 1263 to 803.
  At a whole ratio, 35 of the 36 source frames come through bit-identical.
  main() enforces this.


3. IT IS TOO FAST
-----------------
Handled in the same pass as the smoothing, by feeding the source frames in
slower than they were shot and letting the interpolator fill up to OUT_FPS.
TARGET_SECONDS is the only knob: raise it and the clip lengthens while the
interpolator invents proportionally more frames to cover it. Nothing in app.js
needs changing, because the round advances off the video's own `ended` event.


WHY OUT_FPS IS 30 AND NOT 24
----------------------------
Do not "optimise" this to 24. A frame rate that does not divide the display's
refresh rate cannot be presented evenly: the compositor has to hold some frames
longer than others, and the unevenness reads as judder even though no frame is
dropped.

Measured on a 59.9Hz screen at 24fps, which needs 2.5 refreshes per frame: of 72
gaps, 35 were three refreshes long and 33 were two. That is 3:2 pulldown, and it
was worse than the problem it was meant to fix - the ORIGINAL 12fps clip divided
60 exactly five ways and so had no judder at all, only snapping poses.

30 divides 60 (by 2), 90 (by 3) and 120 (by 4), so it is even on every panel a
tablet is likely to have. 24 divides none of them. 20 would also be even at
60Hz but not at 90.


ENCODING NOTES, all learned the hard way
----------------------------------------
  -auto-alt-ref 0 is REQUIRED. libvpx will not carry alpha with alternate
  reference frames on, and it fails silently: clean opaque video, no warning.

  ffprobe will report `yuv420p`, and ffmpeg's own decoder will hand back fully
  opaque frames. Neither means the alpha is missing - in WebM it rides in a
  separate BlockAdditional track that those paths ignore. Chrome reads it
  correctly. Verify in a browser over a colour that would show a halo, never in
  ffprobe.

  VP9 beat the alternatives on this clip: VP9 crf36 352KB at 4.7/255 mean error,
  VP8 611KB at 5.3 (its -crf is ignored by this libvpx build, so it could not be
  pushed smaller), animated WebP q85 1126KB at 3.3.

  Re-running does NOT give a byte-identical file: -row-mt splits the frame
  across threads and the result depends on how they interleave. The keying and
  the interpolation are both deterministic, so it is the same take at the same
  quality - but the checksum moves, and the file will show as changed in version
  control after every run whether or not anything about it changed.
"""

import os
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'assets', '_source', 'correct_ans.mp4')
OUT = os.path.join(ROOT, 'assets', 'video', 'correct_ans.webm')
WORK = os.path.join(ROOT, 'tools', '_dekey_work')

PERIOD = 32               # checkerboard period, measured by autocorrelation
RESID_T = 12.0            # pattern match tolerance; known bg sits at p99 = 10.1
CHROMA_T = 18             # how achromatic a pixel must be to count as background
LUMA_LO, LUMA_HI = 168, 234
BAND = 2                  # px of uncertain edge to solve alpha over
EXTEND = 10               # px the boy's colour is carried out past his edge
FEATHER = 0.35            # px, a whisker of smoothing on the solved alpha

# Slowing this down means lowering OUT_FPS, because interpolation is off and
# there are only ever 36 frames: duration = 36 / OUT_FPS. And OUT_FPS has to
# divide the refresh rate, so the reachable durations are quantised to
# 36 * k / 60 = 0.6k seconds - 3.0, 3.6, 4.2, 4.8 and so on. Nothing between.
#
#   k=6   10 fps     3.6s   even at 60, 90 and 120
#   k=7   8.571 fps  4.2s   even at 60 and 120, NOT 90
#   k=8   7.5 fps    4.8s   even at 60 (8), 90 (12) and 120 (16)
#   k=10  6 fps      6.0s   even everywhere, but a slideshow
#
# 4.8s is where it is set: 14% slower than 4.2 and 60% slower than the source,
# and it is also the more robust cadence of the two - 7.5 divides all three
# common refresh rates where 8.571 misses 90.
#
# THIS IS THE LAST COMFORTABLE STEP DOWN. Each pose is now held 133ms against
# 117ms at 4.2s; the next rung, 6fps, holds each for 167ms and reads as a
# slideshow rather than as animation. And slower cannot be traded for smoother
# here, because smoother would mean inventing frames - see the section above for
# why that was tried and abandoned.
TARGET_SECONDS = 4.8
OUT_FPS = 7.5             # 36 frames / 4.8s = 8 refreshes at 60Hz
MI = 'minterpolate=fps=%d:mi_mode=mci:mc_mode=aobmc:scd=none' % OUT_FPS

# With interpolation off there are 36 frames instead of 69, so the bytes saved go
# back into quality. Swept earlier on the interpolated sequence: crf 40 gave
# 5.20/255 error, 44 gave 5.78, 48 gave 6.47, 52 gave 7.23. At 36 frames crf 30
# lands at ~670 KB, which is affordable, and this clip is the reward moment - it
# is the wrong place to save a couple of hundred kilobytes.
CRF = 30
PAD = 4


def run(*args):
    """ffmpeg, retried once.

    One of these passes segfaulted mid-build exactly once (exit 0xC0000005 on
    the alpha interpolation) and has not reproduced since - the paths here are
    inside a OneDrive folder, so a sync client touching a file it is reading is
    the likely cause. The passes are all pure functions of their inputs, so
    retrying is safe, and a silent half-written sequence would be caught by the
    frame-count check after the interpolation either way.
    """
    args = [a for a in args]
    try:
        subprocess.run(args, check=True)
    except subprocess.CalledProcessError as first:
        print('   ffmpeg failed (%s), retrying once' % first.returncode)
        subprocess.run(args, check=True)


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


def main():
    if not os.path.exists(SRC):
        sys.exit('missing source: ' + SRC)
    shutil.rmtree(WORK, ignore_errors=True)
    for d in ('raw', 'pre', 'alp', 'ipre', 'ialp', 'rgba'):
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
    for a in frames:
        bg, _ = border_background(a)
        np.add.at(acc_s, (ty[bg], tx[bg]), a[bg])
        np.add.at(acc_n, (ty[bg], tx[bg]), 1)
    if (acc_n == 0).any():
        sys.exit('tile underdetermined: %d cells had no samples' % int((acc_n == 0).sum()))
    model = (acc_s / acc_n[..., None])[ty, tx]
    print('   min %d samples per cell' % int(acc_n.min()))

    print('3. keying')
    alphas, rgbs, pocket_px = [], [], 0
    for a in frames:
        bg, chroma = border_background(a)
        pattern = (np.abs(a - model).mean(axis=2) < RESID_T) & (chroma < CHROMA_T)
        pocket_px += int((pattern & ~bg).sum())
        boy = ~(bg | pattern)

        # The confident interior. Eroded by one pixel because the chroma test
        # cannot recognise a mostly-background edge pixel as background - it
        # carries too much of the boy's colour - so `boy` reaches one pixel too
        # far out, and that pixel is mostly grey.
        interior = ndimage.binary_erosion(boy, iterations=1, border_value=0)
        if not interior.any():
            interior = boy

        # His own colour, extended outward over the whole frame from the nearest
        # interior pixel. This is what gets written into the transparent region
        # instead of black, so the interpolator has nothing dark to drag into the
        # edge and no un-premultiply is needed afterwards.
        dist, (iy, ix) = ndimage.distance_transform_edt(~interior, return_indices=True)
        extended = a[iy, ix].astype(float)
        # Only the band near him needs his colour; carrying it across the whole
        # frame costs real bytes, because every one of those pixels is different.
        # Past EXTEND it goes flat, which VP9 encodes for almost nothing, and it
        # is fully transparent there so nothing can see it.
        far = dist > EXTEND
        if far.any() and interior.any():
            extended[far] = a[interior].mean(axis=0)

        # Solve alpha over the uncertain band. The background is known exactly,
        # so C = alpha*F + (1-alpha)*B has one unknown left once F is estimated.
        near = ndimage.binary_dilation(interior, iterations=BAND, border_value=0)
        band = near & ~interior
        d = extended - model
        den = (d * d).sum(axis=2)
        num = ((a - model) * d).sum(axis=2)
        # where the boy's colour is too close to the background to separate them,
        # den is tiny and the projection is meaningless; fall back to opaque.
        solved = np.where(den > 64, num / np.maximum(den, 1e-6), 1.0)

        alpha = np.zeros(a.shape[:2])
        alpha[interior] = 1.0
        alpha[band] = np.clip(solved[band], 0.0, 1.0)
        if FEATHER:
            alpha = ndimage.gaussian_filter(alpha, FEATHER)
        alpha[interior] = 1.0

        alphas.append(np.clip(alpha, 0.0, 1.0))
        rgbs.append(extended)
    print('   pattern match caught %d px connectivity could not reach' % pocket_px)

    alphas = np.array(alphas)
    solid = (alphas > 0.02).any(axis=0)
    yy, xx = np.where(solid)
    y0, y1 = max(0, yy.min() - PAD), min(H, yy.max() + 1 + PAD)
    x0, x1 = max(0, xx.min() - PAD), min(W, xx.max() + 1 + PAD)
    if (y1 - y0) % 2:
        y1 = y1 + 1 if y1 < H else y1 - 1
    if (x1 - x0) % 2:
        x1 = x1 + 1 if x1 < W else x1 - 1
    print('   cropped to %dx%d' % (x1 - x0, y1 - y0))

    # RGB and alpha, NOT premultiplied. The colour is extended everywhere, so
    # there is no undefined region for the interpolator to smear inward.
    for i in range(len(frames)):
        Image.fromarray(np.round(rgbs[i][y0:y1, x0:x1]).astype(np.uint8), 'RGB').save(
            os.path.join(WORK, 'pre', 'p%03d.png' % i))
        Image.fromarray(np.round(alphas[i][y0:y1, x0:x1] * 255).astype(np.uint8), 'L').save(
            os.path.join(WORK, 'alp', 'a%03d.png' % i))

    in_fps = len(frames) / float(TARGET_SECONDS)
    ratio = OUT_FPS / in_fps
    if abs(ratio - round(ratio)) > 1e-6:
        sys.exit(
            "OUT_FPS / in_fps must be a whole number, and it is %.4f.\n"
            "\n"
            "This is not a nicety. At a fractional ratio no output frame lands on a\n"
            "source frame's timestamp, so minterpolate re-synthesises EVERY frame\n"
            "instead of letting the real ones through, and the whole clip comes out\n"
            "soft. Measured: at ratio 3.5, 110 of 120 output frames were blends and\n"
            "detail (Laplacian variance) fell from 1263 to 803. At ratio 2, 35 of the\n"
            "36 source frames come through bit-identical at 1262.\n"
            "\n"
            "Pick TARGET_SECONDS = frames * whole_ratio / OUT_FPS. With %d frames at\n"
            "%d fps that is %.2fs (ratio %d) or %.2fs (ratio %d)."
            % (ratio, len(frames), OUT_FPS,
               len(frames) * max(1, int(ratio)) / float(OUT_FPS), max(1, int(ratio)),
               len(frames) * (int(ratio) + 1) / float(OUT_FPS), int(ratio) + 1))
    ratio = int(round(ratio))
    if ratio == 1:
        print('4. no interpolation (ratio 1): %d frames at %.3f fps = %.2fs'
              % (len(frames), OUT_FPS, len(frames) / float(OUT_FPS)))
        print('   every frame is the source\'s own, untouched')
        for i in range(len(frames)):
            shutil.copyfile(os.path.join(WORK, 'pre', 'p%03d.png' % i),
                            os.path.join(WORK, 'ipre', 'o%03d.png' % i))
            shutil.copyfile(os.path.join(WORK, 'alp', 'a%03d.png' % i),
                            os.path.join(WORK, 'ialp', 'o%03d.png' % i))
    else:
        print('4. interpolating: %d frames fed at %.3f fps -> %.3f fps (ratio %d, %.2fs)'
              % (len(frames), in_fps, OUT_FPS, ratio, TARGET_SECONDS))
        print('   %d frames pass through untouched, %d invented between them'
              % (len(frames), len(frames) * (ratio - 1)))
        for kind, src_dir, dst_dir, extra in (
                ('p', 'pre', 'ipre', []),
                ('a', 'alp', 'ialp', ['-pix_fmt', 'gray'])):
            run('ffmpeg', '-v', 'error', '-framerate', '%.6f' % in_fps,
                '-i', os.path.join(WORK, src_dir, kind + '%03d.png'),
                '-vf', MI, '-fps_mode', 'passthrough', *extra,
                os.path.join(WORK, dst_dir, 'o%03d.png'), '-y')
    ip = sorted(os.listdir(os.path.join(WORK, 'ipre')))
    ia = sorted(os.listdir(os.path.join(WORK, 'ialp')))
    if len(ip) != len(ia):
        sys.exit('rgb/alpha desync: %d vs %d frames' % (len(ip), len(ia)))
    print('   %d frames out = %.2fs at %.3f fps' % (len(ip), len(ip) / float(OUT_FPS), OUT_FPS))

    print('5. recombining')
    for i in range(len(ip)):
        rgb = np.asarray(Image.open(os.path.join(WORK, 'ipre', ip[i])).convert('RGB'))
        a = np.asarray(Image.open(os.path.join(WORK, 'ialp', ia[i])).convert('L'))
        out = np.dstack([rgb, a]).astype(np.uint8)
        Image.fromarray(out, 'RGBA').save(os.path.join(WORK, 'rgba', 'k%04d.png' % i))

    print('6. encoding VP9 + alpha at crf %d' % CRF)
    run('ffmpeg', '-v', 'error', '-framerate', '%.6f' % OUT_FPS,
        '-i', os.path.join(WORK, 'rgba', 'k%04d.png'),
        '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p',
        '-auto-alt-ref', '0',                 # without this the alpha is dropped
        '-b:v', '0', '-crf', str(CRF), '-row-mt', '1',
        OUT, '-y')

    # DEKEY_KEEP=1 leaves the intermediates on disk, which is how the shipped
    # frames get checked for leftover checkerboard and how CRF gets swept
    # without paying for the keying again.
    if os.environ.get('DEKEY_KEEP'):
        print('   (DEKEY_KEEP set: intermediates left in %s)' % os.path.relpath(WORK, ROOT))
    else:
        shutil.rmtree(WORK, ignore_errors=True)
        if os.path.isdir(WORK):
            print('   (left %s behind; something has it open)' % os.path.relpath(WORK, ROOT))

    print()
    print('wrote %s  (%.0f KB, %.2fs, %.3f fps)'
          % (os.path.relpath(OUT, ROOT), os.path.getsize(OUT) / 1024.0,
             len(ip) / float(OUT_FPS), OUT_FPS))
    print('check it in a browser over a coloured background - ffprobe will report')
    print('no alpha even when the alpha is there.')


if __name__ == '__main__':
    main()
