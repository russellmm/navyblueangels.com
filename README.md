# Blue Angels Maneuvers

An independent, static interactive guide to the 2026 Blue Angels demonstration. Open `index.html` directly or serve this folder with any static file server. No build step is required.

## What is included

- A maneuver theater with crowd, profile, and overhead views; playback and search controls; and numbered aircraft.
- High, low, and flat show catalogs ordered from the 2026 Maneuvers Manual tables of contents.
- Separate low and flat alternatives when the manual changes a maneuver, plus the seven C-130 maneuvers.
- Manual reference and PDF page links for each maneuver.

`maneuvers-manual.pdf` is the primary source. The published altitude and airspeed envelopes appear beside each maneuver. Animated paths, timing, jet spacing, and camera views are illustrative and must never be used as flight guidance. Where text, diagrams, and data boxes in the manual disagree, the guide identifies the discrepancy in the maneuver summary.

The source is deliberately small: `index.html` contains the page structure, `styles.css` the visual design, and `app.js` the maneuver catalog and canvas renderer. New biographies, photos, history, and show pages can be added without changing the maneuver data format.
