// ============================================================================
// WGSL sources
// ============================================================================
// Noise, detail texture, blit/bloom and the composite chain follow Abyssal Garden (MIT); the air, sky, marble, the
// Kiswah, the arcades, the clock and the birds are this world's own. world.js loads first: its layout and time of day are baked in.

// smoothstep lives in its own string so modules that already have it (via S_G) can take the noise without it
const W_SS = /*wgsl*/`
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
`;
const W_NOISE = /*wgsl*/`
fn h31(p: vec3f) -> f32 { var q = fract(p * vec3f(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn h33(p: vec3f) -> vec3f { var q = fract(p * vec3f(.1031, .1030, .0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yxx) * q.zyx); }
fn vn(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(mix(h31(i), h31(i + vec3f(1., 0., 0.)), u.x), mix(h31(i + vec3f(0., 1., 0.)), h31(i + vec3f(1., 1., 0.)), u.x), u.y),
             mix(mix(h31(i + vec3f(0., 0., 1.)), h31(i + vec3f(1., 0., 1.)), u.x), mix(h31(i + vec3f(0., 1., 1.)), h31(i + vec3f(1., 1., 1.)), u.x), u.y), u.z);
}
fn fbm(p: vec3f, n: i32) -> f32 {
  var a = .5; var s = 0.; var q = p;
  for (var i = 0; i < n; i++) { s += a * vn(q); q = q * 2.03 + vec3f(17.1, 31.7, 5.3); a *= .5; }
  return s / (1. - 2. * a);
}
fn wor(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); var d = 9.;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) { for (var z = -1; z <= 1; z++) {
    let o = vec3f(f32(x), f32(y), f32(z)); let r = o + h33(i + o) - f; d = min(d, dot(r, r));
  } } }
  return sqrt(d);
}
`;


// ---------------------------------------------------------------- ground model (compute, load time)
// The Makkah valley out to 12 km, sampled every ~23 m: a flat floor round the Haram along the wadi that runs
// north-east to south-west, granite hills close by (east, west, north-west), ranges and peaks beyond.
// A = height, unused, granite, unused · B = city ground, unused
const W_GROUND = W_SS + W_NOISE + /*wgsl*/`
struct U { n: vec4u, o: vec4f };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read_write> A: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> B: array<vec4f>;
const HILLS = array<vec4f, 7>(vec4f(700., -60., 150., 330.), vec4f(-640., 170., 85., 280.), vec4f(-380., -760., 120., 300.),
  vec4f(-700., 3900., 470., 900.), vec4f(3600., -3300., 380., 700.), vec4f(1500., 1300., 210., 600.), vec4f(-1900., -1500., 260., 700.));
fn sat(x: f32) -> f32 { return clamp(x, 0., 1.); }
fn ridged(p: vec2f, s: f32) -> f32 { return 1. - abs(fbm(vec3f(p * s, 5.), 4) * 2. - 1.); }
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u.n.x || id.y >= u.n.y) { return; }
  let x = u.o.x + f32(id.x) * u.o.z; let z = u.o.y + f32(id.y) * u.o.z; let p2 = vec2f(x, z);
  let r = length(p2);
  // distance from the valley's axis (north-east to south-west through the Haram)
  let dv = abs(dot(p2, vec2f(.7071, .7071))) + 160. * (fbm(vec3f(x * .0012, 3., z * .0012), 3) - .5);
  var m = ss(380., 1100., dv) * (.55 + .45 * ss(500., 2500., r));
  m = max(m, ss(2500., 7000., r) * .8);
  let rg = ridged(p2, .0019); let rg2 = ridged(p2 + 400., .0052);
  var h = 2. * (fbm(vec3f(x * .004, 1.3, z * .004), 2) - .5) + .006 * max(dot(p2, vec2f(.7071, -.7071)), -800.);
  h += m * (290. * (.3 + .7 * pow(rg, 1.6)) + 80. * (rg2 - .5));
  for (var k = 0; k < 7; k++) {
    let c = HILLS[k]; let d = distance(p2, c.xy) / c.w;
    if (d < 1.) { let t = 1. - d; h += c.z * pow(t, 1.3) * (.75 + .5 * rg) + 30. * t * (rg2 - .5); m = max(m, ss(.0, .35, t)); }
  }
  h += 480. * ss(5500., 11000., r) * (.5 + .8 * fbm(vec3f(x * .0005, 9., z * .0005), 3));
  h = mix(h, -.3, ss(650., 440., r));
  let gran = sat(m * 1.4) * ss(4., 30., h);
  // the city fills the valley floor and climbs the lower slopes; the Haram's plazas stay open
  let kl = vec2f(.7071 * (x - z), .7071 * (x + z));
  let plaza = step(abs(kl.x), 235.) * step(abs(kl.y), 255.);
  let city = ss(5200., 1800., r) * ss(95., 25., h) * (1. - plaza);
  A[id.x + u.n.x * id.y] = vec4f(h, 0., gran, 0.);
  B[id.x + u.n.x * id.y] = vec4f(city, 0., 0., 0.);
}
`;

// ---------------------------------------------------------------- fullscreen helpers
const W_FS = /*wgsl*/`
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0., 1.); }
`;

// ---------------------------------------------------------------- physically based atmosphere (Hillaire 2020)
// Rayleigh + Mie + ozone in km, Earth radius 6360 km. Makkah lies ~280 m up in a dusty desert valley, so the Mie
// (aerosol) density is several times a clear sky's and its absorption leans blue, which warms the haze. The same
// media drive the sun colour (CPU, below), the sky (LUTs, main.js) and the aerial perspective.
// turb: aerosol multiple of a clear sky. haze: the dusty boundary layer over the valley (per km, ~1 km deep) that
// makes the ridges and the far city fade; dust: the 60 m ground layer
const ATM = { turb: [10, 8, 12][TOD], haze: [.1, .075, .04][TOD], dust: [2.1, 1, 1][TOD], alt: .28 };
const ATM_BR = [5.802e-3, 13.558e-3, 33.1e-3], ATM_BO = [.65e-3, 1.881e-3, .085e-3];
const ATM_BMS = 3.996e-3 * ATM.turb, ATM_BME = [4.5e-3, 4.75e-3, 5.2e-3].map((v) => v * ATM.turb);
const SUNV = SUN;
// sun transmittance from altitude h (km) to space, integrated on the CPU with the same media as the LUTs
const atmT = (h) => {
  const N = 600, r0 = 6360 + h, mu = SUNV[1], R2 = 6460 * 6460;
  const tmax = -r0 * mu + sqrt(r0 * r0 * (mu * mu - 1) + R2), dt = tmax / N, od = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const t = (i + .5) * dt, x = t * sqrt(1 - mu * mu), y = r0 + t * mu, hh = hypot(x, y) - 6360;
    const dr = exp(-hh / 8), dm = exp(-hh / 1.2), dz = max(0, 1 - abs(hh - 25) / 15);
    for (let c = 0; c < 3; c++) od[c] += (ATM_BR[c] * dr + ATM_BME[c] * dm + ATM_BO[c] * dz) * dt;
  }
  return od.map((v) => exp(-v));
};
// the solar scale keeps each preset's key-light brightness; the hue comes from the air it passes through. At night the
// moon gets a blue Purkinje tint, as the eye sees moonlight, so the night keeps its look.
const ATM_TS = atmT(ATM.alt), ATM_T6 = atmT(6), lum3 = (v) => v[0] * .2126 + v[1] * .7152 + v[2] * .0722;
const ATM_NT = NIGHT ? [.62, .78, 1.3] : [1, 1, 1];
const ATM_S = lum3(TD.sunc) / lum3(ATM_TS);
const SUNCP = ATM_TS.map((v, c) => v * ATM_S * ATM_NT[c] * (NIGHT ? .7 : 1)), CLOUDSUN = ATM_T6.map((v, c) => v * ATM_S * ATM_NT[c]);
const fl3 = (v) => v.map((x) => x.toPrecision(5)).join(', ');
const W_ATMC = /*wgsl*/`
const RG = 6360.; const RT = 6460.; const HR = 8.; const HM = 1.2; const MG = .76;
const BR = vec3f(${fl3(ATM_BR)}); const BO = vec3f(${fl3(ATM_BO)});
const BMS = vec3f(${ATM_BMS.toPrecision(5)}); const BME = vec3f(${fl3(ATM_BME)});
const SUNL = vec3f(${fl3(SUNV)}); const ALT = ${ATM.alt};
const PI = 3.1415927;
struct Md { sr: vec3f, sm: vec3f, e: vec3f };
fn medium(h: f32) -> Md {
  let dr = exp(-h / HR); let dm = exp(-h / HM);
  return Md(BR * dr, BMS * dm, BR * dr + BME * dm + BO * max(0., 1. - abs(h - 25.) / 15.));
}
fn phR(mu: f32) -> f32 { return .0596831 * (1. + mu * mu); }
fn phG(mu: f32, g: f32) -> f32 { let g2 = g * g; return .1193662 * (1. - g2) * (1. + mu * mu) / ((2. + g2) * pow(max(1. + g2 - 2. * g * mu, 1e-4), 1.5)); }
fn phM(mu: f32) -> f32 { return phG(mu, MG); }
fn tUV(r: f32, mu: f32) -> vec2f {
  let H = sqrt(RT * RT - RG * RG); let rho = sqrt(max(r * r - RG * RG, 0.));
  let d = max(-r * mu + sqrt(max(r * r * (mu * mu - 1.) + RT * RT, 0.)), 0.);
  let dmin = RT - r; let dmax = rho + H;
  return vec2f((d - dmin) / (dmax - dmin), rho / H);
}
// sky-view LUT: u = azimuth from the sun's vertical plane (0..pi, the sky is symmetric about it), v = elevation,
// squeezed toward the horizon where the colour changes fastest
fn svUV(rd: vec3f) -> vec2f {
  let h = vec2f(rd.x, rd.z); let s = vec2f(SUNL.x, SUNL.z);
  let az = acos(clamp(dot(h, s) / max(length(h) * length(s), 1e-5), -1., 1.)) / PI;
  let e = asin(clamp(rd.y, -1., 1.)) / (PI * .5);
  return vec2f(az, .5 + .5 * sign(e) * sqrt(abs(e)));
}
`;
// LUT passes, run once at load (the sun does not move)
const W_ATMLUT = W_FS + W_ATMC + /*wgsl*/`
@group(0) @binding(0) var tT: texture_2d<f32>;
@group(0) @binding(1) var tM: texture_2d<f32>;
@group(0) @binding(2) var sL: sampler;
fn trans(r: f32, mu: f32) -> vec3f {
  if (mu < 0. && r * r * (mu * mu - 1.) + RG * RG >= 0.) { return vec3f(0.); }
  return textureSampleLevel(tT, sL, tUV(r, mu), 0.).rgb;
}
fn hitR(r: f32, mu: f32, R: f32) -> f32 { let d = r * r * (mu * mu - 1.) + R * R; return select(-1., -r * mu - sqrt(max(d, 0.)), d >= 0.); }
fn tmaxOf(r: f32, mu: f32) -> f32 {
  let g = hitR(r, mu, RG);
  if (mu < 0. && g > 0.) { return g; }
  return -r * mu + sqrt(max(r * r * (mu * mu - 1.) + RT * RT, 0.));
}
@fragment fn fsT(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / vec2f(256., 64.);
  let H = sqrt(RT * RT - RG * RG); let rho = H * uv.y; let r = sqrt(rho * rho + RG * RG);
  let dmin = RT - r; let dmax = rho + H; let d = dmin + uv.x * (dmax - dmin);
  let mu = clamp(select((H * H - rho * rho - d * d) / (2. * r * d), 1., d <= 0.), -1., 1.);
  var od = vec3f(0.); let dt = d / 40.;
  for (var i = 0; i < 40; i++) {
    let t = (f32(i) + .5) * dt; let hh = sqrt(r * r + t * t + 2. * r * mu * t) - RG;
    od += medium(hh).e * dt;
  }
  return vec4f(exp(-od), 1.);
}
// multiple scattering (Hillaire 2020 sec. 5.5): second-order light from 64 directions, as a geometric series
@fragment fn fsM(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / 32.; let mus = uv.x * 2. - 1.; let r = RG + uv.y * (RT - RG) + .01;
  let sd = vec3f(sqrt(1. - mus * mus), mus, 0.);
  var L2 = vec3f(0.); var fm = vec3f(0.);
  for (var i = 0; i < 8; i++) { for (var j = 0; j < 8; j++) {
    let th = PI * 2. * (f32(i) + .5) / 8.; let ph = acos(1. - 2. * (f32(j) + .5) / 8.);
    let rd = vec3f(cos(th) * sin(ph), cos(ph), sin(th) * sin(ph));
    let tm = tmaxOf(r, rd.y); let dt = tm / 20.;
    var T = vec3f(1.); var L = vec3f(0.); var f = vec3f(0.);
    for (var k = 0; k < 20; k++) {
      let p = vec3f(0., r, 0.) + rd * (f32(k) + .5) * dt; let pr = length(p);
      let m = medium(pr - RG); let s = m.sr + m.sm; let e = max(m.e, vec3f(1e-7));
      let st = trans(pr, dot(p / pr, sd));
      let x = (vec3f(1.) - exp(-e * dt)) / e;
      L += T * s * st * .0795775 * x; f += T * s * x;
      T *= exp(-e * dt);
    }
    if (hitR(r, rd.y, RG) > 0. && rd.y < 0.) {
      let gp = vec3f(0., r, 0.) + rd * tm; let gn = normalize(gp);
      L += T * trans(RG, dot(gn, sd)) * max(dot(gn, sd), 0.) * .3 / PI;
    }
    L2 += L / 64.; fm += f / 64.;
  } }
  return vec4f(L2 / (vec3f(1.) - fm), 1.);
}
@fragment fn fsS(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / vec2f(192., 108.);
  let az = uv.x * PI; let v = uv.y * 2. - 1.; let e = sign(v) * v * v * PI * .5;
  let sh = normalize(vec2f(SUNL.x, SUNL.z)); let ch = vec2f(-sh.y, sh.x);
  let hd = sh * cos(az) + ch * sin(az);
  let rd = vec3f(hd.x * cos(e), sin(e), hd.y * cos(e));
  let r = RG + ALT; let tm = tmaxOf(r, rd.y); let mu = dot(rd, SUNL);
  let pR = phR(mu); let pM = phM(mu);
  var T = vec3f(1.); var L = vec3f(0.); var t0 = 0.;
  for (var k = 0; k < 40; k++) {
    let t1 = tm * pow((f32(k) + 1.) / 40., 2.); let dt = t1 - t0; let t = (t0 + t1) * .5; t0 = t1;
    let p = vec3f(0., r, 0.) + rd * t; let pr = length(p); let up = p / pr;
    let m = medium(pr - RG); let e = max(m.e, vec3f(1e-7));
    let ms = textureSampleLevel(tM, sL, vec2f(dot(up, SUNL) * .5 + .5, (pr - RG) / (RT - RG)), 0.).rgb;
    let S = (m.sr * pR + m.sm * pM) * trans(pr, dot(up, SUNL)) + (m.sr + m.sm) * ms;
    L += T * S * (vec3f(1.) - exp(-e * dt)) / e;
    T *= exp(-e * dt);
  }
  return vec4f(L, 1.);
}
`;

