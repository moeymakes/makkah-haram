// ============================================================================
// renderer, camera and input (structure follows Abyssal Garden, MIT)
// ============================================================================
const $ = (id) => document.getElementById(id);
const canvas = $('c'), info = $('i'), body = document.body;
const rot = matchMedia('(orientation:portrait) and (pointer:coarse)');
let loaded = 0, dead;
// loading bar: each stage glides it on the compositor, so it keeps moving while this thread is busy
const say = (m, to, ms) => {
  if (!dead) $('s').textContent = m;
  const a = $('b').animate({ transform: [`scaleX(${loaded})`, `scaleX(${to})`] }, { duration: ms, fill: 'forwards', easing: 'cubic-bezier(.3,.5,.5,1)' });
  loaded = to;
  return new Promise((r) => { a.ready.then(() => setTimeout(r)); setTimeout(r, document.hidden ? 0 : 1e3); });
};
const fail = (m) => { throw new Error(m, { cause: 1 }); };
if (!navigator.gpu) fail('This scene needs WebGPU. Try a current Chrome or Edge.');
// some drivers (headless Linux Chrome among them) answer null to a high-performance request but give the GPU
// to a plain one
const adapter = (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })) || (await navigator.gpu.requestAdapter());
if (!adapter) fail('No WebGPU adapter found.');
$('w').hidden = !!navigator.userAgentData;
const hasTS = adapter.features.has('timestamp-query');
const device = await adapter.requestDevice({ requiredFeatures: hasTS ? ['timestamp-query'] : [], requiredLimits: { maxStorageBufferBindingSize: min(adapter.limits.maxStorageBufferBindingSize, 1 << 28), maxBufferSize: min(adapter.limits.maxBufferSize, 1 << 28) } });
device.addEventListener('uncapturederror', (e) => console.error('GPU: ' + e.error.message));
device.lost.then((l) => {
  if (l.reason === 'destroyed') return;
  if (LV < 2) { keep('haram', LV + 1); location.reload(); }
  dead = body.className = 'l e'; $('s').textContent = 'The graphics device was lost. Reload the page to try again.';
});
const ctx = canvas.getContext('webgpu'), FMT = navigator.gpu.getPreferredCanvasFormat();
const Q = device.queue, HDR = 'rgba16float', DEPTH = 'depth32float';
const TU = GPUTextureUsage, BU = GPUBufferUsage, SS = GPUShaderStage;
const mod = (code) => device.createShaderModule({ code });
const buf = (data, usage) => { const b = device.createBuffer({ size: max(4, (data.byteLength + 3) & ~3), usage: usage | BU.COPY_DST }); if (data.byteLength) Q.writeBuffer(b, 0, data.buffer || data, data.byteOffset || 0, data.byteLength); return b; };
const tex = (w, h, format, usage, o = {}) => device.createTexture({ size: [w, h, o.d || 1], format, usage, mipLevelCount: o.mips || 1, sampleCount: o.samples || 1, dimension: o.d ? '3d' : '2d' });

// ---------------------------------------------------------------- static resources
const sRep = device.createSampler({ addressModeU: 'repeat', addressModeV: 'repeat', magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: LV > 1 ? 1 : 8 });
const sClamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
const sCmp = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
const tShadow = tex(SHADOW, SHADOW, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
const tDummy = tex(1, 1, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
const tDetail = tex(1024, 1024, 'rgba8unorm', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, { mips: 11 });
const tFar = tex(FN, FN, 'rgba8unorm', TU.TEXTURE_BINDING | TU.COPY_DST);
// the Kiswah's belt text: one 4096 x 384 row per wall (+x, +z, -x, -z), white glyphs on clear, full mip chain
const KTW = 4096, KTH = 384, tKiswah = tex(KTW, KTH * 4, 'rgba8unorm', TU.TEXTURE_BINDING | TU.COPY_DST | TU.RENDER_ATTACHMENT, { mips: 13 });

const UB = new Float32Array(80), UBS = new Float32Array(80);
const ubo = device.createBuffer({ size: 320, usage: BU.UNIFORM | BU.COPY_DST }), uboS = device.createBuffer({ size: 320, usage: BU.UNIFORM | BU.COPY_DST });
const VF = SS.VERTEX | SS.FRAGMENT;
const bgl0 = device.createBindGroupLayout({ entries: [
  { binding: 0, visibility: VF, buffer: {} },
  { binding: 1, visibility: VF, sampler: {} }, { binding: 2, visibility: VF, sampler: {} }, { binding: 3, visibility: VF, sampler: { type: 'comparison' } },
  { binding: 4, visibility: VF, texture: { sampleType: 'depth' } }, { binding: 5, visibility: VF, texture: {} }, { binding: 8, visibility: VF, texture: {} }, { binding: 9, visibility: VF, texture: {} }] });
const mkBG0 = (u, sh) => device.createBindGroup({ layout: bgl0, entries: [
  { binding: 0, resource: { buffer: u } }, { binding: 1, resource: sRep }, { binding: 2, resource: sClamp }, { binding: 3, resource: sCmp },
  { binding: 4, resource: sh.createView() }, { binding: 5, resource: tDetail.createView() }, { binding: 8, resource: tFar.createView() }, { binding: 9, resource: tKiswah.createView() }] });
const bg0 = mkBG0(ubo, tShadow), bg0s = mkBG0(uboS, tDummy);
const pl0 = device.createPipelineLayout({ bindGroupLayouts: [bgl0] });

const bglBlit = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: SS.FRAGMENT, texture: {} }, { binding: 1, visibility: SS.FRAGMENT, sampler: {} }] });
const plBlit = device.createPipelineLayout({ bindGroupLayouts: [bglBlit] });
const mBlit = mod(W_BLIT);
const blitPipe = (entry, format, add) => device.createRenderPipeline({ layout: plBlit, vertex: { module: mBlit, entryPoint: 'vs' },
  fragment: { module: mBlit, entryPoint: entry, targets: [{ format, blend: add ? { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } } : undefined }] } });
const pMip8 = blitPipe('fsMip', 'rgba8unorm'), pDown0 = blitPipe('fsDown0', HDR), pDown = blitPipe('fsDown', HDR), pUp = blitPipe('fsUp', HDR, true);
const blitBG = (view) => device.createBindGroup({ layout: bglBlit, entries: [{ binding: 0, resource: view }, { binding: 1, resource: sClamp }] });
const colorAtt = (view, clear) => ({ view, loadOp: clear ? 'clear' : 'load', storeOp: 'store', clearValue: [0, 0, 0, 0] });

