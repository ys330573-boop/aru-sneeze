/* =============================================================================
   find-corner-flash.js — catch a ONE-FRAME apparition in the corner of the
   board during the ending.

       python tools/serve.py 8123           # in another terminal
       node tools/find-corner-flash.js 8123

   WHY THIS EXISTS, AND WHY sim.js CANNOT DO IT. The user reported that as Aaru
   falls from the rope "he appears at left top corner even for a milisecond".
   Every transform app.js wrote on every frame of that fall was correct - a rAF
   probe reading the DOM 60 times a second saw nothing wrong at all, four runs
   running. The frame that was wrong was the COMPOSITOR'S: he is a <video>, a
   video is composited as its own quad, and Chromium drew that quad without its
   render surface's transform for exactly one frame. That put a full-size Aaru at
   the element's own LAYOUT position - .entry sat at left:0/top:0 - and took him
   away again 16ms later.

   So the only witness is the screen. This drives the real game to the real
   ending over CDP, takes every frame the compositor produced, and looks for a
   patch that is in ONE frame and in neither of its neighbours:

       appeared = |N - prev| > INK  AND  |N - next| > INK  AND  |prev - next| < SAME

   THE CORNER IS THE REGION ON PURPOSE, and not only because that is where this
   one landed. A mis-drawn quad lands on its element's layout box, and the boxes
   of the things the ending animates are at or near the board's origin - .entry's
   was, and #finaleFall's still is, because both are placed from script. It is
   also the one part of the board where nothing legitimately moves while the
   ending runs: the banner is static, the rope and the hanging frames are below
   it, the tray and the cards are at the bottom. Scored over the whole board
   instead, this cried wolf on the haul and on the boy's own fall - both fast
   enough to leave one frame's worth of ink where their neighbours have none.
   Measured: the real flash fills a cell 0.60, those two fill 0.36 and 0.52.

   WHAT IT MEASURED, either side of the fix. Before: 4630 marked pixels, densest
   cell 0.60 full at board (320,0), 11.78s after the last card, on 4 runs out of
   4. After: .entry's box is parked one whole stage off the board - see the note
   on it in styles.css - so the same mis-draw puts him where .stage clips him.
   Clean on 4 runs out of 4.

   Exit code 1 when it finds one, and the frame is written to
   tools/_corner-flash.jpg so it can be looked at.
   ========================================================================== */

'use strict';

const fs   = require('fs');
const path = require('path');

const PORT = process.argv[2] || '8123';
const URL  = 'http://127.0.0.1:' + PORT + '/index.html?dev=1';

/* Frames are scored at a quarter of the stage, which is plenty: the sprite that
   was appearing is 480x323 board px, so 120x81 here, and a boy's worth of ink is
   thousands of pixels against a floor of a few hundred. */
const SHRINK = 4;
const W = 1920 / SHRINK, H = 1080 / SHRINK;

/* The corner, in BOARD pixels. It stops above the rope - its centreline is at
   y=251 and its twist scrolls all through the haul - and short of the first
   hanging frame, and it is wider than .entry's 480px box so a mis-draw cannot
   sit half outside it. */
const BOX = { x0: 0, y0: 0, x1: 620, y1: 240 };

const INK  = 26;     // grey levels that count as "something is drawn here"
const SAME = 12;     // ...and how alike the two neighbours have to be
const MIN  = 800;    // marked pixels before it is an apparition and not noise

/* AND IT HAS TO BE A SOLID PATCH, not a scatter, measured on ONE CELL of a grid
   rather than over a bounding box. Scored over a bounding box the real flash
   measured 0.12 and failed its own test: a handful of stray marked pixels
   anywhere else is enough to stretch that box and dilute whatever is inside it.
   A cell cannot be diluted by something that is not in it. */
const CELL = 40;     // px of the downscaled frame
const FILL = 0.35;   // of one cell, before it is a patch and not a smear

/* Long enough to cover the whole ending from the last card: the celebration is
   held out first (endingPauseMs), then the haul, the box, the ride, the fall and
   the landing. `node tools/sim.js finale` prints those beats if this ever needs
   to grow again. */
const WATCH_MS = 17000;

/* playwright is not a dependency of this repo - see the same note in
   run-bench.js, which this is copied from. */
