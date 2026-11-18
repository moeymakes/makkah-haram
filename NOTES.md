# Makkah Haram: build notes

Built with the `worldsmith` skill (`~/.shared/skills/worldsmith`), starting from the sibling worlds
`~/Dev/projects/masjid-nabawi-courtyard` (renderer, flat-floor world, arch panels, minarets, finials) and
`~/Dev/projects/madinah-horizon` (Sound row, audio). Neither was edited. Brief: `prompt.txt`.

## State (update after every step)

### Realism stages 1-3 (brief: ~/.config/Claude/side-session-notes/local_e46bf3a1-465b-49b7-b617-a09a30fa0fa1/realism-stages-brief.md)

- 2026-11-18 21:50 AEDT. Stage 1 SHIPPED (fast-forward realism-s1 -> main) under the brief's fallback rule; stage 2 next
  on branch `realism-s2`.
- Metrics: `look-metrics.py --crop 0,.45,1,1` over 6 poses x 3 times at 1920x1080 (dev.html, `--flight-key KeyP`,
  `--storage haramTime=N`); helpers (verify/, gitignored): sheet.sh (montage 3x2 per time + MEAN rows), shots.sh
  (README screenshots from a capture dir).

| Step (verify/ dir) | clip% | flatwhite% | brightdetail | Notes |
|---|---|---|---|---|
| live baseline (s0-base) | 0.170 | 15.90 | 13.36 | per time bd: dawn 12.37, golden 11.54, night 16.16; night floor 30% flat white |
| GTAO + TAA (s1-ao), 635326a | 0.151 | 15.42 | 12.98 | TAA costs ~3% brightdetail, as the skill predicts |
| Hillaire sky (s1-sky), b9231b0 | 0.149 | 5.02 | 19.88 | deep blue sky, warm sun; dawn reads a bit like midday |
| albedo + weathering (s1-alb), 77a1c81 | 0.147 | 1.25 | 20.62 | |
| static city shadow map (s1-shc), b5aade9 | 0.146 | 1.22 | 20.79 | clock tower, hotels, minarets cast shadows past the near map |
| near-city massing (s1-cd), e1bcd50 | 0.136 | 1.21 | 21.62 | |
| interior-mapped windows (s1-win), faaf8ec | 0.086 | 1.22 | 21.54 | |
| district tint (s1-dt), a501978 | 0.085 | 1.21 | 21.44 | |
| exposure pass (s1-exp), 82064f8 | 0.085 | 1.21 | 21.36 | critic round 1: major |
| fix 1 (s1-f1b), b854800 | 0.083 | 1.10 | 20.93 | critic round 2: major |
| fix 2 (s1-f2b), a025cda | 0.066 | 0.87 | 22.03 | critic round 3: major |
| fix 3 (s1-f3), f5b71de | 0.066 | 0.87 | 22.94 | critic round 4: major (my grid pools a new major) |
| fix 4 = SHIPPED (s1-f4), 0988f50 | 0.066 | 0.87 | 22.45 (+68%) | per time bd: dawn 36.26, golden 14.88, night 16.22, all above live. Critic round 5: major |

- Stage 1 gates: clip 0.066 < .5 PASS; flatwhite 0.87 < 2 PASS; brightdetail +68% vs live PASS; perf PASS (2560x1440
  High 60 s flight, GPU avg 5.00 ms, p99 7.72, max 8.55); 0 console errors at 3 times x 3 levels on index.html PASS;
  menu-preview renders (phone/tablet/desktop, 0 errors) PASS; index.html 141.4 kB < 160 PASS.
  Critic gate FAILED (highest major after 4 fix loops). Shipped by the fallback rule: every metric beats live and the
  majors left in round 5 are out of stage 1's scope (city and street layout: stage 3; the Haram roof plazas, Mataf
  floor, Ottoman colonnade floor/ceiling/columns: stage 2 heroes) or sky glow (the sun's veil in golden pose 4).
  Dawn, flagged major in rounds 1-4 ("reads as midday"), was minor in round 5.
- Critic recurring minors for stage 2: Black Stone ring oversized (reads as a porthole), mizab reads as a stick,
  shadharwan wedge at the base, door reads as a window grid, Maqam smears and reads as a lantern, Hatim a plain tub,
  clock tower a flat slab (needs crown, piers, darker podium), no moon in frame, uniform stars, birds sparkle.
- Decisions in stage 1: dawn sun 16 -> 13 deg, golden 24 -> 19 deg (warmer, longer shadows; Mataf still partly lit);
  key light tinted per preset for the valley dust; vertical FOV 60 -> 56 deg (critic: wide-angle stretch).
- Next: stage 2 per the brief: hero landmarks from cited sources (Kaaba details, Mataf floor, Ottoman porticoes - 152
  domes / 496 columns / 881 arches per Saudi Gazette, ours 176 domes on a composed 90 x 120 m rectangle -, the Clock
  Tower), bounded GI (port Madinah 133f332 and its parent), clouds, critic's in-scope majors. Then stage 3 (DEM + OSM,
  see Madinah 3551cdb, a692b24, bcad486).

