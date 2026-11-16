# Makkah Haram: build notes

Built with the `worldsmith` skill (`~/.shared/skills/worldsmith`), starting from the sibling worlds
`~/Dev/projects/masjid-nabawi-courtyard` (renderer, flat-floor world, arch panels, minarets, finials) and
`~/Dev/projects/madinah-horizon` (Sound row, audio). Neither was edited. Brief: `prompt.txt`.

## State (update after every step)

- Phase: 5 (critic loop). World built: Kaaba + Kiswah, Hijr, Maqam, Black Stone frame, Mizab, Ottoman arcade
  (domes, lanterns), three-storey later arcade, expansions, 13 minarets, clock tower, city, valley, pigeons,
  Time presets (Dawn/Golden hour/Night), Sound row. Ottoman rectangle compressed to |x|<40, |z|<55 (Kaaba frame).
- Last capture: verify/iter-01 (dev.html, 2560x1440, running)
- Next step: critic iteration 1 on iter-01, then fix, iterate (cap: 5 critic iterations)
- Not committed yet.

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
| Later arcades | multi-level expansions (Wikipedia "Great Mosque of Mecca") | a three-storey round-arched marble arcade behind the Ottoman one, larger flat-roofed expansions beyond |
| Minarets | 13 listed, the tallest 139 m (Wikipedia "Great Mosque of Mecca" infobox) | 13: nine of ~89 m round the old ring, four of ~139 m on the north side. Positions composed |
| Clock tower | Makkah Royal Clock Tower, 601 m, completed 2012, about 500 m from the Kaaba across the plaza south of the King Abdulaziz Gate (Wikipedia "Abraj Al Bait"; archive.mv) | 601 m, ~430 m SSW, four plain clock faces with ticks and hands only, gold crescent finial. No lettering |
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
| Key | sun 6 deg up at azimuth 68 (ENE) | sun 9 deg up at 250 (WSW) | moon 35 deg up at 140 |
| Lights | x0.2 | x1 | x6, plus floodlit Mataf |

## Critic intent paragraph

The Mataf of Masjid al-Haram in Makkah, empty and still. Calm, reverent, luminous. At the centre the Kaaba, a
tall cube draped in black silk with a gold embroidered band two-thirds up and a gold door raised above the
floor; a low curved white marble wall beside it, a small gold-and-glass shrine in front of it. The floor is
very white polished marble. Around it, an arcade of pointed arches on slender marble columns with rows of small
domes, a taller three-storey arcade behind, many tall minarets with gold crescent finials, and to the south a
very tall clock tower over the city. Bare granite mountains in the haze. Low sun, long shadows, pigeons. No
people.