function loadPlaywright() {
  const { execSync } = require('child_process');
  const tries = [];
  try {
    tries.push(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright'));
  } catch { /* npm not on PATH */ }
  const base = process.env.LOCALAPPDATA || process.env.HOME || '';
  const cache = path.join(base, 'npm-cache', '_npx');
  if (fs.existsSync(cache)) {
    for (const dir of fs.readdirSync(cache)) {
      tries.push(path.join(cache, dir, 'node_modules', 'playwright'));
    }
  }
  /* ...and the copy an agent runner leaves in TEMP, which is where it is on the
     machine this was written on. */
  const tmp = process.env.TEMP || process.env.TMP;
  if (tmp) tries.push(path.join(tmp, 'codex-playwright-runner', 'node_modules', 'playwright'));
  tries.push('playwright');
  for (const t of tries) {
    try { return require(t); } catch { /* next */ }
  }
  console.error('could not find the playwright module. Install it with:\n' +
                '    npm i -g playwright');
  process.exit(2);
}

/* THE LAST SCREEN'S ANSWER, read out of app.js rather than written down here.
   ROUNDS is not exposed to the page, and a copy of three card ids in a tool is a
   copy that goes stale the day the last screen changes. */
function lastOrder() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const all = src.match(/order:\s*\[[^\]]+\]/g) || [];
  if (!all.length) { console.error('no `order:` found in app.js'); process.exit(2); }
  return (all[all.length - 1].match(/'([^']+)'/g) || []).map(s => s.slice(1, -1));
}

