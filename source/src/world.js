// ============================================================================
// world layout + procedural content generation (load time only)
// ============================================================================
// Axes: +x east, -z north, y up, metres; the Mataf floor is y = 0 and the Kaaba stands at the origin.
// Everything near the Kaaba is built in its own frame ("local"): local +x points north-east (the door wall's
// normal), local +z south-east. World = local rotated 45 degrees about y, so the Kaaba's corners point roughly
// at the compass points (Black Stone east, Iraqi north, Shami west, Yemeni south). Distances are composed.

// time of day: the key light (the moon at night), sky colours, exposure and how bright the lamps are
const TODS = [
  { az: 68, el: 13, sunc: [2.8, 1.62, 1.0], zen: [.13, .24, .54], horL: [1.45, .82, .52], horF: [.80, .68, .72], gnd: [.80, .68, .58], expo: .55, rays: 1, lights: .2 },
  { az: 250, el: 19, sunc: [2.9, 2.1, 1.35], zen: [.10, .24, .58], horL: [1.35, .84, .44], horF: [.74, .68, .66], gnd: [.86, .70, .52], expo: .42, rays: 1, lights: 1 },
  { az: 140, el: 35, sunc: [.16, .19, .27], zen: [.004, .008, .022], horL: [.05, .045, .05], horF: [.02, .025, .04], gnd: [.05, .045, .04], expo: 1.7, rays: 0, lights: 6 },
];
const TD = TODS[TOD], NIGHT = TOD === 2;
const SUN = (() => { const a = TD.az * PI / 180, e = TD.el * PI / 180; return [sin(a) * cos(e), sin(e), -cos(a) * cos(e)]; })();

// Kaaba frame <-> world
const S2 = Math.SQRT1_2;
const K = (lx, lz) => [S2 * (lx + lz), S2 * (lz - lx)];
const KL = (x, z) => [S2 * (x - z), S2 * (x + z)];
// the Kaaba: half extents (NE-SW, NW-SE), height, the band, the door (centre along the wall, bottom, top, half width)
const KHX = 5.2, KHZ = 6, KH = 13.1, BAND0 = 8.6, BAND1 = 9.55, DOORZ = 3.4, DOOR0 = 2.13, DOOR1 = 5.2, DOORW = .95;
const MAQAM = [16.2, 3.4];
// arcades: Ottoman inner row at |x| = OTX, |z| = OTZ, middle row 5 m further, the later arcade's face 10 m further
const OTX = 45, OTZ = 60, BAY = 5, SAX = OTX + 10, SAZ = OTZ + 10, SAD = 18, SAH = 19;
// the clock tower complex (world, its own axes): base centre
const CLOCK = [-232, 505];
// minarets: world azimuth (degrees from north), distance, height class (0 ~89 m, 1 ~139 m)
const MINS = [[188, 132, 0], [205, 136, 0], [252, 150, 0], [266, 152, 0], [312, 150, 0], [326, 150, 0], [30, 140, 0], [48, 142, 0], [118, 120, 0],
  [340, 300, 1], [356, 312, 1], [12, 312, 1], [26, 300, 1]];
const MINW = MINS.map(([a, d]) => [sin(a * PI / 180) * d, -cos(a * PI / 180) * d]);
// viewpoints in the Kaaba frame: lx, eye height above the floor (absolute y when flying), lz, look-at lx, y, lz, flying
const POSES_L = [
  [25, 1.7, -15, 0, 6.2, 1, 0],
  [13.5, 1.7, 9.5, 5.2, 5.4, 5.6, 0],
  [-27, 1.7, -12, 0, 6.5, -1.5, 0],
  [47.6, 1.7, 37.5, 30, 3.4, -6, 0],
  [21.5, 1.7, 1.2, 9, 3.2, 4.2, 0],
  [141.4, 120, -141.4, -150, 92, 120, 1],
];
const POSES = POSES_L.map(([x, y, z, tx, ty, tz, f]) => { const p = K(x, z), t = K(tx, tz); return [p[0], y, p[1], t[0], ty, t[1], f]; });
// 60 s scripted camera path (Kaaba frame, absolute heights): round the Kaaba anticlockwise from the Black Stone,
// through the NE Ottoman arcade, then up to pose 6
const FLY_L = [
  28, 3.2, 24, 5.2, 4, 6,
  20, 2.6, 18, 5.2, 3.5, 6,
  23, 2.6, 4, 4, 5.5, 2,
  23, 2.6, -10, 2, 5, -2,
  14, 2.6, -21, 0, 3, -11,
  -1, 2.6, -25, -2, 3, -12,
  -17, 2.8, -18, -3, 5, -5,
  -22, 3, 0, 0, 7, 0,
  -15, 3, 18, -1, 6, 4,
  2, 3, 24, 5, 5, 6,
  27, 3, 32.5, 47.5, 3, 32.5,
  40, 3, 32.5, 47.5, 3.2, 20,
  47.5, 3, 32.5, 47.5, 3.2, -20,
  47.5, 3, 23, 47.5, 3.2, -20,
  47.5, 3, 5, 40, 4, -20,
  47.5, 3, -10, 35, 4, -17.5,
  47.5, 3, -17.5, 25, 5, -17.5,
  40, 4, -17.5, 0, 10, 0,
  28, 26, -38, 0, 10, 20,
  80, 85, -95, -150, 90, 120,
  70, 150, -30, 0, 0, 4,
  30, 175, 10, 0, 0, 2,
];
const FLY = new Float32Array(FLY_L.length);
for (let i = 0; i < FLY_L.length; i += 6) { const p = K(FLY_L[i], FLY_L[i + 2]), t = K(FLY_L[i + 3], FLY_L[i + 5]); FLY.set([p[0], FLY_L[i + 1], p[1], t[0], FLY_L[i + 4], t[1]], i); }
const FLYR = 420, FLYH = 230;