// surface detail texture (tileable): rg = slope, b = height, a = mottling
const W_DETAIL = W_SS + W_NOISE + W_FS + /*wgsl*/`
fn hp(p: vec2f, per: f32) -> f32 { return h31(vec3f(p - per * floor(p / per), per)); }
fn tn(p: vec2f, per: f32) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(hp(i, per), hp(i + vec2f(1., 0.), per), u.x), mix(hp(i + vec2f(0., 1.), per), hp(i + vec2f(1., 1.), per), u.x), u.y);
}
fn tf(uv: vec2f, per: f32, n: i32) -> f32 { var a = .5; var s = 0.; var pr = per; for (var i = 0; i < n; i++) { s += a * tn(uv * pr + f32(i) * 7.3, pr); pr *= 2.; a *= .5; } return s / (1. - 2. * a); }
fn tw(p: vec2f, per: f32) -> vec3f {
  let i = floor(p); let f = fract(p); var d = vec2f(9.); var id = 0.;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) {
    let o = vec2f(f32(x), f32(y)); let c = i + o; let cw = c - per * floor(c / per);
    let hh = h33(vec3f(cw, per)); let r = o + hh.xy - f; let l = dot(r, r);
    if (l < d.x) { d.y = d.x; d.x = l; id = hh.z; } else if (l < d.y) { d.y = l; }
  } }
  return vec3f(sqrt(d), id);
}
fn H(uv: vec2f) -> f32 {
  let wq = uv + .11 * (vec2f(tf(uv, 3., 4), tf(uv + .5, 3., 4)) - .5);
  let f = tf(wq, 3., 8);
  let r1 = 1. - abs(tf(wq + 1.7, 5., 6) * 2. - 1.);
  let cr = min(abs(tf(wq + 4.1, 4., 5) * 2. - 1.) * 7., 1.);
  let cr2 = min(abs(tf(wq.yx + 2.3, 9., 4) * 2. - 1.) * 9., 1.);
  let pt = tw(wq * 29., 29.);
  let pit = (1. - ss(.0, .34, pt.x)) * step(.62, pt.z);
  return f * .50 + r1 * r1 * .24 + cr * cr2 * .26 - pit * .07;
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / 1024.; let e = 1. / 1024.;
  let h = H(uv);
  let gx = H(uv + vec2f(e, 0.)) - H(uv - vec2f(e, 0.)); let gy = H(uv + vec2f(0., e)) - H(uv - vec2f(0., e));
  let s = clamp(vec2f(gx, gy) * 1024. * .5 * .075, vec2f(-1.), vec2f(1.));
  return vec4f(-s * .5 + .5, h, tf(uv + 3.7, 3., 5));
}
`;

// blit / mip / bloom chain
const W_BLIT = W_FS + /*wgsl*/`
@group(0) @binding(0) var t: texture_2d<f32>;
@group(0) @binding(1) var s: sampler;
fn uvOf(fc: vec4f, k: f32) -> vec2f { return fc.xy * k / vec2f(textureDimensions(t)); }
@fragment fn fsMip(@builtin(position) fc: vec4f) -> @location(0) vec4f { return textureSampleLevel(t, s, uvOf(fc, 2.), 0.); }
fn kar(c: vec3f) -> vec4f { let w = 1. / (1. + max(c.r, max(c.g, c.b))); return vec4f(c * w, w); }
@fragment fn fsDown0(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, 2.); let e = 1. / vec2f(textureDimensions(t));
  let a = kar(min(textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.).rgb, vec3f(24.)));
  let b = kar(min(textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.).rgb, vec3f(24.)));
  let c = kar(min(textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.).rgb, vec3f(24.)));
  let d = kar(min(textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.).rgb, vec3f(24.)));
  let m = a + b + c + d;
  return vec4f(m.rgb / m.a, 1.);
}
@fragment fn fsDown(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, 2.); let e = 1. / vec2f(textureDimensions(t));
  return (textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.)
        + textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.)) * .25;
}
@fragment fn fsUp(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, .5); let e = .75 / vec2f(textureDimensions(t));
  return (textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.)
        + textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.)) * .25;
}
`;


// ---------------------------------------------------------------- shared: uniforms, time of day, sky, air, layout
const f3 = (a) => `vec3f(${a.map((v) => (+v).toFixed(4)).join(', ')})`;
const S_G = /*wgsl*/`
// pvp: last frame's unjittered view-projection; jit: xy this frame's projection jitter in NDC, z history reset (1), w frame
// amb: sky light on an up-facing white surface, integrated from the sky-view LUT at load
struct G { vp: mat4x4f, sm: mat4x4f, cam: vec4f, right: vec4f, up: vec4f, fwd: vec4f, sun: vec4f, res: vec4f, mis: vec4f, pvp: mat4x4f, jit: vec4f, amb: vec4f, smc: mat4x4f };
const SUNC = vec3f(${fl3(SUNCP)}); const CLOUDSUN = vec3f(${fl3(CLOUDSUN)});
// sky radiance per unit of the LUT: pi * solar scale, because surfaces here take SUNC as irradiance / pi
const SKYS = vec3f(${fl3(ATM_NT.map((v) => v * ATM_S * PI * (NIGHT ? .45 : 1)))});
const ZEN = ${f3(TD.zen)};
const HORL = ${f3(TD.horL)};
const HORF = ${f3(TD.horF)};
const GND = ${f3(TD.gnd)};
const LIGHTS = ${TD.lights.toFixed(2)};
const SUN_ = vec3f(${SUN.map((v) => v.toFixed(4)).join(', ')});
const NIGHT = ${NIGHT};
const DAWN = ${TOD === 0};
const TAU = 6.2831853;
const LUMA = vec3f(.2126, .7152, .0722);
const S2 = .70710678;
const LOW = ${LV > 1};
const KH = vec3f(${KHX}, ${KH}, ${KHZ}); const BAND = vec2f(${BAND0}, ${BAND1});
const DOOR = vec4f(${DOORZ}, ${DOOR0}, ${DOOR1}, ${DOORW});
const OT = vec2f(${OTX}., ${OTZ}.); const SA = vec2f(${SAX}., ${SAZ}.); const BAY = ${BAY}.;
const CLOCK = vec2f(${CLOCK[0]}., ${CLOCK[1]}.);
// floodlight colour for the Mataf at night (warm white, 3000 K-ish), and the lamp colour
const FLOODC = vec3f(1., .88, .72) * ${NIGHT ? '.2' : '0.'};
const LAMPC = vec3f(1., .66, .34);
fn sat(x: f32) -> f32 { return clamp(x, 0., 1.); }
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(.06711056, .00583715)))); }
fn hs(x: f32) -> f32 { return fract(sin(x * 127.1) * 43758.5453); }
fn h2(p: vec2f) -> f32 { var q = fract(vec3f(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn fin(c: vec3f) -> vec4f { return vec4f(min(max(c, vec3f(0.)), vec3f(60.)), 1.); }
// world xz -> Kaaba frame (x toward the north-east wall, z toward the south-east wall)
fn KL(p: vec2f) -> vec2f { return vec2f(S2 * (p.x - p.y), S2 * (p.x + p.y)); }
// box-filtered coverage of a line of half width w at distance d, for a pixel footprint fw
fn cov(d: f32, w: f32, fw: f32) -> f32 { let h = max(fw, 1e-4) * .5; return max(min(w, d + h) - max(-w, d - h), 0.) / (2. * h); }
fn qrot(q: vec4f, v: vec3f) -> vec3f { return v + 2. * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
`;

