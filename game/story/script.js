/* ONE LEVEL ACROSS BOTH HALVES OF THE EXPERIENCE.

   The book and the game are two apps that now play back to back, and they were
   mixed apart: the book plays its clips through <audio>/<video> at the element
   default of 1.0, while the game puts everything she says through a gain of
   VO_VOLUME = 0.50 (see ../app.js). The recordings themselves are already
   matched - measured over the loudest 100ms, the book's pages sit at -9.3 dB
   and the game's narrator lines at -9.9 dB, which is inside the spread of
   either set - so the only thing that made the story twice as loud as the game
   was that playback gain. Six dB at the seam, on a narrator who is the same
   person either side of it.

   IT IS DONE ON play() RATHER THAN AT EACH CALL SITE. The book creates media
   three different ways (new Audio for the page clips, the title wav, and the
   finale's <video>), and a shim on the one method they all pass through cannot
   be got round by a fourth. Once per element, so nothing here fights a fade -
   the book sets .volume nowhere else, which is why this is safe to own.

   The game's own trim is deliberately NOT raised to meet the book: SFX_VOLUME
   was tuned against VO_VOLUME as it stands, so moving the voice would pull the
   whole mix of effects out with it. The quieter of the two is the reference. */
(() => {
  "use strict";
  const VOICE = 0.50;                 /* == VO_VOLUME in ../app.js */
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (!this.__levelled) { this.__levelled = true; this.volume = VOICE; }
    return play.apply(this, arguments);
  };
})();

/* ============================================================================
   आरु की छींक · Aaru's Sneeze — interactive picture book
   ----------------------------------------------------------------------------
   Modules, in order:
     PAGES      the story itself (art + text + what lives in each scene)
     PageAudio  the supplied narration, one mapped clip per page
     Ambience   builds dust / sparkles / puffs per page
     Book       page rendering + the page-turn transition
     UI         buttons, keyboard, swipe, visibility
   ========================================================================== */
