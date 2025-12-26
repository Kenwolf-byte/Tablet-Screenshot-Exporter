# Tablet Screenshot Exporter

A small client-side tool for generating app store screenshots for tablets and phones. It:

- Produces Google Play / 7" / 10" presets in portrait & landscape.
- Adds optional drawn bezels or PNG bezel assets.
- Supports auto-rotate, rotate-in-place, and a _compose_ mode that creates a tablet-style landscape mockup (blurred background + centered screenshot).
- Batch export to ZIP.

Usage:

1. Open `index.html` in a modern browser.
2. Upload screenshots and (optionally) bezel PNGs named `10-land.png`, `10-port.png`, `gp-land.png`, etc.
3. Optionally upload `bezel-margins.json` to precisely map inner screen bounds for each bezel asset.
4. Pick the preset, composition mode, and Generate Previews.
5. Download individual PNGs or export all as a ZIP.

Notes:

- For pixel-perfect store screenshots, the recommended approach is to capture screenshots at the target resolution (device emulator or real device at the required DPI).
- The `compose` mode creates a visually pleasing tablet mockup when a real tablet screenshot isn't available by generating a blurred background and centering/scaling the phone screenshot in the screen area.
