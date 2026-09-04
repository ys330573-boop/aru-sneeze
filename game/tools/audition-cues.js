/* =============================================================================
   audition-cues.js — hear every cue, and every sequence of cues, in place.

       python tools/serve.py
       open http://127.0.0.1:8000/index.html      # stay on the title screen
       # console:
       await import('/tools/audition-cues.js')

   A panel appears over the title screen. Click the play button ONCE first (or
   any button here) — a browser will not open an audio context until the page
   has been touched, and nothing can be heard before that.

   WHAT MAKES THIS WORTH HAVING. Every cue in this game is measured: the bench
   prints the LUFS, the peak and the length of all eighteen, and every one of
   them lands on its target. None of that says whether the game SOUNDS right. A
   level is a number and a reward is a feeling, and the only way across that gap
   is to listen — so this plays the real files, through the real master chain,
   at the real levels, in the real order and with the real gaps between them.
   What you hear here is exactly what a child hears.

   IT IS NOT tools/audition.js, which is older and narrower: that one auditions
   CANDIDATE synthesis for the card cues, from a table of alternatives, and it
   describes a set of noise-based voices that the recordings have since replaced.
   This plays what actually ships.

   THE SEQUENCES ARE THE POINT. A cue on its own tells you very little — `step2`
   alone is one note of a chord you cannot hear yet. The reward structure in this
   game is a four-part argument spread over a whole screen (three placements, one
   per note, then the flourish that completes the chord they spelt), and the only
   way to judge it is to hear the argument. So the sequences below reproduce the
   real timings, taken from the same constants the game plays them with, not from
   numbers typed in again here.
   ========================================================================== */

const A = window.AARU_AUDIO;
if (!A) throw new Error('audition-cues: app.js has not run — open index.html, not this file.');

/* The gaps the game actually uses. Read off the module rather than restated, so
   this cannot drift away from what it claims to be demonstrating. */
const STEP_DELAY = A.STEP_DELAY_S;

/* ...and the same for the ride, which the game plays SHORTER than its file: it
   is faded out as he settles in the middle, so an audition that let the take run
   to its end would be demonstrating a cue nobody hears. Read off the module for
   the same reason the gap above is. */
const RIDE_OUT = A.rideOut ? A.rideOut() : {};

/* ...and the walk, for the same reason: the recap never plays the whole cue
   either. This is the two-footfall cut that every one of the nine legs takes. */
const WALK_OUT = A.trailOut ? A.trailOut() : {};

/* --- what each cue is, in one line ---------------------------------------- */