### Original build

- Phase: 7 (delivered locally, committed, nothing pushed). Critic loop stopped by the brief's rule: 5 critic
  iterations (on iter-02, 05, 06, 08, 10), highest severity "major" every time. Gate 1 NOT passed; gate 2 passes.
- index.html: 87.7 kB, 36.2 kB gzipped. Load to menu ~0.8 s headless.
- Perf (verify/final-dev/perf.txt, dev.html, 2560x1440, 60 s flight, RTX 3070 shared with other worlds rendering at
  the same time): GPU avg 4.19 ms, p99 9.03, max 9.14 (final build). A run with the GPU ~37% busy
  elsewhere: 5.23 / 9.11 / 10.01. Earlier runs: 5.54/9.91/11.55
  (iter-01), 4.87/6.66/7.45 (iter-09). Frame 16.67 ms (headless vsync).
- index.html captured at High and Low (--storage haram=2) for each Time (--storage haramTime=0|1|2): 0 console
  errors in all six (verify/final-index-t*-q*). capture.mjs here accepts repeated --storage.
- Changes after the last critic (not re-judged): band bug fixed (a corner-medallion term filled the whole band with gold,
  hiding the embroidery), bolder strokes with arched or leaf tops so no upright stands alone as a letter, whiter Hatim, warm floor bounce on the lower Kiswah, night exposure
  1.7 and floodlight .36, golden-hour exposure .42 and normal haze, pigeons roost at night.
- Not done: touch controls and audio untested by ear; real-window frame pacing and heap check; no GitHub.

## Critic history

| Iter (capture) | Highest | Main changes after it |
|---|---|---|
| 1 (iter-02) | major | contact shade, softer reflection, Kiswah folds and hem, abstract script redesign, medallions, slimmer columns, Abraj crowns |
| 2 (iter-05) | major | clock tower moved off the Kaaba's axis, Mataf widened, pointed upper arches, plain parapet, sky glow, wider PCF |
| 3 (iter-06) | major | the sun reaches the Mataf: later arcade two storeys, dawn sun 16 deg; floor veining; overhead flight ending |
| 4 (iter-08) | major | expansions lowered so the sun reaches the upper Kaaba, soft (4-ray) Kaaba mirror, large-format seams, silk sheen in shade |
| 5 (iter-10) | major | (stopped: 5 critic iterations) |

Recurring and still open (iter-10): the aerial city reads as boxes; Kaaba shade faces very dark; Hatim reads as a tub;
Maqam speculars; door surround reads busy; floor reads plain. Treated as noise: the floor reflection was called "a hard
smear" (iter 3-4) and then "very weak" (iter 5) on the same element; the Black Stone and Hatim were raised every round.
The critic's "band at 75-85% of the height" (iter 2) is wrong: it is at 66-73%.

## Decisions taken unattended

- Ottoman rectangle |x|<45, |z|<60 in the Kaaba frame, the later arcade two storeys (19 m), the expansions 16-18 m:
  with three storeys and 32 m expansions the whole Mataf is in shade until the sun is ~27 deg up, which the critic
  read as flat overcast light. Composed, noted in the README.
- Dawn sun 16 deg (the time-of-day reference starts at 5-7): the upper Kaaba and the western arcades are lit, the
  east of the Mataf in shade. Golden hour 24 deg from the WSW.
- No pigeons on the floor: at this mesh size they read as pebbles (iter-05); they circle over the arcades instead.

## Facts (checked once, 2026-11-16) and what the scene does with them

Axes: +x east, -z north, y up, metres. The Kaaba stands at the origin. Everything near it is built in the
Kaaba's own frame ("local"): local +x points north-east (the door wall's normal), local +z south-east; world =
local rotated 45 degrees about y. So the corners point roughly at the compass points, as they do.