const A = (shaderLocation, offset, format) => ({ shaderLocation, offset, format });
const vbSolid = { arrayStride: 16, attributes: [A(0, 0, 'float32x3'), A(1, 12, 'snorm8x4')] };
const ibSolid = { arrayStride: 48, stepMode: 'instance', attributes: [A(2, 0, 'float32x4'), A(3, 16, 'float32x4'), A(4, 32, 'float32x4')] };
const ibAnim = { arrayStride: 32, stepMode: 'instance', attributes: [A(2, 0, 'float32x4'), A(3, 16, 'float32x4')] };
const ibMote = { arrayStride: 16, stepMode: 'instance', attributes: [A(0, 0, 'float32x4')] };

const scenePipe = (m, vsE, fsE, buffers, o = {}) => device.createRenderPipeline({ layout: pl0,
  vertex: { module: m, entryPoint: vsE, buffers, constants: o.constants },
  fragment: { module: m, entryPoint: fsE, targets: [{ format: HDR, blend: o.blend }, { format: 'r8unorm', writeMask: o.noA ? 0 : 15 }] },
  primitive: { topology: o.strip ? 'triangle-strip' : 'triangle-list', cullMode: o.cull || 'none' },
  depthStencil: { format: DEPTH, depthWriteEnabled: !o.blend, depthCompare: 'greater' }, multisample: { count: AA, alphaToCoverageEnabled: !!o.a2c && AA > 1 } });
const shadowPipe = (m, vsE, buffers, o = {}) => device.createRenderPipeline({ layout: pl0,
  vertex: { module: m, entryPoint: vsE, buffers, constants: o.constants },
  fragment: o.fs ? { module: m, entryPoint: o.fs, targets: [] } : undefined,
  primitive: { topology: o.strip ? 'triangle-strip' : 'triangle-list', cullMode: o.cull || 'none' },
  depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less', depthBias: 3, depthBiasSlopeScale: 3 } });

await say('Preparing the light…', 0.05, 300);
const mSolid = mod(W_SOLID), mAnim = mod(W_ANIM), mSky = mod(W_SKY), mSpr = mod(W_SPR);
const pSolid = scenePipe(mSolid, 'vs', 'fs', [vbSolid, ibSolid]);
const pBird = scenePipe(mAnim, 'vs', 'fs', [vbSolid, ibAnim], { noA: 1 });
const pSky = scenePipe(mSky, 'vs', 'fs', [], { strip: true, noA: 1 });
const ADD = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
const pMote = scenePipe(mSpr, 'vs', 'fs', [ibMote], { strip: true, blend: ADD, noA: 1 });
const pSolidSh = shadowPipe(mSolid, 'vs', [vbSolid, ibSolid]);
const mRays = mod(W_RAYS), mPost = mod(W_POST), mRB = mod(W_RBLUR);
const pRB = device.createRenderPipeline({ layout: 'auto', vertex: { module: mRB, entryPoint: 'vs' }, fragment: { module: mRB, entryPoint: 'fs', targets: [{ format: HDR }] } });
const pRays = device.createRenderPipeline({ layout: 'auto', vertex: { module: mRays, entryPoint: 'vs' }, fragment: { module: mRays, entryPoint: 'fs', targets: [{ format: HDR }] } });
const pPost = device.createRenderPipeline({ layout: 'auto', vertex: { module: mPost, entryPoint: 'vs' }, fragment: { module: mPost, entryPoint: 'fs', targets: [{ format: FMT }] } });
// GTAO + TAA on High and Medium (both have 4x MSAA); Low keeps the plain resolve
const TAA = LV < 2;
const fsPipe = (code, format) => { const m = mod(code); return device.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'vs' }, fragment: { module: m, entryPoint: 'fs', targets: [{ format }] } }); };
const pAO = TAA && fsPipe(W_AO, 'rg16float'), pAOB = TAA && fsPipe(W_AOB, 'rg16float'), pTAA = TAA && fsPipe(W_TAA, HDR);
// 8-phase Halton(2,3) sub-pixel jitter
const JIT = [];
for (let i = 1; i <= 8; i++) { const h = (b) => { let f = 1, r = 0, n = i; while (n) { f /= b; r += f * (n % b); n = floor(n / b); } return r; }; JIT.push(h(2) - 0.5, h(3) - 0.5); }
const PVP = new Float32Array(16);
let frameN = 0, histReset = 1, ping = 0, pcx = 0, pcy = 0, pcz = 0;

// ---------------------------------------------------------------- key light + shadow matrix over the Mataf and the arcades
{
  const L = SUN, lr = [L[2], 0, -L[0]], ll = hypot(...lr); lr[0] /= ll; lr[2] /= ll;
  const lu = [L[1] * lr[2] - L[2] * lr[1], L[2] * lr[0] - L[0] * lr[2], L[0] * lr[1] - L[1] * lr[0]];
  const ext = [[1e9, -1e9], [1e9, -1e9], [1e9, -1e9]];
  for (const x of [-118, 118]) for (const y of [0, 36]) for (const z of [-118, 118]) {
    const p = [x, y, z];
    [lr, lu, L].forEach((a, k) => { const d = p[0] * a[0] + p[1] * a[1] + p[2] * a[2]; ext[k][0] = min(ext[k][0], d); ext[k][1] = max(ext[k][1], d); });
  }
  const m = UBS, hx = (ext[0][1] - ext[0][0]) / 2, cx = (ext[0][1] + ext[0][0]) / 2, hy = (ext[1][1] - ext[1][0]) / 2, cy = (ext[1][1] + ext[1][0]) / 2;
  const d0 = ext[2][0] - 5, d1 = ext[2][1] + 120, dd = d1 - d0;
  m[0] = lr[0] / hx; m[4] = lr[1] / hx; m[8] = lr[2] / hx; m[12] = -cx / hx;
  m[1] = lu[0] / hy; m[5] = lu[1] / hy; m[9] = lu[2] / hy; m[13] = -cy / hy;
  m[2] = -L[0] / dd; m[6] = -L[1] / dd; m[10] = -L[2] / dd; m[14] = d1 / dd;
  m[3] = 0; m[7] = 0; m[11] = 0; m[15] = 1;
  for (let i = 0; i < 16; i++) { UBS[16 + i] = m[i]; UB[16 + i] = m[i]; }
  for (let i = 0; i < 3; i++) { UB[48 + i] = UBS[48 + i] = SUN[i]; }
  UBS[32] = 0; UBS[33] = 300; UBS[34] = 0; UBS[35] = 0; UBS[58] = 1;
}

