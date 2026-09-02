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
      img: "assets/images/page-01.jpg",     /* flat fallback: needs no masks */
      cover: true,
      /* the same picture as three layers, so Aaru can ride in and the title
         can pop. Geometry is % of the frame, measured off the artwork. */
      layers: {
        bg: "assets/images/cover-bg.jpg",
        hero:  { x: "5.26%",  y: "0.21%",  w: "50.36%", h: "99.79%",
                 img:  "assets/images/cover-hero.jpg",
                 mask: "assets/images/cover-hero-mask.png" },
        title: { x: "56.22%", y: "10.63%", w: "43.66%", h: "59.51%",
                 img:  "assets/images/cover-title.jpg",
                 mask: "assets/images/cover-title-mask.png" },
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
      img: "assets/images/page-02.jpg",
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
      img: "assets/images/page-03.jpg",
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
      img: "assets/images/page-04.jpg",
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
      img: "assets/images/page-05.jpg",
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
      img: "assets/images/page-06.jpg",
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
      img: "assets/images/page-07.jpg",
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
      img: "assets/images/page-08.jpg",
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
      img: "assets/images/page-09.jpg",
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
      img: "assets/images/page-10.jpg",
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
      img: "assets/images/page-11.jpg",
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
      img: "assets/images/page-12.jpg",
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
      img: "assets/images/page-13.jpg",
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
      /* Pause and rewind only. Tearing the source down here (removeAttribute
         + load) leaves a teardown in flight that collides with the next
         clip's load and wedges it at readyState 0. The element holds one
         buffer, which the next src replaces, so nothing accumulates. */
      if (el) { try { el.pause(); el.currentTime = 0; } catch { /* not started */ } }
      delete document.documentElement.dataset.clip;
      announce(false);
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
     The one sound this file makes itself: a short cork-pop for the play
     button, so a tap answers back. It is interface feedback, not part of the
     story — PageAudio still plays nothing but the supplied recordings — and
     it obeys the same mute switch, so silencing the book silences this too.

     Synthesised rather than shipped as a file: it is two brief oscillators,
     which is smaller than any mp3 of it and needs no network. The context is
     built on the first tap, never on load, because a context created before a
     gesture starts out suspended and stays that way in some browsers.
     -------------------------------------------------------------------- */
  const Pop = (() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx = null;

    /* THE BUTTON'S SOUND IS A RECORDING NOW, and it is primed the moment this
       module exists rather than fetched when the button is pressed. The whole
       job of this sound is to answer a finger the instant it lands; a first
       press that has to go to the network first does not do that. It is 2KB.

       Levelled to peak at -9.7 dBFS, which is where the synthesised pop it
       replaces peaked (0.34 of full scale = -9.4) — so the button sounds
       different but not suddenly louder or quieter than before. */
    const FILE = "assets/sfx/play.mp3?v=1";
    let el = null;

    function element() {
      if (el) return el;
      try {
        el = new Audio(FILE);
        el.preload = "auto";
        el.load();
      } catch { el = null; }
      return el;
    }
    element();

    function context() {
      if (!AC) return null;
      if (!ctx) { try { ctx = new AC(); } catch { return null; } }
      if (ctx.state === "suspended") ctx.resume().catch(() => { /* not yet allowed */ });
      return ctx;
    }

    /* one voice: a pitch that drops fast, which is what reads as a "pop" */
    function voice(c, at, { type, from, to, peak, len }) {
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      g.connect(c.destination);

      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(from, at);
      o.frequency.exponentialRampToValueAtTime(to, at + len * 0.8);
      o.connect(g);
      o.start(at);
      o.stop(at + len + 0.02);
      o.onended = () => { try { o.disconnect(); g.disconnect(); } catch { /* gone */ } };
    }

    return {
      /* shared so the book only ever builds one audio context: Beats's
         sound effects are synthesised in this same one. */
      get ctx() { return context(); },

      play() {
        if (PageAudio.muted) return;

        /* The supplied recording, and the two oscillators below it as the
           fallback — the button must answer a press even if the file will not
           load, because it is the proof to a child that the book makes sounds
           at all.

           Rewound rather than replaced on each press: the clip is 0.15s and a
           second press inside that should cut the first off, which is what a
           button being pressed twice actually sounds like. */
        const a = element();
        if (a) {
          try { a.currentTime = 0; } catch { /* not seekable yet */ }
          const p = a.play();
          if (p && p.catch) p.catch(voices);
          return;
        }
        voices();
      }
    };

    /* the cork-pop that was here before the recording, kept whole */
    function voices() {
      const c = context();
      if (!c) return;                         /* no Web Audio: stay silent */
      const t = c.currentTime + 0.001;
      /* body of the pop, then a quieter click on top for the "cork" edge */
      voice(c, t, { type: "sine",     from: 900,  to: 230,  peak: 0.34, len: 0.14 });
      voice(c, t, { type: "triangle", from: 1900, to: 1100, peak: 0.08, len: 0.05 });
    }
  })();

  /* ── Beats ──────────────────────────────────────────────────────────────
     The small things that happen at a particular moment of a page: a few
     motion lines, a sound effect. One cue table, one clock.

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

       lines a few motion strokes — see Lines.draw for the shape of it
       sfx   a sound, recorded or synthesised — see Sfx
       art   a picture thrown onto the page — out/x/y/w place it, `life` sets
             how long the whole pop lasts

     NOTHING USES `art` ANY MORE, and that is a decision rather than an
     oversight. It drew the comic lettering — आ…छीं, ट्रिन-ट्रिन, टप्प, धड़ाम —
     over eight moments, and it was taken out because the words sat badly on
     the paintings: every one of those moments is already spoken by the
     narrator and already printed into the artwork, so the burst was the third
     copy of the same words and the only one covering the picture.

     What those moments have instead is what they always also had: the motion
     strokes, and the sound. The sneeze is still heard, the bell still rings,
     the samosa still lands.

     THE MECHANISM STAYS, unused, because it is the way to put any picture on
     any page at a measured moment — see burst(). The five lettering files are
     still in assets/pop/. To use it again, add {art, at, x, y, w} and, for a
     file that has not been used before, its width/height ratio to `shape`.

     Pages 7, 8 and 11 carry sound effects mixed into the recording itself, so
     they are not given a second one here at the same moment. Nothing is added
     to a page that has no action in it.

     To retime anything, change `at`. To move a set of lines, change x/y.
     Nothing else here needs touching. */
  const Beats = (() => {
    const ART = "assets/pop/";

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
      const CUT = 3;
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
        steps:  at_("steps")
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
          /* White, with a dark edge added in CSS — see .mline. Plain white
             would vanish over most of this book: sampled behind the strokes,
             the artwork runs to luminance 188 on the bicycle dust, 195 on the
             samosa haze and 216 on the whitewashed wall. `tone: "dark"` is
             still there for anywhere white turns out to be wrong. */
          const colour = o.tone === "dark"
            ? "rgba(58, 40, 22, .5)"
            : "rgba(255, 253, 248, .92)";

          for (let i = 0; i < n; i++) {
            /* where this stroke sits, and which way it points */
            const mid = (i - (n - 1) / 2);
            let ang = dir, ax = o.x, ay = o.y;

            if (o.burst) {
              /* fanned out of the point, each stroke pushed clear of it */
              ang = dir + (n > 1 ? mid * (arc / (n - 1)) : 0);
              const r = ang * Math.PI / 180;
              const reach = len * 0.66;
              ax = o.x + Math.cos(r) * reach;
              ay = o.y + Math.sin(r) * reach * ASPECT;
            } else {
              /* parallel, offset across the direction of travel */
              const r = dir * Math.PI / 180;
              ax = o.x + -Math.sin(r) * mid * spread;
              ay = o.y + Math.cos(r) * mid * spread * ASPECT;
            }

            const el = document.createElement("i");
            /* a burst stroke is tapered the other way: see .mline--out */
            el.className = o.burst ? "mline mline--out" : "mline";
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

    /* ── the cue table ────────────────────────────────────────────────────
       Scene by scene: what happens, what motion belongs to it, what it
       sounds like, and when.

       Page 1, the cover, is not here — it has no recording to hang a time
       off. Its two sounds are triggered by the entrance itself, in Cover.play.

       THE SNEEZE, on all five pages it happens on. It is the event the book is
       named after and it was the one thing never drawn: the lettering already
       existed in assets/pop/sneeze.webp and nothing played it.

       Each is placed on the boy's face, measured off each painting rather than
       repeated, because he stands somewhere different on every one — page 3
       centre-left, page 6 in the air, page 9 over by the stall. Each sits a
       little ABOVE the face centre so the burst takes his hair and forehead and
       the scrunched-up mouth still reads under it; dead-centred on the face it
       covers the best drawing on the page.

       And each fires on the BURST rather than on the halting "आ… आ…" that leads
       into it, and lives 1000ms — long enough to land, short enough to stay a
       sneeze rather than becoming a caption. */
    const CUES = {
      /* 2 · an empty courtyard, Aaru alone on the step. Nothing moves, so
         the only thing to give it is the air. */
      2: [{ at: 0.30, sfx: "birds",
            lines: { x: 24, y: 20, dir: 4, n: 2, len: 15, thick: 0.2, spread: 3.4, life: 1500, gap: 320 } },
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
      3: [{ at: 9.30,
            lines: { x: 44, y: 45, dir: -20, n: 3, len: 9, burst: true, arc: 50, life: 480 } },
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
         wheel; the bell already has its own sound and its own lettering.

         `cycle` is the one cue that is a BED rather than an accent: 8.2s of
         wheels on road, running from the moment he pushes off and fading as he
         arrives, so the bell rings into quiet. It replaced a synthesised gust,
         which said "something moved" where the picture says "a bicycle". It is
         the quietest thing in the book at 18 dB under her voice — a page you
         notice is not silent rather than a page with a sound effect on it. */
      5: [{ at: 0.40, sfx: "cycle",
            lines: { x: 17, y: 58, dir: 178, n: 3, len: 13, spread: 3, life: 760 } }],

      /* 6 · the sneeze throws him off the bicycle. Lines off his face, then
         the flight, then the landing — this page has no mixed-in sound of
         its own, so the impact is made here. */
      6: [{ at: 3.30,
            lines: { x: 66, y: 32, dir: 26, n: 3, len: 9, burst: true, arc: 50, life: 470 } },
          { at: 5.35, sfx: "whoosh",
            lines: { x: 42, y: 30, dir: 150, n: 3, len: 12, spread: 2.8, life: 720 } },
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
      8: [{ at: 9.65,
            lines: { x: 40, y: 46, dir: 24, n: 3, len: 8.5, burst: true, arc: 50, life: 470 } },
          { at: 14.90,
            lines: { x: 52, y: 74, dir: 90, n: 3, len: 6, spread: 2.2, life: 560 } }],

      /* 9 · the sneeze, the samosa hitting the ground, and the dog away with
         it. The lettering is already here; the plop is not. */
      9: [{ at: 5.45,
            lines: { x: 66, y: 54, dir: 172, n: 3, len: 8.5, burst: true, arc: 50, life: 450 } },
          { at: 7.75, sfx: "plop",
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
             lines: { x: 15, y: 40, dir: -90, n: 3, len: 5, burst: true, arc: 120, life: 620 } }],

      /* 11 · the sneeze, then everything on the shelves comes down. The big
         clatter is mixed into the recording at 8.05, so what is added here is
         the first slip of metal a moment before it. */
      11: [{ at: 3.40,
             lines: { x: 64, y: 50, dir: 14, n: 3, len: 9, burst: true, arc: 50, life: 470 } },
           { at: 6.25, sfx: "settle",
             lines: { x: 86, y: 62, dir: 90, n: 3, len: 6.5, spread: 2.6, life: 600 } }],

      /* 12 · she gathers the pots up, and finds the locket she lost. */
      12: [{ at: 0.50, sfx: "settle",
             lines: { x: 32, y: 76, dir: -70, n: 2, len: 5.5, spread: 2, life: 520 } },
           { at: 6.80, sfx: "chime",
             lines: { x: 10, y: 84, dir: -90, n: 3, len: 4.5, burst: true, arc: 130, life: 700 } }],

      /* 13 · she holds the locket up, laughing, and Aaru laughs too. */
      13: [{ at: 0.30, sfx: "chime",
             lines: { x: 11, y: 40, dir: -90, n: 3, len: 4.5, burst: true, arc: 124, life: 700 } }],

      /* The film keeps its own soundtrack and its own cue list. Nobody has
         supplied timings for it and its spoken lines are written down nowhere
         in the project, so guessing would only put things in the wrong
         places. Entries added here run exactly like the page cues above. */
      film: []
    };

    /* An <img> takes its width from the CSS but its *height* from the file,
       which it does not know until the file has decoded. Left to itself the
       first burst of a reading would therefore start as a strip of zero
       height and snap into shape partway through its own animation. So the
       shape is stated up front, and each preload below corrects it from the
       real file in case an asset is ever re-exported at another size. */
    const shape = { ring: 1100 / 1011, tub: 1100 / 686, crash: 1100 / 686,
                    sneeze: 1100 / 1047 };

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

    /* one comic burst; each removes only itself, so two close together never
       cancel one another out */
    function burst(cue) {
      const l = host();
      if (!l) return;

      const img = document.createElement("img");
      img.className = "popart__item";
      img.src = ART + cue.art + ".webp";
      img.alt = "";
      img.draggable = false;
      img.decoding = "async";
      img.style.setProperty("--px", cue.x);
      img.style.setProperty("--py", cue.y);
      img.style.setProperty("--pw", cue.w);
      if (shape[cue.art]) img.style.aspectRatio = String(shape[cue.art]);
      l.appendChild(img);

      /* `life` sets the whole thing end to end, in ms, for a burst that should
         be a beat rather than a caption. At life:1000 the throw-in and the
         shrink-away leave 320ms of hold, which reads as a punch — right for a
         sneeze, which is one sharp event and not something to be read.

         Without it the hold is as long as the sound it belongs to, floored at
         MIN_HOLD, which is what the lettering bursts want: those name a noise
         and have to stay long enough to be read. */
      const total = cue.life
        ? Math.max(POP_IN + POP_OUT + 60, cue.life)
        : POP_IN + Math.max(MIN_HOLD, (cue.out || cue.at) - cue.at) * 1000 + POP_OUT;
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

      const a = img.animate(frames, { duration: total, fill: "both" });
      const gone = () => img.remove();
      a.finished.then(gone, gone);
    }

    /* everything one cue asks for */
    function fire(cue) {
      if (cue.sfx)   Sfx.play(cue.sfx);
      if (cue.lines) Lines.draw(host(), cue.lines);
      if (cue.art)   burst(cue);
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
          const mark = Math.max(0, c.at - LEAD);
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
          im.src = ART + c.art + ".webp";
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

  /* ── Music ──────────────────────────────────────────────────────────────
     One piece under the whole story, looping, well below everything else.

     LEVEL IS A TENTH of the file's own, which is the asked-for 90% off and
     also, as it happens, the right answer: the file is mastered at -12.9 LUFS
     and a tenth of an amplitude is -20 dB, which puts the music at -32.9 LUFS
     against narration averaging -15.5. Seventeen decibels under a voice is
     where a bed belongs — present when she is not speaking, gone when she is.

     IT LOOPS SEAMLESSLY, and it did not to begin with. The supplied recording
     is three minutes that FADE TO SILENCE over their last four seconds, so
     looping it raw gave a fade out and then a jump back to full volume every
     three minutes. assets/music/pathways.mp3 is that recording with the fade
     cut off and its tail crossfaded into its own opening: 172s that end at
     -21 dB where they begin at -17.7, which the ear does not catch, instead of
     ending at -77.

     IT STARTS ON PLAY and not on load, for two reasons that agree: a browser
     will not play audio before a gesture, and the title page is the one place
     in the book with no narration to sit under. It fades rather than stopping
     dead, because a bed that vanishes is more noticeable than one that leaves.
     And it goes before the film, which has a soundtrack of its own. */
  const Music = (() => {
    const SRC   = "assets/music/pathways.mp3?v=1";
    const LEVEL = 0.10;    /* a tenth of the file: the 90% asked for, = -20 dB */
    const FADE  = 1100;    /* ms, in and out */

    let el = null, fader = 0;

    function element() {
      if (el) return el;
      el = new Audio();
      el.src = SRC;
      el.loop = true;      /* the whole point: it never has to be restarted */
      el.preload = "auto";
      el.volume = 0;
      return el;
    }

    /* A ramp rather than a jump. Twelve steps is enough for a fade this long
       to be heard as one movement, and it costs nothing. */
    function ramp(to, then) {
      clearInterval(fader);
      const a = element();
      const from = a.volume;
      const steps = 12;
      let i = 0;
      fader = setInterval(() => {
        i++;
        const v = from + (to - from) * (i / steps);
        try { a.volume = Math.min(1, Math.max(0, v)); } catch { /* detached */ }
        if (i >= steps) { clearInterval(fader); if (then) then(); }
      }, FADE / steps);
    }

    return {
      /* on Play. Safe to call twice: an element already playing is left alone
         and simply brought back up to level. */
      start() {
        const a = element();
        a.muted = PageAudio.muted;
        const p = a.paused ? a.play() : null;
        if (p && p.catch) p.catch(() => { /* refused: stay silent */ });
        ramp(LEVEL);
      },

      /* leaving the story, or the film taking over */
      stop() {
        if (!el) return;
        ramp(0, () => { try { el.pause(); } catch { /* already gone */ } });
      }
    };
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
      build(page) {
        const quiet = calm();
        /* in calm mode only the pinned sparkles survive, and slowly */
        host.dust.replaceChildren(...(quiet ? [] : [dust(page.dust || 0)]));
        host.sparks.replaceChildren(pinned(page));
      }
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
      }
    }

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

      /* text and scenery change over at the midpoint of the turn */
      setTimeout(() => {
        writeCaption(page);
        Ambience.build(page);
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
        preload(index + 1); preload(index - 1);
        bindAudio();
        PageAudio.play();               /* this page's clip, and only this one */
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

    const onKey = (e) => {
      if (e.key === "Escape") { exit(); return; }
      stir();
    };

    function listen(add) {
      const fn = add ? "addEventListener" : "removeEventListener";
      window[fn]("pointermove", stir, { passive: true });
      window[fn]("pointerdown", stir, { passive: true });
      window[fn]("keydown", onKey);
    }

    function enter() {
      if (on) return;
      on = true;
      Music.start();            /* the bed, from here to the end of the story */
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

    function exit() {
      if (!on) return;
      on = false;
      Music.stop();             /* out of the story, out of the music */
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
      enter, exit,
      toggle() { on ? exit() : enter(); }
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
    const exitBtn = $("#exitBtn");
    const frame = $("#frame");

    /* The book is Hindi. There is no second label set and nothing switches
       between them: <html lang="hi"> is the whole of it. */
    const L = {
      prev: "पिछला पन्ना", next: "अगला पन्ना",
      mute: "आवाज़ बंद करें", unmute: "आवाज़ चालू करें",
      read: "पढ़कर सुनाओ", reading: "पढ़ना रोको",
      play: "चलाओ", playHint: "कहानी बड़ी करके देखो",
      start: "कहानी चलाओ", exit: "बाहर आओ"
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
       worse way to learn it. */
    const AUTO_BEAT   = 1200;   /* ms after a page has spoken */
    const AUTO_SILENT = 2600;   /* ms after a page with nothing to say */
    let autoTimer = 0;

    function autoTurn(from) {
      clearTimeout(autoTimer);
      /* Only a book actually being read turns itself. The title page becomes
         "ready" as soon as its entrance has played, which happens on load as
         well as on Play — without this the home screen would walk off into
         the story on its own before anyone had asked it to. */
      if (!PlayMode.on) return;

      const spoken = from === Book.index ? PageAudio.hasClip : true;
      autoTimer = setTimeout(function turn() {
        /* the reader has moved on by themselves — that page's turn is void */
        if (Book.index !== from) return;
        if (!PlayMode.on) return;           /* they have left the story */
        /* mid-turn, or they are picking a page out of the menu: wait, do not
           give up, or the book would simply stop */
        if (Book.busy || JumpMenu.open) { autoTimer = setTimeout(turn, 600); return; }
        Book.next();
      }, spoken ? AUTO_BEAT : AUTO_SILENT);
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

        host.classList.add("is-running");
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
      const CLIP = "assets/video/aru.mp4";
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
      const GAME = "aaru_ki_cheenk-main/index.html?start=1";
      const WARM_FETCH = [
        "aaru_ki_cheenk-main/index.html",
        "aaru_ki_cheenk-main/styles.css?v=155",
        "aaru_ki_cheenk-main/app.js?v=155"
      ];
      const WARM_ART = [
        "aaru_ki_cheenk-main/assets/images/r1-house.webp",
        "aaru_ki_cheenk-main/assets/images/r1-sneeze.webp",
        "aaru_ki_cheenk-main/assets/images/r1-pot.webp"
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
        /* the film has a soundtrack of its own to be heard over */
        Music.stop();

        window.playPaperTransition({
          prepare: prepareFilm,             /* load it under cover of the flight */
          covered: showFilmBehindPaper,     /* first frame ready, still paused   */
          done: startFilmAfterBeat          /* revealed, a beat, then it moves   */
        });

        /* Not `loop`ed and not restarted anywhere, so this fires once; the
           listener is once-only as well, and openGame has its own guard. */
        film.addEventListener("ended", openGame, { once: true });
      }

      /* warm: the menu opening is a head start on the game's 600KB.
         here: whether the folder is actually present, for the menu to ask. */
      return { run, reset, warm: warmGame, openGame, get here() { return there !== false; } };
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
      const WAIT = 4200;                  /* long enough not to nag a reader */
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
      exitBtn.setAttribute("aria-label", L.exit);
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
      const play = () => {
        PlayMode.enter();
        /* Straight to the first painted page. The reader has been looking at
           the title all along and has just pressed the thing on it, so playing
           its entrance again at them is showing them what they have already
           seen and answering their press with a wait — 2.6s of it, since a page
           with no words to say gets the longer beat before it turns itself.
           The turn carries them off the cover instead, which is what pressing
           it meant.

           From anywhere else — the panel can put a reader back mid-story and
           they may press Play again — it still means "this page, from the top". */
        if (Book.index === 0) Book.jump(FIRST);
        else { heard.delete(Book.index); sync(Book.index, Book.total); Book.present(); }
      };

      playBtn.addEventListener("click", play);

      /* The cover's play button answers the touch before it acts on it.
         The pop sound fires on pointerdown — the moment the finger lands, and
         the gesture Web Audio wants to unlock on — while the springy release
         is a CSS animation driven by .is-pop. Entering play mode waits one
         short beat so that release is seen and heard, not swallowed by the
         zoom; the class is cleared on animationend so a second tap replays
         it, and re-added after a reflow so the restart actually takes. */
      startBtn.addEventListener("pointerdown", () => Pop.play(), { passive: true });
      startBtn.addEventListener("click", (e) => {
        /* Enter/Space raise a click with no pointer behind it (detail 0), so
           the keyboard gets its pop here rather than going silent */
        if (!e.detail) Pop.play();
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
      exitBtn.addEventListener("click", () => PlayMode.exit());

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
      document.addEventListener("visibilitychange", () => {
        const hidden = document.hidden;
        document.documentElement.classList.toggle("is-hidden", hidden);
        if (hidden) PageAudio.stop();   /* nothing plays into a hidden tab */
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
