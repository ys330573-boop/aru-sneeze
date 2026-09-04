/* Run app.js in Node, on a virtual clock, and print every sound it makes.
 *
 *   node tools/sim.js post          the post-game recap, on its own
 *   node tools/sim.js idle          press play, then never touch it
 *   node tools/sim.js play 8000     play all four screens, 8s a card
 *   node tools/sim.js wrong         three wrong answers, then the right one
 *   node tools/sim.js stall         guess wrong, then stop touching it
 *   node tools/sim.js hints         wrong twice at every position, every hint
 *   node tools/sim.js skip          the ?dev=1 button, mid-sentence
 *   node tools/sim.js last          all four screens, then the finale
 *
 *   --novo   fail every voiceover fetch, which is what file:// does to them
 *   --video  give <video> a real duration and a currentTime that runs on the
 *            virtual clock, so playCelebration takes its VIDEO path instead of
 *            bailing. It runs 4x a game and nothing covered it before this.
 *   --still  report prefers-reduced-motion: reduce, which is the branch a child
 *            with that setting on actually gets. Six of them in app.js, and
 *            nothing ran any of them until this flag existed.
 *   --dev    as if ?dev=1 were in the URL (implied by `skip`)
 *
 * WHY THIS EXISTS. The narration is almost entirely a question of TIMING - what
 * gets said, in what order, and what interrupts what - and none of that can be
 * read off the source. Nor is it something a browser shows you: you would have
 * to sit through it in real time, repeatedly, and a nine-second idle repeat
 * takes nine seconds to observe once. Here a minute of gameplay is a
 * millisecond, and the output is a list of every sound with a timestamp.
 *
 * It loads the SHIPPED app.js, not a copy of it, so what it reports is what the
 * game does. The fakes cover the browser, not the thing under test: timers and
 * the audio clock are virtual so they can be stepped, fetch reads the real
 * files off disk (which is also what proves the %20 paths resolve), and every
 * buffer carries the duration parsed out of its own header, so a line occupies
 * exactly as much time here as it does in a browser.
 *
 * Two deliberate simplifications, both of which make it a harsher test than the
 * real thing rather than a softer one:
 *   - canPlayType returns '' (and the alpha probe has no canvas to measure, so it
 *     settles on "no"), so playCelebration takes its cannot-show path and
 *     calls done() at once. Screens change ~5s sooner than they really do,
 *     which gives a line still in the air LESS room, not more.
 *   - Placement goes through tryPlace() rather than through pointer events, so
 *     the drag itself is not exercised. resetIdle's drag guard is.
 *
 * It found one real bug, which is what it was written for: chained behind the
 * second praise line, dialogue 29 was never heard at any realistic playing
 * speed, because a child placing the third card dropped it. See finishRound.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');   /* the project, from tools/ */

const ARGV = process.argv.slice(2);
const NOVO = ARGV.indexOf('--novo') !== -1;
const STILL = ARGV.indexOf('--still') !== -1;
const VIDEO = ARGV.indexOf('--video') !== -1;

/* Real clip lengths, measured rather than assumed - the numbers the browser
   would report for `duration`:
     ffprobe -v error -select_streams v:0 -count_frames -show_entries
             stream=nb_read_frames,r_frame_rate assets/images/<clip>.webm
   correct_ans.webm  36 frames @ 15/2 fps = 4.800s
   entry.webm        36 frames @ 10/1 fps = 3.600s
   Re-measure if either clip is re-rendered; playCelebration derives its lean
   cues from whatever duration it is given, so a wrong one here would test the
   wrong timings and look like it passed. */
const CLIP_S = { celebrate: 4.8, entry: 3.6 };
const ARGS = ARGV.filter(a => a.charAt(0) !== '-');
const DEV = ARGV.indexOf('--dev') !== -1 || ARGS[0] === 'skip';

/* WHICH ARRANGEMENT OF THE TRAY THIS RUN PLAYS. buildRound() shuffles the three
   cards through a seeded PRNG (see shuffleTray in app.js), off Date.now() in a
   real game - so without a fixed seed here no two runs of this harness would
   deal the same board and nothing in it could be compared run to run.

   1 IS THE DEFAULT AND EVERY MEASUREMENT IN THIS FILE WAS TAKEN AT IT.
   `--seed N` changes it, which is how to check that a scenario passes on more
   than one arrangement rather than on the one it was written against:

     for s in 1 2 3 4 5 6; do node tools/sim.js play --seed $s; done

   There are only six arrangements of three cards, so six seeds that produce six
   different boards cover the lot. */
const SEED = (() => {
  const i = ARGV.indexOf('--seed');
  const n = i === -1 ? NaN : Number(ARGV[i + 1]);
  return isFinite(n) ? (n >>> 0) : 1;
})();

/* ---------------------------------------------------------- virtual clock -- */
let now = 0;
let seq = 0;
let timers = new Map();

function schedule(fn, ms, interval) {
  const id = ++seq;
  timers.set(id, { at: now + Math.max(0, ms || 0), fn, interval });
  return id;
}
const fakeSetTimeout = (fn, ms) => schedule(fn, ms, 0);
const fakeSetInterval = (fn, ms) => schedule(fn, ms, Math.max(1, ms || 1));
const fakeClear = id => { timers.delete(id); };
const rafs = new Map();
const fakeRaf = fn => { const id = ++seq; rafs.set(id, now + 16); rafHandlers.set(id, fn); return id; };
const rafHandlers = new Map();
const fakeCancelRaf = id => { rafs.delete(id); rafHandlers.delete(id); };

/** Step the clock, firing everything due, in time order. */
function advance(ms) {
  const until = now + ms;
  for (;;) {
    let best = null, bestAt = Infinity, kind = null;
    for (const [id, t] of timers) if (t.at < bestAt) { bestAt = t.at; best = id; kind = 't'; }
    for (const [id, at] of rafs) if (at < bestAt) { bestAt = at; best = id; kind = 'r'; }
    if (best === null || bestAt > until) break;
    now = bestAt;
    if (kind === 't') {
      const t = timers.get(best);
      if (t.interval) t.at = now + t.interval; else timers.delete(best);
      try { t.fn(); } catch (e) { console.log('  !! timer threw: ' + e.message); }
    } else {
      const fn = rafHandlers.get(best);
      rafs.delete(best); rafHandlers.delete(best);
      try { fn(now); } catch (e) { console.log('  !! raf threw: ' + e.message); }
    }
  }
  now = until;
}

/* ------------------------------------------------------------------- DOM --- */
function El(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    children: [], parentNode: null, hidden: false, tabIndex: 0,
    textContent: '', disabled: false, dataset: {}, _attrs: {}, _on: {},
    currentTime: 0, duration: NaN, paused: true,
  };
  const cls = new Set();
  el.classList = {
    add: (...c) => c.forEach(x => cls.add(x)),
    remove: (...c) => c.forEach(x => cls.delete(x)),
    contains: c => cls.has(c),
    toggle: (c, on) => { if (on === undefined) { cls.has(c) ? cls.delete(c) : cls.add(c); } else if (on) cls.add(c); else cls.delete(c); },
    _set: cls,
  };
  Object.defineProperty(el, 'className', {
    get: () => Array.from(cls).join(' '),
    set: v => { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach(x => cls.add(x)); },
  });
  el.style = { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; }, getPropertyValue(k) { return this[k] || ''; } };
  /* data-* ATTRIBUTES AND dataset ARE THE SAME THING, as they are in a browser.
     They were two separate objects here, and that let a real bug through: the
     post-game formation strips attributes off a cloned frame, and
     .slot[data-slot="0"] is the rule that POSITIONS that frame. In a browser
     removeAttribute('data-slot') clears dataset.slot and the frame drops to left
     0; here it only touched _attrs, so dataset.slot survived and a check written
     either way answered wrongly - one saw a removal that had not happened, the
     other missed one that had. */
  const dataKey = k => {
    const m = /^data-(.+)$/.exec(String(k));
    return m ? m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase()) : null;
  };
  el.setAttribute = (k, v) => {
    const d = dataKey(k);
    if (d) { el.dataset[d] = String(v); return; }
    el._attrs[k] = String(v);
  };
  el.getAttribute = k => {
    const d = dataKey(k);
    if (d) return (d in el.dataset) ? el.dataset[d] : null;
    return (k in el._attrs) ? el._attrs[k] : null;
  };
  el.removeAttribute = k => {
    const d = dataKey(k);
    if (d) { delete el.dataset[d]; return; }
    delete el._attrs[k];
  };
  el.appendChild = c => { c.parentNode = el; el.children.push(c); return c; };
  el.removeChild = c => { el.children = el.children.filter(x => x !== c); c.parentNode = null; };
  el.replaceChildren = (...c) => { el.children.forEach(x => { x.parentNode = null; }); el.children = c; c.forEach(x => { x.parentNode = el; }); };
  el.remove = () => { if (el.parentNode) el.parentNode.removeChild(el); };
  el.addEventListener = (t, fn) => { (el._on[t] = el._on[t] || []).push(fn); };
  el.removeEventListener = (t, fn) => { el._on[t] = (el._on[t] || []).filter(f => f !== fn); };
  el.fire = (t, ev) => (el._on[t] || []).slice().forEach(f => f(Object.assign({ type: t, preventDefault() {}, stopPropagation() {} }, ev)));
  el.focus = () => {}; el.blur = () => {};
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 });
  /* LAYOUT METRICS, and they are zero by default on purpose - anything that
     needs real ones has to be given them where it is registered, so a caller
     reading geometry off an element nobody measured gets an obviously wrong 0
     rather than a plausible wrong number. classOnly.tray is the one that is
     measured; see the note there. */
  el.offsetLeft = el.offsetTop = el.offsetWidth = el.offsetHeight = 0;
  /* A 2D CONTEXT, and it is a RECORDER rather than a no-op.

     WHY THIS EXISTS. Three effects on this board are simulated on a canvas -
     flourBlast, rideAir and boxDust - and every one of them is an integrator
     several hundred lines from anything a screenshot can check. Without a
     context they cannot run at all: boxDust would throw on its first clearRect
     and the harness would report a missing beat, which reads as a logic fault.
     With a no-op one they run and report nothing, which is worse - it is the
     "untested path" this file exists to close.

     So the stub keeps every stamp: when it happened, where, how big and how
     faint. That is enough to check the things about a particle cloud that are
     actually checkable without eyes - that it appears on the frame it should,
     that it does not draw under the floor, how far it spreads, how high it
     rises, and that it ends. See the dust block in SCENARIOS.finale. */
  el.getContext = kind => {
    if (String(kind) !== '2d') return null;
    if (el._ctx) return el._ctx;
    const stops = () => ({ addColorStop() {} });
    el._draws = [];
    el._ctx = {
      globalAlpha: 1, fillStyle: '', canvas: el,
      createRadialGradient: stops, createLinearGradient: stops,
      fillRect() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      closePath() {}, fill() {}, stroke() {}, save() {}, restore() {},
      translate() {}, rotate() {}, scale() {}, arc() {}, clip() {},
      /* THE CONFETTI'S TWO, and they record nothing on purpose. A piece of paper
         is a filled path under a matrix, and a recorder of THAT is a rasteriser;
         what is worth checking about it is the simulation behind it, which
         AARU_POST.confetti hands over as numbers. These are here so the fourth
         effect on this board can RUN - without them confettiBurst throws on its
         first frame and the harness reports a missing celebration, which reads
         as a logic fault. See the confetti block in SCENARIOS.form. */
      setTransform() {}, quadraticCurveTo() {}, bezierCurveTo() {},
      drawImage(src, x, y, w, h) {
        el._draws.push({ at: now, x: x + w / 2, y: y + h / 2,
                         r: w / 2, a: el._ctx.globalAlpha });
      },
    };
    return el._ctx;
  };
  const walk = (n, out) => { n.children.forEach(c => { out.push(c); walk(c, out); }); return out; };
  el.querySelectorAll = sel => walk(el, []).filter(c => sel.split('.').filter(Boolean).every(k => c.classList.contains(k)));
  el.querySelector = sel => el.querySelectorAll(sel)[0] || null;
  el.cloneNode = () => {
    const c = El(tag);
    c.className = el.className;
    Object.assign(c.dataset, el.dataset);
    el.children.forEach(k => c.appendChild(k.cloneNode(true)));
    return c;
  };
  /* Deliberately not playable: playCelebration then takes its done()-at-once
     path. See the header. */
  el.canPlayType = () => '';
  el.play = () => Promise.resolve();
  el.pause = () => {};
  el.load = () => {};
  return el;
}

/** Turn a fake element into a playable <video>: a duration, and a currentTime
    that advances on the virtual clock at playbackRate.

    `ended` is a scheduled timer rather than something the clock polls for,
    because that is what a real media element does - it fires once, at the end,
    and it can be cancelled by a pause or a seek. Using the existing timer
    machinery also means it interleaves correctly with the game's own timers
    instead of being checked at whatever granularity a caller happens to step. */
function makeMedia(el, dur) {
  let base = 0;             // currentTime as of the last pause or seek
  let from = null;          // virtual ms at which it started running, or null
  let endTimer = null;

  const cur = () => from === null
    ? base
    : Math.min(dur, base + (now - from) * (el.playbackRate || 1) / 1000);

  const arm = () => {
    if (endTimer) { fakeClear(endTimer); endTimer = null; }
    if (from === null) return;
    endTimer = fakeSetTimeout(() => {
      base = dur; from = null; endTimer = null;
      el.fire('ended');
    }, (dur - cur()) * 1000 / (el.playbackRate || 1));
  };

  el.duration = dur;
  el.playbackRate = 1;
  el.muted = false;
  Object.defineProperty(el, 'currentTime', {
    get: cur,
    set(v) {
      base = Math.max(0, Math.min(dur, Number(v) || 0));
      if (from !== null) from = now;
      arm();
    },
  });
  el.canPlayType = () => 'probably';
  el.play = () => { if (from === null) { from = now; arm(); } return Promise.resolve(); };
  el.pause = () => {
    if (from !== null) { base = cur(); from = null; }
    if (endTimer) { fakeClear(endTimer); endTimer = null; }
  };
  return el;
}

/** The bay template: one .bay holding three .hanger > .slot triples, which is
    the shape mountBay() reads out of index.html. */
function makeBayTemplate() {
  const tpl = El('template');
  const bay = El('div'); bay.className = 'bay';
  for (let i = 0; i < 3; i++) {
    const hanger = El('div'); hanger.className = 'hanger';
    const slot = El('div'); slot.className = 'slot'; slot.dataset.slot = String(i);
    slot.setAttribute('role', 'button');
    slot.setAttribute('aria-label', 'a frame');
    hanger.appendChild(slot);
    /* THE PEG. It was missing, and the post-game formation clones this template
       to carry its pictures in - so without it makeCarrier() produced a frame
       with no clip and the harness could not have said so. The peg comes after
       the slot, as in the markup: it clips over the top of the mat. */
    const peg = El('img'); peg.className = 'peg peg-' + (i + 1);
    hanger.appendChild(peg);
    bay.appendChild(hanger);
  }
  const content = El('div');
  content.appendChild(bay);
  content.firstElementChild = bay;
  tpl.content = content;
  return tpl;
}

/* THE TWO IMPACTS, AND THEY ARE TWO CUES NOW. `thud` is his feet hitting the floor
   after the fall; धड़ामा, the bicycle crash in the recap, is `crash` - a different
   recording, because a boy landing on his feet in control and a boy going over with
   a bicycle under him are not the same event.

   SO THE CHECK CHANGED SHAPE. It used to be "thud fired twice, far enough apart",
   with the gap standing in for "one of them is the recap". Two named cues need no
   such proxy: each should fire exactly once, and `crash` should come after `thud`.
   The gap is kept as a sanity bound rather than as the test - if they land within
   8 seconds of each other, something has fired the recap during the finale.

   AN ABSOLUTE SPLIT POINT WAS THE FIRST ATTEMPT and it was the wrong shape: sound
   times here are on the whole scenario's clock, so the landing is near 78s in the
   finale and near nothing in a scenario that skips the rounds. Order plus gap holds
   whatever the scenario does first. */
const THUD_APART = 8;   /* seconds */

/* THE NINE RECAP CUES, AND HOW CLOSE THE CLOSEST PAIR GETS. Nine of the ten
   pictures sound now where four did, so the constraint SFX_PLAN states for this
   group - any two within about 250ms are ONE event once the limiter's 220ms
   release is counted - binds much harder than it used to. Printing the tightest
   pair is what stops a change to RECAP_HOLD, or to any single card's `hold`,
   from quietly collapsing two of the story's beats into one noise.

   IT IS A FUNCTION BECAUSE TWO SCENARIOS NEED IT AND ONLY ONE OF THEM CAN SEE
   IT. `finale` stops before the recap starts, so there it prints "fewer than two
   in this window" and that is correct rather than a failure; `form` runs the
   whole thing and is where the number actually means something. Written inline
   in the first of those, it would have looked like a passing check for as long
   as nobody ran the second. */
const RECAP_CUES = ['tummy', 'sneeze', 'gasp', 'cycle', 'ting', 'crash',
                    'splash', 'dogeat', 'sad', 'clatter', 'amazed'];

function reportRecapGaps(sounds) {
  const fired = sounds
    .filter(s => RECAP_CUES.some(c => s.url.indexOf('/' + c + '.wav') !== -1))
    .sort((a, b) => a.at - b.at);
  let tight = null;
  for (let i = 1; i < fired.length; i++) {
    const d = (fired[i].at - fired[i - 1].at) / 1000;
    if (!tight || d < tight) tight = d;
  }
  console.log('   recap cues        : %d of 10 fired%s   %s', fired.length,
              tight === null ? '' : ', closest pair ' + tight.toFixed(2) + 's',
              tight === null ? '(fewer than two of them in this window)'
                             : tight >= 0.30
                               ? '(every pair clear of the 300ms floor - good)'
                               : '<< TWO CUES ' + tight.toFixed(2) + 's APART, which the '
                                 + 'limiter makes into one event');
}

const ids = {};
['stage', 'prompt', 'cards', 'hand', 'handGhost', 'rope', 'washline', 'title',
 'play', 'celebrate', 'entry', 'devbar', 'devSkip',
 'recap', 'postRing', 'postLine', 'postTrail', 'postMagic', 'postAaru',
 'postAaruStill',
 /* The gameplay sheet's two post-game screens. All three are in index.html -
    which is the condition the note below sets, and the reason it is worth
    re-reading before adding a fourth. There was a 'postBadge' here and it went
    with the badge itself: an id registered for markup that does not exist is the
    exact trap that note describes. */
 'postFx', 'postSpark', 'postBurst',
 /* The two the confetti is drawn on, one either side of him. Both are in
    index.html, which is the condition the note above sets - confettiBurst()
    returns false without them and the celebration would lose its last beat in
    silence. */
 'postConfBack', 'postConfFront',
 'finaleLand', 'finaleCheer', 'finaleFall', 'finaleSnap', 'finaleShadow',
 'finaleDust',
 /* The box's own dust, which is a different element from his and no longer the
    same KIND of thing: #finaleDust is the painted aaru-dust.png sprite thrown by
    his sandals at the end of the ending, #boxDust is a canvas the box's own
    cloud is simulated on at the top of it. It was '#trayDust' and four copies of
    his sprite; see the block above boxDust() in app.js for why that went. */
 'boxDust'
].forEach(id => { ids[id] = El('div'); });

/* #recapGrid IS GONE from this list, and it had outlived the markup by two
   features: the twelve-card grid it belonged to was removed, and the formation
   that replaced it uses #postRing. An id registered here that the page does not
   have is not harmless - getElementById answers for it, so a stale lookup in
   app.js would find an element instead of null and the harness would pass code
   that cannot work in a browser.

   #finaleDust IS REAL, and the comment that used to be here said it was not -
   directly under the line registering it, and while styles.css said the same
   thing in the same words. What went was the CSS class .finale-dust and its
   three puffs; the ID came back for the drawn aaru-dust.png sprite and both
   sentences were left behind. #finaleSnap is still the last pose. */
ids.bayTpl = makeBayTemplate();

/* Behind a flag, because turning it on changes which branch playCelebration
   takes in EVERY scenario - the other five were written against the bail-out
   path and their timings assume it. */
if (VIDEO) Object.keys(CLIP_S).forEach(k => makeMedia(ids[k], CLIP_S[k]));

/* Real values for the custom properties app.js reads back, straight out of
   styles.css, so cssNum() returns what the browser would. */
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const rootBlock = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
const vars = {};
rootBlock.replace(/(--[\w-]+)\s*:\s*([^;]+);/g, (_, k, v) => { vars[k] = v.trim(); return ''; });

/* Elements the page has that carry no id, so nothing above registers them.
   .tray is one, and the finale reaches it with document.querySelector - which
   is how this harness found out it had no document-level query at all. */
const classOnly = { tray: El('div'), banner: El('div') };
classOnly.tray.className = 'tray';
/* THE PINK BOX, for the same reason as the tray: it carries no id, the finale
   reaches it with document.querySelector('.banner'), and without it here that
   lookup returns null and bannerAway() silently does half its job. The
   SENTENCE inside it is #prompt and is registered already; the two are siblings
   and go together, so the finale scenario asserts on both. */