// ---------------------------------------------------------------- world generation
await say('Laying the marble…', 0.2, 1000);
keep('haramLoad', 1);
addEventListener('pagehide', () => keep('haramLoad', ''));
// the ground model on the GPU, read back: [height, basalt, granite, wadi] and [city, groves] per grid point
const pGround = device.createComputePipeline({ layout: 'auto', compute: { module: mod(W_GROUND), entryPoint: 'main' } });
async function ground(n, ox, oz, cell) {
  const u = new ArrayBuffer(32), uu = new Uint32Array(u), uf = new Float32Array(u);
  uu[0] = n; uu[1] = n; uf[4] = ox; uf[5] = oz; uf[6] = cell;
  const size = n * n * 16, bu = buf(new Uint8Array(u), BU.UNIFORM);
  const ba = device.createBuffer({ size, usage: BU.STORAGE | BU.COPY_SRC }), bb = device.createBuffer({ size, usage: BU.STORAGE | BU.COPY_SRC });
  const ra = device.createBuffer({ size, usage: BU.MAP_READ | BU.COPY_DST }), rb = device.createBuffer({ size, usage: BU.MAP_READ | BU.COPY_DST });
  const e = device.createCommandEncoder(), c = e.beginComputePass();
  c.setPipeline(pGround); c.setBindGroup(0, device.createBindGroup({ layout: pGround.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bu } }, { binding: 1, resource: { buffer: ba } }, { binding: 2, resource: { buffer: bb } }] }));
  c.dispatchWorkgroups(n / 8, n / 8); c.end();
  e.copyBufferToBuffer(ba, 0, ra, 0, size); e.copyBufferToBuffer(bb, 0, rb, 0, size);
  Q.submit([e.finish()]);
  await Promise.all([ra.mapAsync(GPUMapMode.READ), rb.mapAsync(GPUMapMode.READ)]);
  const out = { A: new Float32Array(ra.getMappedRange().slice(0)), B: new Float32Array(rb.getMappedRange().slice(0)) };
  ra.destroy(); rb.destroy(); ba.destroy(); bb.destroy();
  return out;
}
const FAR = await ground(FN, FO, FO, FC);

const FLYN = FLY.length / 6, FLYT = 60, LUTN = 1024, flyLUT = new Float32Array(LUTN + 1);
const flyPts = [];
const F = new Float64Array(32), P6 = new Float64Array(6);
const CX = 0, CY = 1, CZ = 2, YAW = 3, PIT = 4, FX = 5, FY = 6, FZ = 7, RX = 8, RZ = 9, UX = 10, UY = 11, UZ = 12, VX = 13, VY = 14, VZ = 15, TIME = 16, FLT = 17, LAST = 18, GPU = 19, HUDT = 20, SPL = 21;
function aim() {
  const dx = P6[3] - P6[0], dy = P6[4] - P6[1], dz = P6[5] - P6[2];
  F[CX] = P6[0]; F[CY] = P6[1]; F[CZ] = P6[2];
  F[YAW] = atan2(dx, -dz); F[PIT] = atan2(dy, sqrt(dx * dx + dz * dz));
}
const lookAt = (x, y, z, tx, ty, tz) => { P6[0] = x; P6[1] = y; P6[2] = z; P6[3] = tx; P6[4] = ty; P6[5] = tz; aim(); };
function flyRaw() {
  const s = F[SPL]; let i = floor(s) | 0; if (i > FLYN - 2) i = FLYN - 2;
  const u = s - i, i0 = (i > 0 ? i - 1 : 0) * 6, i1 = i * 6, i2 = (i + 1) * 6, i3 = (i + 2 < FLYN ? i + 2 : FLYN - 1) * 6;
  for (let o = 0; o < 6; o++) {
    const a = FLY[i0 + o], b = FLY[i1 + o], c = FLY[i2 + o], d = FLY[i3 + o];
    P6[o] = 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
  }
  aim();
}
{
  const M = 4096, len = new Float32Array(M + 1); let px = 0, py = 0, pz = 0;
  for (let k = 0; k <= M; k++) { F[SPL] = k / M * (FLYN - 1); flyRaw(); if (k) len[k] = len[k - 1] + hypot(F[CX] - px, F[CY] - py, F[CZ] - pz); px = F[CX]; py = F[CY]; pz = F[CZ]; }
  for (let k = 0, j = 0; k <= LUTN; k++) { const d = k / LUTN * len[M]; while (j < M - 1 && len[j + 1] < d) j++; flyLUT[k] = (j + (d - len[j]) / max(len[j + 1] - len[j], 1e-6)) / M * (FLYN - 1); }
}
function flyAt() {
  let s = F[FLT] / FLYT; s = s < 0 ? 0 : s > 1 ? 1 : s; s = s * s * (3 - 2 * s) * 0.25 + s * 0.75;
  s *= LUTN; let k = floor(s) | 0; if (k > LUTN - 1) k = LUTN - 1;
  F[SPL] = flyLUT[k] + (flyLUT[k + 1] - flyLUT[k]) * (s - k); flyRaw();
}
for (let t = 0; t <= FLYT; t += 0.1) { F[FLT] = t; flyAt(); flyPts.push([F[CX], F[CY], F[CZ]]); }

await say('Raising the arcades…', 0.55, 2000);
const Wd = makeWorld(FAR, flyPts);
for (const p of POSES) if (!p[6]) p[1] += Wd.gy(p[0], p[2]);
const fh = Wd.fh;
await say('Lighting the lamps…', 0.8, 1200);
const far = buildFar(fh);
const meshes = [...Wd.meshes, meshBird()].map((m) => m.build());
let nV = 0, nI = 0;
for (const m of meshes) { m.v0 = nV; m.i0 = nI; nV += m.nv; nI += m.ib.length; }
const allV = new Uint8Array(nV * 16), allI = new Uint32Array(nI);
for (const m of meshes) { allV.set(new Uint8Array(m.vb), m.v0 * 16); allI.set(m.ib, m.i0); }
const vbMesh = buf(allV, BU.VERTEX), ibMesh = buf(allI, BU.INDEX);
const vbFar = buf(new Uint8Array(far.vb), BU.VERTEX), ibFar = buf(far.ib, BU.INDEX), nFarI = far.ib.length;
const NSOL = Wd.meshes.length, nSolid = Wd.solids.data.length / 12;
const solidData = new Float32Array((nSolid + 1) * 12); solidData.set(Wd.solids.data);
solidData.set([0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0], nSolid * 12);
const ibSolids = buf(solidData, BU.VERTEX);
const ibBirds = buf(Wd.birds, BU.VERTEX), nBirds = Wd.birds.length / 8, ibMotes = buf(Wd.motes, BU.VERTEX), nMotes = Wd.motes.length / 4;
const BIRD = meshes[NSOL];
Q.writeTexture({ texture: tFar }, Wd.fmap, { bytesPerRow: FN * 4 }, [FN, FN]);
const shadowCast = []; for (let i = 0; i < NSOL; i++) if (!Wd.farIds.has(i) && i > 0) shadowCast.push(i);

