/* =============================================================================
   आरू की छींक — story-sequencing activity

   Layout comes from the Figma "LBD" section:
     130:599  base screen (empty slots, three cards in the tray)
     133:2037 hand nudge          133:2273 correct placement
     133:2524 rejected placement  177:82   bare template (between rounds)
     130:1096 / 130:1143 / 130:1190  rounds 2, 3, 4

   Ahead of all of that is the title screen — the supplied thumbnail and play
   button, in assets/ui — which is where the game now starts. It is also where
   the audio context opens, since a browser will not allow one before the page
   has been touched. See the title screen block at the foot of this file.

   Behaviour comes from the gameplay feedback script:

     CORRECT   card snaps into the active slot, briefly lights up, a soft
               positive SFX plays, it becomes fixed. The bottom choices
               immediately scroll left, a new card enters from the right, and
               the next story position becomes active.

     INCORRECT 1st attempt — card gently wiggles and bounces back. No VO, no hint.
               2nd attempt — same, plus VO for the correct picture card.
               3rd attempt — same, then the correct card gently pulses.

     IDLE      Nine seconds of stillness buys one rung, from wherever the child
               has got to and however many wrong guesses are behind them.
               Hint 1 — the correct card gently pulses.
               Hint 2 — nine seconds more and the 133:2037 hand pair comes up
               and mimes the drag: a solid hand parked on the correct card,
               and a ghost of it carrying from there into the right frame.
               A wrong guess restarts that clock rather than blocking it, so a
               child who is still trying never sees either rung.
               On screen 1's FIRST frame both come up with no wait at all, on
               the frame the opening instruction stops — nobody has been shown
               the gesture yet there, so it is a demonstration and not a hint.
               See firstTeach(). The narrator does not join in on either rung:
               nothing in this game is spoken twice.

   All coordinates are Figma canvas coordinates on the fixed 1920x1080 stage.

   --- NOT BUILT, AND WHY ------------------------------------------------------

   The mascot — the boy's face in a pink ring at the top-left of 133:2524. It
   appears in that one frame, over an empty banner, so its trigger is undefined.
   It reads like a narrator avatar tied to the VO.

   A card entering from the right. The tray is a real carousel — a window of
   three stations over a queue — so this already works, but it needs a pool
   deeper than three to be visible. Every round has exactly three cards, so in
   practice you only ever see the choices scroll left. Add distractor cards to a
   round and the entrance animates itself.

   The six-card ordering in note 130:477 (`सही क्रम: B → D → E → F → A → C`,
   `Screen sequence: 1 → 3 → 5 → 7 → 9 → 11`). That describes a six-step
   sequence across six screens, which does not map onto the three-slot frames
   built here, and the letters A-F match no card set in the section. Worth
   clarifying whether it supersedes these four rounds.

   The four story/cutscene frames (130:278, 130:282, 130:290, 130:698) — out of
   the agreed scope. The standalone logo art is not on this list: the title
   screen is built from the supplied thumbnail and play button instead.
   ========================================================================== */

'use strict';

/* WHICH BUILD AM I LOOKING AT — the cache-busting token for every GENERATED
   asset. Read the full protocol beside stampBuild() at the foot of this file;
   this is only the number, and it lives up here because primeSfx() needs it and
   primeSfx() runs long before the foot of the file is evaluated. It was declared
   down there next to its own documentation, which was tidier and would now be a
   ReferenceError: `const` is hoisted into a temporal dead zone, not initialised,
   so a loader calling it on the way up gets an exception rather than a value.

   BUMP IT whenever a generated asset is rebuilt — under assets/images/ OR
   assets/sfx/ — and bump the matching ?v= in index.html with it.

   IT WAS MISSED, AND THIS IS WHAT THAT COSTS. Three rounds of audio work went in
   at 166: the whole cue set re-levelled 4 dB louder, five cues re-trimmed,
   round-done.wav rebuilt shorter, applause.wav added. index.html's ?v= was
   bumped each time, so app.js itself reloaded and the game BEHAVED as new — and
   every .wav went on being fetched as ?v=166, so the browser served the copies
   it had cached before any of it. The one new file, applause.wav, had never been
   cached and so played, which made the result even harder to read: part of the
   change was audible and part of it silently was not.

   THE TWO NUMBERS MUST MATCH, and stampBuild() now checks that they do rather
   than trusting whoever edited one of them - see the drift check down there. */
const BUILD = 228;

/* WHAT THE CUES SHOULD WEIGH, ALL 29 OF THEM ADDED UP, and it is here because
   BUILD on its own cannot catch the way this actually goes wrong.

   stampBuild() already checks index.html's ?v= against BUILD, which catches the
   two numbers drifting apart. It cannot catch the other failure, which is the
   one that has now cost two rounds of work: the numbers AGREE, and the assets
   were rebuilt without either of them moving. Every .wav then goes on being
   fetched at a token the browser already has a copy of, and it serves the old
   bytes - no error, no warning, and a game that BEHAVES new because app.js is
   new. The last time, a child heard an English "Wow" on the last picture of the
   story and nothing at all on the one before it, on a build whose source had the
   right sound for both.

   SO THE FILES ARE WEIGHED ON ARRIVAL. One number rather than 29, because one
   number is maintainable by hand and 29 is not, and because the question it has
   to answer is not "which file is stale" but "is anything here not the set this
   code was built against". primeSfx() prints the total it measured when they
   disagree, so correcting this is copy-and-paste - the same protocol as the
   SFX_TRIM.correct the bench prints.

   BUMP IT WITH BUILD whenever anything under assets/sfx/ is rebuilt.
   `node -e` over the folder gets it, and tools/_bench-report.json carries the
   per-file `bytes` if you need to know WHICH one moved. */
const SFX_BYTES = 7581468;

/* --- design geometry ------------------------------------------------------ */

const STAGE_W = 1920;
const STAGE_H = 1080;
const CARD_H  = 272;          // every card in every round

/** Width of the white card frame, read from the stylesheet so the two agree. */
const BW = parseFloat(getComputedStyle(document.documentElement)
             .getPropertyValue('--card-bw')) || 10;

/** Read a length or duration back out of the stylesheet. The haul's numbers are
    read per call rather than cached, because the reduced-motion media query
    rewrites them and a preference can change while the page is open. */
function cssNum(name, fallback) {
  const raw = getComputedStyle(document.documentElement)
                .getPropertyValue(name).trim();
  const n = parseFloat(raw);
  if (!isFinite(n)) return fallback;
  return raw.endsWith('ms') || !raw.endsWith('s') ? n : n * 1000;
}

/* Centre of each hanging photo frame's recess:
   slot.left + well.left(39.52) + well.width/2(195.383), 288 + 33.56 + 133.674 */
const SLOT_CENTER = [
  { x: 375.903,  y: 455.234 },
  { x: 960.343,  y: 455.234 },
  { x: 1544.783, y: 455.234 },
];

/** Width of one hanging frame, from `.slot` in styles.css. Only the haul's
    sound uses it, and only to work out when each frame becomes visible. */
const SLOT_W = 469.441;

/** WHEN EACH FRAME APPEARS, as a fraction of the haul's TRAVEL — not of its
    time. The bay rides in as a rigid unit, so nothing about it is staggered in
    code; what is staggered is the picture. Three frames 469px wide sitting
    584px apart cross the right edge of a 1920px stage at three clearly separate
    moments, and a frame's leading edge crosses exactly when the bay has
    travelled as far as that frame's own left edge sits from the origin.

    So this is just each frame's left edge as a fraction of the stage, and it
    comes out 0.073, 0.378, 0.682 — which through the ride's easing is 449ms,
    774ms and 969ms of a 1700ms haul.

    IT IS IN DISTANCE AND NOT IN TIME ON PURPOSE. easeHaul is ease-in-out, so
    the middle of the ride covers three times the ground the ends do; three
    events spaced evenly in TIME would drift off the frames they belong to as
    soon as anyone retuned the curve. VOICES.haul converts these through
    easeHaulInv, which is what that function exists for. */
const FRAME_IN = SLOT_CENTER.map(s => (s.x - SLOT_W / 2) / STAGE_W);

/** Seconds from the start of a haul until frame `i` first shows. The ride's
    easing is what turns a distance into a time, which is what easeHaulInv is
    for. Two callers and they must not drift: VOICES.haul lays its boings out
    against these, and runHaul delays the whole cue by the first of them. */
function frameInAt(i) { return (HAUL_MS / 1000) * easeHaulInv(FRAME_IN[i]); }

/* The haul's three notes are played an OCTAVE DOWN - see the note in
   VOICES.haul for why - and half speed stretches their attacks with everything
   else. Measured on the cuts, xylo1/2/3 reach full level 43.4, 47.2 and 51.0ms
   after they are struck, so at 0.5 they peak 87, 94 and 102ms after they start.
   Play one AT the moment its frame appears and the sound of it lands a tenth of
   a second late, which on a 195ms gap between frames is a quarter of the way to
   the next one. */
const HAUL_XYLO_RATE   = 0.5;

/* THE SAME OCTAVE, FOR THE SAME REASON, ON THE OTHER CUE THAT USES THIS TOY.
   VOICES.wrong plays xylo3 and xylo1 falling; at their natural rate that pair is
   3136Hz and 2087Hz with 2.2% of its energy above 5kHz, which is bright enough
   to read as sharp on a cue that fires on every wrong guess. Halved they are
   1568Hz and 1044Hz - warm, and the register the haul already demonstrates.

   IT IS A SEPARATE CONSTANT FROM HAUL_XYLO_RATE even though both are 0.5,
   because they answer different questions: the haul's is half speed to make
   three notes a chord's worth of low, and this one is half speed to take the
   sharpness off a repeated cue. Tying them together would mean re-tuning the
   haul every time this cue is judged too bright or too dull.

   AND IT IS NOT CALLED XYLO_RATE, which is what it was for one edit: VOICES.haul
   already declares a local `const XYLO_RATE = HAUL_XYLO_RATE` inside itself, so
   a module-level one of that name is shadowed there. Both happen to be 0.5
   today, so nothing would have broken - which is exactly what makes it worth
   renaming, because the day someone moves one of them the other silently does
   not follow.

   THE HAUL REACHED THIS CONCLUSION FIRST, on the same instrument: "A toy
   xylophone is a HIGH instrument: this take's eight notes run 2086-3999Hz...
   Played straight, these notes rendered 0/86/14 with a centroid of 3736Hz."
   Read that note before changing this number; it is the measurement this one
   is standing on. */
const WRONG_XYLO_RATE  = 0.5;

/* THERE IS NO WRONG_PIANO_RATE ANY MORE, and the reason it existed is the
   reason it is gone. `pianowrong` was a 130ms cut - the first strike of the
   supplied recording, which is the only strike with silence in front of it -
   and 130ms is a plink. Rate was reached for because it was the only lever on a
   cut that could not be extended: 0.75 made it 173ms and a perfect fourth
   lower. It was still too fast, because 43ms was never going to be the answer
   to a note that is six times too short.

   THE CUT MOVED INSTEAD, and the note is 0.85s now with its own decay - see
   `pianowrong` in cut-sfx-assets.py for the analysis that found the room for
   it, and for what two earlier passes over the same file got wrong. A note that
   rings for its natural length does not need to be slowed to sound unhurried,
   and playing this one slower would now only make it lower.

   IF IT IS EVER WANTED AGAIN it is one field on the smp() call below, and the
   picker carries the rate ladder. But reach for the CUT first: on a sample,
   length and pitch are the same knob, and it is worth being sure which of the
   two a complaint is actually about. This one was about length, twice, and was
   answered with pitch twice. */
const HAUL_XYLO_ATTACK = [0.0434, 0.0472, 0.0510];

/** When note `i` must START for its PEAK to land on the frame it belongs to.
    This is what a cue that marks a visible event has to be aligned on: the ear
    hears a note's peak, not the moment its file was triggered. Also what the
    haul is delayed by at the call site, so both ends agree - see runHaul. */
function haulNoteAt(i) {
  return frameInAt(i) - HAUL_XYLO_ATTACK[i] / HAUL_XYLO_RATE;
}

/* The rope's centreline, every 80px across the stage — the same curve the
   clip-path in styles.css cuts the rope out of, and what the frames ride when
   the line is hauled. It is levelled: the drawn rope ends 5.6px higher on the
   right than on the left, and repeating a curve that does not close would step
   a frame's height by that much each time it crossed the edge of the screen.
   Nothing can see the difference — a frame hangs 40px below the line — but the
   step would have shown. */
const ROPE_Y = [
  251.1, 256.9, 263.6, 270.1, 275.9,
  280.9, 285.1, 288.5, 291.2, 293.2,
  294.6, 295.4, 295.6, 295.4, 294.7,
  293.5, 292.0, 289.9, 287.2, 283.7,
  279.2, 273.4, 266.4, 258.6, 251.1,
];
const ROPE_STEP = STAGE_W / (ROPE_Y.length - 1);

/** Height of the line at `x`. The sag repeats every stage width, as it would
    between one pair of posts and the next, so this answers for frames that are
    still off the screen on either side. */
function ropeY(x) {
  const u = ((x % STAGE_W) + STAGE_W) % STAGE_W;
  const i = Math.floor(u / ROPE_STEP);
  const t = u / ROPE_STEP - i;
  return ROPE_Y[i] + (ROPE_Y[i + 1] - ROPE_Y[i]) * t;
}

/* --- tuning ---------------------------------------------------------------- */

const IDLE_HINT_1_MS = 9000;  // inactivity before the choices pulse
const IDLE_HINT_2_MS = 9000;  // further inactivity before the hand nudge, for a
                              // child who has already guessed wrong - stillness
                              // alone never reaches it. See armIdle's gate.

/* NINE AND NINE, AND THEY WERE 4500 AND 4000. One number, one rung, applied
   everywhere: nine seconds of a child not touching the screen buys the next
   thing the game is willing to show them, whatever they have done so far.

   THE USER'S WORDS, and they set both the timing and the ladder: "when a wrong
   option is selected... the incorrect option will wiggle and just stop there.
   After 9 seconds, the correct option will show a pulse effect. If the user
   still doesn't do anything after 9 seconds, the hand ghost effect will come."

   THE EQUAL SPACING IS THE POINT. The old pair were two different waits because
   they answered two different questions - how long before a stuck child gets a
   nudge, and how long before that nudge is escalated. Read as the user reads it
   they are one question asked twice, so the ladder now climbs at a steady rate
   and a child can learn it: nothing happens, then a card lights up, then a hand
   shows you what to do with it. Nine seconds of real stillness is a long time at
   six years old, and it is long enough that an engaged child - one who is
   guessing, however wrongly - never sees either rung. */

/* ...AND NEITHER APPLIES TO THE VERY FIRST FRAME OF THE GAME, where the pair is
   a demonstration rather than a hint. Both rungs go up together, this far behind
   the last word of the opening instruction - see firstTeach().

   A QUARTER SECOND AND NOT ZERO, AND IT IS A LEVEL AND NOT A TASTE. duck(false)
   releases the effects bus at the moment her queue empties, and it releases it
   with setTargetAtTime(tau = 0.12) - a curve, not a step. A chime fired in the
   same tick starts at 1.4898 + (0.3725 - 1.4898) * e^-(t/0.12): at 10ms that is
   0.462, which is 10.2 dB down, so the cue climbs through its own attack and the
   one sound whose whole job is to make a child look up arrives as a hiss. At
   250ms it is 1.351, 0.85 dB down, which is inaudible as a difference. And a
   quarter second is not a wait: it reads as the same beat as her last syllable.

   RE-DERIVE IT IF VO_DUCK OR THE 0.12 IN duck() MOVES. Those two numbers are the
   whole of this one. */
const TEACH_LEAD_MS  = 250;

/* THE NARRATOR NO LONGER RE-ASKS ON IDLE, and this is the headstone of the
   constant that used to make her. `IDLE_VO_MS = 9000` armed askAgain(), which
   re-spoke the screen's question nine seconds after the END of her last line,
   and then again, and again, for as long as the child left the screen alone.
   `node tools/sim.js idle` measured five askings in the first minute of screen
   1; on screens 2-4 every one of them was the SAME sentence, because those
   three share one recording. The user heard it as the instruction "replaying
   continuously throughout the game".

   NOTHING REPLACED IT, and that is the instruction: "if the child remains idle,
   the instruction VO should not replay repeatedly; use the intended visual idle
   nudge instead". So a stall now climbs the visual ladder — the pulse, then the
   hand miming the drag — and stops there, which is the sheet's Idle Hint column
   as written and nothing more. Every line in the game is spoken exactly once,
   at the moment it belongs to.

   IF SHE IS EVER TO SPEAK ON IDLE AGAIN, the shape to build is not this
   constant coming back: it is one line, once, after a long stillness — not a
   loop keyed off the end of her own sentence, which is what made a slow child
   hear a question five times and a fast one hear it never. */

/* Idle Hint 2 geometry (133:2037). hand.webp stands upright with the fingertip at
   the top, so HAND_ANCHOR offsets the image's top-left corner from the centre of
   the card — left of it, and just below the middle, which drops the finger onto
   the picture and leaves the wrist hanging under it. Both hands start here; the
   ghost then carries the card-to-frame delta on top of it, and since a card
   (398x272) and a frame recess (391x267) are within a few pixels of each other,
   it lands sitting the same way in the frame as it started on the card.

   y is bounded: the hand is 141.5px tall drawn, its artwork ends at 97% of that,
   and `drop-shadow` reaches a further 16px, so past y=55 the shadow starts being
   clipped by the bottom of the 1080px stage and the hand reads as falling off the
   screen. 54 is the floor.

   x pays for the mirror. styles.css flips the artwork horizontally, which slides
   the fingertip from 38.8% to 61.2% of the drawn 116px — 26px to the right
   inside a box that has not moved — so the anchor sits 26px further left than
   the frame's -182 and the finger comes down where it always did. Setting
   --hand-flip back to 1 wants -182 back. */
const HAND_ANCHOR = { x: -208, y: 54 };
const CHEER_DELAY_MS = 660;   // into roundCheer(): the cards bounce a beat after the cue opens
const CHEER_STEP_MS  = 130;   // ...then each card in turn. roundDone puts a note on each

/* HOW LONG THE FINISHED SCREEN IS HELD BEFORE ANYTHING ELSE HAPPENS, and there
   are two of these because the two endings are different events.

   CLAP_PAUSE_MS - screens 1-3, where Aaru walks on to applaud. All this has to
   cover is the third card's own light-up (620ms, see .card.is-lit); the
   celebration itself now travels with HIM, so a longer hold here is just dead
   air between the card going in and anything acknowledging it.

   ROUND_PAUSE_MS - the last screen, where nobody walks on: the box topples, the
   line is hauled, and he arrives on the rope instead. There the celebration
   still fires at the placement, so this must outlast the cards' own bouncing:
   CHEER_DELAY_MS + 2*CHEER_STEP_MS + 660.

   IT IS A FLOOR NOW AND NOT THE ANSWER. The last screen's hold is worked out
   from the celebration's own length by endingPauseMs(), which is longer than
   this on every machine that has the files; this is what is left if the cues
   cannot be measured at all. */
const CLAP_PAUSE_MS  = 900;
const ROUND_PAUSE_MS = 2000;

/* THERE WAS AN APPLAUSE_AT_S HERE, 0.471s, and it is gone rather than zeroed.

   WHAT IT WAS FOR: the crowd used to start 0.471s in, which was where
   roundDone's landing chord was struck plus 100ms, because a broadband crowd
   laid over an ascending pitched phrase masks its partials on a small speaker.
   Every word of that was true and it described a cue that no longer exists.

   THE PERCUSSION IS GONE, so there is no phrase to sit behind and nothing to be
   late for: "only celebrating clapping sfx is enough". The clap IS the
   celebration now and it opens on the frame the screen is finished. A cue that
   starts on the beat needs no constant to say when. */

/* THE CLEAR AIR BETWEEN THE CELEBRATION AND THE BOX GOING OVER, and it exists
   because of the user's note on this beat: the celebration and the box drop
   "are getting collided", the whole thing "very fast". They are two events -
   you finished the story, and then the board clears - and two events that
   overlap read as one noise. This is the gap that separates them.

   400 -> 1400, ON THE SAME COMPLAINT MADE A SECOND TIME: "its still fast each
   animation should get enough screen time, after celebration there to be healthy
   pause then option box drop animation should happen". 400ms separated the two
   events; it did not give the first one room to land. A pause that a six-year-old
   registers as a pause is nearer a second and a half than half a second, and the
   thing on the other side of it - the whole board clearing - is worth waiting
   for.

   IT IS MEASURED IN SILENCE, NOT IN WALL CLOCK, which is why endingPauseMs()
   subtracts haulNoteAt(0) from it: the ending's first SOUND is the haul's first
   note, 362ms after the haul starts moving, and what this constant promises is
   the gap a child hears. Raise it and the quiet grows by exactly that much. */
const ENDING_GAP_MS = 1400;

/* THE BOARD SITS BARE BEFORE THE BOX GOES. "still there is very less time in
   when the last scenes go away to the left and option box falling, there should
   be a healty time space between these 2 animations also."

   THEY WERE NOT TWO ANIMATIONS, THEY WERE ONE. toppleBox() and haulLine() fired
   on the same tick, and toppleBox's own BOX_TOPPLE_AT is only 260ms - so the box
   began tipping 260ms into a 1700ms haul and had already LANDED, at 1169ms,
   while the last story was still riding off to the left. Two events, both about
   the board emptying, played on top of each other.

   THE OLD NOTE ARGUED FOR EXACTLY THAT and is worth quoting rather than
   deleting, because it was a real argument and it lost to the room: "It falls
   WITH the haul: the last story rides off along the line, the box tips forward,
   lands and throws its dust, and the ride does not start until haulLine's
   callback - so Aaru swings in over a board that is already bare." The reasoning
   was about Aaru arriving last, and that is still true. What it got wrong is
   that a child does not read two simultaneous departures as one clearing; they
   read as clutter.

   SO THE BOX NOW WAITS FOR THE LINE. 1200ms from the haul finishing to the box
   starting to tip - the board empty and still, with nothing on it but the box,
   before the box goes too. */
const BOX_WAIT_MS = 1200;

/* ...AND THE THIRD PAUSE: "then there should be again healthy pause then aaru
   should arrive on the rope."

   WHAT IT WAS. toppleBox() and haulLine(playEntry) fired on one tick, so the box
   tipped 267ms into a haul that was already carrying the last story off, and
   playEntry ran the moment the haul finished - putting Aaru across the right edge
   783ms after the box hit the floor. Measured off the page, the box's DUST is
   still clearing at 3483ms, so he was arriving into the middle of the box's own
   animation. Two things on screen at once, and the second one is a boy.

   IT IS MEASURED FROM THE BOX LANDING NOW, not from the haul. It used to be
   armed in haulLine's callback, which was fine while the box fell during the
   haul; with BOX_WAIT_MS holding the box back, an entry timed off the haul would
   have put Aaru on the rope BEFORE the box had finished falling. The anchor has
   to be the last thing that happens, and that is the box hitting the floor.

   2200ms, AND THE NUMBER COMES OFF THE DUST. The cloud runs about 2170ms from
   the impact - measured, 2256ms of stamps starting 90ms before the box is flat -
   so this clears it with a little to spare. The box gets its fall, its landing
   knock and its whole cloud to itself, and the board is genuinely bare and still
   when he swings in. That is what "enough screen time" means here: not slower
   animations, but one at a time.

   IT LIVES IN dropTimers so clearDrop() cancels it. A dev skip or a teardown
   during this hold would otherwise land Aaru on a board that has been rebuilt
   underneath him. */
const ENTRY_HOLD_MS = 2200;

/* HOW LONG THE CELEBRATION GETS BEFORE THE NARRATOR TAKES THE ROOM.

   NO SCREEN CLAIMS IT AT PRESENT. This is the lead for a `done` line — one
   spoken when a screen is finished — and the only one there ever was, screen 1's
   handover, has moved to the second placement where the script puts it (see
   ROUNDS[0].narration). The hook and this number are kept because they are the
   only way a finished screen can speak, and because everything below is measured
   and would have to be measured again.

   WHAT IT IS FOR. Moving the celebration onto Aaru put the cue and her first
   word on the same tick — so she ducked the effects bus to 0.329 as the cue
   opened, which is 9 dB off the one sound in the game that is purely a reward.
   This is the head start that fixes it, and it is read off the cue:
   roundDone's ascending run finishes at 276ms and its landing chord is struck at
   371ms, so 700ms puts the whole phrase and the front of the children in clear
   air before she starts. Everything after her still runs off the pause, not off
   her, so this costs the next screen 700ms of her tail and nothing else. */
const HANDOVER_LEAD_MS = 700;

/** How long a cue's audio actually runs, in ms.

    Off the DECODED FILE when it is there, because that is the thing the child
    hears; off SFX_PLAN's render window when it is not, which is the same number
    or a shade longer (that window is what the cue was rendered into, so it can
    lead the file but never trail it - a wait built on it is safe). A muted cue
    is zero: it is not going to be in the way of anything.

    DERIVED RATHER THAN WRITTEN DOWN, for the reason every other length in this
    file is: round-done.wav and applause.wav are both generated, both have been
    re-rendered at new lengths, and a hold measured off a stale copy of those
    numbers is exactly how the box came down inside the crowd. */
function cueLen(name) {
  if (SFX_MUTED.has(name)) return 0;
  const buf = sfxBufs.get(name);
  if (buf && isFinite(buf.duration)) return buf.duration * 1000;
  const plan = SFX_PLAN[name];
  return plan ? plan.len * 1000 : 0;
}

/** How long the LAST screen is held after its third card, and it is worked out
    rather than chosen: the ending must not start until the celebration has
    finished sounding.

    WHAT IT IS FIXING. The celebration on this one screen fires at the placement
    (see finishRound) and it is a classroom clapping for about four seconds. It
    used to be two cues - a percussion flourish with the crowd layered in behind
    it at an offset - and the arithmetic here had to allow for both; it is one cue
    starting at zero now. The ending used to begin ROUND_PAUSE_MS later flat - 2s
    - so the haul's rope, the box's two knocks and its `puff` all landed inside
    that crowd: four cues stacked, and the child heard one noise instead of "you
    finished it" followed by the board clearing.

    THE FIRST SOUND OF THE ENDING IS THE HAUL, not the box. runHaul delays its
    cue by haulNoteAt(0) so the notes land on the frames, so that delay is part
    of the gap and is subtracted here - what ENDING_GAP_MS buys is silence
    between the crowd's last moment and the first sound after it, whichever cue
    that turns out to be.

    ROUND_PAUSE_MS is the floor, so the cards' own bouncing is still covered on a
    machine where neither cue can be measured. `node tools/sim.js finale` prints
    the gap this produces. */
function endingPauseMs() {
  /* ONE CUE TO WAIT FOR, NOT TWO. This was max(roundDone, APPLAUSE_AT_S +
     applause) because the celebration was a percussion figure with a crowd
     layered into it at an offset. The percussion is gone and the clap starts at
     zero, so the celebration is out when the clap is out. */
  return Math.max(ROUND_PAUSE_MS,
                  cueLen('applause') + ENDING_GAP_MS - haulNoteAt(0) * 1000);
}

/* HOW LONG THE REWARD IS LEFT ALONE BEFORE SHE TALKS OVER IT.

   MEASURED IN THE BROWSER: the placement chime and the praise start on the same
   tick - both at 9866ms in a probe of screen 1 - and say() calls duck(true) with
   a 40ms time constant, so `correct` is 12 dB down before it has played two of
   its four notes. It is the only feedback path in the game where the sound the
   child EARNED is buried by the sound telling them they earned it.

   620ms IS THE CHIME'S OWN SHAPE, not a round number: the four-note figure
   resolves at 440ms and is well down by 620. She opens her mouth as the reward
   finishes rather than on top of it.

   IT ONLY BITES WHERE THERE IS PRAISE - screen 1's first two placements, which
   are the two the tutorial teaches with. Everywhere else placeCard calls hush(),
   which does not duck, and the chime was always clear.

   THE PIN IS SET IMMEDIATELY AND ONLY THE VOICE WAITS. promptHold has to be
   taken on the placement tick or render() moves the banner on before she has
   said anything - see sayAnswer, where the two are deliberately separated. */
const PLACE_LEAD_MS  = 620;

/* WHEN THE REFUSED CARD HAS FINISHED BEING REFUSED - the beat the 2nd attempt's
   voice-over and the 3rd attempt's pulse both wait for.

   760 WAS EXACTLY THE ANIMATION AND NOT A FRAME MORE: 300ms of travel home then
   a 460ms wiggle, and 300 + 460 = 760. So the wiggle's last frame and the
   narrator's first word were the same instant - there was never a moment in
   which the card sat still, back where it started, before being talked about.
   The child is told what they should have done while the thing they did is
   still moving.

   1400 GIVES IT 640ms OF STILLNESS. That is the pause between the event and the
   comment on it, and it is the same shape as ENDING_GAP_MS: two things that are
   about each other still need air between them or they read as one. It costs
   nothing on the first wrong attempt, which is silent by design, and 640ms on
   the second and third. */
const REJECT_MS      = 1400;  // travel (300) + wiggle (460) + a still beat

/* The haul between rounds. HAUL_TRAVEL is one stage width, which is both the
   least that carries the rightmost frame off the screen and, deliberately, a
   whole number of the rope's 32px twist periods — see the twist note in
   styles.css. HAUL_MS is slow enough to watch the frames take the sag one
   after another and still be over before a child looks away. */
const HAUL_TRAVEL = STAGE_W;
const HAUL_MS     = 1700;

/* --- two rides on one line ---------------------------------------------------

   THE OPENING AND THE ENDING HAUL; EVERY SEAM IN BETWEEN SHIFTS. A haul moves a
   whole screen: three frames off to the left, three empty ones in behind them. A
   seam moves the line only as far as the next screen is new — the pictures the
   child just hung stay on the board and become its opening frames, so the eleven
   panels read as one line being pulled along rather than five screens being
   swapped.

   EVERYTHING EASY ABOUT THE HAUL COMES FROM ITS TRAVEL BEING ONE STAGE WIDTH,
   and a seam's is not, so each of these is a place the shared runner has to be
   told the number rather than assume it:

     travel  a whole number of frame pitches. Written as a DIFFERENCE OF TWO SLOT
             CENTRES and never as n * SLOT_PITCH: the pitch is 584.4399999999999
             in a double, so twice it is 1168.8799999999999 and adding that to
             SLOT_CENTER[0].x misses SLOT_CENTER[2].x. This form lands on it
             exactly, which is what lets the seam HAND a frame's card to the new
             bay instead of animating it there.
     ms      the same line speed either way. A seam that took HAUL_MS to cover
             1168.88px would be the same rope being pulled at 0.61 of the speed
             it is pulled at everywhere else.
     rope    the twist's own distance, SNAPPED TO 32px. The gradient repeats
             every 32px of horizontal travel (see the twist note in styles.css)
             and settle() clears backgroundPosition outright, so a travel that is
             not a whole number of periods makes the rope re-lay itself in one
             frame at the end of every ride. 1168.88/32 is 36.53 — the worst
             phase error available. 37*32 = 1184 runs the twist 1.29% faster than
             the frames it is carrying: 15px over a second, on a repeating
             diagonal with no landmark, against a 16px jump. Invisible either way
             is not the choice; this is invisible and the other is not.
     lead    how late the cue starts. A haul waits for its first frame to cross
             into view; a seam has frames on the screen from the outset, so there
             is nothing to wait for and it starts with the movement.
     out     when the cue has to be SILENT, because the shift is shorter than the
             file. See the seam-sound note over shiftLine for why this is haul.wav
             at all and what a purpose-built cue would need. */
const SLOT_PITCH = SLOT_CENTER[1].x - SLOT_CENTER[0].x;      // 584.44

const HAUL = { travel: HAUL_TRAVEL, ms: HAUL_MS, rope: HAUL_TRAVEL,
               cue: 'haul', lead: () => haulNoteAt(0), out: 0, outFor: 0 };

/** A seam's numbers, for a line advancing `frames` frames. */
function shiftRide(frames) {
  const travel = SLOT_CENTER[frames].x - SLOT_CENTER[0].x;
  const ms     = Math.round(travel * HAUL_MS / HAUL_TRAVEL);
  return {
    travel, ms,
    rope: Math.round(travel / 32) * 32,
    cue:  'haul',
    lead: () => 0,
    out:  ms / 1000,
    /* The fade LANDS on `out` rather than starting there, so on the shortest
       seam the default 450ms would begin before the cue had built at all. */
    outFor: Math.min(0.45, ms / 2000),
  };
}

/* Round entrance. The three choices arrive as one deck at the middle station,
   hold there a beat, then the outer two are dealt out to the sides while the
   middle one simply stays where it landed.

   These are paced for a Class 2 child — around seven — not for an adult
   reviewing a build. A seven-year-old needs to actually see the deck arrive,
   register that it is three cards, and follow each one to where it lands; at
   adult-UI speeds the whole thing is over before any of that happens. So the
   deck holds for the best part of a second and the two deals are far enough
   apart to read as two separate events rather than one symmetrical bloom.
   The full entrance runs a little under three seconds - 650 of arrival, 900 of
   stillness, then 820 + 380 of dealing = 2750ms - and it can be cut short at any
   moment by touching a card OR choosing one from the keyboard (see endDeal);
   slow motion must never mean waiting for a turn.

   THAT 2750 IS NOW ARITHMETIC RATHER THAN AN ASPIRATION. It used to be neither:
   the hold was armed on the same tick as the 650ms arrival rather than after it,
   so the real entrance was 2100ms and the still beat was 250. dealTimer adds
   DECK_STILL_MS to --deck-in-ms read out of the stylesheet, so the two halves
   cannot drift apart any more and this paragraph cannot go stale. */
/* HOW LONG THE LANDED DECK IS STILL, and it is DECK_STILL_MS now because the
   old name was measuring the wrong thing.

   IT WAS `DECK_HOLD_MS = 900`, ARMED ON THE SAME TICK AS THE ANIMATION. The
   deck-in animation is 650ms, so the stack was only fully static for 900 - 650
   = 250ms, and the paragraph above - "the deck holds for the best part of a
   second" - was describing something the game did not do. Its own arithmetic is
   the receipt: 650 + 900 + 820 + 380 = 2750ms, "a little under three seconds",
   and 2750 is only reachable if the hold starts when the animation ENDS. What
   actually ran was 900 + 820 + 380 = 2100ms.

   SO IT IS ADDED TO THE ANIMATION RATHER THAN CONTAINING IT, and the animation's
   length is read out of the stylesheet instead of copied. That is what makes
   this un-rottable: the note above used to ask you to "keep the two in step if
   you retune", and now nothing has to be kept in step - move --deck-in-ms and
   the still beat follows it.

   900 OF ACTUAL STILLNESS, which is what the comment always claimed. The
   entrance is 2750ms, which is what the comment always claimed. Cost is 650ms
   per screen, 2.6s across a game, and endDeal() still lets a touch cut the whole
   thing short so no child is ever made to wait for it. */
const DECK_STILL_MS = 900;    // ...AFTER the deck-in animation has finished
const DEAL_STAGGER = 380;     // left card leaves, then clearly after it the right

/* Every cue is a file in assets/sfx/. THIRTY-TWO cues, thirty-two files, one to
   one with SFX_PLAN, and all but three of them are rendered from the VOICES
   table in the audio section by tools/render-cues.js. SFX_SUPPLIED names the
   three that are not — trail, sad, sneeze — user-supplied recordings the bench
   leaves alone: being in SFX_PLAN without a name in SFX_SUPPLIED is what makes
   the bench render a cue and save it over its own file, so a supplied file
   missing from SFX_SUPPLIED is destroyed on the next run. Point a name at a
   different file and that is the whole change — the voice stays in VOICES as
   the fallback for a file that will not load.

   THIRTY-FOUR UNTIL THE FOOTSTEPS BECAME ONE CUE, AND THIRTY-ONE NOW THAT THEY
   ARE NOT A CUE AT ALL. `step` and `stepb` were two 100ms windows out of one
   walk, alternated by the call site; `footsteps` was that walk in one take; and
   `trail` is what plays on that beat now - a bell tree, because what travels the
   footpath is a light and not a foot. See VOICES.trail, and
   VOICES.footsteps_RETIRED for the nine versions behind it.

   SFX_SRC AND SFX_PLAN MUST AGREE EXACTLY, and it is worth knowing what each
   mismatch does: a cue in SFX_PLAN with no entry in SFX_SRC is rendered to a path
   of `undefined`; one in SFX_SRC with no plan is never rendered at all and plays
   whatever stale file is on disk. render-cues.js warns about the second case
   only. SFX_SRC says where a cue's bytes are, SFX_PLAN says how loud it is,
   VOICES says how it is built, and SAMPLE_SRC says what out of.

   VOICES IS THE ONE THAT IS ALLOWED TO BE BIGGER, and it has THIRTY entries
   against these twenty-seven. The extra three are `step1`, `step2` and `step3` -
   the music box notes that used to ring one per card as a child spelt out the
   round's chord. That mechanic was removed at the user's request and a placement
   is the card-drop alone now (see playPlaced), so no cue names them and nothing
   renders them. They are kept because tools/audition-cues.js still plays them in
   its demonstration sequences, which is the only place the old three-note idea
   can still be heard and compared against what replaced it.

   THEY ARE NOT A FALLBACK FOR ANYTHING and must not be given cues again casually:
   this is the category the user meant by "dont bring back old sound effect which
   i removed". If the audition sequences ever go, these go with them.

   "RENDERED" DOES NOT MEAN "SYNTHESISED". Nearly all of these are built out of
   RECORDINGS — a real music box for everything pitched, and real cards, paper,
   rope, wood, air, a bicycle, a dog, a room of children, and a young boy's own
   voice for the rest. They are still rendered, because rendering is what puts a
   cue on its measured level; what changed is what the voices are made of. See the
   audio section for the whole argument and assets/_source/sfx/PROVENANCE.json for
   where every recording came from.

   WHAT IS STILL SYNTHESISED IN A CUE THE CHILD ACTUALLY HEARS, counted rather
   than remembered, because this is exactly the kind of claim that rots:

       wrong    its paper bump only. The falling third that used to answer it is
                now the boy's own voice — see VOICES.wrong. It WAS the entry on
                this list that fired often, which is why it was the next one to
                go; what is left synthesised in it is a filtered-noise bump
                standing in for a card not sticking, and the falling third is
                kept below it as the load-failure fallback.
       pop      mostly. Two real music box notes over a synthesised bubble and
                its pitch bend, which is the part that is not a sound anything in
                the world makes: it is the game clearing its throat.
       pickup   entirely, and MUTED, so it is never heard.
       correct  its VOICES entry is synthesised, and never runs: the cue is a
                supplied mp3 (SFX_SUPPLIED) and the voice is only the fallback
                for that file failing to load.

   Everything else either is a recording outright or reaches for one first and
   keeps its oscillators as a fallback — with ONE deliberate exception, the nine
   recap cues, which have no fallback at all. The reasoning for that is at the top
   of their block in VOICES, and it is the whole point of this pass: their
   fallback WAS the machine.

   Files are decoded into AudioBuffers and played through the master chain, so
   unlike the <audio> element this replaced, a file-backed cue can be panned,
   sits under the same trim and limiter as everything else, and is in the room
   with the rest of them. */
const SFX_SRC = {
  pop:       'assets/sfx/pop.wav',
  deckIn:    'assets/sfx/deck-in.wav',
  deal:      'assets/sfx/deal.wav',
  pickup:    'assets/sfx/pickup.wav',
  correct:   'assets/sfx/correct.wav',
  wrong:     'assets/sfx/wrong.wav',
  hint:      'assets/sfx/hint.wav',

  /* THE CHILDREN THAT GO WITH IT, AND WHY THEY ARE A SEPARATE FILE. This was a
     `smp` call inside VOICES.roundDone and it had to come out, for a reason that
     is worth writing down because it is a property of the calibration and not a
     matter of taste.

     A cue is levelled as a whole, to one LUFS target. Inside one cue, a music box
     flourish and a crowd are competing for that single number: raise the crowd
     and the bench scales the WHOLE cue down to hit the target, so every dB the
     crowd gains is a dB off the flourish. That trade is measured in the crest
     note below, and at 0.016 the crowd cost the flourish 1.7 dB and was as loud
     as it could be made.

     It now has to be much more than that. The celebration fires as Aaru walks on
     and he is on screen for 5.1s; the flourish is 2.1s of that. So the crowd has
     to carry three seconds on its own, at a level chosen for being ALONE rather
     than for hiding under a music box — and there is no single gain on one cue
     that is both. Two cues, two targets, and the timing that used to be internal
     is now the `delay` at the call site. */
  applause:  'assets/sfx/applause.wav',
  softclap:  'assets/sfx/softclap.wav',
  haul:      'assets/sfx/haul.wav',

  /* THE FOUR THINGS THE FINALE USED TO DO IN SILENCE. A boy let go of a
     clothesline and fell 452px without a sound, the box tipped over and left
     without one, and the snap the whole ending finishes on — the pose the
     game holds on, with a spark drawn on it — was mute. Each of these is a
     hard visual accent with nothing on it, which is the cheapest possible
     thing to fix and the most obvious once heard.

     `cheer` is the one addition that is not an accent, and it is placed
     rather than layered: it lands just after the snap, 3540ms after his feet
     touch the floor, with nothing else sounding by then. It USED to be fitted
     into a gap — `allDone`, the music box flourish, started at that landing and
     rang until 740ms before it — and that flourish has since been taken out of
     the game entirely at the user's request, so the gap is now the whole ending.
     The placement is kept anyway: a cheer is broadband noise, and broadband
     noise under anything pitched masks its partials on a small speaker, so this
     stays a beat of its own rather than a layer. `node tools/sim.js last 2500
     --video` prints the times. */
  swing:     'assets/sfx/swing.wav',
  fall:      'assets/sfx/fall.wav',
  snap:      'assets/sfx/snap.wav',
  topple:    'assets/sfx/topple.wav',

  /* The one cue in the game that is a RECORDING rather than rendered from the
     VOICES table below: something landing, under his feet when he hits the
     floor. A real wooden knock is simply more accurate than a synthesis of one.

     CC0 / public domain from bigsoundbank.com, which states that attribution is
     not required: gavel-1-blow, bigsoundbank.com/UPLOAD/mp3/1588.mp3. Trimmed
     of its leading silence so it fires on the frame it is asked for, cut to
     length, high-passed, faded, and levelled against the cues already in the
     game - see the provenance note in styles.css.

     ONCE A GAME NOW. This cue used to be धड़ामा as well - fired a second time on
     the recap's bicycle crash, on the argument that a knock and a body is the
     same event either way. It is not: a boy landing on his feet after letting go
     of a rope is in control, and a boy going over with a bicycle under him is
     not. The crash has its own cue and its own recording now; see `crash`. */
  thud:      'assets/sfx/thud.wav',

  /* --- THE RECAP'S TEN, AND THE END OF SYNTHESIS -----------------------------

     THE PREVIOUS ARRANGEMENT, and why it is gone. Four of the recap's pictures
     had a cue and each one was BUILT out of oscillators and filtered noise -
     `puff` was three thinning grains of banded hiss, `ting` three sines at a
     bell's partial ratios, `splash` five noise bursts, `tummy` two noise bands
     under two sliding tones. Six pictures had nothing at all. Every one of those
     four measured exactly on its target and every one of them was defensible on
     paper. The user's verdict, in their own words: they "sound like a machine
     and had no effect on real emotions of kids, as they are our target
     audience", and that is the correct reading. A synthesised sneeze is a shaped
     noise burst; a sneeze is a child. There is no filter arrangement that
     crosses that gap, which is why this is a set of RECORDINGS and not a
     re-tuning of what was here.

     ALL TEN PICTURES SOUND NOW, and this time that is literally true: card 9 was
     the last silent one and it has `clatter`. Seven of these cues are new and four
     replace a synthesis: what is heard on each card is the thing drawn on it.

         1  house     tummy    his stomach - he is hungry, which starts the story
         2  sneeze    sneeze   आssशू, and the flour goes with it
         3  pot       gasp     he looks in, it is empty, and his voice goes up
         4  ride      ting     टिन-टिना, the bell drawn on his handlebar
         5  fall      crash    धड़ामा - the bicycle, and the boy on it
         6  cart      splash   छपाका, the juice hitting dry road
         7  dog       dogeat   the dog takes his samosa
         8  home      sad      he walks home with nothing
         9  utensils  clatter  steel, off two shelves - in the air, then down
        10  earring   amazed   a chime - Amma's locket catches the light

     CARD 9 WAS SILENT AND THE ARGUMENT FOR IT WAS ABOUT THE WRONG THING, which is
     worth keeping because it is a tidy piece of reasoning that reached a wrong
     answer. It ran: the only impact recording in the set is a wooden box going
     over, and that card is six pieces of steel, so wood for steel is the same
     class of error as the CC0 file tagged rat that nearly shipped as a cheer.
     Every word of that is correct and all of it argues against using `topple`.
     None of it argues for SILENCE. The missing step was to go and find steel, and
     the note closed the door instead - "no recording was bought for it because
     none was needed - the picture reads without one".

     THE USER READ IT THE OTHER WAY: "in this there should be sound of utensils in
     the air then falling keep it normal and funny for a kid not irritating". This
     is the card the sneeze is ABOUT and it was the only busy picture in the recap
     with nothing on it. Steel was found - see `clatter`, cut from one recording of
     cookware whose two isolated clinks measure 1/99/0 and 5/95/0, which is as
     cleanly inside a tablet speaker's band as anything in the game.

     `puff` IS GONE ENTIRELY, not muted and not kept as a fallback. It was the
     only cue whose file had no user left once card 2 became a real sneeze, and
     leaving a synthesised cue in the tree that nothing plays is how it comes
     back. Its .wav is deleted with it. */
  /* SUPPLIED, NOT THE FILM CUT ANY MORE - see SFX_SUPPLIED and the note on the
     card's own cueAt/shake/flour/sprite below. sneeze-aachoo.wav is trimmed
     from an ElevenLabs generation (ElevenLabs_2026-08-27T08_54_40__s50_v3.mp3,
     the user's own file, at their own 3.0-6.0s mark), and it is the full "आ…
     आ…छीं" gesture - two halting breaths and then the burst - not a single
     transient. The old film sneeze is still in VOICES.sneeze as the fallback. */
  sneeze:    'assets/sfx/sneeze-aachoo.wav',
  gasp:      'assets/sfx/gasp.wav',
  cycle:     'assets/sfx/cycle.wav',
  ting:      'assets/sfx/ting.wav',
  crash:     'assets/sfx/crash.wav',
  splash:    'assets/sfx/splash.wav',
  dogeat:    'assets/sfx/dogeat.wav',
  /* SUPPLIED, NOT RENDERED - see SFX_SUPPLIED below and the note over
     SFX_PLAN.sad. The library "उफ़" this replaces is retired to VOICES.sad as
     the fallback; the file the game plays is the user's own sigh, freesound
     community, with 0.31s of near-silence ahead of its own breath - trimmed at
     the call site by moving cueAt back rather than by cutting the recording,
     the same way `trail`'s tail is cut with `out` rather than by re-encoding. */
  sad:       'assets/sfx/freesound_community-sigh-1-58189.mp3',
  tummy:     'assets/sfx/tummy.wav',
  clatter:   'assets/sfx/clatter.wav',
  amazed:    'assets/sfx/amazed.wav',

  /* --- AND THE THREE BEATS THAT WERE SILENT OUTSIDE THE RECAP ---------------

     `ride`  the ten pictures flying in from the left as the ring forms. The
             frames coming in on the line right to left already had `haul`; this
             is the same event in the other direction and it had nothing at all.

     `formed` the ring closing - all ten home, which is the moment the child's
             whole story is on the screen at once, and it passed in silence.

     `cheer` children, on the confetti. This cue existed, was rendered once, and
             was taken out because it landed ON the snap and made the ending's
             last beat three sounds at once. Its own note said what it would take
             to bring it back: "it needs a beat of its own - after the snap has
             finished, not under it". That is where it is now. */
  ride:      'assets/sfx/ride.wav',
  formed:    'assets/sfx/formed.wav',
  amma:      'assets/sfx/amma.wav',
  /* SUPPLIED, NOT RENDERED — see SFX_SUPPLIED below. The bell-tree-plus-whistle
     shimmer that VOICES.trail built is retired to a fallback; the file the game
     actually plays is the user's own recording, universfield-magic-spell, cut
     for length only at the call site (sfx()'s `out`, never the bytes) because
     the leg it plays over is under 1.5s and the recording is 5.9. See the note
     over the sfx('trail', ...) call. */
  trail:     'assets/sfx/universfield-magic-spell-278824.mp3',
  placed:    'assets/sfx/placed.wav',
  cheer:     'assets/sfx/cheer.wav',
};

/* Playback trim, in linear gain. The rendered .wav files need none — each one
   has its measured level calibrated into the file itself, which is what makes
   them auditionable side by side in an editor.

   The card-drop is the exception, and the reason this table exists. It is
   supplied art and is not to be re-encoded or re-levelled, but it arrived
   hotter than a cue that fires twelve times a session should be: it measured
   level with the once-a-game finale. This is the only way to seat it in the mix
   without touching the bytes — a gain node in front of it, in the graph, filled
   in from the same measurement rig as everything else. */
const SFX_TRIM = {
  /* +6.37 dB, measured by tools/render-cues.js and copied in - nothing here is
     decided, the bench prints this value at the end of a full run.

     IT IS THE ONE LEVEL A RE-RENDER CANNOT FIX BY ITSELF. The card-drop is a
     supplied mp3 that is never re-encoded, so its gain lives entirely in this
     number while every other cue's lives in its file. That has bitten twice: it
     read 1.28825 while SFX_VOLUME moved 0.55 -> 0.42, and it read 1.68655 while
     the bus went up 4.0 dB - both times the cue a child hears TWELVE TIMES A
     SESSION was the only one left behind, and both times it was invisible in the
     table because the table is generated from the same stale number.

     SO: AFTER ANY SWEEP OF SFX_VOLUME / SFX_HOUSE_LUFS, COPY THIS. It is the last
     line the bench prints. */
  /* correct: 2.08209 WAS HERE and is gone with the file it belonged to. It was a
     playback gain rather than a rendered level, which is a thing only a SUPPLIED
     cue ever needs: the bench could measure that mp3 but not rewrite it, so the
     only place its loudness could be corrected was here, at every call. The cue
     is rendered now and lands on its target in the file, so there is nothing
     left to correct at playback. */

  /* +3.5 dB, and this one is a DECISION rather than a measurement — the number
     above came off the bench, this one is a relative move made because the cue
     changed jobs. `topple` was rendered at -33.5 LUFS through the chain, the
     quietest thing in the game, because it was a box quietly folding away
     underneath a beat that mattered more. It is now the first beat of the
     ending, it lands on a bare board, and it plays under `haul` at -31.0 — so
     at its old level the knock that the dust comes off was 2.5 dB beneath the
     thing playing over it. This puts it at about -30.0, level with `fall` and
     still below `thud`, which is his.

     A relative move is safe to state without re-running the rig: the chain is
     identical for every cue and this is the only per-cue gain in it. Re-measure
     through tools/render-cues.js if the levels are ever swept again. */
  topple:  1.4962,     // +3.50 dB, chosen - see above

  /* THE BENCH THAT MEASURED THESE THREE IS GONE. tools/render-cues.js and the
     rest of the tooling that read assets/_source/sfx/ were deleted along with
     that folder - a separate, later cleanup of everything that existed only to
     build shipped cues from raw material, once none of it was needed for the
     three supplied files below either. The numbers here are what it printed
     while it still existed; every "re-measure with R.supplied(...)" note
     underneath is now a description of HOW these were derived, not a live
     instruction - reproducing it means rebuilding an equivalent of
     throughChain()/measure()/solve() first, not running a command that exists. */

  /* -4.12 dB, AND `R.supplied('trail')` WOULD HAVE PRINTED THE WRONG NUMBER
     FOR THIS ONE - that was the trap worth writing down while the bench was
     still here to demonstrate it. supplied() measured the file over its OWN
     full duration (buf.duration + TAIL_S), which for universfield-magic-spell
     is 5.88s including the ~2.9s of near-silent reverb tail that the game
     never plays - see TRAIL_OUT_S. That full-buffer measurement came out near
     enough to target on its own (gain 0.884, -1.05dB) that it looked like
     nothing was needed, and it was wrong: what a child actually hears is the
     loud FRONT 1.02s (out 1.00 + the 20ms sfx() leaves before stop()), and
     that shorter window's own K-weighted mean is hotter, not the file's.
     Measured by building that exact truncated-and-faded buffer (the same
     linearRampToValueAtTime shape outGain() schedules) and running it through
     solve()'s own loop by hand, gain lands at 0.6225 against off -2.0 (target
     -18 LUFS). If TRAIL_OUT_S/TRAIL_OUT_FOR_S ever move, this number is stale
     and there is no bench left to re-derive it with - see the note above. */
  trail:   0.6225,     // -4.12 dB, on the TRUNCATED window - see above

  /* -17.47 dB, off supplied()'s own row while it existed: freesound_community-
     sigh plays whole, no `out` fade (it is 1.70s and fires once, nowhere near
     a leg's budget), so the file's own full-duration measurement WAS the
     window a child hears - no truncation trap here, unlike `trail` above. The
     file arrived hot - asIs measured -7.75 LUFS over its loudest window
     against a -20.5 target, 0.09 dBFS at its own peak - a close-mic breath is
     not a library "उफ़" and was never going to land at a whisper's level
     unassisted. If the file or SFX_PLAN.sad.off ever changes this is stale;
     see the note above the `trail` row for what re-deriving it now costs. */
  sad:     0.1338,     // -17.47 dB, off R.supplied('sad') while it existed

  /* -12.82 dB, off R.supplied('sneeze') while it existed - no truncation trap
     here either, same reasoning as `sad`: the cue plays its whole 3.0s (two
     breaths and the burst, see SFX_SRC.sneeze), nothing is cut with `out`, so
     the full-file measurement WAS the window a child hears. The file arrived
     hot - asIs -7.76 LUFS against a -17.0 target, filePeak -0.25 dBFS, close
     to clipping unscaled - an ElevenLabs generation mixed for its own use is
     not a library sneeze, any more than the sigh was. If the file or
     SFX_PLAN.sneeze.off ever changes this is stale; see the note above the
     `trail` row for what re-deriving it now costs. */
  sneeze:  0.2286,     // -12.82 dB, off R.supplied('sneeze') while it existed
};

/* Random pitch variation per play, as a fraction either side of 1.0.

   Three cues fire so often that a frozen file starts to sound like a frozen
   file — pickup on every single touch, deal and deckIn on every round — and a
   few percent of playback rate is enough to keep them from fusing into one
   remembered sample. It works on these because they are papery broadband
   material, where a rate change reads as a slightly different piece of paper.
   It works BETTER now than it did: deal and deckIn are real card recordings,
   and a real card resampled 5% is another real card.

   It is deliberately empty for everything else, and the reason is now sharper
   than it was. A pitched cue would drift out of the one A FLAT MAJOR set the
   whole game agrees on — and since every pitched cue is a recording of one
   music box, resampling it does not just move the note, it moves the
   instrument. `haul` would be worse still: its stereo travel and its three
   frame-knocks are rendered into the file to match HAUL_MS exactly, so
   stretching it would slide the sound off the picture it was aligned to. */
const SFX_JITTER = {
  pickup: 0.06,
  deal:   0.05,
  deckIn: 0.04,

  /* AND THE FOOTSTEPS, WHICH FIRE SEVENTEEN TIMES FROM TWO FILES. Whatever
     is true of `ride`'s ten copies is true here: identical taps released as the
     trail's light goes past them would be a metronome. Two cuts of two real feet
     do most of that work; this does the rest.

     THE TRAIL IS IN IT, AND THAT IS A RESTORATION RATHER THAN AN ADDITION. It
     fires nine times in forty seconds from one file, and the first version of it
     did so with no variation at all - which the user heard immediately: "sounds
     very mechanic and AI". Jitter had been removed when this beat was footsteps,
     for a real reason (a rate change slides the point the run is cut at, and the
     footsteps' cut had to land in a gap between footfalls). The trail is not cut
     at all, so the reason is gone and the wobble is free. 0.05 is +/-0.85
     semitones, the same width `ride` uses for the same problem.

     AND THE FOOTSTEPS ARE NOT IN THIS TABLE ANY MORE, which is the one deletion
     worth explaining rather than just making. `step: 0.05` was here - +/-0.85
     semitones on a 100ms tap, so that seventeen strikes of one sample were not
     one sound repeated. The cue became a RUN (`footsteps`, seven real footfalls
     in one take) and is a bell tree now (`trail`), and a rate wobble on either is
     a tempo wobble; worse, the recap cuts the cue short at a point measured in
     the FILE (see WALK_CUTS), and a
     rate of 1.05 would slide the last footfall's attack past that cut and clip
     it. The variety the jitter was buying is now in the recording: the three
     footfalls in the cue are three different footfalls at three different
     loudnesses, and a leg plays two or three of them.

  trail:  0.05,

  /* THE TEN PICTURES COMING IN, and this is the cue in the set that most needs
     it: `ride` fires ten times inside eight seconds, 748ms apart, from one file.
     Ten identical copies of anything at an even spacing is the single loudest
     tell of a machine there is - it is the reason `ting` strikes its bell at two
     different velocities and the reason `tummy` plays its recording at three
     different rates. 3% is small enough that no single arrival sounds detuned and
     large enough that the ten do not sound stamped out.

     SAFE HERE, WHERE IT WOULD NOT BE ON `haul`. Jitter is a playback-rate change,
     so it moves a cue in TIME as well as in pitch, and haul's whole voice is a
     stereo sweep baked into the file to match a 1.7s ride - stretching it would
     slide the sound off the frames. `ride` is centred in its file and placed by
     the caller's pan, so there is nothing baked in to drift. */
  ride:   0.03,
};

/* Cues held silent.

   TWO OF THEM ARE OUT, AND THE THIRD TOOK THREE ATTEMPTS. The history is worth
   keeping, because the two failures are the two ways this particular job goes
   wrong and neither of them is audible to the loudness rig.

   `deckIn`, `deal` and `haul` are the mechanics of the board rather than the
   child's own doing, and this note used to say they were "out until they sound
   like the things they are made of". That reads as a quality bar, so all three
   were re-sourced from recordings and un-muted. Two came straight back out:

     haul     FAILURE 1 — TOO SHORT FOR THE ANIMATION. A rope-friction take,
              0.98s against a 1.7s ride, so it was played twice with an overlap.
              At the splice the first pass had decayed to -35.4 dBFS and the
              second started at -15.9: a 19.5 dB step UP in the middle of a
              continuous move, heard as the sound restarting, because it was.
              FIXED, and it is audible again — see the voice. It is a curtain
              rail now: 1.90s in one piece for a 1.70s ride, no splice, and a
              household object doing the same thing the picture shows rather
              than an abstract friction noise.

     deckIn   FAILURE 2 — THE WRONG PART OF THE RIGHT RECORDING. The source is
              2s of continuous shuffling and the cue was a 0.55s slice out of
              the middle. It began at -22 dBFS with no transient and trailed off
              at -49: no attack, no resolution, a burst of noise where a deck
              landing should be. STILL OUT. Fixing it needs a recording of a
              deck being SET DOWN, which is a different event from one being
              shuffled, and no such take is in hand.

     deal     out with them, and this one is not a failure — a real paper slide,
              0.55s, complete, with its own beginning and end. It is muted
              because it fires twelve times a game and the entrance it belongs
              to is now carried by the haul alone; one third of an idea is worth
              less than a clean one. One line to reverse if wanted.

   NEITHER FAILURE WAS A LEVEL PROBLEM, and that is the part to remember: both
   cues measured dead on target while sounding bad. A cue can be real material,
   correctly high-passed and perfectly calibrated, and still be assembled out of
   the wrong PART of a recording or a take that is shorter than the thing it has
   to cover. The rig cannot see either. Only listening can.

   ONE STAYED OUT THROUGHOUT, and it is out for a different and stronger reason.
   `pickup`
   was the child's own doing, and it fired on every single touch of every card,
   which is the one place in the set where a cue is heard often enough to stop
   being information. Lifting a card is already fully legible without it — the
   card comes up under the finger — so the sound was confirming something the
   child could see, a dozen times a round. Re-recording it would not change
   that: the objection is to the FREQUENCY, not to the timbre, and no recording
   fixes a cue that fires when there is nothing to say. It stays muted.

   For the same reason, two cues that were considered were never built: a tick
   when a dragged card is over a valid frame, and a per-character tick under the
   banner's typing. The first fires on every wobble of a finger that is covering
   the target anyway, and — the real objection — it tells the child the answer
   before they commit, which turns a sequencing puzzle into hot-and-cold. The
   second sets a reading pace a Class 2 reader cannot match, in the 2-4kHz band
   where the narrator's consonants live. Neither is a level problem; both are
   the wrong idea, so neither has a file.

   Nothing muted is removed: the file is still on disk, the voice is still in
   VOICES, the level is still measured and the bench still renders it. This is
   one line to reverse.

   It is checked ahead of BOTH playback paths, which is the whole reason it
   exists as a set rather than as a null in SFX_SRC - a null there does not
   silence a cue, it falls the cue back to its synthesised voice, which is the
   opposite of what is wanted here.

   Because they are still decoded, this can also be flipped live while the
   game is open, which is the cheapest possible A/B — and is how the round trip
   above got settled:

       AARU_AUDIO.SFX_MUTED.delete('haul')     // hear it again, no reload
       AARU_AUDIO.SFX_MUTED.add('haul')        // ...and put it back

   WHAT IS SILENT, AS A CONSEQUENCE. The deck landing on the tray, the beat it
   holds for, the two cards dealt out of it, and every card lift by touch or by
   keyboard. What is NOT silent is the line itself: the frames ride in on the
   haul, at the start and between every screen, so a screen arrives with a sound
   and then deals itself out quietly under the narrator's question.

   THAT ORDERING IS THE POINT, and it is why filling the rest of the gap is not
   obviously an improvement. The arrival is scenery worth hearing once per
   screen; the dealing is not, and the narrator is talking over it anyway. After
   she stops, the next sound a child hears is their own first placement — which
   makes it the thing that MADE a sound happen, and that is a better beat than
   any amount of extra scenery. */
const SFX_MUTED = new Set(['deckIn', 'deal', 'pickup']);

/* --- the loudness contract --------------------------------------------------

   The cues used to span 20.3 dB, measured: the celebration at -29.3 LUFS and
   the haul at -49.6, which on a tablet speaker means one cue that carries and
   one that is not there at all. Every cue is now calibrated against one house
   reference with a documented offset, and the offsets are the design — a cue
   that fires on every touch must not be as loud as the one that fires once a
   game, and flattening them all to the same number would be exhausting.

   Foreground cues sit within 2 dB of the house reference. Three sit below it on
   purpose, and each has a reason in the table. `len` is how long the cue needs
   to be rendered for, in seconds.

   Measured with BS.1770 K-weighting over each cue's active window, rendered
   through the real master chain. Re-run `tools/render-cues.js` after editing
   anything here and the files are re-levelled to match.

   LAST MEASURED. Every cue landed on its target within 0.05 dB, except thud,
   which this method cannot measure at all - see under the table. Re-measured in
   full after the cue set was rebuilt from recordings, so `peak` below is the
   music box and the real cards and rope rather than the oscillators.

   KEEP THE `fires` COLUMN AND SFX_PLAN IN STEP. markdown() in render-cues.js
   generates that column FROM SFX_PLAN, so a `fires` edited in one place and not
   the other makes this table contradict its own source. Not cosmetic here: the
   whole argument of this block is level against frequency, so the column is the
   premise under every target in it. It has drifted once, when the old allDone
   flourish went from once a game to twice and this row did not follow.

     cue        fires        target     got    peak   file pk   secs
     cheer      1x a game     -17.0   -17.0    -3.5     -7.7    2.10
     deckIn     4x            -17.5   -17.5    -0.6     -3.9    0.55   MUTED
     applause   5x            -17.5   -17.5    -1.9     -5.7    2.90
     correct    12x           -17.5   -17.5    -1.1    -10.8    0.50
     ...roundDone's row was here, at -14.5 and the loudest in the set. The cue
     is retired - see SFX_PLAN - so the loudest thing in the game is now `thud`
     on peak and `cheer` on loudness.
     crash      1x a game     -18.0   -18.0    -1.5     -4.9    1.00
     deal       12x           -18.0   -18.0    -4.0     -8.5    0.55   MUTED
     wrong      often         -18.0   -18.0    -8.2    -13.4    0.68
     formed     1x a game     -18.0   -18.0    -6.3    -10.7    0.95
     haul       4x            -18.5   -18.5    -1.3     -4.9    1.62
     fall       1x a game     -19.0   -19.0    -4.0     -8.5    0.37
     sneeze     1x a game     -19.0   -19.0    -3.0     -7.1    0.54
     pop        once          -19.0   -19.0    -0.7     -2.0    0.61
     gasp       1x a game     -19.5   -19.5    -8.6    -13.5    0.34
     amazed     1x a game     -19.5   -19.5    -6.1    -10.9    2.27
     clatter    1x a game     -20.0   -20.0    -6.2    -11.1    2.21
     swing      1x a game     -20.0   -20.0    -4.9     -9.4    2.85
     splash     1x a game     -20.2   -20.2    -0.5     -3.7    0.70
     sad        1x a game     -20.5   -20.5    -4.5     -9.0    0.50
     ting       1x a game     -20.5   -20.5   -11.8    -16.5    0.58
     thud       1x a game     -20.5   -20.5    -0.7     -1.9    0.57
     snap       1x a game     -20.9   -20.9    -0.9     -3.0    0.29
     hint       on idle       -21.0   -21.0    -9.8    -14.9    0.95
     ride       10x per pic   -21.0   -21.0    -1.4     -5.0    0.81
     tummy      1x a game     -22.0   -22.0    -9.9    -15.0    1.26
     pickup     constantly    -22.0   -22.0    -7.7     -9.4    0.20   MUTED
     topple     1x a game     -22.5   -22.5    -8.3    -10.6    0.75
     dogeat     1x a game     -23.3   -23.3    -0.5     -3.8    0.90
     cycle      1x a game     -23.9   -23.9    -0.6     -3.1    1.44

   THE WHOLE TABLE MOVED UP 4.0 dB, and five rows did not come with it. See the
   ceiling note under SFX_VOLUME: `thud`, `snap`, `pop`, `dogeat` and `cycle` are
   the peakiest cues in the set, they were already inside 2 dB of full scale, and
   there is nowhere for them to go. Their offsets came down 1.4 to 2.9 dB so that
   the OTHER twenty-four could have the four - which is why the peak column is now
   almost flat at the top of it and the spread is 9.3 dB rather than 8.0.

   THAT IS THE RIGHT TRADE AND NOT A COMPROMISE, which is worth saying plainly.
   The five are 200-900ms transients that already peaked hotter than the narrator
   while measuring 6 dB quieter than her - the exact crest-factor trap the note in
   the narrator section is about. What a child hears as "the game is too quiet" is
   the twelve-times-a-session cues: the card going in, the deal, the pickup, the
   celebration. Those are the rows that took the whole 4 dB.

     THE `file pk` COLUMN MOVED 2.4 dB ON EVERY ROW, and it is worth knowing that
     this was NOT caused by the cues changing. SFX_VOLUME went from 0.55 to 0.42
     at some point without the bench being re-run. Every target above is measured
     THROUGH the master chain, so a quieter master means each file has to be
     LOUDER to land on the same number - by exactly 20*log10(0.55/0.42) = 2.34 dB.
     The .wav files on disk were still the ones rendered at 0.55, so every cue in
     the game had been playing 2.3 dB under its own stated target since that trim.
     Re-rendering fixed it, and the whole column moved together, which is what
     tells you it was one cause and not twenty.

     IT ALSO CLIPPED `pop`, WHICH IS WHY THAT ROW IS 2.5 dB DOWN. That cue's own
     note already recorded being "a hair off clipping" at -0.0 dBFS once before;
     at -0.9 there was not 2.34 dB of headroom to give it, and the corrected
     render came out at +1.5 dBFS with 48 samples railed at full scale in the
     first sound the game ever makes. The offset went from +1.0 to -1.5 rather
     than the voice being re-shaped, because what is wrong is not the sound - it
     is that a 27 dB crest factor cannot sit 1 dB under the loudest cue in the set
     at this master trim. Every file is now clean; the loudest are snap at -1.1
     and pop at -1.3, and nothing rails.

     A PLACEMENT IS NOW ONE CUE, so there is no pair to measure here any more.
     It used to be `correct` + a step note, together at -27.4 LUFS against a
     -27.0 target, because that was the event a child actually got twelve times
     a session. It is the card-drop alone now, at -28.5.

   Spread 8.5 dB, which is the whole point of levelling
   through the rig rather than by ear: the instrument changed under every pitched
   cue and the balance between them did not move at all.

   HEADROOM WENT DOWN, from 11.0 dB to 8.0 and now to 8.5, and it is worth
   knowing why rather than only that. A REAL STRIKE HAS A SHARPER TRANSIENT THAN
   A SYNTHESISED ONE AT THE SAME LOUDNESS. tone() ramps up over 20ms; a music box
   hammer is done in two. Loudness is a mean and peak is an instant, so swapping
   the second for the first buys a higher crest factor at an identical LUFS.
   Nothing clips - checked on the bytes and not on the report, because the report
   is what said pop was fine at -0.9 the day before it railed: the loudest files
   are cycle at -0.94 dBFS, snap at -1.13 and pop at -1.26, and NO SAMPLE IN ANY
   CUE reaches full scale. The loudest through the chain is dogeat at -8.5.

   THE THREE AT THE TOP OF THAT LIST ARE ALL THE SAME SHAPE - a finger snap, a
   pitch-bent bubble, and a bicycle tyre throwing grit - which is to say a very
   high crest factor against a quiet target. That is the combination to watch when
   adding a cue, and it is not visible in the target column at all: `cycle` sits
   near the BOTTOM of this table at -32.0 LUFS and has the loudest file in it.

   THE ROW TO WATCH IS STILL dogeat, and it is a non-problem for the reason pop
   used to be one. It is peak-dominated by a single crunch - a real animal's teeth
   on something brittle, which is about as spiky as a recording gets, 23 dB of
   crest factor over its own target - it fires exactly once, on the seventh
   picture of the recap, and the cues either side of it are more than two seconds
   away. It cannot overlap anything. It is also, at -0.5 dBFS through the chain,
   the cue that decides how loud the whole game is allowed to be. The pair that used to be tightest was thud and allDone
   at the finale (-11.2 and -9.0, summing to about -7.5); allDone is gone, so the
   landing is thud on its own and that moment has 9 dB of room it did not have.

   THE TIGHTEST IS NOW roundDone, which contains its own overlap: a music
   box flourish with a crowd of children under it. That is one cue and one row, so
   the table cannot show it - see the crest-factor note in VOICES.roundDone, which
   is where the 25 dB between "the obvious level" and "the right level" is
   measured out.

   TWO ROWS ARE PAIRS, and reading either half alone would be misleading. `thud`
   is a bright knock plus a body scuff, measured together because that is what is
   heard; and `placement` below is the card-drop plus its step note, which is the
   event a child actually gets twelve times a session. Any cue firing within
   ~250ms of another belongs in this list - the limiter's 220ms release makes
   them one event whether the table admits it or not.

   A NEW CUE PEAKING ABOVE ABOUT -8 dBFS THROUGH THE CHAIN starts eating the
   margin that keeps the limiter a backstop rather than the thing setting the
   levels. Check the column, not just the target.

   THE SHORT-CUE TRAP, AND WHY IT NO LONGER BITES. A long note stood here saying
   that `thud` could not be measured like the others - that it was a supplied
   recording, that its row was empty, and that "any cue under 400ms reads -70
   LUFS here and its integrated loudness is meaningless", because BS.1770
   integrates in 400ms blocks and gates on them, so a 0.146s active window is
   discarded whole.

   NONE OF THAT DESCRIBES THIS BENCH. Two things had changed underneath it. `thud`
   stopped being supplied - it is assembled from landknock + landbody like
   everything else, so it renders and its row is full. And render-cues.js does not
   compute gated integrated loudness at all: measure() takes an UNGATED K-weighted
   mean square over the cue's own active window, first to last sample above
   -60 dBFS, precisely so that a short cue and a long one can be compared. There
   are no blocks and there is no gate to fall through.

   THE TABLE IS THE EVIDENCE, not the argument. `snap` is 0.29s and `gasp` is
   0.34s, both well under the supposed 400ms floor, and both land on their targets
   to within 0.05 dB like everything else. If the trap were real those two rows
   would read -70.

   WHAT IS STILL TRUE AND WORTH KEEPING: a mean over an active window is a mean,
   so a cue whose window is mostly quiet tail measures lower than it sounds. That
   is why `len` exists per cue and why VOICES.pop cuts its notes short rather than
   letting them ring - see the measurement in that voice, which is a real instance
   of this and not a hypothetical one.
   --------------------------------------------------------------------------- */
/* CUES WHOSE FILE IS SUPPLIED, NOT RENDERED - the bench must never write over
   these. It is in SFX_PLAN, because it answers to the same loudness contract as
   everything else and the table beside it should say so; but being in SFX_PLAN
   is also what makes render-cues.js render a cue and save it over SFX_SRC[name].

   DOWN TO ONE. `thud` used to be here - a CC0 recording that would have been
   rendered over the moment anyone ran the bench, silently, with the recording
   untracked and therefore gone. It is now assembled from its raw ingredients
   like everything else (see VOICES.thud), which is strictly better: the file can
   be rebuilt, re-levelled and taken apart, and it needs no exception here.

   What is left is the one file that genuinely must not be re-encoded, because it
   is supplied art rather than something fetched. Add a cue here whenever its
   file comes from outside the engine AND cannot be rebuilt from a source kept
   in assets/_source/sfx/. */
/* `correct` was the last member and left the same way `thud` did: the user's
   library card-drop was replaced by a chime of their own, cut and rendered
   through the bench like everything else, so it needed no exception here.

   `trail`, `sad` AND `sneeze` ARE THE NEW ONES. universfield-magic-spell-
   278824.mp3, freesound_community-sigh-1-58189.mp3 and sneeze-aachoo.wav (cut
   from the user's own ElevenLabs generation) are supplied recordings, not
   renders off VOICES.trail/VOICES.sad/VOICES.sneeze's samples - see the notes
   beside SFX_SRC.trail, SFX_SRC.sad and SFX_SRC.sneeze - so all three go in
   this Set the same way `correct` and `thud` once did, or the next
   `node tools/render-cues.js` silently writes the old bell-tree-and-whistle
   render, the old library "उफ़" and the old film sneeze back over them.

   ADD A CUE HERE the moment one arrives that must not be re-encoded AND cannot
   be rebuilt from a source under assets/_source/sfx/. Being in SFX_PLAN is what
   makes render-cues.js write over SFX_SRC[name]; this Set is the only thing that
   stops it, and `thud` once came within one bench run of being destroyed that
   way. */
const SFX_SUPPLIED = new Set(['trail', 'sad', 'sneeze']);

const SFX_HOUSE_LUFS = -16.0;
const SFX_PLAN = {
  /* NO allDone. The music box flourish that used to open the finale and play
     again over the recap's ten lit frames is GONE, at the user's request, and it
     is gone from the plan as well as from the call sites: leaving a row here
     would keep re-rendering a cue nothing plays and keep it in the bench's
     budget. What was the loudest cue in the set is now `roundDone`, which is why
     that row leads the table. */
  /* -8.5 -> -5.0, AND THE NUMBER IS NOT COMPARABLE TO THE ONE IT REPLACES.
     This was +1.5 while the cue was a music box. A struck drum has a far higher
     crest than a rung note, and `off` sets a LUFS target: hold a percussion cue
     to a sustained instrument's loudness and the solver boosts until the peaks
     leave the file. At +1.5 this rendered at +3.4 dBFS - three and a half dB
     ABOVE full scale, which the 16-bit writer clamps, so the cue would have
     shipped hard-clipped and measured perfectly while doing it.

     SO IT IS SET BY PEAK AND CHECKED BY LUFS, which is the reverse of every
     other entry here and is what a transient cue needs. -5.0 lands the file at
     -6.5 dBFS peak, next to the -6.3 the music box had - the same loudness in
     the ear, 10 dB lower on the meter. The narrator's LEVEL note is the long
     version of why those two numbers part company. */
  /* THERE WERE roundDone AND hops ROWS HERE and they are not fetched any more.

     roundDone was the screen-complete figure - a darbuka rim stroke on the beat
     Aaru arrives, one on each of the three cards as they bounce, finger cymbals
     under it and a hand bell on the third. hops put another stroke on each of
     his four landings. Between them they were the "damru sound" the user asked
     to have taken out: "only celebrating clapping sfx is enough".

     THE VOICES SURVIVE, THE FILES DO NOT. Both are still in VOICES so
     tools/audition-pick.js can build them live out of the cuts and play the old
     celebration against the new one; nothing renders them, nothing downloads
     them, and roundCheer no longer fires them. That is about 0.4MB the child
     stops fetching.

     If either is ever wanted back it needs a row here and a row in SFX_SRC, and
     `node tools/render-cues.js` will write the .wav from the voice unchanged. */
  applause:  { off: -5.5, len: 5.2, fires: '5x',
               why: 'A CLASS CLAPPING, AND IT IS THE WHOLE CELEBRATION NOW - four screens '
                    + 'and the confetti, which is the fifth fire. The percussion that used to '
                    + 'be in front of it is gone at the user\'s instruction ("only celebrating '
                    + 'clapping sfx is enough"), so this row is no longer one layer of a '
                    + 'celebration, it IS the level of the celebration. -1.5 AGAIN, AND IT '
                    + 'WENT TO -3.5 AND BACK: a mid-pass bed had a 23.8 dB crest and rendered '
                    + 'a chain peak of +0.8 dBFS at this target, which toWav() clamps, so it '
                    + 'had to come down 2 dB. The bed that shipped is a hundred hands rather '
                    + 'than a dozen, so its crest is 19.8 and -1.5 lands at -1.9 with room to '
                    + 'spare - THE CEILING IS THE CREST, NOT THE CUE. No complaint about this '
                    + 'cue has ever been about loudness: "too much" was a 2.8 dB crest and 38% '
                    + 'of the energy in 2-5kHz, "children screeming" was a cut window at 91% '
                    + 'tonal, and "no human voice" took that from 18% to 0. All three are '
                    + 'textures, which is why the target never moved for any of them. len 4.0 '
                    + '-> 3.2 because the cut is 3.00 and the voice runs 2.90 of it; it only '
                    + 'has to clear that plus renderDry\'s 0.02 lead-in. See VOICES.applause '
                    + 'and `handclap` in cut-sfx-assets.py' },
  /* THE KIDS, ON THEIR OWN. Split out of `applause` because sharing one dry
     buffer meant sharing one solve() - and solve() measures a K-weighted MEAN
     over the whole active window, so a continuous texture's own average energy
     dominates that mean far more than a sparse chime's peak does. Raising the
     clapping's internal peak from 0.12 to 0.90 moved its audible level less than
     2dB, because past a point solve() was pulling the SHARED gain down to hold
     the chime+claps mix at the same target LUFS - the two were coupled, and the
     coupling had a ceiling neither could get past. Two cues, two solves.

     off -8.0 IS ITS OWN NUMBER, chosen the way every other row here is: measured
     on the RENDERED file, not reasoned about. See VOICES.softclap and roundCheer,
     which fires this and `applause` together. */
  softclap:  { off: -7.0, len: 4.4, fires: '5x',
               why: 'a soft clapping bed under the celebration chime - "its better can '
                    + 'we add soft childrens clapping too", then "why cant i hear the '
                    + 'soft clap" (fixed by giving it its own cue and solve, not by '
                    + 'raising a shared gain - see VOICES.applause), then "this '
                    + 'callping has people voice also i dont want that". THAT THIRD '
                    + 'ONE IS WHY THE SAMPLE CHANGED: kidsbed measured "no tonal run '
                    + 'over 200ms" and that gate was wrong - 200ms of held pitch is '
                    + 'still audible as a voice once the layer is loud enough to hear '
                    + 'at all, which it only became once it had its own cue. `handclap` '
                    + 'measures 1 tonal frame in the WHOLE 4.60s window, 40ms, '
                    + 'coincident with the ring of the clap itself - as close to zero '
                    + 'as any CC0 recording of dense clapping gets. It is adults, not '
                    + 'children - see the note on softclap in VOICES for why that '
                    + 'trade is the honest one available' },

  pop:       { off: -3.0, len: 0.9, fires: 'once',
               why: 'first sound of the game and the proof that it makes sounds. AT THE WALL, '
                    + 'like the other four in the ceiling note below - it has been +1.0 and '
                    + '-1.5, and each time the number came down because the rendered FILE '
                    + 'clipped, never because the sound wanted to be quieter' },
  /* len IS THE RENDER LENGTH TOO - see the note on `wrong` - so this must stay
     above the 1.10s cut or the chime is chopped mid-ring and the file ends on a
     rising waveform. */
  correct:   { off: -1.5, len: 1.20, fires: '12x',
               why: 'the user\'s own chime, four notes rising. A dozen times a session cannot '
                    + 'sit level with the finale' },
  deckIn:    { off: -1.5, len: 0.7, fires: '4x',
               why: 'an arrival, so it leads the round; mechanical, so it does not lead the mix. '
                    + 'MUTED - the recording is a slice out of a shuffle, not a deck landing' },
  deal:      { off: -2.0, len: 0.6, fires: '12x',
               why: 'a card moving. Has to be clearly heard, has no news in it. MUTED with the '
                    + 'other two entrance cues, though this recording is the one that was fine' },
  /* len FOLLOWS THE CUE'S REAL LENGTH, and it has moved with it every time. This
     is the window the loudness is measured over: a window that is half silence
     measures the cue quieter than it is, so the bench compensates with a gain it
     does not need and the cue lands hot.

     len IS THE RENDER LENGTH AS WELL AS THE LOUDNESS WINDOW, and that is easy to
     miss because the name says only the second thing. render-cues.js does
     `renderDry(name, plan.len, seed)` - the dry buffer is exactly this many
     seconds long, so a SAMPLE longer than `len` is chopped where the window
     ends, mid-ring, and trimmed() has nothing quiet to trim back to.

     IT COST A CLICK ON THE MOST-FIRED CUE IN THE GAME. `failnote` was a 1.45s
     cut under a 0.70s plan: the shipped file ended at -30dB relative to its own
     peak with its last five samples still RISING, where every other cue in the
     set ends below -66dB and most at true zero. Nothing in the bench flags
     that - it is a valid file at the right loudness.

     THE FIX IS IN THE CUT AND IN THIS NUMBER TOGETHER. The sample is 1.30s with
     a 200ms fade-out so it reaches silence on its own, and this is 1.40 so the
     render has room for all of it plus the room's tail. Get these two out of
     step and the file ends on a rising waveform, which is what shipped once.
     1.40, and it has been 0.90, 0.70, 0.60, 0.40 and 0.25 - once per version of
     this cue. Move it with any change to VOICES.wrong, and check the last
     sample of the render when you do. */
  wrong:     { off: -2.0, len: 1.40, fires: 'often',
               why: 'must be audible and must never dominate. It is a wrong guess, not a penalty' },
  haul:      { off: -2.5, len: 2.3, fires: '4x',
               why: 'the frames arriving, one by one - three jaw-harp boings on the three '
                    + 'moments a frame crosses into view, resolving into a major triad, then '
                    + 'the peg. BACK TO -2.5 FROM THE WHISTLE\'S -4.5, and the 2.0 dB in '
                    + 'between is the whole story of why a level cannot be copied between two '
                    + 'sounds that measure the same. The whistle needed a tonality allowance: '
                    + 'it crested 8.2 dB and packed 61.8% of its energy into one third-octave, '
                    + 'so at equal LUFS it carried 2.4 dB more raw RMS than the curtain rail it '
                    + 'replaced and was heard as louder still, the way annoyance standards '
                    + 'penalise a tone against broadband. Three short bounces are the opposite '
                    + 'shape - transients with air between them - so they do not collect that '
                    + 'penalty and do not need the allowance. What is NOT restored is the old '
                    + '+1.5 dB "background texture under a long move" reasoning: this cue is no '
                    + 'longer texture and no longer under anything. It is three events, and '
                    + 'events are heard at their peaks. Still the quietest of the things that '
                    + 'happen during play' },
  hint:      { off: -5.0, len: 1.3, fires: 'on idle',
               why: 'a whisper by design. Any louder and a pause starts feeling like a telling-off' },
  pickup:    { off: -6.0, len: 0.5, fires: 'constantly',
               why: 'every touch of every card. The quietest thing in the set — and MUTED, see SFX_MUTED' },

  /* --- the finale's four cues --------------------------------------------

     All four fire ONCE, in the last fifteen seconds of the game, and none of
     them shares the mix with a placement — so their offsets are set against each
     other rather than against how often they fire.

     ONE EVENT, ONE SOUND, NOTHING SIMULTANEOUS. That is the rule this section is
     now arranged around, and it was arrived at the hard way: the ending had
     SEVEN cues in ten seconds with three overlapping pairs, two of them stacked
     three deep — the landing was a knock plus a body scuff plus the loudest cue
     in the game, all on one tick, and the snap was a click plus a shimmer plus a
     crowd. Heard, that is not a finale, it is a pile-up. The cues themselves
     were fine. Two came out (the snap's shimmer, the cheer), one moved
     (the flourish, on FLOURISH_LEAD_S — since removed outright), and the rest is
     the same set in single file.

     The order they arrive in, and what each is answering to:

       swing    the whole 3.2s ride, and the only cue in the set over three
                seconds. A texture he arrives ON, well under everything that
                punctuates it.

       topple   the box going over and landing, at the very top of the ending,
                UNDER the haul that is carrying the last story off the line.
                It was the quietest cue in the set by a clear margin when it was
                scenery folding away mid-ride; it is a beat now — the box hits
                the floor and throws dust — so SFX_TRIM lifts it 3.5 dB, which
                puts it level with `fall` and still under both of his impacts.
       fall     720ms of air, into the thud. It has to be heard as motion and
                must not compete with the impact it is setting up, so it sits
                a little under it.
       snap     the pose the game ends on, with the spark drawn on it. An
                accent, and the last transient in the game.
       cheer    ON the snap. Alone in the mix by then — it used to be 300ms
                clear of the allDone flourish, and that flourish is gone, so it
                is alone by a wider margin than it was. That is the only reason
                a broadband cue is allowed near the house reference at all. */
  swing:     { off: -4.0, len: 3.4, fires: '1x a game',
               why: 'the line under his weight for the ride. A texture he arrives on, not an '
                    + 'event, and the only cue in the set longer than three seconds. HEARD '
                    + 'SHORTER THAN IT IS RENDERED: the game fades it out as he settles in the '
                    + 'middle, about 2.18s in (ENTRY_SFX_OUT_S), so `len` here is the window the '
                    + 'level was solved over and not the length a child hears' },
  fall:      { off: -3.0, len: 0.7, fires: '1x a game',
               why: 'the air on the way down. Motion, not impact — the thud is the impact' },
  /* AT THE WALL. See the ceiling note under SFX_VOLUME: this and the four cues
     marked the same way did not take the bus's last 4.0 dB, because they were
     already inside 2 dB of full scale and there is nowhere for them to go. */
  snap:      { off: -4.9, len: 0.8, fires: '1x a game',
               why: 'his fingers meeting, and the last transient in the game. An accent, so it lands. '
                    + 'DOWN 2.0 dB when the whole bus came up 7, and it is the same headroom story '
                    + '`pop` has: a finger snap is the peakiest thing in the set at about 20.6 dB of '
                    + 'crest, so it runs out of file before anything else does. At -1.5 it wrote 6 '
                    + 'railed samples into snap.wav. It is still the loudest accent in the ending '
                    + 'relative to what surrounds it; what it lost is headroom it could not spend' },
  topple:    { off: -6.5, len: 0.9, fires: '1x a game',
               why: 'the box leaving, and the one overlap left in the ending on purpose - it '
                    + 'happens DURING the ride, so it cannot be moved off it. Dropped 2 dB '
                    + 'further under `swing` instead, so the two read as an event inside a '
                    + 'texture rather than as two sounds at once' },

  /* Fires once, at the end of the game, with nothing else sounding at the time —
     so it can sit near the house reference without ever having to share the mix
     with a placement. */
  thud:      { off: -4.5, len: 0.6, fires: '1x a game',   // AT THE WALL, see snap
               why: 'his feet hitting the floor after a 452px fall. Needs weight without bass. '
                    + 'ONCE NOW: it used to be धड़ामा as well, fired again on the recap\'s '
                    + 'bicycle crash on the argument that a knock and a body is the same event '
                    + 'either way. A boy landing on his feet is in control and a boy going over '
                    + 'with a bicycle under him is not, so the crash has its own recording - '
                    + 'see `crash`, which is still the peak of the recap run' },

  /* --- the recap's nine ---------------------------------------------------------

     ONE PER PICTURE as the sparkle crosses the ring, nine of the ten cards, and
     they fire in a RUN with nothing else sounding - the finale's last cue has
     finished by then.

     THE GROUP CAME UP ABOUT 1.5 dB, and the reason is what they now are rather
     than a change of mind about loudness. When these were four textures - a
     filtered puff, three sines, some banded noise - "the quiet end of the game"
     was right: a texture that is not quite heard is a texture, and the recap is a
     reminder rather than a second celebration. They are VOICES now, mostly: a
     child gasping, a child sneezing, a child sighing, a woman delighted. A voice
     that is not quite heard is not a quiet voice, it is a mumble, and the thing
     these cues are for is the one thing a mumble cannot do - tell a child how the
     boy on the screen feels. They are still the quietest group in the game and
     the celebration still tops all of them by 4 dB.

     THE ORDER INSIDE THE GROUP IS THE STORY. `crash` is the loudest because the
     crash is the story's own biggest moment, and `tummy` is the quietest because
     it is a stomach - it opens the story with a small true detail, and a loud one
     is a joke sound.

     ANY TWO OF THESE WITHIN ABOUT 250ms IS ONE EVENT, limiter release included,
     so whatever paces the sparkle has to leave 300ms between sounded cards. NINE
     of the ten cards sound now where four did, so that constraint binds much
     harder than it used to - see RECAP_HOLD, and `node tools/sim.js last` prints
     the gaps. */
  crash:     { off: -2.0, len: 1.4, fires: '1x a game',
               why: 'धड़ामा - the bicycle going over with him on it. Two layers, because a bike '
                    + 'is metal on road and a boy is a body: neither alone is a child coming '
                    + 'off a bicycle. The peak of the recap run, which is correct - it is the '
                    + 'loudest thing that happens in the story' },
  /* len WENT 0.9 -> 1.4 WITH THE BREATH. `len` is the render length as well as
     the loudness window (see the note on `wrong`), and the cue is an inhale, a
     100ms beat and then the release now: 0.70 + 0.55 = 1.25s of sound. At 0.9
     the sneeze itself would have been chopped in half. */
  /* SUPPLIED NOW - see SFX_SUPPLIED and SFX_SRC.sneeze. off -1.0 IS UNCHANGED,
     on purpose: the reasoning that put it there - "the loudest voice in the
     run because a sneeze is involuntary and loud" - is a property of what the
     cue IS, not of which recording plays it, so the new take answers to the
     same target rather than a re-derived one. len WENT 0.5 -> 2.43: the cue is
     no longer one 345ms burst, it is the whole "आ… आ…छीं" gesture the user cut
     to 3.0s (two halting breaths, two gaps, then the burst at 2.125s in - see
     SFX_TRIM.sneeze for the exact numbers), and len only needs to cover the
     ACTIVE part of that for documentation's sake; supplied() measured the
     whole file regardless, while the bench existed - see the note over
     SFX_TRIM.trail for what the tool's removal means for re-deriving this. */
  sneeze:    { off: -1.0, len: 2.43, fires: '1x a game',
               why: 'आ… आ…छीं - the child\'s own halting build-up into the burst, not a single '
                    + 'transient any more. Cut by the user from an ElevenLabs generation at '
                    + 'their own 3.0-6.0s mark (see SFX_SRC.sneeze); the old film sneeze - '
                    + '"AARU HIMSELF", one clean 345ms burst with nothing pitched and nothing '
                    + 'layered - is kept as VOICES.sneeze, the fallback for a file that will '
                    + 'not load. The card\'s own shake/flour/sprite moved off cueAt 880 to sync '
                    + 'to where THIS recording\'s burst actually lands - see the card 2 spec, '
                    + 'not this table' },
  /* off WENT -3.5 -> -2.5, AND THAT IS THE WHOLE OF THE CHANGE ON THIS CUE.
     The user asked for "sfx of a child male" on the empty-pot card and it
     already IS one: `gasp` is cut from boy-voice.mp3, the same young boy the
     game casts as Aaru, at the one window in all 55s whose pitch RISES - 265Hz
     to 459Hz, which is what surprise does to a voice - and it measures 1/99/0,
     the cleanest band figure of any voice in the set. Casting was never the
     problem. LEVEL was: at -3.5 this rendered with a peak of -8.6 dBFS, the
     quietest peak of any voice cue in the game (sneeze -3.0, sad -4.5, fall
     -4.0) on a 0.34s breath that has to carry a story beat. A dB is not a
     recording; this is the smaller fix and it is the one the measurements
     actually support. */
  gasp:      { off: -2.5, len: 0.7, fires: '1x a game',
               why: 'he looks in the pot and it is empty. His pitch goes UP - that is what the '
                    + 'recording was chosen for - and this card had NO sound at all before' },
  clatter:   { off: -4.0, len: 2.4, fires: '1x a game',
               why: 'the utensils, on the card the sneeze is ABOUT. Deliberately not '
                    + 'the loudest thing in the recap even though it is the biggest '
                    + 'event in it: steel reads sharper than its LUFS, and the ask was '
                    + 'funny rather than startling' },
  /* 2.6 AND WAS 1.1, WHICH IS THE RENDER LENGTH AND NOT A CHOICE ABOUT THE CUE.
     `len` is the offline buffer render-cues.js renders into and measures over, so
     a cue that outgrows it is silently cut off at the end - and this one went from
     a 0.85s word to a glockenspiel with a two second ring. The written file is
     trimmed to its own active window either way, so the only cost of headroom
     here is a slightly longer render. */
  amazed:    { off: -3.5, len: 2.6, fires: '1x a game',
               why: 'the locket catching the light, on the last picture of the story - a '
                    + 'real glockenspiel struck and left to ring, transposed onto the '
                    + 'game\'s own Ab. It was वाह, and before that an English "wow"' },
  /* -4.2 -> -9.0, AND THIS IS THE "not too loud and annoying" HALF OF THE ASK.
     Everything else about the correction was the envelope - a different, darker
     source and 0.22s of it - but a little water is also QUIET water, and this cue
     was carrying the level a bucket had. It measured -23.1 LUFS over its loudest
     100ms at -4.2 against `ting` at -22.7 and `tummy` at -26.4; -9.0 puts it near
     -28, which is under everything else on the recap run except the trail. It is
     the sound of a glass tipping on a cart in the middle distance, not of a thing
     happening to the child. */
  splash:    { off: -9.0, len: 0.35, fires: '1x a game',
               why: 'छपाका - the juice hitting the road, and ONE GLASS of it. THE CUE IS A '
                    + 'THIRD OF ITS OLD LENGTH: "its osunding like too much water spilled '
                    + 'but here logically only a little water in the glass spilled", and a '
                    + 'full second of continuous spatter is a lot of water whatever its band '
                    + 'says. 0.34s at the call site leaves the arrival and 115ms of smp\'s '
                    + 'own release. The LEVEL is untouched at -4.2 and the SOURCE is '
                    + 'untouched too - their own recording of this same spill measures '
                    + 'BIGGER than this one, 1813Hz against 3278 over the same 340ms, and '
                    + 'the note over bookspill in the cutter has why' },
  dogeat:    { off: -7.3, len: 1.1, fires: '1x a game',   // AT THE WALL, see snap
               why: 'the dog takes his samosa - real teeth on something brittle. Nearly all '
                    + 'crunch, so it carries further than its number looks and sits below the '
                    + 'voices either side of it' },
  ting:      { off: -4.5, len: 0.9, fires: '1x a game',
               why: 'टिन-टिना - the bell DRAWN on his handlebar, and a real one now instead of '
                    + 'three sines at a bell\'s partial ratios. Still low in the group because '
                    + 'it is the only metal in the game: almost all of it lands in the band a '
                    + 'tablet driver is most efficient in' },
  cycle:     { off: -7.9, len: 1.8, fires: '1x a game',   // AT THE WALL, see snap
               why: 'the bicycle arriving on card 4 - a tyre on the dirt road he is drawn '
                    + 'riding over. It covers the whole 1.4s ride and the BELL rings at the '
                    + 'end of it, so this is the texture and `ting` is the event: it sits half '
                    + 'a dB under the bell for the same reason `swing` sits under everything '
                    + 'that punctuates it' },
  /* SUPPLIED NOW - see SFX_SUPPLIED. `off`/`len` here still answer to the same
     contract a rendered cue would (the row is what render-cues.js's supplied()
     targeted and measured against, back when that tool existed - see the note
     over SFX_TRIM.trail for why it does not any more) - see the SFX_TRIM entry
     this pass left behind for the playback trim the recording needed. */
  sad:       { off: -4.5, len: 1.1, fires: '1x a game',
               why: 'he walks home with nothing. A supplied sigh, freesound community - the '
                    + 'user\'s own file, replacing the library "उफ़" that answered the same '
                    + 'brief (their own picture-book has no sad Aaru sound to reach for; '
                    + 'VOICES.sad is that "उफ़", cut, rendered and kept as the fallback for a '
                    + 'file that fails to load, not as this cue\'s source any more). Quiet '
                    + 'because a loud sigh is a complaint, not a sigh. cueAt on the card moved '
                    + 'back with the recording\'s own 0.31s of lead-in silence so the audible '
                    + 'breath still lands the instant his eyes start to close, not 300ms after' },
  tummy:     { off: -6.0, len: 1.4, fires: '1x a game',
               why: 'his stomach, on the recap\'s first picture, and still the quietest cue in '
                    + 'the game. A real stomach now, pitched to a child - see VOICES.tummy for '
                    + 'why that pitch is not decoration. Long by this set\'s standards because '
                    + 'a rumble that is over quickly is a creak' },

  /* --- the three beats that were silent outside the recap --------------------- */
  cheer:     { off: -1.0, len: 2.4, fires: '1x a game',
               why: 'children, on the confetti, and the loudest thing in the game after the '
                    + 'flourish it follows. It is BACK after being cut for landing on the snap; '
                    + 'it has its own beat now and shares the mix with nothing' },
  amma:      { off: -3.5, len: 1.0, fires: '1x a game',
               why: 'her wordless awe as the earring turns up, over the treasure chime that '
                    + 'is still ringing. Under `amazed` at -3.5 rather than level with it: it '
                    + 'is the reaction to that sound, and a reaction that arrives louder than '
                    + 'the thing it reacts to reads as two events' },
  placed:    { off: -5.0, len: 0.8, fires: '10x in the recap',
               why: 'one picture dropping into the ring, a step up the scale each time. '
                    + 'Well under the placement chime it is related to: ten of them arrive '
                    + 'inside eight seconds, three of those inside 1.1s, and the phrase has '
                    + 'to sit under the pictures rather than announce each one' },
  /* len IS THE DRY BUFFER AND NOT THE LOUDNESS WINDOW, and that is the whole of
     what len does here. It was set to 0.12 on the theory that `len` is the
     loudness WINDOW - see the note on `wrong` - so a 0.4s window over a 0.10s cut
     would be 73% silence and the bench would push in gain it did not need.

     THAT THEORY IS WRONG FOR THIS CUE, and an adversarial pass proved it by
     replicating render-cues.js's measure(): it normalises by the ACTIVE WINDOW
     of the WET buffer - the room tail, 0.717s here - and not by len*SR. Held
     against a replicated chain, len 0.12 and len 0.40 give the same measured
     LUFS to four decimal places, the same solved gain, and the same file peak.
     len reaches the render through exactly two other doors: the dry buffer's
     length, and `seconds = plan.len + TAIL_S` capping the tail.

     AND THE DRY BUFFER IS THE ONE THAT BIT. renderDry starts the voice at 0.02s,
     so a 0.10s sample needed 0.12s of buffer and len 0.12 left it with nothing to
     spare; measured on a 0.11s cut, len 0.12 chopped 10.0ms off the end - the
     exact defect `wrong`'s note warns about, arrived at from the other side. The
     same arithmetic sets the run's len: the walk's last footfall starts at 0.583
     and its slice is WALK_SLICE, so the voice is done at 0.733 and the buffer it
     is rendered into starts at 0.02 - 0.80 leaves margin. Change WALK_STEP_S or
     WALK_TAKE and this has to move with them.

     WHAT ACTUALLY BROUGHT THE LEVEL DOWN was `off`, and it went -9 to -12 to
     -15 on the argument that nineteen of anything wants to be under the thing
     it decorates.

     AND IT IS -8.0 NOW, BECAUSE THAT ARGUMENT WAS OVERRULED: "keep the volume
     same as all other sfx". It was worth overruling - a cue nobody can hear is
     not a restrained cue, it is an absent one, and four of the five rejections
     before this were of a sound the user was straining to judge.

     BUT `off` IS NOT COMPARABLE BETWEEN CUES OF DIFFERENT LENGTHS, which is the
     trap in reading this column, and I walked into it: every other row here
     sits between -1.0 and -7.9, so -15.0 LOOKS like nine dB below the quietest
     cue in the game. It was not. `off` sets a LUFS target and measure() takes
     that mean over the ACTIVE WINDOW OF THE WET BUFFER, so a 100ms tap is
     averaged over its 0.7s of room tail and a 4s chime is averaged over itself.
     The same `off` on those two is not the same loudness.

     WHAT IS COMPARABLE IS THE LOUDEST 100ms, K-weighted - the fair reading for
     a transient - and measured on the shipped files:

         deal    -19.2      thud    -18.9      correct -20.8
         pickup  -21.1      placed  -22.0      ting    -22.7
         step    -22.8      stepb   -22.2

     So the two taps landed inside the pack rather than under it, which is what
     was asked, and the old -15.0 was about five dB down on peak rather than nine.

     AND THE CEILING IS CLIPPING, NOT TASTE. At -6.0 stepb rendered a chain peak
     of +1.1 dBFS and toWav() clamps, so it would have shipped hard-clipped; the
     hottest cue in the whole game is `thud` at -0.7.

     WHICH IS WHY THE RUN IS AIMED BY ITS LOUDEST 100ms AND NOT BY `off`. Seven
     footfalls over 1.25s measure a good deal louder than one footfall over the
     same room tail, so the same `off` on the two is not the same footstep: the
     figure to hold is the -22 to -23 in that table, and `off` is whatever puts
     the run's loudest 100ms there. See the row below. */
  /* -2.0, AND THE TWO NUMBERS BEFORE IT ARE THE LESSON. -12.0 came from the
     footsteps this replaced, on the reasoning that nine fires want to be under the
     threshold of notice; that rendered at -30.5 LUFS over its loudest 100ms, the
     quietest thing in the recap by four decibels. -8.0 moved it to -25.8, level
     with `tummy`. The user's verdict on that was that they could not hear it at
     all - "i cant hear cartoonish magical trail sounds" - and they were right:
     a diffuse bell wash has no transient to catch an ear with, so being level with
     the quietest cue in the run means being absent.

     -2.0 puts it near -19.8, which is level with `gasp` (-20.1) and above `ting`
     (-22.7) and `sad` (-24.3) - i.e. the trail now sits WITH the picture cues
     rather than under them. That is defensible for this one cue and for no other:
     it is the only sound in the recap attached to the thing the child is actually
     watching move, and it fires while nothing else is sounding (measured in a
     browser: 1.5s of clear air before every picture cue).

     THE OTHER HALF OF BEING HEARD IS THE MATERIAL, not the gain - see VOICES.trail,
     where a rising slide whistle went in underneath the shimmer in the same pass.
     A gesture is heard at a level a wash is not.

     len 1.3 NOW, AND NOTHING IS CUT AT PLAYBACK ANY MORE. The cue is two complete
     gestures - a 0.95s shimmer from 0.02 and a 1.05s whistle from 0.08 - so the
     dry buffer needs 1.13, and every millisecond of it is heard: the tightest leg
     leaves 1447ms before the next cue sounds. The `out` fade that used to trim it
     to the leg's travel is gone, because truncating a ringing sound is what made
     the first version sound manufactured. See VOICES.trail. */
  trail:     { off: -2.0, len: 1.3, fires: '9x in the recap, part of it each time',
               why: 'the magic trail, which is what actually travels the footpath - a bell '
                    + 'tree, 0/55/41/3/0 at a 1112Hz centroid with NOTHING above 5kHz, where '
                    + 'every other shimmer in the tree is 78-92% in 2-5kHz or worse. IT '
                    + 'REPLACES `footsteps` after nine versions of that cue: "remove '
                    + 'footsteps sound and replace it with cartoonish magical trail sounds '
                    + 'with perfect timings". The timing is the light\'s own travel less '
                    + 'STEP_CLEAR_MS, faded there rather than left to ring into the picture\'s '
                    + 'cue. Under everything else in the recap because it fires nine times' },
  formed:    { off: -2.0, len: 1.4, fires: '1x a game',
               why: 'the ring closing - all ten pictures home, the child\'s whole story on the '
                    + 'screen at once, and it passed in silence. A bell tree, atonal on purpose '
                    + 'so it does not imply a chord over a game tuned to Ab major' },
  ride:      { off: -5.0, len: 0.9, fires: '10x, once per picture',
               why: 'the pictures coming in from the left as the ring forms, which had no sound '
                    + 'at all. It fires as each one leaves the line and drops into its slot, '
                    + 'panned to that slot - so it is the end of the travel and the arrival on '
                    + 'the same beat. TEN OF THEM, AND THEY BUNCH: measured, the gaps run 1.13s '
                    + 'early and 0.35s late, because each card rides a different distance. So '
                    + 'two or three are sounding at once by the end of the formation and this '
                    + 'answers to how often it fires, the way `deal` does, not to how big the '
                    + 'moment is' },
};

/* How far behind the card-drop a second cue would land, if a placement ever has
   two again. NOT USED BY THE GAME any more - a placement is one cue (see
   playPlaced) - and kept only because tools/audition-cues.js reads it to space
   its demonstration, and because it is the measured answer to a question that
   will come back: struck together, an impact and a note read as a chord with a
   click on the front; 90ms apart they read as one event with a consequence. */
const STEP_DELAY_S = 0.09;

/* 0.42, AND IT WAS 0.55 — a 2.4 dB trim, and the smaller half of raising the
   narrator. See the LEVEL note in the narrator section for the measurement that
   asked for it.

   CHANGING THIS NUMBER INVALIDATES EVERY .wav IN assets/sfx/, AND THE
   NOTE THAT USED TO SIT HERE SAID THE OPPOSITE. It read: "Every cue's level
   relative to every other is untouched: this is one master gain, so the
   calibration table above still holds, 2.4 dB down. The chain peaks in it move
   with it — thud's -3.9 becomes -6.3, pop's -8.0 becomes -10.4 — which is also
   2.4 dB more headroom." Every sentence of that is backwards, and it cost the
   game two real defects that stood for several builds.

   THE DIRECTION IT GETS WRONG. This gain is INSIDE the chain the bench measures
   through. A cue's target is its loudness AFTER this multiply, so lowering it
   does not make cues quieter and leave the table intact - it makes the RENDERED
   FILES WRONG, because the file that landed on -25.0 LUFS at 0.55 lands on -27.3
   at 0.42. Re-rendering puts them back on target by making every file 2.4 dB
   LOUDER, which is 2.4 dB LESS headroom in the file, not more.

   WHAT THAT ACTUALLY COST, both found by re-running the bench:

     every cue played 2.3 dB under its own stated target, for as long as this
     comment stood, because the .wav files were the ones rendered at 0.55;

     `pop` then clipped when they were corrected. It had 0.9 dB of file headroom
     and needed 2.34, so it came back at +1.5 dBFS with 48 samples railed. Its
     offset is 2.5 dB lower now - see the table.

   AND ONE THING THE OLD NOTE GOT RIGHT: the RELATIVE balance really is untouched,
   because this is one gain in front of everything. That is why the fix was a
   re-render and not a re-tune, and why only the one cue that ran out of headroom
   needed a decision made about it.

   1.4898, AND IT WAS 0.940 - the effects bus came up ANOTHER 4.0 dB, on the user
   asking a second time: "increase the sound of sfx and voice effects, it should
   be at the same volume as the voiceover". The first pass at that note bought
   7.0 dB and left them 5.1 dB apart, which is a real gap and evidently an
   audible one.

   WHERE IT LANDED, measured through the real chain rather than reasoned about:

                          before      now      the narrator
       set mean            -22.9    -19.1        -16.9 LUFS
       loudest cue         -18.5    -14.5   (roundDone)
       hottest file        -0.40    -1.86   (thud, then thud)
       hottest chain peak  -1.60    -0.46   (dogeat, then dogeat)

   So the gap in MEAN loudness is 2.2 dB where it was 6.0, and the cues a child
   actually hears twelve times a session - the card going in at -17.5, the deal
   at -18.0, the deck at -17.5 - are inside a decibel of her. The celebration is
   2.4 dB ABOVE her, which it should be: it is the one moment in the game that is
   allowed to be the loudest thing in it.

   WHY 4.0 AND NOT 5.2, WHICH IS WHAT PARITY WOULD TAKE. Two ceilings sit above
   this number and both were measured rather than guessed:

     THE FILE. The bench writes 16-bit wavs. At the shipping level before this
     pass, `thud` was already at -0.40 dBFS - four tenths of a decibel from full
     scale - with cycle, dogeat, pop and snap within two.

     THE OUTPUT. This is the real stop, and it is worth understanding because it
     is counter-intuitive: a cue's OUTPUT PEAK works out to its LUFS target plus
     its own crest factor, and the master trim cancels out of that entirely.
     Raising this gain does not buy headroom, it just moves where the gain is
     applied. So the ceiling belongs to the peakiest cue in the set, and at 22-23
     dB of crest that is `cycle` and `dogeat`.

   SO THE FOUR dB WAS NOT TAKEN UNIFORMLY. Swept and re-rendered at +2 and +4
   with every offset left alone, the bench railed: at +2, thud wrote +0.10 dBFS
   into the file and cycle's chain peak hit +0.18; at +4, thud +0.76 and cycle
   +1.89. The fix is per-cue and it is in the table below - five offsets came down
   1.4 to 2.9 dB, exactly enough to hold every chain peak at or under -0.46 dBFS,
   and the other twenty-four rows took the whole four.

   WHAT IS LEFT IF SHE IS STILL LOUDER, and this is the honest end of it: nothing
   that is only a number. The remaining 2.2 dB is crest factor, not gain - a set
   of 200ms transients cannot measure as loud as speech without being compressed,
   and this chain's limiter is deliberately a backstop rather than a leveller. The
   next move is a compressor on the effects bus AHEAD of the shared limiter, so
   the transients can be held down and the body brought up; that is a change to
   how every cue sounds, it would need the whole set re-auditioned, and it should
   not be made because of an arithmetic gap on a meter.

   THE PAIR OF NUMBERS MOVES TOGETHER, and this is the part that is easy to get
   wrong. SFX_HOUSE_LUFS is what the bench calibrates each cue TO, measured
   through this gain. Raise this alone and the bench simply scales every file
   down by the same amount to hit the unchanged target - the mix comes out
   identical and the only thing that changed is where the gain sits. Both went up
   7.0 dB together and then both went up 4.0 more, which is what actually made
   the game louder. tools/serve.py + a script that edits the pair, re-runs the
   bench and prints the hottest file and chain peak is how the 4.0 was found; the
   sweep is three runs and it is worth redoing rather than guessing.

   SO: CHANGE THIS, THEN RUN THE BENCH. Not optional, and not cosmetic.

       python tools/serve.py 8011
       node tools/run-bench.js 8011

   ...and copy the SFX_TRIM.correct it prints, which is the one level that a
   re-render cannot fix by itself: that cue's file is supplied and never written,
   so its gain lives in SFX_TRIM and has to be moved by hand. */
const SFX_VOLUME = 1.4898;     // master trim, ahead of the room and the limiter
const ROOM_S     = 0.7;       // length of the little room every cue sits in
const ROOM_MIX   = 0.16;      // how much of it comes back

/* --- the narrator's lines ---------------------------------------------------

   Where each line of narration lives. Keyed by what the line DOES rather than
   by its number, so a re-recording is a path change and nothing else; the
   number is in the filename and in the table in the narrator section, which is
   also where the mapping from the gameplay sheet is argued out.

   `from` and `to` are offsets in seconds handed to start(). That is what
   AudioBufferSourceNode takes them for, and it is how askOrder plays one
   sentence out of dialogue 29 without the file being re-cut, re-levelled or
   re-encoded. Buffers are cached by src, so handoff and askOrder are one
   download and one decode between them.

   The spaces in the filenames are the names the recordings arrived with and are
   kept, so a line can still be matched to its row on the sheet by eye. They are
   written %20 here because these strings are handed to fetch() as URLs. */
/* TWO INSTANTS IN DIALOGUE 29, in seconds into the file: where its last
   sentence starts, and where inside that sentence she reaches the words the
   banner itself says. Up here rather than written into their readers because
   neither number means much without the other:

     VO_SRC.askOrder   plays the file FROM the sentence start, so `askOrder` IS
                       that sentence and nothing else - one download, no re-cut.
     VO_SRC.handoff    carries the LATER one as `bannerAt`, which is how long the
                       banner stays on the question the child has just answered
                       after the handover opens its mouth. See sayAnswer().

   THE SENTENCE IS NOT THE QUESTION, which is the trap here and cost two goes to
   get out of. It is चलो, आगे की कहानी को सही क्रम में लगाओ; only the last six
   words are what the banner is about to say, and the first three are still the
   Tutorial clearing its throat. So a banner released on the sentence is early by
   however long चलो, आगे की takes - 1.39s - and to a child that reads as the same
   fault as a banner released on the file.

   5.12 IS INSIDE THE FILE'S ONE REAL PAUSE. Measured: at 50 dB below peak the
   whole 8.49s has exactly two internal gaps, 3.40-3.50 and 5.04-5.27, and the
   first is a comma's worth of breath; the sentence break is the second. Measured
   again at the noise floor, which sees only the sentence break: one internal
   pause, 5.100-5.260. 5.12 sits 80ms into it and leaves 150ms of lead-in before
   the voice comes back, which is exactly the lead-in every whole file has - so
   it is the START OF A LINE in the same sense as 0 is, which is what makes it
   the right anchor for the sentence in the same sense that 0 is the anchor for
   the file. What is left runs 3.29s and measures 0.3 dB off the whole file -
   inside the 0.5 dB spread of the set - so it wants no trim of its own.

   6.51 IS THE LAST SILENT FRAME BEFORE HER क, and it is measured rather than
   counted off a syllable rate because it CAN be: every word in this stretch that
   could be mistaken for the target begins with a /k/, and a /k/ is a silence
   followed by a burst. Tracking a 2-8 kHz band against an 80-900 Hz one, आगे's
   voiced /ɡ/ closes 6.130-6.180 - high band gone, low band never leaves - की's
   /k/ goes silent in BOTH from 6.298 and bursts at 6.348, and कहानी's does the
   same from 6.445 and bursts at 6.515, +24 dB in one 2.5ms hop. को's own /k/
   then bursts at 6.990, which leaves 400ms for the three syllables of कहानी:
   133ms each, the rate the rest of the sentence keeps. So the two onsets
   corroborate each other and this does not rest on reading one gap.

   AND THE TYPING IS THE REST OF THE MATCH. She takes 1.68s over those six words;
   the banner types its 18 clusters in 0.83s at --prompt-type-ms. Starting it on
   her क puts the first letter under the first sound and finishes the sentence
   while she is still inside it, which is what a title tracking a voice looks
   like - so neither number wants a fade in front of it. */
const ASK_ORDER_AT       = 5.12;
const ASK_ORDER_WORDS_AT = 6.51;

const VO_SRC = {
  askFirst:  { src: 'assets/voiceover/Narrator%20Dialogue%2025.wav' },   /* 5.63s */
  goodFirst: { src: 'assets/voiceover/Narrator%20Dialogue%2026.wav' },   /* 5.21s */
  askNext:   { src: 'assets/voiceover/Narrator%20Dialogue%2027.wav' },   /* 2.73s */
  goodNext:  { src: 'assets/voiceover/Narrator%20Dialogue%2028.wav' },   /* 6.91s */
  /* `hold: true` — THE ONE LINE IN THE GAME THAT SURVIVES hush(). 29 is queued
     behind the Tutorial's second praise now (see ROUNDS[0].narration), so it is
     still WAITING while the child places screen 1's third card — and that
     placement calls hush(), whose whole job is to drop what is queued so the
     game cannot ask for a card that is already in its frame. Dropped, the
     handover would be heard by a slow child and silently missed by a quick one.
     It is not a question, so no placement can make it stale: it is kept. */
  /* `bannerAt` - THE BANNER DOES NOT TURN OVER WHEN THIS LINE STARTS. Every
     other chained line in the game is one sentence and is entirely the question
     the banner is waiting for, so releasing the pin on its first frame puts the
     wall and the voice on the same instant. This one is two sentences and only
     the SECOND is Level 1's question - so releasing on frame 0 put the new title
     up five seconds before she said a word of it, which is what the user
     reported: "the next title ... is coming too fast. It should come when the
     voiceover says that too. till then keep the previous title."

     NOR IS IT THE SENTENCE BOUNDARY, which is what that first fix used. The
     sentence opens चलो, आगे की before it reaches the banner's own words, so a
     pin pulled at ASK_ORDER_AT was still 1.39s early and the user reported the
     same fault a second time - "it is coming still too fast. It should match
     with the voiceover." What the banner waits for is her क, not her breath. */
  handoff:   { src: 'assets/voiceover/Narrator%20Dialogue%2029.wav', hold: true,
               bannerAt: ASK_ORDER_WORDS_AT },                           /* 8.49s */

  /* Dialogue 29's last sentence — चलो, आगे की कहानी को सही क्रम में लगाओ —
     which is word for word the question screens 2-4 put in the banner, and the
     only recording of it there is. Where the 5.12 comes from is at
     ASK_ORDER_AT, above the table.

     AND IT HAS NO CALLER AS A LINE. Screens 2-4 used to speak it on arrival and
     again on every stall; Level 1's instruction is now given ONCE, at the seam,
     inside `handoff` above — which ends with this very sentence. Kept rather
     than deleted because it is the same download as handoff and so costs
     nothing, because it is the one lever if those screens are ever to greet the
     child in her voice again (put it back on their `narration.ask` and
     enterRound() speaks it) — and because the OFFSET is still read even while
     the line is not: `from` cuts this sentence out of 29 for a caller that no
     longer exists, while handoff.bannerAt reads a LATER instant inside this very
     sentence. The two are 1.39s apart and both are load-bearing. */
  askOrder:  { src: 'assets/voiceover/Narrator%20Dialogue%2029.wav', from: ASK_ORDER_AT },

  /* AARU'S OWN VOICE, AND THE ONLY LINE IN THE GAME THAT IS NOT THE NARRATOR'S:
     शाबाश! तुमने कहानी को फिर से सही क्रम में लगा दिया. It is spoken over him
     swinging in on the clothesline at the very end - see playEntry(), which is
     its one caller.

     SUPPLIED, NOT GENERATED, and named as it arrived. The other seventeen are
     'Narrator Dialogue NN.wav'; this one is aaru_voice.mp3 because that is the
     file the user handed over, and renaming a supplied recording is how a line
     stops being matchable to the take it came from. (assets/voiceover/arru.mp3
     is a FIRST, WRONG take of the same line, sent and then corrected. It is left
     on disk rather than deleted because it is not this repo's to throw away, and
     nothing references it.)

     mp3 RATHER THAN wav, WHICH THE PATH ALREADY HANDLES. primeVo() fetches the
     bytes and hands them to decodeAudioData, which does not care what container
     they were in; nothing downstream reads the extension. 44.1 kHz mono against
     the narrator's 24 kHz is equally of no consequence - the context resamples
     on decode.

     `to` IS NOT TIDYING, IT IS A REPAIR. The file is 5.721s and the sentence
     ends at 4.96s, and what follows the silence after it is not more silence:
     there is a 121ms burst at 5.600s peaking at -13.1 dBFS - a thump, 12 dB
     below the voice itself and plainly audible - with 640ms of -85 dB between
     the two. Played whole, Aaru finishes his line, the board goes quiet, and
     then something knocks. 5.02 cuts 60ms past the last of the voice (which is
     at -84 dB by 5.00s, so nothing of his is clipped) and leaves the burst
     unplayed. It also means the line ENDS when he stops talking, which is what
     dropHoldMs() measures him against - see voLen().

     `gain` IS A TRIM AND IT IS MEASURED. Against the seventeen narrator files
     this take is +0.87 dB on its loudest 100ms and +1.74 dB on its body, where
     the whole narrator set spans 2.72 dB - so Aaru would be audibly louder than
     the woman who has been talking to the child all game. -1.31 dB is the mean
     of those two measurements and 0.860 is that as a ratio.

     WHY A TRIM RATHER THAN A RE-RENDER, and this is the precedent SFX_TRIM set
     for the one supplied effect: a file that arrived from someone else is not
     rewritten to fit the mix, its gain is written down next to it. The recording
     plays whole, at its own length, with its own cadence - the 400ms he leaves
     after "शाबाश!" and the breath at 2.89s are his, and nothing here touches
     them. Delete this one property to hear it at the level it was sent. */
  aaruDone:  { src: 'assets/voiceover/aaru_voice.mp3', to: 5.02, gain: 0.860 },
};

/* The narrator's own gain, on her own bus. See the LEVEL note in the narrator
   section for where this number comes from — it is measured, like the effects.
   Set it to 0 and there is no narration and no ducking either; nothing else
   needs changing.

   0.50, AND IT WAS 0.20 — the user could not hear her over the effects, and the
   number that said she was already 6 dB LOUDER than them was measuring the wrong
   thing. The reasoning is in the narrator section's LEVEL note; the short of it is
   that loudness and audibility part company when one source is speech and the other
   is a set of 200ms transients. */
const VO_VOLUME = 0.50;

/* How far the effects drop while she is talking.

   12 dB, AND IT HAS BEEN 6 AND 9. Every one of those changes is a consequence of
   the effects bus moving, not an opinion about ducking. The number that matters
   is not the depth of the duck, it is where the effects LAND under her:

       bus       duck    effects under her    margin vs her -16.9
       -29.1      6 dB        -35.1                18.2 dB
       -22.9      9 dB        -31.2                14.3 dB
       -19.1     12 dB        -31.2                14.3 dB   <- this

   So the margin is held exactly where the last pass measured it, and the whole
   of the +4 dB the bus just gained is spent in the SILENCES between her lines -
   which is where a child is looking at the cards rather than listening to her,
   and where the complaint that the effects were too quiet came from.

   LEAVING IT AT 9 WOULD HAVE PUT THE EFFECTS AT -28.2 UNDER HER, an 11.3 dB
   margin, and the note this replaces flagged that number in advance as "most of
   the way back to the 6 dB that made her inaudible in the first place". It was
   right, so this followed the bus rather than waiting to be told again.

   THIS IS STILL THE KNOB IF SHE GETS BURIED, and it is cheaper than anything
   else here: it costs no re-render, because it is a live gain and not a file.
   0.20 is another 2 dB and is the safe end; much past that the game audibly goes
   quiet every time she opens her mouth, which is what the 6 dB was protecting
   against. */
const VO_DUCK   = 0.25;

/* --- content --------------------------------------------------------------- */

/*  home  — the card's resting rect in the tray, verbatim from each Figma frame.
 *          Positions and widths genuinely differ per round; the designer placed
 *          each card by hand. These double as the tray's carousel stations.
 *  crop  — how the artwork is framed inside the card, as percentages of the
 *          card's FRAME box (home.w x CARD_H, the white border included — see
 *          where these are resolved in buildRound). Also hand-placed per card
 *          in Figma, so a centred `object-fit: cover` would reframe all twelve.
 *  vo    — voice-over for this picture, played on the 2nd incorrect attempt.
 *          One per card, dialogues 13-24, and they are the sheet's own column
 *          "Hint VO on 2nd Wrong Attempt". A card sits at exactly one story
 *          position, so per-card and per-position are the same table; the
 *          mapping from screen number to card is argued out in the narrator
 *          section. Written %20 because these are handed to fetch() as URLs,
 *          like VO_SRC. Set one to null and that card simply gets no hint.
 *  order — the pictures THIS SCREEN asks for, in story order.
 *
 *          IT IS NOT THE WHOLE LINE, and that is the one thing about this table
 *          that is easy to misread. The line holds three frames on every screen,
 *          but a screen only fills as many of them as it brings new pictures for:
 *          the rest are the last pictures of the story so far, carried across the
 *          seam still hanging and no longer the child's to move (anchorsFor()
 *          derives them, shiftLine() hands them over). So `order` is three entries
 *          long on screen 1 and exactly two on every screen after it, and a slot
 *          index is NOT an index into it — see anchorCount() and expectedCardFor().
 *
 *          AND THE FIVE OF THEM CONCATENATED ARE THE ELEVEN PANELS IN STORY ORDER,
 *          exactly as they were when this was four screens of three. That is a
 *          hard constraint, not an observation: storyCards() joins them to get the
 *          story, and the post-game recap's RING_SKIP, RING and SCENE_FX are all
 *          indexed into that join BY POSITION. (tools/make-hd-cards.py is keyed by
 *          RING SLOT, 01..10, so it is the one table a re-windowing cannot reach.)
 *          An anchor is already counted there once, on the
 *          screen that introduced it, so it must never appear in a second
 *          screen's `order` or `cards`. Re-window freely; keep the join identical.
 *  narration
 *        — which of the narrator's lines this screen uses, or null for a screen
 *          she does not speak on at all. `ask` is the question the screen opens
 *          with, either one name for the whole screen or one per slot; only
 *          slot 0's is read now, because nothing re-asks. `answered` is what she
 *          says when a slot is filled correctly, as a list: the praise for the
 *          event just placed, and behind it whatever should be said next — which
 *          on the second slot of screen 1 is the handover into Level 1. Names
 *          index VO_SRC. `done`, a line for the finished screen, is a hook no
 *          screen uses any more; see finishRound.
 *
 *          SHE SPEAKS ON SCREEN 1 AND NOWHERE ELSE. Five lines, each once, in
 *          the sheet's order: ask, praise, ask, praise, hand over. `node
 *          tools/sim.js play` prints exactly that list and asserts nothing
 *          overlaps; `node tools/sim.js teach` walks the timing of it.
 *
 *  NOTE: only screen 1's answer is confirmed — the Figma states (133:2273) show
 *  the house going into the first frame, and the second is the sneeze (the lid
 *  blows off the pot), which is what he then lifts. The rest are read from the
 *  artwork's narrative and are the one thing here worth a second pair of eyes —
 *  they are isolated in this block so they are cheap to correct.
 *
 *  HOW THE ELEVEN PANELS ARE WINDOWED, and why it is 3-2-2-2-2.
 *
 *  EVERY SEAM CARRIES EXACTLY ONE FRAME, and that is the rule the user stated:
 *  three empty frames arrive on screen 1 and the child fills all three; from
 *  then on TWO filled frames ride off to the left, ONE filled frame stays at the
 *  left of the line, and TWO empty frames come in from the right. So screen 1
 *  brings three and carries none, and every screen after it brings two and
 *  carries one. anchorsFor() derives that from `order` alone; nothing states it
 *  twice.
 *
 *  IT COST A PANEL, AND THAT IS ARITHMETIC RATHER THAN TASTE. A screen that
 *  carries one has two frames left to fill, so a story windowed this way is
 *  3 + 2k long — 11, or 13, and never the 12 panels this was drawn for. The
 *  windowing used to buy that twelfth panel with one odd screen, 3-2-1-2-2-2: a
 *  screen that brought a single picture and carried two, so ONE empty frame
 *  arrived where every other seam brought two. That screen is exactly what was
 *  reported as wrong. Uniform seams and twelve panels cannot both be had, and
 *  the seams were chosen.
 *
 *  THE PANEL THAT WENT IS `hurt`, the sheet's story 6 — he gets up and dusts
 *  himself off. It is the cheapest of the twelve to lose and it was already half
 *  gone: it is the SECOND beat of a pair whose first beat stays (he falls off
 *  the bicycle, and then he is hurt), and the post-game ring has never shown it
 *  — RING_SKIP dropped it and `pickup` to match the reference layout. So the
 *  recap is untouched by this. The same ten pictures light in the same ten
 *  places; all that changed there is that RING_SKIP has one entry instead of
 *  two, because the picture it used to filter out is no longer in the story to
 *  be filtered.
 */
const ROUNDS = [
  {
    id: 'sneeze',
    /* THE THIRD ONE IS LEVEL 1'S QUESTION, not a third tutorial question, and
       that one line is the whole Tutorial/Level 1 seam. The Tutorial is TWO
       interactions - it asks what happened first, praises, asks what happened
       next, praises - and then it is over. Screen 1's third frame is therefore
       the child's first INDEPENDENT placement, so it is asked what screens 2-4
       ask, word for word, and the banner changes to it on the frame the
       handover line starts speaking. See the narration block below, and
       promptHold in render() for what makes the change land on that frame
       rather than on the placement before it. */
    prompts: [
      'कहानी में सबसे पहले क्या हुआ था?',
      'उसके बाद क्या हुआ?',
      'कहानी को सही क्रम में लगाओ।',
    ],
    cards: [
      { id: 'house',  src: 'assets/images/r1-house.webp',  alt: 'आरू घर के बाहर बैठा है', vo: 'assets/voiceover/Narrator%20Dialogue%2013.wav',
        home: { x: 181,  y: 732, w: 398 }, crop: { w: 121.48, h: 100.12, x: -21.48, y: -0.06 } },
      { id: 'sneeze', src: 'assets/images/r1-sneeze.webp', alt: 'आरू को ज़ोर से छींक आती है', vo: 'assets/voiceover/Narrator%20Dialogue%2014.wav',
        home: { x: 762,  y: 732, w: 394 }, crop: { w: 126.34, h: 102.97, x: 0,      y: 0 } },
      { id: 'pot',    src: 'assets/images/r1-pot.webp',    alt: 'आरू बर्तन का ढक्कन उठाकर देखता है', vo: 'assets/voiceover/Narrator%20Dialogue%2015.wav',
        home: { x: 1339, y: 737, w: 398 }, crop: { w: 121.33, h: 100,    x: -21.28, y: 0 } },
    ],
    order: ['house', 'sneeze', 'pot'],
    /* The whole of the sheet's narration lives on this screen, and it is the
       sheet's ask-praise-ask-praise exactly: 25 asks, 26 praises and hands on to
       27, 27 asks, 28 praises. Two interactions, and the Tutorial is finished.

       `ask` IS THE ARRIVAL LINE ONLY, and used to be one entry per slot because
       a stall re-asked whichever frame the child was on. Nothing re-asks now
       (see the note where IDLE_VO_MS used to be declared), so enterRound() is
       the only reader left and it only ever asks for slot 0. The second frame's
       question is not lost with the array — it is chained behind the first
       praise, which is where the sheet puts it.

       29 MOVED HERE, OFF THE END OF THE SCREEN, and this is the change the user
       asked for: "the Tutorial ends after the second interaction, so once the
       second picture is placed successfully, transition to Level 1". It used to
       be `done: 'handoff'`, spoken after the THIRD card went in — one card past
       the point the script itself marks — and what filled the gap in between was
       the idle clock re-asking 27, the SECOND PICTURE'S OWN QUESTION, every nine
       seconds. That is what was reported as "the VO associated with the second
       picture is being played again".

       IT IS 15.4s OF SPEECH, 28 AND THEN 29, AND THAT IS KNOWN. The note this
       replaces measured exactly that pairing and rejected it, because a child
       placing the third card during it drops whatever is queued (see hush) — so
       the handover "was never heard at all" by anyone quick. The failure is
       fixed at its cause instead of avoided: `handoff` carries `hold: true` and
       hush() keeps it. A child may play on straight through her, which is the
       right way round; what they may not do is silently miss the handover. */
    narration: {
      ask: 'askFirst',
      answered: [['goodFirst', 'askNext'], ['goodNext', 'handoff'], null],
    },
  },
  {
    id: 'cycle',
    prompts: ['कहानी को सही क्रम में लगाओ।'],
    cards: [
      { id: 'ride', src: 'assets/images/r2-ride.webp', alt: 'आरू साइकिल चला रहा है', vo: 'assets/voiceover/Narrator%20Dialogue%2016.wav',
        home: { x: 765,  y: 732, w: 394 }, crop: { w: 135.29, h: 110.29, x: -0.01,  y: -10.29 } },
      { id: 'fall', src: 'assets/images/r2-fall.webp', alt: 'आरू साइकिल से गिर रहा है', vo: 'assets/voiceover/Narrator%20Dialogue%2017.wav',
        home: { x: 202,  y: 732, w: 394 }, crop: { w: 122.66, h: 100,    x: -22.67, y: -0.06 } },
    ],
    order: ['ride', 'fall'],
    /* NOTHING IS SPOKEN ON THIS SCREEN, and the silence is the fix rather than
       an omission. Level 1's instruction — चलो, आगे की कहानी को सही क्रम में लगाओ —
       is given ONCE, at the seam, inside the Tutorial's handover; the screens
       after the Tutorial used to speak it again on arrival and again on every
       stall, which `node tools/sim.js last` counted at six askings in a brisk
       playthrough and far more in a slow one. The banner still asks, in the same
       words, and a stall is still answered — by the pulse and the hand, which is
       what the sheet's Idle Hint column has always been.

       THE SAME IS TRUE OF EVERY SCREEN BELOW, and none of them repeats this. */
    narration: null,
  },
  /* THE SCREEN THAT BROUGHT A SINGLE PICTURE STOOD HERE and is gone, which is
     what makes every seam in this game the same seam. It held one card, r2-hurt
     ("he gets up and dusts himself off", dialogue 18), so it carried TWO frames
     across and only ONE empty frame came in behind them - the one seam that did
     not read as "two go, one stays, two arrive". See the windowing note over
     ROUNDS for the arithmetic that made that screen unavoidable while the story
     was twelve panels long, and for why this beat is the one that pays for
     making the seams uniform. The artwork and the recording are both still in
     the tree; putting the beat back is this block and RING_SKIP. */
  {
    id: 'juice',
    prompts: ['कहानी को सही क्रम में लगाओ।'],
    cards: [
      { id: 'cart', src: 'assets/images/r3-cart.webp', alt: 'आरू गन्ने के रस की गाड़ी पर', vo: 'assets/voiceover/Narrator%20Dialogue%2019.wav',
        home: { x: 185,  y: 732, w: 394 }, crop: { w: 146.12, h: 119.12, x: -0.09,  y: -3.68 } },
      { id: 'dog',  src: 'assets/images/r3-dog.webp',  alt: 'कुत्ता आरू की ओर दौड़ता है', vo: 'assets/voiceover/Narrator%20Dialogue%2020.wav',
        home: { x: 1348, y: 732, w: 394 }, crop: { w: 122.66, h: 100,    x: -22.63, y: 0 } },
    ],
    order: ['cart', 'dog'],
    narration: null,
  },
  {
    id: 'flour',
    prompts: ['कहानी को सही क्रम में लगाओ।'],
    cards: [
      /* This one's crop is not read off Figma, because this one is not a Figma
         FRAME: it is cut from story page 10 of the file's STORY section by
         tools/recut-r3-home.py, which carries the reasoning. The numbers below
         are therefore the trivial ones — the file is cut to the card's picture
         window and dropped straight into it, so the crop is exactly 374x252 at
         the origin (94.924% of 394, 92.647% of 272, offset by the border).
         Nothing here is free to change on its own: the aspect is held in the
         cutter, and these four numbers only say "fill the window". */
      /* The alt describes what is DRAWN, which is not what this card's id or
         the screen it used to sit on would lead you to expect: the picture is
         Aaru walking home with the flour and his mother in the doorway, not him
         carrying a glass back from the juice cart. It read
         'आरू गिलास लेकर घर लौटता है' until the artwork was looked at. Worth
         knowing if this card is ever re-cut. */
      { id: 'home', src: 'assets/images/r3-home.webp', alt: 'उदास आरू आटा लेकर घर लौटता है', vo: 'assets/voiceover/Narrator%20Dialogue%2021.wav',
        home: { x: 801,  y: 732, w: 394 }, crop: { w: 94.924, h: 92.647, x: 2.538,  y: 3.676 } },
      /* THE SECOND CARD CALLED `sneeze`, and it is not the one on screen 1: that
         is r1-sneeze, this is r4-sneeze, drawn differently and served from a
         different file. Every card map in the game is keyed by bare id, so the
         two must never be on the board at once — see storyCards() and
         stockPool()'s warning. They are three screens apart, and anchorsFor()
         resolves an anchor against the round it came FROM rather than by id
         lookup, which is what keeps this one distinguishable when it is the
         picture screen 6 opens with. */
      { id: 'sneeze',  src: 'assets/images/r4-sneeze.webp',  alt: 'आरू की छींक से बर्तन गिर जाते हैं', vo: 'assets/voiceover/Narrator%20Dialogue%2022.wav',
        home: { x: 1349, y: 732, w: 394 }, crop: { w: 163.76, h: 133.46, x: -63.77, y: -32.24 } },
    ],
    order: ['home', 'sneeze'],
    narration: null,
  },
  {
    id: 'earring',
    prompts: ['कहानी को सही क्रम में लगाओ।'],
    cards: [
      { id: 'pickup',  src: 'assets/images/r4-pickup.webp',  alt: 'माँ गिरे हुए बर्तन उठाती है', vo: 'assets/voiceover/Narrator%20Dialogue%2023.wav',
        home: { x: 765,  y: 732, w: 394 }, crop: { w: 203.53, h: 165.93, x: -0.06,  y: -65.91 } },
      { id: 'earring', src: 'assets/images/r4-earring.webp', alt: 'माँ को खोई हुई बाली मिल जाती है', vo: 'assets/voiceover/Narrator%20Dialogue%2024.wav',
        home: { x: 214,  y: 732, w: 394 }, crop: { w: 163.25, h: 133.09, x: -0.15,  y: -3.68 } },
    ],
    order: ['pickup', 'earring'],
    narration: null,
  },
];

/* --- the tray's order -------------------------------------------------------

   THE THREE CARDS ARE DEALT IN A DIFFERENT ARRANGEMENT EVERY GAME, and the
   reason is in ROUNDS above rather than in any complaint about repetition.
   `cards` is listed in the order the designer placed them in Figma; `order` is
   the answer. On two of the four screens those start at the same place - screen
   1 wants `house` first and `house` is the leftmost card, screen 3 wants `cart`
   first and `cart` is the leftmost card. Played twice, that is a rule a child
   can learn instead of the story: take the one on the left. It works often
   enough to be worth learning and nowhere near often enough to be right, which
   is the worst thing a rule can be.

   ONLY THE TRAY MOVES. `order` is untouched, so the story is the same story.
   `cards` is untouched, so every card keeps its own artwork, crop and width, and
   the post-game recap - which walks ROUNDS itself and knows nothing about the
   tray - sees exactly what it saw before. What is shuffled is `queue`, the list
   of ids the tray's stations are filled from, and nothing in the game reads a
   card's place in the tray except through queue.indexOf (see trayPos).

   THE STATIONS STAY WHERE THEY WERE DRAWN. A card takes the x and y of whichever
   station it lands on and keeps its own width, and on three of the four screens
   all three cards are the same 394 wide anyway. Screen 1 is the exception -
   398, 394, 398, at y 732/732/737 - so the worst a swap does there is move a
   card's right edge 4px inside a 183px gap, and its top by 5px.

   AND IT IS SEEDED, so a game can be replayed exactly. The seed is Date.now()
   unless ?seed=N says otherwise, and stampBuild() prints whichever it is - so a
   screen that went wrong can be brought back by opening the game with that
   number. tools/sim.js pins it, which is what keeps two runs of the harness
   byte-identical; an unseeded Math.random() would make every scenario a
   different scenario and every measurement in this file unrepeatable. */

/** mulberry32 - a seedable 32-bit PRNG in four lines, which is all this needs.
    Math.random cannot be seeded, and that is the whole reason this exists. */
function makeRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHUFFLE_SEED = (function () {
  try {
    const q = new URLSearchParams(location.search).get('seed');
    if (q !== null && q !== '' && isFinite(Number(q))) return Number(q) >>> 0;
  } catch { /* no URL API on this browser - fall through to the clock */ }
  return Date.now() >>> 0;
})();

const rollTray = makeRandom(SHUFFLE_SEED);

/** Fisher-Yates, in place, off the seeded stream. Returns the same array so it
    can be wrapped round the map that builds it. */
function shuffleTray(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rollTray() * (i + 1));
    const t = list[i]; list[i] = list[j]; list[j] = t;
  }
  return list;
}

/* --- elements -------------------------------------------------------------- */

const stageEl  = document.getElementById('stage');
const promptEl = document.getElementById('prompt');
const cardsEl  = document.getElementById('cards');
const handEl   = document.getElementById('hand');
const ghostEl  = document.getElementById('handGhost');
const ropeEl   = document.getElementById('rope');
const washEl   = document.getElementById('washline');
const bayTpl   = document.getElementById('bayTpl');
const titleEl  = document.getElementById('title');
const playEl   = document.getElementById('play');
const celebEl  = document.getElementById('celebrate');
const entryEl  = document.getElementById('entry');

/* --- state ----------------------------------------------------------------- */

let roundIndex = 0;
let round      = null;
/* THE TRAY'S THREE PLACES, AND THEY ARE THE SAME THREE ALL GAME.

   They used to be re-read off each round - `stations = round.cards.map(home)`,
   in buildRound - and that was fine while a screen's three cards arrived and
   left together. They do not any more: a picture rolls into the tray while the
   screen BEFORE its own is still being played (see admitNext), so at the moment
   a round changes hands the three cards standing in the tray already belong to
   the round coming in and are already at rest. Re-homing them onto that round's
   own Figma coordinates would slide all three of them sideways by up to 33px on
   a board that is otherwise still - a settle with nothing behind it.

   SCREEN 1'S ARE THE CANONICAL ONES, and not arbitrarily. 181/762/1339 with
   398/394/398 widths is the only one of the four sets that is EVEN: the three
   card centres land on 380, 959 and 1538, which is 579px apart twice and
   symmetrical about the stage's own centre line. The other three screens are
   hand-placed within ~33px of it. So the tray's places are regular now, which
   is also what the child is being told they are - a picture is taken out and a
   new one appears in the same place.

   Derived off ROUNDS rather than copied out of it, so the two cannot drift. */
const TRAY_STATIONS = ROUNDS[0].cards.map(c => ({ x: c.home.x, y: c.home.y }));

/* WHICH OF THE THREE PLACES A SCREEN'S PICTURES STAND ON, by how many it has.

   Screens do not all bring three any more - the line carries the last screen's
   picture over, so screen 1 brings three and every screen after it brings two
   (see anchorsFor). A screen with two therefore has to leave one of three fixed
   places empty for its whole life, and stations 0 and 2 are the only pair that
   is symmetrical about the stage's centre line: their card centres are 380 and
   1538, mean 959, against the tray's own centre of 959.5. Nothing new is
   measured and nothing slides - these are the places that were already drawn.

   THE `1` ROW IS UNREACHABLE NOW AND IT STAYS. It was for the one screen that
   brought a single picture, and making every seam carry exactly one frame
   removed that screen (see the windowing note over ROUNDS). Station 1 is the
   one whose card centre IS 959, so the row is still the right answer to the
   question it asks; a lookup table that answers 1, 2 and 3 should not be the
   thing that breaks if a screen ever brings one again.

   AND IT KEEPS `queue` THREE LONG, which is the invariant the note below states
   and which the deal depends on: `Math.min(1, queue.length - 1)` in enterRound
   and dealFromDeck is "the deck lands on the middle station" written as
   arithmetic, and on a two-long queue it landed the deck on station 1 and dealt
   one card left, while on a ONE-long queue it landed on station 0 and dealt
   nothing at all. */
const TRAY_SPREAD = { 3: [0, 1, 2], 2: [0, 2], 1: [1] };

let stations   = TRAY_STATIONS;        // the tray's places, left to right; fixed
/* THREE PLACES, AND AN EMPTY PLACE IS STILL A PLACE. `queue` is exactly as long
   as `stations` and is indexed BY station: queue[i] is the id of the card
   standing at station i, or null for a place whose card has been hung and which
   has not been refilled yet.

   It used to be a dense list that was spliced, so the survivors scrolled left
   into the gap. They do not move now - see placeCard. */
let queue      = [];                   // station index -> card id, or null
let filled     = [null, null, null];   // slot index -> card id
let cardNodes  = new Map();            // card id -> element
let cardSpecs  = new Map();            // card id -> spec from ROUNDS
let cardRound  = new Map();            // card id -> the ROUNDS index it belongs to
let nextPool   = [];                   // cards waiting off the right, in entry order
/* HOW FAR AHEAD THE POOL HAS BEEN DRAWN: the index of the first screen whose
   cards have NOT been built yet. It only ever moves forward, which is what keeps
   a seeded game reproducible - the screens are shuffled in screen order however
   many of them one stockPool() call gets through. */
let poolAt     = 0;
let bayEl      = null;                 // the bay currently hanging on the line
let slotEls    = [];                   // its three frames, left to right
let haulRaf    = 0;                    // the frame loop driving a haul
let haulGuard  = null;                 // ...and its backstop, for background tabs
let selectedId = null;
let attempts   = 0;                    // wrong tries at the current position
let locked     = false;                // true during round transitions
let hint1Timer = null;
let hint2Timer = null;
let pulseTimer = null;                 // the 3rd-attempt pulse, owed to one slot
let voHintTimer = null;                // ...and the 2nd-attempt hint VO, likewise
let praiseTimer = null;                // ...and her praise, held off the reward chime
let dealTimer  = null;                 // deck holding, before it is dealt out
let dealSettleTimer = null;            // deal finished, entrance state coming off
let arriveTimers = [];                 // refills owed to the tray, cancellable
let celebTimer = null;                 // Aaru's clap: backstop, then his exit
let celebRaf   = 0;                    // ...and the loop walking him on and off
let entryRaf   = 0;                    // the frame loop riding Aaru in at the end
let entryGuard = null;                 // ...and its backstop, for background tabs
let dropRaf    = 0;                    // the loop arcing him off the line
let dropGuard  = null;                 // ...and its backstop
let dropTimers = [];                   // the finale's beats, cancellable together
let celebLoop  = null;                 // the listener looping him on the box
let pauseTimer = null;                 // the beat between the last card and the finale
let drag       = null;

/* --- audio ------------------------------------------------------------------

   Every cue in the game is a file in assets/sfx/. Nothing is
   synthesised while the child is playing.

   The files are rendered from the VOICES table below, which is the source of
   truth for what each cue IS. tools/render-cues.js runs each voice through an
   OfflineAudioContext, calibrates it to a measured loudness target, and writes
   the .wav. So a cue can be re-tuned by editing its voice and re-running the
   bench, or replaced outright by dropping a different file in.

   WHAT THE VOICES ARE MADE OF — and this is the part that changed. They used
   to be oscillators and filtered noise, every one of them, because the design
   shipped no audio and buying some was not on the table. ALL BUT TWO of the
   thirty-two now reach for a RECORDING, all CC0, all fetched rather than bought.

   The two are `pickup`, which is in SFX_MUTED and never heard, and `correct`,
   whose cue is a supplied mp3 so its voice only runs if that file fails to load.
   `wrong` was the third until the boy replaced its falling third — it is the one
   that fired most often, which is why it was the last one worth converting.

   COUNT IT, DO NOT TRUST THIS SENTENCE. It said "sixteen" for a long time after
   it had stopped being sixteen. Every voice that carries a recording calls
   smp() or mbox(), so the count is a grep over this table and not a memory:

       node -e "const s=require('fs').readFileSync('app.js','utf8');
                const b=s.slice(s.indexOf('const VOICES'));
                for(const m of b.matchAll(/\\n  (\\w+): \\(c, t\\)/g)) console.log(m[1])"

   ...against the same table read for smp(/mbox(. What follows is what they are
   made OF:

     everything pitched   ONE MUSIC BOX, recorded note by note. See the note
                          set below, and cut-sfx-assets.py for why the game is
                          in A flat major rather than C.
     the deck, the deal   real playing cards, real paper
     the haul             real rope
     the finale           real air, real wood, a real finger snap, and real
                          children

   THE RECORDINGS DO NOT SHIP. They live in assets/_source/sfx/, are cut into
   samples by tools/cut-sfx-assets.py, and are consumed BY THE BENCH, in the
   browser, at build time. The child downloads the same assets/sfx/
   *.wav as before and not one byte more — a real music box costs them nothing.
   That is also why every voice keeps an oscillator fallback: the fallback is
   for a cue file that will not load, and a sample-backed fallback would need
   the samples at runtime, which is the one thing this arrangement avoids.

   WHY RECORDINGS AT ALL, given the synthesis was carefully tuned. Four things
   an additive stack cannot do, and all four are audible on the reward cue:
   partials at genuinely inharmonic ratios each decaying at its own rate; the
   sympathetic ring of the other bars once one is struck, which is what makes a
   held chord read as one body of sound rather than three stacked notes; the
   coupling between a bar and its resonator, which shifts as the note decays;
   and one-take coherence — one instrument, one room, one set of correlated
   reflections. The first is reachable by re-rendering. The other three are not,
   and together they are the difference between "pretty" and "real".

   WHY FILES AND NOT THE GRAPH. The one cue that was already a file, the
   supplied card-drop mp3, was played through an <audio> element, and an <audio>
   element goes straight to the speakers: past the master trim, past the room,
   past the limiter, and with no way to pan it. So it sat outside the mix it was
   supposed to be part of, at whatever level the file happened to be, and the
   placement cue no longer came from the frame the card went into. Decoding
   every file into an AudioBuffer instead and playing it through
   BufferSource -> trim -> panner -> masterGain puts the whole set back inside
   one chain: one master trim, one room, one limiter, and panAt() works again,
   the mp3 included.

   WHO IT IS FOR. A Class 2 child, around seven, on a tablet. Three things
   follow from that and they decide most of the tuning below:

   Every cue should sound like the thing on the screen. Cards are paper, the
   tray and the frames are wood, the line is rope. A child that age does not
   parse abstract feedback tones; they hear a card slide and know a card slid.
   So the palette is paper, wood, rope and ONE MUSIC BOX — not beeps. It used
   to be a synthesised wooden xylophone (see wood(), which is still the
   fallback); it is now a recording of a real one, and the palette rule is the
   reason a music box was an acceptable substitution and, say, a synth pad
   never could be. A music box is a wooden box with a steel comb in it, which
   puts it in the same world as the tray and the pegs.

   A tablet speaker cannot reproduce bass. A 40mm driver rolls off hard below
   roughly 500Hz, so anything the child actually has to hear lives above that.
   Two cues used to sit under it and were effectively silent on the device they
   ship on; both were moved up. Nothing is high and thin either — a small
   speaker pushed hard in the top octave is the harsh sound this is trying not
   to be.

   THAT RULE IS WHAT CHOSE THE INSTRUMENT, and it was measured before anything
   was built rather than hoped for afterwards. Every note of the music box
   carries 0.0% of its attack energy below 400Hz and effectively none below
   500Hz — which is the opposite of what you would expect, because the usual
   objection to a music box is mechanism noise, the drum click and the spring
   rasp, and all of that lives exactly where the speaker is deaf. These
   particular recordings do not have it. Two notes that DID fail the test, the
   bottom Ab4 and Bb4, are simply not in the set: see cut-sfx-assets.py.

   IT USED TO BUILD, and this is the one piece of the design that has been taken
   out rather than retuned. Each of the three placements rang one note of a rising
   Ab major triad (step1/2/3), so by the third card the child had spelt out a
   chord, and the screen-finished cheer took off from that same chord — the "aha"
   being that the reward was not a new noise arriving but the thing they had been
   building all along, completed.

   A placement is now the card-drop alone, on request: one event, one sound. So
   nothing accumulates across a screen any more, and roundDone is a reward that
   arrives rather than one that resolves. The mechanic is worth knowing about
   because it may be worth another attempt with a different instrument — the
   voices are still in VOICES, still in tune, and playPlaced() says how to put
   them back — but it is not currently in the game, and no prose here should
   imply it is.

   THE KEY IS STILL THE INSTRUMENT'S, NOT A CHOICE. The music box has Ab Bb C Db
   Eb F G and no E natural anywhere, so it can play a complete Ab major scale and
   cannot play a C major triad at all. That decided the key everything pitched is
   tuned to, and it stands whether or not the placements ring.

   LOUDNESS. Measured, not guessed — see SFX_PLAN below and the table in the
   README. Every level in this file is relative balance WITHIN a cue; the
   absolute level of each cue is calibrated into its .wav by the bench.
   --------------------------------------------------------------------------- */

let audioCtx   = null;
let masterGain = null;
let voiceGain  = null;          // the narrator's bus. See the narrator section
let noiseBuf   = null;
const sfxBufs  = new Map();     // cue name -> decoded AudioBuffer, once loaded

/* The recordings the sample-backed voices are built from — music box notes and
   the finale's one-shots. EMPTY DURING A GAME, and that is not an oversight:
   these are loaded only by tools/render-cues.js, at build time, so the child
   never downloads them. A voice that finds this empty falls back to the
   oscillators it used to be (see mbox and smp). */
const sampleBufs = new Map();   // sample name -> decoded AudioBuffer

/* The narrator. Buffers are keyed by src rather than by line, because two lines
   are the same file. */
const voBufs   = new Map();     // src -> decoded AudioBuffer, once loaded
let voQueue    = [];            // lines still to say, after the one sounding
let voNode     = null;          // the source currently sounding
let voTurn     = 0;             // invalidates a cancelled line's end report
let voGuard    = null;          // ...and its backstop, for background tabs

/** Create the context and its master chain. Does not try to start it, so this
    is safe to call at load: a context built outside a gesture is born
    suspended, which is all we need to decode into. */
function ensureCtx() {
  if (audioCtx === null) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      audioCtx = new AC();
      buildChain(audioCtx);
    } else {
      audioCtx = false;
    }
  }
  return audioCtx || null;
}

/** The same context, un-suspended. Must run inside a gesture the first time. */
function audio() {
  const ctx = ensureCtx();
  /* NOT `=== 'suspended'`. WebKit has a fourth AudioContextState, 'interrupted',
     and it is the one iOS uses when the audio session is taken away - a call,
     Siri, the screen locking, another app playing. It does not come back by
     itself, and testing for that one word left the game silent for the rest of
     the session: an interrupted context is still truthy, so sfx() and sayNext()
     went on scheduling cues onto a clock that had stopped advancing. This game
     is narrated, so silent means uninstructed. The next card touch calls this
     from inside a gesture, which is the only place iOS lets resume() succeed. */
  if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}

/** The master chain. Everything meets at masterGain, keeps a little of itself
    in a small room, and leaves through a soft limiter.

    The room is what stops twelve rendered cues sounding like twelve rendered
    cues. A dry oscillator has no space around it and the ear files it as a test
    tone; the same note with a short bright tail lands as something that
    happened somewhere in the room the child is in. It is a 0.7s noise impulse
    decayed to the power of 2.6 — not a real space, only the part of one that is
    audible over a sound this short.

    The limiter is there because these overlap: a card can land while the deal
    is still running and the idle bell is still ringing. Summed peaks clip, and
    clipping is the one thing that turns quiet cues harsh on a tablet speaker.
    It is a backstop, not the thing setting the levels — every cue is calibrated
    to leave it most of its headroom. */
function buildChain(ctx) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value      = 22;
  comp.ratio.value     = 6;
  comp.attack.value    = 0.004;
  comp.release.value   = 0.22;
  comp.connect(ctx.destination);

  masterGain = ctx.createGain();
  masterGain.gain.value = SFX_VOLUME;
  masterGain.connect(comp);

  /* The narrator goes to the limiter direct, past the room and past the master
     trim. Past the room because the room is here to give a rendered oscillator
     somewhere to be, and a recorded voice already has somewhere — 0.7s of tail
     at 16% wet on top of it only smears the consonants a seven-year-old is
     listening for. Past the master trim because she is ducking it (see duck),
     and something cannot both duck a gain and sit behind it. Through the
     limiter, though: catching a line and a card-drop landing together is
     exactly what it is for. */
  voiceGain = ctx.createGain();
  voiceGain.gain.value = VO_VOLUME;
  voiceGain.connect(comp);

  if (!ctx.createConvolver) return;
  const len = Math.floor(ctx.sampleRate * ROOM_S);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const room = ctx.createConvolver();
  room.buffer = buf;
  const wet = ctx.createGain();
  wet.gain.value = ROOM_MIX;
  masterGain.connect(wet).connect(room).connect(comp);
}

/** Fetch and decode every file-backed cue, up front.

    This runs at load rather than on first play, and that is the whole point of
    it: a card landing in a frame is the worst possible moment for a sound to
    arrive late, and the first cue of all — the play button's pop — fires on the
    very gesture that opens the context, with no time to fetch anything. The
    title screen is the slack in the system: however long the child looks at it
    is time these are decoding. Decoding needs no gesture, only a context, and
    ensureCtx() builds one without trying to start it.

    A cue that fails to load logs once and falls back to its synthesised voice
    (see sfx). That is deliberate: opening index.html straight off the disk puts
    fetch() behind the file:// origin rules and every one of these will fail, so
    the fallback is what keeps the game audible when it is not being served.
    Serve it — python tools/serve.py — and the designed files are what play. */
function primeSfx() {
  const ctx = ensureCtx();
  if (!ctx) return Promise.resolve();
  let weighed = 0, missing = 0;
  return Promise.all(Object.entries(SFX_SRC).map(([name, src]) => {
    if (!src) return null;
    /* ?v=BUILD for the same reason the clips carry one: all but one of these
       are generated by the bench, and a browser that has opened the game before
       will happily replay the old bytes on a plain reload. See the protocol
       note beside stampBuild().

       IT MATTERS MORE THAN IT DID. Every cue in the recap changed identity in one
       pass - a synthesised sneeze became a recorded one, six silent cards got
       files that did not exist - so a stale cache here is not a slightly-off
       level, it is the old machine noises playing under the new build. */
    return fetch(src + (src.indexOf('?') < 0 ? '?v=' + BUILD : ''))
      .then(res => { if (!res.ok) throw new Error(res.status + ' ' + res.statusText); return res.arrayBuffer(); })
      .then(bytes => { weighed += bytes.byteLength; return ctx.decodeAudioData(bytes); })
      .then(buf => sfxBufs.set(name, buf))
      .catch(err => {
        missing += 1;
        if (!primeSfx.warned) {
          primeSfx.warned = true;
          console.info('[aaru] audio files did not load (' + src + ': ' + err.message +
                       ') — falling back to the synthesised voices. Serve the folder ' +
                       'over http (python tools/serve.py) to hear the designed cues.');
        }
      });
  })).then(() => {
    /* THE WEIGH-IN. See SFX_BYTES. Only where every cue arrived — a set that is
       short because the page was opened off the disk, or because the network
       dropped one, is a different fault and it has its own message above. */
    if (missing || weighed === SFX_BYTES) return;
    console.warn(
      [
        '[aaru] STALE CUES. The .wav files this page was served are not the set',
        'build ' + BUILD + ' was made against, so at least one of them is a copy the',
        'browser had from before. Nothing will sound broken — it will sound OLD,',
        'on whichever cue it is, which is the hardest kind of fault to see.',
        '  expected  ' + SFX_BYTES + ' bytes over ' + Object.keys(SFX_SRC).length + ' cues',
        '  served    ' + weighed + ' bytes  (' + (weighed - SFX_BYTES) + ')',
        '  Fix, in order: hard reload (Ctrl+Shift+R). If that clears it, someone',
        '  rebuilt the cues without bumping BUILD and the ?v= in index.html.',
        '  If it does not, the files on disk have moved: set SFX_BYTES to the',
        '  served figure above and bump BUILD.',
      ].join('\n'));
  });
}

/** Fetch and decode the narrator's lines, alongside the effects.

    Same reasoning as primeSfx, and the same moment: however long the child
    looks at the title screen is time these are arriving in. A line that turned
    up late would be worse than one of the effects turning up late, because a
    sentence cannot be shortened to catch up.

    Unlike the effects, these have no synthesised fallback and never could — so
    a line that will not load is simply not spoken, and the game carries on with
    its banner and its hints. That is also what happens when index.html is
    opened straight off the disk, where fetch() is blocked by the file:// origin
    rules. Serve it to hear her. */
function primeVo() {
  const ctx = ensureCtx();
  if (!ctx) return Promise.resolve();
  /* By src, not by line: handoff and askOrder are the same file. The cards'
     own `vo` paths come along too, so the eleven 2nd-attempt hints need no
     loader of their own — eighteen lines, seventeen downloads.

     THE HINTS ARE PRELOADED FOR THE SAME REASON HER LINES ARE, and it bites
     harder here. A hint is asked for by a child who has just been wrong twice;
     fetching it at that moment puts the silence exactly where the game is
     meant to be helping. They are 3.7-8.0s of 24 kHz mono, 2.68 MB across the
     eleven, and they arrive while the title screen is up. */
  const srcs = new Set(Object.values(VO_SRC).map(line => line.src));
  ROUNDS.forEach(r => r.cards.forEach(c => { if (c.vo) srcs.add(c.vo); }));
  return Promise.all(Array.from(srcs).map(src =>
    /* The recordings are not generated, so these cannot go stale the way the
       cues can — but they are versioned with everything else so that one bump
       is the whole story and nobody has to remember which half is covered. */
    fetch(src + (src.indexOf('?') < 0 ? '?v=' + BUILD : ''))
      .then(res => { if (!res.ok) throw new Error(res.status + ' ' + res.statusText); return res.arrayBuffer(); })
      .then(bytes => ctx.decodeAudioData(bytes))
      .then(buf => voBufs.set(src, buf))
      .catch(err => {
        if (!primeVo.warned) {
          primeVo.warned = true;
          console.info('[aaru] the narrator did not load (' + src + ': ' + err.message +
                       ') — the game plays on without her, on its banner and its ' +
                       'hints. Serve the folder over http (python tools/serve.py) ' +
                       'to hear the voice-over.');
        }
      })));
}

/* --- the recorded samples ---------------------------------------------------

   The instrument and the one-shots the sample-backed voices are made of, cut
   from the raw recordings in assets/_source/sfx/ by tools/cut-sfx-assets.py.
   Every one is CC0; PROVENANCE.json beside them says where each came from.

   THESE ARE NOT CUES AND THEY ARE NOT SHIPPED. loadSamples() is called by the
   render bench and by nothing else — primeSfx() does not touch it — so during a
   real game this map stays empty and the game's download is exactly the set of
   assets/sfx/*.wav it always was. The path is under _source rather
   than beside the cues for the same reason: it is build input, not a deliverable.

   Note names are the note, so the voices below read as music: mb('ab5') is the
   Ab above middle C, and it is the recording of that key on that instrument
   rather than a frequency handed to an oscillator. */
const SAMPLE_DIR = 'assets/_source/sfx/clean/';
const SAMPLE_SRC = {
  /* The music box, one file per key. Ab major, ten notes; the two lowest the
     instrument has are missing on purpose — they measured below the speaker's
     floor. See cut-sfx-assets.py. */
  'mb-c5': 1, 'mb-eb5': 1, 'mb-g5': 1, 'mb-ab5': 1, 'mb-bb5': 1,
  'mb-c6': 1, 'mb-eb6': 1, 'mb-f6': 1, 'mb-g6': 1, 'mb-ab6': 1,

  /* The one-shots. Each is the physical event named. */
  cardslide: 1,   // one card drawn off the deck        -> deal
  cardstack: 1,   // the deck arriving on the tray      -> deckIn
  xylo1:     1,   // toy xylophone Eb: frame 1 arriving  -> haul
  xylo2:     1,   // ...G: frame 2                       -> haul
  xylo3:     1,   // ...Bb: frame 3, and the chord lands -> haul
  landknock: 1,   // the peg the line settles on         -> haul, thud
  swing:     1,   // the line creaking under him        -> swing
  fall:      1,   // air, on the way down               -> fall
  landbody:  1,   // ...and the same impact as a body   -> thud
  topple:    1,   // the box going over                 -> topple
  snap:      1,   // his fingers meeting                -> snap
  magic:     1,   // a bell-tree shimmer               -> formed

  /* THE STORY'S OWN SOUNDS, one per picture in the recap, and the answer to the
     user's judgement on what was there: it "sounds like a machine and had no
     effect on real emotions of kids, as they are our target audience".

     TWO OF THESE ARE THE SAME CHILD. `gasp` and `sad` are cut from one 55s
     recording of one young boy, so Aaru has a voice rather than two library
     reactions - and each was found by MEASUREMENT rather than by scrubbing: of
     the eight voiced runs in that take, `gasp` is the only one whose pitch goes
     UP (286 -> 419Hz, which is what surprise does to a voice) and `sad` is a
     breath falling into a steady low hum. See tools/probe-sfx.py, which is what
     read them, and the notes in cut-sfx-assets.py for the windows. */
  tummy:     1,   // a real stomach                    -> tummy
  sneeze:    1,   // a child sneezing                  -> sneeze
  gasp:      1,   // the boy, surprised                -> gasp
  sad:       1,   // the same boy, weary               -> sad

  /* THE SEPTEMBER 3 PASS, and every one of these is a recording that was
     MEASURED before it was cut - see the block at the foot of ONESHOTS in
     tools/cut-sfx-assets.py, which also names the six fetches that were
     rejected by those measurements so nobody finds them again.

     THE TWO PAIRS ARE DELIBERATE. sad/sad2 and sneeze/sneezebig are both cut and
     both loaded: nothing here can HEAR either of them, and the difference
     between a small boy sounding sad and a small boy sounding like he is
     stretching is not in any band figure. tools/audition-cues.js is what settles
     those two, and the loser is deleted then - see the note over VOICES.sad. */
  swoopslow: 1,   // one slide-whistle glide, 2.95s    -> swing
  sad2:      1,   // the same boy, a voiced vowel      -> sad (candidate)
  inhale:    1,   // his rising breath before it       -> sneeze
  sneezebig: 1,   // a bigger sneeze, unknown age      -> sneeze (candidate)
  mumawe:    1,   // a woman's wordless awe            -> amma
  mumawe2:   1,   // ...her second take of it          -> amma (candidate)
  manjira2:  1,   // one ring of a real manjira        -> amazed, formed
  spill2:    1,   // a harder-fronted spill            -> splash
  sandfall:  1,   // a body arriving in sand           -> crash
  magic:     1,   // a bell-tree shimmer               -> trail, and the finale flash
  zipup:     1,   // a swanee whistle, whole rise      -> trail
  usersteps: 1,   // their own walk, all of it      -> retired with `footsteps`
  sneezebook: 1,  // ...and their own sneeze         -> sneeze
  filmsneeze: 1,  // AARU'S OWN VOICE, from their film -> sneeze
  bookaa:    1,   // their "आ…" off page 3            -> superseded by the film
  /* AND TWO THAT ARE LOADED AND NOT USED, which is deliberate: both are the
     user's own recordings, both were cut and rendered and MEASURED against the
     cue they were meant for, and both lost. bookspill reads as more water than
     the library spill it was meant to shrink; booksigh is a spoken word and sits
     in the octave the tablet cannot radiate. The numbers are in
     tools/cut-sfx-assets.py and each is one word away in its voice. They stay
     loaded so the bench renders them for the audition. */
  bookspill: 1,   // ...their glass of juice going   -> measured, not used
  booksigh:  1,   // ...and his "उफ़" after the fall  -> measured, not used
  bikeride:  1,   // a tyre on a dirt road             -> cycle
  bikebell:  1,   // a real bicycle bell               -> ting
  bikecrash: 1,   // the bicycle going over            -> crash
  boygrunt:  1,   // ...and the boy on it              -> crash
  spill:     1,   // liquid hitting dry ground         -> splash
  dogeat:    1,   // an animal chewing                 -> dogeat
  utclink:   1,   // one piece knocking, in the air    -> clatter
  utclink2:  1,   // ...and a different second one     -> clatter
  utfall:    1,   // six pieces of steel arriving      -> clatter
  glock:     1,   // a glockenspiel, struck and ringing -> amazed
  kidscheer: 1,   // a room of children                -> cheer

  /* THE CELEBRATION'S HAND PERCUSSION. All four CC0, out of the Versilian
     Community Sample Library, and all four chosen on the band measurement rather
     than on the instrument name - see the block beside them in
     cut-sfx-assets.py, which records the nine drum strokes that lost. */
  darba:     1,   // a darbuka rim stroke     -> audition only, see roundDone
  darbb:     1,   // ...and its round-robin twin  -> audition only, retired
  handbell:  1,   // a Nepalese hand bell, 0/99/1      -> roundDone, hops
  manjira:   1,   // finger cymbals, low and textural  -> roundDone
  failnote:  1,   // the supplied wrong-answer sound   -> wrong
  correct:   1,   // ...and the supplied right one     -> correct

  /* ...and the same boy again, on the cue he is heard on MOST: a card that does
     not go in. The recap is twelve pictures seen once; `wrong` fires every time
     a child guesses and misses, so this is the recording of his that gets the
     most play. Chosen by ear from four, see VOICES.wrong. */

  /* CANDIDATES, used by no cue. The audition tools play these against the cue
     they are competing for so it can be chosen by ear instead of guessed at
     again. They are listed here because loadSamples() is the only loader there
     is, and it runs at build time only — so an unused entry costs the child
     nothing and costs a bench run one fetch. Delete each once its cue settles. */
  metallo:   1,   // a struck metallophone figure       -> audition only
  /* `cheer` IS HERE NOW, and it is a retirement rather than a shortlist. It is
     the close-up crowd that `applause` was three overlapping passes of until the
     user called that cue "too much"; the cue is one pass of `handclap` now, and
     this is kept for one cycle only so the two can be played against each other
     in tools/audition-cues.js. Delete the entry, the cut in cut-sfx-assets.py
     and kid-applause.mp3 together once the new one has settled. */
  winchime:  1,   // their own chime, played at rates -> applause (the sting)
  handclap:  1,   // a hundred hands, ~zero voice     -> softclap, the bed
  kidsbed:   1,   // children clapping, soft - had a voice audible once loud enough
                  // -> retired, see softclap in VOICES
  kidsclap:  1,   // ten kids, four claps over 4.6s   -> retired: a slow clap
  smallclap: 1,   // ONE pair of hands, once          -> retired, see applause
  birdjoy:   1,   // three chirps from their own book -> retired, see applause
  uniona:    1,   // ten school kids, one unison clap  -> retired, see applause
  unionb:    1,   // ...the second of three            -> applause accents
  unionc:    1,   // ...and the third                  -> applause accents
  cheer:     1,   // the close-up crowd `applause` was  -> audition only
  /* `glock` WAS HERE AND IS A CUE NOW - it is up in the one-shots, on `amazed`.
     The SAMPLE named `amazed` went out of this map with it: that was वाह, cut
     from the narrator's dialogue 26, and the cue that played it is a chime. The
     cut is deleted from CUTS.json rather than left in it with no user, for the
     reason `puff` records - the recipe was (Narrator Dialogue 26.wav, 0.120,
     0.880) if a voice is ever wanted on this card again. */

  /* THESE TWO OUTLIVED THE SHORTLIST THEY WERE CUT FOR. They were candidates
     for `wrong` - a slide whistle falling and the same whistle rising - back
     when that cue was still being guessed at, and the note here used to end
     "Delete once `wrong` settles". It has settled: the user sent the sound,
     every other candidate is deleted, and tools/audition-wrong.js is gone with
     them. These two stay only because tools/audition-haul.js still plays them,
     which is a different cue's argument. */
  swoopdown: 1,   // a slide whistle falling            -> audition only
  boing:     1,   // the jaw-harp bounce               -> audition only
  swoopup:   1,   // ...the same whistle rising         -> audition only
  railslide: 1,   // the curtain rail `haul` used to be -> audition only
};

/** Fetch and decode the build-time samples. Called by the render bench.

    Resolves even when nothing loaded: a bench run with no samples renders the
    oscillator fallbacks, which is a legitimate thing to want and is exactly
    what the pre-recording cues were. It reports what it got so a bench run
    cannot quietly produce the fallback set and look like a success. */
function loadSamples() {
  const ctx = ensureCtx();
  if (!ctx) return Promise.resolve({ got: 0, missing: Object.keys(SAMPLE_SRC) });
  const missing = [];
  return Promise.all(Object.keys(SAMPLE_SRC).map(name =>
    fetch(SAMPLE_DIR + name + '.wav')
      .then(res => { if (!res.ok) throw new Error(res.status); return res.arrayBuffer(); })
      .then(bytes => ctx.decodeAudioData(bytes))
      .then(buf => sampleBufs.set(name, buf))
      .catch(() => { missing.push(name); })
  )).then(() => {
    if (missing.length) {
      console.warn('[aaru] ' + missing.length + ' of ' + Object.keys(SAMPLE_SRC).length +
                   ' samples did not load (' + missing.join(', ') + '). Those cues will ' +
                   'render from their OSCILLATOR FALLBACKS, which is not what ships. ' +
                   'Run: python tools/cut-sfx-assets.py');
    }
    return { got: sampleBufs.size, missing };
  });
}

/* Where the voice currently being built is routed. A voice that wants to move
   while it plays — the haul, which travels the screen — sets this to its own
   panner for the length of its own construction, and everything it schedules
   goes through it. Voices only schedule, they never wait, so this is only ever
   set for the duration of one synchronous call. */
let voiceBus = null;

function withBus(node, build) {
  const prev = voiceBus;
  voiceBus = node;
  try { build(); } finally { voiceBus = prev; }
}

/** The node a single sound should connect to, placed across the stereo field
    if it is asked for. Frames and cards are at known places on the screen, so
    their sounds can come from there — see panAt(). */
/** NOT ALL THE WAY THROUGH: a pan of 0 SKIPS THE PANNER, and that is worth 3 dB.

    This is a real trap and it cost an afternoon. A StereoPanner obeys the
    equal-power law, so a mono source panned to dead centre comes out at 0.707 in
    each channel — its POWER is preserved and its amplitude in each channel is
    not. A mono source connected straight to a stereo destination, which is what
    the early return below does, is UP-MIXED: 1.0 in each channel. So the same
    sample at the same `peak` is 3.0 dB louder with `pan` left off than with
    `pan: 0.001`.

    It surfaced in `applause`, whose three passes were written with the first
    unpanned and the other two nudged 0.10 apart. Rendered and measured in 50ms
    blocks of RMS, everything after the first pass sat 3 dB down — the same
    recording, the same peak, and a step at the join that read as the crowd
    losing heart. All three unpanned, the body of the cue came back inside 4.3 dB
    with no step at either join.

    SO: WITHIN ONE CUE, PAN ALL OF SOMETHING OR NONE OF IT. Mixing the two is a
    3 dB level change disguised as a placement. Across cues it does not matter —
    the bench re-solves each cue's gain — which is exactly why it can hide.

    Not fixed by always building a panner, because that would re-level every
    unpanned cue in the game by 3 dB and every one of them is calibrated. */
function place(ctx, pan) {
  const dest = voiceBus || masterGain;
  if (!pan || !ctx || !ctx.createStereoPanner) return dest;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(dest);
  return p;
}

/** A stage x as a stereo position, held short of the edges so nothing ends up
    entirely in one ear. */
function panAt(x) {
  return Math.max(-1, Math.min(1, (x / STAGE_W - 0.5) * 1.3));
}

/** One struck note with a percussive envelope. */
function tone(ctx, { at, hz, dur, peak, type = 'sine', pan = 0 }) {
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.02, dur * 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(place(ctx, pan));
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** A filtered noise burst — card flicks, the deck settling, the line running out.

    Two things make the difference between this reading as paper and reading as
    static. First the sweep: `hz` glides to `to` over the burst, so the sound has
    a direction, which is what a card sliding across another actually sounds
    like. A fixed band is just hiss. Second the Q: broad filters (below about 1)
    pass most of the spectrum and the ear hears white noise, so these stay
    tighter than that, and `hp` clears out the low rumble underneath.

    The envelope ramps from true zero (no click on the way in) and decays with
    setTargetAtTime rather than a ramp to a floor, so it fades out instead of
    stopping. */
function hiss(ctx, { at, dur, peak, hz, to = null, q = 1.4, type = 'bandpass', hp = 0, pan = 0 }) {
  if (!noiseBuf) {
    const n = Math.floor(ctx.sampleRate * 0.5);
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  const filt = ctx.createBiquadFilter();
  const g = ctx.createGain();

  src.buffer = noiseBuf;
  /* start somewhere random in the buffer, so repeats are not the same grain */
  const offset = Math.random() * Math.max(0, noiseBuf.duration - dur - 0.05);

  filt.type = type;
  filt.Q.value = q;
  filt.frequency.setValueAtTime(hz, at);
  if (to) filt.frequency.exponentialRampToValueAtTime(Math.max(40, to), at + dur);

  const attack = Math.min(0.012, dur * 0.2);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.setTargetAtTime(0, at + attack, Math.max(0.02, dur * 0.3));

  let tail = src.connect(filt);
  if (hp) {
    const cut = ctx.createBiquadFilter();
    cut.type = 'highpass';
    cut.frequency.value = hp;
    tail = tail.connect(cut);
  }
  tail.connect(g).connect(place(ctx, pan));
  src.start(at, offset);
  src.stop(at + dur + 0.25);              // let the tail run out
}

/* C5 E5 G5 B5 C6 E6 — one major set, so everything agrees with everything else */
/* The pitches the game uses, in A flat major — the key the music box is in.
   See the note on the key in the audio section header.

   These are the equal-tempered frequencies, and they are what the OSCILLATOR
   FALLBACKS are tuned to. The recordings were resampled onto these same
   numbers by tools/cut-sfx-assets.py — measured to within 0.1 cent — so the
   fallback and the real thing are in tune with each other and a cue that
   half-loaded would not beat against itself. */
const N = { C5: 523.251, EB5: 622.254, G5: 783.991, AB5: 830.609, BB5: 932.328,
            C6: 1046.502, EB6: 1244.508, F6: 1396.913, G6: 1567.982, AB6: 1661.219,
            EB4: 311.127, AB4: 415.305 };

/* The music box, as note name -> the sample and the pitch that goes with it.
   One table so a voice can say mb('ab5') and get both. */
const MB = {
  c5:  { src: 'mb-c5',  hz: N.C5 },
  eb5: { src: 'mb-eb5', hz: N.EB5 },
  g5:  { src: 'mb-g5',  hz: N.G5 },
  ab5: { src: 'mb-ab5', hz: N.AB5 },
  bb5: { src: 'mb-bb5', hz: N.BB5 },
  c6:  { src: 'mb-c6',  hz: N.C6 },
  eb6: { src: 'mb-eb6', hz: N.EB6 },
  f6:  { src: 'mb-f6',  hz: N.F6 },
  g6:  { src: 'mb-g6',  hz: N.G6 },
  ab6: { src: 'mb-ab6', hz: N.AB6 },
};

/** A struck wooden bar — the xylophone in a Class 2 classroom.

    This is the pitched timbre almost everything now uses, and it replaced a
    bare sine plus its octave for two reasons. It belongs on this screen: the
    tray, the frames and the pegs are all wood, so a wooden note is the sound of
    the thing the child is touching. And it survives a tablet: a marimba bar's
    second mode sits a clean two octaves above its fundamental, so the note
    carries real energy at 4x its pitch and stays audible on a speaker that
    throws most of the fundamental away.

    Three parts, which is all a struck bar is: the mallet hitting it, the bar's
    body, and that 4:1 mode ringing shorter and quieter over the top. */
function wood(c, { at, hz, dur, peak, pan = 0 }) {
  hiss(c, { at, dur: 0.022, peak: peak * 0.5, hz: hz * 5, to: hz * 2.4,
            q: 1.8, hp: hz * 1.5, pan });                        // the mallet
  tone(c, { at, hz, dur, peak, pan });                           // the bar
  tone(c, { at, hz: hz * 4, dur: dur * 0.17, peak: peak * 0.22, pan });  // its 4:1 mode
}

/** One recorded sample, scheduled like a note.

    `dur`, if given, is how long the sample is allowed to ring: it plays at full
    level and only the last SMP_RELEASE of it is faded out, so it reaches silence
    exactly at `dur`. That is what lets one 2.4s recording of a music box key
    serve as a 0.85s placement note and as a 1.75s held chord without a second
    file. WITHOUT `dur` the sample plays to its own end, which is what the
    one-shots want — they were already cut to length by the cutter.

    IT IS A RELEASE, NOT A DECAY, and the difference is the whole point of using
    a recording. The first version of this rode an exponential from full level
    down to -62 dB across the whole of `dur`, which sounds reasonable and is
    wrong: the sample is ALREADY decaying, so the two multiply. Measured, a note
    asked to ring for 0.85s was landing inside the bench's -72 dB trim at 0.56s
    and being cut there — a third of the note gone, and the natural decay of a
    real music box, which is the thing worth having, replaced by an envelope
    generator. Now the recording rings exactly as it was played and only the tail
    is taken off, which is all that was ever needed: a sample cut off mid-ring
    clicks, and a click on a reward cue is the one artefact a child notices every
    time.

    `fade`, `rel` AND `xfade` OVERRIDE THE TWO ENDS, and they exist for one job:
    laying a recording end to end with ITSELF, which is what `applause` used to do
    to get five seconds of crowd out of a 2.15s take. A pass has to arrive while
    the one before it is leaving, and both ends of the join have to be ramps of
    the same length or the seam is a step. The cutter's own edge fades are 1ms in
    and 30ms out — anti-click, not crossfade material — so the shape of a join
    is decided here, at the call site that knows what it is joining.

    `xfade` HAS NO CALLER AS OF THE CLASSROOM CLAP. `applause` is one pass of an
    8.2s take now, so nothing in the game joins a recording to itself any more.
    It is kept rather than deleted because the next cue that has to cover an
    animation longer than its recording will need exactly this, and the
    measurement below is the whole argument for how to do it. `rel` is
    unaffected: nearly every voice in the game uses it.

    `xfade` IS THE SHAPE OF THOSE RAMPS AND IT IS NOT COSMETIC. A linear ramp is
    right for a note leaving, which is why it is the default and why the music box
    keeps it. It is wrong for a join, and measurably so: two UNCORRELATED signals
    sum in power, not in amplitude, so at the midpoint of a linear crossfade the
    pair carries 0.5² + 0.5² = half the power of either one alone. Rendered and
    measured in 50ms blocks of RMS, the first build of `applause` scooped 5.3 dB
    at one join and 8.4 dB at the other — the 3 dB of that arithmetic, plus the
    recording's own quiet patch landing on the same beat.

    So under `xfade` both ramps are quarter-sine instead: sin and cos of the same
    angle, whose SQUARES sum to one at every point in the join. Constant power,
    no scoop, and the only level movement left is the recording's own. */
const SMP_RELEASE = 0.13;      // the fade at the end of a shortened sample
const SMP_CURVE_N = 65;        // points in an equal-power ramp; 65 is smooth at 200ms

/** An equal-power ramp between two gains, as a curve for setValueCurveAtTime.
    `up` gives sin (silence to `peak`), otherwise cos (`peak` to silence). */
function powRamp(peak, up) {
  const a = new Float32Array(SMP_CURVE_N);
  for (let i = 0; i < SMP_CURVE_N; i++) {
    const t = (i / (SMP_CURVE_N - 1)) * (Math.PI / 2);
    a[i] = peak * (up ? Math.sin(t) : Math.cos(t));
  }
  return a;
}

/** One struck note, or one window out of a longer recording.

    `from` IS WHERE IN THE BUFFER TO START, in seconds, and it exists so that a
    voice can re-lay the events inside ONE recording rather than needing them cut
    into one sample each. VOICES.footsteps_RETIRED was the only caller - nothing
    calls it now, and `from` is kept because it is four lines and it is the only
    way this engine can re-lay the events inside one take. The user's walk is
    a single take of seven footfalls, and the cue is three of them at a slower
    cadence, so it plays the same buffer three times from three places. Cutting
    seven samples and normalising each would have levelled the walk flat - the
    relative loudness of one footfall against the next is the walk. */
function smp(c, { at, name, dur = 0, peak = 1, pan = 0, rate = 1,
                  fade = 0, rel = SMP_RELEASE, xfade = false, from = 0 }) {
  const buf = sampleBufs.get(name);
  if (!buf) return false;
  const src = c.createBufferSource();
  src.buffer = buf;
  if (rate !== 1) src.playbackRate.value = rate;
  const g = c.createGain();
  if (fade > 0 && xfade) {
    g.gain.setValueCurveAtTime(powRamp(peak, true), at, fade);
    g.gain.setValueAtTime(peak, at + fade);
  } else if (fade > 0) {
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + fade);
  } else {
    g.gain.setValueAtTime(peak, at);
  }
  const natural = Math.max(0, buf.duration - from) / (rate || 1);
  const shorten = dur && dur < natural;
  if (shorten) {
    /* Never longer than a third of the note: on a short one-shot a 130ms fade
       would be most of the sound, and the release would become the shape. */
    const out = Math.min(rel, dur * 0.34);
    if (xfade) {
      g.gain.setValueCurveAtTime(powRamp(peak, false), at + dur - out, out);
    } else {
      g.gain.setValueAtTime(peak, at + dur - out);
      g.gain.linearRampToValueAtTime(0, at + dur);
    }
  }
  src.connect(g).connect(place(c, pan));
  /* start BEFORE stop, always: a BufferSource throws InvalidStateError if it is
     told when to stop before it has been told when to begin. */
  src.start(at, from);
  src.stop(shorten ? at + dur + 0.02 : at + natural + 0.02);
  return true;
}

/** One music box note — the recording if it is loaded, the synthesised wooden
    bar it replaced if it is not.

    THE FALLBACK IS NOT DECORATION. loadSamples() only runs in the bench, so
    every voice below is written to work either way: with samples it renders the
    music box, which is what ships, and without them it renders the same phrase
    on wood() at the same pitches, which is what the game plays if a cue file
    ever fails to load. The two are in tune with each other by construction —
    both answer to N — so the game degrades in timbre and never in music. */
function mbox(c, { at, note, dur, peak, pan = 0 }) {
  const n = MB[note];
  if (!n) return;
  if (smp(c, { at, name: n.src, dur, peak, pan })) return;
  wood(c, { at, hz: n.hz, dur, peak, pan });
}

/* --- the reward voices ------------------------------------------------------

   Finishing a screen is the moment the whole activity is built around, and for
   a seven-year-old the sound has to earn it. SIX things do that now. The first
   five are the design; the sixth is the instrument.

   It has to RISE. A falling figure reads as a mistake to anyone who has ever
   heard music, which is why `wrong` falls and these climb.

   It has to LAND. The run up the chord is followed by the whole chord held
   together underneath it, so the phrase arrives somewhere instead of just
   stopping at the top note.

   It has to GO PAST where it landed. One quiet note above the chord, a beat
   after it — roundDone's Eb6 at land + 0.15. A cue that
   stops on its arrival is a full stop; children's music always sparkles past
   the destination, and this is the gesture that reads as pleased rather than
   as merely finished.

   It has to KEEP GOING for a moment after that. A cue that ends on the beat is
   a full stop; a scatter of quiet high notes fading out over the top is a
   cheer. That is what `sparkle` is, and it is the part a child will describe as
   the sound being happy.

   And it has to be ABOUT THE CARDS. This is what makes it an "aha" rather than
   a jingle. The child has just spelt out Ab-C-Eb by placing three cards, one
   note each; the run starts on that Ab and lands on that chord, so the cheer is
   the thing they built, finished. Then the three cards physically bounce, in
   turn, 660ms in — and roundDone puts one bright note on each bounce, at each
   card's own place across the stage. The celebration is not playing over the
   picture, it is playing the picture.

   AND IT HAS TO SOUND PLAYED, NOT GENERATED. This is the sixth, and it is the
   one that was missing. The phrase above was right and still sounded synthetic,
   for four reasons that are worth naming because they generalise: the notes
   were two sines at an exact 1:4 ratio (real struck bars have inharmonic
   partials, each decaying at its own rate); they sat on a perfectly even
   millisecond grid; they were all struck at exactly the same velocity; and no
   additive stack has the sympathetic ring of the other bars once one is hit,
   which is what makes a held chord read as one body of sound rather than three
   notes stacked. The instrument is a recording now, and the grid and the
   velocities are shaped — see roundDone.

   THERE WAS A SECOND VOICE ON THIS PHRASE, `allDone` — the same figure carried
   further, longer run, the chord an octave wider, twice the sparkle and one last
   note to close it — so that finishing the LAST screen read as more of what
   finishing a screen already was. It is gone at the user's request, and the
   ending now belongs to the recordings around it: the thud, the snap, and a hall
   of children. roundDone is the only music box celebration left, which is what
   the rest of this note is about.
   --------------------------------------------------------------------------- */

/* THERE WAS A bell() HERE, and it is gone rather than left unused. It was a
   sine plus a quiet octave above it, and its reason for existing was that "this
   is what the confetti is made of, and glass is the right material for
   confetti". Both halves of that stopped being true at once: the confetti is
   the music box's own top octave now, and the glint on step3 is a real Ab6, so
   there is nothing left in the game that wants a synthesised bell. Every caller
   went to mbox(). Bringing it back is six lines if a use ever appears — but a
   second pitched timbre is exactly what the palette rule in the section header
   argues against, so the use would need making rather than assuming. */

/** Quiet high notes scattered over `spread` seconds, drifting across the field.
    Confetti: never twice the same, never loud enough to be a melody of its
    own, and always still falling when the chord under it has settled.

    It is the music box's own top octave, so the confetti is the same instrument
    as the phrase it falls over — the glint off the thing that just played,
    rather than a second instrument arriving to comment on it.

    TWO THINGS ABOUT IT ARE NOT RANDOM, and they are what separate confetti from
    a scatter of blips. The pitch TRENDS UPWARD as the tail thins: a hand
    running up a bell tree is going somewhere, and picking uniformly from the
    set instead reads as a random-number generator, which is what this used to
    do. And the pan DRIFTS rather than alternating: strict left-right-left is
    the most obviously mechanical thing a stereo cue can do, and it was the
    other half of why this read as generated. Each note lands near the last one,
    with the whole scatter walking one way across the stage. */
function sparkle(c, { at, spread, n, peak }) {
  const set  = ['bb5', 'c6', 'eb6', 'f6', 'g6', 'ab6'];
  const side = Math.random() < 0.5 ? -1 : 1;      // which way this take walks
  let panAcc = side * (0.15 + Math.random() * 0.2);
  for (let i = 0; i < n; i++) {
    const f = (i + Math.random() * 0.6) / n;
    /* Upward through the set as the tail goes on, but not in lockstep: the
       window slides and the pick inside it is loose, so the trend is audible
       and the order still never repeats. */
    const lo = Math.min(set.length - 1, Math.floor(f * (set.length - 1)));
    const hi = Math.min(set.length - 1, lo + 1);
    panAcc = Math.max(-0.75, Math.min(0.75,
             panAcc - side * (0.10 + Math.random() * 0.14)));
    mbox(c, {
      at:   at + spread * f,
      note: Math.random() < 0.5 ? set[lo] : set[hi],
      dur:  0.34 + Math.random() * 0.2,
      peak: peak * (1 - f * 0.55),
      pan:  panAcc,
    });
  }
}

/* When each of the three cards bounces after a screen is finished, in seconds
   from the cue starting. Derived from the timers in roundCheer() rather than
   written down twice, because the whole point of these is that they land on the
   frame the card moves - and that is also why the cue and the bounces are fired
   from ONE function: they were separable once, and moving the celebration onto
   Aaru's entrance would have slid the notes off the cards if they had stayed
   apart. */
const CHEER_HITS = [0, 1, 2].map(i => (CHEER_DELAY_MS + i * CHEER_STEP_MS) / 1000);

/* WHEN AARU'S FEET COME BACK DOWN, in seconds from the moment the celebration
   starts - which is also the moment correct_ans.webm starts, since finishRound
   fires roundCheer() and playCelebration() on the same tick.

   MEASURED OFF THE CLIP ITSELF, not guessed. Every frame of correct_ans.webm was
   decoded to RGBA and the bounding box of its alpha channel taken, which gives
   the silhouette's lowest row per frame - his feet. The clip is 36 frames at
   7.5fps and his feet rest at row 776-783; they leave the ground four times:

       hop   apex frame   feet up   lands
       1     9  (1.200s)   44 px    frame 11  = 1.467s
       2     16-18        62 px     frame 21  = 2.800s
       3     24 (3.200s)  59 px     frame 27  = 3.600s
       4     29 (3.867s)  47 px     frame 31  = 4.133s

   NOTHING MARKED ANY OF THEM BEFORE. The user asked for "clapping and jumping",
   and the jumping was already on the screen with no sound on it at all - a boy
   hopping four times under a flat wall of applause. These four numbers are what
   VOICES.hops exists to land on.

   RE-MEASURE IF THE CLIP IS RE-RENDERED. tools/dekey-video.py is what makes it,
   and a change of TARGET_SECONDS or a re-cut moves every one of these. */
const AARU_LANDS = [1.467, 2.800, 3.600, 4.133];

/* WHEN HIS HANDS MEET, in seconds from the same instant - and this had never
   been measured. AARU_LANDS above is his FEET; five passes at the celebration cue
   synced to the cards, then to nothing at all, and the user's verdict on the last
   one was "i need the childrens clapping sfx metting with aaru movemnet also".
   The clip is called correct_ans and he claps in it; nobody had looked.

   MEASURED THE SAME WAY THE FEET WERE, and validated against them: every frame of
   correct_ans.webm decoded to RGBA, and for each row the width of the alpha
   silhouette. Rows 271-282 are the ones whose width MOVES - his hands and
   forearms - and there his span runs 75px (hands together) to 277px (arms wide).
   The method reproduces the feet note exactly on the same frames (rest 776-783,
   hops at 9 / 16-18 / 24 / 29), which is what makes the arm numbers trustworthy.

       frame   t        span     what
       8       1.067s    86px    hands together
       19      2.533s    75px    together, the hardest contact in the clip
       26      3.467s    89px    together
       29      3.867s    83px    together

   THEY ARE NOT HIS LANDINGS. His hands meet 0.27-0.40s BEFORE each foot lands,
   which is what a real clap-and-hop looks like: he claps at the top and comes
   down after. Firing claps on AARU_LANDS would have been 0.3s late every time -
   close enough to feel like sloppy sync rather than a different event.

   AND THE OTHER CLAP CLIP HAS NO CONTACT AT ALL. The note under CONF_BURSTS
   records aaru-clap.webm - the post-game clap - as "arm span across all of them
   only moves between 204 and 227px, so there is no frame where his hands meet
   hard enough to fire on", and asks for a re-measure if it is ever re-cut. That
   is still true of THAT clip and is not true of this one. */
const AARU_CLAPS = [1.067, 2.533, 3.467, 3.867];

const VOICES = {
  /* The play button. A pop is a pitch BEND, not a note: the ear hears the
     glide, and a fixed pitch this short is only a blip — so this one cannot be
     built out of tone(), which holds its pitch for the whole envelope. The
     shape is a bubble bursting. Up an octave and a half in 55ms, gone in 130.

     Four parts, in the order the ear assembles them: a noise tick for the
     finger arriving, the bend for the pop itself, and then two wooden notes
     climbing a fourth. The two notes are the addition, and they are what turns
     a pop into a start: a pop alone is an acknowledgement, G5 up to C6 is "here
     we go". It is the same rising fourth `hint` uses to say "your turn", which
     is not an accident — one is the game inviting, the other is the game
     asking.

     It is the first sound in the game and among the loudest of the set on
     purpose — it is also the moment the audio context opens, so it doubles as
     proof to the child that this thing makes sounds at all. */
  pop: (c, t) => {
    hiss(c, { at: t, dur: 0.05, peak: 0.055, hz: 3200, to: 900, q: 1.6, hp: 600 });
    const osc = c.createOscillator();
    const g   = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(330, t);
    osc.frequency.exponentialRampToValueAtTime(1180, t + 0.055);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.26, t + 0.009);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    osc.connect(g).connect(place(c, 0));
    osc.start(t);
    osc.stop(t + 0.16);
    /* DELIBERATELY SHORT NOTES, and the reason is a measurement rather than a
       taste. Let these ring their natural length and the cue's active window
       stretches to 0.78s, most of it a quiet music box tail; the loudness
       target is a MEAN over that window, so a long quiet tail drags the mean
       down and the calibrator answers by pushing the gain up — onto the pitch
       bend, which is the loudest thing in here. Measured, that took the file to
       -0.0 dBFS, a hair off clipping, for a cue that is not even sustained.
       Cut to a third of a second each, the mean sits where it should and the
       transient comes back down. "Here we go" is two quick notes, not a chord. */
    mbox(c, { at: t + 0.055, note: 'eb5', dur: 0.30, peak: 0.10 });
    mbox(c, { at: t + 0.155, note: 'ab5', dur: 0.46, peak: 0.085 });
  },

  /* The deck landing on the tray. THREE card-edge taps, closer together than
     the eye could separate them but not quite fused, and then the stack
     settling into the wood. Three because there are three cards: a child of
     seven counting the pictures should hear the same count they can see, and
     the deck holding still for the best part of a second (DECK_STILL_MS) is
     exactly the beat in which they do that.

     AND NOBODY HEARS ANY OF IT. `deckIn` is in SFX_MUTED, so sfx() returns
     before both the file and this fallback - the arrival is silent in the
     shipped game and has been for a long time. The paragraph above is a render
     note for a cue that does not play, kept because the reasoning is sound and
     the cue is one line from coming back. Do not cite it as evidence that a
     child can COUNT the deck; that argument now rests on the hold alone.

     The taps sweep downward, which is what gives a tap its "knock" — a flat
     band just sounds like a puff of air — and they get lower and softer as the
     stack squares itself up.

     There is still no low oscillator under the attack; that only ever muddied
     it. The wooden body of the tray is a filtered noise knock instead, and it
     arrives after the last transient rather than under the first, so the taps
     stay sharp and the tray still sounds like a box. */
  deckIn: (c, t) => {
    /* Real cards, handled. This is the cue that was muted "until it sounds like
       the thing it is made of", and a recording of a deck being squared up is
       that thing — the count of edges the child can see is in the recording
       rather than approximated by three noise bursts on a grid. */
    if (smp(c, { at: t, name: 'cardstack', peak: 0.72 })) return;
    [0, 0.075, 0.15].forEach((d, i) =>
      hiss(c, { at: t + d, dur: 0.15 - i * 0.02, peak: 0.11 - i * 0.02,
                hz: 2600 - i * 400, to: 260, q: 1.9, hp: 150 }));
    hiss(c, { at: t + 0.175, dur: 0.14, peak: 0.075, hz: 900, to: 380, q: 1.6, hp: 260 });
  },

  /* One card drawn off the deck. The span and the Q of the top layer are
     measured, not guessed, and are unchanged: at Q~0.5 with no sweep the band
     is so broad that the ear just hears white noise, which is why this used to
     sound like static. Q 2 focuses it enough that the 6kHz-to-700Hz glide is
     heard as the card actually moving, while staying noise rather than turning
     into a whistle the way Q 4+ does. High-passed at 500Hz so it stays papery
     with no rumble underneath.

     Two layers were added under that, and both are for the speaker rather than
     the design: a broader middle sweep, because a cue living entirely above
     3kHz is thin on a tablet and this one fires a dozen times a game, and a
     short flick at the end where the card clears the stack, so it reads as a
     card that has GONE rather than a swish that stopped. */
  deal: (c, t) => {
    /* Real paper, sliding. The three measured noise layers below were the best
       a filter bank could do at sounding like a card leaving a stack, and the
       long note under this voice explains what each of them was compensating
       for; a recording needs none of it, because a card moving across another
       card is what was recorded. */
    if (smp(c, { at: t, name: 'cardslide', peak: 0.80 })) return;
    hiss(c, { at: t,         dur: 0.17, peak: 0.085, hz: 6000, to: 700, q: 2.0, hp: 500 });
    hiss(c, { at: t + 0.012, dur: 0.16, peak: 0.050, hz: 3000, to: 900, q: 1.6, hp: 450 });
    hiss(c, { at: t + 0.155, dur: 0.06, peak: 0.045, hz: 1800, to: 620, q: 1.7, hp: 400 });
  },

  /* Picking a card up — a light paper lift. This fires on every single touch,
     so it is a tick and not a note: a musical blip repeated all game grates,
     and it is the quietest thing in the set for the same reason.

     It sweeps UP. That is the one real change: it used to glide 4200 down to
     1200, the same direction as the deck landing, and a downward sweep is the
     sound of something being put down. The gesture here is a card being lifted
     off the tray, so the band rises with it, and the second layer is the far
     corner leaving the wood a moment later. Nothing else in the set moves
     upward, which is what makes a lift instantly readable as a lift. */
  pickup: (c, t) => {
    hiss(c, { at: t,         dur: 0.10, peak: 0.075, hz: 1200, to: 4600, q: 2.0, hp: 700 });
    hiss(c, { at: t + 0.055, dur: 0.05, peak: 0.030, hz: 5200, to: 3200, q: 2.2, hp: 1500 });
  },

  /* A card landing in a frame. `correct` is the supplied mp3, so this voice is
     only the fallback for when that file cannot be loaded — and it is written
     to stand in for it rather than to be the old two-note lift, which is now
     what step1/2/3 do properly. Paper meeting the frame, then the frame taking
     the weight. */
  /* THE CARD GOING IN, AND IT IS THE USER'S OWN CHIME NOW.

     "for correct answer use this remove and delete others". Four notes rising -
     G7, C6, E6, C7 - over 0.43s and then a decay, band 0/95/5. What it replaces
     was a library card-drop: a sound that told a child the card MOVED, where
     this one tells them they were right, which is the difference between a
     mechanism and a reward.

     IT IS CUT, NOT SUPPLIED, and that is forced rather than chosen: the file
     opens on 0.35s of digital silence, so used as sent the cue would arrive a
     third of a second after the card lands. On a placement that is not a late
     sound, it is a different event. See `correct` in cut-sfx-assets.py for the
     trim and for why 4.91s had to come down to 1.1s.

     THE TWO HISSES ARE THE FALLBACK, unchanged, and only that: a short bright
     one and a softer one under it, which is a card being set down. They run when
     the samples are not loaded, which for a child is never. They are no longer a
     description of the cue - nothing about a rising chime is a paper sound - so
     read them as a stand-in for a path nobody reaches. */
  correct: (c, t) => {
    if (!smp(c, { at: t, name: 'correct', peak: 0.50 })) {
      hiss(c, { at: t,        dur: 0.09, peak: 0.10, hz: 3400, to: 700, q: 1.8, hp: 320 });
      hiss(c, { at: t + 0.04, dur: 0.16, peak: 0.06, hz: 820,  to: 340, q: 1.5, hp: 240 });
    }
  },

  /* The three cards of a round, as three notes of one rising chord.

     This is the cue the whole reward structure hangs off, and it is the one
     genuinely new idea in the set. A card-drop sound tells a child the card
     moved. It does not tell them they are getting somewhere, and "am I getting
     somewhere" is the entire question a seven-year-old is asking. So the first
     card lands on Ab, the second on C, the third on Eb, and by the time the
     screen is complete the child has spelt out the chord that roundDone then
     takes off from. Three placements, one triad, and the finish is audibly the
     completion of it rather than a new noise arriving.

     ONE MUSIC BOX KEY PER CARD, and it matters that these moved to the
     recording at the same time as the reward did. A real reward flourish over
     three synthesised step notes would be worse than all-synthetic, because the
     "this is the thing you built" link is carried by TIMBRE as much as by
     pitch: if the notes the child places are not the instrument that then plays
     the chord, the finish stops being a completion and goes back to being an
     announcement. The four cues are one instrument or the idea does not work.

     They ride on top of the card-drop mp3 rather than replacing it (see
     playPlaced) — the mp3 is what the card physically DID, these are what it
     MEANT — and they are mixed under it, a few dB down, so the physical event
     still leads. The third gets a quiet note over it: the chord is complete,
     and something should glint.

     Slots always fill left to right (activeSlot() is the first empty one), so
     the climb cannot come out of order. Delete the three entries from SFX_SRC
     and the two lines in playPlaced() to go back to the card-drop alone. */
  step1: (c, t) => mbox(c, { at: t, note: 'ab5', dur: 0.85, peak: 0.10 }),
  step2: (c, t) => mbox(c, { at: t, note: 'c6',  dur: 0.85, peak: 0.10 }),
  step3: (c, t) => {
    mbox(c, { at: t, note: 'eb6', dur: 0.95, peak: 0.105 });
    /* The chord is complete, and something should glint. Ab6 — which is the
       OCTAVE of the note the first card rang, so the third placement quietly
       closes the octave the first one opened. It adds brightness and no new
       harmony: the triad has already been said, and this is the frame round it. */
    mbox(c, { at: t + 0.03, note: 'ab6', dur: 0.40, peak: 0.028 });
  },

  /* A card that does not go in. Deliberately warm and low-energy: this fires on
     a child's mistake, in an activity that is ASKING them to guess, so it has
     to read as "not that one" and never as a buzzer. That intent is unchanged
     and it is the most important thing about this cue.

     Two things did change. It now starts with the card not sticking — a soft
     paper bump with no bite on the front — so the first thing the child hears
     is the physical event they can see, the card refusing the frame and coming
     back. Feedback about the card is easier to take than feedback about you.

     And it moved up an octave. It used to fall E4 to B3, 330Hz to 247Hz, which
     is the warmest possible answer on a monitor and inaudible on a tablet: a
     small speaker throws away almost everything below 500Hz, so the one cue
     that most needed to be gentle was the one most likely to be silent. It
     falls G5 to Eb5 now — still a falling major third, still soft triangles,
     still the same shape — in the register the device can actually reproduce,
     and in the key the rest of the game moved to.

     IT IS NOT THE MUSIC BOX AND MUST NOT BECOME IT. Every reward in the game is
     the music box, so the music box is the sound of being right; answering a
     wrong guess in the same timbre would make the instrument ambiguous. That
     ruled out the reward instrument and it still does — but for a long time it
     was also read as ruling out any recording at all, which is why this stayed
     the last often-heard cue in the game with nothing real in it.

     AND THAT IS WHAT CHANGED. The ask: "replace the sound of wrong selected
     answer to something more noticing by a child emotion". The falling third
     was audible and anonymous — it is a tone, and a tone is not an emotion. So
     the falling third is now a BOY, and specifically the boy who already plays
     Aaru in the recap: `gasp` and `sad` are cut from boy-voice.mp3 and this from
     its session partner boy-grunt.mp3, same performer, so the game still has one
     child in it rather than two actors.

     "MORE NOTICING" IS NOT "LOUDER", and nothing here moved a level. This sits
     on exactly the same target it always did (SFX_PLAN.wrong, -2.0). What
     changed is that a voice is recognised at a level a tone is not — a child
     hears a person, and this cue's whole job is to be understood rather than
     obeyed.

     WHY THIS TAKE, out of the twenty-six voiced events in the boy's two files:
     72% voiced, pitch falling 421 -> 241Hz, 71% of its energy in the 500Hz-5kHz
     band a tablet reproduces, and a complete attack-decay envelope ending at
     true zero. FALLING is the load-bearing one. Rising pitch is what alarm does
     to a voice — `gasp` is the only riser in the whole recording and is spent on
     the empty pot on purpose — so a riser here would make being wrong
     frightening, which is the specific way this game has got a human cue wrong
     before (see the card-10 history in tools/cut-sfx-assets.py).

     THE PAPER BUMP STILL LEADS, on the same three numbers it always had, and the
     reason is unchanged: the first thing the child hears is the physical event
     they can SEE, the card refusing the frame and coming back. Feedback about
     the card is easier to take than feedback about you. The voice is 60ms behind
     it, which is far enough back that the bump stays legible as its own event
     instead of the two transients summing into one thicker one.

     0.09 IS THE LOAD-BEARING NUMBER AND IT IS NOT A TASTE SETTING. A cut sample
     is peak-normalised to -1 dBFS by the cutter; `hiss` is bandpassed noise at a
     gain of 0.055. Those two are not on the same scale and nothing warns you.
     0.09 is the value that leaves this cue's ARCHITECTURE where it already was:
     measured dry, the old cue's tones sat 11.9 dB above its bump, and the boy
     sits 12.0 dB above the same bump. So what changed is the timbre of the thing
     answering the card, and not the shape of the cue or the bump's job in it.

     IT WAS SOLVED, NOT PICKED, because guessing it went wrong twice in opposite
     directions — first 0.62, which measures out as the bump 27 dB under and is
     the bump deleted; then an over-correction to 0.031, which put the bump only
     5 dB down and made a paper knock compete with a voice. The sweep that
     settled it lived in tools/audition-wrong.js, which is deleted along with the
     rest of that cue's shortlist - the number it produced is the one below.

     AND BOTH OF THOSE ERRORS CAME FROM THE SAME BAD MEASUREMENT, which is the
     part worth keeping. The bump and the body have to be read in separate
     windows, and the window is NOT the same for the two shapes: the old cue's
     first tone starts 30ms in, this one's voice starts 60ms in. A single "first
     55ms" split therefore measures the bump on one cue and the bump PLUS the
     tone on the other — which reported a bump sitting 12 dB DOWN as sitting 1 dB
     UP, and sent the correction the wrong way. Read 0-58ms against 60ms+ here,
     0-28ms against 30ms+ for the old shape.

     RE-SOLVE IT IF THE SAMPLE EVER CHANGES. Every cut in clean/ is normalised to
     the same -1 dBFS peak, but their crest factors are nothing alike, so a swap
     to `nope2` or `hmm` at this same 0.09 will not land on the same balance.

     IT WAS CHOSEN BY EAR AND NOT BY THIS COMMENT. Every number above was true
     of two cues that shipped WRONG here — an ingressive gasp that came out
     frightening, and an English "wow" in a Hindi game — because no acoustic
     measurement can hear emotion or language. `wrong` then proved it seven more
     times; see VOICES.wrong for that list. Its audition is deleted now that the
     user has supplied the sound, and tools/build-picker.js is still the way to
     put candidates for ANY cue in front of an ear rather than a meter.

     THE FALLING THIRD IS STILL HERE, as the fallback, and only as that. It runs
     when the sample is not loaded — which for the child is never, because the
     bench bakes this into wrong.wav at build time, and for a bench run with no
     samples is the difference between a cue and silence. */
  wrong: (c, t) => {
    /* THE SOUND OF A CARD THAT DOES NOT GO IN, AND THE EIGHTH VERSION OF IT.

       IT WAS SENT BY THE USER: "use this for wrong answer remove and delete
       others", and then "can we have just 2 notes of this sfx not 3".
       mixkit-wrong-answer-fail-notification-946 is a CHROMATIC DESCENT - traced
       every 40ms it steps B, A#, A, G#, G, one about every 120ms, and then
       holds on G for 1.4s. Five steps, heard as three, because they are too
       close together to count.

       AND IT IS THE WHOLE FILE, after three rounds of trying to shorten it.
       "just 2 notes not 3", then "remove the 1st note", then "make sure the cut
       is very smooth" - and then "the wrong answer audio sound horrific now".

       WHY SHORTENING IT COULD NOT WORK. The file is one GESTURE, not a stack of
       notes: a chromatic fall, B A# A G# G, about 120ms a step, landing on G and
       ringing 1.4s. The only instant in it with silence in front is the start;
       every later note is struck while its predecessors are still sounding. So
       every attempt at "fewer notes" began 0.35s or 0.48s in - in the middle of
       a ringing note - and faded that in to hide the join. The join was hidden.
       What replaced it was a 24ms swell into a lone low G, which is an attack no
       struck instrument makes, and it sounded exactly as manufactured as it was.

       AND THE MEASUREMENTS PASSED IT, which is the part worth keeping. The cut
       was spectrally within 3% of the source window it came from, crest
       identical, nothing clipped. Every number said it was a faithful piece of
       the file the user chose. It was; it was also the wrong piece, and no meter
       here can see the difference between a note and the middle of one.

       IF FEWER NOTES ARE WANTED AGAIN it is a different recording, not a
       different window into this one.       THE CARD IS NOT IN THIS CUE. `cardslide` led every version through number
       six and was removed when the user picked it out by ear - "a belt smashing
       sound... very annoying and its reoccuring". Measured afterwards: 19 dB of
       crest with 68% of its energy in 2-5kHz, arriving first. The argument for
       it was that the child should first hear the event they can SEE, and it
       was a good argument that lost to the room.

       THE TWO OSCILLATORS ARE STILL HERE, as the fallback and only as that.
       They run when the samples are not loaded, which for a child is never -
       the bench bakes the real thing into wrong.wav at build time. They fall
       G5 to Eb5, which is no longer the shape of the cue at all; they are a
       stand-in for a path nobody reaches, not a description of it. */
    if (!smp(c, { at: t, name: 'failnote', peak: 0.46 })) {
      tone(c, { at: t + 0.03, hz: N.G5,  dur: 0.24, peak: 0.085, type: 'triangle' });
      tone(c, { at: t + 0.15, hz: N.EB5, dur: 0.34, peak: 0.075, type: 'triangle' });
    }
  },

  /* A hint arriving, under the correct card starting to pulse. Two quiet wooden
     notes rising a fourth — the shape of calling someone's name across a room,
     which is exactly the job: look here, without alarm. One bell on its own,
     which is what this was, is an event; two notes going up is a question, and
     a question is what a child who has stopped needs.

     It is the same rising fourth as `pop`, an octave up and much quieter. The
     game says it once to invite and once to ask.

     Hint 2 — the hand coming up to mime the drag, four seconds later — is
     deliberately silent. It is a big, slow, obvious piece of motion and it does
     not need announcing; a second sound at that point stops being help and
     starts being nagging. */
  hint: (c, t) => {
    mbox(c, { at: t,        note: 'eb5', dur: 0.45, peak: 0.055 });
    mbox(c, { at: t + 0.16, note: 'ab5', dur: 0.80, peak: 0.050 });
  },

  /* A screen finished: all three cards in the right three frames. Run, land,
     the three cards bouncing, cheer.

     The run is the Ab-C-Eb the child just placed, carried up to the octave. It
     lands on the chord held underneath. Then, at CHEER_HITS, one bright note
     per card as each one physically bounces — panned to the frame it is
     bouncing in, so the sound is coming from the picture that is moving. Then
     the confetti, still falling as the chord settles.

     IT RUNS A SHADE UNDER TWO SECONDS AND IT NO LONGER HAS TO FIT IN A PAUSE.
     It used to be the whole of ROUND_PAUSE_MS minus the moment the haul needed
     to take over, because it fired on the third card and had to be finished
     before anything moved. It now fires as Aaru walks on (see roundCheer), so
     what it runs across is his 4.8s clip: the run and the landing chord under
     him leaning in from the right, the three card notes as he steps out, and
     the children through the front of his clapping. */
  /* --- the landing ----------------------------------------------------------

     धड़ामा, the one of the gameplay sheet's four onomatopoeia still in the game.
     It fires once, when his feet hit the floor at the end of the finale. The
     other three went with the story recap.

     This is the synthesised fallback; SFX_SRC points at a recording. Built from
     the same palette as everything else — noise and wood — and pitched where a
     tablet speaker can reproduce it (see the 500Hz note at the top of this
     section).
     ------------------------------------------------------------------------ */



  /* धड़ामा — his feet hitting the floor after a 452px fall. TWO RECORDINGS, and
     the pair is the whole idea.

     THE PROBLEM THIS SOLVES. A real recording of a body landing is, measured,
     72% below 500Hz. On a 40mm driver that is three quarters of the sound
     thrown away, and what is left is thin — so "just use a real body landing"
     makes the cue WORSE on the device it ships on, which is why this was a
     wooden gavel rap for as long as it was. But a rap is one event and a boy
     landing is two: the impact, and then a scuff as he settles. A single bright
     knock is audible and does not sound like a body; a single body recording
     sounds like a body and is not audible. Neither one is the answer.

     So `landknock` carries the transient — bright, entirely inside the band the
     speaker reproduces, and it is what makes the cue land at all — and
     `landbody` goes under it at about half its level, high-passed, purely for
     the character its second onset brings. The bench measures and levels the
     two together, as one cue, which is the only way a layered pair can be
     trusted: measuring either alone would say nothing about what is heard.

     IT USED TO BE SUPPLIED and is now rendered like everything else, so
     SFX_SUPPLIED is down to the one file that genuinely must not be re-encoded.
     The old thud.wav was this same gavel, already trimmed and levelled; the raw
     source was re-fetched (assets/_source/sfx/land-knock.mp3) so the cue could
     be rebuilt from its ingredients rather than inherited as a finished file
     nobody could take apart. */
  thud: (c, t) => {
    const knocked = smp(c, { at: t, name: 'landknock', peak: 0.80 });
    /* A shade behind the knock, not under it: the scuff is what happens AFTER
       his feet stop, and 15ms is enough for the ear to hear an order. */
    const bodied  = smp(c, { at: t + 0.015, name: 'landbody', peak: 0.42 });
    if (knocked || bodied) return;
    /* Neither loaded: the synthesised landing this replaced. The weight is
       carried by the transient and by wood()'s marimba second mode an octave
       and a half up, NOT by a low fundamental — a 120Hz thud is silent on the
       speaker this ships on. */
    wood(c, { at: t,        hz: 392, dur: 0.30, peak: 0.075 });
    hiss(c, { at: t,        dur: 0.20, peak: 0.045, hz: 1100, to: 480, q: 0.8, hp: 380 });
    wood(c, { at: t + 0.10, hz: 330, dur: 0.34, peak: 0.038 });
  },


  /* THE CUE THE ACTIVITY IS BUILT AROUND, and the one that was rebuilt. It was
     a synthesised xylophone and it read as synthesised; it is now the music box.

     THE STRUCTURE IS UNCHANGED, deliberately, because the structure was right:
     a run up the chord the child has just spelt, the chord itself held
     underneath it, one bright note per card as each one physically bounces, and
     confetti still falling as the chord settles. Four layers, two of them
     locked to on-screen motion. That is why this is assembled here out of
     single notes and not replaced by one downloaded reward file — a bounced
     stereo stinger cannot put a note on each card at each card's own place on
     the stage, and it would arrive in whatever key its maker played it in
     rather than in the one the child just built.

     WHAT CHANGED, BESIDES THE INSTRUMENT. Three things the old version did that
     made it sound generated rather than played, all of them cheap to fix once
     noticed:

     THE RUN ACCELERATES. It was a rigid 95ms grid for all four notes, and a
     perfectly even grid is the single loudest tell in a synthesised phrase —
     nobody plays like that. The gaps now shorten, 100/92/84ms, so the figure
     leans into its own arrival.

     THE VELOCITIES ARE SHAPED. All four notes used to be struck at exactly the
     same 0.13. A player hits the note they are aiming at hardest and lets the
     middle of the figure pass through lighter, so that is what these do, and
     the fourth note is the loudest of them.

     AND IT GOES PAST THE DESTINATION. One quiet Eb6 lands 150ms after the
     chord, above it, like an afterthought. A cue that stops on its top note is
     a full stop; children's music always sparkles past the arrival, and this is
     the gesture a child would describe as the sound being pleased.

     The three panned hits are the best idea in the cue and are untouched: they
     land at CHEER_HITS, which is derived from finishRound()'s own timers, so
     each note is on the frame its card actually moves — the celebration plays
     the picture rather than playing over it. */
  /* RETIRED, AND KEPT ONLY TO BE HEARD AGAINST WHAT REPLACED IT. Nothing fires
     this and no file is rendered from it - there is no SFX_PLAN row and no
     SFX_SRC entry - but tools/audition-pick.js builds it live out of the cuts,
     which is the one thing it is still good for. The user's instruction, on the
     figure below: "right now it has damru sound... i dont want that, only
     celebrating clapping sfx is enough". See roundCheer.

     Everything under this line is the note as it stood when it played, kept
     because it is the argument the next person will want to have read before
     putting an instrument back on a child's success. */
  roundDone: (c, t) => {
    /* THE SCREEN IS FINISHED, AND AARU COMES ON TO CLAP ABOUT IT.

       IT WAS A MUSIC BOX AND IT IS HAND PERCUSSION NOW. "the celebration sfx
       sounds too american and annoying i want an indian cartoon celebration
       clapping and jumping sfx which is relevent as per this situation when aaru
       comes and celebrate the user kids succes".

       WHAT WAS AMERICAN ABOUT IT WAS NOT VAGUE, which is what made it fixable:
       the cue spelt an A-FLAT MAJOR arpeggio - ab5, c6, eb6, ab6 rising, then
       that triad held underneath - on a music box. A Western instrument playing
       a Western cadence. Every argument in the note this replaces was about
       BALANCE (how much crowd a struck instrument can carry before the limiter
       flattens its transients) and every one of them was correct and none of
       them was the complaint.

       WHAT IT IS NOW. A darbuka rim stroke on the beat he arrives, the same
       stroke on each of the three cards as they bounce, and a hand bell on the
       third - so the figure is hand drum resolving onto a bell rather than an
       arpeggio resolving onto a chord. Finger cymbals sit under it at a tenth of
       the level, which is where the manjira colour comes from without the
       sizzle: even shelved 14 dB from 5kHz that sample is 25% above the band, so
       it is texture here and never an accent.

       ALL FOUR SAMPLES ARE CC0 AND ALL FOUR WERE CHOSEN ON THE BAND. Nine drum
       strokes were measured and only the darbuka RIM stroke has any energy where
       a tablet speaker lives - the bass strokes and every frame drum are 92-100%
       below 500Hz, which is inaudible on the target device. A real dhol was
       searched for first and rejected on licence and on material; see
       cut-sfx-assets.py and PROVENANCE.json for both comparisons.

       THE THREE CARD STROKES ARE STILL ON CHEER_HITS, which is the one structural
       thing that must not drift: those are the frames the three cards physically
       bounce on, derived from finishRound's own timers. Sound and picture are one
       event or the cue is just music over an animation.

       AND HIS JUMPS ARE A SEPARATE CUE. See VOICES.hops - they only exist on the
       screens where he actually walks on, which the last screen is not. */
    smp(c, { at: t, name: 'darba', peak: 0.52, pan: -0.10 });
    smp(c, { at: t, name: 'manjira', dur: 0.42, peak: 0.10, pan: 0.14 });
    smp(c, { at: t + 0.20, name: 'darbb', peak: 0.32, pan: 0.08 });

    CHEER_HITS.forEach((d, i) => {
      smp(c, { at: t + d, name: i === 1 ? 'darbb' : 'darba',
               peak: 0.44 + i * 0.04, pan: (i - 1) * 0.16 });
      smp(c, { at: t + d, name: 'manjira', dur: 0.34, peak: 0.09, pan: (i - 1) * 0.20 });
    });

    /* ...and the bell the third card lands on, which is what the old cue used a
       held triad for: something that rings on after the last stroke, so the
       screen finishing sounds finished rather than merely stopped. */
    smp(c, { at: t + CHEER_HITS[2] + 0.02, name: 'handbell', peak: 0.42, pan: 0.06 });
  },

  /* HIS FOUR JUMPS, AND NOTHING MARKED THEM UNTIL NOW.

     The ask named two things - "clapping and jumping" - and the jumping was
     already on the screen with no sound on it: correct_ans.webm has Aaru leave
     the ground four times, by 44, 62, 59 and 47 pixels, under a flat wall of
     applause that took no notice. AARU_LANDS is where his feet come back down,
     measured frame by frame off the clip's own alpha channel.

     A STROKE ON EACH LANDING, alternating the two round-robin darbuka samples so
     four hits in a row are not one waveform four times, and the hand bell added
     to the second - which is his biggest hop, 62px, and the one worth marking as
     the peak of the celebration rather than as another beat.

     IT IS A SEPARATE CUE BECAUSE IT IS NOT ALWAYS TRUE. roundCheer fires on all
     four screens, but Aaru only walks on for the first three: the last screen
     ends with the box toppling and him arriving on the rope instead, and
     percussion synced to hops nobody is making is worse than silence. See
     roundCheer's `withAaru`. */
  /* THE TIMES ARE RELATIVE TO THE FIRST LANDING, NOT TO THE CELEBRATION, and
     that is forced by the bench rather than chosen. render-cues.js trims each
     rendered cue to its active window - so a voice that lays its first stroke
     1.467s in produces a FILE whose first sample is that stroke, and playing it
     at delay 0 would put every landing 1.5s early. The offset moves to the call
     site instead: roundCheer fires this at AARU_LANDS[0]. Keep the two together
     if either moves. */
  /* RETIRED WITH roundDone, and for the same reason - it is more of the same
     drum. Unfired, unrendered, still buildable in audition-pick. */
  hops: (c, t) => {
    AARU_LANDS.forEach((d, i) => {
      const at = t + d - AARU_LANDS[0];
      smp(c, { at, name: i % 2 ? 'darbb' : 'darba',
               peak: 0.40, pan: (i % 2 ? 1 : -1) * 0.14 });
      if (i === 1) smp(c, { at, name: 'handbell', dur: 0.70, peak: 0.24, pan: 0.10 });
    });
  },

  /* THE CLASS, CLAPPING, for as long as Aaru is on the screen - which is the
     whole of what this cue is for and the whole of why it is 5.2s long.

     IT IS ONE PASS OF ONE RECORDING, and that is the repair rather than a
     detail. What was here was 2.15s of a close-up crowd laid end to end three
     times behind 200ms equal-power crossfades, and the user's verdict on it was
     "too much". Both halves of that are measurable, off the cut samples:

                           crest   2-5kHz   envelope across the 5.2s
         the old crowd      2.8dB    38%    flat: within 2 dB start to end
         this class        17.2dB     4%    swells, peaks, settles

     A 2.8 dB crest is a wall. The recording arrived already squashed flat, so no
     pair of hands ever separates out of it - there is no transient in it to
     enjoy and the only thing it can do is be loud. 38% of its energy sits in
     2-5kHz, where a tablet speaker is loudest and where a child's ear tires
     first. Three identical passes of that, four times a game, is the complaint,
     and no level would have fixed it: the cue was not too loud, it was too much
     the same for too long.

     WHAT REPLACES IT IS A CLASSROOM AND IT HAS A SHAPE. 8.2s of continuous
     clapping in the take, so 5.6s comes out in one pass - no joins, no crossfade
     arithmetic, and nothing that can read as a repeat. What is left is the
     recording's own arc: a few children start, the room joins in, and it eases
     off without stopping. 93% of it is in 500Hz-2kHz, which is round rather than
     bright and entirely inside what the speaker can do. The window note in
     cut-sfx-assets.py has the numbers that picked it.

     WHICH ALSO SETTLES THE TAIL, and the user's note on that beat was explicit:
     it "should not stop after aaru has left". He goes at 4.61s from this cue's
     own zero, where the recording is still around half its peak; `dur` runs it to
     5.20 and smp()'s 0.55 release takes it out from there. The old cue bought the
     same effect by fading its third pass early, which is a fade doing the work a
     room should be doing.

     THE DELAY IS AT THE CALL SITE, and it is the placement this crowd has always
     had: 0.471s, which is where roundDone's landing chord is struck plus 100ms.
     A crowd is broadband, and broadband over a pitched phrase masks its partials
     on a small speaker - the reason the old recording was cut out of the finale
     once already. By 0.471 the flourish has finished ascending and what is
     sounding is a held chord, which is a sustain with no melody left to bury.

     A CLASS, NOT THE ROOM. The hall of three hundred is `cheer` and it ends the
     game. Using the hall here would make every round the finale and leave the
     finale nowhere to go. Four screens get the classroom; the ending gets the
     hall.

     NOT PANNED, which was load-bearing when this was three passes - see the note
     on place(), where mixing panned and unpanned passes inside one cue put a 3 dB
     step at a join. With one pass there is nothing left to be inconsistent with,
     and no reason to move a room off centre.

     If the clip is ever re-rendered at a different length, 4.61 is the number to
     re-check: `node tools/sim.js play --video` prints both.

     There is no fallback and there should not be: a crowd is the one thing in
     this set that cannot be synthesised into anything but noise. */
  /* THE CLASS CLAPPING, AND IT USED TO BE THE OTHER HALF OF "annoying".

     5.20s WITH A 0.55s RELEASE IS A WALL. Measured on the shipped file, the old
     cue held a flat -13 to -22 dB for its whole length and then stopped: four
     times a session, over a boy who is on screen for 4.8s, a crowd that never
     thins. A room of children clapping does not do that - it peaks when the
     thing happens and falls away while people keep going.

     3.60 WITH A 1.40 RELEASE IS THAT SHAPE. smp caps the release at a third of
     the length, so what actually runs is 1.22s of fade ending at 3.60 - the
     claps arrive under the drum figure, carry his first two jumps, and are
     already thinning by the third. He is still on screen when they finish, which
     is the point: the celebration should end before he does, not stop with him.

     THE RECORDING DID CHANGE, TWICE, AND THE SECOND TIME IT STOPPED BEING
     CHILDREN. It was a class of children in a room, chosen over two other crowds
     on crest and on band; then a different window of that same take, when the
     first one turned out to open inside the children shouting; and now a hundred
     pairs of hands in a church, because the instruction after that was "no human
     voice should come in this celebratory sfx" and a room of children always has
     some. `handclap` measures ZERO tonal frames. The children are still here -
     they are the three unison accents on the cards, and there are no voices in
     those either. See cut-sfx-assets.py for the whole search. */
  applause: (c, t) => {
    /* THE WHOLE OF HIS APPEARANCE IS SCORED NOW, AND THE SOUND LEAVES WITH HIM.
       The 1.51s sting fired at the third placement and was finished before Aaru
       had even reached the middle - the user heard the gap: "i hear no sound now,
       basically this happy indian cartoonish sound should star after all 3 frame
       are fit perfectly and then aaru comes from side and clap and then when he
       goes this sfx sound will also go with him."

       THE SHAPE, over his measured 4.8s:

         t=0            the rising sting - do... mi... sol on their own chime,
                        the moment the third frame sits (this cue fires on it)
         1.067  2.533   a chime note ON each of his four claps, and the notes
         3.467  3.867   CLIMB - rates 1.0, 1.122, 1.26, 1.498, so his claps walk
                        do-re-mi-sol up the same scale the sting announced
         ~4.9           the last note's ring dies as he walks off - nothing is
                        cut, the sound simply goes with him

       HIS CLAPS ARE AARU_CLAPS - hands-together frames measured off the clip,
       0.3s before each landing - so the notes land ON the gesture. This is the
       "metting with aaru movemnet" ask answered in the game's own voice instead
       of with a crowd.

       AND THE INDIAN COLOUR IS THE MANJIRA, a real finger-cymbal already in the
       set, one soft tap with each clap note at a tenth of its level - colour,
       never an accent. It is the instrument `amazed` already uses; what got
       rejected as "damru" was the darbuka DRUM, which stays gone.

       EVERYTHING PITCHED IS THE USER'S OWN CHIME AT A RATE, so the cue stays in
       the flatness band of the cues they praised (0.000-0.013) rather than the
       0.18+ of every rejected crowd. */
    /* THE CLAPPING IS ITS OWN CUE NOW - see `softclap` below - and not a layer
       inside this one. It was here at first, at whatever peak this smp() call
       would take: 0.12 was silent, and pushing it to 0.90 barely moved it,
       because this cue is rendered as ONE dry buffer and solve() measures a
       K-weighted MEAN over the whole active window. A continuous texture's own
       average energy dominates that mean far more than a sparse transient's
       peak does, so past a point, raising the clapping's `peak` just made
       solve() pull the SHARED gain down to hold the same target LUFS - the
       clapping and the chime are coupled, and the coupling has a ceiling. Two
       cues, two solves, breaks the coupling; see roundCheer for the call site
       that now fires both. */
    smp(c, { at: t,        name: 'winchime', rate: 1.26,  peak: 0.72 });
    smp(c, { at: t + 0.32, name: 'winchime', rate: 1.498, peak: 0.82 });
    const CLAP_NOTE = [1.0, 1.122, 1.26, 1.498];
    AARU_CLAPS.forEach((d, i) => {
      smp(c, { at: t + d, name: 'winchime', rate: CLAP_NOTE[i],
               peak: 0.34, dur: 1.05, rel: 0.35 });
      smp(c, { at: t + d, name: 'manjira', dur: 0.40, peak: 0.11,
               pan: (i % 2 ? 1 : -1) * 0.10 });
    });
  },

  /* THE SOFT CLAPPING BED, INDEPENDENT OF THE CHIME. Split out of `applause` so
     it gets its own solve() rather than sharing one - see the note in
     VOICES.applause for why sharing it made the clapping unraisable.

     IT WAS `kidsbed` AND IT ISN'T ANY MORE. That sample - 7.350+4.60 of
     kids-clap-group - measured against every gate this cue had ever been
     rejected on: 4.6 claps/sec so it did not read as a slow clap, no held tonal
     run over 200ms, and it was the one window of 381 scanned that also cleared
     the floor gate. It still had a voice in it. "this callping has people voice
     also i dont want that" - heard directly, once the split above gave it a
     real, audible level for the first time. 200ms of held pitch is enough to
     register as a voice when it is loud enough to hear at all; the gate that
     measured this cue safe was measuring the wrong thing.

     `handclap` measures 1 tonal frame in the WHOLE 4.60s window, 40ms, sitting
     on the ring of the clap that made it - not a held syllable. It is a hundred
     adult hands in a church, not children, and that is the honest limit of what
     CC0 offers: 44 searches and 25 measured recordings earlier in this game's
     history found no crowd of children clapping with zero voice in it at any
     length. A near-silent family recording (family-clap, fetched and measured
     for this exact question) came just as clean - 3 tonal frames in 8.5s - but
     at 1.1-1.8 claps/sec it is too sparse to read as clapping at all, the same
     fault this cue was rejected for once already. Between "children, with a
     trace of voice" and "adults, with none", the second is what was asked for.

     dur 4.30 / rel 0.80: it starts 0.10s after the chime (so the sting opens
     the moment alone, the way a level-up jingle leads a crowd) and its own
     natural thinning tail lands where Aaru walks off - the same exit the
     chime's last ring makes, so both fade with him rather than one cutting
     under the other. Panned centre, like the chime: a room clapping does not
     sit to one side of the screen. */
  softclap: (c, t) => {
    smp(c, { at: t + 0.10, name: 'handclap', peak: 1.0, dur: 4.30, rel: 0.80 });
  },

  /* THERE WAS AN `allDone` HERE and it is gone, not commented out, because the
     user asked for all-done.wav out of the game throughout. It was the widest
     phrase the instrument could play — the roundDone triad spread over two
     octaves, a held four-note chord, twelve sparkles and one last Ab5 struck as
     the confetti thinned — and it fired twice at the very end: once as the
     finale's celebration opened, once over the recap's ten lit frames.

     BOTH OF THOSE BEATS NOW BELONG TO RECORDINGS rather than to the music box:
     the landing is `thud` on its own, and the recap's clap is a hall of children
     (`cheer`) on the frame it starts rather than 950ms behind a flourish. If it
     is ever wanted back, it was six notes at gaps 0/104/202/294/380/460ms,
     velocities .112/.098/.104/.098/.108/.142, landing on ab5-c6-eb6-ab6 held
     1.75s at .056 with sparkle(spread 1.3, n 12) 60ms later and ab5 at .072
     struck 1.35s after the landing — and its plan row was off +2.0, len 3.1.

     The line being hauled along. This one moves: the whole voice is built into
     a panner that travels from the right of the stage to the left over exactly
     the length of the ride, so the sound goes where the frames go. Rendering it
     to a stereo file freezes that travel into the file, which is why haul is
     the one cue that must never be pitch-jittered — see SFX_JITTER.

     The rope running out is two sweeps rather than one steady band: up as the
     pull takes hold, down as it is let go. Its Q was 0.8, which is precisely
     the case hiss() warns about — under about 1 the filter passes most of the
     spectrum and the ear hears white noise — and it was the reason this read as
     a shhh rather than as rope. At 1.7 it reads as rope over wood.

     Under the run are three soft knocks, one per frame swinging past. They are
     placed at even fractions of the DISTANCE and then converted to times
     through the same easing the ride uses — at even fractions of the TIME they
     would bunch up in the middle, where an eased ride is moving at twice its
     average speed, and the ear would hear them drift off the picture.

     The last pair is the line settling, and it is lower and softer than the
     others because nothing is moving by then. It used to bottom out at 190Hz,
     which a tablet cannot reproduce, so the settle is a wooden peg knock in the
     register the speaker has rather than a thud it does not. */
  haul: (c, t) => {
    const dur = HAUL_MS / 1000;
    /* THE CUE STARTS AT ITS FIRST BOING AND NOT AT THE START OF THE RIDE, and
       that is forced rather than chosen: the bench trims leading silence off
       every cue it writes (see trimmed() in render-cues.js), so 449ms of nothing
       could not survive into haul.wav even if it were built here. It is put back
       at the call site, where runHaul fires this with `delay: frameInAt(0)` —
       the same arrangement allDone used to use with FLOURISH_LEAD_S. Build the
       silence in here instead and the whole cue lands 449ms early. */
    const lead = haulNoteAt(0);
    const p   = c.createStereoPanner ? c.createStereoPanner() : null;
    const run = () => {
      /* ONE FRAME ARRIVING, THREE TIMES, ON A TOY XYLOPHONE.

         TEN ATTEMPTS, AND THE LAST FOUR EACH FAILED FOR A DIFFERENT REASON.
         That is the useful part of the history: each verdict named something
         the one before it could not see.

           1. TIMBRE. Five kinds of FRICTION - swept noise, rope, a curtain
              rail, paper, air - every one an answer to "what does a clothesline
              being pulled sideways sound like". All broadband. "Too irritating",
              and rightly: the rail put 16% of its energy above 5kHz with its
              busiest third-octave at 2540Hz, in the middle of where hearing is
              sharpest, and held it for 1.7s, four times a game.

           2. STRUCTURE. A slide whistle fixed the timbre and was rejected as
              "not relatable enough for this part where frames are coming ONE BY
              ONE" - which named a defect all seven earlier attempts shared. The
              bay rides in as a rigid unit, but three 469px frames sitting 584px
              apart cross the right edge of a 1920px stage at 449ms, 774ms and
              969ms. Three things visibly appear, one after another. A single
              continuous sound over that says "one thing moved".

           3. WORLD. Three jaw-harp boings got the structure right and were
              rejected as "doesn't fit the game". A boing is slapstick imported
              from another cartoon.

           4. PLEASURE. Paper cards and wooden pegs - the game's own materials,
              one per frame - fixed the world and were still not it: "find a
              better and ear pleasing sound". Correct, and it is the one thing
              none of the previous nine had ever been. Noise, friction, a
              whistle, a twang, paper, wood: not one of them was TUNED. Nothing
              that is not tuned can be pleasing four times a game.

         SO IT IS AN INSTRUMENT, AND IT IS A CHILD'S TOY XYLOPHONE - searched for
         rather than improvised out of what was already here. Cartoonish, because
         a toy xylophone IS what a cartoon puts on things appearing one after
         another. Ear-pleasing, because it is tuned. Relatable, because it keeps
         the one-per-frame structure attempt 8 got right and only changes what is
         on it. And it fits, because a toy instrument in a children's picture
         book is not an import from anywhere.

         Eb - G - Bb, A TRIAD, AND THAT IS FORCED BY THE TIMING. Each note rings
         about 0.55s; the frames are 325ms and 195ms apart. So all three ARE
         sounding together before the last has finished, and what they spell
         matters. The obvious cut is the take's first three notes, do-re-mi,
         which overlapped is a cluster. Eb, G and Bb overlapped is an E flat
         major chord - so the cue arrives as three separate taps and RESOLVES as
         one chord exactly when the third frame lands. Same lesson the boings
         taught; this is the third cue in a row where ringing forced a triad.

         ONE INSTRUMENT, ONE TAKE. All three notes are cut from a single 14s
         recording of one toy xylophone being played up a scale, so they share a
         room and a set of reflections - the same reason the music box is a
         recording per note instead of one note pitched around. It is also why
         the better-tagged single-note candidate lost; see PROVENANCE.

         AND IT DOES NOT BORROW THE REWARD. The music box is the sound of being
         RIGHT and nothing else may use it. This is a toy xylophone - struck
         wood, not a music box - so the palette stays unambiguous. It happens to
         be in Eb, the dominant of the game's Ab major, so it cannot clash with
         the reward either.

         THE PAPER STAYS, UNDERNEATH AND QUIET. Not for its sound - for the
         physical arrival, and because three sparse events could not otherwise be
         rendered: bare knocks needed so much gain to reach this cue's loudness
         target that the file railed at 0 dBFS, 5 samples clipped, the same way
         `pop` once came back at +1.5. Paper carries loudness without carrying
         peak. A xylophone note rings far longer than a knock so the margin is
         wider now, but the card is also simply what a paper frame swinging in
         sounds like, so it earns its place twice.

         AND THE FIRST 449ms ARE SILENT, which is not a gap: no frame is on
         screen yet. The cue starts when the picture does. */
      const NOTE = ['xylo1', 'xylo2', 'xylo3'];
      const XYLO_RATE = HAUL_XYLO_RATE;
      /* AN OCTAVE DOWN, and this is the one place a rate is not a shortcut.
         A toy xylophone is a HIGH instrument: this take's eight notes run
         2086-3999Hz, so its lowest three still sit two octaves above where the
         game's own music lives. Measured, the musical cues here are pop 769Hz,
         hint 795, roundDone 1746 - all 0/100/0. Played straight,
         these notes rendered 0/86/14 with a centroid of 3736Hz: a seventh of
         the cue above 5kHz, which is where a small speaker turns brightness
         into sizzle, and within touching distance of the 16% the curtain rail
         was called irritating for. A -6dB shelf at the cut only took it to 9%.

         At 0.5 the cue measures 0/100/0 with a centroid of 1733Hz - nothing
         above 5kHz at all, and the same register as roundDone. It is still
         plainly a toy xylophone; it is just no longer the brightest thing in
         the game by a factor of three.

         AND 0.5 IS THE ONE RATIO THAT COSTS NOTHING. Every other transposition
         resamples between samples; exactly half speed reads each sample twice,
         so there is no interpolation and no artefact. It is also exactly an
         octave, so the triad below is still the triad that was played. */
      const at = i => t + haulNoteAt(i) - lead;
      if (smp(c, { at: at(0), name: NOTE[0], peak: 0.50, rate: XYLO_RATE })) {
        smp(c, { at: at(1), name: NOTE[1], peak: 0.46, rate: XYLO_RATE });
        smp(c, { at: at(2), name: NOTE[2], peak: 0.42, rate: XYLO_RATE });
        /* The card under each note, at a fifth of it: the frame is paper and it
           is arriving, but the note is the thing being listened to. Slightly
           ahead of the note, because the frame is already moving when it is
           struck. */
        NOTE.forEach((_, i) =>
          smp(c, { at: at(i) - 0.02, name: 'cardslide', dur: 0.28, peak: 0.10, rate: 0.92 }));
      } else {
        /* No samples, so no pegs — the synthesised fallback keeps the SHAPE and
           gives up the material, which is the right way round: three filtered
           knocks on the same three frames. The swept bed under them is the one
           piece of the old friction cue still standing, and only here, because
           without a real peg to hear the three ticks would be alone in silence.
           This runs only when a cue file fails to load; the bench bakes the real
           thing into haul.wav, so a child never reaches it. */
        const run_s = dur - lead;
        hiss(c, { at: t,                 dur: run_s * 0.45, peak: 0.040, hz: 900,  to: 2100, q: 1.7, hp: 380 });
        hiss(c, { at: t + run_s * 0.45,  dur: run_s * 0.50, peak: 0.036, hz: 2100, to: 700,  q: 1.7, hp: 380 });
        FRAME_IN.forEach((e, i) =>
          hiss(c, { at: at(i), dur: 0.09, peak: 0.055,
                    hz: 1600 + i * 300, to: 300, q: 1.5, hp: 250 }));
      }

      /* THE LINE SETTLING - the fourth peg, and the only one that is not a
         frame appearing. It is the line itself coming to rest, 431ms after the
         last frame crossed in, and it is left at its natural pitch so the three
         rising taps resolve back down onto the one they started from. Softer
         than they are, because nothing is arriving on it. */
      smp(c, { at: t + dur - lead, name: 'landknock', dur: 0.26, peak: 0.40 });
    };
    if (!p) { run(); return; }
    /* The sweep is the same 0.8 -> -0.8 across the ride it always was, picked up
       where `lead` has already carried it rather than restarted — otherwise the
       cue would swing hard right at the moment the first frame is already a
       third of the way in. */
    p.pan.setValueAtTime(0.8 - 1.6 * (lead / dur), t);
    p.pan.linearRampToValueAtTime(-0.8, t + dur - lead);
    p.connect(masterGain);
    withBus(p, run);
  },

  /* --- the finale's four accents -------------------------------------------

     Four hard visual accents that used to happen in silence. None of them is a
     new idea about the game; each is a sound on a thing that was already on the
     screen, which is the cheapest kind of addition there is and the kind a
     child notices immediately because the picture and the sound agree.
     ---------------------------------------------------------------------- */

  /* The air on the way down, after he lets go of the line. It fires as the arc
     starts and is over before the thud, so the two read as one event: the fall,
     then the floor. The fallback is a downward noise sweep, which is what a
     whoosh is if you have to build one.

     IT IS MOTION, NOT IMPACT, and the level says so — the thud is what lands. A
     whoosh as loud as the impact it precedes is the standard way to make a fall
     read as a special effect rather than as a boy. */
  fall: (c, t) => {
    if (smp(c, { at: t, name: 'fall', peak: 0.78 })) return;
    hiss(c, { at: t,        dur: 0.34, peak: 0.075, hz: 2400, to: 700, q: 1.3, hp: 420 });
    hiss(c, { at: t + 0.18, dur: 0.22, peak: 0.045, hz: 1200, to: 560, q: 1.5, hp: 420 });
  },

  /* His fingers meeting, and the golden burst that comes off them. The last
     event in the game, and TWO layers because what is on the screen is two
     things: a snap, and magic.

     THE SNAP is a real finger snap, and it is the single most tablet-friendly
     thing in this whole set — measured, 91% of it lands in the band the driver
     is most efficient in and 0.5% below 500Hz.

     THERE WAS AN ATONAL BELL-TREE SHIMMER OVER IT, 20ms behind, on the argument
     that the snap sets off a flash and a ring of eleven sparks and a bare click
     under that is a snap with no consequence. The argument was fine and the
     result was not: it made this moment TWO sounds, and the cheer that used to
     follow made it three, on a beat where the game should be at its clearest.
     Removed. A snap is a snap.

     THE GENERAL RULE IT BROKE, which is now the rule for the whole ending: one
     event, one sound, and nothing simultaneous. Layering to add importance is
     the reflex that produced a ten-second finale containing seven cues and
     three overlapping pairs, two of them stacked three deep. Importance comes
     from having the moment to yourself. */
  snap: (c, t) => {
    if (smp(c, { at: t, name: 'snap', peak: 0.85 })) return;
    hiss(c, { at: t, dur: 0.05, peak: 0.11, hz: 3000, to: 1400, q: 2.0, hp: 900 });
  },

  /* The line creaking as he rides in on it, hand over hand, over ENTRY_MS.

     THIS CUE EXISTS BECAUSE THE RIDE WAS WRONG, not because it was silent. What
     played over it was `allDone` — the music box celebration — which meant a
     jingle was laid across a boy physically swinging in on a clothesline. Every
     other cue in the game sounds like the thing on the screen; that one sounded
     like an announcement about it. That flourish has since been taken out of the
     game altogether, so the ride is this and nothing else.

     It is a squeaky swing: a rope under a child's weight, creaking as the load
     changes, which is the same event the picture shows. It travels right to left
     with him, the way the haul does, because he enters from the right.

     3.25s FOR A 3.2s RIDE, in one take. That is the rule the haul arrived at
     after being spliced from a 0.98s clip and stepping 19.5 dB at the seam: a
     cue that covers an animation needs a take at least as long as the animation.
     There is no splice in this one either.

     AND THE GAME NO LONGER PLAYS ALL OF IT, which is a change at the call site
     and deliberately not one here. The take still covers ENTRY_MS whole, because
     that is what the bench renders and levels; playEntry() then fades it out as
     he settles into the middle, so the last 770ms of the take is rendered and
     never heard - measured through the master, not assumed: it is silent from
     2.18s where the whole take is still at -17.5 dB peak at 2.4s.
     The reason is that the ride's TAIL is not travel - see ENTRY_SFX_OUT_S,
     where the arithmetic is - and this cue is the travel. Do not shorten the
     file to match: `len` in SFX_PLAN is the window this cue's level was solved
     over, and a shorter take would re-level it. */
  swing: (c, t) => {
    const dur = ENTRY_MS / 1000;
    const p   = c.createStereoPanner ? c.createStereoPanner() : null;
    const run = () => {
      /* TWO RECORDINGS: A GESTURE AND A BED, which is what the user's ask
         needed - "cartoonish and ear pleasing for a child yet relevant in this
         situation also". The creak alone was only ever the second half of that.

         THE WHISTLE IS THE CARTOON. A slide whistle is the sound a cartoon has
         made for a body travelling on a rope for eighty years, and it is the
         instrument this game already reached for the last time the user said a
         cue was "too irritating" and asked for something "funny... cartoonish
         pleasing to the ears of childrens". It was rejected THERE - on the haul,
         where three picture frames arrive one by one and a swoop is not what
         that is - and the rejection said so in as many words: "not relatable
         enough for this part where frames are coming one by one". A boy swinging
         in on a rope is the part it IS relatable to.

         IT IS A GLIDE AND NOT A SWOOP, measured rather than assumed. 517637 is
         one slow rise and one slow fall, not a string of swoops, so `swoopslow`
         is 2.95s of the FALL: 1102Hz down to about 711Hz across the ride, which
         is a pitch arriving and settling rather than one taking off. It covers
         ENTRY_MS whole - the thing 517633's 1.75s and 2.13s passes could not do
         without splicing a take to itself, which is the mistake `haul` already
         paid for once. It measures 0/100/0 across all 2.95s: not one per cent of
         it outside the band this speaker can reproduce.

         THE CREAK STAYS, AT 0.42 RATHER THAN 0.60, and that is the "relevant in
         this situation" half: without it the entrance is a whistle and he is not
         on a rope. It is a metal playground swing and it is the reason the user
         reads this cue as mechanical, so it is now the BED rather than the cue.
         The hemp-rope recording fetched to replace it lost on measurement -
         4/37/59 at -40 dBFS against this window's 1/76/23 at -17.6. See the
         rejection block in cut-sfx-assets.py.

         Both go through the travelling panner below, because both are him. */
      const bed  = smp(c, { at: t, name: 'swing',     dur: dur + 0.05, peak: 0.42 });
      const toon = smp(c, { at: t, name: 'swoopslow', dur: dur + 0.15, peak: 0.62 });
      if (bed || toon) return;
      /* No recording: two slow rope sweeps, rising as he comes in and easing as
         he settles. Thin next to the real thing, but it is a rope. */
      hiss(c, { at: t,              dur: dur * 0.55, peak: 0.045, hz: 800,  to: 1700, q: 1.6, hp: 420 });
      hiss(c, { at: t + dur * 0.55, dur: dur * 0.45, peak: 0.038, hz: 1700, to: 750,  q: 1.6, hp: 420 });
    };
    if (!p) { run(); return; }
    /* He crosses the right edge early and reaches the middle at about a third of
       the ride, so the travel is weighted to the front rather than linear across
       it — see entryRide(). Two ramps rather than one keeps the sound on him. */
    p.pan.setValueAtTime(0.75, t);
    p.pan.linearRampToValueAtTime(0.10, t + dur * 0.35);
    p.pan.linearRampToValueAtTime(0.0,  t + dur);
    /* place(c, 0) AND NOT masterGain, which is the same node in the render and
       not always the same node in the game: with a pan of 0 place() builds
       nothing and hands back whatever bus is current, so this panner lands
       INSIDE sfx()'s fader when there is one instead of hopping over it. The
       haul's identical line stays as it is - nothing fades the haul. */
    p.connect(place(c, 0));
    withBus(p, run);
  },

  /* The box going over, at the top of the ending. TWO EVENTS IN ONE RECORDING —
     the box coming off balance and the slab hitting the floor, about 380ms
     apart — which is what a box tipping actually is, and why this was not worth
     building out of one knock. toppleBox() fires the file BOX_KNOCK_MS early so
     that the second of the two lands on the frame the picture puts it on.

     IT USED TO BE THE QUIETEST CUE IN THE SET, on the reading that it was
     scenery folding away underneath something else. It is not scenery any more:
     it is the first beat of the ending, it happens on a bare board, and the
     landing it marks is the one the dust comes off. See SFX_TRIM. */
  topple: (c, t) => {
    if (smp(c, { at: t, name: 'topple', peak: 0.70 })) return;
    wood(c, { at: t,        hz: N.EB4, dur: 0.26, peak: 0.070 });
    hiss(c, { at: t + 0.02, dur: 0.18, peak: 0.040, hz: 1000, to: 420, q: 0.9, hp: 380 });
    wood(c, { at: t + 0.22, hz: N.AB4, dur: 0.30, peak: 0.040 });
  },

  /* --- THE STORY'S OWN SOUNDS, ONE PER PICTURE ---------------------------------

     TEN PICTURES IN THE RECAP, NINE OF THEM SOUND (one of them twice), AND EVERY ONE OF THESE IS A
     RECORDING. That is the whole change, and it is a change of KIND rather than
     of tuning.

     WHAT WAS HERE. Four cards had a cue and each was assembled out of oscillators
     and filtered noise: `puff` was three thinning grains of banded hiss, `ting`
     three sines at a small bell's partial ratios, `splash` a wet slap and three
     placed drops, `tummy` two noise bands under two sliding tones. Each one was
     measured, each one landed on its target, and the comments above them argued
     the shape of every envelope. Six cards had nothing at all.

     WHY IT ALL WENT ANYWAY, in the user's words: those cues "sound like a machine
     and had no effect on real emotions of kids, as they are our target audience".
     That is right, and it is not a criticism of the tuning. A sneeze is not a
     noise burst with the envelope of a sneeze - it is a child, and a child hears
     the difference instantly and does not hear anything else about it. The same
     goes for a stomach, a gasp, a sigh and a dog. Synthesis can hit a target and
     cannot hit a feeling, and this game's audience is four to eight years old.

     SO THERE ARE NO OSCILLATORS BELOW AND NO FALLBACKS EITHER. Everywhere else in
     this table a sample-backed voice keeps its synthesised version underneath -
     `if (smp(...)) return;` and then the oscillators - so a cue whose .wav fails
     to load still makes a sound. These do not, deliberately: the fallback for
     these cues WAS the machine, and a fallback is how it comes back. If a file
     here fails to load the game is silent on that card, which is the better of
     the two wrong answers.

     WHAT THAT COSTS AT BUILD TIME, and it is the one thing to watch. The bench
     renders these from the samples, so a bench run with samples missing renders
     SILENCE rather than the wrong-but-healthy-looking fallback set. That is a
     louder failure than the one the old arrangement had, and render-cues.js now
     refuses to write a silent cue rather than levelling one. Run
     `python tools/cut-sfx-assets.py` first.

     THE PANNING IS UNCHANGED: wakeCard fires each of these with the pan of the
     card it belongs to, so the sound comes from the picture that is moving.
     -------------------------------------------------------------------------- */

  /* आssशू - card 2. He sneezes into the flour, the cloud blows out of the picture
     and the pot lid is knocked out of his hand.

     A CHILD, AND THE SECOND OF TWO IN THE RECORDING. The source is a pair of
     sneezes and its author says which is which - "A big kid and then a small kid" -
     so the cut starts after the big one. That distinction is the entire reason
     this file was chosen over four better-recorded adult sneezes: the ask was "aah
     aah chu sound is needed of a child", and an adult sneeze on a boy of seven is
     a grown man standing off-screen.

     ONE smp AND NOTHING OVER IT. A sneeze is one event and the flour simulation is
     already carrying the picture; the old cue's three staggered grains were doing
     the work of the animation, not of the sound. */
  /* आssशू, AND NOW WITH THE BREATH IN FRONT OF IT. The user's ask on this cue
     was "more childish male indian cartoonish voice for sneeze sfx SLOW AND
     DRMATIC very ear pleasing to childrens not irritating", and a cue that is
     only the release cannot be slow: what shipped was 0.55s of sneeze and
     nothing at all before it.

     WHAT A CARTOON ACTUALLY DOES is the inhale - aah... - and then the beat of
     suspense, and only then the release. `inhale` is the ONE rising breath in
     all 55s of boy-voice.mp3, out of the same child the game casts as Aaru, and
     it survives the speaker where a breath usually does not: 12/85/3, busy 71%.
     The file fetched for this job did not survive it - sneeze-build's thirteen
     build-up breaths measure 86-100% BELOW 500Hz, which on a tablet is silence.
     Air is low; a voiced breath is not.

     0.70s BETWEEN THEM, WHICH IS THE WHOLE ARRANGEMENT AND ALSO A CONSTRAINT.
     The inhale runs 0.60s, so the beat of suspense is 100ms - and the release
     therefore starts 0.70s into the cue. The flour and the picture's shake are
     pinned to 880ms after the card wakes and they are tuned there, 2400
     particles of it, so the CUE moved instead: SCENE_FX card 2 fires at cueAt
     180 now, which puts the release back on 880 and its peak back on 1200,
     exactly where they were. Nothing visual moved.

     THE LONGER VERSION IS AVAILABLE AND IS NOT THIS ONE. Two inhales at 0 and
     0.72 with a 300ms beat is more dramatic still, and it needs the shake and
     the flour moved to about 1940 - which is a 2400-particle simulation retuned
     for a sound. Worth doing if the user wants more; not worth doing blind.

     rate 0.94 ON THE INHALE drops it about a semitone and stretches it 40ms,
     which reads as a bigger chest drawing in. It is the one number here that is
     taste rather than measurement. */
  sneeze: (c, t) => {
    /* BOTH HALVES ARE THEIRS NOW, AND SO IS THE BEAT BETWEEN THEM. This was a
       LIBRARY boy's breath (`inhale`, pitched up 18%) placed 700ms in front of
       their sneeze - a made-up anticipation in front of a real release, and the
       user's verdict was "still the snezze sfx sound in not coming good".
       Measured, their page 3 already had the whole gesture with digital silence
       around each half:

           8.785-9.020   the "आ…" intake      peak -1.5 dBFS   0/47/2/15/37
           8.990-9.320   nothing at all       -70 to -92 dBFS
           9.320-9.650   the "छीं" burst      peak -1.4 dBFS   1/11/27/51/10

       so 0.535 below is not a chosen beat, it is the gap between the two things
       she actually performed. The intake is bright (49% above 5kHz after the
       cutter's high-pass) and the burst carries the body, which is why the whole
       thing lands at 7/32/18/41/2 - two per cent above 5kHz across the gesture,
       where three of the seven footfalls in their other file were 35-47%. It is
       not the harsh end of their own recording.

       WHY IT IS TWO SAMPLES AND NOT ONE. A single 8.785-9.650 cut would carry
       330ms of digital silence in the middle of a cue, which the bench's LUFS
       solver reads as part of the cue and pays for in gain. Two cuts, one gap,
       stated here. See booksniff/sneezebook in tools/cut-sfx-assets.py.

       AND THE FIRST CUT OF THE INTAKE WAS 90ms OF A MIX ARTIFACT. It started at
       8.785 and the first thing in that window - 8.800-8.880 - is 91% of its
       energy in 5-9kHz with NOTHING below 800Hz and discrete peaks at 5789, 6257
       and 7335Hz. That is not a breath; it recurs six times across their clip, so
       it belongs to the recording rather than to the sneeze. It shipped for one
       bench run and took this cue from 4% above 5kHz to 32%, where the window this
       same user called "still very harsh" was 17%. The cut now starts at 8.875,
       which is their VOICED आ - 0/74/4/21/1, f0 571Hz, harmonics at 562/585/609Hz -
       and the beat is 440ms because that is where it sits in front of the burst.

       AND THE BAND FIGURE THAT HID THAT IS WORTH RECORDING. I first read the whole
       gesture as 7/32/18/41/2 off a single Hanning window over all 870ms: a taper
       over a gesture with 330ms of SILENCE in the middle weights the silence's own
       noise floor and buries both ends - the artifact sat 1-10% into the window
       where the taper is 1e-4 - so the figure was not just wrong but impossible.
       An energy-weighted union of two windows has to fall between them, and
       neither part has 7% below 300Hz or 2% above 5kHz. Measure a two-part cue
       with Welch, or measure the parts. */
    smp(c, { at: t,        name: 'filmsneeze', peak: 0.92 });
    /* THE RELEASE IS THE USER'S OWN SNEEZE NOW. Two library sneezes were
       rejected on this cue - the second time with "the kids sfx still sounds
       like an adult" - and when asked where to find the one they wanted, they
       gave a link to their own interactive picture-book of this same story.
       This is cut from its page 3, the page the sneeze happens on. It is Hindi,
       it is performed for children, it is theirs, and at f0 441Hz it is higher
       than either library take (386Hz) and higher than the narrator's own
       speaking voice (364Hz), which is what makes it read as a child.

       `sneeze` - the library cut - is still on disk and still in SAMPLE_SRC, so
       the two can be heard against each other in the audition.

       THE WINDOW GREW 0.25 -> 0.330s in the same pass. The old cut stopped 80ms
       into the burst's decay for no reason anybody wrote down; 9.650 is where her
       next word ("सारा आटा उड़ गया") begins at 9.660, so this is every millisecond
       of the sneeze that exists and none of her sentence.

       ALL OF WHICH IS NOW HISTORY, BECAUSE THE VOICE WAS IN THE FILM. Every
       version of this cue up to the eighth was cut from page 3's narration - 64
       kbps at 24kHz, the lowest-fidelity file in the tree - and the woman
       performing a child. Their book also ships a 24.7s film, and its soundtrack
       is 48kHz AAC at 253 kbps with a -90 dBFS floor: Aaru's own sneeze is in it
       at 13.055, 345ms, with digital silence on both sides and an f0 of 667Hz
       falling to 471. Nothing is pitched, nothing is layered, nothing is shelved.
       See filmsneeze in tools/cut-sfx-assets.py for the whole comparison.

       WHAT WENT WITH IT, kept named so nobody re-derives it: `bookaa` (their
       voiced "आ" off page 3, 440ms in front of the old burst), `sneezebook` (the
       page 3 burst itself, eight versions of this cue), `inhale` (a library boy's
       breath that stood in front of it for several) and KID_LIFT on the release,
       which existed only to lift a 308Hz adult sneeze into a child's register.
       All four are still cut and still loaded; none of them is needed by a
       recording of the actual event.

       IF IT WANTS MORE ANTICIPATION, the line to restore is
       smp(c, { at: t, name: 'inhale', rate: 1.18, peak: 0.46 }) with this moved to
       t + 0.70 and SCENE_FX's cueAt back to 180 - that was the shape for several
       versions and it is a beat in front of the sneeze, not part of it. The film's
       burst carries its own onset (a 40ms fricative at 95% above 5kHz), which is
       what the breath was standing in for. */
  },

  /* CARD 3 - he lifts the lid, looks in, and the pot is empty. This card had NO
     SOUND AT ALL, and it is the turn the whole story hinges on: the moment he
     finds out there is nothing to eat is the moment he sets off.

     HIS PITCH GOES UP, and that is why this window and not one of the other seven
     voiced runs in the same recording. Measured across the take, this is the only
     one whose f0 RISES - 286Hz to 419Hz over 170ms - and a rising voice is what
     surprise sounds like in any language. The falling ones are in the same file
     and one of them is `sad`, eight cards later.

     IT IS ALSO THE BEST-PLACED SOUND IN THE GAME for this device: 1% of its energy
     below 500Hz and 99% in the 500Hz-5kHz band the tablet driver actually
     reproduces. That is luck rather than judgement - a child's voice simply lives
     there - but it is worth knowing, because it means this cue needs no help. */
  gasp: (c, t) => { smp(c, { at: t, name: 'gasp', peak: 0.88 }); },

  /* टिन-टिना - card 4. The bell is DRAWN on his handlebar, a chrome dome on the
     right grip, so this is a sound on a thing the child can see.

     A REAL BELL, WHERE THIS WAS THREE SINES. The old voice built one out of a
     fundamental at Ab6 plus partials at 2.76x and 4.16x - a small bell's
     prime-to-hum ratio, chosen so the cue would read as metal rather than as
     harmony - with a filtered click in front of it for the striker. The reasoning
     was sound and the result was a synthesised bell, which is a thing a child has
     never heard. A bicycle bell is a thing they have.

     TWO STRIKES OF ONE DOME, unchanged from the old voice and still the right
     shape: that is what the word says and what a thumb lever does. The same
     recording both times, the second a shade softer and left to ring - the first
     is cut short at 0.20s so the second lands into it rather than beside it.

     0/98/2 AFTER THE HIGH-PASS, which is the cleanest band profile of anything in
     the game. Its row in SFX_PLAN is still low in the group for that reason: it
     will seem louder than its number says. */
  ting: (c, t) => {
    smp(c, { at: t,         name: 'bikebell', dur: 0.20, peak: 0.86 });
    smp(c, { at: t + 0.128, name: 'bikebell',            peak: 0.72 });
  },

  /* THE BICYCLE ARRIVING, which is card 4's other half and the other half of the
     ask: "cycle coming and trin trin voice is needed". The bell had a cue. The
     1.4s ride it rings at the end of did not, so a whole boy and bicycle crossed
     the picture from off-frame in silence and then a bell appeared.

     A TYRE ON A DIRT ROAD, because that is the road in the drawing - he rides in
     over sand out of his own dust cloud, and the surface is half the frame. A
     clean tarmac ride was auditioned and is the wrong ground.

     IT ENDS WHERE THE BELL BEGINS, AND `dur` IS WHAT MAKES THAT TRUE. The sprite
     enters at 820ms over 1400ms and the bell rings at 2260 - so from this cue's
     own start the bell is 1440ms away, and 1.44 is that number rather than a
     round one.

     THE CUT IS 1.60s AND THIS PLAYS 1.44 OF IT, which is not waste: a cue that
     covers an animation needs a take at least as long as the animation, or it has
     to be spliced to itself, and the extra 160ms is that margin. Without the
     `dur` the tyre ran 160ms PAST the bell - measured, `node tools/sim.js form`
     puts cycle at 100.34s and ting at 101.78 - and this note claimed they did not
     overlap while they did.

     smp() PUTS A RELEASE ON A SHORTENED SAMPLE, so the tyre does not stop dead;
     it runs out over the last few hundred ms, which is what a bicycle arriving
     somewhere does. The order the child hears is: he rides in, he stops, he rings.
     A child rings the bell when he gets there, not while he is still coming.

     THE TEXTURE, NOT THE EVENT, and its level says so. It is 0.5 dB under `ting`,
     which is the same relationship `swing` has to everything that punctuates it:
     the thing that lasts sits below the thing that happens. */
  cycle: (c, t) => { smp(c, { at: t, name: 'bikeride', dur: 1.44, peak: 0.82 }); },

  /* धड़ामा - card 5. He comes off the bicycle. The card takes the impact as a
     shake and the dust goes where he is about to land.

     TWO LAYERS, FOR `thud`'s REASON AND NOT BY HABIT. A bicycle going over is
     metal hitting road - bright, hard, and with the wheel still spinning after -
     and a boy coming off one is a body. Neither is the event on its own: the metal
     alone is a bicycle falling over in an empty street, and the grunt alone is a
     boy tripping. The recording of the bike has the whole sequence in it, crash
     then body then spokes, and the boy is laid into the front of it.

     THE GRUNT IS THE SAME CHILD AS `gasp` AND `sad`, from the same session by the
     same recordist, which is the thing that makes this read as Aaru rather than as
     a sound effect: one boy makes every human noise in this story.

     55ms BEHIND, NOT ON THE SAME FRAME. Struck together they are a chord with a
     click on the front - the thing STEP_DELAY_S was measured for. The metal is
     what hits first: he is on top of the bicycle, so it reaches the road before he
     does.

     THIS USED TO BE `thud`, FIRED A SECOND TIME. Same file, on the argument that a
     knock plus a body is a knock plus a body wherever it happens. It is not: the
     finale's landing is a boy dropping off a rope and meeting the floor on his
     feet, in control, which is a wooden rap and a scuff. Going over with a bicycle
     under him is neither controlled nor wooden. */
  crash: (c, t) => {
    smp(c, { at: t,         name: 'bikecrash', peak: 0.88 });
    /* 0.60 -> 0.78, AND IT IS THE ONLY THING THE BICYCLE FALL COULD BE GIVEN. The
       user asked for Aaru's own sound on this card out of their picture-book, and
       measured, the book has nothing for it: its supplied body-fall (whump.mp3) is
       94% below 300Hz at a 178Hz centroid and loses 14.0 dB through a 600Hz
       high-pass, and the landing mixed into their page 7 is 96% below 300Hz at
       120Hz and loses 10.7. On a tablet neither is a quiet cue, it is no cue - and
       both are the "very heavy" fault four earlier cues here were rejected for.
       Their page 6, where he actually goes over, has no impact in it at all: the
       1.8s event at 5.20 is her holding the word "धड़ाम" (0/98/2/1/0, flatness
       0.000, f0 pinned at 533-615Hz), which is a word and not a crash.

       So the boy in this cue stays the library one - and he comes UP 2.3 dB, which
       is the part of the ask that can be answered. `boygrunt` is the layer with its
       energy where the speaker works (23/77 in its own cut note), so raising him
       makes the card read as a BOY going over rather than as a bicycle doing it.
       The bench re-solves the whole cue's gain around him. */
    smp(c, { at: t + 0.055, name: 'boygrunt',  peak: 0.78 });
    /* AND THE GROUND, WHICH THIS CARD NEVER HAD. The picture is a boy going over
       on a sandy road and it fires a 520-particle dust plume on the same frame
       as this cue, and the cue was metal and a voice with no ground in it. He
       grunts as he goes and lands a frame later, so this is behind the grunt.

       IT IS THE MARGINAL LAYER IN THIS PASS and it is quiet on purpose. The
       recording is a real body arriving in sand - its author's words are "me
       falling to my knees in the sand with some grass" - and the grass is a
       broadband rustle: 11/27/62 raw, and 29/47/24 after the hardest shelf in
       the cut table. What is left is body without much articulation, so it sits
       under the metal at 0.42 and adds weight rather than an event. If it reads
       as noise on a real speaker, delete this one line. */
    smp(c, { at: t + 0.070, name: 'sandfall',  peak: 0.42 });
  },

  /* छपाका - card 6. The glass is already tipped and the arc is in the air, so this
     is the moment the juice ARRIVES rather than the moment it left - which is why
     the card fires it late.

     REAL LIQUID, AND THE OLD SHAPE WAS ALREADY RIGHT. This is the one of the four
     replacements where the synthesis was closest: a wet slap sweeping down with
     three placed drops after it is genuinely what a spill on dry road does, and
     the level in SFX_PLAN is unchanged because it was already sitting correctly.
     The recording brings the one thing the arrangement could not - the irregular
     patter of drops that are not on a rhythm, because they are not placed at all.

     3/75/23 AFTER THE HIGH-PASS, so it lands almost entirely where the speaker is
     efficient. The raw file is 78% below 500Hz and would have been rejected on
     that number alone; the high-pass is what makes this window usable, which is
     worth saying because it is the reverse of the usual case. */
  /* ONE GLASS OF JUICE, WHICH IS WHAT THE PICTURE DRAWS - and the fix was the
     LENGTH, not the recording. The user: "its osunding like too much water spilled
     but here logically only a little water in the glass spilled". The cue was this
     same sample at its full 1.00s, and a full second of continuous spatter is a
     lot of water however bright it is. 0.34s is the arrival and a short decay -
     smp() puts its own release on a shortened window (min(SMP_RELEASE, dur*0.34),
     so 115ms here), so what a child hears is a splat that dies rather than a wash
     that goes on.

     AND THE SOURCE WAS TESTED AGAINST THEIRS, WHICH IS THE PART WORTH KEEPING.
     Their own picture-book has this same spill mixed into its page 8 narration and
     it is cut and loaded as `bookspill`. Measured over the first 340ms with Welch,
     it is 1/24/51/17/7 at a 1813Hz centroid where this is 0/11/33/34/22 at 3278Hz.
     A dominant 800-2k band with a low centroid is the sound of a VOLUME of water;
     spatter above 2kHz is the sound of a little of it. So the recording made FOR
     this drawing reads bigger than the library one - and its own impact is not
     liftable anyway, because it happens underneath her voiced "छपाक". The note
     over bookspill in tools/cut-sfx-assets.py has the numbers; switching to it is
     one word here. */
  /* A LITTLE WATER, AND THE PHYSICS OF A LITTLE WATER. "in image 2 replce the
     sfx with only little water getting down with the law of physics how that
     sounds not too loud and annoying" - which is a description of an ENVELOPE,
     not of a recording: a glass-worth of juice leaves the glass, falls, and
     arrives once. It does not wash, hiss or continue.

     SO THE SOURCE CHANGED TOO. `spill2` (splash-soil2) is the harder-fronted one
     and its first 150ms is 1/11/32/35/21 at a 3172Hz centroid - a fifth of it
     above 5kHz, which is the fine spray of a LOT of water hitting a hard surface,
     and it is the same brightness this user has twice called annoying in other
     cues. `spill` (water-spill, "liquid hitting dry ground") reads 0/68/8/14/9 at
     1616Hz over the same window: two thirds of it in 300-800Hz, which is the body
     of individual drops rather than a sheet, and a third of the top-octave
     content.

     0.22s, WHICH IS THE FALL AND THE ARRIVAL AND NOTHING AFTER IT. smp() puts its
     own release on a shortened window - min(SMP_RELEASE, dur*0.34) is 75ms here -
     so the cue decays instead of stopping. And the LEVEL comes down with the
     length: see SFX_PLAN.splash, where "not too loud" is spent. */
  splash: (c, t) => { smp(c, { at: t, name: 'spill', dur: 0.22, peak: 0.90 }); },

  /* CARD 7 - the dog takes his samosa off the sand and eats it. Silent until now,
     on a card whose drawn action is an animal with its snout on the food.

     REAL TEETH ON SOMETHING BRITTLE. A miniature poodle on cheese crackers, which
     is as close as a library gets to a samosa - the thing being chewed has to
     shatter rather than squash, or it reads as a dog licking something.

     NEARLY ALL CRUNCH: 11/24/65, the brightest thing in the set, which is why it
     takes the heaviest shelf in the cutter rather than a duller window. The bright
     part IS the sound here; taking it away leaves a wet noise. */
  dogeat: (c, t) => { smp(c, { at: t, name: 'dogeat', peak: 0.88 }); },

  /* CARD 8 - he walks home with nothing. Also silent until now, and the user's ask
     for it was "a sad humm from aaru".

     A BREATH FALLING INTO A LOW HUM, about 205Hz, from the same boy as `gasp`. It
     is not a performance of sadness and that is deliberate: what is on the card is
     his eyes closing slowly, which is weariness rather than crying, and a sigh is
     the sound of exactly that much feeling. A sob here would be a bigger event
     than the picture.

     THE LEVEL IS THE CUE. This sits near the bottom of the recap group on purpose:
     a loud sigh is a complaint, and he is not complaining, he is tired and going
     home. */
  /* ...AND HE WALKS HOME WITH NOTHING, card 8. The user's ask: "it should sound
     like a male small kid sfx as in cartoons".

     IT IS THE SAME BOY, RECUT, and that is the honest answer to a request for a
     different sound. There is no CC0 recording of a small boy sounding sad on
     freesound - 52 queries found exactly one, "suspiro de nino", and it measures
     87/10/2 at -44.5 dBFS, which is nothing at all on this speaker. What there
     IS, in the 55s of boy-voice.mp3 this game already casts as Aaru, is a better
     window than the one that shipped: `sad` took 44.660, a BREATH falling into a
     low hum at 210Hz; `sad2` is a held voiced vowel at 242Hz. Measured against
     each other - 14/85/0 against 17/82/0, busy 96% against 92%, peak -16.3
     against -18.5 dBFS. More of it inside the band, voiced the whole way rather
     than half air, and 2dB louder before levelling.

     AND THE RISK IS NAMED RATHER THAN HIDDEN: a held vowel out of a session its
     author describes as "gasps, grunts, small inhales & exhales" can read as
     effort or a yawn rather than as dejection, and no measurement can tell those
     apart. BOTH CUTS ARE LOADED so they can be heard against each other - see
     tools/audition-cues.js - and the loser gets deleted from SAMPLE_SRC, from
     ONESHOTS and from here together. */
  /* AND IT IS PITCHED UP, WHICH IS THE PART THAT WAS ACTUALLY WRONG. The user
     came back on this cue a second time - "the kids sfx still sounds like an
     adult" - and measuring the cut says why in one number: its median f0 is
     250 Hz. A seven-year-old speaks around 250-300 and a CARTOON small boy is
     higher still, so 250 with a low hum under it is a grown man sighing. Every
     other voice in the set already sits where a child sits - gasp 348 Hz, the
     sneeze 386, its inhale 408 - and this one alone did not.

     KID_LIFT 1.32 PUTS IT AT 330 Hz, four semitones up, and shortens 0.90s to
     0.68s. Pitching a recording is not synthesising one: it is what a cartoon
     does to a real voice, and the alternative - a different boy - does not exist
     in CC0. Fifty-two queries found exactly one recording of a small boy
     sighing and it measures 87/10/2 at -44.5 dBFS.

     THIS IS THE ONE NUMBER TO TURN if it is still not a child. 1.0 is the raw
     take at 250 Hz, 1.32 is 330, 1.5 is 375 and starts to squeak. */
  /* AND THIS CUE IS UNCHANGED, WHICH IS A FINDING RATHER THAN AN OVERSIGHT. Asked
     for a sad Aaru sound out of their own picture-book, the answer is that the book
     does not have one. Page 10 IS this picture - "उदास आरु आटा लेकर घर लौटा" - and
     measured across all 8.49s of that clip it carries her narration and the
     footsteps and no vocal of his anywhere.

     THEIR "उफ़" WAS CUT AND MEASURED AND REJECTED, on page 7, right after the
     bicycle goes over. It is a genuinely lovely falling sigh - 270ms, f0 dropping
     500 -> 242Hz - and it lost on three counts: the book's own script has it inside
     quoted dialogue, so it is her speaking his line and this game already refused
     the narrator's वाह on that rule; 90% of it sits in 300-800Hz, so a tablet
     throws away 9.2 dB of it where every other recap cue loses 0.0-0.4; and
     rendered at KID_LIFT it rises to its middle and stops, because the same rate
     that lifts it compresses its fall into 30ms. It is still cut and still loaded
     as `booksigh` - one word here switches to it - and the numbers are in
     tools/cut-sfx-assets.py.

     SO WHAT PLAYS IS STILL THE LIBRARY BOY, and the reason it survives the
     comparison is the reason it was chosen: it is one boy's own falling breath,
     the same session as `gasp`, and it decays -14 -20 -24 -28 -31 over its last
     200ms with 87% of itself above 600Hz. */
  /* AT HIS OWN PITCH NOW, WHICH IS THE DEEP ONE. The ask: "replace sfx with a
     small child male arru sad sfx but very deep sfx" - and those two halves pull
     against each other, because a small boy's voice is not deep. What is deep
     about a child being sad is the WEIGHT of it, and every lift this cue has had
     was working against that: KID_LIFT took the take from 900ms to 682 and its
     centroid from 1095Hz to 1440 - shorter and thinner - in order to read YOUNGER.
     That is the right instruction for `gasp`, where surprise is high and quick,
     and the wrong one here.

     rate 1.0 IS THE BOY AS RECORDED, and the deepest this cue can be without
     pitching a child DOWN, which would be a different child: 900ms against 682,
     13% of it below 300Hz against 1%, centroid 1095Hz against 1440. Same breath
     falling to the same hum, allowed to be as long and as low as he was.

     IF IT NEEDS TO BE DEEPER STILL, rate 0.92 measures 978ms at a 1011Hz centroid
     and 15% below 300Hz, and 0.85 gives 1059ms at 931Hz. Both are on the picker
     as of this pass. Past about 0.85 the hum starts to read as a man, and below
     300Hz is where a tablet stops being able to play it at all. */
  sad: (c, t) => { smp(c, { at: t, name: 'sad2', peak: 0.86 }); },

  /* CARD 9 - THE UTENSILS COME DOWN, and this card was silent on purpose until the
     user asked for it: "in this there should be sound of utensils in the air then
     falling keep it normal and funny for a kid not irritating".

     THE ASK NAMES TWO EVENTS AND SO DOES THIS. "In the air THEN falling" is the
     card: five pieces come off two shelves at delays of 0, 45, 70, 85 and 125ms,
     they are all airborne by 125, and the dust bursts under them at 760. So the
     tumble gets three light knocks across the flight and the collapse lands on the
     dust. One layer would have been a crash with no fall in front of it.

     0, 150 AND 340 rather than the five piece delays. Those five span 125ms, which
     is inside the ear's window for a single ragged event - struck on their own
     frames they are one clink with a flam on it, not five things falling. Spread
     across the flight they read as pieces knocking each other on the way down,
     which is what the picture draws.

     THE THIRD KNOCK IS THE FIRST ONE PITCHED UP 18%, because two samples played
     three times is one repeat and a repeat is what makes a foley cue sound like a
     button. Rate rather than a third cut: the recording has exactly two clean
     isolated clinks in it and inventing a third from a busier part of the take
     would have brought its neighbours along.

     THE LEVELS ARE THE RECORDING'S OWN, roughly. In the source the two clinks sit
     5.5 and 15.2 dB under the collapse; the cutter normalises every sample to -1
     dBFS individually, so that balance only exists if it is put back here, exactly
     as `crash` puts its bicycle and its boy back. They are set a little UNDER the
     natural spread - the tumble is meant to be heard and not to compete with the
     landing it sets up.

     AND IT IS DELIBERATELY NOT THE LOUDEST CUE IN THE RECAP at -31.0, which is
     below `crash` and level with `splash`. This is the biggest EVENT in the story
     and the ask was explicit that it should not be irritating; steel is perceived
     as sharper than its integrated loudness suggests, which is the same gap between
     meter and ear that the narrator's LEVEL note is about, running the other way.
     See the shelf and the band numbers in tools/cut-sfx-assets.py. */
  clatter: (c, t) => {
    smp(c, { at: t + 0.00, name: 'utclink',  peak: 0.42 });
    smp(c, { at: t + 0.15, name: 'utclink2', peak: 0.30 });
    smp(c, { at: t + 0.34, name: 'utclink',  peak: 0.24, rate: 1.18 });
    smp(c, { at: t + 0.76, name: 'utfall',   peak: 0.90 });
  },

  /* CARD 10 - Amma finds her locket, and this is the last picture of the story.

     IT IS A CHIME AND IT USED TO BE A WORD. The user's ask, in their own words:
     "can we change the voice of Vaah to jaise, like a diamond is shining, to a
     chime effect wala sound, like premium sound that you find treasure. I want
     that sound SFX." So the cue is no longer a person being pleased about the
     locket - it is the LOCKET, catching the light. What the card draws is a blue
     stone glinting at 1200 and a woman's eyes lighting up at 1480; a struck metal
     chime IS that, where a voice was somebody standing next to it.

     WHAT IT WAS, kept because the history is an argument about measuring the right
     thing. The cue was वाह - the only cue in the game that was a WORD, and so the
     only one that could be in the wrong language, which it was twice over. First
     an unvoiced ingressive breath cut off mid-sound (5% of its loud frames voiced,
     11% above 4kHz), which the user heard as a SCARY SOUND on the card where the
     story resolves. Then an English "wow" from a library, which measured
     beautifully - 82% voiced, F0 falling 198 -> 165Hz, 0.1% above 4kHz - and was
     the wrong language for a Hindi game. Then वाह itself, cut from the game's own
     narrator (dialogue 26's first word), which was right about all of that and
     still put the NARRATOR's voice on Amma's face - a seam the note here used to
     admit and could not fix, because the game has exactly one Hindi female voice.

     AND THE LESSON SURVIVES THE CUE. All three of those sat on their loudness
     target with a sane crest. Loudness cannot hear which way a breath is going,
     and NOTHING acoustic can hear which language a word is in - so a cue that is a
     word has to be READ as well as measured. This one is not a word, which is the
     cheapest way to be sure of it: a struck bell is in no language at all, and it
     is nobody's voice, so the seam goes with it.

     THE INSTRUMENT IS A REAL GLOCKENSPIEL, chosen between the three metal
     recordings already in the tree by measuring them rather than by picking:

         glock     G6, D7, F7 struck inside 350ms, then the G6 rings 2s   crest 18.2
         metallo   C7, G7, E7 over 600ms, then the E7 rings               crest 13.7
         magic     a bell-tree shimmer, an unpitched cluster              crest 14.0

     `magic` IS `formed`, ten seconds earlier in the same recap, so using it here
     would make the ring closing and the locket the same event. `metallo` is nearly
     the same gesture as `glock` at half the crest - a shimmer, where this wants a
     strike and then a shimmer. `glock` is the one that ARRIVES: three notes rising,
     then two seconds of ring, which is the shape of a thing catching the light and
     going on shining. All three measure 0/100/0 - entirely inside the band a tablet
     speaker reproduces - so that column did not decide it, and it is the column
     that has rejected candidates on this project before.

     TRANSPOSED INTO THE GAME'S OWN KEY, and the rate is derived rather than
     chosen: N.AB6 over the take's measured 1566.7Hz fundamental puts its ring
     exactly on the Ab6 the music box has, and carries its G6-D7-F7 up to
     Ab6-Eb7-Gb7. The game is in Ab major - see the note on N - and a bright metal
     figure a semitone outside it would be the one sound in the game that disagrees
     with everything else.

     THEN IT LANDS ON THE CHORD THE CHILD BUILT: Ab-C-Eb, struck together under the
     glockenspiel's arrival and left to ring, then one Ab6 above it a beat later.
     That is the same four-part shape the reward voices are built on - rise, land,
     go past, keep going - with the glockenspiel taking the rise and its own two
     seconds of ring doing the keeping-going, which is why there is no `sparkle`
     here. It is NOT roundDone: that cue's rise is the wooden music box and its
     arrival is a chord of the same wood, where this is metal in front of wood.

     IT RUNS UNDER THE CARD'S OWN SEQUENCE. That card gives away four beats one at
     a time - the locket swings, the stone glints, her eyes light up, he blushes -
     and this is fired at 1480 and rings about 2.2s, so it covers all four AND the
     card's close at 3300: the card ends as one moment instead of four small ones.
     The cue it replaced was 0.85s and reached only as far as 2330.

     ONE THING IS NOT SETTLED AND IT IS NOT ACOUSTIC. glockenspiel.mp3 HAS NO
     LICENCE ON RECORD. It came into the tree as an audition candidate - it was in
     SAMPLE_SRC's own CANDIDATES block, `used by no cue` - and PROVENANCE.json,
     which is CC0-only precisely because this repository is public, has no entry
     for it and no md5 of it anywhere. This cue made it a shipping file. So the
     one thing still owed on card 10 is the page it was downloaded from and the
     licence read off that page:

         python tools/check-sfx-licences.py --used

     fails on it by name, and PROVENANCE.json now carries an entry that says
     UNVERIFIED rather than nothing at all, so it cannot be quietly forgotten. If
     it turns out not to be CC0, this cue is re-cut and the shape to match is the
     table above: a strike, three notes rising inside 350ms, then two seconds of
     ring, crest around 18 dB, all of it inside 500Hz-5kHz. */
  amazed: (c, t) => {
    /* THE GLINT, and the ring is left to run its own length - no `dur`. Its
       measured decay is 16 dB down by 1.2s and still going, and render-cues'
       trimmed() ends the file where it crosses -60 dBFS, so the tail is as long
       as the recording's own rather than a number somebody picked. */
    smp(c, { at: t, name: 'glock', rate: N.AB6 / 1566.7, peak: 0.050, pan: -0.05 });

    /* ...AND A MANJIRA OVER IT, which is the sparkle the user asked for when
       they asked for this beat again: "1st sfx will be of finding a teasure".
       The glockenspiel was already built for that ask - "a chime effect wala
       sound, like premium sound that you find treasure" - so what this adds is
       the glint on top rather than a different sound underneath.

       A REAL ONE, and the most Indian-identifying instrument in the set: "one
       single ring of a set of indian finger cymbals", tagged indian, and it
       measures 0/98/2 at -0.3 dBFS before levelling - the best sparkle material
       in this tree. It is ONE ring where the VCSL manjira is an awkward double,
       and it needs no shelf where that one needed -14dB at 5kHz and still had
       25% above it.

       60ms BEHIND THE GLOCKENSPIEL, not on it: the strike is the discovery and
       this is the light coming off it. Both are on the gem's own side of the
       stage. */
    smp(c, { at: t + 0.060, name: 'manjira2', peak: 0.052, pan: -0.10 });

    /* ...and the chord underneath it, struck as the figure tops out. */
    const land = t + 0.30;
    ['ab5', 'c6', 'eb6'].forEach((note, i) =>
      mbox(c, { at: land, note, dur: 1.15, peak: 0.090, pan: (i - 1) * 0.12 }));

    /* One note above the destination, a beat late - the reward voices' third
       part, and the reason a phrase reads as pleased rather than as finished. */
    mbox(c, { at: land + 0.22, note: 'ab6', dur: 0.60, peak: 0.060, pan: 0.10 });
  },

  /* CARD 1 - his stomach, on the first picture of the recap. He is sitting outside
     his house, drawn hunched with his hand already on his belly, and being hungry
     is the reason the whole story happens.

     PITCHED UP, AND IT IS NOT DECORATION. A stomach is a low-frequency event: of
     six real CC0 stomach recordings measured for this cue, the best had 23% of its
     energy in the band this device reproduces and four of them had between 1% and
     4%. On a tablet that is not a quiet cue, it is no cue - the same trap the
     landing documents. Played at 1.45x it lands at about 65% in band, and the
     reason that is legitimate rather than a fix is that A CHILD'S STOMACH IS
     SMALLER THAN AN ADULT'S AND ACTUALLY DOES GURGLE HIGHER. The recording is of a
     grown-up. Aaru is seven.

     THREE GURGLES, AT 0.10, 0.46 AND 0.86, which is the one thing kept from the
     synthesised version - because the CARD DRAWS THEM. Three curly orange lines
     are fanned down his side, one per gurgle, timed to exactly those offsets, so
     what is seen and what is heard have to stay the same three events. Changing
     the spacing here means changing `curl.lead` and `curl.gap` in SCENE_FX.

     THREE FIRINGS OF ONE RECORDING, AT THREE DIFFERENT RATES. The same sample
     three times at the same speed is a loop, and a loop is the machine sound this
     whole section exists to get rid of. 1.52, 1.38 and 1.60 are far enough apart
     to read as three different gurgles from one belly and close enough to stay one
     belly. THE MIDDLE ONE IS THE BIGGEST, kept from the old voice and still true:
     a rumble that peaks on its first sound is a knock.

     THEY OVERLAP. Each firing is around 0.6s at these rates against gaps of 0.36
     and 0.40, so two are sounding at once for most of the cue - which is what
     makes it a rumble with gurgles IN it rather than three separate noises. */
  tummy: (c, t) => {
    [[0.10, 1.52, 0.55, 0.62],
     [0.46, 1.38, 0.62, 0.82],
     [0.86, 1.60, 0.44, 0.50]].forEach(([d, rate, peak, dur]) =>
      smp(c, { at: t + d, name: 'tummy', rate, peak, dur }));
  },

  /* --- the three beats outside the recap that were silent ---------------------- */

  /* THE PICTURES COMING IN FROM THE LEFT, one per picture, as the ring forms.

     THE OTHER HALF OF THE HAUL. Between rounds the frames are pulled along the
     line right to left and `haul` is on that; in the post-game the ten story
     pictures come in the other way, left to right, and that had no sound at all.
     It is the same clothesline and the same event, so it is built out of the same
     recording - anything else would make one direction a different object.

     TWO EVENTS, NOT ONE, because that is what the animation is: the frame slides
     in along the line, and then the picture comes OUT of the frame and drops into
     its slot 620ms later. FLY_MS is that number and the settle is placed on it, so
     the knock lands on the frame the picture actually arrives on.

     A REAL WOODEN KNOCK FOR THE SETTLE. The rap is the same gavel recording the
     landing uses, played soft and short - what a small wooden thing sounds like
     meeting another one. `haul` used to synthesise its equivalent with two
     filtered noise sweeps and no longer does; see the note there.

     QUIET, BECAUSE IT FIRES TEN TIMES - and they are NOT evenly spaced, which was
     worth measuring rather than assuming. Cards launch at a fixed 748ms interval,
     so the first guess was that they arrive at one too; they do not, because each
     one rides a different distance to its own slot. `node tools/sim.js form`
     prints the arrivals, and the gaps run:

         0.76  1.11  1.12  1.13  0.76  0.78  0.35  0.35  0.37

     So the ring fills with an accelerando, four pictures landing in the last
     second - which is a good thing to hear and the reason this cue is levelled
     low. Every gap is clear of the ~250ms at which the limiter would fuse two
     into one event, but at 0.81s long, two and sometimes three of these overlap
     at the end. Ten of anything in eight seconds is a texture and has to be
     levelled as one; its row answers to how often it fires, the way `deal` does. */
  ride: (c, t) => {
    smp(c, { at: t,        name: 'railslide', dur: 0.34, peak: 0.44 });
    smp(c, { at: t + 0.62, name: 'landknock', dur: 0.22, peak: 0.38 });
  },

  /* THE RING CLOSING. All ten pictures are home, which means the child's whole
     story is on the screen at once for the first time - and that moment passed in
     silence. The user asked for it directly: after all the cards are placed in
     their positions, there should be a sound.

     THE BELL TREE THAT WAS ALREADY IN THE TREE. This sample was cut for the snap's
     golden burst, that beat was reduced to one sound, and it has been sitting
     unused ever since. It is right here for the same reason it was right there and
     one more: it is ATONAL, by tag and by measurement, so it lands on top of a
     game tuned to Ab major without implying a chord nobody wrote. A pitched
     flourish here would be a second celebration eleven seconds before the real
     one.

     AND IT COST NO DOWNLOAD. A brighter, purpose-titled alternative was fetched
     for this beat - a chime whose own description is "a glimmer from left to
     right", which is the direction the cards fly - and it measured 98% of its
     energy above 5kHz against this one's 99% inside 500Hz-5kHz. It was deleted.
     The better-titled file is not the better file. */
  /* THE TRAIL, AND IT IS A REAL INSTRUMENT NOW. The user asked for "better sfx
     sound for magical trail" and there were two things wrong with the old one,
     only one of which is taste.

     THE OTHER IS THAT IT WAS SYNTHESIS. `magic` is cut from bell-tree.mp3,
     freesound 772279, and PROVENANCE.json describes that file as "A real bell
     tree, and ATONAL - which is the point". Reading the sound's own page: its
     author writes "It is made using a granulizer with subsequent processing",
     and his near-twin upload in the same series says "made from SINE TONES using
     a granulizer". Its tags include creepy, dark, horror, drone and pad. So the
     first rule this game's sound set has - recordings, not synthesis, because a
     child hears a machine instantly - was being broken by the cue that is
     supposed to be the magic, on a claim in the provenance file that is false.
     The claim is corrected there; this is the cue moving off it.

     A MANJIRA AND A HAND BELL, both real, both measured: manjira2 is 0/98/2 and
     handbell is 0/100/0. The manjira is the ring and the hand bell is struck
     150ms behind it a fifth of the way up, so the pair reads as a light landing
     rather than as one note. Warm, Indian, and inside the band the whole way -
     against the bar chimes fetched for this job, which are 0/11/89 and are the
     brightness a child hears as sharp.

     `magic` IS STILL CUT and still loaded, because the finale's own flash uses
     it and that is a different job from this one. */
  formed: (c, t) => {
    smp(c, { at: t,         name: 'manjira2', peak: 0.78 });
    smp(c, { at: t + 0.150, name: 'handbell', rate: 1.5, peak: 0.30 });
  },

  /* HER, ON THE LAST PICTURE OF THE STORY. The user's ask, in full: "in 5 image
     scene 1st sfx will be of finding a teasure then indian mom happy sfx sound
     no words". The treasure is `amazed`, which that card already fires; this is
     the second half, and the hard part of it was "no words".

     WORDLESS IS A TAG HERE, NOT A HOPE. mumawe comes out of the Sudden Dice
     donation corpus, which labels the speaker and the emotion rather than a
     script, and its author's own tags are: amazement, astonishment, awe, female,
     human, vocal, voice, woman, WORDLESS. The emotion labelled is awe, which is
     what finding a lost earring is. It measures 0/100/0 at -10.1 dBFS - not one
     per cent of it below 500Hz or above 5kHz, on a cue that has to be heard over
     a glockenspiel still ringing.

     WHY NOT amma-wow.mp3, WHICH IS STILL IN THIS TREE. Because it is five spoken
     English "wow"s by a girl: a word, in the wrong language, in the wrong voice,
     in a game whose rule is that nothing in it is in English. PROVENANCE has had
     it marked SUPERSEDED since the last time it was reached for.

     AND WHY NOT THE HINDI वाह THE NARRATOR ALREADY SAYS: because it is a WORD,
     which is the one thing the user ruled out. It is on disk in dialogue 26 if
     they change their mind - that is the only Indian voice in the tree.

     mumawe2 is her second take, 3dB louder and 40ms longer, cut and loaded for
     the audition. Which of two takes of one emotion sounds like a mother rather
     than an actress is not a measurement. */
  amma: (c, t) => { smp(c, { at: t, name: 'mumawe', peak: 0.86 }); },

  /* ONE PICTURE DROPPING INTO THE RING, ten times, each a step up the scale -
     the rate comes from the call site, see PLACED_RATES. This replaced `ride`,
     a curtain rail with a wooden knock on the end, which the user heard as
     exactly what it is: "i dont like the sfx of the frames getting positioned...
     its annoying". A rail is a machine and this moment is not a machine, it is
     the child's own story assembling itself.

     THE MUSIC BOX IS THE GAME'S VOICE. The placement chime, the hint and
     roundDone are all this instrument, so the ring filling belongs to the same
     world - which is what "more relatable" means here. ab5 is the note it is
     rendered at because it is the tonic of the scale everything else in this
     game is tuned to, and because rate 1.0 has to be a real note rather than a
     transposition.

     dur 0.62 KEEPS THE STRIKE AND THE MUSICAL PART OF THE DECAY. The cut runs
     2.4s and is 30dB down by 0.59s; at rate 2.0 this is 0.31s, which is short
     enough that even the crowded end of the arrivals - three of them inside
     1.1s - does not smear. */
  placed: (c, t) => { mbox(c, { at: t, note: 'ab5', dur: 0.62, peak: 0.085 }); },

  /* RETIRED, AND KEPT WHOLE ON PURPOSE. Nothing calls this - the trail's cue is
     the shimmer above - and it is left here because it is the record of nine
     attempts at one beat and six verbatim rejections, and because `usersteps`,
     the user's own walk, is still cut and still loaded. Restoring it is renaming
     this key to `trail` and pointing SFX_SRC/SFX_PLAN back at footsteps.wav. The
     WALK_* constants below it belong to this voice, which is why they stay.

     THE WALK, AND IT IS THE USER'S OWN RECORDING PLAYED AS A WALK - the seventh
     version of this cue. The ask was "if possible when footsteps sfx can be
     added": the recap lays a footpath of prints between the ten pictures and
     releases them as the trail's light travels past, and that path was silent.

     THE SIX THAT FAILED, because each one was rejected for a reason and the
     reasons are the specification:

       landknock    a wooden rap        "too macanical and not human"
       feet-light   bare feet, stone    "very heavy... should be... ground or sand"
       book-steps   their book, 1.720   "still very harsh"
       book-steps   their book, 0.095   "still very heavy... not kids friendly"
       sand-walk    dry sand, 3.650     "still very heavy to my ears"
       user-steps   two taps out of      "its still not implemented"
                    their own file

     EVERY ONE OF THOSE WAS CHOSEN ON A MEASUREMENT, and the measurements were
     not wrong so much as blind. A rap measures beautifully in band and is still
     a box being put down. Stone answers a foot with a thud and sand absorbs it,
     which is a real distinction and was the right correction to make - it was
     just not the one that was wrong. And the last two came from the same file at
     opposite extremes: the brightest window in it, then the darkest, because
     "harsh" and "heavy" are the two ends of one axis that a three-band reading
     cannot see. See the table in tools/cut-sfx-assets.py.

     THE SIXTH CAME AS A FILE - "for fotsteps sfx use this" - and that is twice
     now on this game that five rounds of sourcing lost to one thing the user
     already had; the sneeze ended the same way. The rule that follows is not
     "measure better", it is ASK EARLIER.

     BUT THE FILE DID NOT PICK THE WINDOW. It holds seven footfalls and three of
     them are 35-47% above 5kHz at a 4-5kHz centroid, which is BRIGHTER than the
     cut this same user called harsh. Handed a file, the temptation is to take the
     loudest event in it, and the loudest event in this one is the worst of the
     seven. The three the cue uses are the warm ones, measured - the table is at
     WALK_FALLS.

     WHAT NO WINDOW IN IT CAN BE IS HEAVY: 1-9% below 300Hz on all seven, against
     77% on the version that earned that word.

     AND THE SEVENTH VERSION IS WHERE THE PAIR WENT. Six was TWO cues - foot1 and
     foot2, two 100ms windows out of this file, one per foot, alternated by the
     call site because "one sample retriggered is the machine again". The user's
     answer to it was "its still not implemented", and taken literally that is
     the right verdict: what they handed over is a WALK, seven footfalls at
     140-220ms, and the pair threw away the only thing a walk has that a footstep
     does not, which is its CADENCE. Two taps struck 300ms apart by a clock in
     recapSparkle are not that recording, they are two samples out of it - and
     each one peak-normalised, so 16 dB hotter than the same footfall sounds in
     their own file.

     SO IT IS ONE CUE AGAIN AND THE CUE IS A RUN. Three of their footfalls, each
     at its own loudness, in one buffer at one gain, and the recap plays as much of
     it as a leg has room for - two or three of them, faded out in the gap after
     the last one that fits. See WALK_CUTS, where that is derived, and sfx()'s
     `out`, which is the mechanism. The variety that the alternating pair and
     SFX_JITTER were between them trying to manufacture is in the recording.

     THREE OF SEVEN, AND CHOSEN BY BAND. Three of the seven footfalls in their
     take are brighter than the window this same user rejected as "still very
     harsh" - 35-47% of their energy above 5kHz - so the cue uses the three warm
     ones, at 0.060, 0.635 and 1.025. The measured table is at WALK_FALLS. This is
     the one place where being handed a file does not settle the question: their
     recording contains the fault as well as the fix.

     AND IT IS RE-SPACED, WHICH IS THE OTHER THING DONE TO IT. Their walk is 5.4
     footfalls a second - the same message that sent the file said "make it a
     little slow", about a game that was firing at 5.3 - so the cue lays the three
     at WALK_STEP_S, scaling their own 185/200ms unevenness rather than replacing
     it with an even interval: 269 and 291ms. The pace is the one that was asked
     for and the wobble in it is theirs.

     RE-SPACED, AND NOW RESAMPLED UP. This note used to end "and not resampled: a
     rate under 1 would slow the walk and drop it six semitones, and on a footstep
     pitch is SURFACE - that is how heavy got into this cue twice". That is a
     correct argument against going DOWN, and going up is the same physics in
     reverse: a smaller foot has higher resonances and a shorter decay, in one
     ratio. The user's next verdict was that it still sounded like an adult, and
     mass in 300-800Hz is what an adult footfall is. See WALK_RATES.

     THE SPACING IS STILL THEIRS AND STILL UNTOUCHED - smp()'s `from` plays the
     one buffer three times from three places at WALK_STEP_S, so the pace and its
     wobble are the recording's. What changed is the size of the foot, not the
     walk.

     NO FALLBACK, LIKE THE RECAP'S NINE. There is nothing to synthesise here: a
     filtered noise burst is the wooden rap this cue was rejected for on the first
     attempt. If the file will not load the footpath is silent, which is what it
     was before any of this.

     THREE RECORDINGS ARE NOW UNUSED BEHIND THIS and are worth keeping named
     rather than re-found: feet-light (stone), flipflop-wood (literally what the
     artwork shows him wearing, and 76/20/4 - all thud, no grain) and sand-walk.
     Panned at the call site to the middle of the leg it walks. */
  /* THE MAGIC TRAIL, AND IT IS NOT FOOTSTEPS ANY MORE. Nine versions of a
     footstep cue went into this beat - a wooden rap, bare feet on stone, their
     picture-book's own steps at two windows, dry sand, two taps cut from the
     user's walk, then that walk itself re-spaced twice - and the last word on it
     was "remove footsteps sound and replace it with cartoonish magical trail
     sounds with perfect timings".

     IT IS THE RIGHT CALL AND THE PICTURE SAYS SO. What travels the footpath is a
     magic sparkle Aaru snapped out of his fingers; the footprints are that path
     being READ BACK, not feet arriving. A footstep laid on a light is a sound on
     the wrong object, which is why no recording of a foot was ever going to
     settle it.

     A BELL TREE, AND IT IS THE WARM ONE. Measured against everything in this tree
     that could carry a shimmer: `magic` is 0/55/41/3/0 with a 1112Hz centroid and
     NOTHING above 5kHz, where the toy xylophones are 87-92% in 2-5kHz, `handbell`
     is 82/14 across 2-5k/>5k and `manjira2` is 78/22 at a 5506Hz centroid. This
     project has had "still very harsh" said to it about cues darker than any of
     those, and bar chimes at 0/11/89 were rejected on the band alone. The one
     magical sound in here that cannot make that mistake is this one.

     AND THEN IT SOUNDED MANUFACTURED, WHICH IS THE INTERESTING FAILURE. The user:
     "the magic trail sounds very mechanic and AI... i want it to sound very natural
     and cartoonish". Four things were doing that, and all four were mine rather
     than the recording's:

       1. A RINGING SOUND CUT OFF MID-RING. The shimmer was truncated at 0.31-0.63s
          with a 90ms fade, out of a 950ms sample whose whole identity is its decay.
          An abrupt end on a resonant thing is a SPLICE, and a splice is the sound
          of a machine having made the edit. Worse, it was never needed: measured in
          the browser there is 1.5s of clear air after every trail fire, and the
          tightest budget on any leg is 557 + 710 + 180 = 1447ms. It rings out now.

       2. A GLIDE WITH NO BEGINNING. The whistle started 1.22s inside a 1.78s rise,
          so what played was a pitch ramp with no attack and no articulation. That
          is what a synthesised sweep IS. `zipup` is a swanee whistle blown through
          its whole range - f0 364 -> 1000Hz, level -29 -> -7 dBFS - so it starts
          the way a person starts blowing one.

       3. NINE IDENTICAL COPIES. No jitter, because jitter had been removed when
          this beat was footsteps and a rate change would have slid the cut points.
          There are no cut points now, so SFX_JITTER.trail is back - and this
          project's own doctrine on `ride` says it in as many words: ten identical
          copies of anything at an even spacing is the machine again.

       4. TWO LAYERS ATTACKING ON THE SAME SAMPLE. A shimmer and a whistle starting
          at exactly t fuse into one stacked event rather than reading as a gesture.
          The whistle is 60ms behind the sparkle now, which is the difference
          between a chord and two things happening.

     WHAT IT IS MADE OF, and both halves are complete gestures: a real bell tree
     (0/55/41/3/0 at 1112Hz, attack then a full 950ms decay) for the magic, and a
     real swanee whistle (0/58/42/0/0 at 737Hz, a rise with a start) for the
     cartoon. Both warm, neither with anything above 5kHz, so neither can bring
     back the "harsh" this project has been told about four times.

     THE WHISTLE FADES AS IT ARRIVES rather than stopping at its top: dur 1.05
     leaves smp()'s own 130ms release running while the pitch is still climbing,
     which reads as the light going away from you. Ending a rise at its peak is the
     splice from (1) in the other direction. */
  trail: (c, t) => {
    smp(c, { at: t,        name: 'magic', peak: 0.85 });
    smp(c, { at: t + 0.06, name: 'zipup', dur: 1.05, peak: 0.50 });
  },

  footsteps_RETIRED: (c, t) => {
    /* Their gaps, scaled so the mean comes out at WALK_STEP_S. Computed rather
       than written down, so moving WALK_STEP_S cannot leave a stale table
       behind. */
    const gaps = WALK_GAPS;
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const k = WALK_STEP_S / mean;
    let at = t;
    for (let i = 0; i < WALK_TAKE; i++) {
      /* 10ms of room tone in front of the attack, so smp()'s 1ms head fade has
         something to fade and does not clip the transient itself. */
      /* dur IS DIVIDED BY THE RATE BECAUSE smp() MEASURES IT AT THE OUTPUT.
         `natural` in there is (buf.duration - from) / rate, so `dur` is output
         seconds - and at rate 1.75 a dur of WALK_SLICE would read 262ms of
         source, which is past the next footfall 190ms away. Dividing keeps the
         slice WALK_SLICE of SOURCE, which is what WALK_SLICE's note describes. */
      const rate = WALK_RATES[i] || 1;
      smp(c, { at: at, name: 'usersteps', from: Math.max(0, WALK_FALLS[i] - 0.010),
               dur: WALK_SLICE / rate, rate: rate, peak: 1 });
      at += gaps[i] * k;
    }
  },

  /* CHILDREN, ON THE CONFETTI. This voice is BACK, and its own note said what that
     would take: "it needs a beat of its own - after the snap has finished, not
     under it. A crowd is broadband, so laid over a pitched cue it masks the
     partials of the cue underneath."

     BOTH CONDITIONS ARE MET NOW. It fires from recapCheer - the confetti, the ten
     pictures lighting, and him clapping - which is twenty seconds after the snap
     and has no pitched cue running through it by the time it starts. It used to be
     held back 950ms at its call site to clear allDone's flourish; that flourish is
     gone, so it now fires on the frame the clap does.

     A ROOM, NOT A HANDFUL. The sample is a real audience of about 300 children
     aged four to ten reacting to a play, and the close-up handful of children
     clapping is a DIFFERENT recording used somewhere else - `roundDone` has that
     one. The two are not interchangeable: the close one is a few friends and this
     one is a hall, and the hall is what the end of a game should sound like.

     CUT TO 2.10s OUT OF 3.20, AND THE TRIM WAS THE ARRANGEMENT. It was fitted
     around `allDone`: fired 0.95s into that flourish, trimmed so the two ended
     together - children from 0.95 to 3.05, the flourish's last note from 1.91
     ringing to 2.86 - so the child heard the flourish, then a hall of children,
     then one note closing over them. The flourish is gone and the crowd now fires
     on the frame the clap starts, so the trim no longer has a cue to end with. IT
     IS KEPT AT 2.10 ANYWAY, and that is a choice rather than an oversight: 3.20s
     is a hall that outlasts everything on screen and turns the last beat of the
     game into waiting for a recording to finish. smp() puts its own release on a
     shortened sample, so the crowd fades rather than stopping.

     There is no fallback and there should not be: a crowd is the one thing in this
     set that cannot be synthesised into anything but noise. */
  cheer: (c, t) => { smp(c, { at: t, name: 'kidscheer', dur: 2.10, peak: 0.84 }); },
};

/** A gain that is open until a cue has to leave and shut by `out` seconds into
    it, fading over the `outFor` in front of that. Linear, like smp()'s own
    release, and it is the whole mechanism behind sfx()'s `out`. */
function outGain(ctx, at, out, outFor) {
  const g = ctx.createGain();
  /* NEVER BEFORE THE CUE STARTS. setValueAtTime with a time already past is
     applied immediately, so a fade asked to be longer than the cue is being cut
     to would open the cue half-way down instead of fading it out. */
  const from = Math.max(0, out - Math.max(0.01, outFor));
  g.gain.setValueAtTime(1, at + from);
  g.gain.linearRampToValueAtTime(0, at + out);
  return g;
}

/** Play one cue by name, optionally from a place across the stage, optionally a
    moment late, and optionally CUT SHORT.

    The decoded file is the normal path: BufferSource -> trim -> fade -> panner
    -> masterGain, so it lands in the same chain, room and limiter as everything
    else and can be placed on the screen. If the file is not there, the voice it
    was rendered from plays instead, and the game is quieter rather than silent.
    Harmless if audio is unavailable altogether.

    `out` IS WHEN THE CUE HAS TO BE GONE, in seconds from its own start, and it
    is a length the ANIMATION knows rather than one the cue does. A cue is
    rendered once into one file at one length - see the note on `rate` below,
    which is the same fact from the other end - so an animation whose sound has
    to stop when the MOVEMENT stops, rather than when the take runs out, can only
    ask for the file to be faded. Exactly one does: the ride. See ENTRY_SFX_OUT_S,
    the only caller.

    THE FADE LANDS ON `out` RATHER THAN STARTING THERE, over `outFor`, because
    what a caller knows is the moment its movement ends - not the moment a fade
    would have to begin for that to be true.

    It is level-neutral: a GainNode passes its input's channel count straight
    through, so putting one in front of the panner neither up-mixes the cue nor
    re-levels it. See place()'s 3 dB note for why that is worth saying out loud. */
function sfx(name, { pan = 0, delay = 0, rate = 1, out = 0, outFor = 0.45 } = {}) {
  if (SFX_MUTED.has(name)) return;      // ahead of the file AND the fallback
  const ctx = audio();
  if (!ctx) return;
  const at  = ctx.currentTime + 0.01 + delay;
  const buf = sfxBufs.get(name);

  if (buf) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    /* `rate` MULTIPLIES THE JITTER RATHER THAN REPLACING IT, and it exists for
       one caller: the ring filling. A cue is rendered ONCE into one file, so a
       cue that has to be a different note each time it fires can only be one
       note played at different speeds - see the note over PLACED_RATES. On a
       music box that is exactly right: pitching a struck bar up IS a shorter,
       higher bar. Everything else passes rate 1 and is unaffected. */
    const jitter = SFX_JITTER[name];
    const wobble = jitter ? 1 + (Math.random() * 2 - 1) * jitter : 1;
    if (rate !== 1 || jitter) src.playbackRate.value = rate * wobble;
    const trim = SFX_TRIM[name];
    let tail = src;
    if (trim && trim !== 1) {
      const g = ctx.createGain();
      g.gain.value = trim;
      tail = src.connect(g);
    }
    if (out > 0) tail = tail.connect(outGain(ctx, at, out, outFor));
    tail.connect(place(ctx, pan));
    src.start(at);
    /* Stopped as well as silenced, and only once it is silent: a source left
       running to the end of a file nobody can hear is a decoder still working on
       a cue that is over. */
    if (out > 0) src.stop(at + out + 0.02);
    return;
  }

  const voice = VOICES[name];
  if (!voice) return;
  try {
    /* THE FALLBACK FADES TOO, and the gain goes in FRONT of the pan so a voice
       that travels keeps travelling while it goes. It only reaches what the
       voice routes through place(), which is why the one voice with a fader on it
       routes its own travelling panner that way - see VOICES.swing. */
    let bus = pan ? place(ctx, pan) : null;
    if (out > 0) {
      const g = outGain(ctx, at, out, outFor);
      g.connect(bus || masterGain);
      bus = g;
    }
    if (bus) withBus(bus, () => voice(ctx, at));
    else voice(ctx, at);
  } catch { /* context died */ }
}

/** The sound of a card going into a frame: the supplied card-drop, and one note
    of the round's rising triad on top of it.

    The note is held back by STEP_DELAY_S. The card-drop is the impact and the
    note is the frame accepting it, and in that order they read as one event
    with a consequence; struck together they read as a chord with a click on the
    front. Both are panned to the frame, so a card going into the left-hand
    frame is heard on the left — which the mp3 could not do at all while it was
    an <audio> element. */
function playPlaced(slotIndex) {
  const pan = panAt(SLOT_CENTER[slotIndex].x);
  sfx('correct', { pan });
  /* ONE SOUND, and this is the reversal the step notes' own comment described:
     "Delete the three entries from SFX_SRC and the two lines in playPlaced() to
     go back to the card-drop alone." Done, on request — a placement is the
     card-drop and nothing else now.

     WHAT WENT WITH THEM, so that nobody re-derives the idea from scratch. Each
     placement used to ring one note of a rising Ab major triad, so by the third
     card the child had spelt out a chord, and roundDone then took off from that
     same chord — the finish was audibly the completion of the thing they had
     built rather than a new noise arriving. The VOICES entries are still there
     and still in tune; restoring the mechanic is this line plus the three
     SFX_SRC/SFX_PLAN entries. It is a real idea and it may be worth another go
     with a different instrument. It is not this one. */
}

/* --- the narrator -----------------------------------------------------------

   The narration from the gameplay sheet, played from the seventeen recordings
   in assets/voiceover/. The number in each filename is its dialogue number on
   the sheet, so the two can be read side by side.

   THEY ARE TWO DIFFERENT JOBS. 25-29 are the narrator proper: she asks, she
   praises, she hands the game over, and she speaks unprompted. 13-24 are the
   sheet's "Hint VO on 2nd Wrong Attempt" column — one per picture, spoken only
   to a child who has just been wrong twice on that picture. They are the same
   voice and the same session (same 24 kHz, same 0.135s of lead-in, same 0.285s
   of tail, and see LEVEL), but nothing in the game treats them as one set: the
   first live in VO_SRC and are chosen by what they DO, the second hang off the
   cards in ROUNDS and are chosen by which picture is being asked for.

     25  ज़रा याद करो... कहानी में सबसे पहले क्या हुआ था?
     26  वाह! सही पकड़ा! सबसे पहले आरु को भूख लगी थी।
     27  अब बताओ, उसके बाद क्या हुआ?
     28  बहुत बढ़िया! उसके बाद आरु की छींक से सारा आटा उड़ गया।
     29  शाबाश! कहानी की शुरुआत तो हो गई, अब बाकी चित्रों की बारी।
         चलो, आगे की कहानी को सही क्रम में लगाओ।

   And the hints, in the sheet's screen order, which is the story's order —
   the card each one belongs to is in the third column. The first column is the
   SHEET'S position, 1 to 12, and it is neither a screen number nor this build's
   story position: the line carries pictures across a seam, so this build has
   five screens holding 3-2-2-2-2 new pictures, and it does not hold the sheet's
   sixth picture at all. r2 hurt left the game when every seam was made to carry
   exactly one frame (see the windowing note over ROUNDS), so dialogue 18 is
   recorded, still in assets/voiceover, and never played. The other eleven each
   sit at exactly one sheet position however the screens are cut, which is what
   lets this table survive a re-windowing:

     story   file  line                                                  card
      1      13    सबसे पहले आरू को भूख लगी थी।                          r1 house
      2      14    उसके बाद आरू की छींक से सारा आटा उड़ गया।              r1 sneeze
      3      15    उसके बाद आरू ने देखा कि डिब्बे में आटा खत्म हो गया।     r1 pot
      4      16    उसके बाद आरू साइकिल लेकर आटा लेने बाज़ार चला।           r2 ride
      5      17    उसके बाद छींक आने से आरू साइकिल से गिर गया।            r2 fall
      6      18    उसके बाद आरू ने उठकर अपने कपड़े झाड़े।                  r2 hurt  <- NOT IN THE GAME
      7      19    उसके बाद आरू की छींक से गन्ने का रस गिर गया।           r3 cart
      8      20    उसके बाद आरू की छींक से समोसा गिरा और कुत्ता उसे
                   चट कर गया।                                           r3 dog
      9      21    उसके बाद उदास आरू आटा लेकर घर लौट आया और थोड़ी
                   देर में अम्मा भी वापस आ गईं।                           r3 home
     10      22    उसके बाद आरू की छींक से रसोई के बर्तन गिर गए।          r4 sneeze
     11      23    उसके बाद अम्मा को अपना खोया हुआ लॉकेट मिल गया।         r4 pickup
     12      24    आखिर में, अम्मा ने कहा कि आरू की छींक तो कमाल की है।    r4 earring

   HOW THAT THIRD COLUMN WAS ARRIVED AT, because it is the only judgement in
   this block and it is worth being able to check. The sheet numbers screens and
   this build's screens are not the sheet's: it has five of them, holding three
   new pictures and then 2-2-2-2. But the sheet's twelve screens ARE twelve story
   positions, and the concatenation of every screen's `order` is eleven of those
   twelve in the same order — the join is held that way precisely so tables like
   this one survive a re-windowing (see the note over ROUNDS). So the sheet's
   screen N is sheet position N and the hint is dialogue 12+N, WITHOUT any
   arithmetic from a round and a slot: the old reading,
   `round floor((N-1)/3), slot (N-1)%3`, only worked while every screen held
   exactly three and is now wrong.

   AND 12+N IS NOT THE GAME'S OWN COUNT ANY MORE. Nothing in app.js does that sum
   - a card carries its own `vo` - but tools/sim.js `hints` used to, off a running
   story position, and the moment story 6 left the game that arithmetic named the
   wrong recording for every card after it. It reads the number off the card's
   own vo path now. Anything else that derives a dialogue number from a position
   has the same bug waiting in it.

   Ten of the twelve confirm the mapping on their own: 4 names a bicycle and a
   market and position 4 is `ride`; 8 names the dog and position 8 is `dog`; 9
   names the sad walk home with the flour, which is `home`, whose own alt had to
   be corrected once from exactly that mistake. Note that the cards' array order
   in ROUNDS is the TRAY order, not this one, so the table above is against
   `order` — reading it against `cards` puts several of the twelve on the wrong
   picture.

   THE TWO THAT ARE A JUDGEMENT are 11 and 12, and they are worth a second pair
   of eyes for the same reason round 4's `order` is. 11 is "अम्मा को अपना खोया
   हुआ लॉकेट मिल गया" and 12 is the story's closing line, "अम्मा ने कहा कि आरू की
   छींक तो कमाल की है" — which does not describe a picture at all. Taken by
   description alone, 11 wants r4-earring, which is drawn as the mother holding
   the locket up. Taken by position it gets r4-pickup, which is drawn as her
   bending over the fallen pots with the locket glinting on the floor beside
   her — the moment of finding it rather than the moment after. Position wins,
   because it is the sheet's own structure and the other ten confirm it, and
   because r4-earring — mother delighted, Aaru grinning and scratching his head
   — is the picture the closing line is about. If round 4's `order` is ever
   corrected, correct these two with it.

   AND THEY ARE NOT PRAISE. Nothing here says शाबाश or वाह; a hint is spoken to
   a child who is getting it wrong, and 26 and 28's shape would be a lie at that
   moment. What the line does is name the event, which is the answer to the
   question the banner is asking, in the same words the story tells it in.

   WHICH SCREENS HAVE ONE: all twelve. This is the only column of the sheet
   that is complete — the praise lines are not; see the gap noted below.

   ALL TWELVE ARE REACHABLE, AND FOUR OF THEM ONLY BECAME SO RECENTLY. This
   said the opposite for several builds and the reasoning is worth keeping,
   because it is a good example of a negative claim outliving the thing that
   made it true:

     "ONLY EIGHT OF THEM CAN EVER BE HEARD. A hint is spoken on the 2nd WRONG
      attempt, and at the third frame of a screen there is nothing left to be
      wrong with: two cards are in their frames, the tray is down to one, and
      it is the right one. Every route into tryPlace refuses a card that is
      already placed. Dropping the right card on the WRONG frame does not count
      either; that is `counts: false`. So 15, 18, 21 and 24 are wired,
      preloaded, and unreachable."

   Every sentence of that was true of the code it was written against, and the
   last one was the whole of it. There is no rule anywhere in the sheet that an
   incorrect attempt has to be a wrong CARD — it says "1st / 2nd / 3rd incorrect
   attempt", and a child who puts a picture into a frame that will not take it
   has plainly made one. tryPlace() counts those now, so the third frame's
   ladder runs on a drop into a filled frame and the four play. See the note
   there for the measurement, and `node tools/sim.js hints` for the table, which
   now walks every one of them.

   THE IDLE LADDER STILL DOES NOT SPEAK, and that decision is unchanged. The
   obvious-looking home for these four used to be the third frame's idle hints,
   and it was declined: the sheet's Idle Hint column is a pulse and a hand
   nudge, it is not a voice. What has changed is that the reason anyone wanted
   to put them there — that they were otherwise unreachable — is gone. Do not
   "fix" the idle ladder into speaking without asking; it is still a decision
   and not an oversight.

   WHICH LINE GOES WHERE. The sheet is in two halves. The Tutorial narrates the
   first two events by name — ask, praise, ask, praise, which is 25, 26, 27, 28
   — and Level 1 begins at the THIRD picture with one line of its own, 29.

   So 29 is not a screen boundary. It is the scaffolding coming off: the child
   has been walked through two events and is now told to do the rest. The sheet
   puts that moment after the second answer — and this build's first screen
   holds three pictures, so that is one card short of the point the build itself
   marks, with a cheer, a clap and a haul.

   29 IS SPOKEN AT THE SHEET'S OWN POINT: the moment the SECOND card goes in.
   It used to be spoken one card later, when screen 1 was finished, and the
   argument for that is worth keeping because it was a good one that has since
   been overtaken:

     "29 is spoken at the marked point: when screen 1 is finished. One card later
      than the sheet, and the only window in the game that will hold 8.49s of
      speech with nothing able to cut it — which the alternative did not,
      measurably (see finishRound)."

   Every word of that was true, and the parenthesis was the whole of it: queued
   behind the second praise, 29 was dropped by hush() the instant a child placed
   the third card, so the faster the child the less likely they were to hear the
   game hand over to them at all. What has changed is that hush() no longer drops
   it — see `hold` on VO_SRC.handoff — so the window is no longer the reason to
   put the line anywhere. With the reason gone, the line goes where the script
   puts it, which is also where the user asked for it: "the Tutorial ends after
   the second interaction".

   WHAT SCREENS 2-4 GET: nothing, and this is the second half of the same change.
   The sheet gives them no recordings of their own. What they used to be given
   was 29's last sentence — चलो, आगे की कहानी को सही क्रम में लगाओ, word for word
   the question their banner already shows — played out of the same file by
   offset, on arrival and again on every stall. Counted over a real playthrough
   that is one sentence six times and more, and the user heard it as the
   instruction "replaying continuously throughout the game".

   So Level 1's instruction is now given ONCE, in its place inside 29, at the
   seam it belongs to; screens 2-4 arrive in her silence with the same sentence
   on the banner. askOrder still exists and still has no line invented, re-cut or
   re-levelled behind it — it simply has no caller. See VO_SRC.askOrder for how
   to give those screens their voice back if that is ever wanted.

   The praise lines are the gap worth knowing about. 26 and 28 name the specific
   event the child just placed, so there is nothing that can honestly be said
   when a card lands on screens 2-4 — the placement cue and the rising step note
   carry it instead. Twelve praise lines would fix that; nine are missing. See
   the `narration` blocks in ROUNDS for exactly what each screen has.

   HOW IT PLAYS. Through the same context as the effects, but not through the
   same room, and on its own bus — see the note in buildChain. Only one line
   sounds at a time and a new one interrupts the old, because a child who has
   already answered should not have to sit through the question.

   LEVEL. Measured, like the effects, and re-measured when the hints landed.
   All seventeen sit between -11.9 and -13.6 LUFS as the browser hears them —
   they are mono, and WebAudio copies a mono buffer to both channels, which
   measures 3.0 dB above the file itself — so there are no per-line trims here
   at all: one bus gain does it.

   THE SPREAD WIDENED AND IT STILL DOES NOT NEED TRIMS. 25-29 were 0.4 dB
   apart; the hints are 1.6 dB apart (-12.0 on 14 and 20, -13.6 on 18), so the
   set is now 1.7 dB end to end. That is a third of what a per-line trim is
   worth reaching for and it is well inside the variation between one sentence
   and the next inside a single file. Measured the way the bench measures a cue
   — BS.1770 K-weighting over the active window at -60 dB, resampled to the
   context's 48k first, because these files are 24 kHz and the tabulated
   coefficients are not.

   ONE FILE IS WORTH KNOWING ABOUT: dialogue 19 peaks at +0.3 dBFS after that
   resample, from -0.9 in the file itself — an intersample peak the 24 kHz
   samples do not show. Through VO_VOLUME it lands at -5.7 dBFS, which is 1.1 dB
   hotter than the -6.8 the table below is drawn at and still inside the
   limiter's reach. Nothing to do about it unless VO_VOLUME is raised, at which
   point 19 is the file that reaches 0 first, not 14 or 20.

   AND THE FIRST SET OF THOSE NUMBERS WAS RIGHT AND STILL WRONG, which is the thing
   worth keeping. It read: VO_VOLUME's 0.20 puts her at -26.0 LUFS, 6.2 dB ABOVE the
   effects at -32.2, with her peaks at -15.6 dBFS just under the limiter's threshold.
   Every one of those figures re-measures correctly off the files. The user still
   could not hear her: "voiceover of the game is very low in volume as compared to
   sfx and sound effect".

   WHAT INTEGRATED LOUDNESS CANNOT SEE IS CREST FACTOR. Her loud-part RMS is -14.2
   dBFS in the file against peaks of -1.7 — a 12.5 dB crest, which is ordinary for
   speech. The effects are the opposite shape: a card drop or a thud is 150-300ms of
   transient whose PEAK sits within a couple of dB of hers while its integrated
   loudness, gated over 400ms blocks, comes out 6 dB below. So the two are level on
   the meter and nowhere near level in the ear, moment to moment — and the effects
   also carry 16% of a 0.7s room on top (she deliberately does not; see buildChain),
   which adds sustain the meter charges her nothing for.

   THE NUMBER THAT SHOWS IT is the peak column of the effects table above, which was
   already there and was not being read against her. Through the chain at the
   SFX_VOLUME of the time: thud peaked at -3.9 dBFS, the old allDone -9.0, pop -8.0,
   haul -8.5, wrong -11.8 — against her -14.4. She measured 6 dB louder and peaked 10.5 dB QUIETER
   than the loudest thing she had to be heard over. Crest factors of 20-25 dB on the
   cues against 12.8 on her is the whole of it.

   SO SHE WENT UP 7.9 dB AND THE EFFECTS CAME DOWN 2.4, which put her peaks level
   with thud's and 4-8 dB above everything else's, and her active RMS about 10 dB
   above the cues' loudness. Measured through the real limiter rather than reasoned
   about, because the reasoning was wrong the first time — a soft-knee calculation
   said 0.36 would already cost her 3.4 dB of peak reduction. It does not:

       VO_VOLUME   peak dBFS   active RMS   crest
         0.20        -14.4       -27.3      12.9
         0.36         -9.4       -22.2      12.8
         0.44         -7.8       -20.5      12.7
         0.50         -6.8       -19.4      12.6      <- this
         0.58         -5.7       -18.2      12.5

   AND THE EFFECTS HAVE SINCE COME BACK UP 7.0 dB AND THEN 4.0 MORE, both times on
   the user saying the effects should be as loud as the voiceover, so the balance
   this note argues about is no longer the balance that ships. HER NUMBERS ARE
   UNCHANGED — VO_VOLUME is still 0.50 and the table above still measures — but the
   gap it describes is not: she averages -16.9 LUFS and the effects now average
   -19.1, where they were -29.1 when this was written.

   WHAT KEEPS THE ORIGINAL FAILURE FROM COMING BACK IS THE DUCK, not the gap. She
   was inaudible when the effects sat 6 dB under her WHILE SHE WAS SPEAKING; the
   duck is what governs that number and nothing else does. It has gone 6 -> 9 -> 12
   dB, once per move of the bus and by the same amount each time, so under her
   voice the effects still land at -31.2 and she still keeps a 14.3 dB margin. The
   11 dB the bus has gained is spent entirely on the silences between her lines,
   which is where a child is looking at the cards rather than listening to her.

   READ THIS NOTE AS THE ARGUMENT AND NOT AS THE LEVELS. What survives is the
   reasoning — integrated loudness cannot see crest factor, so a set of 200ms
   transients masks speech that measures louder than it. What does not survive is
   the arithmetic: see SFX_VOLUME for the numbers that ship.

   THE CREST FACTOR IS FLAT ACROSS THE WHOLE RANGE, so the limiter is barely touching
   her anywhere in it — 0.4 dB of it over a 9 dB gain sweep. WebAudio's 22 dB knee is
   far gentler than the textbook formula for it, which is why the split was made more
   conservative than it needed to be on the first pass. Re-measure with
   scratchpad/level.js's method (an OfflineAudioContext, this compressor's four
   settings, peak and RMS over the active window) before moving this again.

   AND SPLIT AT ALL, rather than all on her bus, for headroom: at 0.50 she peaks
   -6.8, and while she is talking VO_DUCK has the effects 6 dB down, so a thud under
   a sentence sums to about -6.0 dBFS. That is the tightest moment in the mix and it
   is inside the limiter's reach, which is what the limiter is for.

   WHAT NOT TO DO NEXT, if she is ever still too quiet: not VO_VOLUME on its own —
   past about 0.58 her peaks start eating the headroom the effects need for their own
   sums. The next honest move is her own compressor ahead of the shared limiter, so
   she can be levelled hard without the effects' backstop deciding how hard.
   -------------------------------------------------------------------------- */

/** True while the narrator has anything left to say. */
function speaking() {
  /* praiseTimer COUNTS AS TALKING. A correct placement holds her praise off for
     PLACE_LEAD_MS so the reward chime is not ducked to a twelfth of itself, and
     render() runs on the placement tick - so for those 620ms she was not yet
     speaking, the next frame lit up and pulsed, and her line then put it out
     again. The user saw exactly that: "there was a glitch for a second, the 2nd
     frame pulsed then voiceover happened." A line that is committed to and
     merely waiting on a chime is a line she has left to say.

     EVERY clearTimeout(praiseTimer) MUST NULL IT. This is now read as state, not
     just held as a handle, and a cleared-but-not-nulled timer would leave her
     permanently talking and the board permanently locked. */
  return voNode !== null || voQueue.length > 0 || praiseTimer !== null;
}

/** True whenever a tap, click or drag must have no effect on the board: a
    round transition (`locked`) or the narrator having anything left to say.
    Every listener that starts or resolves a placement gesture checks this
    rather than `locked` alone, so the screen goes inert the moment she opens
    her mouth and wakes up the instant sayNext() finds her queue empty. */
function inputLocked() {
  return locked || speaking();
}

/** Resolve a line: a VO_SRC key, or an inline { src } — which is what a card's
    own `vo` path becomes. */
function voLine(name) {
  return typeof name === 'string' ? VO_SRC[name] : name;
}

/** How long a narration line actually runs, in ms — the VO twin of cueLen(),
    and it exists for the same reason: something has to WAIT for a line, and a
    wait built on a number typed into the source goes stale the day the take is
    re-recorded.

    `from`/`to` are honoured, so this is the length of the SENTENCE and not of
    the file — askOrder is one sentence out of an 8.49s recording.

    ZERO WHEN IT IS NOT DECODED, which is the safe answer rather than a guess: a
    caller taking max(floor, this) then keeps its floor, so a recording that
    failed to load shortens the ending instead of hanging it on a length nothing
    can supply. */
function voLen(name) {
  const line = voLine(name);
  if (!line) return 0;
  const buf = voBufs.get(line.src);
  if (!buf || !isFinite(buf.duration)) return 0;
  const from = line.from || 0;
  const to   = line.to || buf.duration;
  return Math.max(0, (to - from) * 1000);
}

/** Say these lines, in order, instead of whatever is being said now. Takes one
    name or a list, and ignores names with no recording behind them.

    AND IT STOPS THE IDLE CLOCK, which is the other half of an invariant that
    used to be enforced at only one end. "The clock only runs from silence" was
    written into armIdle(): it refuses to ARM while she has anything left to
    say, and sayNext() arms it again the instant her queue empties. What neither
    of those can do is cancel a countdown that was already running when she
    opened her mouth — and there is a completely ordinary path that leaves one
    running.

    THE PATH, WHICH IS SCREEN 1'S SECOND PLACEMENT. placeCard() calls sayAnswer()
    and then resetIdle(), in that order, and sayAnswer does not speak on the
    spot: it holds her off for PLACE_LEAD_MS so the reward chime is not ducked
    the moment it starts. So resetIdle() arms the 9-second clock into what is
    still silence, 620ms later she starts goodNext (6.91s) and handoff (8.49s)
    behind it, and the clock goes off nine seconds in — a third of the way
    through the handover.

    WHAT THAT LOOKED LIKE, and it is the user's own report: "only pulsate the
    options after the narrator voiceover has ended, because right now the screen
    is inactive when the narrator is saying." inputLocked() is locked||speaking(),
    so every one of those pulses was the board pointing at three cards it was
    about to refuse. Measured by `node tools/sim.js teach`, which now gates on
    it: 15 samples of pulse=3 under `handoff`, from 31.40s.

    ONE LINE HERE COVERS EVERY CASE because this is the only way anything is
    ever said — playVO() routes through it too, and speaking() reads voNode and
    voQueue, which nothing else writes. armIdle() clears both hint timers before
    it checks anything, so calling it here cancels them and then returns at the
    speaking() guard. */
function say(names) {
  if (!VO_VOLUME) return;
  const list = (Array.isArray(names) ? names : [names]).map(voLine).filter(Boolean);
  cancelLine();
  if (!list.length) { duck(false); return; }
  voQueue = list;
  duck(true);

  /* NOTHING ON THE SCREEN PULSES WHILE SHE IS TALKING, and this is the one
     place that can promise it, because say() is the only way any line ever
     starts - sayAnswer, playVO and every timer route through here.

     ARMING WAS NOT ENOUGH. armIdle() below has always been called from here,
     and its job is to make sure no hint is OWED once she starts; what it cannot
     do is take down a hint that is already up, because it only cancels the two
     timers. So a pulse or a hand that went up during a silence stayed up right
     through the next line - measured in the browser: with her mid-sentence,
     `speaking` true and the board locked, the frame still carried is-active and
     both frame-ring and frame-lift, a card still carried is-hinted, and both
     hands were still on screen. The user reported it as a rule rather than a
     bug: "no thing will pulse on the screen when the narrator is speaking."

     AND THE FRAMES NEEDED REPAINTING, NOT JUST THE HINTS. The frame in turn
     drops is-active whenever inputLocked() - which speaking() is half of - but
     only a render() writes that, and the only render() on a speech boundary was
     the one releasePrompt() does when her queue empties. So the pulse stopped
     correctly at the END of a line and never at the start of one, which is
     invisible while the pulse is a 5px ring inside the recess and impossible to
     miss once it is the frame's own outline. paintSlots() is the render() that
     is safe to call from here; see the note on it.

     WHAT COMES BACK, AND WHEN. sayNext() calls armIdle() the instant the queue
     empties, so the ladder restarts from the bottom on her last word and the
     child gets rung 1 again after the tuned wait. The one hint that must not be
     merely re-armed is the third wrong attempt's, which is the only place the
     CORRECT card is ever shown - that one keeps its debt and pays it on the
     first quiet tick instead. See the pulseTimer in reject(). */
  hideHand();
  clearPulse();
  armIdle();                      // she is talking now: no hint may be owed
  paintSlots();                   // ...and the frame in turn stops pulsing too
  sayNext();
}

/** Drop what is queued but let the line that is sounding finish.

    This is the moment a child answers a question that has a praise line queued
    behind it on some screens and nothing on others. Where there is nothing to
    say, cutting her off mid-word to replace her with silence is worse than
    letting the sentence land — but whatever was queued BEHIND it has to go, or
    the game asks for a card that is already in its frame.

    ...UNLESS IT IS NOT A QUESTION. `hold` marks a line that a placement cannot
    make stale, and there is exactly one: the Tutorial's handover, 29, which now
    waits behind the second praise. What this function is protecting against is
    the game ASKING for a card already in its frame; a line that only says "the
    story has begun, now do the rest" is true whichever card just went in. Before
    the flag, a child quick enough to place the third card inside 28 deleted the
    whole handover and never knew it was there. See VO_SRC.handoff. */
function hush() {
  voQueue = voQueue.filter(line => line.hold);
}

/** Stop the narrator dead, and let the effects back up. */
function stopSaying() {
  cancelLine();
  duck(false);
  paintSlots();                   // a hard stop never reaches sayNext's empty branch
}

/** Silence her without touching the effects' level — for say(), which is about
    to duck them again in the same breath. */
function cancelLine() {
  voTurn += 1;                    // any end still to be reported is now stale
  clearTimeout(voGuard);
  voGuard = null;
  voQueue = [];
  if (voNode) {
    try { voNode.stop(); } catch { /* already finished */ }
    voNode = null;
  }
}

function sayNext() {
  const next = voQueue.shift();
  if (!next) {                    // the queue is empty: her mouth is free
    voNode = null;
    duck(false);
    releasePrompt();              // nothing is coming to move the banner on
    armIdle();                    // the idle clock runs from silence — see armIdle
    /* AND THE FRAME IN TURN STARTS PULSING AGAIN. say() stops it on her first
       word, so something has to start it on her last one, and releasePrompt()
       above is not it: that returns at once unless a banner was actually pinned,
       which on most lines it was not. Without this the pulse went off at the
       first line of the game and never came back - the frame stayed is-active
       for the whole game before, only because nothing had ever taken it off. */
    paintSlots();
    return;
  }

  /* ANYTHING THIS LINE HAS TO DO THE MOMENT IT OPENS ITS MOUTH. One caller:
     sayAnswer(), which hangs the banner's release on the line that asks the
     next question, so the wall and the voice change together.

     IT IS FIRED ABOVE THE BUFFER CHECK ON PURPOSE. A line whose recording never
     loaded is skipped below, and a banner waiting on a line that is skipped
     would never move again — the child would be asked frame 1's question for
     the rest of the screen. Whatever the hook does, it must happen whether or
     not there is a sound to go with it. */
  if (next.onStart) next.onStart();

  const ctx = audio();
  const buf = ctx && voBufs.get(next.src);
  if (!buf) { sayNext(); return; }  // never loaded: skip it rather than stall

  const from = next.from || 0;
  const dur  = (next.to || buf.duration) - from;
  const turn = ++voTurn;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  /* A PER-LINE TRIM, for a supplied recording that does not sit at the level of
     the set. One line uses it - see VO_SRC.aaruDone, which has the measurement
     and the argument for trimming in code rather than rewriting the file. The
     node is only built when there is something to trim, so every other line is
     the same single connection it always was, and it needs no teardown: it dies
     with the source that feeds it. */
  if (next.gain && next.gain !== 1) {
    const trim = ctx.createGain();
    trim.gain.value = next.gain;
    trim.connect(voiceGain || masterGain);
    src.connect(trim);
  } else {
    src.connect(voiceGain || masterGain);
  }
  src.onended = () => lineEnded(turn);
  src.start(ctx.currentTime + 0.01, from, dur);
  voNode = src;

  /* onended does not arrive while the tab is in the background, and everything
     queued behind this line would wait for it — including the idle clock, which
     only starts once she is quiet. Same backstop as the haul and the
     celebration keep. */
  voGuard = setTimeout(() => lineEnded(turn), dur * 1000 + 400);
}

/** One line finished, from whichever of its two reports arrived first. */
function lineEnded(turn) {
  if (turn !== voTurn) return;
  voTurn += 1;                    // ...so the other one is ignored
  clearTimeout(voGuard);
  voGuard = null;
  /* Stopped, not just forgotten. If the backstop is ever the one that gets here
     first — a throttled tab, a context that was slow to start — the line is
     still sounding, and the next one would start over the top of it. */
  if (voNode) {
    try { voNode.stop(); } catch { /* already finished */ }
    voNode = null;
  }
  sayNext();
}

/** Pull the effects down while she talks, and let them back up after.

    setTargetAtTime, and nothing cancelled: a later target simply supersedes an
    earlier one from wherever the value has reached, which is the smooth
    behaviour wanted here and is why the two directions can safely land in the
    same tick. She is not on masterGain, so this moves everything except her. */
function duck(on) {
  if (!audioCtx || !masterGain) return;
  masterGain.gain.setTargetAtTime(on ? SFX_VOLUME * VO_DUCK : SFX_VOLUME,
                                  audioCtx.currentTime, on ? 0.04 : 0.12);
}

/** Voice-over for a picture card, played on the 2nd incorrect attempt. Through
    the narrator's bus like everything else she says, so it is at her level, in
    her space, and it interrupts her rather than talking over her. */
function playVO(cardId) {
  const spec = cardSpecs.get(cardId);
  if (!spec || !spec.vo) {
    if (!playVO.warned) {
      playVO.warned = true;
      console.info('[aaru] no hint VO for card "' + cardId + '" — every card in ' +
                   'ROUNDS should carry a `vo` (dialogues 13-24; see the table in ' +
                   'the narrator section). The game carries on with its pulse and ' +
                   'its hand nudge, which are the other two rungs of the ladder.');
    }
    return false;
  }
  say([{ src: spec.vo }]);
  return true;
}

/* What tools/render-cues.js reaches in through. The voices, the master chain
   and the two module-level nodes the offline renderer has to redirect —
   masterGain, so a voice can be rendered somewhere other than the speakers,
   and noiseBuf, which belongs to whichever context built it and must be
   rebuilt per render. Nothing in the game reads this; it exists so the bench
   can render the real engine rather than a copy of it. */
window.AARU_AUDIO = {
  VOICES, SFX_SRC, SFX_TRIM, SFX_JITTER, SFX_MUTED, SFX_PLAN, SFX_SUPPLIED,
  SFX_HOUSE_LUFS,
  SFX_VOLUME, ROOM_S, ROOM_MIX, STEP_DELAY_S,
  buildChain, primeSfx, sfx, sfxBufs,
  /* The ride's sound window, for tools/audition-cues.js - which plays cues
     without playEntry(), so it has to be handed what playEntry() passes or the
     audition would be demonstrating a cue the game does not play. A function
     because the constants are derived further down this file than this object
     is built. */
  rideOut: () => ({ out: ENTRY_SFX_OUT_S, outFor: ENTRY_SFX_FADE_S }),
  /* ...and the recap's walk, which is cut per leg for the same kind of reason:
     the two-footfall cut every one of the nine legs takes. */
  /* The trail's fade, for tools/audition-cues.js - the same fixed fade the
     live call site uses now (TRAIL_OUT_S/TRAIL_OUT_FOR_S), not a per-leg cut:
     the supplied recording outlasts every leg's budget, not just the short
     ones, so there is no "representative leg" any more - see the constants'
     own note. */
  trailOut: () => ({ out: TRAIL_OUT_S, outFor: TRAIL_OUT_FOR_S }),
  /* The recorded samples, and the loader for them. THE BENCH CALLS loadSamples()
     AND THE GAME NEVER DOES — that is what keeps the recordings out of the
     child's download. A bench run that forgets it renders the oscillator
     fallbacks instead, which is why loadSamples() reports what it got. */
  MB, SAMPLE_SRC, SAMPLE_DIR, sampleBufs, loadSamples,
  ctx: () => audioCtx,
  getMaster: () => masterGain,
  setMaster: (g) => { masterGain = g; },
  getNoise:  () => noiseBuf,
  setNoise:  (b) => { noiseBuf = b; },
};

/* --- stage scaling --------------------------------------------------------- */

/* IS THE BOARD ON ITS SIDE? Set by fitStage, read by toStage - they are the two
   halves of one mapping and the second cannot invert the first without knowing.
   Kept as a flag rather than re-derived from the transform string, because
   parsing back a matrix to answer a yes/no question is how the two halves get to
   disagree. */
let stageTurned = false;
let turnedWas   = null;      // to catch the moment it changes, not every resize
let turnHintTimer = null;

/** Say why the board is on its side, once per time it goes on its side.

    Called from fitStage. Keyed on the CHANGE and not on the state, because
    fitStage runs on every resize - and iOS fires those in bursts as its toolbars
    slide, which would re-arm this several times a second and leave it up for
    ever. Turning the phone is what makes it unnecessary, and turning the phone
    is exactly what sets stageTurned false, so it takes itself away. */
function turnHint(turned) {
  if (turned === turnedWas) return;
  turnedWas = turned;

  const el = document.getElementById('turnHint');
  if (!el) return;

  if (turnHintTimer) { clearTimeout(turnHintTimer); turnHintTimer = null; }

  if (!turned) {
    el.classList.remove('is-live');
    turnHintTimer = setTimeout(() => { el.hidden = true; }, 420);
    return;
  }

  el.hidden = false;
  /* One frame with the element laid out but still at opacity 0, or the
     transition has nothing to run from and it simply appears. */
  requestAnimationFrame(() => el.classList.add('is-live'));
  turnHintTimer = setTimeout(() => {
    el.classList.remove('is-live');
    turnHintTimer = setTimeout(() => { el.hidden = true; }, 420);
  }, 3600);
}

/** Fit the fixed canvas into the viewport, letterboxed and centred.

    THE BOARD IS 16:9 AND A PHONE HELD UPRIGHT IS NOT, and that is the whole
    reason this turns. Measured, before it did:

      iPhone portrait   390x844    board 390x219    26% of the screen
      iPad portrait     820x1180   board 820x461    39%
      iPhone landscape  844x390    board 693x390    82%
      iPad landscape    1180x820   board 1180x664   81%
      laptop            1440x900   board 1440x810   90%

    A child holding a phone upright got a quarter of their screen used and 625px
    of bare wood above and below it - which is what "it should be as perfect as it
    is on my laptop" is about. Turning the canvas a quarter turn puts portrait
    back on the same 81-82% as landscape, because it is the same fit with the two
    axes swapped.

    ONLY ON A DEVICE THAT CAN ACTUALLY BE TURNED. The test is `pointer: coarse`,
    not the aspect alone: a desktop window dragged tall and narrow also fits
    better rotated, and rotating it would be nonsense - nobody turns a monitor.
    On a phone or tablet it means the child simply rotates the thing in their
    hands, which is what they already do for video.

    THE MATH, once, so nobody re-derives it from the transform: with
    transform-origin 0 0, `rotate(90deg)` sends a point (sx, sy) to (-sy, sx).
    So the box lands x in [tx - s*STAGE_H, tx] and y in [ty, ty + s*STAGE_W] -
    its on-screen width is s*STAGE_H and its height s*STAGE_W, the two swapped,
    and the left edge needs tx pushed right by the full width. toStage() inverts
    exactly this. */
function fitStage() {
  /* INSIDE THE SAFE BOX, NOT AGAINST THE SCREEN. index.html declares
     viewport-fit=cover, and a phone in landscape is height-constrained (every
     notched iPhone's landscape aspect is past 2.0, the stage is 1.778), so y
     landed at exactly 0 and the board ran edge to edge. The bottom ~58 design px
     was under the home indicator: the tray's rim ends at y=1039, and .celebrate
     is `bottom: 0`, so the clapping mascot's feet sat behind the pill on every
     completed screen. That band is also iOS's swipe-up gesture region, and
     touch-action:none cannot pre-empt an OS gesture - a finger that drifted into
     it mid-drag handed the touch to the system and onCardPointerCancel snapped
     the card home with nothing to explain it. Costs about 5% of scale in
     landscape; the note over --play-w already budgets for ~0.35 there. */
  const cs = getComputedStyle(document.documentElement);
  const ins = (n) => parseFloat(cs.getPropertyValue(n)) || 0;
  const t = ins('--sa-t'), r = ins('--sa-r'),
        b = ins('--sa-b'), l = ins('--sa-l');

  const vw = window.innerWidth  - l - r;
  const vh = window.innerHeight - t - b;

  const flat = Math.min(vw / STAGE_W, vh / STAGE_H);       // as drawn
  const turn = Math.min(vh / STAGE_W, vw / STAGE_H);       // a quarter turn over
  const handheld = matchMedia('(pointer: coarse)').matches;

  stageTurned = handheld && turn > flat;
  turnHint(stageTurned);

  if (stageTurned) {
    const s = turn;
    const w = STAGE_H * s;                                 // on screen, rotated
    const h = STAGE_W * s;
    const x = l + (vw - w) / 2;
    const y = t + (vh - h) / 2;
    stageEl.style.transform =
      `translate(${x + w}px, ${y}px) rotate(90deg) scale(${s})`;
    return;
  }

  const x = l + (vw - STAGE_W * flat) / 2;
  const y = t + (vh - STAGE_H * flat) / 2;
  stageEl.style.transform = `translate(${x}px, ${y}px) scale(${flat})`;
}

/** Convert a pointer event to stage (design-space) coordinates.

    THE INVERSE OF fitStage AND NOTHING ELSE. When the board is turned, the
    bounding rect is the rotated box - so its height measures the stage's WIDTH
    and a finger moving down the screen is moving right across the board. Getting
    this wrong does not look wrong, it just puts every card somewhere else. */
function toStage(ev) {
  const rect = stageEl.getBoundingClientRect();

  if (stageTurned) {
    const s = rect.height / STAGE_W;
    return {
      x: (ev.clientY - rect.top) / s,
      y: (rect.right - ev.clientX) / s,
    };
  }

  const scale = rect.width / STAGE_W;
  return {
    x: (ev.clientX - rect.left) / scale,
    y: (ev.clientY - rect.top) / scale,
  };
}

/* --- the tray's three places ------------------------------------------------
   `queue` is indexed by station: queue[i] is what stands at station i, or null
   for a place that has been emptied and not yet refilled. Nothing scrolls -
   hanging a card leaves a hole exactly where that card was, and admitNext()
   drops the next screen's next picture into it.

   Anything asked for past the last station is off the right edge of the stage,
   which is where the next screen's cards are parked until a place comes free.
   --------------------------------------------------------------------------- */

function stationPos(i) {
  if (i >= 0 && i < stations.length) return stations[i];
  const last = stations[stations.length - 1];
  return { x: STAGE_W + 80, y: last ? last.y : 732 };   // waiting off the right edge
}

/** Current resting place of a card. Falls back to its Figma home for a card
    that has left the queue, so a stray reject can never read off the array. */
function trayPos(cardId) {
  const i = queue.indexOf(cardId);
  return i >= 0 ? stationPos(i) : cardSpecs.get(cardId).home;
}

/** Put every card in the tray on its own station. A null is a place waiting to
    be refilled and there is nothing to move. */
function layoutQueue() {
  queue.forEach((id, i) => {
    if (!id) return;
    const el = cardNodes.get(id);
    if (!el) return;
    const p = stationPos(i);
    el.style.left = p.x + 'px';
    el.style.top  = p.y + 'px';
  });
}

/** Where a card of this width sits once hung in a given frame. */
function slotRestFor(cardId, slotIndex) {
  const w = cardSpecs.get(cardId).home.w;
  return {
    left: SLOT_CENTER[slotIndex].x - w / 2,
    top:  SLOT_CENTER[slotIndex].y - CARD_H / 2,
  };
}

/* --- the clothesline --------------------------------------------------------

   One bay is one round's worth of line: three hangers, each a frame and the
   peg holding it up. Finishing a round hauls that bay a full stage width along
   the rope, with the round's cards still pegged in it, and brings an empty one
   in behind it from the right.

   The rope itself does not move — it is pegged to the screen the way a real
   line is pegged to its posts — but two things travel along it: the twist,
   which is what a line being pulled actually looks like, and the frames, which
   take the sag one after another rather than sliding across in a flat row.
   That second part is why the haul is a frame loop and not a CSS transition:
   a hanger's height is a function of where it currently is, so the three of
   them are never interpolating between the same pair of values.
   --------------------------------------------------------------------------- */

/** Hang a fresh, empty bay on the line and make it the one the game answers
    into. Returns its three hangers, left to right. */
function mountBay() {
  const bay   = bayTpl.content.firstElementChild.cloneNode(true);
  const slots = Array.from(bay.querySelectorAll('.slot'));

  /* Tap-to-place: tap a card, then tap a frame. The listeners belong to the
     bay, so they retire with it and nothing is left pointing at frames that
     have been hauled off the screen. A new bay is never playable in the frame
     it is mounted in, so it starts disabled; render() opens it. */
  slots.forEach(el => {
    el.setAttribute('aria-disabled', 'true');
    el.addEventListener('click', () => {
      if (!selectedId || inputLocked()) return;
      tryPlace(selectedId, Number(el.dataset.slot));
    });
    el.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      if (!selectedId || inputLocked()) return;
      tryPlace(selectedId, Number(el.dataset.slot));
    });
  });

  washEl.appendChild(bay);
  bayEl   = bay;
  slotEls = slots;
  return Array.from(bay.querySelectorAll('.hanger'));
}

/** Where a hanger hangs at rest, read off the frame INSIDE it rather than off
    its place in the array it was handed in.

    THE TRAP THIS CLOSES is the one already written down beside the recap's
    carrier code: rideBay indexed SLOT_CENTER by the element's own index, which
    is only right while a bay has exactly three hangers in exactly slot order. A
    seam hands hangers from the old bay to the new one, so the index and the
    data-slot part company. data-slot is where a frame's left comes from - it is
    the only rule in styles.css that positions one - so it is also where its
    home x has to come from. */
function slotHomeX(h) {
  const s = h.querySelector('.slot');
  const c = s && SLOT_CENTER[Number(s.dataset.slot)];
  return c ? c.x : SLOT_CENTER[0].x;
}

/** Put a bay's frames `dx` along the line from where they hang at rest. Each
    one takes its height from the rope under it, so they ride the sag in turn:
    the frame over the middle of the screen is already at the bottom of the dip
    while the one arriving on the right is still up near the peg line.

    `from` IS WHERE THIS RIDE STARTED and `e` is how far through it is, and they
    exist for one reason: ropeY() wraps mod STAGE_W, so HAUL_TRAVEL being one
    stage width makes it one whole period of ROPE_Y as well. A bay parked at
    +1920 therefore already hangs at its rest height - dy is 0 at both ends of
    every haul, for free - and the two-argument form was exact.

    A SEAM'S TRAVEL IS A FRACTION OF A PERIOD. Parked at +1168.88 the three
    hangers sit +2.912, -28.000 and +12.183 off their rest heights, and at
    +584.44 the first sits +16.205 off. That first one is the ANCHOR's: a card
    already on the screen in front of the child, which must not move by a pixel
    when the new bay takes it over. Blending the baseline from "where I started"
    to "where I rest" puts dy at zero at BOTH ends of every ride.

    AND ONLY THE ENDS ARE LOAD-BEARING, which is what makes the blend a fix
    rather than a fudge. All three frames REST at the same height - .slot is
    top:288px for every data-slot, and .peg top:239.976px - so a frame does not
    sit on the rope's sag when it is hung, and this dy is not "where the rope
    is". It is a bob applied only while a frame is travelling: what has to be
    true is that it starts and finishes at zero, so nothing jumps on the
    hand-over and everything lands where CSS put it. In between it is a shape,
    and the blend's shape is the honest one displaced by at most 28px inside a
    sag whose own amplitude is 44.5px.

    DO NOT SIMPLIFY THIS BACK. The defaults reproduce the old behaviour exactly
    (from 0, e 0 -> base = ropeY(home)), which is why openLine and haulLine did
    not have to change; that is not evidence the blend is unused. */
function rideBay(hangers, dx, { from = 0, e = 0 } = {}) {
  hangers.forEach(h => {
    const home = slotHomeX(h);
    const base = (1 - e) * ropeY(home + from) + e * ropeY(home);
    const dy   = ropeY(home + dx) - base;
    h.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
  });
}

function clearRide(hangers) {
  hangers.forEach(h => {
    h.style.transform = '';
    /* is-entering with is-hauling: the fade is a 220ms one-shot that is long
       over by the time a ride settles, so leaving it on changes nothing that can
       be seen - but a class that outlives what it was for is the thing that bites
       the next reader, and endDeal() takes its own entrance classes off for
       exactly this reason. */
    h.classList.remove('is-hauling', 'is-entering');
  });
}

/** Slow off the mark, steady across, and a long settle — the shape a line
    being pulled by hand has, and the reason the frames read as being carried
    rather than moved. */
function easeHaul(p) {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(2 - 2 * p, 3) / 2;
}

/** The same curve read backwards: how far through the haul it is when the line
    has covered `e` of its distance. The haul's sound uses this to put its
    knocks where the frames actually are rather than where a stopwatch is. */
function easeHaulInv(e) {
  return e < 0.5 ? Math.cbrt(e / 4)
                 : 1 - Math.cbrt(2 - 2 * e) / 2;
}

/** One pull of the line: `out` rides `ride.travel` off to the left while
    `arriving` comes in from the right, and the twist runs with them. `out` may
    be empty — that is the opening, where there is nothing to send away.
    `onSettle` runs once, from the last frame of the ride or from the backstop.
    `onFrame` is handed the ride's eased progress, for anything that has to
    happen partway along; the seam uses it to fade the bay that is leaving.

    See HAUL and shiftRide() for the two sets of numbers this runs on. */
function runRide(out, arriving, ride, onSettle, onFrame) {
  out.concat(arriving).forEach(h => h.classList.add('is-hauling'));
  /* Parked off to the right, AND LEVEL: `from` is what keeps a bay parked
     partway along a rope period from hanging off its rest height. See rideBay. */
  rideBay(arriving, ride.travel, { from: ride.travel });
  /* ...delayed to the moment the first frame actually crosses into view. The
     cue is three notes on three frames and it has no business starting while
     the screen is still empty. haulNoteAt() rather than frameInAt() because
     the note has to START early enough that its PEAK lands on the frame; see
     the note beside it. A seam passes 0: its frames are already on the screen. */
  sfx(ride.cue, { delay: ride.lead(),        // travels right to left with them
                  out: ride.out, outFor: ride.outFor });

  /* Everything that ends a haul, from wherever it is ended. Both the last
     frame of the ride and the backstop below come through here, and only the
     first of them does anything. */
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    cancelAnimationFrame(haulRaf);
    clearTimeout(haulGuard);
    haulRaf = 0;
    haulGuard = null;
    clearRide(arriving);
    ropeEl.style.backgroundPosition = '';
    onSettle();
  };

  const t0 = performance.now();
  haulRaf = requestAnimationFrame(function step(now) {
    const p  = Math.min(1, (now - t0) / ride.ms);
    const e  = easeHaul(p);
    const dx = -ride.travel * e;

    rideBay(out,      dx,                { from: 0,           e });
    rideBay(arriving, ride.travel + dx,  { from: ride.travel, e });

    /* The twist runs on the same curve as the frames, which is what ties the
       two together: the line is being pulled, and they are on it. It runs
       `rope` rather than `travel` — the same number for a haul, and a 32px-
       snapped one for a seam so that clearing the offset at the end stays
       invisible. See the ride note beside HAUL_TRAVEL, and styles.css. */
    ropeEl.style.backgroundPosition = (-ride.rope * e).toFixed(2) + 'px 0';

    if (onFrame) onFrame(e);

    if (p < 1) { haulRaf = requestAnimationFrame(step); return; }
    settle();
  });

  /* A tab in the background stops producing frames, so the loop above stops
     with it. Without this the round after a child switched away mid-haul would
     never be built and the game would come back to them locked for good. The
     timer is throttled in the background too, but it does still fire, and
     settling straight to the finished state is right either way: nobody was
     watching the ride. */
  haulGuard = setTimeout(settle, ride.ms + 400);
}

/** A whole screen's worth of pull. The opening and the ending are the only two
    rides left that move the line this far; every seam in between calls
    runRide() with shiftRide()'s numbers instead. */
function runHaul(out, arriving, onSettle) {
  runRide(out, arriving, HAUL, onSettle);
}

/** The opening. The board starts bare and the first round's frames are hauled
    in from the right — the same pull every later round arrives on, with
    nothing leaving ahead of them.

    It sounds, like any other haul. That is only safe because of where this is
    called from: startGame() opens the audio context inside the Play click and
    startBoard() follows 420ms behind it, so the context is running by the time
    the line moves. Start the board without a gesture ahead of it and the knocks
    would build a suspended context and then fire the whole haul at the child's
    first touch — the sound would have to go before that could. */
function openLine(done) {
  const arriving = mountBay();

  /* Nothing to fade out here, so with motion turned down the line simply
     starts hung, which is the state the ride would have arrived at. */
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { done(); return; }

  runHaul([], arriving, done);
}

/** Haul the finished round off along the line, bring the next empty bay in
    behind it, and call `done` once the line has settled.

    `replace: false` is the last haul of the game, where the story goes off and
    nothing comes in behind it because nothing else is coming. It is the same
    pull either way — the twist still runs, the frames still take the sag one
    after another — so this is a flag rather than a second function: the whole
    point of the ending is that the line does the ordinary thing and then the
    board is simply bare. */
function haulLine(done, { replace = true } = {}) {
  const leaving = bayEl;
  const out     = Array.from(leaving.querySelectorAll('.hanger'));

  /* The three cards are pegged in `leaving`'s frames but they live in .cards,
     which does not move. Both are inset:0 layers over the same stage, so
     handing a card to the hanger it was placed in leaves its left/top — and so
     its place on screen — untouched, and it rides out inside its frame.
     Dropping the bay at the end takes all three with it. */
  filled.forEach((id, i) => {
    const el = cardNodes.get(id);
    if (el) out[i].appendChild(el);
  });

  const arriving = replace ? mountBay() : [];
  if (!replace) {
    /* Nothing answers into the line any more, and `leaving` is about to be
       dropped: leave nothing pointing at frames that will not exist. */
    bayEl   = null;
    slotEls = [];
  }

  /* No ride when motion is not wanted: the finished bay fades off the line
     instead, over the duration styles.css gives that fade. */
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    leaving.classList.add('is-leaving');
    setTimeout(() => { leaving.remove(); done(); },
               cssNum('--haul-fade-ms', 300));
    return;
  }

  runHaul(out, arriving, () => {
    leaving.remove();                        // and with it the round that ended
    done();
  });
}

/** THE SEAM. Move the line along by as much of it as the next screen is new, so
    the pictures the child just hung become that screen's opening frames, and
    bring the empty frames it still needs in behind them.

    THE CARRIED FRAMES DO NOT TRAVEL AND ARE NOT REBUILT. The new bay is parked
    exactly `travel` to the right, which puts its FIRST frames on top of the old
    bay's LAST ones — 141 + 1168.88 = 1309.88 against the third frame's own left,
    and .peg-1 + 1168.88 is .peg-3 to within 0.016px — so the cards are HANDED
    across and then both bays ride the same distance at the same speed. The child
    watches a picture stay still while the board moves under it, which is the
    whole point of the anchor. See rideBay for the one thing that had to change to
    make "stay still" mean it, and anchorsFor for which pictures they are.

    WHY IT IS NOT haulLine WITH A DIFFERENT NUMBER. Everything easy about the haul
    comes from its travel being one stage width: the twist lands back on its own
    phase, a parked bay hangs at its rest height, and the bay that leaves clears
    the board. A seam gets none of the three for free — see SHIFT's `rope`,
    rideBay's `from`, and .bay.is-fading — and each one is a place a shared
    function would have had to branch.

    THE SOUND IS haul.wav AND IT IS NOT RIGHT YET, recorded here so nobody has to
    re-derive the geometry to fix it. That file has its three frame-knocks (449,
    774 and 969ms) and its whole stereo sweep rendered in against a 1920px ride
    over HAUL_MS, and SFX_JITTER's note is explicit that it is the one cue that
    must never be rate-changed for exactly that reason. A seam is shorter and has
    almost nothing arriving: on a two-pitch shift exactly ONE frame crosses the
    right edge, at e = 0.4782 — 510ms of 1035. EVERY SEAM IS A TWO-PITCH SHIFT
    NOW, because every seam carries exactly one frame (see the windowing note over
    ROUNDS), so that single crossing is the whole of what a purpose-built cue has
    to hit. The one-pitch case this note also used to describe is gone with the
    screen that brought a single picture, and with it the shortest seam in the
    game - every shift is the same 1035ms ride now, which is also why `outFor`'s
    Math.min can no longer be reached by anything but the constant.
    So the knocks land on nothing and the cue is faded out at the end of
    the movement instead of being allowed to finish. A purpose-built cue wants the
    rope run, ONE knock at that 510ms (through easeHaulInv, the way haulNoteAt
    derives its own), and the peg pair at the end; tools/render-cues.js was
    deleted, so it needs that bench back before it can be rendered at all. */
function shiftLine(done) {
  const leaving = bayEl;
  const out     = Array.from(leaving.querySelectorAll('.hanger'));

  /* How many frames hand over, and how far the line therefore moves: the pictures
     the incoming screen opens with are the ones already hanging in the frames at
     the END of this line, and they have to end up at its start. */
  const carry  = anchorsFor(roundIndex).length;
  const stay   = filled.slice(filled.length - carry);
  const ride   = shiftRide(filled.length - carry);
  const arriving = mountBay();

  /* Everything that is NOT carried rides out inside the frame it was placed in —
     the same hand-off haulLine makes, and free for the same reason: .cards and
     the bay are both inset:0 layers over the one stage, so handing a card to a
     hanger leaves its left/top, and so its place on screen, untouched. */
  filled.forEach((id, i) => {
    if (i >= filled.length - carry) return;
    const el = cardNodes.get(id);
    if (el) out[i].appendChild(el);
  });

  /* The carried frames' OLD hangers are redundant from here: the new bay's first
     frames are parked exactly on top of them, and two superimposed pegs would
     double the soft edges of the artwork. */
  out.splice(filled.length - carry).forEach(h => h.remove());

  rideBay(arriving, ride.travel, { from: ride.travel });   /* parked, and level */

  /* The frames AFTER the carried ones are the only ones genuinely arriving, and a
     one- or two-pitch park does not put them off the screen the way a stage-width
     one does — see .hanger.is-entering. */
  arriving.slice(carry).forEach(h => h.classList.add('is-entering'));

  /* ...and the carried cards move into the new bay. Their left/top become where
     they will ARRIVE, and because the bay is parked at +travel that is also
     exactly where they already are — so there is nothing to fix up at settle, and
     nothing moves on the frame the hand-over happens. */
  stay.forEach((id, j) => {
    const el = cardNodes.get(id);
    if (!el || !arriving[j]) return;
    const rest = slotRestFor(id, j);
    el.classList.add('is-fixing');       /* handed to the frame, never slid there */
    void el.offsetWidth;
    el.style.left = rest.left + 'px';
    el.style.top  = rest.top  + 'px';
    arriving[j].appendChild(el);
    void el.offsetWidth;
    el.classList.remove('is-fixing');
  });

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    /* The state the ride would have arrived at, arrived at instantly: the new bay
       at rest and the old one fading off the line. clearRide undoes the park
       above — without it the new bay would sit a pitch or two to the right for
       the rest of the game. The carried pictures jump the whole travel, which is
       deliberate: it is the longest movement on the board, and movement is the
       thing this preference asks not to have. */
    clearRide(arriving);
    arriving.forEach(h => h.classList.remove('is-entering'));
    leaving.classList.add('is-leaving');
    setTimeout(() => { leaving.remove(); done(); },
               cssNum('--haul-fade-ms', 300));
    return;
  }

  runRide(out, arriving, ride, () => {
    leaving.remove();
    done();
  }, e => {
    /* A seam does not carry the old bay off the screen. Its middle frame stops
       with 26px of mat still inside a stage that is overflow:hidden, and dropping
       the bay would pop that wedge out of existence at the left edge; by here it
       is the only part of it still visible, so fading the bay and fading the
       wedge are one picture. See .bay.is-fading. */
    if (e > 0.8) leaving.classList.add('is-fading');
  });
}

/* --- round setup ----------------------------------------------------------- */

/** Put a card's picture inside an empty .card, cropped the way its own Figma
    frame crops it.

    Lifted out of buildRound so that the post-game recap can build the same
    twelve cards without a second copy of the four lines below — which are the
    one part of a card that is genuinely easy to get wrong, and which were got
    wrong once already.

    Figma authors these percentages against the card's FRAME box — the full
    home.w x CARD_H rectangle, stroke included — but .card-crop is the padding
    box inside the border, so resolving them as CSS percentages there would
    measure them against home.w-2*BW x CARD_H-2*BW and stretch every image ~2.4%.
    Resolve against the frame box and shift the origin in by the border.
    (Check: every one of the 12 crops then lands within 0.1% of its source
    aspect ratio; on the padding box all 12 are off by 2.4-2.5%.)

    Nothing here reads the card's DISPLAYED size, which is what lets the recap
    show these at any scale: it puts the whole card inside a wrapper and scales
    that, so these numbers stay in the card's own coordinates. */
function paintCardArt(el, card) {
  const crop = document.createElement('div');
  crop.className = 'card-crop';
  const img = document.createElement('img');
  /* STAMPED, like every other generated asset here. assets/images/*.webp were the
     one family that loaded without a ?v= token, on the reasoning that they are
     hand-drawn and do not change - and then tools/upres-round-cards.py re-exported
     two of them at twice the resolution, which a browser holding the old bytes
     never sees. A card's art is as generated as anything else in assets/. */
  img.src = card.src + '?v=' + BUILD;
  img.alt = '';
  img.draggable = false;
  img.style.width  = (card.crop.w / 100 * card.home.w)      + 'px';
  img.style.height = (card.crop.h / 100 * CARD_H)           + 'px';
  img.style.left   = (card.crop.x / 100 * card.home.w - BW) + 'px';
  img.style.top    = (card.crop.y / 100 * CARD_H      - BW) + 'px';
  crop.appendChild(img);
  el.appendChild(crop);
  return img;
}

/** The story so far, as card SPECS in story order, up to but not including
    screen `index`.

    SCOPED TO THE ROUND EACH PICTURE CAME FROM rather than looked up by bare id,
    because `sneeze` is TWO different cards in two different rounds - drawn
    differently, served from different files. storyCards() carries the same note
    for the same reason. */
function storyBefore(index) {
  const out = [];
  for (let i = 0; i < index; i++) {
    ROUNDS[i].order.forEach(id => {
      const c = ROUNDS[i].cards.find(k => k.id === id);
      if (c) out.push(c);
    });
  }
  return out;
}

/** The pictures a screen opens with ALREADY HANGING, in the frames they hang in.

    THIS IS THE CONVEYOR. The line always holds three frames, and a screen fills
    only as many of them as it brings new pictures for - so the rest are the last
    pictures of the story so far, carried across the seam still hanging and no
    longer the child's to move. Screen 1 brings three and carries nothing; EVERY
    screen after it brings two and carries exactly ONE. The child re-reads the
    beat they just put down before adding to it, which is what makes eleven
    panels one story rather than five screens.

    ONE IS THE ONLY ANSWER IT GIVES PAST SCREEN 1, and the windowing note over
    ROUNDS is what guarantees that rather than anything here. The `n > 0` guard
    and the slice both stay: screen 1 still has to come back empty, and a dev
    skip still lands on any screen from a board torn down to nothing.

    DERIVED FROM ROUNDS AND NOTHING ELSE, so every way into a screen builds the
    same one. The seam hands these cards over as part of the ride, but the seam is
    not the only way here: a dev skip lands on any screen from a board that has
    just been torn down to nothing, and so does a replay that wraps. A function
    that had to be TOLD what the last screen was would be a function trusting
    state it cannot see - which is the rule buildRound already follows. */
function anchorsFor(index) {
  const n = SLOT_CENTER.length - ROUNDS[index].order.length;
  return n > 0 ? storyBefore(index).slice(-n) : [];
}

function buildRound(index) {
  endDrag();                 // never hold a node this function is about to discard
  clearTimeout(pulseTimer);
  clearTimeout(voHintTimer);
  clearTimeout(praiseTimer);
  praiseTimer = null;             // speaking() reads it - see there
  clearTimeout(dealTimer);
  clearTimeout(dealSettleTimer);
  round    = ROUNDS[index];
  /* `stations` is not set here any more and neither is `queue`: the tray's
     places are fixed for the whole game (see TRAY_STATIONS) and this screen's
     cards may already be standing in them. Both are settled below, once it is
     known whether there is a tray to adopt or one to build. */
  /* ONE PLACE PER FRAME ON THE LINE, and the frames the story carried over are
     answered before the child touches anything. `filled`'s length is where
     activeSlot(), render(), slotAt() and anchorCount() all read the frame count
     from, so this is the one line that decides it. */
  const anchors = anchorsFor(index);
  filled   = new Array(SLOT_CENTER.length).fill(null);
  attempts = 0;
  selectedId = null;
  /* THE QUESTION CARRIES OVER WHEN IT HAS NOT CHANGED, and this is the one
     thing on the board that is deliberately NOT round-scoped.

     It used to be. `promptText = null` stood here unconditionally and the note
     that was here explained it as a feature: "forgetting the sentence on screen
     is what makes the next one write itself out. Rounds 2-4 ask the same
     question, and without this only the first of them would ever be typed." That
     is exactly what the user asked to stop, on screen 2, in their own words:
     "don't do the typewriting effect again and show the title as it is,
     continuing from the previous screen".

     AND IT REALLY IS THE SAME SENTENCE. Screen 1's THIRD prompt is already
     'कहानी को सही क्रम में लगाओ।' - see the Tutorial/Level 1 seam note in ROUNDS -
     and screens 2, 3 and 4 carry that single prompt and nothing else. So from the
     child's point of view one instruction is up from their first independent
     placement to the end of the game, and typing it out four more times says
     "here is something new to read" four times when nothing has changed. A screen
     change is not a new question.

     WHAT IS KEPT IS THE SENTENCE, NOT A HALF-TYPED STATE. If the outgoing screen
     is still writing when this runs, its interval is stopped and the whole
     sentence is put up at once - so the banner is never left holding a fragment,
     which is the one way this could have been worse than retyping. A DIFFERENT
     first prompt (screen 1, or a dev skip that wraps back round to it) forgets
     the sentence as before and writes itself out normally, which is what keeps
     the first one an entrance.

     THE PIN NEVER CARRIES OVER, whichever way the sentence goes. promptHold
     names a SLOT on the screen that is being thrown away, so keeping it would
     hold the new screen's banner on a question from the old one. Nothing
     normally survives a round change - the handover is the one line that can
     still be sounding here, and it holds nothing - but this is the cheap end of
     that. */
  promptHold = null;
  /* ...and any wait that was going to take the pin out. It would find
     promptHold null and do nothing, but a screen that has been thrown away
     should not leave a timer pointing at its banner. */
  clearTimeout(promptTimer);
  promptTimer = null;
  if (promptText !== null && promptText === round.prompts[0]) {
    clearInterval(typeTimer);
    typeTimer = null;
    promptEl.textContent = promptText;
  } else {
    promptText = null;
  }
  /* ...and the first frame's demonstration is owed again. This is what lets a
     second playthrough, or a dev skip that wraps back to screen 1, teach the
     gesture the way the first one did. See firstTeach(). */
  taught = false;
  /* Refills owed to the screen that is going. Whatever they were going to put
     in the tray, this is the tray now. */
  arriveTimers.forEach(clearTimeout);
  arriveTimers = [];

  /* WHAT SURVIVES A SCREEN CHANGE, and until this pass nothing did: the three
     lines here were cardNodes.clear(), cardSpecs.clear() and a
     cardsEl.replaceChildren(), and every screen built its cards from nothing.

     The tray is not empty when this runs any more. This screen's three pictures
     dropped into it one at a time while the screen before it was being played
     (see admitNext), so they are already built, already standing on the three
     places, and already the thing the child has been looking at for the last
     half-minute. Throwing them away and making them again would flash the whole
     tray at the exact moment the new line arrives.

     ADOPTION IS ALL-OR-NOTHING. A tray holding only some of this screen's cards
     can only come from a dev skip jumping over the screen that was feeding it,
     and rebuilding all three there is one path instead of two - the skip then
     deals its screen the way the very first one is dealt. */
  const adopting = round.cards.every(c => cardRound.get(c.id) === index &&
                                          queue.indexOf(c.id) !== -1);
  /* THIS SCREEN AND EVERYTHING AFTER IT, and it used to be `round.cards` alone.
     That was right while the pool was one screen deep; it is wrong now that it
     is drawn as deep as the box is wide (see stockPool). At a handover the box
     holds the incoming screen's cards AND one or two from the screens behind
     them, with more still parked off the right edge - and `keep` naming only
     round.cards deleted every one of those, nulling their places and throwing
     away cards that had already been built. Ownership is what decides it:
     cardRound says which screen a card belongs to, and anything from THIS
     screen onward is still ahead of the child. */
  const keep = new Set();
  if (adopting) {
    cardNodes.forEach((el, id) => { if (cardRound.get(id) >= index) keep.add(id); });
  }

  /* AND THE CARDS THE STORY CARRIED OVER, which are not in round.cards - they
     belong to the screen before this one - but which are HANGING ON THE LINE:
     the seam re-parented them into the new bay's first frames rather than
     letting them ride off with the rest. The sweep below must not take their
     nodes or forget their specs. Kept independently of `adopting`, because the
     tray and the line are two different questions. */
  anchors.forEach(c => { if (cardNodes.has(c.id)) keep.add(c.id); });

  /* Everything else goes: the round that just ended, whose cards rode off
     inside their frames and whose nodes went with the bay, and any pool a skip
     caught still parked off the right edge. */
  cardNodes.forEach((el, id) => {
    if (keep.has(id)) {
      /* An adopted card cannot normally still be mid-drop here - the last refill
         of a screen finishes ~1.4s after its third card and the haul is seconds
         longer than that - but a teardown cancels the timer that takes this off,
         and .is-arriving carries a z-index and a killed transition with it. */
      el.classList.remove('is-arriving', 'is-waiting');
      return;
    }
    el.remove();
    cardNodes.delete(id);
    cardSpecs.delete(id);
    cardRound.delete(id);
  });
  /* THE PARKED POOL SURVIVES AN ADOPTION and used to be thrown away on every
     screen change. Its cards are kept by the sweep above - they are from screens
     ahead of this one - and they are still owed to the box, so forgetting the
     list of them would leave real nodes parked off the right edge that nothing
     would ever admit. On the rebuild path nothing survived, so the pool has to
     be drawn again from here. */
  if (!adopting) {
    nextPool = [];
    poolAt = index + 1;
  }

  if (adopting) {
    /* Their places are the places they rolled into, so there is nothing to
       shuffle here: stockPool() drew this screen's arrangement when it stocked
       it. The map is only to clear any place the outgoing round left null. */
    queue = queue.map(id => (keep.has(id) ? id : null));
  } else {
    /* SHUFFLED, so the answer is not in the same place two games running. The
       stations are TRAY_STATIONS and do not move; this is only which card stands
       at which one. See the tray's-order note beside shuffleTray().

       AND EXACTLY AS LONG AS `stations`, WHICH IT USED NOT TO BE. This line was
       `queue = shuffleTray(round.cards.map(c => c.id))`, which made the queue as
       long as the ROUND - the same thing while every screen had three cards for
       three places, and not the same thing now that the line carries pictures
       over and most screens bring two. See TRAY_SPREAD for what read the length
       and what it did with a short one. */
    const ids = shuffleTray(round.cards.map(c => c.id));
    queue = new Array(stations.length).fill(null);
    TRAY_SPREAD[ids.length].forEach((st, i) => { queue[st] = ids[i]; });
    round.cards.forEach(card => makeCard(card, index));
  }

  /* ...and the pictures the story carried over are put back in their frames.

     NOT THROUGH placeCard(), and the five things it would do wrong are the whole
     reason this is written out. It fires the placement cue, for a card nobody
     just placed. It queues the narrator. It owes the tray a refill it has no card
     for. It counts an attempt. And on the screen that brings a single picture it
     would reach finishRound() before the child had touched anything. What an
     anchor actually needs is the marks that say "hung, and not yours to move",
     and those are the only part of placeCard this shares.

     WRITTEN UNCONDITIONALLY even though the seam has already done most of it. On
     that path every line here restates something that is already true and costs
     a reflow; on the OTHER path - a dev skip, a replay that wraps - none of it is
     true and there is not even a node yet. A branch here would be a branch on
     "did a ride just happen", which is exactly the state this function exists
     not to trust. */
  anchors.forEach((card, j) => {
    const el = cardNodes.get(card.id) || makeCard(card, index - 1);
    filled[j] = card.id;

    /* IT MUST NOT BE STANDING IN THE TRAY AS WELL. A skip can land here with the
       card still at a station - it is the previous screen's LAST picture, so a
       skip taken before that picture was hung catches it in the tray - and the
       keep above has just told the sweep to hold on to it. layoutQueue() below
       would otherwise walk it straight back to that station. */
    const at = queue.indexOf(card.id);
    if (at !== -1) queue[at] = null;

    /* Nothing an interrupted animation left on it: a skip can catch a card
       mid-bounce, mid-hint, or partway through a drop into the tray. */
    el.classList.remove('is-selected', 'is-hinted', 'is-cheering', 'is-landing',
                        'is-lit', 'is-rejected', 'is-decked', 'is-dealt',
                        'is-waiting', 'is-arriving');
    el.style.zIndex = '';
    el.style.removeProperty('--deck-i');
    el.style.removeProperty('--deal-delay');

    /* HANDED TO THE FRAME, NEVER SLID INTO IT. .card eases left/top over 320ms -
       120ms even with motion turned down - so writing them plainly would travel
       the card the whole width of the board. See .card.is-fixing. */
    const rest = slotRestFor(card.id, j);
    el.classList.add('is-fixing');
    void el.offsetWidth;
    el.style.left = rest.left + 'px';
    el.style.top  = rest.top  + 'px';
    el.classList.add('is-placed');
    el.tabIndex = -1;
    el.setAttribute('aria-disabled', 'true');
    void el.offsetWidth;
    el.classList.remove('is-fixing');

    /* Its frame is not a button any more either. render() sets aria-disabled
       on it every pass, but a permanently disabled tab stop is still a tab stop,
       and a keyboard player should not have to walk past a frame that can never
       take anything. */
    if (slotEls[j]) slotEls[j].tabIndex = -1;
  });

  /* ...and if the story has run out of pictures, pack them left before the
     screen is drawn rather than arriving with a gap between two cards. Ordered
     before layoutQueue() so the cards are put straight where they belong
     instead of sliding there a frame later. See closeGaps(). */
  closeGaps();
  layoutQueue();
  render();
  enterRound(adopting);
  stockPool();
  devLabel();                /* no-op without ?dev=1; keeps the button honest */
}

/** One tray card, built and left wherever the caller wants it. `at` is the
    ROUNDS index it belongs to, which is what lets buildRound tell the cards
    that came in early from the ones the screen before it left behind. */
function makeCard(card, at) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.card = card.id;
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', card.alt);
  el.style.width = card.home.w + 'px';

  paintCardArt(el, card);

  el.addEventListener('pointerdown', onCardPointerDown);
  el.addEventListener('keydown', onCardKeyDown);

  cardsEl.appendChild(el);
  cardNodes.set(card.id, el);
  cardSpecs.set(card.id, card);
  cardRound.set(card.id, at);
  return el;
}

/** Bring a freshly built round in, dealt from a deck.

    ONLY THE FIRST SCREEN OF A GAME IS DEALT NOW, and a dev skip's. Every other
    screen's cards are already standing in the tray when it arrives — they
    dropped in one at a time under the screen before it (see admitNext) — so
    there is no deck to land and nothing to deal, and `adopted` says so. That
    screen's entrance is the LINE arriving with three empty frames on it; the
    choices have been on the board for half a minute, and announcing them again
    would be a lie about which part of the board has just changed.

    On the paths that DO deal: the tray is empty at this point — there is no
    screen before the first one — so the three cards arrive together as one deck
    on the middle station, hold there long enough to read as a deck, and then
    the outer two are dealt out to the sides. The middle card never moves: it is
    already home, which is what makes it the one that stays.

    --deck-i is -1 / 0 / +1, meaning "this card is bound for the left station /
    stays here / is bound for the right one". It drives both the fan of the
    stacked deck and the transform that unwinds as the card is dealt, so the two
    phases cannot disagree about where a card was sitting. */
function enterRound(adopted) {
  /* The prompt used to fade and slide in here. It writes itself out instead
     now (see typePrompt), which is an entrance already - running both would be
     two of them on top of each other.

     AND ON SCREENS 2-4 IT DOES NEITHER, because there is no new question to
     announce: buildRound() has just KEPT the sentence that was already up rather
     than forgetting it, so the banner does not change as the screen does. The
     deck landing and the cards being dealt are this screen's entrance. */

  /* And she asks it. Deliberately not waited for: the deck is landing and the
     cards are being dealt while she speaks, so the child watches the pieces
     arrive at the same time as hearing what to do with them — and the two
     cues she would otherwise be talking over, deckIn and deal, are muted
     anyway.

     THE BOARD ITSELF DOES NOT ANSWER UNTIL SHE IS DONE, though — see
     inputLocked(). A tap or a drag started while she is still asking has no
     effect at all, so a child who reaches for a card mid-sentence finds it
     unresponsive rather than cutting her off.

     But she does not talk over herself. A line still going at this point can
     only be the one the TUTORIAL started — the handover, which is queued behind
     screen 1's second praise and can still be running when screen 2 arrives —
     and that is both more specific than any arrival question and already ends
     with the one screens 2-4 would ask. So a screen arriving asks into silence
     or not at all.

     AND ONLY SCREEN 1 ASKS AT ALL NOW. Screens 2-4 carry `narration: null`, so
     askLineFor returns nothing for them and this is a no-op there: Level 1's
     instruction is spoken once, at the seam, and the banner carries it after
     that. The guard is `ask &&` rather than the old bare say(), because say(null)
     resolves to an empty list and CANCELS whatever is sounding — which on the
     one screen where a line can still be in the air is exactly the handover. */
  const ask = askLineFor(0);
  if (ask && !speaking()) say(ask);

  /* Already standing in the tray: see the note above. */
  if (adopted) return;
  if (!queue.some(Boolean)) return;

  /* The deck lands on whichever station the staying card will occupy. */
  const mid    = Math.min(1, queue.length - 1);
  const centre = stationPos(mid);

  queue.forEach((id, i) => {
    const el   = cardNodes.get(id);
    if (!el) return;
    const lean = i - mid;                    // -1, 0, +1
    el.style.setProperty('--deck-i', String(lean));
    /* The staying card is the face of the deck; the two that leave sit behind it */
    el.style.zIndex = String(30 - Math.abs(lean));
    el.classList.add('is-decked');           // suppresses the left/top transition
    el.style.left = centre.x + 'px';
    el.style.top  = centre.y + 'px';
  });
  sfx('deckIn');

  dealTimer = setTimeout(dealFromDeck, cssNum('--deck-in-ms', 650) + DECK_STILL_MS);
}

/** Cut the entrance short and leave the tray exactly as the deal would have.
    The deal is deliberately slow, so a child who reaches for a card part-way
    through must get it rather than be made to wait for the animation. */
function endDeal() {
  clearTimeout(dealTimer);
  clearTimeout(dealSettleTimer);
  dealTimer = dealSettleTimer = null;
  cardNodes.forEach(el => {
    el.classList.remove('is-decked', 'is-dealt');
    el.style.zIndex = '';
    el.style.removeProperty('--deck-i');
    el.style.removeProperty('--deal-delay');
  });
  layoutQueue();
}

/** Deal the outer two cards out of the deck to their stations. */
function dealFromDeck() {
  const mid = Math.min(1, queue.length - 1);

  queue.forEach((id, i) => {
    if (!id) return;
    const el = cardNodes.get(id);
    if (!el) return;
    const lean = i - mid;
    /* Left card first, then the right one, so it reads as two deals and not one
       symmetrical bloom. The card that stays has nowhere to go. */
    const delay = lean === 0 ? 0 : (lean < 0 ? 0 : DEAL_STAGGER);

    el.style.setProperty('--deal-delay', delay + 'ms');
    el.classList.remove('is-decked');
    el.classList.add('is-dealt');

    const p = stationPos(i);
    el.style.left = p.x + 'px';
    el.style.top  = p.y + 'px';

    /* Guarded because this fires up to DEAL_STAGGER later and buildRound()
       clears cardSpecs: a rebuild inside that window - a dev skip, or the last
       card of a round landing during the deal - used to throw on the lookup. */
    if (lean !== 0) setTimeout(() => {
      const spec = cardSpecs.get(id);
      if (spec) sfx('deal', { pan: panAt(p.x + spec.home.w / 2) });
    }, delay);
  });

  /* Drop the entrance state once it has played out, so nothing it set is left
     shadowing a later animation on the same card. */
  const total = cssNum('--deal-ms', 820) + DEAL_STAGGER + 60;
  dealSettleTimer = setTimeout(endDeal, total);
}

/* --- refilling the tray -----------------------------------------------------

   A place in the box does not stay empty. The picture the child hangs on the
   line leaves its place behind, and a beat later a new one drops into exactly
   that place — so the box is never bare and never re-orders itself. Three
   places, all game; what changes is only what is standing in them.

   WHERE THE NEW ONE COMES FROM IS THE NEXT SCREEN, and there is nowhere else it
   could come from: a screen has exactly three cards and exactly three frames,
   so the moment one is hung its own screen is a card short. The note at the top
   of this file listed this animation under NOT BUILT and said precisely what it
   was missing — "the tray is a real carousel ... but it needs a pool deeper
   than three". The next screen is that pool.

   SO THE TRAY HOLDS TWO SCREENS AT ONCE, and the cards that have come in early
   are ordinary cards: they can be picked up, dragged, tapped and selected like
   any other, which is what was asked for. Dropped into a frame one of them is
   simply wrong and is refused the way any wrong card is refused —
   expectedCardFor() reads the CURRENT round's `order` and knows nothing about
   which screen a card came from, so no branch anywhere has to be told about
   this.

   cardNodes, cardSpecs and cardRound are keyed by card id, so the two screens
   sharing the tray must not share an id. No two ADJACENT screens do — screens 1
   and 4 both have a `sneeze`, drawn differently, and they never meet — and
   stockPool() says so out loud if that ever stops being true.

   THE LAST SCREEN IS THE EXCEPTION, and it has to be: nothing follows it, so
   its pool is empty and the tray drains as it always did. That is what the
   ending needs — the box is tipped over and thrown across the floor, and it
   cannot be tipped over with the next story still standing in it. See
   toppleBox().
   --------------------------------------------------------------------------- */

/** Fetch a screen's three pictures without building anything.

    ONE CALLER, AND IT IS THE TITLE SCREEN: nothing exists yet there — no round,
    no tray, no stations — so there is nowhere to park a card and nothing for it
    to be a pool for. Every screen after the first is warmed by stockPool()
    instead, which builds the nodes outright and so fetches the pictures as a
    side effect of putting them in the document. */
function warmRound(index) {
  const next = ROUNDS[index];
  if (!next) return;
  next.cards.forEach(c => { const i = new Image(); i.src = c.src; });
}

/** Build the next screen's three cards and park them off the right edge of the
    stage, in the order they will drop into the tray.

    THIS REPLACED preloadRound(), which only warmed the three images so that
    nothing would be fetched at the moment it was shown. It still does that —
    the pictures are in the document from here on — but the point of it now is
    that the refill has something to refill FROM: admitNext() takes the front of
    this pool each time a place comes free.

    THE ARRANGEMENT IS DRAWN HERE rather than in buildRound, and that is the
    same call on the same seeded stream in the same order it was always made in:
    screen 1's arrangement when screen 1 is built, screen 2's when screen 1 is
    built, screen 3's when screen 2 is built. So ?seed=N still replays a game
    exactly, and tools/sim.js still gets byte-identical runs. */
function stockPool() {
  const park = stationPos(stations.length);

  /* AS DEEP AS THE BOX IS WIDE, AND IT USED TO BE ONE SCREEN. One screen ahead
     is enough only while every screen holds as many cards as there are places.
     The screens do not: they hold 3, 2, 2, 2, 2 of the eleven pictures,
     because the line carries pictures across a seam (see the note over ROUNDS).
     One screen ahead of a two-card screen is two cards for three places, so the
     box thinned out and then STAYED thin - measured with `node tools/sim.js
     trayfull`: a vacant place from screen 2 onward and two of them on screen 3,
     which is the exact emptiness this whole mechanism exists to remove, and
     which is what the user saw ("why Do I see a vacant option here? Correct it.
     The next option should take the place").

     `stations.length` is the target because that is how many places the box has,
     so a pool at least that deep can always answer a placement.

     A SCREEN IS THE UNIT, not a card. A screen's arrangement is drawn as one
     shuffle, and a half-drawn screen would put a card in play whose siblings are
     still nowhere - which is exactly what makes buildRound's `adopting` test
     fail and deal a deck at a handover that should have been seamless.

     `poolAt` ONLY EVER MOVES FORWARD, so the screens are shuffled off the seeded
     stream in screen order no matter how many of them one call gets through, and
     ?seed=N still replays a game exactly. tools/sim.js depends on that.

     The loop simply ends when the story runs out of screens to draw from, which
     is how the box comes to be empty for the ending - see toppleBox(). */
  while (nextPool.length < stations.length && poolAt < ROUNDS.length) {
    const screen = ROUNDS[poolAt];
    const at     = poolAt;
    poolAt += 1;                     /* before the body, so nothing can loop */

    shuffleTray(screen.cards.map(c => c.id)).forEach(id => {
      if (cardNodes.has(id)) {
        /* The one thing this design cannot survive, said loudly rather than
           debugged later: two screens that are in play together using one id
           would have the pool card and the playable card fighting over the same
           three Maps. Dropped rather than allowed to corrupt them - which costs
           the box one place and one seamless handover, both visible, neither
           silent. */
        console.warn('[tray] screen %d has a card called "%s" and something ' +
                     'already in play has that id. The box and its pool span up ' +
                     'to three screens now, and every card map is keyed by id - ' +
                     'rename one of them. This card has been dropped.', at + 1, id);
        return;
      }
      const card = screen.cards.find(c => c.id === id);
      const el   = makeCard(card, at);
      el.classList.add('is-waiting');
      el.style.left = park.x + 'px';
      el.style.top  = park.y + 'px';
      /* Off the stage AND out of the way of everything that walks the board: no
         pointer, no tab stop, nothing for a screen reader to read out. A child on
         a keyboard must not be able to reach a picture that is not on the screen.
         All of it comes off in admitNext(). */
      el.tabIndex = -1;
      el.setAttribute('aria-hidden', 'true');
      nextPool.push(id);
    });
  }
}

/* WHEN THE REFILL STARTS, measured rather than chosen — and it is the same
   measurement PLACE_LEAD_MS is: the placement chime is a four-note figure that
   resolves at 440ms and is well down by 620, and for that whole 620ms the child
   is watching the card they have just hung light up in its frame. So the box
   waits for both to be over before it does anything, and the refill gets the
   eye to itself instead of competing with the reward. */
const ARRIVE_LEAD_MS = PLACE_LEAD_MS;

/** End a drop early, wherever it has got to.

    A child who reaches for a picture while it is still bouncing must GET it -
    the same rule that makes onCardPointerDown cut the opening deal short. The
    grab's own transform would otherwise be overridden by the drop's animation
    for the rest of its 720ms, so the card would be dragged and be bouncing at
    the same time. */
function settleArrival(el) {
  el.classList.remove('is-arriving');
}

/** Drop the next screen's next picture into the place the tray has just freed.

    `at` IS THE PLACE THAT WAS FREED, and it has to be passed in now rather than
    looked for. This took queue.indexOf(null) - the leftmost hole - which was the
    same thing while a screen filled all three places and emptied them one at a
    time. It is not any more: most screens bring two pictures, so one station is
    null from the moment the screen is built (see TRAY_SPREAD), and the leftmost
    hole is then that permanently empty middle rather than the place the child
    just took a card from. The tray's whole promise is that a picture is lifted
    out and a new one appears IN ITS PLACE - see the note over this section - so
    the caller says which place, and the search is only the fallback for a
    refill that is owed without one. */
/** Pack the box's cards to the left, so the empty places are all at its
    right-hand end.

    FOR THE END OF THE STORY AND NOTHING ELSE. There are twelve pictures and
    three places, so the last of them cannot keep the box full however deep the
    pool is drawn - once the twelfth picture has been built there is genuinely
    nothing left to put in a place that empties. What this decides is only WHERE
    the emptiness shows: a gap between two cards reads as a missing card, which
    is a fault; the same gap at the end of a row reads as a row running out,
    which is the truth. The user's instruction covers this case too - "the next
    option should take the place" - and when there is no next option in the pool,
    the next option in the BOX is the one that takes it.

    A NO-OP WHILE ANYTHING IS STILL OWED. A hole with a card waiting for it is
    about to be filled by admitNext, and closing it up would move two cards
    sideways for nothing and then have the new one land somewhere else entirely.
    That is why this is guarded on the pool rather than called from layoutQueue:
    the places in this box do not move while there is any picture left to stand
    in them. */
function closeGaps() {
  if (nextPool.length) return;                      /* a refill is still owed */
  const cards = queue.filter(Boolean);
  if (cards.length === queue.length) return;        /* nothing to close */

  const before = queue.join('|');
  queue = queue.map((unused, i) => cards[i] || null);
  if (queue.join('|') === before) return;           /* already packed left */
  layoutQueue();                                    /* .card transitions left/top */
}

function admitNext(at = -1) {
  if (at === -1 || queue[at] !== null) at = queue.indexOf(null);
  const id = nextPool[0];
  /* Nothing left to draw: pack what is still there to the left rather than
     leaving a hole in the middle of the box. See closeGaps(). */
  if (at === -1 || !id) { closeGaps(); return; }
  const el = cardNodes.get(id);
  if (!el) { nextPool.shift(); return; }

  nextPool.shift();
  queue[at] = id;

  /* PLACED, NOT SLID. It has been parked off the right edge of the stage since
     this screen was built, and both .is-waiting and .is-arriving turn the
     left/top transition off — so putting it over its place here does not carry
     it 660px across the box from outside the picture. It simply IS there, and
     the drop in styles.css is the whole entrance. See the note over
     .card.is-arriving for why it drops rather than slides. */
  el.classList.remove('is-waiting');
  el.classList.add('is-arriving');
  el.tabIndex = 0;
  el.removeAttribute('aria-hidden');

  const p = stationPos(at);
  el.style.left = p.x + 'px';
  el.style.top  = p.y + 'px';

  const ms = cssNum('--arrive-ms', 720);
  arriveTimers.push(setTimeout(() => el.classList.remove('is-arriving'), ms + 40));

  /* THE BUMP, WHICH IS NOT THE START. --arrive-land is where in the drop the
     card first touches down, so the twinkle and the cue go off with the landing
     rather than with the card appearing 112px above it. The property and the
     44% keyframe are one number and move together. */
  arriveTimers.push(setTimeout(() => {
    const w = cardSpecs.get(id).home.w;
    arrivePop(p.x + w / 2, p.y);

    /* AND IT IS SILENT TODAY, DELIBERATELY. `deal` is the right cue for this —
       it IS a card landing in a tray station, which is the only thing it was
       ever written for — but it is in SFX_MUTED, so this call returns without
       making a sound, exactly the way every pickup in the game does.

       IT IS WIRED RATHER THAN LEFT OUT so that unmuting is one line and not a
       search. The argument for the mute is written out at SFX_MUTED and it was
       about the ROUND-START DEAL: three cards dealt out under the narrator's
       question, scenery nobody needs to hear, with her talking over it. A
       refill is not that. It fires 620ms after a placement, in clear air, on a
       beat the child's own hand created — which is the case that note calls the
       better one ("the next sound a child hears is their own first placement").
       That is a change to the game's SOUND, though, and the sound has been
       settled cue by cue; it is not something an animation should decide.
       Unmute it — AARU_AUDIO.SFX_MUTED.delete('deal'), live, no reload — to hear
       what it would be.

       THE GUARD IS FOR THE DAY IT IS UNMUTED. The last refill of a screen lands
       inside the celebration — the third card has been hung, so `applause` and
       Aaru are already on their way (see finishRound) — and a second cue under a
       clapping room is not heard as a second cue, it is heard as the clap being
       dirty. The screen is over by then; that moment belongs to what the child
       just did, not to the box tidying itself up behind them. */
    if (activeSlot() !== -1) sfx('deal', { pan: panAt(p.x + w / 2) });
  }, ms * cssNum('--arrive-land', 0.44)));
}

/* HOW MANY TWINKLES THE LANDING THROWS, fanned UP and out from the middle of
   the card's top edge — upward because anything aimed down or sideways lands on
   the photograph, and a sparkle that sits on top of the thing it is decorating
   is just a smudge on it. */
const ARRIVE_STARS = 9;

/* ...and how far above the card's resting top edge they come from. See the
   note in arrivePop(). */
const ARRIVE_POP_LIFT = 12;

/** The twinkle a new picture lands in.

    ITS OWN ELEMENT AND NOT A PSEUDO ON THE CARD, because .card is
    overflow:hidden — it has to be, the artwork is cropped by it (see
    paintCardArt) — so anything drawn on the card would be clipped to the
    picture and the stars would never leave it. It removes itself. */
function arrivePop(cx, cy) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const host = document.createElement('div');
  host.className = 'tray-pop';
  host.style.left = cx.toFixed(1) + 'px';
  /* A LITTLE ABOVE THE CARD'S TOP EDGE, not on it. The card is at its flattest
     when this fires (the 44% keyframe), so its own top is ~26px BELOW where it
     comes to rest - anchored on the resting edge the burst opens inside the
     picture. Lifted, it opens in the air over the box's rim, which is where a
     thing that has just been dropped throws its dust. */
  host.style.top  = (cy - ARRIVE_POP_LIFT).toFixed(1) + 'px';

  for (let i = 0; i < ARRIVE_STARS; i++) {
    const st = document.createElement('i');
    /* Straight up is -90deg, so -158 to -22 is a bit over a third of a circle
       opening over the card. --d staggers how far each one gets and --t when it
       leaves, so nine of them do not read as one expanding ring. */
    st.style.setProperty('--a', (-158 + i * (136 / (ARRIVE_STARS - 1))).toFixed(1) + 'deg');
    st.style.setProperty('--d', (82 + (i % 3) * 30) + 'px');
    st.style.setProperty('--t', ((i % 4) * 30) + 'ms');
    host.appendChild(st);
  }

  cardsEl.appendChild(host);
  arriveTimers.push(setTimeout(() => host.remove(), cssNum('--pop-ms', 560) + 260));
}

/* --- rendering ------------------------------------------------------------- */

/** Index of the leftmost empty slot, or -1 when the round is complete. */
function activeSlot() {
  return filled.indexOf(null);
}

/** How many of this screen's frames were already answered when it arrived.

    DERIVED RATHER THAN STORED. `filled` is as long as the bay has frames and
    `order` is as long as the list of pictures the child has to place, so the
    difference IS the anchor count and there is nothing for a second variable to
    drift from. None on the first screen, exactly one on every screen after it.

    AND THIS IS WHY `order` STAYS STRICTLY THE NEW PICTURES. storyCards()
    concatenates all five of them to get the eleven in story order, and the
    recap's RING_SKIP / RING / SCENE_FX are indexed into that join BY POSITION.
    An anchor is the previous screen's picture and is already counted there once;
    putting it in this screen's `order` too would make the story twelve beats
    long and slide every skipped card and every measured scene effect one place
    to the left. What shifts is the READ, not the data. */
function anchorCount() {
  return filled.length - round.order.length;
}

function expectedCardFor(slotIndex) {
  return round.order[slotIndex - anchorCount()];
}

/** The question a screen opens with. `ask` is one name for the whole screen or
    one per slot — see the `narration` blocks in ROUNDS.

    ONE CALLER LEFT, enterRound(), and it only ever asks for slot 0. This used to
    be read again on every stall, by askAgain(), which is why it takes a slot at
    all; nothing re-asks now (see where IDLE_VO_MS used to be declared). The
    per-slot form is kept because it costs nothing and it is what a screen that
    wants to greet each frame in her voice would need. */
function askLineFor(slotIndex) {
  const vo = round && round.narration;
  if (!vo || !vo.ask) return null;
  return Array.isArray(vo.ask) ? (vo.ask[slotIndex] || null) : vo.ask;
}

/** What she says when a slot is answered correctly: the praise for the event
    just placed, and then whatever should be asked next. Null on every screen
    and slot the sheet gives no recording for. */
function answeredLinesFor(slotIndex) {
  const vo = round && round.narration;
  return (vo && vo.answered && vo.answered[slotIndex]) || null;
}

/** What she says when the whole screen is finished. NO SCREEN HAS ONE NOW —
    screen 1's handover, 29, is spoken on the second placement instead, which is
    where the sheet ends the Tutorial. The hook stays because a finished screen
    has no other way to speak; see HANDOVER_LEAD_MS for the timing it would
    inherit. */
function doneLineFor() {
  const vo = round && round.narration;
  return (vo && vo.done) || null;
}

/* --- the question, written out ----------------------------------------------

   The banner types itself. The whole point of the code below is that it types
   in Hindi, which a substring loop cannot do.

   Devanagari does not store a syllable as one character. `कहानी` is क + ह + ा +
   न + ी, and `क्या` is क + ् + य + ा — so revealing one JavaScript character at
   a time puts a matra on screen with no letter under it (`कहान` and then a
   loose `ी`), and breaks क्या into three fragments, none of which is a letter.
   It looks like a rendering fault, and to a seven-year-old learning to read it
   is worse than that: it is a misspelling, held on screen, four times a round.

   So the unit is the grapheme cluster — what a reader would call a letter —
   which is exactly what Intl.Segmenter returns, conjuncts included:

     कहानी में सबसे पहले क्या हुआ था?
     [क][हा][नी][ ][में][ ][स][ब][से][ ][प][ह][ले][ ][क्या][ ][हु][आ][ ][था][?]

   21 letters, not 32 characters, and every frame of the reveal is a word a
   child could read aloud.

   Two things follow from that and are worth not undoing:

   The clusters are written into ONE text node, as a joined string. Wrapping
   each in its own span would be the obvious way to reveal them, and it would
   break the script: Devanagari shaping does not cross element boundaries, so
   क् and य in sibling spans stay क् and य and never become क्य.

   And the reveal is skipped when the text has not changed. render() runs on
   every touch, and rounds 2-4 ask the same question in all three frames - so
   comparing against the string already up is what stops the banner retyping
   itself under the child's hand.

   THAT MEMORY SURVIVES A SCREEN CHANGE TOO NOW, and it did not: buildRound()
   used to clear promptText unconditionally, so each new screen wrote its question
   out again even when it was the same sentence. It keeps it when the incoming
   round asks what is already up. The note there has the ask, and why a half-typed
   sentence is not what gets kept.
   ---------------------------------------------------------------------------- */

let typeTimer  = null;
let promptText = null;             // the sentence the banner is showing, or writing
let promptHold = null;             // ...and the slot it is pinned to, if any
let promptTimer = null;            // ...and the wait before the pin comes out

/* --- THE BANNER AND THE VOICE, ON ONE CLOCK ---------------------------------

   THE BANNER BELONGS TO THE NARRATOR, NOT TO THE BOARD, and getting that the
   wrong way round is what the user reported: "when the feedback VO for the first
   interaction is playing, keep the first instruction visible in the instruction
   bar. The instruction bar should update to the second instruction only when the
   second instruction VO begins."

   WHAT IT DID. placeCard() filled the slot and called render() on the same tick,
   and render() asks activeSlot() which question is up — so the moment a card
   landed the wall started typing out frame 2's question while she was still five
   seconds into "वाह! सही पकड़ा! सबसे पहले आरु को भूख लगी थी", the praise for frame
   1. For those five seconds the child was being told two different things by the
   two halves of the same screen, and the half they can READ was ahead.

   WHAT IT DOES. A placement PINS the banner to the question it just answered.
   The pin comes out when the line that asks the NEXT question starts speaking —
   not when it is queued, when it actually opens its mouth — so the sentence on
   the wall and the sentence in the air change on the same frame.

   THREE WAYS THE PIN COMES OUT, and all three are needed:
     - the chained line starts          the normal path, sayAnswer's hook
     - the chained line never loaded    sayNext fires the hook anyway, above the
                                        buffer check, so a missing recording
                                        cannot strand the banner
     - she falls silent                 sayNext's empty-queue branch: nothing is
                                        coming, so nothing else will move it

   AND IT IS OFF ENTIRELY WHEN SHE IS. At VO_VOLUME 0 there is no voice to
   synchronise with, so sayAnswer never pins and the banner behaves exactly as it
   did before any of this: it follows the board. */

/** Take the pin out and let the banner follow the board again.

    Whichever of the four paths gets here first cancels the wait the others were
    going to use, so a pin can only ever come out once. */
function releasePrompt() {
  clearTimeout(promptTimer);
  promptTimer = null;
  if (promptHold === null) return;
  const was = promptHold;
  promptHold = null;
  /* A ROUND THAT FINISHED UNDER THE PIN needs the banner moved by hand. render()
     holds the last question once the board is full (blanking it would leave the
     wall empty through the haul), so on that path it has nothing to move TO —
     and this is a real path, not a corner: it is a child who places screen 1's
     third card while the second praise is still sounding, and the line coming
     out from behind that praise is the handover, whose closing sentence is word
     for word screen 1's third prompt. */
  if (activeSlot() === -1) {
    const next = round && round.prompts[was + 1];
    if (next) typePrompt(next);
  }
  render();
}

/** Keep the pin in for the first `secs` of the line that has just opened its
    mouth.

    FOR A LINE WHOSE FIRST WORDS ARE NOT THE ONES THE BANNER IS WAITING FOR.
    Only one line in the game is like that — the Tutorial's handover, which
    spends six and a half seconds closing the Tutorial and turning towards the
    next one before it reaches the words the banner says — and
    VO_SRC.handoff.bannerAt is where in it they start. See ASK_ORDER_WORDS_AT for
    how that instant was measured, and why it is not the sentence break.

    A FOURTH RELEASE PATH RATHER THAN A REPLACEMENT FOR THE OTHER THREE. Every
    one of them still stands and every one of them cancels this wait (see
    releasePrompt), so nothing here can strand the banner: a recording that never
    loaded is skipped and the empty queue releases at once, and she falling
    silent for any other reason does the same. The only thing this adds is that
    when the line DOES play out normally, the pin comes out partway through it
    instead of at its first frame. */
function holdPromptFor(secs) {
  clearTimeout(promptTimer);
  promptTimer = setTimeout(() => { promptTimer = null; releasePrompt(); }, secs * 1000);
}

/** Her answer to a correct placement, with the banner pinned behind it.

    `names` is the slot's `answered` list from ROUNDS: the praise for the event
    just placed, and — where the screen has one — the line that asks for the next
    thing. It is that SECOND line the banner waits on, which is why a list of one
    pins nothing: there is no next question coming, so the board may have the
    banner immediately. */
function sayAnswer(names, slotIndex) {
  const list    = names.slice();
  const chained = list.length > 1 && voLine(list[1]);
  if (VO_VOLUME && chained) {
    /* A COPY, because VO_SRC's entries are shared constants and two slots may
       chain the same line — hanging a callback on the original would leave it
       there for every later use of it. */
    /* ...AND WHERE IN THAT LINE THE PIN COMES OUT. `bannerAt` is set on the one
       line whose question is not its first sentence; without it the pin comes
       out on the line's first frame, which is what every other chained line
       wants. See holdPromptFor(). */
    const into = chained.bannerAt || 0;
    list[1] = Object.assign({}, chained, {
      onStart: into ? () => holdPromptFor(into) : releasePrompt,
    });
    promptHold = slotIndex;
  }
  /* THE PIN IS ALREADY TAKEN ABOVE AND ONLY THE VOICE WAITS. See PLACE_LEAD_MS:
     she is held off for the length of the reward chime so it is not ducked to a
     twelfth of itself the moment it starts. promptHold cannot wait with her -
     render() runs on this same tick and would move the banner on. */
  clearTimeout(praiseTimer);
  praiseTimer = setTimeout(() => { praiseTimer = null; say(list); }, PLACE_LEAD_MS);
  paintSlots();                   // she counts as talking now - see speaking()
}

/** Split text into what a reader would call letters. Intl.Segmenter does this
    properly, Unicode conjunct rules and all, and is in every browser from
    Chrome/Edge 87, Safari 14.1 and Firefox 125 on.

    The fallback is for older WebViews on school tablets, and is deliberately
    only as clever as this game needs: it hangs every Devanagari mark on the
    letter before it, and after a virama it also keeps the next consonant, so
    क्य survives. Latin combining accents are covered too. Anything else falls
    back to one code point per cluster, which is correct for Latin digits and
    punctuation — all this game has left. */
function clusters(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter('hi', { granularity: 'grapheme' })
                        .segment(text), part => part.segment);
  }
  /* Compared as code points rather than matched against a character class,
     because a class of escapes is unreadable and a class of the marks
     themselves is unreadable AND unsafe to edit -- a lone combining mark in
     source is one editor normalisation away from moving onto the bracket next
     to it. Ranges, in order: Latin combining accents; candrabindu, anusvara and
     visarga; the matras and the virama; the Vedic accents; the vocalic marks. */
  const isMark = cp =>
    (cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x0900 && cp <= 0x0903) ||
    (cp >= 0x093a && cp <= 0x094f) || (cp >= 0x0951 && cp <= 0x0957) ||
    (cp >= 0x0962 && cp <= 0x0963);
  /* The independent vowels and consonants -- what a virama may bind to. */
  const isLetter = cp =>
    (cp >= 0x0904 && cp <= 0x0939) || (cp >= 0x0958 && cp <= 0x0961) ||
    (cp >= 0x0971 && cp <= 0x097f);
  const VIRAMA = 0x094d, ZWNJ = 0x200c, ZWJ = 0x200d;

  const out = [];
  let cur = '', afterVirama = false;
  for (const ch of text) {                   // by code point, not code unit
    const cp     = ch.codePointAt(0);
    const joiner = cp === ZWNJ || cp === ZWJ;
    /* After a virama the next consonant belongs to the same conjunct, so it is
       held back too: that is what keeps क्य from arriving as क् and then य. It
       has to be a LETTER, though -- a virama followed by a space or the end of
       a word is a half form in its own right and the cluster ends there. */
    if (cur === '' || joiner || isMark(cp) || (afterVirama && isLetter(cp))) {
      cur += ch;
    } else {
      out.push(cur);
      cur = ch;
    }
    afterVirama = cp === VIRAMA || (afterVirama && joiner);
  }
  if (cur) out.push(cur);
  return out;
}

/** Put `text` in the banner, written out a letter at a time. A no-op if that
    sentence is already there, so this is safe to call from render(). */
function typePrompt(text) {
  if (text === promptText) return;
  promptText = text;
  clearInterval(typeTimer);
  typeTimer = null;

  /* Assistive tech gets the finished sentence immediately. Reading a question
     out in 21 instalments is not an effect, it is an obstacle. */
  promptEl.setAttribute('aria-label', text);

  /* Zeroed by prefers-reduced-motion, in which case the question simply
     appears — which is the same information without the motion. */
  const step = cssNum('--prompt-type-ms', 46);
  if (!step) {
    promptEl.textContent = text;
    return;
  }

  const letters = clusters(text);
  let shown = 0;
  promptEl.textContent = '';
  typeTimer = setInterval(() => {
    shown += 1;
    /* Rebuilt from the front rather than appended to, so what is on screen is
       always "the first n letters of this sentence" and one text node. */
    promptEl.textContent = letters.slice(0, shown).join('');
    if (shown >= letters.length) {
      clearInterval(typeTimer);
      typeTimer = null;
    }
  }, step);
}

function render() {
  const active = activeSlot();

  /* WHICH QUESTION IS UP is not simply "the frame the child is on". While a
     placement's praise is still sounding the banner stays on the question that
     placement ANSWERED, and moves on only when the next one is spoken — see
     promptHold and the note beside it.

     A round that is complete keeps the question it was asking. Blanking it
     would leave the banner empty through the haul and, after the last round,
     for good. */
  const show = promptHold !== null ? promptHold : active;
  if (show !== -1) {
    typePrompt(round.prompts[show] ?? round.prompts[round.prompts.length - 1]);
  }

  /* THREE STATES PER FRAME, AND ONLY ONE OF THEM IS ALLOWED TO NOTICE THAT SHE
     IS TALKING:

       is-active   the frame in turn, while the board belongs to the child. This
                   is the one that pulses.
       is-later     empty, but its turn has not come. Frames fill left to right -
                   activeSlot() is the leftmost empty one - so a fresh screen
                   shuts frames 2 and 3, filling frame 1 opens frame 2 and leaves
                   3 shut, and it needs no per-screen bookkeeping to do it: the
                   rule is read off `filled` every pass, which is what makes it
                   hold for every round including the ones that arrive with an
                   anchor already in frame 1. See .slot.is-later in styles.css.
       neither     filled, or the frame in turn while she is still speaking.

     THE REFUSAL WAS ALREADY THERE; THIS IS THE PART THE CHILD CAN SEE. Nothing
     below changes what a tap does - tryPlace() has always rejected any frame but
     activeSlot() - it changes a board that offered three identical empty frames
     and then said no to two of them.

     is-later IS NOT GATED ON inputLocked(), AND THAT IS THE WHOLE CARE HERE. The
     pulse is, because a pulse is a hint and a hint offered to a child who cannot
     act on it is the thing `no hint while she is talking` asserts against in
     sim.js teach. But going grey is not a hint - it is what the frame IS - and a
     board that dimmed two of its three frames every time she opened her mouth
     would be blinking at the child rather than instructing them. So the pulse
     stops while she speaks and the shape of the answer stays put.

     THE TAB ORDER FOLLOWS THE SAME LEFT-TO-RIGHT RULE, for the reason given
     where a placed card takes its own frame out of it: a frame that cannot
     accept anything should not be a stop a keyboard player has to walk past.
     The difference is that this one comes back when the frame's turn does, so it
     is held off inputLocked() as well - the tab order must not shuffle under a
     child mid-tab just because a line started playing. aria-disabled still
     carries the transient lock, which is where that belongs. */
  paintSlots();

  cardNodes.forEach((el, id) => {
    el.classList.toggle('is-selected', id === selectedId);
  });
}

/** The three frames' own state, split out of render() so that say() can call it
    the moment she opens her mouth.

    IT IS SPLIT OUT RATHER THAN CALLING render() BECAUSE render() IS NOT SAFE
    THERE. render() writes the banner, and the banner comes out of
    `round.prompts` - so on any path that speaks with no round up (the very first
    line, and Aaru's own at the end, see playEntry) render() would read prompts
    off null and throw. This touches nothing but the frames, reads only
    `filled` and slotEls, and does nothing at all when there is no bay yet. */
let activeArm = null;             // the short wait before a frame starts pulsing

/* WHICH FRAMES HAVE ALREADY KNOCKED. A frame gets its two beats ONCE, on the
   turn it becomes the child's, and never again - not when she stops speaking,
   not after a wrong answer, not after three of them: "the pulse effect on the
   frame should happen only once. Even if I have selected wrong answers, it
   shouldn't pulsate again."

   THIS IS WHY THE KNOCK IS NOT ON .is-active. That class comes off every time
   she opens her mouth and goes back on when she stops, and a CSS animation
   restarts when its class arrives - so hanging the beats on it made them replay
   on every speech boundary in the game. .is-knock is added once per frame and
   only ever removed when the frame stops being the active one, by which point it
   is filled and finished with.

   A WeakSet OF THE ELEMENTS, NOT A SET OF INDICES, so there is no lifecycle to
   get wrong: every screen builds a fresh bay from the template, and a fresh
   frame is an object this has never seen, so it knocks once on arrival with
   nothing to reset. The old ones go with the bay. */
const knocked = new WeakSet();

/* HOW LONG A FRAME WAITS BEFORE IT KNOCKS. Long enough to cover a caller that
   renders and THEN speaks in the same tick, short enough that a child never
   waits for the board to answer them. Nothing is gated on it but the pulse -
   the dimming, the tab order and aria-disabled are all still immediate. */
const PULSE_ARM_MS = 140;

function paintSlots() {
  const active = activeSlot();
  clearTimeout(activeArm);
  activeArm = null;

  const live = active !== -1 && !inputLocked();
  slotEls.forEach((el, i) => {
    const mine = i === active;
    /* TAKEN OFF AT ONCE, PUT ON A BEAT LATER - and that asymmetry is the whole
       point. Stopping the pulse can never be too early; starting it can very
       easily be too soon. */
    if (!live || !mine) el.classList.remove('is-active');
    /* Only when it is no longer the frame in turn - which means it has been
       filled. Taking it off any earlier would cancel the beats mid-knock, and
       putting it back could never replay them (see the knocked WeakSet), so the frame
       would simply lose them. */
    if (!mine) el.classList.remove('is-knock');
    el.classList.toggle('is-later', filled[i] === null && !mine);
    el.setAttribute('aria-disabled', String(!mine || inputLocked()));
    el.tabIndex = mine ? 0 : -1;
  });

  /* THE PULSE IS ARMED, NOT SET, so that ORDERING STOPS MATTERING. Every glitch
     of this kind has been the same shape: something calls render() and then
     say() on the same tick, so for that tick she is not yet speaking, the frame
     lights up, and her first word puts it out - a blink the user has now
     reported twice, once as the praise lead (see speaking(), which counts
     praiseTimer for the same reason) and once as "the pulse effect shouldn't
     come when the narrator is speaking throughout the game." Chasing the
     callers one at a time fixes the ones that exist today. Waiting a beat fixes
     the shape: say() calls paintSlots(), paintSlots() clears this timer, and any
     line starting within PULSE_ARM_MS of a repaint cancels the knock before it
     is ever seen. inputLocked() is re-read when it fires, so a line that starts
     any other way is caught too. */
  if (!live) return;
  activeArm = setTimeout(() => {
    activeArm = null;
    if (inputLocked()) return;
    const a = activeSlot();
    const el = a !== -1 && slotEls[a];
    if (!el) return;
    el.classList.add('is-active');          // the frame is marked for its whole turn
    if (!knocked.has(el)) {                 // ...but it only knocks the first time
      knocked.add(el);
      el.classList.add('is-knock');
    }
  }, PULSE_ARM_MS);
}

/* --- hint visuals ----------------------------------------------------------

   TWO RUNGS, TWO JOBS, AND THEY ARE NO LONGER THE SAME SHAPE:

     the pulse   "there are choices here — look at them." EVERY card standing in
                 the tray, so it carries no answer in it.
     the hand    "this one, and it goes there." The answer, mimed.

   IT USED TO BE ONE FUNCTION DOING BOTH. Idle Hint 1 pulsed the CORRECT card,
   which handed a child who had simply stopped moving the answer for free — nine
   seconds of stillness and the right picture lit up. The user stopped that:
   "after the first frame is correctly placed, I want you to not pulsate the
   right answer. All three options should pulsate so that the child doesn't know
   which is the right answer."

   pulseCorrectCard() STAYS, WITH TWO CALLERS, and both are places where the
   child has either earned the answer or has not yet been shown the game at all:

     the 3rd incorrect attempt   the sheet's own Incorrect Feedback column, and
                                 by then she has NAMED the picture out loud on
                                 the 2nd attempt. All three pulsing there would
                                 contradict what the child has just been told.
     screen 1's first frame      firstTeach(): a demonstration, not a hint. The
                                 hand is about to drag that one card into that
                                 one frame, so pulsing the other two would be
                                 pointing at three cards and dragging one. This
                                 is the "first screen, first frame part" the user
                                 carved out.

   THE HAND IS UNCHANGED and appears in exactly the two places it always did —
   Idle Hint 2, and the first-frame demonstration. showHandNudge() has no other
   caller, and it still parks on the correct card: rung 1 says "look", rung 2
   says "here", and that escalation is the whole point of a ladder.
   -------------------------------------------------------------------------- */

/** Rung 1 — every choice in the tray, so the pulse says nothing about which one
    is right.

    THE TRAY AND NOT THE ROUND. Since the box refills itself the three cards
    standing in it are not all from this screen (see admitNext), and that is the
    point rather than a wrinkle: pulsing only this screen's remaining cards would
    leak the same answer the correct-card pulse did, by omission — on the third
    frame there would be exactly one card pulsing again. What pulses is what the
    child can see and reach.

    OFF `queue` AND NOT off cardNodes, which is what makes that true: cardNodes
    also holds the next screen's cards while they are still parked off the right
    edge of the stage, and pulsing those would be hinting at pictures that are
    not on the screen. */
function pulseChoices() {
  /* inputLocked() AND NOT `locked`: the second half of it is speaking(), and a
     pulse offered under her voice is the board asking a child to touch
     something it is about to refuse. armIdle() already refuses to arm while she
     talks, so the idle rungs cannot get here - what this catches is a rung on a
     timer that was armed in a silence and fell due in a sentence. */
  if (inputLocked() || activeSlot() === -1) return;
  queue.forEach(id => {
    if (!id) return;                        // a place waiting to be refilled
    const el = cardNodes.get(id);
    if (el) el.classList.add('is-hinted');
  });
}

function pulseCorrectCard() {
  const slot = activeSlot();
  if (inputLocked() || slot === -1) return;    // see pulseChoices()
  const el = cardNodes.get(expectedCardFor(slot));
  if (el && !el.classList.contains('is-placed')) el.classList.add('is-hinted');
}

function clearPulse() {
  cardNodes.forEach(el => el.classList.remove('is-hinted'));
}

/** Is rung 1 already on the screen? armIdle() asks, so that a pause which finds
    the pulse up owes the hand and not another pulse. */
function pulseShowing() {
  let up = false;
  cardNodes.forEach(el => { if (el.classList.contains('is-hinted')) up = true; });
  return up;
}

/** Drop a hand's fingertip inside the thing it points at. */
function anchorHand(el, centreX, centreY) {
  el.style.left = (centreX + HAND_ANCHOR.x) + 'px';
  el.style.top  = (centreY + HAND_ANCHOR.y) + 'px';
}

/** Idle Hint 2 — the 133:2037 pair, demonstrating the drag: a solid hand parked
    on the correct card, and a ghost of it that carries from there to the frame
    that card belongs in, over and over.

    IT IS NOT REACHED BY WAITING, other than on the first frame of screen 1. This
    shows the child the correct card AND the frame it goes in AND the gesture, so
    it is the whole answer performed for them; the ladder now hands it out only to
    a child who has actually got the frame wrong, and once as a demonstration at
    the start of the game. armIdle() holds the gate and says why. */
function showHandNudge() {
  const slot = activeSlot();
  if (inputLocked() || slot === -1) return;    // see pulseChoices()

  const id = expectedCardFor(slot);
  const el = cardNodes.get(id);
  if (!el || el.classList.contains('is-placed')) return;

  const w    = cardSpecs.get(id).home.w;
  const from = trayPos(id);
  const cardX = from.x + w / 2;
  const cardY = from.y + CARD_H / 2;
  const to    = SLOT_CENTER[slot];

  /* Both hands start on the card. The lead one stays there — it is the grab
     point, not part of the motion — while the ghost travels the whole distance,
     which is why --dx/--dy is the plain delta between the two centres. */
  anchorHand(handEl,  cardX, cardY);
  anchorHand(ghostEl, cardX, cardY);
  ghostEl.style.setProperty('--dx', (to.x - cardX).toFixed(1) + 'px');
  ghostEl.style.setProperty('--dy', (to.y - cardY).toFixed(1) + 'px');

  handEl.hidden = ghostEl.hidden = false;
}

function hideHand() {
  handEl.hidden = ghostEl.hidden = true;
}

/** Restart the idle clock, and take down anything it has already put up. Any
    interaction calls this.
    A card held in hand is not inactivity, so the clock stays stopped for the
    whole drag — otherwise a child thinking with a card lifted gets pulsed at,
    and the nudge would point out of the station the card is no longer in. */
function resetIdle({ keepPulse = false } = {}) {
  hideHand();
  if (!keepPulse) clearPulse();
  armIdle();
}

/** Whether there is a question on the screen for the child to be idle about. */
function idleClockRuns() {
  return started && !locked && !drag && round !== null && activeSlot() !== -1;
}

/* WHY THERE IS NO idleMayHint() ANY MORE, and this is worth reading before
   putting one back, because it has been both ways and both were asked for.

   THE TWO LADDERS OVERLAP. The sheet has two columns that end in the same
   picture lighting up:

     Incorrect Feedback   1st wrong  wiggle, and "No VO or hint"
                          2nd wrong  the voice-over for the correct picture
                          3rd wrong  ...and THEN the correct card pulses
     Idle Hint            1          after the inactivity period, it pulses
                          2          ...and then the hand nudge

   ONE OF THOSE FIVE ROWS HAS SINCE CHANGED SHAPE. Idle Hint 1 pulses ALL THREE
   choices now, not the correct one — see the hint-visuals note above for the
   user's words and for why the 3rd-wrong row keeps the single pulse. Nothing
   below is affected: what this note is about is WHEN a rung is delivered, and
   that is unchanged.

   WHAT WAS HERE. A gate, `attempts === 0 || attempts >= 3`, which stopped
   stillness delivering a rung the guessing had not reached. It was written for
   a real complaint: at the old IDLE_HINT_1_MS of 4500 a child guessed wrong
   ONCE, sat still four and a half seconds, and the answer lit up - so rungs 2
   and 3 of the incorrect ladder never happened and "1st incorrect attempt: no VO
   or hint" was untrue of the game as played.

   WHAT IT COST, and this is the half the gate could not see: a child who guessed
   wrong once and then stopped touching the screen got NOTHING, ever. No pulse,
   no hand, and since the narrator stopped re-asking, no voice either. The screen
   simply waited. The note that stood here said so in as many words and named the
   lever - "let idleness ADVANCE the ladder by one rung rather than skip to the
   end" - and the user reached for that lever directly: "when a wrong option is
   selected, the incorrect option will wiggle and just stop there. After 9
   seconds, the correct option will show a pulse effect. If the user still
   doesn't do anything after 9 seconds, the hand ghost effect will come."

   SO THE FIX IS THE CLOCK, NOT THE GATE. The original fault was never that
   idleness helped after a wrong guess; it was that four and a half seconds is
   not a stall. At nine (see IDLE_HINT_1_MS) a child who is still guessing never
   reaches either rung - every wrong drop restarts the clock through resetIdle -
   so the incorrect ladder gets its own attempts exactly as the sheet writes
   them, and the idle ladder only ever speaks to a child who has genuinely
   stopped. The two columns no longer compete for the same seconds, which is what
   the gate was really trying to buy.

   IF IT COMES BACK, it should be because nine seconds proved too short, and the
   fix for that is IDLE_HINT_1_MS. `node tools/sim.js stall` is the harness: it
   leaves the screen alone for sixty seconds after zero, one, two and three wrong
   guesses, over every story position. */

/** Start the countdown, without touching what is on screen — resetIdle owns
    that, and the re-arm after the narrator has spoken must leave her hints
    standing rather than clear them and put them back four seconds later.

    THE CLOCK ONLY RUNS FROM SILENCE. The narrator talking is not the child
    being inactive, and nine seconds measured from the start of a seven-second
    line would have her repeating herself over her own tail. So while she has
    anything left to say this arms nothing, and the end of her queue arms it
    instead (see sayNext). Every path that reaches here while she is talking is
    therefore armed a second time, by her, when she stops. */
/** THE ONE PLACE IN THE GAME WHERE THE HINTS ARE NOT A HINT.

    Screen 1, first frame, nothing guessed: the child has just been asked what
    happened first and has never seen a card move. Everywhere else the pulse and
    the hand are a RESPONSE — the sheet's Idle Hint column, something stillness
    earns — but here there is nothing to respond to yet, because nobody has been
    shown that these pictures can be picked up at all, or where they go.

    THE USER'S WORDS: "the pulsate effect and ghost-drag animation should begin
    immediately after the instruction VO ends... since this is the child's first
    interaction with the game mechanic, the visual guidance should appear right
    away so the child understands how to interact with the picture and where to
    drag it."

    WHAT IT COST BEFORE, measured with `node tools/sim.js idle`: she stops at
    7.77s, the card pulses at 12.28s and the hand only mimes the drag at 16.28s —
    four and a half seconds of a blank instruction, and eight and a half before
    anything shows where the picture is meant to go.

    IT IS THIS FRAME AND NO OTHER. By the second frame the child has been shown
    the whole gesture once and has done it once, so the ladder is a hint again
    and keeps its nine seconds. And `attempts === 0` is part of it: a child who
    has already guessed here has had a go, so the demonstration has been
    overtaken by the wrong-attempt ladder and by an ordinary nine-second stall,
    both of which reach the same two rungs by the ordinary route. */
/* ONCE PER SCREEN 1, and this flag is the whole of that. See firstTeach(). */
let taught = false;

function firstTeach() {
  return !taught && round === ROUNDS[0] && attempts === 0 && activeSlot() === 0;
}

function armIdle() {
  clearTimeout(hint1Timer);
  clearTimeout(hint2Timer);
  if (!idleClockRuns() || speaking()) return;

  /* The visual ladder is climbed once per pause. Once the hand is demonstrating
     the drag there is nothing left for these two stages to do — both hints are
     up, and re-running them would ring the hint chime again underneath itself.
     hideHand() is what puts the ladder back at the bottom, and every interaction
     does that through resetIdle.

     THE CHIME GOES WITH THE PULSE IT ANNOUNCES - a hint sound with no hint on
     the screen is worse than silence, which is why it is fired from inside the
     rung and not on a clock of its own.

     THERE IS NO WAIT AT ALL ON THE VERY FIRST FRAME, and both rungs go up
     together — see firstTeach() and TEACH_LEAD_MS. What that arms against is the
     narrator and not the child: armIdle() does nothing while she is speaking and
     sayNext() calls it again the instant her queue empties, so the demonstration
     starts on the beat the instruction stops.

     AND IT IS GIVEN ONCE. `taught` is set the moment it actually appears, not
     when it is armed, so a child who touches something inside the quarter second
     still gets it — but from the first touch onward this frame is back on the
     tuned ladder like every other. WITHOUT THE FLAG IT IS NOT A DEMONSTRATION,
     IT IS A STUCK BUZZER: every interaction routes through resetIdle(), which
     calls hideHand() and then arms again, and on this frame `attempts` is still
     0 and the slot is still 0 — so the state alone is true again and the chime
     re-fires on EVERY TAP. Measured on the version without it: five chimes in
     4.3 seconds of a child tapping the card the hand was pointing at, each one
     0.95s long and overlapping the last, with the pulse and the hand blinking
     off and back on under them. A child taps the pulsing card - that is what
     pulsing it is for - so that is the common path and not an edge case. */
  if (!handEl.hidden) return;                 // both rungs are already up

  const teach = firstTeach();

  /* WHO MAY BE SHOWN THE GESTURE, and it is the one rule in this ladder that is
     not about time.

     THE GHOST DRAG IS DEMONSTRATED ONCE AND AFTER THAT IT IS EARNED. It is the
     only hint that does the child's move FOR them: it picks the correct card out
     of the tray and slides a copy of it into the correct frame, which is the
     whole answer, gesture included. Giving that away for STILLNESS undoes the
     care in the rung below it - pulseChoices() pulses every choice in the box
     precisely so that waiting cannot buy the answer, and then eighteen seconds of
     waiting bought it anyway. The user's words: "after the screen 1 image is
     perfectly placed, all the options will only pulsate as it is doing right now,
     and no ghost drag hand nudge will come".

     SO IT IS GATED ON HAVING ACTUALLY TRIED. `attempts` is the count of
     incorrect attempts at the frame the child is on now - placeCard zeroes it on
     every success and buildRound zeroes it per screen - so `attempts > 0` reads
     as "this child has had a go at THIS frame and got it wrong". A child who is
     simply looking at the board gets the pulse and the chime and nothing more,
     for as long as they like.

     WHAT IS DELIBERATELY UNCHANGED: the wrong-attempt ladder in rejectCard, all
     of it. 2nd wrong still has the narrator name the picture, 3rd wrong still
     puts the correct card's pulse up outright, and both of those re-arm through
     here with attempts already past zero - so the hand still follows nine seconds
     later exactly as it did. "Ghost drag hand nudge will come as per the hint
     logical rules. Do not change that." Only the route from pure stillness is
     closed.

     AND THE DEMONSTRATION IS EXEMPT, because it is not a hint - it is how the
     child is taught that these cards are draggable at all. Screen 1, first frame,
     nothing tried yet, once per game. See firstTeach(). */
  const mayNudge = teach || attempts > 0;

  /* THE PULSE MAY ALREADY BE ON THE SCREEN, in which case rung 1 has been given
     and this pause owes rung 2. That is the third incorrect attempt: it puts the
     pulse up itself, at REJECT_MS, and re-arms with keepPulse. Starting the
     ladder from the bottom there would re-assert a pulse that is already
     pulsing, ring a second chime under it nine seconds later, and hold the hand
     back for eighteen - for a rung the child has already been given.

     THE GATE IS NEEDED ON THIS BRANCH TOO, and forgetting it here would have
     leaked the whole thing: rung 1 leaves every tray card pulsing, so the very
     next armIdle() - and one comes on the beat the narrator stops - would find
     pulseShowing() true and arm the hand from a pause nobody had guessed in. */
  if (pulseShowing()) {
    if (mayNudge) hint2Timer = setTimeout(showHandNudge, IDLE_HINT_2_MS);
    return;
  }

  hint1Timer = setTimeout(() => {
    if (teach) taught = true;
    /* Idle Hint 1. The demonstration pulses the one card its hand is about to
       drag; every ordinary pause pulses all three, so stillness does not buy the
       answer. See the hint-visuals note. */
    if (teach) pulseCorrectCard(); else pulseChoices();
    sfx('hint');
    if (mayNudge) hint2Timer = setTimeout(showHandNudge,   // Idle Hint 2
                                          teach ? 0 : IDLE_HINT_2_MS);
  }, teach ? TEACH_LEAD_MS : IDLE_HINT_1_MS);
}

/* --- the celebration -------------------------------------------------------

   A screen finished is the moment the whole activity is built around, and this
   is what it now buys: Aaru comes on and claps about it. Nothing else moves
   while he is there — the line is not hauled and the next deck is not dealt
   until he has gone, which is the point of him: the child gets to finish being
   pleased before the next question arrives.

   HE HAS TWO POSITIONS AND THE CLIP DECIDES WHICH. The artwork is a round trip:
   he leans out from behind something on his right, stands up whole and claps,
   then leans back behind it again — and in the leaning frames his shirt and leg
   are cut off along a hard vertical line. That cut only reads as him peeking
   around the edge of the screen if it IS on the edge of the screen, and a boy
   clapping while glued to that edge reads as a sticker rather than as a boy. So
   he arrives at the edge, steps in to clap where there is room for him, and
   steps back to the edge for the lean-back. styles.css owns the two positions
   and the four legs between them; this owns WHEN, which is the part only the
   clip knows.

   The walk is driven off el.currentTime in a frame loop rather than off timers
   started when play() was called. Those are not the same clock: a slow first
   decode or a stall would leave him stepping out while the cut frames are still
   on screen, which is the one failure that actually looks broken. Reading the
   clip's own time means a stall moves him LATE instead.

   Two more things follow from him being a video rather than a sprite sheet.

   His own `ended` event is what advances the round, so the pacing belongs to
   the file. Swap the clip for a longer one and the game waits longer, with no
   number in here to keep in step. CELEBRATE_RATE is the one knob, for when the
   clip is right but its speed is not.

   And he can fail. Alpha-in-WebM is not supported on iOS Safari, and a video
   can always simply not decode. So every way out of here goes through one
   `leave` guard, and a backstop timer fires it even if the element never
   reports anything at all. A celebration that does not play has to cost the
   child a beat, not the rest of the game — which is why `done` is called on
   the error path too, and why the codec is checked before he is ever shown
   rather than after.
   -------------------------------------------------------------------------- */

/** 1 is the clip's own speed. Raise it if the clap drags. */
const CELEBRATE_RATE = 1;

/* The two ends of the clip where he is leaning around the screen edge, AS FRAME
   COUNTS rather than as seconds. The lean-in is frames 0-5 and the lean-back is
   the last 5 of 36; the note in styles.css has the full frame map, and these are
   the one thing to re-measure if the clip is ever replaced.

   Not seconds, because the clip's length is a tuning knob in
   tools/dekey-video.py and it has already moved three times. Every time it did,
   a pair of hardcoded seconds here quietly stopped pointing at the frames they
   were measured from - which would step him out of the peek while the cut frames
   were still playing, in the one place the cut shows. Scaled off the duration the
   browser reports, they follow the clip instead. */
const CELEBRATE_FRAMES          = 36;
const CELEBRATE_LEAN_IN_FRAMES  = 6;
const CELEBRATE_LEAN_OUT_FRAMES = 5;

/** Only used when the browser will not report a duration - and it is NOT just a
    backstop, which is why it has to be right. runS feeds the lean cues as well
    as the stall timer, so a wrong value here moves the frame he steps out on.

    THE CLIP IS 4.800s: 36 frames at 7.5fps, TARGET_SECONDS = 4.8 in
    tools/dekey-video.py, confirmed with
        ffprobe -select_streams v:0 -count_frames assets/video/correct_ans.webm

    This said 4200 for a while after the clip became 4.8s, with a comment
    pointing AT TARGET_SECONDS as its authority - a number citing the source
    that disproved it. At 4.2 the lean-in cue lands at 0.700s instead of 0.800s,
    so on a browser with no duration he stepped out to centre while the last
    leaning frame was still up: the one artifact the cue system exists to stop.
    Re-measure this whenever the clip is re-rendered. */
const CELEBRATE_ASSUMED_MS = 4800;

/** Show Aaru, then call `done` once he is off the screen again. Calls `done`
    straight away if he cannot be shown at all. */
/* --- can this browser show an ALPHA video? -----------------------------------

   canPlayType CANNOT ANSWER THIS, and that was the bug. Three places asked it
   `canPlayType('video/webm; codecs="vp9"')` and each carried a comment saying
   what it was for - "a browser that plays WebM but not its alpha would put a
   grey box on the board, which is worse than no celebration at all". The intent
   was right; the test cannot express it. There is no media-type string for a
   pixel format, so canPlayType only ever answers "can I DECODE vp9" - and Safari
   from iOS 17.4 answers "probably" and then discards the alpha channel. What a
   child on an iPhone got was the matte: an opaque brown rectangle standing behind
   Aaru, which is what was reported from a phone.

   SO IT IS MEASURED, once, off a clip already in the document. Draw a frame onto
   a 2D canvas that has been cleared to transparent and read the alpha back.
   Measured on all three clips in a browser that DOES support alpha: frame 0 is
   44-67% FULLY transparent - minimum alpha 0 - at every sample size tried, while
   an alpha-blind decode returns 255 for every pixel. The two cases are nowhere
   near each other, so the 5% threshold below is an order of magnitude under the
   smallest real reading and still clear of a stray decode artifact.

   AND THE DEFAULT IS NO. Until the probe has actually answered, alpha counts as
   unsupported. That direction is safe because every fallback here is a COMPLETE
   path - the game is fully playable and the ending fully resolves with none of
   these clips, which is what the note in playEntry is about - so being wrong this
   way costs a flourish, and being wrong the other way is the box. The probe
   settles while the title screen is still up, seconds before the first
   celebration can be earned.

   WHY NOT JUST FIX THE CLIPS: nothing encodable helps. Safari supports no alpha
   video format that Chromium also has here (its own path would be HEVC with an
   alpha layer in MP4, a second encode of every clip and a second delivery path),
   so the honest options are "detect and skip" or "ship two video pipelines".
   This is the first. tools/dekey-video.py is where the second would start. */
const ALPHA_MIN_PCT = 5;
let alphaVideoOK = false;        // no until proven - see above
let alphaProbes  = 0;

/** The gate the three clip sites share: this browser decodes vp9 AND honours its
    alpha, and this particular element exists. */
function alphaVideoUsable(el) {
  return !!(alphaVideoOK && el && el.canPlayType &&
            el.canPlayType('video/webm; codecs="vp9"'));
}

/** One frame's alpha, read back off a canvas.

    THREE ANSWERS AND NOT TWO. 'nothing' means no frame was available to draw -
    the canvas came back exactly as it was cleared - and that is a reason to ask
    again rather than an answer, which is the difference between "this browser
    ignores alpha" and "this video has not decoded yet". Collapsing those two was
    the tempting mistake: on a phone the second one is normal for a moment. */
function readFrameAlpha(el) {
  try {
    const w = 32, h = 32;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return 'opaque';
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(el, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let below = 0, drawn = 0;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] < 250) below++;
      if (d[i] > 0)   drawn++;
    }
    if (!drawn) return 'nothing';
    return (100 * below / (w * h)) >= ALPHA_MIN_PCT ? 'alpha' : 'opaque';
  } catch {
    /* getImageData throws on a tainted canvas. These clips are same-origin so
       this should not fire, and if it ever does, an unreadable frame is not a
       licence to hang a rectangle on the board. */
    return 'opaque';
  }
}

function probeAlphaVideo() {
  const el = celebEl;
  if (!el || !el.canPlayType || !el.canPlayType('video/webm; codecs="vp9"')) return;

  const attempt = () => {
    const got = readFrameAlpha(el);
    if (got === 'alpha')  { alphaVideoOK = true;  return; }
    if (got === 'opaque') { alphaVideoOK = false; return; }
    /* Polled rather than driven off an event, because the event that means "a
       frame is now drawable to a canvas" is not the same one on every browser,
       and the answer is not needed for several seconds. Twelve tries at 250ms is
       three seconds, after which the fallback stands. */
    if (++alphaProbes < 12) setTimeout(attempt, 250);
  };

  if (el.readyState >= 2) attempt();                 // HAVE_CURRENT_DATA
  else el.addEventListener('loadeddata', attempt, { once: true });
}

function playCelebration(done) {
  const el = celebEl;
  /* A browser that plays WebM but not its ALPHA would put an opaque box on the
     board, which is worse than no celebration at all. canPlayType cannot answer
     that question - see alphaVideoUsable(), which measures it. */
  if (!alphaVideoUsable(el)) {
    done();
    return;
  }

  let gone = false;
  const leave = () => {
    if (gone) return;
    gone = true;
    cancelAnimationFrame(celebRaf);
    clearTimeout(celebTimer);
    el.removeEventListener('ended', leave);
    el.removeEventListener('error', leave);
    el.dataset.leg = 'out';
    celebTimer = setTimeout(() => {
      try { el.pause(); } catch { /* already gone */ }
      /* Back to the base rule, which is where the out leg has just left him
         anyway, so nothing moves. */
      delete el.dataset.leg;
      done();
    }, cssNum('--celebrate-out-ms', 260));
  };

  el.addEventListener('ended', leave);
  el.addEventListener('error', leave);

  /* The clip's length, for the lean-back cue and for the backstop. */
  const runS = isFinite(el.duration) && el.duration
    ? el.duration
    : CELEBRATE_ASSUMED_MS / 1000;

  /* With motion turned down he never travels, so he would be standing at rest
     while the cut frames played — which is the one place they cannot go. The
     clip gets trimmed to the part where he is drawn whole instead. */
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stepS = cssNum('--celebrate-step-ms', 400) / 1000;
  const outS  = cssNum('--celebrate-out-ms', 260) / 1000;

  /* The two lean ends in clip seconds, derived from this clip's own length so
     that changing it in the render tool needs nothing changed here. */
  const leanInS  = runS * CELEBRATE_LEAN_IN_FRAMES  / CELEBRATE_FRAMES;
  const leanOutS = runS * CELEBRATE_LEAN_OUT_FRAMES / CELEBRATE_FRAMES;

  /* Cues, in clip time. `step` is the first frame he is drawn whole on; `back`
     is set so the 400ms return LANDS on the first leaning frame rather than
     starting there. */
  const cues = still ? [] : [
    { at: leanInS, leg: 'step' },
    { at: Math.max(leanInS + stepS,
                   runS - leanOutS - stepS), leg: 'back' },
  ];
  /* Early enough that the fade is FINISHED as the first leaning frame lands,
     not starting on it. */
  const stopAt = still ? runS - leanOutS - outS : Infinity;

  let next = 0;
  const walk = () => {
    if (gone) return;
    const t = el.currentTime;
    if (t >= stopAt) { leave(); return; }
    while (next < cues.length && t >= cues[next].at) el.dataset.leg = cues[next++].leg;
    celebRaf = requestAnimationFrame(walk);
  };

  /* The backstop, from the clip's own length when the browser knows it. It is
     also the only thing that gets him off a hidden tab, where the frame loop
     above is not being called at all. */
  celebTimer = setTimeout(leave, runS * 1000 / (CELEBRATE_RATE || 1) + 1400);

  el.muted = true;                       // belt and braces; autoplay needs it
  el.playbackRate = CELEBRATE_RATE;
  try { el.currentTime = still ? leanInS : 0; } catch { /* not seekable yet */ }
  el.dataset.leg = 'in';
  celebRaf = requestAnimationFrame(walk);

  const started = el.play();
  if (started && started.catch) started.catch(leave);
}

/* --- the finale: Aaru arriving on the line ----------------------------------

   The last story has just been hauled off and nothing has come in behind it,
   so the line is bare — and that is the cue. Aaru comes in from the right on
   the clothesline itself, hand over hand, and settles at the middle of the
   sag, where he stays swinging.

   HE IS ON THE LINE, so everything here is a function of the rope rather than
   of a stopwatch. His grip is put ON ropeY(x) at whatever x he has reached,
   which rides him down into the sag and back up out of it, and he is rotated
   by the line's own tangent there, so the fists stay square to it the whole
   way across. That is also why this is a frame loop and not a transition, for
   exactly the reason the haul is: height-as-a-function-of-x is not something
   an interpolation between two transforms can say. See runHaul().

   THE ARRIVAL IS A SWING, not an ease. What has to read is a boy with weight
   on the end of a line: he comes in carrying speed, glides past the middle,
   and swings back onto it. An ease-out cannot say that — it arrives and stops
   dead, which is what a sticker does — so the travel is a decaying cosine, one
   swing's worth, under an envelope that takes it to nothing:

       (1 - p)^3 * cos(4.5 p)

   Both numbers are doing a job. 4.5 radians is three quarters of a cycle over
   the ride, which is exactly one pass and one return; much more and he
   dithers, much less and there is no swing left in it. The cube is the damping
   — it is what keeps the pass to 107px past the middle rather than the 300+ a
   square gives, which would carry him back over ground the frames have only
   just left. And it is a POWER rather than an exponential for one practical
   reason: (1-p)^3 is exactly 0 at p=1, so he lands on the middle instead of
   near it. A damped spring, which is the obvious way to write this, leaves a
   few px of residual that the last frame has to snap away.

   WHAT IT SPENDS ITS TIME ON. He crosses the right edge at 280ms and reaches
   the middle at 1120ms, so the glide — the part a child actually watches, and
   the whole point of doing this rather than fading him in — is 840ms long and
   is decelerating throughout: 306px in its first fifth, 55 in its last. The
   pass out and the drift back take the remaining 2s between them, most of it
   inside 20px of home and none of it anything to wait for. Paced for a Class 2
   child, like the deal is, and for the same reason.

   AND HE LEANS INTO IT. A body hanging off a moving grip trails behind the
   grip, so his lean is taken from his own SPEED, not from his position: hard
   over while he is travelling, unwound by the time he stops, and tipped the
   other way for the drift back. Rotating about the grip is what makes that
   free — his fists cannot leave the line no matter how far the rest of him
   swings, because the line is what he is turning about.

   The clip itself is a loop and is left running when he gets there. He is a
   boy on a rope; he does not stop moving because he has arrived.
   -------------------------------------------------------------------------- */

const ENTRY_REST_X = 960;             // the middle of the line, and of the sag
/* 2800, DOWN from 3200, and what it buys is the TAIL rather than the glide.

   The ride's shape is (1-p)^3*cos(4.5p), which is asymptotic at the end: he is
   107px past the middle at p=0.5, 20px short of it at p=0.75, and spends the
   whole last quarter covering those 20px. That quarter was 800ms and is now
   700, and it is the only stretch of the ending where nothing visibly changes.

   The glide pays 12% for it - the middle now arrives at 977ms instead of 1117 -
   and that is the honest cost, written down here rather than claimed away. It
   is the smaller of the two cuts on purpose: what a child watches is the ride
   in, so the beat that gets shortened is the one after it. See DROP_HOLD_MS,
   which took the rest. */
const ENTRY_MS     = 2800;
const ENTRY_SWING  = 4.5;             // radians of swing over the whole ride
const ENTRY_DAMP   = 3;               // the envelope's power. See above
const ENTRY_LEAN   = 13;              // degrees of trail at his fastest

/** How far off the right of the stage his grip starts.

    It has to clear the part of him that is to the LEFT of his grip, because
    that is his feet and they are what enters first: --entry-grip-x of
    --entry-w, which is 379px as both are set today. 400 clears it. */
const ENTRY_FROM_X = STAGE_W + 400;

/** The ride: 1 at p=0, 0 at p=1, one swing past the middle in between. */
function entryRide(p) {
  return Math.pow(1 - p, ENTRY_DAMP) * Math.cos(ENTRY_SWING * p);
}

/** Its derivative — how fast he is going, which is what his lean is made of.
    Analytic rather than differenced between frames, so the lean does not
    inherit the jitter of whatever gap the browser happened to hand the loop. */
function entrySwingRate(p) {
  return -Math.pow(1 - p, ENTRY_DAMP - 1) *
          (ENTRY_DAMP * Math.cos(ENTRY_SWING * p) +
           ENTRY_SWING * (1 - p) * Math.sin(ENTRY_SWING * p));
}

/** The fastest he ever goes, so ENTRY_LEAN can be stated as the lean at that
    moment and stay true if the ride above is ever retuned. Swept rather than
    solved: it is 1000 evaluations, once, of a closed form two lines long. */
const ENTRY_PEAK_RATE = (() => {
  let peak = 0;
  for (let p = 0; p <= 1; p += 0.001) peak = Math.max(peak, Math.abs(entrySwingRate(p)));
  return peak;
})();

/** How far he trails his own grip, in degrees, at `p` of the ride. */
function entryLean(p) {
  return ENTRY_LEAN * entrySwingRate(p) / ENTRY_PEAK_RATE;
}

/* --- how long the ride SOUNDS, which is shorter than the ride ---------------

   THE ASK: "when he is entering from the rope sfx should only be played till he
   is moving on the rope from right to center - at the center the sfx should not
   be played."

   WHAT WAS WRONG. `swing` is 2.95s in one take and the ride is ENTRY_MS, so the
   file all but covers the animation - which was the design goal - and it also
   covers the animation's TAIL. entryRide() is asymptotic: he is 20px short of
   the middle at p=0.75 and spends the whole last quarter covering those 20px,
   which the ENTRY_MS note above calls "the only stretch of the ending where
   nothing visibly changes". So from about 2.2s a child saw a boy hanging still
   in the middle of the line and heard a rope still creaking and a slide whistle
   still descending. A sound outliving the movement it is made of is the one
   thing this cue exists not to do.

   DERIVED FROM THE PATH, NOT TYPED IN, and stated as a DISTANCE rather than a
   time: the first point on the RETURN leg where he is within
   ENTRY_SFX_SETTLE_PX of the middle. It has to be the return leg, because the
   outward one passes straight through - he crosses the middle at 977ms at his
   fastest and carries 107px past it, and cutting the sound there would cut it
   off mid-swing, which is the opposite mistake. Retune ENTRY_SWING, ENTRY_DAMP
   or ENTRY_MS and the sound follows them. Swept rather than solved, for the
   reason ENTRY_PEAK_RATE is.

   THE TWO NUMBERS. 14px is 1.5% of his own width, and a boy 14px off the middle
   of a 1920px board reads as arrived. The fade is 450ms, over which he still
   covers about 60px - so it happens underneath visible movement and reaches
   silence on a boy who has stopped, rather than pulling a texture out from under
   one who is still crossing the board. Silence lands at 2.18s, which is 620ms
   before the ride's own end and 770ms before the end of the take. He
   keeps swinging after that, because the clip is a loop and a boy on a rope does
   not stop moving because he has arrived - but he stops TRAVELLING, and the
   travel is what this cue is. */
const ENTRY_SFX_SETTLE_PX = 14;
const ENTRY_SFX_FADE_S    = 0.45;

/** Seconds into the ride by which its cue has to be silent. */
const ENTRY_SFX_OUT_S = (() => {
  const span = ENTRY_FROM_X - ENTRY_REST_X;
  /* From 0.5 - the far side of the overshoot, 107px past the middle - so the
     first crossing cannot be mistaken for the arrival. */
  for (let p = 0.5; p <= 1; p += 0.001) {
    if (Math.abs(span * entryRide(p)) <= ENTRY_SFX_SETTLE_PX) {
      return p * ENTRY_MS / 1000;
    }
  }
  return ENTRY_MS / 1000;
})();

/** The line's slope at `x`, in degrees. Measured across 16px rather than
    differentiated, because ropeY is a piecewise-linear sample of the drawn
    curve and its true derivative is a staircase. */
function ropeTilt(x) {
  return Math.atan2(ropeY(x + 8) - ropeY(x - 8), 16) * 180 / Math.PI;
}

/** Put him on the line: grip at (`x`, the rope there), leaning by `lean`. The
    trailing translate is what makes the grip the anchor — see .entry in
    styles.css, where the two percentages come from.

    STAGE_W AND STAGE_H ARE ADDED BACK ON, and that is not an adjustment to the
    path: .entry's own box is parked one whole stage up and to the left, so every
    transform that puts him somewhere on the board has to carry that stage. The
    note on .entry has the reason - a video quad drawn without its transform for
    one frame used to land him in the top-left corner, and now lands him off the
    board where the stage clips him. Both writers do this: here and finaleDrop().
    Change one and the other is wrong by 1920px. */
function placeEntry(x, lean) {
  entryEl.style.transform =
    'translate3d(' + (x + STAGE_W).toFixed(2) + 'px, ' +
                     (ropeY(x) + STAGE_H).toFixed(2) + 'px, 0)' +
    ' rotate(' + (ropeTilt(x) + lean).toFixed(3) + 'deg)' +
    ' translate(calc(-1 * var(--entry-grip-x)), calc(-1 * var(--entry-grip-y)))';
}

/** Ride Aaru in along the line and leave him swinging in the middle of it.
    Does nothing at all if the clip cannot be shown — the game is over either
    way, and a grey box is worse than a bare line. */
function playEntry() {
  const el = entryEl;
  /* As for the celebration: a browser that plays WebM but not its ALPHA would
     hang an opaque rectangle off the clothesline. See alphaVideoUsable(). */
  if (!alphaVideoUsable(el)) {
    /* AND IF HE CANNOT BE SHOWN, EVERYTHING AFTER HIM STILL HAPPENS. This was
       a bare `return`, and it sat upstream of the whole ending: no ride, so no
       finaleDrop(), so no land(), so the post-game seam never fired. On a
       browser that plays WebM but not its alpha a child placed all twelve
       cards correctly and got nothing at all. (When this was found, the last
       round also sent the box away before the swing, so the board was not just
       missing the recap but literally empty. The box stays now, so the
       bail-out only has to hand over.)

       The recap is cards, CSS and audio; it needs no video and degrades
       perfectly. playCelebration() has the same shape for the same reason. */
    const tray = document.querySelector('.tray');
    if (tray) tray.classList.remove('is-away');
    if (typeof playPostGame === 'function') playPostGame();
    return;
  }

  el.muted = true;                     // belt and braces; autoplay needs it
  const started = el.play();
  if (started && started.catch) started.catch(() => { /* he stays off the line */ });

  /* HE goes above every other thing on the board while he is on the line. See
     .entry.is-finale: at 6 degrees of lean the top of him is already inside the
     banner's strip, because the banner ends 2px above the line.

     The LINE is not touched - it stays behind him, because his fingers wrap
     around it and a rope in front of a fist reads as a rope through the fist.
     There is a note on .rope.is-finale's absence in styles.css. */
  el.classList.add('is-finale');

  /* With motion turned down there is no ride: he is on the line, in the
     middle, faded up over the beat the ride would have taken. */
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* WHERE HE IS PUT BEFORE HE IS SHOWN, and it has to be where the ride
     starts, not where it ends. Placing him at the middle and then letting the
     first frame of the loop move him is one frame of Aaru standing in the
     centre of the board before he vanishes to the right — which is exactly the
     arrival this whole function exists to avoid, played backwards. */
  placeEntry(still ? ENTRY_REST_X : ENTRY_FROM_X, still ? 0 : entryLean(0));
  el.classList.add('is-riding');

  /* AND HE SPEAKS, on the frame he starts crossing the right edge.

     THE USER'S PLACEMENT: "this will be played as Aaru enters from the right
     till he is hanging in the center". So it opens with the ride rather than
     with him arriving - the sentence carries the entrance instead of commenting
     on it afterwards - and because the voice runs 4.96s against a 2.8s ride, it
     is still going as he settles and finishes while he hangs in the middle. That is
     what dropHoldMs() protects: he does not let go until he has stopped talking.

     ON BOTH PATHS THAT SHOW HIM, which is why it is here rather than below the
     `still` branch. With motion turned down he is already on the line and does
     not ride, but he is on it, and a child who has just placed twelve pictures
     should hear about it either way.

     NOT ON THE PATH THAT CANNOT SHOW HIM AT ALL - the codec bail-out above has
     already returned. A voice-over of Aaru arriving, with no Aaru arriving,
     would be a boy's voice coming out of an empty board, and that path goes
     straight to the recap which has cues of its own to collide with.

     IT DUCKS THE EFFECTS 12 dB, which is what puts `swing` below him rather than
     over him - see duck(). The whoosh is the movement he is talking through. */
  say(['aaruDone']);

  /* THE BOX IS ALREADY DOWN. It used to go from here, 900ms into the ride, and
     it goes from the last round's hand-over now - toppleBox(), fired before
     haulLine(), so it has fallen and landed before he crosses the right edge.
     Nothing about it is scheduled from this function any more, including on the
     reduced-motion path: that path existed because BOX_TOPPLE_AT (900) was
     longer than the still path's DROP_HOLD_MS (700), so the box tipped over
     beside a boy who was already standing on the floor. A box that goes before
     the ride starts cannot be late for a landing at the end of it. */

  if (still) {
    /* NOTHING SOUNDS ON THIS PATH, and it is worth keeping the note that put the
       guard here even though the cue it guarded against is gone. It used to fire
       `allDone` — "the length of it covers the ride" — and with motion turned
       down there is no ride to cover, he is simply already on the line, so this
       put two copies of the loudest cue in the game on top of each other:
       playEntry fired it, then DROP_HOLD_MS later (1400ms) finaleDrop took its
       own still path straight to land(), which calls playPostGame(), which fired
       it again, and the two overlapped by 1.40s. The general shape of that bug —
       three callers of one cue on one path, each correct on its own — is the
       reason every finale cue now has exactly one call site.

       See `node tools/sim.js last --video --still`, which is what found it. */
    el.classList.add('is-home');
    /* No ride on this path, so the hold covers his whole line. */
    afterDrop(dropHoldMs(0), finaleDrop);
    return;
  }

  /* THE RIDE'S OWN SOUND. This was sfx('allDone') — the celebration, played over
     him swinging in — and it is the one cue in the game that was mismatched rather
     than merely imperfect. See VOICES.swing. That flourish has since been removed
     from the game entirely, so the ride is this and nothing under it.

     AND IT ENDS WITH THE MOVEMENT RATHER THAN WITH THE TAKE. `out` fades it out
     as he settles into the middle of the line - ENTRY_SFX_OUT_S, derived from
     the path rather than from the file's length. Scheduled here, once, on the
     AUDIO clock and not from the rAF loop below: a backgrounded tab stops
     producing frames, and the cue still ends where the ride would have ended
     it. */
  sfx('swing', { out: ENTRY_SFX_OUT_S, outFor: ENTRY_SFX_FADE_S });
  clearFinaleMotion();
  const rideM = entryMetrics();

  const settle = () => {
    cancelAnimationFrame(entryRaf);
    clearTimeout(entryGuard);
    entryRaf = 0;
    entryGuard = null;
    placeEntry(ENTRY_REST_X, 0);
    /* Written inline because the class that set it is staying: he keeps his
       opacity, he does not keep a promise to move. */
    el.style.willChange = 'auto';
    /* ...and now he can afford a shadow. It costs a re-raster per frame, which
       is why it waits for him to stop moving — see .entry.is-home. */
    el.classList.add('is-home');
    /* He hangs there until he has finished his sentence, and then a beat, and
       then lets go. See dropHoldMs(). */
    afterDrop(dropHoldMs(ENTRY_MS), finaleDrop);
  };

  el.style.willChange = 'transform';
  const t0 = performance.now();
  entryRaf = requestAnimationFrame(function step(now) {
    const p = Math.min(1, (now - t0) / ENTRY_MS);
    const x = ENTRY_REST_X + (ENTRY_FROM_X - ENTRY_REST_X) * entryRide(p);
    placeEntry(x, entryLean(p));
    /* The body's centre trails below the grip; using the grip itself would put
       the air marks on the rope instead of behind the moving boy. */
    finaleAir(x, ropeY(x) + rideM.h * 0.48, now, 'rope');
    if (p < 1) { entryRaf = requestAnimationFrame(step); return; }
    settle();
  });

  /* A backgrounded tab stops producing frames, so it would come back with him
     parked wherever the last one left him — halfway in, leaning. This lands
     him where the ride was going. */
  entryGuard = setTimeout(settle, ENTRY_MS + 400);
}

/* --- the finale, part two: he lets go -------------------------------------

   Four beats, from the storyboard: he swings in, he lets go and drops while
   the box tumbles in beneath him, he lands on it, he stands on it and cheers.

   TWO OF THEM ARE REAL AND TWO ARE A SUBSTITUTION, and it is worth being plain
   about which. The arc and the tumble are animated here. The landing and the
   stand are a CUT: the only Aaru artwork this project has is him swinging on a
   rope and him standing clapping, so at the moment of impact the swinging
   sprite is hidden and the clapping one is put on the box in its place. There
   is no falling pose, no four-point landing and no arms-raised stand, and none
   of them can be got out of a swing cycle. Supply those two clips in the form
   the other two came in and this becomes four real beats; everything else here
   already works.

   HE IS ANCHORED BY HIS FISTS AND HAS TO LAND ON HIS FEET, which is the one
   thing this code has to be careful about. placeEntry() puts --entry-grip-x/y
   of the sprite on the line, and that point is his grip; his feet are the
   bottom of the sprite box, (100 - grip_y)% of its height below it. So the
   height his grip must reach for his FEET to meet the box is worked out at run
   time from the CSS, not written down here — change --entry-w and the arc
   still lands him on it.

   AND IT IS AN ARC, not a fall. Letting go at the bottom of a swing throws you
   UP and forward first; a boy who simply drops off a rope has not let go, he
   has been dropped. DROP_RISE flicks him up before he comes down (a coefficient,
   not the rise: it buys about 6px - see it derived at the constant), he drifts
   DROP_DRIFT the way he was travelling, and he LEANS out and back - DROP_TILT
   degrees at the middle of the fall and square again by the time his sandals
   touch, because the one thing a child dropping off a rope certainly does is
   land on their feet. The lean is also what makes the swinging pose read as a
   fall rather than as a hang that happens to be moving.

   THE VERTICAL IS A REAL PROJECTILE, and it is worth saying so because the
   arithmetic hides it. y = y0 + D*p^2 - 4*R*p*(1-p) expands to (D+4R)*p^2 -
   4R*p: a constant acceleration of (D+4R) with an initial upward velocity of
   4R. That is the shape of every thrown thing, not an ease chosen to look like
   one - which is why the harness can measure the acceleration and get a straight
   answer (0.24 px/ms over the first half against 0.81 over the last).
   -------------------------------------------------------------------------- */

const TRAY_TOP      = 697;    // the box's top edge, from styles.css
/* THE GROUND, which is the box's BOTTOM edge - what it was standing on. He used
   to land on the box's top at 697; the box tips forward and lands before he is
   even on the line now, so he falls the whole way to the floor instead. That is
   also what makes the drop worth watching: 452px rather than 110. */
const FLOOR_Y       = 1039;
/* THE BOX GOES FIRST, AND IT USED TO GO IN THE MIDDLE OF HIS RIDE.

   This was 900ms into playEntry(), which put the tip about 600ms after he had
   already swung into frame: a viewer saw the boy arrive and then, underneath
   him, the board furniture quietly fold away. Two things happening at once,
   neither caused by the other.

   It is measured from the HAUL now - fired by the last round's own hand-over,
   before playEntry() is even called - so the ending reads in the order the
   storyboard draws it: the last story leaves along the line, the box goes over
   and lands, and THEN Aaru swings in over the space it left. HAUL_MS is 1700
   and he does not cross the right edge until about 290ms into the ride, so the
   box is down and settled roughly a second before he appears. That gap is the
   knob: raise this and the two events crowd each other, lower it and he arrives
   into a board that emptied a long time ago.

   THE ORDERING IS THE CONTRACT, not the number - he falls onto the floor the box
   was standing on, so the box has to be gone before he lands. It is now gone
   before he even arrives, which is a stronger guarantee than the old timer's and
   is what lets the reduced-motion path stop being a special case. */
const BOX_TOPPLE_AT = 260;    // into the HAUL, when the box starts to go
/* WHERE IN box-topple THE BOX MEETS THE FLOOR, as a fraction of
   --box-topple-ms. This is the frame the dust and the landing knock land on,
   and the keyframes reach exactly -90 degrees on it - the face lying on the
   floor, with nowhere further to go.

   DERIVED, NOT CHOSEN. A rigid slab hinged at its base falls under
   theta'' = (3g/2h)sin(theta), which integrates to
   t(theta) = ln(tan(theta/4)/tan(theta0/4)) / sqrt(3g/2h). The box is 342px
   tall and this stage is ~336 px/m (see the derivation at DROP_ARC_MS below),
   so h = 1.018m, and from a 3-degree perturbation it goes flat in 909ms. Against
   --box-topple-ms of 1110 that is 0.8185, and the 18% left over is the rebound
   and the fade. The full working, including every keyframe angle, is in the
   block above @keyframes box-topple in styles.css.

   Read the DURATION back out of the stylesheet rather than repeating it, so the
   rotation, the dust and the sound cannot drift apart. This fraction is the one
   thing that has to be stated in both places; it is 81.9% there. */
const BOX_IMPACT    = 0.8185;
/* WHERE topple.wav's LANDING KNOCK IS, in seconds from the start of the file.
   It is a two-hit recording - the box coming off balance at ~60ms and the slab
   hitting the floor at ~440 - so it is fired LATE, by exactly this much, to put
   the second hit on the impact frame instead of the start of the tip. Measured
   off the file's own envelope; re-measure it if the cue is re-cut. */
const BOX_KNOCK_MS  = 440;
/* HOW LONG HE HANGS AFTER ARRIVING, BEFORE HE LETS GO. 550ms, DOWN from 950,
   which was itself down from 1400.

   The ride ends with the swing damped to almost nothing, so this beat is a boy
   hanging still - it is the one stretch of the ending where the picture does not
   change, and every ms of it is a ms of nothing happening. What it has to buy is
   the read: he is on the line, he is holding on, and now he is not. Half a
   second does that; the clip is still looping under it, so he is swinging even
   while the transform is not moving, which is what keeps it from reading as a
   freeze.

   THE TWO KNOBS FOR "HE FALLS EARLIER" ARE THIS AND ENTRY_MS, and they were
   both turned. The note here used to say this was the only one and that
   shortening ENTRY_MS would rush the arrival - true of the GLIDE, and not true
   of the ride's last quarter, which covers 20px and is dead. So 400ms came off
   here and 400 off the ride's tail: he now lets go 800ms earlier, at about
   5.07s into the ending instead of 5.87. */
const DROP_HOLD_MS  = 550;

/** How long he actually hangs on the line before he lets go.

    HE HAS A SENTENCE TO FINISH, and that is the whole of this. Aaru speaks as he
    swings in - VO_SRC.aaruDone, 4.96s of voice - and the ride is ENTRY_MS, 2.8s.
    So on the numbers as they stood he let go at 3.35s with a third of the line
    still to come: he would have finished
    "तुमने कहानी को फिर से सही क्रम में लगा दिया" in mid-air, on the way to the
    floor. It comes to 2.77s of hanging now, against 0.55s before.

    DERIVED, NOT RETUNED. What is added is the part of the line the ride does not
    already cover, and then DROP_HOLD_MS itself on top - so the beat between his
    last word and his hands opening is the same beat the ending was designed
    with, rather than a new number chosen to make the arithmetic come out. The
    floor is that same constant, which is what a shorter line, a re-recording, or
    a recording that never decoded all fall back to (see voLen).

    `rideMs` IS 0 ON THE REDUCED-MOTION PATH, because there is no ride there: he
    is already on the line when he starts speaking, so the hold has to cover the
    whole line rather than the tail of it.

    AND IT IS THE FLOOR WHEN SHE IS SWITCHED OFF. At VO_VOLUME 0 there is no
    sentence to wait for, so the ending keeps its original pace instead of
    holding a silent boy on a rope for five seconds. */
function dropHoldMs(rideMs) {
  if (!VO_VOLUME) return DROP_HOLD_MS;
  return Math.max(DROP_HOLD_MS, voLen('aaruDone') + DROP_HOLD_MS - rideMs);
}

/* How long the landing keeps to itself before anything else may open over it.
   NOTHING USES IT AT PRESENT: the cue it was written for, the allDone flourish,
   has been taken out of the game. It stays because the rule does — see the note
   in playPostGame() — and because it is the number the haul's own delay was
   modelled on. Must stay longer than thud's rendered length, which is 0.57s. */
const FLOURISH_LEAD_S = 0.60;

/* Release -> his feet touch the floor. DERIVED, not chosen: his drawn height
   is ~410px for a seven-year-old at ~1.22m, so this stage is ~336 px/m and the
   330.4px descent is 0.98m. Free fall over 0.98m is sqrt(2h/g) = 448ms.

   720 is 60% above gravity, and that is a DELIBERATE departure from the physics
   this constant was originally derived from. The history: 560, then 500 when the
   fall read as floating, then 580 and now 720 because the user has twice said the
   ending is too fast and their eye is the thing being designed for. A children's
   game is not a simulation, and a fall a child can follow beats a fall that is
   numerically right. The derivation is kept above because it is what tells you
   HOW FAR from gravity you have travelled - which is the useful thing about it
   now, rather than the answer. */
const DROP_ARC_MS   = 720;
/* THE BEATS AFTER HE LANDS, in the order the user's prompt describes them.

   CROUCH_MS   he holds the low crouch. Long enough for the drawn dust to
               register as an impact, short enough that he does not look stuck.
   YAAY_MS     the cheer holds - "aaru says yaay" - before the last beat.
   Then the SNAP, which is where it stays. Nothing follows it.

   To end on the cheer instead of the snap, stop scheduling the snap: it is one
   block in finaleLanding() and the poses are independent. */
const CROUCH_MS     = 1200;
const YAAY_MS       = 2200;

/* HOW LONG BEFORE A POSE LEAVES THAT IT STARTS TO GO. The outgoing pose dips and
   compresses for this long first - see pose-anticipate in styles.css - and the
   pose it hands to starts from where that dip ends.

   It comes OUT of the hold, not on top of it: the change still lands at CROUCH_MS
   and CROUCH_MS + YAAY_MS exactly, so lengthening the anticipation does not
   lengthen the sequence. That matters because the holds are what the user is
   pacing on and this is what they are reading as smoothness - two different
   knobs, and I had been turning the wrong one. */
const ANTICIPATE_MS = 170;
/* A SMALL FLICK, NOT A LAUNCH - AND NOT A DISTANCE. This is the coefficient of
   the flick term in the step function, not the height he rises. The two get
   confused, so here is the arithmetic:

     y(p) = y0 + D*p^2 - 4*R*p*(1-p)      D = the descent, R = DROP_RISE

   which turns where dy/dp = 0, at p = 4R / (2D + 8R). His grip hangs at
   ropeY(960) = 295.6 and lands at FLOOR_Y - feetBelowGrip = 626.1, so D = 330.4:

     R = 26    turns at p=0.120, rises   6.2px   <- what ships
     R = 110   turns at p=0.286, rises  62.8px

   Both figures are measured as well as solved: `node tools/sim.js finale`
   prints the rise off the real transforms and reports 6.2.

   IT WAS 110, and back then he fell onto the BOX at 697 rather than to the
   floor - a descent of 110px, exactly the coefficient, which put the turn near
   the middle of the arc and left him hanging above the line before drifting
   down. That is not a boy letting go of a rope, it is a boy floating. The box
   is down and gone before the ride even starts now, so the descent is three
   times what it was; the old note's "the whole descent is also 110px" described
   a fall that no longer happens.

   The other half of why it did not read is the p*p in the step function - the
   drop accelerates rather than moving at a constant rate. The harness measures
   that too, first half of the descent against the last: 0.26 -> 0.99 px/ms. */
const DROP_RISE     = 26;
const DROP_DRIFT    = 46;     // ...and how far it carries him, the way he was going
/* THE LEAN HE CARRIES OFF THE LINE, and this is a PEAK that comes back to zero
   rather than an angle he arrives at.

   IT WAS 26 DEGREES AT TOUCHDOWN, and that was the bug the user saw: he met the
   floor tilted, and the landing pose on the very next frame is drawn square, so
   the impact was also a 26-degree snap. Both halves of that are wrong.

   WHAT THE PHYSICS ACTUALLY SAYS, in the order it matters:

     1. He is not spinning when he lets go. The ride's swing is damped by
        (1-p)^ENTRY_DAMP and then he hangs for DROP_HOLD_MS, so by the release he
        is very nearly still - which is why the lean has to START at zero. A
        sprite that jumps to an angle on the frame he opens his hands is a boy
        being pushed, not a boy letting go.
     2. In the air there is no torque on him, so nothing can be ACCELERATING his
        rotation. The old curve was 0.3p + 0.7p^2 with a note calling a linear
        turn "a diagram"; a linear turn is what free fall does, and the honest
        reason a fall does not read as a diagram is the arc and the stretch, both
        of which are here already.
     3. He lands on his feet. A child dropping off a rope swings the legs down
        and squares up on the way - it is the one thing everybody does and the
        one thing the old curve did the opposite of.

   So: zero at the release, a lean of DROP_TILT while he is peeling off the line
   and reaching for the ground with his feet, and zero again as he arrives. The
   direction is unchanged - the top of him trails the way he came, because he is
   drifting DROP_DRIFT to the left - and the SIZE came down from 26 to 13,
   because a lean that has to be unwound before touchdown has half the arc to do
   it in. See the spin term in the step function for the shape.

   The pivot moved with it: #finaleFall used to be rotated about his SOLE, which
   only made sense while the tilt survived to the landing. It is his centre of
   mass now, which is what a body in the air turns about. */
const DROP_TILT     = 13;     // degrees of lean at its peak, zero at both ends
const DROP_STRETCH  = 0.07;   // how far he elongates along the fall, at speed

/* THE FREE-FALL POSE, and the arithmetic that places it. See the block comment
   on finaleDrop() for why the anchor moves.

   FALL_SPRITE is the drawn content of assets/images/aaru-fall2.png, cut by
   tools/cut-pose-assets.py from the user's single-pose artwork - 492x665, and it
   grew to 665 when the rope band stopped being cleared wholesale and 62 rows of
   his hair crown came back.

   FALL_SCALE is 168.6/268: his hair is 268px wide in this asset against 114 in
   the cheer, so matching him to the other poses means taking that out. The five
   assets are drawn at five different sizes and none of these numbers is round by
   accident - re-measure the pair if the art is re-cut.

   FALL_FEET is his SANDAL row, not the image's bottom edge: the cut leaves a few
   transparent rows below his feet and anchoring on those hangs him in the air. */
const FALL_SPRITE   = { w: 492, h: 665 };
const FALL_FEET     = 656;    // his sandal row in that sprite, measured
const FALL_SCALE    = 0.6291;
const FALL_SWAP_AT  = 0.18;   // how far into the arc the clip becomes the pose
const FALL_COM      = 0.55;   // where his mass centre sits down the ride sprite
const SHADOW_MIN    = 0.55;   // ground shadow scale as he lets go...
const SHADOW_REST   = 1.0;    // ...and once he is standing on it

/* Short-lived air marks. Their angle comes from the displacement between two
   measured positions, their length from speed, and their density from distance
   travelled. That keeps the rope marks tangent to the sag and makes the fall
   marks lengthen under the same acceleration that moves Aaru. */
let finaleMotionState = null;
function clearFinaleMotion() {
  const host = document.getElementById('finaleMotion');
  if (host) host.replaceChildren();
  finaleMotionState = null;
}
function finaleAir(x, y, now, kind) {
  const host = document.getElementById('finaleMotion');
  if (!host) return;
  const prev = finaleMotionState;
  if (!prev || prev.kind !== kind) {
    finaleMotionState = { x: x, y: y, now: now, kind: kind };
    return;
  }
  const dx = x - prev.x;
  const dy = y - prev.y;
  const dist = Math.hypot(dx, dy);
  const gap = kind === 'fall' ? 18 : 30;
  if (dist < gap) return;

  const dt = Math.max(8, now - prev.now);
  const speed = dist / dt;
  const ux = dx / dist;
  const uy = dy / dist;
  const px = -uy;
  const py = ux;
  const count = kind === 'fall' && speed > 0.7 ? 3 : 2;
  for (let i = 0; i < count; i++) {
    const line = document.createElement('i');
    line.className = 'fm-line is-' + kind;
    const side = (i - (count - 1) / 2) * (kind === 'fall' ? 34 : 25);
    const lag = 24 + i * 11;
    line.style.setProperty('--x', (x - ux * lag + px * side).toFixed(1) + 'px');
    line.style.setProperty('--y', (y - uy * lag + py * side).toFixed(1) + 'px');
    line.style.setProperty('--a', (Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1) + 'deg');
    line.style.setProperty('--len', Math.min(104, 34 + speed * 58 + i * 9).toFixed(0) + 'px');
    line.style.setProperty('--thick', (3 + (i % 2)) + 'px');
    line.style.setProperty('--life', (360 + i * 55) + 'ms');
    host.appendChild(line);
    line.addEventListener('animationend', () => line.remove(), { once: true });
  }
  finaleMotionState = { x: x, y: y, now: now, kind: kind };
}
function finaleImpactMotion() {
  const host = document.getElementById('finaleMotion');
  if (!host) return;
  [-166, -146, -126, -54, -34, -14].forEach((a, i) => {
    const ray = document.createElement('i');
    ray.className = 'fm-impact';
    ray.style.setProperty('--x', (ENTRY_REST_X - DROP_DRIFT + (i < 3 ? -12 : 12)) + 'px');
    ray.style.setProperty('--y', (FLOOR_Y - 12) + 'px');
    ray.style.setProperty('--a', a + 'deg');
    ray.style.setProperty('--len', (58 + (i % 3) * 16) + 'px');
    host.appendChild(ray);
    ray.addEventListener('animationend', () => ray.remove(), { once: true });
  });
}
function finaleRiseMotion() {
  const host = document.getElementById('finaleMotion');
  if (!host) return;
  [-142, -98, 96, 138].forEach((off, i) => {
    const line = document.createElement('i');
    line.className = 'fm-rise';
    line.style.setProperty('--x', (ENTRY_REST_X + off) + 'px');
    line.style.setProperty('--y', (FLOOR_Y - 105 - (i % 2) * 34) + 'px');
    line.style.setProperty('--len', (54 + (i % 2) * 18) + 'px');
    host.appendChild(line);
    line.addEventListener('animationend', () => line.remove(), { once: true });
  });
}

/** The sprite's box on the stage, and how far his feet are below his grip.
    Read from the stylesheet every time rather than cached: --entry-w is a
    tuning knob and the whole point of computing this is that it can move. */
function entryMetrics() {
  const w = cssNum('--entry-w', 680);
  const h = w * ENTRY_SPRITE.h / ENTRY_SPRITE.w;
  return { w: w, h: h, feetBelowGrip: h * (1 - cssNum('--entry-grip-y', 9.64) / 100) };
}

/** Cancel every beat of the finale. Nothing here is restartable — it runs once
    at the end of the game — but a timer left armed across a reload is a bug
    waiting for someone to add a restart button. */
function clearDrop() {
  cancelAnimationFrame(dropRaf);
  cancelAnimationFrame(entryRaf);
  dropRaf = entryRaf = 0;
  clearTimeout(dropGuard);
  clearTimeout(entryGuard);
  clearTimeout(pauseTimer);
  dropGuard = entryGuard = pauseTimer = null;
  dropTimers.forEach(clearTimeout);
  dropTimers = [];
  clearFinaleMotion();

  /* ...and put back everything the finale changed on elements it does not own.
     The board this hands back to has to be the ordinary board: without this, a
     dev skip out of the finished game leaves the clapping Aaru looping on a box
     that is no longer under him, and the swinging sprite still display:none. */
  if (celebEl) {
    if (celebLoop) celebEl.removeEventListener('timeupdate', celebLoop);
    celebEl.classList.remove('is-finale');
  }
  celebLoop = null;
  /* The two finale poses. They are stills with no state of their own beyond
     being shown, so taking the class off is the whole of putting them back. */
  ['finaleFall', 'finaleLand', 'finaleCheer', 'finaleSnap',
   'finaleDust'].forEach(function (id) {
    var p = document.getElementById(id);
    if (p) p.classList.remove('is-on', 'is-going');
  });
  /* The fall pose is the one that gets positioned from script, so putting the
     class back is not enough - the left/top/transform have to go too or a
     restart drops him wherever the last frame left him. */
  var ff = document.getElementById('finaleFall');
  if (ff) { ff.style.left = ff.style.top = ff.style.transform = ''; }
  var sh = document.getElementById('finaleShadow');
  /* transition as well as opacity: finaleLanding() sets an inline fade on it, and
     a dev skip that left that behind would fade the next fall's shadow in. */
  if (sh) { sh.style.opacity = sh.style.transform = sh.style.transition = ''; }
  if (entryEl) {
    entryEl.classList.remove('is-riding', 'is-home', 'is-finale');
    entryEl.style.display = '';
    entryEl.style.transform = '';
    /* finaleDrop() writes this to take the drop-shadow off him in one frame; a
       dev skip out of a fall would otherwise hand the next one a board where
       nothing on the clip can transition. */
    entryEl.style.transition = '';
    entryEl.style.willChange = 'auto';
  }
  const tray = document.querySelector('.tray');
  if (tray) tray.classList.remove('is-away', 'is-dropping', 'is-thud', 'is-toppling');
  /* ...and the dust it threw, which is a running rAF loop rather than a class:
     a dev skip out of the ending has to stop it and take its canvas away, or the
     cloud keeps drifting over whatever the board went back to. */
  clearBoxDust();
}

function afterDrop(ms, fn) { dropTimers.push(setTimeout(fn, ms)); }

/* --- the dust the box throws when it lands ----------------------------------

   THE THIRD SIMULATED EFFECT ON THIS BOARD, and it follows the integrator the
   other two use (flourBlast for the sneeze, rideAir for the bicycle) so there is
   one way of doing particles here rather than three. What is different is the
   SOURCE: those two come off a point, this comes off a 1687px EDGE that meets
   the floor everywhere in the same instant.

   WHAT IT REPLACED, AND WHY A SPRITE COULD NOT DO THIS. It used to be four
   copies of assets/images/aaru-dust.png - the puff drawn under Aaru's sandals -
   blown up to 760px, laid along the box and slid outward by a CSS keyframe. Two
   things were wrong with it and neither of them was tuning. One drawing repeated
   four times reads as one drawing repeated four times, however it is flipped and
   staggered; and a scaled sprite can only translate, so every part of the cloud
   had to do the same thing at the same time. A slab landing flat does at least
   four different things at once, and those are what this simulates.

   THE PHYSICS, in the order it happens.

     0. THE PLANK BOWS. A five-metre board is not a straight line and this floor
        is not a machined surface, so it does not touch everywhere on one frame -
        it kisses in the middle and the ends follow. That is DUST_BOW: 34ms from
        the centre to the corners, two frames of ripple travelling outward at
        60fps. It is the reason the band does not switch on.

     1. THE SQUEEZE FILM, AND IT STARTS BEFORE THE BOX IS DOWN. The face closes
        on the floor like a book and the air in the wedge has to leave; by the
        time the gap is a few centimetres it is already leaving fast. So the
        first wisp is emitted DUST_LEAD_MS ahead of the impact frame - low,
        faint, and outrunning the wood that is pushing it. That is not
        decoration: a cloud that begins exactly on the impact frame is a cloud
        that was waiting for a cue.

        The exit speed of a real squeeze film is not renderable and not worth
        pretending about. The plate's far edge is doing 5.5 m/s at contact (see
        BOX_IMPACT for that derivation) and U ~ V*b/h, with b = 0.51m and a
        centimetre of gap, puts the escaping AIR near 50 m/s. What is DRAWN is
        not the air, it is the dust the air can pick up and hold, and that is
        drag-limited from the first frame - so the jet leaves at DUST_JET and has
        spent itself inside 150ms. The number is a ceiling taken from what dust
        does, not a reading taken from what air does.

     2. IT LEAVES PERPENDICULAR TO THE NEAREST EDGE, which is what gives the
        cloud its shape. The footprint on the floor is 1687 x 342px - five metres
        by one - so the shortest way out for almost all of that air is across a
        LONG edge, towards the viewer, not out of the ends. On a flat storybook
        stage "towards the viewer" cannot be drawn as travel; there are 41px of
        floor below the box and that is the lot. It is drawn as what perspective
        actually does to something coming at the lens: it GROWS, and it diverges
        from the centre line. Hence `off` - the sideways speed a grain gets is
        proportional to how far off centre it was born - and the fast radial
        growth in the first tenth of a second.

        THE ENDS ARE THE EXCEPTION, and they are the part that reads. There the
        nearest way out really is sideways, so those grains get a true lateral
        jet and punch clear of the wood: DUST_END. Dust does not stop where the
        box stops, and this is the only part of the cloud that can say so.

     3. DRAG, IMMEDIATELY. A dust cloud is mostly air and stops almost as fast as
        it started - `tau` here is 60-170ms against lives of one to three seconds,
        so all of the outward travel is over inside the first fifth of the
        effect. This is the thing the old keyframe got most wrong: it slid
        outward for the whole 1200ms at very nearly a constant rate, which is a
        cloud being dragged rather than a cloud being thrown.

     4. THEN, AND ONLY THEN, IT RISES. Dust is heavier than air; nothing about a
        cold cloud floats. It goes up because the ground jet rolls up into a
        vortex at its head and entrains the air above it, and that is a SLOW
        process next to the jet that made it. So `rise` is not a velocity, it is
        a target the grain relaxes towards over DUST_ROLL, which puts the lift
        after the spreading instead of alongside it. The fine end of the cloud
        gets most of it; the coarse end gets almost none.

     5. THE COARSE ONES COME BACK DOWN, under real gravity: 9.81 m/s^2 at this
        stage's 336 px/m is DUST_G. A grain thrown up at 900px/s tops out 123px
        above the floor at 270ms and is back on it by 550. It then STAYS there -
        `landed` - and fades where it lies, because sand that has settled does
        not drift. Seventy-four of these against three hundred of everything
        else, and they are what stops the cloud reading as smoke.

     6. IT THINS BECAUSE IT SPREADS. Opacity is divided by how much the grain has
        grown, so the cloud gets fainter because it is bigger, and not because a
        keyframe said it was time.

   TWO GRAINS, NOT ONE, AND THE DARK ONE IS DOING THE WORK.

   This floor is pale peach - (248, 213, 183), sampled out of bg-wood.webp at
   y=1039 - and it is BRIGHT: 88% luminance. The first pass drew the whole cloud
   in cream, which is what dust is, and measured a peak alpha of 0.65 on the
   canvas while being invisible in the screenshot. Cream over peach at 65% comes
   out (247, 221, 191), which is eight units off the floor it is sitting on. A
   number can pass while a picture fails; both were checked here because of it.

   The physics says the same thing the screenshot did. An optically thin cloud
   over a surface this bright ATTENUATES more than it scatters, so it reads
   DARKER and much less saturated, not lighter - dust looks pale against a dark
   road and dirty against a white wall. And it is the reading the artist already
   took: aaru-dust.png runs from cream (240, 224, 192) down to a mid tan
   (208, 160, 128), and the tan is most of it.

   So `shade` is the body of the cloud - a warm tan that comes out about 27 units
   darker than the floor and clearly there - and `lit` is the crown, near-white,
   for the part that has RISEN out of the box's own shadow into the light. Which
   grain a population gets is that lighting statement and not a coin toss: the
   wisp and the sheet and the sand are all down near the ground and get `shade`;
   the haze, which is the only thing the vortex is light enough to lift, gets
   `lit`. It is why the cloud has a pale top and a dirty underside instead of
   being one flat tone.
   -------------------------------------------------------------------------- */

/* The top of the band the cloud is drawn on. Must agree with .box-dust in
   styles.css, which carries the note on why it is a band and not the stage.

   560, UP from 640, because 640 was not headroom, it was a lid. tools/sim.js
   reports the highest stamp the cloud makes and it came back as exactly 640 -
   a grain centre sitting on the band's own top edge, with the drawn half of it
   cut off by a hard horizontal line. At 2% alpha nobody was ever going to see
   that line, but "nobody can see it" is not the same claim as "it is not there",
   and the fix costs 25 rows of a half-scale canvas. The rise was trimmed to
   match, so the cloud now tops out around 300px and the edge is unreachable
   rather than merely unnoticed. */
const DUST_TOP     = 560;
/* Pixels per metre here, and it is the same 336 the box's own topple is derived
   from - see BOX_IMPACT. Everything below quoted in m or m/s is converted
   through it, so the numbers can be argued with. */
const DUST_PX_M    = 336;
const DUST_G       = 9.81 * DUST_PX_M;   /* px/s^2, and it is really gravity   */
/* How far ahead of the impact frame the squeeze film starts to show. 90ms is
   about the last twelve degrees of the tip, which is where the gap gets small
   enough for the flow in it to outrun the wood. */
const DUST_LEAD_MS = 90;
/* The bow: ms between the centre of the plank touching and the corners. */
const DUST_BOW     = 34;
/* The ground jet's launch speed, m/s. Drag-limited dust, not air - see 1. */
const DUST_JET     = 9.0;
/* The end jets, faster because that air has the shortest way out of all. */
const DUST_END     = 11.5;
/* How long the vortex takes to start lifting the cloud, seconds. */
const DUST_ROLL    = 0.42;
/* THE CANVAS IS DRAWN AT HALF RESOLUTION AND SCALED UP BY CSS, and this is the
   one number here that is a performance decision rather than a physical one.

   Everything about this cloud is soft: the smallest thing in it is a 2px sand
   grain and the rest are radial-gradient discs 40 to 180px across with no edge
   anywhere. So half a backing store is a quarter of the fill for a picture a
   bilinear upscale cannot be told apart from - which makes it worth taking
   whether or not anything needed it.

   AND NOTHING MEASURED SAYS ANYTHING DID, which is worth writing down because
   the first version of this comment claimed otherwise. A rAF probe in the page
   puts the integrator at 0.2ms median against a 16.7ms frame, so the loop is
   free. The frame GAP is a different question and headless Chromium cannot
   answer it: over three runs each, the count of frames longer than 20ms was
   13/19/19 with no cloud at all, 16/12/5 drawing it without compositing it, and
   13/16/22 with the whole thing running. Those distributions are the same
   distribution. One run of 28 was read as a regression before the repeats were
   done, and it was noise.

   So: this is cheap insurance on a machine nobody here has measured, not a fix
   for a fault anybody has seen. If the cloud is ever suspected of dropping
   frames, measure it on the device in question and not in a headless browser.

   The physics does NOT move into this space. ctx is scaled once, so every
   position, radius and speed below stays in stage pixels and can be checked
   against FLOOR_Y, the box's own metrics and DUST_PX_M. */
const DUST_SCALE   = 0.5;

/* The loop's handle and a generation counter, exactly as flourBlast's: a run
   torn down mid-cloud must not be resurrected by a frame already queued. */
let dustRaf = 0;
let dustGen = 0;

/** Stop the cloud and take its canvas off the board. */
function clearBoxDust() {
  dustGen += 1;
  if (dustRaf) cancelAnimationFrame(dustRaf);
  dustRaf = 0;
  const host = document.getElementById('boxDust');
  if (!host) return;
  host.classList.remove('is-on', 'is-down');
  host.replaceChildren();
}

/** Throw the cloud.

    CALLED DUST_LEAD_MS BEFORE THE SLAB IS FLAT, because the first of it is out
    from under the box before the box has finished falling. The impact frame is
    t = 0 on this function's own clock and the squeeze wisp is born at -0.09s, so
    one clock runs all of it and nothing has to be scheduled twice.

    Geometry comes off the box itself rather than out of numbers written here, so
    moving .tray moves the dust it throws. */
function boxDust() {
  const host = document.getElementById('boxDust');
  const tray = document.querySelector('.tray');
  if (!host || !tray) return;

  clearBoxDust();

  const L     = tray.offsetLeft;                                /* 116  */
  const W     = tray.offsetWidth;                               /* 1687 */
  const FLOOR = tray.offsetTop + tray.offsetHeight - DUST_TOP;  /* 1039, in band */
  const CX    = L + W / 2;
  const HALF  = W / 2;

  const cv = document.createElement('canvas');
  const BAND = STAGE_H - DUST_TOP;
  cv.width  = Math.round(STAGE_W * DUST_SCALE);
  cv.height = Math.round(BAND * DUST_SCALE);
  /* Stretched back to the band's real size. The stylesheet cannot do this for
     us: .box-dust has to keep working if DUST_SCALE ever changes. */
  cv.style.width  = STAGE_W + 'px';
  cv.style.height = BAND + 'px';
  host.replaceChildren(cv);
  const ctx = cv.getContext && cv.getContext('2d');
  /* NO 2D CONTEXT is not a hypothetical: getContext returns null when the
     browser has run out of them, and it is also what a harness with a stubbed
     canvas can hand back. There is nothing to draw on, so the cloud does not
     start - but it says so with the class rather than silently, because the
     class is what tools/sim.js reads the beat off. */
  if (!ctx) { host.classList.add('is-on', 'is-down'); return; }
  /* Set once, never touched again: from here down the cloud is written in stage
     pixels and the context does the shrinking. */
  if (ctx.setTransform) ctx.setTransform(DUST_SCALE, 0, 0, DUST_SCALE, 0, 0);

  /* TWO CLASSES, AND THEY ARE NOT THE SAME EVENT. `is-on` says a cloud exists,
     and it goes on here - DUST_LEAD_MS BEFORE the slab is down, because the
     squeeze wisp is already out. `is-down` is the impact frame itself, added by
     the loop the first time its clock reaches zero. Anything checking when the
     box hit the floor wants the second one; the gap between them is the lead,
     and tools/sim.js prints it. */
  host.classList.add('is-on');

  /* Lit crown and shaded belly - see the note above for where both came from,
     and why the dark one is most of what is actually seen. */
  const lit   = flourGrain([255, 252, 246, 252, 243, 231, 246, 232, 214]);
  const shade = flourGrain([230, 200, 168, 206, 166, 128, 186, 142, 106]);

  const rnd = (a, b) => a + Math.random() * (b - a);
  const bits = [];

  /* THE BUDGET, because this is the one effect on the board whose cost is not
     obvious from its code. 300 grains, and the number that matters is not the
     count but the AREA: cost is N*r^2 and so is coverage, so they cannot be
     traded against each other. At the widest frame this stamps about 5.7
     million blended pixels, under three times the stage - which is what
     drawImage of a soft grain can do at 60fps and roughly what the sneeze's
     flour costs over a smaller box. The first pass was 380 grains growing to
     twice these radii, 25 million pixels a frame, and it would have dropped
     frames on the machine a child is actually holding. tools/sim.js prints the
     stamp count and the peak, so this can be checked rather than assumed. */
  /* rad0 is stamped here rather than at first draw: the thinning divides by how
     much a grain has grown, and reading its birth size off a radius that has
     already had a frame of growth applied is an alpha that starts at 1 and can
     never be checked against anything. */
  const emit = o => { o.rad0 = o.rad; o.age = 0; bits.push(o); };

  /* ---- 1. THE SQUEEZE WISP, ahead of the wood ---------------------------- */
  /* Few, fast, faint and very low: this is the air getting out first and it has
     to be seen to LEAD the box rather than to follow it. Born inside the slab's
     own footprint, so it appears from under the falling face. */
  for (let k = 0; k < 34; k++) {
    const x   = rnd(L + 40, L + W - 40);
    const off = (x - CX) / HALF;
    emit({
      x: x, y: FLOOR - rnd(0, 6),
      /* Already leaving, and already diverging: this air has been squeezed for
         a tenth of a second before there is anything to see. */
      vx: off * DUST_JET * 0.7 * DUST_PX_M + rnd(-60, 60),
      vy: rnd(-30, 40),
      tau: rnd(0.07, 0.12),
      rad: rnd(10, 22), grow: rnd(45, 75),
      a0: rnd(0.26, 0.38), rise: -rnd(30, 70), sink: rnd(4, 14),
      born: -DUST_LEAD_MS / 1000, life: rnd(0.8, 1.2),
      wob: rnd(120, 300), wf: rnd(1.2, 2.6), wp: Math.random() * 6.283,
      g: shade, heavy: false,
    });
  }

  /* ---- 2. THE SHEET: the squeeze film off the whole front edge ------------ */
  /* The body of the effect. Born along the edge, thrown outward in proportion to
     how far off the centre line it is (see 2 above), and overhanging both ends
     because a cloud does not know where the wood finishes. */
  for (let k = 0; k < 78; k++) {
    const x   = rnd(L - 70, L + W + 70);
    const off = Math.max(-1.15, Math.min(1.15, (x - CX) / HALF));
    /* q is the size, and everything about a grain follows from it - the same
       parameter the flour and the road dust sort themselves by. */
    const q   = Math.pow(Math.random(), 1.3);
    const spd = DUST_JET * DUST_PX_M * (0.42 + 0.58 * Math.abs(off)) *
                rnd(0.55, 1.0) * (1 - 0.28 * q);
    emit({
      x: x, y: FLOOR - rnd(0, 30),
      vx: (off < 0 ? -1 : 1) * spd + rnd(-70, 70),
      /* Down first. Coming towards the lens off a floor that is already at the
         bottom of the frame is a few px of drop and then nothing; the travel in
         that direction is in the growth, not in the transform. */
      vy: rnd(10, 90),
      tau: 0.06 + q * 0.11,
      rad: 26 + q * 34, grow: rnd(45, 80),
      a0: 0.42 + q * 0.40,
      /* Fine dust gets the vortex, the coarse end of this population barely
         does. Negative is up. */
      rise: -(150 - q * 110), sink: 3 + q * q * 26,
      born: DUST_BOW / 1000 * Math.abs(off),
      life: rnd(1.3, 1.9) - q * 0.4,
      wob: rnd(250, 650), wf: rnd(1.0, 2.4), wp: Math.random() * 6.283,
      g: q < 0.18 ? lit : shade, heavy: false,
    });
  }

  /* ---- 3. THE END JETS --------------------------------------------------- */
  /* The one part of the cloud whose shortest way out really is sideways, and the
     one part that gets clear of the box. Both ends, thrown flat, and they are
     meant to leave the frame - dust off a five-metre slab does. */
  for (const s of [-1, 1]) {
    for (let k = 0; k < 26; k++) {
      const q = Math.pow(Math.random(), 1.5);
      emit({
        x: s < 0 ? L + rnd(0, 90) : L + W - rnd(0, 90),
        y: FLOOR - rnd(0, 24),
        vx: s * DUST_END * DUST_PX_M * rnd(0.55, 1.0) * (1 - 0.3 * q),
        vy: rnd(-40, 30),
        tau: 0.07 + q * 0.10,
        rad: 22 + q * 28, grow: rnd(40, 75),
        a0: 0.40 + q * 0.34,
        rise: -(120 - q * 85), sink: 3 + q * q * 22,
        born: DUST_BOW / 1000,
        life: rnd(1.4, 2.0),
        wob: rnd(200, 500), wf: rnd(1.0, 2.2), wp: Math.random() * 6.283,
        g: q < 0.35 ? lit : shade, heavy: false,
      });
    }
  }

  /* ---- 4. THE GRAINS ----------------------------------------------------- */
  /* Sand, not smoke. Small, nearly solid, thrown on ballistic arcs under real
     gravity, and they settle back onto the floor and stay there. */
  for (let k = 0; k < 74; k++) {
    const x   = rnd(L - 30, L + W + 30);
    const off = Math.max(-1.1, Math.min(1.1, (x - CX) / HALF));
    const th  = rnd(0.35, 1.25);                 /* up and out, radians        */
    const spd = rnd(320, 1050);
    emit({
      x: x, y: FLOOR - rnd(0, 8),
      vx: (off < 0 ? -1 : 1) * Math.cos(th) * spd *
          (0.25 + 0.55 * Math.abs(off)) * 0.55,
      vy: -Math.sin(th) * spd,
      /* Air drag on a sand grain, as a plain exponential on the horizontal -
         it is why a thrown grain lands short of where a vacuum would put it.
         `tau` is not used on this path; the vertical is gravity and nothing
         else. */
      drag: 0.45,
      tau: 0,
      rad: rnd(2.2, 6.5), grow: rnd(0, 3),
      a0: rnd(0.42, 0.8), rise: 0, sink: 0,
      born: DUST_BOW / 1000 * Math.abs(off),
      life: rnd(0.9, 1.5),
      wob: 0, wf: 0, wp: 0,
      g: Math.random() < 0.85 ? shade : lit, heavy: true,
    });
  }

  /* ---- 5. THE HAZE ------------------------------------------------------- */
  /* What is left in the air once everything above has stopped. Big, nearly
     transparent, hardly travels, and it is the population that RISES: the vortex
     has to entrain something and this is the only thing light enough to go with
     it. Density here comes from how many of these are in front of each other,
     never from any one of them. */
  for (let k = 0; k < 56; k++) {
    const x   = rnd(L - 100, L + W + 100);
    const off = Math.max(-1.2, Math.min(1.2, (x - CX) / HALF));
    emit({
      /* Born a little ABOVE the jet, because that is where the vortex it
         rides forms - at the head of the ground flow, not under it. */
      x: x, y: FLOOR - rnd(20, 120),
      vx: off * rnd(120, 420) + rnd(-50, 50),
      vy: rnd(-20, 30),
      tau: rnd(0.18, 0.34),
      rad: rnd(45, 100), grow: rnd(18, 36),
      a0: rnd(0.38, 0.55),
      rise: -rnd(105, 175), sink: rnd(0, 3),
      born: DUST_BOW / 1000 * Math.abs(off) + rnd(0, 0.09),
      life: rnd(1.5, 2.2),
      wob: rnd(60, 160), wf: rnd(0.5, 1.3), wp: Math.random() * 6.283,
      g: Math.random() < 0.80 ? lit : shade, heavy: false,
    });
  }

  dustGen += 1;
  const mine = dustGen;
  const t0   = performance.now() + DUST_LEAD_MS;   /* the impact frame         */
  let   last = performance.now();

  const step = now => {
    if (mine !== dustGen) return;
    /* Clamped for the reason flourBlast clamps: a backgrounded tab hands back a
       dt of seconds, and one Euler step that long throws the lot off the stage
       in a single frame. */
    const dt    = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    const clock = (now - t0) / 1000;
    if (clock >= 0) host.classList.add('is-down');
    /* In stage pixels, like everything else - the transform shrinks it. */
    ctx.clearRect(0, 0, STAGE_W, BAND);

    let alive = 0;
    for (let i = 0; i < bits.length; i++) {
      const b   = bits[i];
      const age = clock - b.born;
      /* Not born yet still counts as alive, or the loop would tear itself down
         in the frames before the impact. */
      if (age < 0)      { alive += 1; continue; }
      if (age >= b.life) continue;
      alive += 1;
      b.age = age;

      if (b.heavy) {
        if (!b.landed) {
          b.vx *= Math.exp(-dt / b.drag);
          b.vy += DUST_G * dt;
          b.x  += b.vx * dt;
          b.y  += b.vy * dt;
          /* Settled. It does not drift, it does not roll, it lies there. */
          if (b.y >= FLOOR && b.vy > 0) { b.y = FLOOR; b.landed = age; }
        }
      } else {
        /* THE ROLL-UP, and this is why the lift is a target rather than a
           velocity: it has to arrive AFTER the spreading, not alongside it. */
        const lift = b.rise * (1 - Math.exp(-age / DUST_ROLL));
        const k    = Math.min(1, dt / b.tau);
        b.vx += (0 - b.vx) * k +
                Math.cos(b.wp + age * b.wf * 6.283) * b.wob * dt;
        b.vy += (lift + b.sink - b.vy) * k +
                Math.sin(b.wp * 1.7 + age * b.wf * 5.1) * b.wob * 0.6 * dt;
        b.x   += b.vx * dt;
        b.y   += b.vy * dt;
        b.rad += b.grow * dt;
        /* Nothing gets under the floor. The cloud sits ON it. */
        if (b.y > FLOOR + 10) { b.y = FLOOR + 10; b.vy = Math.min(0, b.vy); }
      }

      /* Two frames to full and then a long thin-out. Dust is THROWN: the impact
         frame has to have dust on it, or the knock arrives over an empty floor
         and the cloud reads as a separate idea turning up late. */
      const t    = age / b.life;
      const up   = Math.min(1, age / 0.035);
      const down = t > 0.30 ? 1 - (t - 0.30) / 0.70 : 1;
      /* Fainter because it is bigger. */
      const thin = Math.pow(b.rad0 / b.rad, 0.8);
      /* A grain that has settled goes faster than one still in the air: what
         made it visible was being airborne. */
      const set  = b.landed ? Math.max(0, 1 - (age - b.landed) / 0.28) : 1;
      const a    = Math.max(0, up * down * set) * b.a0 * thin;
      /* THE CULL, AND IT IS WHAT KEEPS THIS AT 60fps. The JS here is free - the
         whole loop measures 0.3ms against a 16.7ms frame - and the cost is
         entirely the GPU blending a few hundred soft discs. The expensive ones
         are the LATE ones: a grain that has grown to 180px covers thirteen times
         the area it was born with, and `thin` has taken its alpha to under a
         hundredth by then. Measured on the real page, drawing them anyway cost
         22% of frames a double.

         So anything under 1.5% is not drawn. That is under half a level of the
         wood behind it - it cannot be seen, and it is most of the fill. Nothing
         else here is allowed to be a performance compromise; this one is a
         visibility floor that happens to be free.

         Off-canvas goes for the same reason: the end jets are MEANT to leave the
         frame, and a grain 500px past the edge is still a full-size stamp. */
      if (a < 0.015) continue;
      if (b.x + b.rad < 0 || b.x - b.rad > STAGE_W ||
          b.y + b.rad < 0 || b.y - b.rad > BAND) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(b.g, b.x - b.rad, b.y - b.rad, b.rad * 2, b.rad * 2);
    }
    ctx.globalAlpha = 1;

    if (!alive) { clearBoxDust(); return; }
    dustRaf = requestAnimationFrame(step);
  };
  dustRaf = requestAnimationFrame(step);
}

/** The box goes over, lands, throws dust and is gone - the first beat of the
    ending, before Aaru is anywhere near the board.

    THREE THINGS ON ONE FRAME, and the frame is the one where it meets the floor.
    The rotation, the dust and the knock all have to agree, and only one of them
    is written down: --box-topple-ms in the stylesheet. BOX_IMPACT is where in
    that duration the keyframes have finished tipping it, so the impact time is
    read out of the CSS every time rather than repeated here - re-time the topple
    and the dust and the sound follow it without anyone remembering to.

    WHY topple.wav IS FIRED LATE. It is two knocks, not one: the box coming off
    balance at about 60ms and the slab landing at about 440. Fired on the frame
    the tip STARTS, its landing knock arrives 440ms before the box lands. Fired
    BOX_KNOCK_MS early instead, both hits fall where the picture puts them - the
    first as it goes past balance, the second on the floor. That is also why the
    box does not get `thud`: the knock it needs is already inside its own cue,
    and `thud` is his, twice over (see the two-thud check in tools/sim.js).

    Every timer goes through dropTimers, so a dev skip out of the ending cancels
    a box that has not finished falling. */
/** Take the question off the wall — the pink box and the sentence inside it,
    which are siblings rather than nested.

    ONE FUNCTION BECAUSE THREE PLACES DO IT, and two of them used to do it with
    their own copy of the same two lookups. The animation is in styles.css at
    .banner.is-away; adding a class that is already there does not restart it, so
    whichever caller gets there first owns the exit and the others are no-ops.

    WHO CALLS IT NOW, in the order they can happen:
      toppleBox()     the box goes and the banner goes with it. This is the one
                      the user asked for: "when the option box got dropped at
                      that point in time, the above pink box should also get
                      disappeared from the screen."
      postHandover()  reduced motion, which reaches the post-game without a
                      finale.
      the formation   BANNER_GO_AT, which is where this used to happen first. It
                      is a backstop now rather than the event: the post-game's
                      top row of pictures lands in the space the banner occupies,
                      so that layout REQUIRES it gone, and requiring it is worth
                      keeping even though the finale now clears it seconds
                      earlier.

    devEndPose() takes it back off, so a dev skip hands a live board a banner. */
function bannerAway() {
  const bn = document.querySelector('.banner');
  const pr = document.getElementById('prompt');
  if (bn) bn.classList.add('is-away');
  if (pr) pr.classList.add('is-away');
}

function toppleBox() {
  const tray  = document.querySelector('.tray');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* With motion turned down the box does not fall, it is simply not there - see
     .tray.is-toppling in the media query. So there is no impact frame to put
     anything on: no dust (the stylesheet holds it at nothing) and no `puff`,
     which would be a sound with no cause. `topple` stays, because the box IS
     leaving and the ending should not do that in silence. */
  if (still) {
    if (tray) tray.classList.add('is-toppling');
    bannerAway();                    /* the board clears as one thing */
    sfx('topple', { pan: -0.15 });
    return;
  }

  dropTimers.push(setTimeout(() => {
    if (tray) tray.classList.add('is-toppling');
    /* ON THE SAME FRAME AS THE BOX, not on the impact. The two are one gesture -
       the board clearing itself off - and they are at opposite ends of the
       screen, so nothing about them competes for the same patch of it. The
       banner's own exit is 620ms against the box's 1180, so the wall is bare
       well before the box has finished falling. */
    bannerAway();

    const hit = cssNum('--box-topple-ms', 1180) * BOX_IMPACT;

    /* Panned to where the box is rather than centred: it fills the bottom of the
       board but it tips toward the viewer and goes, and the cue should come from
       the thing that is moving. */
    sfx('topple', { pan: -0.15,
                    delay: Math.max(0, hit - BOX_KNOCK_MS) / 1000 });

    /* THE CLOUD STARTS BEFORE THE BOX IS DOWN, which is why this is scheduled
       DUST_LEAD_MS early rather than on `hit`: the air under a closing face is
       already leaving. boxDust() carries its own clock from there, so the impact
       frame and the cloud cannot drift apart even though they are two timers.

       The SOUND still lands on the impact - `puff` rather than a second `thud`,
       because what it adds to the knock is the air and not another blow. */
    dropTimers.push(setTimeout(boxDust, Math.max(0, hit - DUST_LEAD_MS)));
    dropTimers.push(setTimeout(() => sfx('puff', { pan: -0.05 }), hit));
  }, BOX_TOPPLE_AT));
}

/* WHAT THE ENDING ACTUALLY MEASURES, and it is now quoted AGAINST THE LAST CARD
   rather than against the ending opening, because that is what the harness
   prints and a list nobody can reproduce goes stale without anyone noticing:

       node tools/sim.js finale

     5112    THE ENDING OPENS - endingPauseMs() after the child let go of the
             last card. The haul starts and the box is let go
     5200    the box starts to tip
     6080    the squeeze film shows, from under the closing face
     6160    the slab is flat: the cloud, and topple.wav's landing knock
     8240    AARU crosses the right edge - 2080ms after the box landed
    11720    the riding clip is cut for the falling pose
    12320    his feet touch the floor
    13520    he cheers
    15720    the snap, and it is held

   THE TWO PAUSES ARE THE POINT OF THIS SHAPE, and both were put there on the
   same note: "each animation should get enough screen time, after celebration
   there to be healthy pause then option box drop animation should happen then
   there should be again healthy pause then aaru should arrive on the rope."

     ENDING_GAP_MS   1400ms of SILENCE between the celebration's last sound and
                     the ending's first. It was 400.
     ENTRY_HOLD_MS   1600ms of held board after the haul, before Aaru is
                     started. It did not exist: playEntry was the haul's own
                     callback, so he crossed the edge 783ms after the box landed
                     - while its dust was still clearing at 3483ms into the
                     ending. Now the box gets its fall, its knock and its cloud
                     to itself.

   NEITHER IS A CONSTANT YOU CAN READ OFF THE LIST. endingPauseMs() is derived
   from the celebration's own two files, so re-rendering roundDone or applause
   moves every figure above against the placement and none of it against itself.
   That is deliberate: the gap the child hears is what is fixed, not the clock.

   TAKE THESE OFF THE HARNESS OR OFF A PROBE, NOT OFF A SCREEN RECORDING. A
   Playwright screencast's frame timestamps drift by hundreds of milliseconds and
   drop frames; read off extracted video frames, this same sequence once reported
   the gap between the box landing and his arrival as 1.5s. Video is for judging
   how it LOOKS. Numbers come from the page or from sim.js, which agrees with a
   rAF probe to within its 40ms sampling.

   THE GAPS THAT ARE THE PACING, and the constants that own them: ENDING_GAP_MS
   before the board clears, 960ms from the box starting to tip to it lying flat,
   ENTRY_HOLD_MS plus the haul's own tail before he arrives, 550ms of hanging
   before he lets go (DROP_HOLD_MS), and the ride itself (ENTRY_MS). */

/** Everything after his feet touch the floor, in the order the user asked for:
    he lands in a low crouch, holds it, pushes up into the cheer, and finishes on
    the finger snap, where it stays.

    FOUR SEPARATE STILLS, not one clip. Each is a pose the user supplied, cut from
    its own canvas by tools/cut-pose-assets.py, and each is drawn at a different
    size in its source - so the scales are matched by his HAIR WIDTH rather than
    assumed equal, and each has its own `top` putting his SANDALS on FLOOR_Y.

    HARD CUTS ON THE ACCENTS, CROSS-FADES ON THE MOVEMENTS. The impact is a hard
    cut: a pose change on an accent is how an action reads, and a fade there is
    two boys at once. Standing up and the snap are continuous, with no accent to
    hide a cut behind, so those cross-fade - .finale-pose carries the opacity
    transition and the keyframes in styles.css carry the push and the settle.

    Nothing here is a video, so nothing here can fail on a codec. */
function finaleLanding() {
  const land  = document.getElementById('finaleLand');
  const cheer = document.getElementById('finaleCheer');
  const snap  = document.getElementById('finaleSnap');
  const dust  = document.getElementById('finaleDust');
  if (!land || !cheer) return false;

  land.classList.add('is-on');
  /* ...and the dust, on the same frame as the impact. It is its own layer so it
     can SPREAD - see the keyframes - which is the whole reason it was cut out of
     the landing artwork instead of left painted into it. */
  if (dust) dust.classList.add('is-on');
  sfx('thud', { pan: 0 });

  /* THE CSS SHADOW HANDS OVER HERE. It is what carries the fall - the only thing
     in the frame saying how far below him the floor is - but the landing and snap
     art draw their own ground shadow, so leaving it up would stack two. */
  const shadow = document.getElementById('finaleShadow');
  if (shadow) {
    shadow.style.transition = 'opacity 320ms linear';
    shadow.style.opacity = '0';
  }

  /* THESE HOLDS ARE NOT ANIMATION DURATIONS, so reduced motion does not touch
     them. They are how long each BEAT is on screen - the crouch, then the cheer -
     and they are content: he landed, he cheered, he snapped. Zeroing them under
     prefers-reduced-motion fired both timers in the same tick, each pose replaced
     the last instantly, and a child with that setting saw the crouch and the
     cheer not at all - straight from the fall to the snap.

     What reduced motion removes is the MOVEMENT between them, and styles.css
     already does that: the squash, the push off his feet and the settle are all
     animation:none in the media query. The story stays. */
  /* ANNOUNCED FIRST. The crouch dips and compresses for ANTICIPATE_MS before it
     hands over, and pose-stand starts from where that dip ends - so the two read
     as one push rather than as a fade between two states. The dip comes OUT of the
     hold, so the change still lands on CROUCH_MS exactly. */
  afterDrop(Math.max(0, CROUCH_MS - ANTICIPATE_MS),
            () => land.classList.add('is-going'));
  afterDrop(CROUCH_MS, () => {
    land.classList.remove('is-on', 'is-going');
    cheer.classList.add('is-on');
    finaleRiseMotion();
  });

  /* ...and the snap, held. If this beat is ever unwanted, deleting this block is
     the whole change - the poses do not depend on each other. */
  if (snap) {
    afterDrop(Math.max(0, CROUCH_MS + YAAY_MS - ANTICIPATE_MS),
              () => cheer.classList.add('is-going'));
    afterDrop(CROUCH_MS + YAAY_MS, () => {
      cheer.classList.remove('is-on', 'is-going');
      snap.classList.add('is-on');
      /* ONE GOLDEN LIGHT, NOT TWO. There used to be a `.finale-spark` here as
         well — a small CSS sparkle at his fingertip, fired on this frame — and
         then magicSnap()'s flash and ring of eleven arrived FORM_LEAD later, at
         the same screen position. The paint-order note in styles.css describes
         that as "the bigger burst over the top of it", which is the intent, but
         240ms apart at one spot it does not read as one effect with an accent.
         It reads as the light flashing twice, which is what it is.

         So the small one is gone and the burst is the light. FORM_LEAD is 0 now,
         which puts that single burst on the same frame as the snap pose AND the
         snap sound — and simultaneity is what makes a flash read as caused by
         his fingers. It was arriving a quarter of a second after the sound that
         was supposed to have caused it, which is well past the ~100ms where an
         audio-visual pair stops being one event.

         The frames themselves are unaffected: postFormation() still holds them
         off for MAGIC_MS after the burst before the first one rides in. */

      /* AND IT IS AUDIBLE. The snap goes on the same frame as the spark,
         because they are the same event — his fingers meeting — and both
         landing together is the whole reason the pose reads as caused by him.

         THEN THE CHILDREN, a beat behind it. This fires at CROUCH_MS + YAAY_MS
         = 3400ms after his feet touch the floor. It used to have to clear the
         `allDone` flourish, which playPostGame() started at that landing and
         which rang 2.80s as rendered: the snap opened 600ms after it finished
         and the cheer 740ms after, because a crowd is broadband and broadband
         over a pitched cue eats its partials on a small speaker. THAT FLOURISH
         IS GONE — the user asked for all-done.wav out of the game — so the
         landing is `thud` alone and everything from there to here is silence.
         The 3400ms is kept: it is the pose timing, not the audio gap, and the
         snap is still the event the crowd is reacting to.

         MEASURE IT RATHER THAN ASSUMING IT if any of this moves. Re-run

             node tools/sim.js last 2500 --video

         which prints the start time and real duration of every cue in the
         ending. */
      sfx('snap');

      /* ...AND THE SNAP IS WHAT BRINGS THE FRAMES BACK. This is the moment the
         formation starts from, not the landing: the user's sequence begins with
         him already standing in this pose. FORM_LEAD after the pose is up, so
         the burst reads as something his fingers did rather than as arriving
         with him.

         Guarded so that deleting the formation section leaves this beat working,
         the same way the whole snap beat can be deleted without touching the
         poses before it. */
      if (typeof postFormation === 'function') {
        afterDrop(FORM_LEAD, () => postFormation());
      }
    });
  }
  return true;
}

/** Beat 2 onwards: he lets go, falls the height of the board, and lands on the
    floor the box was standing on. (The box does NOT come back under him. It used
    to - see the note in the last round's hand-over - and this line said so for
    several builds after it stopped being true.) */
function finaleDrop() {
  const el   = entryEl;
  const tray = document.querySelector('.tray');
  const m    = entryMetrics();

  /* Where his grip has to be for his feet to be on the box. With him at 680
     this is a few px ABOVE where he was hanging, which is why the arc has to
     throw him up rather than drop him: there is not enough room below the line
     to fall in, and a boy letting go of a swing goes up first anyway. */
  const y0 = ropeY(ENTRY_REST_X);
  const y1 = FLOOR_Y - m.feetBelowGrip;

  /* The BOX is not part of this any more: it toppled and landed before the ride
     began, so there is nothing here to bring in, react, or land on. He is
     falling onto the bare floor. The thud you can hear is his own, in
     finaleLanding(); the box's knock was six seconds ago. */

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shadow = document.getElementById('finaleShadow');
  const fallEl = document.getElementById('finaleFall');

  /* THE POSE THAT TRAVELS. Its width is in the stylesheet; everything else is
     here, because it has to be placed from the arc every frame.

     `top` blends two anchors with p*p. At the swap his MASS CENTRE has to match
     the clip's or his head jumps 166px in a frame - he is tucked, so his
     silhouette is 337px where the clip's is 457. At the end his FEET have to be
     on FLOOR_Y or the landing pose appears somewhere he is not. Blending the
     two is also what a falling body does: tucks, then reaches for the ground. */
  const fw = FALL_SPRITE.w * FALL_SCALE;
  const fh = FALL_SPRITE.h * FALL_SCALE;
  const gripYpx = m.h * cssNum('--entry-grip-y', 9.64) / 100;
  const placeFall = (x, y, p, spin) => {
    if (!fallEl) return;
    const com  = (y - gripYpx) + FALL_COM * m.h - fh / 2;
    /* His SANDAL row, not the image's bottom edge: the cut leaves a few
       transparent rows below his feet and anchoring on those hangs him in the
       air by that much. */
    const feet = (y + m.feetBelowGrip) - FALL_FEET * FALL_SCALE;
    const e    = p * p;
    fallEl.style.left = (x - fw / 2).toFixed(1) + 'px';
    fallEl.style.top  = (com + (feet - com) * e).toFixed(1) + 'px';
    fallEl.style.transform = 'rotate(' + spin.toFixed(2) + 'deg)';
  };

  /* The shadow is set from the same p as the arc rather than animated on its
     own timer, so the two cannot drift apart. */
  const shade = (p) => {
    if (!shadow) return;
    const k = SHADOW_MIN + (SHADOW_REST - SHADOW_MIN) * p * p;
    shadow.style.opacity = (0.25 + 0.75 * p * p).toFixed(3);
    shadow.style.transform = 'scale(' + k.toFixed(3) + ')';
  };

  const land = () => {
    cancelAnimationFrame(dropRaf);
    dropRaf = 0;
    clearTimeout(dropGuard);
    dropGuard = null;
    el.classList.remove('is-riding', 'is-home');
    el.style.opacity = '';
    /* ...and the transition finaleDrop() turned off to get the drop-shadow off
       him in one frame rather than over --entry-fade-ms. He is hidden by now, so
       this is only so that nothing later inherits a dead `none`. */
    el.style.transition = '';
    el.style.willChange = 'auto';        // he is done moving for good

    /* He is on the floor now, so the shadow stops being a falling-object cue
       and becomes the shadow of a boy standing there. It is left in place. */
    /* The shadow is left where the fall put it; finaleLanding() fades it out as
       the landing art's own shadow comes up. THE DUST IS DRAWN into that pose
       now - there were three CSS puffs here and they would have doubled it. */
    shade(1);
    if (fallEl) fallEl.classList.remove('is-on');   // the landing pose takes over

    finaleLanding();
    /* WHAT MARKS THE LANDING IS THE THUD, in finaleLanding(), and nothing else.
       There was an `allDone` flourish here once and another in playPostGame()
       two lines down, both firing on this same tick, so the loudest cue in the
       game arrived as two coherent copies of itself. The duplicate was removed;
       the survivor has since been removed as well, at the user's request. */

    /* The post-game recap, if the other half of this screen is loaded. It
       guards itself, so calling it when it is absent or already running is
       safe — and it belongs here because this is the moment the finale is
       actually over. */
    if (typeof playPostGame === 'function') playPostGame();
  };

  if (still) { el.style.display = 'none'; land(); return; }

  /* THE RESTING SHADOW COMES OFF BEFORE HE DOES, and it comes off AT ONCE.

     WHY IT COMES OFF AT ALL. is-home's drop-shadow is for a boy standing still
     on a bare board - the note on it in styles.css says so, and says why it is
     NOT on him during the ride: a filter on an element whose transform changes
     every frame is re-rasterised every frame, and measured A/B/A/B it roughly
     halved the frame rate of the ride. The fall is that same continuous move,
     720ms of it, and it was carrying the shadow for all of it. From here the
     depth cue is #finaleShadow on the floor, which shade() drives off the same
     p as the arc - and which is the only thing in the frame that can say how
     far below him the ground is anyway.

     AND IT IS THE GLITCH FIX. A filter puts the video in its own render
     surface. Measured on this exact frame: as the arc's first transform went
     on, the compositor drew the clip's video quad WITHOUT that surface's
     transform for one frame - which is the element's own layout box, left:0 /
     top:0 - so a full-size Aaru appeared in the top-left corner across the
     banner and was gone again 16ms later. It reproduced on 4 runs out of 4, and
     did not happen on any of the runs with the filter off.

     IT IS INVISIBLE TO A rAF PROBE, which is why this took a screencast to
     find: every transform JS wrote was correct on every frame, and the frame
     that was wrong was the compositor's own. `node tools/find-corner-flash.js`
     is the harness - it reads back what was actually put on the screen.

     transition:none GOES WITH IT, because .entry transitions `filter` over
     --entry-fade-ms: left to fade out, the drop-shadow - and the render surface
     that needs - would still be there for the first 260ms of a 720ms fall,
     which is the part that glitches. It is cleared again in land(). */
  el.style.transition = 'none';
  el.classList.remove('is-home');

  shade(0);

  /* THE AIR ON THE WAY DOWN. It goes here and not in the `still` path above,
     because with motion turned down there is no fall to hear — he is simply
     already on the floor, and a whoosh over a cut is a sound with no picture.

     Centred, unlike most of the set: he is falling down the middle of the
     stage, and DROP_DRIFT moves him 34px, which is not a stereo position. */
  sfx('fall');

  const t0 = performance.now();
  finaleMotionState = null;
  el.style.willChange = 'transform';
  dropRaf = requestAnimationFrame(function step(now) {
    const p = Math.min(1, (now - t0) / DROP_ARC_MS);
    /* p*p on the descent, so he ACCELERATES - things fall faster the longer
       they have been falling, and a constant-rate drop is the single thing that
       most makes a fall read as a float. The second term is the release flick:
       zero at both ends, -1 at the middle, so it lifts the path without moving
       where he starts or where he lands. */
    const y = y0 + (y1 - y0) * p * p - 4 * DROP_RISE * p * (1 - p);
    const x = ENTRY_REST_X - DROP_DRIFT * p;

    /* STRETCH, along the way he is going. sy grows with p*p like the speed
       does; sx gives back a little over half of it, which is short of volume-
       preserving on purpose - a body that thins exactly as much as it lengthens
       reads as rubber. */
    const sy = 1 + DROP_STRETCH * p * p;
    const sx = 1 - (sy - 1) * 0.55;

    /* THE LEAN, out and back: zero when he opens his hands, DROP_TILT while he
       is dropping, zero again on the frame his sandals touch. sin() gives both
       ends for free and never overshoots; the 0.8 exponent skews the peak early,
       to p=0.42, so the unwinding gets more of the fall than the leaning does -
       he is squaring up for longer than he was tipping, which is the half of it
       a viewer actually reads.

       IT IS ALSO WHAT MAKES THE HAND-OVER INVISIBLE. finaleLanding()'s crouch is
       drawn square and is not rotated at all, so any angle left here at p=1 is a
       jump on the impact frame. sin(pi) is 0 exactly. */
    const spin = DROP_TILT * Math.sin(Math.PI * Math.pow(p, 0.8));

    /* Order matters. The scale sits between the rotate and the grip translate
       so that it scales ABOUT THE GRIP - his hands - and the stretch therefore
       extends downward, toward where he is going. On the end of the transform
       it would scale about the element's own corner and slide him sideways. */
    /* ...and one whole stage on top, because that is where his box is parked.
       See placeEntry() and the note on .entry in styles.css. */
    el.style.transform =
      'translate3d(' + (x + STAGE_W).toFixed(2) + 'px, ' +
                       (y + STAGE_H).toFixed(2) + 'px, 0)' +
      ' rotate(' + spin.toFixed(2) + 'deg)' +
      ' scale(' + sx.toFixed(4) + ', ' + sy.toFixed(4) + ')' +
      ' translate(calc(-1 * var(--entry-grip-x)), calc(-1 * var(--entry-grip-y)))';
    shade(p);
    finaleAir(x, y + m.h * 0.48, now, 'fall');

    /* THE SWAP. A hard cut, on the accent, at FALL_SWAP_AT - up to there he is
       still near the line with his arms up, which is what a boy looks like in
       the instant after letting go, so the clip is right. After it the clip is
       wrong: it draws him gripping a rope that is not there. */
    if (p >= FALL_SWAP_AT) {
      placeFall(x, y, p, spin);
      if (fallEl && !fallEl.classList.contains('is-on')) {
        fallEl.classList.add('is-on');
        el.style.display = 'none';
      }
    }

    if (p < 1) { dropRaf = requestAnimationFrame(step); return; }

    /* ONE MORE FRAME BEFORE THE CUT. The transform for p=1 has just been
       written, but the browser has not composited it: cutting and landing in
       this same callback means the last frame anyone SEES is the previous one,
       about 30px short of the floor at 60Hz. Handing over on the next frame is
       what makes the pose he hands over from the pose that actually reached the
       ground. */
    dropRaf = requestAnimationFrame(() => {
      el.style.display = 'none';          // the cut. See the note above
      finaleImpactMotion();
      land();
    });
  });

  /* Same backstop as everything else here: a backgrounded tab stops producing
     frames, and the game must not come back with him halfway through a jump. */
  dropGuard = setTimeout(() => { el.style.display = 'none'; land(); }, DROP_ARC_MS + 500);
}

/* --- placement ------------------------------------------------------------- */

/* CORRECT: snap in, light up, SFX, fix it, scroll the choices left, advance. */
function placeCard(cardId, slotIndex) {
  const el = cardNodes.get(cardId);
  const rest = slotRestFor(cardId, slotIndex);

  filled[slotIndex] = cardId;
  selectedId = null;
  attempts = 0;                       // the attempt counter is per position
  clearTimeout(pulseTimer);           // a pulse owed to this position is moot
  clearTimeout(voHintTimer);          // ...and so is a hint about a card now placed
  /* ...and a praise still waiting on the PREVIOUS card. A child quick enough to
     place two cards inside PLACE_LEAD_MS would otherwise get the first slot's
     line landing on top of the second slot's, both about cards already down. */
  clearTimeout(praiseTimer);
  praiseTimer = null;
  clearPulse();
  hideHand();

  el.style.left = rest.left + 'px';
  el.style.top  = rest.top  + 'px';
  el.classList.remove('is-selected');
  el.classList.add('is-placed', 'is-landing', 'is-lit');
  el.tabIndex = -1;
  el.setAttribute('aria-disabled', 'true');
  setTimeout(() => el.classList.remove('is-landing'), 420);
  setTimeout(() => el.classList.remove('is-lit'), 1000);

  playPlaced(slotIndex);

  /* ...and the narrator over the top of it: the praise names the event the
     child has just put down, and the line after it asks for the next one. Where
     the sheet gives no praise for this slot — screens 2-4, and the last card of
     screen 1 — the queue is dropped rather than replaced, which lets a sentence
     still in the air finish instead of being cut off to say nothing.

     sayAnswer AND NOT say, because this is also the moment the banner would
     otherwise run ahead of her: it pins the wall to the question this placement
     just ANSWERED until the line behind the praise starts asking the next one.
     See promptHold. */
  const said = answeredLinesFor(slotIndex);
  if (said) sayAnswer(said, slotIndex); else hush();

  /* THE PLACE THIS CARD LEAVES STAYS WHERE IT IS. `queue` is indexed by
     station, so hanging a card punches a HOLE in it rather than closing the
     gap: the cards still in the tray do not move an inch, and the next screen's
     next picture drops into that same hole ARRIVE_LEAD_MS later. See the
     refilling-the-tray note over stockPool().

     IT USED TO SPLICE, and the note here read "the bottom choices immediately
     scroll left; anything still waiting past the last station slides in from
     the right". Nothing was ever waiting — every screen has exactly three cards
     for exactly three frames — so the second half of that sentence never once
     ran, and all a child ever saw was the two remaining choices shuffling
     leftwards away from the place they had just emptied, and then an empty box.
     Which is what the user asked to be rid of, in their own words: "when all
     three screens are correctly placed in the frame, the option box gets empty
     ... new options should automatically appear in place of older ones". */
  const freed = queue.indexOf(cardId);
  queue[freed] = null;
  layoutQueue();
  /* NAMED, not searched for: on a screen that brought two pictures there is a
     null station standing there all along, and admitNext's old leftmost-hole
     search would refill that instead of the place this card just left. */
  arriveTimers.push(setTimeout(() => admitNext(freed), ARRIVE_LEAD_MS));

  render();
  resetIdle();

  if (activeSlot() === -1) finishRound();
}

/* INCORRECT: wiggle, bounce back, then escalate by attempt number. */
function rejectCard(cardId, { counts = true } = {}) {
  const el = cardNodes.get(cardId);
  const home = trayPos(cardId);

  el.style.left = home.x + 'px';
  el.style.top  = home.y + 'px';
  el.classList.remove('is-selected');
  selectedId = null;

  /* Travel home first, then the wiggle — this is the arrow drawn in 133:2524
     played out as motion. */
  setTimeout(() => {
    el.classList.add('is-rejected');
    setTimeout(() => el.classList.remove('is-rejected'), 460);
  }, 300);

  if (!counts) { render(); resetIdle(); return; }

  sfx('wrong', { pan: panAt(home.x + cardSpecs.get(cardId).home.w / 2) });
  attempts += 1;

  if (attempts === 2) {
    /* 2nd attempt — the narrator names the picture the frame is asking for.

       IT WAITS FOR THE BOUNCE, exactly as the 3rd attempt's pulse does, and for
       three reasons rather than one. The sheet orders it that way ("wiggles and
       bounces back. Play VO..."). It is a sentence starting over a card that is
       still flying and then wiggling, which is two things asking to be looked
       at. And say() ducks the effects 6 dB the instant it is called, so at
       zero it pulls `wrong` — a 0.7s cue, levelled by the bench to be heard —
       down almost as it fires, and the child gets a quieter "no" underneath the
       explanation of what "yes" would have been.

       Owed to THIS story position, and guarded like the pulse for the same
       reason: a child who gets it right inside the 760ms must not then be told
       the answer to a frame they have already filled, over the top of her
       praise for it. */
    const forSlot = activeSlot();
    clearTimeout(voHintTimer);
    voHintTimer = setTimeout(() => {
      voHintTimer = null;
      if (locked || activeSlot() !== forSlot) return;
      playVO(expectedCardFor(forSlot));
      /* She is talking now, so this clears the idle ladder rather than arming
         it, and sayNext arms it again when she stops — which is what keeps the
         hint chime from going off underneath her own sentence. Where there is
         no recording playVO is a no-op and this simply re-arms from here. */
      armIdle();
    }, REJECT_MS);
  } else if (attempts >= 3) {
    /* 3rd attempt onwards — the correct card gently pulses, once the
       incorrect card has finished bouncing back. The pulse is owed to THIS
       story position: if the child answers it correctly inside the bounce, the
       timer must not land on the next position and hand them that answer too. */
    const forSlot = activeSlot();
    clearTimeout(pulseTimer);
    /* ...AND IT WAITS HER OUT RATHER THAN BEING LOST. REJECT_MS is measured off
       the incorrect card's bounce, not off her, so on the screens where the 2nd
       attempt's recording is still running this falls due mid-sentence - and
       pulseCorrectCard() now refuses that. Refusing is right and dropping the
       rung is not: this is the ONE place the correct card is ever pointed at
       (the hint-visuals note above says why the idle ladder no longer does it),
       so the debt is kept and paid on the first quiet tick. The slot guard is
       re-checked on every retry, so a child who answers this position correctly
       while she is still talking is still never handed the next one's answer. */
    const owe = () => {
      pulseTimer = null;
      if (locked || activeSlot() !== forSlot) return;
      if (speaking()) { pulseTimer = setTimeout(owe, 120); return; }
      pulseCorrectCard();
      resetIdle({ keepPulse: true });
    };
    pulseTimer = setTimeout(owe, REJECT_MS);
    render();
    return;
  }

  render();
  resetIdle();
}

/** Resolve a drop.

    A DROP INTO ANY FRAME IS AN ANSWER, RIGHT OR WRONG, and getting that wrong
    was the largest hole in the gameplay sheet's feedback ladder. This used to
    read "only a drop aimed at the active slot is an answer; a card let go
    anywhere else is a mis-drop and does not count as an attempt" - so a card put
    into the WRONG FRAME scored nothing at all. No `wrong`, no attempt counted,
    and therefore never the 2nd attempt's voice-over and never the 3rd attempt's
    pulse. A child could do it twenty times and the game would say nothing.

    IT IS SCREENS 2, 3 AND 4 THAT THIS BROKE, and the reason is in their
    narration rather than in here. Screen 1 asks one frame at a time - "what
    happened first?", then "what happened next?" - so the child is pointed at a
    single frame and the drop lands on the active one. Screens 2-4 have ONE line
    for the whole board, "कहानी को सही क्रम में लगाओ", put the story in the right
    order. Nothing in that says the frames fill left to right. A child who
    recognises the LAST picture and drags it to the LAST frame is doing exactly
    what they were asked, and every one of those drops was silent.

    Measured, on screen 2, before this: the third picture into the third frame
    three times running left `attempts` at 0 with no cue and no hint, and the
    correct FIRST picture dropped into the second frame did the same. The same
    three tries aimed at the active frame ran the whole ladder.

    WHAT IS STILL FREE is a card let go where there is no frame at all - the
    board, the rope, the tray it came from. slotAt() returns null for those and
    they are a fumble rather than an answer, which is the distinction the old
    code was reaching for and drew in the wrong place.

    A DROP ONTO A FILLED FRAME COUNTS TOO, and that is deliberate rather than
    incidental: it is the only incorrect attempt available at the third story
    position, where the tray is down to one card and there is nothing left to be
    wrong with. Before this, the ladder was unreachable there on every screen and
    four of the twelve picture voice-overs - dialogues 15, 18, 21 and 24 - could
    never play at all. tools/sim.js `hints` reports that count. */
function tryPlace(cardId, slotIndex) {
  if (inputLocked()) { rejectCard(cardId, { counts: false }); return; }

  /* Not aimed at a frame: a fumble, not an answer. */
  if (slotIndex === null || slotIndex === undefined) {
    rejectCard(cardId, { counts: false });
    return;
  }

  const active = activeSlot();
  if (slotIndex !== active || cardId !== expectedCardFor(active)) {
    rejectCard(cardId);
    return;
  }
  placeCard(cardId, active);
}

/** THE SCREEN-FINISHED CELEBRATION: the cue and the cards, fired together.

    ONE FUNCTION, AND THAT IS THE POINT. `roundDone` is not a jingle laid over
    the moment — it has three bright notes inside it, at CHEER_HITS, one per
    card, panned to the frame that card is hanging in. The three timers below
    are what makes those cards physically bounce, and CHEER_HITS is derived from
    exactly these numbers. Fire the sound from one place and the bounces from
    another and the notes come off the pictures, which is the one thing this cue
    was written not to do.

    THE BOUNCE WAITS OUT THE PLACEMENT LIGHT-UP. Overlapping them would collide
    on `animation`, which is a single property: the placement rule is more
    specific, so the bounce would be swallowed on exactly the card that just
    landed and the spec'd light-up would be cut short. CHEER_DELAY_MS is that
    wait, and on the path where this fires with Aaru the light-up has finished
    long before anyway.

    THE LIST IS PASSED IN rather than read off `round`, because the caller that
    matters fires this from inside the round-change pause — and because what it
    passes is `filled`, THE FRAMES ON THE LINE, not the pictures the screen asked
    for. Since the line carries pictures across a seam those are two different
    lists on every screen but the first: the leading frames were answered on the
    screen before, and a row that is right is right all the way along. */
/** IT TOOK A `withAaru` FLAG AND NO LONGER DOES. It existed for `hops`, which
    put a drum stroke on each of Aaru's four landings and so was only true on the
    three screens where correct_ans.webm actually runs. Both the flag and the cue
    are gone - see below - so the two callers pass the row alone. */
function roundCheer(hung) {
  /* CLAPPING, AND ONLY CLAPPING. Three cues fired here and two of them are gone:
     `roundDone`, a darbuka figure with a hand bell on the end of it, and `hops`,
     a drum stroke on each of his four landings. The user's verdict on the pair:
     "right now it has damru sound, children screeming sound which is not correct
     i dont want that, only celebrating clapping sfx is enough... it should not be
     irritating but happy and celebrating sccessful emotion should comes in an
     indian child heart".

     THE PREVIOUS PASS HAD ALREADY MOVED THIS CUE ONCE, from a music box arpeggio
     to hand percussion, on "i want an indian cartoon celebration clapping and
     jumping sfx". Reading the two notes together: what was wanted both times was
     the CLAPPING, and both times it arrived with an instrument in front of it.
     A drum on a child's success is a performance of celebration; hands are the
     thing itself, which is what "in an indian child heart" is asking for.

     THE VOICES WERE A SEPARATE FAULT and they were inside the clap recording -
     the window it was cut from opened in the loudest shouting in the take. See
     the note over `handclap` in tools/cut-sfx-assets.py: 91% of that window was
     tonal, this one is 18%.

     Both retired voices are still in VOICES so the two can be heard against each
     other in tools/audition-pick.js, and neither is fetched any more. */
  sfx('applause');
  /* THE SOFT CLAPPING, AS ITS OWN CUE - see VOICES.softclap for why it could not
     just be a quiet layer inside `applause`. Fired alongside it rather than
     from inside it, the same idiom this function already uses for roundDone
     and hops before they were retired. */
  sfx('softclap');
  hung.forEach((id, i) => {
    const el = cardNodes.get(id);
    if (!el) return;
    setTimeout(() => {
      el.classList.add('is-cheering');
      setTimeout(() => el.classList.remove('is-cheering'), 660);
    }, CHEER_DELAY_MS + i * CHEER_STEP_MS);
  });
}

function finishRound() {
  locked = true;
  clearTimeout(hint1Timer);
  clearTimeout(hint2Timer);
  clearTimeout(pulseTimer);
  clearTimeout(voHintTimer);
  hideHand();
  clearPulse();
  render();

  /* THE CELEBRATION GOES WITH AARU, NOT WITH THE THIRD CARD, and that is the
     user's own note on this beat: "when all 3 scenes are placed correctly the
     cheerful sfx that comes should come when aaru gif enters from the right".

     What it was: `roundDone` fired on the frame the third card went in, ran its
     two seconds out, finished — and THEN, a further two seconds later, Aaru
     leaned in from the right and applauded in complete silence. The one thing
     on the screen that is a person being pleased had nothing on it, and the
     sound that meant "you are being applauded" had already stopped by the time
     anybody appeared to do the applauding.

     What it is: the cue opens on the frame he starts entering. Measured against
     the clip, that puts the music box run and its landing chord under him
     leaning around the edge (frames 0-5, 0.80s), the three card notes at
     0.66/0.79/0.92 as he steps out to the middle, and the children — the last
     thing in the cue, 0.47s to 2.07s — over the front of the clap itself.

     THE LAST SCREEN IS THE EXCEPTION and it fires here, at the placement, the
     way every screen used to. Nothing walks on after it: the box topples, the
     line is hauled, and Aaru arrives on the rope instead, and the branch below
     returns before it could ever reach the celebration. Left unfired, the
     fourth screen would be the only one in the game whose completion made no
     sound at all.

     `order` is captured now rather than read inside the timer. `round` is a
     module-level binding and the pause below is where roundIndex moves; nothing
     reassigns `round` until buildRound() runs, but a copy costs nothing and
     this is the code that would break silently if that ever changed. */
  const order = round.order.slice();
  /* THE FRAMES ON THE LINE, NOT THE PICTURES THIS SCREEN ASKED FOR, and on every
     screen but the first those are not the same list: the leading frames hold the
     pictures the story carried over, which the child placed on the screen before
     and which are as much part of the row they have just completed as the ones
     they added. Cheering `order` would leave those frames conspicuously still.
     Captured here for the same reason `order` is — buildRound() reassigns
     `filled`, and the pause below is where roundIndex moves. */
  const hung = filled.slice();
  const lastRound = roundIndex + 1 >= ROUNDS.length;
  /* FALSE, AND THAT IS THE WHOLE REASON THE FLAG EXISTS: this is the last
     screen, where nobody walks on to clap. See roundCheer. */
  if (lastRound) roundCheer(hung);

  /* Then the pause, and then Aaru comes on to clap. Everything that used to
     happen at the end of that pause now happens at the end of HIM — the line is
     not hauled and the next deck is not dealt until he is off the screen.
     playCelebration() guarantees the callback runs even if he cannot be shown.

     TWO LENGTHS, because the two paths hold the screen for different reasons:
     see CLAP_PAUSE_MS and endingPauseMs(). On the clap path the celebration has
     not even started yet - it goes with Aaru, further down - so that pause only
     has to cover the third card's light-up. On the LAST screen the celebration
     has already fired, right above, and the pause is what it plays out in: the
     board is held until the flourish and the crowd behind it are both out, and
     only then does anything move. See endingPauseMs() for the arithmetic and
     for what firing the ending into the middle of that crowd sounded like.

     The clap path is now 1.1s shorter,
     which is the dead air that appeared the moment the celebration moved off
     the placement — everything after it, her handover line included, simply
     starts 1.1s earlier and keeps the same spacing between its own beats. */
  pauseTimer = setTimeout(() => {
    /* Her line for the screen just finished, where the screen has one. NONE DO
       ANY MORE — this is null on all four — so both branches below skip it and
       the two ticks it used to own are silent. It is SAID further down, on
       whichever of the two paths this is.

       THE HANDOVER USED TO BE HERE, and the argument for it was that this is
       the only window in the game that will hold 8.49s of speech with nothing
       able to cut it: `locked` has been true since the last card landed, and it
       fits the gap exactly — 4.80s of clip and 260ms of fade, 1700ms of haul,
       900ms of deck and 1200ms of dealing puts the next screen's cards down at
       8.86s, so behind HANDOVER_LEAD_MS her 8.49s runs 330ms past them.

       WHAT THAT WAS PROTECTING AGAINST no longer exists. Queued behind the
       second praise the line was dropped by hush() whenever a child placed the
       third card inside it; hush() keeps it now (see `hold` on VO_SRC.handoff),
       so it can sit where the Tutorial actually ends. The arithmetic above is
       kept because it is what a future `done` line would have to fit into. */
    const handover = doneLineFor();

    roundIndex += 1;

    /* THE LAST ROUND DOES NOT GET THE CLAP. It ends the way every other one
       does — the story hauled off along the line inside its own frames — and
       then it does not end the way they do: nothing empty comes in behind it,
       and Aaru arrives on the bare line instead. Him leaning in at the right
       to applaud, leaving, and then coming back on a rope is two entrances
       where the ending wants one, and the one it wants is the rope. `locked`
       stays true from here on, so he is the last thing on screen. See
       playEntry(). */
    if (roundIndex >= ROUNDS.length) {
      /* On this path the celebration already sounded, back at the placement,
         so there is nothing for her to be held off. */
      if (handover) say(handover);

      /* THE BOX GOES HERE, and this is the one line that sets the order of the
         whole ending. It falls WITH the haul: the last story rides off along the
         line, the box tips forward, lands and throws its dust, and the ride does
         not start until haulLine's callback — so Aaru swings in over a board
         that is already bare, about a second after the box came down.

         It used to tip 900ms into his ride instead, which read as two unrelated
         things happening at once rather than as one clearing and then the boy.
         See BOX_TOPPLE_AT and toppleBox().

         WHAT DOES NOT HAPPEN HERE is the box coming back. It used to be sent
         away and tumbled in again underneath him — the box arriving to meet the
         boy, which is backwards — and .tray.is-away/.is-dropping are the unused
         remains of that. He falls the whole way to the floor the box was
         standing on. */
      /* THE ENDING IS FOUR THINGS IN A ROW, and each one waits for the last.
         The line carries the story off; the board sits bare; the box goes; the
         dust settles; and only then is there a boy on the rope. Every wait below
         is tracked in dropTimers so clearDrop() can cancel the whole chain - a
         dev skip mid-ending would otherwise drop Aaru onto a rebuilt board. */
      haulLine(() => {
        dropTimers.push(setTimeout(() => {
          toppleBox();
          /* The box's own fall, read the same way toppleBox reads it, so the two
             cannot drift: BOX_TOPPLE_AT of lead and then BOX_IMPACT of the CSS
             topple is the frame it lands on. ENTRY_HOLD_MS runs from there. */
          const down = BOX_TOPPLE_AT + cssNum('--box-topple-ms', 1110) * BOX_IMPACT;
          dropTimers.push(setTimeout(playEntry, down + ENTRY_HOLD_MS));
        }, BOX_WAIT_MS));
      }, { replace: false });
      return;
    }

    /* Otherwise he claps, and only then is the finished round hauled off the
       screen inside its own frames — and frame 177:82, the bare template, is
       what comes back in. */
    /* HIM AND THE SOUND, ON ONE TICK. Fired before playCelebration() rather
       than from inside it so that a browser which cannot show him — no VP9
       alpha, a clip that will not decode — still gets the celebration it just
       earned. That function's first act on those browsers is to call `done`
       and return. */
    roundCheer(hung);
    /* shiftLine RATHER THAN haulLine, and this is the seam. The line moves along
       by as much of it as the next screen is new instead of swapping a whole
       screen out, so the pictures just hung carry over as that screen's opening
       frames. The ENDING is still a haul — see the branch above. */
    playCelebration(() => shiftLine(() => {
      locked = false;
      buildRound(roundIndex);
      resetIdle();
    }));

    /* ...and she waits out the front of it. See HANDOVER_LEAD_MS: this is the
       one screen where the narrator and the celebration want the same tick, and
       the celebration is what the child just earned. `pauseTimer` is reused
       rather than a fourth timer added — it has already fired, and it is the
       one this section's teardown (clearDrop, through devTeardown) clears. */
    if (handover) {
      pauseTimer = setTimeout(() => { pauseTimer = null; say(handover); },
                              HANDOVER_LEAD_MS);
    }
  }, lastRound ? endingPauseMs() : CLAP_PAUSE_MS);
}

/* --- pointer dragging ------------------------------------------------------ */

/** Which frame, if any, a card centred at `pt` is being dropped onto. */
function slotAt(pt, cardW) {
  for (let i = 0; i < SLOT_CENTER.length; i++) {
    const c = SLOT_CENTER[i];
    if (Math.abs(pt.x - c.x) <= cardW / 2 + 40 &&
        Math.abs(pt.y - c.y) <= CARD_H / 2 + 40) return i;
  }
  return null;
}

/** Tear a drag down and hand back what it was. Every exit from a drag goes
    through here so the drop, the cancel and a round swap cannot drift apart. */
function endDrag() {
  if (!drag) return null;
  const d = drag;
  drag = null;
  window.removeEventListener('pointermove', onCardPointerMove);
  window.removeEventListener('pointerup', onCardPointerUp);
  window.removeEventListener('pointercancel', onCardPointerCancel);
  d.el.classList.remove('is-dragging');
  d.el.style.zIndex = '';
  slotEls.forEach(s => s.classList.remove('is-over'));
  /* Flush the removal of .is-dragging so the left/top transition it suppressed
     is live again before anything moves the card. */
  void d.el.offsetWidth;
  return d;
}

function onCardPointerDown(ev) {
  const el = ev.currentTarget;
  const id = el.dataset.card;
  /* One card at a time: a second finger must not overwrite the drag in flight,
     which would strand the first card mid-stage with no pointer left to
     release it — and a card parked over a frame blocks the tap-to-place path. */
  if (inputLocked() || drag || filled.includes(id)) return;

  ev.preventDefault();
  audio();                 // unlock playback inside the gesture
  if (dealTimer || dealSettleTimer) endDeal();   // never make a child wait it out
  settleArrival(el);                             // ...nor a card still dropping in

  /* Capture keeps the drag alive if the pointer outruns the card. It can throw
     for a pointer that is already gone, and the window listeners below cover
     that case anyway, so a failure here is not fatal. */
  try { el.setPointerCapture(ev.pointerId); } catch { /* no active pointer */ }

  const pt = toStage(ev);
  sfx('pickup', { pan: panAt(pt.x) });   // from where the card was picked up

  drag = {
    id,
    el,
    w: cardSpecs.get(id).home.w,
    pointerId: ev.pointerId,
    grabX: pt.x - parseFloat(el.style.left),
    grabY: pt.y - parseFloat(el.style.top),
    startX: ev.clientX,
    startY: ev.clientY,
    moved: false,
  };

  el.classList.add('is-dragging');
  el.style.zIndex = '40';

  /* Stop the idle clock for the whole drag. Called after `drag` is set so the
     guard in resetIdle sees it: this clears any live pulse, hand and timers
     without re-arming them until the card is let go. */
  resetIdle();

  /* Bound to the window, not the card, so the drag survives a failed capture
     and still ends if the pointer is released outside the stage. */
  window.addEventListener('pointermove', onCardPointerMove);
  window.addEventListener('pointerup', onCardPointerUp);
  window.addEventListener('pointercancel', onCardPointerCancel);
}

/** The gesture was taken away (OS gesture, palm rejection, tab switch). That is
    not an answer and not a tap — put the card back and score nothing. */
function onCardPointerCancel(ev) {
  if (!drag || ev.pointerId !== drag.pointerId) return;
  const { el, id } = endDrag();
  const home = trayPos(id);
  el.style.left = home.x + 'px';
  el.style.top  = home.y + 'px';
  render();
  resetIdle();
}

function onCardPointerMove(ev) {
  if (!drag || ev.pointerId !== drag.pointerId) return;

  /* A FINGER'S SLOP IS NOT A MOUSE'S. This was 6 client px for every pointer
     type, under both platforms' own tap tolerance - Android's touch slop is
     8dp, iOS pans at ~10pt - because a fingertip rolls a few pixels during an
     ordinary press and lift. Two things went wrong on touch:

       A TAP BECAME A DRAG. onCardPointerUp takes its select branch only while
       `moved` is false, so a rolled tap fell through to tryPlace() with the
       card still standing in the tray - slotAt() returns null that far from a
       frame, and the deliberate "no frame at all" fumble fired rejectCard,
       which wiggles the card and clears selectedId. Tap-a-card-then-tap-a-frame
       lost its first half, which is the whole no-drag route through the game.

       AND EVERY TAP NUDGED THE CARD. The writes below ran whether or not the
       gesture had committed; render() only toggles classes and never re-lays
       the tray, and onCardPointerDown re-reads grabX/grabY off style.left - so
       the offset survived the tap and accumulated over the next one.

     One fix each: a touch-sized slop, and nothing written until the gesture has
     committed. .stage sets touch-action:none, so this handler is the only thing
     that can filter that jitter - the browser hands us every pixel of it. */
  if (!drag.moved) {
    const slop = ev.pointerType === 'mouse' ? 6 : 12;
    if (Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) <= slop) return;
    drag.moved = true;
  }

  const pt = toStage(ev);
  const left = clamp(pt.x - drag.grabX, -drag.w / 2, STAGE_W - drag.w / 2);
  const top  = clamp(pt.y - drag.grabY, -CARD_H / 2, STAGE_H - CARD_H / 2);
  drag.el.style.left = left + 'px';
  drag.el.style.top  = top  + 'px';

  const over = slotAt({ x: left + drag.w / 2, y: top + CARD_H / 2 }, drag.w);
  slotEls.forEach((s, i) => s.classList.toggle('is-over', i === over && i === activeSlot()));
}

function onCardPointerUp(ev) {
  if (!drag || ev.pointerId !== drag.pointerId) return;

  const { el, id, moved, w } = endDrag();

  if (!moved) {
    /* A tap, not a drag: use it to select, so the activity works without
       dragging at all (tap a card, then tap a frame). */
    selectedId = selectedId === id ? null : id;
    render();
    resetIdle();
    return;
  }

  const left = parseFloat(el.style.left);
  const top  = parseFloat(el.style.top);
  tryPlace(id, slotAt({ x: left + w / 2, y: top + CARD_H / 2 }, w));
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/* --- keyboard placement -----------------------------------------------------
   Tapping and Enter/Space on a frame are wired per bay, in mountBay().
   ---------------------------------------------------------------------------- */

function onCardKeyDown(ev) {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const id = ev.currentTarget.dataset.card;
  if (inputLocked() || filled.includes(id)) return;
  ev.preventDefault();
  audio();
  settleArrival(ev.currentTarget);
  /* NEVER MAKE A CHILD WAIT OUT THE ENTRANCE, on either input path. This line
     was on onCardPointerDown only, so a child using the keyboard who chose a
     card while the deck was still dealing got no lift at all: deck-in and
     deal-out both run with `both`, so their transform holds the card where the
     animation left it and .is-selected's own transform loses to it. The mouse
     had this guard from the start; the keyboard did not. It matters more now
     that the entrance is longer - see DECK_STILL_MS. */
  if (dealTimer || dealSettleTimer) endDeal();
  selectedId = selectedId === id ? null : id;
  /* Same lift the pointer gets on the way down, so choosing a card sounds like
     choosing a card whichever way it is done. Panned to where the card is,
     which for a keyboard is the only cue as to which one just answered. Both
     calls are silent while `pickup` sits in SFX_MUTED; they stay wired so
     un-muting brings the lift back on both paths at once, not just on touch. */
  if (selectedId) sfx('pickup', { pan: panAt(trayPos(id).x + cardSpecs.get(id).home.w / 2) });
  render();
  resetIdle();
}

/* --- title screen -----------------------------------------------------------

   The game opens on its own thumbnail and one button. Two things make that
   worth more than a splash:

   It is the audio gesture. Browsers refuse to open an audio context until the
   page has been touched, so before this screen existed the whole opening — the
   line being hauled in, the deck landing, three cards dealt — happened in
   silence, and the first sound of the game was whatever the child touched
   first. Now the tap that starts the game is the tap that opens the context.

   It is also a start, which a child needs and an auto-running board does not
   give: the story is named and pictured, and nothing moves until they say so.
   ---------------------------------------------------------------------------- */

let started = false;

/** Hand the board over: haul round 1's frames in from the right the way every
    later round's are, and build the round behind them once the line has settled
    — the same order haulLine() uses between rounds. Nothing is playable while
    they travel. */
function startBoard() {
  locked = true;
  openLine(() => {
    locked = false;
    buildRound(0);
    resetIdle();
  });
}

function startGame() {
  if (started) return;
  started = true;

  /* Inside the gesture, so the context is allowed to open, and the pop is the
     first thing it plays. */
  audio();
  sfx('pop');

  playEl.disabled = true;
  titleEl.classList.add('is-leaving');

  /* The button's pop is allowed to finish before the board starts moving, so
     the two are read one after the other rather than at once; the artwork is
     still fading while the line comes in behind it. Both lengths are read back
     out of the stylesheet, which is also where prefers-reduced-motion shortens
     them. */
  const popMs = cssNum('--play-pop-ms', 420);
  setTimeout(startBoard, popMs);
  setTimeout(() => { titleEl.hidden = true; }, cssNum('--title-out-ms', 560));
}

/* Pressed state by hand rather than by :active alone: a touch that slides off
   the button has to release it, and Enter on a focused button never presses at
   all — so the class carries the state and :active is left as the mouse's own. */
playEl.addEventListener('pointerdown', () => {
  if (started) return;
  playEl.classList.add('is-pressed');
  audio();                        // warm the context up on the way down
});
['pointerup', 'pointercancel', 'pointerleave', 'blur'].forEach(ev =>
  playEl.addEventListener(ev, () => playEl.classList.remove('is-pressed')));

/* click, not pointerup: it is the one event a mouse, a finger, Enter and Space
   all arrive through, so the button works the same way for all four. */
playEl.addEventListener('click', startGame);

/* ?start=1 - ARRIVING STRAIGHT OUT OF THE STORY, WITH NO COVER IN BETWEEN.

   The picture book in story/ ends by navigating here, and it has always asked
   for the game this way: its own GAME constant carries ?start=1 (the folder it
   used to name is now ../, see the note there). The flag means "the child has
   already pressed a play button once today - do not show them another one."
   So the title art and its button are never painted at all, rather than being
   shown and then dismissed: the story's last page dissolves and the board is
   simply there.

   IT IS NOT A GESTURE, WHICH COSTS THE OPENING LINE IN THE WORST CASE. A
   top-level navigation lands with no user activation, so audio() may open a
   suspended context and her first question can go unheard. That is why nothing
   here tries to be clever about it: audio() re-checks the state on every call
   and resumes from inside the first card touch (see the note there), and if the
   child touches nothing, the idle clock re-asks the question nine seconds later
   with the context awake. Silence at the open heals itself either way, and the
   alternative - holding the board back until a tap - is the cover we were asked
   to remove, wearing a different hat. */
if (new URLSearchParams(location.search).get('start') === '1') {
  titleEl.hidden = true;
  startGame();
}

/* However long the child spends on this screen is time round 1's pictures can
   be fetched in, so the deck they are dealt from is never waiting on the wire.
   Every later round is fetched a round ahead by stockPool(), which builds its
   cards for real — this one cannot, because there is no tray to park them
   beside yet. See warmRound(). */
warmRound(0);

/* ...and time the twenty-nine cues can be fetched and decoded in. The context this
   builds is born suspended and stays that way until the play button resumes it,
   so this is not the game starting itself — it is the game not being caught out
   by its own first sound. */
primeSfx();
primeVo();

/* --- the post game ----------------------------------------------------------

   What runs once the finale has put Aaru on the floor: the banner tells the child
   what they did, and then - on his finger snap, not on the landing - the twelve
   frames ride back in and ring him. See "--- the formation ---" below for that
   half; this half is the banner. It used to open on the `allDone` flourish as
   well, and that cue is gone from the game.

   THE TWELVE PICTURES ARE BACK, AND THIS COMMENT USED TO SAY THEY WERE NOT.
   Worth keeping the history, because it is an argument that was made and then
   overruled by the person it was made about:

     A recap was built, watched, and taken out - twelve pictures riding in along
     the rope, a sparkling trail crossing them one at a time with a small effect
     and a sound on each, all twelve lighting together at the end. It went on the
     reasoning that twelve pictures behind a boy celebrating crowd the thing
     being celebrated, and that the child had just placed all twelve one at a
     time and did not need them shown back.

     The user then asked for the formation, in detail, describing the snap, the
     direction of travel and the ring. So the reasoning was wrong, or at least
     was not theirs, and the arrangement they asked for answers the crowding
     objection anyway: the frames are a ring round the EDGE of the stage with him
     alone in the middle of it, not a grid behind him.

   WHAT IS STILL NOT BUILT, from the gameplay sheet's two post-game screens: the
   sparkling trail that crosses the pictures in CHRONOLOGICAL order, the small
   per-picture animation as it reaches each one (the flour flies, the bicycle
   moves, the juice spills), the four story cues that went with them - फुर्र,
   टिन-टिना, धड़ामा, छपाका - and all twelve lighting together at the end. The
   user said "do this much 1st", so this much is the formation and no more. The
   footpath between the frames is not that trail; it is scenery.

   AND STILL GONE, both at the user's request and neither coming back with the
   frames: the confetti and the completion badge. */

/* What the banner says once the game is over.

   Written out by typePrompt like every other sentence in the game, so it
   arrives the same way the questions did and goes through the same
   grapheme-cluster reveal - which is what keeps Devanagari from being shown a
   broken letter at a time. It is in the same तुम voice as the questions
   ('लगाओ', 'याद करो') and it names what the child actually did rather than just
   cheering. */
const POST_GAME_PROMPT = 'शाबाश! तुमने पूरी कहानी सही क्रम में लगा दी!';

let postOn = false;           // has it run? this is what makes the seam safe

/* THERE IS NO BADGE, AND NO CONFETTI ON THE BEAT THIS SCREEN OPENS ON. Both went
   at the user's request, the badge first and the confetti after, and neither
   came back with the frames.

   The cost of that used to be the whole of this note: there was no WORDLESS
   signal left on this screen, in a game for children who are still learning to
   read. THE FORMATION IS NOW THAT SIGNAL - he snaps, twelve pictures fly in and
   arrange themselves round him - and it says "you finished, and here is the
   whole story you put in order" without a word of Hindi in it.

   Removed with the confetti and still absent: POST_LEAD_MS, POST_BURST2_MS,
   POST_COLOURS, postConfetti, postAfter, .recap-bit, .recap-fizz and #recapFizz.
   Anything still referring to them is the bug. The formation shares nothing with
   them - it is .pcard, .pstep and .post-ring/-trail/-magic, deliberately named
   apart so these warnings stay worth reading.

   CONFETTI DOES COME BACK AT THE VERY END, twenty seconds after this, and it is
   none of the names above. The user asked for it on the clap that closes Screen
   2 - "aaru clapps then bust cofetti from his behind 2-3 times" - and it is
   simulated paper on two canvases rather than a keyframe on a div: CONF_*,
   confettiBurst(), .post-conf. Fired from recapCheer() and from nowhere else. */

/** Take the celebration off the screen. Only the dev skip needs this - in a
    real game nothing follows it.

    It has something to cancel again. With the confetti gone this was down to
    hiding the overlay and clearing a flag; the formation brought back a running
    rAF loop, a pending trail timer and thirty-odd nodes, and formStop() is what
    undoes all three. */
function recapStop() {
  formStop();                        /* ...and the formation with it */
  const host = document.getElementById('recap');
  if (host) {
    host.hidden = true;
    host.setAttribute('aria-hidden', 'true');   /* back out of the tree */
  }
  postOn = false;
}

/** The applause. Called by the finale, at the moment his feet touch the floor.

    Idempotent and self-guarding: calling it twice, or early, or on a browser
    that never showed the finale at all, does nothing worse than nothing. That
    is what lets the seam live in the finale's code rather than here. */
function playPostGame() {
  if (postOn) return;
  const host = document.getElementById('recap');
  if (!host) return;                       // markup missing: leave the board alone
  postOn = true;

  /* THE GAME IS OVER, SO STOP THE GAME. In the real sequence `locked` has been
     true since the last card landed and none of this is running anyway - but
     ?dev=post jumps straight here from a live board, and without it the
     narrator carries on asking for the first picture underneath the
     celebration and the hint hand keeps pointing at a tray that is no longer
     the point. */
  locked = true;
  stopSaying();
  clearTimeout(hint1Timer);
  clearTimeout(hint2Timer);
  clearTimeout(pulseTimer);
  clearTimeout(voHintTimer);
  hideHand();
  clearPulse();

  /* The banner stops asking. */
  typePrompt(POST_GAME_PROMPT);

  host.hidden = false;
  /* The markup carries aria-hidden so an empty overlay is not announced during
     play; once it is the celebration it belongs in the tree. */
  host.removeAttribute('aria-hidden');

  /* AND NOTHING SOUNDS HERE, which is a removal and not an omission.

     `sfx('allDone', { delay: FLOURISH_LEAD_S })` was the last line of this
     function: the biggest cue in the game, held 600ms off the landing so that
     `thud` had the impact to itself. The user asked for all-done.wav out of the
     game throughout, so what opens the celebration now is the picture — the
     overlay, the banner, and him standing on the floor. The ending's sounds are
     the thud he lands on, the snap he ends on, and the hall of children over the
     confetti.

     FLOURISH_LEAD_S is kept because the reasoning it encodes is still the rule
     for this beat: whatever is ever put here waits out the impact first. */
}


/* --- the formation ----------------------------------------------------------

   HE SNAPS AND THE TWELVE FRAMES COME BACK. They ride in on the clothesline from
   the left, leave it one at a time, and settle into a clockwise ring with him
   standing in the middle of it. A footprint trail joins them.

   "the frames will come from the same path only direction will be from left to
   right" - so this is the haul's path, travelled the other way. haulLine() drags
   a bay right to left; these come left to right, and both read their height off
   ropeY(), which is the same curve the rope's clip-path is cut from. Entering
   from negative x is safe and continuous: ropeY wraps mod the stage width and
   the curve was hand-levelled so ROPE_Y[0] === ROPE_Y[24], which is exactly the
   step that would otherwise show at x=0.

   WHAT IS NOT REUSED, and why. rideBay() looks the part but indexes SLOT_CENTER
   by the element's own index and SLOT_CENTER has three entries - the fourth
   frame would read undefined.x and throw. And the rope's TWIST is not slid along
   under them: the twist moving is what a line being PULLED looks like, and
   nobody is pulling this one, he snapped his fingers. (It would also have to
   travel a whole multiple of 32px, and twelve frames going twelve different
   distances cannot all do that.)

   A FRAME HANGS VERTICALLY, not along the line. ropeTilt() exists and is not
   used here: a picture hanging off a washing line hangs plumb whatever the line
   under it is doing. What it does have is a pendulum lean that peaks mid-ride
   and settles - it is being carried, so it swings.
   -------------------------------------------------------------------------- */

/* THE TEN, NOT THE ELEVEN, and which ten is the reference art's choice rather
   than mine. It has no "he is hurt" frame and only one of the two utensil
   frames, so the two it leaves out are hurt and pickup - each the SECOND beat of
   a pair whose first beat is still shown. He falls off the bicycle and then he
   is hurt; his sneeze knocks the utensils down and then she picks them up.

   ONLY ONE OF THE TWO IS SKIPPED HERE ANY MORE, and the ring is unchanged by
   that. `hurt` left the GAME when every seam was made to carry exactly one frame
   (see the windowing note over ROUNDS), so it is no longer in storyCards() for
   this list to filter out; what is left to drop is `pickup`, which the same
   re-windowing moved from story 11 to story 10 - index 9. The same ten pictures
   light in the same ten places. The child has still placed every picture in the
   game; this screen shows ten of the eleven.

   STORY INDICES, NOT IDS, and they are indices into storyCards() - so they move
   whenever the story does, which is exactly what just happened to this one.
   `sneeze` is two different cards from two different rounds, so a skip list of
   ids on this data is a trap for whoever edits it next, even though the two
   names here happen to be unique. */
const RING_SKIP = [9];

/* THE RING IS THE REFERENCE'S, MEASURED OFF IT. Its ten outer card rects were
   found by detecting the frame ring - cream at 252,236,218 against wood at
   247,208,178, so lum > 228 and sat < 0.20 - and filling it:

       #    x0    y0     w     h      cx%      cy%    where
       1   130   192   262   200   17.003   28.516   top, 1st
       2   477   194   265   203   39.707   28.857   top, 2nd
       3   851   194   245   204   63.420   28.906   top, 3rd
       4  1197   228   251   204   86.156   32.227   top, 4th
       5   148   460   233   190   17.231   54.199   the left
       6  1153   497   268   189   83.844   57.764   the right
       7   159   712   239   194   18.143   79.004   bottom, 1st
       8   486   778   247   198   39.707   85.645   bottom, 2nd
       9   819   778   237   196   61.075   85.547   bottom, 3rd
      10  1170   741   236   190   83.909   81.641   bottom, 4th

   CARD WIDTH IS ITS OWN FRACTION OF THE CANVAS, 16.176%, reproduced exactly.
   Height cannot be: its cards are squarer, a mean aspect of 1.262 against the game
   artwork's fixed 394/272 = 1.449, so they come out 34px shorter than it draws
   them. Width is the one worth matching - it is what sets how a row reads - and
   that difference is the artwork rather than the layout.

   ONE SCALE, 1.2508, ON BOTH AXES, and it took the banner leaving to get there.
   The banner is 238.7px and eats 22.1% of the stage's height where the reference's
   eats 15.6% of its canvas, so the layout used to be squeezed into what was left:
   1.2508 across and 1.0387 down, two scales, which is why nothing could match on
   both axes at once. With the banner exiting upward the whole 1080 is free - the
   reference's layout is 784px tall and 784 * 1.2508 = 980.6 - so the composition
   maps at its own proportions, centred vertically at y 49.7..1030.3.

   ALL TEN ARE EXACTLY WHERE THE REFERENCE PUTS THEM. Zero drift. It went 322px,
   then 109, then 0, and each step removed a reason rather than tuning a number:

     322  the boy in the middle was the finale's SNAP pose - 323px wide, sandals on
          the floor at y=1039 splaying to 310px - and the reference's bottom row
          goes straight through that. Replaced by the reference's own boy
          (assets/images/aaru-namaste.png, tools/cut-namaste.py).
     109  the clash test used his bounding BOX. His hair is the widest thing about
          him and it is 390px above his sandals, so where a top-row card's bottom
          edge grazed his box he was 1.8px of hair - and it was shoved 44px
          sideways for it. Changed to his drawn silhouette, row by row.
       0  the last four moves were a constraint I had invented: the two side cards
          were being pushed below y 539 so a frame riding past could not "clip"
          them. But .post-line is z-index 63 and .post-ring is 64 - a riding hanger
          passes BEHIND a card that has landed, so the card is never covered. The
          check was reading a geometric overlap as an occlusion, and it cost 149px
          on the left-hand card by itself.

   See scratchpad/ref-final.py, which maps and then re-checks every slot against
   the stage edges, his drawn silhouette and the other nine.

   THE ORDER ROUND THE LOOP IS THE GAME'S STORY ORDER, and that is a deliberate
   departure from the reference on five of the ten. Its badges read 1, 2, 2, 3, 4,
   6, 7, 8, 9, 10 clockwise - two 2s and no 5 - and they place the juice cart, the
   dog and coming home BEFORE the bicycle, where the game's rounds have the
   bicycle as round 2 and the juice as round 3. This screen is a recap of the
   sequence the child was just asked to get right, so it follows the game. If the
   reference's order is the wanted one, this table is the whole edit. */
const RING_H     = 212.3;
const RING_W     = 310.6;      // the widest of the ten, 398 * RING_SCALE
const RING_SCALE = 0.78034;    // = RING_W / 398, the reference's 16.176%
const RING = [
  { x:   326.5, y: 174.8 },   /* 1  house    top, 1st     */
  { x:   762.4, y: 179.1 },   /* 2  sneeze   top, 2nd     */
  { x:  1217.7, y: 179.8 },   /* 3  pot      top, 3rd     */
  { x:  1654.2, y: 222.3 },   /* 4  ride     top, 4th     */
  { x:  1609.8, y: 549.4 },   /* 5  fall     the right    */
  { x:  1611.0, y: 855.2 },   /* 6  cart     bottom, 4th  */
  { x:  1172.6, y: 905.2 },   /* 7  dog      bottom, 3rd  */
  { x:   762.4, y: 906.5 },   /* 8  home     bottom, 2nd  */
  { x:   348.4, y: 821.4 },   /* 9  sneeze   bottom, 1st  */
  { x:   330.8, y: 503.7 },   /* 10 earring  the left     */
];

/* LAST SCENE FIRST, as asked: 10 lands, then 9, down to 1 - so the loop closes on
   the beginning of the story, which is the frame that arrives last.

   This is no longer the collision-free order the twelve had. That one filled by
   descending x, which made "no frame ever passes a frame already down" a property
   of the order. This order is fixed by the request and has exactly one crossing
   in it: slot 10 is the left side and slot 9 the bottom left, so 9 descends past
   10, which is already there. It goes BEHIND, bowing inwards. See flyBow(), and
   the harness measures the overlap rather than assuming it is small. */
const RING_ORDER = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

/* THE RIDE.

   A traveller is a clone of the bay template's FIRST hanger - the wooden frame,
   the picture in its well, and the peg clipped over the top - resting where slot
   0 rests and moved by a transform, exactly as rideBay() moves the three hangers
   of a real bay. That is what "the same path and behaviour" has to mean: not a
   similar-looking slide, the same element and the same formula. The direction is
   the only thing mirrored.

   THE SPEED IS THE LINE'S OWN, derived rather than picked: one stage width in
   HAUL_MS. Every frame travels at it, so they do not each arrive at a different
   pace; what differs is how far each has to come, which is what a line being
   pulled actually does.

   ONE AT A TIME IS TOO SLOW - the ten have 12400px to cover between them, which
   is eleven seconds at line speed - and ALL TEN AT ONCE HAS NO ANSWER. With
   equal-length rides the gaps between consecutive targets run from -520 to +910,
   and |gap - spacing| >= a frame width has no solution: +910 needs spacing <= 390
   or >= 1430, +326 needs >= 846. So the next one sets off when the one in front
   has covered LAUNCH_PX.

   LAUNCH_PX IS 845 AND WAS 700, and the 700 was arithmetic done on paper with the
   easing left out. The worst moment for two frames on the line is a leader
   FINISHING - easeHaul decelerating to nothing - while its follower is at the
   curve's peak speed. Solved properly, with both on the longest ride:

       LAUNCH_PX   interval   gap there   air vs the 469px frame
             700      620ms       336px        -134   they overlap
             820      726ms       540px          71
             845      748ms       ~578px       ~110
             900      797ms       714px         244

   845 puts about 110px of air between two frames, which is what the gameplay line
   itself shows: its three hang 584px apart on a 469px frame, so 115px. The
   arrival order still holds - it holds whenever a leader's target is at most
   LAUNCH_PX ahead of its follower's, and the largest such step here is 520.7. */
/* WHERE A CARRIER IS ANCHORED, and it is the PEG rather than the picture.

   The hanger is scaled to RING_SCALE so its picture arrives at the size of the
   ring it is joining - see .pcarrier in styles.css for why, and for what the
   unscaled version looked like next to a laid-out card. Scaling about the
   picture's centre would have dragged the peg 50px below the rope and left it
   floating in the air; about the point where the peg meets the line, the peg
   stays clipped to the line and the picture hangs closer under it.

   PEG_GRIP is that point: x is the frame's own centre, y is ropeY(375.903), the
   height of the line where a resting frame hangs. RIDE_MID follows from it - the
   height the picture's centre ends up at once the scale is applied - and it is
   38.6px higher than the 455.234 it hung at unscaled, which is what lets the side
   cards sit close to where the reference puts them. */
const HANGER_X    = 375.903;                 // SLOT_CENTER[0].x, a clone's rest
const PEG_GRIP_Y  = 279.4;                   // = ropeY(HANGER_X)
const RIDE_MID    = PEG_GRIP_Y + (455.234 - PEG_GRIP_Y) * RING_SCALE;
const ENTER_CX    = -280;                    // card centre, frame clear of the edge
const RIDE_PX_MS  = HAUL_TRAVEL / HAUL_MS;   // the clothesline's own speed
const LAUNCH_PX   = 845;
const MAGIC_MS    = 620;   // his snap, before the first frame is on screen
const FLY_MS      = 620;   // out of the frame and down into its slot
const FLY_BOW     = 96;    // how far that fall bows towards the middle
const FRAME_GO_MS = 460;   // the emptied frame and its peg, fading

/* WHEN THE BANNER LEAVES, measured from the start of the formation, and it is
   bracketed at both ends rather than chosen.

   NOT EARLIER, because the sentence in it is the only words on this screen and a
   seven-year-old is reading Hindi. typePrompt starts writing it out the moment he
   lands, so by the time this fires it has been complete for roughly four seconds.

   NOT LATER, because the top row of the ring lands at y 69..281 and the banner
   occupies 3..239 - the first of those four arrives at about 7.4s into the
   formation, and the exit takes 620ms. 1800 + 620 is gone well before it. */
const BANNER_GO_AT = 1800;

/* WHEN HE LIFTS, measured from the start of the formation.

   180 rather than 0 so the burst has had its peak - pflash-pop is at full at about
   110ms - and the lift then reads as something the snap caused rather than as
   something happening beside it.

   It runs for --lift-ms (1100ms in styles.css), so it is finished at 1280 and the
   first picture settles at about 1645. He is in place before anything arrives. */
const LIFT_AT = 180;

/* THERE WAS A liftMs() HERE, reading --lift-ms out of the stylesheet so the hop
   could start the moment the lift finished. It has no caller any more: the hop and
   the clap wait for the END of Screen 1 - the tenth closeup back in its slot - not
   for the lift, so nothing in app.js needs to know how long the lift takes.
   --lift-ms is read only by the stylesheet now. */

/* THE CLAP LOOP, in seconds of the clip. correct_ans.webm is 36 frames at 7.5fps
   and only its middle is the clap: it opens with him leaning in from the left edge
   and closes with him leaning back out, and his measured centre drifts from 160 to
   226 over those. Frames 8..28 are where he stands squarely, and over them his
   centre wanders 5.8px on screen.

   2.80s a cycle, against the three seconds asked for - and it is his own drawn
   rhythm rather than a number, so it stays. */
/* THE CLIP IS TRIMMED TO THE CLAP, so these are its whole length now.

   It used to be correct_ans.webm, all 36 frames, held inside 0.933..3.733 by this
   loop - and that is what the user kept seeing as him going to the right. The
   frames outside that window are him leaning in from and back out to the edge, and
   measured against the clap's own centre of mass they sit +6.3, +12.4, +15.1,
   +19.8, +21.2, +18.6, +17.2 and +16.5 px - EVERY ONE OF THEM TO THE RIGHT. Show
   any one of them for a single refresh and he jumps right. And CLAP_SWAY returns 0
   outside the range, so he would be uncorrected at the same time.

   A reset loop can only ever catch that after the fact: rAF fires at 60Hz and the
   video advances every 133ms, so it is usually caught - "sometimes going in the
   right side" is what usually-caught looks like. Seeking is not instant either.

   So the frames are GONE from the file. assets/video/aaru-clap.webm is frames 8..28
   re-encoded at 7.5fps with alpha (52.8% of it clear, checked by decoding it back),
   and the element carries `loop`, so the browser wraps it with nothing to wrap
   past. There is no window to fall out of any more. */
const CLAP_IN  = 0.0;

/* CLAP_OUT, CLAP_FPS AND CLAP_F0 ARE GONE with the frame loop that used them. The
   clip's length is the clap's length now and the browser wraps it, so nothing in
   here needs to know its rate or where its window starts. Anything referring to
   them is the bug. CLAP_IN survives because two places park the video at its first
   frame - the hand-over and formStop - and 0.0 says that in the clip's own terms
   rather than as a bare zero. */

/* THE STABILISER IS GONE, AND IT WAS MAKING THE DRIFT WORSE.

   There was a CLAP_SWAY table here - one correction per frame, applied as a
   translateX in a frame loop, chosen to minimise the worst of his head, body and
   feet deviations. Measured on the SOURCE frames it took the worst from 10.1px to
   2.8px, and stepped frame by frame in the browser it held his centre of mass to
   1.7px. Both of those measurements were real and both were of the wrong thing.

   MEASURED WITH THE VIDEO ACTUALLY PLAYING, screenshots diffed against a plate
   with him hidden:

       without the stabiliser   centre of mass sways 5.2px
       with it                                       7.6px

   It made it WORSE, and the reason is that currentTime does not tell you which
   frame is composited. The loop reads a time, computes a frame index and applies
   that frame's correction - but the pipeline is showing a different frame by then,
   so a correction meant for one lean lands on another. A mis-timed correction adds
   sway rather than removing it, up to double.

   WHAT IT DID NOT DO IS PUSH HIM RIGHT, and the first version of this note implied
   it did. The table's 21 entries summed to 0.030 - it was ZERO-MEAN, spanning -2.24
   to +3.35 - and a zero-mean correction cannot produce net displacement in either
   direction. It added 5.6px of peak-to-peak JITTER and nothing else. The rightward
   movement the user kept reporting was entirely the out-of-window frames, which are
   +6 to +21px right without exception. Two separate defects sitting in one place,
   and merging them is how the smaller one survived three rounds of tuning.

   Stepping currentTime by hand hid this completely: seek, wait, screenshot, and the
   time and the pixels agree. They only disagree while it plays, which is the only
   state that ships.

   WHAT IS LEFT is 5.2px of his own lean, which is the drawing and not a fault. What
   the user was actually seeing is fixed elsewhere: the clip is trimmed so the
   +6..+21px lean-in and lean-out frames are not in the file at all. See CLAP_IN. */

/* =============================================================================
   SCREEN 1 - "STORY COMES ALIVE", and SCREEN 2 - "CELEBRATION"

   The gameplay sheet's two post-game screens, which run once the ring is built.
   ========================================================================== */

/* WHERE THE CELEBRATION BURSTS FROM, and by then he IS the clip. #postAaru is
   drawn at left 871.8, top 346.7, 172.7 x 433.4 (styles.css), and the clip has him
   with his hands together in front of his chest - so this is a little right of his
   centre and a little above his middle, which is where they meet.

   NOT THE SECOND SNAP ANY MORE. It used to be both, from back when the clip took
   the middle the moment the tenth picture landed and the snap therefore had to
   come off a clapping boy. He holds the SNAP POSE through the whole recap now and
   only claps at the end of it, so the two beats happen on two different drawings
   and need two different hands. See SNAP2_HAND. */
const SNAP2_AT = { x: 986, y: 545 };

/* HIS SNAPPING FINGERS, IN THE MIDDLE OF THE RING - where the second snap's light
   appears and where the magic trail sets off from.

   DERIVED, NOT MEASURED AGAIN. (846, 731) is the floor-standing snap pose's hand,
   read off a grid drawn over aaru-snap.png (see .pflash in styles.css), and
   snap-lift carries that whole sprite into the middle with
   `translate(22.4px, -268.3px) scale(0.88903)` about 42.02% 98.79% of its box.
   #finaleSnap is left 802, top 602, 323 wide, and the art is 421x584, so it draws
   448.06 tall and that origin lands at (937.72, 1044.63) - his feet-centre, which
   is the same pair the styles.css note quotes as (937.7, 1044.7).

   Putting the hand through that transform:
     x = 937.72 + (846  - 937.72)  * 0.88903 + 22.4  = 878.6
     y = 1044.63 + (731 - 1044.63) * 0.88903 - 268.3 = 497.5

   IF snap-lift's translate OR scale CHANGES, THESE TWO NUMBERS CHANGE WITH IT.
   That is the price of the pose making the journey itself, and it is cheaper than
   the alternative: reading a transformed point out of the DOM mid-animation gives
   whatever frame the compositor happens to be on. */
const SNAP2_HAND = { x: 878.6, y: 497.5 };

/* THE THREE ELEMENTS THAT CAN BE THE BOY IN THE MIDDLE, in the order he wears
   them: the snap pose he carries in and holds through the recap, then the clapping
   clip - or the still, where the clip's alpha cannot be played.

   ONE LIST BECAUSE THE CALLERS DO NOT CARE WHICH IS ON. A closeup hides "him" and
   restores "him"; formStop puts "him" back. Each of those was written out as
   ['postAaru', 'postAaruStill'] when the clip took the middle the moment the tenth
   picture landed, and adding the snap pose to two of the three copies and not the
   third is the failure this file has already recorded under HIS_BOX. */
const MIDDLE_OF_RING = ['finaleSnap', 'postAaru', 'postAaruStill'];

/* HOW LONG THE SPARKLE HOLDS ON EACH PICTURE. Not a taste - a floor set by the
   sound. Four of the ten cards carry a cue and three of those four are adjacent
   (ride, fall, cart), and any two cues within about 250ms read as one event to the
   ear and to the limiter. At the pace the footpath used to sweep itself in - 1400ms
   over ten slots, 140ms a card - ting, thud and splash would fuse into one smear,
   which is the scale of gap this has to beat.

   AND IT IS A FLOOR IN THE OTHER DIRECTION TOO. "Very short yet slow enough to
   see" is the ask, which is a real constraint at both ends: the sheet wants a quick
   recap rather than a replay, but 360ms of a boy falling is a flicker rather than a
   fall. 780 with motions of 620-760ms reads as a movement and still leaves the
   whole of Screen 1 at about thirteen seconds for ten pictures. It was 520, which
   was inside the sound's floor but under the eye's. */
const RECAP_CARD_MS = 780;

/* HOW LONG A POPPED PICTURE TAKES TO GO BACK, and it is pcard-pop-back's own
   duration in styles.css rather than a number chosen here. Two places need it -
   wakeCard, to know when the ring can un-dim, and the end of the sparkle, to know
   when the LAST picture is actually home - and it was written out as a bare 560 in
   the first of those. Anything that disagrees with the stylesheet is the bug. */
const RECAP_SHUT_MS = 560;

/* THE BEAT OF NOTHING BETWEEN ONE PICTURE AND THE NEXT. The user's note on the
   recap was that it runs together - "a scene is played then goes back then
   footsteps then next scene, its just too fast right now" - and two things were
   wrong with the pacing, of which this is the second. The first was that the
   trail set off while the picture was still travelling home (see the gap in
   recapSparkle's step). This is the pause AFTER it gets home, before the light
   moves: the same shape as ENDING_GAP_MS on the finale, and for the same reason.
   Two things that are about each other still need air between them. */
const RECAP_BEAT_MS = 380;

/* HOW FAR THE BOY'S VOICE IS LIFTED. One recording carries every child sound in
   this game - boy-voice.mp3, a real young boy - and the cues cut from it measure
   250 to 408 Hz. The high ones read as a child; the sigh at 250 does not, and
   the user has now said so twice. This is the multiplier that moves it, applied
   per cue rather than globally because only the sigh needs it: 1.32 is four
   semitones, 250 Hz -> 330 Hz.

   IT IS A RECORDING PITCHED, NOT A VOICE SYNTHESISED, and that distinction is
   the one rule this sound set has. What it cannot fix is ACCENT: there is no
   Indian child in any CC0 library reachable from here, and no wordless Indian
   woman either. If those are wanted, they have to be recorded. */
const KID_LIFT = 1.32;

/* THE RING'S OWN PHRASE, one note per picture as it drops into its slot.

   A CUE IS ONE FILE, so ten different notes cannot be ten cues without ten
   renders - these are playback rates against the one `placed` cue, which is
   rendered from the music box's ab5. The ratios are the Ab major degrees, so
   what they spell is the game's own scale rather than a chromatic slide:

     ab5  bb5  c6   db6   eb6  f6   g6   ab6   ...then home
     1.0  1.122 1.260 1.335 1.498 1.682 1.888 2.000

   AND IT LANDS RATHER THAN STOPPING. Eight degrees reach the octave on picture
   eight; nine and ten come back down to the fifth and the tonic, so the last
   picture of the story closes the phrase instead of leaving it hanging a note
   above where it started. Nothing goes above 2.0: a music box at twice speed is
   bright and short, and at three times it is a whistle. */
const PLACED_RATES = [1.000, 1.122, 1.260, 1.335, 1.498,
                      1.682, 1.888, 2.000, 1.498, 1.000];

/* ...AND THEN HE CLAPS. The user's order, in their own words: "after all scenes
   comes to center and goes back, aaru clapping animation will happen". AFTER it
   goes back - so the celebration cannot start on the beat the tenth picture is
   woken, which is what it used to do: recapSparkle's loop checked "are we past the
   last leg" BEFORE it checked its own hold, so Screen 2 fired one frame after the
   tenth closeup began and he was applauding over a card still out in the middle of
   the stage.

   420ms past the last picture landing back in its slot, and that number is bounded
   below by something real: HE HAS TO FINISH COMING BACK FIRST. A closeup hides him
   and the restore fades him in over 260ms (see #finaleSnap.is-on.is-lifting's
   transition), so at 260 the pose change landed on a boy still fading up - measured
   at opacity 0.93 on the frame .is-gone went on, which is a boy appearing and being
   replaced in the same breath. 420 gives him the fade plus 160ms of standing there,
   so the ring is read as whole, he is read as back, and only then does he clap. */
const RECAP_CLAP_AT = 420;

/* ...AND THE JUMP WAITS FOR THE HAND-OVER TO FINISH. aaru-live is 90ms; 180 is
   that plus the same again, so the clip is fully his before it leaves the ground.
   Both animations are on the same element and the later class wins outright, so
   overlapping them does not blend - it cancels the fade. */
const CLAP_HANDOVER_MS = 180;

/* ...and how long the sparkle takes to fly from one picture to the next. The runs
   are 300 to 460px of chord, so this is a speed rather than a duration: the whole
   trip is scaled by each run's own arc length so the sparkle does not sprint the
   short runs and crawl the long ones.

   AND IT USED TO BE TOO FAST TO WALK. The legs came out at 266-408ms, which is
   the whole reason the footsteps could not be slowed down: a child's step is
   about 300ms and TWO of them do not fit inside a third of a second, so raising
   STEP_GAP_MS did not slow the walk, it deleted the second step - and when it
   did fit, the second step landed 0-90ms from the picture's own cue, measured on
   all nine legs. Two cues on one beat read as one defect.

   THE FACTOR BELOW IS THE FIX AND IT IS ALSO WHAT WAS ASKED FOR TWICE. "there
   should be a healty screen time in here when magical trail is going": that was
   answered once with RECAP_BEAT_MS, a PAUSE after each picture, which is not the
   same thing as the trail itself having room. This is the trail itself. Legs are
   557-853ms now, so a 300ms walk fits inside one with 160ms to spare before the
   picture speaks.

   IT COSTS ABOUT 2.7s ACROSS THE NINE LEGS, which is the direction the recap has
   been asked to move in both times it has been mentioned. */
const RECAP_PX_MS = 0.62;

/* THE HOP FROM HIS HAND TO THE FIRST PICTURE, which is the beat the user asked
   for in their own words: "a magic trail will appear and go to the 1st scene". It
   is not one of the nine footpath runs - it crosses the middle of the ring, where
   there are deliberately no footprints - so it gets its own duration. */
const RECAP_LEAD_MS = 720;

/* ...AND THE BEAT BEFORE IT, which is the whole of the user's ask: "only after
   aaru again snap his finger that the magic trail will appear from his hands and
   go to the 1st scene". ONLY AFTER. The snap and the trail used to be the same
   frame - magicSnap() fired and the head set off in the same tick - and two things
   on one frame read as one thing, so the flash was part of the trail rather than
   the cause of it. There was no "after" on the screen at all.

   620 IS NOT A NEW NUMBER. It is MAGIC_MS, the gap his FIRST snap already gets
   before the first frame is on the clothesline, so both snaps now have the same
   distance between the gesture and what it does. It also clears the burst itself:
   pflash-pop runs 540ms and the outermost spark is away at 640 (styles.css), so
   the light appears at his hand as the snap's own light is leaving it.

   THEN IT SITS THERE, for RECAP_HAND_MS, before it travels - because "appear from
   his hands" and "go to the 1st scene" are two beats and the user named them in
   that order. Appearing and moving off on one frame gives a light that was always
   flying; a fifth of a second of it pulsing at his hand is what makes it come OUT
   of his hand. Neither of these is on any other path: the reduced-motion branch in
   postFormation() returns before recapSparkle() is ever reached. */
const RECAP_SNAP_MS = 620;   // his snap -> the light appears at his hand
const RECAP_HAND_MS = 200;   // it holds there -> it sets off for picture one

/* HOW FAR APART THE FOOTFALLS ARE LAID, and it is the constant this whole cue
   has been re-tuned around three times, so its history is below and all of it
   still applies. It used to be the interval a CLOCK paid taps out at; it is now
   the mean gap the user's own walk is RE-SPACED to inside the cue - see
   VOICES.footsteps, which stretches their rhythm rather than replacing it with
   an even one.

   0.280, AND WHAT SETS IT IS THE SHORTEST LEG. The clock's 300ms was right and
   this is 7% off it, for a reason that is arithmetic rather than taste. leg.ms is
   max(420, chord * 1.855) and the nine come out 557-853ms, of which the walk gets
   all but STEP_CLEAR_MS: 357-653ms. The run's first footfall lands 15ms into the
   rendered file and a cut sits 55ms past an attack (WALK_CUTS), so the cut after
   the Nth footfall is at 15 + (the gaps so far) + 55. WALK_GAPS is uneven, so the
   two cuts move together but not equally:

       mean gap   260    280    300
       2nd cut    320    339    358     (357 available on the shortest leg)
       3rd cut    590    630    670     (653 available on the longest)

   At 300 the shortest leg misses its second footfall by a millisecond, and one
   footfall a leg is the "tick per picture" this cue was rejected for once. So the
   ceiling is 280, and it is taken rather than backed off to 260 because the leg
   lengths are not a distribution to leave margin against: the ring's positions
   are fixed and leg.ms is a function of the chord, so 557ms is the shortest leg
   this game HAS. That is why 18ms of margin is enough - it is verified rather
   than estimated. `node tools/sim.js form` plays all nine legs and reports the
   cut each one took: two footfalls on eight of them and three on the second,
   which is the longest.

   0.280 is 3.6 footfalls a second, where their recording is 5.4 and the clock
   version was 3.3.

   WHAT IS BELOW IS THE CLOCK'S OWN NOTE, kept because every measurement in it is
   still the reason for the number. */

/* THE SHORTEST GAP BETWEEN TWO FOOTSTEPS, and it exists because one tap per
   footprint is not one tap per footprint.

   revealRun() releases a run's marks by TRAVEL - mark j appears once the head is
   (j+0.5)/n of the way along - so a fast leg hands over several of them inside a
   couple of frames. Measured off `node tools/sim.js form` with the taps wired
   straight to it: seven in 250ms on the longest leg, gaps of 30 to 50ms, which
   is not a child walking, it is a rattle. The prints still all appear; what this
   thins is the SOUND.

   190ms allowed about five steps a second, which is an excited seven-year-old
   RUNNING - and that is what the user heard: "make it a little slow", sent in
   the same message as the recording the cue is now cut from.

   IT WAS 190 AND THE RECORDING'S OWN CADENCE IS 193. Their file walks its six
   footfalls at gaps of 175/200/190/175/215ms, mean 193, so the game was firing
   at almost exactly the tempo of the take - and the take is a run. That is why
   the cue and the gap were one message: nothing about the sample was going to
   fix the pace, because the pace was not coming from the sample.

   AND RAISING IT TO 270 DID NOT SLOW THE WALK DOWN, IT DELETED IT. That was the
   first attempt at this message and the recap was measured afterwards: 270 left
   exactly ONE tap on every leg, nine in the whole recap, four seconds apart.
   A tick per picture.

   THE REASON IS THAT A LEG IS 200ms LONG. Every one of the nine releases its
   2-7 prints inside a span of 185-269ms - measured in the page, by polling for
   prints losing .is-held - so past about 230ms the old rule ("fire on a release
   unless one fired inside STEP_GAP_MS") could only ever keep the first print of
   each leg:

       gap    150  170  190  210  230  250  270  300
       taps    18   18   16   15   14   12    9    9

   SO THE RULE CHANGED AND THIS NUMBER NOW MEANS WHAT IT SAYS. A released print
   adds to a debt of footsteps and this is the interval the debt is paid out at,
   so the taps are evenly spaced at 300ms whatever the prints do, and the last
   one or two of a leg land after its prints have all appeared. See the block in
   recapSparkle that reads it.

   300ms IS ABOUT 3.3 STEPS A SECOND. "make it a little slow", against a source
   recording whose own six footfalls average 193ms apart - so what the child
   hears is that walk at about two-thirds speed, which is a walk rather than the
   run it was recorded as. Under about 150 they fuse into one noise; the old
   worry about going over 300 was that the taps would stop belonging to the marks
   going past, and that is now true by design rather than by accident.

   IT COMES TO 17 TAPS, measured in the page - one to three a leg, and the pace
   inside a leg is 288-319ms rather than whatever the prints happened to do.
   Fewer than the 39 prints, and the prints all still appear: revealRun releases
   them by TRAVEL and none of this touches that.

   AND IT ONLY WORKS BECAUSE THE LEGS GOT LONGER IN THE SAME PASS. At the old
   266-408ms a leg could not hold two steps at this pace - see RECAP_PX_MS, which
   is where the other half of "make it a little slow" ended up. */
const WALK_STEP_S = 0.280;

/* WHICH OF THEIR FOOTFALLS THE CUE USES, in seconds into clean/usersteps.wav.
   Their walk has seven; these are the three that are WARM, and the choice is a
   measurement rather than a preference. Profiled at <300 / 300-800 / 800-2k /
   2-5k / >5k after the cutter's 300Hz high-pass, with the spectral centroid and
   the peak in dB under the file's loudest sample:

       onset   <300 -800  -2k 2-5k  >5k  centroid   peak
       0.060      3   72   17    5    3     1002Hz   -2.1   <- used
       0.245      3   32   11   12   42     4651Hz    0.0
       0.445      3   13   24   25   35     4018Hz   -2.6
       0.635      4   67    7   13   10     1655Hz   -3.8   <- used
       0.810      1   18   17   18   47     4903Hz   -6.8
       1.025      9   36   19   29    7     1864Hz   -3.3   <- used
       1.170      4   26   25   25   21     3088Hz  -16.8

   THREE OF THE SEVEN ARE BRIGHTER THAN THE CUT THIS USER CALLED HARSH, which is
   the trap in being handed a file. 0.245, 0.445 and 0.810 carry 35-47% of their
   energy above 5kHz at a 4-5kHz centroid, where book-steps 1.720 - rejected as
   "still very harsh" - was 17% above 5kHz at 1948Hz. The file contains the fault
   as well as the fix, so taking the first three footfalls in it, or the loudest,
   which is 0.245, would ship attempt three again under a new name. The same
   warning is in PROVENANCE.json under user-steps, written from the same numbers
   by whoever cut the retired pair.

   WHAT NONE OF THEM IS, IS HEAVY: 1-9% below 300Hz on all seven, against 77% on
   the version the user called "very heavy". That fault is gone whichever window
   is taken.

   AND THE THREE ARE WITHIN 1.7 dB OF EACH OTHER at the peak, which matters
   because a pair 7.6 dB apart reads as a limp - see the retired foot1/foot2 note
   in tools/cut-sfx-assets.py. They play from ONE buffer at one gain, so what is
   left between them is their own difference and nothing else.

   THEY NO LONGER PLAY AT ONE SPEED, THOUGH. See WALK_RATES: each is resampled up
   so the foot reads as a child's rather than an adult's, and the three need
   different amounts because their raw centroids are 1018, 1655 and 1864Hz. The
   gain is still one gain and the buffer is still one buffer.

   AND 0.245 IS STILL NOT USED, even though the tilt on the cut now tames it:
   with the shelf it measures 1/21/57/12/10 at rate 1.60, which scores BETTER on
   mass than 1.025 does, and it is left alone anyway. It is the footfall the
   paragraph above warns about by name, the numbers that warning rests on are the
   dry ones, and overriding a written warning on the strength of a filter added
   afterwards is how a fourth "harsh" would arrive. If 1.025 is ever the thing
   that is too heavy, this is where to look first - with the audition open. */
const WALK_FALLS = [0.060, 0.635, 1.025];

/* HOW FAR APART THEY GO, before scaling: their own first two gaps, 185 and
   200ms, which is the unevenness of a real walk. The three footfalls above are
   575 and 390ms apart in the recording - they are not consecutive, because
   consecutive would mean the bright ones - so the rhythm comes from the walk's
   own spacing rather than from where these three happen to sit in it.
   VOICES.footsteps scales these so their MEAN comes out at WALK_STEP_S, which
   lands them 269 and 291ms apart: uneven, the way they were recorded, and
   slower, the way it was asked for. An even interval would be the metronome the
   clock version already was. */
const WALK_GAPS = [0.185, 0.200];

/* HOW MANY OF THEM THE CUE HOLDS. Three, and all three are used: at WALK_STEP_S
   the cut after the third is at 630ms and the longest leg has 653ms of usable
   travel. Measured (`node tools/sim.js form`), leg 2 takes the three-footfall cut
   and the other eight take two - so the walk is not the same length on every leg,
   which is the small thing that keeps nine of them from being one sound repeated.
   A fourth would be different: nothing the ring's geometry produces would reach
   it, and a footfall no child ever hears would still drag the cue's measured
   level. */
const WALK_TAKE = 3;

/* ...AND HOW MUCH OF THE BUFFER EACH FOOTFALL IS WORTH. A footfall is 20 dB down
   within 25-45ms, so 150ms takes all of it plus room tone; smp() puts its own
   release on a shortened window, so what ends the slice is a fade over the last
   51ms of that tone rather than a cut. It is deliberately shorter than
   WALK_STEP_S so two slices can never overlap. */
const WALK_SLICE = 0.150;

/* HOW LONG THE WALK TAKES, ON SCREEN, and it is derived rather than chosen so it
   cannot go stale when WALK_STEP_S or WALK_TAKE moves: the last footfall starts
   at (WALK_TAKE - 1) * WALK_STEP_S and runs WALK_SLICE of source, which at its
   own rate is less than that. Rounded up to the slice for margin.

   IT IS A BEAT OF ITS OWN NOW. The user: "we can also show footstep animation
   and sfx after the magical stars reaches from frame 1 to 2 and so on, give
   healthy screen time". So the prints and the sound no longer happen DURING the
   light's journey - the light arrives, then the path it just took is walked, then
   the picture comes alive. See the arrival branch in recapSparkle. */
const RECAP_WALK_MS = (WALK_STEP_S * (WALK_TAKE - 1) + WALK_SLICE) * 1000;

/* HOW FAR THE WALK IS ALLOWED TO SIT OFF CENTRE, as a fraction of the pan the
   leg's own position asks for - and it is 0.40 because of a gain nothing in this
   repo was accounting for.

   EVERY CUE .wav IS DUAL-MONO. L and R measure a correlation of 1.0000 and a
   side/mid of 0.000 on footsteps, sneeze, crash and thud alike, because the
   bench renders one channel and writes it twice. And for a STEREO input,
   StereoPanner does not pan, it SUMS: one channel is folded into the other, so
   the output gain is 20*log10(1 + sin(pan * pi/2)) - up to +6 dB at hard pan,
   and +4.36 dB at the 0.455 this cue was reaching on leg 4.

   THE BENCH LEVELS THE CUE UNPANNED, so it never saw a decibel of that. Measured
   through a replica of the real chain, footsteps arrived at the compressor at
   +5.17 dBFS on its worst leg and left it at +1.81, putting 68 samples over full
   scale in one recap on 7 of its 9 fires - against 12 clipped samples for the
   whole rest of the recap put together. The limiter cannot catch it either: the
   footfall rises in 3.8-4.8ms and the compressor's attack is 4ms, so it removes
   1.7-3.6 dB where it takes 9.2 off `pop`.

   0.40 KEEPS THE MOVEMENT AND DROPS THE GAIN. The walk still sits where the leg
   is - the path audibly crosses the board - but the worst pan becomes 0.18, which
   is +2.16 dB instead of +4.36. With `off` at -12.0 the same worst leg lands
   about -1.0 dBFS at the compressor instead of +5.17.

   IT IS SCOPED TO THIS CUE ON PURPOSE. The panner gain is real for every panned
   cue, but footsteps is the one it breaks: it has the third-highest crest in the
   set (22.0 dB), so it is the one whose peaks were already at the ceiling before
   the panner added to them. Fixing it globally means re-levelling the set. */
const WALK_PAN = 0.40;

/* HOW FAST EACH FOOTFALL IS PLAYED BACK, and this is the whole of "not a child
   footstep". The user, on the cue as it stood: "the footsteps sounds is still to
   heavy and make the sound of an adult footstep not a child footstep".

   AN ADULT FOOTSTEP IS MASS IN 300-800Hz. Measured on this recording's own
   footfalls, the warmest is 74% in that band against 15% in the 800-2000Hz PAT
   band, and a small foot is the other way round: a light tap, not a soft thump.
   No level reaches that and no window in the file avoids it - all six footfalls
   are either mass-heavy or (the other three) 35-47% above 5kHz.

   SO THE FOOT IS MADE SMALLER, WHICH IS WHAT RESAMPLING UP ACTUALLY MEANS. Scale
   a body down and every resonance in it goes up and every decay gets shorter, in
   the same ratio; a 7-year-old is about three quarters the height of an adult, so
   1.33 is the physically honest figure and these sit just past it. With the
   3kHz/-14dB tilt on the cut (see cut-sfx-assets.py) footfall one goes from
   3/74/15/5/3 at 1018Hz to 0/5/90/4/1 at 1182Hz, and 150ms becomes 86ms.

   THREE DIFFERENT RATES BECAUSE THE THREE FOOTFALLS ARE NOT ALIKE - their
   centroids are 1018, 1580 and 1926Hz raw, so one rate would fix the first and
   make the third shrill. These bring all three into 1180-1700Hz. Chosen by grid
   search over rate x shelf for every footfall in the file, scored as
   (pat) - (mass) - (sting).

   AND THE NOTE THIS REPLACES WAS RIGHT ABOUT THE OTHER DIRECTION. It said
   "RE-SPACED AND NOT RESAMPLED. A rate under 1 would slow the walk and drop it
   six semitones, and on a footstep pitch is SURFACE - that is how heavy got into
   this cue twice." True, and it is an argument against rate BELOW one. Above one
   is the same physics pointing the other way: down is a bigger foot, up is a
   smaller one, and a smaller one is what was asked for.

   THE SPACING IS UNTOUCHED. WALK_STEP_S still lays them 269 and 291ms apart, so
   the pace is the one the same user asked for ("make it a little slow") and only
   each footfall's own size has changed. */
const WALK_RATES = [1.75, 1.75, 1.60];

/* WHERE THE RUN CAN BE CUT, in seconds into `footsteps` - one entry per footfall
   in the rendered file, 55ms after its attack. A footfall in the source is 20 dB
   down within 25-45ms, so at 55 its own body is over and what a cut here takes
   away is room: a leg that stops the cue at one of these stops it in a GAP in the
   walk and never half-way through a footfall. WALK_FADE_S lands ON the point
   rather than starting there, so the 20ms in front of it is that same room.

   NOT "WHERE IT IS 20 dB DOWN", which is how these were first measured and is a
   threshold that does not hold still here. The cue is rendered THROUGH the room,
   and a reverb tail sits about 20 dB under the sound that caused it - so the
   level such a rule looks for is the level the room is already sitting at, and
   the crossing wandered between 35ms and 115ms depending on which footfall it was
   asked about. The decay is measured on the DRY sample, where it means something,
   and 55ms is that plus a margin.

   MEASURED OFF THE RENDERED FILE and not off the layout: renderDry starts a
   voice at 0.02s and trimmed() takes the lead back off, so the file's own onsets
   are what these follow - 0.005, 0.275 and 0.565, at gaps of 270 and 290ms, which
   is their own 185/200 stretched by WALK_STEP_S. Re-render the cue and re-measure
   these together.

   THEY MOVED 10ms EARLIER WITH WALK_RATES. The tilt on the cut changed which
   sample is its peak, so trimmed() takes a slightly different lead off the front
   and every onset shifted with it. The 55ms margin is also safer than it was
   rather than tighter: resampling up shortened each footfall's own decay from
   25-45ms to 10-18ms, so a cut here is further past the body than when these
   were first measured. */
const WALK_CUTS = [0.060, 0.330, 0.620];

/* 20ms, AND THE LENGTH IS THE POINT. The fade ends ON a cut point, so it runs
   from 35ms to 55ms after a footfall's attack - by which time that footfall is
   20 dB down and what is being faded is the room behind it. At 40ms it would
   start 15ms after the attack, inside the footfall's own decay, and shorten the
   one part of this recording the cue must not touch. */
const WALK_FADE_S = 0.02;

/** The longest piece of the walk that fits in `ms` of leg, in seconds - 0 if not
    even one footfall does, which is what a leg too short to be walked gets. */
function walkCut(ms) {
  let out = 0;
  for (const c of WALK_CUTS) if (c * 1000 <= ms) out = c;
  return out;
}

/* HOW MANY FOOTSTEPS ONE LEG IS WORTH IS NOT A CONSTANT ANY MORE, and this is
   where STEP_MAX_PER_LEG was. It capped the old tap-debt at three, and what
   actually decided the count was never that number: the leg is 557-853ms long,
   the loop pays nothing out during the hold, and STEP_CLEAR_MS keeps the last
   200ms of the travel empty. The same two constraints decide it now, in one line
   - walkCut(leg's travel left - STEP_CLEAR_MS) - which comes out as three
   footfalls on the long legs and two on the rest.

   THE HOLD IS DELIBERATELY OUT OF BOUNDS. recapSparkle's loop checks holdUntil
   first and returns, and the hold is where the picture comes alive and fires its
   own cue - card 2 at 180ms into the wake, card 10 at 1480 and 2050. A footstep
   paid into the hold would land on top of it. So the walk belongs to the travel
   and the hold belongs to the picture. */

/* AND THE LAST OF THE LEG IS LEFT ALONE, because the picture speaks the moment
   the light arrives. Measured with no guard at all: the final tap of a leg landed
   1ms from `gasp`, 1ms from `splash` and 53ms from `sneeze` - three of nine legs
   putting a footstep underneath the cue the whole picture is for. Two cues on one
   beat read as one defect.

   200ms IS A FOOTFALL'S OWN LENGTH PLUS AS MUCH AGAIN, and it is 200 STILL,
   which is worth saying because the mechanism under it changed and made it
   cheaper. The old rule let a TAP fire at any moment up to 200ms before the
   arrival, and a tap is 100ms of audio with about as much room behind it - so its
   sound was still going as the light landed and the real gap was nearer nought
   than 200. The walk is faded OUT at its cut point (sfx()'s `out`), so this
   number is now what it always claimed to be: 200ms in which the cue is silent,
   completely. It was briefly cut to 140 to buy the shortest leg a second
   footfall, and then not needed - the rendered footfalls decay in 30ms, not the
   105 that was assumed, so 280ms of cadence fits inside 357 anyway. Measure the
   render before spending a collision guard.

   Legs run 557-853ms, so what this actually decides is whether a leg is worth
   three footfalls or two - the short ones get two - rather than silencing
   anything that was audible.

   IT IS CHECKED AGAINST THE LEG'S OWN REMAINING TIME rather than a wall clock,
   so it keeps working if the trail speed moves again. */
const STEP_CLEAR_MS = 200;

/* HOW LONG THE TRAIL'S SHIMMER TAKES TO GO. Used to be the leg's own problem -
   a 1.13s render comfortably rang out inside the 1447ms the tightest leg
   leaves before anything else sounds, so nothing here ever cut it. It is now
   universfield-magic-spell-278824.mp3, a supplied recording 5.9s long with its
   attack and the top of its shimmer in the first ~1.3s and two-plus seconds of
   reverb tail after that - measured with ffmpeg's ebur128, momentary loudness
   peaks at -11.5 LUFS around 1.0s and is past -30 by 2.5s. That tail cannot
   fit ANY leg, so TRAIL_OUT_S/TRAIL_OUT_FOR_S fade it well inside the budget
   every time rather than only on the short legs - see the sfx('trail', ...)
   call, which is the one place that matters; trailOut() below just mirrors it
   for the audition. */
const TRAIL_OUT_S     = 1.00;
const TRAIL_OUT_FOR_S = 0.35;

/* HOW LONG AFTER THE TENTH PICTURE SETTLES HE SNAPS AGAIN. Long enough for the
   ring to be read as finished - that is the beat the whole formation has been
   building to - and short enough that the screen is not waiting. It was 2080,
   which was not a choice: it was however long the footpath took to sweep itself
   in, and the footpath does not sweep itself in any more. */
/* 760 -> 1600. THE MOMENT THE WHOLE STORY IS ON THE SCREEN is the thing the
   8.5-second fly-in exists to produce, and it was 760ms long - with the front of
   it already taken up by the last picture still settling into its slot. The one
   frame in the game where a child can see their entire story at once was over
   before they could look at it. Nothing else reads this constant. */
const RECAP_START_AT = 1600;

/* A STAR EVERY THIS FAR ALONG THE SPARKLE'S PATH. The stars are what make it a
   trail rather than a moving speck; 18px is close enough to read as continuous at
   this speed and far enough that ten legs do not put six hundred nodes on the
   screen at once. */
const RECAP_DOT_PX = 11;

/* THE PALETTE FOR EVERYTHING MAGIC ON THIS SCREEN - the trail's hollow stars and
   the celebration's confetti alike.

   ONE CONSTANT, AND IT HAS TO BE DECLARED BEFORE BOTH. This was two - a
   RECAP_STAR_COLS that read CHEER_COLS from seven lines further down, which is a
   ReferenceError on load and one that `node --check` cannot see, because it is a
   runtime fault in syntactically valid code. Two constants holding the same six
   colours was the real mistake; sharing one is also what keeps the trail and the
   burst reading as the same screen rather than as two hands having drawn them. */
const MAGIC_COLS = ['#ffd24a', '#ff8b4a', '#4ac6ff', '#ff5f8f', '#7ce06a', '#ffffff'];

/* HOW BIG A STAR IS DROPPED, and it varies so a run of them does not read as a
   stamped repeat. Each shrinks over its own life - see .pspk-star - so the trail
   tapers from the head backwards without anything computing the taper. */
/* HALF AGAIN AS BIG AS THEY WERE, which were [24, 19, 15, 21, 17]. The user asked
   to "enhance the magical trail also with more element and glowishesh in it", and the
   three levers are the count, the size and the light. The count came down to
   RECAP_DOT_PX 11 from 18 and the light is in .pspk-star's three drop-shadows; this
   is the size. It is worth saying why it was small: the trail crosses PAINTED WOOD
   with ten framed pictures on it, and a big bright mark over that reads as damage
   rather than as magic - so it was tuned down until it was safe. At 1.4x with the
   coloured glow behind it, it is a light on the board rather than a mark on it. */
const RECAP_STAR_W = [34, 27, 21, 30, 24];

/* AND THE GLITTER BETWEEN THE STARS. The user asked to "enhance the magical trail
   also with more element and glowishesh in it", and a denser run of the SAME star is
   not more elements, it is more of one element - so the trail carries a second thing:
   small round motes that fall away from it and fade, the way glitter comes off a
   sparkler. They are the cheapest possible node - one div, one radial gradient, one
   keyframe - because there are two of them per star and the star drop rate already
   peaks near sixty a second on a fast leg.

   ONE IN TWO STARS DROPS A PAIR, not every star: at every drop the motes outnumber
   the stars four to one and what reads is a fog rather than a trail. `n` here is per
   drop, and the drops are counted so a mote pair falls on alternate stars.

   THEY FALL AND THEY DRIFT, and the drift is per-mote so the pair separates - a pair
   that travels together reads as one bigger mote. RECAP_MOTE_D is how far it goes in
   stage px, RECAP_MOTE_MS how long it takes. */
const RECAP_MOTE_EVERY = 2;
const RECAP_MOTE_N     = 2;
const RECAP_MOTE_W     = [10, 7, 13, 9];
const RECAP_MOTE_D     = [26, 46];
const RECAP_MOTE_MS    = [620, 1080];

/* SCREEN 2. How many stars, how far they go, and how long they take. Spawned
   round SNAP2_AT, because that is where he is.

   34 AND HALF OF THEM RIBBONS was what this said, and the ribbons were standing
   in for confetti. There is real confetti now - simulated paper on a canvas, see
   CONF_PX_M and confettiBurst() - so the ribbons went to it and what is left
   here is only the light. 22 rather than 17, so the sparkle still reads as a
   burst on its own, and rather than 34, so it does not compete with the paper
   arriving a fifth of a second behind it. */
const CHEER_BITS = 22;
const CHEER_MS   = 1150;
const CHEER_D    = [170, 300];      /* nearest and furthest a bit travels */
/* The stars read MAGIC_COLS above; this used to be a second copy of it, and the
   confetti reads the same one, which is what keeps the trail, the sparkle and
   the paper reading as one screen. */

/* WHICH SCENES ACTUALLY ANIMATE, and this list is a parking bay rather than a
   feature.

   The user asked for the per-scene animations to come off and for cards 1 and 2 to
   be rebuilt properly first - "do these 2 scenes perfectly then will do next". So
   every card still travels to the middle of the screen and holds there, and only
   the scenes named here bring anything alive on top of that.

   NOTHING WAS DELETED TO DO IT. Cards 3 to 10 keep their measured `at` points,
   their cut sprites and their motions, because those numbers cost a lot to measure
   and tools/sim.js checks them against assets/images/recap-manifest.json - emptying the
   entries would turn that guard into ten warnings about cuts nobody wired up. Add
   a slot here to bring one back. */
const SCENES_LIVE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/* WHAT COMES ALIVE ON EACH PICTURE, and where.

   ONE ENTRY PER RING SLOT, in story order. `at` is the element's centre as a
   PERCENTAGE of the card's own box - measured off the rendered cards, not guessed
   and not read off the source artwork, because a card shows a hand-placed crop of
   its image and the two do not agree. `fx` names one of the primitives in
   styles.css; `n` is how many particles; `d` how far they travel in stage px; `c`
   their colour; `cue` the sound, if any, and `cueAt` how many MILLISECONDS behind
   the wake it lands.

   `pop` / `closeMs` / `hold` are the travel to the middle of the screen, and every
   card has them. `zoom` and `focus` are GONE: they drove the artwork's own zoom,
   which the user asked to remove, and a card now shows its whole picture at
   whatever size `pop` gives it.

   MOST EFFECTS ARE AN OVERLAY, because the artwork is one flat image and nothing
   can lift the flour out of it - so each of these draws on top of where the thing
   already is. Two things break that rule and both are on the two live cards: a
   `sprite` is a real element CUT out of the card art and moved over an inpainted
   patch, and card 2's flour is a physics simulation in STAGE coordinates so that
   it can leave the picture altogether.

   ALL TEN CARDS SOUND. This used to end "THE UTENSILS GET NO SOUND, which is a
   finding rather than an omission" - the finding being that the only impact
   recording in the set was `topple`, cut from a wooden box going over, and that
   card is steel: steel tumblers, a steel katori, a steel tawa. That much is still
   right and `topple` is still not used here. What was wrong was the conclusion
   drawn from it: nothing about "wood is not steel" argues for SILENCE, only for
   going and finding steel. Steel was found - see `clatter` in SFX_SRC, and the
   note on card 9 below. */
const SCENE_FX = [
  /* 1 house - HE IS HUNGRY, and that is why the whole story happens: he is sitting
       outside at the start of it with nothing to eat. His hand moves on his
       stomach, and the rumble comes off it as curly lines.

       THE HAND REALLY MOVES, rather than the picture being scaled. Two things stood
       here before it and both are worth knowing. First `art-breathe`, an 1.8% pulse
       on the whole photograph standing in for the press - which breathes the veranda
       and the roof along with the boy and reads as the screen wobbling. Then a real
       CUT of the forearm over an inpainted patch, which moved the right thing and
       could not be made to look like it: see the warp note below. It is a CUT again, over a HARMONIC
       patch, and it rocks about the ELBOW because that is where the forearm leaves
       the sleeve. The warp that stood in between is written up below.

       THE RUMBLE IS CURLY LINES AND IT IS NOT BLUE, both at the user's request,
       and the colour was measured rather than picked. Scoring a candidate by its
       worst case over the wall-and-step the lines cross - the smaller of (distance
       to the stroke, distance to the halo), so a line is readable if EITHER half of
       it is:

           orange #e2560f + cream #fff4e0    worst 133.6     <- this
           ink    #3a2317 + cream #fff4e0    worst 175.6
           game cyan      + dark rim         worst 124.9     <- what was here

       The cyan it replaces scored well and was still wrong: an electric blue arc
       off a stomach reads as a magic effect, not as hunger. Orange is what the
       reference the user sent draws it in, it is warmer than anything else on the
       card can be confused with once the cream halo is under it, and it beats the
       cyan on the measurement as well.

       THE LINES GO LEFT, INTO THE OPEN. Up is his own chest and right is his arm;
       left of his belly is plaster, step and sand, which is where an illustrator
       would put them and the only place on this card with room. Three of them,
       staggered down his side and fanned 13 degrees apart, drawn one per gurgle in
       the `tummy` cue - which fires at 0.10, 0.46 and 0.86 - so what is seen and
       what is heard are the same three events. */
  { at: [70.5, 79.9], fx: 'curl', n: 3, d: 17.0, ms: 1150,
    c: '#e2560f', halo: 'rgba(255, 244, 224, 0.96)',
    /* `ms` IS LONGER THAN `gap` ON PURPOSE, so two or three lines are on the screen
       at once. At 820ms against a 360ms gap each one had faded before the next
       arrived and the screenshot showed a single squiggle appearing three times,
       which reads as a blinking mark rather than as a rumble. The STARTS stay at
       360 apart because that is where the cue's gurgles are. */
    /* THE ANCHOR IS OFF HIS SILHOUETTE, not on his belly, and that gap is the whole
       placement. `step` fans the three lines DOWN his side as well as apart, so the
       lowest one starts furthest down - and once the lines were enlarged its start
       landed on his shorts, which reads as a mark on the boy rather than as a sound
       leaving him. 70.5/79.9 puts it about 14px clear of his hip at this size. */
    /* `lead` IS THE FIRST GURGLE AND `gap` IS THE OTHER TWO. `tummy` fires at 0.10,
       0.46 and 0.86 of itself, so with cueAt 990 the three gurgles land at 1090,
       1450 and 1850ms of this card's own clock - which is where the rub's three
       presses are too, and now where the three lines are drawn. `gap` is a single
       number against gaps of 360 and 400, so the middle line is 20ms early: below
       anything the eye or ear resolves, and not worth a second knob. */
    curl: { a: 182, fan: 11, amp: 2.25, waves: 2.5, step: 4.4, lead: 1090, gap: 380 },
    cue: 'tummy', cueAt: 990,
    /* THE HAND IS A WARP, NOT A CUT, and the change is the whole answer to "the
       hand movement is still not smooth and the cut is still very rough".

       WHAT A CUT COST HERE. The forearm was lifted off an inpainted patch, and what
       is behind it is his own striped t-shirt - which no inpaint reconstructs,
       because it has never seen it. Measured on that cut: the artist's silhouette
       line was not in the matte at all (716 of 1042 dark pixels dropped), the matte's
       rim was a rainbow fringe 52.9/255 RMS out with 106 pixels railed at 0 or 255,
       and the patch was ~26/255 wrong at EVERY angle it was ever seen at - so the
       thing that visibly changed frame to frame was a pale band being uncovered and
       re-covered beside the fist, not the hand. The eye tracked the artefact.

       WHAT A WARP DOES INSTEAD: a copy of the card, masked to the arm and the belly
       under it, rotated about the elbow. Nothing is inpainted, so nothing can be
       wrong; the place the arm leaves is filled by the shirt sliding in, which is
       what a hand pressing a belly does to a shirt. See .pspr.is-warp in styles.css
       and tools/warp-masks.py.

       AND IT LET THE GESTURE GET BIG ENOUGH TO SEE, which was the other half of the
       complaint and the half no matte fix would have touched. The cut could only
       press DOWNWARD - lifting it uncovered the grey step behind his silhouette -
       so the hand crossed 5.3 screen px over three one-way presses, i.e. 0.24 px a
       frame. That is not movement; it is a soft rim changing brightness in place. A
       warp drags the silhouette with the arm, so the swing is symmetric again, and
       at 9 degrees the hand crosses 12.6 px between extremes. 40 px from the pivot
       to the far end of the mask is the number that sets it - see spr-rub.

       9 AND NOT MORE: past about 15 the shorts' waistband visibly bends, because a
       rigid turn of a neighbourhood only reads as an articulation while the
       neighbourhood is small next to the body part. tools/warp-masks.py prints the
       feather band's own displacement and draws the strip to check it on.

       `at` IS 960 AND WAS 620, which was inside the card's own travel: pcard-pop-out
       runs closeMs 820, and at 620 the card was still moving three times as fast as
       the hand. The biggest press was spent invisible. */
    sprite: { file: '01-belly', box: [223, 162, 243, 177], motion: 'rub',
              ms: 1320, at: 960, rot: 1.15, scale: 1.055, org: '30.0% 31.1%',
              ease: 'cubic-bezier(.37,0,.63,1)' },
    /* 3000 AND WAS 2750, so nothing is still playing when the card leaves. The rub
       finishes at 2140 and the last rumble line has faded by 3000; at 2750 the third
       line was fading while the picture flew back to its slot. */
    pop: 3.0, closeMs: 820, hold: 3000 },
  /* 2 sneeze - आssशू, AND THEN THE FLOUR GOES. The user asked for a real sneeze
       impact, for the flour to behave the way flour behaves, and for some of it to
       leave the picture altogether. All three are why this card's effect is a
       simulation and not a keyframe - see flourBlast().

       THE ORDER IS THE POINT. The card arrives at closeMs; the sneeze SOUND starts
       just after that, as two halting breaths ("आ… आ…") with real silence between
       them; the visual impact - the recoil on the ARTWORK (not the card - see
       .is-sneeze), the flour leaving, the lid knocked out of his hand - waits for
       the actual burst rather than firing on the first breath, so it lands at
       2125ms rather than at the old 880. Nothing happens during the travel, so
       the impact still has the screen to itself; it is only later getting there.

       `mouth` IS THE SOURCE AND `at` IS NOT. The painted cloud sits at 74.6/54.0 -
       that is where the flour IS - but a jet comes out of a mouth, and every
       particle's direction is radial from that point. Measured on the 3x card: the
       open mouth is at (497, 330) of 932x637, the plume's own centre at (690, 310),
       which puts the axis 8 degrees above horizontal and pointing at his right.

       THE LID STAYS. It is the one hard-edged thing in this picture that the sneeze
       actually throws, it is already cut, and the flour alone leaves the drawn lid
       hanging in mid-air doing nothing. The flour stays particles because it is
       diffuse and has no edge to cut along. */
  /* cueAt IS 0 NOW, AND `shake`/`flour.at`/`sprite.at` MOVED INSTEAD - the
     first reversal this number has had. Every earlier version of this cue was
     ONE EVENT (a library breath, then Aaru's own 345ms film burst), so cueAt
     carried the whole picture's timing and 880 was both "when the sound starts"
     and "when the impact lands" at once. sneeze-aachoo.wav is not one event -
     it is two halting breaths (0.18-0.72s, 1.04-1.63s in the file) and THEN the
     burst, at 2.125s in - so for the first time those two questions have two
     different answers. The book's own rule has not changed - "fires on the
     BURST rather than on the halting 'आ… आ…' that leads into it" - only which
     side of the equation bends to satisfy it has: the sound starts on arrival
     (cueAt 0, so the breaths are heard as the card settles) and the visual
     impact waits for it, landing at 2125 instead of 880.

     THE ALTERNATIVE - keep the impact at 880 and start the sound 1245ms
     EARLY so the burst lands there - was tried and rejected: 1245ms of
     lead time does not exist between one leg finishing and the next card
     waking, so the breaths would have started back during the PREVIOUS
     leg's magic-trail shimmer and sat on top of it. Moving the card's own
     effects costs nothing outside this card; moving the sound earlier would
     have cost a collision this project spent real effort eliminating (see
     the recap group note above SFX_PLAN.crash). */
  { at: [74.6, 54.0], fx: null, cue: 'sneeze', cueAt: 0, shake: 2125,
    flour: { at: 2125, mouth: [53.3, 51.8], axis: -10, spread: 38,
             reach: 116, v0: 470, n: 2400, drift: [30, -1] },
    sprite: { file: '02-sneeze', box: [199, 148, 252, 192], motion: 'fall',
              ms: 950, at: 2125, dx: 14, dy: 12, rot: 32,
              ease: 'cubic-bezier(.36,0,.7,.35)' },
    /* AND THE WORD ITSELF - "आ… आ…छीं…!" thrown onto the picture as the sneeze
       lands. The user asked for this by pointing at their own picture book of
       this story: "from this game take aache as shown in image sceen and
       implement the same in our game image 2 scene".

       IT IS THEIR ARTWORK, NOT A REDRAW. The book already had the lettering -
       assets/pop/sneeze.webp there, assets/images/pop-sneeze.webp here - and its
       own source note says it went unused there for a while: "It is the event the
       book is named after and it was the one thing never drawn: the lettering
       already existed and nothing played it."

       THE SAME FILE BYTE FOR BYTE, and that is checkable rather than asserted:
       1100x1047 with real alpha, 138922 bytes, md5 86958b47f51296b965aed6006ad11f9b.
       Nothing was re-exported or re-encoded, so it cannot have drifted from
       theirs - which matters because this tree is shared.

       880ms WAS THE BURST AND NOT THE BREATH, AND STILL IS - the number moved
       to 2125 when the cue became two breaths and a burst, but which INSTANT
       gets the effects has not: see the cueAt note above, where this same
       sentence from the book is quoted again against the new recording.

       life 1000 IS THE BOOK'S NUMBER and its reason is worth keeping: "long
       enough to land, short enough to stay a sneeze rather than becoming a
       caption". The card holds for 3200 now (was 3100, moved with the impact -
       see `hold` below), so a burst landing at 2125 and a 950ms sprite motion
       off it (ending 3075) are both still well clear.

       PLACED OFF HIS FACE, WHICH IS A DEPARTURE FROM THE BOOK'S RULE AND KEEPS
       ITS REASON. The book puts each burst on the boy's face, "a little ABOVE
       the face centre... dead-centred on the face it covers the best drawing on
       the page". On its pages he is small in a full-bleed 16:9 painting, so a
       26% burst lands on his head and nothing is lost. Here the card is cropped
       tight on him - the picture is 497.8x280.1 inside a 374x252 window - so the
       same burst over his head covers his whole hair AND forehead, and the
       scrunched eyes go with them. Composited and looked at rather than reasoned
       about: over the head it reads as a hat.

       So it sits in the empty sky at his upper left with its lower-right spikes
       OVERLAPPING HIS HAIR, which is what keeps it his sneeze rather than a
       caption floating beside him. Every part of the drawing the picture is
       about - the shut eyes, the freckled nose, the open mouth - reads under it.

       x/y ARE THE CENTRE IN THE SAME PERCENT-OF-THE-RING-BOX `at` USES, checked
       by back-projecting: [53.3, 51.8] in this convention lands on webp pixel
       (798, 535), which is his open mouth, and that is exactly what `mouth`
       above says. [33.3, 28.8] is webp (495, 298). `w` is ring pixels like every
       other size in this table, so it is multiplied by 1/RING_SCALE inside the
       card and the burst keeps its share of the picture at any card size. */
    /* AND THE LETTERING IS OFF, at the user's word: "remove purple aachi element
       from this plz". It was `letter: { art: 'pop-sneeze', at: 880, life: 1000,
       x: 33.3, y: 28.8, w: 101, ar: 1100 / 1047 }`, and everything above about
       where it sat is still true of the artwork, which is why that note stays.

       THE FILE IS NOT DELETED. assets/images/pop-sneeze.webp is 1100x1047 with
       real alpha and it is the user's own drawing lifted byte for byte out of
       their picture-book - the one thing in this game that arrived as art rather
       than as a measurement. Restoring it is putting those two lines back, and
       wakeCard's `letter` branch stays for the same reason.

       WHAT IT LOOKED LIKE, since nobody will read a webp: mean colour rgb(119,
       78, 167), hue 268 degrees, which is the "purple" in the ask. Nothing else
       on this card is that colour. */
    pop: 3.0, closeMs: 820, hold: 3200 },
  /* 3 pot - HE LOOKS IN, IT IS EMPTY, AND HIS EYES WIDEN AT IT.

       IT IS A WIDEN AND NOT A POP, and the thing that was here in between is worth
       keeping written down. It was the full cartoon gag: the eyeballs launching out
       of the sockets on stretched necks of their own white, diverging as they went,
       stretching along their travel, holding at the extreme, snapping back into
       empty dark sockets. That is the correct drawing of a Tom-and-Jerry eye-pop and
       it was the wrong thing for THIS picture, for a reason that only shows up at
       this size: his eyes are 22 ring pixels across. Throwing something 22px wide a
       third of a head's width and back inside 1.9 seconds is a great deal of travel
       over very few pixels, and few pixels moving far is the definition of jerky.
       Worse, every beat of that gag is deliberately ABRUPT - the anticipation
       squash, the launch, the snap home - and abrupt is exactly what was not wanted.

       SO: ONE SMOOTH SCALE. The eyes grow to 1.3, sit there while he takes in the
       empty pot, and ease back. No travel, no stretch, no overshoot worth the name,
       eased in and out at both ends so there is no frame where the speed jumps.

       THE TWO CUTS STAY TWO CUTS, which is the one thing the abandoned version got
       right and is not obvious. A single sprite covering both eyes can only scale
       about ONE origin, so the pair splays out from the bridge of his nose and the
       far eye slides sideways across his temple as it grows. Cut separately, each
       eye grows about its own centre and neither one moves - which is what "his
       eyes got bigger" actually looks like.

       GROWING IS ALSO THE SAFE DIRECTION over a patched cut. Each eye is lifted off
       an inpainted patch of skin, and 03-eye-r's patch is the rough one - 318 px
       inside its footprint still read as eye after the fill. A sprite that only ever
       scales UP from its drawn box covers that footprint in every frame, so none of
       the residue is ever uncovered. The pop, which slid the eye off its own
       footprint entirely, put all of it on screen.

       THE SHOCK LINES stay, fired as the eyes reach full, because they are the mark
       an illustrator puts round a face at the moment of a reaction and this is that
       moment. They fan left and right only: above his head is the top of the frame
       and below it is his own body, so the open sky either side is the only place on
       this card with room for them. */
  { at: [62.8, 31.4], fx: null, n: 0, d: 62, ms: 620,
    c: '#3a2317', halo: 'rgba(255, 246, 230, 0.95)',
    /* `lead` LANDS ON THE WIDEN, not on its start: the eyes begin at 1040ms and are
       at full size about 450ms later, so 1300 puts the first stroke there. Lines
       that fire as the eyes START read as the lines causing the look. */
    shock: { len: 25, wide: 3.1, spread: 52, lead: 1300, gap: 46 },
    /* HIS VOICE, AND THIS CARD WAS SILENT. He lifts the lid, looks in, and there
       is nothing there - which is the turn the whole story hinges on, and it
       happened without a sound.

       1120 PUTS IT ON THE WIDEN, NOT ON THE LINES. The eyes begin to grow at
       1040 and reach full about 450ms later; the shock lines fire at 1300, ON
       the arrival. A gasp is the REACTION and therefore belongs at the start of
       the movement it causes, so it sits 80ms after the eyes begin and 180ms
       before the strokes land. The order a child hears is: he looks, he gasps,
       his eyes go wide, the lines come out - which is cause and effect rather
       than three things at once. */
    cue: 'gasp', cueAt: 1120,
    /* THE LID IS NOT CUT, at the user's word: "dont cut the cap of the vessel it
       looks really bad". It was, and it tilted four degrees about the hand holding
       it. Two things were wrong with it and both are the drawing rather than the
       code. A curl of his hair hangs over the lid's top corner, so the moment the
       lid moves at all a sliver of hair-coloured patch opens under the curl and the
       curl reads as a fragment floating loose; and the lid's lower edge crosses the
       rim of the pot, where a one-pixel misregistration between sprite and patch
       shows as a broken ellipse. Neither is fixable by tuning the tilt, because
       both come from the lid overlapping things it cannot be separated from.

       AND IT COSTS NOTHING TO DROP. This scene's action is his eyes; the lid was
       only ever there so the card would not be completely still while they widened,
       and the shock lines do that job without touching the artwork. */
    sprite: [
      /* 1.3, AND THE CEILING IS NOT FAR ABOVE IT. At 1.68 the eyes swallowed his
         eyebrows and the outer one hung past the side of his head onto the lid; the
         look needs his FACE to still be readable around it. `org` is each eye's own
         centre as the cutter measured it, so neither one drifts while it grows. */
      { file: '03-eye-l', box: [170, 69, 192, 91], motion: 'eye-pop',
        ms: 1320, at: 1040, scale: 1.44, org: '54.5% 51.5%' },
      { file: '03-eye-r', box: [202, 74, 220, 96], motion: 'eye-pop',
        ms: 1320, at: 1040, scale: 1.44, org: '53.7% 56.1%' },
    ],
    pop: 3.0, closeMs: 820, hold: 3300 },
  /* 4 ride - HE RIDES IN FROM THE LEFT, टिन-टिना, and leaves his dust behind him.

       THE WHOLE BOY AND BICYCLE COME IN. The user asked for "aaru entering the scene
       from left to right with his bicycle", and this card is the one where that is
       free: 04-ride's cut IS boy-and-bicycle-and-all, and the patch under it is a
       clean empty road with the artist's own dust cloud still sitting at the left of
       it. So he rides in out of his own dust. -309 card pixels is measured, not
       guessed: it is exactly what carries the sprite's right edge past the left edge
       of the picture, so he starts completely off-frame.

       THE DUST HAS TO BE SIMULATED because the emitter MOVES - see rideAir(). A
       keyframed puff would sit still while the wheel that threw it rode away.

       THE BELL RINGS AFTER HE ARRIVES, and that is a placement rather than a
       preference: the sound lines are drawn at a fixed point on the card, and the
       bell is on the handlebar of a bicycle that is still moving until 2220ms. Ring
       it early and the arcs come off empty road. `ting` is two strikes 128ms apart -
       टिन-टिना - so the arcs come in two bursts at the same spacing.

       NO `bob` ANY MORE. The old motion was a shove forward and back on the spot,
       standing in for a journey; he now makes the journey. */
  { at: [67.5, 46.9], fx: 'chime', n: 4,
    c: '#d87912', halo: 'rgba(255, 249, 230, 0.98)',
    /* Two notes rise one after the other, with a pair of tiny glints following.
       The warm ink and cream outline are readable over the pale sky without
       bringing back the old grey wave. */
    ms: 760, chime: { lead: 2260, gap: 165, lift: 39, spread: 17 },
    /* TWO SOUNDS ON THIS CARD, and they are the two halves of what the picture
       does. `cycle` runs from 820 - the frame the sprite starts moving, the same
       number `ride.at` and the sprite's own `at` use - and covers the whole 1400ms
       journey in from off-frame. `ting` rings at 2260, 40ms after he stops.

       THE ORDER IS THE SCENE. He arrives, and THEN he rings: a child rings the
       bell when he gets somewhere, not while he is still riding. Ringing it during
       the ride would also put the arcs over empty road, which is the placement
       argument the note below already makes for 2260.

       THEY DO NOT OVERLAP - the ride's sound ends as the bell starts - so the two
       read as one action with a full stop rather than as a chord. */
    cues: [['cycle', 820], ['ting', 2260]],
    /* Where the back tyre meets the road, and his chest, both as ring percentages
       measured on the 3x card: contact at (320, 600) of 932x637, body at (452, 210). */
    ride: { at: 820, wheel: [34.4, 94.0], body: [48.5, 44.3], bodyH: 150,
            rate: 230, lag: 10, wake: 16, wind: 1.0, after: 340,
            ease: [0.22, 0.5, 0.45, 1] },
    /* THE BOX IS ONE CARD PIXEL LOWER THAN THE CUT IT CAME FROM, and that one
       pixel is the whole of "this much below part is not cut properly of the type
       and look a rough cut in animation".

       WHAT IS ACTUALLY DOWN THERE. Both wheels are cut off by the PAINTING's own
       bottom edge - the picture ends mid-tyre, and the cutter's `art` rect stops
       at exactly that row ("art's y1 has to be EXACTLY the first pure-white row"),
       so the sprite PNG ends in a dead-flat horizontal edge 342 pixels wide. That
       is not a bad cut, it is the artwork, and there is no ink below it to keep.

       IT IS SUPPOSED TO BE HIDDEN BY .card-crop's overflow, and it was - by 0.3 of
       a pixel. Measured in the closeup: the flat edge lands at screen y 705.0 and
       the clip ends at 705.3. The box is snapped to whole 1x pixels on the way out
       of the cutter (`box[1] // hd * hd`) and the wrapper sits at a fractional
       top: 1.5px, so which side of the clip that edge falls on is decided by
       rounding, and it changes with the card's scale - the ring draws these at
       0.78 and the closeup at 2.27. On the wrong side of it, a 342px flat edge
       shows as a hard line under the wheels with a sliver of road beneath it.

       SO IT IS PUSHED DOWN A PIXEL: 9,210 -> 10,211, which keeps the height at 201
       and moves the whole sprite down one card pixel, putting the flat edge about
       2.3 screen px clear of the clip in closeup instead of 0.3. Nothing else
       moves - the PNG is untouched and the patch under it is dilated by
       reach_pad 2, so a one-pixel shift cannot open a gap at the top.

       WHAT THIS DOES NOT FIX is that the wheels have no bottoms in the painting.
       If the flat edge is ever wanted GONE rather than hidden, that needs the
       artwork extended below the tyres, which is a drawing job and not a cut.

       AND IT IS `nudge` RATHER THAN A CHANGED `box`. `box` means "where the cutter
       cut this", and tools/sim.js form checks it against recap-manifest.json for
       exactly that reason - it caught the first attempt at this, which wrote the
       pixel into the box and made app.js disagree with the manifest. The cut is
       where the cut is; this is a placement offset and says so. */
    sprite: { file: '04-ride', box: [72, 9, 250, 210], nudge: [0, 1], motion: 'enter',
              /* STEADIER THROUGH THE MIDDLE than the ease-out it had. A bicycle
                 riding into frame travels at a speed; the first curve spent 60% of
                 the journey in the first third and then crawled, which left the
                 dust and the wind lines - both of which are driven by SPEED - with
                 almost no window to be seen in. The settle at the end stays. */
              /* dy WENT -3 TO 0, AND THAT IS THE "cut in lower part".

                 The cut ends in two flat horizontal chords - 118 and 138 screen
                 px wide under the rear and front tyres - because the mask is
                 clamped at the artwork's own last row: at rest those chords sit
                 exactly ON the picture's bottom edge and cannot be seen. spr-enter
                 lifted the sprite by --dy for most of the ride (0 to -3px over the
                 first 78%, which is 6.8 screen px), and every one of those pixels
                 opened a band of flat inpainted road under each tyre capped by a
                 razor-straight line. The cutter's own note forbids the same class
                 of move for rotation - "any rotation swings the tyres off their
                 contact shadow" - and a vertical lift is worse, because the tyre
                 bottom is a hard clip line rather than a drawn silhouette.

                 What it cost: a 3px settle bounce at the end of the ride. What it
                 buys: the tyres stay on the road for the whole of it. */
              ms: 1400, at: 820, dx: -309, dy: 0,
              ease: 'cubic-bezier(.22,.5,.45,1)' },
    pop: 2.9, closeMs: 820, hold: 3500 },
  /* 5 fall - AARU FALLS, धड़ामा. He is drawn mid-air, so the dust goes where he is
       ABOUT to land, not under his feet; the card takes the impact as a shake. */
  { at: [42.0, 82.0], fx: null, cue: 'crash', cueAt: 720,
    physics: { kind: 'dust', at: 720, source: [42.0, 84.0], n: 520 },
    /* AND HE ACTUALLY FALLS. He is drawn mid-air, so the movement is the fall
       CONTINUING - down and turning a little further - and the dust below him is
       where he is about to land. The cutter suggested 420ms; 420ms of a boy falling
       is a flicker, and the ask is short but slow enough to see. */
    sprite: { file: '05-fall', box: [83, 21, 232, 132], motion: 'fall',
              ms: 900, dx: 3, dy: 18, rot: 10, ease: 'cubic-bezier(.42,0,.82,.55)' },
    pop: 3.0, closeMs: 820, hold: 2800 },
  /* 6 cart - THE JUICE SPILLS, छपाका. The glass is already tipped and the arc is
       in the air, so this is the moment it arrives - the cue lands late. */
  { at: [70.4, 79.2], fx: null, cue: 'splash', cueAt: 760,
    physics: { kind: 'liquid', at: 260, source: [70.4, 73.0], n: 110 },
    /* AND THE GLASS ITSELF TIPS FURTHER, about its BASE - it lets go of the juice
       rather than moving. The droplets are the particles; this is the thing that
       releases them, which is why the cue lands late: the juice is already in the
       air in that drawing, so छपाका is the moment it arrives. */
    sprite: { file: '06-cart', box: [198, 154, 241, 201], motion: 'tilt',
              ms: 980, rot: -13, org: '50% 96%',
              ease: 'cubic-bezier(.42,0,.88,.62)' },
    pop: 3.0, closeMs: 820, hold: 2400 },
  /* 7 dog - THE DOG GRABS THE SAMOSA. There is a real samosa drawn on the sand at
       the dog's open snout; his hands are empty, so that one is the only one in
       play. Crumbs, and a jolt on the grab. */
  { at: [48.7, 89.9], fx: null,
    /* THE DOG EATING IT, on a card that was silent - and the user asked for this
       one by name. 430 is where the samosa has ARRIVED: the sprite starts sliding
       into the snout at 180 over 900ms, and the crumbs burst at 420. So the grab
       is what is seen from 180 and the chewing starts on the frame the crumbs do.
       Firing it at 180 would have the dog chewing something still in the air. */
    cue: 'dogeat', cueAt: 430,
    physics: { kind: 'crumb', at: 420, source: [46.8, 86.5], n: 72 },
    /* AND THE DOG TAKES IT. The samosa slides left into his open snout and shrinks
       away as it goes - the shrink is what says "grabbed" rather than "slid". The
       origin is the cutter's, converted to the sprite's own box: it had (139,193) in
       card pixels on a box starting at (136,179), so 3/25 across and 14/27 down. */
    sprite: { file: '07-dog', box: [135, 178, 160, 206], motion: 'slide',
              ms: 900, at: 180, dx: -12, dy: -3, org: '12% 52%',
              ease: 'cubic-bezier(.35,0,.82,.48)' },
    pop: 3.0, closeMs: 820, hold: 2300 },
  /* 8 home - HE IS SAD, AND THAT IS THE WHOLE SCENE. The user's words: "this scene
       is basically aaru is sad and back at home just show sad animation on his face
       expression thats it".

       SO TWO THINGS WENT. A `flour-leak` physics burst put a faint white haze off
       the top fold of the packet - that is the dust, and it is gone, along with the
       only `kind` in physicsBurst that used it. And the whole-boy `walk` bob went
       with it: it was a body animation on a card that is meant to be a face, and it
       carried the packet, the shirt and both legs with it.

       WHAT IS LEFT IS HIS EYES CLOSING. He is already drawn sad - the brows are
       pinched, the mouth is a downturned stroke, the eyes look away and down - so
       the beat is not to invent an expression but to let the one he has settle. One
       slow close, held shut, and a slower open. See spr-weary.

       IT IS A WARP AND NOT A CUT, which on this card is a free choice rather than a
       forced one: three sides of his head are dead-flat cream wall (measured std
       under 2/255, the doorframe 159 px clear) so a cut would patch cleanly too. The
       warp wins on the fourth side. There is NO NECK on this picture - his jaw sits
       straight on the striped collar, skin's last row against shirt's first - so a
       cut's seam would have to hide in a band whose own variance is 51/255, and a
       warp has no seam to hide.

       THE FACE PARTS THEMSELVES ARE NOT WORTH CUTTING HERE, and it was measured
       before being ruled out: his mouth is 18 x 8 of the 3x card, i.e. 6.0 x 2.7 at
       the size this plays, drawn with a stroke under a pixel wide - any offset small
       enough to be a mouth is invisible and any offset visible is a smear. His eyes
       are 25 x 19 and 18 x 14, and the right one has zero clean skin outside its
       corner before the silhouette ink. The head carries the expression at this
       size; the features cannot.

       7 DEGREES AND 6 PIXELS, PICKED BY LOOKING AT THREE. At 5/5 the droop is
       there and easy to miss; at 9/8 his head starts to sink into his own collar,
       because the hinge is 23px of jaw with the shirt immediately under it and a
       big turn about it pushes the chin past the neckline. 7/6 carries the crown
       about 20 screen px, which reads across the room. */
  { at: [55.0, 54.0], fx: null,
    /* HIS SIGH, ON THE FRAME HIS EYES START TO CLOSE. This card was silent, and
       of all ten it is the one that most needed not to be: the whole scene is an
       expression and nothing on it moves except two eyelids. A picture that quiet
       either carries its feeling in sound or does not carry it at all.

       900 WAS THE SPRITES' OWN `at`, deliberately the same number rather than a
       beat behind it - true of the library "उफ़" this used to fire, which had no
       lead-in and sounded on the frame it was told to. The cue is a supplied
       recording now (see SFX_SRC.sad) and it carries 0.31s of its own near-
       silence before the breath starts, measured across four thresholds in
       ffmpeg's silencedetect and agreeing to 20ms. cueAt MOVES BACK BY THAT
       instead - 900 - 310 = 590 - so the audible sigh still lands on the frame
       his eyes start to close rather than 300ms into the hold. The eyes take
       1500ms to close, hold and open, so there is room either way; what moved is
       only which number in the file is silence. */
    cue: 'sad', cueAt: 590,
    /* `at` IS ONLY A LIVENESS CHECK NOW. wakeCard needs a point on the card to
       decide the scene can be placed at all; with no overlay and no physics nothing
       else reads it. Left where the packet is, which is where it meant something. */
    /* HIS EYES CLOSE, AND THAT IS ALL. A head droop stood here and was taken out:
       it held only his head, measured, and it was still his upper body moving. The
       user, twice: "his whole upper body is cut when only his expression should
       change". Two eye cuts move about 24 and 21 screen px of picture between them
       and nothing else on the card moves by a pixel. See spr-weary.

       BOTH ON THE SAME CLOCK, for card 10's reason: a shut phase is a couple of
       hundred ms long, so any stagger worth having is most of it and what you get
       is a wink. */
    sprite: [
      { file: '08-eye-l', box: [176, 91, 186, 99], motion: 'sadblink',
        ms: 1560, at: 900, org: '50% 90%', lidRot: 6,
        ease: 'cubic-bezier(.4,0,.6,1)' },
      { file: '08-eye-r', box: [190, 94, 199, 101], motion: 'sadblink',
        ms: 1560, at: 900, org: '50% 90%', lidRot: 10,
        ease: 'cubic-bezier(.4,0,.6,1)' },
    ],
    /* 2700 AND WAS 2400: the droop lands at 2400 and is worth holding for a beat
       before the picture goes, or the last thing on screen is a head still moving. */
    pop: 3.0, closeMs: 820, hold: 2700 },
  /* 9 sneeze (round 4) - THE UTENSILS FALL. Steel, off two shelves, with the dust
       at the bottom of the group.

       IT SOUNDS NOW, AND IT IS THE LAST CARD IN THE RECAP TO GET A CUE. `clatter`
       fires at the WAKE, not at the landing, because unlike every other cue here it
       covers two events rather than marking one: three knocks across the flight and
       the collapse 760ms in, which is the frame the dust bursts on. Its internal
       offsets are the timing - see the note beside the voice. */
  { at: [74.5, 69.0], fx: null, cue: 'clatter', cueAt: 0,
    physics: { kind: 'impact', at: 760, source: [73.0, 88.0], n: 220 },
    /* AND THE UTENSILS ACTUALLY FALL - all six pieces of them, together.

       THIS IS THE CARD MULTI-SEED WAS ADDED FOR. They are six separate pieces of
       steel with flat wall between them, so one seed kept one tumbler and left the
       rest hanging in mid-air; the cutter takes a LIST of seeds now and unions the
       components they land in. The shelves and the boy are not in the sprite.

       No `jolt` any more: the card is going CLOSE on this one, and a closeup and a
       shake both animate the card's transform, so only one of them can run. The
       shake was standing in for movement that now actually happens. */
    sprite: { file: '09-sneeze-r4', box: [190, 88, 301, 208], motion: 'utensil',
              ms: 980, ease: 'cubic-bezier(.42,0,.82,.55)',
              /* FIVE PIECES, NOT SIX, AND EACH CLIPPED TO ITS OWN SHAPE. There were
                 six `clip` rectangles for five objects - two of them were splitting
                 one bowl - and every rectangle cut across whatever else crossed it.
                 tools/split-pieces.py reads the shapes out of the sprite's own
                 matte and writes a mask each; the org is the piece's centroid, so it
                 turns on the spot instead of swinging about the whole sprite. m1 is
                 the ladle and the pot, which touch and therefore fall together. */
              pieces: [
                { mask: '09-sneeze-r4-m1', org: '59.4% 63.4%',
                  dx: -8, dy: 22, rot: -14, delay: 0 },
                { mask: '09-sneeze-r4-m2', org: '63.3% 16.6%',
                  dx: -3, dy: 27, rot: 18,  delay: 45 },
                { mask: '09-sneeze-r4-m3', org: '19.9% 58.6%',
                  dx: 4,  dy: 25, rot: -16, delay: 85 },
                { mask: '09-sneeze-r4-m4', org: '35.7% 12.5%',
                  dx: 8,  dy: 20, rot: 28,  delay: 125 },
                { mask: '09-sneeze-r4-m5', org: '13.4% 25.5%',
                  dx: -6, dy: 18, rot: -20, delay: 70 },
              ] },
    pop: 3.0, closeMs: 820, hold: 2600 },
  /* 10 earring - AMMA FINDS HER LOCKET, and this is the last picture of the story,
       so it is the busiest scene in the recap and the order of its four beats is
       what keeps it from being a mess.

       THE USER'S ASK, in their own words: "do a little movement in blue pendant and
       give shiny effect animation to it. in moms eye show happiness light effect and
       for aaru show him blinking his eye and smiling shyly." Four things, and each
       one needs a different primitive, which is why this entry carries a warp list,
       a sprite list and an overlay list at once.

       EVERY NUMBER ON AARU HERE WAS RE-MEASURED, and the reason is worth keeping
       because nothing in the project reported it. tools/recut-r4-earring.py swapped
       this card's artwork to story slide 24 - the pose where his hand is up at his
       head - and Aaru stands about 10 card px further right in the new drawing than
       he did in the old. His two eye cuts, his head's warp box and his blush had all
       been measured against the OLD drawing and none of them moved with it:

           10-eye-l   box [198, 135, 213, 150]  landed on his EAR
           10-eye-r   box [220, 135, 236, 150]  landed on the bridge of his NOSE
           10-aaru    box [180,  93, 255, 171]  clipped 12 px off his hair
                      pivot [218.17, 169.67]    5 px off his own neck
           his blush  (199.5, 152.5) / (234.5, 151.5)   left of both cheeks

       A CUT WHOSE ROI HAS MOVED OFF ITS ELEMENT DOES NOT FAIL, it cuts whatever else
       is in the window - so the blink beat was inpainting skin over his ear and
       squashing a piece of his old face onto his nose, on a card that also had his
       right eyebrow drawn across the eye under it. Hence the report the whole thing
       started from, "does Aaru have four eyes here". The eyebrow is fixed in the
       artwork (tools/fix-aaru-brows.py); these five are fixed here. Amma's overlays
       and the gem's warp were checked against the same render and are unchanged,
       because she did not move.

       THE BEATS, in ms of this card's own clock (the card itself lands at 820):

           900   the locket starts to swing        warp    spr-sway
          1200   the stone glints                  fx      is-shine
          1480   Amma's eyes light up              overlay is-shine  (x2, 80ms apart)
          1620   Aaru tips his head, shyly         warp    spr-shy
          1820   ...and blushes                    overlay is-glow   (x2, held)
          1980   ...and blinks, twice              sprite  spr-blink (x2, together)

       IT IS A SEQUENCE AND NOT A CHORD ON PURPOSE. Fired together, four effects on
       one 932px picture read as a screen full of sparkle and nothing reads as an
       event. Given away one at a time they read as cause and effect: she holds it
       up, it catches the light, her face lights up, and he looks down, pleased.

       THE LOCKET CAN BE CUT AFTER ALL, and the note that said otherwise is worth
       correcting rather than deleting. It read: the locket "hangs exactly on the
       corner where Amma's inner elbow meets the left edge of her sleeve, so on rows
       116-123 there is no background pixel on EITHER side of it". Re-measured on the
       3x card, that is false for five of the eight rows it names, and the gem is a
       clean cut by CHROMA rather than by luminance - `B - R >= 19` picks out 1119
       pixels forming exactly one connected component, the gem, with zero false
       positives anywhere in the frame and the nearest other pixel 2 units away. What
       the old note got right is that LUMINANCE cannot do it (the gem spans 62-215
       and its neighbours 45-219, fully straddled) which is what the hysteresis cutter
       tried. Chroma was never tried. See tools/warp-masks.py.

       AND IT IS A WARP ANYWAY, because a warp does not care whether the thing is
       cuttable: it inpaints nothing, so all it needs is a mask that holds the gem
       without holding anything that must not move. The gold cap and the cord stay
       put by putting the pivot AT the bail - three pixels from it - so what swings
       is the stone. See spr-sway.

       WHAT REPLACED THE WHOLE-BOY BOB. This scene used to lift all of Aaru three
       pixels and set him down (`spr-react`, now deleted). That reads as "he jumped a
       bit"; the ask was shy. So the boy's own three beats are his head, his eyes and
       his cheeks, and the rest of him holds still - which is what shy looks like. */
  { at: [15.24, 56.84], fx: 'shine', n: 3, d: 22, w: 18, a: 22, gap: 150,
    ms: 900, t: 1200, c: 'rgba(255, 255, 255, 0.95)',
    /* AMMA'S DELIGHT, and this is the last sound in the story. The card was
       silent, which on the picture the whole thing resolves on was the largest
       hole in the recap.

       1480 IS HER EYES, exactly - the beat list above puts the light in them at
       1480, and this is what that light IS. It is placed there rather than on the
       locket's glint at 1200 because the glint is an event on an object and this
       is a person reacting to it; a sound on the stone would say the stone made a
       noise.

       AND IT RUNS OVER THE REST OF THE CARD. The cue is 0.85s against a 3300ms
       hold, so from 1480 it reaches 2330 and still covers her eyes lighting at
       1480, Aaru tipping his head at 1620, his blush at 1820 and both blinks at
       1980 - the four beats the card gives away one at a time. That is the intent:
       those four are a sequence and this is the thread they are strung on, so the
       card ends as one moment instead of four small ones.

       IT WAS 1.3s AND THE LENGTH WAS NEVER WHAT MATTERED. The longer cue covered
       the same four beats and still read as a fright, because what it covered them
       with was an unvoiced breath being pulled IN; the one after that covered them
       in English. Coverage was never the property in question here - what the cue
       IS was.

       AND WHAT IT IS NOW IS NOT A VOICE AT ALL. It was वाह for a while, and it is a
       struck glockenspiel ringing onto the game's own Ab-C-Eb - the user asked for
       "a chime effect wala sound, like premium sound that you find treasure". Which
       also happens to make the coverage argument above come out right for free: the
       chime rings for about 2.2s from 1480, so it reaches past the card's own close
       at 3300 rather than stopping at 2330. See the note beside the cue itself. */
    /* TWO CUES ON THIS CARD NOW, in the order the user asked for them: "1st sfx
       will be of finding a teasure then indian mom happy sfx sound no words".
       `amazed` is the treasure - a glockenspiel strike with a manjira glint over
       it - and it opens on 1480, the frame the stone catches the light. `amma`
       is her, 570ms behind it: the chime is still ringing (its decay is 16dB
       down at 1.2s and still going) so her awe arrives INTO it rather than after
       it, which is what a reaction is. 2050 also sits between her two painted
       catchlights at 1480/1560 and Aaru's shy head-turn at 1620, so the sound
       lands while her face is the thing that just moved. */
    cues: [['amazed', 1480], ['amma', 2050]],
    /* `at` IS THE GEM'S MEASURED CENTRE, 1x (47.33, 120.67) of a 310.6 x 212.3 card.
       It read [15.5, 57.0] before, which was within one card pixel of it, but the
       shine is squared to the stone's own facets and a pixel matters there.

       THE TWINKLE THAT USED TO BE HERE IS GONE. `fx: 'twinkle'` drew a crossed star
       plus four orbiting sparks at 22 stage px, and .pfx.is-twinkle sets the sparks'
       border-radius to 1px - so at this card's scale they are four 21px WHITE
       SQUARES flying off the locket. The user asked for a shiny effect on the
       pendant; a glint that stays in the stone is that, and two sparkle effects on
       one 37px gem is neither. `is-twinkle` now has no user - it joins is-puff,
       is-ring and is-splash in the stylesheet as a primitive nothing calls. */
    /* THE OVERLAYS, in beat order. `at` is a percentage of the card's own box and
       every one of them was measured on the 3x render rather than guessed:

         her eyes       the white catchlights the artist already painted, 1x
                        (83.67, 53.33) and (104.33, 56.67). Putting the light where
                        the highlight already is makes it her eye brightening rather
                        than a lamp switched on beside her face.

                        AND IT HAS TO BE SMALL, which took three tries to accept. Her
                        catchlight is 4px and her iris is 21; a bloom at 26 stage px
                        is 78 screen px and turns her eye into a white disc - the
                        first attempt read as her eyes rolling back. d 4 / w 5 is 12
                        and 15 screen px: the catchlight FLARES and the iris still
                        reads. Anything larger erases the pupil - measured against
                        d5/w7 and d7/w9, both of which do.

                        TWO GLINTS RATHER THAN ONE, 130ms apart, because a single
                        flash at this size reads as a stray pixel and two read as a
                        sparkle. The size is the constraint, not the count.

         his cheeks     1x (209.5, 148.5) and (241.0, 152.5) - under each eye's outer
                        corner and outside the mouth, which is where a blush goes.
                        `o2` holds them at 0.55 instead of fading: a light goes out,
                        a blush does not.

                        THEY ARE OFFSETS FROM THE EYE BOXES AND NOT FREE NUMBERS,
                        which is what made them re-derivable when Aaru moved: (+1.5,
                        +2.5) from the left eye box's bottom-left corner and (-3.0,
                        +1.5) from the right's bottom-right. Amma's two are untouched
                        - she did not move.

       THE BLUSH IS WARM ROSE AND NOT RED. His skin here is #f6a866; a red bloom on
       it reads as sunburn. This is a desaturated rose at 0.36, so what changes is
       the saturation of the cheek rather than its hue. */
    overlays: [
      { fx: 'shine', at: [26.94, 25.12], n: 3, d: 4, w: 5, a: 18, gap: 130,
        ms: 900, t: 1480, c: 'rgba(255, 250, 226, 0.95)' },
      { fx: 'shine', at: [33.59, 26.69], n: 3, d: 4, w: 5, a: -14, gap: 130,
        ms: 900, t: 1560, c: 'rgba(255, 250, 226, 0.95)' },
      { fx: 'glow', at: [67.45, 69.95], n: 1, d: 26, ms: 900, t: 1820, o2: 0.55,
        c: 'rgba(236, 120, 120, 0.36)' },
      { fx: 'glow', at: [77.59, 71.83], n: 1, d: 26, ms: 900, t: 1900, o2: 0.55,
        c: 'rgba(236, 120, 120, 0.36)' },
    ],
    /* THE TWO WARPS: the stone, and the boy's head. */
    warp: [
      { file: '10-gem', box: [38, 112, 57, 130], pivot: [47.33, 112.0],
        motion: 'sway', ms: 1300, at: 900, rot: 12,
        ease: 'cubic-bezier(.37,0,.63,1)' },
      { file: '10-aaru', box: [181, 92, 267, 169], pivot: [223.33, 167.83],
        motion: 'shy', ms: 1050, at: 1620, rot: -3.5, dy: 3,
        ease: 'cubic-bezier(.32,0,.5,1)' },
    ],
    /* AND THE BLINK IS THE ONE CUT ON THIS CARD, because a warp cannot make an
       eyelid: there is no lid drawn on this face to slide down, and squashing the
       neighbourhood vertically samples from far outside the mask and pulls his
       eyebrow over his eye. So each eye is lifted off an inpainted patch and
       squashed onto its own lower lid - see spr-blink.

       THE PATCH IS A HARMONIC FILL, NOT A VORONOI ONE, and on an eye that is the
       difference between a blink and a pale socket. A Voronoi fill copies one nearby
       pixel and inherits its lightness; the skin round these eyes runs #f6a866 +/-10
       with a gradient across the eye's own footprint, so a copied pixel shows as a
       flat oval. Solving for the smooth interpolant instead leaves the rim at the
       rim's own colour and carries the gradient across. See tools/cut-belly-hand.py.

       `follow: '10-aaru'` IS WHAT MAKES A CUT WORK ON A WARPED CARD, and without it
       this beat was broken in two ways at once. His head is TIPPING while he blinks, so the
       warp moves each eye socket about 7px and the closed eyes sat beside them; and
       the warp is a copy of the whole card, so it painted over both eyes and the
       blink could not be seen at all. The paint order is fixed in wakeSprite (warps
       first, cuts on top) and `follow` puts the head's own motion on the sprite's
       WRAP, which has no animation of its own - so the eye rides the socket and
       blinks inside it. See wakeOneSprite.

       BOTH EYES ON THE SAME CLOCK. They were 60ms apart for one run, on the general
       principle that staggering stops things looking mechanical. A blink's shut
       phase is about 100ms long, so 60ms of stagger is most of it: the screenshot
       showed one eye closed and the other wide open. That is a WINK. Two eyes are
       the one place in this file where simultaneous is the correct answer.

       TWO CUTS, NOT ONE, for the reason card 3 records: one sprite can only scale
       about a single origin, so a pair of eyes closing as one box slides the far eye
       sideways across the temple as it shuts. */
    sprite: [
      { file: '10-eye-l', box: [208, 132, 222, 146], motion: 'blink',
        ms: 900, at: 1980, org: '50% 88%', lidRot: -4,
        ease: 'cubic-bezier(.4,0,.6,1)',
        follow: '10-aaru' },
      { file: '10-eye-r', box: [229, 137, 244, 151], motion: 'blink',
        ms: 900, at: 1980, org: '50% 88%', lidRot: 5,
        ease: 'cubic-bezier(.4,0,.6,1)',
        follow: '10-aaru' },
    ],
    /* 3300 keeps a quiet read after the last effect. The quicker corrected blink
       finishes at 2880, leaving 420ms on Aaru's open, shy smile before the card
       returns to the ring instead of closing on a half-shut eye. */
    pop: 3.0, closeMs: 820, hold: 3300 },
];

/* WHERE HE STANDS, so the footpath can go round him - plus a little clearance.

   IT COVERS BOTH OF HIM. The clip sits at left 871.8, top 346.7, 172.7 x 433.4 and
   the fallback still at left 884, top 386.6, 152 wide; the box below contains both,
   because the trail is built once and does not know which is on screen. The numbers
   here were the namaste still's at 183.9 wide, which is a size neither of them has
   been since the resize.

   NAMED, AND READ BY THE HARNESS TOO. It was written out twice, inline in
   stepBlocked here and again in tools/sim.js, and his box has now moved twice -
   from the snap pose's 786..1134 by 596..1056, to the smaller boy, to the
   reference's own size. The second time only one copy was updated, so app.js
   routed the trail round where he is while the harness checked where he used to
   be, and reported a footprint on his shins that was on bare floor. */
const HIS_BOX = { x0: 870, x1: 1050, y0: 374, y1: 790 };
/* AFTER THE SNAP POSE IS UP, BEFORE THE BURST. finaleLanding() waits this long
   past the pose so the magic reads as something his fingers did rather than as
   arriving with him.

   This was dropped when the twelve became ten - it lived in the constants block
   that got replaced - and app.js still referenced it from finaleLanding(). node
   --check passed, because an undefined name is not a syntax error; tools/sim.js
   threw on the first line of its formation scenario. Worth remembering which of
   the two checks can see this. */
const FORM_LEAD   = 0;     // the burst lands ON the snap frame - see finaleLanding()

const TRAIL_AFTER  = 260;   // after the last frame lands, the path draws itself
/* THERE WAS A TRAIL_SWEEP HERE, 1400ms - how long the footpath took to sweep
   itself in once the ring finished. Nothing sweeps now: every mark is built held
   and released as the magic trail passes it, which is what the user asked for and
   which is also the beat that number existed to time. Declared and read by nothing
   is the shape of fault this file keeps having, so it is gone rather than left
   looking live. See revealRun and .pstep.is-held. */
/* ONE MARK TO THE NEXT, along the path. It went 54, 42, 30, 40, and now 28 - and
   all that wandering was the spacing being asked to fix things that were not its
   fault. Twice it was the number of FOOTPRINTS (a pair at both ends of every run,
   four in a gap the reference gives two - see STEP_FEET), and once it was a
   no-overlap rule stricter than the reference's own pairs.

   28 is measured: the reference's marks sit 25.5px apart at the median. It is
   denser in DASHES than any setting so far, which is the "lines between 2 scenes"
   asked for - the footprint count is held down by STEP_FEET, not by the spacing. */
const STEP_GAP     = 28;
const STEP_SIDE    = 13;    // left foot, right foot, either side of the path

/* HOW MUCH AIR A MARK KEEPS FROM A CARD - 20, and taken off the reference rather
   than chosen. Its 75 marks clear their nearest card by 19.4px at the closest,
   24.4 at the 25th percentile and 43.2 at the median, all in stage px.

   It was 8, which at 40px a mark is not clearance at all: four marks measured 0px
   from a card edge and one 1px - touching. Then 26, which was past the reference's
   own closest and thinned three runs down to a single mark. */
const STEP_CLEAR   = 20;

/* HOW CLOSE TWO MARKS MAY BE, centre to centre. Also the reference's: its marks sit
   25.5px apart at the median and 19.4 at the closest, so 18 permits everything it
   does and still stops a mark landing squarely on another.

   The first version of this rejected ANY overlap, which is stricter than the
   reference - the two prints of one of its pairs sit 20px apart on 40px prints, so
   they overlap by half and that is simply what a pair of feet looks like. Rejecting
   that took the trail down to 33 marks with three runs holding one each. */
const STEP_APART   = 18;

/* WHICH WAY EACH MARK IS DRAWN, in degrees, measured off its own cut alpha by its
   principal axis - so each is turned by `heading - its own axis` and they cannot
   share one offset. The footprint's heel blob is at its lower left and the ball of
   the foot at its upper right, which is what makes its forward -45.8. */
const FOOT_AXIS    = -45.8;
const DASH_AXIS    = 41.9;

/* ONE PAIR OF PRINTS PER GAP, and a second pair at the far end only if the run is
   long. This was a pair at BOTH ends of every run, which put four footprints in
   every gap where the reference has two - and with the spacing at 30 the trail came
   to 54 marks, which the user rightly called too many.

   Looking at the reference again: its short gaps carry a pair of prints and then
   two or three dashes. Only the long swoop down its left side carries a second
   pair where it arrives. LONG_RUN is where that switches over.

   IT DOES NOT CURRENTLY FIRE. The longest run lays 7 marks against this 9, so `tail`
   is always 0 and the arriving pair has never been drawn - every run is prints then
   dashes, with no prints at the far end. Kept because it is the right rule if the
   ring ever spreads out, but said out loud: an unreachable branch that reads as live
   is how someone spends an afternoon debugging an effect that was never on. */
const STEP_FEET    = 2;
const LONG_RUN     = 9;
const TRAIL_WALK   = 140;   // samples per run, for the arc-length walk
const MAGIC_SPARKS = 11;

/* HOW FAR A RUN BOWS AND WHICH WAY - and neither is decided by a rule any more.
   Each run tries a few candidates and keeps whichever lays the most footprints.

   TWO RULES CAME BEFORE THIS AND BOTH WERE WRONG. By ORIENTATION, where a row
   bows a little and a side bows a lot: wrong because the bottom row is spread
   around him, so its two outer runs are the tightest of the ten while being
   horizontal. Then by AIR, measuring the gap and bowing hard where there is none:
   better, but it always bowed INWARD, and at the corners the reference art does
   the opposite - its trail from the top-right card to the right-hand card curves
   OUT towards the canvas edge, through the margin. There is about 150px of stage
   outside each column, and that is where a corner run has to go, because inside
   it is another card.

   Searching costs a hundred arithmetic steps per run and removes the need to be
   right about which rule applies where. */
const BOW_ROOM     = 34;
const BOW_MID      = 92;
const BOW_TIGHT    = 155;
const BOW_WIDE     = 215;   // out through the margin, for a corner run

/* WHICH ROW RUNS GO ROUND THE OUTSIDE. The user asked for these two by pointing at
   them: run 1 is the gap between sneeze and pot on the top row, run 6 is between dog
   and home on the bottom. The other four row runs keep the inward dip, which is
   what makes the mix read as variety rather than as a rule - and which is also
   where the footprint PAIRS come from, because an outward row run cannot carry one.

   Indices into the nine runs, so run i joins RING[i] to RING[i+1]. If the ring is
   re-ordered these move with it and are worth re-checking against the picture. */
const ROW_OUT = [1, 6];

/* AN OUTWARD ROW RUN CARRIES REAL FOOTPRINTS, and the note that used to sit here
   said it could not. It claimed "a footprint offset to a side: -15.7px, does not
   fit; dashes only", the build shipped a line of dots, and the user's answer was
   "not dot dot but footstep". They were right and the measurement was wrong, in two
   ways that both happened to flatter the conclusion:

     I MEASURED THE SPRITE'S BOX, NOT ITS INK. .pstep is 40x40, but the sole in
     footprint.png is drawn DIAGONALLY across its tile - that is the entire reason
     FOOT_AXIS is -45.8 - so rotating it to lie along the path gives a mark whose
     ink is 48 WIDE and 28 TALL, not 40x40. PIL on the rotated alpha:

         head   0 deg -> ink 48.0 x 28.0   half-height 14.0
         head +-10    -> ink 49.0 x 31.0   half-height 15.5
         head +-20    -> ink 48.0 x 34.0   half-height 17.0

     AND I USED THE 30px STAGE BOUND FOR y. That number is right for x, where the
     ink is 48 wide and .stage's overflow:hidden will cut a mark in half. Reused for
     y it threw away 22px of a 70px corridor.

   THE CORRIDOR, off the rendered page at 1920x1080:

       above the top row     y 0 .. 72.97       72.97 px
       below the bottom row  y 1012.63 .. 1080   67.37 px

   AND stepBlocked BINDS BEFORE THE PICTURE DOES, which is what makes this safe. It
   is a point test against RING_H/2 + STEP_CLEAR = 126.15 from a card centre, so it
   admits y <= 52.95 at the top while the card's paint does not begin until 72.97 -
   20.02px TIGHTER than the artwork. Whatever it lets through clears the card with
   the mark's own ink to spare. What lands, simulated per mark:

       run 1 (top)     dash PRINT PRINT dash, gaps 38 50 37 px
       run 6 (bottom)  dash PRINT PRINT dash, gaps 34 51 33 px

   This table said "3 prints, ink y 22.0 .. 62.6" for one build, when every mark on
   the run was a print. The user's answer to that build was "it should be circular
   lines then footprint then circular lines".

   The bow is still COMPUTED from the corridor rather than chosen, because the
   window is ~18px at the top and ~12px at the bottom and a fixed number would fall
   out of it the first time a card moves. */

/* THE FOOT OFFSET SHRINKS ON THESE TWO RUNS, 13 -> 6, and it is the one real
   concession. The offset moves a mark's CENTRE perpendicular to the path, so it eats
   the apex window from BOTH ends at once - centre plus offset has to pass
   stepBlocked, and ink minus offset has to stay on the stage:

       offset  0 : top window 28.0 px   bottom 22.3 px
       offset  6 : top window 16.0 px   bottom 10.3 px   <- this
       offset  8 : top window 12.0 px   bottom  6.3 px
       offset 13 : top window  2.0 px   bottom  does not fit

   THE REFERENCE STRADDLES ITS PAIRS WIDER THAN THIS, AND IT CANNOT BE MATCHED HERE.
   Measured off postgame-reference.png: its two feet sit 23 to 27 stage px apart
   across the path, so +-11 to 13 - almost exactly STEP_SIDE. In a 67px corridor that
   does not fit, the bottom run running out of stage at about +-9. Six gives 12px of
   straddle, which still reads as two feet because --fy MIRRORS alternate marks into
   left and right shoes; the offset only staggers what the mirror has already made a
   pair of. Six and eight lay identically and both stay clear - six is chosen for the
   margin, because 10px of apex slack survives a card moving and 3px does not. */
const ROW_OUT_SIDE = 6;

/* THE ALONG-PATH GAP SUITS A DASH, because most of the marks on one of these runs
   ARE dashes - see ROW_OUT_STRIDE and ROW_OUT_TAIL below for the pattern.

   IT IS THE STEP FROM A PRINT TO THE FIRST DASH, and it is set by an overlap that
   cannot be avoided. The corridor is about 136px of arc; the pattern needs 26 + 48 +
   48 + 26 = 148px of ink. Something has to overlap. It is the dash against the print,
   never the two prints against each other: the prints are the marks being looked at
   and must read as two feet, while a dash tucking under a toe reads as more trail. 37
   would have them exactly touching, so 34 overlaps by 3px and buys the room.

   IT WAS 52 FOR ONE BUILD, when every mark on the run was a print and 52 was what
   kept two 48px prints from smearing together. The user's answer to that build was
   "it should be circular lines then footprint then circular lines" - so the run is a
   pattern, not a single kind of mark, and the spacing follows the commoner one.

   Dashes past the first step by the same amount, which is more than a dash needs -
   26px of ink in a 34px step - but the run has no room for a second one anyway, so it
   is a ceiling that never binds. See ROW_OUT_TAIL. */
const ROW_OUT_GAP = 34;

/* HOW FAR APART THE TWO PRINTS SIT, along the path, and it has to be this wide.

   AN OUTWARD PAIR IS SEPARATED ALONG THE PATH, AN INWARD ONE ACROSS IT, and that is
   the whole reason this constant exists. An inward pair uses STEP_SIDE's 13, so its
   two prints sit 26px apart across a path whose ink is 28 tall: the two ink boxes
   overlap by 2px, sit side by side, and read as two clean prints even though they are
   only STEP_GAP's 28 apart along the path.

   The corridor here caps the cross offset at about +-9 - 18px apart, 10px of ink
   overlap - so that trick is not available, and at 30px of along-path gap the two
   prints merged into one blob with two heels. Photographed at 3x: touching at the
   corner. A print's ink is 48px along the path, so 52 is the first stride that leaves
   daylight. */
const ROW_OUT_STRIDE = 52;

/* HOW MANY DASHES MAY FLANK THE PAIR, each way. A ceiling, not a promise: the ones
   that fall outside the corridor are dropped by the same bounds test as any other
   mark, so a short run simply lays fewer. Two each way matches the reference, which
   carries three to five dashes per gap around its one pair. */
const ROW_OUT_TAIL = 2;

/* HALF A FOOTPRINT'S INK, TALL, at the worst heading these runs reach. The surviving
   marks sit within +-23 deg of the row, where the measured half-height runs 14.0 to
   18.3; 17 is the +-20 figure and the two extra degrees cost 1.3px, which the
   window absorbs. This is INK, not the 20px half of the .pstep box - see above for
   what using the box cost. */
const FOOT_HALF = 17;

/* THE VERTICAL STAGE MARGIN FOR A MARK'S INK, as distinct from the 30px bound used
   for x. They are different numbers because the mark is not square once it is
   rotated: 48 wide needs 30 of clearance, 28 tall needs 8. Conflating them is what
   made an outward footprint look impossible.

   IT IS A MARGIN FOR THE INK, SO THE BOUND ADDS THE INK BACK ON. The test in tryBow
   is on the mark's CENTRE, and a centre 8px from the stage edge puts its ink 9px past
   it, where .stage's overflow:hidden cuts it in half - so the bound is
   STEP_EDGE_Y + FOOT_HALF, not STEP_EDGE_Y. Nothing has ever landed near it, because
   the computed apex keeps these marks at y 34..49; a backstop that has never fired is
   the kind that is wrong when it does. */
const STEP_EDGE_Y = 8;

/* HOW FAR A SIDE RUN SWINGS OUT PAST THE COLUMN, and 230 is a floor rather than a
   taste. stepBlocked keeps a mark clear of a card by RING_W/2 + 8 = 163px, and the
   left column's chord runs at x=329 - so a footprint has to reach x < 164 to be
   outside the column at all, which needs a bow over 165. Everything on offer
   before this topped out at 155, ten pixels short, so every mark near the apex was
   dropped and the trail threaded the gap between the two cards instead of swinging
   round them.

   230 puts the apex at x=99 on the left and x=1862 on the right. Both clear their
   blocked bands, and both leave the footprint's own 33px of half-width inside the
   stage. */
const BOW_OUT      = 230;

/* THE THRESHOLD FOR "THIS RUN HAD ROOM TO DRAW", which is how a run that laid
   nothing gets told apart from a run that never had a gap to draw in.

   AS THE RING STANDS, NO RUN IS THAT TIGHT. The nine runs have 125 145 128 118 94
   131 100 112 106 px of air between the two frames they join - the tightest 94
   against this 68 - and every one of them lays marks. So an empty run today is a
   REGRESSION, not expected output.

   IT USED TO SAY THE OPPOSITE, and that is worth recording because a reader
   trusting it would have shrugged at a real fault. It opened "FOUR OF THE TEN RUNS
   HAVE NO PATH TO DRAW" and backed it with "227px between centres on 209px-tall
   frames" and "330px on 306px-wide frames - 18px and 24px of air". There are NINE
   runs, not ten - the path does not close the ring - and those frame sizes predate
   RING_H 212.3 and RING_W 310.6. Nothing in the ring has 18px of air.

   The threshold itself is sound and stays: it is the only thing that would tell the
   difference if a card moved close enough to leave no gap. It lives here rather
   than in the harness so the two cannot disagree. */
const RUN_HAS_ROOM = STEP_GAP + 40;

let formOn    = false;
let formRaf   = 0;
let formCards = [];
let formTimers = [];
let formRuns  = [];      // footprints laid per run, so a gap is visible as a 0

/* THE FOOTPATH'S OWN CURVES, one entry per run and index-aligned with formRuns:
   { a, b, k } - the two frame centres it joins and the quadratic control point
   that won the bow search. A degenerate run pushes null, the way formRuns pushes
   0, so the two arrays cannot slip against each other.

   IT EXISTS SO THE SPARKLE CAN FOLLOW THE FOOTPRINTS RATHER THAN GUESS AT THEM.
   The winning bow used to be discarded at the search's `break`, and it cannot be
   recomputed from the BOW_* table: the search is first-viable-wins over a list
   that branches four ways, and the two ROW_OUT runs compute their bow live from
   the corridor they are threading, so they have no constant to re-derive from at
   all. A sparkle that re-derived it would leave the path on two or three runs. */
let formPath  = [];
/* EVERY MARK ON THE FOOTPATH, in the order it was laid, so a run's marks can be
   found and released as the magic trail passes them. Index-aligned with the run
   counts in formRuns: run r's marks start at sum(formRuns[0..r-1]). */
let formSteps = [];

/* SCREEN 1's state. recapRaf is the sparkle's loop, recapLegs the list of legs it
   is walking, recapAt where it has got to. recapLit is set when Screen 2 has run,
   so neither screen can fire twice - ?dev=post can enter this more than once. */
let recapRaf  = 0;
let recapLegs = [];
/* THE LINE ONLY RUNS ONCE. Ten cards set off in a stagger and each one asks for
   the haul as it starts moving; the cue is a 1.6s travelling sweep and ten of
   them on top of each other is one long scrape. formStop clears it. */
let formHauled = false;
/* ...and how many pictures have landed, which is what walks the ring's phrase
   up its scale. Not the slot index: the ring fills in RING_ORDER 9 -> 0. */
let formPlaced = 0;
let recapAt   = 0;
let recapDone = false;
let recapCard = -1;      /* the last card that has been woken, for the harness */
/* THE SPARKLE'S HEAD, HELD RATHER THAN LOOKED UP. It was a
   querySelector('#postSpark .pspk') on every read, which is both a DOM query per
   sample and - the reason it changed - unanswerable in tools/sim.js's fake DOM,
   so the harness reported the sparkle as never having been on the path at all
   while it was walking it correctly. */
let recapHead = null;
/* WHICH POP-OUT IS CURRENT. Each scene schedules its own restore - drop the ring,
   bring the boy back - at hold + 560, and consecutive scenes OVERLAP: scene 9 wakes
   at about scene 8's hold + 250, so scene 8's restore fires 310ms AFTER scene 9 has
   already hidden him again, and strips the class scene 9 just set. Measured: the boy
   was at opacity 1 over a popped card with `is-away` nowhere on him.

   So a restore checks it is still the latest before acting. A counter is enough; the
   alternative is cancelling the previous timer, which means tracking a handle that
   formStop also has to know about. */
let recapFocus = 0;

/** The eleven cards in STORY order.

    Two traps in here, both of which drop one of them silently:

    ROUND.CARDS IS NOT DEFINED TO BE IN STORY ORDER. It is the order the designer
    placed the pictures in Figma and `order` is the answer to the puzzle; the two
    happen to agree on all five screens as they are written today, and nothing
    holds them agreeing - `cards` used to be the TRAY order and differed on three
    screens. So this walks `order` and looks each id up rather than reading
    `cards` straight through.

    THE ID `sneeze` IS IN TWO ROUNDS, screen 1 and screen 4, drawn differently and
    served from different files. The lookup is scoped to the round it came from,
    which is what keeps them apart; anything that keys them all by bare id loses
    one, and it is the screen-1 sneeze that goes. */
function storyCards() {
  const out = [];
  ROUNDS.forEach(r => {
    r.order.forEach(id => {
      const c = r.cards.find(k => k.id === id);
      if (c) out.push(c);
    });
  });
  return out;
}

/** The ten this screen shows, still in story order. See RING_SKIP. */
function storyTen() {
  return storyCards().filter((c, i) => RING_SKIP.indexOf(i) === -1);
}

function ringEl() { return document.getElementById('postRing'); }

/** One traveller: the frame, the picture and the peg, as one hanger.

    A REAL CLONE OF THE BAY TEMPLATE, not a lookalike. Taking its first hanger
    means the frame sits at slot 0's left and the peg at peg-1's, which is the
    pairing the design draws - and it means this cannot drift from the gameplay
    frame, because it IS the gameplay frame.

    The picture goes in last so it paints over the mat. Safe next to the peg
    rather than lucky: the peg occupies y 240..307 and a card in slot 0 starts at
    319, so they never overlap and their order cannot matter. */
function makeCarrier(card) {
  const bay = bayTpl.content.firstElementChild.cloneNode(true);
  const h = bay.querySelector('.hanger');
  if (!h) return null;
  h.className = 'hanger pcarrier';

  /* Nothing on this screen is touchable, and .slot is the one thing in here that
     asks to be: it carries pointer-events auto plus a role and a label for the
     child to answer into. The role, the tab stop and the label go - a frame
     flying past is not a button, and a screen reader should not be offered ten of
     them. The clone never had the click handlers: cloneNode does not copy
     listeners, and .pcarrier .slot turns pointer-events off as well.

     data-slot STAYS, and stripping it was a bug worth the comment. It looks like
     bookkeeping and it is LAYOUT: the only rule that positions a frame inside its
     hanger is .slot[data-slot="0"] { left: 141px }, so removing the attribute
     dropped the frame to left 0 and left the picture - which app.js positions
     itself, at 178.9 - hanging 141px out of the right side of its own frame. It
     rode in looking like a picture next to a frame rather than in one.

     Keeping it also keeps the geometry in the stylesheet, where the gameplay
     frame's is, so this cannot drift from it. */
  const slot = h.querySelector('.slot');
  if (slot) {
    slot.removeAttribute('role');
    slot.removeAttribute('tabindex');
    slot.removeAttribute('aria-label');
  }

  const el = document.createElement('div');
  el.className = 'card pcard';
  el.dataset.card = card.id;
  /* role=img, not button. This is a picture being shown back, not something to
     press. The label is the card's own alt: paintCardArt sets the inner img's alt
     to '', so without this the ring would be ten unnamed pictures. */
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', card.alt);
  el.style.width = card.home.w + 'px';
  el.style.setProperty('--s', String(RING_SCALE));
  el.style.left = (HANGER_X - card.home.w / 2).toFixed(1) + 'px';
  el.style.top  = (SLOT_CENTER[0].y - CARD_H / 2).toFixed(1) + 'px';
  paintCardArt(el, card);
  h.appendChild(el);
  return { hanger: h, el: el };
}

/** Put a whole hanger where its picture's centre is at `cx`.

    rideBay()'s formula on one hanger: its height comes from the rope UNDER it, so
    it takes the sag as it travels instead of sliding across at a fixed height.
    That is the behaviour that makes this read as a line being pulled. */
function rideCarrier(c, cx) {
  const dy = ropeY(cx) - ropeY(HANGER_X);
  /* The scale sits AFTER the translate, so it applies about .pcarrier's
     transform-origin - the peg's grip point - while the translate carries that
     point along the line. */
  c.hanger.style.transform = 'translate3d(' + (cx - HANGER_X).toFixed(2)
                           + 'px, ' + dy.toFixed(2) + 'px, 0) scale('
                           + RING_SCALE.toFixed(5) + ')';
  c.dy = dy;
  c.cx = cx;
  c.cy = RIDE_MID + dy;
  c.sc = RING_SCALE;
}

/** Which way a picture's fall bows, and how far - DERIVED, not applied to all.

    Only a picture that has something already sitting in its own column above it
    needs to swing round anything, and in this order exactly one does: slot 9 is
    the bottom left, slot 10 is the left side, and 10 lands first. So the rule is
    the condition itself - is there a slot in my column, above me, that fills
    before I do - and everything else falls straight.

    BOWING THEM ALL WAS A BUG AND THE HARNESS CAUGHT IT. Slot 6 is the bottom
    right corner; bowing it inwards pushed it 96px towards slot 7, which had
    already landed 330px away, and the two overlapped by 66px on the way down. A
    bow that avoids one collision by causing another is worse than none. */
function flyBow(i) {
  const me = RING[i];
  const mine = RING_ORDER.indexOf(i);
  for (let j = 0; j < RING.length; j++) {
    if (j === i) continue;
    if (Math.abs(RING[j].x - me.x) < RING_W
        && RING[j].y < me.y
        && RING_ORDER.indexOf(j) < mine) {
      return (me.x < STAGE_W / 2 ? 1 : -1) * FLY_BOW;
    }
  }
  return 0;
}

/** Put one picture's CENTRE at (cx, cy) at scale `sc`, out on its own.

    left/top are in the card's own unscaled coordinates and the scale is about the
    centre, which is why paintCardArt never has to know the ring exists: its
    percentages stay in the card's coordinate system. */
function placeRingCard(c, cx, cy, sc, lean) {
  c.el.style.left = (cx - c.w / 2).toFixed(1) + 'px';
  c.el.style.top  = (cy - CARD_H / 2).toFixed(1) + 'px';
  c.el.style.transform = 'scale(' + sc.toFixed(5) + ') rotate('
                       + lean.toFixed(2) + 'deg)';
  c.cx = cx;
  c.cy = cy;
  c.sc = sc;
}

/** One frame of the arrival. Each picture is waiting, riding the line, falling
    into its slot, or home, and the four never overlap.

    easeHaul is the line's own curve - slow off the mark, steady across, a long
    settle - reused rather than re-chosen, because it is the same movement. */
function formStep(now) {
  let busy = false;
  formCards.forEach(c => {
    const t = now - c.t0;
    if (t < 0) { busy = true; return; }

    if (t < c.rideMs) {
      const p = easeHaul(t / c.rideMs);
      if (!c.riding) {
        c.riding = true;
        c.hanger.classList.add('is-riding');
        /* THE LINE MAKES THE SOUND IT MAKES IN THE GAME. The user's ask: "1st
           coming back sfx should be same as in the start of game when 3-3
           frames use to enter the main screen". That sound is `haul` - the
           rope running out with a note on each frame as it crosses the edge -
           and this is the same clothesline carrying the same frames the other
           way, so it is the same cue rather than a cousin of it.

           ONCE, ON THE FIRST CARD TO SET OFF, not ten times. `haul` is a 1.6s
           travelling cue built for a bay of three crossing together; ten of
           them overlapping would be one long scrape. The first launch is when
           the line visibly starts running, which is the moment the gameplay
           cue marks too. */
        if (!formHauled) { formHauled = true; sfx('haul', { delay: haulNoteAt(0) }); }
      }
      rideCarrier(c, ENTER_CX + (c.slot.x - ENTER_CX) * p);
      busy = true;
      return;
    }

    /* THE PICTURE COMES OUT OF THE FRAME, handed from the line layer to the ring
       layer at the exact place it already occupies - both are inset:0 over the
       same stage, which is the trick haulLine() uses to hand a placed card to the
       hanger it was placed in. The emptied frame and its peg then fade. */
    if (!c.freed) {
      c.freed = true;
      c.fromY = RIDE_MID + (c.dy || 0);
      c.hanger.classList.add('is-gone');
      const host = ringEl();
      if (host) host.appendChild(c.el);
      c.el.classList.add('is-flying');
      /* AND IT MAKES A SOUND, which until now it did not - ten pictures crossed
         the whole screen on a clothesline in complete silence, on the one screen
         the game is building towards. This is the other half of `haul`: same line,
         same pegs, travelling the other way.

         HERE AND NOT AT c.t0, so the cue fires ONCE per picture and on the beat
         that reads. This branch runs the instant a card reaches its slot and
         leaves the line, so `ride`'s slide covers the last of the travel and its
         settle lands FLY_MS later, on the frame the picture actually drops into
         place - see VOICES.ride, which is built around that number.

         PANNED TO THE SLOT IT IS GOING INTO, so the ring fills audibly as well as
         visibly - RING_ORDER goes 9 -> 0. The ten arrivals are NOT evenly spaced,
         even though the launches are: the gaps measure 1.13s down to 0.35s because
         each card rides a different distance. See VOICES.ride, which is levelled
         for the crowded end of that. */
      /* A NOTE, NOT A RAIL. This was `ride` - a curtain rail sliding, with a
         wooden knock on the end of it - and the user's verdict was "i dont like
         the sfx of the frames getting positioned... remove that sfx its
         annoying put something more relatable and ear pleasing to the
         situation". A rail is a machine, and ten of them in eight seconds is a
         machine ten times.

         WHAT IS ACTUALLY HAPPENING is a picture from the child's own story
         settling into a ring, one after another, until the story is whole. So
         each one plays the NEXT NOTE of the game's own music box, and by the
         tenth the ring has been spelt out as a rising phrase. That is the same
         instrument the placement chime, the hint and roundDone are built from,
         so the celebration is in the game's voice rather than in a foley
         library's.

         TEN NOTES FOR TEN PICTURES, which is not a coincidence to be relied on
         but is the reason this fits: MB_STEPS is the music box's whole range as
         cut - Ab major from c5 to ab6 - and the ring has exactly that many
         slots. `placed` counts arrivals rather than reading the slot index,
         because the ring fills in RING_ORDER 9 -> 0 and the phrase has to rise
         in the order the CHILD sees, not in the order the slots are numbered.

         Panned to the slot, as the rail was: the ring still fills audibly from
         one side to the other. */
      sfx('placed', { pan: panAt(c.slot.x),
                      rate: PLACED_RATES[Math.min(formPlaced, PLACED_RATES.length - 1)] });
      formPlaced += 1;
    }

    if (t < c.rideMs + FLY_MS) {
      const q = (t - c.rideMs) / FLY_MS;
      const e = q * q * (3 - 2 * q);
      /* NO SHRINK. The picture rode in at the ring's size already, so coming out
         of its frame is a fall and nothing else.

         There used to be one, front-loaded into the first 40% of the fall: the
         picture arrived 394 wide against 306 in the ring, and at that size slot 8
         falling at x=507 clipped slot 10 sitting at 177, 330 apart. Scaling the
         whole hanger instead removed the size change and the clip together. */
      placeRingCard(c,
                    c.slot.x + c.bow * Math.sin(Math.PI * q),
                    c.fromY + (c.slot.y - c.fromY) * e,
                    RING_SCALE,
                    /* it only leans if it is swinging round something */
                    c.bow === 0 ? 0 : 4.5 * (1 - e) * (c.bow > 0 ? 1 : -1));
      busy = true;
      return;
    }

    /* HOME, and the inline transform hands over to the stylesheet here. The
       settle overshoots, and a keyframe cannot read the inline transform it is
       replacing - hence --s. Clearing the inline transform is what lets it in. */
    if (!c.landed) {
      c.landed = true;
      c.el.style.left = (c.slot.x - c.w / 2).toFixed(1) + 'px';
      c.el.style.top  = (c.slot.y - CARD_H / 2).toFixed(1) + 'px';
      c.el.style.removeProperty('transform');
      c.el.classList.remove('is-flying');
      c.el.classList.add('is-home');
      c.cx = c.slot.x;
      c.cy = c.slot.y;
      c.sc = RING_SCALE;
    }
  });
  formRaf = busy ? requestAnimationFrame(formStep) : 0;
}

/** Is this point under a frame, or under him?

    HE NO LONGER STANDS ON THE PATH, and this note used to say he did: "the bottom
    run of the ring goes straight through him". The harness has printed "he stands
    on: no run - the path goes round outside him" for many builds. What is true is
    that his box still has to be excluded, because the run below him would otherwise
    walk up his shins - it is the exclusion that keeps the path outside him, not an
    accident of the layout.

    The historical shape of it: the bottom run of the ring used to go straight
    where his feet are - so the trail has a gap there rather than footprints up his
    shins. The box is his drawn silhouette plus clearance: 810..1118 at y=1031
    where his sandals splay widest, 846..1076 higher up. */
function stepBlocked(x, y) {
  if (x > HIS_BOX.x0 && x < HIS_BOX.x1
      && y > HIS_BOX.y0 && y < HIS_BOX.y1) return true;
  for (let i = 0; i < RING.length; i++) {
    if (Math.abs(x - RING[i].x) < RING_W / 2 + STEP_CLEAR &&
        Math.abs(y - RING[i].y) < RING_H / 2 + STEP_CLEAR) return true;
  }
  return false;
}

/** Would a mark here land on one already placed?

    A footprint is 40px across and STEP_GAP is 28 along the path, so where the
    path curves sharply the 13px left/right offset is not enough to keep consecutive
    marks out of each other - three pairs were overlapping. Dropping the later one
    also thins the tight corners, which is where the crowding was.

    IT IS SIZE-BLIND, AND THIS NOTE USED TO PRETEND OTHERWISE. It claimed "the sizes
    are the drawn ones from styles.css: 40x40 for a footprint, 20x21 for a dash",
    which is false of the body below: a fixed STEP_APART radius that never reads a
    size or a kind. Left as it was, that sentence would have had the next reader
    trust a check that does not exist.

    IT IS DELIBERATELY LEFT SIZE-BLIND, though. Making it accurate - the real ink is
    ~48px along the heading, so consecutive prints at STEP_GAP's 28 overlap by 20 -
    would reject most of the trail and take it from 39 marks to about 27. The inward
    runs read correctly as pairs of feet precisely because the prints overlap
    slightly, so the fix belongs where separation is actually needed: ROW_OUT_GAP on
    the two runs that lay single prints rather than pairs. What the harness now does
    instead is MEASURE the real ink extent of every mark and report the worst
    clearance - see tools/sim.js, the ink block in the `form` scenario. */
function stepClash(x, y, placed) {
  for (let i = 0; i < placed.length; i++) {
    const dx = x - placed[i].x;
    const dy = y - placed[i].y;
    if (dx * dx + dy * dy < STEP_APART * STEP_APART) return true;
  }
  return false;
}

/** Lay the footpath round the loop. Returns how many footprints it drew, and
    leaves a per-run count in formRuns so the harness can see that every run
    contributed rather than only the total.

    ONE RUN PER PAIR OF NEIGHBOURING FRAMES, NINE IN ALL, and it does NOT close
    back to the first - see the note in the loop for why a tenth run from the end
    of the story to its beginning is wrong. This said "twelve in all, closing back
    to the first" long after both halves of that stopped being true.

    Each run is a QUADRATIC CURVE rather than a straight line: the row runs dip in
    towards the middle, the side runs swing out towards the stage edge, and two of
    the row runs go out instead of in by request - see ROW_OUT. BOW_ROOM / BOW_MID /
    BOW_TIGHT / BOW_WIDE / BOW_OUT carry the measurements.

    WALKED BY ARC LENGTH, from one frame's centre to the next's, with
    stepBlocked() dropping the footprints that land inside a frame or on him.
    That replaced an inset-along-the-chord calculation, and it is better for a
    reason beyond the curve: the path is now trimmed by what is actually in the
    way instead of by an assumed rectangle. That is still the right design - the
    path is trimmed by what is actually in the way - but the example it used to give
    is dead: there is no "gap where he is standing on the bottom run", because the
    path does not cross him at all. See HIS_BOX. */
/** A point on a quadratic Bezier, at parameter t.

    ONE COPY, CALLED BY BOTH THE WALK AND THE SPARKLE. It was inline inside
    tryBow, which meant the sparkle would have had to carry its own - and this
    file has a written-up account of what happens when one rule lives in two
    places here: they drift, and the drift is invisible until something lands
    somewhere impossible.

    The control point is TWICE the bow off the chord, because a quadratic only
    reaches half way to it: at t=0.5 the curve sits at (P0 + 2*P1 + P2) / 4, the
    chord midpoint plus half the control point. That doubling is done by the
    caller, so `k` here is already the control point and not the bow. */
function quadAt(a, k, b, t) {
  const w = 1 - t;
  return { x: w * w * a.x + 2 * w * t * k.x + t * t * b.x,
           y: w * w * a.y + 2 * w * t * k.y + t * t * b.y };
}

function buildTrail(instant) {
  const host = document.getElementById('postTrail');
  if (!host) return 0;
  host.replaceChildren();

  const mid = { x: STAGE_W / 2, y: (RING[0].y + RING[6].y) / 2 };
  const steps = [];
  formRuns = [];
  formPath = [];
  formSteps = [];
  let foot = 0;

  /* NINE RUNS, NOT TEN - the path stops at the last scene and does not close.

     It used to loop with `% RING.length`, which drew a tenth run from slot 10 back
     to slot 1: a footpath from the END of the story to its BEGINNING. On a ring of
     pictures that looks like the obvious thing to draw and it is wrong - the trail
     is the order the events happened in, and they do not lead back to the boy
     sitting outside his house. The user spotted it as footsteps that should not be
     there before I understood why.

     THE REFERENCE ART HAS THAT CLOSING RUN. It is wrong there too; its badges also
     number two cards "2" and skip 5. Story logic wins over the reference. */
  for (let i = 0; i < RING.length - 1; i++) {
    const a = RING[i];
    const b = RING[i + 1];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len = Math.sqrt(vx * vx + vy * vy);
    if (len < 1) { formRuns.push(0); formPath.push(null); continue; }
    const ux = vx / len;
    const uy = vy / len;

    /* Perpendicular, pointing whichever way the middle of the ring is. */
    const px = -uy;
    const py = ux;
    const inward = ((mid.x - a.x) * px + (mid.y - a.y) * py) >= 0 ? 1 : -1;
    /* THE SIDE RUNS BOW OUTWARD, THE ROW RUNS BOW INWARD, which is what the
       reference does and what mine was getting wrong: everything bowed inward, so
       the whole trail sat inside the ring and the outer margin was bare. In the
       reference the run from the top-left frame down to the left-hand frame swings
       OUT towards the canvas edge, and the same on the right - while the runs
       along the top and bottom dip in towards the middle.

       A run is a "side" run if it travels more vertically than horizontally. There
       are about 150px of stage outside each column for it to use. */
    const vertical = Math.abs(uy) > Math.abs(ux);
    /* Side runs always go out; two of the row runs do too, by request. */
    const rowOut = !vertical && ROW_OUT.indexOf(i) !== -1;
    const way = (vertical || rowOut) ? -inward : inward;

    /* THE CORRIDOR AN OUTWARD ROW RUN HAS TO FIT IN, and the bow that puts the apex
       in the middle of it. Measured every time rather than written down, because the
       window is only 12 to 18px wide and a hardcoded apex would fall out of it the
       first time a card moved.

       BOTH BOUNDS CARRY THE FOOT OFFSET, and that is the part that is easy to get
       wrong. `near` is where stepBlocked stops admitting centres, so a mark pushed
       ROW_OUT_SIDE further in by the offset must still clear it; `far` is where the
       ink would leave the stage, so it takes the offset as well as FOOT_HALF. Get
       one of the two and the apex drifts to an edge of the window instead of its
       middle. */
    let rowOutBow = 0;
    if (rowOut) {
      const reach = STEP_EDGE_Y + ROW_OUT_SIDE + FOOT_HALF;
      const top = Math.min(a.y, b.y) < STAGE_H / 2;
      const near = top
        ? Math.min(a.y, b.y) - (RING_H / 2 + STEP_CLEAR) - ROW_OUT_SIDE
        : Math.max(a.y, b.y) + (RING_H / 2 + STEP_CLEAR) + ROW_OUT_SIDE;
      const far = top ? reach : STAGE_H - reach;
      rowOutBow = Math.abs((near + far) / 2 - (a.y + b.y) / 2);
    }
    /* Half a frame along the direction of travel, so "air" is what is left of the
       chord once both frames have taken their share of it. */
    const half = Math.abs(ux) > 0.5 ? RING_W / 2 : RING_H / 2;
    const roomy = len - 2 * half >= RUN_HAS_ROOM;

    /* One candidate bow, walked: the marks it would lay.

       `tight` says this run is threading the gap between a card and the edge of the
       stage, and it changes the run from something WALKED to something PLANNED. An
       ordinary run accumulates marks from its start at a constant STEP_GAP and lets
       the pattern fall where it falls. A tight run has only about 130px of air and
       four marks to put in it, in a fixed order - dash, PRINT, PRINT, dash - with the
       two kinds wanting different spacings, so it is laid out from the MIDDLE
       outwards: see ROW_OUT_STRIDE and ROW_OUT_TAIL.

       It also relaxes the vertical stage bound from 30 to STEP_EDGE_Y, because the
       ink of a mark lying along the row is only 16 to 34px tall where the 30 was
       written for ink 48px WIDE. */
    const tryBow = (bow, tight) => {
      /* The control point is TWICE the bow off the chord, because a quadratic
         only reaches half way to it: at t=0.5 the curve sits at
         (P0 + 2*P1 + P2) / 4, the chord midpoint plus half the control point. */
      /* The control point is twice the bow off the chord - see quadAt. Recorded
         on `ctrl` as well as used, because the search below throws the winning
         `bow` away and the sparkle needs the curve it won with. */
      ctrl = { x: (a.x + b.x) / 2 + px * bow * 2,
               y: (a.y + b.y) / 2 + py * bow * 2 };
      const here = ctrl;
      const at = t => quadAt(a, here, b, t);
      const out = [];
      /* The mark's CENTRE has to clear this, so a margin meant for its INK has the
         ink added back on. 30 in x already includes it - half of 48 plus air. */
      const edgeY = tight ? STEP_EDGE_Y + FOOT_HALF : 30;

      /* THE SCHEDULE, for a tight run only: where along the curve each mark goes and
         which kind it is, measured from the MIDDLE outwards. Positions relative to
         the middle are what put the pair dead centre of the gap, the way the
         reference does, rather than wherever an accumulation from the start happened
         to land.

         The total arc length has to be known before the plan can be pinned to the
         curve, hence the dry pass. TRAIL_WALK is 140 segments, so it costs nothing
         and it is the same summation the real walk does. */
      let plan = null;
      if (tight) {
        let q = at(0);
        let tot = 0;
        for (let k = 1; k <= TRAIL_WALK; k++) {
          const r = at(k / TRAIL_WALK);
          tot += Math.sqrt((r.x - q.x) * (r.x - q.x) + (r.y - q.y) * (r.y - q.y));
          q = r;
        }
        const half = ROW_OUT_STRIDE / 2;
        plan = [{ ds: -half, dash: false }, { ds: half, dash: false }];
        for (let n = 1; n <= ROW_OUT_TAIL; n++) {
          plan.push({ ds: -(half + n * ROW_OUT_GAP), dash: true });
          plan.push({ ds:   half + n * ROW_OUT_GAP,  dash: true });
        }
        /* Sorted along the path, because the sweep animation delays each mark by its
           index and a shuffled plan would make the trail draw itself out of order. */
        plan = plan.map(p => ({ s: tot / 2 + p.ds, dash: p.dash }))
                   .filter(p => p.s > 0 && p.s < tot)
                   .sort((p, r) => p.s - r.s);
      }

      let si = 0;
      let prev = at(0);
      let acc = 0;
      let want = tight ? (plan.length ? plan[0].s : Infinity) : STEP_GAP;
      for (let k = 1; k <= TRAIL_WALK; k++) {
        const pt = at(k / TRAIL_WALK);
        const hx = pt.x - prev.x;
        const hy = pt.y - prev.y;
        const seg = Math.sqrt(hx * hx + hy * hy);
        acc += seg;
        if (acc >= want && seg > 0.0001) {
          /* A planned run reads its kind off the schedule and steps to the next
             entry; a walked one just adds a constant. */
          const planned = tight ? plan[si] : null;
          si += 1;
          want = tight
            ? (si < plan.length ? plan[si].s : Infinity)
            : want + STEP_GAP;
          /* Two feet, either side of the path - a narrower pair on a run threading
             the gap between a card and the edge of the screen, where 13 does not
             fit. Still alternating, so --fy still mirrors them into left and right
             shoes.

             ON A PLANNED RUN THE ALTERNATION FOLLOWS THE SCHEDULE, not the number of
             marks laid so far, so the two prints straddle the path whichever dashes
             ahead of them happened to be dropped for want of room.

             AND ONLY THE PAIR STRADDLES IT. A flanking dash runs single-file, for a
             measured reason: stepBlocked admits y <= 52.95 on the top row, the path
             under the leading dash sits at 47.9, and the 6px offset pushed it to 53.9
             - it was thrown out by 0.95px, by the very thing that exists to separate
             the two prints. Run 6 the same, 4.75px inside the band. The reference does
             not stagger its dashes either: its pair's centroids sit 23 to 27px apart
             across the path while the flanking dashes sit on the centreline. */
          const parity = tight ? si - 1 : foot + out.length;
          const side = (planned && planned.dash)
            ? 0
            : (parity % 2 ? 1 : -1) * (tight ? ROW_OUT_SIDE : STEP_SIDE);
          const x = pt.x + (-hy / seg) * side;
          const y = pt.y + (hx / seg) * side;
          /* 30 IN x, edgeY IN y, and they differ because a rotated footprint is
             not square. left/top are the mark's CENTRE. Along the path its ink is
             48 wide, so a bound of 14 in x let one sit at x=1900 with its right half
             over the stage edge where .stage's overflow:hidden cuts it in two - 30
             is half of that plus air. Across the path the ink is only 28 tall, so
             30 in y was costing 22px of a 70px corridor for nothing. See
             STEP_EDGE_Y.

             WHICH KIND IT IS is carried on the step from here on. A planned run knows
             it from its schedule; a walked one cannot know until the walk has
             finished, so it is filled in below where runOf exists. What must never
             happen again is BOTH - the rule used to be computed here, stored, and
             then quietly recomputed at spawn time from a different input, which is
             how build 76 put 40px footprints into a 7px corridor. */
          if (!stepBlocked(x, y) && x > 30 && x < STAGE_W - 30
              && y > edgeY && y < STAGE_H - edgeY
              && !stepClash(x, y, out.concat(steps))) {
            /* The HEADING is kept raw. Each mark subtracts its own drawn axis from
               it when it is spawned, because the footprint and the dash are drawn
               pointing different ways. `side` alternating is also what says which
               foot it is - see fy below. */
            out.push({ x: x, y: y, tight: !!tight,
                       dash: planned ? planned.dash : null,
                       head: Math.atan2(hy, hx) * 180 / Math.PI,
                       fy: side > 0 ? 1 : -1 });
          }
        }
        prev = pt;
      }
      return out;
    };

    /* THE CANDIDATE BOWS, IN PREFERENCE ORDER. The reference's trails swoop - the run
       from the top-left frame down to the left-hand frame bows most of the way out to
       the canvas edge, where BOW_ROOM's 34px would be nearly a straight line - so a
       roomy run is offered a deeper curve as well as a shallow one.

       THE SIDE RUNS GET NO INWARD CANDIDATE AT ALL, and that is deliberate. This
       search used to keep whichever bow laid the MOST marks, and an outward bow near
       the stage edge loses that contest every time: it is clipped by the edge and by
       the cards, so it lays fewer. Offering both directions and picking by count is
       how "side runs bow outward" ended up doing nothing at all for a whole build.
       Two notes above this one still described that count-based search as if it were
       the design, long after it was replaced by first-viable-wins below.

       Rows keep the small inward bow: in the reference the prints between two
       frames of a row sit at the frames' own mid-height, threading the gap rather
       than arcing over or under them. */
    const tries = rowOut
      ? [[rowOutBow * way, true]]      /* true = tight: footprints, narrow pair */
      : !roomy
        ? [[BOW_TIGHT * way, false], [BOW_WIDE * way, false], [BOW_WIDE * -way, false]]
        : vertical
          ? [[BOW_OUT * way, false], [BOW_OUT * 1.18 * way, false]]
          : [[BOW_ROOM * way, false], [BOW_MID * way, false]];
    /* THE FIRST CANDIDATE THAT LAYS ANYTHING WORTH HAVING WINS, in the order above -
       not whichever lays the most. Picking by count is how "side runs bow outward"
       silently did nothing for a build: an outward bow near the stage edge is
       clipped by the edge and by the cards, so it loses a count contest every time
       even when it is the intended shape. Two marks is enough to read as a path. */
    /* Set by every tryBow call; the one belonging to the winner is kept below. */
    let ctrl = null;
    let bestCtrl = null;
    let best = [];
    for (let k = 0; k < tries.length; k++) {
      const got = tryBow(tries[k][0], tries[k][1]);
      /* bestCtrl moves with best, on BOTH assignments. Setting it only on the
         winning break would leave the fallback run pointing at another
         candidate's curve. */
      if (got.length >= 2) { best = got; bestCtrl = ctrl; break; }
      if (got.length > best.length) { best = got; bestCtrl = ctrl; }
    }
    /* PRINTS AT THE TWO ENDS OF A RUN, DASHES THROUGH THE MIDDLE - decided HERE,
       once, because this is the first point at which the run's length is known. The
       spawn loop only reads the answer.

       That split matters more than it looks. When the rule lived in both places they
       drifted: tryBow set a flag, the spawn loop recomputed from scratch and
       overrode it, and a run that was supposed to be all footprints came out as a
       pair plus dots - or worse, a run that had been sized as dashes got 40px prints
       dropped into a corridor that could not hold them.

       THE TWO RUN SHAPES DIFFER, and both are the reference's. An ordinary run leaves
       a frame with a pair of prints, crosses as dashes, and arrives as a pair - so its
       prints are at the two ENDS, and which mark is which cannot be known until the
       run's length is. An outward row run threads a gap barely wider than the marks
       themselves; there the reference puts the pair dead CENTRE with dashes flanking,
       and the run is planned from its middle out, so every mark already knows what it
       is. st.dash is non-null exactly when the schedule set it. */
    const tail = best.length >= LONG_RUN ? STEP_FEET : 0;
    best.forEach((st, k) => {
      if (st.dash === null || st.dash === undefined) {
        st.dash = k >= STEP_FEET && k < best.length - tail;
      }
      /* WHICH RUN THIS MARK BELONGS TO. This was deleted as dead code earlier in
         this same session, and it was genuinely dead then: the spawn loop had
         stopped needing it once the print-or-dash rule moved in here. It is needed
         again because releasing a mark means finding the marks of one run. */
      st.run = i;
      steps.push(st);
    });
    foot += best.length;
    formRuns.push(best.length);
    formPath.push(bestCtrl ? { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y },
                               k: bestCtrl } : null);
  }

  formSteps = steps;
  steps.forEach((st, k) => {
    const el = document.createElement('div');
    /* WHICH KIND IT IS WAS DECIDED IN buildTrail, where the run's length is known.
       Read, not recomputed - see the note there for what recomputing it cost. */
    const dash = st.dash;
    el.className = dash ? 'pstep is-dash' : 'pstep';
    el.style.left = st.x.toFixed(1) + 'px';
    el.style.top  = st.y.toFixed(1) + 'px';
    /* THE MIRROR REVERSES THE MARK'S OWN AXIS, so the turn has to account for it.
       The CSS is `rotate(--r) scale(1, --fy)`, and transforms apply RIGHT TO LEFT
       - the flip happens first, in the mark's own coordinates, which maps its
       drawn axis A to -A. So the rotation that lands it on the heading is
       `head - fy * A`, not `head - A`.

       This was `head - A` for both feet, and it is the bug the user was looking at
       when they said the paths were still not correct: every mirrored mark - half
       of them - came out 2A off, which is 92 degrees for a footprint and 84 for a
       dash. On a run heading due right the prints pointed 31 and 123 degrees
       alternately, which is exactly as random as it looked. */
    const axis = (dash ? DASH_AXIS : FOOT_AXIS) * st.fy;
    el.style.setProperty('--r', (st.head - axis).toFixed(1) + 'deg');
    el.style.setProperty('--fy', String(st.fy));
    /* BUILT, POSITIONED, AND HELD until the magic trail passes it - unless this is
       the reduced-motion path, where there is no trail to wait for and the whole
       path is simply there.

       TRAIL_SWEEP IS NO LONGER USED HERE. It used to stagger every mark's
       animationDelay so the path swept itself in the moment the ring finished; the
       sparkle now releases each mark as it goes by, which is the same information
       arriving at the moment it means something. */
    el.style.animationDelay = '0ms';
    if (!instant) el.classList.add('is-held');
    st.el = el;
    host.appendChild(el);
  });
  return steps.length;
}

/** Release the marks of one run as the sparkle travels it.

    `on` is how far along that run the sparkle has got, 0 to 1. A run's marks are
    laid in path order, so mark j of n is released once the head is (j + 0.5) / n of
    the way along - which drops each print just behind the sparkle instead of a run
    at a time. "After the trail has passed THAT path" is about a place, not a leg.

    Idempotent: taking a class off an element that does not have it is free, and the
    loop is a handful of nodes per frame. */
function revealRun(run, on) {
  if (run < 0 || run >= formRuns.length) return 0;
  let n = 0, seen = 0, out = 0;
  for (let i = 0; i < run; i++) seen += formRuns[i];
  n = formRuns[run];
  for (let j = 0; j < n; j++) {
    const st = formSteps[seen + j];
    if (!st || !st.el) continue;
    if (on >= (j + 0.5) / n && st.el.classList.contains('is-held')) {
      st.el.classList.remove('is-held');
      out += 1;
    }
  }
  return out;
}

/** The snap: a flash at his fingertips and, unless told otherwise, a ring of
    sparks off it.

    Positioned by the stylesheet, at stage (846,731) - his hand, read off a grid
    drawn over the sprite. Not found by colour: two colour searches for his
    raised hand both landed on his forehead, because his hand merges with his
    face through his forearm.

    `sparks` IS WHY THIS TAKES OPTIONS. The ring of eleven is the whole of the
    FIRST snap's light: nothing else comes out of his hand there, and the frames
    are still 620ms from the edge of the screen, so a burst is what says the snap
    did something. The SECOND snap is the opposite case - a magic trail leaves his
    hand a fifth of a second later and travels the ring - and eleven sparks flying
    out of the same point first read as eleven trails, one of which then happens to
    keep going. The user asked for one. So Screen 1 passes sparks: 0 and the flash
    alone marks the snap, leaving the trail as the single thing that comes out. */
function magicSnap(at, { sparks = MAGIC_SPARKS } = {}) {
  const host = document.getElementById('postMagic');
  if (!host) return 0;
  host.replaceChildren();

  /* WHERE THE LIGHT COMES FROM. Given nothing, it is .pflash's own default -
     (846, 731), the floor-standing snap pose's hand - so the finale beat is
     untouched. Screen 1 snaps from the middle of the ring instead and has to say
     so, because that pose is long gone by then and its hand is 26px outside the
     boy who is standing there. */
  if (at) {
    host.style.setProperty('--mx', at.x.toFixed(1) + 'px');
    host.style.setProperty('--my', at.y.toFixed(1) + 'px');
  } else {
    host.style.removeProperty('--mx');
    host.style.removeProperty('--my');
  }

  const flash = document.createElement('div');
  flash.className = 'pflash';
  host.appendChild(flash);

  /* A snap needs a closing motion before its burst. The curved stroke follows
     the fingertip through the thumb and these three contact rays appear only at
     the meeting frame. It is rebuilt here, so both the finale snap and the
     post-game snap run the identical gesture at their own hand position. */
  const gesture = document.createElement('div');
  gesture.className = 'snap-gesture';
  [-34, 0, 34].forEach(a => {
    const ray = document.createElement('i');
    ray.style.setProperty('--a', a + 'deg');
    gesture.appendChild(ray);
  });
  host.appendChild(gesture);

  /* Keep the painted pose stable while giving the hand contact a tiny physical
     recoil. Individual `translate` composes with the CSS transform that carries
     this same pose into the middle of the ring on the second snap. */
  const pose = document.getElementById('finaleSnap');
  if (pose && pose.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    pose.animate([
      { translate: '0 0', offset: 0 },
      { translate: '-3px 1px', offset: 0.38 },
      { translate: '2px -1px', offset: 0.58 },
      { translate: '0 0', offset: 1 }
    ], { duration: 280, easing: 'cubic-bezier(.2,.8,.3,1)' });
  }

  for (let i = 0; i < sparks; i++) {
    const sp = document.createElement('div');
    sp.className = 'pspark';
    sp.style.setProperty('--a', (i * (360 / sparks) - 90).toFixed(1) + 'deg');
    sp.style.setProperty('--d', (56 + (i % 3) * 24) + 'px');
    sp.style.setProperty('--t', ((i % 4) * 40) + 'ms');
    host.appendChild(sp);
  }
  host.classList.add('is-on');
  return sparks;
}

/** The snap pose steps aside and the reference's boy takes the middle, and the
    empty line goes with them.

    One function because two paths do it - the real one on a timer, reduced motion
    at once - and three classes in two places is exactly the shape of thing that
    ends up half-applied on the branch nobody watches. */
/* THERE IS NO FRAME LOOP ANY MORE EITHER. clapWatch held the clip inside a window
   and applied the stabiliser; the window is now the whole file and the stabiliser
   made things worse, so the browser's own `loop` attribute does all of it. Nothing
   to schedule, nothing to cancel, and no way for a frame outside the clap to be
   shown - the file does not contain one. */

/** Can this browser play the clip at all?

    The same test the finale uses, and for the same reason: a browser that plays
    WebM but not its ALPHA hangs an opaque rectangle where the transparency should
    be. On that path he is the still for the whole screen, and the CSS hop is the
    only life he has - which is why the hop is attached to the still.

    NOTE WHAT THIS NO LONGER DOES: it used to pick one of the two and hide the
    other for good. Both are used now, in sequence - the still holds the middle
    while the pictures arrive and the clip takes over when they have all landed. */
function clipUsable() {
  return alphaVideoUsable(document.getElementById('postAaru'));
}

function postHandover() {
  const me = document.getElementById('postAaruStill');
  if (me) me.classList.add('is-live');
  const sn = document.getElementById('finaleSnap');
  if (sn) sn.classList.add('is-lifting', 'is-gone');
  const rp = document.getElementById('rope');
  if (rp) rp.classList.add('is-put-away');
  /* Normally already gone, with the box - see bannerAway(). This is the reduced
     motion path's own way in, and a no-op on every other. */
  bannerAway();
  /* Reduced motion goes straight to standing there. The clip is never started on
     this path - a looping clap is movement, and this is the path that does not
     have any - so the still is what shows, its hop stilled by the media query. */
}

/** HE PUTS THE SNAP POSE DOWN AND CLAPS, and this is the LAST beat of the screen.

    WHERE THIS USED TO BE FIRED FROM, and why it moved: postFormation ran it on
    `done`, the moment the tenth picture settled into its slot - so he clapped
    through the whole of Screen 1, and the second snap then had to be drawn coming
    off a boy whose hands were mid-applause. The user's order is snap, then the ten
    closeups, THEN the clap: "after all scenes comes to center and goes back, aaru
    clapping animation will happen". So he holds the snap pose he carried into the
    middle for the whole recap - breathing, see snap-held - and recapCheer() calls
    this once the last picture is home.

    ONE FUNCTION BECAUSE THE POSE CHANGE AND THE CLIP ARE ONE BEAT. Three classes
    across three elements, on two paths (clip and still), is exactly the shape of
    thing that ends up half-applied on the branch nobody watches - which is the
    fault postHandover() above exists to avoid, for the same reason. */
function postClap() {
  /* .is-away as well: a closeup hides him, and if the last one's restore has not
     run yet he would be handed over invisible and stay that way. */
  const sn = document.getElementById('finaleSnap');
  if (sn) { sn.classList.remove('is-away'); sn.classList.add('is-gone'); }

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const v = document.getElementById('postAaru');
  const s = document.getElementById('postAaruStill');
  if (v && clipUsable() && !still) {
    v.classList.remove('is-away');
    v.classList.add('is-live');
    try { v.currentTime = CLAP_IN; } catch (e) {}
    const p = v.play();
    /* AUTOPLAY REFUSAL IS NOT A FAULT, BUT IT IS NOT NOTHING EITHER. The two
       lines above have already made the clip visible and parked it on its first
       frame, so a refusal leaves a frozen clap in the middle of the ring for the
       rest of the screen - no clap, and not the still either, because nothing
       else is holding the middle here. THIS IS THE PHONE CASE, not a
       hypothetical: a WebView requires a gesture for playback by default
       (WKWebView's mediaTypesRequiringUserActionForPlayback, Android's
       setMediaPlaybackRequiresUserGesture) and iOS refuses muted inline autoplay
       outright in Low Power Mode - and recapCheer() reaches this many seconds of
       timers past the last touch, so no gesture carries into it. Hand over to
       the still, which is the same complete fallback the alpha-blind path takes
       and the only one of him that can be given life without the clip. */
    if (p && p.catch) p.catch(() => {
      /* A dev skip mid-clap pauses the clip, which rejects this same promise
         with an AbortError - and formStop() has already stripped these classes
         by then, so re-adding them would leave a hopping boy on a live board. */
      if (!formOn) return;
      v.classList.remove('is-live');
      if (s) { s.classList.remove('is-away'); s.classList.add('is-live', 'is-idle'); }
    });
  } else if (s) {
    /* No clip, or motion turned down: the still takes his place, and the hop is
       the only life it has. Under reduced motion the media query stills that too,
       which is the point - he is simply standing there. */
    s.classList.remove('is-away');
    s.classList.add('is-live', 'is-idle');
  }
}

/** Build the ring and start it moving.

    Idempotent, like playPostGame: the finale's snap beat calls it, and so does the
    dev button, and calling it twice does nothing worse than nothing. That is what
    lets the trigger sit in the finale's code rather than here.

    REDUCED MOTION KEEPS THE FORMATION AND DROPS THE TRAVEL. All ten appear in
    their slots, the footpath appears with them, and there is no ride, no settle
    and no burst - the frames and pegs never appear at all, because they exist only
    to carry the pictures in. The pictures ARE the content of this screen, the
    child's own work laid out, so cutting them would cut the screen; that mistake
    has been made twice on this ending already, where a beat zeroed for reduced
    motion took the sequence with it rather than just the movement. */
/** Fetch every warp's mask before any of them is needed.

    A MASK THAT HAS NOT ARRIVED IS NOT A MASK. `mask-image: url(...)` on an image
    that is still loading resolves to `none`, and a warp with no mask is a copy of
    the WHOLE CARD sitting on the card - invisible while it is at rest, and the whole
    picture sliding sideways the moment its animation starts. The first card does not
    wake until about twenty seconds into this screen and these are four PNGs of a few
    kilobytes each, so priming here means the question never arises.

    A sprite's -sprite/-patch pair is not primed, deliberately: those arrive late as
    a missing patch, which shows the drawn element under a moving copy of itself -
    wrong, but small and local. A missing mask is the whole frame. */
function primeWarpMasks() {
  SCENE_FX.forEach(spec => {
    [].concat((spec && spec.warp) || []).forEach(sp => {
      const im = new Image();
      im.src = 'assets/images/' + sp.file + '-mask.png?v=' + BUILD;
    });
  });
}

function postFormation() {
  if (formOn) return false;
  const ring = document.getElementById('postRing');
  const line = document.getElementById('postLine');
  if (!ring || !line) return false;         // markup missing: leave the board alone
  formOn = true;

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  primeWarpMasks();

  ring.replaceChildren();
  line.replaceChildren();
  formCards = [];
  storyTen().forEach((card, i) => {
    const made = makeCarrier(card);
    if (!made) return;
    formCards.push({
      el: made.el, hanger: made.hanger, slot: RING[i], w: card.home.w,
      bow: flyBow(i),
      t0: 0, rideMs: 0, dy: 0, cx: ENTER_CX, cy: RIDE_MID, sc: RING_SCALE,
      riding: false, freed: false, landed: false,
    });
    if (!still) line.appendChild(made.hanger);
  });

  if (still) {
    formCards.forEach(c => {
      c.freed = true;
      c.landed = true;
      ring.appendChild(c.el);
      placeRingCard(c, c.slot.x, c.slot.y, RING_SCALE, 0);
      c.el.classList.add('is-home');
    });
    /* The same hand-over without the fade, and the line away with it. He is the
       boy this screen is about, so he appears rather than not appearing - the
       distinction that has cost this ending two beats already. No hop: the
       stylesheet stills it anyway, but not asking for it is clearer. */
    postHandover();
    buildTrail(true);
    /* SCREEN 1 AND SCREEN 2 STILL HAPPEN HERE, without the travel. The sparkle is
       movement and goes; the fact that the story is finished and celebrated is
       CONTENT, and a child who asked for less movement should still be told it. So
       every picture is woken once - the enlarge and the particles are stilled by
       the stylesheet, which leaves the flour THERE rather than flying - and then
       all ten light and the badge lands.

       This branch existing at all is the point: postFormation returns before the
       animated wiring below, so a beat added only there does not exist for this
       child. */
    /* THE RING IS ALREADY CLOSED ON THIS PATH, so its sound is the first thing
       rather than the last. There is no travel to wait for and no `ride` to be
       clear of - every picture is already in its slot - so `formed` marks the
       state instead of the arrival, ahead of the ten cards waking. The reduced
       motion ask is about MOVEMENT; the fact that the story is complete is
       content, and a child who asked for less of the first should still get all
       of the second. That is the same reasoning the branch below already applies
       to the recap and the celebration. */
    /* ...AND NOT HERE EITHER. See the note where the animated path used to fire
       it: the user asked for the ring-closing sound to go, and this branch is
       the same moment with the travel taken out. */
    SCENE_FX.forEach((s, i) => wakeCard(i));
    recapCheer();
    return true;
  }

  magicSnap();

  /* THREE COMMENT BLOCKS USED TO BE STACKED HERE, two of them describing a
     cross-fade at this moment that no longer happens - the snap pose handing over
     to a second figure mid-lift, and the two classes that had to go on in the same
     tick for their silhouettes to coincide. Both were true of two rewrites ago.
     Deleting behaviour and leaving its prose is the recurring fault in this file;
     this is the third time. */

  /* HE CARRIES THE SNAP POSE INTO THE MIDDLE AND KEEPS IT, finger still up, while
     the ten pictures arrive - and breathes there, so twenty-one seconds of him is
     not twenty-one seconds of a held still. No pose change during the move: that
     happens later, standing still, when the last picture lands. */
  formTimers.push(setTimeout(() => {
    const sn = document.getElementById('finaleSnap');
    if (sn) sn.classList.add('is-lifting');
    /* ...and the clip is parked on its first frame behind him, ready.

       It has to be seeked again on loadedmetadata, because a seek issued before the
       video has metadata does not stick.

       ONCE, THOUGH. This listener had no `once` and was never removed, and a
       <video> fires loadedmetadata again on any src or track change - which would
       have seeked him back to the start MID-CLAP, a whole frame's jump, at some
       point nobody would have reproduced on purpose. The narrator path in this same
       file has used `{ once: true }` for this all along; I just did not copy it. */
    const v0 = document.getElementById('postAaru');
    if (v0 && clipUsable()) {
      const park = () => { try { v0.currentTime = CLAP_IN; } catch (e) {} };
      park();
      v0.addEventListener('loadedmetadata', park, { once: true });
    }
  }, LIFT_AT));

  /* NOT postHandover() here, even though it does these same three things: it also
     takes the rope and the banner away, and on this path both of those wait -
     the rope for all ten to land, the banner for BANNER_GO_AT. It is the
     reduced-motion path that wants all five at once. */

  /* EVERY RIDE AT THE SAME SPEED, so the duration is the distance and not a
     chosen number - and the next sets off when the one in front has covered
     LAUNCH_PX, which is what keeps two on the line without them touching. */
  const t0 = performance.now();
  RING_ORDER.forEach((idx, k) => {
    const c = formCards[idx];
    if (!c) return;
    c.rideMs = (c.slot.x - ENTER_CX) / RIDE_PX_MS;
    c.t0 = t0 + MAGIC_MS + k * (LAUNCH_PX / RIDE_PX_MS);
  });
  /* Parked off the left before the first paint, so nothing is drawn at its
     resting place for one frame on its way in. */
  formCards.forEach(c => rideCarrier(c, ENTER_CX));
  formRaf = requestAnimationFrame(formStep);

  const last = formCards[RING_ORDER[RING_ORDER.length - 1]];
  const done = last ? (last.t0 - t0) + last.rideMs + FLY_MS : 0;
  formTimers.push(setTimeout(() => buildTrail(false), done + TRAIL_AFTER));

  /* THERE IS NO CLAP ON THIS BEAT ANY MORE, and the block that put one here is now
     postClap(), called from recapCheer().

     WHAT USED TO HAPPEN AT `done`: the snap pose took .is-gone, the clip took
     .is-live and started looping, and he applauded for the whole of Screen 1 -
     through the second snap, which therefore had to be drawn coming off a pair of
     clapping hands, and through all ten closeups. The user's order is snap, ten
     scenes, clap, and the clap is the last thing on the screen.

     So he KEEPS THE SNAP POSE from LIFT_AT to the end of the recap. It breathes
     (snap-held), it is the pose the second snap is drawn on, and it is hidden and
     restored with the rest of the middle while a picture is out - see wakeCard.
     The one pose change on this screen is still one pose change; it has moved to
     the end, which is where the ask puts it. */

  /* AND THE LINE GOES ONCE ALL TEN ARE DOWN. Not at the start - the frames ride
     in ON it, and ten pegs clipped to nothing is worse than a line that is still
     there. This fired at `lastOff`, the moment the last frame left the line, and
     the user asked for it after all the scenes are on the screen: `done` is that,
     one FLY_MS later, when the tenth picture has settled into its slot. */
  formTimers.push(setTimeout(() => {
    const rp = document.getElementById('rope');
    if (rp) rp.classList.add('is-put-away');
  }, done));

  /* THE RING CLOSING, AND IT IS THE USER'S ASK: after all the cards are placed in
     their positions there should be a sound. There was none. Ten pictures arrive
     one at a time over about eight seconds, the last one drops into its slot, the
     line is taken away - and the moment the child's whole story is on the screen
     at once passed without anything marking it.

     +180ms AFTER `done`, NOT ON IT. `done` is the frame the tenth picture settles,
     which is also where that picture's own `ride` settle lands - so firing here
     would put two sounds on one tick and make the last arrival louder than the
     nine before it rather than making the RING mean something. 180ms is clear of
     the limiter's 220ms release closing them into one event... which is to say it
     is not, quite, and that is deliberate: they should read as the last picture
     landing AND THEREFORE the ring closing, which is one gesture in two parts. Any
     further out and it is an unrelated chime.

     It is not panned. Everything else on this screen is placed - each ride to its
     slot, each recap cue to its card - because each is a thing at a place. This
     one is about all ten at once, so it comes from the middle. */
  /* NO SOUND ON THE RING CLOSING, at the user's request: "after all scenes are
     on the main screen in post game there is a sfx thats plays in the end when
     all scenes are assembled that sfx is really annoying remove that".

     WHAT WAS HERE: `formed`, on the frame the tenth picture settled. It has been
     three different sounds - a music box flourish, then a granulizer texture
     mis-recorded in PROVENANCE as a bell tree, then a manjira and a hand bell -
     and the complaint survived all three, which is the tell that the problem was
     never the timbre. The ring closing already HAS a sound: ten notes walking up
     the scale as the pictures land (see `placed`), the last of which lands on
     the tonic. A further chime 180ms behind that last note is a second ending
     for a phrase that had just ended.

     The cue, its recipe and its file all stay - nothing else fires it, and the
     note over VOICES.formed explains what it was for. Deleting the line rather
     than the cue keeps that legible. */

  /* ...and the banner, upward, out of the space the top row is about to land in.

     A BACKSTOP RATHER THAN THE EVENT, since the finale now takes it away with
     the box - seconds before this. It stays because THIS is the requirement: the
     top row's pictures land at y 69..281, inside the banner's own 3..239, so the
     formation cannot be correct with it still up. A path that reaches the
     formation without a finale (or with one that was skipped) still needs it. */
  formTimers.push(setTimeout(bannerAway, BANNER_GO_AT));

  /* SCREEN 1 - "STORY COMES ALIVE" - a beat after the tenth picture settles.

     IT USED TO WAIT 1.4s LONGER, for the footpath to finish sweeping itself in:
     done + TRAIL_AFTER + TRAIL_SWEEP + 420. There is no sweep to wait for now. The
     marks are built held and the sparkle releases each one as it passes, so the
     trail DRAWS the path - which is what the user asked for, and which also means
     the path can no longer be overtaken by the thing that draws it.

     Screen 2 is NOT a timer. recapSparkle() calls recapCheer() when it reaches the
     tenth picture, because Screen 2's start time is the sparkle's own duration and
     that is the number being tuned - two copies of it would have to be kept in
     step by hand. */
  formTimers.push(setTimeout(() => recapSparkle(), done + RECAP_START_AT));
  return true;
}

/** Where a card's live element sits, in stage coordinates.

    SCENE_FX holds it as a percentage of the card's own box, which is the only
    form that survives the card being scaled: the ring draws every picture at
    RING_SCALE, so a stage offset measured once would be wrong the moment that
    changed. RING_W/RING_H are the drawn size, so this is the card's centre plus
    the offset from the middle of it. */
function fxPoint(i) {
  const s = SCENE_FX[i];
  const c = RING[i];
  if (!s || !c) return null;
  return { x: c.x + (s.at[0] - 50) / 100 * RING_W,
           y: c.y + (s.at[1] - 50) / 100 * RING_H };
}

/** The same point, in the card's own coordinates - which is where an effect has to
    be if it is to stay stuck to the picture through a closeup. */
function fxLocal(i) {
  const s = SCENE_FX[i];
  const card = formCards[i];
  if (!s || !card) return null;
  return cardLocal(card, s.at[0] / 100 * RING_W, s.at[1] / 100 * RING_H);
}

/** Put a cut-out element on a card, over a patch that hides the original, and set
    it moving. Returns the pair's node so the caller can take it away.

    IT GOES INSIDE THE CARD, into .card-crop, so it inherits the card's own
    transform - it pops and jolts WITH the picture instead of detaching from it -
    and inherits its overflow:hidden, so the element cannot leave its own
    photograph.

    THE MAPPING IS COMPUTED PER CARD AND HAS TO BE. The sprite was cut from a
    RING_W x RING_H rendering of the card, and .card-crop is in the card's UNSCALED
    coordinates inside a BW border on a box that is home.w wide - and there are two
    card widths in this set, so a single constant would put half the sprites beside
    themselves. The sprite is drawn at box/RING_SCALE CSS px so that the card's own
    scale(RING_SCALE) brings it back to exactly the pixels it was cut at. */
/** A point on the rendered card -> the same point in .card-crop's own coordinates.

    ONE COPY, USED BY BOTH THE SPRITES AND THE EFFECTS. The sprites were cut from a
    RING_W x RING_H rendering and .card-crop is in the card's UNSCALED coordinates
    inside a BW border on a box that is home.w wide - and there are two card widths
    in this set, so it is computed per card rather than being a constant.

    Everything that has to stay stuck to the picture goes through here, because
    everything inside .card-crop gets the closeup's zoom for free and anything
    outside it does not. */
function cardLocal(card, px, py) {
  return { x: card.w / 2 + (px - RING_W / 2) / RING_SCALE - BW,
           y: CARD_H / 2 + (py - RING_H / 2) / RING_SCALE - BW };
}

/** The layer inside a card that everything stuck to the picture lives in, made if
    it is not there: the image, the effect overlays, the cut-out sprite pair.

    IT USED TO CARRY THE CLOSEUP'S ZOOM and no longer does - the user asked for the
    zoom-in on arrival to go - which is why it is .card-live rather than .card-zoom.

    THE CLIP WINDOW MUST NOT MOVE, which is why the wrapper exists at all and why it
    is worth keeping empty of animation rather than deleting. .card-crop is inset:0
    with overflow:hidden - it decides which part of the artwork the card shows - and
    transforming it slides the window off the card's frame, which showed up as a
    cream band down two sides of the first popped card.

    It adopts whatever is already in .card-crop rather than assuming only an image is
    there - a card woken twice, which ?dev=post can do, has effects in there as
    well. */
function cardLive(card) {
  if (!card || !card.el) return null;
  const crop = card.el.querySelector('.card-crop');
  if (!crop) return null;
  let z = crop.querySelector('.card-live');
  if (!z) {
    z = document.createElement('div');
    z.className = 'card-live';
    const kids = Array.from(crop.children);
    crop.appendChild(z);
    kids.forEach(k => z.appendChild(k));
  }
  return z;
}

/** Every cut-out element on one card, woken together.

    A CARD MAY HAVE MORE THAN ONE. `sprite` was a single object and is now either
    that or a LIST, because card 3 needs three: the lid he is holding, and his two
    eyes cut one at a time. They are separate cuts from separate parts of the
    picture with separate timings, and merging them would tie the eyes' widen to the
    lid's tilt - and tie the two eyes to a single transform-origin, which is the
    whole reason they are cut apart.

    The single-object form still works and eight cards still use it. */
function wakeSprite(i) {
  const spec = SCENE_FX[i];
  const card = formCards[i];
  if (!spec || !card || !card.el) return null;
  const cuts = [].concat(spec.sprite || []);
  const warps = [].concat(spec.warp || []);
  if (!cuts.length && !warps.length) return null;
  /* WARPS FIRST, THEN CUTS, and the order is not cosmetic. A warp is a copy of the
     whole card, so it paints over anything already in .card-live - which on card 10
     means the head warp painted over both blinking eyes and the blink was invisible.
     A cut-out element belongs ON TOP of a deformation of the art it came from. */
  const made = warps.map(sp => wakeOneWarp(card, sp))
    .concat(cuts.map(sp => wakeOneSprite(card, sp, warps)))
    .filter(Boolean);
  return made.length ? made[made.length - 1] : null;
}

/** ONE WARP: the card's own artwork, cloned, masked to one element, and moved.

    THE OTHER WAY OF MAKING A FLAT PICTURE MOVE, and the one to reach for when a
    thing SHIFTS against its own body rather than leaving it - a hand on a belly, a
    head on a neck, a locket on a cord. See .pspr.is-warp in styles.css for what it
    buys and what it costs, and tools/warp-masks.py for the masks.

    THE COPY IS A CLONE OF THE CARD'S OWN <img>, WHICH IS THE WHOLE POINT. Its
    width, height, left and top are the four numbers paintCardArt wrote, so the
    copy lands exactly on the original rather than nearly on it - and if the crop
    percentages are ever re-authored, this follows for free. Cloning also costs no
    second download or decode: same src, same cache entry.

    ONLY TWO NUMBERS ARE COMPUTED HERE. The copy is shifted by the mask box's own
    left/top, because it sits inside a .pspr that is already at that offset; and the
    pivot arrives as a point in CARD pixels and has to be handed over as a
    transform-origin in the COPY's pixels, which is that point in .card-crop
    coordinates minus the copy's own left/top. Percentages cannot be used: they
    would resolve against the whole card rather than against the element. */
function wakeOneWarp(card, sp) {
  const crop = cardLive(card);
  const base = card.el.querySelector('.card-crop img');
  if (!crop || !base || !sp.box || !sp.pivot) return null;

  const tl = cardLocal(card, sp.box[0], sp.box[1]);
  const wrap = document.createElement('div');
  wrap.className = 'pspr is-warp';
  wrap.style.left   = tl.x.toFixed(1) + 'px';
  wrap.style.top    = tl.y.toFixed(1) + 'px';
  wrap.style.width  = ((sp.box[2] - sp.box[0]) / RING_SCALE).toFixed(1) + 'px';
  wrap.style.height = ((sp.box[3] - sp.box[1]) / RING_SCALE).toFixed(1) + 'px';
  wrap.style.setProperty('--mask',
    'url("assets/images/' + sp.file + '-mask.png?v=' + BUILD + '")');

  const art = base.cloneNode(false);
  art.className = 'pspr-copy';
  art.alt = '';
  art.draggable = false;
  const bx = parseFloat(base.style.left) || 0;
  const by = parseFloat(base.style.top) || 0;
  art.style.left = (bx - tl.x).toFixed(2) + 'px';
  art.style.top  = (by - tl.y).toFixed(2) + 'px';

  const pv = cardLocal(card, sp.pivot[0], sp.pivot[1]);
  art.style.setProperty('--org', (pv.x - bx).toFixed(2) + 'px '
                               + (pv.y - by).toFixed(2) + 'px');
  art.style.setProperty('--spr', 'spr-' + sp.motion);
  art.style.setProperty('--ms', (sp.ms || 900) + 'ms');
  if (sp.dx  !== undefined) art.style.setProperty('--dx', sp.dx + 'px');
  if (sp.dy  !== undefined) art.style.setProperty('--dy', sp.dy + 'px');
  if (sp.rot !== undefined) art.style.setProperty('--rot', sp.rot + 'deg');
  if (sp.ease) art.style.setProperty('--ease', sp.ease);
  if (sp.at) art.style.setProperty('--t', sp.at + 'ms');

  wrap.appendChild(art);
  crop.appendChild(wrap);
  return wrap;
}

/* HOW LONG THE LETTERING TAKES TO ARRIVE AND TO LEAVE, and both are the book's
   own numbers rather than new ones - the whole point of this cue is that it is
   the same event the child has already seen in the picture book. `life` in the
   spec is the WHOLE thing end to end, so the hold is whatever is left over:
   1000 - 380 - 300 = 320ms of the word simply sitting there, which the book's
   note describes as reading like a punch. */
const LET_IN  = 380;
const LET_OUT = 300;

/** ONE COMIC BURST OF LETTERING on a card - the sneeze's "आ… आ…छीं…!".

    WHY THIS IS NOT buildFx. Every other overlay in this file is a point with
    particles radiating out of it, configured by numbers; this is a drawn asset
    with a size and an aspect ratio, and the thing that makes it work is the
    SHAPE OF ITS ARRIVAL rather than any geometry. Nothing in buildFx would be
    reused except the appendChild.

    IT IS THE BOOK'S KEYFRAME SET, TRANSCRIBED. Six stops with their own easings:
    thrown in from 30% at -9deg, overshooting to 1.14 and 2.4deg, settling back
    through 0.955 and -1.4deg, holding square, then shrinking away to 0.52 and
    -5deg. Reproducing it by feel would have been a worse version of a thing that
    already exists and that the user has already approved by pointing at it.

    WEB ANIMATIONS AND NOT A CSS CLASS, which is against the grain of this file -
    every other motion here is a class in styles.css driven by custom properties.
    Two reasons it earns the exception. The offsets depend on `life`: at
    life 1000 the stops land on 0/17.5/28.1/38/70/100%, and a CSS @keyframes
    block would have to hard-code those, so a different `life` would scale the
    throw-in and the shrink-away instead of leaving them at 380 and 300 and
    changing only the hold. And it removes ITSELF on finish, which is what makes
    two of these in quick succession safe - each burst owns only its own element.

    WIDTH AND HEIGHT ARE BOTH SET, deliberately. An <img> takes its height from
    the file, which it does not know until the file has decoded - the book hit
    exactly this and worked around it with aspect-ratio - so the first burst of a
    session would otherwise start as a zero-height strip and snap into shape
    partway through its own throw-in. `ar` in the spec is the file's own ratio.

    Returns null when the card has no live layer, which is the same fallback
    every other card effect takes: no picture to stick to, no effect. */
function wakeOneLetter(card, sp, px) {
  const crop = cardLive(card);
  if (!crop || !sp || !sp.art) return null;

  const at = cardLocal(card, sp.x / 100 * RING_W, sp.y / 100 * RING_H);
  const w  = (sp.w || 100) * px;
  const img = document.createElement('img');
  img.className = 'plet';
  img.src = 'assets/images/' + sp.art + '.webp?v=' + BUILD;
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  img.style.left   = at.x.toFixed(1) + 'px';
  img.style.top    = at.y.toFixed(1) + 'px';
  img.style.width  = w.toFixed(1) + 'px';
  img.style.height = (w / (sp.ar || 1)).toFixed(1) + 'px';
  crop.appendChild(img);

  const total = Math.max(LET_IN + LET_OUT + 60, sp.life || 1000);
  const hold  = total - LET_IN - LET_OUT;
  const o = ms => ms / total;
  const T = (sc, r) => 'translate(-50%, -50%) scale(' + sc + ') rotate(' + r + 'deg)';

  /* Reduced motion still gets the word - it is what the sound looks like, and a
     child who cannot read the Hindi is being told what he is doing by the
     picture - but it arrives by fading rather than by being thrown. */
  const calm = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const frames = calm
    ? [{ offset: 0,               transform: T(1, 0), opacity: 0 },
       { offset: o(LET_IN),       transform: T(1, 0), opacity: 1 },
       { offset: o(LET_IN + hold), transform: T(1, 0), opacity: 1 },
       { offset: 1,               transform: T(1, 0), opacity: 0 }]

    : [{ offset: 0,                  transform: T(0.30, -9),
         opacity: 0, easing: 'cubic-bezier(.16,.9,.28,1.3)' },
       { offset: o(LET_IN * 0.46),   transform: T(1.14, 2.4),
         opacity: 1, easing: 'cubic-bezier(.36,0,.4,1)' },
       { offset: o(LET_IN * 0.74),   transform: T(0.955, -1.4),
         opacity: 1, easing: 'cubic-bezier(.3,0,.2,1)' },
       { offset: o(LET_IN),          transform: T(1, 0),
         opacity: 1, easing: 'linear' },
       { offset: o(LET_IN + hold),   transform: T(1, 0),
         opacity: 1, easing: 'cubic-bezier(.5,0,.78,.1)' },
       { offset: 1,                  transform: T(0.52, -5), opacity: 0 }];

  const a = img.animate(frames, { duration: total, fill: 'both' });
  const gone = () => img.remove();
  a.finished.then(gone, gone);
  return img;
}

function wakeOneSprite(card, sp, warps) {
  /* Into the live wrapper, so the sprite sits in the picture's own coordinates
     rather than the card's frame. */
  const crop = cardLive(card);
  if (!crop) return null;

  const toLocal = (px, py) => cardLocal(card, px, py);
  /* `nudge` OFFSETS THE PLACEMENT WITHOUT TOUCHING THE CUT, in card pixels. Only
     04-ride uses it, and the note in SCENE_FX says why: the painting cuts both
     wheels off at its own bottom edge, so the sprite ends in a flat 342px-wide
     line that .card-crop is supposed to clip - and it was clipping it by 0.3 of a
     pixel, which rounding can lose at another card scale. One pixel down puts it
     properly outside. */
  const nz = sp.nudge || [0, 0];
  const tl = toLocal(sp.box[0] + nz[0], sp.box[1] + nz[1]);
  const wide = (sp.box[2] - sp.box[0]) / RING_SCALE;
  const tall = (sp.box[3] - sp.box[1]) / RING_SCALE;

  const wrap = document.createElement('div');
  wrap.className = 'pspr';
  if (sp.motion) wrap.classList.add('is-' + sp.motion);
  wrap.style.left   = tl.x.toFixed(1) + 'px';
  wrap.style.top    = tl.y.toFixed(1) + 'px';
  wrap.style.width  = wide.toFixed(1) + 'px';
  wrap.style.height = tall.toFixed(1) + 'px';
  if (sp.motion === 'sadblink' || sp.motion === 'blink') {
    wrap.style.setProperty('--blink-ms', (sp.ms || (sp.motion === 'blink' ? 900 : 1560)) + 'ms');
    wrap.style.setProperty('--blink-t', (sp.at || 0) + 'ms');
    wrap.style.setProperty('--lid-rot', (sp.lidRot || 0) + 'deg');
  }

  /* A CUT THAT RIDES A WARP. Card 10 blinks two eyes on a head that is TIPPING at
     the same time, and a cut is placed at a fixed box: the warp moves his eye
     sockets 7px and the closed eyes would sit beside them.

     .pspr IS THE FREE HOOK. The wrap has never carried an animation - .pspr-art
     owns the only one, and it owns the only transform-origin with it - so putting
     the head's own motion here and the blink on the art inside gives two nested
     transforms and the eye follows the socket for free. --org is the WARP's pivot
     expressed in this box's pixels, which is well outside the box; CSS is happy
     with that.

     THE CHILD MUST SHADOW EVERY PROPERTY IT USES, because custom properties
     inherit: `follow` writes --spr/--ms/--t/--ease/--org/--rot/--dy on the wrap and
     the art below writes its own --spr/--ms/--t/--ease/--org over them. --rot and
     --dy are NOT shadowed and must not be read by the child's keyframe; spr-blink
     is pure scaleY, which is why it can be the one that rides.

     `follow` NAMES THE WARP RATHER THAN COPYING IT. It held its own copy of the
     head's motion for one revision, which is three copies of the same five numbers
     on one card and a retune of the tilt that silently leaves the eyes behind. It
     is the warp's `file` now and the numbers are read back out of the scene's own
     warp list, so the eye cannot disagree with the socket. */
  if (sp.follow) {
    const f = [].concat(warps || []).filter(w => w && w.file === sp.follow)[0];
    if (!f || !f.pivot) {
      /* Named a warp this card does not have. Silence here would be a cut sitting
         still on a moving element, which is exactly the fault `follow` exists to
         fix, so say so and carry on without it. */
      console.warn('[aaru] sprite %s follows %s, which is not a warp on this card',
                   sp.file, sp.follow);
    } else {
    const fp = cardLocal(card, f.pivot[0], f.pivot[1]);
    wrap.classList.add('is-follow');
    wrap.style.setProperty('--spr', 'spr-' + f.motion);
    wrap.style.setProperty('--ms', (f.ms || 900) + 'ms');
    wrap.style.setProperty('--org', (fp.x - tl.x).toFixed(2) + 'px '
                                  + (fp.y - tl.y).toFixed(2) + 'px');
    if (f.rot !== undefined) wrap.style.setProperty('--rot', f.rot + 'deg');
    if (f.dy  !== undefined) wrap.style.setProperty('--dy', f.dy + 'px');
    if (f.ease) wrap.style.setProperty('--ease', f.ease);
    if (f.at) wrap.style.setProperty('--t', f.at + 'ms');
    }
  }

  const patch = document.createElement('img');
  patch.className = 'pspr-patch';
  patch.alt = '';
  patch.src = 'assets/images/' + sp.file + '-patch.png?v=' + BUILD;
  wrap.appendChild(patch);
  /* A single cut may contain several disconnected objects. Scene 9 uses one
     patched plate for the whole utensil group, then clips six copies of the art so
     every piece can fall with its own translation, rotation and start time. */
  const pieces = sp.pieces && sp.pieces.length ? sp.pieces : [null];
  pieces.forEach(piece => {
    const art = document.createElement('img');
    art.className = 'pspr-art';
    art.alt = '';
    art.src = 'assets/images/' + sp.file + '-sprite.png?v=' + BUILD;
    art.style.setProperty('--spr', 'spr-' + sp.motion);
    art.style.setProperty('--ms', (sp.ms || 700) + 'ms');
    const dx = piece && piece.dx !== undefined ? piece.dx : sp.dx;
    const dy = piece && piece.dy !== undefined ? piece.dy : sp.dy;
    const rot = piece && piece.rot !== undefined ? piece.rot : sp.rot;
    if (dx !== undefined)  art.style.setProperty('--dx', dx + 'px');
    if (dy !== undefined)  art.style.setProperty('--dy', dy + 'px');
    if (rot !== undefined) art.style.setProperty('--rot', rot + 'deg');
    if (sp.scale !== undefined) art.style.setProperty('--s2', String(sp.scale));
    if (piece && piece.mask) {
      /* ONE PIECE OF A MULTI-OBJECT CUT, CLIPPED TO ITS OWN SHAPE. `clip` was here
         and was an axis-aligned `inset()` rectangle per piece, which is the wrong
         instrument for six pieces of steel that overlap in x and in y: every
         rectangle cut across its neighbours, so a katori arrived in two halves with
         a diagonal gap and a tumbler lost a wedge. The sprite's own matte already
         knows the shapes - see tools/split-pieces.py - so a piece is masked by its
         connected component and `org` is that component's centroid. */
      art.classList.add('is-masked');
      art.style.setProperty('--mask',
        'url("assets/images/' + piece.mask + '.png?v=' + BUILD + '")');
      if (piece.org) art.style.setProperty('--org', piece.org);
    } else if (sp.org) {
      art.style.setProperty('--org', sp.org);
    }
    if (sp.ease) art.style.setProperty('--ease', sp.ease);
    const delay = (sp.at || 0) + (piece ? piece.delay || 0 : 0);
    if (delay) art.style.setProperty('--t', delay + 'ms');
    wrap.appendChild(art);
  });
  crop.appendChild(wrap);
  return wrap;
}

/** ONE RUMBLE LINE, as an SVG path in a 100 x 40 viewBox.

    A SINE ALONG +x WITH ITS AMPLITUDE ENVELOPED, which is what makes it read as a
    drawn line rather than as a graph: it leaves the belly nearly straight, curls
    through the middle and tapers off again. sin(pi*t)^0.55 is that envelope - fat
    across most of the span and pinched at both ends.

    POLYLINE, NOT CURVES, and 40 points over a line that is never more than about
    50 screen pixels long. Every point is well under a pixel from its neighbours at
    that size, so stroke-linejoin: round makes it smooth for free, and generating a
    cubic chain instead would only move the same arithmetic somewhere harder to read.

    `amp` and `waves` arrive in VIEWBOX UNITS, already converted by the caller,
    because the box is 100 long whatever the line's real length is. */
function curlPath(amp, waves) {
  const N = 40;
  let d = '';
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const env = Math.pow(Math.sin(Math.PI * t), 0.55);
    const x = 4 + t * 92;
    const y = 20 + amp * env * Math.sin(2 * Math.PI * waves * t);
    d += (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2) + ' ';
  }
  return d.trim();
}

/** A point measured on a RING-SIZED rendering of a card, in STAGE pixels, once that
    card has popped out to the middle of the screen.

    THE POP COLLAPSES TO ONE MULTIPLY, which is worth writing down because it looks
    like it should need the card's width and the border and RING_SCALE. A popped card
    is `translate(--px, --py) scale(--s * --pop)` about its own centre, and --px/--py
    are exactly what carries that centre to (STAGE_W/2, STAGE_H/2). A point sitting
    `d` from the centre therefore lands at the middle of the stage plus s*pop*d - and
    `d` in card pixels times RING_SCALE is `d` in ring pixels. So:

        stage = middle + pop * (ringPoint - ringCentre)

    and neither the card's own width nor the frame's border appears, which is why
    this is safe on a ring where two cards are different widths. */
function popStage(rx, ry, pop) {
  return { x: STAGE_W / 2 + pop * (rx - RING_W / 2),
           y: STAGE_H / 2 + pop * (ry - RING_H / 2) };
}

/* THE SNEEZE'S FLOUR. Card 2, and the only simulated effect in the game.

   WHY IT IS NOT PARTICLES-IN-A-KEYFRAME LIKE THE OTHER NINE. Two things in the ask
   rule that out. "Use the particle physics how it behaves in this situation
   logically" means the grains have to slow down, spread and settle differently
   according to how big they are, which one shared keyframe cannot express; and
   "make little flour particles come out of the scene" means they have to leave the
   card, which anything inside .card-crop cannot do - that box is overflow:hidden and
   it is the picture's own edge.

   So the flour lives in #postAir, a layer over the whole stage, and its positions
   are computed from where the popped card actually is. See popStage.

   THE MODEL, and what each term is actually doing.

     THE JET, NOT STOKES DRAG. It is tempting to give each grain a drag coefficient
     from its radius and call that physics. It would be wrong, and by a factor of
     about thirty: flour is 30-150 microns, its Stokes relaxation time is a few
     milliseconds, and a grain that small does not fly through air at all - it goes
     exactly where the air goes. What actually travels is the SNEEZE'S JET, and what
     decays is the jet's momentum. So `tau` here is the time constant of the AIR the
     grain is riding, and a bigger grain gets a longer one because it carries enough
     of its own momentum to keep going when the air stops.

     SETTLING IS SEPARATE, AND IT IS TINY. Once the jet is spent the grain does not
     fall, it sinks at its own terminal velocity - which for fine flour is a couple
     of pixels a second at this scale and for a clump is sixty. THAT is why a sneeze
     leaves a cloud hanging in the air while the crumbs drop out of it, and it is the
     single most recognisable thing about flour. Gravity is therefore not integrated
     as an acceleration at all; the grain relaxes towards `settle`.

     ONE SIZE PARAMETER DRIVES ALL OF IT. q in 0..1, drawn as Math.random()^2.2 so
     most grains are fine and a few are clumps, sets tau, the settling speed, the
     radius, the life, the launch speed and how much the grain wanders. That is what
     makes the cloud sort itself out over two seconds: the fines stall in front of
     him and hang, the middle drifts to the frame edge, and the clumps carry
     straight out of the picture. Roughly one in five clears the card, which is the
     "little flour particles come out of the scene" the ask names.

     THE CONE IS RADIAL FROM HIS MOUTH, not from the painted cloud. Every grain is
     seeded somewhere along the jet - the plume already has depth in the drawing -
     and thrown along the line from the mouth THROUGH itself, with the cone opening
     as it gets further out. A cloud pushed as a block reads as a wipe.

     TURBULENCE IS TWO SINES per grain at its own phase and frequency. Real curl
     noise would be better and needs a field; two sines are enough to stop a fan of
     grains reading as a fan, which is all this has to do at this size.

   CANVAS, NOT DIVS. A hundred and seventy soft blobs is a hundred and seventy
   composited layers as DOM, and every one of them needs a transform written per
   frame. One canvas and one pre-rendered grain stamped with drawImage is a single
   layer, and the soft radial edge that makes a blob read as flour rather than as a
   dot comes free with the stamp. */

/* The loop's handle, and a generation counter so a run that is torn down mid-blast
   cannot be resurrected by a frame that was already queued. formStop clears both. */
let airRaf = 0;
let airGen = 0;

/** One soft grain, drawn once into an offscreen canvas and stamped.

    `tint` IS AN ARGUMENT because the two things that use this are different
    MATERIALS over different backgrounds. Flour hangs over pale blue sky and is
    almost white. Road dust hangs over the road it came off, and the artist painted
    that dust at [237, 197, 135] against a road at [206, 182, 152] - warm, and
    LIGHTER than the surface, which is what makes it read as dust rather than as
    shadow. A cream-white grain over that reads as a highlight instead. */
function flourGrain(tint) {
  const G = 64;
  const c = document.createElement('canvas');
  c.width = G;
  c.height = G;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(G / 2, G / 2, 0, G / 2, G / 2, G / 2);
  /* WARM, AND NEVER FULLY OPAQUE. Two corrections from the first screenshot, which
     photographed something that read as a lens flare rather than as flour: the card
     behind it is pale blue sky over yellow sand, so a neutral white cloud on that is
     a hole in the picture rather than powder; and a grain whose centre is alpha 1
     stacks with its neighbours into a solid white core the moment forty of them
     overlap near the mouth. Cream, and 0.9 at the very centre, so density comes from
     how many grains are in front of each other and not from one of them. */
  const t = tint || [253, 250, 242, 250, 244, 230, 246, 238, 220];
  const rgb = (i, a) => 'rgba(' + t[i] + ', ' + t[i + 1] + ', ' + t[i + 2] + ', ' + a + ')';
  rg.addColorStop(0,    rgb(0, 0.95));
  rg.addColorStop(0.36, rgb(3, 0.62));
  rg.addColorStop(0.72, rgb(6, 0.20));
  rg.addColorStop(1,    rgb(6, 0));
  g.fillStyle = rg;
  g.fillRect(0, 0, G, G);
  return c;
}

/** A tiny cluster of dry white flour dust. There is no beige centre or rounded
    droplet highlight: each stamp is a loose group of micron-scale specks, while
    the radial stamp below is reserved for unresolved airborne haze. */
function flourSpeck(seed) {
  const G = 24;
  const c = document.createElement('canvas');
  c.width = G;
  c.height = G;
  const g = c.getContext('2d');
  const rnd = n => {
    const x = Math.sin(seed * 91.7 + n * 43.1) * 43758.5453;
    return x - Math.floor(x);
  };
  /* Several separate pinpricks in one stamp read as dry dust. One filled blob,
     however irregular its edge, reads as a wet clump once it is enlarged. */
  for (let p = 0; p < 5; p++) {
    const x = 5 + rnd(p) * 14;
    const y = 6 + rnd(p + 10) * 12;
    const r = 0.8 + rnd(p + 20) * 1.35;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255, 255, 252, ' + (0.62 + rnd(p + 30) * 0.30) + ')';
    g.fill();
  }
  return c;
}

/** Blow the flour off card `i`, and let it leave the picture. */
function flourBlast(i, spec) {
  const host = document.getElementById('postAir');
  if (!host) return;
  const f = spec.flour || {};
  const pop = spec.pop || 3;

  const cv = document.createElement('canvas');
  cv.width  = STAGE_W;
  cv.height = STAGE_H;
  cv.className = 'pair-canvas';
  host.replaceChildren(cv);
  const ctx = cv.getContext('2d');
  const hazeStamp = flourGrain([255, 255, 252, 253, 252, 247, 250, 248, 241]);
  const specks = [flourSpeck(1), flourSpeck(2), flourSpeck(3), flourSpeck(4)];

  const mouth = popStage((f.mouth ? f.mouth[0] : 53.3) / 100 * RING_W,
                         (f.mouth ? f.mouth[1] : 51.8) / 100 * RING_H, pop);
  const axis  = (f.axis === undefined ? -8 : f.axis) * Math.PI / 180;
  const half  = (f.spread === undefined ? 24 : f.spread) * Math.PI / 180;
  const reach = (f.reach || 80) * pop;
  const v0    = (f.v0 || 340) * pop;
  const drift = { x: (f.drift ? f.drift[0] : 22) * pop,
                  y: (f.drift ? f.drift[1] : -3) * pop };

  /* TWO POPULATIONS, AND THAT SPLIT IS WHAT MAKES IT READ AS FLOUR.

     One size distribution gave a single soft mass - the screenshot of it looks like
     a light going off beside his face, not like powder. What a photograph of flour
     in the air actually shows is a faint HAZE with distinct GRAINS flying out of it,
     and those are two different things: the haze is a cloud of particles too fine to
     resolve, so it is drawn as a few big, very transparent blobs that spread fast and
     hardly travel; the grains are the ones you can see, so they are small, much less
     transparent, barely spread, and they are what leaves the picture.

     It is also the honest reading of the physics already here. `q` is the size, and
     everything about a particle follows from it; the haze is simply what the bottom
     of that distribution looks like when you cannot see its members individually. */
  const bits = [];
  const N = f.n || 168;
  /* Much of the visible material is unresolved white haze. That is the dry
     flour carried by air; the remaining stamps are small clusters only so the
     plume stays readable against the pale card without becoming snowflakes. */
  const HAZE = 0.28;
  for (let k = 0; k < N; k++) {
    /* THE EXHALE ITSELF is the first few: right at his mouth, soft, faint and
       short-lived, so the blast has a source and not just a consequence. Eight of
       them and not fourteen, and half the size - at fourteen this was a white blob
       over his own hand, which is what made the first screenshot read as a flash
       going off rather than as a boy sneezing. */
    const puff = k < 8;
    const haze = !puff && (k % 100) / 100 < HAZE;
    const q = puff ? 0.04
            : haze ? Math.random() * 0.18
                   : Math.pow(Math.random(), 1.7);
    /* One quarter of the resolved dust is the coarser airborne fraction. These
       particles keep the sneeze jet's momentum longer, so a visible number cross
       the card edge. They are still dry white speck clusters, not heavy blobs. */
    const carrier = !puff && !haze && k % 4 === 0;
    /* Biased OUTWARD along the jet, so the mass sits where the artist painted the
       cloud rather than piling up at the mouth. */
    const s = puff ? Math.random() * 0.10
            : haze ? 0.15 + Math.random() * 0.85
                   : Math.pow(Math.random(), 0.45);
    /* The cone opens with distance, so the near end is a jet and the far end is a
       cloud - which is how the artist painted it. */
    const th = axis + (Math.random() * 2 - 1) * half * (0.3 + 0.7 * s);
    const r  = s * reach;
    const spd = v0 * (1 - 0.40 * s) * (0.55 + Math.random() * 0.75)
                   * (0.85 + q * 0.45) * (puff ? 0.42 : haze ? 0.38 : 1)
                   * (carrier ? 1.32 : 1);
    bits.push({
      x: mouth.x + Math.cos(th) * r,
      y: mouth.y + Math.sin(th) * r,
      vx: Math.cos(th) * spd,
      vy: Math.sin(th) * spd,
      /* THE JET'S MOMENTUM, IN SECONDS, and it is longer than a single grain's own
         drag time by design - see the block comment. A sneeze pushes for a few
         hundred milliseconds and the cloud goes with the air, so what decays here
         is the AIR. The first tuning had 0.15..0.57 and the screenshot at 670ms
         after the sneeze showed a cloud that had not visibly moved: a fine grain's
         whole travel was 80px on a 776px card, which is a glow appearing rather
         than flour flying. 0.24..0.70 puts a fine grain at about 200px - inside
         the frame, which is where fine flour belongs - and carries the heavier
         ones out of it. */
      tau:    0.12 + q * 0.35 + (carrier ? 0.16 : 0),
      settle: (1 + q * q * q * 34) * pop,         /* terminal sink, px per second */
      rad:    (puff ? 3.2 + Math.random() * 2.2
                    : haze ? 4.2 + Math.random() * 4.0
                           : 0.45 + q * 1.0) * pop,
      /* DILUTION. Haze is a cloud and spreads as it mixes with the air it rides; a
         grain is one object and does not. */
      grow:   (puff ? 11 : haze ? 8.5 : 0.45) * pop, /* px per second             */
      /* A GRAIN IS NEARLY SOLID AND THE HAZE IS NEARLY NOTHING. Density in the body
         of the cloud comes from thirty transparent blobs in front of each other,
         which is also why it thins as it spreads without anything computing that. */
      a0:     puff ? 0.18 : haze ? 0.10 + Math.random() * 0.065 : 0.62 + q * 0.24,
      life:   puff ? 0.45 + Math.random() * 0.25
                   : haze ? 2.2 + Math.random() * 0.7
                          : 3.15 - q * 1.25 + (carrier ? 0.28 : 0),
      /* Turbulence, as an acceleration. It has to scale with the jet it is
         perturbing or a faster cloud reads as a fan of straight lines. */
      wob:    (105 - q * 70) * pop,
      wf:     1.6 + Math.random() * 2.5,
      wp:     Math.random() * 6.283,
      soft:   puff || haze,
      stamp:  k % specks.length,
      /* A sneeze is a short pulse, not an instantaneous sheet. Emitting across
         140ms gives the plume a dense leading front and a widening tail. */
      age:    puff ? 0 : -Math.random() * 0.14,
    });
  }

  airGen += 1;
  const mine = airGen;
  let last = performance.now();
  const step = now => {
    if (mine !== airGen) return;
    /* CLAMPED, because a tab that was backgrounded hands back a dt of seconds and
       one Euler step that long throws every grain off the stage at once. */
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    ctx.clearRect(0, 0, STAGE_W, STAGE_H);

    let alive = 0;
    for (let k = 0; k < bits.length; k++) {
      const b = bits[k];
      b.age += dt;
      if (b.age >= b.life) continue;
      alive += 1;
      if (b.age < 0) continue;
      /* Relax towards where the air is taking it - the ambient drift, plus its own
         settling speed downwards - over its own tau. */
      const kk = Math.min(1, dt / b.tau);
      b.vx += (drift.x - b.vx) * kk
            + Math.cos(b.wp + b.age * b.wf * 6.283) * b.wob * dt;
      b.vy += (drift.y + b.settle - b.vy) * kk
            + Math.sin(b.wp * 1.7 + b.age * b.wf * 5.1) * b.wob * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rad += b.grow * dt;

      const t = b.age / b.life;
      /* Ramped in over 12% of its life rather than 5%: the flour is ALREADY in the
         drawing, so the blast has to look like the painted cloud coming apart, and
         a hard-edged appearance on frame one reads as something switching on. */
      const fade = t < 0.10 ? t / 0.10 : (t > 0.62 ? 1 - (t - 0.62) / 0.38 : 1);
      ctx.globalAlpha = Math.max(0, fade) * b.a0;
      const stamp = b.soft ? hazeStamp : specks[b.stamp];
      ctx.drawImage(stamp, b.x - b.rad, b.y - b.rad, b.rad * 2, b.rad * 2);
    }
    ctx.globalAlpha = 1;

    if (!alive) { cv.remove(); airRaf = 0; return; }
    airRaf = requestAnimationFrame(step);
  };
  airRaf = requestAnimationFrame(step);
}

/* Later recap scenes use the same stage-space integrator for different materials.
   The starting impulse, drag, gravity and drawing primitive change per material;
   the coordinate system does not, so a spray can visibly cross a card edge. */
let physicsRaf = 0;
let physicsGen = 0;

function physicsBurst(i, spec) {
  const host = document.getElementById('postAir');
  const p = spec.physics || {};
  if (!host || !p.kind) return;
  const pop = spec.pop || 3;
  const src = p.source || spec.at || [50, 50];
  const origin = popStage(src[0] / 100 * RING_W, src[1] / 100 * RING_H, pop);
  const cv = document.createElement('canvas');
  cv.width = STAGE_W;
  cv.height = STAGE_H;
  host.replaceChildren(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) return;

  const kind = p.kind;
  const dustStamp = flourGrain(kind === 'impact'
    ? [236, 231, 220, 224, 216, 202, 205, 197, 184]
    : [247, 232, 202, 235, 212, 174, 219, 192, 151]);
  /* A `flour-leak` KIND WAS HERE, with a white stamp of its own, and it went with
     the haze off card 8's packet: the user asked for that scene to be his face and
     nothing else. Nothing else used it. flourBlast() is a different code path and
     still has card 2's sneeze. */
  const bits = [];
  const rnd = (a, b) => a + Math.random() * (b - a);

  for (let k = 0; k < (p.n || 120); k++) {
    const q = Math.pow(Math.random(), 1.5);
    const b = {
      x: origin.x + rnd(-5, 5) * pop,
      y: origin.y + rnd(-3, 3) * pop,
      vx: 0, vy: 0, grav: 0, drag: 0, tau: 0, settle: 0,
      wob: 0, wf: rnd(1.2, 3.1), wp: rnd(0, Math.PI * 2),
      rad: 1, grow: 0, a0: 0.8, life: 1.4,
      age: -rnd(0, 0.18), soft: false, spin: rnd(-8, 8), rot: rnd(0, 6.283),
    };

    if (kind === 'dust' || kind === 'impact') {
      const fine = Math.random() < (kind === 'dust' ? 0.62 : 0.48);
      const side = Math.random() < 0.5 ? -1 : 1;
      const force = kind === 'dust' ? 1 : 0.55;
      b.vx = side * rnd(fine ? 100 : 260, fine ? 360 : 760) * pop * force;
      b.vy = -rnd(fine ? 35 : 120, fine ? 190 : 430) * pop * force;
      b.soft = fine;
      b.tau = fine ? rnd(0.13, 0.30) : rnd(0.38, 0.72);
      b.settle = fine ? rnd(8, 24) * pop : 0;
      b.grav = fine ? 0 : 480 * pop;
      b.rad = (fine ? rnd(4.5, 11) : rnd(0.7, 2.1)) * pop;
      b.grow = fine ? rnd(13, 27) * pop : 0;
      b.a0 = fine ? rnd(0.09, 0.18) : rnd(0.48, 0.82);
      b.life = fine ? rnd(1.8, 2.7) : rnd(1.0, 1.65);
    } else if (kind === 'liquid') {
      b.vx = -rnd(80, 285) * pop;
      b.vy = -rnd(130, 390) * pop;
      b.grav = 720 * pop;
      b.drag = rnd(0.18, 0.42);
      b.rad = rnd(1.1, 3.0) * pop;
      b.a0 = rnd(0.62, 0.94);
      b.life = rnd(0.9, 1.4);
    } else if (kind === 'crumb') {
      b.vx = rnd(-145, 70) * pop;
      b.vy = -rnd(35, 225) * pop;
      b.grav = 640 * pop;
      b.drag = rnd(0.22, 0.5);
      b.rad = rnd(0.7, 1.8) * pop;
      b.a0 = rnd(0.68, 0.95);
      b.life = rnd(0.75, 1.25);
    }
    bits.push(b);
  }

  physicsGen += 1;
  const mine = physicsGen;
  let last = performance.now();
  const step = now => {
    if (mine !== physicsGen) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    ctx.clearRect(0, 0, STAGE_W, STAGE_H);
    let alive = 0;
    for (let k = 0; k < bits.length; k++) {
      const b = bits[k];
      b.age += dt;
      if (b.age >= b.life) continue;
      alive += 1;
      if (b.age < 0) continue;
      if (b.tau) {
        const mix = Math.min(1, dt / b.tau);
        b.vx += (0 - b.vx) * mix
              + Math.cos(b.wp + b.age * b.wf * 6.283) * b.wob * dt;
        b.vy += (b.settle - b.vy) * mix
              + Math.sin(b.wp * 1.6 + b.age * b.wf * 5.2) * b.wob * dt;
      } else {
        b.vy += b.grav * dt;
        const damp = Math.exp(-b.drag * dt);
        b.vx *= damp;
        b.vy *= damp;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rad += b.grow * dt;
      b.rot += b.spin * dt;
      const t = b.age / b.life;
      const fade = t < 0.08 ? t / 0.08 : (t > 0.62 ? 1 - (t - 0.62) / 0.38 : 1);
      ctx.globalAlpha = Math.max(0, fade) * b.a0;
      if (kind === 'liquid') {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
        ctx.fillStyle = 'rgba(212, 224, 111, 0.95)';
        ctx.beginPath();
        ctx.ellipse(0, 0, b.rad * 0.62, b.rad * 1.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (kind === 'crumb') {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = 'rgba(219, 151, 57, 0.94)';
        ctx.fillRect(-b.rad, -b.rad * 0.55, b.rad * 2, b.rad * 1.1);
        ctx.restore();
      } else {
        ctx.drawImage(dustStamp, b.x - b.rad, b.y - b.rad, b.rad * 2, b.rad * 2);
      }
    }
    ctx.globalAlpha = 1;
    if (!alive) { cv.remove(); physicsRaf = 0; return; }
    physicsRaf = requestAnimationFrame(step);
  };
  physicsRaf = requestAnimationFrame(step);
}

/* THE BICYCLE'S DUST AND THE WIND OFF HIM. Card 4, and the second simulated
   effect on this screen - see flourBlast above for the first, whose integrator this
   follows deliberately so there is one way of doing particles here rather than two.

   WHAT IS DIFFERENT FROM THE FLOUR, and both differences are the ask.

     THE EMITTER MOVES. The flour comes off a boy standing still; this comes off a
     tyre that is travelling across the picture, so the spawn point has to be where
     the wheel IS on the frame the grain is born, not where it ends up. The bike is
     driven by a CSS animation, so this re-evaluates that animation's own easing
     curve (see bezier()) rather than guessing - dust that lags the wheel by 40ms
     reads as the wheel skidding.

     IT IS CLIPPED TO THE PICTURE. The flour was asked to LEAVE the card; dust
     thrown by a bicycle that is still half off-frame must not appear on the wooden
     background beside it. Same layer, same canvas trick, but the context is clipped
     to the card's picture rectangle in stage coordinates, which popStage gives us.

   THE PHYSICS, and what a tyre on dry sand actually does.

     DUST IS BORN AT THE CONTACT PATCH, not under the axle. The tyre lifts grains as
     it peels off the ground at the BACK of the contact patch, so the source is a
     little behind the wheel's lowest point, and the grains leave with the tread -
     i.e. BACKWARDS relative to travel, and upwards. That backwards throw is the
     whole reason a dust trail is left BEHIND a bicycle rather than around it.

     THEN THE WAKE TAKES OVER. A moving body drags air along with it and leaves a
     low-pressure wake; grains that have stopped get pulled gently after the bike.
     So each grain relaxes towards a small forward drift once its own launch
     momentum is spent, which is why a real trail leans forward at the top while its
     base stays put.

     GRAINS SORT THEMSELVES BY SIZE, exactly as the flour does and for the same
     reason: `q` sets the launch speed, the momentum time constant, the settling
     speed and the radius together. Sand grains fall out within a few hand-spans;
     the fine dust they knock loose hangs and spreads into the cloud the artist
     already painted at the left of this card.

   THE WIND LINES ARE ON THE SAME CANVAS, and that is not laziness. They are the
   same event - air moving past him - and drawing them here means they are born at
   his body's CURRENT position for free, which is the thing that makes a speed line
   read as speed rather than as a scratch on the picture. */

/** A cubic-bezier(x1,y1,x2,y2) timing function, evaluated the way CSS evaluates it.

    NEEDED BECAUSE TWO THINGS HAVE TO AGREE. The bicycle is moved by a CSS animation
    and the dust is spawned by JS, so if JS assumed a linear ride the dust would come
    off the back wheel everywhere except where the wheel actually was. Newton on x to
    invert the parametric curve, then evaluate y - twelve iterations is far more than
    enough at this precision and costs nothing once per frame. */
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = t => ((ax * t + bx) * t + cx) * t;
  const dx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    let t = x;
    for (let i = 0; i < 12; i++) {
      const e = fx(t) - x;
      if (Math.abs(e) < 1e-6) break;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    t = Math.max(0, Math.min(1, t));
    return ((ay * t + by) * t + cy) * t;
  };
}

let rideRaf = 0;
let rideGen = 0;

/** Dust off the back tyre and wind past his body, for as long as he is riding. */
function rideAir(i, spec) {
  const host = document.getElementById('postAir');
  const card = formCards[i];
  if (!host || !card) return;
  const r = spec.ride || {};
  const pop = spec.pop || 3;

  const cv = document.createElement('canvas');
  cv.width  = STAGE_W;
  cv.height = STAGE_H;
  host.replaceChildren(cv);
  const ctx = cv.getContext('2d');
  /* Warm, and lighter than the road - see flourGrain. */
  const grain = flourGrain(r.tint || [248, 230, 196, 242, 214, 172, 234, 204, 158]);

  /* THE CLIP: the card's PICTURE rectangle in stage pixels. .card-crop is the card's
     box inset by the white frame on every side, and BW is in card pixels, so it
     scales by RING_SCALE with everything else. */
  const half = { w: card.w * RING_SCALE * pop / 2, h: CARD_H * RING_SCALE * pop / 2 };
  const edge = BW * RING_SCALE * pop;
  const clip = { x: STAGE_W / 2 - half.w + edge, y: STAGE_H / 2 - half.h + edge,
                 w: half.w * 2 - edge * 2, h: half.h * 2 - edge * 2 };

  /* WHERE THE BACK TYRE MEETS THE ROAD, measured on the 3x card and given here as a
     percentage of the ring like every other `at` in SCENE_FX. `lag` walks it back
     along the travel to the rear of the contact patch, which is where the tread
     actually peels off the ground. */
  const wheel = popStage((r.wheel ? r.wheel[0] : 34.4) / 100 * RING_W,
                         (r.wheel ? r.wheel[1] : 94.0) / 100 * RING_H, pop);
  const body  = popStage((r.body ? r.body[0] : 48.5) / 100 * RING_W,
                         (r.body ? r.body[1] : 33.0) / 100 * RING_H, pop);

  /* HOW FAR THE BIKE TRAVELS ON SCREEN. The sprite's --dx is in CARD pixels, so it
     reaches the stage multiplied by the card's own scale - the same 2.34 that
     everything else on a popped card goes through. */
  const sprite = [].concat(spec.sprite)[0];
  const travel = -(sprite.dx || 0) * RING_SCALE * pop;
  const rideMs = sprite.ms || 1400;
  const ease = bezier.apply(null, r.ease || [0.16, 0.7, 0.3, 1]);

  const bits = [];
  const born = { last: 0 };

  rideGen += 1;
  const mine = rideGen;
  const t0 = performance.now();
  let last = t0;

  const step = now => {
    if (mine !== rideGen) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    const age = now - t0;
    /* Where the bike is: 0 at the far left, 1 home. */
    const u = Math.min(1, age / rideMs);
    const off = -travel * (1 - ease(u));       /* still to go, in stage px, negative */
    const riding = age < rideMs;
    /* Speed in stage px per second, from the curve rather than from a constant -
       it is what decides how hard the tyre throws and how long the wind lines are. */
    const uNext = Math.min(1, (age + 16) / rideMs);
    const speed = riding ? travel * (ease(uNext) - ease(u)) / 0.016 : 0;

    ctx.clearRect(0, 0, STAGE_W, STAGE_H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(clip.x, clip.y, clip.w, clip.h);
    ctx.clip();

    /* SPAWN. Rate follows speed, because a tyre that is barely moving lifts barely
       any dust - and it keeps going briefly after he stops, because the grains
       already in the air do not know he has. */
    if (age < rideMs + (r.after || 260)) {
      const want = (r.rate || 150) * dt * (0.25 + 0.75 * Math.abs(speed) / Math.max(1, travel / (rideMs / 1000)));
      born.last += want;
      while (born.last >= 1) {
        born.last -= 1;
        const q = Math.pow(Math.random(), 1.6);
        /* BACKWARDS AND UP off the contact patch: 150 to 215 degrees is up-and-left
           when he is travelling right, which is the tread throwing the grain the way
           it came. */
        const th = (152 + Math.random() * 62) * Math.PI / 180;
        const sp = (0.22 + q * 0.5) * Math.abs(speed) * (0.5 + Math.random() * 0.9);
        bits.push({
          kind: 'dust',
          x: wheel.x + off - (r.lag || 10) * pop + (Math.random() - 0.5) * 8 * pop,
          y: wheel.y + (Math.random() - 0.5) * 4 * pop,
          vx: Math.cos(th) * sp,
          vy: Math.sin(th) * sp,
          tau:    0.10 + q * 0.30,
          settle: (3 + q * q * 62) * pop,
          /* BIGGER AND LESS TRANSPARENT THAN THE FLOUR, and the reason is the
             background rather than the material. Flour hangs over pale blue sky and
             reads at almost any alpha; road dust hangs over the ROAD, and the road
             it came off is the same warm tan the dust is. The first tuning was a
             faithful 0.12-0.38 and it photographed as a smudge indistinguishable
             from the haze the artist had already painted there. */
          rad:    (2.6 + q * 5.2) * pop,
          grow:   (18 * (1 - q) + 2) * pop,
          a0:     0.26 + q * 0.34,
          life:   1.6 - q * 0.55,
          wob:    (34 - q * 26) * pop,
          wf:     1.2 + Math.random() * 2.0,
          wp:     Math.random() * 6.283,
          age: 0,
        });
      }
      /* WIND LINES, far fewer and only while he is actually moving. */
      if (riding && Math.abs(speed) > travel / (rideMs / 1000) * 0.35
          && Math.random() < (r.wind === undefined ? 0.55 : r.wind)) {
        /* ACROSS HIM, NOT ABOVE HIM. `body` is the centre of his whole silhouette
           and `bodyH` its height in ring pixels - head to pedals, 150, not the 34
           that put every stroke at hat height. And the spawn x spans his own width
           rather than sitting ahead of him, so a stroke is born ON him and streaks
           off his back, which is where wind actually is. */
        const spread = (r.bodyH || 150) * pop;
        bits.push({
          kind: 'wind',
          x: body.x + off + (-26 + Math.random() * 76) * pop,
          y: body.y + (Math.random() - 0.5) * spread,
          vx: -Math.abs(speed) * (0.55 + Math.random() * 0.35),
          vy: (Math.random() - 0.5) * 6 * pop,
          /* LONG, AND THAT IS THE WHOLE DIFFERENCE between a speed line and a
             scratch: a stroke reads as motion when it is much longer than it is
             wide and much longer than the thing is moving per frame. */
          len: (26 + Math.random() * 40) * pop,
          wide: (1.6 + Math.random() * 2.2) * pop,
          a0: 0.42 + Math.random() * 0.26,
          life: 0.30 + Math.random() * 0.22,
          age: 0,
        });
      }
    }

    let alive = 0;
    for (let k = 0; k < bits.length; k++) {
      const b = bits[k];
      b.age += dt;
      if (b.age >= b.life) continue;
      alive += 1;
      const t = b.age / b.life;

      if (b.kind === 'wind') {
        /* A SPEED LINE IS NOT A PARTICLE. It does not fall, it does not spread; it
           streaks back past him and is gone. Drawn as a tapered stroke so it has a
           head and a tail rather than reading as a scratch. */
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        const fade = t < 0.18 ? t / 0.18 : 1 - (t - 0.18) / 0.82;
        /* ADDITIVE, and that one line is what makes a speed line work on every
           part of this picture at once.

           The problem it solves: white on pale blue sky and white on pale tan road
           are both worth about twenty levels of luma, so a plain stroke is nearly
           invisible - and the obvious fix, a soft dark stroke underneath to give the
           bright one an edge, photographed as a grey smudge the moment a line
           crossed his dark brown hair. 'lighter' ADDS instead of covering: over the
           hair it is a bright streak because the hair is dark, over the sky it blows
           gently to white because the sky is already bright. Nothing it draws can
           ever darken anything, so there is no smudge to get wrong. */
        const g = ctx.createLinearGradient(b.x, b.y, b.x + b.len, b.y);
        const lt = b.a0 * fade;
        g.addColorStop(0, 'rgba(255, 255, 255, 0)');
        g.addColorStop(0.42, 'rgba(255, 252, 244, ' + lt.toFixed(3) + ')');
        g.addColorStop(0.66, 'rgba(255, 250, 240, ' + (lt * 0.78).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = g;
        ctx.lineWidth = b.wide;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x + b.len, b.y);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        continue;
      }

      /* Dust: the same relaxation the flour uses. The target is the WAKE - a little
         forward drift, because the bicycle drags air after it - plus its own
         settling speed downward. */
      const kk = Math.min(1, dt / b.tau);
      b.vx += ((r.wake === undefined ? 16 : r.wake) * pop - b.vx) * kk
            + Math.cos(b.wp + b.age * b.wf * 6.283) * b.wob * dt;
      b.vy += (b.settle - b.vy) * kk
            + Math.sin(b.wp * 1.7 + b.age * b.wf * 5.1) * b.wob * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rad += b.grow * dt;

      const fade = t < 0.10 ? t / 0.10 : (t > 0.45 ? 1 - (t - 0.45) / 0.55 : 1);
      ctx.globalAlpha = Math.max(0, fade) * b.a0;
      ctx.drawImage(grain, b.x - b.rad, b.y - b.rad, b.rad * 2, b.rad * 2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (!alive && age > rideMs + (r.after || 260)) { cv.remove(); rideRaf = 0; return; }
    rideRaf = requestAnimationFrame(step);
  };
  rideRaf = requestAnimationFrame(step);
}

/** One card's element comes alive: the card enlarges, the overlay plays, the cue
    fires. Returns the effect node so the caller can take it away again.

    THE ENLARGE AND THE SHAKE ARE THE SAME BEAT, one or the other. Three cards are
    impacts - the crash, the dog's grab, the utensils - and a shake says impact
    where a swell says "look here". Neither class is ever removed: handing the
    element back to .pcard.is-home would restart its landing bounce. */
function wakeCard(i) {
  const spec = SCENE_FX[i];
  const card = formCards[i];
  /* THE EFFECT GOES INSIDE THE CARD, not into #postFx, so it zooms and pans with the
     picture through a closeup. Everything in .card-crop does; anything in stage
     coordinates does not, and the first screenshot of the closeup showed the cost -
     the rumble waves stayed where his belly used to be. #postFx is still the
     fallback for a card whose crop cannot be found. */
  const crop = cardLive(card);
  const host = crop || document.getElementById('postFx');
  const at = crop ? fxLocal(i) : fxPoint(i);
  /* Sizes and distances were authored in stage pixels; inside a card drawn at
     RING_SCALE they have to be divided by it to keep the same on-screen size. A card
     with a closeup then magnifies its own effect, which is right - a wave off a
     belly should grow as you move in on the belly. */
  const px = crop ? 1 / RING_SCALE : 1;
  if (!host || !spec || !at) return null;

  /* THE CARD COMES FORWARD AND COMES ON, and the light STAYS on. The trail lighting
     each picture as it passes is what makes it the thing doing something, rather
     than a pointer moving over ten pictures that never change.

     CLOSEUP OR POP, NEVER BOTH: they both animate the card's transform, so running
     both would simply mean the later rule wins and the other is never seen. A card
     with `close` set goes close - in, hold, out - and the rest keep the small
     enlarge.

     No class is ever REMOVED except by the swap to .is-shut, because handing the
     element back to .pcard.is-home restarts its landing bounce. */
  if (card && card.el) {
    const el = card.el;
    /* `pop`, not `close` - the key was renamed when the closeup became a pop-out and
       this test was not, so for one build every card silently fell through to the
       small enlarge and nothing popped at all. The harness could not see it: the
       waves still spawned, the cards still lit, and only a screenshot showed the
       card sitting in its slot. */
    if (spec.pop) {
      /* NO FRAMING ZOOM. The card travels to the middle of the stage and gets
         `pop` times bigger, and the artwork inside it is left alone - the user's
         "after the scenes comes in center remove the zoom in effect".

         SO `pop` IS THE ONLY SIZE KNOB NOW, and what it can buy is capped by the
         art: assets/images/*.webp give about 2.4 native pixels per 1x card pixel,
         so at pop 3 the card is already displayed about 1.25x larger than the
         source can fill. Past roughly pop 3.6 the picture is being invented.

         WHAT THIS COSTS is that a scene shows its WHOLE frame, so the subject is
         however big the artist drew it - card 1's boy is about 150px tall on a
         1920 stage. That is the frame every scene's action has to read at, which
         is why card 1's hand is a real cut-out rather than a 2px scale on the
         picture, and why card 2's flour leaves the card altogether.

         --ctx / --cty / --zoom are gone with the animation that read them, and so
         is `focus`, which only ever fed them. If a scene's action stops reading,
         the knob is `pop` and not a zoom coming back. */
      el.style.setProperty('--pop', String(spec.pop || 3));
      el.style.setProperty('--close-ms', (spec.closeMs || 620) + 'ms');

      /* THE TRAVEL TO THE MIDDLE OF THE STAGE, in stage pixels - see the CSS for why
         that is the right unit here. RING[i] is where the card's centre is now. */
      el.style.setProperty('--px', (STAGE_W / 2 - RING[i].x).toFixed(1) + 'px');
      el.style.setProperty('--py', (STAGE_H / 2 - RING[i].y).toFixed(1) + 'px');

      el.classList.add('is-close');
      /* .is-front marks the one that is OUT, which .is-close cannot: .is-close is
         never removed (it holds the final transform), so by the ninth scene nine
         cards would have it and nothing would dim. */
      formCards.forEach(c => { if (c && c.el) c.el.classList.remove('is-front'); });
      el.classList.add('is-front');
      /* The ring comes above him, the other nine dim, and HE GOES AWAY - a card at
         932px does not cover the whole stage, so a boy standing at its edge is a
         distraction whichever layer he is on.

         #finaleSnap IS IN THIS LIST NOW, and it has to be: he holds the SNAP POSE
         through the whole recap, so on the normal path that element IS the boy in
         the middle and the two below are not on screen at all until he claps at the
         end. Hiding only those two left him standing beside every closeup. */
      const ring = ringEl();
      if (ring) ring.classList.add('is-focus');
      MIDDLE_OF_RING.forEach(id => {
        const a = document.getElementById(id);
        if (a) a.classList.add('is-away');
      });
      recapFocus += 1;
      const mine = recapFocus;
      /* ...and it goes home at the end of its own hold, rather than snapping back:
         a closeup that reverses instantly undoes the thing it was showing. The ring
         drops back down and the others come up with it, once the picture has
         actually landed. */
      formTimers.push(setTimeout(() => {
        el.classList.add('is-shut');
        formTimers.push(setTimeout(() => {
          /* ONLY IF NOTHING ELSE HAS POPPED SINCE. Scenes overlap: the next one wakes
             before this restore fires, and without this check it undoes the next
             scene's hide instead of its own. */
          if (mine !== recapFocus) return;
          const r = ringEl();
          if (r) r.classList.remove('is-focus');
          el.classList.remove('is-front');
          /* ...and he comes back with the ring, once the picture has landed. */
          MIDDLE_OF_RING.forEach(id => {
            const a = document.getElementById(id);
            if (a) a.classList.remove('is-away');
          });
        }, RECAP_SHUT_MS));
      }, (spec.hold || RECAP_CARD_MS)));
    } else {
      el.classList.add(spec.jolt ? 'is-jolt' : 'is-pop');
    }
    el.classList.add('is-lit');
  }

  /* PARKED SCENES STOP HERE. Everything above is the travel to the middle of the
     screen, which every card still does; everything below is the scene coming
     alive. ALL TEN ARE LIVE now - SCENES_LIVE is [0..9] and has been for a while,
     so this gate does nothing in the shipped build; the note that used to sit here
     said "only cards 1 and 2 do", which stopped being true two passes ago.

     IT STILL MATTERS THAT THE CUE IS BELOW IT rather than above. `sfx(spec.cue)`
     is at the end of this function, so parking a scene silences it as well as
     stilling it - which is what you want from a gate called SCENES_LIVE, and worth
     knowing before adding a card to the list with a cue already on it. */
  if (SCENES_LIVE.indexOf(i) < 0) { recapCard = i; return null; }

  /* THE CUT-OUT ELEMENT, where there is one - his forearm on card 1, the lid on
     card 2. The patch under it hides the original so the thing does not appear
     twice; see wakeSprite. */
  const spr = wakeSprite(i);

  /* THE SNEEZE ITSELF, on the card that has one. It shakes the ARTWORK and not the
     card: the card's own transform is holding the pop-out and a second animation on
     it would simply replace that and drop the picture back into the ring. .card-live
     is the box inside the clipping window and it has nothing else animating it,
     which is exactly what it is kept for. */
  if (spec.shake && card && card.el) {
    formTimers.push(setTimeout(() => card.el.classList.add('is-sneeze'), spec.shake));
  }

  /* THE FLOUR, which is the one effect here that is neither a keyframe nor a cut. It
     runs in STAGE coordinates so that it can leave the picture - see flourBlast. */
  if (spec.flour) {
    formTimers.push(setTimeout(() => flourBlast(i, spec), spec.flour.at || 0));
  }

  /* ...and the bicycle's dust and wind, which start on the frame he starts moving. */
  if (spec.ride) {
    formTimers.push(setTimeout(() => rideAir(i, spec), spec.ride.at || 0));
  }

  /* Scene-specific material physics for the later cards: impact dust, liquid and
     crumbs. These run in stage coordinates so material may cross the picture
     boundary when the event gives it enough momentum. */
  if (spec.physics) {
    formTimers.push(setTimeout(() => physicsBurst(i, spec), spec.physics.at || 0));
  }

  const fx = buildFx(i, spec, host, at, px);

  /* AND THE OVERLAYS THAT ARE NOT THE CARD'S ONE EFFECT. `fx` is a single
     primitive at a single point, which was enough while a scene did one thing;
     card 10 does four - the locket sways and glints, Amma's eyes light up and
     Aaru blushes - and three of those are overlays at three different places.

     EACH ENTRY IS A SPEC IN ITS OWN RIGHT, with its own `at`, `fx`, `n`, `d`, `c`,
     `ms` and `t`, so buildFx needs no special case: it is called again with the
     entry standing in for the scene. `t` is what sequences them.

     THEY GO WITH THE CARD'S OWN EFFECT. recapSparkle takes `fx` away a beat after
     the hold (see the note there); these are not handed back through that channel,
     so they clear themselves on the same clock. Without it a lit eye stays lit for
     the rest of the recap - .pfx-bit's animations are `forwards`. */
  [].concat(spec.overlays || []).forEach(ov => {
    const p = crop ? cardLocal(card, ov.at[0] / 100 * RING_W, ov.at[1] / 100 * RING_H)
                   : fxPoint(i);
    const el = p && buildFx(i, ov, host, p, px);
    if (el) formTimers.push(setTimeout(() => el.remove(),
                                       (spec.hold || RECAP_CARD_MS) + 400));
  });

  /* ...AND THE LETTERING, which is a picture rather than a particle and so is
     none of buildFx's business. It takes itself away when its animation ends -
     see wakeOneLetter - so unlike the overlays above it is not on a timer of its
     own and is not handed back through `fx`. The setTimeout is only its cue: it
     is on formTimers, so a skip during the closeup never spawns it. */
  [].concat(spec.letter || []).forEach(sp => {
    formTimers.push(setTimeout(() => wakeOneLetter(card, sp, px), sp.at || 0));
  });

  /* THE CUE IS PANNED TO THE PICTURE, so the sound comes from the thing that is
     moving - the same thing the round-end cheer does with its hits.

     `cueAt` IS MILLISECONDS, and it used to be a fraction of `ms`. It changed
     because the cards that sound are timed against the card ARRIVING - the sneeze
     lands 880ms in, 60ms after the pop-out finishes - and a fraction of a
     particle's own lifetime cannot say that. The one card that used the old form,
     6's splash at 0.45 of 520ms, is 234ms and was converted rather than dropped. */
  /* A CARD MAY NOW SOUND MORE THAN ONCE. Eight of the nine that sound do it once,
     with `cue` and `cueAt`, which is the form every one of them used and still
     uses. Card 4 does two things at two times - the bicycle arrives over 1.4s and
     THEN he rings the bell - so it carries `cues: [[name, ms], ...]` instead.

     THEY ARE NOT INTERCHANGEABLE WITH `overlays`, which is the other list on a
     scene: an overlay is a second PICTURE effect and gets its own geometry, while
     these are the same event heard twice and share the card's pan. Two fields
     rather than one general one, because a card with a single cue reading
     `cues: [['ting', 2260]]` would be noise around the common case.

     BOTH FORMS PAN TO THE CARD, which is what makes the sound come from the
     picture that is moving. */
  const cues = spec.cues || (spec.cue ? [[spec.cue, spec.cueAt || 0]] : []);
  if (cues.length) {
    const pan = panAt ? panAt(RING[i].x) : 0;
    cues.forEach(([name, at]) => sfx(name, { pan: pan, delay: (at || 0) / 1000 }));
  }

  recapCard = i;
  /* ONE NODE GOES BACK, because the caller's contract is "here is the thing to take
     away later". A card with no overlay but with a cut-out still needs a node to
     hang that sprite off, so it gets an empty one. */
  const node = fx || (spr ? document.createElement('div') : null);
  if (!node) return null;
  /* The sprite pair is a child of the CARD rather than of #postFx, so formStop's
     sweep of the layers would not reach it - it goes when the ring is emptied, but
     a run that is merely moving on has to take it away itself or every woken
     picture keeps its patch forever. */
  if (spr) node.__spr = spr;
  return node;
}

/** THE OVERLAY ON ONE CARD: a zero-size .pfx point over the picture, and the
    particles that radiate out of it. `fx` names which kind and the card's own
    fields configure it; a card with no `fx` has no overlay and gets null back.

    Split out of wakeCard so that function reads as the four things it does - wake
    the picture, wake its cut-outs, fire its cue, hand back what to remove - rather
    than as those four things wrapped round three hundred lines of particle
    geometry. */
function buildFx(i, spec, host, at, px) {
  if (!spec || !spec.fx) return null;
  const fx = document.createElement('div');
  fx.className = 'pfx is-' + spec.fx;
  fx.style.left = at.x.toFixed(1) + 'px';
  fx.style.top  = at.y.toFixed(1) + 'px';

  const n = spec.n || 6;

  /* A STOMACH RUMBLING, DRAWN THE WAY AN ILLUSTRATOR DRAWS IT: a few curly lines
     coming off the belly, into the open air beside him.

     SVG RATHER THAN A DIV, and that is the whole reason this primitive exists
     instead of another .pfx-bit. A curl is a squiggle - a stroked path - and the
     other four effects are all a circle scaling or travelling, which a div can do
     and a squiggle cannot. Each line is generated here rather than being an asset,
     so its length, its amplitude and how many waves it has are numbers in SCENE_FX.

     TWO PATHS PER LINE, the same `d` drawn twice: a fat cream one under a thin
     orange one. That is what makes an orange line readable over a card that is
     already cream wall, yellow sand and an orange-striped shirt - wherever the
     background swallows one of the two, the other stands out. Measured, and the
     numbers are in SCENE_FX card 1.

     IT DRAWS ITSELF ON. stroke-dasharray with pathLength=100 means one keyframe on
     stroke-dashoffset walks the line out from its start, which reads as the sound
     leaving him rather than as a shape appearing beside him. */
  if (spec.fx === 'curl') {
    const cu = spec.curl || {};
    const mid = (n - 1) / 2;
    for (let k = 0; k < n; k++) {
      const j = k - mid;                       /* -1, 0, +1 for three lines */
      const len = (spec.d || 13) * (1 - 0.15 * Math.abs(j)) * px;
      const amp = (cu.amp || 1.7) * (1 - 0.12 * Math.abs(j)) * px;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 40');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('class', 'pfx-curl');
      /* The path is built in the viewBox's own units, so `amp` and the stroke
         widths are converted through the same 100/len that the box is. */
      const u = 100 / len;
      const d = curlPath(amp * u, cu.waves || 2.5);
      ['pfx-curl-halo', 'pfx-curl-ink'].forEach(cls => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('pathLength', '100');
        path.setAttribute('class', cls);
        svg.appendChild(path);
      });
      svg.style.width  = len.toFixed(2) + 'px';
      svg.style.height = (len * 0.4).toFixed(2) + 'px';
      /* Staggered DOWN HIS SIDE as well as fanned, or three lines from one point
         cross each other into a tangle. The x nudge keeps the outer two off his
         silhouette, which curves away above and below the middle one. */
      const dy = j * (cu.step || 4) * px;
      const dx = Math.abs(j) * (cu.step || 4) * 0.42 * px;
      /* RELATIVE TO .pfx, WHICH IS ALREADY AT `at`. .pfx is a zero-size point
         positioned over the belly and every primitive places its children against
         that origin - .pfx-bit does it with left:0/top:0 and a transform. Adding
         `at` again here put the curls 226 card pixels further right, i.e. outside
         a 374-wide crop, where overflow:hidden ate them: the first screenshot of
         this effect showed a popped card with nothing on it at all.
         The 0.04 and 0.2 put the PATH's start on that origin rather than the
         box's corner - the path begins at x=4 of a 100-wide viewBox and runs
         along y=20 of 40, and the box is drawn len by len*0.4. */
      svg.style.left = (dx - len * 0.04).toFixed(2) + 'px';
      svg.style.top  = (dy - len * 0.20).toFixed(2) + 'px';
      svg.style.setProperty('--c',  spec.c || '#e2560f');
      svg.style.setProperty('--h',  spec.halo || 'rgba(255, 244, 224, 0.96)');
      svg.style.setProperty('--a',  ((cu.a || 182) - j * (cu.fan || 13)).toFixed(1) + 'deg');
      svg.style.setProperty('--ms', (spec.ms || 820) + 'ms');
      svg.style.setProperty('--t',  ((cu.lead || 0) + k * (cu.gap || 340)) + 'ms');
      fx.appendChild(svg);
    }
    host.appendChild(fx);
    return fx;
  }

  for (let k = 0; k < n; k++) {
    const bit = document.createElement('div');
    bit.className = 'pfx-bit';
    bit.style.setProperty('--c', spec.c);
    bit.style.setProperty('--ms', (spec.ms || 450) + 'ms');
    /* Every length below is written through this, so one card living in stage
       coordinates and nine inside their cards cannot drift apart. */
    const L = v => (v * px).toFixed(1) + 'px';
    /* WHEN THIS OVERLAY STARTS, and it is a field rather than always zero because
       a card may now carry SEVERAL of them - see `overlays` in SCENE_FX. Card 10
       lights Amma's eyes, blushes Aaru's cheeks and glints the locket from the one
       scene entry, and the order they arrive in is the beat. */
    const base = spec.t || 0;
    /* Staggered, and unevenly: a spray that arrives on a grid reads as a
       mechanism. The same trick the snap's sparks use. */
    bit.style.setProperty('--t', (base + (k % 3) * 34 + (k % 2) * 18) + 'ms');

    if (spec.fx === 'ring') {
      /* Two dings of one bell: the second larger and later, which is what makes
         टिन-टिना readable with the sound off. */
      bit.style.setProperty('--w', L(10 + k * 4));
      bit.style.setProperty('--s2', String((spec.s2 || 4.2) * (1 + k * 0.22)));
      bit.style.setProperty('--t', (k * 130) + 'ms');

    } else if (spec.fx === 'splash') {
      /* Droplets fan up and out along the painted arc, then fall. */
      const f = n > 1 ? k / (n - 1) : 0.5;
      bit.style.setProperty('--w', L(5 + (k % 2) * 3));
      bit.style.setProperty('--dx', L(-spec.d * (0.35 + f * 0.9)));
      bit.style.setProperty('--dy', L(-spec.d * (0.5 + (1 - f) * 0.7)));

    } else if (spec.fx === 'chime') {
      /* Two musical notes rise from the handlebar in time with the two bell hits;
         two smaller glints follow them. Unlike the old expanding wave, every mark
         has a familiar, child-readable relationship to the sound. */
      const ch = spec.chime || {};
      const note = k < 2;
      bit.classList.add(note ? 'is-note' : 'is-glint');
      bit.textContent = note ? '♪' : '✦';
      bit.style.setProperty('--w', L(note ? 18 : 8));
      bit.style.setProperty('--dx', L((note ? (k ? 1 : -1) : (k === 2 ? -0.55 : 0.7))
        * (ch.spread || 17)));
      bit.style.setProperty('--dy', L(-(note ? (ch.lift || 39) + k * 5
        : 25 + (k - 2) * 8)));
      bit.style.setProperty('--rot', (note ? (k ? 9 : -8) : (k === 2 ? -20 : 18)) + 'deg');
      bit.style.setProperty('--t', ((ch.lead || 0) + (note ? k : k - 2)
        * (ch.gap || 165) + (note ? 0 : 74)) + 'ms');
      if (spec.halo) bit.style.setProperty('--h', spec.halo);

    } else if (spec.fx === 'shock') {
      /* SHOCK LINES - straight tapered strokes radiating off a head, the mark an
         animator puts round a character at the instant of a reaction.

         LEFT AND RIGHT ONLY. A full ring of them is the honest drawing of the idiom
         and it is the wrong drawing for THIS picture: above his head is the top of
         the frame and below it is his own body, so half a ring would land on him or
         be cut off. Splitting the count into two fans over the open sky either side
         keeps the idiom and keeps every stroke on background.

         `d` IS THE INNER RADIUS, not the travel. A shock line starts clear of the
         head and grows outward; starting at the anchor would draw eight spokes
         across his face. */
      const sh = spec.shock || {};
      const per = Math.max(1, Math.floor(n / 2));
      const side = k < per ? 1 : -1;                 /* +1 left, -1 right */
      const j2 = (k % per) - (per - 1) / 2;
      const ang = (side > 0 ? 180 : 0) + j2 * ((sh.spread || 52) / Math.max(1, per - 1));
      bit.classList.add('is-line');
      bit.style.setProperty('--w', L(sh.len || 20));
      bit.style.setProperty('--h', L(sh.wide || 2.6));
      bit.style.setProperty('--d', L(spec.d || 60));
      bit.style.setProperty('--a', ang.toFixed(1) + 'deg');
      bit.style.setProperty('--c2', spec.halo || 'rgba(255, 246, 230, 0.95)');
      /* The two fans fire together and the strokes within a fan a beat apart, so it
         reads as one burst rather than as a rotating sweep. */
      bit.style.setProperty('--t', ((sh.lead || 0) + Math.abs(j2) * (sh.gap || 46)) + 'ms');

    } else if (spec.fx === 'twinkle') {
      /* One star on the gem, the rest orbiting off it. */
      if (k === 0) {
        bit.classList.add('is-star');
        bit.style.setProperty('--w', L(26));
        bit.style.setProperty('--d', L(0));
        bit.style.setProperty('--a', '0deg');
      } else {
        bit.style.setProperty('--w', L(7));
        bit.style.setProperty('--d', L(spec.d));
        bit.style.setProperty('--a', (-40 + k * 95) + 'deg');
      }

    } else if (spec.fx === 'glow') {
      /* A LIGHT COMING UP INSIDE SOMETHING - Amma's eyes, and the blush on Aaru's
         cheeks. `d` is the bloom's DIAMETER rather than a travel: nothing here
         moves, which is the whole difference between this and every other
         primitive in this function. `o2` is what it fades to, so the same rule
         gives a light that goes out and a blush that does not. */
      bit.style.setProperty('--w', L(spec.d || 24));
      if (spec.o2 !== undefined) bit.style.setProperty('--o2', String(spec.o2));
      if (n > 1) bit.style.setProperty('--t', (base + k * (spec.gap || 120)) + 'ms');

    } else if (spec.fx === 'shine') {
      /* THE GEM CATCHING THE LIGHT. Bit 0 is the bloom inside the stone, sized by
         `d`; the rest are four-point glints that turn on top of it, sized by `w`
         and squared to the gem's own facets by `a`. */
      if (k === 0) {
        bit.style.setProperty('--w', L(spec.d || 26));
      } else {
        bit.classList.add('is-glint');
        bit.style.setProperty('--w', L(spec.w || 20));
        bit.style.setProperty('--a', ((spec.a || 0) + (k - 1) * 44) + 'deg');
        bit.style.setProperty('--t', (base + (k - 1) * (spec.gap || 150)) + 'ms');
      }

    } else {
      /* puff: a fan of `spread` degrees starting at `from`, so flour blows the
         way the painted cloud already blows instead of going evenly outward. */
      const f = n > 1 ? k / (n - 1) : 0.5;
      const spread = spec.spread === undefined ? 360 : spec.spread;
      const from = spec.from === undefined ? -90 : spec.from;
      bit.style.setProperty('--w', L(6 + (k % 3) * 4));
      bit.style.setProperty('--d', L(spec.d * (0.62 + (k % 3) * 0.19)));
      bit.style.setProperty('--a', (from + f * spread).toFixed(1) + 'deg');
    }
    fx.appendChild(bit);
  }
  host.appendChild(fx);
  return fx;
}

/** SCREEN 1 - "STORY COMES ALIVE".

    He snaps a second time, and ONLY THEN does a sparkle appear at his hand, sit
    there a moment and set off for the first picture; from there it travels the
    ring in story order. Each card it reaches enlarges briefly while one element of
    that event comes alive.

    THE ORDER IS THE FEATURE. See RECAP_SNAP_MS and RECAP_HAND_MS: snap, then the
    light appears, then it goes. All three used to be one frame.

    THE LEGS ARE THE FOOTPATH'S OWN CURVES. formPath holds the nine quadratics the
    bow search actually won, so the sparkle runs along the footprints rather than
    near them. The first leg is the exception and has to be: it crosses the middle
    of the ring, from his hand to picture one, where there are deliberately no
    footprints at all. */
function recapSparkle() {
  const host = document.getElementById('postSpark');
  if (!host || recapDone) return false;
  host.replaceChildren();

  /* HE SNAPS AGAIN - the user's own words - and the light has to be told where he
     is. See magicSnap: its default is the floor pose's hand at (846,731), and the
     pose has carried itself into the middle of the ring since then, so SNAP2_HAND
     is that same hand put through snap-lift's transform.

     AND ONLY ONE THING COMES OUT OF IT. sparks: 0 leaves the flash and nothing
     else, because the magic trail is about to leave this exact point - eleven
     sparks flying off it first read as eleven trails and the user asked for one.
     The FIRST snap keeps its ring: nothing travels there, so the burst is the only
     light it has. */
  magicSnap(SNAP2_HAND, { sparks: 0 });
  sfx('snap');

  const head = document.createElement('div');
  head.className = 'pspk';
  /* PARKED AT HIS HAND, DARK. .pspk is opacity 0 until .is-on, so this is on the
     screen and invisible for the length of the snap - but it is PLACED, which the
     harness reads (AARU_POST.sparkle parses style.left) and which means the frame
     it lights on is already the right frame. Without this it had no position at
     all until the first step() ran. */
  head.style.left = SNAP2_HAND.x.toFixed(1) + 'px';
  head.style.top  = SNAP2_HAND.y.toFixed(1) + 'px';
  host.appendChild(head);
  recapHead = head;

  /* THE STAR, BUILT ONCE AND CLONED. Stars are dropped every RECAP_DOT_PX of
     travel, which peaks near sixty a second on a fast leg - and parsing markup
     sixty times a second to draw a star is the kind of cost that shows up as a
     stutter on a tablet and nowhere else. fill:none plus a stroke is what makes it
     HOLLOW, which is what was asked for and which no clip-path can do: one polygon
     gives a filled star, and nesting a second one filled with "the background"
     fails over painted wood. currentColor is what lets one template serve six
     colours. */
  const starTpl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  starTpl.setAttribute('viewBox', '0 0 24 24');
  starTpl.setAttribute('aria-hidden', 'true');
  const starPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  starPath.setAttribute('d', 'M12 1.8 L14.95 9.05 L22.6 9.6 L16.7 14.45 '
                           + 'L18.7 21.9 L12 17.75 L5.3 21.9 L7.3 14.45 '
                           + 'L1.4 9.6 L9.05 9.05 Z');
  starPath.setAttribute('fill', 'none');
  starPath.setAttribute('stroke', 'currentColor');
  starPath.setAttribute('stroke-width', '2.1');
  starPath.setAttribute('stroke-linejoin', 'round');
  starTpl.appendChild(starPath);
  let dropped = 0;

  /* THE HOP, then the nine runs. A leg carries where it starts, where it ends,
     its control point if it is curved, how long it takes, and which card it
     ARRIVES at - the card is woken when the leg finishes. */
  recapLegs = [{ a: SNAP2_HAND, b: { x: RING[0].x, y: RING[0].y }, k: null,
                 ms: RECAP_LEAD_MS, card: 0 }];
  for (let i = 0; i < formPath.length; i++) {
    const p = formPath[i];
    /* A degenerate run still has to advance the sparkle, or the card after it is
       never woken. Straight line, and its own length for the duration. */
    const a = p ? p.a : { x: RING[i].x, y: RING[i].y };
    const b = p ? p.b : { x: RING[i + 1].x, y: RING[i + 1].y };
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    recapLegs.push({ a: a, b: b, k: p ? p.k : null,
                     /* 1.15 AND NOT 0.55: see RECAP_PX_MS. The two numbers are
                        one speed between them - 0.62/0.55 was 1.13px/ms and this
                        is 0.54 - and the second one moved because a leg has to be
                        long enough to walk across. The floor moved with it for the
                        same reason: 220ms was shorter than two footsteps. */
                     ms: Math.max(420, chord / RECAP_PX_MS * 1.15),
                     card: i + 1 });
  }

  recapAt = 0;
  const t0 = performance.now();
  /* THE LIGHT COMES AFTER THE SNAP, AND LEAVES AFTER IT HAS COME. Both beats are
     bought with the loop's own hold rather than with a second scheduler: legT0 is
     pushed into the future and holdUntil with it, so step() runs, sees it is early
     and paints nothing until the trail is due. Leg 0's clock then starts at the
     instant it sets off, so RECAP_LEAD_MS still buys the hop across the middle of
     the ring and nothing downstream shifts.

     The timer is on formTimers, so formStop() takes it with everything else: a
     skip during the snap must not light a flare on an emptied layer. */
  formTimers.push(setTimeout(() => head.classList.add('is-on'), RECAP_SNAP_MS));
  let legT0 = t0 + RECAP_SNAP_MS + RECAP_HAND_MS;
  let lastDot = { x: SNAP2_HAND.x, y: SNAP2_HAND.y };
  let prevTrailPt = { x: SNAP2_HAND.x, y: SNAP2_HAND.y };
  let prevTrailNow = legT0;
  /* HAS THIS LEG'S SHIMMER FIRED YET. One cue covers a whole leg, so the state
     the trail needs is a flag rather than the footstep debt that was here:
     `lastStep`, `footL` and `stepDebt` all went with STEP_GAP_MS, and the debt is
     worth one line of epitaph because its best property was one this cannot have
     - a tap a leg had paid for and run out of room to sound stayed owed and
     sounded in the first frames of the NEXT leg, worth two taps over the recap.
     A shimmer is placed once, on the frame the light sets off, against that leg's
     own travel; there is nothing to carry over.

     Local to the run, like everything else here, so a skip takes it with the
     closure. */
  let legLit = false;
  /* WHEN THE WALK AFTER THE CURRENT LEG STARTED, or 0 if it has not. The arrival
     branch runs for as many frames as the walk lasts, so it needs to know which
     of those frames is the first one. That beat is silent now - see the walk
     block - but it still paces the recap. */
  let walkT0 = 0;
  let holdUntil = legT0;

  const step = now => {
    /* THE HOLD IS CHECKED FIRST, AND THAT ORDER IS THE WHOLE OF THE LAST BEAT.
       These two lines were the other way round, so the moment the tenth leg was
       consumed - one frame after the tenth picture began its closeup - Screen 2
       fired, and he clapped over a card still out in the middle of the stage. The
       hold set on the last leg (held + the way home + RECAP_CLAP_AT, below) is
       what "after all scenes comes to center and goes back" actually means, and it
       cannot be honoured by a check that runs before it. */
    if (now < holdUntil) { recapRaf = requestAnimationFrame(step); return; }
    if (recapAt >= recapLegs.length) { recapCheer(); return; }

    const leg = recapLegs[recapAt];
    const t = Math.min(1, (now - legT0) / leg.ms);
    const pt = leg.k ? quadAt(leg.a, leg.k, leg.b, t)
                     : { x: leg.a.x + (leg.b.x - leg.a.x) * t,
                         y: leg.a.y + (leg.b.y - leg.a.y) * t };
    head.style.left = pt.x.toFixed(1) + 'px';
    head.style.top  = pt.y.toFixed(1) + 'px';
    const fdx = pt.x - prevTrailPt.x;
    const fdy = pt.y - prevTrailPt.y;
    const fdist = Math.hypot(fdx, fdy);
    const fdt = Math.max(8, now - prevTrailNow);
    const trailAngle = fdist > 0.1 ? Math.atan2(fdy, fdx) * 180 / Math.PI : 0;
    const trailSpeed = fdist / fdt;
    if (fdist > 0.1) {
      head.style.setProperty('--head-a', trailAngle.toFixed(1) + 'deg');
      head.style.setProperty('--head-tail', Math.min(92, 46 + trailSpeed * 34).toFixed(0) + 'px');
    }
    prevTrailPt = { x: pt.x, y: pt.y };
    prevTrailNow = now;

    /* THE TRAIL DRAWS THE FOOTPATH. Leg 0 is the hop from his hand to the first
       picture and crosses the middle of the ring, where there are deliberately no
       footprints; every leg after it IS run leg-1, so the marks of that run are
       released as the head goes past them. */
    /* ...AND THE FIRST MARK OF A LEG STARTS THE WALK - one cue for the leg, not
       one tap per mark.

       THREE WIRINGS, AND THE THIRD IS THE RECORDING'S OWN. Firing a tap on each
       print was the obvious one and it cannot express a CADENCE: the light
       crosses a leg's prints in about 200ms - measured, all nine legs release
       their 2-7 prints inside a span of 185-269ms - so a gate on the releases
       was only ever choosing how many prints survived, never how far apart the
       taps landed. The second wiring put the releases into a debt and paid them
       out on a clock at STEP_GAP_MS, which did produce a tempo. It was still a
       tempo THIS FILE INVENTED, and the user's verdict on the result was "its
       still not implemented".

       SO THE WALK COMES OFF THE FILE AND ONLY ITS PACE IS OURS. `footsteps` is
       three footfalls of the user's own take, re-spaced to WALK_STEP_S - their
       rhythm at the tempo they asked for - and this plays the front of it: as
       many footfalls as the leg's travel has room for, faded out in the gap after
       the last one. See WALK_CUTS.

       AND IT STARTS WITH THE LEG, NOT WITH THE FIRST PRINT. Firing it on the
       first release was the obvious wiring, since that is what the tap version
       used, and it is measurably wrong for a run: revealRun hands over mark j
       once the head is (j+0.5)/n of the way along, so on a leg with two prints
       the first one appears a QUARTER of the way in. Measured that way, eight
       legs held two footfalls and one held a single one - a tick on the fifth
       picture. Starting at the top of the leg gives the walk the whole travel,
       which is also what it is describing: he walked the path, the light is
       retracing it, and the prints lighting up are the path being read back
       rather than the feet.

       Leg 0 still gets nothing, and that is `recapAt > 0` rather than a print
       count: it is the hop from his hand to the first picture, across the middle
       of the ring, where there are deliberately no footprints at all.

       PANNED TO THE MIDDLE OF THE LEG, not to the light. A tap could follow the
       light because it was over in 100ms; a run lasts a third of the leg, so
       there is no single place the light IS while it plays, and the middle of the
       walk is where the walking happens. */
    /* NOTHING WALKS DURING THE TRAVEL ANY MORE. Both the prints and the sound
       used to happen HERE, released by how far the light had gone - revealRun by
       travel, and the run of footfalls fired once at the top of the leg and cut
       short so it finished before the light landed. The user asked for the other
       order: "show footstep animation and sfx after the magical stars reaches
       from frame 1 to 2 and so on, give healthy screen time".

       So the light now travels over an EMPTY path and the walk is its own beat
       after it lands - see the arrival branch below, which is also where the
       screen time comes from. STEP_CLEAR_MS is no longer needed to keep the walk
       off the picture's cue, because the walk finishes before the picture starts
       rather than racing it. */

    /* THE TRAIL'S OWN SOUND, ON THE FRAME THE LIGHT SETS OFF. `trail` is a
       supplied recording now (universfield-magic-spell, see SFX_SRC.trail) and
       it is 5.9s long against a budget that does not have that room - the
       tightest leg is 557ms of travel plus RECAP_WALK_MS plus the card's own
       cueAt, 1447ms before anything else sounds. TRAIL_OUT_S/TRAIL_OUT_FOR_S
       fade it there, at the call site, the same way the fade is bought for
       every other cue in this codebase - see `sound ends with the movement`
       in the render notes - rather than by re-encoding the file: the whole
       attack and the top of the shimmer are inside the fade, only the two-plus
       seconds of reverb tail past it are cut.

       ONE PER LEG, on the first frame of it, which is what `legLit` is for. Leg 0
       gets none: it is the hop from his hand to the first picture, across the
       middle of the ring, and there is no footpath under it.

       PANNED TO THE MIDDLE OF THE LEG at WALK_PAN, the same spread the footsteps
       used - the light crosses a third of the stage in a leg, so there is no
       single place it IS while the shimmer plays, and the middle of the travel is
       where the travelling happens. */
    if (recapAt > 0 && !legLit) {
      legLit = true;
      sfx('trail', { pan: panAt((leg.a.x + leg.b.x) / 2) * WALK_PAN,
                      out: TRAIL_OUT_S, outFor: TRAIL_OUT_FOR_S });
    }

    /* A HOLLOW STAR every RECAP_DOT_PX of TRAVEL, not every frame: a per-frame
       drop gives a dense trail on a fast leg and a sparse one on a slow leg. */
    if (Math.hypot(pt.x - lastDot.x, pt.y - lastDot.y) >= RECAP_DOT_PX) {
      lastDot = { x: pt.x, y: pt.y };
      const star = document.createElement('div');
      star.className = 'pspk-star';
      star.style.left = pt.x.toFixed(1) + 'px';
      star.style.top  = pt.y.toFixed(1) + 'px';
      star.style.setProperty('--w', RECAP_STAR_W[dropped % RECAP_STAR_W.length] + 'px');
      star.style.setProperty('--c', MAGIC_COLS[dropped % MAGIC_COLS.length]);
      /* Its own start angle and its own spin, so a run of stars does not read as
         one stamp repeated along a line. */
      star.style.setProperty('--r0', (dropped * 47 % 360) + 'deg');
      star.style.setProperty('--spin', (110 + (dropped % 4) * 55) + 'deg');
      star.appendChild(starTpl.cloneNode(true));
      host.appendChild(star);

      /* A glowing line tangent to the path makes the trail continuous between
         stars. Its length follows the head's measured speed, so fast sweeps
         stretch and the slower turns tighten rather than looking pasted on. */
      const streak = document.createElement('i');
      streak.className = 'pspk-streak';
      streak.style.setProperty('--x', pt.x.toFixed(1) + 'px');
      streak.style.setProperty('--y', pt.y.toFixed(1) + 'px');
      streak.style.setProperty('--a', trailAngle.toFixed(1) + 'deg');
      streak.style.setProperty('--len', Math.min(76, 32 + trailSpeed * 34).toFixed(0) + 'px');
      streak.style.setProperty('--c', MAGIC_COLS[(dropped + 2) % MAGIC_COLS.length]);
      host.appendChild(streak);
      formTimers.push(setTimeout(() => streak.remove(), 700));

      /* A small four-point glint every third mark is thrown sideways from the
         tangent, then pulled down. `--dy` is always positive: unlike the path,
         loose glitter has gravity and cannot hover along the curve. */
      if (dropped % 3 === 0) {
        const diamond = document.createElement('i');
        diamond.className = 'pspk-diamond';
        diamond.style.setProperty('--x', pt.x.toFixed(1) + 'px');
        diamond.style.setProperty('--y', pt.y.toFixed(1) + 'px');
        diamond.style.setProperty('--w', (7 + (dropped % 2) * 3) + 'px');
        diamond.style.setProperty('--c', MAGIC_COLS[(dropped + 4) % MAGIC_COLS.length]);
        const side = dropped % 2 ? 1 : -1;
        const rad = trailAngle * Math.PI / 180;
        diamond.style.setProperty('--dx', (-Math.sin(rad) * side * 22).toFixed(0) + 'px');
        diamond.style.setProperty('--dy', (30 + (dropped % 4) * 5) + 'px');
        host.appendChild(diamond);
        formTimers.push(setTimeout(() => diamond.remove(), 780));
      }

      /* THE GLITTER. Two motes off every other star, each with its own angle,
         distance and lifetime, so the pair separates as it falls. The angle is
         biased DOWNWARD - 40 to 140 degrees - because glitter falls: a mote thrown
         upward off a trail reads as a second, weaker trail going the wrong way. */
      if (dropped % RECAP_MOTE_EVERY === 0) {
        for (let k = 0; k < RECAP_MOTE_N; k++) {
          const mote = document.createElement('div');
          mote.className = 'pspk-mote';
          mote.style.left = pt.x.toFixed(1) + 'px';
          mote.style.top  = pt.y.toFixed(1) + 'px';
          const w = RECAP_MOTE_W[(dropped + k) % RECAP_MOTE_W.length];
          const ms = RECAP_MOTE_MS[0]
                   + (RECAP_MOTE_MS[1] - RECAP_MOTE_MS[0]) * ((dropped * 7 + k * 3) % 5) / 4;
          mote.style.setProperty('--w', w + 'px');
          mote.style.setProperty('--c', MAGIC_COLS[(dropped + k * 3) % MAGIC_COLS.length]);
          mote.style.setProperty('--a', (40 + ((dropped * 31 + k * 53) % 100)) + 'deg');
          mote.style.setProperty('--d',
            (RECAP_MOTE_D[0] + (RECAP_MOTE_D[1] - RECAP_MOTE_D[0])
             * ((dropped + k) % 3) / 2).toFixed(0) + 'px');
          mote.style.setProperty('--ms', ms.toFixed(0) + 'ms');
          host.appendChild(mote);
          formTimers.push(setTimeout(() => mote.remove(), ms + 40));
        }
      }
      dropped += 1;
      /* Matched to .pspk-star's own animation, so a star is taken away when it has
         finished fading and not before - and the layer does not collect six
         hundred nodes across ten legs. */
      formTimers.push(setTimeout(() => star.remove(), 1020));
    }

    if (t >= 1) {
      /* ARRIVED. Wake the picture, hold on it, then set off again.

         THE HOLD IS READ FIRST, and that ordering is not style. It was declared
         below its own first use, which is a temporal dead zone - a ReferenceError
         thrown inside this rAF callback, so the loop simply stopped after picture
         one while the first card's sound played happily. `node --check` cannot see
         it; the harness reported "pictures woken: 1" and that is what caught it.
         Second time this session. */
      /* THE PATH IS WALKED BEFORE THE PICTURE SPEAKS, and this is the beat the
         user asked for. The light has landed; now the prints it just flew over
         appear one after another with the footfalls on them, and only when that
         is finished does the card wake.

         revealRun TAKES A FRACTION, so driving it from the walk's own clock
         rather than from the light's travel is the whole change: same function,
         different argument. It is idempotent - a print already released is
         skipped - so calling it every frame of the walk is safe.

         LEG 0 HAS NO WALK, and that is `recapAt > 0` rather than a print count:
         it is the hop from his hand to the first picture, across the middle of
         the ring, where there are deliberately no footprints at all.

         IT COSTS RECAP_WALK_MS ON EACH OF THE NINE LEGS - about 6.4s over the
         recap - which is the "healthy screen time" half of the ask rather than a
         side effect. */
      if (recapAt > 0) {
        if (walkT0 === 0) {
          walkT0 = now;
          /* AND THIS BEAT IS SILENT NOW. It used to fire `footsteps` here - the
             walk owning its own time was the answer to "footsteps then next
             scene, its just too fast right now" - and the cue it was firing has
             been removed: "remove footsteps sound and replace it with cartoonish
             magical trail sounds". The BEAT stays, because what the user asked for
             was the pacing and the prints appearing after the light has passed,
             and neither of those was ever the sound's doing.

             THE SHIMMER IS ON THE TRAVEL INSTEAD, above, where the light actually
             moves - see the trail block. If this beat ever wants a sound of its
             own, one sparkle per print released is the shape to try, not one cue
             across the whole of it. */
        }
        const walked = (now - walkT0) / RECAP_WALK_MS;
        revealRun(recapAt - 1, Math.min(1, walked));
        if (walked < 1) { recapRaf = requestAnimationFrame(step); return; }
      }
      walkT0 = 0;
      legLit = false;
      const held = (SCENE_FX[leg.card] && SCENE_FX[leg.card].hold) || RECAP_CARD_MS;
      /* IS THERE A PICTURE AFTER THIS ONE? Read before recapAt moves, because two
         things below want it and getting it from the incremented value is how the
         off-by-one gets in. */
      const more = recapAt + 1 < recapLegs.length;
      /* THE HEAD GETS OUT OF THE WAY. It rests at the card's centre, which after a
         closeup is the middle of the frame - on top of the very thing the scene is
         about. See .pspk.is-rest.

         AND ON THE LAST PICTURE IT STAYS AWAY. It comes back to set off again, and
         after the tenth there is nowhere to go - it would have pulsed over the last
         closeup for the whole of its way home and then been deleted by recapCheer.
         Nothing else is moving on that beat, so a flare with no journey left reads
         as something forgotten on the screen. */
      head.classList.add('is-rest');
      if (more) {
        formTimers.push(setTimeout(() => head.classList.remove('is-rest'), held - 60));
      }
      const fx = wakeCard(leg.card);
      /* THE PATCH STAYS, THE PARTICLES GO. Once an element has fallen it has
         fallen: taking the pair away would snap the utensils back onto the shelf,
         which is worse than leaving them down. So only the particle layer is
         removed, and the sprite pair is left where the movement ended - it is
         emptied with the ring in formStop. */
      if (fx) formTimers.push(setTimeout(() => fx.remove(), held + 400));
      recapAt += 1;
      /* THE CARD GETS HOME BEFORE THE LIGHT SETS OFF AGAIN, and it did not
         before: `held` ends, wakeCard puts .is-shut on and the picture starts
         its RECAP_SHUT_MS journey back to the ring - and on that same frame the
         trail left for the next one. So the walk to picture n+1 happened over
         the top of picture n going home, which is what the user saw: "a scene
         is played then goes back then footsteps then next scene, its just too
         fast right now".

         Now every picture gets what only the LAST one used to get: the whole of
         its way home, and then a beat of nothing before the next leg starts.
         RECAP_BEAT_MS is that beat - the pause between one thing finishing and
         the next beginning, the same shape as ENDING_GAP_MS on the finale.

         IT COSTS ABOUT EIGHT SECONDS across nine pictures, and that is the ask
         rather than a side effect: "there should be a healty screen time in
         here". legT0 moves with holdUntil and must keep moving with it - the
         leg's own clock starts at legT0, so leaving it behind would make the
         trail jump forward the instant the hold released. */
      const gap = RECAP_SHUT_MS + RECAP_BEAT_MS;
      legT0 = now + held + gap;
      /* AND THE LAST ONE IS HELD LONGER, by exactly what it takes to get home.
         wakeCard puts .is-shut on at `held` and the card travels back over
         RECAP_SHUT_MS; only then is the ring whole again and only then does he
         clap. Every other picture holds for `held` alone, because the sparkle
         setting off for the next one IS the beat that follows it. */
      holdUntil = now + held + gap + (more ? 0 : RECAP_CLAP_AT);
      lastDot = { x: pt.x, y: pt.y };
    }
    recapRaf = requestAnimationFrame(step);
  };
  recapRaf = requestAnimationFrame(step);
  return true;
}

/* =============================================================================
   THE CONFETTI - the last beat of SCREEN 2
   -----------------------------------------------------------------------------
   He claps, and the paper goes up from behind him. Three times.

   IT IS SIMULATED, NOT KEYFRAMED, and that is the whole of the ask: "these
   confetti should behave like actual colored paper in the air after busting, use
   of real physics". A keyframe can send a rectangle out and bring it down -
   .pbit does exactly that for the stars - but the thing that makes paper read as
   PAPER is not its path. It is that a flat sheet cannot fall straight: it is
   braked hard across its face and hardly at all across its edge, so it turns
   itself broadside to wherever it is going, overshoots, and then either rocks
   about that (flutter) or goes over the top and keeps turning (tumble). All of
   that comes out of the same few forces, and none of it can be written down in
   advance, because which of the two a piece does depends on how big it is.

   THE MODEL, and what each term is actually doing.

     SI IN, PIXELS OUT. Every number here is metres, kilograms and seconds, and
     CONF_PX_M is the only place the two meet. That is not tidiness. Terminal
     speed is sqrt(2*sigma*g / (rho*Cd_n)), so it falls out of the paper's own
     weight: 22gsm tissue descends at 0.9 m/s WITHOUT ANYONE CHOOSING A FALL
     TIME. Tuned in pixels, every relationship like that has to be re-guessed.

     THE PLATE, NOT A DRAG COEFFICIENT. A piece is a flat plate with a chord
     direction `phi`. Its velocity through the air is split along that chord and
     across it, and the two get very different coefficients - 1.28 face-on
     against 0.06 edge-on, both measured values for a flat plate. That one
     asymmetry is where the behaviour comes from: the force is no longer aligned
     with the motion, and what is left over is LIFT. Lift is why a piece of paper
     swings instead of dropping.

     ...AND THE TWIST THAT AIMS IT. The normal force acts about a quarter chord
     AHEAD of the centre rather than through it, so it turns the plate broadside
     to its own path. That torque is what makes broadside a stable attitude - and
     because the only thing damping it is the air, the plate overshoots. Whether
     it comes back (flutter) or goes over (tumble) is decided by sigma/(rho*c):
     the small pieces here tumble at 3-4 rev/s and glide sideways as they do, the
     big ones flutter at about 3Hz and fall straight. Both are in every burst
     because both sizes are.

     THE JET IS WHAT GIVES IT RANGE, and this is the same correction flourBlast
     makes about the sneeze. Fired on its own into still air, a 4cm piece of
     tissue at 8 m/s stops in about ten centimetres: sigma/(0.5*rho*Cd_n) is a
     NINE CENTIMETRE e-folding length, which is why confetti thrown by hand goes
     nowhere. A cannon works because the charge throws AIR and the paper rides
     it. So each piece carries the jet that launched it as a velocity of its own
     that decays over its own tau, and the drag is computed against the air
     rather than against the ground. Measured on the bench, that is the
     difference between a burst 40px across and one that clears his head and
     crosses the whole ring.

     DEPTH IS A THIRD COORDINATE, and it earns its place by putting some of the
     paper IN FRONT OF HIM. The cannons are 28cm behind him; a piece thrown
     towards the camera crosses that and falls between him and the child, which
     is the difference between paper in the air and paper on a backdrop. It is
     deliberately the honest half of a 3D model rather than a full one - the
     tumbling is still solved in the screen plane, because that is the plane the
     child sees it in - and it buys two things: which of the two canvases a piece
     is drawn on, and how big it is drawn. `z` stops at the board, CONF_WALL,
     because paper does.

     WHAT IS NOT SIMULATED, said plainly: the roll about the piece's own long
     axis. That is the flicker - a sheet turning edge-on to the eye and back -
     and it is integrated from a fixed rate per piece rather than from a torque,
     because this model does not carry an out-of-plane attitude to apply one to.
     It is presentation, and it is the only thing in here that is.

   TWO CANVASES, NOT DIVS, for flourBlast's reason and one more of its own. Two
   hundred and thirty tumbling rectangles as DOM is two hundred and thirty
   composited layers with a transform rewritten every frame; and a piece has to
   be able to change WHICH SIDE OF HIM it is on, which as DOM is a z-index moving
   mid-flight. On canvases it is one `if` in the draw.
   -------------------------------------------------------------------------- */

/** PIXELS PER METRE, and it is a measurement rather than a scale knob. His
    silhouette is drawn 388.8px tall with his feet on y 776.4 - see .post-aaru in
    styles.css, which aligns both of him onto exactly that - and a six-year-old
    is about 1.15m: 389 / 1.15 = 338. Everything below is SI and passes through
    here on its way to the screen. Change it and the paper does not get faster;
    it gets SMALLER, and falls at the speed a smaller room implies. */
const CONF_PX_M = 340;

const CONF_AIR = 1.2;      /* kg/m3, air at room temperature */
const CONF_G   = 9.81;     /* m/s2 */

/* THE PAPER ITSELF. Party confetti is TISSUE, 18-30gsm; the 80gsm out of a
   printer would fall at twice the speed, and that single number is the most
   important one on this screen. Chord is the long side, and 2.5cm to 7cm is both
   what comes out of a cannon and - deliberately - a range that spans the
   flutter/tumble split. */
const CONF_GSM   = [0.018, 0.030];   /* kg/m2 */
const CONF_CHORD = [0.025, 0.070];   /* m     */

/* THE COEFFICIENTS, and which of them are free.

   CD_N AND CD_T ARE MEASURED. 1.28 is the standard flat-plate drag normal to the
   face and 0.06 is a thin plate edge-on. Nothing here gets to choose them.

   CD_M AND CD_Q ARE FITTED, and it is worth being exact about to what. CD_M
   scales the quarter-chord moment that turns a piece broadside, CD_Q the pitch
   damping that stops it, and between them they decide where the flutter/tumble
   boundary sits. They are set so that boundary lands INSIDE the size range above
   - at about 4.5cm for 22gsm - which is what puts both behaviours in one burst.
   Measured on the bench at these values: a 2.5cm piece tumbles at 3.3 rev/s and
   glides 0.87m sideways while falling 4.8m; a 5.5cm piece flutters at about 3Hz,
   sways 2cm and falls straight. Both are what slow-motion confetti does.

   THE CEILING ON CD_M IS THE FRAME RATE rather than the physics. Real confetti
   this size spins faster than this; past about 8 rev/s a 60fps frame aliases the
   flip and it reads as flicker rather than as paper. */
const CONF_CD_N = 1.28;
const CONF_CD_T = 0.06;
const CONF_CD_M = 1.00;
const CONF_CD_Q = 0.040;
/* ...and the brake on a piece's own spin, quadratic in it: an edge moving
   through air does not care which way the piece as a whole is going. */
const CONF_CD_R = 0.70;

/* THE TWO CANNONS, BEHIND HIS BACK, in stage px. He is drawn x 885..1035 with
   his feet on 776, so these sit inside his silhouette at hip height and a little
   apart - the paper comes out from behind HIM, not from a point beside him. Aim
   is in degrees and negative is up: -115 and -65 are up-and-out at 25 degrees
   off vertical, which is where a cannon is held so that the fall covers the
   thing being celebrated instead of landing on it. */
const CONF_MUZZLE = [{ x: 930, y: 620, aim: -110 },
                     { x: 990, y: 620, aim:  -70 }];
/* WIDE ENOUGH TO COVER THE SCREEN, which is what the user asked for: "confetti
   should cover the whole screen after originating from his back".

   IT IS THE CONE AND THE JET, NOT THE MUZZLE SPEED. The obvious lever is U0, and it
   is the wrong one twice over: paper's drag is quadratic, so doubling the speed buys
   about 40% more distance and all of it in the first tenth of a second - and
   tools/sim.js caps the fastest piece at 4000 px/s, which at CONF_PX_M and the
   nearest depth's magnification is 9.5 m/s. What actually reaches the edge of a
   1920px stage is a piece thrown nearly HORIZONTALLY and given long enough on the
   jet to get there: 62 degrees either side of the aim opens each cannon into a full
   fan, and a piece launched flat at 9 m/s on a 0.34s jet carries u0*tau = 3.0m =
   about 1000 stage px before ballistics take over. From a muzzle at x 930 that is
   the frame edge.

   THE AIMS COME IN to -110 and -70. At the old 25 degrees off vertical a 62-degree
   fan would have thrown paper DOWNWARDS out of the left cannon; 20 degrees keeps
   both cones inside "up and out" while still crossing over his head. */
const CONF_SPREAD = 62;              /* degrees either side of the aim        */
const CONF_U0     = [5.5, 9.0];      /* m/s at the muzzle                     */
const CONF_TAU    = [0.16, 0.34];    /* s - how long a piece rides the jet    */
const CONF_VZ     = 3.6;             /* m/s, the spray towards and away       */
/* ONE PIECE IN THREE IS A STAR, at the user's request - "add paper stars too in the
   confetti". Punched from the same paper at the same weight, so it falls the same
   way: only the drawn outline differs. A third is enough to read as a mix; at a
   half the rectangles stop being the thing the stars are mixed INTO. */
const CONF_STAR_MIX = 0.34;
const CONF_BACK   = -0.28;           /* m - the muzzles, behind him           */
const CONF_WALL   = -0.55;           /* m - the board. Paper stops there.     */
const CONF_CAM    = 2.6;             /* m - the eye, for the projection       */

/* HOW MANY, AND WHEN. The user asked for "2-3 times"; three, because two reads
   as a stutter and the third is what turns a bang into a celebration. The counts
   fall away because a cannon's second and third pull always do.

   THE GAPS ARE PACED ON THEIR OWN, and that is a finding rather than a
   preference: aaru-clap.webm is 21 frames at 7.5fps (2.800s) and his arm span
   across all of them only moves between 204 and 227px, so there is no frame
   where his hands meet hard enough to fire on. Measured with ffprobe and a
   per-frame alpha read; re-measure if the clip is ever re-cut, because a clap
   with a real contact frame is worth firing on.

   MEASURED ON THE BENCH at these numbers: the first burst clears his head at
   0.35s, the paper is spread over the whole ring from 0.6s to 3s, and the last
   piece leaves the bottom of the stage at 5.4s. */
/* THE COUNTS WENT UP WITH THE CONE. Spreading the same 228 pieces over a fan twice
   as wide covers twice the area at half the density, which reads as thinner rather
   than bigger - so 150/130/110. Measured cost at 390 pieces: the integrator runs
   CONF_STEP substeps per frame, about 1100 confMove calls, which is under a
   millisecond and nowhere near the paint. */
const CONF_BURSTS = [{ at: 0, n: 150 }, { at: 760, n: 130 }, { at: 1640, n: 110 }];

/* THE INTEGRATOR'S STEP: a fixed 6ms, with the frame subdivided to reach it
   rather than one step per frame. Not a refinement - measured, a 4cm piece
   integrated at 16.7ms does not tumble AT ALL, because the rotation is the stiff
   part of this system and a whole frame of it lands past the overshoot that
   would have taken the piece over. At 6ms and below the answer stops moving. */
const CONF_STEP = 0.006;
/* ...and a hard stop, for a piece that finds an updraught of its own making and
   never leaves. Nothing on this screen follows the celebration, but a loop that
   cannot end is a loop still running during the next child's game. */
const CONF_LIFE = 9;

let confBits  = [];
let confRaf   = 0;
let confGen   = 0;
let confPaint = null;

/** The paper's two sides, and a ramp down each.

    A SHEET HAS A FRONT AND A BACK and they are not the same colour - the back is
    the side away from the light - and confetti flickering between them is half
    of what makes a burst sparkle. The ramp on top of that is the same side seen
    at a grazing angle, which catches less. Five steps is enough that the change
    reads as turning rather than as switching, and building the strings once
    instead of per piece per frame is the difference between this and fourteen
    thousand string joins a second. */
function confPalette() {
  if (confPaint) return confPaint;
  confPaint = MAGIC_COLS.map(hex => {
    const n = parseInt(hex.slice(1), 16);
    const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const at = f => 'rgb(' + Math.round(r * f) + ', ' + Math.round(g * f) + ', '
                           + Math.round(b * f) + ')';
    return { face: [1, 0.93, 0.86, 0.79, 0.72].map(at),
             back: [0.70, 0.65, 0.60, 0.55, 0.50].map(at) };
  });
  return confPaint;
}

const confRnd = (a, b) => a + Math.random() * (b - a);

/** Load both cannons and fire, `n` pieces between them. */
function confSpawn(n) {
  const pal = confPalette();
  for (let i = 0; i < n; i++) {
    const m   = CONF_MUZZLE[i % CONF_MUZZLE.length];
    const c   = confRnd(CONF_CHORD[0], CONF_CHORD[1]);
    const gsm = confRnd(CONF_GSM[0], CONF_GSM[1]);
    /* The cone, and the pieces at its edge are the slow ones: a jet is fastest
       up its own middle, so a flat spread reads as a fan rather than a blast. */
    const off = confRnd(-1, 1);
    const th  = (m.aim + off * CONF_SPREAD) * Math.PI / 180;
    const u0  = confRnd(CONF_U0[0], CONF_U0[1]) * (1 - 0.28 * off * off);
    const vx  = Math.cos(th) * u0;
    const vy  = Math.sin(th) * u0;
    const vz  = confRnd(-1, 1) * CONF_VZ;
    confBits.push({
      mx: m.x, my: m.y,                     /* the muzzle it left, in stage px */
      x: 0, y: 0, z: CONF_BACK,             /* and metres from it              */
      vx, vy, vz,
      ax: vx, ay: vy, az: vz,               /* the jet it is riding            */
      tau: confRnd(CONF_TAU[0], CONF_TAU[1]),
      phi: Math.random() * 6.283,           /* which way its chord points      */
      om:  confRnd(-40, 40),                /* and how fast it is turning      */
      roll: Math.random() * 6.283,          /* about its own long axis         */
      rollv: confRnd(-9, 9),
      c, s: c * confRnd(0.55, 0.95),
      /* A STAR OR A RECTANGLE. Decided at spawn and never again, because a piece
         that changed shape mid-flight is the one thing paper cannot do. */
      star: Math.random() < CONF_STAR_MIX,
      age: 0,
      /* Everything constant for this piece, folded once. A/m is 1/gsm for a
         sheet, which is why its SIZE cancels out of the drag and stays in the
         torque - and that is exactly why the big ones flutter and the small ones
         tumble. */
      kn: 0.5 * CONF_AIR * CONF_CD_N / gsm,
      kt: 0.5 * CONF_AIR * CONF_CD_T / gsm,
      km: 1.5 * CONF_AIR * CONF_CD_N * CONF_CD_M / (gsm * c),
      kr: 0.1875 * CONF_AIR * CONF_CD_R * c / gsm,
      kv: 6 * CONF_AIR * CONF_CD_Q / gsm,
      pal: pal[i % pal.length],
    });
  }
}

/** One piece, one step of `h` seconds.

    THE DRAG IS SOLVED, NOT STEPPED. dv/dt = -k*v*|v| has a closed form -
    v / (1 + k*|v|*h) - and using it instead of adding an acceleration is not an
    optimisation, it is the only thing that makes this stable at a muzzle speed
    of 8 m/s. The explicit version needs h < 2/(k*|v|), which at the muzzle is
    about 7ms and gets shorter the harder the cannon is fired: it would come
    apart on exactly the frame the burst is most visible. Gravity is added
    afterwards, which is a first-order split and is where the leftover error
    lives. */
function confMove(p, h) {
  p.age += h;

  /* The jet, spending itself. */
  const d = Math.exp(-h / p.tau);
  p.ax *= d; p.ay *= d; p.az *= d;

  const ct = Math.cos(p.phi), st = Math.sin(p.phi);
  /* Its speed THROUGH THE AIR, which is not its speed over the ground while the
     jet is still carrying it. */
  const wx = p.vx - p.ax, wy = p.vy - p.ay;
  let vt =  wx * ct + wy * st;      /* along the chord - it slices            */
  let vn = -wx * st + wy * ct;      /* across the face - it is braked         */
  const sp = Math.hypot(vt, vn) || 1e-9;

  /* The quarter-chord moment, taken BEFORE the drag eats the speed it is
     computed from, and negative because it turns the plate broadside to its own
     path rather than away from it. Get this sign wrong and every piece settles
     edge-down and knifes to the floor at 2.5 m/s - which is what the first run
     of this did, and what it looks like is rain. */
  const dom = -p.km * Math.abs(vn) * vn * vt / sp;

  vn /= 1 + p.kn * Math.abs(vn) * h;
  vt /= 1 + p.kt * Math.abs(vt) * h;

  p.vx = p.ax + vt * ct - vn * st;
  p.vy = p.ay + vt * st + vn * ct + CONF_G * h;

  /* Depth, under the same law at a coefficient between the plate's two: which of
     them applies depends on an attitude this model does not carry out of the
     screen plane, and splitting the difference is the honest answer. */
  let wz = p.vz - p.az;
  wz /= 1 + 0.5 * (p.kn + p.kt) * Math.abs(wz) * h;
  p.vz = p.az + wz;

  p.om += dom * h;
  /* Two brakes on the spin: its own edges through the air, and the pitch damping
     a plate gets in a moving stream whether it is spinning fast or not. The
     second is the one that lets a big piece rock instead of going over. */
  p.om /= 1 + (p.kr * Math.abs(p.om) + p.kv * sp) * h;
  p.phi += p.om * h;
  p.roll += p.rollv * h;

  p.x += p.vx * h;
  p.y += p.vy * h;
  p.z += p.vz * h;
  if (p.z < CONF_WALL) { p.z = CONF_WALL; p.vz = 0; p.az = 0; }
}

/** A five-point star, into whatever path the caller has open.

    ONE SET OF SINES AND COSINES, HOISTED. This is called once per star per frame -
    about forty times a frame at the peak of a burst - and ten Math.cos calls each
    time is four hundred a frame for a shape that never changes. The unit star is
    computed once and scaled here.

    rx AND ry SEPARATELY, because the caller squashes the piece towards a line as it
    turns edge-on and a star has to squash with it. */
const CONF_STAR_PTS = (function () {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const r = i % 2 ? 0.42 : 1;            /* 0.42 is the notch of a paper star */
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
})();

function confStarPath(g, rx, ry) {
  for (let i = 0; i < 10; i++) {
    const q = CONF_STAR_PTS[i];
    if (i) g.lineTo(q[0] * rx, q[1] * ry);
    else g.moveTo(q[0] * rx, q[1] * ry);
  }
}

/** Where a piece is on the stage, and how big.

    A pinhole about the middle of the stage, with the muzzle at depth 0 in it - so
    on the frame it is fired every piece of a burst is at the same point whatever
    depth it was given, and they only draw apart as they carry their own z. */
function confAt(p) {
  const k = CONF_CAM / Math.max(0.35, CONF_CAM - p.z);
  return { k,
           x: 960 + (p.mx - 960 + p.x * CONF_PX_M) * k,
           y: 540 + (p.my - 540 + p.y * CONF_PX_M) * k };
}

/** Fire the cannons: `n` pieces, and start the loop if it is not already
    running. Returns false only if the layers are not in the markup. */
function confettiBurst(n) {
  const back  = document.getElementById('postConfBack');
  const front = document.getElementById('postConfFront');
  if (!back || !front) return false;

  /* One canvas per layer, made on the first burst and kept for the rest of the
     celebration - the second and third pull have to land on the paper the first
     one left in the air, not on a cleared stage. */
  const cv = [back, front].map(host => {
    let c = host.firstElementChild;
    if (!c) {
      c = document.createElement('canvas');
      c.width  = STAGE_W;
      c.height = STAGE_H;
      c.className = 'pair-canvas';
      host.replaceChildren(c);
    }
    return c;
  });
  const ctx = [cv[0].getContext('2d'), cv[1].getContext('2d')];
  if (!ctx[0] || !ctx[1]) return false;

  confSpawn(n);
  if (confRaf) return true;            /* running already: it picks them up */

  confGen += 1;
  const mine = confGen;
  let last = performance.now();
  const step = now => {
    if (mine !== confGen) return;
    /* Clamped for flourBlast's reason: a backgrounded tab hands back a dt of
       seconds, and the substep count below would try to integrate all of it. What
       the child gets on coming back is the burst a twentieth of a second further
       on, which is the right answer - it kept falling while they were away. */
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;

    const sub = Math.max(1, Math.ceil(dt / CONF_STEP));
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < confBits.length; i++) confMove(confBits[i], h);
    }

    ctx[0].setTransform(1, 0, 0, 1, 0, 0);
    ctx[1].setTransform(1, 0, 0, 1, 0, 0);
    ctx[0].clearRect(0, 0, STAGE_W, STAGE_H);
    ctx[1].clearRect(0, 0, STAGE_W, STAGE_H);

    const keep = [];
    for (let i = 0; i < confBits.length; i++) {
      const p = confBits[i];
      const q = confAt(p);
      /* Gone when it is off the bottom or out the side, with a margin of a whole
         piece: a rectangle dropped on the frame its CENTRE crosses the edge
         disappears while half of it is still showing. */
      if (p.age > CONF_LIFE || q.y > STAGE_H + 90
          || q.x < -180 || q.x > STAGE_W + 180) continue;
      keep.push(p);

      const g  = ctx[p.z > 0 ? 1 : 0];      /* in front of him, or behind him  */
      const m  = CONF_PX_M * q.k;
      const cr = Math.cos(p.roll);
      const w  = p.c * m;
      /* THE SPAN IS THE FLICKER: a sheet turned edge-on to the eye is a line -
         and never quite less than one, because paper has a thickness and a lit
         edge. */
      const s  = Math.max(1.1, p.s * m * Math.abs(cr));
      const face = cr >= 0 ? p.pal.face : p.pal.back;
      g.fillStyle = face[Math.min(4, (1 - Math.abs(cr)) * 5 | 0)];
      /* CURLED, because confetti is punched out of a roll and never lies flat -
         and a flat rectangle at this size reads as a pixel rather than as paper.
         The bow follows the roll, so the curve turns over with the sheet. */
      const bow = s * 0.42 * Math.sin(p.roll);
      g.setTransform(Math.cos(p.phi), Math.sin(p.phi),
                     -Math.sin(p.phi), Math.cos(p.phi), q.x, q.y);
      g.beginPath();
      if (p.star) {
        /* A PUNCHED PAPER STAR, five points, drawn in the same rotated frame as a
           rectangle would be - so it flickers the same way: `s` already carries
           |cos(roll)|, which squashes the star towards a line as it turns edge-on.
           The radius is the SHORTER of the two, or a star turned edge-on would be
           wider than the sheet it was punched from. */
        const R = Math.min(w, s) * 0.62;
        const ry = R * (s / Math.max(1e-6, Math.min(w, s)));
        confStarPath(g, R, Math.min(ry, R * 1.6));
      } else {
        g.moveTo(-w / 2, -s / 2);
        g.quadraticCurveTo(0, -s / 2 + bow, w / 2, -s / 2);
        g.lineTo(w / 2, s / 2);
        g.quadraticCurveTo(0, s / 2 + bow, -w / 2, s / 2);
      }
      g.closePath();
      g.fill();
    }
    confBits = keep;

    if (!confBits.length) {
      ctx[0].setTransform(1, 0, 0, 1, 0, 0);
      ctx[1].setTransform(1, 0, 0, 1, 0, 0);
      cv[0].remove();
      cv[1].remove();
      confRaf = 0;
      return;
    }
    confRaf = requestAnimationFrame(step);
  };
  confRaf = requestAnimationFrame(step);
  return true;
}

/** Take the paper off the screen. formStop calls this; nothing else has to,
    because in a real game nothing follows the celebration. */
function confettiStop() {
  if (confRaf) cancelAnimationFrame(confRaf);
  confRaf = 0;
  confGen += 1;
  confBits = [];
}

/** SCREEN 2 - "CELEBRATION".

    HE PUTS THE SNAP DOWN AND CLAPS, all ten light together, he jumps, and stars
    and confetti burst around him.

    THE CLAP IS THE FIRST THING HERE, and that is the change the user asked for:
    "after all scenes comes to center and goes back, aaru clapping animation will
    happen". It used to start twenty seconds earlier, on the beat the tenth picture
    landed in its slot, so he applauded through the second snap and all ten
    closeups and had nothing left to do when the recap finished.

    TEN, NOT TWELVE. The sheet says twelve, the game places eleven and the ring
    shows ten: `hurt` is not in the game at all any more (see the windowing note
    over ROUNDS) and RING_SKIP drops `pickup`, which is the reference layout
    exactly. Lighting the ten that are there is the honest reading of it.

    CALLED FROM THE END OF recapSparkle(), not from a timer of its own: its start
    is the sparkle's own duration, and that is the number being tuned. */
function recapCheer() {
  if (recapDone) return false;
  recapDone = true;
  if (recapRaf) cancelAnimationFrame(recapRaf);
  recapRaf = 0;

  /* The sparkle's head goes; its dots are already taking themselves away. */
  if (recapHead) { recapHead.remove(); recapHead = null; }

  /* THE ONE POSE CHANGE ON THIS SCREEN. The snap pose he has held since the ride
     goes, the clapping clip takes the middle, and it is 90ms - almost a cut, the
     same number and the same reasoning as the finale's own pose changes. */
  postClap();

  /* ALL TEN AT ONCE. A glow rather than an animation - see .pcard.is-home.is-lit
     for why that matters here. */
  formCards.forEach(c => { if (c && c.el) c.el.classList.add('is-lit'); });

  /* CHILDREN, ON THIS FRAME. The user asked for "a really good celebration sfx
     with clapping sound of aaru" on this beat, and what was here first was a
     music box on its own - the right instrument for the game, and not a thing
     that sounds like anybody being happy.

     THIS CUE IS BACK FROM THE DEAD, and the conditions for that were written down
     when it was removed: "it needs a beat of its own - after the snap has
     finished, not under it", because a crowd is broadband and masks the partials
     of anything pitched underneath. It was landing 140ms into the snap. It is now
     twenty seconds past it, on the confetti, with nothing pitched anywhere near.

     IT USED TO BE HELD BACK 950ms, and that number is gone with the cue it was
     measured against. `allDone` fired on this same frame and the crowd was slid
     to 0.95 so it opened past the flourish's ascending run and landing chord, on
     a decay rather than on a melody. The flourish has been taken out of the game,
     so the delay was 950ms of silence in front of the last sound the child hears.
     The crowd lands on the frame the clap does.

     WHAT IS ON THE SCREEN WHILE IT PLAYS, which is the reason this and not a
     fanfare: Aaru has just put the snap down and is CLAPPING, all ten pictures
     light together, he jumps, and stars and paper burst around him. A room of
     children applauding is the sound of that picture. A jingle is a sound about
     it. */
  /* THE SAME SOUND A FINISHED SCREEN MAKES, at the user's request: "the end
     screen confetti should have the same sfx as the 3 frames completion screen
     has". The reason that was the right instinct is worth keeping: a child has
     heard this four times by now, once for each screen they finished, and it is
     the sound of THEIR doing. The confetti is the fifth and biggest of those
     moments, so it should be the sound they already know.

     WHICH MEANS IT FOLLOWED THAT CUE WHEN IT CHANGED. It was roundDone plus the
     crowd at an offset; it is the clap alone now, because that is what a finished
     screen makes - see roundCheer. Keeping the two in step is the whole of what
     was asked for here, so this is one line rather than two.

     `cheer` - a hall of three hundred children - is still used by nothing. Its
     cut stays: it is the only crowd of that size in the set and the note on it in
     VOICES explains what it was for. */
  sfx('applause');
  sfx('softclap');

  /* HE JUMPS - but not on the same frame he arrives on. postClap() has just put
     him on screen through a 90ms fade, and aaru-cheer would REPLACE that fade:
     .is-live.is-cheer outranks .is-live, so its own `opacity: 1` would snap him in
     whole and mid-jump. Letting the hand-over finish first is the difference
     between a boy appearing and then jumping, and a jumping boy appearing.

     Whichever of him is on screen: the clip or the still. */
  formTimers.push(setTimeout(() => {
    ['postAaru', 'postAaruStill'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.classList.contains('is-live')) el.classList.add('is-cheer');
    });
  }, CLAP_HANDOVER_MS));

  /* ...and the stars, round him. Spawned the way the snap's sparks are - an
     angle, a distance and a stagger each - because that is the one burst idiom
     this screen already has for LIGHT. The paper is a different thing and gets
     the different treatment it needs; see the cannons below. */
  const burst = document.getElementById('postBurst');
  if (burst) {
    burst.replaceChildren();
    for (let i = 0; i < CHEER_BITS; i++) {
      const bit = document.createElement('div');
      /* All stars. Half of these used to be `is-ribbon`, a rectangle on the same
         keyframe standing in for confetti; that job belongs to the simulation
         now, and both the class and its CSS are gone. */
      bit.className = 'pbit is-star';
      bit.style.left = SNAP2_AT.x + 'px';
      bit.style.top  = SNAP2_AT.y + 'px';
      bit.style.setProperty('--a', (i * (360 / CHEER_BITS) - 90).toFixed(1) + 'deg');
      bit.style.setProperty('--d',
        (CHEER_D[0] + (i % 4) * ((CHEER_D[1] - CHEER_D[0]) / 3)).toFixed(0) + 'px');
      bit.style.setProperty('--w', (7 + (i % 3) * 4) + 'px');
      bit.style.setProperty('--c', MAGIC_COLS[i % MAGIC_COLS.length]);
      bit.style.setProperty('--spin', (140 + (i % 5) * 70) + 'deg');
      bit.style.setProperty('--fall', (150 + (i % 4) * 60) + 'px');
      bit.style.setProperty('--ms', CHEER_MS + 'ms');
      bit.style.setProperty('--t', ((i % 6) * 46) + 'ms');
      burst.appendChild(bit);
    }
  }

  /* AND THE PAPER, THREE TIMES, FROM BEHIND HIM.

     THE ORDER IS THE ASK, in the user's own words: "after all the scenes are
     completed then aaru clapps then bust cofetti from his behind 2-3 times".
     THEN. So the first cannon does not fire on this frame - it fires once the
     hand-over above has finished and there is a boy on screen clapping to burst
     it out from behind. Firing them together gives a burst with no cause, which
     is the same fault the second snap had before RECAP_SNAP_MS was put in front
     of the magic trail.

     They are scheduled through formTimers so that a dev skip taken mid-
     celebration cancels the ones that have not gone off yet; confettiStop() in
     formStop takes the paper already in the air.

     REDUCED MOTION FIRES NOTHING. .post-conf is display:none under that query as
     well, but the point of checking here is that the SIMULATION does not run:
     two hundred and thirty pieces integrated at 6ms behind a hidden layer is a
     cost paid by exactly the machine least able to pay it. This is the one beat
     of Screen 2 that is pure movement, so unlike the lit cards and his jump
     there is nothing of it to keep. */
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    CONF_BURSTS.forEach(b => {
      formTimers.push(setTimeout(() => confettiBurst(b.n),
                                 CLAP_HANDOVER_MS + b.at));
    });
  }

  /* NO BADGE. The sheet's Screen 2 ends with "a large completion star/badge",
     and it was built and then removed at the user's request: at the middle of this
     ring a 268px badge covers the boy standing in it. See the note where its CSS
     used to be for the placement to try if it is ever wanted back. What is left is
     the rest of that row - every picture lit, him jumping, the burst, and the
     paper coming up behind him. */
  return true;
}

/** Take the formation off the screen. recapStop() calls this; nothing else has
    to, because in a real game nothing follows it. */
function formStop() {
  if (formRaf) cancelAnimationFrame(formRaf);
  formRaf = 0;
  /* THE TWO COUNTERS THE RING FILLS ON. formHauled keeps the line's cue to one
     per formation and formPlaced walks the arrival phrase up its scale; a dev
     jump back into the post game with either left set would give the second run
     a silent line and a phrase starting at the octave. */
  formHauled = false;
  formPlaced = 0;
  /* The sparkle has its own loop, and it outlives the ride's. */
  if (recapRaf) cancelAnimationFrame(recapRaf);
  recapRaf = 0;
  /* ...and so does the flour, which is a THIRD loop and the only one drawing
     outside the card layers. Bumping the generation is what stops a frame that was
     already queued from painting onto a stage the run has finished with. */
  if (airRaf) cancelAnimationFrame(airRaf);
  airRaf = 0;
  airGen += 1;
  if (rideRaf) cancelAnimationFrame(rideRaf);
  rideRaf = 0;
  rideGen += 1;
  if (physicsRaf) cancelAnimationFrame(physicsRaf);
  physicsRaf = 0;
  physicsGen += 1;
  /* ...and the confetti, which is a FOURTH and outlives all of them: the pending
     cannons go with formTimers below, and this takes the paper already in the
     air. Same generation trick, same reason. */
  confettiStop();
  recapLegs = [];
  recapAt = 0;
  recapCard = -1;
  recapDone = false;
  recapHead = null;
  recapFocus = 0;
  formTimers.forEach(clearTimeout);
  formTimers = [];
  formCards = [];
  ['postRing', 'postLine', 'postTrail', 'postMagic',
   'postFx', 'postSpark', 'postBurst', 'postAir',
   'postConfBack', 'postConfFront'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.replaceChildren();
    el.classList.remove('is-on');
  });
  /* ...and put back the three things the formation borrowed from the finale: him,
     the snap pose it retired, and the line it took away. Only the dev skip needs
     this - but an invisible rope would otherwise follow it back onto a live
     board, which is the sort of thing that only shows up two features later. */
  const v = document.getElementById('postAaru');
  if (v) {
    if (v.pause) v.pause();
    v.currentTime = CLAP_IN;
  }
  ['postAaru', 'postAaruStill'].forEach(id => {
    const el = document.getElementById(id);
    /* .is-cheer as well: he is borrowed from the finale and survives this
       screen, so a hop left on him would follow him back onto a live board. */
    if (el) el.classList.remove('is-on', 'is-idle', 'is-live', 'is-cheer');
  });
  /* .is-away comes off all THREE of him. A dev skip taken during a closeup would
     otherwise leave the snap pose hidden, and the finale hands that same element
     back to a live board. */
  MIDDLE_OF_RING.forEach(id => {
    const a = document.getElementById(id);
    if (a) a.classList.remove('is-away');
  });
  const rg = ringEl();
  if (rg) rg.classList.remove('is-focus');
  const sn2 = document.getElementById('finaleSnap');
  if (sn2) sn2.classList.remove('is-lifting', 'is-gone');
  const rp = document.getElementById('rope');
  if (rp) rp.classList.remove('is-put-away');
  const bn = document.querySelector('.banner');
  if (bn) bn.classList.remove('is-away');
  const pr = document.getElementById('prompt');
  if (pr) pr.classList.remove('is-away');
  formOn = false;
}

/* What tools/sim.js reaches in through, so the post game can be driven and
   measured without a browser. Nothing in the game reads this. */
window.AARU_POST = {
  playPostGame, recapStop,
  postFormation, formStop, buildTrail, storyCards,
  running: () => postOn,
  forming: () => formOn,
  /* The ring, as it is on screen right now: one entry per frame, its centre in
     stage coordinates, so the harness can check the arrival order and the
     spacing without a layout engine. left/top are the card's own unscaled box,
     so the centre is half of each in from them. */
  /* SCREEN 1 AND SCREEN 2, for the harness. `woken` is how far the sparkle has
     got - the index of the last picture brought alive - and `lit` is one boolean
     per card, so "all ten light TOGETHER" is checkable rather than assumed.
     `sparkle` is the head's own position, which is what says it is on the path. */
  recapSparkle, recapCheer,
  woken: () => recapCard,
  /* HOW MANY FOOTPATH MARKS ARE STILL WAITING for the magic trail to reach them.
     The user's ask - footsteps visible only after the trail has passed - is a
     relationship over time, and its three failure modes are all invisible to a
     count of marks laid: released all at once, released ahead of the sparkle, or
     never released at all. */
  held: () => formSteps.filter(s => s && s.el
              && s.el.classList.contains('is-held')).length,
  cheered: () => recapDone,
  /* THE PAPER, AS PHYSICS RATHER THAN AS PIXELS. Nothing about a confetti burst
     is checkable off the DOM - it is two canvases, and the stub context in
     tools/sim.js records drawImage rather than filled paths - so what the
     harness gets is the state the simulation is actually in: where each piece is
     on the stage, how fast it is falling, how fast it is turning, and which side
     of him it is on. That is enough to answer the four things that can go wrong
     without eyes: it never leaves the muzzle, it leaves at the speed of a bullet,
     it never comes down, or it never ends. `k` is the perspective scale, so a
     piece drawn at twice its size is visible as a number too. */
  confetti: () => confBits.map(p => {
    const q = confAt(p);
    /* TWO SETS OF SPEEDS, and both are wanted. vx/vy are the model's own metres
       per second - that is the unit every coefficient in it is in, and 0.9 m/s
       is a claim about paper that can be checked against the world. fallPx and
       vpx are the same thing after CONF_PX_M and this piece's own perspective,
       which is what the child actually sees move. A bound written against the
       wrong one of those passes at four hundred times its intended value. */
    return { x: q.x, y: q.y, k: q.k, z: p.z, front: p.z > 0,
             vx: p.vx, vy: p.vy,
             fallPx: p.vy * CONF_PX_M * q.k,
             vpx: Math.hypot(p.vx, p.vy) * CONF_PX_M * q.k,
             spin: p.om / 6.2832, age: p.age,
             c: p.c, jet: Math.hypot(p.ax, p.ay) };
  }),
  confettiBurst,
  lit: () => formCards.map(c => !!(c && c.el && c.el.classList.contains('is-lit'))),
  /* .is-close counts too. Nine of the ten cards go CLOSE rather than popping, and
     without it the reduced-motion check reported "9 of 10 pictures woken" for a card
     that had been woken perfectly well. */
  popped: () => formCards.map(c => !!(c && c.el
                && (c.el.classList.contains('is-pop')
                 || c.el.classList.contains('is-jolt')
                 || c.el.classList.contains('is-close')))),
  sparkle: () => recapHead
    ? { x: parseFloat(recapHead.style.left), y: parseFloat(recapHead.style.top),
        leg: recapAt }
    : null,
  /* THE NINE CURVES THE FOOTPATH IS ON, so the harness can check that the
     sparkle is on the same ones rather than near them. Index-aligned with
     runs(); a degenerate run is null. */
  path: () => formPath.map(p => p && { a: { x: p.a.x, y: p.a.y },
                                       b: { x: p.b.x, y: p.b.y },
                                       k: { x: p.k.x, y: p.k.y } }),
  frames: () => formCards.map((c, i) => ({
    slot: i + 1,
    id: c.el.dataset.card,
    riding: c.riding && !c.freed,
    flying: c.freed && !c.landed,
    home: c.landed,
    /* THE VISUAL CENTRE, recorded by rideCarrier/placeRingCard rather than read
       back off style.left - which would be wrong for the whole ride, because a
       riding picture sits at slot 0's resting left with the TRANSFORM on the
       hanger above it doing the moving. */
    x: c.cx,
    y: c.cy,
    w: c.w * c.sc,
    h: CARD_H * c.sc,
    /* What is actually carrying it, so "the frame and the clip rode too" is
       checkable and not just visible. */
    frame: !!c.hanger.querySelector('.slot'),
    peg:   !!c.hanger.querySelector('.peg'),
    /* AND THE FRAME IS STILL POSITIONED. .slot[data-slot="0"] is what puts it at
       left 141 inside the hanger; an accessibility tidy-up once removed that
       attribute and the picture rode in 141px outside its own frame, with every
       other check still passing. A boolean for "a frame came with it" cannot see
       that, so this is the narrowest thing that can. */
    framePut: (function (n) { return n && n.getAttribute('data-slot') === '0'; })
              (c.hanger.querySelector('.slot')),
    onLine: c.hanger.classList.contains('is-riding')
            && !c.hanger.classList.contains('is-gone'),
  })),
  steps: () => {
    const el = document.getElementById('postTrail');
    return el ? el.children.length : 0;
  },
  /* Per run, so "the loop is drawn all the way round" is checkable. A 0 is a run
     that laid nothing, which is what the straight-line version did to all four
     side runs while the total still looked healthy at 19. */
  runs: () => formRuns.slice(),
};


/** DEV ONLY: put him where the finale would have left him.

    Both dev entrances to the post game jump in with no finale behind them, so
    without this the formation builds its ring around an empty middle - and the
    one thing the dev shortcut exists to let you look at is precisely how the
    ring sits around him. A screenshot of it without him in it is a screenshot of
    a different screen, which is how the first one was nearly taken.

    Only the last pose, and the riding clip hidden. Nothing here runs in a real
    game: the callers are the dev button and ?dev=post. There is no sparkle to set
    any more - the snap's one golden light is .post-magic, which postFormation()
    raises, and this function deliberately does not reach into that. */
function devEndPose() {
  const snap  = document.getElementById('finaleSnap');
  const el    = document.getElementById('entry');
  if (el)    el.style.display = 'none';
  if (snap)  snap.classList.add('is-on');
  const shadow = document.getElementById('finaleShadow');
  if (shadow) shadow.style.opacity = '0';   /* the snap art draws its own */
  /* AND THE BOX GOES. It topples at the top of the ending and box-topple ends
     at opacity 0 forwards, so the finale leaves this screen without it - but the
     dev jump skips all of that, and the box is 1687 x 342 of pale cream across
     the bottom third of the stage. The first screenshot of the formation had it
     sitting behind the whole lower half of the ring, which is not what the
     screen looks like. Using the real class rather than setting opacity, so this
     stays true if the topple changes. */
  const tray = document.querySelector('.tray');
  if (tray) tray.classList.add('is-toppling');
}

/* --- the developer shortcut -------------------------------------------------

   ?dev=1 puts a button at the foot of the screen that jumps straight to the
   next screen. Nothing below runs, and the markup stays hidden, without it.

   It jumps rather than transitioning: no celebration, no haul, no deck deal
   held for its beat. The point of it is to reach screen 3 in two clicks while
   working on screen 3, and every one of those is something you would then be
   waiting out. From the title screen it starts the game directly, which is the
   same idea applied to the one screen before the first.

   THE WORK IS ALL IN THE CANCELLING. A skip can land in the middle of a haul,
   with two bays on the line and the finished round's cards re-parented into the
   one that is leaving; or during the celebration, with a video playing and a
   rAF loop walking Aaru between his two stations; or while the prompt is still
   typing itself out. Anything left running would then be operating on a round
   that no longer exists. So this tears the board down to nothing and rebuilds
   it the way startBoard does, rather than trying to unwind whichever state it
   caught.
   -------------------------------------------------------------------------- */

/** The screen a skip would land on. Wraps, so the last screen leads back to the
    first — once the game is won, roundIndex is already past the end. */
function devNextIndex() {
  return (!started || roundIndex + 1 >= ROUNDS.length) ? 0 : roundIndex + 1;
}

/** Stop everything the board has in flight, and empty the line. */
function devTeardown() {
  stopSaying();                      /* mid-sentence about a screen that is going */
  recapStop();                       /* ...and the post game, if it was showing */
  clearTimeout(hint1Timer);
  clearTimeout(hint2Timer);
  clearTimeout(pulseTimer);
  clearTimeout(voHintTimer);
  clearTimeout(praiseTimer);
  praiseTimer = null;             // speaking() reads it - see there
  clearTimeout(dealTimer);
  clearTimeout(dealSettleTimer);
  clearTimeout(celebTimer);
  clearTimeout(haulGuard);
  /* Refills owed to a screen that is being thrown away, and the twinkles they
     were going to throw. buildRound clears these too; a skip has to as well,
     because it can land between a placement and the drop it bought. */
  arriveTimers.forEach(clearTimeout);
  arriveTimers = [];
  document.querySelectorAll('.tray-pop').forEach(el => el.remove());
  clearInterval(typeTimer);          /* the prompt writes itself with an interval */
  clearTimeout(promptTimer);         /* ...and may be pinned mid-handover */
  clearDrop();                       /* the finale: its ride, its arc, its beats,
                                        and the classes it left on #celebrate,
                                        #entry and .tray. Every one of those is
                                        owned by the finale section; this is the
                                        one call that undoes all of it. */
  cancelAnimationFrame(celebRaf);
  cancelAnimationFrame(haulRaf);
  haulRaf = 0;
  celebRaf = 0;
  haulGuard = null;
  typeTimer = null;

  if (celebEl) {
    try { celebEl.pause(); celebEl.currentTime = 0; } catch { /* not seekable */ }
    delete celebEl.dataset.leg;      /* back to the parked rule */
  }

  hideHand();
  clearPulse();

  /* Both bays go, mid-ride or not. The placed cards ride out inside the leaving
     bay's hangers (see haulLine), so this takes them too — buildRound builds
     fresh ones. */
  washEl.replaceChildren();
  bayEl = null;
  slotEls = [];
  ropeEl.style.backgroundPosition = '';
}

function devSkip() {
  const to = devNextIndex();
  devTeardown();

  if (!started) {
    /* Same three things startGame does, minus the pop and the artwork fade. */
    started = true;
    playEl.disabled = true;
    titleEl.hidden = true;
  }

  roundIndex = to;
  mountBay();                        /* a line to hang the new round on */
  locked = false;
  buildRound(roundIndex);
  resetIdle();
  devLabel();
}

/** Keep the button saying where it goes, so it is obvious which screen a click
    lands on — including that it wraps at the end. */
function devLabel() {
  const btn = document.getElementById('devSkip');
  if (btn) btn.textContent = 'skip \u2192 screen ' + (devNextIndex() + 1);
}

function devInit() {
  let mode = '';
  try {
    mode = new URLSearchParams(location.search).get('dev') || '';
  } catch { /* no URL API, no dev bar */ }
  if (mode !== '1' && mode !== 'post') return;

  const bar = document.getElementById('devbar');
  const btn = document.getElementById('devSkip');
  if (!bar || !btn) return;
  bar.hidden = false;
  devLabel();
  btn.addEventListener('click', devSkip);

  /* The post game is the one screen that cannot be reached by skipping: it
     comes after the finale, which comes after the last card of the last
     screen. Twelve correct drags to see a twelve second animation is not a way
     to work on it, so this jumps straight there. */
  const post = document.createElement('button');
  post.className = 'devbtn';
  post.type = 'button';
  post.textContent = 'post game \u2192';
  /* The formation too, and after a lead rather than with it: this button jumps
     in with no finale behind it, so nothing else is going to call it. The real
     game starts it from the snap beat, three and a half seconds later than the
     landing, which is why playPostGame() does not schedule it itself. */
  post.addEventListener('click', () => {
    devEndPose();
    playPostGame();
    setTimeout(() => postFormation(), 700);
  });
  bar.appendChild(post);

  console.info('[aaru] dev mode: skip and post-game buttons on. Drop ?dev= to hide them.');

  /* ?dev=post runs it on load, for the same reason. The title screen has to go
     first: it is painted over everything at z-index 90 precisely so that
     nothing can cover it, and the post game sits below that, so without this
     the recap would run perfectly well behind the title art. */
  if (mode === 'post') {
    setTimeout(() => {
      started = true;
      playEl.disabled = true;
      titleEl.hidden = true;
      /* Deliberately NOT opening the audio context here. Nothing has been
         touched at this point, so the browser would refuse it, and its refusal
         reads like a fault in the game rather than the cost of skipping the
         play button.

         The cues themselves still ask for it — every sfx() and every narrator
         line calls audio() — so Chrome logs its autoplay warning a couple of
         times per load in THIS MODE ONLY, and there is no way to avoid that
         short of teaching the whole audio path about dev mode, which is not
         worth it. A normal playthrough opens the context on the play button and
         is completely clean: verified, zero errors and zero warnings. */
      console.info('[aaru] ?dev=post runs without a user gesture, so there is no ' +
                   'sound in this mode and Chrome will log one or two "AudioContext ' +
                   'was not allowed to start" warnings. Both are expected here and ' +
                   'do not happen in a normal playthrough.');
      devEndPose();
      playPostGame();
      setTimeout(() => postFormation(), 700);   /* same reason as the button */
    }, 400);
  }
}

/* --- boot ------------------------------------------------------------------ */

/* WHICH BUILD AM I LOOKING AT. This exists because three rounds of asset fixes
   were invisible to the person reviewing them: Chromium replays a <video> src
   out of its media cache on a plain reload AND in a fresh tab, without so much
   as an If-Modified-Since, and a dev server that sends no ETag has no way to
   argue. Every fix looked like "no change".

   So the build says who it is, out loud, on every load, and the entrance clip
   reports the dimensions the DECODER actually got — which is the one number
   that cannot be faked by a stale cache. Read it in the console:

     [aaru] build N - entry.webm WxH, grip-y P%

   W, H and P are ENTRY_SPRITE below, and that is the only place they are
   written down — a build that disagrees with it prints a loud warning naming
   which file is stale. Do not quote the numbers in prose here: they were
   480x378 in this comment for several builds after the sprite became 494x332,
   which meant this diagnostic told anyone who followed it that a CORRECT build
   was stale. If it says anything else, the page is running
   old bytes and no amount of looking at the screen will tell you why. Bump
   BUILD whenever a GENERATED asset is rebuilt — anything under assets/images/ or
   assets/sfx/ — and bump the matching ?v= in index.html with it.

   THE CONSTANT ITSELF IS AT THE TOP OF THIS FILE, not here. It has to be: the
   cues and the narrator are fetched with ?v=BUILD by primeSfx()/primeVo(), and
   those run on the way up, hundreds of lines before this point. A `const` is
   hoisted into a temporal dead zone rather than initialised, so declaring it
   here and reading it there is a ReferenceError, not a stale number. The
   documentation stayed where it was worth reading.

   IT NOW COVERS THE AUDIO, which it did not until the cue set was rebuilt from
   recordings. Sixteen of the eighteen .wav files are generated by
   tools/render-cues.js, and they were fetched with no token at all — so a
   re-render was invisible to any browser that had opened the game before, in
   exactly the way three rounds of video fixes were invisible and for exactly the
   same reason. serve.py sends Cache-Control: no-store and hid this; Live Server
   does not. */

/** The sprite these constants were derived against. --entry-grip-x/y are
    measured off ONE cut of the clip and are meaningless against any other: the
    anchor is a percentage of a specific frame's height, so a stylesheet and a
    .webm from different builds place his fists in the wrong place and he hangs
    off the line with a gap under his hands. That is a silent failure — the page
    looks fine, it is just wrong — and it is what a cached stylesheet produces.
    So it is checked, out loud, on every load. */
const ENTRY_SPRITE = { w: 494, h: 332, gripY: '9.64%' };

function stampBuild() {
  /* THE TWO CACHE TOKENS, AGAINST EACH OTHER. index.html's ?v= busts app.js;
     BUILD busts every generated asset app.js then fetches. They are edited by
     hand, in two files, and they drifted for three builds - the code was new and
     the sounds were the old ones, which reads as "nothing changed" rather than as
     a cache fault. Neither number can validate itself, but they can validate
     each other, so this is the one place that can catch it. */
  const own = document.querySelector('script[src*="app.js"]');
  const tag = own && (own.getAttribute('src').match(/[?&]v=(\d+)/) || [])[1];
  if (tag && Number(tag) !== BUILD) {
    console.warn(
      [
        '[aaru] BUILD DRIFT. index.html and app.js disagree about which build',
        'this is, so the code is from one and the generated assets - every .wav',
        'and every card image - are being fetched with the other token.',
        '  index.html  app.js?v=' + tag,
        '  app.js      BUILD = ' + BUILD,
        '  Fix: set both to the same number. Bump BOTH whenever anything under',
        '  assets/images/ or assets/sfx/ is rebuilt.',
      ].join('\n'));
  }

  const el = document.getElementById('entry');
  if (!el) {
    console.info('[aaru] build %d, tray seed %d - no entry clip', BUILD, SHUFFLE_SEED);
    return;
  }

  const say = () => {
    const gy = getComputedStyle(document.documentElement)
                 .getPropertyValue('--entry-grip-y').trim();
    /* THE TRAY SEED IS PRINTED WITH THE BUILD because it is the other half of
       "which game am I looking at". Open the game with ?seed=<that number> and
       the three cards are dealt in exactly the arrangement being reported. */
    console.info('[aaru] build %d, tray seed %d - entry.webm %dx%d, grip-y %s',
                 BUILD, SHUFFLE_SEED, el.videoWidth, el.videoHeight, gy);

    const clip = el.videoWidth === ENTRY_SPRITE.w && el.videoHeight === ENTRY_SPRITE.h;
    const css  = gy === ENTRY_SPRITE.gripY;
    if (clip && css) return;
    console.warn(
      [
        '[aaru] STALE CACHE. This page is mixing builds, and Aaru will not sit on',
        'the clothesline properly.',
        '  entry.webm     : ' + el.videoWidth + 'x' + el.videoHeight +
          '  (expected ' + ENTRY_SPRITE.w + 'x' + ENTRY_SPRITE.h + ')  ' +
          (clip ? 'ok' : '<- STALE'),
        '  --entry-grip-y : ' + (gy || '(none)') +
          '  (expected ' + ENTRY_SPRITE.gripY + ')  ' + (css ? 'ok' : '<- STALE'),
        '  Fix: hard reload (Ctrl+Shift+R), or open the page with a query string',
        '  it has never seen before, e.g. ?fresh=1',
      ].join('\n'));
  };

  if (el.videoWidth) say();
  else el.addEventListener('loadedmetadata', say, { once: true });
}

window.addEventListener('resize', fitStage);
window.addEventListener('orientationchange', fitStage);

/* Safari reports a pinch as a gesture event of its own, which touch-action does
   not reliably cover. Nothing in the game uses gesture events, so swallowing all
   three costs nothing and keeps the board where fitStage() put it. */
['gesturestart', 'gesturechange', 'gestureend'].forEach((n) =>
  document.addEventListener(n, (ev) => ev.preventDefault(), { passive: false }));

/* THE SYSTEM CAN TAKE THE AUDIO CONTEXT AWAY AND DOES NOT GIVE IT BACK. On a
   phone an app switch, a screen lock or an incoming call interrupts it, and
   nothing here was resuming it on the way back - so the game came back SILENT,
   and this game is narrated, so silent means uninstructed. It could not even fix
   itself: the only in-game resume is onCardPointerDown's audio(), which sits
   behind inputLocked(), and inputLocked() is true for as long as her queue is
   draining against voGuard's wall clock with nothing audible - so the taps that
   would have opened it are refused too, and a tap on a FRAME never asks for the
   context at all.

   ONLY AFTER THE PLAY GESTURE, so the boot rule beside primeSfx() still stands:
   the context is born suspended and nothing but the play button starts it.
   Resuming a context the child has never touched is the autoplay warning that a
   normal playthrough is verified not to produce. */
function wakeAudio() {
  if (!started || !audioCtx || audioCtx.state === 'running') return;
  audioCtx.resume().catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) wakeAudio(); });
/* Restored out of the page cache, which is how iOS Safari usually hands the game
   back after the child has been somewhere else. `persisted` ONLY: pageshow also
   fires on a first load, where there is no gesture yet. */
window.addEventListener('pageshow', (ev) => { if (ev.persisted) wakeAudio(); });

fitStage();
/* Started as early as there is a document to start it against, because it is a
   RACE it has to win rather than a question it has to answer: the first clip can
   be earned about fifteen seconds in, and until this settles every clip is
   treated as unshowable. It costs one 32x32 canvas read. See probeAlphaVideo. */
probeAlphaVideo();
devInit();
stampBuild();