classOnly.banner.className = 'banner';
/* THE TRAY IS MEASURED, out of styles.css rather than written down here.
   boxDust() takes the edge it throws dust off the box's own offset metrics, so
   an unmeasured .tray puts the whole cloud 640px above the band it is drawn on
   and every number the harness prints about it is wrong in the same direction -
   which is exactly the shape of bug that looks like a passing test. */
/* AND IT IS PARSED WITHOUT A BACKSLASH, which is not a style choice. The note at
   the top of SCENARIOS.finale says this file gets patched by scripts and that an
   escaped sequence has been eaten in transit once; it has now happened twice, and
   the second time was here. The first version of this read the rule with
   new RegExp('\s' + prop + ...), the escape came through as a literal s, it
   matched nothing, and the tray stayed 0 x 0 - while every line the dust report
   printed still said "good", because a cloud thrown off a zero-sized box is
   perfectly self-consistent. Splitting the text cannot be mangled. */
const TRAY_METRIC = { left: 'offsetLeft', top: 'offsetTop',
                      width: 'offsetWidth', height: 'offsetHeight' };
const trayRule = css.slice(css.indexOf('.tray {'), css.indexOf('}', css.indexOf('.tray {')));
trayRule.split(';').forEach(decl => {
  const bits = decl.split(':');
  if (bits.length !== 2 || bits[1].indexOf('px') === -1) return;
  const metric = TRAY_METRIC[bits[0].trim()];
  if (metric) classOnly.tray[metric] = parseFloat(bits[1]);
});
if (!classOnly.tray.offsetWidth) {
  console.log('  !! the .tray rule in styles.css did not parse - every dust '
              + 'number below is measured off a zero-sized box');
}

const documentFake = {
  documentElement: El('html'),
  body: El('body'),
  getElementById: id => ids[id] || null,
  createElement: t => El(t),

  /* SVG NODES, and this stub existing is not cosmetic. The recap's trail draws a
     HOLLOW star, which cannot be done with a div - a five-point outline is an SVG
     path with fill:none - so app.js builds one with createElementNS and clones it
     per mark. Without this the whole of Screen 1 threw on its first frame and the
     harness reported "pictures woken: NONE", which reads as a logic fault rather
     than a missing stub.

     The namespace is ignored on purpose: nothing here cares, and El() already
     models setAttribute, appendChild and cloneNode, which is all app.js uses. */
  createElementNS: (ns, t) => El(t),

  /* Class selectors only ('.a', '.a.b'), which is all the game asks for.
     Anything else returns nothing rather than pretending - a silent wrong
     answer here would be worse than a missing one. */
  querySelectorAll(sel) {
    const want = String(sel).trim().split('.').filter(Boolean);
    if (!want.length || String(sel).trim()[0] !== '.') return [];
    const out = [];
    const visit = el => {
      if (want.every(k => el.classList.contains(k))) out.push(el);
      el.children.forEach(visit);
    };
    Object.keys(ids).forEach(k => visit(ids[k]));
    Object.keys(classOnly).forEach(k => visit(classOnly[k]));
    return out;
  },
  querySelector(sel) { return documentFake.querySelectorAll(sel)[0] || null; },

  /* DOCUMENT-LEVEL LISTENERS, kept rather than dropped. app.js binds three
     things out here that no element owns: the pinch swallow (gesturestart and
     friends) and the audio wake-up on visibilitychange. A bare no-op stub would
     have been enough to stop the throw, but then a scenario could never fire
     them - and the wake-up is the recovery path for a phone that has been
     interrupted, which is precisely the kind of thing worth being able to test.
     So they are recorded, and fireDoc() below sends one.

     WITHOUT THIS THE WHOLE FILE THREW ON LOAD. document.addEventListener is not
     a function, at app.js's last few lines, which aborted every scenario before
     its first frame - the harness's own gap, reported as if the game were
     broken. */
  addEventListener(t, fn) { (docOn[t] = docOn[t] || []).push(fn); },
  removeEventListener(t, fn) {
    const a = docOn[t];
    if (a) docOn[t] = a.filter(f => f !== fn);
  },

  /* The page is in front unless a scenario says otherwise; wakeAudio() reads
     this to decide whether coming back is really coming back. */
  hidden: false,
};

const docOn = {};

/** Send a document-level event, the way the system would.

    Used by no scenario yet. It is here because the listeners above are worth
    having a way to reach: `fireDoc('visibilitychange')` after setting
    documentFake.hidden is the interrupted-phone path, and the only way to see
    that the context is asked to resume. */
function fireDoc(type, ev) {
  (docOn[type] || []).forEach(fn => fn(ev || { type, preventDefault() {} }));
}

/* ----------------------------------------------------------- WebAudio ------ */
const sounds = [];          // every sound that started: {at, url, offset, dur}
const gainMoves = [];       // every masterGain automation: {at, to, tc}
let masterGainNode = null;

function wavDuration(bytes) {
  const b = Buffer.from(bytes);
  if (b.slice(0, 4).toString() !== 'RIFF') return 0.5;   // the supplied mp3
  let p = 12, byteRate = 0, dataSize = 0;
  while (p + 8 <= b.length) {
    const id = b.slice(p, p + 4).toString();
    const sz = b.readUInt32LE(p + 4);
    if (id === 'fmt ') byteRate = b.readUInt32LE(p + 16);
    if (id === 'data') { dataSize = sz; break; }
    p += 8 + sz + (sz & 1);
  }
  return byteRate ? dataSize / byteRate : 0.5;
}

function FakeCtx() {
  const ctx = {
    state: 'suspended',
    sampleRate: 48000,
    get currentTime() { return now / 1000; },
    resume() { ctx.state = 'running'; return Promise.resolve(); },
    destination: { connect() {} },
  };
  const gainish = () => ({ value: 1, setValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; }, linearRampToValueAtTime() { return this; }, setTargetAtTime() { return this; }, cancelScheduledValues() { return this; } });
  const node = extra => Object.assign({ connect(d) { return d; }, disconnect() {} }, extra);
  ctx.createGain = () => {
    const g = node({ gain: gainish() });
    return g;
  };
  ctx.createDynamicsCompressor = () => node({ threshold: gainish(), knee: gainish(), ratio: gainish(), attack: gainish(), release: gainish() });
  ctx.createConvolver = () => node({ buffer: null });
  ctx.createStereoPanner = () => node({ pan: gainish() });
  ctx.createBiquadFilter = () => node({ type: '', frequency: gainish(), Q: gainish(), gain: gainish() });
  ctx.createOscillator = () => node({ type: '', frequency: gainish(), detune: gainish(), start() {}, stop() {} });
  ctx.createBuffer = (ch, len, sr) => ({ numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: () => new Float32Array(len) });
  ctx.createBufferSource = () => {
    const s = node({
      buffer: null, playbackRate: gainish(), loop: false, onended: null,
      start(when, offset, dur) {
        const b = s.buffer || {};
        const off = offset || 0;
        const d = dur !== undefined ? dur : (b.duration || 0) - off;
        /* `ended` is when it will stop if nothing stops it first; stop() below
           overwrites it, so the log shows how long each sound was ACTUALLY
           audible and two barge-ins cannot look like an overlap. */
        s._rec = { at: (when || 0) * 1000, url: b.__url || '?', offset: off, dur: d,
                   ended: (when || 0) * 1000 + d * 1000, cut: false };
        sounds.push(s._rec);
        s._end = schedule(() => { if (s.onended) s.onended({ type: 'ended' }); }, (when || 0) * 1000 - now + d * 1000, 0);
      },
      /* stop(when) HONOURS `when`, and it did not used to. The real API takes a
         time on the audio clock; this fake ignored it and treated every call as
         "stop now", so a voice that politely scheduled its own end — hiss()
         does, on every noise grain, and so does every sample-backed voice —
         was reported as having been CUT at the moment it started. That is
         where the "-0.01 s (cut, of 0.38)" lines came from: not a barge-in, an
         unimplemented argument. Barge-ins still report correctly, because a
         barge-in calls stop() with no argument at all. */
      stop(when) {
        if (s._end) fakeClear(s._end);
        const at = when === undefined ? now : when * 1000;
        if (s._rec && at < s._rec.ended) {
          s._rec.ended = at;
          /* Only a stop that lands EARLY is a cut. A voice scheduling its own
             end is the sound finishing, which is not news. */
          s._rec.cut = at < s._rec.at + s._rec.dur * 1000 - 1;
        }
        if (s.onended) {
          fakeSetTimeout(() => s.onended({ type: 'ended' }), Math.max(0, at - now));
        }
      },
    });
    return s;
  };
  ctx.decodeAudioData = holder => Promise.resolve({
    __url: holder.__url, duration: wavDuration(holder.bytes),
    numberOfChannels: 1, sampleRate: 24000,
    length: Math.round(wavDuration(holder.bytes) * 24000),
    getChannelData: () => new Float32Array(1),
  });
  return ctx;
}