const WHAT = {
  pop:       ['the play button', 'a bubble, then two music box notes rising a fourth'],
  deckIn:    ['a round opens', 'MUTED — a slice out of a shuffle, not a deck landing'],
  deal:      ['a card is dealt', 'MUTED — the recording is fine; it went back with the other two'],
  pickup:    ['every card lift', 'MUTED — fires far too often to carry information'],
  correct:   ['a card lands', 'the supplied card-drop mp3. What the card physically did'],
  step1:     ['1st card placed', 'music box Ab5 — the first note of the chord'],
  step2:     ['2nd card placed', 'music box C6 — the second note'],
  step3:     ['3rd card placed', 'music box Eb6, plus Ab6 closing the octave'],
  wrong:     ['a card refused', 'paper bump, then a soft falling third. Not a buzzer'],
  hint:      ['the child has paused', 'two quiet notes rising a fourth. A whisper'],
  /* roundDone and hops are RETIRED - no file, no plan row - so they are not
     listed here any more. tools/audition-pick.js still builds them live. */
  applause:  ['ALL THREE PLACED', 'THE WHOLE CELEBRATION: a class clapping, one pass, no drum in front of it'],
  haul:      ['frames arrive', 'curtain rings on a rail — one continuous take, no splice. '
              + 'RENDERED FOR THE OPENING AND THE ENDING, which move the line a whole stage '
              + 'width; the five seams in between move it one or two frame pitches and fade '
              + 'this out early, so its three frame-knocks land on nothing there. See the '
              + 'seam-sound note over shiftLine in app.js'],
  swing:     ['he rides in', 'a squeaky swing: the line under his weight. NEW — was a jingle'],
  trail:     ['the magic trail', 'a bell tree, cut to the light\'s own travel. It REPLACED nine versions of a footstep cue'],
  fall:      ['he lets go', 'air on the way down. NEW — this was silent'],
  thud:      ['his feet land', 'a bright knock for the impact + a real body scuff behind it'],
  snap:      ['his fingers snap', 'a real finger snap, alone — the shimmer was removed'],
  topple:    ['the box goes over', 'real wood, a drop and its settle. NEW — this was silent'],
  cheer:     ['the confetti', 'BACK, with a beat of its own: a hall of ~300 children, on the frame the clap starts'],

  /* --- the story's own sounds, one per picture in the recap ------------------
     Nine of the ten cards sound now, where four did. Every one of these is a
     RECORDING; the four that existed before were oscillators and filtered noise,
     which is what the user meant by "sounds like a machine and had no effect on
     real emotions of kids". Listen to them in order with the "The story, in
     order" sequence below rather than one at a time - each is judged against the
     one before it, not against silence. */
  tummy:     ['card 1, he is hungry', 'a REAL stomach, pitched up to a child. Was two noise bands + two sines'],
  sneeze:    ['card 2, आssशू', 'a real child sneezing. Was three grains of filtered hiss'],
  gasp:      ['card 3, the pot is empty', 'the boy\'s own voice, going UP 286->419Hz. This card was SILENT'],
  cycle:     ['card 4, he rides in', 'a real tyre on a dirt road, under the whole 1.4s ride. This was SILENT'],
  ting:      ['card 4, टिन-टिना', 'a real bicycle bell, struck twice. Was three sines at a bell\'s ratios'],
  crash:     ['card 5, धड़ामा', 'the bike going over + the same boy grunting. Was `thud` fired twice'],
  splash:    ['card 6, छपाका', 'real liquid on dry road. Was a wet slap and three placed drops'],
  dogeat:    ['card 7, the dog', 'real teeth on something brittle. This card was SILENT'],
  sad:       ['card 8, walking home', 'the same boy: a breath into a low hum. This card was SILENT'],
  clatter:   ['card 9, the utensils', 'three knocks in the air, then six pieces of steel landing. This card was SILENT'],
  amazed:    ['card 10, Amma\'s locket', 'a real glockenspiel, struck and ringing, on the game\'s own Ab. Was वाह, and before that an English "wow"'],

  /* --- and the beats outside the recap that had no sound ------------------- */
  ride:      ['each picture flies in', 'the other half of `haul`, left to right. Ten of them. Was SILENT'],
  formed:    ['the ring closes', 'all ten home - the whole story on screen at once. Was SILENT'],
};

/* --- the sequences -------------------------------------------------------- */

/* Each entry is [cue, seconds from the start of the sequence, options]. The
   offsets are the game's own: CHEER_DELAY_MS/CHEER_STEP_MS for the bounces,
   STEP_DELAY_S behind each card-drop, and the finale's beats as sim.js reports
   them (node tools/sim.js last 2500 --video). */