// ---------------------------------------------------------------- bakes: detail texture and the shadow map, once
{
  const m = mod(W_DETAIL), p = device.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'vs' }, fragment: { module: m, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] } });
  const e = device.createCommandEncoder();
  let r = e.beginRenderPass({ colorAttachments: [colorAtt(tDetail.createView({ baseMipLevel: 0, mipLevelCount: 1 }), true)] });
  r.setPipeline(p); r.draw(3); r.end();
  for (let i = 1; i < 11; i++) {
    r = e.beginRenderPass({ colorAttachments: [colorAtt(tDetail.createView({ baseMipLevel: i, mipLevelCount: 1 }), true)] });
    r.setPipeline(pMip8); r.setBindGroup(0, blitBG(tDetail.createView({ baseMipLevel: i - 1, mipLevelCount: 1 }))); r.draw(3); r.end();
  }
  Q.submit([e.finish()]);
}
// the belt text: the browser shapes the Arabic (joining, marks, ligatures) with an embedded font, so every device
// draws the same glyphs; the verses are laid out in one to three justified lines, whichever gives the largest type
{
  const ff = new FontFace('KiswahNaskh', Uint8Array.from(atob(KISWAH_FONT), (c) => c.charCodeAt(0)).buffer);
  await ff.load(); document.fonts.add(ff);
  const cv = new OffscreenCanvas(KTW, KTH * 4), g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.direction = 'rtl'; g.textAlign = 'right'; g.textBaseline = 'middle';
  const LH = 1.3;
  KISWAH_BELT.forEach((t, row) => {
    // a pause mark is a word of its own in the text, set over the space after a word; draw it on that word's end, as a
    // printed mushaf does, so it stays inside the band and no line starts with one (the letters are unchanged)
    const words = []; for (const w of t.split(' ')) { if (/^[ۖ-ۭ]+$/.test(w) && words.length) words[words.length - 1] += w; else words.push(w); }
    const asp = row & 1 ? 5.2 / 6 : 1, W = KTW * .95 * asp, H = KTH * .86;
    g.font = '100px KiswahNaskh'; const w100 = g.measureText(words.join(' ')).width;
    let n = 1, px = 0;
    for (let k = 1; k <= 3; k++) { const p = Math.min(W * k / w100 * 100 * .93, H / (k * LH)); if (p > px) { px = p; n = k; } }
    g.font = `${px.toFixed(1)}px KiswahNaskh`;
    // the split into n lines whose longest line is shortest
    const wid = (a, b) => g.measureText(words.slice(a, b).join(' ')).width, N = words.length;
    let best = [N], bw = wid(0, N);
    if (n === 2) for (let a = 1; a < N; a++) { const m = Math.max(wid(0, a), wid(a, N)); if (m < bw) { bw = m; best = [a, N]; } }
    if (n === 3) for (let a = 1; a < N - 1; a++) for (let b = a + 1; b < N; b++) { const m = Math.max(wid(0, a), wid(a, b), wid(b, N)); if (m < bw) { bw = m; best = [a, b, N]; } }
    const lines = []; let a0 = 0; for (const b of best) { lines.push(words.slice(a0, b)); a0 = b; }
    lines.forEach((ln, i) => {
      const s = ln.join(' '), lw = g.measureText(s).width, gaps = ln.length - 1;
      g.save(); g.translate(KTW / 2, KTH * (row + .5) + (i - (lines.length - 1) / 2) * px * LH + px * .08); g.scale(1 / asp, 1);
      // justify every line to the same width, as the belt's lines are
      if ('wordSpacing' in g) g.wordSpacing = gaps ? `${Math.min((bw - lw) / gaps, px * .8)}px` : '0px';
      const fw = g.measureText(s).width; g.fillText(s, fw / 2, 0); g.restore();
    });
  });
  Q.copyExternalImageToTexture({ source: cv }, { texture: tKiswah }, [KTW, KTH * 4]);
  const e = device.createCommandEncoder();
  for (let i = 1; i < 13; i++) {
    const r = e.beginRenderPass({ colorAttachments: [colorAtt(tKiswah.createView({ baseMipLevel: i, mipLevelCount: 1 }), true)] });
    r.setPipeline(pMip8); r.setBindGroup(0, blitBG(tKiswah.createView({ baseMipLevel: i - 1, mipLevelCount: 1 }))); r.draw(3); r.end();
  }
  Q.submit([e.finish()]);
}
const passShadow = { colorAttachments: [], depthStencilAttachment: { view: tShadow.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } };
function drawShadow(e) {
  Q.writeBuffer(uboS, 0, UBS);
  const r = e.beginRenderPass(passShadow);
  r.setBindGroup(0, bg0s);
  r.setPipeline(pSolidSh); r.setVertexBuffer(0, vbMesh); r.setVertexBuffer(1, ibSolids); r.setIndexBuffer(ibMesh, 'uint32');
  for (const i of shadowCast) { const g = Wd.solids.ranges[i]; if (g[1]) r.drawIndexed(meshes[i].ib.length, g[1], meshes[i].i0, meshes[i].v0, g[0]); }
  r.end();
}
Wd.fmap = 0;

