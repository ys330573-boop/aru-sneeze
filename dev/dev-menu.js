/* ═══════════════════════════════════════════════════════════════════════════
   THE DEV MENU - not part of the book.

   A jump-to-any-page panel, so nobody working on page 11 has to sit through
   ten pages and a film to see it. It also carries the one door straight into
   the game.

   IT ONLY EXISTS WITH ?dev=1. index.html fetches this file only when the
   address bar asks for it, and this file checks again on its own, so a reader
   downloads nothing, sees nothing, and has nothing extra in the DOM. The
   book's own stylesheet and script carry no trace of it: every class name it
   uses is defined in dev-menu.css beside this file, and every piece of the
   story it touches goes through window.StoryDev.

   TO REMOVE IT FOR GOOD, when the book is finished:
     1. delete the dev/ folder
     2. delete the "DEV ONLY" block at the foot of index.html
     3. in script.js, delete the "THE DEV SEAM" block, and change the two
        reads of `Dev.paused` (autoTurn and HandHint.where) to `false`
   Nothing else in the book knows this was ever here.
   ═══════════════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  /* Checked here as well as in index.html. The loader is what keeps a reader
     from fetching the file; this is what keeps it inert if somebody ever wires
     it up with a plain <script> tag and forgets the query string. */
  const asked = new URLSearchParams(location.search);
  if (!asked.has("dev") || asked.get("dev") === "0") return;

  /* THE ONLY THING THIS TOOL KNOWS ABOUT THE BOOK. If the seam is not there -
     an older script.js, or the block already deleted - say so once and stop,
     rather than throwing halfway through building a panel. */
  const Story = window.StoryDev;
  if (!Story) {
    console.warn("[dev-menu] window.StoryDev is missing - is script.js loaded, " +
                 "or has the dev seam been removed? The menu will not appear.");
    return;
  }

  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* our own stylesheet, fetched only now that we know we are wanted */
  const sheet = document.createElement("link");
  sheet.rel  = "stylesheet";
  sheet.href = "dev/dev-menu.css?v=1";
  document.head.appendChild(sheet);

  /* ── the panel ──────────────────────────────────────────────────────────
     Built here rather than in index.html so that deleting this folder deletes
     the markup too. The class names match dev-menu.css and nothing else. */
  const host = document.createElement("div");
  host.innerHTML = [
    '<button class="jumpbtn" id="jumpBtn" type="button"',
    '        aria-label="मेन्यू" aria-expanded="false" aria-controls="jumpPanel">',
    '  <span class="jumpbtn__bars" aria-hidden="true"><i></i><i></i><i></i></span>',
    '</button>',
    '<div class="jumpveil" id="jumpVeil" hidden></div>',
    '<nav class="jump" id="jumpPanel" aria-labelledby="jumpTitle" hidden>',
    '  <h2 class="jump__title" id="jumpTitle">क्या करें?</h2>',
    '  <button class="jump__skip" id="jumpSkip" type="button"',
    '          aria-label="पढ़े जाने का इंतजार किए बिना अगला पन्ना">',
    '    <span class="jump__skip-ico" aria-hidden="true"><i></i><i></i></span>',
    '    आगे बढ़ो',
    '  </button>',
    '  <ul class="jump__grid" id="jumpGrid"></ul>',
    '  <div class="jump__foot">',
    '    <button class="jump__game" id="jumpGame" type="button"',
    '            aria-label="कहानी छोड़कर खेल शुरू करो">',
    '      <span class="jump__game-ico" aria-hidden="true"></span>',
    '      खेल खेलो',
    '    </button>',
    '  </div>',
    '</nav>'
  ].join("\n");
  /* moved out of the wrapper so they sit directly on <body>, which is where
     the fixed positioning in dev-menu.css expects to find them */
  document.body.append(...[...host.children]);

  const $ = (s) => document.querySelector(s);
  const btn   = $("#jumpBtn");
  const panel = $("#jumpPanel");
  const veil  = $("#jumpVeil");
  const grid  = $("#jumpGrid");
  const skip  = $("#jumpSkip");
  const game  = $("#jumpGame");

  let on = false, built = false;

  /* Built once, on the first opening. Doing it at load would put thirteen full
     illustrations in front of the story's own opening; they are lazy as well,
     so even this only fetches the tiles that land on screen. */
  function build() {
    if (built) return;
    built = true;
    const FIRST = Story.first;
    grid.replaceChildren(...Story.pages.map((page, i) => {
      /* The title page is not offered: it is the home screen, and a tile back
         to it would be the one way left of putting the cover up mid-story -
         with no Play button on it, since that only shows outside play mode.
         Tiles keep their real page indices, so `i` is what Story.jump wants. */
      if (i < FIRST) return null;

      const li = document.createElement("li");
      li.className = "jump__item";

      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "jump__pick";
      /* the page's own words name it, for a screen reader and for anyone
         hunting a particular moment */
      const words = page.text ? page.text.hi.replace(/<[^>]*>/g, "") : page.alt.hi;
      pick.setAttribute("aria-label", "पन्ना " + (i + 1) + ": " + words);
      pick.addEventListener("click", () => { close(); Story.jump(i); });

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

  function sync() {
    const FIRST = Story.first;
    [...grid.querySelectorAll(".jump__pick")].forEach((p, i) => {
      /* the tiles start at FIRST, so tile 0 is page index FIRST */
      if (i + FIRST === Story.index) p.setAttribute("aria-current", "page");
      else p.removeAttribute("aria-current");
    });
    skip.disabled = Story.index >= Story.total - 1;
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
    Story.hold();               /* the story holds still while this is up */
    Story.stopNarration();      /* rather than talking over it */
    Story.warmGame();           /* a head start, in case they choose the game */
    /* and if the game is not in the project, do not offer it: the probe
       answers once the warm-up has been asked for, which is now */
    setTimeout(() => { game.hidden = !Story.gameHere; }, 400);
    /* a keyboard lands on the page it is already on, or the first tile */
    const here = grid.querySelector('[aria-current="page"]') ||
                 grid.querySelector(".jump__pick");
    (here || (skip.disabled ? game : skip)).focus({ preventScroll: true });
  }

  function close() {
    if (!on) return;
    on = false;
    Story.release();            /* and the story picks up where it left off */
    panel.classList.remove("is-open");
    veil.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
    /* out of the layout only once the fade is done */
    setTimeout(() => {
      if (on) return;           /* reopened in the meantime */
      panel.hidden = true;
      veil.hidden = true;
    }, calm ? 0 : 300);
    btn.focus({ preventScroll: true });
  }

  btn.addEventListener("click", () => (on ? close() : open()));
  veil.addEventListener("click", close);

  skip.addEventListener("click", () => { close(); Story.skip(); });

  /* Out of the story and into the game, through the very same door the ending
     uses - Story.openGame, which runs the paper transition and brings the
     board up in the frame in this page. The panel is closed first because it
     draws above that transition and has to be on its way out before the sheets
     arrive. Closing also restarts this page's narration, which openGame then
     stops: the right order, not a coincidence. */
  game.addEventListener("click", () => {
    game.disabled = true;       /* one tap; openGame guards the rest */
    close();
    Story.openGame();
  });

  /* Escape belongs to the panel while it is open, and the arrow keys must not
     turn pages behind it. Capture, so this runs before the book's own key
     handling, and stopImmediatePropagation rather than stopPropagation,
     because plain stopPropagation does not stop another listener on the same
     node. */
  window.addEventListener("keydown", (e) => {
    if (!on) return;
    if (e.key === "Escape") {
      e.stopImmediatePropagation();
      e.preventDefault();
      close();
    } else if (e.key.startsWith("Arrow") || e.key === " " ||
               e.key === "PageUp" || e.key === "PageDown" ||
               e.key === "Home" || e.key === "End") {
      e.stopImmediatePropagation();   /* Tab still walks the tiles */
    }
  }, true);

  console.info("[dev-menu] on, because the address bar says ?dev=1");
})();