const SEQ = {
  'A card going in': {
    why: 'the drop is the impact, the note is the frame accepting it. ' +
         STEP_DELAY.toFixed(2) + 's apart, which is what makes them one event ' +
         'with a consequence rather than a chord with a click on the front.',
    steps: [['correct', 0], ['step2', STEP_DELAY]],
  },
  'A whole screen, completed': {
    why: 'THE ONE TO LISTEN TO. Three cards go in, one note each — Ab, then C, ' +
         'then Eb — and by the third the child has spelt out a chord. Then the ' +
         'flourish starts on that same chord and finishes it. The point is that ' +
         'the reward is not a new noise arriving; it is the thing they built.',
    steps: [['correct', 0.0], ['step1', STEP_DELAY],
            ['correct', 2.2], ['step2', 2.2 + STEP_DELAY],
            ['correct', 4.4], ['step3', 4.4 + STEP_DELAY],
            ['applause', 4.5]],
  },
  'A round opening (MUTED — silent by design)': {
    why: 'press this and you should hear almost nothing, which is the point. deckIn ' +
         'and deal are in SFX_MUTED, so a screen deals itself out and ' +
         'asks its question in silence — the narrator carries it, and the first sound ' +
         'of a screen is the child\'s own first placement. `haul` is NOT muted and is ' +
         'the line itself arriving. They were briefly ' +
         're-sourced from real cards, paper and rope and un-muted; two of the three ' +
         'sounded worse than the synthesis (the rope splices to itself with a 19.5 dB ' +
         'step, the deck is a slice out of the middle of a shuffle) and all three went ' +
         'back. To hear them anyway: AARU_AUDIO.SFX_MUTED.clear()',
    steps: [['haul', 0], ['deckIn', 1.75], ['deal', 2.65], ['deal', 3.03]],
  },
  'Getting it wrong, then right': {
    why: 'the refusal has to read as "not that one" and never as a penalty. It ' +
         'sounds the CARD first — a paper bump — before it sounds the judgement.',
    steps: [['wrong', 0], ['wrong', 1.6], ['hint', 3.4],
            ['correct', 5.4], ['step1', 5.4 + STEP_DELAY]],
  },
  'The whole ending': {
    why: 'ONE EVENT, ONE SOUND, NOTHING SIMULTANEOUS. This had seven cues and three ' +
         'overlapping pairs, two of them stacked three deep — the landing was a knock ' +
         'plus a body scuff plus the loudest cue in the game all on one tick, and the ' +
         'snap was a click plus a shimmer plus a crowd. Now the impact gets the landing ' +
         'to itself and the snap is single and alone. The music box flourish that used ' +
         'to open 0.60s after the landing has been removed from the game, so the ' +
         'landing is now silence after the impact. The only overlap left is the box ' +
         'tipping during the ride, which cannot move because it is what the picture ' +
         'is doing.',
    steps: [['swing', 0, RIDE_OUT], ['topple', 0.90],
            ['fall', 4.60], ['thud', 5.34],
            ['snap', 8.74]],
  },

  'The story, in order  (THE ONE TO LISTEN TO)': {
    why: 'THE WHOLE POINT OF THIS PASS. Nine of the recap\'s ten pictures now sound, ' +
         'where four did, and every one of them is a RECORDING - a real stomach, a ' +
         'real child sneezing, the boy\'s own gasp and sigh, a real bicycle bell, the ' +
         'bike going over with him on it, real liquid, a real dog. What was here was ' +
         'four cues built out of oscillators and filtered noise, each measured, each ' +
         'on target, and none of them the sound of a child. Judge them as a RUN: they ' +
         'are heard one after another, each against the one before it, and the story ' +
         'should carry - hungry, sneeze, the pot is empty, off on the bicycle, the ' +
         'crash, the juice, the dog, walking home sad, and Amma finding her locket. ' +
         'The gaps are the real ones, taken from `node tools/sim.js form`, scaled ' +
         'down 3x so the run is 11s instead of 33 - the ORDER and the RELATIVE ' +
         'spacing are what is being judged here, not the wait.',
    steps: [['tummy', 0.00], ['sneeze', 1.09], ['gasp', 2.34],
            ['cycle', 3.47], ['ting', 3.95],
            ['crash', 4.71], ['splash', 5.75], ['dogeat', 6.57], ['sad', 7.62],
            ['amazed', 9.81]],
  },
  'The footpath, three legs of it': {
    why: 'THE SEVENTH VERSION OF THE FOOTSTEPS, and the one to listen to for this cue. '
         + 'Six recordings were rejected before it and the sixth was two 100ms taps cut out '
         + "of the user's own walk and struck 300ms apart by a clock. This is that same "
         + 'recording played as a WALK: three footfalls in one take, their own rhythm '
         + 'stretched from 185ms to 280, and the recap cuts it after the second one because '
         + 'that is all a leg has room for. The gaps here are the real ones from '
         + '`node tools/sim.js form` - 4.85s and 5.09s leg to leg - and each walk is '
         + 'followed by the picture cue it has to stay clear of, at the real distance. What '
         + 'is being judged is whether it sounds like somebody walking the path, and whether '
         + 'the last footfall is clear of the picture that speaks after it.',
    steps: [['trail', 0.00, WALK_OUT], ['sneeze', 0.98],
            ['trail', 4.85, WALK_OUT], ['gasp', 6.82],
            ['trail', 9.94, WALK_OUT], ['cycle', 11.57]],
  },
  'The ring closing, and the celebration': {
    why: 'THREE BEATS THAT WERE SILENT. Ten pictures come in from the left on the ' +
         'clothesline - `ride`, once each, and they BUNCH at the end because each one ' +
         'travels a different distance, so the ring fills with an accelerando. Then ' +
         '`formed`, the moment the whole story is on the screen at once, which had no ' +
         'sound at all. Then the celebration: a hall of about 300 children on the ' +
         'confetti - a cue that was cut once for landing on top of the snap and now ' +
         'has a beat of its own. It used to open 0.95s into a music box flourish; that ' +
         'flourish is gone from the game and the crowd lands on the clap.',
    steps: [['ride', 0.00], ['ride', 0.76], ['ride', 1.87], ['ride', 2.99],
            ['ride', 4.12], ['ride', 4.88], ['ride', 5.66], ['ride', 6.01],
            ['ride', 6.36], ['ride', 6.73], ['formed', 7.52],
            ['cheer', 9.50]],
  },
  'Just the ride (what changed)': {
    why: 'the 3.2s entrance on its own. A 3.25s take in one piece — the rule the ' +
         'haul arrived at after being spliced from a 0.98s clip and stepping 19.5 dB ' +
         'at the seam. It travels right to left with him. IT NOW STOPS WHEN HE DOES: ' +
         'the ride is asymptotic and spends its last quarter covering 20px, so the cue is ' +
         'faded out as he settles in the middle and the last 770ms of the take is never ' +
         'heard. See ENTRY_SFX_OUT_S.',
    steps: [['swing', 0, RIDE_OUT], ['topple', 0.90]],
  },
};