// ---------------------------------------------------------------- render targets (rebuilt on resize)
const PIXMAX = 2560 * 1440, PIXMIN = mob ? 25e4 : 5e5, DETMIN = 0.4;
let Wpx = 0, Hpx = 0, DW = 0, DH = 0, pix = +SV[1] || (LV > 1 ? 41e4 : mob ? 1280 * 720 : PIXMAX), det = +SV[2] || 1, dynN = 0, dynT = 0, dynG = 0, dynGN = 0, dynBad = 0, dynOk = 0, dynWait = 3;
let passScene, passRays, passBlur, bgBlur, passPost, bgRays, bgPost, bloomPass = [], bloomBG = [], targets = [], passAO, passAOB, bgAO, bgAOB, passTAA = [], bgTAA = [], bgPostT = [], bloomBG0 = [];
const NB = 6;
function resize() {
  DW = max(2, round(canvas.clientWidth * devicePixelRatio)); DH = max(2, round(canvas.clientHeight * devicePixelRatio));
  const s = min(1, sqrt(pix / (DW * DH)));
  const w = max(2, round(DW * s) & ~1), h = max(2, round(DH * s) & ~1);
  if (w === Wpx && h === Hpx) return;
  dynN = dynG = dynGN = 0; dynT = dynT === -Infinity ? dynT : -300;
  Wpx = w; Hpx = h; canvas.width = Wpx; canvas.height = Hpx;
  ctx.configure({ device, format: FMT, alphaMode: 'opaque' });
  for (const t of targets) t.destroy();
  const tMS = tex(AA > 1 ? Wpx : 1, Hpx, HDR, TU.RENDER_ATTACHMENT, { samples: AA }), tDp = tex(Wpx, Hpx, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, { samples: AA });
  const tRes = tex(Wpx, Hpx, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING), tRay = tex(Wpx / 2, Hpx / 2, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING), tRay2 = tex(Wpx / 2, Hpx / 2, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
  const tAmbMS = tex(AA > 1 ? Wpx : 1, Hpx, 'r8unorm', TU.RENDER_ATTACHMENT, { samples: AA }), tAmb = tex(Wpx, Hpx, 'r8unorm', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
  targets = [tMS, tDp, tRes, tRay, tRay2, tAmbMS, tAmb];
  const bl = [];
  for (let i = 0; i < NB; i++) { const t = tex(max(1, Wpx >> (i + 1)), max(1, Hpx >> (i + 1)), HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING); bl.push(t); targets.push(t); }
  const vDp = tDp.createView(), vRes = tRes.createView(), vRay = tRay.createView(), vRay2 = tRay2.createView(), vBl = bl.map((t) => t.createView());
  passScene = { colorAttachments: [{ view: AA > 1 ? tMS.createView() : vRes, resolveTarget: AA > 1 ? vRes : undefined, loadOp: 'clear', storeOp: AA > 1 ? 'discard' : 'store', clearValue: [0, 0, 0, 1] },
    { view: AA > 1 ? tAmbMS.createView() : tAmb.createView(), resolveTarget: AA > 1 ? tAmb.createView() : undefined, loadOp: 'clear', storeOp: AA > 1 ? 'discard' : 'store', clearValue: [0, 0, 0, 0] }],
    depthStencilAttachment: { view: vDp, depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'store' } };
  passRays = { colorAttachments: [colorAtt(vRay, true)] };
  passBlur = { colorAttachments: [colorAtt(vRay2, true)] };
  bgBlur = device.createBindGroup({ layout: pRB.getBindGroupLayout(0), entries: [{ binding: 0, resource: vRay }] });
  passPost = { colorAttachments: [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] };
  bgRays = device.createBindGroup({ layout: pRays.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }, { binding: 1, resource: sCmp },
    { binding: 2, resource: tShadow.createView() }, { binding: 3, resource: vDp }] });
  bgPost = device.createBindGroup({ layout: pPost.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }, { binding: 1, resource: sClamp }, { binding: 2, resource: vRes },
    { binding: 3, resource: vRay2 }, { binding: 4, resource: vBl[0] }, { binding: 5, resource: vDp }] });
  bloomPass = []; bloomBG = [];
  for (let i = 0; i < NB; i++) { bloomPass.push({ colorAttachments: [colorAtt(vBl[i], true)] }); bloomBG.push(blitBG(i ? vBl[i - 1] : vRes)); }
  if (TAA) {
    const tAO = tex(Wpx / 2, Hpx / 2, 'rg16float', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING), tAO2 = tex(Wpx / 2, Hpx / 2, 'rg16float', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
    const tH = [0, 1].map(() => tex(Wpx, Hpx, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING)), vH = tH.map((t) => t.createView());
    targets.push(tAO, tAO2, ...tH);
    passAO = { colorAttachments: [colorAtt(tAO.createView(), true)] }; passAOB = { colorAttachments: [colorAtt(tAO2.createView(), true)] };
    bgAO = device.createBindGroup({ layout: pAO.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }, { binding: 1, resource: vDp }] });
    bgAOB = device.createBindGroup({ layout: pAOB.getBindGroupLayout(0), entries: [{ binding: 0, resource: tAO.createView() }] });
    // ping k writes history k from history 1 - k; bloom and the composite then read history k
    for (let k = 0; k < 2; k++) {
      passTAA[k] = { colorAttachments: [colorAtt(vH[k], true)] };
      bgTAA[k] = device.createBindGroup({ layout: pTAA.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }, { binding: 1, resource: sClamp }, { binding: 2, resource: vRes },
        { binding: 3, resource: tAmb.createView() }, { binding: 4, resource: tAO2.createView() }, { binding: 5, resource: vDp }, { binding: 6, resource: vH[1 - k] }] });
      bgPostT[k] = device.createBindGroup({ layout: pPost.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }, { binding: 1, resource: sClamp }, { binding: 2, resource: vH[k] },
        { binding: 3, resource: vRay2 }, { binding: 4, resource: vBl[0] }, { binding: 5, resource: vDp }] });
      bloomBG0[k] = blitBG(vH[k]);
    }
    histReset = 1;
  }
  for (let i = NB - 1; i > 0; i--) { bloomPass.push({ colorAttachments: [colorAtt(vBl[i - 1], false)] }); bloomBG.push(blitBG(vBl[i])); }
  UB[52] = Wpx; UB[53] = Hpx; UB[54] = 1 / Wpx; UB[55] = 1 / Hpx;
}
resize();
addEventListener('resize', resize);

// ---------------------------------------------------------------- timing (GPU timestamp queries)
let qs, qResolve, qRead = [], tsBegin, tsEnd;
if (hasTS) {
  qs = device.createQuerySet({ type: 'timestamp', count: 2 });
  qResolve = device.createBuffer({ size: 16, usage: BU.QUERY_RESOLVE | BU.COPY_SRC });
  for (let i = 0; i < 6; i++) {
    const b = device.createBuffer({ size: 16, usage: BU.MAP_READ | BU.COPY_DST });
    const o = { b, busy: false, done: null };
    o.done = () => {
      const a = new BigInt64Array(b.getMappedRange());
      const ms = Number(a[1] - a[0]) / 1e6; F[GPU] = ms; b.unmap(); o.busy = false;
      if (dynT > 0 && ms > 0 && ms < 1e3) { dynG += ms; dynGN++; }
    };
    qRead.push(o);
  }
  tsBegin = { querySet: qs, beginningOfPassWriteIndex: 0 }; tsEnd = { querySet: qs, endOfPassWriteIndex: 1 };
}

let shadowDirty = 1;