// ---------------------------------------------------------------- far landscape: polar grid out to 12 km
const FN = 1024, FC = 24000 / (FN - 1), FO = -12000;
function farSampler(FA) {
  return (x, z) => {
    const gx = clamp((x - FO) / FC, 0, FN - 1.001), gz = clamp((z - FO) / FC, 0, FN - 1.001), ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz;
    const i = (ix + FN * iz) * 4;
    return mix(mix(FA[i], FA[i + 4], fx), mix(FA[i + FN * 4], FA[i + FN * 4 + 4], fx), fz);
  };
}
// the floor slab covers |x|,|z| < FLOORH; far ground inside it sinks below the floor
const FLOORH = 420;
function buildFar(fh) {
  const NR = 220, NS = 768, R0 = 400, R1 = 12000, nv = NR * NS;
  const vb = new ArrayBuffer(nv * 16), vf = new Float32Array(vb), v8 = new Int8Array(vb);
  const sx = SUN[0], sy = SUN[1], sz = SUN[2], sl = hypot(sx, sz), tn = sy / sl;
  for (let r = 0; r < NR; r++) {
    const rad = R0 * pow(R1 / R0, r / (NR - 1));
    for (let s = 0; s < NS; s++) {
      const a = (s + (r & 1) * .5) / NS * TAU, x = cos(a) * rad, z = sin(a) * rad, k = r * NS + s;
      let h = fh(x, z);
      if (max(abs(x), abs(z)) < FLOORH - 2) h -= 2;
      const e = max(FC * .7, rad * .004);
      let nx = fh(x - e, z) - fh(x + e, z), ny = 2 * e, nz = fh(x, z - e) - fh(x, z + e); const l = hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      let sh = 1;
      for (let t = 25; t < 3600; t *= 1.09) { const c = h + 2 + t * tn - fh(x + sx / sl * t, z + sz / sl * t); if (c < 0) { sh = 0; break; } sh = min(sh, c / (t * .045)); }
      vf[k * 4] = x; vf[k * 4 + 1] = h; vf[k * 4 + 2] = z;
      v8[k * 16 + 12] = round(nx * 127); v8[k * 16 + 13] = round(ny * 127); v8[k * 16 + 14] = round(nz * 127); v8[k * 16 + 15] = round(clamp(sh, 0, 1) * 127);
    }
  }
  const ib = [];
  for (let r = 0; r < NR - 1; r++) for (let s = 0; s < NS; s++) {
    const a = r * NS + s, b = r * NS + (s + 1) % NS, c = (r + 1) * NS + s, d = (r + 1) * NS + (s + 1) % NS;
    if (r & 1) ib.push(a, c, b, b, c, d); else ib.push(a, c, d, a, d, b);
  }
  return { vb, ib: new Uint32Array(ib), nv };
}