/* --- playing them --------------------------------------------------------- */

let timers = [];

function stopAll() {
  timers.forEach(clearTimeout);
  timers = [];
  /* ...and a raw cut, which is a BufferSource this module holds rather than one
     sfx() fired and forgot. Two takes compared by clicking one then the other
     have to not overlap, which is the whole point of the pair. */
  if (cutSrc) { try { cutSrc.stop(); } catch (e) { /* already ended */ } cutSrc = null; }
}

function playSeq(name) {
  stopAll();
  const seq = SEQ[name];
  seq.steps.forEach(([cue, at, opt]) => {
    timers.push(setTimeout(() => {
      A.sfx(cue, opt || {});
      mark(cue);
    }, at * 1000));
  });
}

/* A cue that is muted would silently do nothing here, which in an audition tool
   is a bug rather than a feature: you would be listening for a sound the set has
   deliberately removed and concluding the file was broken. So this reports it. */
function playOne(cue) {
  stopAll();
  if (A.SFX_MUTED.has(cue)) {
    note(cue + ' is in SFX_MUTED, so the game plays nothing. Un-mute it to hear it: ' +
         'AARU_AUDIO.SFX_MUTED.delete("' + cue + '")');
    return;
  }
  A.sfx(cue);
  mark(cue);
}

/* --- the candidates, which is the part a measurement cannot settle ---------

   THREE OF THE SEPTEMBER 3 REPLACEMENTS CAME DOWN TO A CHOICE NO NUMBER MAKES.
   Every candidate in that pass was measured - band, floor, busy, peak, and the
   position of the loudest frame - and for most cues the numbers were decisive:
   a hemp rope at 4/37/59 and -40 dBFS cannot beat a metal one at 1/76/23, and
   bar chimes at 0/11/89 are the brightness a child hears as sharp whatever they
   are recordings OF. But three pairs measure so close together that what
   separates them is what they SOUND LIKE:

     sad / sad2         one boy, two windows out of the same 55s take. A breath
                        falling to a hum at 210Hz, against a held voiced vowel at
                        242Hz. Which of them is a small boy being SAD - rather
                        than yawning, or straining - is not in the band figures.
     sneeze / sneezebig a documented "small kid" at 0.55s, against a bigger,
                        louder sneeze of unknown age at 0.95s and a better band.
                        The user asked for childish AND dramatic; these are the
                        two ends of that.
     mumawe / mumawe2   two takes of one wordless awe by one woman, 3dB and 40ms
                        apart. Which reads as a mother rather than an actress.

   So both halves of each pair are cut, loaded and playable here. The winner is
   already wired into its cue; the loser should be DELETED - from ONESHOTS in
   cut-sfx-assets.py, from SAMPLE_SRC in app.js, and from this table - once the
   choice is made, because a candidate kept "for now" is indistinguishable from
   a candidate nobody got round to auditioning.

   THIS PLAYS THE RAW CUT, not a cue: the cuts are at -1.0 dBFS peak with no
   levelling and no room, so they are LOUDER and drier here than the game will
   ever be. That is the right way round for comparing two takes and the wrong way
   round for judging a level - for a level, play the cue in the table above. */