// ---------------------------------------------------------------- frame
let hud = false, fly = false;
let kf = 0, kb = 0, kl = 0, kr = 0, ku = 0, kd = 0, ks = 0, mdx = 0, mdy = 0, lkx = 0, lky = 0, l2x = 0, l2y = 0, hN = 0, hMax = 0, hMin = 1e9, hPer = 1e9, hLate = 0, hTot = 0, tId = -1, tN = 0, tx0 = 0, ty0 = 0, tx = 0, ty = 0;
const TANH = 0.58, NEAR_ = 0.1, EXPO = TD.expo, RAYS = TD.rays;
const submitList = [null];
function render() {
  const cx = F[CX], cy = F[CY], cz = F[CZ], pitch = F[PIT], yaw = F[YAW];
  const cp = cos(pitch), fy = sin(pitch), rx = cos(yaw), rz = sin(yaw), fx = cp * rz, fz = -cp * rx;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  F[FX] = fx; F[FY] = fy; F[FZ] = fz; F[RX] = rx; F[RZ] = rz; F[UX] = ux; F[UY] = uy; F[UZ] = uz;
  const asp = Wpx / Hpx, sx = 1 / (TANH * asp), sy = 1 / TANH, m = UB;
  m[0] = rx * sx; m[4] = 0; m[8] = rz * sx; m[12] = -(rx * cx + rz * cz) * sx;
  m[1] = ux * sy; m[5] = uy * sy; m[9] = uz * sy; m[13] = -(ux * cx + uy * cy + uz * cz) * sy;
  m[2] = 0; m[6] = 0; m[10] = 0; m[14] = NEAR_;
  m[3] = fx; m[7] = fy; m[11] = fz; m[15] = -(fx * cx + fy * cy + fz * cz);
  m[32] = cx; m[33] = cy; m[34] = cz; m[35] = F[TIME];
  m[36] = rx; m[37] = 0; m[38] = rz; m[39] = TANH * asp;
  m[40] = ux; m[41] = uy; m[42] = uz; m[43] = TANH;
  m[44] = fx; m[45] = fy; m[46] = fz; m[47] = NEAR_;
  m[56] = EXPO; m[57] = RAYS; m[58] = det; m[59] = 0;
  if (TAA) {
    // the history is reprojected with last frame's unjittered matrix, then this frame's matrix is jittered
    if ((cx - pcx) ** 2 + (cy - pcy) ** 2 + (cz - pcz) ** 2 > 2500) histReset = 1;
    pcx = cx; pcy = cy; pcz = cz;
    for (let i = 0; i < 16; i++) { m[60 + i] = histReset ? m[i] : PVP[i]; PVP[i] = m[i]; }
    const j = (frameN & 7) * 2, jx = JIT[j] / Wpx, jy = JIT[j + 1] / Hpx;
    for (let c = 0; c < 4; c++) { m[c * 4] += jx * m[c * 4 + 3]; m[c * 4 + 1] += jy * m[c * 4 + 3]; }
    m[76] = jx; m[77] = jy; m[78] = histReset; m[79] = frameN & 1023;
    histReset = 0; frameN++; ping ^= 1;
  }
  Q.writeBuffer(ubo, 0, UB);

  const e = device.createCommandEncoder();
  if (shadowDirty) { drawShadow(e); shadowDirty = 0; }
  let slot = null;
  if (hasTS) { for (let i = 0; i < qRead.length; i++) if (!qRead[i].busy) { slot = qRead[i]; break; } }
  passScene.timestampWrites = slot ? tsBegin : undefined;
  passPost.timestampWrites = slot ? tsEnd : undefined;
  let r = e.beginRenderPass(passScene);
  r.setBindGroup(0, bg0);
  r.setPipeline(pSolid); r.setVertexBuffer(1, ibSolids);
  r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
  for (let i = 0; i < NSOL; i++) { const g = Wd.solids.ranges[i]; if (g[1]) r.drawIndexed(meshes[i].ib.length, g[1], meshes[i].i0, meshes[i].v0, g[0]); }
  r.setVertexBuffer(0, vbFar); r.setIndexBuffer(ibFar, 'uint32'); r.drawIndexed(nFarI, 1, 0, 0, nSolid);
  // pigeons roost at night
  if (!NIGHT) { r.setPipeline(pBird); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32'); r.setVertexBuffer(1, ibBirds); r.drawIndexed(BIRD.ib.length, nBirds, BIRD.i0, BIRD.v0, 0); }
  r.setPipeline(pSky); r.draw(4);
  if (!NIGHT) { r.setPipeline(pMote); r.setVertexBuffer(0, ibMotes); r.draw(4, nMotes); }
  r.end();
  if (TAA) {
    r = e.beginRenderPass(passAO); r.setPipeline(pAO); r.setBindGroup(0, bgAO); r.draw(3); r.end();
    r = e.beginRenderPass(passAOB); r.setPipeline(pAOB); r.setBindGroup(0, bgAOB); r.draw(3); r.end();
    r = e.beginRenderPass(passTAA[ping]); r.setPipeline(pTAA); r.setBindGroup(0, bgTAA[ping]); r.draw(3); r.end();
  }
  if (RAYS) {
    r = e.beginRenderPass(passRays); r.setPipeline(pRays); r.setBindGroup(0, bgRays); r.draw(3); r.end();
    r = e.beginRenderPass(passBlur); r.setPipeline(pRB); r.setBindGroup(0, bgBlur); r.draw(3); r.end();
  }
  for (let i = 0; i < bloomPass.length; i++) {
    r = e.beginRenderPass(bloomPass[i]); r.setPipeline(i === 0 ? pDown0 : i < NB ? pDown : pUp); r.setBindGroup(0, TAA && !i ? bloomBG0[ping] : bloomBG[i]); r.draw(3); r.end();
  }
  passPost.colorAttachments[0].view = ctx.getCurrentTexture().createView();
  r = e.beginRenderPass(passPost); r.setPipeline(pPost); r.setBindGroup(0, TAA ? bgPostT[ping] : bgPost); r.draw(3); r.end();
  if (slot) { e.resolveQuerySet(qs, 0, 2, qResolve, 0); e.copyBufferToBuffer(qResolve, 0, slot.b, 0, 16); }
  submitList[0] = e.finish();
  Q.submit(submitList);
  if (slot) { slot.busy = true; slot.b.mapAsync(GPUMapMode.READ).then(slot.done); }
}

// ---------------------------------------------------------------- collision: boxes and upright cylinders
// Everything near the Kaaba is laid out in its frame, so collision runs there: the body is the segment from the
// feet to just above the eyes (walking) or a ball round the camera (flying), pushed out along the shallowest axis,
// which makes it slide along walls and stand on what it lands on.
const CB = Wd.CB, CC = Wd.CC, NCB = CB.length / 6, NCC = CC.length / 4, BR = 0.45;
let grounded = false;
function collide() {
  let lx = S2 * (F[CX] - F[CZ]), lz = S2 * (F[CX] + F[CZ]);
  const y0 = fly ? F[CY] - BR : F[CY] - 1.35, y1 = F[CY] + .2;
  for (let i = 0; i < NCC; i++) {
    const o = i * 4; if (y0 > CC[o + 3]) continue;
    const dx = lx - CC[o], dz = lz - CC[o + 1], d = sqrt(dx * dx + dz * dz), r = CC[o + 2] + BR;
    if (d < r && d > 1e-6) { lx += dx / d * (r - d); lz += dz / d * (r - d); }
  }
  for (let i = 0; i < NCB; i++) {
    const o = i * 6, x0 = CB[o] - BR, x1 = CB[o + 1] + BR, z0 = CB[o + 4] - BR, z1 = CB[o + 5] + BR;
    if (lx <= x0 || lx >= x1 || lz <= z0 || lz >= z1 || y0 >= CB[o + 3] || y1 <= CB[o + 2]) continue;
    const px0 = lx - x0, px1 = x1 - lx, pz0 = lz - z0, pz1 = z1 - lz, py = fly ? CB[o + 3] + BR - F[CY] : 1e9;
    const m = min(px0, px1, pz0, pz1, py);
    if (m === py) { F[CY] += py; if (F[VY] < 0) F[VY] = 0; }
    else if (m === px0) lx = x0; else if (m === px1) lx = x1; else if (m === pz0) lz = z0; else lz = z1;
  }
  F[CX] = S2 * (lx + lz); F[CZ] = S2 * (lz - lx);
  const fl = fly ? 1 : 1.7;
  if (F[CY] <= fl) { F[CY] = fl; if (F[VY] < 0) F[VY] = 0; grounded = true; } else grounded = false;
}

let flyHold = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dtr = now - F[LAST]; F[LAST] = now;
  let dt = dtr / 1000; if (dt > 0.1) dt = 0.1;
  // dynamic resolution for 60 fps: every second (0.4 s behind the menu) scale the load by k
  if (dtr < 1e3 && (dynT += dtr) > 0 && (dynN++, dynT > (menu ? 1000 : 1000))) {
    const a = dynT / dynN, g = dynGN ? dynG / dynGN : 0; let k = 1;
    if (g) { if (g > 13.6 || g < 9.8) k = 11.7 / g; }
    else if (a > 17.6) { dynOk = 0; if (++dynBad > 1) { k = 15 / a; dynBad = 0; dynWait = min(dynWait * 2, 60); } }
    else { dynBad = 0; if (a < 12.5) k = 15 / a; else if (++dynOk > dynWait) { k = 1.17; dynOk = 0; } }
    if (abs(k - 1) < .12) k = 1; // small corrections are not worth a resize hitch
    k = k < 0.5 ? 0.5 : k > 1.7 ? 1.7 : k; const top = min(PIXMAX, DW * DH), mid = max(top / 2, PIXMIN), was = pix + det;
    if (k < 1 ? pix > mid || det <= DETMIN : pix < mid || det >= 1) {
      const end = k < 1 ? (det > DETMIN ? mid : PIXMIN) : det < 1 ? mid : top;
      pix *= k; if (k < 1 ? pix < end : pix > end) pix = end;
    } else { det *= sqrt(k); det = det < DETMIN ? DETMIN : det > 1 ? 1 : det; }
    if (was !== pix + det) keep('haram', [LV, pix < top ? pix | 0 : '', det]);
    dynN = dynT = dynG = dynGN = 0; resize();
  }
  F[TIME] += dt;
  {
    if (tId >= 0) {
      const tr = 4 / (innerWidth < innerHeight ? innerWidth : innerHeight); let jx = (tx - tx0) * tr, jy = (ty - ty0) * tr;
      jx = jx > 1 ? 1 : jx < -1 ? -1 : jx; jy = jy > 1 ? 1 : jy < -1 ? -1 : jy;
      lkx += jx * 1.5 * dt; lky += jy * dt;
    }
    // mouse look through two cascaded low-pass stages
    const kq = 1 - exp(-dt * 30); lkx += mdx * 0.0022; lky += mdy * 0.0022; mdx = 0; mdy = 0;
    const ax = lkx * kq, ay = lky * kq; lkx -= ax; lky -= ay; l2x += ax; l2y += ay;
    const dyw = l2x * kq, dpt = l2y * kq; l2x -= dyw; l2y -= dpt;
    const yaw = F[YAW] + dyw; let pitch = F[PIT] - dpt; pitch = pitch < -1.5 ? -1.5 : pitch > 1.5 ? 1.5 : pitch;
    const run = ks || tN > 1, mf = tId >= 0 ? 0.7 : kf - kb, mr = kr - kl, cp = cos(pitch), sy = sin(yaw), cw = cos(yaw);
    let vx, vy, vz;
    if (fly) {
      // holding a direction builds speed over 3 s to 2.5 times, so short moves stay precise and long flights are quick
      flyHold = mf || mr || ku || kd ? flyHold + dt : 0;
      const sp = (run ? 110 : 32) * (1 + 1.5 * min(flyHold / 3, 1)), k = 1 - exp(-dt * 3), mu = ku - kd;
      vx = F[VX] + ((sy * cp * mf + cw * mr) * sp - F[VX]) * k; vy = F[VY] + ((sin(pitch) * mf + mu) * sp - F[VY]) * k; vz = F[VZ] + ((-cw * cp * mf + sy * mr) * sp - F[VZ]) * k;
    } else {
      const sp = run ? 8 : 3.2, k = 1 - exp(-dt * 7), l = hypot(mf, mr) || 1, f2 = mf / max(l, 1), r2 = mr / max(l, 1);
      vx = F[VX] + ((sy * f2 + cw * r2) * sp - F[VX]) * k; vz = F[VZ] + ((-cw * f2 + sy * r2) * sp - F[VZ]) * k; vy = max(F[VY] - 22 * dt, -40);
    }
    let x = F[CX] + vx * dt, y = F[CY] + vy * dt, z = F[CZ] + vz * dt;
    // walking stays on the Mataf and in the Ottoman aisles; flying stays within sight of the Kaaba
    if (fly) { const rad = hypot(x, z); if (rad > FLYR) { x *= FLYR / rad; z *= FLYR / rad; } if (y > FLYH) y = FLYH; }
    else { const lx = clamp(S2 * (x - z), -SAX + .6, SAX - .6), lz = clamp(S2 * (x + z), -SAZ + .6, SAZ - .6); x = S2 * (lx + lz); z = S2 * (lz - lx); }
    F[YAW] = yaw; F[PIT] = pitch; F[VX] = vx; F[VY] = vy; F[VZ] = vz;
    const n = floor(hypot(x - F[CX], y - F[CY], z - F[CZ]) / .3) + 1, mx = (x - F[CX]) / n, my = (y - F[CY]) / n, mz = (z - F[CZ]) / n;
    for (let i = 0; i < n; i++) { F[CX] += mx; F[CY] += my; F[CZ] += mz; collide(); }
    if (fly && kd && grounded) { fly = false; F[VY] = 0; }
  }
  // teaser: until the first Enter the camera rides the scripted path at half speed, fading at the loop
  if (tour) {
    F[FLT] = (F[FLT] + dt * .5) % FLYT; fly = true; F[VX] = F[VY] = F[VZ] = 0; flyAt();
    const o = round(min(1, F[FLT] / 1.5, (FLYT - F[FLT]) / 1.5) * 20) / 20;
    if (o !== tourO) { tourO = o; canvas.style.opacity = o; }
  }
  render();
  if (hud) {
    hN++; if (dtr > hMax) hMax = dtr; if (dtr < hMin) hMin = dtr; if (dtr > hPer * 1.5) { hLate++; hTot++; }
    F[HUDT] += dtr / 1000;
    if (F[HUDT] > 0.5) { info.textContent = `${(hN / F[HUDT]).toFixed(0)} fps  ·  worst frame ${hMax.toFixed(1)} ms  ·  late frames ${hLate} (total ${hTot})  ·  GPU ${F[GPU].toFixed(2)} ms  ·  ${Wpx}x${Hpx} (${Wpx * 100 / DW | 0}%)  ·  ${fly ? 'flying' : 'walking'}`; F[HUDT] = 0; hPer = hMin; hN = 0; hMax = 0; hMin = 1e9; hLate = 0; }
  }
}