const S_B = S_G + W_ATMC + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sR: sampler;
@group(0) @binding(2) var sC: sampler;
@group(0) @binding(3) var sS: sampler_comparison;
@group(0) @binding(4) var tSh: texture_depth_2d;
@group(0) @binding(5) var tD: texture_2d<f32>;
@group(0) @binding(8) var tF: texture_2d<f32>;
@group(0) @binding(9) var tK: texture_2d<f32>;
@group(0) @binding(10) var tSV: texture_2d<f32>;
@group(0) @binding(11) var tMS: texture_2d<f32>;
@group(0) @binding(12) var tShC: texture_depth_2d;
// the city map: 2x2 taps, 1 outside its box
fn shadowC(p: vec3f) -> f32 {
  let s = g.smc * vec4f(p, 1.); let uv = vec2f(s.x * .5 + .5, .5 - s.y * .5);
  let inb = step(abs(s.x), .995) * step(abs(s.y), .995);
  let e = .7 / ${LV ? 2048 : 4096}.; var a = 0.;
  for (var k = 0; k < 4; k++) { a += textureSampleCompareLevel(tShC, sS, uv + vec2f(f32(k & 1) - .5, f32(k >> 1) - .5) * e, s.z - .00012); }
  return mix(1., a * .25, inb);
}
// sky radiance in direction rd, from the sky-view LUT; at night the lit city glows low on the horizon all round.
// Below the horizon it turns to the valley floor's colour.
fn skyCol(rd: vec3f, sun: vec3f) -> vec3f {
  var c = textureSampleLevel(tSV, sC, svUV(vec3f(rd.x, max(rd.y, 0.), rd.z)), 0.).rgb * SKYS;
  if (NIGHT) { c += vec3f(.30, .16, .07) * .22 * pow(sat(1. - max(rd.y, 0.) * 7.), 2.5); }
  let h = vec2f(rd.x, rd.z); let tw = .5 + .5 * dot(h / max(length(h), 1e-4), normalize(sun.xz));
  let gnd = select(mix(GND * .55, HORL * .8, tw), vec3f(.035, .03, .028), NIGHT);
  return mix(c, gnd, sat(-rd.y * 5.));
}
// aerial perspective from the same media, in closed form: optical depth of each exponential layer along the ray,
// single scattering of the sun (Rayleigh and Mie phase) plus the LUT's multiple scattering, a ~1 km boundary-layer
// haze and a 60 m dust layer over the floor. Far away it hands over to the sky LUT so the horizon has no seam.
struct Air { t: vec3f, i: vec3f };
const DUST = vec3f(1.2e-4, 1.3e-4, 1.45e-4) * ${ATM.dust};
// dust absorbs a little more blue than red, which is what warms the haze
const HAZE = vec3f(.9, 1., 1.12) * ${ATM.haze};
fn airAt(cam: vec3f, wp: vec3f, sun: vec3f) -> Air {
  let v = wp - cam; let d = max(length(v), 1e-3); let rd = v / d;
  let hc = max(cam.y, -30.) * 1e-3 + ALT; let dk = d * 1e-3;
  let kr = rd.y / HR; let km = rd.y / HM; let k2 = rd.y / 60.;
  let odR = select((1. - exp(-kr * dk)) / kr, dk, abs(kr) < 1e-6) * exp(-hc / HR);
  let odM = select((1. - exp(-km * dk)) / km, dk, abs(km) < 1e-6) * exp(-hc / HM);
  let od2 = select((1. - exp(-k2 * d)) / k2, d, abs(k2) < 1e-7) * exp(-max(cam.y, -30.) / 60.);
  let kh = rd.y / 1.;
  let odH = select((1. - exp(-kh * dk)) / kh, dk, abs(kh) < 1e-6) * exp(-max(cam.y, -30.) * 1e-3);
  let sR = BR * odR; let sM = BMS * odM; let sD = DUST * .9 * od2 + HAZE * .85 * odH;
  let tau = sR + BME * odM + DUST * od2 + HAZE * odH;
  let T = exp(-tau);
  let mu = dot(rd, sun);
  let ms = textureSampleLevel(tMS, sC, vec2f(sun.y * .5 + .5, ALT / (RT - RG)), 0.).rgb;
  var ins = (SUNC * PI * (sR * phR(mu) + sM * phM(mu) + sD * phG(mu, .45)) + SKYS * ms * (sR + sM + sD)) * (vec3f(1.) - T) / max(tau, vec3f(1e-7));
  ins = mix(ins, skyCol(normalize(vec3f(rd.x, max(rd.y, 0.) * .3 + .012, rd.z)), sun) * (vec3f(1.) - T), ss(4000., 16000., d));
  return Air(T, ins);
}
fn aerialAt(c: vec3f, cam: vec3f, wp: vec3f, sun: vec3f) -> vec3f { let a = airAt(cam, wp, sun); return c * a.t + a.i; }
fn shUV(p: vec3f) -> vec3f { let s = g.sm * vec4f(p, 1.); return vec3f(s.x * .5 + .5, .5 - s.y * .5, s.z - .0003); }
fn shK(s: vec3f) -> f32 { let e = min(min(s.x, 1. - s.x), min(s.y, 1. - s.y)); return ss(0., .01, e) * step(s.z, 1.); }
fn shadow1(p: vec3f) -> f32 { let s = shUV(p); return mix(shadowC(p), textureSampleCompareLevel(tSh, sS, s.xy, s.z), shK(s)); }
fn shadow9(p: vec3f) -> f32 {
  if (LOW) { return shadow1(p); }
  let s = shUV(p); let e = 2.1 / ${SHADOW}.; var a = 0.;
  let r = h2(floor(p.xz * 233.) + floor(p.y * 197.)) * TAU; let cr = cos(r); let sr = sin(r);
  for (var x = 0; x < 4; x++) { for (var y = 0; y < 4; y++) { let o = vec2f(f32(x), f32(y)) - 1.5; a += textureSampleCompareLevel(tSh, sS, s.xy + vec2f(o.x * cr - o.y * sr, o.x * sr + o.y * cr) * e, s.z); } }
  return mix(shadowC(p), a / 16., shK(s));
}
// 1 when p is under the roof of an arcade aisle (Ottoman: between the inner row and the later arcade)
fn aisle(l: vec2f, y: f32) -> f32 {
  let a = abs(l);
  let inX = ss(OT.x - .5, OT.x + 1., a.x) * step(a.y, SA.y);
  let inZ = ss(OT.y - .5, OT.y + 1., a.y) * step(a.x, SA.x);
  return max(inX, inZ) * step(a.x, SA.x + .2) * step(a.y, SA.y + .2) * ss(8.4, 7.6, y);
}
// how much open sky a point sees: less at the foot of the Kaaba and of the later arcade, little in the aisles
fn skyOcc(p: vec3f) -> f32 {
  let l = KL(p.xz); let a = abs(l);
  let dk = length(max(a - KH.xz, vec2f(0.)));
  var o = mix(.3, 1., ss(0., 2.2, dk + p.y * .45)) * mix(.8, 1., ss(0., 9., dk));
  if (p.y < 1.6) {
    let dm = length(l - vec2f(${MAQAM[0]}, ${MAQAM[1]})) - 1.05;
    o *= mix(.45, 1., ss(0., 1.1, dm + p.y * .9));
    let hq = vec2f(l.x / 5.05, (l.y + KH.z + 2.35) / 7.2);
    let hd = select(abs(length(hq) - 1.) * 6. - .75, 9., l.y > -KH.z - 2.35);
    o *= mix(.5, 1., ss(0., 1.3, hd + max(p.y - 1.31, 0.) * 3. + p.y * .3));
  }
  let dw = min(SA.x - a.x, SA.y - a.y);
  o *= mix(.7, 1., ss(0., 14., dw + max(p.y - 8., 0.) * .4));
  return o * (1. - .55 * aisle(l, p.y));
}
fn amb(n: vec3f, sky: f32) -> vec3f {
  let up = n.y * .5 + .5;
  let toSun = sat(dot(normalize(vec3f(n.x, 0., n.z) + vec3f(0., 1e-4, 0.)), normalize(vec3f(SUN_.x, 0., SUN_.z)))) * (1. - abs(n.y));
  return HORL * .3 * toSun * toSun * (.4 + .6 * sky) + g.amb.xyz * up * up * (.35 + .65 * sky) + GND * .72 * (1. - up) * (.65 + .35 * sky) + GND * .16 * (.5 + .5 * sky);
}
// the hanging lanterns in the inner Ottoman arches, as point lights on whatever is near them
fn lamps(p: vec3f, n: vec3f) -> vec3f {
  if (LIGHTS < .5) { return vec3f(0.); }
  let l = KL(p.xz); var acc = 0.;
  let nl = vec3f(S2 * (n.x - n.z), n.y, S2 * (n.x + n.z));
  for (var k = 0; k < 2; k++) {
    var q: vec3f;
    if (k == 0) { q = vec3f(sign(l.x) * (OT.x + .3), 5.7, clamp(floor(l.y / BAY) * BAY + BAY * .5, -OT.y + 2.5, OT.y - 2.5)); }
    else { q = vec3f(clamp(floor(l.x / BAY) * BAY + BAY * .5, -OT.x + 2.5, OT.x - 2.5), 5.7, sign(l.y) * (OT.y + .3)); }
    let d = q - vec3f(l.x, p.y, l.y); let dd = dot(d, d);
    acc += sat(dot(nl, d * inverseSqrt(max(dd, 1e-4))) * .8 + .2) / (1. + dd * .35);
  }
  return LAMPC * LIGHTS * .05 * acc;
}
// the floodlit Mataf at night: light from the arcade roofs all round and from above
fn flood(p: vec3f, n: vec3f) -> vec3f {
  if (!NIGHT) { return vec3f(0.); }
  return FLOODC * ss(170., 70., length(p.xz)) * (.55 + .45 * n.y);
}
fn aerial(c: vec3f, wp: vec3f) -> vec3f { return aerialAt(c, g.cam.xyz, wp, g.sun.xyz); }
// second target: the share of the pixel's light that is ambient (sky, bounce, floodlight), so screen-space AO
// darkens only that part and never the sunlit or emissive part
struct FO { @location(0) c: vec4f, @location(1) a: vec4f };
fn outA(c: vec3f, amb: vec3f, wp: vec3f) -> FO {
  let air = airAt(g.cam.xyz, wp, g.sun.xyz);
  let col = min(max(min(max(c, vec3f(0.)), vec3f(60.)) * air.t + air.i, vec3f(0.)), vec3f(60.));
  return FO(vec4f(col, 1.), vec4f(sat(dot(amb * air.t, LUMA) / max(dot(col, LUMA), 1e-5))));
}
`;

// ---------------------------------------------------------------- solids: floor, Kaaba, arcades, minarets, city
// instance c: x material, y seed, z distance at which the mesh has shrunk away (0 = never), w variant
const W_SOLID = S_B + /*wgsl*/`
struct VI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) a: vec4f, @location(3) b: vec4f, @location(4) c: vec4f };
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) op: vec3f, @location(3) on: vec3f,
  @location(4) @interpolate(flat) m: vec4f, @location(5) @interpolate(flat) q: vec4f, @location(6) ao: f32 };