const PAIRS = [
  ['sad',    'sad2',      'card 8, the sad walk home',
   'shipped: a breath into a low hum, 210Hz  |  candidate: a held voiced vowel, 242Hz'],
  ['sneeze', 'sneezebig', 'card 2, the flour sneeze',
   'shipped: a documented small kid, 0.55s  |  candidate: bigger, louder, unknown age'],
  ['mumawe', 'mumawe2',   'card 10, her wordless awe',
   'shipped: take 1, 0/100/0  |  candidate: take 2, 3dB louder'],
  ['spill',  'spill2',    'card 6, the juice going over',
   'was: a close drip recording  |  shipped: a harder front, peak at 10% of the file'],
  ['magic',  'manjira2',  'the trail (VOICES.formed)',
   'was: bell-tree, which its own author says is a granulizer  |  shipped: a real manjira'],
];

let cutSrc = null;
function playCut(name) {
  stopAll();
  const ctx = A.ctx();
  if (!ctx) { note('touch the page first - a browser will not open an audio context ' +
                   'until it has been clicked.'); return; }
  const go = () => {
    const buf = A.sampleBufs.get(name);
    if (!buf) { note('no cut called "' + name + '" - is it in SAMPLE_SRC and has ' +
                     'tools/cut-sfx-assets.py been run?'); return; }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(A.getMaster());
    src.start(ctx.currentTime + 0.01);
    cutSrc = src;
    note(name + ': ' + buf.duration.toFixed(2) + 's, raw cut at -1.0 dBFS - no level, no room.');
  };
  /* loadSamples() is the bench's, not the game's: during a real game sampleBufs
     stays empty, so the first click here has to fill it. */
  if (A.sampleBufs.size) { go(); return; }
  note('loading the cuts...');
  A.loadSamples().then(go);
}

/* --- the panel ------------------------------------------------------------ */

const host = document.createElement('div');
host.id = 'aaru-audition';
host.innerHTML = '';
Object.assign(host.style, {
  position: 'fixed', inset: '0 0 auto auto', zIndex: 99999,
  width: 'min(560px, 96vw)', maxHeight: '96vh', overflow: 'auto',
  margin: '2vh 2vw', padding: '18px 20px 22px',
  font: '13px/1.5 ui-sans-serif, system-ui, sans-serif',
  color: '#12212e', background: 'rgba(255,255,255,0.97)',
  border: '1px solid rgba(0,0,0,0.14)', borderRadius: '14px',
  boxShadow: '0 18px 50px rgba(0,0,0,0.30)',
});

const css = document.createElement('style');
css.textContent = `
  #aaru-audition h2 { margin:0 0 2px; font-size:16px; letter-spacing:-0.01em; }
  #aaru-audition h3 { margin:18px 0 7px; font-size:11px; text-transform:uppercase;
                      letter-spacing:0.09em; color:#5c7183; font-weight:650; }
  #aaru-audition p  { margin:0 0 10px; color:#4a5f70; }
  #aaru-audition .seq { margin:0 0 9px; padding:9px 11px; border-radius:9px;
                        background:#f2f6f9; border:1px solid #dde6ed; }
  #aaru-audition .seq b { display:block; font-size:13px; margin-bottom:3px; }
  #aaru-audition .seq span { display:block; color:#53687a; font-size:11.5px; margin-bottom:7px; }
  #aaru-audition button { font:inherit; cursor:pointer; border-radius:7px;
                          border:1px solid #b9c8d4; background:#fff; padding:4px 11px; }
  #aaru-audition button:hover  { background:#eaf2f8; border-color:#8fa6b8; }
  #aaru-audition button:active { transform:translateY(1px); }
  #aaru-audition .go { background:#12212e; color:#fff; border-color:#12212e; font-weight:600; }
  #aaru-audition .go:hover { background:#26404f; }
  #aaru-audition table { width:100%; border-collapse:collapse; }
  #aaru-audition td { padding:3px 4px; border-top:1px solid #e6edf2; vertical-align:top; }
  #aaru-audition td.n  { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:11.5px;
                         white-space:nowrap; font-weight:600; }
  #aaru-audition td.w  { color:#53687a; font-size:11.5px; }
  #aaru-audition td.b  { width:1%; }
  #aaru-audition tr.is-new td.n { color:#0a7d4a; }
  #aaru-audition tr.is-muted    { opacity:0.55; }
  #aaru-audition tr.lit td      { background:#fff5cc; }
  #aaru-audition .note { margin-top:10px; padding:8px 10px; border-radius:8px;
                         background:#fff8e1; border:1px solid #f0dfa8; font-size:11.5px;
                         color:#5b4a12; display:none; }
  #aaru-audition .foot { margin-top:16px; padding-top:11px; border-top:1px solid #e6edf2;
                         font-size:11px; color:#748898; }
`;
document.head.appendChild(css);