// ---------------------------------------------------------------- input
const pose = (i) => { const p = POSES[i]; fly = !!p[6]; F[VX] = F[VY] = F[VZ] = 0; lookAt(p[0], p[1], p[2], p[3], p[4], p[5]); };
const key = (e, v) => {
  switch (e.code) {
    case 'KeyW': kf = v; break; case 'KeyS': kb = v; break; case 'KeyA': kl = v; break; case 'KeyD': kr = v; break;
    // E lifts off from walking; Q descends, and touching the ground while descending lands back to walking
    case 'KeyE': ku = v; if (v && !fly) { fly = true; F[VY] = 0; } break; case 'KeyQ': kd = v; break; case 'ShiftLeft': case 'ShiftRight': ks = v; break;
    default: if (v && !e.repeat) {
      if (e.code === 'KeyH') { hud = !hud; hTot = 0; hPer = 1e9; info.textContent = ''; }
      else if (e.code === 'KeyM') mute();
      else if (e.code === 'KeyF') { fly = !fly; F[VY] = 0; }
      else if (e.code === 'Escape') ui(true);
      else if (e.code >= 'Digit1' && e.code <= 'Digit6') pose(e.code.charCodeAt(5) - 49);
    }
  }
};
addEventListener('keydown', (e) => { if (menu && e.code !== 'KeyH' && e.code !== 'KeyM') return; sound(); key(e, 1); });
addEventListener('keyup', (e) => key(e, 0));
const release = () => { kf = kb = kl = kr = ku = kd = ks = 0; tId = -1; tN = 0; };
const capture = () => { sound(); const p = canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => canvas.requestPointerLock()).catch(() => 0); };
canvas.addEventListener('click', capture);
// where pointer lock is refused (embedded pages, some browsers) dragging with the left button looks around instead
addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas || (e.buttons & 1 && !menu)) { mdx += e.movementX; mdy += e.movementY; } });
addEventListener('blur', release);
const touch = (e) => {
  e.preventDefault(); sound(); tN = e.touches.length;
  let f = null, first = false; for (let i = 0; i < tN; i++) if (e.touches[i].identifier === tId) f = e.touches[i];
  if (!f) { tId = -1; if (tN) { f = e.touches[0]; tId = f.identifier; first = true; } }
  if (f) {
    const x = rot.matches ? f.clientY : f.clientX, y = rot.matches ? -f.clientX : f.clientY, s = 1100 / min(innerWidth, innerHeight);
    if (first) { tx0 = x; ty0 = y; } else { mdx += (x - tx) * s; mdy += (y - ty) * s; }
    tx = x; ty = y;
  }
};
for (const n of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) canvas.addEventListener(n, touch, { passive: false });

