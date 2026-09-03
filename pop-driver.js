/* the three art cues exactly as the cue table now holds them, frozen at their
   settled frame (POP_IN done) using the real burst() geometry and CSS */
const POP_IN = 380, POP_OUT = 300, MIN_HOLD = 0.85;
const SHAPE = { crash: 1100/686, tub: 1100/686, splash: 1100/1047 };
const CUES = [
  [11, { art:"crash",  at:7.20,  out:8.70,  x:26, y:70, w:32 }],
  [ 9, { art:"tub",    at:7.75,  out:7.90,  x:38, y:56, w:28 }],
  [ 8, { art:"splash", at:13.45, out:14.20, x:64, y:64, w:23 }],
];
CUES.forEach(([page, cue]) => {
  const wrap = document.createElement("div");
  wrap.className = "book__frame";
  wrap.innerHTML = `<img class="bg" src="assets/images/page-${String(page).padStart(2,"0")}.jpg">`;
  const layer = document.createElement("div");
  layer.className = "popart";
  layer.style.cssText = "position:absolute;inset:0";
  wrap.appendChild(layer);

  const img = document.createElement("img");
  img.className = "popart__item";
  img.src = "assets/pop/" + cue.art + ".webp";
  img.style.aspectRatio = String(SHAPE[cue.art]);
  img.style.setProperty("--px", cue.x);
  img.style.setProperty("--py", cue.y);
  img.style.setProperty("--pw", cue.w);
  layer.appendChild(img);

  const total = POP_IN + Math.max(MIN_HOLD, (cue.out || cue.at) - cue.at) * 1000 + POP_OUT;
  const hold = total - POP_IN - POP_OUT;
  const at = (ms) => ms / total;
  const T = (s, r) => `translate(-50%, -50%) scale(${s}) rotate(${r}deg)`;
  const a = img.animate([
    { offset: 0, transform: T(0.30,-9), opacity: 0, easing: "cubic-bezier(.16,.9,.28,1.3)" },
    { offset: at(POP_IN*0.46), transform: T(1.14,2.4), opacity: 1, easing: "cubic-bezier(.36,0,.4,1)" },
    { offset: at(POP_IN*0.74), transform: T(0.955,-1.4), opacity: 1, easing: "cubic-bezier(.3,0,.2,1)" },
    { offset: at(POP_IN), transform: T(1,0), opacity: 1, easing: "linear" },
    { offset: at(POP_IN+hold), transform: T(1,0), opacity: 1, easing: "cubic-bezier(.5,0,.78,.1)" },
    { offset: 1, transform: T(0.52,-5), opacity: 0 },
  ], { duration: total, fill: "both" });
  a.pause(); a.currentTime = POP_IN + hold * 0.3;

  const tag = document.createElement("b");
  tag.textContent = `pg ${page} · ${cue.art} · at ${cue.at}s · x${cue.x} y${cue.y} w${cue.w} · total ${Math.round(total)}ms`;
  wrap.appendChild(tag);
  document.getElementById("b").appendChild(wrap);
});