| Feature | Real (source) | Here |
|---|---|---|
| Kaaba size | infobox 12.86 x 11.03 m, 13.1 m high; text says ~15 m high, 12 x 10.5 m (Wikipedia "Kaaba") | 12.0 m (NE/SW walls) x 10.4 m (NW/SE walls), 13.1 m high |
| Orientation | corners roughly point to the cardinal directions; Black Stone corner faces very slightly SE, Rukn al-Yamani slightly SW, Shami slightly NW, Iraqi slightly NE (Wikipedia "Kaaba") | corners at E (very slightly S), S, W, N; exact angle approximate |
| Door | 2.13 m above the ground on the north-east wall, gold doors since 1979 (Wikipedia "Kaaba") | gold door 2.13-5.2 m up on the NE wall, nearer the Black Stone corner, with an embroidered surround |
| Black Stone | eastern corner, where tawaf begins, in a silver frame (Wikipedia "Kaaba") | silver frame bent round the east corner about 1.1-1.9 m up; not modelled in detail |
| Hijr Ismail (Hatim) | semicircular wall opposite the NW wall, not joined to it, 1.31 m high, 1.5 m wide, white marble (Wikipedia "Kaaba") | U-shaped white marble wall 1.31 m high and 1.5 m thick reaching ~9 m out from the NW wall, openings at both ends |
| Mizab | gold water spout on the roof edge over the Hijr (Wikipedia "Kaaba", Shadharwan section) | gold spout at the top centre of the NW wall |
| Shadharwan | slanted marble base on three sides, added 1627 (Wikipedia "Kaaba") | sloped marble skirt on all four sides (approximation) |
| Kiswah | black silk and gold; the hizam band two-thirds of the way up, ~95 cm wide, 16 panels, ~47 m long (Wikipedia "Kaaba"; Al Jazeera "The story of the Kiswah", 2026; The National "How the kiswah is made") | black silk with a woven sheen pattern, gold band 8.6-9.55 m up. Band pattern is abstract strokes in a script-like rhythm inside cartouches: no letters, no words |
| Maqam Ibrahim | about 10-11 m east of the door, crystal dome in a gilded metal mesh, top cover ~1.30 m (Arab News "ThePlace: Maqam Ibrahim"; Saudipedia "Maqam Ibrahim") | gold cage and glass bell on a marble plinth, ~2.7 m tall, 11 m in front of the door |
| Mataf floor | Thassos marble from Greece, very white, stays cool (Arab News "Why the marble flooring ... remains cool"; Saudi Gazette) | white polished marble, faint grey veins and joints, mirrors the Kaaba and the arcades |
| Ottoman arcades | Sinan's renovation (1570s) raised domes on marble columns round the courtyard; parts altered in the 2011 expansion (Wikipedia "Great Mosque of Mecca"; archup.net) | two rows of pointed arches on slender marble columns, every bay under a small dome with a crescent finial. Bay count and plan composed |
| Later arcades | multi-level expansions (Wikipedia "Great Mosque of Mecca") | a two-storey pointed-arch marble arcade behind the Ottoman one, lower flat-roofed expansions beyond (heights composed, see Decisions) |
| Minarets | 13 listed, the tallest 139 m (Wikipedia "Great Mosque of Mecca" infobox) | 13: nine of ~89 m round the old ring, four of ~139 m on the north side. Positions composed |
| Clock tower | Makkah Royal Clock Tower, 601 m, completed 2012, about 500 m from the Kaaba across the plaza south of the King Abdulaziz Gate (Wikipedia "Abraj Al Bait"; archive.mv) | 601 m, ~555 m SSW (azimuth ~205), four plain clock faces with ticks and hands only, gold crescent finial. No lettering |
| Surroundings | Makkah sits in a valley ringed by granite mountains | composed valley: granite ridges from ~600 m out, the city and hotel towers on the floor and lower slopes |

Uncertain or composed (also in the README): exact wall lengths and angles, the Hatim's curve, the Maqam's
enclosure shape, every arcade dimension and bay count, minaret positions and styles, the distance and direction
of the clock tower, the mountains and city. Distances are compressed so the arcades and minarets read from the
Mataf.

## Sacred-site rules (from the brief)

No human figures. Never inside the Kaaba: its door is closed and nothing behind it exists. Nothing recited, no
text anywhere: the band and the door surround are abstract strokes, the clock faces have ticks and hands only.
Finials: a pole, stacked spheres and an upturned crescent, checked side-on.

## Six poses (keys 1-6), decided before building

1. The door wall from the Mataf (NE side), Maqam Ibrahim to the left, low sun on the gold.
2. The Black Stone corner (east), close, looking up at the band.
3. The Hijr Ismail from the north-west: the curved white wall, the Mizab, the Kaaba against the sky.
4. Inside the Ottoman arcade on the NE side, columns and arches receding, the Kaaba through the arches.
5. Maqam Ibrahim close, the door behind it.
6. Flight: 140 m up north of the Haram looking south: Mataf, arcades, minarets, the clock tower.

Fly path (60 s): from the east (Black Stone) round the Kaaba anticlockwise (door, Hijr, Yemeni corner), out
through an arch into the NE Ottoman arcade, along it, out again and up to pose 6.

## Time presets

| | Dawn (default) | Golden hour | Night |
|---|---|---|---|
| Key | sun 16 deg up at azimuth 68 (ENE) | sun 24 deg up at 250 (WSW) | moon 35 deg up at 140 |
| Lights | x0.2 | x1 | x6, plus floodlit Mataf |

## Critic intent paragraph

The Mataf of Masjid al-Haram in Makkah, empty and still. Calm, reverent, luminous. At the centre the Kaaba, a
tall cube draped in black silk with a gold embroidered band two-thirds up and a gold door raised above the
floor; a low curved white marble wall beside it, a small gold-and-glass shrine in front of it. The floor is
very white polished marble. Around it, an arcade of pointed arches on slender marble columns with rows of small
domes, a taller three-storey arcade behind, many tall minarets with gold crescent finials, and to the south a
very tall clock tower over the city. Bare granite mountains in the haze. Low sun, long shadows, pigeons. No
people.