/* Highlighted in the table as "new or changed in this pass". Everything the
   sound work touched, so the rows worth listening to first are the ones that
   stand out - the nine story cues, the three beats that were silent, and
   roundDone, which gained a crowd. */
const NEW = new Set(['tummy', 'sneeze', 'gasp', 'cycle', 'ting', 'crash', 'splash',
                     'dogeat', 'sad', 'amazed',
                     'ride', 'formed', 'cheer', 'applause', 'haul']);

function el(tag, attrs, kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'text') n.textContent = attrs[k];
    else n.setAttribute(k, attrs[k]);
  }
  (kids || []).forEach(k => n.appendChild(k));
  return n;
}

const title = el('h2', { text: 'आरू की छींक — cue audition' });
const blurb = el('p', { text: 'Every cue, through the real chain, at the level that ships. '
                            + 'Click anything once to open the audio context.' });
host.appendChild(title);
host.appendChild(blurb);

const noteBox = el('div', { class: 'note' });
function note(msg) { noteBox.textContent = msg; noteBox.style.display = 'block'; }

host.appendChild(el('h3', { text: 'Sequences — hear these first' }));
Object.keys(SEQ).forEach(name => {
  const box = el('div', { class: 'seq' });
  box.appendChild(el('b', { text: name }));
  box.appendChild(el('span', { text: SEQ[name].why }));
  const b = el('button', { class: 'go', text: '▶  play' });
  b.onclick = () => playSeq(name);
  box.appendChild(b);
  host.appendChild(box);
});

host.appendChild(el('h3', { text: 'One cue at a time' }));
const table = el('table');
const rowFor = {};
Object.keys(A.SFX_SRC).forEach(cue => {
  const [when, what] = WHAT[cue] || ['', ''];
  const muted = A.SFX_MUTED.has(cue);
  const tr = el('tr', { class: (NEW.has(cue) ? 'is-new ' : '') + (muted ? 'is-muted' : '') });
  tr.appendChild(el('td', { class: 'n', text: cue }));
  tr.appendChild(el('td', { class: 'w', text: when }));
  tr.appendChild(el('td', { class: 'w', text: what }));
  const td = el('td', { class: 'b' });
  const b = el('button', { text: '▶' });
  b.onclick = () => playOne(cue);
  td.appendChild(b);
  tr.appendChild(td);
  table.appendChild(tr);
  rowFor[cue] = tr;
});
host.appendChild(table);

host.appendChild(el('h3', { text: 'Two takes of the same moment — pick by ear' }));
PAIRS.forEach(([a, b, where, why]) => {
  const box = el('div', { class: 'seq' });
  box.appendChild(el('b', { text: where }));
  box.appendChild(el('span', { text: why }));
  const ba = el('button', { class: 'go', text: '\u25b6  ' + a });
  ba.onclick = () => playCut(a);
  const bb = el('button', { class: 'go', text: '\u25b6  ' + b });
  bb.onclick = () => playCut(b);
  box.appendChild(ba);
  box.appendChild(bb);
  host.appendChild(box);
});

host.appendChild(noteBox);

const stop = el('button', { text: 'stop' });
stop.onclick = stopAll;
const foot = el('div', { class: 'foot' });
foot.appendChild(stop);
foot.appendChild(el('span', { text: '  green = new in this pass. Faded = muted, so the game '
                                 + 'plays nothing. Remove the panel: '
                                 + 'document.getElementById("aaru-audition").remove()' }));
host.appendChild(foot);

document.body.appendChild(host);

/* Light the row a cue belongs to as it fires, so a sequence is legible as well
   as audible — which is the difference between "something played" and knowing
   WHICH thing played, in a run of five cues 140ms apart. */
function mark(cue) {
  const tr = rowFor[cue];
  if (!tr) return;
  tr.classList.add('lit');
  setTimeout(() => tr.classList.remove('lit'), 320);
}

console.info('[aaru] audition panel up. Sequences first — "A whole screen, completed" is ' +
             'the reward argument, and "The whole ending" is the four cues that used to be silent.');

export default { playSeq, playOne, stopAll, SEQ, WHAT };