(async () => {
  const { chromium } = loadPlaywright();
  const order = lastOrder();
  console.log('the last screen answers ' + order.join(' -> '));

  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  /* The stage is scaled to fit, so a 1920x1080 window puts board pixels and
     screen pixels one to one - which is what lets the numbers below be read as
     board coordinates. */
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', err => console.error('  ! page error: ' + err.message));

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#play');
  await page.click('#play');
  await page.waitForTimeout(3500);            // the opening haul and the deal

  /* ?dev=1's skip button, one screen a click, as many clicks as it takes to
     reach the LAST screen - which is where the ending this tool photographs
     begins. Read off the page rather than hard-coded: it was 3, for four
     screens, and the line now carries pictures across a seam so there are six.
     A stale count here does not fail, it just parks the camera in the middle of
     the game and photographs nothing. */
  const screens = await page.evaluate(() => ROUNDS.length);
  for (let i = 0; i < screens - 1; i++) {
    await page.click('#devSkip');
    await page.waitForTimeout(3200);
  }

  /* THE SCORER LIVES IN A SECOND PAGE, and that page is the JPEG decoder as
     well: no image library is needed anywhere. It holds three greyscale frames
     at a time, so a 500-frame ending costs three arrays and not five hundred. */
  const judge = await browser.newPage();
  await judge.setContent('<canvas id=c></canvas>');
  await judge.evaluate(({ w, h }) => {
    const c = document.getElementById('c');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    window.__buf = [];
    window.__hits = [];
    window.__worst = { fill: 0, idx: -1, t: -1 };
    window.__push = async (b64, idx, t, k) => {
      const img = new Image();
      img.src = 'data:image/jpeg;base64,' + b64;
      await img.decode();
      g.drawImage(img, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      const grey = new Uint8Array(w * h);
      for (let i = 0, p = 0; i < grey.length; i++, p += 4) {
        grey[i] = (d[p] * 77 + d[p + 1] * 151 + d[p + 2] * 28) >> 8;
      }
      window.__buf.push({ grey, idx, t });
      if (window.__buf.length > 3) window.__buf.shift();
      if (window.__buf.length < 3) return;

      const [a, b, cc] = window.__buf;
      const cols = Math.ceil((k.x1 - k.x0) / k.cell);
      const cells = new Int32Array(cols * Math.ceil((k.y1 - k.y0) / k.cell));
      let n = 0;
      for (let y = k.y0; y < k.y1; y++) {
        for (let x = k.x0; x < k.x1; x++) {
          const i = y * w + x;
          const pa = a.grey[i], pb = b.grey[i], pc = cc.grey[i];
          if (Math.abs(pb - pa) > k.ink && Math.abs(pb - pc) > k.ink &&
              Math.abs(pa - pc) < k.same) {
            n++;
            cells[(((y - k.y0) / k.cell) | 0) * cols + (((x - k.x0) / k.cell) | 0)]++;
          }
        }
      }
      /* The densest cell, and where it is: that is the patch. */
      let top = 0, at = 0;
      for (let i = 0; i < cells.length; i++) if (cells[i] > top) { top = cells[i]; at = i; }
      const row = { idx: b.idx, t: b.t, n, fill: +(top / (k.cell * k.cell)).toFixed(2),
                    cx: k.x0 + (at % cols) * k.cell,
                    cy: k.y0 + ((at / cols) | 0) * k.cell };
      if (row.fill > window.__worst.fill) window.__worst = row;
      if (n >= k.min && row.fill >= k.fill) window.__hits.push(row);
    };
  }, { w: W, h: H });

  const K = {
    ink: INK, same: SAME, min: MIN, cell: CELL, fill: FILL,
    x0: Math.round(BOX.x0 / SHRINK), y0: Math.round(BOX.y0 / SHRINK),
    x1: Math.round(BOX.x1 / SHRINK), y1: Math.round(BOX.y1 / SHRINK),
  };

  /* Every frame the compositor produced, in order, handed straight to the
     scorer. Ack'ing per frame is what keeps them coming. */
  const client = await page.context().newCDPSession(page);
  const raw = new Map();
  let count = 0, t0 = 0, stopped = false, pending = Promise.resolve();
  client.on('Page.screencastFrame', (ev) => {
    const idx = count++;
    if (!t0) t0 = ev.metadata.timestamp;
    const t = Math.round((ev.metadata.timestamp - t0) * 1000);
    raw.set(idx, ev.data);
    if (!stopped) {
      pending = pending
        .then(() => judge.evaluate(({ b64, idx, t, k }) => window.__push(b64, idx, t, k),
                                   { b64: ev.data, idx, t, k: K }))
        /* The cast can outlive the judge by a frame on the way out, and a frame
           dropped at that point is not a result. */
        .catch(() => { /* the judge is gone */ });
    }
    client.send('Page.screencastFrameAck', { sessionId: ev.sessionId })
          .catch(() => { /* already stopped */ });
  });

  /* Answer the last screen. Keyboard-then-click is the tap-to-place path: focus
     a card, Enter to pick it up, click the frame it belongs in. */
  for (let i = 0; i < order.length; i++) {
    await page.focus('.card[data-card="' + order[i] + '"]');
    await page.keyboard.press('Enter');
    await page.click('.slot[data-slot="' + i + '"]');
    if (i < order.length - 1) await page.waitForTimeout(1200);
  }

  await client.send('Page.startScreencast', {
    format: 'jpeg', quality: 70, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1,
  });
  console.log('watching board (%d,%d)..(%d,%d) for %ds...',
              BOX.x0, BOX.y0, BOX.x1, BOX.y1, WATCH_MS / 1000);
  await page.waitForTimeout(WATCH_MS);
  await client.send('Page.stopScreencast');
  stopped = true;
  await pending;

  const hits  = await judge.evaluate(() => window.__hits);
  const worst = await judge.evaluate(() => window.__worst);
  console.log('%d frames scored; the fullest cell in the whole run was %s%s',
              count, worst.fill.toFixed(2),
              worst.idx < 0 ? '  (nothing was ever marked)'
                            : '  (frame ' + worst.idx + ', t=' + worst.t + 'ms)');

  /* DID THE ENDING ACTUALLY HAPPEN? A window that stops short of the fall
     reports a clean corner for the same reason an empty room is quiet, and this
     is a regression gate: it has to fail loudly rather than pass by accident.
     The snap is the last beat of the finale and it is HELD, so it is still on
     screen whenever the fall has finished - see finaleLanding(). */
  const ran = await page.evaluate(() => {
    const s = document.getElementById('finaleSnap');
    const l = document.getElementById('finaleLand');
    return !!((s && s.classList.contains('is-on')) ||
              (l && l.classList.contains('is-on')));
  });
  if (!ran) {
    console.error('FAILED: the fall never finished inside ' + (WATCH_MS / 1000) +
                  's, so the corner was never at risk. Raise WATCH_MS - ' +
                  '`node tools/sim.js finale` prints where the beats are now.');
    await browser.close();
    process.exit(2);
  }

  if (!hits.length) {
    console.log('\nno one-frame apparitions in the corner - nothing was drawn ' +
                'there for a single frame and then gone.');
    await browser.close();
    return;
  }

  hits.sort((a, b) => b.fill - a.fill);
  console.log('\n%d ONE-FRAME APPARITION(S) IN THE CORNER:', hits.length);
  hits.slice(0, 8).forEach(h => console.log(
    '   frame %d  t=%dms  %d px marked, densest cell %s full at board (%d,%d)',
    h.idx, h.t, h.n, h.fill, h.cx * SHRINK, h.cy * SHRINK));

  const out = path.join(__dirname, '_corner-flash.jpg');
  fs.writeFileSync(out, Buffer.from(raw.get(hits[0].idx), 'base64'));
  console.log('\nthe worst one is written to %s - look at it.', out);
  console.log('A boy-sized Aaru across the banner is the mis-draw this tool is ' +
              'named for: something animated is being composited at its layout ' +
              'box. See the note on .entry in styles.css.');

  await browser.close();
  process.exitCode = 1;
})().catch((err) => {
  console.error('run failed: ' + (err && err.stack || err));
  process.exit(2);
});
