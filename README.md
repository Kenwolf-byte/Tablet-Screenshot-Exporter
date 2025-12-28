# Tablet Screenshot Exporter — Daily Bread

A lightweight browser tool to batch-create device screenshots for app store listings (Google Play / App Store / Web). It uses the Canvas API to rotate, fit and export screenshots into tablet presets (7" & 10"), supports PNG bezel mockups, and provides a live bezel editor to fine-tune inner-screen margins.

## Features

- Auto-rotate portrait screenshots to match target landscape presets.
- Export to preset sizes: Google Play, 7" & 10" tablet resolutions.
- Use PNG bezel assets (auto-scaled) or fallback drawn bezels.
- Live bezel preview with drag-to-adjust inner-screen bounds (save/reset).
- Show missing bezel assets for debugging.
- Export everything as a ZIP file.
- Basic PWA manifest + service worker for offline usage.

## Quick usage

1. Open `index.html` in a modern browser.
2. Upload one or more screenshots with **Upload**.
3. Optionally upload bezel PNGs named by preset (e.g. `10-land.png`).
4. Toggle **Auto-rotate** (on by default) to rotate portrait screenshots into landscape outputs.
5. Click **Generate Previews** — previews appear in the grid.
6. Download individual PNGs or **Export All (ZIP)**.

## Bezel assets & auto-scale

- Name bezel PNGs to match preset ids: `10-land.png`, `10-port.png`, `7-land.png`, `7-port.png`, `gp-land.png`, `gp-port.png`.
- Use the Live Bezel Preview to adjust inner screen margins. You can supply a JSON mapping to set exact margins per preset.

## Turn into PWA

- A `manifest.json` and `sw.js` are provided. Host the folder on a static server and enable service worker registration to install the app on devices.

## Implementation notes

- Rotation / fitting is done client-side using Canvas 2D.
- The tool creates intermediate canvas objects for rotation to avoid image distortion.
- Bezel PNGs should ideally be authored at the target output size (e.g. 1280×800 for 10" landscape), but an auto-scaling utility is included.

## License

MIT

## Bugs

- To use live Bezel Edit manually you have to minimize the webbrowser
- Still working on the scalling of images when adding bezel or png bezel is selcted
