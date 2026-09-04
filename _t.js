(async () => {
  const say = (m) => navigator.sendBeacon("/log", m);
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const paper = () => document.querySelector("#paper").childElementCount;
  const frame = () => document.querySelector("#gameFrame");
  const shown = () => { const f = frame();
    return !f.hidden && !f.classList.contains("is-veiled"); };
  addEventListener("error", (e) => { const t = e.target;
    if (!(t && t.tagName && /IMG|AUDIO|VIDEO/.test(t.tagName))) say("ERR: " + e.message); }, true);
  await wait(1400);
  const t0 = performance.now(), rel = (t) => "+" + Math.round(t - t0) + "ms";
  window.__Finale.openGame();
  let enterAt = 0, loadedAt = 0, exitDoneAt = 0, gameAt = 0, peak = 0;
  let sawGameWhilePaper = false;
  for (let i = 0; i < 400; i++) {
    await wait(40);
    const n = paper(), t = performance.now();
    if (n > peak) peak = n;
    if (!enterAt && n > 3) enterAt = t;
    if (!loadedAt && !frame().hidden) loadedAt = t;
    if (shown() && n > 3) sawGameWhilePaper = true;      /* must never happen */
    if (!exitDoneAt && enterAt && n <= 1) exitDoneAt = t;
    if (!gameAt && shown()) gameAt = t;
    if (gameAt && t > gameAt + 500) break;
  }
  say("paper ENTER began:      " + rel(enterAt) + "  (peak " + peak + " sheets)");
  say("board loaded, veiled:   " + rel(loadedAt));
  say("paper EXIT finished:    " + rel(exitDoneAt));
  say("GAME shown:             " + rel(gameAt));
  say("");
  say("game shown only AFTER the exit: " + (gameAt >= exitDoneAt));
  say("game never visible while sheets were up: " + !sawGameWhilePaper);
  say("gap between exit ending and game: " + Math.round(gameAt - exitDoneAt) + "ms   (want ~0, no blank)");
  try { say("board inside: " + /कहानी क्रम/.test(frame().contentDocument.title)); } catch (e) {}
  say("END");
})();