(() => {
  "use strict";

  /* ── PAGES ──────────────────────────────────────────────────────────────
     scene keys
       motion  "breathe" (default) | "sway"     subtle life in the artwork
       dust    floating motes
       sparks  [{x,y}]  % coordinates, pinned to something in the artwork
       puffs   [{x,y,size}] % coordinates, a soft breath of air
     Coordinates are % of the picture, which is always 1600×900, so they
     stay correct at every screen size.

     The book is Hindi: only the `hi` half of every text and alt is read. The
     `en` translations are kept here rather than deleted — they are finished
     translation work and cost nothing sitting unused — but nothing renders
     them, and there is no language switch any more.
     -------------------------------------------------------------------- */
  const PAGES = [
    {
      img: "assets/images/page-01.webp",     /* flat fallback: needs no masks */
      cover: true,
      /* the same picture as three layers, so Aaru can ride in and the title
         can pop. Geometry is % of the frame, measured off the artwork. */
      layers: {
        bg: "assets/images/cover-bg.webp",
        hero:  { x: "5.26%",  y: "0.21%",  w: "50.36%", h: "99.79%",
                 img:  "assets/images/cover-hero.webp",
                 mask: "assets/images/cover-hero-mask.webp" },
        title: { x: "56.22%", y: "10.63%", w: "43.66%", h: "59.51%",
                 img:  "assets/images/cover-title.webp",
                 mask: "assets/images/cover-title-mask.webp" },
        flash: "58%"
      },
      alt: {
        hi: "आरु साइकिल चलाते हुए ज़ोर से छींकता है — कहानी का मुख्य चित्र।",
        en: "Aaru sneezing hard while riding his red bicycle — the cover picture."
      },
      /* the cover carries its title in the artwork, so it gets no words */
      motion: "sway", dust: 5,
      puffs: [{ x: 21, y: 29, size: 16 }]
    },
    {
      img: "assets/images/page-02.webp",
      alt: {
        hi: "लाल खपरैल वाले घर की चौखट पर बैठा आरु।",
        en: "Aaru sitting on the step of a little house with a red-tiled roof."
      },
      text: {
        hi: "आज अम्मा बाहर गई थी। आरु को भूख लगी। उसने सोचा, “आज मैं खुद रोटी बनाऊँगा।”",
        en: "Amma had gone out today. Aaru felt hungry. He thought, “Today I&rsquo;ll make roti myself.”"
      },
      motion: "sway", dust: 6
    },
    {
      img: "assets/images/page-03.webp",
      alt: {
        hi: "छींक से ढक्कन उड़ जाता है और आटा आरु के ऊपर गिर जाता है।",
        en: "A sneeze sends the lid flying and covers Aaru in white flour."
      },
      text: {
        hi: "उसने थाली में आटा लिया। लेकिन तभी उसकी नाक में कुछ गुदगुदी हुई। <em>आ… आ…छीं…</em>। सारा आटा उड़ गया फुर्र…।",
        en: "He took some flour in a plate. But just then his nose began to tickle. <em>Aa… aa… CHOO!</em> All the flour flew away — pfff!"
      },
      dust: 9,
      puffs: [{ x: 57, y: 42, size: 22 }]
    },
    {
      img: "assets/images/page-04.webp",
      alt: {
        hi: "आरु सँभलकर, डरते-डरते डिब्बे में झाँकता है।",
        en: "Aaru carefully peering into the tin, holding up the lid."
      },
      text: {
        hi: "आरु ने डिब्बे में देखा। “अरे! आटा तो खत्म हो गया।”",
        en: "Aaru looked in the tin. “Oh no! The flour is all finished.”"
      },
      dust: 5
    },
    {
      img: "assets/images/page-05.webp",
      alt: {
        hi: "आरु ख़ुशी से अपनी लाल साइकिल चला रहा है।",
        en: "Aaru riding his red bicycle happily down a dusty path."
      },
      text: {
        hi: "आरु ने अपनी साइकिल निकाली और आटा लेने बाज़ार की ओर चल पड़ा। ट्रिन-ट्रिन…ट्रिन-ट्रिन।",
        en: "Aaru took out his bicycle and set off for the market to fetch some flour. Tring-tring… tring-tring."
      },
      motion: "sway", dust: 8
    },
    {
      img: "assets/images/page-06.webp",
      alt: {
        hi: "छींक के धक्के से आरु साइकिल से हवा में उड़ जाता है।",
        en: "A sneeze throws Aaru off his bicycle and into the air."
      },
      text: {
        hi: "फिर उसकी नाक फड़कने लगी। <em>आ…छीं…</em>। वह गिर पड़ा धड़ाम…।",
        en: "Then his nose began to twitch. <em>Aa… CHOO!</em> Down he crashed — dhadaam!"
      },
      motion: "sway", dust: 9,
      puffs: [{ x: 72, y: 37, size: 19 }]
    },
    {
      img: "assets/images/page-07.webp",
      alt: {
        hi: "गिरी हुई साइकिल के पास उदास खड़ा आरु।",
        en: "Aaru standing sadly beside his fallen bicycle."
      },
      text: {
        hi: "“उफ़! यह छींक भी ना,” उसने कपड़े झाड़ते हुए कहा।",
        en: "“Ugh! This sneeze of mine,” he said, dusting off his clothes."
      },
      dust: 7
    },
    {
      img: "assets/images/page-08.webp",
      alt: {
        hi: "गन्ने के रस के ठेले पर छींक से आरु के हाथ से गिलास छूट जाता है।",
        en: "At the sugarcane-juice cart, a sneeze knocks the glass from Aaru's hand."
      },
      text: {
        hi: "बाज़ार पहुँचते ही आरु की नज़र गन्ने के रस के ठेले पर पड़ी। वहाँ उसने गन्ने का रस लिया। <em>आ…छीं…</em>। सारा रस नीचे छपाक…।",
        en: "The moment he reached the market, Aaru spotted the sugarcane-juice cart. He got himself a glass of juice. <em>Aa… CHOO!</em> The whole glass splashed to the ground — chhapaak!"
      },
      motion: "sway", dust: 7,
      puffs: [{ x: 45, y: 50, size: 15 }]
    },
    {
      img: "assets/images/page-09.webp",
      alt: {
        hi: "समोसे की दुकान पर छींक के बाद कुत्ता समोसा ले भागता है।",
        en: "At the samosa stall, a dog runs off with the samosa after Aaru's sneeze."
      },
      text: {
        hi: "उसने गरम समोसा लिया। तभी— <em>आ…आ…छीं…</em>। समोसा गिरा टप्प और कुत्ता झट से चट कर गया।",
        en: "He took a hot samosa. And then — <em>Aa… aa… CHOO!</em> The samosa fell, tapp, and a dog gobbled it up in a flash."
      },
      dust: 8,
      puffs: [{ x: 66, y: 55, size: 16 }]
    },
    {
      img: "assets/images/page-10.webp",
      alt: {
        /* the artwork has no cat in it, unlike the words, so the description
           of the picture and the telling of the story part company here */
        hi: "आटा लेकर घर लौटता आरु छींक रहा है; दरवाज़े से अम्मा अंदर आ रही हैं।",
        en: "Aaru coming home with the flour, sneezing, while Amma steps in through the doorway."
      },
      text: {
        hi: "उदास आरु आटा लेकर घर लौटा। <em>आ…छीं…</em>। एक बिल्ली डरकर भागी। तभी अम्मा लौटीं। “वाह! तुमने दूध बचा लिया।”",
        en: "A gloomy Aaru walked home with the flour. <em>Aa… CHOO!</em> A cat ran off in fright. Just then Amma came home. “Well done! You saved the milk.”"
      },
      dust: 6
    },
    {
      img: "assets/images/page-11.webp",
      alt: {
        hi: "छींक से ताक पर रखे सारे बरतन नीचे गिर जाते हैं।",
        en: "A sneeze sends every pot and pan tumbling off the shelves."
      },
      text: {
        hi: "फिर आरु की नाक फड़कने लगी। <em>आ…छीं…</em>। बर्तन गिरे धड़ाम…।",
        en: "Then Aaru&rsquo;s nose began to twitch again. <em>Aa… CHOO!</em> The pots came crashing down — dhadaam!"
      },
      dust: 10,
      puffs: [{ x: 70, y: 51, size: 21 }]
    },
    {
      img: "assets/images/page-12.webp",
      alt: {
        hi: "अम्मा बर्तन उठा रही हैं; कोने में खोया हुआ लॉकेट चमक रहा है।",
        en: "Amma gathering the fallen pots while the lost locket glints in the corner."
      },
      text: {
        hi: "अम्मा बर्तन उठाने लगीं, तभी उन्हें रसोई के एक कोने में अपना खोया हुआ लॉकेट पड़ा दिखाई दिया।",
        en: "As Amma began picking up the pots, she spotted her long-lost locket lying in a corner of the kitchen."
      },
      dust: 8,
      sparks: [{ x: 9, y: 93, size: 3.4 }, { x: 6, y: 90, size: 2.2 }, { x: 12, y: 95, size: 2 }]
    },
    {
      img: "assets/images/page-13.webp",
      alt: {
        hi: "अम्मा हँसते हुए अपना लॉकेट दिखाती हैं और आरु खिलखिला उठता है।",
        en: "Amma laughing as she holds up her locket, and Aaru giggling beside her."
      },
      text: {
        hi: "अम्मा हँसी, “अरे वाह! तुम्हारी छींक तो कमाल की है।” आरु भी खिलखिला उठा।",
        en: "Amma laughed, “Well, well! That sneeze of yours is really something.” And Aaru burst into giggles too."
      },
      dust: 7, last: true,
      sparks: [{ x: 9.6, y: 45, size: 3.6 }, { x: 6, y: 41, size: 2.3 }, { x: 13, y: 49, size: 2.1 }]
    }
  ];


  /* Where the words sit on each picture, taken from the Figma design (file
     i5spwg0NKSC0kfYp4zNmuN, the STORY section at node 305:134). Every page
     there is a 1920 x 1080 slide with the text in a hand-placed box, so these
     are that box's left edge, top edge and width as percentages of the
     picture — the same proportions at any screen size, our frame being the
     same 16:9 shape.

     The weight is per row because the design is not uniform about it: page 3
     is set in Medium and every other page in SemiBold. Copied as found rather
     than tidied, since the brief was to match the design.

     The size and colour are the same on every page — 50px on a 1920-wide
     slide, #36271a — so they live in .scene__text rather than being repeated
     twelve times here.

     Rows are labelled by the artwork they belong to, not by the page's place
     in the array, so moving a page cannot silently shift the table.
     [ left%, top%, width%, weight ]                                       */
  const TEXT_BOX = [
    null,                               /* page-01  title painted into the art    */
    [ 3.28, 18.98, 33.49, 600],         /* page-02  house right, words left       */
    [58.80, 13.06, 37.19, 500],         /* page-03  flour plume left  (Medium)    */
    [ 7.34, 16.67, 29.22, 600],         /* page-04  Aaru and the tin on the right */
    [56.93, 12.69, 37.24, 600],         /* page-05  he rides in from the left     */
    [ 7.19, 17.59, 33.33, 600],         /* page-06  boy and bicycle fly off right */
    [ 5.89, 16.02, 33.33, 600],         /* page-07  he stands on the right        */
    [63.33, 10.09, 30.16, 600],         /* page-08  juice cart on the left        */
    [ 7.29, 12.04, 46.25, 600],         /* page-09  dog and stall, lower half     */
    [57.19, 11.94, 40.26, 600],         /* page-10  doorway left, boy centre      */
    [ 6.30, 22.41, 33.33, 600],         /* page-11  falling pots on the right     */
    [51.88, 22.59, 41.09, 600],         /* page-12  Amma and the locket, left     */
    [54.04, 16.05, 41.01, 600]          /* page-13  Amma and Aaru on the left     */
  ];
  TEXT_BOX.forEach((b, i) => {
    if (b && PAGES[i]) {
      PAGES[i].box = { x: b[0] + "%", y: b[1] + "%", w: b[2] + "%", weight: b[3] };
    }
  });

  /* ── tiny helpers ─────────────────────────────────────────────────────── */
  const $  = (s, r = document) => r.querySelector(s);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const svgUse = (id, cls) =>
    `<svg class="${cls || ""}" aria-hidden="true"><use href="#${id}"/></svg>`;

  /* ── Story text → one sentence per line ───────────────────────────────────
     A new reader should never have to hunt for where one thought ends and
     the next begins, so every sentence starts its own line. A sentence too
     long for the column still wraps; CSS gives the wrapped part a hanging
     indent so it reads as a continuation, not as a new sentence.

     Speech is kept whole: a terminator inside “quotes” must not break the
     line, or “वाह! तुमने दूध बचा लिया।” would land on two of them with a
     dangling opening quote. The sneezes are <em>elements</em>, so the split
     walks nodes rather than the raw string and never cuts a tag in half.
     --------------------------------------------------------------------- */
  const SENT_END = /[।.?!][”’"')\]]*\s*$/;
  const quotesClosed = (s) =>
    (s.match(/“/g) || []).length === (s.match(/”/g) || []).length;

  function sentenceLines(html) {
    const src = document.createElement("div");
    src.innerHTML = html || "";

    const out = document.createDocumentFragment();
    let line = null;
    const open  = () => { line = document.createElement("span"); line.className = "ln"; };
    const close = () => { if (line && line.textContent.trim()) out.append(line); line = null; };

    open();
    for (const node of [...src.childNodes]) {
      /* text splits after each terminator; an element rides along whole */
      const chunks = node.nodeType === 3
        ? (node.data.match(/[^।.?!]*[।.?!]+[”’"')\]]*\s*|[^।.?!]+/g) || [])
        : [node];
      for (let chunk of chunks) {
        /* the space that followed the previous full stop belongs to no line */
        if (!line.hasChildNodes() && typeof chunk === "string") {
          chunk = chunk.replace(/^\s+/, "");
          if (!chunk) continue;
        }
        line.append(chunk);
        const so_far = line.textContent;
        if (SENT_END.test(so_far) && quotesClosed(so_far)) { close(); open(); }
      }
    }
    close();
    return out;
  }

  const calmMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
  const calm = () => calmMedia.matches;

  const cssMs = (name, fallback) => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) ? (raw.endsWith("ms") ? n : n * 1000) : fallback;
  };

  /* ── Cover ──────────────────────────────────────────────────────────────
     The title page is three images rather than one: a background with Aaru
     and the title painted out, plus each of those as a cut-out (JPEG colour
     with a separate 8-bit mask, a fraction of the weight of RGBA PNG). The
     cut-outs were extracted with straight alpha against that exact
     background, so at rest the three layers recompose the original artwork
     pixel for pixel.

     The entrance: Aaru rides in from the left, and once he lands the title
     pops with a flash of light. Where masks are unsupported, or the visitor
     asked for reduced motion, the flat cover is shown and nothing moves.
     -------------------------------------------------------------------- */
  const Cover = (() => {
    const ok = typeof CSS !== "undefined" && !!CSS.supports &&
      (CSS.supports("mask-image", "url(a)") || CSS.supports("-webkit-mask-image", "url(a)"));

    const HERO_MS  = 1020;   /* Aaru's ride in */
    const TITLE_AT = 830;    /* the title waits for him to arrive */
    const TITLE_MS = 720;

    function place(el, box) {
      el.style.left = box.x; el.style.top = box.y;
      el.style.width = box.w; el.style.height = box.h;
      el.style.backgroundImage = `url("${box.img}")`;
      el.style.webkitMaskImage = `url("${box.mask}")`;
      el.style.maskImage = `url("${box.mask}")`;
    }

    return {
      ok,
      get span() { return TITLE_AT + TITLE_MS; },

      /* point the layers at their images and put them where they belong */
      dress(host, layers) {
        place(host.querySelector(".cover__hero"), layers.hero);
        place(host.querySelector(".cover__title"), layers.title);
        const t = layers.title;
        const f = host.querySelector(".cover__flash");
        f.style.setProperty("--fx", `calc(${t.x} + ${t.w} / 2)`);
        f.style.setProperty("--fy", `calc(${t.y} + ${t.h} / 2)`);
        f.style.setProperty("--fs", layers.flash || "60%");
        host.hidden = false;
      },

      hide(host) { host.hidden = true; host.classList.remove("is-settled"); },

      /* Returns a promise that settles when the entrance has landed. The
         cover is the one page with no recording, so this is what "the first
         one has finished playing" means for it, and the page-turn gate waits
         on it exactly as it waits on a clip's `ended`. */
      play(host) {
        if (!host || host.hidden) return Promise.resolve();
        const hero  = host.querySelector(".cover__hero");
        const title = host.querySelector(".cover__title");
        const flash = host.querySelector(".cover__flash");
        host.classList.remove("is-settled");

        if (calm()) { host.classList.add("is-settled"); return Promise.resolve(); }

        /* The cover is the one page with no recording to hang a cue off, so
           its two sounds are timed off this entrance instead: air moving as
           Aaru rides in, and a small chime as the title lands. */
        Beats.sfx("whoosh");
        setTimeout(() => Beats.sfx("chime"), TITLE_AT + 150);

        const runs = [];

        runs.push(hero.animate([
          { transform: "translate3d(-72%, 4%, 0) scale(.965) rotate(-2.2deg)", opacity: 0, offset: 0 },
          { opacity: 1, offset: 0.16 },
          { transform: "translate3d(2.2%, -1.1%, 0) scale(1.008) rotate(.7deg)", opacity: 1, offset: 0.74 },
          { transform: "translate3d(-.6%, .3%, 0) scale(.999) rotate(-.2deg)", opacity: 1, offset: 0.89 },
          { transform: "translate3d(0, 0, 0) scale(1) rotate(0deg)", opacity: 1, offset: 1 }
        ], { duration: HERO_MS, easing: "cubic-bezier(.22,.72,.24,1)", fill: "both" }));

        flash.animate([
          { transform: "scale(.2)",  opacity: 0 },
          { transform: "scale(.85)", opacity: .8, offset: 0.35 },
          { transform: "scale(1.35)", opacity: 0 }
        ], { duration: 620, delay: TITLE_AT + 40, easing: "ease-out" });

        const pop = title.animate([
          { transform: "translate3d(0, 6%, 0) scale(.24) rotate(-11deg)", opacity: 0, offset: 0 },
          { opacity: 1, offset: 0.18 },
          { transform: "translate3d(0, -1.5%, 0) scale(1.16) rotate(3.5deg)", opacity: 1, offset: 0.55 },
          { transform: "translate3d(0, .6%, 0) scale(.965) rotate(-1.4deg)", opacity: 1, offset: 0.78 },
          { transform: "translate3d(0, 0, 0) scale(1) rotate(0deg)", opacity: 1, offset: 1 }
        ], {
          duration: TITLE_MS, delay: TITLE_AT,
          easing: "cubic-bezier(.34,1.1,.3,1)", fill: "both"
        });
        runs.push(pop);

        /* every run ends on an identity transform, which is also the resting
           state, so they can simply be dropped and the CSS idle motion picked
           up without a jump */
        let landed = false;
        return new Promise((done) => {
          const settle = () => {
            if (landed) return;
            landed = true;
            runs.forEach((a) => { try { a.cancel(); } catch { /* already gone */ } });
            host.classList.add("is-settled");
            done();
          };
          if (pop.finished) pop.finished.then(settle).catch(settle);
          /* the timer is only here in case the animation is lost — settle()
             runs once either way, so the promise always resolves */
          setTimeout(settle, TITLE_AT + TITLE_MS + 140);
        });
      },

      /* the sound of it: a whoosh as he arrives, a pop as the title lands */
      cue() {
        if (calm()) return;
      }
    };
  })();

  /* ── PageAudio ──────────────────────────────────────────────────────────
     The one and only source of sound in this book.

     Every story page maps to its own clip in assets/audio/ (page-02.mp3 …
     page-13.mp3), cut from the supplied recording by tools/cut-audio.ps1.
     A page can therefore only ever play its own words.

     One HTMLAudioElement exists for the whole session and is reused, so a
     second clip can never start on top of a first. Every entry point goes
     through stop() first, which pauses, rewinds, drops the source and frees
     the decoder. A monotonically increasing `token` invalidates any play()
     promise or timer still in flight, which is what makes hammering the
     next/prev buttons safe.

     The word highlight is driven by the clip's own currentTime, so the last
     word lights up exactly as the narration ends. No speech synthesis, no
     generated tones, no ambient bed — nothing but the supplied recording.
     -------------------------------------------------------------------- */
  const PageAudio = (() => {
    const KEY  = "aaru.read";
    const MUTE = "aaru.sound";
    /* ?v= bumps whenever the clips are re-cut — the filenames stay the same,
       so without it a refresh would quietly serve the previous audio */
    const CUT = 9;
    const clip = (n) => `assets/audio/page-${String(n).padStart(2, "0")}.mp3?v=${CUT}`;

    /* Both switches these keys remember — #readBtn and #soundBtn — sit inside
       .topbar, and the bar is display:none (style.css §3). So a stored "off"
       is a one-way door: the book falls silent and nothing left on screen can
       give it its voice back. Whichever of the two was set, the symptom is the
       same — a story that never speaks again, on that browser, forever.

       While the bar is out of reach the stored answer is therefore ignored and
       forgotten, and the book always opens able to speak. Bring the bar back
       and the buttons are trusted again, because then there is a way to undo
       them. */
    const reachable = () => {
      const bar = document.querySelector(".topbar");
      return !!bar && getComputedStyle(bar).display !== "none";
    };

    let on, muted;
    if (reachable()) {
      on    = localStorage.getItem(KEY)  !== "off";   /* narration on by default */
      muted = localStorage.getItem(MUTE) === "off";
    } else {
      on = true; muted = false;
      /* clear them, or restoring the bar would resurrect the old silence */
      try { localStorage.removeItem(KEY); localStorage.removeItem(MUTE); } catch { /* private mode */ }
    }

    let el = null;              /* the single audio element — never a second */
    let token = 0;              /* invalidates anything still in flight */
    let pageNo = 0, hasText = false, playing = false;
    const listeners = [];   /* told when sound starts and stops */
    const enders = [];      /* told when a clip is done for good */

    /* --- the single element, wired once so listeners never accumulate ---- */
    function element() {
      if (el) return el;
      el = new Audio();
      el.preload = "auto";
      el.muted = muted;
      /* Deliberately NOT added to the document. An <audio> attached to the
         DOM here never gets past readyState 0 — detached is the only form
         that loads. `data-clip` on <html> exposes which clip is live, so the
         element stays inspectable without touching it. */

      el.addEventListener("playing", () => announce(true));
      el.addEventListener("ended", finish);
      el.addEventListener("error", () => {
        if (!el.getAttribute("src")) return;    /* our own teardown, not a fault */
        finish();
      });
      return el;
    }

    function announce(v) {
      if (v === playing) return;
      playing = v;
      listeners.forEach((fn) => fn(v));
    }

    /* The clip is over and nothing more is coming. Everything that reaches
       here means exactly that — the real `ended` event, a clip that failed to
       load, and a play() the browser refused before the first gesture — which
       is why the page-turn gate listens here and not to `ended` alone: a
       reader must never be left waiting on a clip that is never going to end.
       stop() deliberately does NOT come through here, because a page being
       left behind has not finished, it has been abandoned. */
    function finish() {
      announce(false);
      const page = pageNo;
      enders.forEach((fn) => fn(page));
    }

    function stop() {
      token++;
      held = false;                  /* whatever was waiting to resume is void */
      /* Pause and rewind only. Tearing the source down here (removeAttribute
         + load) leaves a teardown in flight that collides with the next
         clip's load and wedges it at readyState 0. The element holds one
         buffer, which the next src replaces, so nothing accumulates. */
      if (el) { try { el.pause(); el.currentTime = 0; } catch { /* not started */ } }
      delete document.documentElement.dataset.clip;
      announce(false);
    }

    /* ── holding, which is not stopping ─────────────────────────────────────
       The tab goes away mid-sentence and comes back. stop() is the wrong tool
       for that and was what was used: it rewinds to zero and it deliberately
       does NOT announce the clip as finished, so the page came back silent
       from the top with the forward gate still shut — the reader was left on a
       page that had stopped talking and would not let them leave.

       So the playhead is left exactly where it is. No rewind, and the token is
       not bumped either: bumping it is how a clip is disowned, and this clip
       is coming back. What does happen is announce(false), which is what tells
       Beats to stop following a playhead that is not moving; play() fires
       `playing` on the way back in, and Beats re-follows from wherever the
       clip now is, so no cue behind the playhead fires twice.

       `held` is the difference between a clip that is waiting and one that is
       simply not playing — the reader may have switched the narration off, or
       be on a page with no words, and neither of those should start talking
       because a tab regained focus. Only what this paused, this resumes. */
    let held = false;

    function hold() {
      if (!el || el.paused || el.ended) return;
      if (!el.getAttribute("src")) return;
      held = true;
      try { el.pause(); } catch { /* not started */ }
      announce(false);
    }

    function unhold() {
      if (!held) return;
      held = false;
      if (!el || !el.getAttribute("src") || el.ended) return;
      const mine = token;
      const p = el.play();
      if (p && p.catch) p.catch(() => {
        /* refused on the way back: let the page finish rather than hang, the
           same answer start() gives when a clip will not play */
        if (mine === token) finish();
      });
    }

    function start() {
      stop();                        /* always from silence */
      if (!hasText || !pageNo) return;   /* a wordless page has no clip */

      const mine = token;
      const a = element();
      a.muted = muted;
      /* Assigning src is enough to start the load; an explicit load() adds
         nothing and only risks aborting it. Re-assigning the same src does
         not restart playback, so a repeat of the same page rewinds instead. */
      const want = clip(pageNo);
      if (a.getAttribute("src") !== want) a.src = want; else a.currentTime = 0;
      document.documentElement.dataset.clip = "page-" + String(pageNo).padStart(2, "0");

      const p = a.play();
      if (p && p.catch) p.catch(() => {
        /* blocked before the first gesture, or the clip is missing —
           either way stay silent rather than half-playing */
        if (mine === token) finish();
      });
    }

    return {
      get on() { return on; },
      get muted() { return muted; },
      get playing() { return playing; },

      /* whether the page now bound has a clip at all. The cover has words
         nowhere in the artwork and so no recording, and that is the difference
         between a page the reader must wait out and one with nothing to wait
         for. */
      get hasClip() { return hasText && !!pageNo; },

      /* the live element, so Beats can follow the playhead. Read only —
         nothing outside this module ever drives playback. */
      get media() { return el; },

      /* called on every page change; `hosts` is only used to tell whether the
         page has any words, since a wordless page (the cover) has no clip */
      bind(hosts, page) {
        stop();
        pageNo = page || 0;
        const first = hosts.filter(Boolean)[0];
        hasText = !!(first && first.textContent.trim());
      },

      stop,
      hold, unhold,                    /* the tab left, and came back */
      play()   { if (on) start(); },   /* auto-play when a page arrives */
      replay() { start(); },           /* tapping the words */

      toggle() {
        on = !on;
        localStorage.setItem(KEY, on ? "on" : "off");
        if (on) start(); else stop();
        return on;
      },

      setMuted(v) {
        muted = !!v;
        localStorage.setItem(MUTE, muted ? "off" : "on");
        if (el) el.muted = muted;
        return muted;
      },

      onState(fn) { listeners.push(fn); },

      /* fn(pageNo) when that page's clip is done for good. The page number
         comes with it because a turn can start while a clip is still
         finishing, and a late `ended` from the page just left must not be
         read as the new page having finished. */
      onEnded(fn) { enders.push(fn); }
    };
  })();

  /* ── Pop ────────────────────────────────────────────────────────────────
     The book's one Web Audio context, and nothing else any more.

     THE PLAY BUTTON HAS NO SOUND. It used to answer a press with a short
     cork-pop — first two oscillators, later a 2KB recording — on the reasoning
     that a tap should say something back. It is gone: the button's answer is
     the title line that begins the moment it is pressed, and a pop in front of
     that is one sound too many at the very start of the book.

     What is left is the context itself, which was never really Pop's. It is
     shared, because a browser gives a page a limited number of them and the
     book only ever needs one: Sfx synthesises its fallback tones in this one.
     It is built on the first request and never on load, because a context
     created before a gesture starts out suspended and stays that way in some
     browsers — so the first thing to ask for it is the first thing that needs
     to make a sound, which is what unsuspends it.
     -------------------------------------------------------------------- */
  const Pop = (() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx = null;

    function context() {
      if (!AC) return null;
      if (!ctx) { try { ctx = new AC(); } catch { return null; } }
      if (ctx.state === "suspended") ctx.resume().catch(() => { /* not yet allowed */ });
      return ctx;
    }

    return {
      /* shared so the book only ever builds one audio context: Beats's
         sound effects are synthesised in this same one. */
      get ctx() { return context(); }
    };
  })();

  /* ── TitleVO ────────────────────────────────────────────────────────────
     The title page's own line, spoken once, when the play button is pressed.

     It is deliberately not part of PageAudio. That module maps one clip per
     *story* page and reads the page's own words to decide whether it has one;
     the cover has no words painted into it, so it has no clip and never will.
     This is the answer to a press rather than the reading of a page — the book
     holds on the title while it speaks, and the recording ending is what turns
     it to page one.

     Everything that can end the line reports through the one callback, and
     exactly once: the real `ended`, a file that will not load, and a play()
     the browser refuses. A reader must never be left sitting on the title
     because a recording never arrived.

     Primed on load rather than fetched when the button is pressed, for the
     same reason Pop is: this sound answers a finger, and a first press that
     has to go to the network first does not do that.
     -------------------------------------------------------------------- */
  const TitleVO = (() => {
    /* copied from "audio new/title vo.wav" — re-copy it here after re-cutting,
       and bump ?v= so a plain refresh cannot serve the previous take */
    const FILE = "assets/audio/title.wav?v=1";
    let el = null;
    let done = null;        /* what the end of the line runs; also "is it live" */

    /* whoever gets here first ends it; everything after finds nothing to call */
    function settle() {
      const fn = done;
      done = null;
      if (fn) fn();
    }

    function element() {
      if (el) return el;
      try {
        el = new Audio(FILE);
        el.preload = "auto";
        el.addEventListener("ended", settle);
        el.addEventListener("error", settle);
        el.load();
      } catch { el = null; }
      return el;
    }
    element();

    /* the reader moved on by themselves: the line is abandoned, not finished,
       so the turn that hangs off its ending does not run */
    function stop() {
      done = null;
      heldVO = false;
      if (el) { try { el.pause(); el.currentTime = 0; } catch { /* not started */ } }
    }

    /* The tab going away mid-line must not turn the page behind the reader's
       back, which is what would happen if the recording were left to run and
       end while nothing was on screen. It waits where it is instead, and the
       turn still hangs off its real ending — only later. */
    let heldVO = false;

    function hold() {
      if (!done || !el || el.paused || el.ended) return;
      heldVO = true;
      try { el.pause(); } catch { /* not started */ }
    }

    function unhold() {
      if (!heldVO) return;
      heldVO = false;
      if (!done || !el || el.ended) return;
      const p = el.play();
      if (p && p.catch) p.catch(settle);   /* refused: let the turn happen */
    }

    return {
      get playing() { return !!done; },

      /* Speak the title, then run `then`. A muted book still plays it, in
         silence, so the beat before the turn is the same length either way —
         the mute switch takes a sound away, it does not re-time the book. */
      play(then) {
        stop();
        done = typeof then === "function" ? then : null;
        const a = element();
        if (!a) { settle(); return; }
        a.muted = PageAudio.muted;
        try { a.currentTime = 0; } catch { /* not seekable yet */ }
        const p = a.play();
        if (p && p.catch) p.catch(settle);
      },

      stop, hold, unhold
    };
  })();

  /* ── Beats ──────────────────────────────────────────────────────────────
     The small things that happen at a particular moment of a page: a comic
     burst of lettering, a few motion lines, a sound effect. One cue table,
     one clock, three ways of answering it.

     Every timing here is measured off the recording rather than guessed. Each
     clip was cut into speech runs at its silences and every run measured for
     length and peak level, then matched against the words painted into that
     page's artwork — the artwork being the authority on what is said, not
     PAGES[].text, which predates the current pictures.

     Three of the cues were checked against something independent, as a test
     of the method: page 5's bell block begins at 8.95s and the ting was
     appended to that clip at 8.91s; page 9's टप्प is a 0.15s spike that is
     the second-loudest moment in its clip; page 11's धड़ाम is the loudest.
     All three landed where the measurement said they would.

     A cue is a moment plus what happens at it, any combination of:

       art   a burst of comic lettering — out/x/y/w give its life and place
       lines a few motion strokes — see Lines.draw for the shape of it
       sfx   one of the synthesised sounds in Sfx

     Pages 7, 8 and 11 carry sound effects mixed into the recording itself, so
     they are not given a second one here at the same moment. Nothing is added
     to a page that has no action in it.

     To retime anything, change `at`. To move a burst or a set of lines,
     change x/y. Nothing else here needs touching. */
  const Beats = (() => {
    /* The starburst artwork. The ?v= is here for the same reason PageAudio
       carries one: these filenames never change, so re-exporting a burst
       leaves every browser that has seen the old one showing the old one
       forever. Bump it whenever a file in assets/pop/ is replaced.
         v2 — splash re-exported from a new छपाक (yellow lettering, square) */
    const ART_V = 2;
    const ART = "assets/pop/";
    const art = (name) => ART + name + ".webp?v=" + ART_V;

    /* Fired this much early so a burst or a stroke is at full strength *on*
       the sound rather than only starting to grow there. */
    const LEAD     = 0.12;
    const POP_IN   = 380;   /* ms — a burst overshoots, then settles */
    const POP_OUT  = 300;   /* ms — and shrinks away */
    const MIN_HOLD = 0.85;  /* s  — a short sound still has to be readable */

    /* ── the sounds ───────────────────────────────────────────────────────
       Synthesised rather than shipped, for the same reason the play button's
       pop is: a few oscillators weigh nothing, need no network, and can be
       tuned by ear in one place. They share Pop's audio context, so the book
       only ever builds one.

       They are all deliberately quiet. The narration sits around -15 dBFS and
       nothing here is allowed to compete with it: `peak` values are small on
       purpose, and every sound is short enough to sit inside a gap between
       words rather than over one. */
    const Sfx = (() => {
      let noiseBuf = null;

      /* one short band of noise — wind, cloth, water, scrape */
      function noise(c, at, { dur, hz, q, peak, to }) {
        if (!noiseBuf) {
          noiseBuf = c.createBuffer(1, Math.ceil(c.sampleRate * 1.5), c.sampleRate);
          const d = noiseBuf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        const src = c.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;

        const bp = c.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(hz, at);
        if (to) bp.frequency.exponentialRampToValueAtTime(to, at + dur);
        bp.Q.value = q == null ? 1.1 : q;

        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(peak, at + dur * 0.28);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);

        src.connect(bp); bp.connect(g); g.connect(c.destination);
        src.start(at);
        src.stop(at + dur + 0.03);
        src.onended = () => { try { src.disconnect(); bp.disconnect(); g.disconnect(); } catch { /* gone */ } };
      }

      /* one pitched voice — a thud, a clink, a chime */
      function tone(c, at, { type, from, to, peak, dur }) {
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(peak, at + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        g.connect(c.destination);

        const o = c.createOscillator();
        o.type = type || "sine";
        o.frequency.setValueAtTime(from, at);
        if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur * 0.85);
        o.connect(g);
        o.start(at);
        o.stop(at + dur + 0.02);
        o.onended = () => { try { o.disconnect(); g.disconnect(); } catch { /* gone */ } };
      }

      /* Each entry is one sound. Kept as recipes rather than files so the
         whole set can be read, compared and adjusted together. */
      const KIT = {
        /* air moving past something — a bicycle setting off, a body flying */
        whoosh: (c, t) => noise(c, t, { dur: 0.30, hz: 620,  to: 1500, q: 0.9,  peak: 0.055 }),
        /* flour leaving a plate: air with nothing solid in it */
        puff:   (c, t) => noise(c, t, { dur: 0.42, hz: 900,  to: 380,  q: 0.6,  peak: 0.034 }),
        /* paper: the page itself turning */
        page:   (c, t) => noise(c, t, { dur: 0.22, hz: 2600, to: 1500, q: 0.5,  peak: 0.030 }),
        /* something small landing — a samosa on the ground */
        plop:   (c, t) => { tone(c, t, { from: 470, to: 150, peak: 0.075, dur: 0.11 });
                            noise(c, t, { dur: 0.07, hz: 900, q: 0.9, peak: 0.020 }); },
        /* a small good thing noticed: a locket, a mother home */
        chime:  (c, t) => { tone(c, t, { from: 1046, peak: 0.048, dur: 0.44 });
                            tone(c, t + 0.055, { from: 1568, peak: 0.026, dur: 0.38 }); }
      };

      /* ── the recorded ones ──────────────────────────────────────────────
         Six of these cues are real recordings rather than the oscillators
         above, and where a recording exists it is what plays. Three of the six
         — page, plop and chime — keep their synthesised voice underneath as a
         fallback for a file that will not load. The other three do not, and
         deliberately: a stomach, a bicycle going over and a dog eating are
         none of them things an oscillator can stand in for, so if those files
         are missing the right outcome is silence rather than a noise pretending
         to be them.

         The reason is the verdict already on the record in the game half of
         this project, about its own synthesised cues: they "sound like a
         machine and had no effect on real emotions of kids, as they are our
         target audience". A synthesised growl is a filtered noise band; a
         stomach is a stomach. There is no filter arrangement that crosses
         that gap.

         Seven came from the recordings the game held in assets/_source/sfx/
         — every one CC0 or public domain, attribution not required. THAT FOLDER
         HAS SINCE BEEN DELETED, and with it PROVENANCE.json: these seven cut
         files are all that survives of it, so do not delete them expecting to
         re-cut them. The other three are cut from the sound files supplied
         directly for this book, still in the project root.

         Nothing was downloaded for any of this and no sound is duplicated:
         they are cut down, faded, made mono and levelled, and the whole set is
         236KB.

             growl  tummy-growl   his stomach, on the page he gets hungry
             crash  bike-wreck    धड़ाम — the bicycle going over with him on it
             plop   wood-drop     टप्प — the samosa hitting the ground
             munch  dog-munch     the dog making off with it
             chime  bell-tree     the locket: found, held up, laughed about
             page   your flip     the page turn itself: a rustle that builds
                                  to the flick of the paper at 700ms
             cycle  bike-ride     wheels on road, under the whole of page 5
             settle your utensils metal going quiet: the bicycle down (p7), the
                                  pots starting to slide (p11), one lifted (p12)
             whump  your body-fall the boy hitting the road after the bicycle, p6
             birds  your birds    the courtyard, under the whole of page 2
             plate  your plate    the plate coming down, at the end of p3
             open   your box      the tin lid coming off, p4
             steps  your page 09  footsteps, under the walk home on page 10

         WHAT STAYED SYNTHESISED, and why it is not an oversight. `breeze`,
         `whoosh` and `puff` are air, which is what filtered noise actually
         is — there is nothing for a recording to add. `clink` is steel, and
         the library has no steel: the game left one of its own cards silent
         over exactly that, on the reasoning that wood standing in for metal
         is a worse error than a gap. */
      /* ?v= for the same reason the narration has one: these filenames stay the
         same when the sound behind one is replaced, and a browser will happily
         keep serving the old bytes with no error and no way to tell. Bump it
         whenever a file in assets/sfx/ is re-cut. */
      const CUT = 4;   /* v4 — paper re-made from the book's own page flip */
      const at_ = (f) => "assets/sfx/" + f + ".mp3?v=" + CUT;
      const FILES = {
        growl:  at_("growl"),
        crash:  at_("crash"),
        plop:   at_("plop"),
        munch:  at_("munch"),
        chime:  at_("chime"),
        page:   at_("page"),
        cycle:  at_("cycle"),
        settle: at_("settle"),
        whump:  at_("whump"),
        birds:  at_("birds"),
        plate:  at_("plate"),
        open:   at_("open"),
        steps:  at_("steps"),
        /* The paper transition's own sound — the sheets flying in and away.
           Not to be confused with `page`, which is the small flip a single
           page turn makes; this one belongs to the whole screen going over.

           IT IS MADE OF `page`. The first attempt was a supplied 5s sweep and
           it did not belong to this book: a generic whoosh over a transition
           whose whole idea is sheets of paper. So this one is built out of the
           book's own page-flip — the transient at 0.62–0.88s of page.mp3, cut
           out once and then laid down 22 times, each at its own moment, its own
           level and its own slight pitch, so no two sheets sound alike.

           The layout is the transition's own dials, not a guess: twelve sheets
           scattered through the first 1.35s while they fly in and build, then
           SILENCE from 1.5 to 1.95 because that is the HOLD, when the screen is
           covered and nothing is moving, then ten more from 1.96 falling away
           in level to 3.6 as they drift off. 3.89s against a flight of about
           four. The hold is the part that makes it read as one movement rather
           than as a noise: a sound that keeps rustling while the sheets are
           still is describing something that is not happening. */
        paper:  at_("paper"),
        /* Aaru laughing, on the last page. Cut from the supplied recording,
           which is 8s: the laugh itself is the first 2.3s of it and the rest
           is a second run and then room tone, so it is trimmed to the burst
           and faded out over its last third rather than stopping dead. */
        laugh:  at_("laugh"),
        /* the pots coming to rest after the fall on page 11 — a first few
           pieces, a beat, then a longer tumble. Faded over its last quarter
           second so it settles rather than stops. */
        clatter: at_("clatter")
      };

      /* PLAYED THROUGH <audio> AND NOT THROUGH WEB AUDIO, which is the whole
         reason this works. Web Audio can only play a file it has decoded, and
         decoding means fetch() — which a browser refuses for a local file. This
         book is opened straight off the filesystem, so every one of these
         recordings fell silently back to its oscillator when it was written
         that way: measured, six files, nought decoded.

         An <audio> element has no such problem, and it reads the same clocks
         the narration does — so the levels baked into these files (-26 to -32
         LUFS against narration averaging -15.5) are directly comparable to her
         voice rather than to a gain I would otherwise have had to guess at. */
      const pool = new Map();
      let warmed = false;

      function element(name) {
        let el = pool.get(name);
        if (!el) {
          el = new Audio();
          el.preload = "auto";
          el.src = FILES[name];
          pool.set(name, el);
        }
        return el;
      }

      /* asked for on every page change: 108KB for all six, fetched once and
         then served out of cache, so no cue ever waits on the wire */
      function warm() {
        if (warmed) return;
        warmed = true;
        for (const name of Object.keys(FILES)) element(name).load();
      }

      /* Everything still sounding, so a page can take its sounds with it.
         Mostly these are half-second accents that finish long before anything
         changes, and this would not matter — but `cycle` runs 8.2s and `munch`
         1.9s, and a reader who turns while the dog is still eating should not
         be followed onto the next page by it. */
      const live = new Set();

      function hush() {
        for (const el of live) { try { el.pause(); } catch { /* already gone */ } }
        live.clear();
      }

      function shot(name) {
        /* A fresh element per play rather than rewinding the one that was
           primed: the page turn is the cue that repeats, and a reader going
           quickly would otherwise cut each turn off with the next. The file is
           in cache by then, and a detached element is collected once it has
           finished playing. */
        const el = new Audio(FILES[name]);
        el.muted = PageAudio.muted;

        /* THE PAGE TURN IS THE ONE CUE TIED TO AN ANIMATION'S LENGTH, and the
           supplied recording is a rustle that builds to the flick of the paper
           at 700ms. That is 80ms before a 780ms turn settles, which is why it
           sits so well — but --turn-ms is 260ms under prefers-reduced-motion,
           and there the flick would land nearly half a second after the page
           had already arrived. So for a reader who has asked for less motion,
           the rustle is skipped and the sound starts just before its own
           flick, which puts the flick inside the shorter turn instead. */
        if (name === "page" && calm()) {
          try { el.currentTime = 0.52; } catch { /* not seekable yet */ }
        }
        /* a touch of pitch either way, so the same file heard twice in one
           reading is not heard as the same file twice */
        el.playbackRate = 1 + (Math.random() * 2 - 1) * 0.035;
        /* The turn's own sound is deliberately NOT tracked. hush() runs from
           bind(), which happens as the arriving page is wired up — which is
           roughly when the turn animation ends and the paper is still settling.
           Tracking it would mean every turn cut its own sound off. It belongs
           to the turn rather than to either page, so it is left to finish. */
        if (name !== "page") {
          live.add(el);
          el.addEventListener("ended", () => live.delete(el), { once: true });
        }
        const p = el.play();
        if (p && p.catch) p.catch(() => { live.delete(el); /* refused before a gesture */ });
      }

      return {
        warm, hush,

        play(name) {
          if (PageAudio.muted) return;

          if (FILES[name]) { shot(name); return; }

          const make = KIT[name];
          if (!make) return;
          const c = Pop.ctx;
          if (!c) return;                    /* no Web Audio: stay silent */
          try { make(c, c.currentTime + 0.001); } catch { /* nothing to do */ }
        }
      };
    })();

    /* ── the motion lines ─────────────────────────────────────────────────
       A stroke is a thin tapered streak that fades in as it travels a little
       way along its own direction, then fades out. Two or three of them,
       staggered, read as movement without becoming the thing you look at.

         x, y    where the group is centred, as a % of the picture
         dir     the direction of travel, in degrees; 0 is to the right
         n       how many strokes
         len     stroke length, as a % of the picture width
         thick   stroke thickness, same units
         spread  the gap between strokes, measured across the direction
         burst   fan the strokes out of one point instead of running them
                 parallel — for an impact
         arc     how wide that fan is, in degrees
         tone    "dark" on a light scene, "light" on a dark one
         life    ms for one stroke

       Positions are worked out here rather than in CSS because the spread is
       across the direction of travel, which CSS has no way to express. The
       animation itself is one transform and one opacity, so it stays on the
       compositor.

       Nothing is drawn when the reader has asked for reduced motion: these
       are decoration and nothing is lost by leaving them out. */
    const Lines = (() => {
      const ASPECT = 16 / 9;    /* the picture's shape: 1% of width in height */

      return {
        draw(host, o) {
          if (!host || calm()) return;

          const n      = o.n      || 3;
          const dir    = o.dir    || 0;
          const len    = o.len    || 9;
          const thick  = o.thick  || 0.26;
          const spread = o.spread == null ? 2.2 : o.spread;
          const life   = o.life   || 620;
          const gap    = o.gap    == null ? 70 : o.gap;
          const arc    = o.arc    || 84;
          const colour = o.tone === "light"
            ? "rgba(255, 252, 244, .82)"
            : "rgba(58, 40, 22, .5)";

          for (let i = 0; i < n; i++) {
            /* where this stroke sits, and which way it points */
            const mid = (i - (n - 1) / 2);
            let ang = dir, ax = o.x, ay = o.y;

            if (o.burst) {
              /* fanned out of the point, each stroke pushed clear of it */
              ang = dir + (n > 1 ? mid * (arc / (n - 1)) : 0);
              const r = ang * Math.PI / 180;
              const reach = len * 0.62;
              ax = o.x + Math.cos(r) * reach;
              ay = o.y + Math.sin(r) * reach * ASPECT;
            } else {
              /* parallel, offset across the direction of travel */
              const r = dir * Math.PI / 180;
              ax = o.x + -Math.sin(r) * mid * spread;
              ay = o.y + Math.cos(r) * mid * spread * ASPECT;
            }

            const el = document.createElement("i");
            el.className = "mline";
            el.style.setProperty("--mx", ax);
            el.style.setProperty("--my", ay);
            el.style.setProperty("--ml", len * (o.burst ? 0.78 : 1));
            el.style.setProperty("--mt", thick);
            el.style.setProperty("--mc", colour);
            host.appendChild(el);

            const T = (travel, sx) =>
              `rotate(${ang}deg) translate(-50%, -50%) translate(${travel}%, 0) scaleX(${sx})`;

            const a = el.animate(
              o.burst
                ? [{ transform: T(-26, 0.55), opacity: 0 },
                   { transform: T(-4, 1),     opacity: 1, offset: 0.4 },
                   { transform: T(16, 0.9),   opacity: 0 }]
                : [{ transform: T(-34, 0.7),  opacity: 0 },
                   { transform: T(0, 1),      opacity: 1, offset: 0.36 },
                   { transform: T(32, 0.92),  opacity: 0 }],
              { duration: life, delay: i * gap, easing: "cubic-bezier(.4,0,.35,1)", fill: "both" }
            );
            const gone = () => el.remove();
            a.finished.then(gone, gone);
          }
        }
      };
    })();

    /* ── Squiggles ──────────────────────────────────────────────────────────
       The pair of wavy lines a comic draws over a stomach. Lines.draw makes
       straight tapered bars, which say "this moved that way"; a rumble is not
       a direction, it is a thing shaking where it stands, and the shape that
       says so is a zigzag.

       An SVG polyline rather than anything CSS can do: a zigzag is a list of
       points, and its stroke has to stay an even weight around every corner,
       which a rotated box cannot manage. The viewBox is fixed at 100×32 and
       the element is sized in cqw with a matching aspect-ratio, so the whole
       thing scales uniformly with the picture — corners, weight and all — from
       a phone to a desktop, with no second number to keep in step.

       The ends are pulled in to a third of the amplitude rather than starting
       on a full peak, which is what stops the shape reading as a cut-off
       length of zigzag and lets it read as a mark with a beginning and an end.

       It is animated, and the animation is the point: it pops in, shakes twice
       where it stands, and goes. A still zigzag is a decoration; a zigzag that
       jitters is a stomach.
       -------------------------------------------------------------------- */
    const SVGNS = "http://www.w3.org/2000/svg";

    function squiggles(o) {
      const l = host();
      if (!l || calm()) return;

      const n      = o.n      || 2;
      const w      = o.w      || 7;      /* each line's width, % of picture   */
      const step   = o.step   == null ? 3.4 : o.step;   /* cqw between lines  */
      const cycles = o.cycles || 4;      /* peaks along the zigzag            */
      const amp    = o.amp    == null ? 0.62 : o.amp;   /* of the half-height */
      const thick  = o.thick  || 5;      /* viewBox units, so it scales too   */
      const life   = o.life   || 1100;
      const gap    = o.gap    == null ? 90 : o.gap;
      const ink    = o.ink    || "var(--pop-ink)";

      /* the zigzag itself: alternating peaks, both ends drawn in */
      const points = [];
      const steps = cycles * 2;
      for (let k = 0; k <= steps; k++) {
        const px = (k / steps) * 100;
        const edge = (k === 0 || k === steps) ? 0.34 : 1;
        const py = 16 + (k % 2 ? -1 : 1) * amp * 16 * edge;
        points.push(px.toFixed(2) + "," + py.toFixed(2));
      }

      for (let i = 0; i < n; i++) {
        const mid = i - (n - 1) / 2;
        const svg = document.createElementNS(SVGNS, "svg");
        svg.setAttribute("viewBox", "0 0 100 32");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        svg.classList.add("squig");
        svg.style.setProperty("--sx", o.x);
        svg.style.setProperty("--sy", o.y + mid * step * (9 / 16));
        svg.style.setProperty("--sw", w);
        svg.style.setProperty("--sc", ink);
        svg.style.setProperty("--st", thick);

        const line = document.createElementNS(SVGNS, "polyline");
        line.setAttribute("points", points.join(" "));
        svg.appendChild(line);
        l.appendChild(svg);

        /* pop in · shake twice · go. The shake is along the line's own x, so
           the pair jitters sideways together the way a rumble reads. */
        const T = (s, dx) => `translate(-50%, -50%) scale(${s}) translateX(${dx}%)`;
        const a = svg.animate([
          { offset: 0,    transform: T(0.55, 0), opacity: 0,
            easing: "cubic-bezier(.16,.9,.28,1.3)" },
          { offset: 0.16, transform: T(1.08, 0), opacity: 1,
            easing: "cubic-bezier(.36,0,.4,1)" },
          { offset: 0.30, transform: T(1, 3.5),  opacity: 1 },
          { offset: 0.44, transform: T(1, -3.5), opacity: 1 },
          { offset: 0.58, transform: T(1, 2.4),  opacity: 1 },
          { offset: 0.72, transform: T(1, -1.6), opacity: 1 },
          { offset: 0.84, transform: T(1, 0),    opacity: 1,
            easing: "cubic-bezier(.5,0,.78,.1)" },
          { offset: 1,    transform: T(0.86, 0), opacity: 0 }
        ], { duration: life, delay: i * gap, fill: "both" });

        const gone = () => svg.remove();
        a.finished.then(gone, gone);
      }
    }

    /* ── the cue table ────────────────────────────────────────────────────
       Scene by scene: what happens, what motion belongs to it, what it
       sounds like, and when.

       Page 1, the cover, is not here — it has no recording to hang a time
       off. Its two sounds are triggered by the entrance itself, in Cover.play.

       THE SNEEZE, on all five pages it happens on. It is the event the book is
       named after and it was the one thing never drawn.

       TWO KINDS OF LETTERING, AND THE PAGE DECIDES WHICH.

       `word:` is type — the story's own face in the sneeze's own red, outlined
       so it holds over sky or sand. See .popart__word in style.css. It is what
       the sneeze uses on all five of its pages, because a sneeze happens beside
       his face and a starburst there covers the best drawing on the page.

       `art:` is the supplied comic starburst, from assets/pop/. Three of them
       are in the book: crash (धड़ाम!) on page 11, tub (टप्प) on page 9, splash
       (छपाक!) on page 8. Every one of those is a thing hitting something, not a
       person doing something, and each has a wide piece of empty floor, haze or
       wall to land on — which is what a starburst needs and what a sneeze on a
       face has not got. sneeze.webp and ring.webp are the two left over; naming
       either in place of a `word:` puts it back.

       A starburst has to be set MUCH larger than type reading the same word,
       because most of its width is the burst around the letters rather than the
       letters: crash at w:20 has lettering about 11% of the picture wide, which
       is smaller than the type it replaced at the same number. w:28–32 is where
       the three of them read.

       IT COMES OUT OF HIS MOUTH. Not off it — none of these is on his face,
       which is what was wrong with the starbursts: at 20% of the picture wide
       one is a third of its height, and on all five pages it covered the head
       outright, the best drawing on the page and the one thing a child watching
       a sneeze is looking at. But nor is it parked in whatever corner of sky
       happened to be empty, which is where they went next: a noise that starts
       at the top-left of the picture while the boy sneezes in the middle of it
       is a caption about a sneeze rather than the sneeze.

       So each is measured off its own painting to the nearest clear ground at
       mouth height, on the side he is facing: page 3 into the flour haze right
       of his mouth, page 8 into the haze between him and the far stall, page 9
       and page 11 to his left, since on those two he faces left. Page 6 is the
       one exception and has to be — he is horizontal in mid-air with his own
       hand where the word wants to be, so it goes to the open sky ahead of him,
       which is at least the direction the sneeze threw him. He stands somewhere
       different on every page, so nothing here is repeated from a template.

       They are all w:14 now, a good deal smaller than the 17–24 they were.
       Lettering that has moved next to his face has to be small enough to sit
       there without becoming the picture.

       The words are short — "आ… छीं!" and not the full halting line — because
       lettering has to be taken in at a glance, and because a short word fits
       in gaps a long one does not.

       AND IT IS SAID IN TWO PIECES, because a sneeze is in two pieces. "आ…"
       is thrown on when she catches her breath, "छीं!" lands beside it when it
       goes, and then the two of them leave together on one frame — see the
       piece-by-piece animation in Beats.burst. One word arriving whole on the
       burst has to choose between the catch and the sneeze and can only be on
       time for one of them; this is on time for both.

       The two moments are measured off each clip rather than guessed, the same
       way every other cue here was: 25ms RMS windows over each recording, read
       for where the run of speech starts and stops. The catch, then the sneeze:
       page 3 at 8.75 → 9.30, page 6 at 3.30 → 4.55, page 8 at 8.90 → 9.62,
       page 9 at 4.95 → 5.45, page 11 at 3.35 → 4.15. Page 6 is the drawn-out
       one at 1.25s between them and page 9 the quickest at 0.50s, which is the
       reading, not a rounding — `gap` carries that difference per page.

       life is 1400ms now rather than 1000. Under the old number the finished
       phrase was whole for 320ms, which was right when the whole phrase
       arrived at once; with the pieces landing a beat apart, 320ms of both
       being up before both go is not enough to read as one thing. 1400 leaves
       720ms — still a beat, not a caption.

    */
    const CUES = {
      /* 2 · an empty courtyard, Aaru alone on the step. Nothing moves, so
         the only thing to give it is the air. */
      2: [{ at: 0.30, sfx: "birds",
            lines: { x: 24, y: 20, dir: 4, n: 2, len: 15, thick: 0.2, spread: 3.4, life: 1500, gap: 320 } },
          /* HIS STOMACH, on "तभी आरु को भूख लगी।" — the line runs 2.66–4.37 in
             this clip and 3.20 is inside it. Three short strokes fanned out of
             his middle: the picture has him sitting with a hand on his belly
             and nothing else says why, so this is what turns a boy sitting on
             a step into a boy who is hungry.

             Placed against the step to his left rather than centred on him.
             His torso is 77.8%–83.8% of the picture across and the porch post
             ends at 71.9%, which leaves a six-per-cent gap of plain step
             between them; the fan is measured into it, its right-hand tips
             touching his side and its left ones stopping short of the post.
             Centred on the belly instead, the strokes fall on the striped
             shirt, and dark ink at half opacity over stripes is invisible —
             rendered and looked at, not assumed.

             A ZIGZAG PAIR, not a fan of straight strokes. The straight ones
             were tried first and they say the wrong thing: a tapered bar means
             "this went that way", and a rumbling stomach is not going
             anywhere — it is shaking where it sits. The two wavy lines are the
             mark a comic actually uses for it, and being red they read on the
             step where the book's brown strokes could not be seen at all.

             They arrive 90ms apart and each shakes twice sideways before it
             goes, so the pair jitters rather than merely appearing.

             The two lines have to be spaced further apart than they are tall,
             or their peaks interleave and the pair reads as one band of noise
             rather than as two marks: at amp 0.5 each is 2.0% of the picture
             high peak to peak and step 4.0 sets them 2.25% apart. That gap is
             the whole difference between a rumble and a scribble. */
          { at: 4,
            squig: { x: 74, y: 80.5, n: 2, w: 6, step: 4, cycles: 4,
                     amp: 0.5, thick: 5.5, life: 1100, gap: 90 } },
          { at: 4.50, sfx: "growl" }],

      /* 3 · the sneeze that empties the plate. The burst of lines comes off
         his face on the "छीं", and the flour leaves on "उड़ गया".

         THREE THINGS IN ORDER, which is what the picture draws: he sneezes
         (9.30), the flour disperses on her word for it (10.10), and the plate
         — which the painting still has in mid-air, spinning — comes down last.

         THE PLATE IS AT THE END OF THE PAGE and not with the sneeze, which is
         where it first went. The picture is the argument: the plate has not
         landed yet in it, so the clatter is it arriving rather than it
         leaving. 13.60 is 0.15s after her last word ends at 13.45 — a clean
         beat, not a collision — and the 0.95s of it finishes at 14.55, which
         is inside the 1.2s this page holds for after its clip before turning
         itself. So it is heard whole, and nothing cuts it off. */
      3: [{ at: 8.75, word: ["आ…", "छीं!"], gap: 0.55, life: 1400, x: 55, y: 49, w: 14 },
          { at: 9.30,
            lines: { x: 44, y: 40, dir: -142, n: 4, len: 7.5, burst: true, arc: 74, life: 480 } },
          { at: 10.10, sfx: "puff",
            lines: { x: 60, y: 52, dir: -34, n: 3, len: 11, spread: 2.6, life: 700 } },
          { at: 13.60, sfx: "plate" }],

      /* 4 · the lid comes off the tin, and there is nothing inside. One
         clank of real metal, then two strokes of surprise over his head. */
      4: [{ at: 0.80, sfx: "open",
            lines: { x: 74, y: 56, dir: -62, n: 2, len: 6, spread: 2, life: 520 } },
          { at: 2.80,
            lines: { x: 66, y: 12, dir: -90, n: 2, len: 4.5, spread: 3.2, life: 460 } }],

      /* 5 · he sets off on the bicycle. Speed lines trail behind the back
         wheel; the bell has its own sound and its own lettering.

         `cycle` is the one cue that is a BED rather than an accent: 8.2s of
         wheels on road, running from the moment he pushes off and fading as he
         arrives, so the bell rings into quiet. It replaced a synthesised gust,
         which said "something moved" where the picture says "a bicycle". It is
         the quietest thing in the book at 18 dB under her voice — a page you
         notice is not silent rather than a page with a sound effect on it.

         THE BELL RINGS TWICE, AND ON HER VOICE. Both of those were wrong.

         It was one "ट्रिन-ट्रिन!" at 8.95s. This clip is 11.02s long but the
         narration is only the first 7.07s of it — the rest is the ting-ting
         appended to the cut — so 8.95s put the lettering out in the sound
         effect, roughly two seconds after the reader had heard the last word
         and while nothing on the page was being told. Measured against silence
         it looked correctly placed; measured against the voice it arrived after
         the page had finished speaking.

         So it starts inside her last phrase — "…बाज़ार की ओर चल पड़ा", the run
         from 6.13s to 7.07s, which is the moment the sentence sets him off —
         and holds through the first real ting at 7.37s. The words bring the
         bell up, the bell sound then lands under lettering already on screen,
         and no part of it happens in the dead patch between the two.

         Two of them, 0.34s apart and 1500ms long, so the second arrives while
         the first is still up: at any moment in the middle of it both are on
         the picture, stacked down and to the right, the way the artwork draws
         a bell being rung twice rather than a bell being named once.

         Gold, not the sneeze's red — see `ink` in Beats.burst. */
      5: [{ at: 0.40, sfx: "cycle",
            lines: { x: 17, y: 58, dir: 178, n: 3, len: 13, spread: 3, life: 760 } },
          { word: "ट्रिन-ट्रिन", at: 6.45, life: 1500, x: 53, y: 48, w: 12,
            ink: "var(--gold)" },
          { word: "ट्रिन-ट्रिन", at: 6.79, life: 1500, x: 57, y: 57, w: 13,
            ink: "var(--gold)" }],

      /* 6 · the sneeze throws him off the bicycle. Lines off his face, then
         the flight, then the landing — this page has no mixed-in sound of
         its own, so the impact is made here. */
      6: [{ at: 3.30, word: ["आ…", "छीं!"], gap: 1.25, life: 1400, x: 85, y: 25, w: 14,
            lines: { x: 62, y: 26, dir: 34, n: 4, len: 7, burst: true, arc: 70, life: 470 } },
          { at: 5.35, sfx: "whoosh",
            lines: { x: 42, y: 30, dir: 150, n: 3, len: 12, spread: 2.8, life: 720 } },
          /* THE JOLT, as she finishes saying it. "वह गिर पड़ा धड़ाम!" runs
             5.16–7.99, and "धड़ाम!" is the last of it — a word boundary at
             7.04–7.15, audible only below -28 dB, then the word itself out to
             7.99. 8.00 is the moment it lands on: the word is said whole
             first, and the half second of shaking then runs across the join
             into the impact in the recording at 8.11 and the crash below it at
             8.20, so the picture is still moving as the sound of him hitting
             the road arrives.

             On the word's ONSET, at 7.15, the jolt was over before any of that
             and read as a separate event from the crash it belongs to. */
          { at: 8, shake: 0.5 },
          { at: 8.20, sfx: "crash",
            lines: { x: 74, y: 74, dir: -90, n: 4, len: 6.5, burst: true, arc: 150, life: 520 } },
          /* AND THE BOY, 0.35s after the bicycle. Two things hit the road here
             and they are not the same thing: the frame goes over first and he
             lands on top of it. Together they read as one accident with a
             shape; either alone reads as half of it. */
          { at: 8.55, sfx: "whump" }],

      /* 7 · he stands and beats the dust out of his shirt. The recording
         already carries the landing and the shaking, so the only sound added
         here is the bicycle itself finishing falling — metal going quiet on the
         road a moment after he is down, which is the last of the accident. */
      7: [{ at: 1.55, sfx: "settle" },
          { at: 4.40,
            lines: { x: 70, y: 52, dir: -14, n: 3, len: 7, spread: 2.4, life: 640 } }],

      /* 8 · the sneeze at the juice stall, and the glass going over. The
         splash is already mixed into the recording. */
      8: [{ at: 8.90, word: ["आ…", "छीं!"], gap: 0.72, life: 1400, x: 55, y: 49, w: 14 },
          { at: 9.65,
            lines: { x: 38, y: 34, dir: 20, n: 4, len: 7, burst: true, arc: 68, life: 470 } },
          /* the juice going over, on her word for it. "छपाक" is 13.45–14.20 in
             this clip: the छ is a sibilant spike at 13.45–13.60, then the vowel,
             then the stop and the क released at 14.00. The splash it names is
             the appended sound at 14.85 and the water lines below stay with
             that — the lettering says the noise, the lines are the juice. */
          { art: "splash", at: 13.45, out: 14.20, x: 64, y: 64, w: 23 },
          { at: 14.90,
            lines: { x: 52, y: 74, dir: 90, n: 3, len: 6, spread: 2.2, life: 560 } }],

      /* 9 · the sneeze, the samosa hitting the ground, and the dog away with
         it. The lettering is already here; the plop is not. */
      9: [{ at: 4.95, word: ["आ…", "छीं!"], gap: 0.50, life: 1400, x: 59, y: 50, w: 14 },
          { at: 5.45,
            lines: { x: 62, y: 40, dir: 12, n: 4, len: 6.5, burst: true, arc: 66, life: 450 } },
          { art: "tub", at: 7.75, out: 7.90, x: 38, y: 56, w: 28,
            sfx: "plop",
            lines: { x: 56, y: 74, dir: 90, n: 2, len: 5, spread: 1.8, life: 480 } },
          /* the dog making off with it. The chewing sits under "और कुत्ता झट से
             चट कर गया" rather than after it — he is eating while she says so —
             and it is the quietest of the six for that reason. */
          { at: 8.55, sfx: "munch",
            lines: { x: 24, y: 84, dir: 182, n: 3, len: 10, spread: 2.4, life: 660 } }],

      /* 10 · he walks home with the flour, and his mother is back.

         The footsteps run from 0.30 and last 3.8s, which covers "उदास आरु ने
         आटा लिया और घर लौट आया" and stops before "अम्मा भी वापस आ गई" — he is
         walking for the first half of the page and arrived by the second, so
         the steps stop when the sentence about them does. The chime for his
         mother is at 6.85, well clear of them. */
      10: [{ at: 0.30, sfx: "steps" },
           { at: 6.85, sfx: "chime",
             lines: { x: 15, y: 40, dir: -90, n: 3, len: 5, burst: true, arc: 120, life: 620,
                      tone: "light" } }],

      /* 11 · the sneeze, then everything on the shelves comes down. The big
         clatter is mixed into the recording at 8.05, so what is added here is
         the first slip of metal a moment before it. */
      11: [{ at: 3.35, word: ["आ…", "छीं!"], gap: 0.80, life: 1400, x: 46, y: 53, w: 14 },
           { at: 3.40,
             lines: { x: 74, y: 30, dir: 8, n: 4, len: 7, burst: true, arc: 72, life: 470 } },
           { at: 6.25, sfx: "settle",
             lines: { x: 86, y: 62, dir: 90, n: 3, len: 6.5, spread: 2.6, life: 600 } },
           { art: "crash", at: 7.20, out: 8.70, x: 26, y: 70, w: 32 },
           /* AND THE POTS COME TO REST. The crash itself is mixed into the
              recording and is loud until 8.45, then falls away to nothing by
              8.95 where the clip ends. That decay is the fall being over, and
              until now nothing followed it — the page simply went quiet.

              8.50 lays this underneath the last of it: its opening pieces
              land while the recording is still ringing, and it carries on
              alone once the clip has finished, so the page ends on metal
              settling rather than on silence.

              It runs 2.21s from 8.50, which puts its end at 10.71. The page
              turns at 10.00 and the next page's cues are bound about 10.78,
              which is when Sfx.hush would cut anything still sounding — so it
              finishes with room to spare, and the last of it carries across
              the turn into page 12, where she is picking the pots up. */
           { at: 8.50, sfx: "clatter" }],

      /* 12 · she gathers the pots up, and finds the locket she lost. */
      12: [{ at: 0.50, sfx: "settle",
             lines: { x: 32, y: 76, dir: -70, n: 2, len: 5.5, spread: 2, life: 520 } },
           { at: 6.80, sfx: "chime",
             lines: { x: 10, y: 84, dir: -90, n: 3, len: 4.5, burst: true, arc: 130, life: 700,
                      tone: "light" } }],

      /* 13 · she holds the locket up, laughing, and Aaru laughs too. */
      13: [{ at: 0.30, sfx: "chime",
             lines: { x: 11, y: 40, dir: -90, n: 3, len: 4.5, burst: true, arc: 124, life: 700,
                      tone: "light" } },
           /* AND THEN HE LAUGHS. The page's last line is "आरु भी खिलखिला उठा।"
              — Aaru burst out laughing too — and until now it was the only
              thing in the book that said a sound happened without the sound
              happening. She says it from 6.03 to 6.95 in this clip.

              6.95 is the moment she finishes. With the 0.12 lead every cue
              gets, the laugh actually starts at 6.83, which puts it under her
              last syllable rather than in a gap after it: it arrives ON the
              word, the way a laugh does, instead of politely waiting its turn.

              It runs 2.45s and the clip ends at 7.25, so it is still going as
              the ending's paper transition begins — deliberately. The laugh is
              what carries the reader out of the book and into the film, and
              cutting it off at the page boundary would leave the story ending
              on a stopped sound. */
           { at: 6.95, sfx: "laugh" }],

      /* The film keeps its own soundtrack and its own cue list, and entries
         here run exactly like the page cues above — with `hold` available as
         well, since a film is the one thing in the book whose clock we can
         stop.

         THE BEAT AFTER HE HAS FINISHED THE LINE. He looks at the pictures he
         has just scattered and says "ओहो! अब क्या करें?" — and the line is in
         two halves with a gap between them: 18.60–19.56 is "ओहो!", 20.31–21.18
         is "अब क्या करें?". The speech bubble carries the whole thing at once,
         up at 19.05 and gone by 21.30.

         The hold was at 19.60 to begin with, which is in the GAP — after
         "ओहो!" and before the question. It fired correctly and it was wrong:
         a second of silence dropped into the middle of a sentence does not
         read as him thinking, it reads as the film losing its place, and the
         question then arrives detached from the exclamation that set it up.
         A beat belongs at the end of a sentence, not inside one.

         So it stops at 21.20 instead: two hundredths past the last word, on
         the last frame that still has the whole bubble on it — 21.30 is the
         first frame without it. He says the line, it stands there a second
         with the question up where a child can read it, and then he moves.

         Timings measured off assets/video/aru.webm with silence detection at
         -32 dB, and the bubble's own in and out read off the frames at 0.1s. */
      film: [{ at: 21.20, hold: 1.0 }]
    };

    /* An <img> takes its width from the CSS but its *height* from the file,
       which it does not know until the file has decoded. Left to itself the
       first burst of a reading would therefore start as a strip of zero
       height and snap into shape partway through its own animation. So the
       shape is stated up front, and each preload below corrects it from the
       real file in case an asset is ever re-exported at another size. */
    const shape = { ring: 1100 / 1011, tub: 1100 / 686, crash: 1100 / 686,
                    sneeze: 1100 / 1047, splash: 1100 / 1100 };

    let layer   = null;
    let media   = null;   /* the element whose playhead we are following */
    let cues    = [];     /* the live cue list */
    let queued  = [];     /* the cue list for the page now bound */
    let prev    = 0;      /* playhead as of the previous frame */
    let ticking = false;

    const host = () => (layer || (layer = $("#popart")));

    function clear() {
      const l = host();
      if (l) l.replaceChildren();
    }

    /* one burst of lettering; each removes only itself, so two close together
       never cancel one another out.

       TWO KINDS, one animation. `word` is type set in the story's own hand and
       is what every cue uses now; `art` is one of the supplied pop-art images
       and is kept working because the mechanism is worth keeping — any picture
       can still be thrown onto any page by naming it. Everything below the
       element itself is shared, so the two can never drift apart. */
    function burst(cue) {
      const l = host();
      if (!l) return;

      /* A word given as an array is said a piece at a time. See `gap` below. */
      const parts = Array.isArray(cue.word) ? cue.word : null;
      const gapMs = Math.round((cue.gap || 0) * 1000);
      const pieces = [];

      let img;
      if (cue.word) {
        img = document.createElement("div");
        img.className = "popart__word";
        if (parts) {
          /* Each piece is its own inline-block so it can be thrown in on its
             own beat. They are laid out together from the start, with a real
             space between them, so the line is set exactly as the one-string
             version of it — which means a piece still to come is already
             holding its place, invisible, and the pieces already there never
             shift to make room for it. The word is composed, then revealed;
             it does not assemble itself sideways in front of the reader. */
          parts.forEach((text, i) => {
            if (i) img.appendChild(document.createTextNode(" "));
            const s = document.createElement("i");
            s.textContent = text;
            img.appendChild(s);
            pieces.push(s);
          });
        } else {
          img.textContent = cue.word;
        }
        /* `ink` overrides the lettering's colour for this one burst. The book
           has one lettering red and wants it — five sneezes in five different
           colours would be five different books — but the bell is not a sneeze,
           and a bicycle bell rung in the sneeze's red says the wrong thing
           about what is happening. Anything that names a colour works; the
           tokens in style.css §1 are what it is for. */
        if (cue.ink) img.style.setProperty("--pop-ink", cue.ink);
      } else {
        img = document.createElement("img");
        img.className = "popart__item";
        img.src = art(cue.art);
        img.alt = "";
        img.draggable = false;
        img.decoding = "async";
        if (shape[cue.art]) img.style.aspectRatio = String(shape[cue.art]);
      }
      img.style.setProperty("--px", cue.x);
      img.style.setProperty("--py", cue.y);
      img.style.setProperty("--pw", cue.w);
      l.appendChild(img);

      /* `life` sets the whole thing end to end, in ms, for a burst that should
         be a beat rather than a caption. At life:1000 the throw-in and the
         shrink-away leave 320ms of hold, which reads as a punch — right for a
         sneeze, which is one sharp event and not something to be read.

         Without it the hold is as long as the sound it belongs to, floored at
         MIN_HOLD, which is what the lettering bursts want: those name a noise
         and have to stay long enough to be read.

         `gap` is what the pieces wait for each other by, in seconds, and it is
         ADDED to `life` rather than taken out of it. So `life` goes on meaning
         the same thing it means everywhere else — how long the finished word is
         on the picture — and a page can be re-timed to the recording by moving
         `gap` alone, without the last piece losing its beat as a side effect. */
      const spread = parts ? (parts.length - 1) * gapMs : 0;
      const total = cue.life
        ? spread + Math.max(POP_IN + POP_OUT + 60, cue.life)
        : spread + POP_IN + Math.max(MIN_HOLD, (cue.out || cue.at) - cue.at) * 1000 + POP_OUT;
      const hold  = total - POP_IN - POP_OUT;
      const at    = (ms) => ms / total;
      const T     = (s, r) => "translate(-50%, -50%) scale(" + s + ") rotate(" + r + "deg)";

      /* Reduced motion still gets the burst — it is what the sound looks
         like — but it arrives by fading rather than by being thrown. */
      const frames = calm()
        ? [{ offset: 0,                 transform: T(1, 0), opacity: 0 },
           { offset: at(POP_IN),        transform: T(1, 0), opacity: 1 },
           { offset: at(POP_IN + hold), transform: T(1, 0), opacity: 1 },
           { offset: 1,                 transform: T(1, 0), opacity: 0 }]

        : [{ offset: 0,                 transform: T(0.30, -9),
             opacity: 0, easing: "cubic-bezier(.16,.9,.28,1.3)" },
           { offset: at(POP_IN * 0.46), transform: T(1.14, 2.4),
             opacity: 1, easing: "cubic-bezier(.36,0,.4,1)" },
           { offset: at(POP_IN * 0.74), transform: T(0.955, -1.4),
             opacity: 1, easing: "cubic-bezier(.3,0,.2,1)" },
           { offset: at(POP_IN),        transform: T(1, 0),
             opacity: 1, easing: "linear" },
           { offset: at(POP_IN + hold), transform: T(1, 0),
             opacity: 1, easing: "cubic-bezier(.5,0,.78,.1)" },
           { offset: 1,                 transform: T(0.52, -5),
             opacity: 0 }];

      /* ── ONE WORD, SAID A PIECE AT A TIME, TAKEN AWAY WHOLE ──────────────
         "आ… छीं!" is not one noise. It is the catch and then the sneeze, and
         the recording says them a beat apart, so the lettering does too: "आ…"
         is thrown on, it waits, and "छीं!" lands beside it.

         What it must not do is leave the same way. Two pieces shrinking away
         one after the other reads as two separate captions being cleared, and
         it also means the phrase is only ever whole for the length of one gap.
         So the throw-in belongs to the PIECES and the exit belongs to the WORD:
         each piece runs the entrance on its own delay, while the element that
         holds them runs the hold and the shrink-away once, for all of them.
         Both of them go on the same frame, which is what the sneeze finishing
         looks like.

         The pieces' entrance is the same overshoot-and-settle as the one-piece
         version, minus the centring translate, which belongs to the element
         they sit in and would fight it here. Same beats, same curves. */
      const anims = [];
      if (parts) {
        const S = (s, r) => "scale(" + s + ") rotate(" + r + "deg)";
        const enter = calm()
          ? [{ transform: S(1, 0), opacity: 0 },
             { transform: S(1, 0), opacity: 1 }]
          : [{ transform: S(0.30, -9), opacity: 0, easing: "cubic-bezier(.16,.9,.28,1.3)" },
             { offset: 0.46, transform: S(1.14, 2.4), opacity: 1, easing: "cubic-bezier(.36,0,.4,1)" },
             { offset: 0.74, transform: S(0.955, -1.4), opacity: 1, easing: "cubic-bezier(.3,0,.2,1)" },
             { offset: 1, transform: S(1, 0), opacity: 1 }];
        pieces.forEach((s, i) => {
          anims.push(s.animate(enter,
            { duration: POP_IN, delay: i * gapMs, fill: "both" }));
        });
        /* the element itself only waits and then leaves — no entrance, or it
           would throw the pieces in a second time underneath their own */
        anims.push(img.animate(
          [{ offset: 0, transform: T(1, 0), opacity: 1 },
           { offset: at(total - POP_OUT), transform: T(1, 0), opacity: 1,
             easing: "cubic-bezier(.5,0,.78,.1)" },
           { offset: 1, transform: T(0.52, -5), opacity: 0 }],
          { duration: total, fill: "both" }));
      } else {
        anims.push(img.animate(frames, { duration: total, fill: "both" }));
      }

      /* the last one to finish is the whole word's own, in both shapes */
      const a = anims[anims.length - 1];
      const gone = () => img.remove();
      a.finished.then(gone, gone);
    }

    /* everything one cue asks for */
    function fire(cue) {
      if (cue.sfx)   Sfx.play(cue.sfx);
      if (cue.lines) Lines.draw(host(), cue.lines);
      if (cue.art || cue.word) burst(cue);
      if (cue.squig) squiggles(cue.squig);
      if (cue.hold)  hold(cue.hold);
      if (cue.shake) Shake.run(cue.shake);
    }

    /* ── a held frame ───────────────────────────────────────────────────────
       `hold` stops what is playing where it is, for a moment, and then lets it
       go on. Every other cue here puts something ON the picture; this one takes
       the picture's own clock away, which is the only way to give a beat to a
       recording that has none — you cannot add a pause to a file without
       re-cutting it, but you can decline to advance it.

       The resume is guarded rather than assumed, because a lot can happen in a
       second: the reader can leave the last page, which tears the film's source
       out from under it, or another hold can start. A token invalidates any
       resume still in flight, and the element is checked for still being there,
       still having a source, and not having been started again by something
       else — a stale timer must never be able to restart a film the reader has
       already walked away from.

       Pausing makes the film's own `pause` listener unfollow it, so `media` is
       null by the time the timer runs. That is why the element is captured here
       rather than read again later. Playing it again fires `playing`, which
       re-follows it from wherever it now is, so nothing behind the playhead
       fires a second time. */
    let holdToken = 0;

    function hold(seconds) {
      const el = media;
      if (!el || el.paused || el.ended) return;
      const mine = ++holdToken;
      el.pause();
      setTimeout(() => {
        if (mine !== holdToken) return;         /* another hold took over */
        if (!el.isConnected || el.ended) return;
        if (!el.hasAttribute("src")) return;    /* torn down while we waited */
        if (!el.paused) return;                 /* already going again */
        const p = el.play();
        if (p && p.catch) p.catch(() => { /* nothing left to do about it */ });
      }, Math.max(0, seconds) * 1000);
    }

    /* Cues fire on the playhead *crossing* them, never on a one-time flag —
       which is what makes a sound heard twice happen twice, and a replayed
       page happen again. */
    function tick() {
      if (!ticking || !media) { ticking = false; return; }
      const now = media.currentTime;

      if (now + 0.05 < prev) {
        prev = now;                    /* rewound: arm again, fire nothing */
      } else if (now > prev) {
        for (const c of cues) {
          /* A sound is fired a little early so it LANDS on time, the lead
             covering the moment it takes to start. The two cues that act on
             the picture itself get no lead: a held frame stopped 0.12s early
             stops on a different frame from the one that was chosen, and a
             jolt 0.12s early lands before the word that caused it — early is
             the direction the eye notices, since a picture that moves before
             its sound reads as a fault rather than as an impact. */
          const mark = Math.max(0, c.at - (c.hold || c.shake ? 0 : LEAD));
          if (prev < mark && mark <= now) fire(c);
        }
        prev = now;
      }
      requestAnimationFrame(tick);
    }

    function follow(el, list) {
      if (!el) return;
      media = el;
      cues  = list || [];
      prev  = el.currentTime;          /* never fire what is already behind us */
      if (!ticking) { ticking = true; requestAnimationFrame(tick); }
    }

    function unfollow() { ticking = false; media = null; }

    /* PageAudio says when sound starts and stops, and only by then does its
       element exist to be followed. */
    PageAudio.onState((on) => {
      if (on) follow(PageAudio.media, queued); else unfollow();
    });

    return {
      /* every page change: drop whatever is on screen, load that page's cues.
         A page with nothing happening in it simply gets none. */
      bind(page) {
        clear();
        Sfx.hush();               /* nothing follows the reader off a page */
        queued = CUES[page] || [];
        Sfx.warm();               /* the six recordings, once per reading */
        /* Warm the artwork the moment the page arrives. The burst is still
           seconds away, and an <img> that has not decoded yet has its width
           from the CSS but no height at all — so the very first burst of a
           reading would snap into shape halfway through its own animation. */
        for (const c of queued) {
          if (!c.art) continue;
          const im = new Image();
          im.decoding = "async";
          im.onload = () => {
            if (im.naturalHeight) shape[c.art] = im.naturalWidth / im.naturalHeight;
          };
          im.src = art(c.art);
        }
        if (media && media === PageAudio.media) { cues = queued; prev = 0; }
      },

      /* for the two moments that have no recording behind them: the cover's
         entrance, and the page turn itself */
      sfx(name) { Sfx.play(name); },

      /* the film runs on its own timeline, with its own cues */
      attachFilm(film) {
        if (!film) return;
        film.addEventListener("playing", () => follow(film, CUES.film));
        film.addEventListener("pause",   () => { if (media === film) unfollow(); });
        film.addEventListener("ended",   () => { if (media === film) { unfollow(); clear(); } });
      }
    };
  })();

  /* ── Shake ──────────────────────────────────────────────────────────────
     The picture takes a jolt when something lands on it.

     Half a second of it, the amplitude decaying each swing, which is what an
     impact looks like and what a wobble does not.

     IT IS A CUE, on the word. It hung off the clip ENDING at first, which
     sounds like the same thing on the page where it is used — page 6's clip
     finishes on the fall — but is not: her voice says "धड़ाम!" at 7.15s and the
     clip runs to 10.95, so the jolt came two and a half seconds after the word
     that caused it, by which time the reader has stopped connecting the two.
     Being a cue it goes where the sound is, and any page can have one by
     naming `shake` at a moment in the table above.

     WHAT MOVES IS THE PICTURE, not the book. The frame carries the artwork and
     is clipped to it, so it travels as one block against the still cream mat —
     a camera knocked, rather than a picture come loose in its mount. Shaking
     the mat instead would take the page arrows with it, and an arrow that
     jitters reads as a fault rather than as an impact.

     Distances are percentages of the frame's own width, so the jolt is the same
     size relative to the artwork on a phone and on a desktop. Every keyframe
     keeps translateZ(0), which the frame carries at rest to hold its own
     compositor layer — dropping it mid-animation would hand the layer back and
     repaint the picture on every frame of the shake. */
  const Shake = (() => {
    const frame = $("#frame");
    let live = null;

    function run(seconds) {
      /* Reduced motion gets none of it. A screen that jumps is the single
         thing that setting is most clearly asking not to happen, and nothing
         in the story is lost — the fall is drawn, described and heard. */
      if (!frame || calm()) return;
      const ms = Math.max(160, (seconds || 0.5) * 1000);
      if (live) { try { live.cancel(); } catch { /* already gone */ } }

      const T = (x, y, r) =>
        `translate3d(${x}%, ${y}%, 0) rotate(${r}deg)`;

      live = frame.animate([
        { offset: 0,    transform: T(0, 0, 0) },
        { offset: 0.12, transform: T(-1.05, 0.55, -0.40) },
        { offset: 0.26, transform: T(0.88, -0.46, 0.34) },
        { offset: 0.41, transform: T(-0.62, -0.30, -0.24) },
        { offset: 0.56, transform: T(0.44, 0.34, 0.17) },
        { offset: 0.71, transform: T(-0.27, 0.18, -0.10) },
        { offset: 0.86, transform: T(0.13, -0.09, 0.05) },
        { offset: 1,    transform: T(0, 0, 0) }
      ], { duration: ms, easing: "linear" });

      const done = () => { live = null; };
      live.finished.then(done, done);
    }

    return { run };
  })();

  /* ── Ambience ───────────────────────────────────────────────────────────
     Rebuilt from scratch on every page so each scene gets its own, fresh,
     never-quite-repeating choreography. Pure CSS animation once built.
     -------------------------------------------------------------------- */
  const Ambience = (() => {
    const host = {
      dust:   $("#dust"),
      sparks: $("#sparks")
    };

    /* track → swing → body : see the comment block in style.css */
    function nest(cls, bodyHTML) {
      const track = document.createElement("div");
      track.className = cls;
      track.innerHTML =
        `<div class="track"><div class="swing"><div class="body">${bodyHTML}</div></div></div>`;
      return track;
    }

    function dust(n) {
      const f = document.createDocumentFragment();
      for (let i = 0; i < n; i++) {
        const el = nest("mote", "");
        Object.entries({
          "--size":  rnd(0.18, 0.5).toFixed(2) + "cqw",
          "--x":     rnd(3, 96).toFixed(1) + "%",
          "--top":   rnd(45, 96).toFixed(1) + "%",
          "--dx":    rnd(-6, 6).toFixed(1) + "%",
          "--dur":   rnd(13, 26).toFixed(1) + "s",
          "--delay": (-rnd(0, 22)).toFixed(1) + "s"
        }).forEach(([k, v]) => el.style.setProperty(k, v));
        f.appendChild(el);
      }
      return f;
    }

    /* sparkles + sneeze puffs share the "pinned to the artwork" layer */
    function pinned(page) {
      const f = document.createDocumentFragment();

      (page.sparks || []).forEach((s, i) => {
        const el = document.createElement("div");
        el.className = "spark";
        el.innerHTML = svgUse("i-sparkle");
        Object.entries({
          "--x": s.x + "%", "--y": s.y + "%",
          "--size": (s.size || 3) + "cqw",
          "--dur": rnd(2.6, 4.2).toFixed(1) + "s",
          "--delay": (i * 0.45 + rnd(0, 0.8)).toFixed(2) + "s"
        }).forEach(([k, v]) => el.style.setProperty(k, v));
        f.appendChild(el);
      });

      if (!calm()) (page.puffs || []).forEach((p, i) => {
        const el = document.createElement("div");
        el.className = "puff";
        Object.entries({
          "--x": p.x + "%", "--y": p.y + "%",
          "--size": (p.size || 16) + "cqw",
          "--dur": rnd(6.5, 9).toFixed(1) + "s",
          "--delay": (i * 1.4 + rnd(0.5, 2.5)).toFixed(1) + "s"
        }).forEach(([k, v]) => el.style.setProperty(k, v));
        f.appendChild(el);
      });

      return f;
    }

    return {
      /* ── built in two halves, and the halves happen at different times ────
         Making the scenery is the expensive half: every mote is an element
         with six custom properties written onto it, so a page with forty of
         them is a couple of hundred style writes. Putting it in is the cheap
         half — two replaceChildren of nodes that already exist.

         They used to happen together, at the midpoint of the page turn, which
         is the one moment in the book that can least afford it: the turn is
         mid-flight, and a few hundred style writes on the main thread is a
         dropped frame you can see. So the making now happens before the turn
         starts, while nothing is moving, and only the putting-in waits for the
         midpoint — which is where it has to be, because that is when the
         picture underneath changes and the sparkles are pinned to it.

         prepare() touches no live node, so it costs no layout. */
      prepare(page) {
        const quiet = calm();
        return {
          /* in calm mode only the pinned sparkles survive, and slowly */
          dust:   quiet ? null : dust(page.dust || 0),
          sparks: pinned(page)
        };
      },

      commit(made) {
        if (!made) return;
        host.dust.replaceChildren(...(made.dust ? [made.dust] : []));
        host.sparks.replaceChildren(made.sparks);
      },

      /* both halves at once, for the callers with no turn to hide behind */
      build(page) { this.commit(this.prepare(page)); }
    };
  })();

  /* ── Book ───────────────────────────────────────────────────────────────
     Holds the current index and owns the page-turn transition.
     -------------------------------------------------------------------- */
  const Book = (() => {
    const slots   = [...document.querySelectorAll(".slot")];
    const arts    = slots.map((s) => s.querySelector(".slot__art"));
    const mat     = $(".book__mat");
    const sheet   = $("#turnSheet");
    const caption = $("#storyText");
    const scenes  = slots.map((s) => s.querySelector(".scene__text"));
    const covers  = slots.map((s) => s.querySelector(".cover"));
    const ambience = $("#ambience");
    const hint    = $("#liveHint");

    let index = 0;
    let live = 0;          // which slot is showing
    let busy = false;      // the double-click guard
    const listeners = [];

    function paint(slot, art, page) {
      /* the cover is layered where masks work, flat everywhere else */
      const cov = slot.querySelector(".cover");
      if (page.layers && Cover.ok) { art.src = page.layers.bg; Cover.dress(cov, page.layers); }
      else { art.src = page.img; Cover.hide(cov); }

      art.alt = page.alt.hi;
      slot.dataset.motion = page.motion || "breathe";

      /* the words go in the empty side of this particular illustration */
      const text = slot.querySelector(".scene__text");
      text.replaceChildren(sentenceLines(page.text ? page.text.hi : ""));
      text.hidden = !page.text;
      /* The two slots are reused turn after turn, so the box has to be cleared
         as deliberately as it is set — otherwise the first page that places
         its words hands that placement down to every page after it that has
         none of its own. */
      if (page.box) {
        text.style.setProperty("--tx", page.box.x);
        text.style.setProperty("--ty", page.box.y);
        text.style.setProperty("--tw", page.box.w);
        text.style.setProperty("--tweight", String(page.box.weight));
      } else {
        text.style.removeProperty("--tx");
        text.style.removeProperty("--ty");
        text.style.removeProperty("--tw");
        text.style.removeProperty("--tweight");
      }
      return text;
    }

    /* pages without a `text` block (the cover) simply show nothing */
    function writeCaption(page) {
      caption.replaceChildren(sentenceLines(page.text ? page.text.hi : ""));
      const words = page.text ? caption.textContent : page.alt.hi;
      hint.textContent = `पन्ना ${index + 1} / ${PAGES.length} — ${words}`;
    }

    /* give the narrator this page's two copies of the words to light up */
    function bindAudio() {
      PageAudio.bind([scenes[live], caption], index + 1);
      Beats.bind(index + 1);    /* this page's bursts, motion lines and sounds */
    }

    /* FETCHED IS NOT READY. An <img> whose bytes are in the cache still has to
       be turned into a bitmap, and if that has not happened by the time the
       picture is shown, the decode lands on the main thread at the exact frame
       the turn begins — which is the frame it can least afford. decode() does
       that work now, off the critical path, so the incoming page is a finished
       bitmap before anything moves. Failure is not a problem: a picture that
       will not decode early will decode when it is drawn, exactly as before. */
    function preload(i) {
      const p = PAGES[i];
      if (!p) return;
      const urls = p.layers && Cover.ok
        ? [p.layers.bg, p.layers.hero.img, p.layers.hero.mask,
           p.layers.title.img, p.layers.title.mask]
        : [p.img];
      for (const u of urls) {
        const im = new Image();
        im.decoding = "async";
        im.src = u;
        if (im.decode) im.decode().catch(() => { /* it will decode when drawn */ });
      }
    }

    /* Work that has to happen, but not now: the browser is given it when it
       has a moment rather than on the frame the turn lands. */
    const later = window.requestIdleCallback
      ? (fn) => window.requestIdleCallback(fn, { timeout: 600 })
      : (fn) => setTimeout(fn, 140);

    /* the entrance only looks right once the cut-outs can actually be drawn */
    function waitForLayers(layers) {
      const urls = [layers.hero.img, layers.hero.mask, layers.title.img, layers.title.mask];
      return Promise.all(urls.map((u) => new Promise((done) => {
        const im = new Image();
        im.onload = im.onerror = () => done();
        im.src = u;
      })));
    }

    /* ── has this page finished saying its piece? ──────────────────────────
       One signal, three sources, because what a reader waits for is not the
       same on every page: a story page ends on its narration's `ended`, the
       cover has no recording but does have Aaru riding in, and a page whose
       clip is switched off or refuses to load has nothing to wait for at all.
       Whichever it is, it arrives here once per visit, and the button gate
       upstream is the only thing that listens.
       -------------------------------------------------------------------- */
    const readyListeners = [];
    let announced = false;          /* reset on every arrival */

    function announceReady() {
      if (announced) return;        /* once per visit, whoever gets here first */
      announced = true;
      readyListeners.forEach((fn) => fn(index));
    }

    /* A late `ended` belongs to the page it names, not to wherever we are
       now — otherwise a clip finishing during a turn would mark the page just
       arrived at as read. */
    PageAudio.onEnded((page) => {
      if (page === index + 1) announceReady();
    });

    /* Decide what this page's arrival is waiting on. Called with whether the
       cover entrance is running, since that one announces for itself. */
    function awaitPresentation(coverRunning) {
      if (coverRunning) return;                        /* Cover.play announces */
      if (PageAudio.on && PageAudio.hasClip) return;   /* onEnded announces */
      announceReady();                                 /* nothing to wait for */
    }

    /* run the cover entrance, if the page we just landed on has one.
       Answers whether it is actually running. */
    function playCover() {
      const host = covers[live];
      if (!PAGES[index].layers || !Cover.ok || host.hidden) return false;
      const mine = index;
      Cover.play(host).then(() => { if (mine === index) announceReady(); });
      Cover.cue();
      return true;
    }

    /* Turning pages deliberately does NOT write the page into the URL, so a
       refresh always brings the reader back to the cover — a fresh start for
       the next child. An explicit #p7 typed or shared still opens page 7. */
    function emit() {
      listeners.forEach((fn) => fn(index, PAGES.length));
    }

    /* the page turn ------------------------------------------------------ */
    function go(target, dir) {
      target = clamp(target, 0, PAGES.length - 1);
      if (busy || target === index) return false;   /* the double-click guard */
      dir = dir || (target > index ? 1 : -1);
      busy = true;
      announced = false;       /* the page we are going to has not been read */

      const page = PAGES[target];
      const out = slots[live];
      const inn = slots[1 - live];
      const D = cssMs("--turn-ms", 780);
      const ease = "cubic-bezier(.42,.03,.22,1)";
      const quiet = calm();

      index = target;          /* button states update at once */
      emit();
      PageAudio.stop();        /* the leaving page goes silent at once */

      /* The scenery for the page we are going to, made here and put in at the
         midpoint. Everything expensive about it happens in this line, before
         a single frame of the turn has been committed. */
      const scenery = Ambience.prepare(page);

      paint(inn, arts[1 - live], page);
      inn.removeAttribute("aria-hidden");
      out.setAttribute("aria-hidden", "true");

      caption.classList.add("is-out");

      /* stack order: the leaving page rides on top as it peels away */
      out.classList.add("is-leaving");
      inn.classList.add("is-active");

      /* anims are cancelled once the turn lands; soft ones self-revert */
      const anims = [];
      if (quiet) {
        anims.push(out.animate([{ opacity: 1 }, { opacity: 0 }], { duration: D, fill: "both" }));
        anims.push(inn.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D, fill: "both" }));
      } else {
        /* A real sheet of paper, hinged at the spine down the left edge.
           Going forward, the page you are on lifts its free right edge toward
           you and swings left off the book, uncovering the next one lying
           underneath. Going back is the very same movement played backwards —
           the previous page comes down out of the left and settles flat — so
           one set of frames and `direction: reverse` describes both, which is
           also why the two directions cannot drift apart.

           rotateY runs negative because that is the way the free edge comes
           towards the reader. */
        const mover = dir > 0 ? out : inn;   /* the page that actually turns */
        const under = dir > 0 ? inn : out;   /* the one it uncovers, or covers */
        const play  = dir > 0 ? "normal" : "reverse";

        mover.style.transformOrigin = "left center";
        /* the turning page rides above the still one, whichever way we go */
        mover.style.zIndex = "4";
        under.style.zIndex = "2";
        mover.classList.add("is-turning");     /* lights its free edge */

        /* These angles are shaped, not evenly spaced, and the timing is
           linear on purpose — the shape lives in the numbers.

           Perspective is why. The free edge of the sheet does not travel with
           the angle: a page swung toward the reader is magnified, so its edge
           barely leaves the right-hand side for the first 25 degrees and then
           races to the spine, and by roughly 78 degrees there is no page left
           on screen at all. Fed an even sweep of angles, the whole turn would
           be over in two thirds of the time and the last third would be a
           held picture. So the angles below hold back early and open out
           late, which is what makes the edge cross the picture at a steady
           pace. They were read off the projection at perspective: 2400px;
           change that and these want re-reading.

           No opacity anywhere in here: past 78 degrees the sheet projects
           past its own hinge and the frame's overflow has already taken it
           away, so there is nothing left to fade out. */
        anims.push(mover.animate([
          { transform: "rotateY(0deg) translateZ(0px)",    filter: "brightness(1)",
            offset: 0, easing: "cubic-bezier(.4,.08,.68,.62)" },   /* the lift */
          { transform: "rotateY(-26deg) translateZ(16px)", filter: "brightness(.98)", offset: 0.18 },
          { transform: "rotateY(-40deg) translateZ(22px)", filter: "brightness(.95)", offset: 0.38 },
          { transform: "rotateY(-50deg) translateZ(22px)", filter: "brightness(.92)", offset: 0.52 },
          { transform: "rotateY(-60deg) translateZ(18px)", filter: "brightness(.88)", offset: 0.66 },
          { transform: "rotateY(-70deg) translateZ(11px)", filter: "brightness(.82)", offset: 0.82 },
          { transform: "rotateY(-80deg) translateZ(0px)",  filter: "brightness(.74)", offset: 1 }
        ], { duration: D, easing: "linear", fill: "both", direction: play }));

        /* the page below only lies there: it lightens as the shadow leaves it
           and rises the last thread of a percent into place */
        anims.push(under.animate([
          { transform: "scale(.994)", filter: "brightness(.84)" },
          { transform: "scale(1)",    filter: "brightness(1)" }
        ], { duration: D, easing: ease, fill: "both", direction: play }));

        /* the shade gathering along the bend of the turning sheet */
        anims.push(mover.querySelector(".slot__fold").animate([
          { opacity: 0,   transform: "scaleX(1)" },
          { opacity: .45, transform: "scaleX(1.5)", offset: 0.5 },
          { opacity: .9,  transform: "scaleX(2.4)" }
        ], { duration: D, easing: ease, fill: "both", direction: play }));

        /* The shadow the standing page throws onto the one it is uncovering.
           It has to stay beside that free edge, so it is keyed to the very
           same offsets as the rotation above, at the positions those angles
           project the edge to: 100%, 100%, 87%, 71%, 50%, 23%, 0% of the
           picture — divided by the band's own 30% width, which is what
           translateX is a percentage of. Same offsets, same linear timing, so
           the shadow cannot drift off the fold. */
        anims.push(sheet.animate([
          { transform: "translate3d(333%,0,0)", opacity: 0,    offset: 0 },
          { transform: "translate3d(333%,0,0)", opacity: 0.34, offset: 0.18 },
          { transform: "translate3d(290%,0,0)", opacity: 0.5,  offset: 0.38 },
          { transform: "translate3d(237%,0,0)", opacity: 0.54, offset: 0.52 },
          { transform: "translate3d(167%,0,0)", opacity: 0.55, offset: 0.66 },
          { transform: "translate3d(77%,0,0)",  opacity: 0.5,  offset: 0.82 },
          { transform: "translate3d(0%,0,0)",   opacity: 0,    offset: 1 }
        ], { duration: D, easing: "linear", fill: "both", direction: play }));

        /* the whole book settles, like a real sheet dropping into place */
        mat.animate([
          { transform: "scale(1)" },
          { transform: "scale(.988)", offset: 0.4 },
          { transform: "scale(1)" }
        ], { duration: D * 1.1, easing: "ease-in-out" });

        /* the ambient layer dips so the swap reads as a single movement */
        ambience.animate([
          { opacity: 1 }, { opacity: 0.12, offset: 0.45 }, { opacity: 1 }
        ], { duration: D, easing: "ease-in-out" });
      }

      /* text and scenery change over at the midpoint of the turn — and by now
         the scenery is only being put in, not made */
      setTimeout(() => {
        writeCaption(page);
        Ambience.commit(scenery);
        caption.classList.remove("is-out");
      }, Math.round(D * 0.42));

      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        out.classList.remove("is-active", "is-leaving", "is-turning");
        inn.classList.remove("is-turning");
        anims.forEach((a) => { try { a.cancel(); } catch { /* already gone */ } });
        out.style.transformOrigin = "";
        inn.style.transformOrigin = "";
        /* hand the stacking back to the CSS classes */
        out.style.zIndex = "";
        inn.style.zIndex = "";
        live = 1 - live;
        busy = false;
        bindAudio();

        /* ── NOTHING HEAVY ON THE LANDING FRAME ─────────────────────────────
           Three expensive things used to happen on the single frame the turn
           came to rest: two neighbouring pages were fetched and decoded, and
           an mp3 was handed to the decoder. All of it landed while the last
           frames of the animation were still being drawn, and the turn ended
           with a hitch on the frame a reader is looking straight at.

           The neighbours can wait for a gap in the work — they are not needed
           until the next turn, a page-length away. The clip only yields once,
           because it must not be perceptibly late: a zero-delay timeout is the
           next task rather than the next frame, which nobody hears, and it is
           enough to let the frame commit before the decoder starts.

           A TIMER RATHER THAN requestAnimationFrame, deliberately. rAF is the
           right instrument for something visual and the wrong one for
           something that has to happen: a browser that is not painting — a
           hidden tab, a throttled one — simply does not call it, and the page
           would sit there silent with its narration queued behind a frame that
           never comes. Starting a clip is not a drawing job.

           It checks the page has not moved on again in that moment, so a fast
           reader cannot start a clip for a page they have already left. */
        later(() => { preload(index + 1); preload(index - 1); });

        const mine = index;
        setTimeout(() => {
          if (mine === index) PageAudio.play();   /* this page's clip, only it */
        }, 0);

        awaitPresentation(playCover()); /* Aaru rides in, then the title pops */
        emit();
      };

      if (anims[0] && anims[0].finished) anims[0].finished.then(settle).catch(settle);
      /* belt and braces: never leave the book locked if an animation is lost */
      setTimeout(settle, D + 120);

      return true;
    }

    return {
      get index() { return index; },
      get total() { return PAGES.length; },
      get busy()  { return busy; },
      next() { return go(index + 1, 1); },
      prev() { return go(index - 1, -1); },
      jump(i) { return go(i, i > index ? 1 : -1); },
      onChange(fn) { listeners.push(fn); },

      /* fn(index) once per visit, when that page has finished presenting
         itself and the reader may reasonably go on */
      onReady(fn) { readyListeners.push(fn); },

      /* "चलाओ": show this page from the top. The cover rides in again, a
         story page starts its clip over, and either way the page counts as
         unfinished until that presentation ends — which is what makes Play
         the thing that starts the first page rather than a page that has
         quietly already finished before the reader pressed anything. */
      present() {
        announced = false;
        const coverRunning = playCover();
        if (!coverRunning) { PageAudio.stop(); PageAudio.play(); }
        awaitPresentation(coverRunning);
      },

      /* tapping the words reads that page again, whatever the toggle says */
      replay() { PageAudio.replay(); },

      start() {
        /* #p7 opens the book at page 7 — handy for sharing a favourite page */
        const fromHash = parseInt((location.hash.match(/^#p(\d+)$/) || [])[1], 10);
        if (Number.isFinite(fromHash)) index = clamp(fromHash - 1, 0, PAGES.length - 1);

        const first = PAGES[index];
        paint(slots[0], arts[0], first);
        writeCaption(first);
        Ambience.build(first);
        bindAudio();

        const reveal = () => {
          document.documentElement.classList.add("is-ready");
          /* the entrance is worth waiting for the cut-outs to decode */
          if (PAGES[index].layers && Cover.ok) {
            waitForLayers(PAGES[index].layers).then(() => Cover.play(covers[live]));
          }
        };
        if (arts[0].complete) reveal();
        else {
          arts[0].addEventListener("load", reveal, { once: true });
          arts[0].addEventListener("error", reveal, { once: true });
        }
        preload(1);
        emit();
      }
    };
  })();

  /* ── PlayMode ───────────────────────────────────────────────────────────
     "चलाओ" hands the screen over to the picture: the top bar lifts out of
     flow and fades, and the book grows to fill the page.

     The growth is a FLIP. We measure the book, switch to the play-mode
     layout, measure again, then animate a transform from the old box to the
     new one. Layout is recalculated exactly once; everything the reader sees
     in between is a compositor transform, so the zoom stays smooth and —
     because it ends on real layout, not a held scale — the artwork and text
     are crisp at the end rather than a stretched bitmap.

     Nothing here touches the page-turn: the book keeps its own size rules,
     play mode only changes what those rules resolve to.
     -------------------------------------------------------------------- */
  const PlayMode = (() => {
    const root  = document.documentElement;
    const book  = $("#book");
    const bar   = $(".topbar");
    const ZOOM  = 700;                       /* inside the 500-800ms brief */
    const EASE  = "cubic-bezier(.45,.05,.2,1)";
    const IDLE  = 2600;

    let on = false, zoom = null, idle = 0;

    /* measure -> relayout -> animate the difference away */
    function flip(change) {
      const first = book.getBoundingClientRect();
      change();
      const last = book.getBoundingClientRect();

      if (calm() || !first.width || !last.width) return;
      const scale = first.width / last.width;
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (!isFinite(scale) || scale <= 0) return;

      if (zoom) { try { zoom.cancel(); } catch { /* already gone */ } }
      book.style.willChange = "transform";
      zoom = book.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
        { transform: "translate(0px, 0px) scale(1)" }
      ], { duration: ZOOM, easing: EASE, fill: "none", composite: "replace" });
      book.style.transformOrigin = "top left";

      const done = () => {
        zoom = null;
        book.style.willChange = "";
        book.style.transformOrigin = "";
      };
      zoom.finished.then(done).catch(done);
    }

    /* the exit button and the arrows rest when the reader is still */
    function stir() {
      root.classList.add("is-stirring");
      clearTimeout(idle);
      idle = setTimeout(() => root.classList.remove("is-stirring"), IDLE);
    }

    /* Escape used to leave play mode, and does not any more — see exit() for
       why there is no way out. It still counts as the reader being there, so
       it wakes the arrows like every other key. */
    const onKey = () => stir();

    function listen(add) {
      const fn = add ? "addEventListener" : "removeEventListener";
      window[fn]("pointermove", stir, { passive: true });
      window[fn]("pointerdown", stir, { passive: true });
      window[fn]("keydown", onKey);
    }

    function enter() {
      if (on) return;
      on = true;
      /* only rescue focus for keyboard users: the bar is about to go inert,
         but a mouse click shouldn't leave a focus ring on an arrow */
      const el = document.activeElement;
      const byKeyboard = !!(el && el.matches && el.matches(":focus-visible"));

      flip(() => root.classList.add("is-play"));
      bar.inert = true;                      /* keep hidden controls off the tab order */
      listen(true);
      stir();
      if (byKeyboard) $("#nextBtn").focus({ preventScroll: true });
    }

    /* PLAY MODE IS ONE WAY, and nothing calls this.

       There was a round × in the top corner that faded in whenever the reader
       moved, and Escape did the same thing. Both are gone, because leaving play
       mode leads nowhere: the top bar is display:none (style.css §3), so the
       only thing dropping out of it does is make the picture smaller and hand
       back a screen with no controls on it. A way out that leads somewhere
       worse is not a way out.

       It is kept because it is the counterpart to enter() and it is what makes
       the pair a state and not a latch — the undo for everything enter() does,
       in the same order — so bringing the button back is wiring a click to it
       and nothing else. */
    function exit() {
      if (!on) return;
      on = false;
      TitleVO.stop();           /* and the title stops mid-word rather than turning the page after them */
      flip(() => root.classList.remove("is-play"));
      bar.inert = false;
      listen(false);
      clearTimeout(idle);
      root.classList.remove("is-stirring");
      const el = document.activeElement;
      if (el && el.matches && el.matches(":focus-visible")) {
        $("#playBtn").focus({ preventScroll: true });
      }
    }

    return {
      get on() { return on; },
      enter, exit
    };
  })();

  /* ── UI ─────────────────────────────────────────────────────────────── */
  const UI = (() => {
    const prev = $("#prevBtn");
    const next = $("#nextBtn");
    const soundBtn = $("#soundBtn");
    const readBtn = $("#readBtn");
    const readLabel = $("#readLabel");
    const playBtn = $("#playBtn");
    const playLabel = $("#playLabel");
    const startBtn = $("#startBtn");
    const frame = $("#frame");

    /* The book is Hindi. There is no second label set and nothing switches
       between them: <html lang="hi"> is the whole of it. */
    const L = {
      prev: "पिछला पन्ना", next: "अगला पन्ना",
      mute: "आवाज़ बंद करें", unmute: "आवाज़ चालू करें",
      read: "पढ़कर सुनाओ", reading: "पढ़ना रोको",
      play: "चलाओ", playHint: "कहानी बड़ी करके देखो",
      start: "कहानी चलाओ"
    };

    /* ── the arrow gate ───────────────────────────────────────────────────
       Which arrow the reader can see is a question about two things and no
       others: whether there is a page behind them, and whether the page they
       are on has finished playing.

       Back exists as soon as there is something to go back to. Forward
       exists only once this page has said its piece — and once earned it is
       never taken away again, because a page already heard is still heard
       when you come back to it later. That is why this is a set of pages
       rather than a single flag, and it is what makes moving backward safe:
       there is no way for going back to remove the way forward.
       ------------------------------------------------------------------- */
    const heard = new Set();       /* pages that have finished presenting */

    const canForward = () =>
      Book.index < Book.total - 1 && heard.has(Book.index);

    /* every forward move in the book goes through here — the arrow, the
       keyboard and a swipe alike, so the rule cannot be sidestepped by
       reaching for a different input */
    const forward = () => { if (canForward()) Book.next(); };

    /* ── where the story starts ───────────────────────────────────────────
       The title page is the home screen and not page one. It is still
       PAGES[0] — the book is thirteen pages long and the finale still counts
       from the end — but it is the thing a reader looks at before they have
       asked for anything, and once they have asked, it is behind them. So
       FIRST is the floor: Play opens it, nothing goes back past it, and the
       jump panel does not offer it.

       Backward moves go through here for exactly the reason forward() exists:
       the keyboard, a swipe and the panel are three ways to the same move, and
       a rule enforced at only two of them is not a rule. */
    const FIRST = 1;
    const back = () => { if (Book.index > FIRST) Book.prev(); };

    /* ── the auto-turn ────────────────────────────────────────────────────
       The book reads itself: a page moves on once it has finished speaking,
       so nobody has to press anything. It hangs off the same single signal
       the forward arrow used to wait for, which is what makes it safe — that
       signal fires on a clip's real `ended`, and equally on a clip that
       failed to load or was refused playback. A page that loses its audio
       still turns, so the story can never strand a reader on a page with the
       arrows gone.

       The beat afterwards is not politeness. It lets the last word land, and
       it lets a sound-effect burst finish its own animation — page 11's
       धड़ाम is still shrinking away 0.26s after that clip ends.

       A silent page waits longer, because there is no voice to fill it. Since
       the title page stopped being page one, nothing in a reading is silent and
       AUTO_SILENT does not currently fire — it stays because "how long a page
       with nothing to say holds for" is a question the auto-turn has to have an
       answer to, and finding out it has none by adding a wordless page is the
       worse way to learn it.

       ── ONE SECOND, AND THE SAME SECOND EVERY TIME ────────────────────────
       The beat is a DEADLINE, not a delay, and that is the whole of what makes
       it even. A delay is a number handed to setTimeout and forgotten; if the
       moment it lands on is a bad one — mid-turn, menu open, tab in the
       background — the old code simply asked again in 600ms, or 400ms, and the
       reader got whatever that rounded up to. A page could hold for a second,
       or for a second and a half, with nothing in the story to explain the
       difference. That is what read as uneven.

       So the beat is a time to turn AT. Every blocked path re-checks on a
       60ms tick and turns the moment the way is clear, which puts the worst
       case within a frame or two of the intended second instead of half of one
       past it. Nothing rounds up any more.

       AND HIDDEN TIME DOES NOT COUNT. A tab in the background spends the beat
       on nobody: the reader comes back to a page that has already used up its
       second, and it turns out from under them. So the deadline is pushed
       forward while the tab is away, and they get their full second of a page
       they can actually see. It is their beat, not the clock's.

       THE FILM IS NOT IN THIS. The last page hands over to Finale.run()
       instead of turning (see Book.onReady below), and the film's own ending
       hands over to the game, so nothing on this path times the video or the
       transition around it. Changing the beat cannot touch it. */
    const AUTO_BEAT   = 1000;   /* ms after a page has spoken — one second      */
    const AUTO_SILENT = 2600;   /* ms after a page with nothing to say          */
    const AUTO_TICK   = 60;     /* how often a beat that cannot land re-checks  */
    let autoTimer = 0;

    function autoTurn(from) {
      clearTimeout(autoTimer);
      /* Only a book actually being read turns itself. The title page becomes
         "ready" as soon as its entrance has played, which happens on load as
         well as on Play — without this the home screen would walk off into
         the story on its own before anyone had asked it to. */
      if (!PlayMode.on) return;

      const spoken = from === Book.index ? PageAudio.hasClip : true;
      const beat = spoken ? AUTO_BEAT : AUTO_SILENT;
      let due = performance.now() + beat;

      autoTimer = setTimeout(function turn() {
        /* the reader has moved on by themselves — that page's turn is void */
        if (Book.index !== from) return;
        if (!PlayMode.on) return;           /* they have left the story */

        const t = performance.now();

        /* the tab is not being looked at: a page that turns now is a page the
           reader never saw, and a beat spent in the background is a beat they
           did not get. Hold, and hand them a whole one when they are back. */
        if (document.hidden) { due = t + beat; autoTimer = setTimeout(turn, AUTO_TICK); return; }

        /* mid-turn, or they are picking a page out of the menu: wait, do not
           give up, or the book would simply stop */
        if (Book.busy || JumpMenu.open) { autoTimer = setTimeout(turn, AUTO_TICK); return; }

        /* held past the moment for one of the reasons above, and now free: go
           the instant the deadline is met rather than at the next tick */
        if (t < due) { autoTimer = setTimeout(turn, Math.max(0, due - t)); return; }

        Book.next();
      }, beat);
    }

    /* ── the idle hand ────────────────────────────────────────────────────
       A child who has stopped touching the screen has usually stopped because
       they do not know what to touch. After a few still seconds a hand appears
       and taps whatever the way onward is, and vanishes the moment they move.

       It is deliberately built on top of the gate above rather than beside it:
       the hand points at the forward arrow only when the gate has actually
       opened it, so it can never invite a tap that does nothing. And while a
       page is still being read aloud there is nothing to point at, so it stays
       away instead of nagging over the narration.
       ------------------------------------------------------------------- */
    /* ── the paper transition ─────────────────────────────────────────────
       Loose blank sheets fly in from every direction until the screen is
       nothing but paper, hold for a moment, then drift away and leave
       whatever is underneath by then. Used to get from one scene to the next
       without either of them being seen to change.

       Coverage is by construction rather than by hope. The sheets are dealt
       onto a grid whose shape follows the window, each sheet a good deal
       larger than its cell — larger than the cell's diagonal, in fact, which
       is what makes the cover hold however the sheet is turned — and then
       jittered off its centre by less than the slack that gives. Because the
       grid is built from the live window every time, it is right on a phone
       and on a desktop without a media query.

       Only transform and opacity are animated, so the whole thing runs on the
       compositor: no layout, no paint, no jank. Sheets are created per run and
       thrown away afterwards, so nothing idles in the DOM between times.
       ------------------------------------------------------------------- */
    const Paper = (() => {
      const host    = $("#paper");
      const backing = $("#paperBacking");

      /* ── the dials ──────────────────────────────────────────────────── */
      const SHEETS      = 22;        /* how many sheets; the one number to turn */
      const ENTER_MIN   = 800;       /* a sheet's flight in, ms            */
      const ENTER_MAX   = 1200;
      const ENTER_STAGGER = 260;     /* spread of their start times        */
      const HOLD        = 420;       /* fully covered, ms                  */
      const EXIT_MIN    = 1200;      /* and their drift away, ms           */
      const EXIT_MAX    = 1800;
      const EXIT_STAGGER  = 420;
      const COVER_CAP   = 2500;      /* longest the paper will wait on a hook */
      const TILT        = 12;        /* max resting tilt, degrees          */
      const EASE_IN     = "cubic-bezier(.16,.84,.30,1)";   /* arriving: fast, then settling */
      const EASE_OUT    = "cubic-bezier(.42,0,.58,1)";     /* leaving: gentle both ends     */

      let running = false;

      /* Deal the sheets: one per grid cell, over-sized and jittered. Returns
         the elements with the resting position each one is flying towards. */
      function deal() {
        const vw = window.innerWidth, vh = window.innerHeight;
        /* a grid of about SHEETS cells, shaped like the window */
        const cols = Math.max(2, Math.round(Math.sqrt(SHEETS * vw / vh)));
        const rows = Math.max(2, Math.ceil(SHEETS / cols));
        const cw = vw / cols, ch = vh / rows;
        /* big enough that a tilted sheet still covers its cell corner to
           corner, with room left over for the jitter below */
        const diag = Math.hypot(cw, ch);
        const w = diag * 1.22, h = diag * 1.22;
        const jitter = Math.min(cw, ch) * 0.10;
        const reach = Math.hypot(vw, vh) * 1.15;   /* how far off-screen they wait */

        const sheets = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const el = document.createElement("div");
            el.className = "paper__sheet";
            el.style.width = w + "px";
            el.style.height = h + "px";
            /* depth: a few sheets ride slightly larger and above the rest, so
               the pile has a front and a back rather than being one plane */
            const depth = rnd(0, 1);
            const scale = 0.94 + depth * 0.12;
            el.style.zIndex = String(1 + Math.round(depth * 8));
            el.style.opacity = String(0.97 + depth * 0.03);

            /* where it comes to rest: its cell, nudged off centre */
            const x = c * cw + cw / 2 - w / 2 + rnd(-jitter, jitter);
            const y = r * ch + ch / 2 - h / 2 + rnd(-jitter, jitter);
            const tilt = rnd(-TILT, TILT);

            /* where it flies in from: straight out past the nearest edge,
               spun further round than it will end up */
            const angle = rnd(0, Math.PI * 2);
            const fromX = x + Math.cos(angle) * reach;
            const fromY = y + Math.sin(angle) * reach;

            sheets.push({
              el, scale,
              rest:  `translate3d(${x}px, ${y}px, 0) rotate(${tilt}deg) scale(${scale})`,
              start: `translate3d(${fromX}px, ${fromY}px, 0) rotate(${tilt + rnd(-40, 40)}deg) scale(${scale * rnd(0.86, 1.02)})`,
              x, y, tilt
            });
            el.style.transform = sheets[sheets.length - 1].start;
            host.appendChild(el);
          }
        }
        return sheets;
      }

      /* every sheet's flight, as one promise */
      function flight(sheets, key, opts) {
        return Promise.all(sheets.map((s, i) => {
          const a = s.el.animate(
            [{ transform: key === "in" ? s.start : s.rest },
             { transform: key === "in" ? s.rest : s.away }],
            {
              duration: rnd(opts.min, opts.max),
              delay: rnd(0, opts.stagger),
              easing: opts.easing,
              fill: "both"
            });
          return a.finished.catch(() => {});   /* a cancelled flight is not a failure */
        }));
      }

      /* where each sheet goes when it leaves: a different direction from the
         one it arrived by, turning as it goes */
      function scatter(sheets) {
        const reach = Math.hypot(window.innerWidth, window.innerHeight) * 1.25;
        sheets.forEach((s) => {
          const angle = rnd(0, Math.PI * 2);
          s.away = `translate3d(${s.x + Math.cos(angle) * reach}px, ${s.y + Math.sin(angle) * reach}px, 0)`
                 + ` rotate(${s.tilt + rnd(-70, 70)}deg) scale(${s.scale * rnd(0.92, 1.14)})`;
        });
      }

      /* In calm mode there is no flying: the screen simply goes to paper and
         back, which does the same job without anything moving across it. */
      function calmRun(atCover) {
        const fade = 240;
        host.classList.add("is-running");
        const b1 = backing.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fade, fill: "both" });
        return b1.finished
          .then(() => { atCover(); return wait(HOLD); })
          .then(() => backing.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fade, fill: "both" }).finished)
          .then(() => { backing.style.opacity = ""; host.classList.remove("is-running"); });
      }

      const wait = (ms) => new Promise((go) => setTimeout(go, ms));

      /* Run the transition.

         Three points where a caller can act, and the order of them is the
         whole reason this exists:

           prepare  as the sheets start flying in. Whatever the next scene
                    needs loading, load it now — the flight buys about a
                    second of cover to do it in.
           covered  the screen is paper and nothing else. This is the moment
                    to START the next scene, not merely to swap it in: it is
                    AWAITED, so the sheets do not begin to leave until it
                    resolves. A video started here is already running, with
                    real frames, before the first sheet moves.
           done     the last sheet has gone.

         The awaited `covered` hook is capped, because a scene that never
         becomes ready must not leave the reader staring at blank paper: past
         COVER_CAP the sheets leave regardless. */
      function run(hooks) {
        if (running) return Promise.resolve();
        running = true;
        const done = () => { running = false; };

        /* the older shape, playPaperTransition(fn), still means "after" */
        const h = typeof hooks === "function" ? { covered: hooks } : (hooks || {});

        const covered = () => {
          let out;
          try { out = h.covered && h.covered(); } catch { /* a hook must not strand the paper */ }
          /* a hook may be async — wait for it, but never for ever */
          return Promise.race([
            Promise.resolve(out).catch(() => {}),
            wait(COVER_CAP)
          ]);
        };

        if (calm()) {
          return calmRun(covered).then(() => { if (h.done) h.done(); }).then(done, done);
        }

        /* The sheets have a sound of their own, and it starts with them: 4.97s
           against a flight that runs about four, so it is still tailing off as
           the last sheet leaves rather than stopping short of one still in the
           air. It obeys the book's sound switch like every other recording.

           Only on the full flight. The reduced-motion path below is a half
           second of fade with no sheets in it, and five seconds of paper over
           it would be describing something that is not happening. */
        host.classList.add("is-running");
        Beats.sfx("paper");
        const sheets = deal();
        /* the loading happens under cover of the flight, not before it */
        try { if (h.prepare) h.prepare(); } catch { /* as above */ }

        return flight(sheets, "in", { min: ENTER_MIN, max: ENTER_MAX, stagger: ENTER_STAGGER, easing: EASE_IN })
          .then(() => {
            /* covered: hold the backing up behind the pile so no seam can
               show, then start the next scene and wait for it to be running */
            backing.style.opacity = "1";
            return covered();
          })
          .then(() => wait(HOLD))
          .then(() => {
            scatter(sheets);
            /* the backing goes first and quickly, while the sheets still
               cover everything, so what is underneath is never revealed by
               the backing fading rather than by the paper leaving */
            backing.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: "both" }).finished
              .then(() => { backing.style.opacity = ""; });
            return flight(sheets, "out", { min: EXIT_MIN, max: EXIT_MAX, stagger: EXIT_STAGGER, easing: EASE_OUT });
          })
          .then(() => {
            sheets.forEach((s) => s.el.remove());
            host.classList.remove("is-running");
            done();
            if (h.done) h.done();
          }, () => {
            /* whatever went wrong, do not leave the screen covered in paper */
            sheets.forEach((s) => s.el.remove());
            backing.style.opacity = "";
            host.classList.remove("is-running");
            done();
          });
      }

      return { run, get running() { return running; }, SHEETS };
    })();

    /* Is this video actually able to play? Resolves true once the browser has
       enough of it to run without stalling, false if it errors — and either
       way it gives up after `timeout` rather than hanging the caller.

       Three events are watched, not one, because browsers disagree about which
       arrives: `canplay` is the one that means what we want, `loadeddata` gets
       there first on some mobile Safari builds, and `playing` covers the case
       where playback has already begun before we started listening. A video
       with preload="none" loads nothing at all until load() is called, so a
       caller must do that first — prepareFilm below does.

       This is exported because it is generally useful, and because the caller,
       not the transition, is what knows which element matters. */
    window.waitForVideoReady = function waitForVideoReady(video, timeout = 4000) {
      /* HAVE_FUTURE_DATA: a frame now and more coming */
      if (video.readyState >= 3) return Promise.resolve(true);
      return new Promise((settle) => {
        let done = false;
        const finish = (ok) => {
          if (done) return;
          done = true;
          ["canplay", "loadeddata", "playing"].forEach((e) => video.removeEventListener(e, ready));
          video.removeEventListener("error", failed);
          clearTimeout(timer);
          settle(ok);
        };
        const ready  = () => finish(true);
        const failed = () => finish(false);
        ["canplay", "loadeddata", "playing"].forEach((e) => video.addEventListener(e, ready));
        video.addEventListener("error", failed);
        /* out of time: say whether there is at least a frame to show */
        const timer = setTimeout(() => finish(video.readyState >= 2), timeout);
      });
    };

    /* The reusable form asked for:
           playPaperTransition(() => playNextVideo())
       and the fuller one, which is what makes the reveal real:
           playPaperTransition({ prepare, covered, done })

       In the short form the function is the `covered` hook — it runs while the
       screen is paper, and the sheets wait for it before they leave. That is
       the ordering that matters: prepare, then start, then let the paper go. */
    window.playPaperTransition = function playPaperTransition(hooks) {
      return Paper.run(hooks);
    };

    /* ── the ending ───────────────────────────────────────────────────────
       The last page has said its piece, so the paper transition runs: sheets
       cover the screen, the film takes the picture's place while they are over
       it, and when they drift away the film is there and starts.

       The film is loaded while the sheets fly in and put in place, paused on
       its first frame, while they cover the screen. So what the sheets uncover
       is a real frame rather than a blank — and then it waits a beat, PLAY_DELAY
       below, before it moves.

       Waiting rather than playing behind the paper is deliberate: the hold and
       the drift away take some two seconds together, and a film that started
       under cover would spend its opening two seconds unseen.

       Nothing here waits on the film's own length: it announces its own end.

       The film has a sound track of its own and plays it. It is not muted —
       by this point the reader has pressed Play, so the browser has the
       gesture it wants before it will let sound start unasked, and the page's
       own narration has just finished, so there is nothing for it to talk
       over. Two things can still refuse it, and both are handled below: the
       book's own sound switch, which the film obeys like everything else, and
       a browser that declines anyway — in which case the film is muted and
       played regardless, because a silent ending is better than a still one.
       ------------------------------------------------------------------- */
    const Finale = (() => {
      const host = $("#finale");
      const film = $("#finaleFilm");
      const CLIP = "assets/video/aru.webm";
      Beats.attachFilm(film);   /* the film keeps its own cue list */
      /* the beat between the last sheet leaving and the film starting to move:
         the reveal lands on a held frame, and then the story moves */
      const PLAY_DELAY = 350;
      let ran = false;

      /* ── and then the game ────────────────────────────────────────────────
         The film is the end of the story and the beginning of the game, so
         when it finishes the game is what comes next — not the last page
         again, and not a screen asking whether to go on. ?start=1 tells the
         game the child has just watched the ending and pressed nothing since,
         which is its cue not to show its title screen at all.

         The changeover happens under the paper: the sheets fly in, cover the
         viewport, and the new page is asked for while nothing can be seen of
         either. That is the whole trick to it looking instant.

         WARM is what makes it actually be instant, and it is asked for as the
         film is prepared, so the fetching has the film's full 25 seconds to
         happen in. The three cards are fetched as images because that works
         from the filesystem as well as from a server; the game's own three
         files are prefetched, which only a server will honour. The ?v= on two
         of them has to match what the game's index.html asks for or the cache
         is simply missed — harmless, but no faster. */
      const GAME = "../game.html?start=1";
      const WARM_FETCH = [
        "../game.html",
        "../styles.css?v=155",
        "../app.js?v=155"
      ];
      const WARM_ART = [
        "../assets/images/r1-house.webp",
        "../assets/images/r1-sneeze.webp",
        "../assets/images/r1-pot.webp"
      ];
      let warmed = false, handed = false;

      /* ── is the game even there? ──────────────────────────────────────────
         It is a separate folder inside this one, and a folder can be moved or
         deleted — it has been once already. When it is gone, every route into
         it becomes a navigation to a missing page: the film would end by
         putting a child in front of a browser error with nothing to press.

         So the warm-up doubles as the answer. One of the three cards it
         fetches reports back, and an <img> is the one thing that can ask "is
         this file there" from a filesystem as well as from a server — fetch()
         is refused for local files, which is what made this worth doing at all.
         Until it answers, `there` stays null, meaning "not known yet"; once it
         answers, the film either hands over or gives the picture back the way
         it used to before there was a game to hand over to.

         Restoring the folder needs no code change. The probe simply starts
         succeeding again. */
      let there = null;

      function warmGame() {
        if (warmed) return;
        warmed = true;
        for (const href of WARM_FETCH) {
          const l = document.createElement("link");
          l.rel = "prefetch";
          l.href = href;
          document.head.appendChild(l);
        }
        WARM_ART.forEach((src, i) => {
          const im = new Image();
          im.decoding = "async";
          /* the first one answers for all three: they live in the same folder */
          if (i === 0) {
            im.onload  = () => { there = true;  };
            im.onerror = () => { there = false; };
          }
          im.src = src;
        });
      }

      /* Once, and only from the film's own `ended`. `handed` is not the same
         guard as `ran`: that one stops the film being started twice, this one
         stops the game being opened twice — a second `ended` from a replay, or
         a stray call, must not fire a navigation that is already in flight. */
      /* The sheets cover the viewport at 1.4s at the very outside, and Paper
         gives up waiting on its own `covered` at 2.5s, so nothing legitimate
         reaches this. It is here because the one thing this changeover must
         never do is fail quietly: if a transition were somehow already in
         flight, or a browser refused the animation outright, the child would
         be left sitting in front of a finished film with no way on. Late is
         survivable. Never is not. */
      const HANDOVER_CAP = 2600;

      /* The one door into the game, whoever opens it: the film reaching its
         end, or a child choosing "खेल खेलो" out of the menu without reading
         that far. Both go under the paper and both are once-only. */
      function openGame() {
        if (handed) return;
        handed = true;
        warmGame();                  /* a no-op if the film already asked */
        PageAudio.stop();            /* the story stops talking on its way out */
        let gone = false;
        const go = () => {
          if (gone) return;
          gone = true;
          /* The one case that must not become a browser error: the game is not
             where it should be. Then the sheets simply give the picture back,
             which is what the ending did before there was a game — a finished
             story rather than a dead end. `there === null` means the probe has
             not answered yet, and an unanswered probe is treated as present:
             the folder is normally there, and a slow answer should not cost a
             child the game. */
          if (there === false) { host.classList.remove("is-playing"); return; }
          location.href = GAME;
        };
        window.playPaperTransition({ covered: go });
        setTimeout(go, HANDOVER_CAP);
      }

      /* back to a closed book: film put away, ready to run again if the reader
         comes back to the last page */
      function reset() {
        ran = false;
        /* And the handover is armed again with it. `handed` guards one showing
           of the film, not the lifetime of the page: a reader who leaves the
           last page mid-film and comes back to it gets the film again, and it
           has to be able to hand over at the end of that showing too. Leaving
           this true would strand them in front of a finished film. */
        handed = false;
        host.classList.remove("is-playing");
        try { film.pause(); } catch { /* never started */ }
        if (film.hasAttribute("src")) { film.removeAttribute("src"); film.load(); }
      }

      /* Get the film ready while the sheets are still flying in. preload is
         "none", so nothing has been fetched yet and load() is what starts it;
         from a rewound start, so a second visit to the page begins at the
         beginning rather than wherever it was left. */
      function prepareFilm() {
        warmGame();                 /* the game has the film's length to arrive in */
        if (film.getAttribute("src") !== CLIP) film.src = CLIP;
        film.poster = PAGES[PAGES.length - 1].img;
        try { film.currentTime = 0; } catch { /* not seekable yet */ }
        film.load();
        return window.waitForVideoReady(film);
      }

      /* The screen is paper. Put the film in the picture's place — on its first
         frame and still paused. Awaited, so the sheets do not begin to leave
         until there is a decoded frame behind them: what they uncover is the
         opening of the film, not a blank or a poster.

         It waits rather than plays so that none of the film is spent behind the
         paper. Two seconds of it would otherwise go by unseen while the sheets
         hold and drift away, and those are the two seconds it opens with. */
      function showFilmBehindPaper() {
        host.classList.add("is-playing");
        film.muted = PageAudio.muted;      /* the book's sound switch governs it too */
        try { film.currentTime = 0; } catch { /* not seekable yet */ }
        return window.waitForVideoReady(film);
      }

      /* The last sheet has gone and the first frame is sitting there in the
         open. Hold that beat, then let it move. */
      function startFilmAfterBeat() {
        setTimeout(() => {
          const attempt = film.play();
          if (attempt && attempt.catch) attempt.catch(() => {
            /* a browser that will not start sound unasked: play it silently
               rather than leave the ending as a held frame */
            film.muted = true;
            const q = film.play();
            if (q && q.catch) q.catch(() => { /* the frame stays instead */ });
          });
        }, PLAY_DELAY);
      }

      function run() {
        if (ran) return;             /* once per visit to the last page */
        ran = true;

        window.playPaperTransition({
          prepare: prepareFilm,             /* load it under cover of the flight */
          covered: showFilmBehindPaper,     /* first frame ready, still paused   */
          done: startFilmAfterBeat          /* revealed, a beat, then it moves   */
        });

        /* Not `loop`ed and not restarted anywhere, so this fires once; the
           listener is once-only as well, and openGame has its own guard. */
        film.addEventListener("ended", openGame, { once: true });
      }

      /* The film waits out a tab switch too, and for the sharper reason: it
         ends by handing the reader over to the game, so a film left running
         behind a hidden tab does not merely lose its place — it finishes, and
         the reader comes back to a game they never saw start. Only a film that
         was actually running is resumed; one still sitting on its first frame
         behind the paper is left alone for the transition to start itself. */
      let heldFilm = false;

      function hold() {
        if (!film || film.paused || film.ended || !film.getAttribute("src")) return;
        heldFilm = true;
        try { film.pause(); } catch { /* never started */ }
      }

      function unhold() {
        if (!heldFilm) return;
        heldFilm = false;
        if (!film || film.ended || !film.getAttribute("src")) return;
        const p = film.play();
        if (p && p.catch) p.catch(() => { /* the frame stays instead */ });
      }

      /* warm: the menu opening is a head start on the game's 600KB.
         here: whether the folder is actually present, for the menu to ask. */
      return { run, reset, warm: warmGame, openGame, hold, unhold,
               get here() { return there !== false; } };
    })();

    /* ── the jump menu ────────────────────────────────────────────────────
       Two ways out of the page you are on: skip, which goes forward now
       without waiting for the words to be read, and the grid, which goes to
       any page at all.

       The grid is pictures rather than page numbers, because a child who
       cannot read a number can still recognise a red bicycle. It is built
       once from PAGES, so it can never offer a page the book does not have,
       and the thumbnails are the full illustrations — there is no smaller
       copy of each — so they are marked lazy and fetched only when the panel
       is first opened rather than on every page load.

       Both actions deliberately ignore the gate that holds the forward arrow
       back until a page has been read out: leaving the page you are on is the
       whole purpose of this menu. Skipping counts as being done with the page,
       so the arrow is there if the reader comes back to it.
       ------------------------------------------------------------------- */
    const JumpMenu = (() => {
      const btn   = $("#jumpBtn");
      const panel = $("#jumpPanel");
      const veil  = $("#jumpVeil");
      const grid  = $("#jumpGrid");
      const skip  = $("#jumpSkip");
      const game  = $("#jumpGame");
      let on = false, built = false;
      let closed = null;   /* what to tell when the panel shuts */

      function build() {
        if (built) return;
        built = true;
        /* The title page is not offered. It is the home screen, and a tile
           leading back to it would be the one way left of putting the cover
           back on screen mid-story — with no Play button on it, because that
           only shows outside play mode. The pages keep their real indices, so
           `i` is still what Book.jump wants. */
        grid.replaceChildren(...PAGES.map((page, i) => {
          if (i < FIRST) return null;

          const li = document.createElement("li");
          li.className = "jump__item";

          const pick = document.createElement("button");
          pick.type = "button";
          pick.className = "jump__pick";
          /* the page's own words name it, for a screen reader and for a
             grown-up hunting a particular moment */
          const words = page.text ? page.text.hi.replace(/<[^>]*>/g, "") : page.alt.hi;
          pick.setAttribute("aria-label", `पन्ना ${i + 1}: ${words}`);
          pick.addEventListener("click", () => { close(); Book.jump(i); });

          const im = document.createElement("img");
          im.src = page.img;
          im.alt = "";
          im.loading = "lazy";
          im.decoding = "async";
          im.draggable = false;
          pick.appendChild(im);

          const no = document.createElement("span");
          no.className = "jump__no";
          no.textContent = String(i + 1);

          li.append(pick, no);
          return li;
        }).filter(Boolean));
      }

      /* mark where the reader is, and whether there is anywhere to skip to */
      function sync() {
        [...grid.querySelectorAll(".jump__pick")].forEach((p, i) => {
          if (i === Book.index) p.setAttribute("aria-current", "page");
          else p.removeAttribute("aria-current");
        });
        skip.disabled = Book.index >= Book.total - 1;
      }

      function open() {
        if (on) return;
        on = true;
        build();
        sync();
        panel.hidden = false;
        veil.hidden = false;
        /* the class lands a frame later, so the fade has a state to start from */
        requestAnimationFrame(() => {
          panel.classList.add("is-open");
          veil.classList.add("is-open");
        });
        btn.setAttribute("aria-expanded", "true");
        PageAudio.stop();            /* the narration waits rather than talking over this */
        Finale.warm();               /* a head start on the game, in case they choose it */
        /* and if the game is not in the project, do not offer it: the probe in
           Finale answers once the warm-up has been asked for, which is now. */
        setTimeout(() => { game.hidden = !Finale.here; }, 400);
        const here = grid.querySelector('[aria-current="page"]') || grid.querySelector(".jump__pick");
        if (here) here.focus();
      }

      function close() {
        if (!on) return;
        on = false;
        if (closed) closed();   /* the narration was stopped on open */
        panel.classList.remove("is-open");
        veil.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
        /* out of the layout only once the fade is done */
        setTimeout(() => {
          if (on) return;            /* reopened in the meantime */
          panel.hidden = true;
          veil.hidden = true;
        }, calm() ? 0 : 300);
        btn.focus({ preventScroll: true });
      }

      return {
        get open() { return on; },
        toggle() { on ? close() : open(); },

        /* Told when the panel goes away. Opening it stops the narration, and
           with the arrows gone the book turns on that narration finishing —
           so somebody has to decide what happens to a page the reader
           interrupted. UI knows whether it had already finished; this module
           only knows that it closed. */
        onClose(fn) { closed = fn; },
        close,
        start() {
          btn.addEventListener("click", () => JumpMenu.toggle());
          veil.addEventListener("click", close);

          skip.addEventListener("click", () => {
            const from = Book.index;
            close();
            heard.add(from);         /* they are done with this page by choice */
            Book.next();
          });

          /* Out of the story and into the game. The panel is closed first, the
             way picking a page does it — it draws above the paper transition,
             so it has to be on its way out before the sheets arrive. Closing
             also restarts this page's narration, which openGame then stops:
             the right order, not a coincidence. */
          game.addEventListener("click", () => {
            game.disabled = true;    /* one tap; openGame guards the rest */
            close();
            Finale.openGame();
          });

          /* Escape belongs to the panel while it is open: it must close the
             panel and nothing else. Play mode listens for Escape on window
             too, and would otherwise drop the reader out of the story at the
             same time; the arrow keys would turn pages behind the panel.

             Capture, so this runs first, and stopImmediatePropagation rather
             than stopPropagation, because plain stopPropagation does not stop
             another listener on the same node — which is exactly what play
             mode's is. */
          window.addEventListener("keydown", (e) => {
            if (!on) return;
            if (e.key === "Escape") {
              e.stopImmediatePropagation();
              e.preventDefault();
              close();
            } else if (e.key.startsWith("Arrow") || e.key === " " ||
                       e.key === "PageUp" || e.key === "PageDown" ||
                       e.key === "Home" || e.key === "End") {
              e.stopImmediatePropagation();   /* Tab still walks the thumbnails */
            }
          }, true);
        }
      };
    })();

    const HandHint = (() => {
      const el = $("#handHint");
      /* Nine seconds of stillness before the hand appears. It was 4.2s, which
         is quick enough to arrive while a child is still looking at the
         picture and deciding — and a hand that taps at someone who has not
         finished looking is nagging them rather than helping. The only place
         it shows now is the title page, where the one thing to do is press
         Play, so there is no hurry to say so. */
      const WAIT = 9000;
      let timer = 0;

      /* what the reader is waiting to be told to press, if anything */
      function where() {
        if (Book.busy) return null;                       /* mid-turn */
        if (JumpMenu.open) return null;                   /* choosing a page */
        const cover = document.documentElement.classList.contains("at-cover");
        if (cover && !PlayMode.on) return "start";        /* press Play */
        /* Nothing to point at once the story is running: the pages turn
           themselves, and the arrow the hand used to tap is hidden. Pressing
           Play is the only thing still asked of a reader. */
        return null;
      }

      function hide() {
        el.classList.remove("is-showing");
        next.classList.remove("is-hinted");
      }

      function show() {
        const at = where();
        if (!at) return;
        el.dataset.at = at;
        el.classList.add("is-showing");
        /* so the arrow does not sit dimmed under the hand telling you to press it */
        if (at === "next") next.classList.add("is-hinted");
      }

      function restart() {
        hide();
        clearTimeout(timer);
        timer = setTimeout(show, WAIT);
      }

      return {
        start() {
          /* every sign of life resets the wait; passive, so none of this can
             slow a scroll or a swipe down */
          ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"]
            .forEach((ev) => window.addEventListener(ev, restart, { passive: true }));
          document.addEventListener("visibilitychange", restart);
          restart();
        },
        /* the page changed, or the gate opened: the hand's target may be
           somewhere else now, so begin the wait again from here */
        refresh: restart
      };
    })();

    function arrow(btn, visible) {
      btn.classList.toggle("is-hidden", !visible);
      /* what is hidden is also disabled, and so is anything mid-turn: a
         stray click, a held-down key or a second tap on a button already on
         its way out cannot start a turn the reader cannot see coming */
      btn.disabled = !visible || Book.busy;
    }

    function sync(i, total) {
      arrow(prev, i > 0);
      arrow(next, i < total - 1 && heard.has(i));
      prev.setAttribute("aria-label", L.prev);
      next.setAttribute("aria-label", L.next);
      /* the big Play invitation belongs to the title page only */
      document.documentElement.classList.toggle("at-cover", i === 0);
      /* the shutters and the film belong to the last page and nowhere else, so
         stepping off it puts them away and lets the ending run again on a
         second visit */
      if (i !== total - 1) Finale.reset();
      /* wherever the hand was pointing may not be the way onward any more */
      HandHint.refresh();
    }

    function syncPlayLabels() {
      playLabel.textContent = L.play;
      playBtn.setAttribute("aria-label", `${L.play} — ${L.playHint}`);
      startBtn.setAttribute("aria-label", L.start);
    }

    function syncReadLabel() {
      const on = PageAudio.on;
      /* The recording is Hindi and so is the book, so there is no longer a
         state where the narration does not match the words: the button used
         to disable itself under English text. */
      readBtn.setAttribute("aria-pressed", on ? "true" : "false");
      /* the label names the feature; whether it is on is carried by
         aria-pressed, the pause icon and the colour. It used to read
         "stop reading" even when nothing was playing. */
      readLabel.textContent = L.read;
      readBtn.setAttribute("aria-label", on ? L.reading : L.read);
    }

    function syncSoundLabel() {
      const audible = !PageAudio.muted;
      soundBtn.setAttribute("aria-pressed", audible ? "true" : "false");
      soundBtn.setAttribute("aria-label", audible ? L.mute : L.unmute);
    }

    function bind() {
      /* nav ------------------------------------------------------------- */
      prev.addEventListener("click", () => { back(); });
      next.addEventListener("click", forward);

      /* keyboard -------------------------------------------------------- */
      document.addEventListener("keydown", (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        /* the target can be the document itself, which has no .closest */
        const el = e.target instanceof Element ? e.target : null;
        const onButton = el ? el.closest("button") : null;
        let handled = true;
        switch (e.key) {
          case "ArrowRight": case "PageDown": forward(); break;
          case "ArrowLeft":  case "PageUp":   back(); break;
          case "Home": Book.jump(FIRST); break;
          case "End":  Book.jump(Book.total - 1); break;
          case " ":
            if (onButton) { handled = false; break; }   // let the button click
            forward(); break;
          default: handled = false;
        }
        if (handled) e.preventDefault();
      });

      /* swipe ----------------------------------------------------------- */
      let sx = 0, sy = 0, id = null;
      frame.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse") return;
        id = e.pointerId; sx = e.clientX; sy = e.clientY;
      });
      frame.addEventListener("pointerup", (e) => {
        if (e.pointerId !== id) return;
        id = null;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        dx < 0 ? forward() : back();
      });
      frame.addEventListener("pointercancel", () => { id = null; });

      /* controls -------------------------------------------------------- */
      soundBtn.addEventListener("click", () => {
        PageAudio.setMuted(!PageAudio.muted);
        syncSoundLabel();
      });

      /* Play mode: both entry points, one behaviour. Play hands the screen
         over to the picture AND starts this page from the top, which is what
         makes the first page a page that plays rather than one that finished
         quietly while the reader was still looking at the title. The page
         counts as unheard again from this moment, so Forward goes away until
         the page has played itself out. */
      /* ── the title's line, then the turn ────────────────────────────────
         The book stays on the cover while the title speaks. The reader has
         just pressed the thing painted on that picture and the answer to the
         press is being said out loud, so turning underneath it would talk over
         the very page the words belong to. When the line ends — or turns out
         not to be there at all — the book goes on to the first painted page,
         which is what pressing play meant.

         The cover's entrance is deliberately not replayed here: they have been
         looking at the title all along and have already seen Aaru ride in.

         Nobody is trapped waiting on it. The forward arrow is open on the
         title, and taking it stops the line — see the Book.onChange hook in
         start(), which is also what makes carrying the title's voice over onto
         page one impossible. */
      const openStory = () => {
        /* read-aloud switched off means the book does not speak at all, so
           there is nothing to wait for: the old straight-to-page-one */
        if (!PageAudio.on) { Book.jump(FIRST); return; }
        TitleVO.play(() => {
          /* they may have gone on by themselves, or left the story, while it
             was speaking — either way the turn is no longer ours to make */
          if (Book.index === 0 && PlayMode.on) Book.jump(FIRST);
        });
      };

      const play = () => {
        PlayMode.enter();
        /* From anywhere but the cover — the panel can put a reader back
           mid-story and they may press Play again — it still means "this page,
           from the top". */
        if (Book.index === 0) openStory();
        else { heard.delete(Book.index); sync(Book.index, Book.total); Book.present(); }
      };

      playBtn.addEventListener("click", play);

      /* The cover's play button answers the touch before it acts on it — with
         the springy release, a CSS animation driven by .is-pop. It answered
         with a sound as well and no longer does: the title line starts on this
         same press, and a pop in front of it was one sound too many.

         Entering play mode still waits one short beat so that release is seen
         rather than swallowed by the zoom; the class is cleared on animationend
         so a second tap replays it, and re-added after a reflow so the restart
         actually takes. */
      startBtn.addEventListener("click", () => {
        startBtn.classList.remove("is-pop");
        void startBtn.offsetWidth;
        startBtn.classList.add("is-pop");
        setTimeout(play, calm() ? 0 : 140);
      });
      /* both the squash and the ring run .44s, so whichever end arrives first
         is the end of the whole thing — the pulse ring never reports here,
         an infinite animation has no end */
      startBtn.addEventListener("animationend", (e) => {
        if (e.animationName === "startPop" || e.animationName === "startBurst") {
          startBtn.classList.remove("is-pop");
        }
      });

      /* read aloud, with word-by-word highlighting */
      readBtn.addEventListener("click", () => {
        PageAudio.toggle();
        syncReadLabel();
      });

      PageAudio.onState((speaking) =>
        readBtn.classList.toggle("is-speaking", speaking));

      /* tapping the words reads that page again */
      frame.addEventListener("click", (e) => {
        if (e.target instanceof Element && e.target.closest(".scene__text")) Book.replay();
      });
      $(".caption").addEventListener("click", () => Book.replay());

      /* stop the world when the tab is hidden --------------------------- */
      /* ── the tab going away, and coming back ──────────────────────────────
         The story waits. It does not stop, and it emphatically does not start
         again: the page stays the page it was, the clip keeps its playhead,
         and the reader picks up the sentence where they left it.

         This used to call PageAudio.stop(), which is a different thing wearing
         the same word. stop() rewinds to zero and does not announce the clip
         as finished — so a reader who glanced at another tab came back to a
         silent page, from the top, with the forward gate still shut behind a
         clip that was never going to end. The page was not paused, it was
         killed, and it took the way out with it.

         Three things can be mid-flight and each is held where it is: the
         page's narration, the title line on the cover, and the ending film.
         The auto-turn is the fourth — it keeps waiting rather than turning
         (see autoTurn), so nobody comes back to a page they never saw.

         What is NOT touched: the page number, the cue list, `heard`, the
         ambience, the artwork, or anything about where the reader is. The
         .is-hidden class parks the CSS animations (style.css §7) and they come
         back with it. Nothing here resets any of that, which is the whole
         point — the story is on hold, not on rewind. */
      document.addEventListener("visibilitychange", () => {
        const hidden = document.hidden;
        document.documentElement.classList.toggle("is-hidden", hidden);
        if (hidden) { PageAudio.hold(); TitleVO.hold(); Finale.hold(); }
        else        { PageAudio.unhold(); TitleVO.unhold(); Finale.unhold(); }
      });

      /* rebuild the scene if the visitor flips reduced-motion on/off ---- */
      calmMedia.addEventListener("change", () => Ambience.build(PAGES[Book.index]));
    }

    return {
      start() {
        bind();
        Book.onChange(sync);

        /* The page itself is a thing that moves, so it gets a sound too — the
           one effect that is the same everywhere, because it belongs to the
           book rather than to any scene. It fires at the top of the turn,
           where emit() is, so it lands with the page starting to lift rather
           than after it has gone. */
        /* Once per turn, not twice. go() announces a change at both ends of a
           page turn — at the top so the button states update immediately, and
           again once the new page has bound — which is right for sync() and
           doubles anything else hung off it. Measured before this guard: 24
           paper sounds across a twelve-page reading.

           The first of the two announcements already carries the new index, so
           this still lands with the page starting to lift rather than after it
           has gone. */
        let sounded = -1;
        Book.onChange((i) => {
          if (!PlayMode.on || i === sounded) return;
          sounded = i;
          Beats.sfx("page");
        });

        /* The title's line belongs to the title page. Leaving that page — by
           the arrow, a swipe, the keyboard, the jump panel, or by the line's
           own ending turning it — ends the line rather than letting it play on
           over the next picture. Registered on the same signal as the page
           sound so it cannot be missed by one of the ways out. */
        Book.onChange(() => TitleVO.stop());

        /* the only thing that opens the way forward */
        Book.onReady((i) => {
          heard.add(i);
          if (i === Book.index) sync(Book.index, Book.total);
          /* the last page finishing is the story finishing: roll the ending.
             Every other page finishing turns itself. */
          if (i === Book.total - 1) Finale.run();
          else if (i === Book.index) autoTurn(i);
        });

        /* The jump panel stops the narration when it opens. If the reader
           shuts it again without choosing a page, the page they were on has
           nothing left to finish it — and the book now turns on that finish,
           so it would quietly stop instead. A page already heard just needs
           its beat again; one interrupted mid-sentence says its piece from
           the top. (A pick or a skip also closes the panel, and lands here
           first, but the page it moves to binds a moment later and takes the
           narration over.) */
        JumpMenu.onClose(() => {
          if (!PlayMode.on) return;
          if (heard.has(Book.index)) autoTurn(Book.index);
          else PageAudio.play();
        });

        sync(Book.index, Book.total);
        JumpMenu.start();

        /* A way to watch the transition on demand: open the page with ?demo
           and a button appears. It runs the transition over whatever is on
           screen and changes nothing else, so it is safe to press at any
           point in the story. The same thing is available from the console
           at any time as playPaperTransition(). */
        if (/(\?|&)demo\b/.test(location.search) || /\bdemo\b/.test(location.hash)) {
          const demo = $("#paperDemo");
          demo.hidden = false;
          demo.addEventListener("click", () => window.playPaperTransition());
        }
        HandHint.start();
        syncSoundLabel();
        syncReadLabel();
        syncPlayLabels();
      }
    };
  })();

  /* ── go ─────────────────────────────────────────────────────────────── */
  Book.start();
  UI.start();
})();
