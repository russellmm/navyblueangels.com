# Blue Angels Maneuver Guide

An independent, static website that flies every maneuver of the 2026 Blue Angels demonstration in 3D, built from the team's *2026 Maneuvers Manual* (`maneuvers-manual.pdf`). No build step: serve the folder with any static file server, or publish it to GitHub Pages as is.

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` straight from disk won't work, because browsers block ES modules on `file://`.

## Pages

| Page | What it does |
| --- | --- |
| `index.html` | Live 3D hero reel, featured maneuvers, the team elements, show profiles, gallery teaser |
| `maneuvers.html` | The maneuver theater: 3D viewer with six cameras, live telemetry, timeline with event markers, the manual's data, text and diagram for each maneuver |
| `show.html` | High, low, flat and Fat Albert sequences in manual order, the aerobatic box, weather minimums, contingencies |
| `gallery.html` | Airshow photo galleries, driven by `data/galleries.json` |

Two visual themes share the same markup: **Cinematic** (dark, default) and **Team colors** (blue and gold). The header button switches between them and remembers the choice. All theme colors are CSS variables at the top of `assets/css/site.css`.

## How the animations work

- `assets/js/sim/flight.js`: a kinematic flight engine. Each jet "flies" scripted segments (pulls at a given G or radius, rolls, coordinated banked turns, climbs, takeoffs, landings) on a 1/30 s step, so paths are continuous and bank angle follows turn rate. Formation members fly fixed slots in the lead's frame and step down when they change position. Load factor (G) and angle of attack come from the resulting motion.
- `assets/js/sim/maneuvers.js`: all 55 maneuver entries (manual pages 2-1 through 3-11, plus the low/flat variant of 2-10b), each with the manual's published altitudes, airspeeds and text, and a `build()` that choreographs it. `SHOWS` holds the high, low, flat and C-130 sequences from the manual's table of contents.
- `assets/js/render/`: Three.js rendering. `hornet.js` is a procedural F/A-18E Super Hornet in Blue Angels livery and `c130.js` is Fat Albert. `world.js` builds the show site (sky, airfield, crowd, farmland, coastline, aerobatic-box overlay), `smoke.js` draws the demonstration smoke and `engine.js` runs playback and the cameras.
- `assets/js/render/audio.js`: synthesized aircraft sound (Web Audio, no recordings). Each aircraft is a 3D source: Hornets get turbofan roar aimed aft, turbine whine forward and afterburner rumble and crackle; the C-130 gets four beating turboprops. Sound is computed at the retarded time (it travels about 1,125 ft/s), so passes are heard after they are seen, with Doppler shift and distance muffling. Off by default; toggle with the speaker button or M.
- `assets/vendor/three/`: Three.js r170, vendored so the site has no build step or CDN dependency.

Coordinates are in feet: +x is crowd right, +y is altitude, +z is toward the crowd. Center point is the origin and the crowd line is 1,500 ft from the show line.

The flight paths are an interpretation of the manual's diagrams and text, **not flight data**. Where the manual's data box and its diagram or text disagree (for example 2-17, 2-21 and 2-40), the maneuver's note says which one the animation follows.

## Adding a gallery

Put the photos anywhere under the site (for example `galleries/pensacola-2026/`) and add an entry to `data/galleries.json`:

```json
{
  "galleries": [
    {
      "id": "pensacola-2026",
      "title": "Pensacola Homecoming",
      "location": "NAS Pensacola, FL",
      "date": "2026-11-06",
      "description": "Optional one-line description.",
      "cover": "galleries/pensacola-2026/cover.jpg",
      "photos": [
        { "src": "galleries/pensacola-2026/01.jpg", "thumb": "galleries/pensacola-2026/01-thumb.jpg", "w": 2400, "h": 1600, "caption": "Diamond 360", "credit": "Your name" }
      ]
    }
  ]
}
```

`thumb`, `w`/`h`, `caption` and `credit` are optional. Width and height prevent layout shift while thumbnails load. Galleries are listed newest first and open at `gallery.html?g=<id>`.

## Other files

- `assets/img/manual/`: manual pages rendered as images, shown next to each maneuver.
- `assets/img/stills/`: renders used on the home page cards and as the hero poster when WebGL isn't available.
- `reference/`: local reference images, not committed.

This is a fan project and is not affiliated with or endorsed by the U.S. Navy or the Blue Angels.
