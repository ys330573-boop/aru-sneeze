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
      img: "assets/images/page-10.png",
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


  /* Where the words sit in each picture — always the empty side of that
     illustration, so the artwork itself is never covered.
     [ side, vertical, column width, type size in cqw ] */
  const SPOTS = [
    null,                                /*  1  cover: title is painted into the art */
    ["left",  "center", "38%", 3.6],     /*  2  the house stands on the right         */
    ["right", "top",    "40%", 2.8],     /*  3  boy centre-left, flour plume below     */
    ["left",  "center", "40%", 4.5],     /*  4  Aaru peers into the tin on the right  */
    ["right", "center", "41%", 3.7],     /*  5  he rides in from the left             */
    ["left",  "center", "37%", 4.2],     /*  6  boy and bicycle fly off to the right  */
    ["left",  "center", "40%", 4.5],     /*  7  he stands on the right                */
    ["right", "top",    "43%", 3.3],     /*  8  cart left, blurred shop lower right   */
    ["left",  "top",    "43%", 3.7],     /*  9  dog and stall fill the lower half     */
    ["right", "center", "40%", 3.2],     /* 10  doorway left, boy centre, wall right  */
    ["left",  "center", "47%", 4.0],     /* 11  shelves and boy on the right          */
    ["right", "center", "45%", 3.7],     /* 12  shelves left, Amma in the middle      */
    ["right", "center", "45%", 3.8]      /* 13  Amma and Aaru on the left             */
  ];
  SPOTS.forEach((s, i) => {
    if (s && PAGES[i]) PAGES[i].spot = { side: s[0], v: s[1], w: s[2], f: s[3] };
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
    const CUT = 3;
    const clip = (n) => `assets/audio/page-${String(n).padStart(2, "0")}.mp3?v=${CUT}`;

    let on    = localStorage.getItem(KEY)  !== "off";   /* narration on by default */
    let muted = localStorage.getItem(MUTE) === "off";

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
      play() {
        if (PageAudio.muted) return;
        const c = context();
        if (!c) return;                       /* no Web Audio: stay silent */
        const t = c.currentTime + 0.001;
        /* body of the pop, then a quieter click on top for the "cork" edge */
        voice(c, t, { type: "sine",     from: 900,  to: 230,  peak: 0.34, len: 0.14 });
        voice(c, t, { type: "triangle", from: 1900, to: 1100, peak: 0.08, len: 0.05 });
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
      /* The two slots are reused turn after turn, so a spot has to be cleared
         as deliberately as it is set — otherwise the first page that asks for
         its words on the right hands that down to every page after it that
         never asked for anything. */
      if (page.spot) {
        text.dataset.side = page.spot.side;
        text.dataset.valign = page.spot.v;
        text.style.setProperty("--tw", page.spot.w);
        text.style.setProperty("--tf", String(page.spot.f));
      } else {
        delete text.dataset.side;
        delete text.dataset.valign;
        text.style.removeProperty("--tw");
        text.style.removeProperty("--tf");
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
    const HandHint = (() => {
      const el = $("#handHint");
      const WAIT = 4200;                  /* long enough not to nag a reader */
      let timer = 0;

      /* what the reader is waiting to be told to press, if anything */
      function where() {
        if (Book.busy) return null;                       /* mid-turn */
        const cover = document.documentElement.classList.contains("at-cover");
        if (cover && !PlayMode.on) return "start";        /* press Play */
        if (canForward()) return "next";                  /* the gate is open */
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
      prev.addEventListener("click", () => { Book.prev(); });
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
          case "ArrowLeft":  case "PageUp":   Book.prev(); break;
          case "Home": Book.jump(0); break;
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
        dx < 0 ? forward() : Book.prev();
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
        heard.delete(Book.index);
        sync(Book.index, Book.total);
        PlayMode.enter();
        Book.present();
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

        /* the only thing that opens the way forward */
        Book.onReady((i) => {
          heard.add(i);
          if (i === Book.index) sync(Book.index, Book.total);
        });

        sync(Book.index, Book.total);
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