// ---------------------------------------------------------------- mesh toolkit
// a planar convex polygon with its own vertices, wound so its normal faces n
const face = (m, pts, n, aux = 1) => {
  const a = pts[0], b = pts[1], c = pts[2];
  const cx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0, v = pts.map((p) => m.v(p[0], p[1], p[2], aux));
  if (flip) v.reverse();
  for (let i = 1; i < v.length - 1; i++) m.tri(v[0], v[i], v[i + 1]);
};
const box = (m, x0, y0, z0, x1, y1, z1, aux = 1) => {
  const P = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  face(m, [P(0), P(2), P(6), P(4)], [-1, 0, 0], aux); face(m, [P(1), P(3), P(7), P(5)], [1, 0, 0], aux);
  face(m, [P(0), P(1), P(5), P(4)], [0, -1, 0], aux); face(m, [P(2), P(3), P(7), P(6)], [0, 1, 0], aux);
  face(m, [P(0), P(1), P(3), P(2)], [0, 0, -1], aux); face(m, [P(4), P(5), P(7), P(6)], [0, 0, 1], aux);
};
// a box whose top is inset by `in` on every side (a sloped skirt or plinth)
const frustum = (m, x0, z0, x1, z1, y0, y1, ins, aux = 1) => {
  const B = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], T = [[x0 + ins, y1, z0 + ins], [x1 - ins, y1, z0 + ins], [x1 - ins, y1, z1 - ins], [x0 + ins, y1, z1 - ins]];
  const N = [[0, ins, -(y1 - y0)], [y1 - y0, ins, 0], [0, ins, y1 - y0], [-(y1 - y0), ins, 0]];
  for (let i = 0; i < 4; i++) face(m, [B[i], B[(i + 1) % 4], T[(i + 1) % 4], T[i]], N[i], aux);
  face(m, T, [0, 1, 0], aux);
};
// surface of revolution: prof = [[radius, height, ao]...] bottom to top, seg sides (8 = octagonal)
function lathe(m, prof, seg, cx = 0, cy = 0, cz = 0, rot = PI / seg) {
  const rings = [];
  for (const [r, h, ao = 1] of prof) { const ring = []; for (let s = 0; s < seg; s++) { const a = s / seg * TAU + rot; ring.push(m.v(cx + cos(a) * r, cy + h, cz + sin(a) * r, ao)); } rings.push(ring); }
  for (let k = 0; k < rings.length - 1; k++) for (let s = 0; s < seg; s++) { const s2 = (s + 1) % seg; m.quad(rings[k][s], rings[k + 1][s], rings[k + 1][s2], rings[k][s2]); }
}
// drum + slightly pointed dome of radius r standing on height y
const domeProf = (r, drum, point = 1.12, n = 14) => {
  const p = [[r * 1.04, 0], [r * 1.04, drum], [r * 1.08, drum + .2], [r, drum + .35]];
  for (let i = 1; i <= n; i++) { const a = i / n * PI / 2; p.push([r * cos(a), drum + .35 + r * point * pow(sin(a), .92)]); }
  return p;
};
// two-centred pointed arch from (a0, ys) over to (a1, ys): rho = arc radius as a fraction of the span (.5 = round)
const pointed = (a0, a1, ys, rho, n = 8) => {
  const w = a1 - a0, R = rho * w, ta = Math.acos((R - w / 2) / R), L = [], Rr = [];
  for (let k = 0; k <= n; k++) { const t = k / n * ta; L.push([a0 + R - R * cos(t), ys + R * sin(t)]); Rr.push([a1 - R + R * cos(t), ys + R * sin(t)]); }
  return L.concat(Rr.reverse().slice(1));
};
// a wall panel [u0,u1] x [yb,yt] in a vertical plane with an arch opening [a0,a1] from sill y0, springing ys;
// P(u, y, d) maps plane coordinates (d along the outward normal) to the mesh's space. The opening's reveal goes
// `depth` deep; fill (a mesh) closes its back.
function archPanel(m, P, nrm, u0, u1, yb, yt, a0, a1, y0, ys, rho, depth, fill, soffit = true) {
  const arc = pointed(a0, a1, ys, rho, 8), p0 = P(0, 0, 0), p1 = P(1, 0, 0), uN = [p1[0] - p0[0], 0, p1[2] - p0[2]];
  const W = (pts, d = 0) => pts.map(([u, y]) => P(u, y, d));
  if (ys > yb) { face(m, W([[u0, yb], [a0, yb], [a0, ys], [u0, ys]]), nrm); face(m, W([[a1, yb], [u1, yb], [u1, ys], [a1, ys]]), nrm); }
  if (y0 > yb) face(m, W([[a0, yb], [a1, yb], [a1, y0], [a0, y0]]), nrm);
  const am = (a0 + a1) / 2;
  for (let k = 0; k < arc.length - 1; k++) {
    const p = arc[k], q = arc[k + 1];
    const tu = (u) => (u <= am ? mix(u0, am, (u - a0) / (am - a0)) : mix(am, u1, (u - am) / (a1 - am)));
    face(m, W([p, q, [tu(q[0]), yt], [tu(p[0]), yt]]), nrm);
    if (k === 0) face(m, W([[u0, ys], p, [u0, yt]]), nrm);
    if (k === arc.length - 2) face(m, W([q, [u1, ys], [u1, yt]]), nrm);
  }
  if (soffit) {
    const out = [[a0, y0], ...arc, [a1, y0]], cu = am, cy = ys;
    for (let k = 0; k < out.length - 1; k++) {
      const p = out[k], q = out[k + 1];
      if (hypot(q[0] - p[0], q[1] - p[1]) < 1e-4) continue;
      let nu = -(q[1] - p[1]), ny = q[0] - p[0];
      if (nu * (cu - p[0]) + ny * (cy - p[1]) < 0) { nu = -nu; ny = -ny; }
      const l = hypot(nu, ny), dn = [uN[0] * nu / l, ny / l, uN[2] * nu / l];
      face(m, [P(p[0], p[1], 0), P(q[0], q[1], 0), P(q[0], q[1], -depth), P(p[0], p[1], -depth)], dn, k === 0 || k === out.length - 2 ? .8 : .7);
    }
  }
  if (fill) face(fill, W([[a0, y0], ...arc, [a1, y0]], -depth), nrm);
}
// leaf-shaped merlons along a straight roof edge
function merlons(m, x0, z0, x1, z1, y, sp = 1.5, s = 1) {
  const L = hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  for (let t = sp / 2; t < L; t += sp) {
    const cx = x0 + ux * t, cz = z0 + uz * t, d = .16 * s;
    const P = (u, v, w) => [cx + ux * u - uz * w, y + v, cz + uz * u + ux * w];
    const out = [[-.36 * s, 0], ...pointed(-.36 * s, .36 * s, .62 * s, .75, 4), [.36 * s, 0]];
    for (const w of [-d, d]) face(m, out.map(([u, v]) => P(u, v, w)), [-uz * w, 0, ux * w]);
    for (let k = 0; k < out.length; k++) {
      const p = out[k], q = out[(k + 1) % out.length], nu = q[1] - p[1], nv = -(q[0] - p[0]);
      face(m, [P(p[0], p[1], -d), P(q[0], q[1], -d), P(q[0], q[1], d), P(p[0], p[1], d)], [-ux * nu, -nv, -uz * nu]);
    }
  }
}
// Saudi-era minaret: square shaft, octagonal stages on corbelled balconies, a lantern, a cap (unit height ~91.5)
const MINARET_N = [[3.3, 22], [3.3, 34.6], [3.55, 34.8], [3.55, 35.5], [3.3, 35.7], [3.3, 48.4], [4.5, 50.4], [4.5, 52.2], [3, 52.5], [3, 59.2], [3.22, 59.4], [3.22, 60], [3, 60.2], [3, 66.6], [4.1, 68.4], [4.1, 70.2], [2.5, 70.5], [2.5, 74.4], [2.7, 74.6], [2.7, 75.1], [2.5, 75.3], [2.5, 78.8], [3.5, 80.4], [3.5, 81.9], [2.1, 82.2], [2.1, 86], [2.4, 86.2], [2.25, 87.8], [1.3, 89.8], [.3, 91.3], [0, 91.5]];
const MKS = [.97, 1.45];
function meshMinaret(prof, base, baseH, k) {
  const m = new Mesh();
  box(m, -base * .6, 0, -base * .6, base * .6, 1.6, base * .6, .8);
  box(m, -base / 2, 1.6, -base / 2, base / 2, baseH, base / 2);
  box(m, -base / 2 - .25, baseH - 1.2, -base / 2 - .25, base / 2 + .25, baseH - .5, base / 2 + .25);
  lathe(m, prof.map(([r, h]) => [r * k, h * k]), 8);
  for (let i = 1; i < prof.length - 1; i++) if (prof[i][0] > prof[i - 1][0] + .6) {
    const r0 = prof[i - 1][0] * k, r1 = prof[i][0] * k * 1.03, y0 = prof[i - 1][1] * k, y1 = prof[i][1] * k, y2 = prof[i + 1][1] * k;
    lathe(m, [[r0 * 1.01, y0], [r0 + (r1 - r0) * .55, y0 + (y1 - y0) * .45], [r1, y1], [r1, y2], [r1 + .08, y2 + .04], [r1 + .08, y2 + .2], [r1 - .18, y2 + .2], [r1 - .18, y1 + .3]], 28);
  }
  return m;
}
// alem: a short pole with stacked spheres and an upturned crescent on top (checked in silhouette: no cross)
function meshFinial(s) {
  const m = new Mesh(), ball = (y, r) => { const p = []; for (let i = 0; i <= 8; i++) { const a = -PI / 2 + i / 8 * PI; p.push([cos(a) * r, y + r + sin(a) * r]); } return p; };
  lathe(m, [[.15 * s, 0], [.15 * s, .9 * s], [.1 * s, .9 * s]], 10);
  lathe(m, ball(.9 * s, .34 * s), 12); lathe(m, ball(1.55 * s, .24 * s), 12);
  lathe(m, [[.07 * s, 2 * s], [.07 * s, 2.35 * s], [0, 2.36 * s]], 8);
  const R = .55 * s, cy = 2.3 * s + R * .95, pts = [];
  for (let k = 0; k <= 16; k++) { const a = (200 + k / 16 * 140) * PI / 180; pts.push([cos(a) * R, cy + sin(a) * R, 0]); }
  m.tube(pts, (k) => .015 * s + .1 * s * sin(PI * k / 16), 6, false, () => 1);
  return m;
}
function meshCityBox(w, h, d, step) {
  const m = new Mesh();
  box(m, -w / 2, 0, -d / 2, w / 2, h, d / 2);
  box(m, -w / 2 - .2, h, -d / 2 - .2, w / 2 + .2, h + .9, d / 2 + .2);
  if (step) { const s = h > 20 ? h * .22 : 3.3; box(m, -w * .3, h, -d * .3, w * .25, h + s, d * .3); box(m, -w * .3 - .15, h + s, -d * .3 - .15, w * .25 + .15, h + s + .7, d * .3 + .15); }
  box(m, w * .15, h + .9, -d * .3, w * .15 + 2.4, h + 3.2, -d * .3 + 2.4);
  lathe(m, [[.9, h + .9], [.9, h + 2.4], [0, h + 2.6]], 6, -w * .32, 0, d * .28);
  return m;
}
// near-city massing (within ~1 km of the Kaaba). Parts carry a sub-material in the vertex aux, read by the facade
// shader (material 17): -.25 carved wood, -.5 metal and plastic, -.75 bare concrete or stone trim; 1 = wall with windows.
// Hotel towers get a podium, pilasters, floor bands every five storeys and a crown; low blocks get balconies, roshan
// boxes, AC units, a stair room and tanks.
const WOOD = -.25, METAL = -.5, CONC = -.75;
function meshCityDetail(w, h, d, step) {
  const m = new Mesh(), F = 3.3, nf = round(h / F), W2 = w / 2, D2 = d / 2;
  rseed(900 + round(w * 7 + h * 13 + d * 3));
  const ring = (x0, z0, x1, z1, y, ht, t, a = CONC) => {
    box(m, x0, y, z0, x1, y + ht, z0 + t, a); box(m, x0, y, z1 - t, x1, y + ht, z1, a);
    box(m, x0, y, z0 + t, x0 + t, y + ht, z1 - t, a); box(m, x1 - t, y, z0 + t, x1, y + ht, z1 - t, a);
  };
  const tank = (x, y, z, r, th) => lathe(m, [[r, 0, METAL], [r, th, METAL], [r * .8, th + .25, METAL], [0, th + .3, METAL]], 8, x, y, z);
  if (h > 40) {
    const ph = 3 * F;
    box(m, -W2 - 2.5, 0, -D2 - 2.5, W2 + 2.5, ph, D2 + 2.5);
    ring(-W2 - 2.6, -D2 - 2.6, W2 + 2.6, D2 + 2.6, ph, 1.1, .3);
    box(m, -W2, ph, -D2, W2, h, D2);
    // pilasters and floor bands give the tower faces relief that reads from the Mataf and the air
    const pil = (len, n, fn) => { for (let k = 0; k <= n; k++) fn(-len / 2 + k * len / n); };
    pil(w, max(2, round(w / 7.5)), (x) => { box(m, x - .4, ph, D2, x + .4, h, D2 + .55, CONC); box(m, x - .4, ph, -D2 - .55, x + .4, h, -D2, CONC); });
    pil(d, max(2, round(d / 7.5)), (z) => { box(m, W2, ph, z - .4, W2 + .55, h, z + .4, CONC); box(m, -W2 - .55, ph, z - .4, -W2, h, z + .4, CONC); });
    for (let y = ph + 5 * F; y < h - F; y += 5 * F) ring(-W2 - .4, -D2 - .4, W2 + .4, D2 + .4, y - .15, .35, .45);
    ring(-W2 - .3, -D2 - .3, W2 + .3, D2 + .3, h, 2.6, .35);
    if (step) { const s2 = h * .12; box(m, -W2 * .55, h, -D2 * .55, W2 * .55, h + s2, D2 * .55); ring(-W2 * .55 - .2, -D2 * .55 - .2, W2 * .55 + .2, D2 * .55 + .2, h + s2, 1.4, .3); }
    const top = h + (step ? h * .12 : 0);
    box(m, -W2 * .3, top, -D2 * .2, W2 * .1, top + 3.5, D2 * .25, METAL);
    lathe(m, [[.35, 0, METAL], [.35, 9, METAL], [.12, 14, METAL], [0, 14.2, METAL]], 6, W2 * .3, top, -D2 * .3);
    return m;
  }
  const back = step && h > 12 ? 1 : 0, hb = h - back * F, inset = rr(2.4, 3.6);
  box(m, -W2, 0, -D2, W2, hb, D2);
  if (back) { box(m, -W2, hb, -D2, W2, h, D2 - inset); ring(-W2, D2 - inset, W2, D2, hb, 1, .22); }
  ring(-W2 - .05, -D2 - .05, W2 + .05, (back ? D2 - inset : D2) + .05, h, 1.05, .25);
  box(m, -W2 - .12, 0, -D2 - .12, W2 + .12, .55, D2 + .12, CONC);
  if (nf >= 4) {
    const cols = [rr(-.38, -.15), rr(.12, .36)].map((k) => k * w), top = back ? nf - back : nf;
    for (let f = 1; f < top; f++) for (const cx of cols) {
      if (rnd() < .25) continue;
      const y = f * F, bw = rr(2.6, 3.6);
      box(m, cx - bw / 2, y - .18, D2, cx + bw / 2, y, D2 + 1.1, CONC);
      box(m, cx - bw / 2, y, D2 + .95, cx + bw / 2, y + .95, D2 + 1.1, CONC);
    }
  } else {
    for (const cx of [rr(-.35, -.1) * w, rr(.1, .35) * w]) {
      const y = F + .3, bw = rr(2, 2.8);
      box(m, cx - bw / 2, y, D2, cx + bw / 2, y + 2.5, D2 + .75, WOOD);
      box(m, cx - bw / 2 - .1, y + 2.5, D2 - .05, cx + bw / 2 + .1, y + 2.75, D2 + .9, WOOD);
      box(m, cx - bw / 2 + .2, y - .35, D2, cx + bw / 2 - .2, y, D2 + .55, WOOD);
    }
  }
  for (let k = 0; k < 4 + nf; k++) {
    const f = 1 + floor(rnd() * max(1, (back ? nf - back : nf) - 1)), y = f * F + .35, side = floor(rnd() * 4), u = rr(-.4, .4);
    const [x0, z0, x1, z1] = side === 0 ? [u * w - .42, D2, u * w + .42, D2 + .32] : side === 1 ? [u * w - .42, -D2 - .32, u * w + .42, -D2]
      : side === 2 ? [W2, u * d - .42, W2 + .32, u * d + .42] : [-W2 - .32, u * d - .42, -W2, u * d + .42];
    box(m, x0, y, z0, x1, y + .58, z1, METAL);
  }
  const sx = rr(-.3, .05) * w, sz = rr(-.35, -.1) * d - (back ? inset / 2 : 0);
  box(m, sx, h, sz, sx + rr(2.6, 3.4), h + 2.9, sz + rr(3, 4.4));
  box(m, sx - .1, h + 2.9, sz - .1, sx + 3.5, h + 3.15, sz + 4.5, CONC);
  for (let k = 0; k < 3; k++) { const tx = W2 * .2 + k * 1.9, tz = -D2 * .4 - (back ? inset / 2 : 0); box(m, tx - .7, h, tz - .7, tx + .7, h + .5, tz + .7, METAL); tank(tx, h + .5, tz, .65, 1.4); }
  return m;
}
function meshBird() {
  const m = new Mesh(), X = [.17, .1, 0, -.12, -.2], H = [.01, .045, .055, .04, .012];
  const rings = [];
  for (let i = 0; i < 5; i++) { const r = []; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; r.push(m.v(sin(a) * H[i] * .9, cos(a) * H[i], X[i], 0)); } rings.push(r); }
  for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) { const k2 = (k + 1) % 6; m.quad(rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]); }
  for (const sx of [-1, 1]) {
    const a = m.v(sx * .03, .02, .06, 0), b = m.v(sx * .03, .02, -.06, 0), c = m.v(sx * .36, .03, -.02, sx), d = m.v(sx * .3, .03, -.12, sx);
    m.quad(a, c, d, b);
  }
  const t0 = m.v(0, .01, -.18, 0), t1 = m.v(.07, .01, -.3, 0), t2 = m.v(-.07, .01, -.3, 0); m.tri(t0, t1, t2);
  return m;
}
// city block sizes (w, h, d, setback storey): low houses first, then the hotel towers round the Haram
const CITY = [[24, 9.9, 26, 0], [26, 13.2, 24, 1], [22, 16.5, 26, 0], [28, 19.8, 22, 1], [20, 9.9, 20, 0], [26, 26.4, 26, 1],
  [30, 52, 30, 1], [34, 78, 30, 1], [30, 104, 32, 1], [36, 130, 34, 1], [28, 66, 40, 0], [40, 92, 26, 1]];