@vertex fn vs(i: VI) -> VO {
  var o: VO;
  let lp = i.p * i.a.w;
  let w = i.a.xyz + qrot(i.b, lp);
  let mt = i.c.x;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = qrot(i.b, i.n.xyz);
  o.op = select(lp, w, mt < 1.5); o.on = i.n.xyz;
  o.m = i.c; o.q = i.b; o.ao = i.n.w;
  return o;
}
struct TP { h: f32, c: f32, n: vec3f };
fn tri(p: vec3f, n: vec3f, s: f32) -> TP {
  var w = pow(abs(n), vec3f(4.)); w /= (w.x + w.y + w.z);
  let x = textureSample(tD, sR, p.zy * s); let y = textureSample(tD, sR, p.xz * s); let z = textureSample(tD, sR, p.xy * s);
  var o: TP;
  o.h = x.b * w.x + y.b * w.y + z.b * w.z;
  o.c = x.a * w.x + y.a * w.y + z.a * w.z;
  let a = x.rg * 2. - 1.; let b = y.rg * 2. - 1.; let c = z.rg * 2. - 1.;
  o.n = vec3f(0., a.y, a.x) * w.x + vec3f(b.x, 0., b.y) * w.y + vec3f(c.x, c.y, 0.) * w.z;
  return o;
}
// pointed-arch arcade painted on the plain facades: bay width bw, opening height ah; 1 inside an opening
fn arcade(u: f32, v: f32, bw: f32, ah: f32, v0: f32) -> f32 {
  let x = (fract(u / bw) - .5) * bw; let hw = bw * .36;
  let y = v - v0;
  let top = ah + hw * 1.15 * sqrt(max(1. - (x / hw) * (x / hw), 0.)) - abs(x) * .35;
  return step(abs(x), hw) * step(0., y) * step(y, top);
}
// signed distance outside a two-centred arch of half width hw springing at ys with arc radius R (local u, v);
// y = index of the voussoir the point is in
fn archD(bu: f32, v: f32, hw: f32, ys: f32, R: f32) -> vec2f {
  let dv = v - ys;
  if (dv <= 0.) { return vec2f(abs(bu) - hw, -1.); }
  let cu = sign(bu) * (hw - R);
  let r = vec2f(bu - cu, dv);
  return vec2f(length(r) - R, floor(atan2(dv, abs(bu - cu)) / .14));
}
// abstract embroidery in a script-like rhythm: a waving baseline, slanted tapering uprights, long swashes that
// overlap their neighbours, small loops and diamond dots, all chosen at random. The layers interlace, so no
// stroke group stands alone as a letter: it reads as calligraphy from a distance and contains no letters or words.
// u: metres along the band, v: 0..1 across the line of "script", H: its height in metres. Returns coverage.
fn script(u: f32, v: f32, H: f32, fw: f32, sd: f32) -> f32 {
  let y = (v - .34) * H;
  var d = abs(y - .015 * sin(u * 23. + sd * 3.)) - .018;
  // uprights, slanted like thuluth and thinning toward the top
  let us = u - max(y, 0.) * .3; let cw = .1; let ci = floor(us / cw); let xs = (fract(us / cw) - .5) * cw;
  let r1 = h2(vec2f(ci, sd)); let r2 = h2(vec2f(ci + 17.3, sd)); let r3 = h2(vec2f(ci - 9.1, sd * 1.7));
  // uprights never stand alone: each ends in a leaf, or is joined to its neighbour by a pointed arch at the top,
  // so the strokes read as an ornamental border and not as letters
  for (var k = -1; k <= 0; k++) {
    let c = ci + f32(k); let x = xs - f32(k) * cw;
    let q1 = h2(vec2f(c, sd)); let q2 = h2(vec2f(c + 17.3, sd));
    if (q1 < .5) {
      let tp = H * (.4 + .2 * q2);
      d = min(d, abs(x) - .022 * (1. - .4 * sat(y / tp)) + max(max(-y, y - tp), 0.));
      if (q2 < .55) { d = min(d, abs(length(vec2f(x - cw * .5, max(y - tp, 0.) * 1.3)) - cw * .5) - .015 + max(tp - y, 0.) * 3.); }
      else { d = min(d, abs(x) * 1.4 + abs(y - tp - .035) - .032); }
    }
  }
  // small loops sitting on the baseline
  if (r1 > .62 && r1 < .8) { d = min(d, abs(length(vec2f(xs, y - .034)) - .03) - .012); }
  // swashes: long shallow bowls under the baseline that rise at their ends, two neighbouring groups each
  let gw = .42; let gi = floor(u / gw);
  for (var k = -1; k <= 0; k++) {
    let g = gi + f32(k); let hg = h2(vec2f(g, sd + 5.)); let hb = h2(vec2f(g * 1.7, sd + 9.));
    if (hg > .3) {
      let a = gw * (.55 + .5 * hb); let b = H * (.14 + .12 * hg);
      let c = vec2f((g + .5 + (hb - .5) * .5) * gw, H * .06);
      let q = (vec2f(u, y) - c) / vec2f(a, b);
      d = min(d, (abs(length(q) - 1.) * min(a, b)) - .017 + max(q.y, 0.) * b);
    }
  }
  // diamond dots above and below
  if (r3 > .58) { let dy = select(-.2, .52, r2 > .4) * H; d = min(d, abs(xs - (r1 - .5) * .03) + abs(y - dy) - .02); }
  let c = sat(-d / max(fw, 1e-4) + .5);
  return mix(c, .5, ss(.04, .11, fw));
}
// polished marble floor. rgb = albedo, a = polish. Mataf: very white; aisles: bands and a star per bay; plaza: paving
fn floorMat(p: vec2f, fw: f32, vein: f32) -> vec4f {
  let l = KL(p); let a = abs(l);
  let jx = abs(fract(l / vec2f(1.2, .8)) - .5) * vec2f(1.2, .8);
  let joint = max(cov(.6 - jx.x, .003, fw), cov(.4 - jx.y, .003, fw)) * (1. - ss(.004, .02, fw));
  let id = floor(l / vec2f(1.2, .8)); let hh = h2(id);
  var mataf = vec3f(.72, .715, .70) * (.975 + .04 * hh) * (.96 + .05 * vein);
  mataf = mix(mataf, vec3f(.62, .63, .65), vein * .3);
  mataf *= 1. - .38 * joint;
  let jb = abs(fract(l / 4.8) - .5) * 4.8;
  mataf *= 1. - .25 * max(cov(2.4 - jb.x, .008, fw), cov(2.4 - jb.y, .008, fw)) * (1. - ss(.02, .06, fw));
  // aisle: grey border band at each bay, a star in the middle of every bay
  let q = l - BAY * (floor(l / BAY) + .5); let aq = abs(q);
  let star = min(max(aq.x, aq.y) - 1.2, (aq.x + aq.y) * .70711 - 1.2);
  var ais = vec3f(.70, .68, .64) * (.96 + .05 * hh);
  ais = mix(ais, vec3f(.36, .35, .35), cov(BAY * .5 - max(aq.x, aq.y), .22, fw));
  ais = mix(ais, vec3f(.62, .52, .40), sat(-star / max(fw, 1e-3) + .5) * .7);
  ais = mix(ais, vec3f(.30, .29, .29), cov(abs(star), .05, fw));
  // beyond the later arcade: grey-white paving with darker bands every 12 m
  let pq = abs(fract(p / 12.) - .5) * 12.;
  var pav = vec3f(.62, .61, .59) * (.95 + .07 * h2(floor(p / 1.5)));
  pav = mix(pav, vec3f(.45, .44, .43), max(cov(6. - pq.x, .3, fw), cov(6. - pq.y, .3, fw)) * (1. - ss(.05, .25, fw)));
  let inM = step(a.x, OT.x) * step(a.y, OT.y);
  let inA = step(a.x, SA.x) * step(a.y, SA.y) * (1. - inM);
  var c = mix(pav, ais, inA); c = mix(c, mataf, inM);
  return vec4f(c, mix(mix(.25, .45, inA), .75, inM));
}
// a ray against the Kaaba box in its own frame: x = distance (or -1), y = height of the hit
fn kaabaHit(o: vec3f, d: vec3f) -> vec2f {
  let inv = 1. / select(d, vec3f(1e-6), abs(d) < vec3f(1e-6));
  let t0 = (vec3f(-KH.x, 0., -KH.z) - o) * inv; let t1 = (vec3f(KH.x, KH.y, KH.z) - o) * inv;
  let tn = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
  let tf = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
  if (tn > 0. && tn < tf) { return vec2f(tn, o.y + d.y * tn); }
  return vec2f(-1., 0.);
}
// what the polished floor mirrors: the Kaaba (black, the gold band), the lit arcades, otherwise the sky
fn floorRefl(p: vec3f, R: vec3f) -> vec3f {
  // honed-and-polished marble blurs the sky it mirrors, which pales its blue toward grey
  var col = skyCol(R, g.sun.xyz); col = mix(col, vec3f(dot(col, vec3f(.3, .59, .11))), .35);
  let l = KL(p.xz); let o = vec3f(l.x, p.y, l.y);
  let d = vec3f(S2 * (R.x - R.z), R.y, S2 * (R.x + R.z));
  let lit = SUNC * .35 + amb(vec3f(0., .3, 0.), 1.) + FLOODC * 1.2;
  // the arcades' faces: the Ottoman row to ~12 m, the later arcade to ~30 m
  let tx = (sign(d.x) * OT.x - o.x) / select(d.x, 1e-6, abs(d.x) < 1e-6);
  let tz = (sign(d.z) * OT.y - o.z) / select(d.z, 1e-6, abs(d.z) < 1e-6);
  let t = min(select(1e9, tx, tx > 0.), select(1e9, tz, tz > 0.));
  if (t < 1e8) {
    let q = o + d * t;
    let hO = 11.5 + 18. * ss(0., 30., t * .1);
    let k = ss(hO + 1., hO - 1., q.y);
    let uu = select(q.x, q.z, tx < tz);
    let band = ss(1., 6., q.y) * ss(9., 7., q.y);
    col = mix(col, mix(vec3f(.70, .65, .57) * lit, vec3f(.3, .26, .21) * lit + LAMPC * LIGHTS * .05, band * .6), k * .85);
  }
  var kr = vec3f(0.); var kw = 0.;
  for (var j = 0; j < 4; j++) {
    let jo = vec2f(f32(j & 1) - .5, f32(j >> 1) - .5) * .05;
    let dj = normalize(d + vec3f(jo.x, 0., jo.y));
    let kh = kaabaHit(o, dj);
    if (kh.x > 0.) {
      let band = ss(BAND.x - .2, BAND.x + .2, kh.y) * ss(BAND.y + .2, BAND.y - .2, kh.y);
      kr += mix(mix(vec3f(.015, .015, .016) + lit * .006, vec3f(.95, .66, .26) * lit * .5, band), col, .55 * ss(4., 40., kh.x)); kw += 1.;
    }
  }
  col = mix(col, kr / max(kw, 1.), kw * .25);
  return col;
}
@fragment fn fs(i: VO, @builtin(front_facing) ff: bool) -> FO {
  let mat = i32(i.m.x + .5); let sd = i.m.y; let fl_ = select(-1., 1., ff);
  let on = normalize(i.on) * fl_; let n0 = normalize(i.n) * fl_;
  let dist = length(i.wp - g.cam.xyz);
  let far = mat == 1;
  let ts = select(select(1., .035, far), .5, mat >= 5);
  let A = tri(i.op, on, .07 * ts); let B = tri(i.op, on, .31 * ts); let C = tri(i.op, on, 1.3 * ts);
  let Lg = textureSample(tD, sR, i.wp.xz * .0045 + .31);
  // districts: two very low-frequency lookups (1.4 and 3.2 km periods) give whole neighbourhoods a shared age
  // (grime, darker roofs, dust in the streets) and tone (warm ochre, cool grey, fresh whitewash)
  let D1 = textureSample(tD, sR, i.wp.xz * .0007 + .17); let D2 = textureSample(tD, sR, i.wp.xz * .00031 + .63);
  let dAge = ss(.38, .66, D1.a * .6 + D2.b * .4); let dTone = ss(.3, .7, D2.a); let dWash = ss(.62, .78, D1.b);
  let fm = textureSample(tF, sC, i.wp.xz / 24000. + .5);
  let fwp = length(fwidth(i.wp.xz)); let fw3 = length(fwidth(i.wp)); let fwop = length(fwidth(i.op));
  let vt = textureSample(tD, sR, i.wp.xz * .11 + vec2f(.37, .71));
  var bump = 1.; var gloss = .08; var alb = vec3f(.5); var emi = vec3f(0.); var metal = 0.; var vao = 1.; var polish = 0.; var pert = vec3f(0.); var sheen = 0.;
  let flt = ss(.7, .92, n0.y);
  // facade coordinates: along the wall and up it, in the mesh's own frame
  let fu = select(i.op.z, i.op.x, abs(on.z) > abs(on.x)); let fv = i.op.y; let wall = 1. - ss(.45, .7, abs(on.y));
  let wfade = 1. - ss(.25, .6, fwidth(fu / 3.4) + fwidth(fv / 3.3));
  // rooms behind the glass show while a window is a dozen pixels or more across
  let ifade = 1. - ss(.15, .5, fwidth(fu) + fwidth(fv));
  if (mat <= 1) {
    let gran = fm.g; let city = fm.b;
    var gr = mix(vec3f(.25, .23, .22), vec3f(.40, .36, .32), A.c) * (.6 + .6 * B.h);
    gr = mix(gr, gr * vec3f(.62, .6, .6), ss(.5, .8, B.c) * .6);
    alb = mix(vec3f(.56, .46, .36), vec3f(.66, .56, .44), sat(A.c * .9 + Lg.a * .9 - .55)) * (.75 + .4 * mix(B.h, Lg.b, .45));
    alb = mix(alb, gr, sat(gran * 1.3) * (1. - .2 * flt));
    alb = mix(alb, mix(vec3f(.48, .46, .43) * (.9 + .14 * C.c), vec3f(.66, .63, .58), ss(.85, .97, city)), ss(.05, .25, city));
    let sq = abs(fract(i.wp.xz / 46.) - .5) * 46.; let sq2 = abs(fract(i.wp.xz / 230. + .3) - .5) * 230.;
    let street = max(cov(sq.x, 2.5, fwp), cov(sq.y, 2.5, fwp)) * ss(.45, .75, city) * .5 * (1. - ss(.5, 3., fwp)); let _u = sq2;
    alb = mix(alb, mix(vec3f(.17, .165, .16) * (.85 + .3 * C.c), vec3f(.42, .39, .34), ss(.45, .75, Lg.a + dAge * .3)), street * .8);
    emi = vec3f(1., .7, .4) * LIGHTS * .03 * street * f32(NIGHT);
    bump = mix(.8, .2, ss(.05, .2, city)); gloss = .03;
  } else if (mat == 7 || mat == 17) {
    // plain stone (the expansions, 7, arcades painted on) and the city's hotels and houses (17, windows by floor)
    let hh = hs(sd * 3.7);
    let ct = select(select(select(select(select(vec3f(.66, .60, .50), vec3f(.55, .49, .42), hh > .25), vec3f(.70, .69, .66), hh > .45), vec3f(.46, .45, .44), hh > .62), vec3f(.62, .52, .40), hh > .78), vec3f(.58, .56, .52), hh > .9);
    // real pale stone and render reflect .6-.72 of the light, not .8+: brighter washes every sunlit wall to flat white.
    // Plaster is never one flat tone: trowel marks, patches, broad stains, and grime at the foot of every wall
    alb = select(vec3f(.68, .65, .60), ct, mat == 17) * (.8 + .3 * B.h) * (.9 + .16 * C.c) * mix(1., .84, ss(.5, .82, A.c));
    alb *= mix(.72, 1., ss(0., 3.5, fv));
    if (mat == 17) {
      alb *= mix(vec3f(1.), vec3f(.82, .76, .68), ss(.3, .7, Lg.a)) * mix(vec3f(1.), vec3f(.84, .86, .9), ss(.4, .8, Lg.b)) * (.85 + .3 * hs(sd * 7.));
      alb = mix(alb * mix(vec3f(.93, .96, 1.02), vec3f(1.07, .98, .84), dTone), vec3f(.68, .66, .62) * (.92 + .1 * B.h), dWash * .7);
      alb *= mix(1., .8, dAge * (1. - dWash));
    }
    // near-city parts tagged in the vertex aux: carved wood, metal and plastic, bare concrete and stone trim
    let sub = i.ao;
    if (mat == 17 && sub < -.1) {
      if (sub > -.4) {
        let lat = step(.3, fract(fu * 5.)) * step(.3, fract(fv * 5.));
        alb = mix(vec3f(.22, .13, .07), vec3f(.36, .22, .12), hs(sd * 19.)) * (.55 + .45 * lat) * (.85 + .3 * C.c); gloss = .15;
      } else if (sub > -.65) {
        alb = mix(vec3f(.62, .62, .6), vec3f(.48, .5, .52), hs(floor(fu * 2.) + sd)) * (.85 + .2 * B.h); gloss = .4;
      } else {
        alb = alb * vec3f(.93, .92, .92) * (.85 + .2 * B.h);
      }
    } else if (mat == 17) {
      let bw = mix(2.6, 4.2, hs(sd * 11.)); let ww = mix(.2, .38, hs(sd * 13.));
      let wx = fract(fu / bw); let wy = fract(fv / 3.3); let flr = floor(fv / 3.3); let bay = floor(fu / bw);
      let win = step(.5 - ww, wx) * step(wx, .5 + ww) * step(.28, wy) * step(wy, .78) * step(1., flr) * wall * step(fv, i.m.w - 1.) * wfade;
      let lit = step(select(.9, .55, NIGHT), hs(flr * 13.1 + bay * 7.7 + sd * 31.));
      let frame = step(.5 - ww - .05, wx) * step(wx, .5 + ww + .05) * step(.24, wy) * step(wy, .82) * step(1., flr) * wall * step(fv, i.m.w - 1.) * wfade * (1. - win);
      // window frames: white on some buildings, dark aluminium on others
      alb = mix(alb, select(alb * 1.1 + .03, vec3f(.2, .2, .21), hs(sd * 37.) > .5), frame);
      // grime washed down from the window sills, strongest just below each opening, heavier in old districts
      let streak = ss(.5, .9, hs(floor(fu * 2.3) * 7.1 + sd * 3.) * (.7 + .6 * B.h)) * ss(.3, .0, wy) * step(1., flr) * wall * wfade;
      alb *= 1. - (.12 + .2 * dAge) * streak * (.6 + .4 * hs(bay * 5.1 + sd));
      alb = mix(alb, vec3f(.05, .055, .06), win * .9);
      alb = mix(alb, alb * vec3f(.66, .65, .64), (1. - wfade) * wall * (.5 + .4 * hs(sd * 5.)));
      // interior mapping: intersect the view ray with this window's room (side walls, floor, ceiling, back wall) in
      // the building's own frame, so each window shows a room with depth that shifts with the viewpoint
      let rdo = qrot(vec4f(-i.q.xyz, i.q.w), normalize(i.wp - g.cam.xyz));
      let xw = abs(on.z) <= abs(on.x);
      let rr3 = vec3f(select(rdo.x, rdo.z, xw), rdo.y, max(select(-rdo.z * sign(on.z), -rdo.x * sign(on.x), xw), .02));
      let ru = fu - bay * bw; let rv = fv - flr * 3.3; let rid = bay * 1.7 + flr * 2.9 + sd * 5.;
      let dep = mix(3.2, 6., hs(rid));
      let tu = (select(0., bw, rr3.x > 0.) - ru) / (rr3.x + select(-1e-5, 1e-5, rr3.x >= 0.));
      let tv = (select(0., 3.3, rr3.y > 0.) - rv) / (rr3.y + select(-1e-5, 1e-5, rr3.y >= 0.));
      let tw = dep / rr3.z; let tt = min(tu, min(tv, tw));
      let hp = vec3f(ru, rv, 0.) + rr3 * tt;
      let wallC = mix(vec3f(.56, .5, .42), vec3f(.4, .45, .48), hs(rid + 3.)) * (.8 + .3 * hs(rid + 7.));
      var rc = wallC * .85;
      if (tw <= tu && tw <= tv) { rc = wallC * mix(1., mix(.35, .7, hs(rid + 11.)), step(hp.y, .85) * step(.2, fract(hp.x / bw + hs(rid)))); }
      else if (tv < tu) { rc = select(vec3f(.72, .7, .66), mix(vec3f(.22, .15, .1), vec3f(.32, .3, .28), hs(rid + 13.)), rr3.y < 0.); }
      let inner = rc * mix(1., .4, hp.z / dep);
      let lamp = mix(mix(vec3f(1., .72, .45), vec3f(1., .9, .78), step(.55, hs(rid + 29.))), vec3f(.72, .84, 1.), step(.88, hs(rid + 31.))) * LIGHTS * .1 * (1. + .8 * ss(2.2, 3.3, hp.y)) * mix(1., .6, hp.z / dep);
      var room = inner * (g.amb.xyz * .55 + lamp * lit);
      // curtains drawn part way across some windows, glowing when the room is lit
      let cur = step(.4, hs(rid + 17.)) * hs(rid + 19.) * .8;
      room = mix(room, mix(vec3f(.62, .55, .45), vec3f(.5, .52, .56), hs(rid + 23.)) * (g.amb.xyz * .2 + lamp * lit * .9), step(1. - cur, abs(wx - .5) / ww));
      emi = (room * ifade + vec3f(1., .66, .36) * .1 * lit * LIGHTS * (1. - ifade)) * win;
      // beyond the window grid: the average of lit windows, varied per building so the far city is not one lit sheet
      emi += vec3f(1., .7, .4) * .016 * LIGHTS * (.2 + 1.6 * hs(sd * 43.)) * (1. - wfade) * wall * f32(NIGHT);
      // flat roofs: bare concrete, tar sheeting or white membrane
      let rh = hs(sd * 41.);
      let roof = select(select(vec3f(.44, .42, .38), vec3f(.15, .145, .14), rh > .55), vec3f(.6, .58, .54), rh > .85) * (.92 + .12 * C.c) * mix(1., .72, dAge);
      alb = mix(alb, roof, ss(.6, .9, on.y));
      gloss = mix(.08, .55, win);
    } else {
      let a1 = arcade(fu + 2.5, fv, 5., 5.2, .6) * wall * step(fv, 15.) * step(.5, i.m.w);
      let a2 = arcade(fu + 2.5, fv, 5., 5.2, 16.) * wall * step(fv, 30.) * step(.5, i.m.w);
      alb = mix(alb, vec3f(.07, .065, .06), max(a1, a2) * .9);
      emi = LAMPC * LIGHTS * .06 * max(a1, a2);
      alb = mix(alb, alb * vec3f(.86, .84, .8), ss(.92, .97, fract(fv / 15.)) * wall);
      let rq = abs(fract(vec2f(i.op.x, i.op.z) / 9.) - .5) * 9.;
      alb = mix(alb, mix(vec3f(.82, .81, .78), vec3f(.6, .59, .57), max(cov(4.5 - rq.x, .18, fwop), cov(4.5 - rq.y, .18, fwop))) * (.94 + .08 * B.c), ss(.6, .9, on.y));
    }
    bump = .05;
  } else if (mat == 25 || mat == 20) {
    // carved pale stone: ashlar courses; on the Ottoman arcade (w 1) alternating voussoirs round every arch
    alb = select(vec3f(.70, .65, .56), vec3f(.72, .70, .65), mat == 20) * (.92 + .12 * B.h) * (.94 + .1 * C.c) * mix(.8, 1., ss(0., 2.5, fv));
    let cj = max(cov(abs(fract(fv / .55) - .5) * .55 - .27, .005, fw3), cov(abs(fract(fu / 1.1 + floor(fv / .55) * .5) - .5) * 1.1 - .54, .005, fw3)) * wall;
    alb *= 1. - .25 * cj * (1. - ss(.02, .06, fw3));
    let xs = min(abs(abs(i.op.x) - OT.x - .3), abs(abs(i.op.x) - OT.x - 5.3)) < .5;
    if (mat == 25 && i.m.w > .5 && select(abs(on.z), abs(on.x), xs) > .9) {
      let bu = fract(select(i.op.x, i.op.z, xs) / BAY) * BAY - BAY * .5;
      let ad = archD(bu, fv, BAY * .5 - .32, 4.3, (BAY - .64) * .72);
      let bwid = .42;
      let vb = cov(ad.x - bwid * .5, bwid * .5, fw3) * step(-.5, ad.y) * step(fv, 7.9);
      alb = mix(alb, select(vec3f(.72, .68, .60), vec3f(.36, .31, .27), fract(ad.y * .5) > .25), vb);
      alb = mix(alb, alb * .8, cov(ad.x - bwid - .05, .04, fw3) * step(fv, 7.9) * step(-.5, ad.y));
    }
    if (mat == 25 && on.y < -.7) {
      // aisle ceilings: a ring under every dome
      let q = (fract(vec2f(i.op.x, i.op.z) / BAY) - .5) * BAY;
      alb = mix(vec3f(.72, .68, .60), vec3f(.50, .43, .33), max(cov(abs(length(q) - 1.9), .07, fwop), cov(abs(length(q) - 1.6), .03, fwop)));
    }
    if (mat == 20) {
      // minaret: blind pointed niches on the octagon faces of each stage, lit openings in the lantern, lamps under the balconies
      let ang = atan2(i.op.z, i.op.x); let fa = (fract(ang / TAU * 8. + .5) - .5) * TAU / 8.;
      let rr = length(i.op.xz); let fuo = rr * sin(fa);
      let k = i.m.w;
      let y = i.op.y / k;
      var st = vec3f(0.);
      if (y > 23.5 && y < 47.) { st = vec3f(24.5, 46., .8); }
      if (y > 53. && y < 66.) { st = vec3f(54., 65.2, .7); }
      if (y > 71. && y < 78.3) { st = vec3f(71.6, 77.6, .55); }
      if (y > 82.4 && y < 85.8) { st = vec3f(82.6, 85.4, .5); }
      if (st.z > 0. && rr < 4.2 * k && abs(on.y) < .5) {
        let ad = archD(fuo, y, st.z, st.y - st.z * 1.6, st.z * 1.5);
        let inN = step(st.x, y) * sat(-ad.x / max(fw3 / k, 1e-3) + .5);
        let lantern = step(82., y) * step(y, 86.);
        alb = mix(alb, mix(alb * .6, vec3f(.04, .035, .03), lantern), inN);
        emi += vec3f(1., .72, .42) * 2. * LIGHTS * inN * lantern;
        alb = mix(alb, alb * vec3f(.9, .84, .74), cov(max(ad.x, 0.) - .1, .07, fw3 / k) * step(st.x, y));
      }
      let bal = vec3f(48.4, 66.6, 78.8);
      for (var b = 0; b < 3; b++) { emi += vec3f(1., .7, .4) * .6 * LIGHTS * ss(bal[b] - .4, bal[b] + .6, y) * ss(bal[b] + 2.1, bal[b] + 1.3, y) * step(on.y, -.1); }
      alb = mix(alb, alb * vec3f(.9, .85, .76), cov(abs(fract(y / 3.05) - .5) * 3.05 - 1.48, .05, fw3 / k) * step(24., y));
      // at night the shafts are floodlit from their bases
      emi += alb * vec3f(1., .9, .76) * .15 * f32(NIGHT) * ss(140. * k, 10., i.op.y) * (.6 + .4 * hs(sd * 9.));
    }
    bump = .05; gloss = .12;
  } else if (mat == 10) {
    alb = select(vec3f(1., .74, .32), vec3f(.72, .5, .2), i.m.w > .5); gloss = select(.85, .5, i.m.w > .5); metal = 1.; bump = 0.;
  } else if (mat == 22) {
    alb = vec3f(.9, .85, .7); emi = vec3f(2.6, 1.75, .95) * 1.6 * max(LIGHTS, .6) * (.9 + .2 * sd); gloss = .8;
  } else if (mat == 23) {
    alb = vec3f(.50, .38, .19) * (.9 + .2 * B.h); metal = .75; gloss = .6; bump = .1;
  } else if (mat == 27) {
    alb = mix(vec3f(.46, .45, .45), vec3f(.60, .59, .57), ss(.4, .7, C.c)); gloss = .55; bump = .15;
  } else if (mat == 19) {
    let m = floorMat(i.wp.xz, fwp, (1. - ss(.0, .05 + fwp * .5, abs(vt.b - .52))) * .55 + ss(.45, .75, vt.a) * .1);
    alb = m.rgb; polish = m.a * .42; bump = 0.; gloss = .6;
  } else if (mat == 30) {
    // the Kiswah: black silk with a woven pattern that only shows in the sheen, the gold band two-thirds up,
    // gold panels below it, and the embroidered surround of the door. The roof is pale stone.
    let ne = on.x > .7;
    let u = fu; let v = fv;
    let q = vec2f(u / .9, v / .62); let qf = fract(q + vec2f(.5 * floor(q.y), 0.)) - .5;
    let ogee = cov(abs(abs(qf.x) - .32 * cos(qf.y * 3.1416)) * .9, .035, fwop / .9 * .9);
    let weave = mix(ogee, .3, ss(.15, .5, fwop / .9));
    alb = vec3f(.026, .025, .026) * (1. + .4 * weave); gloss = .36 + .3 * weave; bump = .02;
    // the silk hangs in long shallow folds that only show in its sheen
    let tg = select(vec3f(1., 0., 0.), vec3f(0., 0., 1.), abs(on.x) > .7);
    pert = tg * (.07 * sin(u * 2.3 + 1.4 * sin(v * .31 + u)) + .035 * sin(u * 6.1 + v * .5)) * (1. - .7 * ss(BAND.x - .5, BAND.x, v) * ss(BAND.y + .5, BAND.y, v));
    var gold = 0.;
    // the band: a gold frame round the verses of the belt (verified text baked into tK, one row per wall, laid out
    // so it reads right to left for someone facing that wall)
    let inB = step(BAND.x, v) * step(v, BAND.y);
    let bv = (v - BAND.x) / (BAND.y - BAND.x);
    let edge = max(cov(abs(bv - .06) * .95, .012, fw3), cov(abs(bv - .94) * .95, .012, fw3));
    let pw = select(KH.x * .5, KH.z * .5, ne || on.x < -.7);
    let side = select(select(select(3., 2., on.x < -.7), 1., on.z > .7), 0., on.x > .7);
    let ra = select(select(select(-i.op.x, i.op.z, on.x < -.7), i.op.x, on.z > .7), -i.op.z, on.x > .7);
    let kuv = vec2f(.5 + ra / (2. * select(KH.x, KH.z, abs(on.x) > .7)), (side + 1. - clamp(bv, .01, .99)) * .25);
    let txt = textureSampleLevel(tK, sC, kuv, log2(max(fw3 * 380., 1.)) - .35).a;
    gold = max(gold, inB * min(1., edge + txt + .04));
    // medallions beneath the band: a lantern-shaped outline round an eight-petalled rosette, two to each wall
    let pp = u - pw * 2. * (floor(u / (pw * 2.)) + .5);
    let mq = vec2f(pp / .55, (v - 7.45) / .62); let mr = length(mq); let ma = atan2(mq.y, mq.x);
    let notDoor = 1. - select(0., 1., ne && abs(u - DOOR.x) < 2.6);
    let petal = cov(abs(mr - (.45 + .12 * cos(ma * 8.))) * .55, .018, fwop);
    let rims = cov(abs(mr - 1.) * .55, .022, fwop) + cov(abs(mr - .86) * .55, .012, fwop) + cov(mr * .55, .05, fwop);
    let lat = cov(abs(fract(ma / TAU * 16.) - .5) * mr * .55 * TAU / 16. * 2., .01, fwop) * step(.6, mr) * step(mr, .86);
    let tip = cov(abs(pp) + max(v - 8.07, 0.) * .6 - .05, .02, fwop) * step(8.0, v) * step(v, BAND.x - .08);
    gold = max(gold, notDoor * step(mr, 1.06) * min(1., petal + rims + lat) + notDoor * tip);
    // the door surround (north-east wall): dense embroidery round the gold door, with a pointed-arch head
    if (ne) {
      let du = u - DOOR.x; let dv = v;
      let inS = step(abs(du), 2.2) * step(1.75, dv) * step(dv, 8.25);
      let fr = max(cov(abs(abs(du) - 2.12), .05, fw3), cov(abs(abs(du) - 1.85), .02, fw3));
      let ah = archD(du, dv, 1.5, 6.1, 1.9);
      let head = cov(abs(ah.x), .04, fw3) * step(-.5, ah.y);
      let rq = fract(vec2f(du, dv) / .28) - .5; let rqd = length(rq) * .28;
      let lat = max(cov(abs(rqd - .09), .012, fwop), cov(rqd, .025, fwop)) + cov(abs(abs(rq.x) + abs(rq.y) - .5) * .2, .006, fwop);
      gold = max(gold, inS * min(1., fr + head + lat * .85 + .1));
    }
    // the hem: a darker band near the base, tied down with brass rings
    let hem = step(v, .78) * step(.3, v);
    alb = mix(alb, vec3f(.018), hem * .6);
    gold = max(gold, cov(abs(v - .78), .02, fwop) + cov(length(vec2f(fract(u / .7) - .5, (v - .45) / .7) * .7), .035, fwop));
    // corners: a gold medallion at band height on every vertical edge
    let ce = select(KH.x - abs(i.op.x), KH.z - abs(i.op.z), abs(on.x) > .7);
    gold = max(gold, cov(ce, .25, fw3) * inB * .8);
    let th = (1. - ss(.004, .02, fw3)) * (.75 + .25 * sin((u * 40. + v * 40.)));
    alb = mix(alb, vec3f(.98, .70, .30) * (.8 + .2 * th), gold); metal = gold; gloss = mix(gloss, .5, gold);
    sheen = (.1 + .08 * weave) * (1. - gold);
    emi += vec3f(.9, .82, .7) * .02 * (GND + SUNC * .2) * ss(9., 0., v) * (1. - gold) * select(1., .3, NIGHT);
    if (on.y > .7) { alb = vec3f(.60, .58, .55) * (.9 + .15 * B.h); gloss = .2; metal = 0.; sheen = 0.; }
    if (on.y < -.7) { alb = vec3f(.05); }
  } else if (mat == 31) {
    // the gold door: two leaves of raised panels, studs and borders
    let du = abs(i.op.z - DOOR.x); let dv = i.op.y - DOOR.y; let h = DOOR.z - DOOR.y;
    let c = vec2f(du / .45, dv / (h / 6.)); let qq = abs(fract(c) - .5);
    let fr = max(cov(qq.x - .42, .04, .02 + fw3), cov(qq.y - .44, .04, .02 + fw3));
    let rose = cov(abs(length((fract(c) - .5) * vec2f(.45, h / 6.)) - .09), .015, fw3);
    alb = vec3f(.86, .62, .26) * (1. - .5 * fr) * (1. - .3 * rose); metal = 1.; gloss = .62; bump = 0.;
    pert = vec3f(0., (fract(c.y) - .5) * .5, 0.) * fr;
  } else if (mat == 32) {
    alb = select(vec3f(.78, .74, .66), vec3f(.03, .022, .02), i.m.w > .5); metal = select(.85, 0., i.m.w > .5); gloss = select(.42, .7, i.m.w > .5); bump = 0.;
  } else if (mat == 33) {
    // Maqam Ibrahim: a gold lattice over dark glass
    let ang = atan2(i.op.z - ${MAQAM[1]}, i.op.x - ${MAQAM[0]}) * .7 / .22; let v = i.op.y / .22;
    let qa = abs(fract(vec2f(ang + v, ang - v) * .5) - .5);
    let bars = max(cov(qa.x, .05, fw3 / .22 * .5), cov(qa.y, .05, fw3 / .22 * .5));
    let rim = cov(abs(i.op.y - 1.8), .08, fw3) + cov(abs(i.op.y - .6), .05, fw3);
    let rib = cov(abs(fract(ang * .22 / .7 / TAU * 8.) - .5) * .7 * TAU / 8., .025, fwop) * step(2.0, i.op.y);
    let g_ = sat(bars * .8 * step(i.op.y, 2.0) + rim + rib);
    let glass = select(vec3f(.05, .04, .025), vec3f(.16, .15, .13), i.op.y > 2.);
    alb = mix(glass, vec3f(1., .74, .32), g_); metal = mix(select(.6, .25, i.op.y > 2.), 1., g_); gloss = .95;
  } else if (mat == 34) {
    // the later arcade: white marble with grey bands, round arches with a grey voussoir band
    alb = vec3f(.64, .63, .60) * (.9 + .14 * B.h) * (.94 + .1 * C.c) * mix(.78, 1., ss(0., 3., fv));
    let bu = fract(fu / BAY) * BAY - BAY * .5;
    var ys = 5.2; var hw = BAY * .5 - .75; var y0 = 0.;
    if (fv > 9.5) { ys = 14.6; hw = BAY * .5 - .85; y0 = 9.5; }
    if (fv > 19.) { ys = 24.; hw = BAY * .5 - .85; y0 = 19.; }
    let ad = archD(bu, fv, hw, ys, hw * 2. * .62);
    let vb = cov(ad.x - .18, .18, fw3) * step(-.5, ad.y) * wall;
    alb = mix(alb, vec3f(.46, .46, .47), vb);
    alb = mix(alb, vec3f(.55, .55, .56), cov(abs(fv - y0 - 1.2) - .25, .25, fw3) * wall * step(.5, abs(ad.x)));
    gloss = .35; bump = .03;
  } else if (mat == 35) {
    if (i.m.w > .5) {
      // a clock face: gold rim, a green ring with hour and minute ticks, hands. No numerals, no lettering.
      let nrm = on.xz; let tg = vec2f(-nrm.y, nrm.x);
      let rel = i.op.xz - CLOCK - nrm * 23.6;
      let p2 = vec2f(dot(rel, tg), i.op.y - 419.); let r = length(p2); let an = atan2(p2.x, p2.y);
      let fwc = fw3 * 1.2;
      let mt = abs(fract(an / TAU * 60.) - .5) * TAU / 60. * r; let ht = abs(fract(an / TAU * 12.) - .5) * TAU / 12. * r;
      let ring = step(16.5, r) * step(r, 20.4);
      let tick = cov(mt, .12, fwc) * step(17.8, r) * step(r, 19.6) + cov(ht, .45, fwc) * step(16.9, r) * step(r, 20.);
      let hh = ${[6.08, 17.25, 21.0][TOD].toFixed(2)}; let ha = hh / 12. * TAU; let ma = fract(hh) * TAU;
      let hd = abs(dot(p2, vec2f(cos(ha), -sin(ha)))) + max(-dot(p2, vec2f(sin(ha), cos(ha))) - 1., 0.) + max(dot(p2, vec2f(sin(ha), cos(ha))) - 10.5, 0.);
      let md = abs(dot(p2, vec2f(cos(ma), -sin(ma)))) + max(-dot(p2, vec2f(sin(ma), cos(ma))) - 1.5, 0.) + max(dot(p2, vec2f(sin(ma), cos(ma))) - 15.5, 0.);
      let hand = max(cov(hd, .5, fwc), cov(md, .32, fwc));
      alb = mix(vec3f(.86, .88, .86), vec3f(.05, .24, .14), ring);
      alb = mix(alb, vec3f(1., .76, .34), sat(tick + cov(abs(r - 21.), .5, fwc)));
      alb = mix(alb, vec3f(.06, .06, .06), hand);
      emi = mix(vec3f(.9, 1., .95), vec3f(.15, 1., .45), ring) * (1. - hand) * (1. - sat(tick)) * LIGHTS * .45;
      metal = sat(tick) * .8; gloss = .5; bump = 0.;
    } else {
      // the shaft: pale stone with vertical ribs and window bands
      alb = vec3f(.58, .54, .48) * (.88 + .16 * B.h);
      let rib = cov(abs(fract(fu / 4.) - .5) * 4. - 1.85, .12, fw3) * wall;
      let wf2 = 1. - ss(.1, .3, fwop / 4.);
      let wb = step(.25, fract(fv / 4.)) * step(fract(fv / 4.), .7) * wall * step(fv, 380.) * (1. - rib);
      alb = mix(alb, vec3f(.15, .17, .19), wb * .6 * wf2); alb = mix(alb, alb * .82, (1. - wf2) * wall * .5); alb *= 1. - .25 * rib;
      emi = vec3f(1., .78, .5) * .12 * LIGHTS * wb * wfade * step(.6, hs(floor(fv / 4.) * 3.1 + floor(fu / 4.)));
      emi += vec3f(.4, 1., .55) * .08 * LIGHTS * step(380., fv) * wall;
      gloss = .3; bump = .05;
    }
  } else if (mat == 36) {
    alb = vec3f(.72, .72, .70) * (.93 + .1 * B.h); gloss = .55; bump = .03;
    alb = mix(alb, vec3f(.62, .62, .64), (1. - ss(.0, .03, abs(C.h - .52))) * .22);
    if (i.m.w > 1.5 && i.m.w < 2.5) { alb = vec3f(.76, .75, .73) * (.95 + .07 * B.h); gloss = .7; alb = mix(alb, vec3f(.55, .55, .57), cov(abs(fv - 1.12), .03, fwop) + cov(abs(fv - .18), .05, fwop)); }
  } else if (mat == 37) {
    let rib = cov(abs(fract(atan2(i.op.z - floor(i.op.z / BAY) * BAY - BAY * .5, i.op.x - floor(i.op.x / BAY) * BAY - BAY * .5) / TAU * 16.) - .5), .04, fw3 * 2.);
    alb = vec3f(.60, .60, .58) * (.88 + .16 * B.h) * (1. - .14 * rib); gloss = .15; bump = .08;
  } else if (mat == 38) {
    // the dim depth behind the later arcade's openings: a warm hall that recedes, lamps glowing in it at night
    let up = fract(fv / 9.5);
    alb = vec3f(.07, .06, .05) * (.5 + .7 * (1. - up));
    let ch = cov(length(vec2f((fract(fu / BAY) - .5) * BAY, (up - .62) * 9.5)), .16, fwop);
    alb *= 1. - .35 * ss(.3, .9, up);
    emi = LAMPC * LIGHTS * (.025 + .04 * (1. - up)) + LAMPC * ch * LIGHTS * LIGHTS * .3; gloss = .05; bump = 0.;
  }
  let N = normalize(qrot(i.q, normalize(on + pert + (A.n * .8 + B.n * .6 + C.n * .4 * ss(70., 10., dist)) * bump)));
  let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  let so = select(skyOcc(i.wp + n0 * .3), 1., far || mat == 17 || mat == 35);
  let ao = so * vao * select(1., mix(1., i.ao, .6), far || mat == 25 || mat == 34 || mat == 20);
  let sh = select(shadow9(i.wp + n0 * (.12 + dist * .002) + g.sun.xyz * .1), sat(i.ao * 1.6 - .3) * shadowC(i.wp + n0 * 1.5 + g.sun.xyz), far);
  let E = SUNC * sh * select(1., .15, mat == 38);
  let ndl = sat(dot(N, L));
  let am = (amb(N, so) + flood(i.wp, N) + GND * SUNC * .12 * aisle(KL(i.wp.xz), i.wp.y)) * ao + lamps(i.wp, N);
  var c = alb * (E * ndl + am) * (1. - metal * .85) + emi;
  var ambc = alb * am * (1. - metal * .85);
  c += sheen * pow(1. - sat(abs(dot(N, V))), 1.6) * (amb(N, so) * 1.6 + E * .25 * sat(dot(N, L) + .3));
  let Hh = normalize(V + L);
  let spc = mix(vec3f(.04), alb, metal);
  c += E * spc * pow(sat(dot(N, Hh)), mix(8., 160., gloss)) * gloss * ndl * 4.;
  let R = reflect(-V, N); let fr = pow(1. - sat(dot(N, V)), 5.);
  if (mat == 19) {
    let F = .07 + .93 * fr;
    c = c * (1. - F * polish) + floorRefl(i.wp, R) * F * polish * mix(.6, 1., so);
    ambc *= 1. - F * polish;
  } else {
    // the environment the surface reflects: the sky above, the warm floor and lit arcades round it
    let env = mix(GND * .6 + FLOODC * 1.5, skyCol(R, L), ss(-.2, .3, R.y)) + LAMPC * LIGHTS * .02;
    let refl = env * ao * spc * gloss * mix(.25 + .75 * fr, 1., metal) * 1.5;
    c += refl; ambc += refl;
  }
  return outA(c, ambc, i.wp);
}
`;

// ---------------------------------------------------------------- birds (pigeons): flight and flapping in the shader
const W_ANIM = S_B + /*wgsl*/`
struct VI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) a: vec4f, @location(3) b: vec4f };
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) op: vec3f, @location(3) @interpolate(flat) sd: f32 };
@vertex fn vs(i: VI) -> VO {
  var o: VO;
  let s = i.b.x; let h = vec3f(hs(s), hs(s + .37), hs(s + .71));
  let R = i.a.w; let t = g.cam.w; let stand = R < .5;
  let ta = t * i.b.y + i.b.w * 6.3 + (h.x - .5) * (14. / max(R, .5));
  let ph = i.b.w * 17.;
  var P = i.a.xyz + vec3f(R * cos(ta), 4. * sin(2. * ta + ph), R * .8 * sin(ta));
  var T = normalize(vec3f(-R * sin(ta), 8. * cos(2. * ta + ph), R * .8 * cos(ta))) * sign(i.b.y);
  var off = vec3f(0.);
  if (stand) {
    let hd = i.b.y + .4 * sin(t * .3 + s * 9.);
    let peck = pow(max(sin(t * 2.2 + s * 30.), 0.), 6.);
    T = normalize(vec3f(cos(hd), -.5 * peck, sin(hd))); P = i.a.xyz + vec3f(0., .13 + .01 * sin(t * 5. + s), 0.);
  }
  let S = normalize(cross(vec3f(0., 1., 0.), T)); let Up = cross(T, S);
  if (!stand) { off = S * ((h.y - .5) * 9. + sin(t * .5 + s * 40.) * 1.5) + Up * ((h.z - .5) * 5. + cos(t * .4 + s * 31.) * 1.); }
  var l = i.p * i.b.z;
  let au = abs(i.n.w);
  let flap = ss(-.3, .4, sin(t * .45 + s * 23.));
  if (stand) { l.x *= mix(1.15, .2, au); l.y = l.y * 1.6 - .03 * au; }
  else { l.y += sin(t * 13. + s * 50.) * .55 * au * au * i.b.z * flap + au * .12 * i.b.z * (1. - flap); }
  let w = P + off + S * l.x + Up * l.y + T * l.z;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = S * i.n.x + Up * i.n.y + T * i.n.z; o.op = i.p; o.sd = s;
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let n = normalize(i.n); let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  var alb = mix(vec3f(.30, .32, .36), vec3f(.48, .49, .52), ss(-.02, .02, i.op.y));
  alb = mix(alb, vec3f(.12, .13, .15), ss(.7, .9, abs(i.op.x)));
  let E = SUNC * shadow1(i.wp);
  var c = alb * (E * (.2 + .8 * sat(dot(n, L))) + amb(n, 1.) * 1.2 + flood(i.wp, n) * 1.5) + E * pow(sat(dot(n, normalize(V + L))), 20.) * .2;
  return fin(aerial(c, i.wp));
}
`;

// ---------------------------------------------------------------- sky dome behind everything
const W_SKY = S_B + W_NOISE + /*wgsl*/`
struct VO { @builtin(position) cp: vec4f, @location(0) d: vec3f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  var o: VO;
  let p = vec2f(f32(i & 1u), f32(i >> 1u)) * 2. - 1.;
  o.d = g.fwd.xyz + g.right.xyz * (p.x * g.right.w) + g.up.xyz * (p.y * g.up.w);
  o.cp = vec4f(p, 1e-9, 1.);
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let rd = normalize(i.d); let L = g.sun.xyz; let mu = dot(rd, L);
  var c = skyCol(rd, L);
  if (NIGHT) {
    // stars: one per cell of a grid on the sphere, drawn as a filtered disc so they never sparkle
    let p = rd * 260.; let ce = floor(p); let hh = h33(ce);
    let d = length(p - ce - .5 - (hh - .5) * .5);
    let fw = max(length(fwidth(p)), 1e-3);
    let b = pow(hh.x, 28.) * ss(.02, .25, rd.y);
    let disc = sat((max(fw * .7, .05) - d) / fw + .5) * min(1., .05 / max(fw * .7, .05));
    c += vec3f(.8, .85, 1.) * b * disc * .9;
    // the moon: a disc with soft limb darkening and faint maria
    let md = acos(clamp(mu, -1., 1.));
    let mr = .0095;
    let lim = sqrt(sat(1. - (md / mr) * (md / mr)));
    let mar = .8 + .2 * fbm(rd * 900. + 1., 3);
    c = mix(c, vec3f(1.6, 1.58, 1.5) * (.55 + .45 * lim) * mar, sat((mr - md) / max(fwidth(md), 1e-5) + .5));
  } else {
    // high thin cloud on a plane 6 km up, lit gold toward the sun and rose away from it
    if (rd.y > .004) {
      let q = rd.xz / rd.y * 6000.;
      let r = vec2f(q.x * .96 + q.y * .28, q.y * .96 - q.x * .28) * vec2f(.00011, .00042) + vec2f(g.cam.w * .002, 0.);
      let n = fbm(vec3f(r, 1.3), 5) + .35 * (fbm(vec3f(r * 3.1, 4.1), 3) - .5);
      let cov_ = ss(.6, .97, n) * ss(.03, .2, rd.y) * (1. - ss(.35, .9, rd.y));
      let lit = (CLOUDSUN * (.05 + .45 * pow(max(mu, 0.), 4.)) + g.amb.xyz * .9) * (.75 + .5 * fbm(vec3f(r * 7., 2.), 2));
      c = mix(c, lit, cov_ * .3);
    }
    c += SUNC * 9. * ss(.99988, .99994, mu);
  }
  return fin(c);
}
`;

// ---------------------------------------------------------------- dust motes in the low sun (additive)
const W_SPR = S_B + /*wgsl*/`
struct VO { @builtin(position) cp: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) pr: vec4f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) a: vec4f) -> VO {
  var o: VO; let q = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2. - 1.; let t = g.cam.w;
  let B = 26.;
  var p = a.xyz * B + vec3f(t * .18, t * .03, t * .07) + .4 * vec3f(sin(t * .3 + a.x * 60.), sin(t * .23 + a.y * 50.), cos(t * .27 + a.z * 70.));
  p = g.cam.xyz + (fract((p - g.cam.xyz) / B + .5) - .5) * B;
  let d = length(p - g.cam.xyz);
  let sz = .006 + .02 * a.w * a.w * a.w;
  let w = p + (g.right.xyz * q.x + g.up.xyz * q.y) * max(sz, d * .0016);
  o.cp = g.vp * vec4f(w, 1.); o.uv = q;
  let fade = ss(B * .5, B * .3, d) * ss(.4, 2., d) * min(1., sz / (d * .0016)) * ss(-2., 1., -abs(p.y - 4.) + 4.) * .3;
  let mu = dot(normalize(p - g.cam.xyz), g.sun.xyz);
  let ph = .15 + 2.2 * pow(max(mu, 0.), 6.);
  o.pr = vec4f(fade * ph * shadow1(p), a.w, 0., 0.);
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let m = ss(1., .15, length(i.uv));
  return vec4f(min(SUNC * mix(vec3f(1.), vec3f(1., .9, .6), i.pr.y) * m * m * i.pr.x * .9, vec3f(6.)), 0.);
}
`;

// ---------------------------------------------------------------- sun shafts through the morning dust (half res)
const W_RAYS = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sS: sampler_comparison;
@group(0) @binding(2) var tSh: texture_depth_2d;
@group(0) @binding(3) var tDp: texture_depth${AA > 1 ? '_multisampled' : ''}_2d;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let dp = textureLoad(tDp, vec2i(fc.xy) * 2, 0);
  let uv = fc.xy * 2. * g.res.zw;
  let nd = vec2f(uv.x * 2. - 1., 1. - uv.y * 2.);
  let rv = g.fwd.xyz + g.right.xyz * (nd.x * g.right.w) + g.up.xyz * (nd.y * g.up.w);
  let rl = length(rv); let rd = rv / rl;
  let zl = g.fwd.w / max(dp, 1e-6);
  let tm = min(zl * rl, 160.);
  let ro = g.cam.xyz; let sx = g.sun.xyz;
  let dt = tm / ${RAYN}.;
  let j = ign(fc.xy);
  var acc = 0.;
  for (var n = 0; n < ${RAYN}; n++) {
    let t = (f32(n) + j) * dt;
    let p = ro + rd * t;
    let s = g.sm * vec4f(p, 1.);
    let su = vec2f(s.x * .5 + .5, .5 - s.y * .5);
    let inb = ss(0., .01, min(min(su.x, 1. - su.x), min(su.y, 1. - su.y)));
    let vis = mix(1., textureSampleCompareLevel(tSh, sS, su, s.z - .0003), inb);
    let dust = (.10 + exp(-max(p.y, 0.) / 10.) * 1.4) * mix(.3, 1., inb);
    acc += vis * dust * exp(-t * .004);
  }
  let mu = dot(rd, sx);
  let gg = .72;
  let ph = (1. - gg * gg) / pow(1. + gg * gg - 2. * gg * mu, 1.5) * .07 + .1;
  return vec4f(min(SUNC * vec3f(1., .84, .62) * acc * dt * .007 * ph * g.mis.y, vec3f(20.)), zl);
}
`;
// depth-aware 3x3 blur of the half-res shafts (hides the sampling dither)
const W_RBLUR = W_FS + /*wgsl*/`
@group(0) @binding(0) var tR: texture_2d<f32>;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = vec2i(fc.xy); let mx = vec2i(textureDimensions(tR)) - 1;
  let c = textureLoad(tR, p, 0);
  var acc = vec3f(0.); var ws = 0.;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let r = textureLoad(tR, clamp(p + vec2i(x, y), vec2i(0), mx), 0);
    let w = 1. / (.03 + abs(r.a - c.a) / c.a);
    acc += r.rgb * w; ws += w;
  } }
  return vec4f(acc / ws, c.a);
}
`;