// ---------------------------------------------------------------- menu: the scene keeps rendering, blurred, behind it
let menu = true, tour = location.hash !== '#capture', tourO = 1;
const bDive = $('d');
const ui = (m) => {
  if (dead) return;
  menu = m; body.className = m ? 'm' : document.pointerLockElement ? 'g p' : 'g';
  if (m) { release(); setTimeout(() => menu && bDive.focus(), 100); } else document.activeElement.blur();
};
const go = () => {
  if (tour) { tour = false; canvas.style.opacity = ''; pose(0); }
  sound(); ui(false); bDive.textContent = 'Resume';
  if (mob) document.documentElement.requestFullscreen?.()?.then(() => screen.orientation.lock('landscape')).catch(() => 0);
  if (!mob) capture();
};
bDive.onclick = go; $('o').onclick = () => ui(true); $('fl').onclick = () => { fly = !fly; F[VY] = 0; };
// touch up / down: held like E and Q
for (const [id, code] of [['up', 'KeyE'], ['dn', 'KeyQ']]) {
  const b = $(id), hold = (v) => (e) => { e.preventDefault(); key({ code, repeat: false }, v); };
  b.addEventListener('pointerdown', hold(1));
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, hold(0));
  b.oncontextmenu = (e) => e.preventDefault();
}
$('q').querySelectorAll('button').forEach((b, i) => { if (i === 2 - LV) b.className = 'on'; else b.onclick = () => { keep('haram', 2 - i); location.reload(); }; });
$('tm').querySelectorAll('button').forEach((b, i) => { if (i === TOD) b.className = 'on'; else b.onclick = () => { keep('haramTime', i); location.reload(); }; });
document.addEventListener('pointerlockchange', () => ui(!document.pointerLockElement));

pose(0);
await say('Opening the gates…', 1, 400);
render(); await Q.onSubmittedWorkDone();
setTimeout(keep, 15e3, 'haramLoad', '');
ui(true);
requestAnimationFrame((t) => { F[LAST] = t; requestAnimationFrame(frame); });