/* ---------------------------------------------------------------- fetch ---- */
function fakeFetch(url) {
  /* THE ?v= COMES OFF FIRST. The cues and the narrator are fetched with
     ?v=BUILD — see the protocol note beside stampBuild() in app.js — and that
     token is for a browser cache, not for a filesystem: left on, every path
     misses on disk AND every buffer records a __url that no longer matches
     SFX_SRC, so label() below reports each cue as `?` and the log stops naming
     anything. It is the version token's whole job to change, so this strips it
     rather than expecting it. */
  const rel = decodeURIComponent(String(url).split('?')[0]);  // %20 paths must resolve
  /* NOVO=1 fails every narrator fetch, which is what file:// does to all of
     them at once. The game must still arm its hints and stay playable. */
  if (NOVO && rel.indexOf('voiceover') !== -1) {
    return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
  }
  const p = path.join(ROOT, rel.replace(/\//g, path.sep));
  if (!fs.existsSync(p)) return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
  const bytes = fs.readFileSync(p);
  /* byteLength, because the game weighs the whole cue set on arrival to catch a
     browser serving it a stale copy - see SFX_BYTES. The stand-in an ArrayBuffer
     gets here is a tagged object rather than a real buffer (decodeAudioData is
     faked too, and wants the path), so it has to carry the one property that is
     read off it. Without this the sim reports NaN bytes and warns on every run. */
  return Promise.resolve({ ok: true, status: 200,
    arrayBuffer: () => Promise.resolve({ __url: rel, bytes, byteLength: bytes.byteLength }) });
}

/* ------------------------------------------------------------- the sandbox - */
const sandbox = {
  console, Math, JSON, Date, Promise, Array, Object, String, Number, Boolean,
  Set, Map, isFinite, isNaN, parseFloat, parseInt, Error, Intl, URLSearchParams,
  Float32Array, Uint8Array,
  setTimeout: fakeSetTimeout, clearTimeout: fakeClear,
  setInterval: fakeSetInterval, clearInterval: fakeClear,
  requestAnimationFrame: fakeRaf, cancelAnimationFrame: fakeCancelRaf,
  performance: { now: () => now },
  document: documentFake,
  /* THE TRAY IS PINNED, to SEED - see the note beside it for why, and for the
     --seed flag that moves it. */
  location: { search: (DEV ? '?dev=1&' : '?') + 'seed=' + SEED },
  fetch: fakeFetch,
  Image: function () { this.src = ''; },
  Audio: function () { throw new Error('an <audio> element was created'); },
  /* Query-AWARE, not blanket-true under --still: something else asking
     matchMedia a different question must not get the reduced-motion answer. */
  matchMedia: q => ({
    matches: STILL && String(q).indexOf('prefers-reduced-motion') !== -1,
    addEventListener() {}, addListener() {},
  }),
  getComputedStyle: () => ({ getPropertyValue: k => vars[k] || '' }),
  AudioContext: FakeCtx,
};
const winOn = {};
sandbox.addEventListener = (t, fn) => { (winOn[t] = winOn[t] || []).push(fn); };
sandbox.removeEventListener = (t, fn) => { winOn[t] = (winOn[t] || []).filter(f => f !== fn); };
sandbox.innerWidth = 1920;
sandbox.innerHeight = 1080;
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const context = vm.createContext(sandbox);
const code = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
vm.runInContext(code, context, { filename: 'app.js' });

/* masterGain is built inside buildChain; grab it so its automation is visible */
const peek = expr => vm.runInContext(expr, context);
const master = peek('masterGain');
if (master) {
  const g = master.gain;
  const real = g.setTargetAtTime.bind(g);
  g.setTargetAtTime = (v, t, tc) => { g.value = v; gainMoves.push({ at: t * 1000, to: v, tc }); return real(v, t, tc); };
}

/* =========================================================================
   SCENARIOS
   ========================================================================= */

const VO_SRC = peek('VO_SRC');
const NAMES = Object.keys(VO_SRC);

/* The cards' 2nd-attempt hints, which are NOT in VO_SRC: they hang off the
   cards in ROUNDS as bare paths and reach say() as inline { src }, so they have
   no key for label() to find and printed as "VOICE undefined" until this
   existed. Named by the card they belong to, because that is the question the
   output has to answer - "she said the hint" is not useful, "she said the hint
   for r1 house when the frame was asking for r1 house" is. */
const HINTS = new Map();
peek('ROUNDS').forEach((r, ri) => r.cards.forEach(c => {
  if (c.vo) HINTS.set(c.vo.replace(/%20/g, ' '), 'hint:r' + (ri + 1) + '-' + c.id);
}));
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise(r => setImmediate(r)); };

/** A drop can no longer land while she is talking - inputLocked() in app.js
    now includes speaking(), the same as a round transition always did. Every
    scripted tryPlace() call below waits for her to fall silent first, which is
    exactly the wait a real tap or drag is now subject to before it can even
    start. A no-op whenever she is already quiet. */
async function waitForSilence() {
  while (peek('speaking()')) { advance(120); await settle(); }
}

/** Name a sound by the cue or line it came from. */
function label(s) {
  if (s.url.indexOf('voiceover') === -1) {
    return 'sfx   ' + s.url.split('/').pop().replace(/\.(wav|mp3)$/, '');
  }
  if (HINTS.has(s.url)) return 'VOICE ' + HINTS.get(s.url);
  const hit = NAMES.filter(k => VO_SRC[k].src.replace(/%20/g, ' ') === s.url)
                   .sort((a, b) => Math.abs((VO_SRC[a].from || 0) - s.offset) -
                                   Math.abs((VO_SRC[b].from || 0) - s.offset))[0];
  return 'VOICE ' + hit;
}

let seen = 0;
function drain() {
  const fresh = sounds.slice(seen);
  seen = sounds.length;
  fresh.forEach(s => console.log('   ' + (s.at / 1000).toFixed(2).padStart(7) + ' s  ' +
    label(s).padEnd(23) + ((s.ended - s.at) / 1000).toFixed(2) + ' s' +
    (s.cut ? '  (cut, of ' + s.dur.toFixed(2) + ')' : '') +
    (s.offset ? '  from ' + s.offset.toFixed(2) + 's' : '')));
  return fresh;
}

/* WHAT `pulse=N` MEANS, because N is no longer only 0 or 1. Idle Hint 1 pulses
   every card standing in the tray - three of them - so an ordinary stall reports
   pulse=3. Exactly two things still pulse ONE card: the 3rd incorrect attempt,
   and screen 1's first-frame demonstration. See the hint-visuals note in app.js.
   Counted off cardNodes, which is every card that exists, so a parked
   next-screen card being pulsed by mistake would show up here as pulse=4+. */
function hints() {
  let pulsed = 0;
  peek('cardNodes').forEach(el => { if (el.classList.contains('is-hinted')) pulsed++; });
  return 'pulse=' + pulsed + ' hand=' + (!ids.hand.hidden);
}

/** How many frames are pulsing - THE THIRD RUNG hints() CANNOT SEE.

    The frame in turn wears .is-active, and that class is what runs the ring and
    the lift on its white mat (see .slot.is-active in styles.css). It is a pulse
    like the other two and the rule about them covers it, but hints() reads
    cardNodes and the hand element and would report a board with a frame
    throbbing on it as `pulse=0 hand=false`. It did: the frame went on pulsing
    under her voice for a whole build while every hint verdict stayed green,
    because nothing on either side was looking at the frames. */
function framePulse() {
  return peek('slotEls').filter(el => el.classList.contains('is-active')).length;
}

const voices = () => sounds.filter(s => s.url.indexOf('voiceover') !== -1);

function summary() {
  const v = voices();
  console.log('\nevery line she spoke, in order:');
  v.forEach(s => console.log('   ' + (s.at / 1000).toFixed(2).padStart(7) + ' s  ' +
    label(s).replace('VOICE ', '').padEnd(16) + 'heard for ' +
    ((s.ended - s.at) / 1000).toFixed(2) + ' s' + (s.cut ? ' of ' + s.dur.toFixed(2) : '')));
  const overlap = v.filter((s, i) => i && s.at < v[i - 1].ended - 1);
  console.log('\ntwo lines audible at once? ' + (overlap.length
    ? 'YES at ' + overlap.map(s => (s.at / 1000).toFixed(2)).join(', ') : 'never'));
  console.log('order: ' + v.map(s => label(s).replace('VOICE ', '')).join(' -> '));
}

async function boot() {
  await settle();
  const bufs = peek('voBufs');
  const bad = NAMES.filter(k => !bufs.get(VO_SRC[k].src));
  console.log('%d effect files and %d voice files decoded; %d narrator lines, %s',
              peek('sfxBufs').size, bufs.size, NAMES.length,
              bad.length ? 'MISSING ' + bad.join(', ') : 'all resolved');
  /* IDLE_VO_MS used to be printed here, and it is gone from app.js with the
     nine-second re-ask it armed - the narrator no longer speaks on idle at all.
     The two numbers that still govern a stall are the visual ladder's. */
  console.log('VO_VOLUME=%s VO_DUCK=%s IDLE_HINT=%s+%sms SFX_VOLUME=%s',
              peek('VO_VOLUME'), peek('VO_DUCK'),
              peek('IDLE_HINT_1_MS'), peek('IDLE_HINT_2_MS'), peek('SFX_VOLUME'));
  ids.play.fire('click');
  await settle();
  advance(2600);                        // the pop, the haul in, the deck, the deal
  await settle();
  console.log('\n=== screen 1 arrives ===');
  /* WHICH BOARD THIS RUN IS PLAYING, printed so a scenario's output can be read
     against the tray it actually got. A card is named by where it sits, left to
     right, which is what a seed changes; `order` never changes. It has to be
     after the click: `round` and `queue` are null and empty until the play
     button builds the first screen. */
  /* `queue` is indexed by station and a place that has been emptied and not yet
     refilled is null, so a bare join() would print two spaces where a card used
     to be and read as a typo. */
  console.log('   tray seed=%s   left to right: %s   (frame 1 wants: %s)',
              SEED, peek('queue').map(id => id || '(empty)').join(' '),
              peek('round').order[0]);
  drain();
}

/** Answer the screen on screen, one card every `pace` ms.

    IT ANSWERS THE EMPTY FRAMES AND NOT ALL THREE. The line carries pictures
    across a seam, so every screen but the first opens with its leading frames
    already answered — `order` is the pictures the screen ASKS for, and the slot
    they go in is offset by however many were carried (see anchorCount in app.js).
    This walked `for (i < 3)` placing `order[i]` into slot `i`, which on an
    anchored screen aimed the first card at a frame that was already full: the
    game scores that as an incorrect attempt, so every scenario picked up a wrong
    guess it never made and then desynchronised. Driven off activeSlot() instead,
    which is the same thing the `stall` scenario already does. */
async function playScreen(pace) {
  const r = peek('round');
  if (!r) return false;
  console.log('\n-- screen %d (%s) --', peek('roundIndex') + 1, r.id);
  for (let i = 0; i < r.order.length; i++) {
    advance(pace);
    await settle();
    await waitForSilence();     // a real drop can't land while she is still asking
    const at = peek('activeSlot')();
    console.log('   %s s  >> place %s in slot %d',
                (now / 1000).toFixed(2).padStart(7), r.order[i], at);
    peek('tryPlace')(r.order[i], at);
    await settle();
    advance(200);
    await settle();
    drain();
  }
  for (let k = 0; k < 30; k++) { advance(500); await settle(); drain(); }
  return true;
}

/** WHAT THE BOX'S DUST CLOUD ACTUALLY DID, off the stamps rather than off the
    constants that set them up.

    THIS IS NOT A SCREENSHOT AND IT IS NOT TRYING TO BE. Nothing here can say
    whether the cloud LOOKS like dust; that costs a browser and an eye. What it
    can say is every claim boxDust() makes about the shape of the thing, and each
    of those was a place a several-hundred-line integrator could go wrong in
    silence:

      the lead      the squeeze film has to be out BEFORE the slab is down, or
                    the whole first point of the block comment is not happening.
      the extent    the end jets are the only part of the cloud that clears the
                    wood. If the widest stamp is inside the box, they did not.
      the floor     nothing may be drawn under it. A cloud with grains below the
                    floor line is a cloud sitting in the ground.
      the rise      it has to go UP, and late. A flat cloud means the roll-up
                    never engaged; one that starts high means it engaged at once,
                    which is the buoyancy mistake the comment argues against.
      the settle    the coarse grains have to come to rest ON the floor. Their
                    lowest stamps clustering at the floor line is what says so.
      the end       it has to finish and take its canvas away, or the ending
                    leaves a rAF loop running over the post-game.

    Every y is converted back to STAGE coordinates on the way out - the cloud is
    simulated in the band's own space and a number in that space cannot be
    checked against FLOOR_Y or against anything else in this file. */
function reportDust(trace, cv, tImpact) {
  /* Its own copy, because the two scenarios that have one each declare it
     inside themselves and this is called from outside both. */
  const ms = v => v === null ? 'NEVER' : v + 'ms';
  if (STILL) {
    console.log('   the box dust      : none on this path - no fall, so no impact frame');
    return;
  }
  const at = f => { const h = trace.find(f); return h ? h.t : null; };
  const tArm = at(s => s.dustLead);
  console.log('   the squeeze film  : %s   %s', ms(tArm),
    (tArm !== null && tImpact !== null)
      ? (tArm < tImpact
          ? 'out ' + (tImpact - tArm) + 'ms before the slab lands (DUST_LEAD_MS='
            + peek('DUST_LEAD_MS') + ') - good'
          : '<< THE CLOUD DID NOT LEAD THE BOX - it starts on or after the impact')
      : '<< one of the two never happened');

  const draws = (cv && cv._draws) || [];
  if (!draws.length) {
    console.log('   the cloud         : << NOTHING WAS EVER STAMPED - boxDust drew no grains');
    return;
  }

  const TOP = Number(peek('DUST_TOP'));
  const L = classOnly.tray.offsetLeft;
  const R = L + classOnly.tray.offsetWidth;
  const FLOOR = classOnly.tray.offsetTop + classOnly.tray.offsetHeight;

  let minX = Infinity, maxX = -Infinity, hi = Infinity, lo = -Infinity;
  let under = 0;
  for (const d of draws) {
    const y = d.y + TOP;
    if (d.x - d.r < minX) minX = d.x - d.r;
    if (d.x + d.r > maxX) maxX = d.x + d.r;
    if (y < hi) hi = y;
    if (y > lo) lo = y;
    /* The CENTRE, not the edge: every grain is a soft blob whose lower half is
       meant to be cut off by the floor - it is dust sitting on the ground. A
       centre below it is a grain that has fallen through. */
    if (y > FLOOR + 12) under += 1;
  }
  const first = draws[0].at, last = draws[draws.length - 1].at;

  console.log('   the cloud         : %d stamps over %sms, %d grains at its widest frame',
              draws.length, Math.round(last - first),
              Math.max(...Object.values(draws.reduce((m, d) => {
                m[d.at] = (m[d.at] || 0) + 1; return m;
              }, {}))));
  console.log('   spreads to        : x %d..%d   %s',
              Math.round(minX), Math.round(maxX),
              (minX < L && maxX > R)
                ? 'clears the box (' + L + '..' + R + ') by ' +
                  Math.round(L - minX) + ' and ' + Math.round(maxX - R) +
                  'px - the end jets ran'
                : '<< THE CLOUD NEVER LEFT THE WOOD - the end jets did nothing');
  console.log('   rises to          : y=%d, %dpx above the floor at %d   %s',
              Math.round(hi), Math.round(FLOOR - hi), FLOOR,
              (FLOOR - hi > 80 && FLOOR - hi < 420)
                ? 'about a metre, which is what a 1.02m slab throws - good'
                : '<< IT ' + (FLOOR - hi <= 80 ? 'NEVER ROSE' : 'WENT TOO HIGH'));
  console.log('   lowest stamp      : y=%d   %s', Math.round(lo),
              under === 0
                ? 'nothing is drawn under the floor - good'
                : '<< ' + under + ' STAMPS BELOW THE FLOOR - the cloud is in the ground');

  /* WHEN IT ROSE, which is the whole of point 4 in boxDust's comment: the lift
     is a target relaxed towards over DUST_ROLL, so the cloud must still be low
     while it is spreading and high only afterwards. Split the stamps in half by
     time and compare how high each half got. */
  const mid = first + (last - first) / 2;
  const top = arr => arr.length ? Math.min(...arr.map(d => d.y + TOP)) : FLOOR;
  const early = top(draws.filter(d => d.at < mid));
  const late  = top(draws.filter(d => d.at >= mid));
  console.log('   spreads then rises: first half reaches y=%d, second half y=%d   %s',
              Math.round(early), Math.round(late),
              late < early - 20
                ? 'the roll-up is behind the spreading - good'
                : '<< IT ROSE AT ONCE - the cloud is floating, not being thrown');

  console.log('   and it ends       : %s',
              ids.boxDust.children.length === 0 && !ids.boxDust.classList.contains('is-on')
                ? 'canvas gone and the loop stopped - good'
                : '<< STILL RUNNING when the window closed - a rAF loop is left '
                  + 'over the post-game');
}

const SCENARIOS = {
  async idle() {
    console.log('\n=== and is then left completely alone for 60s ===');
    for (let i = 0; i < 12; i++) {
      advance(5000);
      await settle();
      if (!drain().length) {
        console.log('   %s s  -                 %s', (now / 1000).toFixed(2).padStart(7), hints());
      }
    }
    const v = voices();
    console.log('\nthe question, asked %d times. real silence between them:', v.length);
    v.forEach((s, i) => { if (i) console.log('   %s s', ((s.at - v[i - 1].ended) / 1000).toFixed(2)); });
    console.log('hint chimes in that minute: %d  (the ladder is climbed once)',
                sounds.filter(s => s.url.indexOf('hint') !== -1).length);
    console.log('\nthe effects bus while she talks (SFX_VOLUME=%s, ducked=%s):',
                peek('SFX_VOLUME'), (peek('SFX_VOLUME') * peek('VO_DUCK')).toFixed(4));
    gainMoves.slice(0, 6).forEach(m =>
      console.log('   %s s  -> %s', (m.at / 1000).toFixed(2).padStart(7), m.to.toFixed(4)));
  },

  /* THE TUTORIAL, SECOND BY SECOND, and the harness for three separate reports
     about it. Every one of them is about WHEN something happens rather than
     whether it happens, so a pass/fail on "did the hand show" cannot see any of
     them - and the other scenarios all read that way.

       1  the pulse and the hand must land on the frame her opening instruction
          STOPS. They used to wait 4.5s and 8.5s after it - the sheet's Idle
          Hint delays, applied to a child who has not been shown the gesture
          once. See firstTeach().

       2  the banner must not move on the placement. It must hold the question
          the child just answered until the line that asks the NEXT one starts
          speaking. See promptHold.

       3  the handover, 29, must arrive on the SECOND placement. It used to be
          `done`, spoken after the third card, and what filled the gap was the
          idle clock re-asking the second picture's own question.

     WHAT IT PRINTS is one row per half second: the line sounding, the sentence
     the banner is writing, and the state of the two visual rungs. Read the
     rows; the verdicts under them are the numbers worth asserting. */
  async teach() {
    console.log('\n=== the tutorial, second by second ===\n');
    console.log('     time   voice        banner                                    hints');

    const sounding = () => {
      const v = voices().filter(x => x.at <= now && x.ended > now).pop();
      return v ? label(v).replace('VOICE ', '') : '-';
    };
    const marks = [];                       // [ms, what] for the verdicts below
    /* EVERY SAMPLE WHERE A HINT WAS UP WHILE SHE WAS TALKING, which is a state
       the game must never be in: inputLocked() is locked||speaking(), so a
       pulse under her voice is the board asking a child to touch something it
       is about to refuse. The user reported exactly that - "only pulsate the
       options after the narrator voiceover has ended, because right now the
       screen is inactive when the narrator is saying" - and it was a timer
       armed BEFORE she opened her mouth and never cancelled when she did. */
    const overlaps = [];
    let bannerWas = null, lineWas = null;
    const row = note => {
      const b = peek('promptText') || '(empty)';
      const l = sounding();
      if (bannerWas !== null && b !== bannerWas) marks.push([now, 'banner -> ' + b]);
      if (l !== lineWas && l !== '-') marks.push([now, 'voice  -> ' + l]);
      bannerWas = b; lineWas = l;
      if (l !== '-' && hints() !== 'pulse=0 hand=false') overlaps.push([now, l, hints()]);
      /* padEnd rather than %-11s: console.log's %s is util.format, which has no
         width or alignment flags and prints the flag itself. */
      console.log('   %s s  %s %s %s%s',
                  (now / 1000).toFixed(2).padStart(7), l.padEnd(10),
                  /* `--` and not `<<`: in this file `<<` is the sigil that
                     marks a FAILING line, and a scenario whose ordinary rows
                     carry it cannot be grepped for failures. */
                  b.padEnd(34), hints(), note ? '   -- ' + note : '');
    };

    const tick = async (n, note) => {
      for (let i = 0; i < n; i++) { row(i === 0 ? note : ''); advance(500); await settle(); }
    };
    const put = async (slot, note) => {
      await waitForSilence();
      peek('tryPlace')(peek('round').order[slot], slot);
      await settle();
      row(note);
    };

    /* Screen 1 has just arrived and she is asking. Left alone well past the end
       of her line, which is where rung 1 is measured. */
    await tick(14, 'screen 1, asking - left alone');

    /* AND THEN THE CHILD TOUCHES IT, which is the fourth thing this scenario is
       for. Four fumbles - the right card picked up and let go where there is no
       frame at all, which tryPlace() scores `counts: false` so `attempts` stays
       0. That is precisely the state firstTeach() reads, and every one of these
       routes through resetIdle() -> hideHand() -> armIdle(). Without the
       one-shot flag each tap re-fires the chime and blinks the hand off and back
       on: measured at five chimes in 4.3s, each 0.95s long, overlapping. */
    const chimesBefore = sounds.filter(x => x.url.indexOf('hint') !== -1).length;
    for (let i = 0; i < 4; i++) {
      await waitForSilence();
      peek('tryPlace')(peek('round').order[0], null);
      await settle();
      advance(700);
      await settle();
      row(i === 0 ? 'the child taps the card the hand points at, 4x' : '');
    }
    const chimesAfter = sounds.filter(x => x.url.indexOf('hint') !== -1).length;

    await put(0, 'PLACE 1');
    await tick(20, '');
    await put(1, 'PLACE 2  (the Tutorial ends here)');
    await tick(36, '');
    await put(2, "PLACE 3  (Level 1's first, on the same screen)");
    await tick(24, '');

    console.log('\n   what moved, and when:');
    marks.forEach(m => console.log('   %s s  %s', (m[0] / 1000).toFixed(2).padStart(7), m[1]));

    const v = voices();
    const at = name => v.filter(x => label(x).indexOf(name) !== -1)[0];
    const chime = sounds.filter(x => x.url.indexOf('hint') !== -1)[0];
    const ask1 = at('askFirst'), good1 = at('goodFirst'), ask2 = at('askNext');
    const good2 = at('goodNext'), hand = at('handoff');
    const bannerAt = txt =>
      (marks.filter(m => m[1] === 'banner -> ' + txt)[0] || [null])[0];

    const P = peek('ROUNDS')[0].prompts;
    console.log('\n   the verdicts:');
    const line = (what, ok, detail) =>
      console.log('   %s  %s  %s', ok ? 'ok       ' : '<-- WRONG', what.padEnd(34), detail);

    line('hints land when she stops asking',
         !!(chime && ask1 && chime.at >= ask1.ended && chime.at - ask1.ended < 400),
         chime && ask1 ? (chime.at - ask1.ended) + 'ms after askFirst ends' +
                         ' (TEACH_LEAD_MS is ' + peek('TEACH_LEAD_MS') + ')'
                       : 'no chime, or no opening line');

    line('the demonstration is given once',
         chimesAfter === chimesBefore,
         (chimesAfter - chimesBefore) + ' extra chime(s) over four taps' +
         ' (0 is right - see the `taught` flag)');

    const b2 = bannerAt(P[1]);
    line('banner waits for the question',
         !!(b2 !== null && ask2 && good1 && Math.abs(b2 - ask2.at) < 700 &&
            b2 > good1.at + 500),
         b2 === null ? 'the banner never reached prompt 2'
                     : 'moved at ' + (b2 / 1000).toFixed(2) + 's, askNext starts at ' +
                       (ask2 ? (ask2.at / 1000).toFixed(2) : '-') + 's, the placement was ' +
                       (good1 ? (good1.at / 1000).toFixed(2) : '-') + 's');

    line('handover follows the 2nd placement',
         !!(hand && good2 && hand.at >= good2.at && hand.at - good2.ended < 400),
         hand && good2 ? 'goodNext at ' + (good2.at / 1000).toFixed(2) +
                         's -> handoff at ' + (hand.at / 1000).toFixed(2) + 's'
                       : 'no handover was spoken');

    /* DERIVED, NOT ZERO. The handover is two sentences and only the second is
       Level 1's question - and it is held past even that, to where inside that
       sentence she reaches the words the banner says, so it waits VO_SRC.handoff
       .bannerAt into the line rather than releasing on its first frame or on its
       sentence break - see ASK_ORDER_WORDS_AT in app.js. Read off the table rather than written down here: this assertion
       exists to catch the banner drifting off her voice, and a hard-coded offset
       would make it pass for a build where the two had drifted together. */
    const into = (VO_SRC.handoff.bannerAt || 0) * 1000;   // the table, peeked at line 660
    line('no hint while she is talking',
         overlaps.length === 0,
         overlaps.length
           ? overlaps.length + ' sample(s) - first at ' + (overlaps[0][0] / 1000).toFixed(2) +
             's: ' + overlaps[0][2] + ' under ' + overlaps[0][1]
           : 'nothing was ever pulsed at a child who could not act on it');

    const b3   = bannerAt(P[2]);
    line('banner reaches Level 1 with her',
         !!(b3 !== null && hand && Math.abs(b3 - (hand.at + into)) < 700),
         b3 === null ? 'the banner never reached prompt 3'
                     : 'moved at ' + (b3 / 1000).toFixed(2) + 's, handoff starts at ' +
                       (hand ? (hand.at / 1000).toFixed(2) : '-') + 's + ' +
                       (into / 1000).toFixed(2) + 's of Tutorial before she asks' +
                       (hand ? ' = ' + ((hand.at + into) / 1000).toFixed(2) + 's' : ''));

    console.log('\n   every line, and how many times:');
    const tally = {};
    v.forEach(x => { const k = label(x).replace('VOICE ', ''); tally[k] = (tally[k] || 0) + 1; });
    Object.keys(tally).forEach(k => console.log('   %s %d', k.padEnd(11), tally[k]));
    const rep = Object.keys(tally).filter(k => tally[k] > 1);
    console.log('   %s', rep.length ? '<-- WRONG  repeated: ' + rep.join(', ')
                                    : 'ok         nothing was said twice');
  },

  /* IS THERE EVER A VACANT PLACE IN THE BOX, and if so where and why.

     WHAT IT IS FOR. The box used to go empty as the child hung pictures on the
     line, and the refill (see admitNext in app.js) exists to stop that. Nothing
     measured whether it actually did, and twice it did not:

       once  the pool was one screen deep, which is enough only while every
             screen has as many cards as the box has places. The screens hold
             3-2-2-2-2 of the eleven, so the box thinned out and stayed thin - a
             vacant place from screen 2 onward. (It was 3-2-1-2-2-2 when this was
             found, and screen 3 - the one that brought a single picture - went
             two places short. That screen is gone; the shortfall it exposed is
             not, which is why this still runs.)
       once  buildRound's `keep` named only the incoming screen's cards, so a
             handover deleted the cards that had come in from the screens behind
             them and nulled their places.

     Both were reported by the user off a screenshot, not by any harness, which
     is the whole argument for this one existing.

     WHAT IT ASSERTS. Not "the box is always full" - that is not achievable and
     should not be: there are twelve pictures and three places, so the last of
     them cannot fill the box, and the ending needs a bare box to tip over. What
     it asserts is the invariant that separates a fault from an ending:

       THE FILLED PLACES ARE ALWAYS A PREFIX. No empty place ever sits between
       two cards. A gap in the middle is a missing card; a gap at the end is a
       row running out. See closeGaps().

     ...and, separately, that no place is vacant while the pool still holds a
     picture that was owed to it. */
  async trayfull() {
    console.log('\n=== is there ever a vacant place in the box? ===');
    console.log('   [a | b | c] is the three places; ____ is a place the child');
    console.log('   sees empty. pool= is what is still waiting off the right.\n');

    const shape = () => {
      const q = peek('queue') || [];
      return '[' + q.map(id => id || '____').join(' | ') + ']';
    };
    const pool = () => JSON.stringify(peek('nextPool') || []);
    /* A gap is an empty place with a card still to its RIGHT. */
    const gap = () => {
      const q = peek('queue') || [];
      const last = q.reduce((n, id, i) => (id ? i : n), -1);
      /* AN EMPTY BOX IS NOT A GAP, and the guard is not cosmetic: with no card
         at all `last` is -1, and slice(0, -1) counts from the END rather than
         returning nothing - so a bare box read as two gaps and failed a
         scenario whose whole last beat is the box being bare for the finale. */
      if (last < 1) return false;
      return q.slice(0, last).some(id => !id);
    };
    const owed = () => (peek('nextPool') || []).length > 0 &&
                       (peek('queue') || []).some(id => !id);

    const gaps = [], owes = [];
    const look = (where) => {
      if (gap()) gaps.push(where + '  ' + shape());
      if (owed()) owes.push(where + '  ' + shape() + ' pool=' + pool());
      console.log('   %s %s  pool=%s', where.padEnd(20), shape(), pool());
    };

    for (let sc = 0; sc < peek('ROUNDS').length; sc++) {
      const r = peek('round');
      if (!r) break;
      console.log('-- screen %d (%s): %d card(s), %d frame(s) to answer --',
                  peek('roundIndex') + 1, r.id, r.cards.length, r.order.length);
      look('on arrival');
      for (let i = 0; i < r.order.length; i++) {
        await waitForSilence();
        const want = r.order[i];
        if (!peek('cardSpecs').has(want)) {
          console.log('   !! %s has no spec - the harness has gone stale', want);
          break;
        }
        peek('tryPlace')(want, peek('activeSlot')());
        await settle();
        /* DERIVED: past the beat the refill waits for and the whole of its drop,
           so what is measured is where the box SETTLES, not a card mid-air. */
        advance(peek('ARRIVE_LEAD_MS') + 900);
        await settle();
        look('after ' + want);
      }
      for (let k = 0; k < 40; k++) { advance(500); await settle(); drain(); }
    }

    console.log('\n   the verdicts:');
    const line = (what, ok2, detail) =>
      console.log('   %s  %s  %s', ok2 ? 'ok       ' : '<-- WRONG', what.padEnd(38), detail);

    line('no gap between two cards', gaps.length === 0,
         gaps.length ? gaps.length + ' sample(s): ' + gaps[0]
                     : 'every empty place was at the right-hand end - a row ' +
                       'running out, not a missing card');
    line('no place left empty while one is owed', owes.length === 0,
         owes.length ? owes.length + ' sample(s): ' + owes[0]
                     : 'nothing was ever parked off the right edge while a ' +
                       'place stood empty');
  },

  async play(pace) {
    console.log('\n=== all %d screens, one card every %sms ===',
                peek('ROUNDS').length, pace);
    for (let s = 0; s < peek('ROUNDS').length; s++) {
      if (!await playScreen(pace)) break;
    }
    summary();
  },

  /* THE ESCALATION LADDER, rung by rung, which is the sheet's Incorrect
     Feedback column: 1st wiggles and says nothing, 2nd wiggles and she names
     the picture, 3rd wiggles and the right card pulses.

     EVERY RUNG IS CHECKED AFTER THE BOUNCE HAS FINISHED, because both of the
     things that are supposed to happen are deliberately held until then (see
     rejectCard) - so a check at the moment of the drop would report "nothing
     happened" on all three and look like a pass on the first. 900ms clears
     REJECT_MS's 760 with room; drop it below that and rungs 2 and 3 vanish. */
  async wrong() {
    console.log('\n=== three wrong answers, ~2s apart ===');
    const wrongOne = peek('round').order[2];        // belongs in the last slot
    const want = peek('round').order[0];            // ...and what slot 0 wants
    const rung = [];
    for (let i = 1; i <= 3; i++) {
      advance(1000);
      await settle();
      await waitForSilence();      // a real wrong drop can't land while she is talking
      console.log('   %s s  >> wrong attempt %d', (now / 1000).toFixed(2).padStart(7), i);
      const before = voices().length;
      peek('tryPlace')(wrongOne, 0);
      await settle();
      /* DERIVED, NOT 900. This was a literal that happened to clear REJECT_MS's
         760 by 140ms; the moment REJECT_MS moved to 1400 it stopped clearing it
         and all three rungs reported "(nothing)" - a harness failing the game
         for a change the game made on purpose. */
      advance(peek('REJECT_MS') + 140);             // past the bounce - see above
      await settle();
      drain();
      const said = voices().slice(before);
      rung.push({ i, spoke: said.map(s => label(s).replace('VOICE ', '')), hints: hints() });
      console.log('        after the bounce: %s  she started: %s', hints(),
                  rung[i - 1].spoke.length ? rung[i - 1].spoke.join(', ') : '(nothing)');
    }

    /* What each rung is owed. The hint is named by card, so this catches her
       naming the WRONG picture - which is what a mis-keyed vo table looks like,
       and which "she said something" would pass.

       UNDER --novo THE SECOND RUNG IS SUPPOSED TO BE SILENT. That flag fails
       every voiceover fetch, which is what file:// does to them, so there is no
       hint to play and playVO's fallback path is the thing under test instead:
       the pulse and the hand still have to work. Reporting a broken ladder here
       would be the harness crying wolf at its own flag, and a harness that does
       that once gets ignored the time it is right. */
    const expect = [
      { rung: 1, spoke: [],                                  pulse: 'pulse=0' },
      { rung: 2, spoke: NOVO ? [] : ['hint:r1-' + want],     pulse: 'pulse=0' },
      { rung: 3, spoke: [],                                  pulse: 'pulse=1' },
    ];
    if (NOVO) console.log('   (--novo: rung 2 is expected to be silent)');
    console.log('');
    expect.forEach((e, k) => {
      const got = rung[k];
      const okVoice = got.spoke.join(',') === e.spoke.join(',');
      const okPulse = got.hints.indexOf(e.pulse) === 0;
      console.log('   attempt %d: voice %s  pulse %s   %s', e.rung,
                  okVoice ? 'ok' : 'WRONG (wanted ' + (e.spoke.join(',') || '(nothing)') +
                                   ', got ' + (got.spoke.join(',') || '(nothing)') + ')',
                  okPulse ? 'ok' : 'WRONG (wanted ' + e.pulse + ', got ' + got.hints + ')',
                  okVoice && okPulse ? '' : '  <-- LADDER BROKEN');
    });

    console.log('\n=== then the right one ===');
    advance(1000);
    await settle();
    await waitForSilence();
    peek('tryPlace')(peek('round').order[0], 0);
    await settle();
    advance(500);
    await settle();
    drain();

    /* NOTHING ON THE SCREEN PULSES WHILE SHE IS TALKING - the rule, asserted
       head-on instead of hoped for.

       WHY IT IS STAGED AND NOT OBSERVED. Walking the ladder and watching for an
       overlap only catches one if the game happens to leave a rung up at the
       moment a line starts, which depends on the order tryPlace() does things
       in - so it would pass for the wrong reason the day that order changed.
       This puts all three pulses up in a silence, starts a line, and looks: the
       first sample says the board really was lit, the second says her opening
       word put it out. A run where the `before` column is already quiet is a
       broken test, not a passing one, which is why it is asserted too.

       THIS IS THE SECOND TIME THIS BUG WAS REPORTED. The first was a hint timer
       armed before she opened her mouth and never cancelled when she did, fixed
       for the tutorial and asserted in teach - see the overlaps note there. It
       came back on every other path at once, because say() cancelled what was
       OWED and never took down what was already up, and because the frame's own
       pulse had no witness at all (see framePulse). The user reported it twice:
       "only pulsate the options after the narrator voiceover has ended", and
       then "no thing will pulse on the screen when the narrator is speaking." */
    await waitForSilence();
    peek('resetIdle')();
    peek('pulseChoices')();
    peek('showHandNudge')();
    /* PAST THE ARM, AND DERIVED FROM IT. The frame's pulse is armed on a timer
       rather than set outright - paintSlots() waits PULSE_ARM_MS so that a
       caller which renders and then speaks on the same tick never flashes it -
       so on a fake clock the class does not exist until that timer is run.
       Read off the game: a literal here would fail the GAME the day the wait
       moved. */
    advance(peek('PULSE_ARM_MS') + 40);
    await settle();
    const lit = hints() + ' frame=' + framePulse();
    const wasLit = framePulse() > 0 || hints() !== 'pulse=0 hand=false';

    peek('say')('askFirst');
    await settle();
    const under = hints() + ' frame=' + framePulse();
    const wentOut = framePulse() === 0 && hints() === 'pulse=0 hand=false';

    /* ...and it all comes back when she stops, or the rule has been kept by
       breaking the hints. The frame is the one that must return by itself: the
       card pulse and the hand are re-armed on a clock and are SUPPOSED to be
       down for the tuned wait after her last word. */
    await waitForSilence();
    advance(peek('PULSE_ARM_MS') + 40);       // see above
    await settle();
    const after = 'frame=' + framePulse();
    const cameBack = framePulse() > 0;

    console.log('\n   the verdicts:');
    const v = (what, ok, detail) =>
      console.log('   %s  %s  %s', ok ? 'ok       ' : '<-- WRONG', what.padEnd(34), detail);
    v('the board was lit to begin with', wasLit, lit + '  (a quiet board here tests nothing)');
    v('her first word puts it all out',  wentOut, under);
    v('the frame pulses again after',    cameBack, after);
    drain();
  },

  /* GUESS WRONG, THEN STOP TOUCHING IT. The one sequence that had the two
     feedback ladders fighting each other, and the one nothing covered.

     THE BUG THIS EXISTS FOR. `wrong` walks the incorrect-attempt ladder without
     ever pausing, and `idle` sits still without ever guessing. Between them they
     hit every rung of both columns of the sheet and completely missed the case
     where a child does one and then the other - which is the ordinary case, and
     in which the idle timer handed over the answer four and a half seconds after
     the FIRST wrong guess. Rungs 2 and 3 never happened. It shipped that way
     through several builds of "the ladder is correct", because both harnesses
     agreed and neither was looking.

     WHAT IT ASSERTS NOW: that nine seconds of real stillness always buys the
     next rung, from any of the four states.

       0 wrong  the sheet's Idle Hint column: pulse at 9s, hand at 18s

     WHAT THE PULSE IS NOW. The quote below says "the correct option will show a
     pulse effect" and that has since been overruled - all three choices pulse,
     so stillness no longer buys the answer (see the hint-visuals note in
     app.js). This scenario is indifferent to it: what it asserts is that a rung
     ARRIVES, and it reads that off `hints() !== 'pulse=0 hand=false'`.
       1 wrong  the wiggle, then the same two rungs on the same clock
       2 wrong  the voice-over for the correct picture, then the same two
       3 wrong  the pulse is already up from the attempt itself, so the pause
                owes the hand and armIdle() goes straight to it

     AND IT USED TO ASSERT THE OPPOSITE FOR TWO OF THEM. Rows 1 and 2 read
     `hint: false` - "nothing visual, ever" - which was the idleMayHint() gate,
     written when the first rung came after 4500ms and so arrived while a child
     was still thinking about their next guess. The user asked for the other
     behaviour once the wait was nine seconds: "after 9 seconds the correct
     option will show a pulse effect. If the user still doesn't do anything after
     9 seconds, the hand ghost effect will come." See the note where
     idleMayHint() used to be, in app.js.

     Sixty virtual seconds at each of the four, on all four screens: long enough
     to clear 9 + 9 with room, so a row that reports `nothing, all 60s` is a real
     failure and not a short window. */
  async stall() {
    console.log('\n=== guess wrong, then stop touching it ===');
    console.log('   nine seconds of stillness buys one rung, from any state.');
    console.log('   60 virtual seconds of stillness after 0, 1, 2 and 3 wrong');
    console.log('   guesses, cycled over every story position.\n');

    /* What 60s of stillness must put on the screen, by how many wrong guesses
       came first. All four now, and the `firstAt` column is where the real
       information is: it should read ~9s, except at 3 wrong where the attempt
       has already pulsed. */
    const WANT = {
      0: { hint: true,  why: 'nothing guessed - the sheet\'s Idle Hint column' },
      1: { hint: true,  why: 'wiggle, and then 9s of stillness buys the pulse' },
      2: { hint: true,  why: '...the voice-over, and 9s of stillness buys it too' },
      3: { hint: true,  why: 'the 3rd attempt earned the pulse outright' },
    };

    console.log('   screen  frame  wrong  what 60s of stillness showed        verdict');
    let bad = 0, pos = 0;

    for (let sc = 0; sc < peek('ROUNDS').length; sc++) {
      if (!peek('round')) break;
      /* THE EMPTY FRAMES ONLY. A screen's leading frames arrive already
         answered - the line carries those pictures across the seam - so the
         frames this screen can be stalled on are its own order's. */
      for (let slot = 0; slot < peek('round').order.length; slot++) {
        const at = peek('activeSlot')();
        if (at === -1) break;
        const n    = pos % 4;                       // cycle 0,1,2,3 over them all
        /* THE GAME'S OWN LOOKUP, not order[at]. A slot index is not an index into
           `order`: a screen's leading frames arrive answered, so the two are
           offset by the carried count (see anchorCount in app.js). Reading
           order[at] aimed the wrong picture at every anchored frame and ran off
           the end of the array on the last one, which reached rejectCard() with
           an undefined card. */
        const want = peek('expectedCardFor')(at);
        pos++;

        /* Something to be wrong with. `id &&` because a place the tray has
           emptied and not yet refilled is a null in `queue`, and a null is not a
           card - picking it up would hand tryPlace() nothing and report the row
           as a filled-frame attempt that never happened. See admitNext().

           WHAT THE TRAY NOW HOLDS AT A SCREEN'S LAST FRAME. It used to be down
           to the one right card, so the only incorrect attempt left there was
           that card into a frame that is already full. The tray refills from the
           NEXT screen now, so on every screen but the last there is a real wrong
           card at every frame; the last screen has nothing after it to refill
           from, so its final frame is still the filled-frame path. Both are
           exercised. */
        const other  = peek('queue').find(id => id && id !== want);
        const card   = other || want;
        /* ...and with no wrong card to be had, any OTHER frame. On every screen
           but the first that is a carried picture's frame, which is filled, and a
           drop onto a filled frame is an incorrect attempt. */
        const aimAt  = other ? at
                             : peek('filled').findIndex((_, k) => k !== at);

        for (let k = 0; k < n; k++) {
          await waitForSilence();    // can't land a guess while the last hint is still playing
          peek('tryPlace')(card, aimAt);
          await settle();
          /* DERIVED, NOT 1300 - see the note in `wrong`. With REJECT_MS at 1400
             a flat 1300 stops short of the hint it is waiting for, and all
             twelve rows report "(0 hints)". */
          advance(peek('REJECT_MS') + 140);         // past REJECT_MS and the bounce
          await settle();
        }
        drain();

        /* ...and then nothing. No resetIdle() here on purpose: the child's last
           act was the guess, and rejectCard() already restarted the clock. An
           extra reset would clear the pulse the 3rd attempt just earned, which
           is the harness wiping what it came to measure. */
        let everHinted = false, firstAt = null;
        for (let t = 1; t <= 60; t++) {
          advance(1000);
          await settle();
          if (hints() !== 'pulse=0 hand=false') {
            if (!everHinted) firstAt = t;
            everHinted = true;
          }
        }
        drain();

        const w  = WANT[n];
        const ok = everHinted === w.hint;
        if (!ok) bad++;
        console.log('   %s  %s  %s  %s  %s  %s',
                    String(sc + 1).padStart(6),
                    String(at + 1).padStart(5),
                    String(n).padStart(5),
                    (everHinted ? 'hints up from ~' + firstAt + 's' : 'nothing, all 60s').padEnd(34),
                    ok ? 'ok       ' : '<-- WRONG',
                    w.why);

        await waitForSilence();
        peek('tryPlace')(want, at);                 // move on
        await settle();
        advance(900);
        await settle();
        drain();
      }
      for (let k = 0; k < 40; k++) { advance(500); await settle(); drain(); }
    }

    console.log('\n%s', bad
      ? bad + ' case(s) WRONG - a child who stopped touching the screen was left with nothing'
      : 'every case correct: nine seconds of stillness always buys the next rung.');
  },

  /* EVERY HINT IN THE GAME, by being wrong twice at every single story position.
     `wrong` only ever reaches the first of them, and the first one is the one
     that cannot catch the mistake this table is actually exposed to.

     THE MISTAKE IT IS FOR. The sheet numbers screens 1-12 and the hints are
     dialogues 13-24 in that order, but a card's place in the game is its place
     in `order` and the ROUNDS arrays are written in TRAY order - which differs
     on rounds 2, 3 and 4. Read the sheet against the wrong one of those two and
     three cards get another card's sentence. Every one of those three would
     still play a Hindi sentence in the right voice at the right moment, so
     nothing about it sounds broken; it is only wrong if you know which picture
     was being asked for. That is what the `want` column here is.

     AND THE SECOND FORM OF THE SAME MISTAKE, which this harness committed itself
     until story 6 left the game. The dialogue number printed below used to be
     12 + the running story position, which is only the sheet's numbering while
     the game holds all twelve of the sheet's pictures in the sheet's order. It
     does not: r2 hurt is gone (see the windowing note over ROUNDS in app.js), so
     that sum named dialogue 18 for `cart`, whose recording is 19, and was one
     out for every card after it. It is read off the card's own `vo` path now,
     which is the only place in this game that actually decides which file plays.

     It cannot check that the RECORDING says what the table claims - no harness
     can hear - so it checks the two things it can: that the file is the one the
     mapping names, and that the mapping is read off `order`. The words are in
     the table in app.js's narrator section, against the file numbers. */
  async hints() {
    if (NOVO) {
      console.log('\n--novo fails every voiceover fetch, so there are no hints to check.' +
                  '\nRun this one without it; `wrong --novo` covers the no-recording path.');
      return;
    }
    console.log('\n=== wrong twice at every story position, to hear every hint ===');
    const rows = [];
    let storyAt = 0;
    for (let sc = 0; sc < peek('ROUNDS').length; sc++) {
      const r = peek('round');
      if (!r) break;
      console.log('\n-- screen %d (%s) --', peek('roundIndex') + 1, r.id);
      for (let i = 0; i < r.order.length; i++) {
        const want = r.order[i];
        /* A RUNNING STORY POSITION, and it is no longer sc * 3 + i + 1: the line
           carries pictures across a seam, so the screens hold 3-2-2-2-2 rather
           than four threes. It is what this table is ORDERED by and nothing else
           - the dialogue number is not derived from it, see `file` below and the
           note at the top of this scenario. */
        const screen = ++storyAt;
        /* THE RECORDING THE CARD ITSELF NAMES. Reading it off the card is the
           only derivation that cannot drift when the story is re-windowed; every
           positional one can, and one of them did. */
        const spec = r.cards.find(k => k.id === want);
        const file = (spec && /Dialogue%20(\d+)/.exec(spec.vo || '') || [])[1];
        /* Only a card still in the TRAY can be got wrong. A placed one is
           refused at pointerdown (filled.includes(id)), so picking `other` off
           `order` rather than off `queue` would drag a card back out of a frame
           it is already fixed in - which is not a thing a child can do, and
           would make this harness report on a state the game cannot be in. */
        const other = peek('queue').find(id => id && id !== want);

        /* THE THIRD FRAME OF EVERY SCREEN USED TO BE A BLANK ROW HERE, and the
           note that stood in its place said the hint "cannot be reached by any
           sequence of play". That was true of the code at the time and it is a
           good example of a negative claim outliving what made it true: two
           cards are placed, the tray holds exactly the right one, so there is
           no wrong CARD - but there was never a rule that an incorrect attempt
           had to be a wrong card. Putting the one card you have into a frame
           that is already full is an incorrect attempt too, and tryPlace()
           counts it now, so every row is reachable.

           So this drops the last card on a FILLED frame when there is nothing
           else to be wrong with. `at` is the frame the drop is aimed at, and it
           is deliberately not `i`. */
        const wrongCard = other || want;
        /* THE FRAME THIS SCREEN IS ACTUALLY ASKING ABOUT, which is not `i`: a
           screen's leading frames arrive already answered, so the empty one is
           offset by however many pictures were carried over. */
        const active = peek('activeSlot')();
        /* ...and when there is no wrong CARD to be had, any OTHER frame. On every
           screen but the first that is the carried picture's frame, which is
           filled - and a drop onto a filled frame is an incorrect attempt, which
           is what keeps this row reachable. See the note above. */
        const at = other ? active
                         : peek('filled').findIndex((_, k) => k !== active);

        {
          advance(600);
          await settle();
          const before = voices().length;
          /* BOTH WAITS ARE DERIVED. They were 900 - REJECT_MS's old 760 plus a
             margin - and the moment REJECT_MS became 1400 neither cleared the
             beat it was waiting for, so every row reported "(0 hints)" and the
             harness failed the game for a change the game meant. */
          const past = peek('REJECT_MS') + 140;
          await waitForSilence();       // can't land a guess while she is still asking
          peek('tryPlace')(wrongCard, at);                // 1st: nothing is owed
          await settle();
          advance(past);
          await settle();
          await waitForSilence();
          peek('tryPlace')(wrongCard, at);                // 2nd: the hint
          await settle();
          advance(past);
          await settle();
          drain();
          const said = voices().slice(before).map(s => label(s).replace('VOICE ', ''));
          const hint = said.filter(n => n.indexOf('hint:') === 0);
          rows.push({ screen, file, want: 'r' + (sc + 1) + '-' + want,
                      how: other ? 'wrong card' : 'right card, filled frame',
                      got: hint.length === 1 ? hint[0].slice(5)
                                             : '(' + hint.length + ' hints)' });
        }

        advance(600);
        await settle();
        await waitForSilence();
        peek('tryPlace')(want, peek('activeSlot')());     // ...then get it right
        await settle();
        advance(200);
        await settle();
        drain();
      }
      for (let k = 0; k < 30; k++) { advance(500); await settle(); drain(); }
    }

    console.log('\n   screen  file          frame asked for   she named        ' +
                '  how it was got wrong');
    let bad = 0;
    rows.forEach(r => {
      const ok = r.got === r.want;
      if (!ok) bad++;
      console.log('   %s  %s  %s  %s%s  %s', String(r.screen).padStart(6),
                  ('Dialogue ' + (r.file || '?')).padEnd(13), r.want.padEnd(16),
                  r.got.padEnd(16), ok ? '' : '  <-- WRONG PICTURE', r.how);
    });
    console.log('\n%d of the %d hints named the picture the frame was asking for.%s',
                rows.length - bad, rows.length, bad ? ' ' + bad + ' DID NOT.' : '');
    console.log('All %d are reachable. The `how` column says which incorrect attempt' +
                '\neach row took: a wrong CARD wherever the tray has one, and a drop onto a' +
                '\nFILLED frame where it does not. Only the LAST screen needs the second' +
                "\nkind - every earlier screen's tray is refilled from the screen after it," +
                '\nso a wrong card is available at all three frames. See admitNext().',
                rows.length);
  },

  async skip() {
    console.log('\ndev bar hidden? %s   button: "%s"', ids.devbar.hidden, ids.devSkip.textContent);
    console.log('\n=== skip, three times, each one mid-sentence ===');
    for (let i = 0; i < 3; i++) {
      console.log('   speaking? %s   -> click', peek('speaking()'));
      ids.devSkip.fire('click');
      await settle();
      console.log('   now on screen %s, button: "%s"', peek('roundIndex') + 1, ids.devSkip.textContent);
      advance(3000);
      await settle();
      drain();
    }
    console.log('\n=== left alone here for 15s ===');
    advance(15000);
    await settle();
    drain();
  },

  /* The post game, driven straight rather than through twelve correct drags -
     which is what ?dev=post does in the browser. The finale cannot run here
     (canPlayType is '' so playEntry bails), so its seam never fires and this
     stands in for it. */
  async post() {
    const P = peek('window').AARU_POST;
    if (!P) { console.log('AARU_POST missing - the post game did not load'); return; }

    console.log('\n=== running it ===');
    P.playPostGame();
    await settle();
    console.log('   running=%s  overlay hidden=%s  banner: %s',
                P.running(), ids.recap.hidden, ids.prompt.textContent || '(empty)');

    for (let k = 0; k < 20; k++) {
      advance(500);
      await settle();
      drain();
    }

    console.log('\n=== where it ended up ===');
    console.log('   classes        : %s', ids.recap.className || '(none)');
    /* NOTHING IS DRAWN ON THIS SCREEN ANY MORE. The badge went first and the
       confetti after, both at the user's request, so the overlay is a marker
       rather than decoration. What is left to check is the banner, the cue, that
       the overlay comes up, and that the guard holds. */
    console.log('   overlay shown  : %s', !ids.recap.hidden);


    /* THE ENDING'S OWN CUES, and the list grew with the ending. It was
       all-done|thud, from when those were the only two things that sounded on this
       screen - and all-done has since been taken out of the game, so `thud` is the
       only one of that pair left. `formed` marks the ring closing, `cheer` is the children on the
       confetti, and `ride` fires once per picture as each one comes in from the
       left - all three were silent beats before. Printing them here is how their
       ORDER is checked at all: the whole arrangement of this screen is that the
       ring closes, then the recap runs, then the celebration, one after another. */
    const v = sounds.filter(s => /thud|formed|cheer|ride/.test(s.url));
    console.log('\n=== the sounds it makes ===');
    v.forEach(s => console.log('   %s s  %s', (s.at / 1000).toFixed(2).padStart(7), label(s)));

    console.log('\n   idempotent? calling it again ->');
    const banner = ids.prompt.textContent;
    const before = sounds.length;
    P.playPostGame();
    await settle();
    console.log('     running=%s, sounds %d -> %d, banner held %s   %s',
                P.running(), before, sounds.length,
                ids.prompt.textContent === banner,
                sounds.length === before ? '(no restart - good)' : '<< RESTARTED');
  },

  /* THE WHOLE ENDING, which no other scenario reaches. The others leave
     canPlayType returning '' so playEntry() bails to its degraded path; this
     one makes the ENTRY element alone playable, so the ride, the box topple,
     the drop arc and the landing all run on the virtual clock. The celebration
     element stays unplayable, because every other scenario depends on that.

     It does NOT use playScreen() for the last round. playScreen ends with
     30 x 500ms of settling, which is fifteen seconds - the entire finale
     happens inside it and is over before the caller gets control back. That is
     why the `last` scenario watches a silent board: it looks after the fact.

     No backslash appears anywhere below, on purpose. This file gets patched by
     scripts, and an escaped sequence has been eaten in transit once already. */
  async finale() {
    ids.entry.canPlayType = () => 'probably';
    /* AND THE ALPHA GATE, which canPlayType no longer decides on its own. The
       game measures whether a decoded frame actually carries transparency - see
       alphaVideoUsable() and probeAlphaVideo() in app.js - because Safari says
       "probably" to vp9 and then discards the alpha, which put an opaque box
       behind Aaru on a phone. There is no real canvas in here to measure, so the
       probe settles on its safe default of "no" and every clip site would take
       its degraded path: this scenario exists to walk the path where he IS
       shown, so it says so outright. */
    peek('alphaVideoOK = true');

    console.log('');
    console.log('=== the numbers it runs on ===');
    /* endingPauseMs() IS A CALL AND NOT A CONSTANT, and it is first in the list
       because it is the number the whole ending hangs off now: how long the board
       is held after the third card so the celebration can finish before the box
       goes over. It is derived from round-done.wav and applause.wav, so it is
       printed rather than assumed - re-render either and this moves. */
    ['endingPauseMs()',
     'BOX_TOPPLE_AT', 'BOX_IMPACT', 'DROP_HOLD_MS', 'DROP_ARC_MS', 'DROP_RISE',
     'DROP_DRIFT', 'DROP_TILT', 'CROUCH_MS', 'YAAY_MS', 'FLOOR_Y',
     'ENTRY_FROM_X', 'ENTRY_REST_X'
    ].forEach(k => console.log('   %s = %s', k.padEnd(16), peek(k)));

    console.log('');
    console.log('=== every screen but the last ===');
    for (let s = 0; s < peek('ROUNDS').length - 1; s++) {
      if (!await playScreen(1500)) break;
    }

    console.log('');
    console.log('-- the last screen, and then straight on into the finale --');
    const r = peek('round');
    for (let i = 0; i < r.order.length; i++) {
      advance(1200); await settle();
      await waitForSilence();
      peek('tryPlace')(r.order[i], peek('activeSlot')());
      await settle();
      advance(200); await settle();
    }
    /* THE CELEBRATION'S LAST MOMENT, read before seen moves past it. This screen
       fires the cue at the placement rather than onto a boy who walks on, so the
       flourish and the classroom behind it are already in `sounds` - and the
       ending must not make a sound until they are both done. The gap is printed
       with the sequence below; endingPauseMs() in app.js is what buys it. */
    const celebOut = sounds
      .filter(s => s.url.indexOf('round-done') !== -1 ||
                   s.url.indexOf('applause') !== -1)
      .reduce((m, s) => Math.max(m, s.ended), 0);
    seen = sounds.length;

    /* Read the two numbers back out of the transform placeEntry() and the drop
       both write. indexOf/split rather than a regex - see the note above. */
    /* THE STAGE COMES BACK OFF. .entry's box is parked one whole stage up and to
       the left so that a dropped transform draws him off the board rather than
       in the corner (see the note on .entry in styles.css), and placeEntry()
       adds STAGE_W/STAGE_H to every transform to compensate. Everything printed
       below is in BOARD coordinates, so this takes them off again - without it
       every x here reads 1920 too far right and the ride looks like it starts
       at 4240. */
    const xy = () => {
      const t = ids.entry.style.transform || '';
      const i = t.indexOf('translate3d(');
      if (i < 0) return [null, null];
      const p = t.slice(i + 'translate3d('.length, t.indexOf(')', i)).split(',');
      return [parseFloat(p[0]) - peek('STAGE_W'), parseFloat(p[1]) - peek('STAGE_H')];
    };
    const tray = () => classOnly.tray.className;

    const t0 = now, trace = [];
    /* THE CLOUD'S CANVAS, held onto as it goes past. boxDust() takes it off the
       board when the last grain dies, so a report that went looking for it after
       the loop would find an empty host and call a cloud that ran perfectly
       "never drawn". */
    let dustCv = null;
    /* 560 samples at 40ms is 22.4s from the last card, and the ending now runs to
       about 15.2s: the celebration it is held behind (see endingPauseMs), then
       the ride, DROP_HOLD_MS, DROP_ARC_MS, CROUCH_MS and YAAY_MS.
       This has been short TWICE as the beats were slowed - both times it reported
       "the snap never appeared" for a snap that fires after it stops looking. If
       the beats lengthen again, lengthen this first. IT WAS 420 (16.8s) until the
       ending was held back for the celebration to finish, which is 3.7s of it. */
    for (let k = 0; k < 560; k++) {
      advance(40);
      await settle();
      const pos = xy();
      if (ids.boxDust.children[0]) dustCv = ids.boxDust.children[0];
      const t = ids.entry.style.transform || '';
      const si = t.indexOf('scale(');
      trace.push({ t: now - t0, x: pos[0], y: pos[1],
                   ride:    ids.entry.classList.contains('is-riding'),
                   gone:    ids.entry.style.display === 'none',
                   tipping: tray().indexOf('is-toppling') !== -1,
                   /* BOTH HALVES OF THE BANNER, so a change that takes the
                      sentence away and leaves the pink box behind it cannot
                      pass. */
                   banner: classOnly.banner.className.indexOf('is-away') !== -1 &&
                           ids.prompt.className.indexOf('is-away') !== -1,
                   land:    ids.finaleLand.classList.contains('is-on'),
                   cheer:   ids.finaleCheer.classList.contains('is-on'),
                   snap:    ids.finaleSnap.classList.contains('is-on'),
                   going:   ids.finaleLand.classList.contains('is-going') ||
                            ids.finaleCheer.classList.contains('is-going'),
                   ropeUp:  ids.rope.classList.contains('is-finale'),
                   heRaised: ids.entry.classList.contains('is-finale'),
                   dust:    ids.finaleDust.classList.contains('is-on'),
                   /* THE IMPACT is `is-down`, not `is-on` - the cloud is armed
                      DUST_LEAD_MS before the slab lands because the squeeze film
                      leaves ahead of it. Reading `is-on` as the impact would put
                      the box on the floor 90ms early. See boxDust(). */
                   boxDust: ids.boxDust.classList.contains('is-down'),
                   dustLead: ids.boxDust.classList.contains('is-on'),
                   /* THE LEAN, off the transform the drop writes. It is on the
                      riding clip until FALL_SWAP_AT and on the fall pose after
                      it, so both are read and whichever is showing wins - a
                      check that only watched one of them would see zero for the
                      half of the arc it was not looking at. */
                   spin:    (function () {
                              const src = ids.finaleFall.classList.contains('is-on')
                                ? (ids.finaleFall.style.transform || '')
                                : (ids.entry.style.transform || '');
                              const i = src.indexOf('rotate(');
                              return i < 0 ? null : parseFloat(src.slice(i + 7));
                            })(),
                   /* THE LAST ANGLE THE ARC WROTE, read whether or not the pose
                      is still showing. `spin` above goes null the moment land()
                      takes is-on off, so the closest thing to "the angle he met
                      the floor at" it can offer is the last 40ms SAMPLE - which
                      lands somewhere around p=0.97 and reported 1.5 degrees for
                      a curve that is 0.000 at p=1. That is a harness artefact
                      being read as a defect, and it sat one rounding away from
                      printing a failure for correct code. The element keeps its
                      final transform after the class comes off, so this reads
                      the real endpoint. */
                   spinHeld: (function () {
                              const src = ids.finaleFall.style.transform || '';
                              const i = src.indexOf('rotate(');
                              return i < 0 ? null : parseFloat(src.slice(i + 7));
                            })(),
                   /* THE BURST, not the old #finaleSpark. That element and its
                      glow were removed once the snap had a real sound: two
                      golden lights 240ms apart at one spot read as the light
                      flashing twice. magicSnap()'s burst is the light now, and
                      FORM_LEAD is 0 so it lands on this same frame. */
                   spark:   ids.postMagic.classList.contains('is-on'),
                   pose:    ids.finaleFall.classList.contains('is-on'),
                   poseTop: parseFloat(ids.finaleFall.style.top || 'NaN'),
                   poseLeft:parseFloat(ids.finaleFall.style.left || 'NaN'),
                   /* the stretch, and the shadow it is falling toward */
                   sy:      si < 0 ? null
                            : parseFloat(t.slice(t.indexOf(',', si) + 1)),
                   shO:     parseFloat(ids.finaleShadow.style.opacity || '0'),
                   shS:     (function (v) {
                              const i = v.indexOf('scale(');
                              return i < 0 ? null : parseFloat(v.slice(i + 6));
                            })(ids.finaleShadow.style.transform || '') });
    }

    console.log('');
    console.log('=== every sound the ending made ===');
    const endSounds = drain();

    /* THE USER'S NOTE ON THIS BEAT: the celebration and the box drop were
       "getting collided". They are two events - the story finished, and then the
       board clearing - and two events that overlap read as one noise, so the
       first sound of the ending has to land clear of the crowd's last. It is 400
       (ENDING_GAP_MS) less the haul's own lead, and nothing on screen can show
       it: a gap between two sounds is only visible to a harness that holds both
       of their clocks. A NEGATIVE number here is the collision coming back. */
    const firstEnd = endSounds.reduce((m, s) => Math.min(m, s.at), Infinity);
    const celebGap = Math.round(firstEnd - celebOut);
    console.log('   celebration ends  : %sms after the last card',
                Math.round(celebOut - t0 + 200));
    console.log('   ending opens      : %sms   %s',
      Math.round(firstEnd - t0 + 200),
      !isFinite(firstEnd)
        ? '<< THE ENDING MADE NO SOUND AT ALL'
        : celebGap >= 0
          ? celebGap + 'ms of clear air after the celebration - good'
          : '<< THE ENDING SOUNDS INSIDE THE CELEBRATION by ' + (-celebGap) + 'ms');

    const at = (f) => { const s = trace.find(f); return s ? s.t : null; };
    const ms = (v) => v === null ? 'NEVER' : v + 'ms';
    const rode = trace.find(s => s.ride);
    const tRope = at(s => s.ropeUp);
    const tRaise = at(s => s.heRaised);
    console.log('   he is raised   : %s   %s', ms(tRaise),
                tRaise !== null ? '(above every other layer on the board - good)'
                                : '<< HE WAS NEVER RAISED');
    /* THE LINE MUST STAY BEHIND HIM. It was lifted in front for one build and
       drew straight across his knuckles - a rope through his fists. Asserted the
       other way now, so nobody lifts it again. */
    console.log('   line behind him: %s', tRope === null
      ? 'yes - his fingers wrap it, as they should'
      : '<< THE LINE WAS LIFTED IN FRONT OF HIM at ' + tRope + 'ms');

    console.log('');
    console.log('=== the sequence ===');
    console.log('   rides in from     : x=%s   (ENTRY_FROM_X=%s)',
                rode ? rode.x : 'HE NEVER RODE', peek('ENTRY_FROM_X'));
    /* BOX_TOPPLE_AT is measured from the HAUL now, and t0 here is the last card
       placed - so the printed figure is later than the constant by the round
       pause, and is not meant to equal it. What matters is the ORDER: the box
       tips, the box lands, and only then does he ride in. */
    const tRide = at(s => s.ride);
    const tTipS = at(s => s.tipping), tBoxDust = at(s => s.boxDust);
    console.log('   box starts tipping: %s   (BOX_TOPPLE_AT=%s into the haul)',
                ms(tTipS), peek('BOX_TOPPLE_AT'));
    /* NOTHING HITS ANYTHING ON THE STILL PATH, and that is the design rather
       than a hole in it: with motion turned down the box does not fall, it is
       simply not on the board, so there is no impact frame to hang dust or a
       `puff` on. toppleBox() takes that branch on purpose - see the note in the
       reduced-motion block in styles.css. */
    console.log('   box hits the floor: %s   %s', ms(tBoxDust),
                STILL ? '(no fall on this path - the box is simply not there)'
                      : '(BOX_IMPACT=' + peek('BOX_IMPACT') + ' of --box-topple-ms)');
    reportDust(trace, dustCv, tBoxDust);
    /* THE BEAT THE USER ASKED FOR: the board clears, the box comes down, and he
       arrives after it rather than on top of it. A negative gap here is the old
       arrangement coming back - the box folding away underneath a boy who is
       already swinging. */
    console.log('   he arrives         : %s   %s', ms(tRide),
      STILL
        ? '(no ride on this path - he is already on the line)'
        : (tRide !== null && tBoxDust !== null)
          ? (tRide > tBoxDust
              ? 'the ride starts ' + (tRide - tBoxDust) + 'ms after the box lands - good'
              : '<< HE IS ALREADY ON THE LINE WHEN THE BOX LANDS by '
                + (tBoxDust - tRide) + 'ms')
          : '<< one of the two never happened');
    console.log('   riding clip cut   : %s   (FALL_SWAP_AT=%s of the arc)',
                ms(at(s => s.gone)), peek('FALL_SWAP_AT'));
    console.log('   landing pose on   : %s', ms(at(s => s.land)));
    console.log('   cheer pose on     : %s   (CROUCH_MS=%s after the landing)',
                ms(at(s => s.cheer)), peek('CROUCH_MS'));
    console.log('   snap  pose on     : %s   (YAAY_MS=%s after that, and held)',
                ms(at(s => s.snap)), peek('YAAY_MS'));
    console.log('   landing pose off  : %s   %s', ms(at(s => s.cheer && !s.land)),
                at(s => s.cheer && s.land) === null
                  ? '(never both at once - good)'
                  : '<< BOTH POSES WERE ON TOGETHER');

    /* THE ORDERING, which is the contract and which reduced motion broke: the
       box has to be gone before he lands, because he is falling onto the floor
       it was standing on. Under --still it used to tip over 200ms after he was
       already down. */
    const tTip = at(s => s.tipping), tLand = at(s => s.land);
    console.log('   %s', (tTip !== null && tLand !== null && tTip < tLand)
      ? 'the box goes ' + (tLand - tTip) + 'ms before he lands - good'
      : '<< HE LANDS BEFORE THE BOX FALLS - he ends up on the floor while the '
        + 'box tips over beside him');

    /* HE LANDS SQUARE, and this is the check the old arrangement could not have
       passed. The drop leans him DROP_TILT degrees and then unwinds it, so the
       last airborne frame and the crouch that replaces it are at the same angle;
       it used to arrive at DROP_SPIN=26 and hand over to a pose drawn upright,
       which is a 26-degree snap on the impact frame. Both ends and the peak, so
       a curve that stopped unwinding would be caught as well as one that never
       leaned. */
    /* DROP FRAMES ONLY. `sy` is parsed out of the scale() the drop writes and
       the ride never writes, so it is what separates the two - and it matters,
       because the ride leans him up to ENTRY_LEAN degrees of its own. Reading
       every frame reported an 18.4 degree peak for a 13 degree constant, which
       was the swing's lean being counted as the fall's. */
    const spins = trace.filter(s => s.spin !== null && !isNaN(s.spin)
                                 && (s.pose || s.sy !== null))
                       .map(s => s.spin);
    const spinPeak = spins.length ? Math.max.apply(null, spins.map(Math.abs)) : null;
    /* THE ANGLE HE MET THE FLOOR AT, taken from the first frame on which the
       landing pose is up - by then the arc has written its p=1 transform and
       nothing else will touch it. Not the last frame the fall pose was ON: that
       is a 40ms sample short of the end and reports a degree or so of lean that
       the code does not have. */
    const spinEnd  = (function () {
      const i = trace.findIndex(s => s.land);
      if (i >= 0 && trace[i].spinHeld !== null && !isNaN(trace[i].spinHeld)) {
        return trace[i].spinHeld;
      }
      const f = trace.filter(s => s.pose && s.spin !== null && !isNaN(s.spin));
      return f.length ? f[f.length - 1].spin : null;
    })();
    console.log('   the lean : peaks %s deg, ends %s deg   %s',
                spinPeak === null ? '?' : spinPeak.toFixed(1),
                spinEnd  === null ? '?' : spinEnd.toFixed(1),
                spinEnd === null
                  ? '(no fall on this path)'
                  : Math.abs(spinEnd) < 1.5 && spinPeak > 4
                    ? '(leans out and comes back square for the landing - good)'
                    : Math.abs(spinEnd) >= 1.5
                      ? '<< HE MEETS THE FLOOR AT ' + spinEnd.toFixed(1)
                        + ' DEG and the crouch that replaces him is drawn upright'
                      : '<< NO LEAN AT ALL - the fall is a hang that moves');

    /* THE FALL, which is the thing that was wrong twice: once because it never
       ran at all, once because DROP_RISE equalled the whole descent so he rose
       as far as he fell. Samples from after the ride up to the cut. */
    /* Frames of the FALL, and getting this right took two goes. Not `!s.ride`:
       is-riding is not taken off until land(), which is after the arc, so that
       matched nothing and reported "the arc never ran" while it ran fine. Not
       `x < ENTRY_REST_X` either: that caught fifty frames of him hanging still
       before he let go, so the fall was mostly not a fall.

       What isolates it is MOVEMENT. Walk back from the cut while each frame's y
       differs from the one before it, and stop where he was still. */
    /* THE END OF THE ARC IS THE LANDING, not `gone`. `gone` is the riding clip
       being hidden, which now happens at FALL_SWAP_AT - partway down - because
       the fall POSE replaces it there. The clip's transform keeps being written
       for the whole arc even while it is hidden, so it is still the thing to
       measure the fall by; only the window changed. This reported "the arc did
       not run" for a perfectly good arc until it was fixed. */
    const iCut = trace.findIndex(s => s.land);
    let end = iCut < 0 ? trace.length - 1 : iCut;
    const moved = (i) => (i > 0 && trace[i].y !== null && trace[i - 1].y !== null &&
                          Math.abs(trace[i].y - trace[i - 1].y) > 0.5);
    /* SKIP BACK OVER THE FRAMES WHERE HE HAS ALREADY STOPPED. The arc finishes a
       frame or two before the landing FLAG appears - the transform reaches its
       final value, then land() runs on the next rAF - so starting the walk at the
       flag starts it on a static frame and it stops immediately. That reported
       "the arc did not run" for a good arc three separate times, once for each
       change to the beat timings. */
    while (end > 1 && !moved(end)) end--;
    let start = end;
    while (start > 1 && trace[start].y !== null && trace[start - 1].y !== null &&
           Math.abs(trace[start].y - trace[start - 1].y) > 0.5) start--;
    const arc = trace.slice(start, end + 1).filter(s => s.y !== null);

    console.log('');
    if (arc.length > 4) {
      console.log('=== the fall, %d frames over %dms ===',
                  arc.length, arc[arc.length - 1].t - arc[0].t);
      console.log('   y : %s', arc.map(s => s.y.toFixed(0)).join(' -> '));

      const rise = arc[0].y - Math.min.apply(null, arc.map(s => s.y));
      const fall = arc[arc.length - 1].y - arc[0].y;
      console.log('   rises %s px, then falls %s px   (DROP_RISE=%s)',
                  rise.toFixed(1), fall.toFixed(1), peek('DROP_RISE'));

      /* Where his feet finish. This is the number the two still poses are
         positioned against, so if it drifts they are hanging in the air. */
      const want = peek('FLOOR_Y') - peek('entryMetrics()').feetBelowGrip;
      const got = arc[arc.length - 1].y;
      console.log('   ends at y=%s, wants %s   %s', got.toFixed(1), want.toFixed(1),
                  Math.abs(got - want) < 1.5 ? '(on the floor - good)'
                                             : '<< HE IS NOT ON THE FLOOR');

      /* ACCELERATION, measured so the sampling rate cannot fake it: mean speed
         over the first half of the descent against the last half. Frame-to-
         frame dy is worthless here - samples every 40ms against an rAF cadence
         land at different phases of the arc and the differences alternate. */
      const desc = arc.filter(s => s.y >= arc[0].y);
      if (desc.length > 4) {
        const mid = Math.floor(desc.length / 2);
        const sp = (a, b) => (b.y - a.y) / (b.t - a.t);
        const v1 = sp(desc[0], desc[mid]);
        const v2 = sp(desc[mid], desc[desc.length - 1]);
        console.log('   first half %s px/ms, second half %s px/ms   %s',
                    v1.toFixed(3), v2.toFixed(3),
                    v2 > v1 * 1.2 ? '(accelerating - good)'
                                  : '<< NOT ACCELERATING, it will read as a float');
      }
      console.log('   %s', rise < fall
        ? 'rises less than it falls - good'
        : '!! rises as far as it falls - this was the DROP_RISE=110 bug');

      /* THE CUES THAT MAKE IT READ AS A FALL. Each is only worth having if it
         actually tracks the arc, so each is checked against it rather than
         just for being present. */
      const sys = arc.map(s => s.sy).filter(v => v !== null && !isNaN(v));
      if (sys.length > 2) {
        console.log('   stretch  : %s -> %s   %s',
                    sys[0].toFixed(3), sys[sys.length - 1].toFixed(3),
                    sys[sys.length - 1] > sys[0]
                      ? '(elongates as he speeds up - good)'
                      : '<< NOT STRETCHING with the fall');
      } else {
        console.log('   stretch  : << no scale() in the transform at all');
      }

      const shO = arc.map(s => s.shO).filter(v => !isNaN(v));
      const shS = arc.map(s => s.shS).filter(v => v !== null && !isNaN(v));
      if (shO.length > 2 && shS.length > 2) {
        /* PEAK, not the last value. finaleLanding() fades the shadow out as the
           landing artwork's own comes up, so the final arc frame is 0 by design
           and comparing endpoints reported a shadow that was working as broken. */
        const peakO = Math.max.apply(null, shO);
        const peakS = Math.max.apply(null, shS);
        console.log('   shadow   : opacity peaks %s, scale peaks %s   %s',
                    peakO.toFixed(2), peakS.toFixed(2),
                    (peakO > 0.9 && peakS > 0.95)
                      ? '(grows and darkens into the floor - good)'
                      : '<< THE SHADOW IS NOT TRACKING THE FALL');
        console.log('   at rest  : scale %s   %s',
                    shS[shS.length - 1].toFixed(2),
                    Math.abs(shS[shS.length - 1] - peek('SHADOW_REST')) < 0.02
                      ? '(SHADOW_REST, he is standing on it - good)'
                      : '<< does not settle at SHADOW_REST');
      } else {
        console.log('   shadow   : << never driven');
      }

      /* THE POSE SWAP. Two things can be wrong with it and neither shows up as
         an error: he can jump at the swap, or his feet can miss the floor at
         the end and the landing pose then appears somewhere he is not. */
      const fh = peek('FALL_SPRITE').h * peek('FALL_SCALE');
      const tPose = at(s => s.pose);
      const posed = arc.filter(s => s.pose && !isNaN(s.poseTop));
      console.log('   pose     : %s   %s', ms(tPose),
                  tPose === null ? '<< THE FALL POSE NEVER APPEARED'
                                 : '(the riding clip is cut here)');
      if (posed.length > 1) {
        /* The FINAL top off the element, not off the last sampled frame where it
           was still is-on. placeFall() sets the exact feet-on-floor value at
           p=1 and land() takes is-on off in the same tick, so a frame filter
           never sees it and reports him 7px short of a floor he reaches. */
        const lastTop = parseFloat(ids.finaleFall.style.top || 'NaN');
        /* His SANDAL row, matching placeFall: the cut leaves transparent rows
           below his feet and adding the full sprite height puts him through the
           floor by exactly that much. */
        const feetPx = peek('FALL_FEET') * peek('FALL_SCALE');
        console.log('   its feet : %s   (FLOOR_Y=%s)   %s',
                    (lastTop + feetPx).toFixed(1), peek('FLOOR_Y'),
                    Math.abs(lastTop + feetPx - peek('FLOOR_Y')) < 2
                      ? '(on the floor - good)'
                      : '<< HIS FEET DO NOT REACH THE FLOOR');
        const jumps = posed.slice(1).map((s, i) => Math.abs(s.poseTop - posed[i].poseTop));
        console.log('   travels  : top %s -> %s, biggest step %s px   %s',
                    posed[0].poseTop.toFixed(0), lastTop.toFixed(0),
                    Math.max.apply(null, jumps).toFixed(1),
                    posed.every((s, i) => i === 0 || s.poseTop >= posed[i - 1].poseTop - 0.5)
                      ? '(only ever downward - good)'
                      : '<< IT MOVES BACK UP MID-FALL');
      }

      /* THE FOUR POSES, in order, each replacing the last. The old CSS dust
         check is gone with the dust: the landing artwork draws its own. */
      const tSnap = at(s => s.snap);
      console.log('   poses    : fall %s -> land %s -> cheer %s -> snap %s   %s',
                  ms(at(s => s.pose)), ms(at(s => s.land)),
                  ms(at(s => s.cheer)), ms(tSnap),
                  (at(s => s.pose) !== null && at(s => s.land) !== null &&
                   at(s => s.cheer) !== null && tSnap !== null)
                    ? '(all four ran, in order - good)'
                    : '<< A POSE NEVER APPEARED');
      /* The dust rides the impact frame and the sparkle rides the snap - both are
         caused by a beat rather than scheduled beside it, so they are checked
         against those beats and not against the clock. */
      console.log('   dust     : %s   %s', ms(at(s => s.dust)),
                  at(s => s.dust) === at(s => s.land)
                    ? '(on the impact frame - good)'
                    : '<< NOT ON THE IMPACT FRAME');
      /* WITHIN ONE SAMPLE, not identical. The burst is added by postFormation()
         which the snap beat calls through afterDrop(FORM_LEAD) with FORM_LEAD at
         0 - a zero-delay timer, so it lands on the tick after the pose rather
         than in the same one, and this trace samples every 40ms. */
      const tB = at(s => s.spark), tS = at(s => s.snap);
      console.log('   burst    : %s   %s', ms(tB),
                  (tB !== null && tS !== null && tB - tS <= 40)
                    ? '(on the snap - good)'
                    : '<< NOT ON THE SNAP (the pose was at ' + ms(tS) + ')');
      /* ANTICIPATION: each outgoing pose must dip BEFORE it hands over, or the
         change reads as two photographs mixing rather than one movement. */
      const tGo = at(s => s.going);
      const tCheer = at(s => s.cheer);
      console.log('   anticipate: %s   %s', ms(tGo),
                  (tGo !== null && tCheer !== null && tGo < tCheer)
                    ? '(the crouch dips ' + (tCheer - tGo) + 'ms before it hands over - good)'
                    : '<< NO ANTICIPATION BEFORE THE HANDOVER');
      const both = at(s => (s.land && s.cheer) || (s.cheer && s.snap));
      console.log('   overlap  : %s', both === null
        ? 'never two poses at once - good'
        : '<< TWO POSES WERE ON TOGETHER at ' + both + 'ms');
    } else if (STILL) {
      console.log('=== no fall, and that is right ===');
      console.log('   reduced motion cuts him straight to the floor: %d moving'
                  + ' frame(s), no arc. The poses and the thud still run.',
                  arc.length);
    } else {
      console.log('!! only %d moving frames - the arc did not run', arc.length);
    }

    /* THE SHADOW, by its PEAK rather than its final value. It used to stay at
       rest under him forever, so checking where it finished was the right
       question; finaleLanding() now fades it out as the landing artwork's own
       ground shadow comes up, so 0 at the end is correct and the thing worth
       asserting is that it was driven at all. */
    const shPeak = Math.max.apply(null, trace.map(s => isNaN(s.shO) ? 0 : s.shO));
    const shLast = trace[trace.length - 1].shO;
    console.log('');
    /* Not asserted under --still: there is no fall on that path, so there is no
       falling shadow to drive. land() sets it and finaleLanding() fades it out in
       the same tick, which is right - the landing artwork has its own. */
    console.log('   shadow   : peak %s, ends %s   %s',
                shPeak.toFixed(2), isNaN(shLast) ? '?' : shLast.toFixed(2),
                STILL ? '(no fall on this path, so nothing to drive)'
                      : (shPeak > 0.9
                          ? '(driven through the fall, then handed to the artwork - good)'
                          : '<< THE SHADOW WAS NEVER DRIVEN'));

    /* THE TWO IMPACTS, ONCE EACH AND IN ORDER. `thud` is his feet hitting the
       floor after the fall; `crash` is धड़ामा, the bicycle going over, on the
       recap's fifth picture. They were one cue fired twice and are two cues fired
       once now - see the note on THUD_APART for why the event is not the same one.

       WHAT THE OLD CHECK COULD NOT SEE, and why the gap is kept even though the
       names now carry most of the meaning: "twice, one in the landing and one in
       the recap" and "twice, both in the landing" were the same count. Named cues
       make a double-fire visible on its own; the gap catches the other direction,
       a recap cue somehow sounding during the finale. */
    const firedAt = cue => sounds.filter(s => s.url.indexOf(cue) !== -1)
                                 .sort((a, b) => a.at - b.at);
    const thuds = firedAt('thud'), crashes = firedAt('crash');
    const gap = (thuds.length && crashes.length) ? crashes[0].at - thuds[0].at : null;
    console.log('');
    console.log('   thud  fired %d time(s)   %s', thuds.length,
                thuds.length === 1 ? '(under his feet, after the fall - good)'
                                   : '<< EXPECTED EXACTLY ONE, NOT ' + thuds.length);
    console.log('   crash fired %d time(s)%s   %s', crashes.length,
                gap === null ? '' : ', ' + gap.toFixed(1) + 's after the thud',
                crashes.length === 0
                  ? '(the recap did not reach the crash in this window)'
                  : crashes.length > 1
                    ? '<< EXPECTED AT MOST ONE, NOT ' + crashes.length
                    : gap === null
                      ? '(fired, but there is no thud to order it against)'
                      : gap >= THUD_APART
                        ? '(धड़ामा on the bicycle, well after the landing - good)'
                        : '<< ONLY ' + gap.toFixed(2) + 's AFTER THE THUD - the recap is '
                          + 'sounding during the finale');

    reportRecapGaps(sounds);

    const P = peek('window').AARU_POST;
    console.log('   post-game seam    : %s',
                P ? (P.running() ? 'fired, the celebration is running'
                                 : '!! never fired - the game ends on nothing')
                  : 'AARU_POST absent');
    /* THE QUESTION LEAVES WITH THE BOX, which is the user's own instruction:
       "when the option box got dropped at that point in time, the above pink box
       should also get disappeared from the screen". Both halves, on the frame
       the box starts to go - see bannerAway() in app.js.

       IT USED TO GO SECONDS LATER, at BANNER_GO_AT inside the post-game
       formation, because the only thing that needed it gone was the top row of
       recap pictures landing in its space. That call is still there as the
       requirement it always was; this is the event now. A sample tolerance of
       80ms is two of this scenario's 40ms frames. */
    const tBanner = at(s => s.banner);
    console.log('   banner leaves     : %s   %s', ms(tBanner),
      tBanner === null
        ? '<< THE QUESTION IS STILL ON THE WALL at the end of the finale'
        : tTipS === null
          ? '(the box never tipped, so there is nothing to order it against)'
          : Math.abs(tBanner - tTipS) <= 80
            ? 'on the same frame as the box starts to go - good'
            : '<< ' + (tBanner - tTipS) + 'ms away from the box tipping ('
              + ms(tTipS) + ') - they should be one gesture');

    /* AND HE SPEAKS OVER HIS OWN ARRIVAL. Two things have to be true and neither
       was checked by anything before this: the line has to OPEN with the ride,
       and he must not let go of the rope until he has finished it.

       THE SECOND ONE IS WHAT dropHoldMs() BUYS. Before it, DROP_HOLD_MS was a
       flat 550ms and he let go 3.35s in with a third of the sentence still to
       come - he would have finished it in mid-air. `tLetGo` is derived the same
       way the game derives it rather than read off the trace, so this fails if
       the derivation is broken as well as if the timing is. */
    const his   = voices().filter(x => label(x).indexOf('aaruDone') !== -1)[0];
    const rideM = STILL ? 0 : peek('ENTRY_MS');
    const tLetGo = tRide === null ? null : tRide + rideM + peek('dropHoldMs')(rideM);
    console.log('   Aaru speaks       : %s', his
      ? ms(Math.round(his.at - t0)) + ' -> ' + ms(Math.round(his.ended - t0)) + '   ('
        + ((his.ended - his.at) / 1000).toFixed(2) + 's of him)'
      /* --novo FAILS EVERY VOICEOVER FETCH ON PURPOSE, so silence is the correct
         answer there and must not read as a fault - the same distinction the
         `hints` scenario makes about itself. dropHoldMs() takes its floor on
         that path (VO_VOLUME is untouched, but nothing decoded, so voLen is 0),
         which is what keeps the ending at its original pace. */
      : NOVO ? '(nothing decoded - --novo, and the hold falls back to '
               + peek('DROP_HOLD_MS') + 'ms)'
             : '<< HE NEVER SPOKE - the child placed twelve pictures and nobody said so');
    if (his && tRide !== null) {
      const open = Math.round((his.at - t0) - tRide);
      console.log('   ...with the ride  : %s',
        Math.abs(open) <= 80
          ? 'opens on the ride\'s first frame - good'
          : '<< ' + open + 'ms ' + (open > 0 ? 'after' : 'before')
            + ' the ride starts (' + ms(tRide) + ')');
      const beat = Math.round(tLetGo - (his.ended - t0));
      console.log('   ...before he drops: %s',
        beat >= 0
          ? 'finished ' + beat + 'ms before he lets go (DROP_HOLD_MS is '
            + peek('DROP_HOLD_MS') + ') - good'
          : '<< STILL TALKING when he lets go, by ' + (-beat) + 'ms');
    }

    console.log('   the box, at rest  : "%s"', tray() || '(no classes)');
  },

  /* THE FORMATION, which the finale scenario runs past the end of. It shares the
     first twelve seconds with `finale` and then keeps watching: he snaps, and the
     ten frames ride in from off-stage left on the clothesline - wooden frame, peg
     and picture, the whole hanger - each dropping its picture into its slot.

     THE SAMPLE WINDOW IS THE THING TO LENGTHEN FIRST if this starts reporting that
     frames never arrived. The ending runs to about 12.3s from the last card, then
     FORM_LEAD, then MAGIC_MS + 9 launches at LAUNCH_PX/RIDE_PX_MS + the last
     ride + FLY_MS, then the trail. 760 x 40ms is 30.4s against about 22s of
     content. The finale scenario has had this window too short twice, both times
     reporting a beat as missing when it fired after the harness stopped looking. */
  async form() {
    ids.entry.canPlayType = () => 'probably';
    /* AND THE ALPHA GATE, which canPlayType no longer decides on its own. The
       game measures whether a decoded frame actually carries transparency - see
       alphaVideoUsable() and probeAlphaVideo() in app.js - because Safari says
       "probably" to vp9 and then discards the alpha, which put an opaque box
       behind Aaru on a phone. There is no real canvas in here to measure, so the
       probe settles on its safe default of "no" and every clip site would take
       its degraded path: this scenario exists to walk the path where he IS
       shown, so it says so outright. */
    peek('alphaVideoOK = true');

    console.log('');
    console.log('=== the numbers it runs on ===');
    ['CROUCH_MS', 'YAAY_MS', 'FORM_LEAD', 'MAGIC_MS', 'HAUL_MS', 'RIDE_PX_MS',
     'LAUNCH_PX', 'ENTER_CX', 'HANGER_X', 'FLY_MS', 'FLY_BOW', 'RING_SCALE',
     'RING_H', 'RING_W'
    ].forEach(k => console.log('   %s = %s', k.padEnd(11), peek(k)));
    console.log('   %s = %s', 'RING_SKIP'.padEnd(11), JSON.stringify(peek('RING_SKIP')));
    console.log('   %s = %s', 'RING_ORDER'.padEnd(11), JSON.stringify(peek('RING_ORDER')));

    console.log('');
    console.log('=== every screen but the last ===');
    for (let s = 0; s < peek('ROUNDS').length - 1; s++) {
      if (!await playScreen(1500)) break;
    }
    const r = peek('round');
    for (let i = 0; i < r.order.length; i++) {
      advance(1200); await settle();
      await waitForSilence();
      peek('tryPlace')(r.order[i], peek('activeSlot')());
      await settle();
      advance(200); await settle();
    }
    seen = sounds.length;

    const P = peek('window').AARU_POST;
    if (!P || !P.frames) {
      console.log('   << AARU_POST.frames absent - nothing to measure');
      return;
    }
    const RING = peek('RING');
    const ORDER = peek('RING_ORDER');
    const SKIP = peek('RING_SKIP');

    const t0 = now, trace = [];
    let magicAt = null;
    /* 1100 x 40ms = 44s, up from 760 = 30.4s. The formation is about 22s of
       content and the sheet's two new screens add ten more: Screen 1 does not
       start until the ring is finished, then walks ten pictures - each of which now
       POPS OUT to the centre of the stage, holds about two seconds while its action
       plays, and travels back - and Screen 2 runs after that. At 1100 ticks the
       celebration was landing at 43.4s inside a 44s window, which is not a margin.
       1700 x 40ms = 68s, up from 1500 = 60s. THREE TIMES NOW. Scenes 1, 8 and 10
       grew their `hold` by 250, 300 and 1000ms when the user asked for those three
       to be rebuilt, which put the last picture's light at 50.7s and pushed the
       CONFETTI'S TAIL past the end of the window - reported, correctly, as "still up
       at end: IT NEVER LANDED". Nothing about the paper had changed. The note above
       is not decoration: this window has been too short three times, every time
       reporting a beat as missing when it fired after the harness stopped looking.
       If a fourth beat is ever added to a scene, raise this FIRST and then read the
       failures.

       FOUR TIMES NOW, AND THE FOURTH WAS NOT A SCENE. RECAP_START_AT went 760 ->
       1600 so that the moment the whole story is on screen lasts long enough to
       look at, which moves every one of the ten cards 840ms later and put the
       confetti's tail back over the edge - reported, again correctly, as "still
       up at end". The lesson holds and generalises: ANY constant that delays the
       recap lands here.

       FIVE TIMES, AND THIS ONE WAS NOT EVEN IN THE RECAP. Sequencing the ending
       - BOX_WAIT_MS holding the box until the haul is done, ENTRY_HOLD_MS
       re-anchored to the box landing - added about three seconds BEFORE the post
       game starts, and the tail went over again. So the window is not really
       "how long the recap is", it is "how long everything before the confetti
       finishes is", and every pacing change in the game feeds it.

       2200 x 40ms = 88s. IT WENT OVER A SIXTH TIME - the recap grew a walk beat
       on each of its nine legs - and this is the file doing what it told itself
       to do rather than raising the number again: the loop now RUNS UNTIL THE
       CONFETTI IS DOWN and 2200 is the cap. Virtual time is free (advance() does
       not sleep), so waiting for the event costs nothing and cannot go stale the
       next time a beat is added anywhere before the ending. See the break at the
       bottom of the loop. */
    let confSeen = false;
    /* 4000 x 40ms = 160s, AND THE NUMBER STOPPED MATTERING WHEN THE BREAK WENT IN
       BELOW. With the loop exiting on the paper being down, this is a runaway
       guard rather than a duration: the normal run leaves after about 70s of
       virtual time whatever this says, so the only thing a bigger number costs is
       the arithmetic on a run that has already gone wrong. It was 2200, which was
       still a duration in disguise - the recap grew a walk beat on each of nine
       legs and a 3.8s celebration in one pass, which put the confetti's start at
       ~63s and its fall past 88s. Raised once, with the break making it the last
       time this can be the thing that fails. */
    for (let k = 0; k < 4000; k++) {
      advance(40);
      await settle();
      if (magicAt === null && ids.postMagic.classList.contains('is-on')) {
        magicAt = now - t0;
      }
      trace.push({ t: now - t0, f: P.frames(), steps: P.steps(),
                   /* The sheet's two screens, sampled every tick so "woken in
                      order" and "lit together" are answerable afterwards. */
                   woken: P.woken ? P.woken() : undefined,
                   held: P.held ? P.held() : undefined,
                   lit: P.lit ? P.lit() : undefined,
                   cheered: P.cheered ? P.cheered() : undefined,
                   /* THE CONFETTI, SUMMARISED PER TICK rather than kept. 228
                      pieces over 1500 ticks is 340,000 objects if the trace holds
                      them, and every question worth asking is about the cloud:
                      how many are up, how high it reached, how fast the paper is
                      going and how much of it is in front of him. */
                   conf: P.confetti ? (() => {
                     const c = P.confetti();
                     if (!c.length) return null;
                     return { n: c.length,
                              front: c.filter(p => p.front).length,
                              top: Math.min(...c.map(p => p.y)),
                              low: Math.max(...c.map(p => p.y)),
                              wide: Math.max(...c.map(p => p.x))
                                    - Math.min(...c.map(p => p.x)),
                              fast: Math.max(...c.map(p => p.vpx)),
                              fall: c.reduce((a, p) => a + p.fallPx, 0) / c.length,
                              fallSI: c.reduce((a, p) => a + p.vy, 0) / c.length,
                              spin: c.reduce((a, p) => a + Math.abs(p.spin), 0) / c.length,
                              k: [Math.min(...c.map(p => p.k)),
                                  Math.max(...c.map(p => p.k))] };
                   })() : null,
                   spark: P.sparkle ? P.sparkle() : null });
      /* ...AND IT STOPS WHEN THE PAPER IS DOWN, which is what the note above
         asked for the sixth time this went over. `conf` is null on a tick with no
         pieces alive, so once some have existed and then stop existing, the thing
         this loop was waiting for has happened and 2200 is a cap rather than a
         duration. The sixth raise was the recap growing a walk beat on each of
         its nine legs (RECAP_WALK_MS), about 6.4s, which pushed the confetti tail
         from ~60s to ~67s - still inside 88s, but close enough that the paper's
         own randomness put it over on about one run in three. */
      if (trace[trace.length - 1].conf) confSeen = true;
      else if (confSeen) break;
    }

    console.log('');
    console.log('=== every sound it made ===');
    drain();
    reportRecapGaps(sounds);

    const last = trace[trace.length - 1].f;
    const ms = v => v === null ? 'NEVER' : v + 'ms';

    console.log('');
    console.log('=== the snap ===');
    console.log('   burst fires   : %s   %s', ms(magicAt),
                STILL ? '(no burst under reduced motion, by design)'
                      : (magicAt === null ? '<< THE SNAP NEVER SPARKED' : '(good)'));

    console.log('');
    console.log('=== the ten frames ===');
    console.log('   built         : %d   %s', last.length,
                last.length === 10 ? '(good)' : '<< EXPECTED 10');
    const shown = last.map(f => f.id);
    console.log('   round the loop: %s', shown.join(' '));
    /* NAMED, not counted. The skip is by story index, so getting it wrong shows
       up as the wrong picture in the ring and not as a wrong total.

       IT IS ONE INDEX NOW AND NOT TWO. The reference layout leaves out hurt and
       pickup; hurt is no longer in the game to be left out (see the windowing
       note over ROUNDS in app.js), so RING_SKIP holds only pickup's index. Both
       are still checked for by NAME here, because "hurt is absent" has to stay
       true for a different reason than it used to and this is the line that
       would catch it coming back. */
    console.log('   skipped       : %s   %s', JSON.stringify(SKIP),
                (shown.indexOf('hurt') === -1 && shown.indexOf('pickup') === -1)
                  ? '(hurt and pickup are the two left out - good)'
                  : '<< THE WRONG ONES WERE DROPPED: ' + shown.join(' '));
    const sneezes = shown.filter(x => x === 'sneeze').length;
    console.log('   sneeze twice  : %d   %s', sneezes,
                sneezes === 2 ? '(both survive the id collision - good)'
                              : '<< ONE OF THE TWO SNEEZE CARDS WAS LOST');

    let offSlot = 0, worstOff = 0;
    last.forEach((f, i) => {
      const d = Math.max(Math.abs(f.x - RING[i].x), Math.abs(f.y - RING[i].y));
      if (d > worstOff) worstOff = d;
      if (d > 1.5) offSlot++;
    });
    console.log('   on their slots: %d of 10 off by >1.5px, worst %s px   %s',
                offSlot, worstOff.toFixed(2),
                offSlot === 0 ? '(good)' : '<< FRAMES DID NOT REACH THEIR SLOTS');
    const homed = last.filter(f => f.home).length;
    console.log('   settled       : %d of 10   %s', homed,
                homed === 10 ? '(good)' : '<< SOME FRAME NEVER ARRIVED');

    if (STILL) {
      console.log('');
      console.log('   reduced motion: all ten placed at once, no ride');
      const moved = trace.some(sm => sm.f.some(f => !f.home));
      console.log('   nothing rode  : %s', moved
        ? '<< SOMETHING ANIMATED ON THE REDUCED-MOTION PATH'
        : 'correct - they appear in place');
      const line = ids.postLine.children.length;
      console.log('   no hangers    : %d in #postLine   %s', line,
                  line === 0 ? '(the frames never appear - good)'
                             : '<< HANGERS WERE BUILT ON A PATH WITH NO RIDE');
    } else {
      /* THE CARRIER. This is the correction the user asked for, and it is the one
         thing the finished ring cannot show: by the time the picture is in its
         slot the frame and the peg are gone. */
      console.log('');
      console.log('=== what carried them ===');
      const anyRide = trace.some(sm => sm.f.some(f => f.onLine));
      const allFramed = last.every(f => f.frame);
      const allPegged = last.every(f => f.peg);
      console.log('   rode a hanger : %s', anyRide
        ? 'yes - the frames travelled on the line' : '<< NOTHING EVER RODE');
      console.log('   frame on each : %s   %s', allFramed,
                  allFramed ? '(the wooden frame came with it)' : '<< NO .slot');
      console.log('   clip on each  : %s   %s', allPegged,
                  allPegged ? '(the peg came with it)' : '<< NO .peg');
      /* AND THE FRAME IS POSITIONED. .slot[data-slot="0"] is the only rule that
         puts a frame at left 141 inside its hanger, so an accessibility tidy-up
         that stripped data-slot dropped it to left 0 and the picture rode in
         141px outside its own frame. Every other check here still passed - the
         frame was there, the peg was there, it took the sag - which is why this
         one exists. */
      const allPut = last.every(f => f.framePut);
      console.log('   frame at 141  : %s   %s', allPut,
                  allPut ? '(the picture is inside it, not beside it)'
                         : '<< data-slot IS GONE - the frame is at left 0');

      /* AND IT RODE THE SAG. A frame's height comes from the rope under it, so
         over a full crossing its y must vary by about the sag depth, 44.5px. A
         frame sliding at a fixed height would show 0 here and look almost the
         same in a screenshot. */
      let lo = 1e9, hi = -1e9;
      trace.forEach(sm => sm.f.forEach(f => {
        if (!f.onLine || f.x < 0 || f.x > 1920) return;
        if (f.y < lo) lo = f.y;
        if (f.y > hi) hi = f.y;
      }));
      const swing = hi - lo;
      console.log('   took the sag  : %s px of rise and fall   %s',
                  swing > 0 ? swing.toFixed(1) : 'n/a',
                  swing > 30 ? '(it follows the rope, as a hauled frame does)'
                             : '<< IT SLID ACROSS AT A FIXED HEIGHT');

      console.log('');
      console.log('=== the ride ===');
      let backwards = 0, minX = 1e9;
      for (let i = 0; i < last.length; i++) {
        let prev = null;
        trace.forEach(sm => {
          const f = sm.f[i];
          if (!f || f.home || f.flying) return;
          if (f.x < minX) minX = f.x;
          if (prev !== null && f.x < prev - 0.5) backwards++;
          prev = f.x;
        });
      }
      console.log('   enters from   : x=%s   (ENTER_CX=%s)',
                  minX.toFixed(0), peek('ENTER_CX'));
      console.log('   travel        : %s', backwards === 0
        ? 'left to right throughout, all ten - good'
        : '<< ' + backwards + ' frame(s) of RIGHT-TO-LEFT movement on the line');

      /* AT MOST TWO ON THE LINE, and far enough apart not to touch. The launch
         rule is "when the one in front has covered LAUNCH_PX"; whether that keeps
         469px-wide frames clear is arithmetic I got wrong on paper once. */
      let mostAtOnce = 0, closest = 1e9;
      trace.forEach(sm => {
        const on = sm.f.filter(f => f.onLine && f.x > -400 && f.x < 2100);
        if (on.length > mostAtOnce) mostAtOnce = on.length;
        on.forEach((a, i) => on.slice(i + 1).forEach(b => {
          /* the frame's own width, SCALED - the carrier now rides at the ring's
             scale so the assembly is 469.441 * RING_SCALE across */
          const gap = Math.abs(a.x - b.x) - 469.441 * peek('RING_SCALE');
          if (gap < closest) closest = gap;
        }));
      });
      console.log('   most at once  : %d', mostAtOnce);
      console.log('   frames apart  : %s px of air   %s',
                  closest > 1e8 ? 'n/a' : closest.toFixed(0),
                  closest > 1e8 ? '(never two at once)'
                    : (closest > 0 ? '(never touch - good)'
                                   : '<< TWO FRAMES OVERLAP ON THE LINE'));

      /* THE ARRIVAL ORDER, read off the run. Fixed by the request now, so this is
         the only thing saying it actually came out that way. */
      const arrived = [];
      trace.forEach(sm => sm.f.forEach((f, i) => {
        if (f.home && arrived.indexOf(i) === -1) arrived.push(i);
      }));
      const same = arrived.length === ORDER.length
                && arrived.every((v, i) => v === ORDER[i]);
      console.log('');
      console.log('   arrival order : %s', arrived.map(i => i + 1).join(','));
      console.log('   as asked      : %s', same
        ? 'slot 10 first down to slot 1 last - good'
        : '<< NOT RING_ORDER (' + ORDER.map(i => i + 1).join(',') + ')');

      /* OVERLAPS AGAINST WHAT IS ALREADY DOWN. Exactly one is expected and is
         forced by the requested order: slot 9 is the bottom left and slot 10 the
         left side, so 9 falls past 10. Reported with its depth rather than
         tolerated silently, so it getting worse is visible. */
      const hits = {};
      trace.forEach(sm => {
        const on = sm.f.filter(f => f.x > -400 && f.x < 2100);
        on.forEach(a => {
          if (a.home) return;
          on.forEach(b => {
            if (b === a || !b.home) return;
            const ox = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
            const oy = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
            if (ox > 0 && oy > 0) {
              const key = a.slot + ' past ' + b.slot;
              hits[key] = Math.max(hits[key] || 0, Math.min(ox, oy));
            }
          });
        });
      });
      const keys = Object.keys(hits);
      console.log('');
      console.log('   crossings     : %s', keys.length
        ? keys.map(k => k + ' by ' + hits[k].toFixed(0) + 'px').join(', ')
        : 'none');
      /* CROSSINGS ARE REPORTED, NOT FAILED, and that change is the point of this
         note. Every one of them passes BEHIND: .post-line is z-index 63 against
         .post-ring's 64 while a picture is on the line, and .pcard.is-flying is 1
         against .is-home's 2 once it is off. A card that has landed is never
         covered by one still travelling.

         Failing on them cost 149px of layout. The two side cards were being
         pushed below y 539 so that frames riding past could not "clip" them, and
         they were never clipping anything - the check was reading a geometric
         overlap as an occlusion. With it gone all ten cards sit exactly where the
         reference puts them.

         What still matters, and is still asserted above: no two cards overlap once
         they have SETTLED, and the arrival order holds. */
      const settled = [];
      last.forEach((a, i) => last.slice(i + 1).forEach(b => {
        const ox = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
        const oy = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
        if (ox > 0 && oy > 0) settled.push(a.slot + '/' + b.slot);
      }));
      console.log('   all behind    : yes - .post-line 63 under .post-ring 64, '
                  + 'and .is-flying 1 under .is-home 2');
      console.log('   settled pairs : %s', settled.length === 0
        ? 'none overlap once they are down - good'
        : '<< ' + settled.join(', ') + ' OVERLAP AT REST');
    }

    console.log('');
    console.log('=== the footpath ===');
    const steps = Array.from(ids.postTrail.children);
    const runs = P.runs ? P.runs() : [];
    console.log('   footprints    : %d', steps.length);
    /* PER RUN, AND ONLY THE ROOMY ONES HAVE TO LAY ANYTHING. A straight-line
       version once laid 19 footprints and looked healthy on a total while all four
       side runs were empty - a loop drawn on two sides - so the total is not the
       check.

       TODAY NO RUN IS TOO TIGHT TO DRAW. All NINE of them - the path does not close
       the ring - clear RUN_HAS_ROOM, the narrowest with 94px of air against its 68,
       and every one lays marks. So a 0 in `per run` is a fault to chase, not
       geometry to accept. This said "four of these ten runs join frames that are 18
       to 24px apart", which was wrong on the count and on the air, and which would
       have licensed silencing a genuine failure as expected output.

       The room test is app.js's own RUN_HAS_ROOM, read rather than repeated, so
       the two cannot drift apart. */
    const ROOM = peek('RUN_HAS_ROOM');
    /* HIS BOX, read from app.js rather than repeated. It was repeated, his box
       moved, and only one copy followed - so this reported a footprint on his
       shins that was standing on bare floor. */
    const HB = peek('HIS_BOX');
    const RW = peek('RING_W'), RH = peek('RING_H');
    /* NINE runs, not ten: the path stops at the last scene rather than closing the
       ring, because a tenth run would join the END of the story to its BEGINNING.
       See buildTrail. */
    const air = RING.slice(0, -1).map((a, i) => {
      const b = RING[i + 1];
      const len = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
      const horiz = Math.abs(b.x - a.x) > Math.abs(b.y - a.y);
      return len - (horiz ? RW : RH);
    });
    console.log('   per run       : %s', runs.join(' '));
    console.log('   air per run   : %s', air.map(v => v.toFixed(0)).join(' '));
    /* HIS RUN IS EXEMPT, and the harness was calling a correct result a failure.
       NONE OF THEM CROSSES HIM ANY MORE - this check prints "no run - the path goes
       round outside him" and has for many builds, so the exemption below is dormant
       rather than load-bearing. It used to be that one of the runs, the bottom
       middle, crossed where he is standing, and it had
       348px of air, so a roominess test on its own demands footprints there when
       laying none is exactly right. Found by asking which chord passes through his
       box rather than by hardening an index, because the index moved when the ring
       went from twelve slots to ten. */
    const hisRun = RING.slice(0, -1).map((a, i) => {
      const b = RING[i + 1];
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        if (x > HB.x0 && x < HB.x1 && y > HB.y0 && y < HB.y1) return true;
      }
      return false;
    });
    /* NONE, now that he is the reference's smaller boy sitting inside the ring:
       the runs pass at y 175..222, 504, 549 and 855..906, and he occupies
       291..792 between them. With the snap pose in the middle the bottom run went
       straight through his legs. Printed either way, because "no run touches him"
       is a fact about the layout worth seeing rather than assuming. */
    console.log('   he stands on  : %s', hisRun.indexOf(true) === -1
      ? 'no run - the path goes round outside him'
      : 'run ' + (hisRun.indexOf(true) + 1));
    const roomy = runs.filter((v, i) => air[i] >= ROOM && !hisRun[i]);
    const starved = runs.filter(
      (v, i) => air[i] >= ROOM && !hisRun[i] && v === 0).length;
    console.log('   runs         : %d   %s', runs.length,
                runs.length === RING.length - 1
                  ? '(nine - the path does not close back to scene 1 - good)'
                  : '<< EXPECTED ' + (RING.length - 1));
    console.log('   %d run(s) have room (>=%s px)   %s', roomy.length, ROOM,
                starved === 0
                  ? 'and every one of them laid footprints - good'
                  : '<< ' + starved + ' ROOMY RUN(S) LAID NOTHING');
    console.log('   the other %d join frames that are touching, so nothing to draw',
                runs.length - roomy.length);
    /* THE MEASURED INK EXTENT OF BOTH SPRITES, so this harness can judge a mark by
       its size instead of by its centre. Swept 0..90 degrees in 5 degree steps with
       PIL on the rotated alpha of the real files - assets/images/footprint.png scaled
       to .pstep's 40x40, trail-dash.png to 20x21 - and stored as the axis-aligned
       bbox the browser would paint.

       WHY THIS EXISTS. Every size check in this feature used to be a point test on
       the mark's centre, so the harness would print "none hidden - good" for a mark
       of any size at all. Two wrong answers came out of that blind spot: a 40px
       footprint dropped into a corridor that could not hold it and went unreported,
       and - the expensive one - a whole design was abandoned on the strength of the
       sprite's 40x40 BOX when its ink, a sole drawn diagonally across its tile,
       is 48 wide and 28 tall once rotated onto the path. Measured, the thing that
       looked impossible had 10px of room.

       FOLD THE HEADING MOD 180 rather than with abs(). A sole at 170 degrees lies on
       the same LINE as one at -10 and covers the same extent; it merely points the
       other way along it. abs() runs off the end of the table for any run that
       travels right to left - which run 6 does - and returns the 90 degree row, i.e.
       nonsense. */
    const INK_TALL = {
      foot: [28, 30, 31, 33, 34, 35, 37, 38, 39, 40, 42, 44, 45, 47, 48, 48, 48, 48, 48],
      dash: [16, 15, 16, 17, 17, 19, 19, 21, 21, 21, 22, 23, 24, 24, 25, 25, 25, 26, 25],
    };
    const INK_WIDE = {
      foot: [48, 49, 49, 48, 48, 46, 46, 44, 42, 40, 39, 38, 36, 35, 33, 31, 30, 29, 28],
      dash: [26, 26, 25, 24, 24, 22, 23, 22, 20, 20, 20, 20, 21, 20, 17, 18, 17, 18, 16],
    };
    const inkAt = (table, kind, head) => {
      let h = ((head % 180) + 180) % 180;
      if (h > 90) h -= 180;
      h = Math.abs(h);
      const t = table[kind];
      const i = Math.min(t.length - 2, Math.floor(h / 5));
      return t[i] + (t[i + 1] - t[i]) * (h - i * 5) / 5;
    };

    let onHim = 0, underCard = 0;
    let worstCard = Infinity, worstEdge = Infinity, worstAt = '';
    steps.forEach(el => {
      const x = parseFloat(el.style.left || 'NaN');
      const y = parseFloat(el.style.top || 'NaN');
      if (isNaN(x) || isNaN(y)) return;
      if (x > HB.x0 && x < HB.x1 && y > HB.y0 && y < HB.y1) onHim++;

      /* Recover the heading the mark was laid at. app.js writes --r as
         `head - fy * axis`, so head comes back as `r + fy * axis`. */
      const isDash = /is-dash/.test(el.className || '');
      const kind = isDash ? 'dash' : 'foot';
      const r = parseFloat(el.style.getPropertyValue('--r'));
      const fy = parseFloat(el.style.getPropertyValue('--fy'));
      const axis = (isDash ? peek('DASH_AXIS') : peek('FOOT_AXIS')) * fy;
      const head = isNaN(r) ? 0 : r + axis;
      const halfT = inkAt(INK_TALL, kind, head) / 2;
      const halfW = inkAt(INK_WIDE, kind, head) / 2;

      /* Ink against every card's PAINTED box, which is RING_W x RING_H about its
         centre - no STEP_CLEAR, because this asks what the child can see, not what
         buildTrail chose to reserve. A negative number is ink over a picture. */
      for (let i = 0; i < RING.length; i++) {
        const gapX = Math.abs(x - RING[i].x) - (peek('RING_W') / 2 + halfW);
        const gapY = Math.abs(y - RING[i].y) - (peek('RING_H') / 2 + halfT);
        if (gapX < 0 && gapY < 0) underCard++;
        const clear = Math.max(gapX, gapY);   /* separated on either axis is clear */
        if (clear < worstCard) {
          worstCard = clear;
          worstAt = kind + ' at (' + x.toFixed(0) + ',' + y.toFixed(0) + ')';
        }
      }
      const edge = Math.min(x - halfW, peek('STAGE_W') - x - halfW,
                            y - halfT, peek('STAGE_H') - y - halfT);
      if (edge < worstEdge) worstEdge = edge;
    });
    console.log('   on him        : %d   %s', onHim,
                onHim === 0 ? '(the path goes round him - good)'
                            : '<< FOOTPRINTS UP HIS SHINS');
    console.log('   under a frame : %d   %s', underCard,
                underCard === 0 ? '(no INK over a picture - good)'
                                : '<< ' + underCard + ' MARK(S) WITH INK OVER A PICTURE');
    /* NO MARKS MEANS NO CLEARANCE TO REPORT, not an infinitely good one. These both
       start at Infinity and are only ever lowered inside the loop above, so an empty
       trail would have printed "Infinity px (clear)" - the most reassuring possible
       line about the worst possible state. */
    if (!steps.length) {
      console.log('   ink clearance : no marks to measure   << THE TRAIL IS EMPTY');
    } else {
    console.log('   ink to a card : %s px   %s   %s',
                worstCard.toFixed(1),
                worstCard > 0 ? '(clear)' : '<< OVERLAPPING', worstAt);

    /* THE OUTWARD RUNS, SPELLED OUT. These two thread a corridor barely wider than
       the marks, and the thing that matters about them is a PATTERN - dash, print,
       print, dash - which no count or clearance figure can show. Every question about
       them so far has been answered by taking a screenshot and magnifying it, twice.

       Marks are grouped by run using formRuns, which carries the per-run counts in
       the same order buildTrail laid them, and printed in path order with the
       along-path spacing between neighbours. */
    const ROW_OUT = peek('ROW_OUT') || [];
    const runsOf = runs;
    let at0 = 0;
    runsOf.forEach((n, ri) => {
      if (ROW_OUT.indexOf(ri) !== -1 && n) {
        const mine = [];
        for (let j = at0; j < at0 + n && j < steps.length; j++) {
          const el = steps[j];
          mine.push({ x: parseFloat(el.style.left), y: parseFloat(el.style.top),
                      dash: /is-dash/.test(el.className || '') });
        }
        const kinds = mine.map(m => m.dash ? 'dash' : 'PRINT').join(' ');
        const gaps = mine.slice(1).map((m, i) =>
          Math.hypot(m.x - mine[i].x, m.y - mine[i].y).toFixed(0)).join(' ');
        const prints = mine.filter(m => !m.dash).length;
        console.log('   run %d outward : %s', ri, kinds);
        console.log('                   gaps %s px   %s', gaps || '-',
                    prints === 2 && mine.length >= 3 && mine[0].dash
                      && mine[mine.length - 1].dash
                      ? '(dash, pair, dash - the reference motif - good)'
                      : '<< NOT dash-PRINT-PRINT-dash: ' + prints + ' print(s) of '
                        + mine.length);
      }
      at0 += n;
    });
    console.log('   ink to an edge: %s px   %s', worstEdge.toFixed(1),
                worstEdge > 0 ? '(nothing cut off by overflow:hidden - good)'
                              : '<< A MARK IS CUT IN HALF BY THE STAGE EDGE');
    }

    /* THE RECORDED CURVES ARE THE CURVES THE PRINTS ARE ON, per run. app.js keeps
       the quadratic that won each run's bow search on formPath so the recap's
       sparkle can follow the footpath rather than a near-miss of it - and "near"
       is precisely the failure nobody would spot, because a sparkle a few pixels
       off the prints still looks like a sparkle.

       WHAT THIS CATCHES that nothing else does: bestCtrl has to follow `best` on
       BOTH assignments in the first-viable-wins loop. Set it only on the winning
       `break` and a fallback run silently points at a different candidate's
       curve.

       THE TOLERANCE IS THE FOOT OFFSET. A print is laid STEP_SIDE - or
       ROW_OUT_SIDE on the two outward runs - to one side of the path on purpose,
       which is what makes it a left foot and a right foot. So a print legitimately
       sits that far off its own curve; further than that is the curve being
       wrong. */
    const path = P.path ? P.path() : null;
    if (!path) {
      console.log('   curves        : << AARU_POST.path IS MISSING');
    } else {
      const tol = peek('STEP_SIDE') + 6;
      let worstOff = 0, worstRun = -1, nulls = 0, checked = 0;
      let k0 = 0;
      runs.forEach((n, ri) => {
        const cur = path[ri];
        if (!cur) { if (n) nulls++; k0 += n; return; }
        for (let j = k0; j < k0 + n && j < steps.length; j++) {
          const mx = parseFloat(steps[j].style.left);
          const my = parseFloat(steps[j].style.top);
          if (isNaN(mx) || isNaN(my)) continue;
          let near = Infinity;
          for (let s = 0; s <= 400; s++) {
            const t = s / 400, w = 1 - t;
            const qx = w * w * cur.a.x + 2 * w * t * cur.k.x + t * t * cur.b.x;
            const qy = w * w * cur.a.y + 2 * w * t * cur.k.y + t * t * cur.b.y;
            const d = Math.hypot(mx - qx, my - qy);
            if (d < near) near = d;
          }
          checked++;
          if (near > worstOff) { worstOff = near; worstRun = ri; }
        }
        k0 += n;
      });
      console.log('   curves        : %d of %d run(s) recorded, %d print(s) checked',
                  path.filter(Boolean).length, runs.length, checked);
      console.log('   print to curve: %s px worst (run %d)   %s',
                  worstOff.toFixed(1), worstRun,
                  nulls ? '<< ' + nulls + ' RUN(S) LAID MARKS WITH NO CURVE RECORDED'
                        : worstOff <= tol
                          ? '(within the ' + tol + 'px foot offset - the sparkle can follow these)'
                          : '<< A RUN\'S CURVE IS NOT THE ONE ITS PRINTS ARE ON');
    }

    /* =====================================================================
       SCREEN 1 - "STORY COMES ALIVE" and SCREEN 2 - "CELEBRATION"
       ===================================================================== */
    console.log('');
    console.log('=== the story comes alive ===');
    const woke = trace.map(s => s.woken).filter(v => v !== undefined);
    const order = [];
    woke.forEach(v => { if (v >= 0 && order[order.length - 1] !== v) order.push(v); });
    /* TWO DIFFERENT QUESTIONS ON TWO DIFFERENT PATHS, and asking the wrong one is
       how this check first failed. Where the sparkle runs, the ORDER is the thing -
       a sparkle travelling the ring backwards would still wake ten pictures. Where
       it does not run - reduced motion - every picture is woken in the same tick
       ON PURPOSE, so a sequence read off a per-tick trace collapses to one entry
       and says nothing. There, what matters is that every picture was woken at
       all, which popped() answers per card instead of being inferred. */
    const popped = P.popped ? P.popped() : [];
    const nPopped = popped.filter(Boolean).length;
    if (STILL) {
      console.log('   pictures woken: %d of %d, all in one tick   %s',
                  nPopped, RING.length,
                  nPopped === RING.length
                    ? '(reduced motion - no sparkle to travel, so all at once - good)'
                    : '<< ' + (RING.length - nPopped) + ' PICTURE(S) NEVER WOKEN');
    } else {
      console.log('   pictures woken: %s',
                  order.length ? order.map(v => v + 1).join(',') : 'NONE');
      const wantOrder = order.length === RING.length && order.every((v, i) => v === i);
      console.log('                   %s   (%d card(s) carry the class)',
                  wantOrder
                    ? '(all ten, in story order 1..10 - good)'
                    : '<< NOT ALL TEN IN STORY ORDER: got ' + order.length +
                      ' of ' + RING.length,
                  nPopped);
    }

    /* THE SPRITE BOXES IN app.js STILL MATCH THE CUTTER'S OWN OUTPUT.

       app.js carries each box and motion as a literal, because it is a classic
       script and a sprite has to be placed synchronously - it cannot read
       assets/images/recap-manifest.json at load. So the manifest and SCENE_FX are two
       copies of the same numbers, which is the drift this project keeps paying for.
       This is the guard: re-cut a card, forget to paste the new box, and a line here
       fails instead of a sprite silently sitting a few pixels beside itself.

       Missing manifest is reported, not fatal: the cutter is a build-time tool and
       someone may have a tree without it. */
    try {
      const mpath = require('path').join(__dirname, '..', 'assets', 'images',
                                        'recap-manifest.json');
      const man = JSON.parse(require('fs').readFileSync(mpath, 'utf8'));
      const specs = peek('SCENE_FX') || [];
      let checked = 0, bad = [];
      Object.keys(man).forEach(slot => {
        const i = parseInt(slot, 10) - 1;
        /* A CARD MAY CARRY MORE THAN ONE CUT NOW, and the manifest may key one by
           name rather than by slot: card 3 has '03' for the lid and '03-eyes' for
           the eye-pop. So a manifest row is matched to the SPRITE WITH THE SAME
           FILE rather than to "the card's sprite", and `sprite` is normalised to a
           list because eight cards still write it as a bare object. */
        /* CUTS AND WARPS, and both have to be looked at. A card's live element is
           either a `sprite` - lifted out of the art over an inpainted patch - or a
           `warp`, the card's own art masked and transformed (see .pspr.is-warp).
           They carry the same `file` and `box`, which is all this check reads, so
           one list of both is the whole difference. Without the second half every
           warped card reported as "cut but not wired into SCENE_FX". */
        const all = [].concat((specs[i] && specs[i].sprite) || [],
                              (specs[i] && specs[i].warp) || []);
        const sp = all.filter(x => x && x.file === man[slot].file)[0];
        if (!sp) {
          /* A CUT CAN BE DELIBERATELY UNUSED, and saying so in SCENE_FX is the
             difference between a decision and an oversight. Card 1's bell was cut
             before that scene became the hunger closeup, which frames him and pushes
             the bell out of shot. */
          if (specs[i] && specs[i].spriteUnused)
            console.log('   sprite unused : slot %s - %s', slot, specs[i].spriteUnused);
          else
            bad.push('slot ' + slot + ' cut but not wired into SCENE_FX');
          return;
        }
        checked++;
        const mb = man[slot].box, sb = sp.box;
        if (mb.join(',') !== sb.join(','))
          bad.push('slot ' + slot + ' box ' + sb.join(',') + ' != cutter ' + mb.join(','));
        if (man[slot].file !== sp.file)
          bad.push('slot ' + slot + ' file ' + sp.file + ' != ' + man[slot].file);
      });
      console.log('');
      console.log('   sprite boxes  : %d checked against the cutter   %s', checked,
                  bad.length ? '<< ' + bad.join('; ') : '(app.js agrees with the cut - good)');
    } catch (e) {
      console.log('');
      console.log('   sprite boxes  : no assets/images/recap-manifest.json - run '
                  + 'tools/cut-recap-sprites.py to check app.js against the cut');
    }

    /* THE TRAIL DRAWS THE FOOTPATH, which is a relationship over time and not a
       count. Three ways it goes wrong and none of them is visible in "39 footprints
       laid": every mark released at once (the old sweep, just later), marks released
       before the sparkle reaches them (the path drawn ahead of the thing drawing
       it), or never released (an invisible footpath, still reported as 39 laid).

       So: the count of held marks must START at all of them, only ever FALL, and
       END at none. */
    const heldSeq = trace.map(s => s.held).filter(v => v !== undefined);
    if (!heldSeq.length) {
      console.log('   footpath held : << AARU_POST.held IS MISSING');
    } else if (STILL) {
      /* NOTHING IS HELD ON THIS PATH, and that is the right answer rather than a
         missing feature. Reduced motion calls buildTrail(true): there is no sparkle
         to wait for, so the footpath is simply THERE, complete, from the moment the
         ring finishes. Holding marks for a trail that never travels would leave a
         child who asked for less movement with an invisible path. */
      const everHeld = Math.max.apply(null, heldSeq);
      console.log('   footpath held : none, and correctly so - reduced motion draws the '
                  + 'whole path at once   %s',
                  everHeld === 0 ? '(good)'
                                 : '<< ' + everHeld + ' MARK(S) WERE HELD WITH NO TRAIL TO '
                                   + 'RELEASE THEM');
    } else {
      /* MEASURED FROM THE PEAK, NOT FROM SAMPLE ZERO. This trace starts when the
         formation starts, which is seconds before buildTrail has created anything -
         so held() is legitimately 0 at first, rises to every mark the moment they
         are built, and falls from there. Asserting "starts at all of them" reported
         a fault that was the check's own assumption, and this note is here because
         that is easy to get wrong twice. */
      const total = steps.length;
      const peak = Math.max.apply(null, heldSeq);
      const peakAt = heldSeq.indexOf(peak);
      const last = heldSeq[heldSeq.length - 1];
      let rose = 0;
      for (let i = peakAt + 1; i < heldSeq.length; i++)
        if (heldSeq[i] > heldSeq[i - 1]) rose++;
      console.log('   footpath held : %d of %d at their peak (%dms), %d at the end   %s',
                  peak, total, peakAt * 40, last,
                  (peak === total && last === 0 && rose === 0)
                    ? '(all waiting, all released, never re-hidden - good)'
                    : rose > 0
                      ? '<< RE-HIDDEN ' + rose + ' TIME(S) after the peak'
                      : peak !== total
                        ? '<< ONLY ' + peak + ' OF ' + total + ' WERE EVER HELD - the rest '
                          + 'were visible before the trail ran'
                        : '<< ' + last + ' MARK(S) NEVER RELEASED');
      /* RELEASED GRADUALLY, not in one tick. If they all went at once the count
         would fall from every mark to none in a single sample, which is the old
         sweep wearing a new name. */
      let biggest = 0;
      for (let i = 1; i < heldSeq.length; i++)
        biggest = Math.max(biggest, heldSeq[i - 1] - heldSeq[i]);
      console.log('   biggest drop  : %d mark(s) in one 40ms tick   %s', biggest,
                  biggest <= 6 ? '(released as the trail passes them - good)'
                               : '<< ' + biggest + ' AT ONCE - that is a sweep, not a trail');
    }

    /* THE SPARKLE IS ON THE FOOTPATH, not near it. It walks formPath's own curves,
       so this measures the head's distance to the leg it says it is on. A sparkle
       a few pixels off the prints still looks like a sparkle, which is why this is
       the only thing that can see it. */
    const legs = trace.map(s => s.spark).filter(Boolean);
    const curves = P.path ? P.path() : [];
    let offPath = 0, offAt = -1, sampled = 0;
    legs.forEach(s => {
      if (!s.leg || s.leg > curves.length) return;   /* leg 0 is the hop from his hand */
      const cur = curves[s.leg - 1];
      if (!cur) return;
      let near = Infinity;
      for (let q = 0; q <= 300; q++) {
        const t = q / 300, w = 1 - t;
        const qx = w * w * cur.a.x + 2 * w * t * cur.k.x + t * t * cur.b.x;
        const qy = w * w * cur.a.y + 2 * w * t * cur.k.y + t * t * cur.b.y;
        const d = Math.hypot(s.x - qx, s.y - qy);
        if (d < near) near = d;
      }
      sampled++;
      if (near > offPath) { offPath = near; offAt = s.leg; }
    });
    /* There is no sparkle on the reduced-motion path, by design - it is the one
       thing on this screen that is purely travel. Saying so beats reporting zero
       samples as a fault. */
    if (STILL) {
      console.log('   sparkle       : none, and correctly so - reduced motion drops the '
                  + 'travel and keeps the pictures');
    } else {
      console.log('   sparkle on path: %s px worst of %d sample(s)%s   %s',
                  offPath.toFixed(1), sampled,
                  offAt >= 0 ? ' (leg ' + offAt + ')' : '',
                  sampled === 0
                    ? '<< THE SPARKLE WAS NEVER SAMPLED ON A RUN'
                    : offPath <= 2
                      ? '(it is following the footprints - good)'
                      : '<< THE SPARKLE IS NOT ON THE FOOTPATH');
    }

    console.log('');
    console.log('=== the celebration ===');
    const litRows = trace.map(s => s.lit).filter(Boolean);
    const litLast = litRows.length ? litRows[litRows.length - 1] : [];
    const nLit = litLast.filter(Boolean).length;
    console.log('   cards lit     : %d of %d   %s', nLit, RING.length,
                nLit === RING.length
                  ? '(every picture - good)'
                  : '<< ' + (RING.length - nLit) + ' PICTURE(S) NEVER LIT');
    /* ONE AT A TIME, AS THE TRAIL PASSES - and this check used to assert the
       OPPOSITE. It read "one beat, not a sequence", which was right when the sheet's
       Screen 2 lit all ten together and is exactly backwards now the user has asked
       for each picture to light as the trail reaches it. A single beat would mean the
       light is not following the trail at all.

       Under reduced motion there is no trail, every picture is woken in one tick, and
       one beat IS the right answer - so the two paths are asked different questions,
       the same way the wake-order check is. */
    let litFirst = -1, litFull = -1, steps2 = 0, fell = 0;
    litRows.forEach((row, i) => {
      const c = row.filter(Boolean).length;
      const prev = i ? litRows[i - 1].filter(Boolean).length : 0;
      if (c > 0 && litFirst < 0) litFirst = i;
      if (c === RING.length && litFull < 0) litFull = i;
      if (c > prev) steps2++;
      if (c < prev) fell++;
    });
    if (STILL) {
      console.log('   lit together  : first at %s, all at %s   %s',
                  litFirst < 0 ? '-' : (litFirst * 40) + 'ms',
                  litFull < 0 ? '-' : (litFull * 40) + 'ms',
                  litFirst >= 0 && litFirst === litFull
                    ? '(reduced motion - no trail to follow, so one beat - good)'
                    : '<< EXPECTED ONE BEAT ON THIS PATH');
    } else {
      console.log('   lit in turn   : first at %s, all at %s, in %d step(s)   %s',
                  litFirst < 0 ? '-' : (litFirst * 40) + 'ms',
                  litFull < 0 ? '-' : (litFull * 40) + 'ms', steps2,
                  (litFirst >= 0 && litFull > litFirst && steps2 >= RING.length - 1
                   && fell === 0)
                    ? '(each picture lights as the trail reaches it - good)'
                    : litFirst < 0 ? '<< NEVER LIT'
                      : fell ? '<< A PICTURE WENT DARK AGAIN ' + fell + ' TIME(S)'
                        : steps2 < RING.length - 1
                          ? '<< ONLY ' + steps2 + ' STEP(S) FOR ' + RING.length
                            + ' PICTURES - they are lighting in groups, not in turn'
                          : '<< THEY ALL LIT AT ONCE, so the light is not following '
                            + 'the trail');
    }
    console.log('   he cheered    : %s', trace.some(s => s.cheered) ? 'yes' : '<< NO');
    const bits = ids.postBurst.children.length;
    console.log('   stars         : %d   %s', bits,
                bits >= 20 ? '(a burst - good)' : '<< TOO FEW TO READ AS A BURST');

    /* === THE CONFETTI ====================================================
       "these confetti should behave like actual colored paper in the air after
       busting, use of real physics". Every clause of that is a number here, and
       none of them can be read off the DOM: the paper is two canvases.

       WHAT EACH LINE IS GUARDING, because a bound with no failure behind it is
       decoration. The cannons fire 2-3 times: three separate rises in the count.
       It leaves the muzzle: the cloud gets wider than the boy. It goes UP: the
       top of it clears his head. It is PAPER: it comes down at under 600px/s,
       where a stone at this scale is 3300 and the first cut of this model - with
       the quarter-chord moment the wrong way up - knifed down at 850. It TURNS:
       a mean spin over 1 rev/s, which is the term that separates paper from
       ballast. It has DEPTH: some of it draws in front of him. And it ENDS. */
    console.log('');
    console.log('=== the confetti ===');
    const conf = trace.map(s => s.conf);
    const seenConf = conf.filter(Boolean);
    if (!seenConf.length) {
      console.log('   %s', STILL ? 'none, and none is right under reduced motion'
                                 : '<< THE CANNONS NEVER FIRED');
    } else {
      /* Each fresh rise in the count is a cannon: pieces only leave. */
      let shots = 0, was = 0;
      conf.forEach(c => { const n = c ? c.n : 0; if (n > was + 4) shots++; was = n; });
      const at = i => (i * 40) + 'ms';
      const first = conf.findIndex(Boolean);
      const last  = conf.length - 1 - conf.slice().reverse().findIndex(Boolean);
      const peak  = seenConf.reduce((a, c) => Math.min(a, c.top), 1e9);
      const most  = seenConf.reduce((a, c) => Math.max(a, c.n), 0);
      const wide  = seenConf.reduce((a, c) => Math.max(a, c.wide), 0);
      const front = seenConf.reduce((a, c) => Math.max(a, c.front), 0);
      const fast  = seenConf.reduce((a, c) => Math.max(a, c.fast), 0);
      /* The steady fall, taken from the second half of its life - the first is
         still the cannon. */
      const late  = seenConf.slice(seenConf.length / 2 | 0);
      const fall  = late.reduce((a, c) => a + c.fall, 0) / late.length;
      const fSI   = late.reduce((a, c) => a + c.fallSI, 0) / late.length;
      const spin  = late.reduce((a, c) => a + c.spin, 0) / late.length;
      const kLo   = seenConf.reduce((a, c) => Math.min(a, c.k[0]), 9);
      const kHi   = seenConf.reduce((a, c) => Math.max(a, c.k[1]), 0);
      console.log('   cannons       : %d   %s', shots,
                  shots >= 2 && shots <= 3
                    ? '(the "2-3 times" that was asked for - good)'
                    : '<< EXPECTED 2 OR 3 BURSTS');
      console.log('   first / last  : %s .. %s   most in the air %d', at(first),
                  at(last), most);
      console.log('   rises to y    : %d   %s', Math.round(peak),
                  peak < 347 ? '(over his head at 347 - good)'
                             : '<< IT NEVER CLEARS HIM');
      console.log('   spreads to    : %dpx wide   %s', Math.round(wide),
                  wide > 400 ? '(it left the muzzle - good)'
                             : '<< THE JET IS NOT CARRYING IT');
      console.log('   comes down at : %d px/s = %s m/s, spinning %s rev/s   %s',
                  Math.round(fall), fSI.toFixed(2), spin.toFixed(1),
                  (fall > 120 && fall < 600 && spin > 1)
                    ? '(paper, not ballast - good)'
                    : fall >= 600 ? '<< IT IS FALLING LIKE A STONE'
                      : fall <= 120 ? '<< IT IS HANGING IN THE AIR'
                        : '<< IT IS NOT TURNING');
      console.log('   fastest piece : %d px/s   %s', Math.round(fast),
                  fast < 4000 ? '(the muzzle, and the integrator held - good)'
                              : '<< THE SOLVE CAME APART');
      console.log('   in front of him: %d at once, scale %s..%s   %s', front,
                  kLo.toFixed(2), kHi.toFixed(2),
                  front > 0 ? '(it has depth - good)'
                            : '<< ALL OF IT IS BEHIND HIM');
      console.log('   still up at end: %s   %s', conf[conf.length - 1] ? 'yes' : 'no',
                  conf[conf.length - 1] ? '<< IT NEVER LANDED' : '(it ended - good)');
    }

    console.log('');
    console.log('=== teardown ===');
    peek('window').AARU_POST.recapStop();
    advance(200); await settle();
    const leftOver = ['postRing', 'postLine', 'postTrail', 'postMagic',
                      'postFx', 'postSpark', 'postBurst',
                      'postConfBack', 'postConfFront']
      .map(id => [id, ids[id].children.length]);
    console.log('   nodes left    : %s   %s',
                leftOver.map(([id, n]) => id.replace('post', '').toLowerCase() +
                             ' ' + n).join(', '),
                (leftOver.every(([, n]) => n === 0) && P.forming() === false)
                  ? '(clean - good)' : '<< SOMETHING SURVIVED recapStop()');
    advance(3000); await settle();
    const after = drain();
    console.log('   3s after      : %d sound(s)   %s', after.length,
                after.length === 0 ? '(silent - good)' : '<< STILL FIRING');
  },

  async last() {
    console.log('\n=== all %d screens, briskly ===', peek('ROUNDS').length);
    for (let s = 0; s < peek('ROUNDS').length; s++) {
      if (!await playScreen(1500)) break;
    }
    seen = sounds.length;
    console.log('\n=== the finale: 30s on the finished board, nothing touched ===');
    advance(30000);
    await settle();
    const fresh = drain();
    console.log('   locked=%s activeSlot=%s   sounds in that 30s: %d',
                peek('locked'), peek('activeSlot()'), fresh.length);
    console.log('   %s', fresh.length ? '!! SOMETHING IS STILL FIRING'
      : 'silent, as it should be - nothing asks a question that is over');
  },
};

(async () => {
  const what = ARGS[0] || 'idle';
  const run = SCENARIOS[what];
  if (!run) {
    console.log('unknown scenario "%s". one of: %s', what, Object.keys(SCENARIOS).join(', '));
    process.exit(1);
  }
  await boot();
  await run(Number(ARGS[1]) || 8000);
})();
