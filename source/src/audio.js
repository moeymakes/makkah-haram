// ============================================================================
// audio: procedural ambience of the Haram's open courtyard (no sample files, nothing recited)
// ============================================================================
// A fixed Web Audio graph built on the first click / key / touch and driven by a 10 Hz timer, not the frame loop
// (pattern from Abyssal Garden, MIT). Layers: wind bed with slow gusts, a distant city hum (loudest at night),
// air rush that follows the camera's speed, a soft drone, pigeon coos and small-bird chirps (dawn most, none at
// night). Each layer feeds its own bus, so the menu's presets only move bus levels; the choice and the volume
// are remembered. No adhan, talbiyah or recitation is synthesized.
let AC, OUT, BUS, muted = false;
const VOL = 0.7;
// per preset: wind, city hum, drone, small birds, pigeons, how often the birds call
const SOUNDS = [[1, 1, 1, 1, 1, 1], [1.5, 1.5, 0, 0, 0, 1], [.45, .6, .35, 1.6, 1.4, 2.2], [.6, .35, 1.8, .35, .5, .5], [0, 0, 0, 0, 0, 1]];
let sndPreset = 0, sndVol = .7;
try { const s = (localStorage.haramSound || '').split(','); if (s[0]) { sndPreset = +s[0] || 0; sndVol = s[1] === undefined ? .7 : +s[1]; } } catch {}
const masterLevel = () => (muted || sndPreset === 4 ? 0 : VOL * sndVol * 1.43);
function applySound(fade = .4) {
  keep('haramSound', [sndPreset, sndVol]);
  if (!AC) return;
  const t = AC.currentTime, L = SOUNDS[sndPreset];
  for (let i = 0; i < 5; i++) BUS[i].gain.setTargetAtTime(L[i], t, fade);
  OUT.gain.setTargetAtTime(masterLevel(), t, fade);
}
function mkSound(ac) {
  const sr = ac.sampleRate;
  const N = (C, o, ...to) => { const n = new C(ac, o); for (const d of to) n.connect(d); if (n.start) n.start(); return n; };
  const G = (gain, ...to) => N(GainNode, { gain }, ...to);
  const BQ = (type, frequency, Q, ...to) => N(BiquadFilterNode, { type, frequency, Q }, ...to);
  const lfo = (frequency, depth, to) => N(OscillatorNode, { frequency }, G(depth, to));
  const noise = (secs, f) => { const n = sr * secs | 0, b = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr }); f(b.getChannelData(0), n); f(b.getChannelData(1), n); return b; };
  // seamless brown noise loop and a white one (the ends cross-fade into the starts)
  const loop = (k) => noise(9, (d, n) => { for (let i = 0, b = 0; i < n + 4096; i++) { const w = rnd() * 2 - 1; b = k ? (b + 0.02 * w) / 1.02 : w * .3; const v = b * (k ? 3.5 : 1); if (i < n) d[i] = v; else { const t = (i - n) / 4096; d[i - n] = d[i - n] * t + v * (1 - t); } } });
  const nb = loop(1), nw = loop(0);
  const ir = noise(3, (d, n) => { for (let i = 0, b = 0; i < n; i++) { const t = i / sr; b += (rnd() * 2 - 1 - b) * (0.08 + 0.5 * exp(-t * 3)); d[i] = b * (1 - exp(-t * 40)) * exp(-t * 2.2) * (1 - i / n); } });
  const lim = N(DynamicsCompressorNode, { threshold: -6, knee: 6, ratio: 20, attack: 0.003, release: 0.3 }, ac.destination);
  const out = OUT = G(0, lim), wet = N(ConvolverNode, { buffer: ir }, out);
  const L = SOUNDS[sndPreset];
  BUS = [0, 1, 2, 3, 4].map((i) => G(L[i], out));
  const src = (buffer, playbackRate, ...to) => N(AudioBufferSourceNode, { buffer, loop: true, playbackRate }, ...to);
  // wind: low brown noise with two slow gust LFOs
  const wind = G(.28, BUS[0]);
  src(nb, 1, BQ('lowpass', 420, .6, wind)); lfo(.05, .12, wind.gain); lfo(.083, .08, wind.gain);
  // the city beyond the walls: low filtered noise with slow traffic swells, louder at night
  const hum = G([.05, .07, .16][TOD], BUS[1]); src(nb, .6, BQ('lowpass', 210, .7, hum), BQ('bandpass', 620, 1.2, G(.25, hum)));
  lfo(.031, [.015, .02, .05][TOD], hum.gain); lfo(.007, [.01, .015, .03][TOD], hum.gain);
  const rush = G(0, out), rushF = BQ('bandpass', 300, 0.8, rush); src(nb, .7, rushF);
  // drone: a quiet open fifth that slowly beats
  const pad = G(1, BUS[2], G(1.2, wet));
  [110, 164.81, 220, 329.63].forEach((f, i) => { const g = G(0.012 - i * 0.002, pad); N(OscillatorNode, { frequency: f }, g); N(OscillatorNode, { frequency: f + rr(0.04, 0.12) }, g); });
  const pool = (n, send, bus) => Array.from({ length: n }, () => { const p = N(StereoPannerNode, {}, bus, G(send, wet)), g = G(0, p); return { p, g, o: N(OscillatorNode, {}, g) }; });
  const chirp = pool(4, .25, BUS[3]), dove = pool(3, .5, BUS[4]);
  const play = (vs, t, f0, f1, dur, vol, att, pan) => {
    const v = vs.shift(), f = v.o.frequency, g = v.g.gain; vs.push(v);
    v.p.pan.setValueAtTime(pan, t);
    f.setValueAtTime(f0, t); f.exponentialRampToValueAtTime(f1, t + dur);
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(vol, t + att); g.setTargetAtTime(0, t + att, (dur - att) / 4);
  };
  let lt = ac.currentTime, tB = lt + 2, tD = lt + 4, lx = F[CX], ly = F[CY], lz = F[CZ];
  out.gain.setTargetAtTime(masterLevel(), lt, 1);
  return () => {
    const now = ac.currentTime, t = now + 0.05, dt = now - lt;
    if (dt <= 0) return;
    let v = hypot(F[CX] - lx, F[CY] - ly, F[CZ] - lz) / dt; if (v > 80) v = 0;
    lt = now; lx = F[CX]; ly = F[CY]; lz = F[CZ];
    rush.gain.setTargetAtTime(0.35 * pow(min(v / 40, 1), 1.2), t, 0.3); rushF.frequency.setTargetAtTime(240 + v * 12, t, 0.3);
    const near = hypot(F[CX], F[CZ]) < 120 && F[CY] < 40, rate = SOUNDS[sndPreset][5] * [1.6, .8, 0][TOD];
    if (rate > 0 && t > tB) { // a small bird: a burst of quick high chirps
      let tt = t; const pan = rr(-.8, .8), f = rr(2600, 4200);
      for (let n = 2 + rnd() * 5 | 0; n--;) { play(chirp, tt, f * rr(.9, 1.1), f * rr(1.2, 1.5), .07, rr(.012, .024) * (near ? 1 : .4), .005, pan); tt += rr(.08, .16); }
      tB = tt + rr(1.5, 7) / rate;
    }
    if (rate > 0 && t > tD) { // a pigeon: a throaty rolling coo, rising then falling, sometimes twice
      let tt = t; const pan = rr(-.7, .7), f = rr(230, 290);
      for (let n = 1 + (rnd() < .4); n--;) for (const [a, b, d] of [[.95, 1.12, .32], [1.1, .86, .5]]) { play(dove, tt, f * a, f * b, d, .026, d * .35, pan); tt += d + .06; }
      tD = tt + rr(4, 12) / rate;
    }
  };
}
function sound() {
  if (!AC) { AC = new AudioContext({ latencyHint: 'playback' }); setInterval(mkSound(AC), 100); }
  if (AC.state === 'suspended' && !document.hidden) AC.resume();
}
const mute = () => { muted = !muted; if (AC) OUT.gain.setTargetAtTime(masterLevel(), AC.currentTime, 0.08); };
document.addEventListener('visibilitychange', () => { if (AC) document.hidden ? AC.suspend() : AC.resume(); });
// menu: the Sound row (presets) and the volume slider
{
  const row = $('snd'), vol = $('vol');
  const lit = () => row.querySelectorAll('button').forEach((b, i) => { b.className = i === sndPreset ? 'on' : ''; });
  row.querySelectorAll('button').forEach((b, i) => { b.onclick = () => { sndPreset = i; lit(); sound(); applySound(); }; });
  vol.value = sndVol * 100;
  vol.oninput = () => { sndVol = vol.value / 100; sound(); applySound(.08); };
  lit();
}