// ---------------------------------------------------------------- final composite
const W_POST = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sC: sampler;
@group(0) @binding(2) var tS: texture_2d<f32>;
@group(0) @binding(3) var tR: texture_2d<f32>;
@group(0) @binding(4) var tB: texture_2d<f32>;
@group(0) @binding(5) var tDp: texture_depth${AA > 1 ? '_multisampled' : ''}_2d;
fn tmap(x: vec3f) -> vec3f { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), vec3f(0.), vec3f(1.)); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = vec2i(fc.xy);
  let uv = fc.xy * g.res.zw;
  let zf = g.fwd.w / max(textureLoad(tDp, px, 0), 1e-6);
  let h = fc.xy * .5 - .5; let b = floor(h); let f = h - b; let bi = vec2i(b);
  let mx = vec2i(textureDimensions(tR)) - 1;
  var acc = vec3f(0.); var ws = 0.;
  for (var k = 0; k < 4; k++) {
    let o = vec2i(k & 1, k >> 1);
    let r = textureLoad(tR, clamp(bi + o, vec2i(0), mx), 0);
    let bw = mix(1. - f.x, f.x, f32(o.x)) * mix(1. - f.y, f.y, f32(o.y));
    let w = (bw + .02) / (.02 + abs(r.a - zf) / zf);
    acc += r.rgb * w; ws += w;
  }
  var c = textureLoad(tS, px, 0).rgb;
  if (${LV < 2}) {
    // TAA averages sub-pixel detail away; a clamped unsharp mask brings it back without halos
    let sm = vec2i(textureDimensions(tS)) - 1;
    let n0 = textureLoad(tS, clamp(px + vec2i(1, 0), vec2i(0), sm), 0).rgb; let n1 = textureLoad(tS, clamp(px - vec2i(1, 0), vec2i(0), sm), 0).rgb;
    let n2 = textureLoad(tS, clamp(px + vec2i(0, 1), vec2i(0), sm), 0).rgb; let n3 = textureLoad(tS, clamp(px - vec2i(0, 1), vec2i(0), sm), 0).rgb;
    c = clamp(c + (c - (n0 + n1 + n2 + n3) * .25) * .8, min(min(min(n0, n1), min(n2, n3)), c), max(max(max(n0, n1), max(n2, n3)), c));
  }
  c += acc / ws;
  let bl = textureSampleLevel(tB, sC, uv, 0.).rgb;
  c = mix(c, bl, .03) + bl * .012;
  // white balance per time: a camera left on daylight balance renders the low dawn light warm
  c *= g.mis.x * vec3f(${[[1.07, 1, .88], [1.02, 1, .96], [1, 1, 1]][TOD].join(', ')});
  let q = uv - .5;
  c *= 1. - dot(q, q) * .45;
  c = tmap(c);
  let l0 = dot(c, vec3f(.2126, .7152, .0722));
  let l = mix(l0, l0 * l0 * (3. - 2. * l0), .4);
  c *= l / max(l0, 1e-4);
  c = mix(vec3f(l), c, 1.04) + vec3f(.006, .003, 0.);
  c = pow(max(c, vec3f(0.)), vec3f(1. / 2.2));
  let n = ign(fc.xy) + ign(fc.xy + 37.) - 1.;
  return vec4f(c + n / 255., 1.);
}
`;

// ---------------------------------------------------------------- ground-truth ambient occlusion (half res)
// GTAO (Jimenez et al. 2016, structure after XeGTAO): per slice direction, find the highest horizon on each side
// from the depth buffer, then integrate the cosine-weighted visible arc against the projected normal. Positions
// are camera-relative world space, so no view matrix is needed. Noise rotates every frame; TAA averages it.
const W_AO = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var tDp: texture_depth_multisampled_2d;
const SLICES = ${LV ? 2 : 3}; const STEPS = ${LV ? 3 : 4};
fn zAt(p: vec2i) -> f32 { return g.fwd.w / max(textureLoad(tDp, clamp(p, vec2i(0), vec2i(g.res.xy) - 1), 0), 1e-7); }
fn posAt(q: vec2f, z: f32) -> vec3f {
  let uv = q * g.res.zw; let nd = vec2f(uv.x * 2. - 1., 1. - uv.y * 2.) - g.jit.xy;
  return (g.fwd.xyz + g.right.xyz * (nd.x * g.right.w) + g.up.xyz * (nd.y * g.up.w)) * z;
}
fn fastAcos(x: f32) -> f32 { let a = abs(x); let r = (-.156583 * a + 1.570796) * sqrt(max(1. - a, 0.)); return select(3.141593 - r, r, x >= 0.); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = vec2i(fc.xy) * 2; let q = vec2f(p) + .5;
  let dp = textureLoad(tDp, p, 0);
  if (dp < 1e-7) { return vec4f(1., 6e4, 0., 0.); }
  let z = g.fwd.w / dp; let P = posAt(q, z);
  let zr = zAt(p + vec2i(2, 0)); let zl = zAt(p - vec2i(2, 0)); let zd = zAt(p + vec2i(0, 2)); let zu = zAt(p - vec2i(0, 2));
  let dx = select(P - posAt(q - vec2f(2., 0.), zl), posAt(q + vec2f(2., 0.), zr) - P, abs(zr - z) < abs(zl - z));
  let dy = select(P - posAt(q - vec2f(0., 2.), zu), posAt(q + vec2f(0., 2.), zd) - P, abs(zd - z) < abs(zu - z));
  let V = -normalize(P);
  var N = normalize(cross(dx, dy));
  if (dot(N, V) < 0.) { N = -N; }
  // 2.5 m around the point, but never under 8 px, so the far city still gets dark alleys and building feet
  let ppm = g.res.y * .5 / (z * g.up.w);
  let rpx = clamp(2.5 * ppm, 8., 110.); let R = rpx / ppm;
  let fr = R * .62; let fmul = -1. / fr; let fadd = (R - fr) / fr + 1.;
  let nz = fract(ign(fc.xy) + g.jit.w * .618034); let nz2 = fract(ign(fc.xy + 71.) + g.jit.w * .754877);
  var vis = 0.;
  for (var sl = 0; sl < SLICES; sl++) {
    let phi = (f32(sl) + nz) / f32(SLICES) * 3.141593;
    let om = vec2f(cos(phi), -sin(phi));
    let dir = g.right.xyz * om.x - g.up.xyz * om.y;
    let od = dir - dot(dir, V) * V;
    let ax = normalize(cross(od, V));
    let pn = N - ax * dot(N, ax); let pl = length(pn);
    let cn = sat(dot(pn, V) / max(pl, 1e-4));
    let n = sign(dot(od, pn)) * fastAcos(cn);
    let lo0 = cos(n + 1.570796); let lo1 = cos(n - 1.570796);
    var h0 = lo0; var h1 = lo1;
    for (var st = 0; st < STEPS; st++) {
      var t = (f32(st) + nz2) / f32(STEPS); t = t * t;
      let o = om * max(t * rpx, 2. + f32(st));
      let a = vec2i(q + o); let b = vec2i(q - o);
      let da = posAt(vec2f(a) + .5, zAt(a)) - P; let db = posAt(vec2f(b) + .5, zAt(b)) - P;
      let la = max(length(da), 1e-4); let lb = max(length(db), 1e-4);
      h0 = max(h0, mix(lo0, dot(da / la, V), sat(la * fmul + fadd)));
      h1 = max(h1, mix(lo1, dot(db / lb, V), sat(lb * fmul + fadd)));
    }
    let a0 = n + clamp(-fastAcos(h1) - n, -1.570796, 1.570796);
    let a1 = n + clamp(fastAcos(h0) - n, -1.570796, 1.570796);
    vis += pl * ((cn + 2. * a0 * sin(n) - cos(2. * a0 - n)) + (cn + 2. * a1 * sin(n) - cos(2. * a1 - n))) * .25;
  }
  return vec4f(pow(sat(vis / f32(SLICES)), 1.6), z, 0., 0.);
}
`;
// depth-aware 5x5 blur of the half-res AO
const W_AOB = W_FS + /*wgsl*/`
@group(0) @binding(0) var tO: texture_2d<f32>;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = vec2i(fc.xy); let mx = vec2i(textureDimensions(tO)) - 1;
  let c = textureLoad(tO, p, 0);
  var acc = 0.; var ws = 0.;
  for (var y = -2; y <= 2; y++) { for (var x = -2; x <= 2; x++) {
    let r = textureLoad(tO, clamp(p + vec2i(x, y), vec2i(0), mx), 0);
    let w = (1. - .1 * f32(x * x + y * y)) / (.02 + abs(r.y - c.y) / c.y);
    acc += r.x * w; ws += w;
  } }
  return vec4f(acc / ws, c.y, 0., 0.);
}
`;
// ---------------------------------------------------------------- temporal anti-aliasing (full res)
// AO is applied to the ambient share here; then the frame is blended with last frame's result, reprojected by
// depth, with the history clipped to the 3x3 neighbourhood's colour range so moving fronds do not ghost.
const W_TAA = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sC: sampler;
@group(0) @binding(2) var tS: texture_2d<f32>;
@group(0) @binding(3) var tA: texture_2d<f32>;
@group(0) @binding(4) var tO: texture_2d<f32>;
@group(0) @binding(5) var tDp: texture_depth_multisampled_2d;
@group(0) @binding(6) var tH: texture_2d<f32>;
fn tm(c: vec3f) -> vec3f { return c / (1. + dot(c, LUMA)); }
fn itm(c: vec3f) -> vec3f { return c / max(1. - dot(c, LUMA), 1e-3); }
fn aoUp(p: vec2i, z: f32) -> f32 {
  let h = (vec2f(p) + .5) * .5 - .5; let b = floor(h); let f = h - b; let bi = vec2i(b);
  let mx = vec2i(textureDimensions(tO)) - 1;
  var acc = 0.; var ws = 0.;
  for (var k = 0; k < 4; k++) {
    let o = vec2i(k & 1, k >> 1);
    let r = textureLoad(tO, clamp(bi + o, vec2i(0), mx), 0);
    let w = (mix(1. - f.x, f.x, f32(o.x)) * mix(1. - f.y, f.y, f32(o.y)) + .01) / (.01 + abs(r.y - z) / z);
    acc += r.x * w; ws += w;
  }
  return acc / ws;
}
// 5-tap Catmull-Rom history fetch: sharper than bilinear, so the image does not soften as frames accumulate
fn hs5(uv: vec2f) -> vec3f {
  let sz = vec2f(textureDimensions(tH)); let p = uv * sz; let tc = floor(p - .5) + .5; let f = p - tc;
  let w0 = f * (-.5 + f * (1. - .5 * f)); let w1 = 1. + f * f * (-2.5 + 1.5 * f); let w2 = f * (.5 + f * (2. - 1.5 * f)); let w3 = f * f * (-.5 + .5 * f);
  let w12 = w1 + w2; let t0 = (tc - 1.) / sz; let t3 = (tc + 2.) / sz; let t12 = (tc + w2 / w12) / sz;
  let a = w12.x * w0.y; let b = w0.x * w12.y; let c = w12.x * w12.y; let d = w3.x * w12.y; let e = w12.x * w3.y;
  let r = textureSampleLevel(tH, sC, vec2f(t12.x, t0.y), 0.).rgb * a + textureSampleLevel(tH, sC, vec2f(t0.x, t12.y), 0.).rgb * b
    + textureSampleLevel(tH, sC, t12, 0.).rgb * c + textureSampleLevel(tH, sC, vec2f(t3.x, t12.y), 0.).rgb * d + textureSampleLevel(tH, sC, vec2f(t12.x, t3.y), 0.).rgb * e;
  return max(r / (a + b + c + d + e), vec3f(0.));
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = vec2i(fc.xy); let mx = vec2i(g.res.xy) - 1;
  var m1 = vec3f(0.); var m2 = vec3f(0.); var lo = vec3f(1e9); var hi = vec3f(-1e9); var cur = vec3f(0.);
  var zmin = 1e9; var dpn = 0.; var pn = px;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let q = clamp(px + vec2i(x, y), vec2i(0), mx);
    let dp = textureLoad(tDp, q, 0); let z = g.fwd.w / max(dp, 1e-7);
    let c = tm(textureLoad(tS, q, 0).rgb * (1. - (1. - aoUp(q, z)) * textureLoad(tA, q, 0).r));
    m1 += c; m2 += c * c; lo = min(lo, c); hi = max(hi, c);
    if (x == 0 && y == 0) { cur = c; }
    if (z < zmin) { zmin = z; dpn = dp; pn = q; }
  } }
  // reproject the nearest surface in the neighbourhood, so thin foreground edges do not trail
  let uv = (vec2f(pn) + .5) * g.res.zw; let nd = vec2f(uv.x * 2. - 1., 1. - uv.y * 2.) - g.jit.xy;
  let rv = g.fwd.xyz + g.right.xyz * (nd.x * g.right.w) + g.up.xyz * (nd.y * g.up.w);
  let pc = select(g.pvp * vec4f(g.cam.xyz + rv * zmin, 1.), g.pvp * vec4f(rv, 0.), dpn < 1e-7);
  let pu = vec2f(pc.x / pc.w * .5 + .5, .5 - pc.y / pc.w * .5) - uv + (vec2f(px) + .5) * g.res.zw;
  let mean = m1 / 9.; let sg = sqrt(max(m2 / 9. - mean * mean, vec3f(0.)));
  let blo = max(lo, mean - sg * 1.25); let bhi = min(hi, mean + sg * 1.25);
  let hist = clamp(tm(hs5(pu)), blo, bhi);
  let off = any(pu < vec2f(0.)) || any(pu > vec2f(1.)) || pc.w <= 0.;
  let a = select(max(g.jit.z, .1), 1., off);
  var o = itm(mix(hist, cur, a));
  if (any(o != o)) { o = itm(cur); }
  return vec4f(min(o, vec3f(60.)), 1.);
}
`;
