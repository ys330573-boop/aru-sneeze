(async () => {
  const say = (m) => navigator.sendBeacon("/log", m);
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const paper = () => document.querySelector("#paper").childElementCount;
  const frame = () => document.querySelector("#gameFrame");
  addEventListener("error", (e) => { const t = e.target;
    if (!(t && t.tagName && /IMG|AUDIO|VIDEO/.test(t.tagName))) say("ERR: " + e.message); }, true);
  await wait(1500);
  const t0 = performance.now();
  const el = (ms) => "+" + String(Math.round(ms)).padStart(4) + "ms";
  const url0 = location.href;
  say("openGame() — sheets " + paper() + ", frame hidden " + frame().hidden);
  window.__Finale.openGame();
  let peak = 0, coveredAt = 0, revealAt = 0, goneAt = 0;
  for (let i = 0; i < 300; i++) {
    await wait(40);
    const n = paper(), t = performance.now() - t0;
    if (n > peak) { peak = n; }
    if (!coveredAt && n > 3) coveredAt = t;
    if (!revealAt && !frame().hidden) revealAt = t;
    if (revealAt && !goneAt && n <= 1) goneAt = t;
    if (goneAt && t > goneAt + 500) break;
  }
  say("sheets flew: peak " + peak + "  first seen " + el(coveredAt));
  say("board put up (covered): " + el(revealAt));
  say("sheets all gone (exit done): " + el(goneAt));
  say("ORDER — board up before the paper leaves: " + (revealAt > 0 && revealAt < goneAt));
  say("url unchanged: " + (location.href === url0));
  try { const d = frame().contentDocument;
        say("board inside: " + /कहानी क्रम/.test(d.title) + ", cards " + d.querySelectorAll(".card").length); }
  catch (e) { say("frame read failed"); }
  say("END");
})();