const CITY_LOW = [0, 1, 2, 3, 4, 5, 0, 2], CITY_TALL = [6, 7, 8, 9, 10, 11];

// ---------------------------------------------------------------- materials (W_SOLID fs)
// 1 far ground · 7 plain stone (expansion blocks) · 10 gold · 17 city · 19 floor · 20 minaret stone · 22 lamp glass ·
// 23 brass · 25 carved stone (Ottoman arcade, w 1) · 27 granite · 30 Kiswah · 31 gold door · 32 silver frame (w 1 the
// stone) · 33 Maqam cage · 34 later arcade marble · 35 clock tower (w 1 faces) · 36 white marble · 37 lead domes ·
// 38 arcade depth (the dim back of an arch opening)
function makeWorld(FAR, flyPts) {
  const meshes = [], solids = [];
  const add = (m) => { meshes.push(m); return meshes.length - 1; };
  // instance record: x y z scale · quaternion · material seed shrink-distance extra
  const solid = (mesh, x, y, z, sc, q, mat, seed, far = 0, ex = 0) => (solids[mesh] ||= []).push(x, y, z, sc, q[0], q[1], q[2], q[3], mat, seed, far, ex);
  const Q0 = [0, 0, 0, 1], yawQ = (a) => qAxis(0, 1, 0, a), QK = yawQ(PI / 4);
  // a Kaaba-frame mesh placed at the origin
  const local = (m, mat, w = 0, seed = 0) => solid(add(m), 0, 0, 0, 1, QK, mat, seed, 0, w);
  const fh = farSampler(FAR.A);
  const farB = (x, z, c) => { const gx = clamp(round((x - FO) / FC), 0, FN - 1), gz = clamp(round((z - FO) / FC), 0, FN - 1); return FAR.B[(gx + FN * gz) * 4 + c]; };
  const gy = () => 0;
  // collision in the Kaaba frame: boxes [x0, x1, y0, y1, z0, z1] and vertical cylinders [x, z, r, y1]
  const CB = [], CC = [];
  const cbox = (x0, x1, y0, y1, z0, z1) => CB.push(x0, x1, y0, y1, z0, z1);

  // --- the floor: one slab over the whole composed area (the marble is drawn per pixel)
  const floor_ = new Mesh();
  for (let j = 0; j < 28; j++) for (let i = 0; i < 28; i++) {
    const x0 = -FLOORH + i * 30, z0 = -FLOORH + j * 30, x1 = x0 + 30, z1 = z0 + 30;
    face(floor_, [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], [0, 1, 0]);
  }
  solid(add(floor_), 0, 0, 0, 1, Q0, 19, 0);

  // --- the Kaaba: the Kiswah over the walls, the roof, the sloped marble base, the gold door, the Black Stone
  const kb = new Mesh();
  box(kb, -KHX, .28, -KHZ, KHX, KH, KHZ);
  local(kb, 30);
  cbox(-KHX - .45, KHX + .45, -5, KH + .3, -KHZ - .45, KHZ + .45);
  const base = new Mesh();
  frustum(base, -KHX - .42, -KHZ - .42, KHX + .42, KHZ + .42, 0, .3, .38);
  local(base, 36, 1);
  const gold = new Mesh(), door = new Mesh();
  box(gold, KHX - .02, DOOR0 - .22, DOORZ - DOORW - .26, KHX + .1, DOOR1 + .3, DOORZ + DOORW + .26);
  box(door, KHX + .1, DOOR0, DOORZ - DOORW, KHX + .16, DOOR1, DOORZ + DOORW);
  box(gold, KHX + .1, DOOR0 - .08, DOORZ - .03, KHX + .22, DOOR1, DOORZ + .03);
  // the Mizab: a gold spout over the Hijr from the top of the north-west wall
  gold.sweep([[0, KH - .3, -KHZ + .2], [0, KH - .5, -KHZ - 1.2], [0, KH - .62, -KHZ - 1.75]], .3, .06, null, true);
  for (const sx of [-1, 1]) gold.sweep([[sx * .17, KH - .15, -KHZ + .1], [sx * .17, KH - .35, -KHZ - 1.2], [sx * .17, KH - .47, -KHZ - 1.75]], .05, .16, null, true);
  local(gold, 10, 1); local(door, 31);
  // the Black Stone: a silver frame bent round the east corner, the dark stone inside it
  {
    const sv = new Mesh(), st = new Mesh(), cy = 1.5, rh = .5, rv = .44;
    const wrap = (t, y, o) => (t < 0 ? [KHX + o, y, KHZ + t] : [KHX - t, y, KHZ + o]);
    const ring = (sc, o) => { const p = []; for (let k = 0; k <= 32; k++) { const a = k / 32 * TAU; p.push(wrap(cos(a) * rh * sc, cy + sin(a) * rv * sc, o)); } return p; };
    sv.tube(ring(1.18, .07), .085, 6, false, () => 1);
    const fan = (m, sc, o) => { const c = m.v(...wrap(0, cy, o)), rp = ring(sc, o).map((p) => m.v(...p)); for (let k = 0; k < 32; k++) m.tri(c, rp[k], rp[k + 1]); };
    fan(sv, 1.16, .05); fan(st, .58, .085);
    local(sv, 32); local(st, 32, 1);
  }

  // --- the Hijr Ismail: a U-shaped white marble wall opposite the north-west wall
  const hijr = new Mesh(), HP = [];
  for (let k = 0; k <= 30; k++) { const a = k / 30 * PI; HP.push([5.05 * cos(a), .655, -KHZ - 2.35 - 7.2 * sin(a)]); }
  hijr.sweep(HP, 1.5, 1.31, null, true);
  const hcap = HP.map(([x, , z]) => [x, 1.38, z]); hijr.sweep(hcap, 1.78, .14, null, true); hijr.sweep(HP.map(([x, , z]) => [x, .06, z]), 1.7, .12, null, true);
  local(hijr, 36, 2);
  for (let k = 0; k <= 30; k += 2) CC.push(HP[k][0], HP[k][2], .85, 1.4);

  // --- Maqam Ibrahim: a marble plinth, a gold cage round a glass bell, a gold cap
  {
    const pl = new Mesh(), cg = new Mesh(), cap = new Mesh(), [mx, mz] = MAQAM;
    lathe(pl, [[1.05, 0], [1.05, .32], [.95, .42], [.82, .42]], 8, mx, 0, mz);
    lathe(cg, [[.8, .42], [.8, .55], [.7, .62], [.7, 1.75], [.76, 1.85], [.72, 2.0], [.6, 2.25], [.38, 2.45], [.16, 2.56], [0, 2.6]], 24, mx, 0, mz);
    lathe(cap, [[.76, 1.78], [.8, 1.86], [.76, 1.94]], 24, mx, 0, mz);
    lathe(cap, [[.09, 2.56], [.13, 2.66], [.06, 2.8], [.1, 2.88], [0, 3.0]], 10, mx, 0, mz);
    local(pl, 36, 3); local(cg, 33); local(cap, 10);
    CC.push(mx, mz, 1.1, 3);
  }

  // --- the Ottoman arcade: two rows of pointed arches on slender marble columns, a small dome over every bay
  const ott = new Mesh(), domes = new Mesh(), lead = new Mesh();
  const cols = [], fins = [], lamps = [];
  const side = (fixed, onX, sgn, lo, hi, t) => {
    // P maps (u along the row, y, d along the normal toward the Mataf) into the Kaaba frame
    const P = (u, y, d) => (onX ? [fixed - sgn * d, y, u] : [u, y, fixed - sgn * d]), n = onX ? [-sgn, 0, 0] : [0, 0, -sgn];
    const Pb = (u, y, d) => P(u, y, d - t), nb = n.map((v) => -v);
    for (let u = lo; u < hi - .01; u += BAY) {
      archPanel(ott, P, n, u, u + BAY, 4.3, 7.9, u + .32, u + BAY - .32, 4.3, 4.3, .72, t, null, true);
      archPanel(ott, Pb, nb, u, u + BAY, 4.3, 7.9, u + .32, u + BAY - .32, 4.3, 4.3, .72, 0, null, false);
    }
    for (let u = lo; u <= hi + .01; u += BAY) cols.push(onX ? [fixed + sgn * t / 2, u] : [u, fixed + sgn * t / 2]);
  };
  for (const s of [-1, 1]) {
    side(s * OTX, true, s, -OTZ, OTZ, .6); side(s * OTZ, false, s, -OTX, OTX, .6);
    side(s * (OTX + 5), true, s, -OTZ - 5, OTZ + 5, .6); side(s * (OTZ + 5), false, s, -OTX - 5, OTX + 5, .6);
  }
  // lanterns hang in the inner arches, facing the Mataf
  for (let u = -OTZ; u < OTZ; u += BAY) for (const s of [-1, 1]) lamps.push([s * (OTX + .3), u + BAY / 2]);
  for (let u = -OTX; u < OTX; u += BAY) for (const s of [-1, 1]) lamps.push([u + BAY / 2, s * (OTZ + .3)]);
  // roof slab over both aisles, with a parapet of merlons on the Mataf edge
  for (const s of [-1, 1]) {
    box(ott, s > 0 ? OTX - .3 : -SAX, 7.9, -SAZ, s > 0 ? SAX : -OTX + .3, 8.6, SAZ);
    box(ott, -SAX, 7.9, s > 0 ? OTZ - .3 : -SAZ, SAX, 8.6, s > 0 ? SAZ : -OTZ + .3);
    merlons(ott, s * (OTX - .2), -OTZ, s * (OTX - .2), OTZ, 8.6, 1.25, .8);
    merlons(ott, -OTX, s * (OTZ - .2), OTX, s * (OTZ - .2), 8.6, 1.25, .8);
    cbox(-SAX, SAX, 7.9, 8.8, s > 0 ? OTZ - .3 : -SAZ, s > 0 ? SAZ : -OTZ + .3);
    cbox(s > 0 ? OTX - .3 : -SAX, s > 0 ? SAX : -OTX + .3, 7.9, 8.8, -SAZ, SAZ);
  }
  // domes: one per bay in both aisles (cell centres), with a small finial
  const domeAt = (x, z) => { lathe(domes, [[2.05, 0], [2.05, .55], [2.15, .7], ...domeProf(1.95, .25, 1.0, 9).slice(3).map(([r, h]) => [r, h + .55])], 14, x, 8.6, z); fins.push([x, 8.6 + .55 + .35 + 1.95 + .25 - .1, z]); };
  for (const s of [-1, 1]) for (const r of [2.5, 7.5]) {
    for (let u = -OTZ - (r > 5 ? 5 : 0); u < OTZ + (r > 5 ? 5 : 0) - .1; u += BAY) domeAt(s * (OTX + r), u + BAY / 2);
    for (let u = -OTX - (r > 5 ? 5 : 0); u < OTX + (r > 5 ? 5 : 0) - .1; u += BAY) domeAt(u + BAY / 2, s * (OTZ + r));
  }
  for (const s of [-1, 1]) for (const t of [-1, 1]) box(lead, s * OTX - .3, 8.6, t * OTZ - .3, s * OTX + .3, 9.6, t * OTZ + .3);
  local(ott, 25, 1, .2); local(domes, 37); local(lead, 25, 0);
  // columns: base, slender shaft, capital (instanced)
  const colM = new Mesh();
  lathe(colM, [[.36, 0, .8], [.36, .3], [.27, .4], [.22, .56], [.195, 3.55], [.24, 3.63], [.24, 3.72], [.4, 4.04], [.4, 4.32]], 16);
  const colId = add(colM);
  for (const [x, z] of cols) { const w = K(x, z); solid(colId, w[0], 0, w[1], 1, QK, 36, rnd(), 0, 4); CC.push(x, z, .34, 8); }
  const finId = add(meshFinial(1));
  for (const [x, y, z] of fins) { const w = K(x, z); solid(finId, w[0], y, w[1], .42, Q0, 10, 0); }
  // lanterns: a chain from the arch apex, a brass cage round a glowing glass body
  const lnB = new Mesh(), lnG = new Mesh();
  lathe(lnB, [[.03, 6.5], [.03, 7.1]], 4);
  lathe(lnB, [[.05, 5.3], [.26, 5.42], [.3, 5.5], [.05, 5.62]], 8); lathe(lnB, [[.28, 6.0], [.3, 6.08], [.05, 6.5]], 8);
  lathe(lnG, [[.18, 5.5], [.24, 5.62], [.24, 5.92], [.2, 6.04]], 8);
  const lnBi = add(lnB), lnGi = add(lnG);
  for (const [x, z] of lamps) { const w = K(x, z); solid(lnBi, w[0], 0, w[1], 1, QK, 23, 0); solid(lnGi, w[0], 0, w[1], 1, QK, 22, rnd()); }

  // --- the later arcade: three storeys of round arches, a dim depth behind every opening
  const sa = new Mesh(), saFill = new Mesh(), saBody = new Mesh();
  for (const s of [-1, 1]) for (const onX of [true, false]) {
    const fixed = s * (onX ? SAX : SAZ), lo = onX ? -SAZ : -SAX, hi = -lo;
    const P = (u, y, d) => (onX ? [fixed - s * d, y, u] : [u, y, fixed - s * d]), n = onX ? [-s, 0, 0] : [0, 0, -s];
    for (let u = lo; u < hi - .01; u += BAY) {
      archPanel(sa, P, n, u, u + BAY, 0, 9.5, u + .75, u + BAY - .75, 0, 5.2, .62, 1.3, saFill);
      archPanel(sa, P, n, u, u + BAY, 9.5, 19, u + .85, u + BAY - .85, 10.5, 14.6, .62, 1.1, saFill);
    }
    // cornices between the storeys, a parapet on top
    for (const y of [9.5, SAH]) { const a = P(lo, y, 0), b = P(hi, y + .55, .45); box(sa, min(a[0], b[0]), y - .1, min(a[2], b[2]), max(a[0], b[0]), y + .55, max(a[2], b[2])); }
    const a = P(lo, SAH, -SAD), b = P(hi, SAH + 1.4, 0), c = P(hi, 0, -1.45); box(saBody, min(a[0], c[0]), 0, min(a[2], c[2]), max(a[0], c[0]), SAH, max(a[2], c[2]));
    box(sa, min(a[0], b[0]), SAH, min(a[2], b[2]), max(a[0], b[0]), SAH + 1.4, max(a[2], b[2]));
    { const a2 = P(lo, SAH + 1.4, .15), b2 = P(hi, SAH + 1.65, -.3); box(sa, min(a2[0], b2[0]), SAH + 1.4, min(a2[2], b2[2]), max(a2[0], b2[0]), SAH + 1.65, max(a2[2], b2[2])); }
    cbox(min(a[0], b[0]), max(a[0], b[0]), -5, SAH + 2, min(a[2], b[2]), max(a[2], b[2]));
  }
  local(sa, 34, 0, .1); local(saFill, 38); local(saBody, 7, 0, .3);

  // --- the larger expansions beyond: flat-roofed blocks, their facades painted with arcades
  const ex = new Mesh();
  for (const [x0, z0, x1, z1, h] of [[SAX + SAD, -140, 150, 120, 17], [-150, -130, -SAX - SAD, 140, 17], [-SAX - SAD, SAZ + SAD, 110, 165, 16], [-110, -175, SAX + SAD, -SAZ - SAD, 18]]) {
    box(ex, x0, 0, z0, x1, h, z1);
    merlons(ex, x0, z0, x1, z0, h, 1.8, 1.1); merlons(ex, x0, z1, x1, z1, h, 1.8, 1.1); merlons(ex, x0, z0, x0, z1, h, 1.8, 1.1); merlons(ex, x1, z0, x1, z1, h, 1.8, 1.1);
    // a few roof domes and stair houses break the long flat roofs
  }
  local(ex, 7, 1, .5);

  // --- minarets: square shafts rising from the expansions, octagonal stages, crescent finials
  const mIds = MKS.map((k) => add(meshMinaret(MINARET_N, 9, 30, k)));
  for (let i = 0; i < MINS.length; i++) {
    const [x, z] = MINW[i], c = MINS[i][2], k = MKS[c];
    solid(mIds[c], x, 0, z, 1, yawQ(PI / 4), 20, rnd(), 0, 1);
    solid(finId, x, 91.3 * k, z, 1.8 * k, Q0, 10, 0);
    const l = KL(x, z); CC.push(l[0], l[1], 5.8, 91.5 * k);
  }

  // --- the clock tower: podium, hotel towers round it, the clock shaft, four faces, crown, spire, finial
  {
    const [cx, cz] = CLOCK, body = new Mesh(), faceM = new Mesh(), crown = new Mesh(), hot = new Mesh(), hcr = new Mesh();
    box(hot, cx - 95, 0, cz - 60, cx + 95, 92, cz + 70);
    for (const [ox, oz, w, h] of [[-70, -25, 34, 262], [70, -25, 34, 248], [-70, 45, 32, 232], [70, 45, 32, 240], [-28, 58, 30, 210], [28, 58, 30, 220]]) {
      box(hot, cx + ox - w / 2, 92, cz + oz - w / 2, cx + ox + w / 2, h, cz + oz + w / 2);
      box(hot, cx + ox - w / 2 + 3, h, cz + oz - w / 2 + 3, cx + ox + w / 2 - 3, h + 12, cz + oz + w / 2 - 3);
      lathe(hcr, [[w * .42, h + 12], [w * .42, h + 17], [w * .34, h + 17.5], [w * .34, h + 23], [w * .24, h + 23.5], [w * .2, h + 30], [w * .1, h + 34]], 8, cx + ox, 0, cz + oz);
      lathe(crown, [[w * .1, h + 34], [1.4, h + 42], [.5, h + 50], [0, h + 52]], 8, cx + ox, 0, cz + oz);
    }
    box(body, cx - 24, 92, cz - 24, cx + 24, 380, cz + 24);
    box(body, cx - 26, 380, cz - 26, cx + 26, 386, cz + 26);
    box(body, cx - 23, 386, cz - 23, cx + 23, 452, cz + 23);
    box(body, cx - 26, 452, cz - 26, cx + 26, 458, cz + 26);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lathe(crown, [[2.4, 0], [2.4, 22], [1.2, 30], [0, 34]], 8, cx + sx * 21, 458, cz + sz * 21);
    lathe(crown, [[19, 458], [19, 470], [16, 476], [10, 492], [6, 520], [3.2, 556], [1.6, 570]], 8, cx, 0, cz);
    // the four faces, 43 m across, centred 419 m up, standing just proud of the shaft
    for (const [nx, nz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const pts = []; for (let k = 0; k < 48; k++) { const a = k / 48 * TAU, u = cos(a) * 21.5, y = 419 + sin(a) * 21.5; pts.push([cx + nx * 23.6 - nz * u, y, cz + nz * 23.6 + nx * u]); }
      face(faceM, pts, [nx, 0, nz]);
    }
    solid(add(hot), 0, 0, 0, 1, Q0, 35, 0, 0, 0);
    solid(add(body), 0, 0, 0, 1, Q0, 35, 0, 0, 0);
    solid(add(faceM), 0, 0, 0, 1, Q0, 35, 0, 0, 1);
    solid(add(hcr), 0, 0, 0, 1, Q0, 35, 0, 0, 0); solid(add(crown), 0, 0, 0, 1, Q0, 10, 0);
    solid(finId, cx, 568, cz, 13, Q0, 10, 0);
  }

  // --- the city: hotel towers close round the Haram, lower houses climbing the valley sides
  const detIds = CITY.map((d) => add(meshCityDetail(...d)));
  rseed(5);
  const cityIds = CITY.map((d) => add(meshCityBox(...d)));
  for (let dz = -3240; dz < 3240; dz += 360) for (let dx = -3240; dx < 3240; dx += 360) {
    const ang = rr(-.5, .5), ca = cos(ang), sa_ = sin(ang);
    const sx = 4 + (rnd() * 3 | 0), sz = 4 + (rnd() * 3 | 0);
    for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
      if (i % sx === 0 || j % sz === 0) continue;
      const lx = i * 30 - 165 + rr(-3, 3), lz = j * 30 - 165 + rr(-3, 3), x = dx + lx * ca - lz * sa_, z = dz + lx * sa_ + lz * ca, c = farB(x, z, 0);
      if (c < .05 || rnd() > min(1, c * 3) * (1 - .6 * sstep(1200, 3200, hypot(x, z)))) continue;
      const l = KL(x, z);
      if (abs(l[0]) < 300 && abs(l[1]) < 320) continue;
      if (hypot(x - CLOCK[0], z - CLOCK[1]) < 150) continue;
      const r = hypot(x, z);
      let t = CITY_LOW[(rnd() * CITY_LOW.length) | 0];
      if (r < 850 && rnd() < .28 * sstep(900, 450, r)) t = CITY_TALL[(rnd() * CITY_TALL.length) | 0];
      const sc = rr(.85, 1.05) * (t > 5 ? rr(.55, .85) : 1), yaw = -ang + (rnd() < .5 ? 0 : PI / 2);
      solid((r < 1000 ? detIds : cityIds)[t], x, fh(x, z) - .5, z, sc, yawQ(yaw), 17, rnd(), 0, CITY[t][1] * sc);
    }
  }

  // --- life: pigeons circling over the arcades and the courtyards round the Mataf
  rseed(13);
  const birds = [];
  for (const f of [[40, 26, -40, 30, 26, 1], [-55, 34, 30, 36, 24, -1], [30, 18, 60, 22, 16, -1], [-60, 50, -70, 50, 30, 1], [80, 40, 40, 30, 14, 1], [-20, 70, 110, 60, 20, -1]]) {
    const ss_ = rnd();
    for (let i = 0; i < f[4]; i++) birds.push(f[0], f[1], f[2], f[3], ss_ + rnd() * .2, f[5] * rr(.9, 1.1) * 7 / f[3], rr(1.4, 1.8), rnd());
  }
  const motes = new Float32Array(4000 * 4);
  for (let i = 0; i < motes.length; i++) motes[i] = rnd();

  // --- packing
  const fmap = new Uint8Array(FN * FN * 4);
  for (let k = 0; k < FN * FN; k++) { fmap[k * 4] = FAR.A[k * 4 + 1] * 255; fmap[k * 4 + 1] = FAR.A[k * 4 + 2] * 255; fmap[k * 4 + 2] = FAR.B[k * 4] * 255; fmap[k * 4 + 3] = FAR.B[k * 4 + 1] * 255; }
  const sol = { data: [], ranges: [] }; let si = 0;
  for (let m = 0; m < meshes.length; m++) { const a = solids[m] || []; sol.ranges.push([si, a.length / 12]); si += a.length / 12; for (let i = 0; i < a.length; i++) sol.data.push(a[i]); }
  // the scripted flight must keep clear of columns and walls (dev builds report a path that grazes one)
  for (const p of flyPts) {
    const [lx, lz] = KL(p[0], p[2]);
    for (let i = 0; i < CC.length; i += 4) if (p[1] < CC[i + 3] && hypot(lx - CC[i], lz - CC[i + 1]) < CC[i + 2] + .6) { console.warn(`fly path at ${p.map((v) => v.toFixed(1))} grazes an obstacle`); break; }
  }
  return { fh, gy, meshes, solids: { data: new Float32Array(sol.data), ranges: sol.ranges },
    birds: new Float32Array(birds), motes, fmap, CB: new Float64Array(CB), CC: new Float64Array(CC), farIds: new Set([...cityIds, ...detIds]) };
}
const fract = (x) => x - floor(x);
