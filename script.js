/* Tablet Screenshot Exporter — main script
   Features implemented:
   - auto-rotate inputs to match target orientation
   - create canvas outputs for presets, including 10" landscape
   - support PNG bezel assets and auto-scaling
   - live bezel preview with draggable inner-screen bounds (edit per preset)
   - missing-assets indicator
   - export profiles (play / appstore / web)
   - basic auto-scale from small JSON
   - ZIP export
*/

// --- Presets: keep these authoritative for output sizes used by the UI ---
const PRESETS = {
  gp: [
    { id: "gp-land", w: 1920, h: 1080, label: "Google Play — landscape (1920×1080)" },
    { id: "gp-port", w: 1080, h: 1920, label: "Google Play — portrait (1080×1920)" },
  ],
  7: [
    { id: "7-land", w: 1024, h: 600, label: '7" — landscape (1024×600)' },
    { id: "7-port", w: 600, h: 1024, label: '7" — portrait (600×1024)' },
  ],
  10: [
    { id: "10-land", w: 1280, h: 800, label: '10" — landscape (1280×800)' },
    { id: "10-port", w: 800, h: 1280, label: '10" — portrait (800×1280)' },
  ],
};

// DOM refs
const upload = document.getElementById("multiUpload");
const generateBtn = document.getElementById("generateBtn");
const exportAllBtn = document.getElementById("exportAllBtn");
const previewGrid = document.getElementById("previewGrid");
const bezelToggle = document.getElementById("bezelToggle");
const bgPad = document.getElementById("bgPad");
const presetSelect = document.getElementById("presetSelect");
const bezelUpload = document.getElementById("bezelUpload");
const bezelList = document.getElementById("bezelList");
const useBezelAsset = document.getElementById("useBezelAsset");
const autoRotate = document.getElementById("autoRotate");
const gen10LandBtn = document.getElementById("gen10LandBtn");
const bezelPresetSelect = document.getElementById("bezelPresetSelect");
const bezelPreview = document.getElementById("bezelPreview");
const bezelStatus = document.getElementById("bezelStatus");
const saveBezelBtn = document.getElementById("saveBezelBtn");
const resetBezelBtn = document.getElementById("resetBezelBtn");
const bezelJson = document.getElementById("bezelJson");
const applyBezelJson = document.getElementById("applyBezelJson");
const autoScaleBtn = document.getElementById("autoScaleBtn");
const missingAssets = document.getElementById("missingAssets");
const storeProfile = document.getElementById("storeProfile");

let generatedImages = []; // array of {filename, blob}
const bezelAssets = new Map(); // presetId -> Image
const bezelMargins = new Map(); // presetId -> {left,top,right,bottom} in px relative to target dims

/* -----------------------
   Helpers
   ----------------------- */
function readFileAsImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      res(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      rej(e);
    };
    img.src = url;
  });
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function filenameBase(name) { return name.replace(/\.[^/.]+$/, ""); }

/* -----------------------
   Rotation + fit logic
   -----------------------
   The approach:
   - If autoRotate is enabled and the source image orientation doesn't match the target,
     produce a rotated source canvas (90° clockwise).
   - Then aspect-fit the rotated/original source into the target "screen area".
   - If bezel is on, we compute a screen rect via margins and draw the image into that rect.
*/
function needsRotationForTarget(img, outW, outH, autoRotateFlag) {
  if (!autoRotateFlag) return false;
  const imgLandscape = img.width >= img.height;
  const targetLandscape = outW >= outH;
  return imgLandscape !== targetLandscape;
}

function createRotatedCanvas(sourceImg) {
  const c = document.createElement("canvas");
  c.width = sourceImg.height;
  c.height = sourceImg.width;
  const ctx = c.getContext("2d");
  // rotate 90deg clockwise: translate to right, rotate, draw
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(sourceImg, 0, 0);
  return c;
}

function aspectFitDraw(ctx, src, sx, sy, sW, sH, targetX, targetY, targetW, targetH, padBackground) {
  // compute scale
  const scale = Math.min(targetW / sW, targetH / sH);
  const drawW = sW * scale;
  const drawH = sH * scale;
  const x = targetX + (targetW - drawW) / 2;
  const y = targetY + (targetH - drawH) / 2;
  if (padBackground) {
    ctx.fillStyle = "#000";
    ctx.fillRect(targetX, targetY, targetW, targetH);
  }
  // draw source (if source is an image or canvas)
  ctx.drawImage(src, 0, 0, sW, sH, x, y, drawW, drawH);
}

/* draw default bezel (fallback) */
function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
function drawDefaultBezel(ctx, w, h) {
  const r = Math.min(w, h) * 0.06;
  ctx.save();
  ctx.fillStyle = "#f3f1ef";
  roundRect(ctx, 0, 0, w, h, r);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.06)";
  ctx.lineWidth = Math.max(2, w * 0.006);
  roundRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth, r * 0.85);
  ctx.stroke();
  // camera pill
  const pillW = Math.max(40, w * 0.08), pillH = Math.max(6, h * 0.007);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(w / 2, pillH * 3, pillW / 3, pillH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* Create final canvas for a given output specification */
function createMockupCanvas(img, outW, outH, options = {}, bezelImg = null, marginOverride = null) {
  const bezelOn = options.bezel;
  const padBg = options.padBg;
  const autoRot = options.autoRot;
  const useBezelAsset = options.useBezelAsset;

  // rotation if needed
  let source = img;
  if (needsRotationForTarget(img, outW, outH, autoRot)) {
    source = createRotatedCanvas(img);
  }

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");

  // background for export
  ctx.fillStyle = padBg ? "#ffffff" : "#000000";
  ctx.fillRect(0, 0, outW, outH);

  // compute margins (bezel inner screen) — prioritized: marginOverride -> bezelMargins map -> default
  let margin = 0;
  let screenRect = { x: 0, y: 0, w: outW, h: outH };
  if (bezelOn) {
    if (marginOverride) {
      margin = marginOverride; // number representing uniform margin (px)
      screenRect = { x: margin, y: margin, w: outW - margin * 2, h: outH - margin * 2 };
    } else {
      const key = findPresetIdForWh(outW, outH) || null;
      const saved = key ? bezelMargins.get(key) : null;
      if (saved) {
        screenRect = {
          x: saved.left,
          y: saved.top,
          w: outW - saved.left - saved.right,
          h: outH - saved.top - saved.bottom
        };
      } else {
        margin = Math.round(Math.min(outW, outH) * 0.06);
        screenRect = { x: margin, y: margin, w: outW - margin * 2, h: outH - margin * 2 };
      }
    }

    // draw clipped image inside screenRect
    ctx.save();
    roundRect(ctx, screenRect.x, screenRect.y, screenRect.w, screenRect.h, Math.min(screenRect.w, screenRect.h) * 0.03);
    ctx.clip();
    aspectFitDraw(ctx, source, 0, 0, source.width, source.height, screenRect.x, screenRect.y, screenRect.w, screenRect.h, padBg);
    ctx.restore();

    // draw bezel overlay (bezel asset if provided)
    if (useBezelAsset && bezelImg) {
      // try to scale bezel image to output canvas size — bezel PNG is expected to include a transparent screen cutout
      try {
        ctx.drawImage(bezelImg, 0, 0, outW, outH);
      } catch (e) {
        drawDefaultBezel(ctx, outW, outH);
      }
    } else {
      drawDefaultBezel(ctx, outW, outH);
    }
  } else {
    // no bezel: draw edge-to-edge
    aspectFitDraw(ctx, source, 0, 0, source.width, source.height, 0, 0, outW, outH, padBg);
  }

  return canvas;
}

/* Find one preset id that matches outW/outH (we store PRESETS keyed by group) */
function findPresetIdForWh(w, h) {
  const all = [].concat(PRESETS.gp, PRESETS['7'], PRESETS['10']);
  for (const p of all) {
    if (p.w === w && p.h === h) return p.id;
  }
  return null;
}

/* -----------------------
   Generate pipeline
   ----------------------- */
async function generateAllFromFiles(files, onlyOutputs = null) {
  previewGrid.innerHTML = "";
  generatedImages = [];

  if (!files || files.length === 0) {
    alert("Please choose one or more screenshots to process.");
    return;
  }

  const presetKey = presetSelect.value; // 'gp','7','10'
  let outputsForPreset = []
    .concat(PRESETS[presetKey] || [])
    .concat(PRESETS["7"])
    .concat(PRESETS["10"]);

  if (Array.isArray(onlyOutputs) && onlyOutputs.length > 0) {
    outputsForPreset = onlyOutputs;
  }

  // dedupe
  const unique = [];
  const ids = new Set();
  for (const o of outputsForPreset) {
    if (!ids.has(o.id)) { unique.push(o); ids.add(o.id); }
  }

  // check missing bezel assets (update UI)
  updateMissingAssetsIndicator(unique);

  for (const file of files) {
    try {
      const img = await readFileAsImage(file);

      for (const out of unique) {
        const options = {
          bezel: bezelToggle.checked,
          padBg: bgPad.checked,
          useBezelAsset: useBezelAsset.checked,
          autoRot: autoRotate.checked
        };
        const bezelImg = bezelAssets.get(out.id) || null;
        // if bezel asset exists but user did not check "useBezelAsset", pass null so default drawn
        const canvas = createMockupCanvas(img, out.w, out.h, options, bezelImg);

        // show preview
        const card = document.createElement("div");
        card.className = "card preview-card";
        const title = document.createElement("div");
        title.innerHTML = `<strong>${file.name}</strong><div class="meta">${out.label}</div>`;
        card.appendChild(title);

        // embed scaled preview canvas copy for display (to avoid huge DOM canvases)
        const previewCanvas = document.createElement("canvas");
        // keep aspect constraint: limit width to 480 px for in-page preview
        const previewMaxWidth = 480;
        const scale = Math.min(1, previewMaxWidth / out.w);
        previewCanvas.width = Math.round(out.w * scale);
        previewCanvas.height = Math.round(out.h * scale);
        previewCanvas.getContext('2d').drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);
        card.appendChild(previewCanvas);

        const btnRow = document.createElement("div");
        btnRow.className = "row";
        const fnameBase = `${filenameBase(file.name)}-${out.id}`;
        const dlBtn = document.createElement("button");
        dlBtn.className = "primary";
        const fname = `${fnameBase}.png`;
        dlBtn.innerText = "Download PNG";
        dlBtn.onclick = () => {
          canvas.toBlob((b) => { saveAs(b, fname); });
        };

        const addZipBtn = document.createElement("button");
        addZipBtn.className = "ghost";
        addZipBtn.innerText = "Add to ZIP";
        addZipBtn.onclick = () => {
          canvas.toBlob((blob) => {
            generatedImages.push({ filename: fname, blob });
            alert(fname + " added to ZIP list");
          });
        };

        btnRow.appendChild(dlBtn);
        btnRow.appendChild(addZipBtn);
        card.appendChild(btnRow);
        previewGrid.appendChild(card);

        // auto-add to generatedImages for convenience
        await new Promise((res) => canvas.toBlob((b) => { generatedImages.push({ filename: fname, blob: b }); res(); }));
      }
    } catch (err) {
      console.error(err);
      alert("Error processing file " + file.name);
    }
  }

  alert('All previews generated. Use "Export All (ZIP)" to download everything as a zip.');
}

/* -----------------------
   Bezel asset uploads & missing asset indicator
   ----------------------- */
bezelUpload.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  bezelAssets.clear();
  const loaded = [];
  for (const f of files) {
    try {
      const img = await readFileAsImage(f);
      const name = f.name.toLowerCase();
      const match = name.match(/(?:bezel-)?(gp|7|10)-(land|port)\.(png)$/i);
      if (match) {
        const key = `${match[1]}-${match[2]}`;
        bezelAssets.set(key, img);
        loaded.push(key);
      } else {
        const base = filenameBase(f.name).toLowerCase();
        if (["gp-land","gp-port","7-land","7-port","10-land","10-port"].includes(base)) {
          bezelAssets.set(base, img);
          loaded.push(base);
        } else {
          console.warn("Skipping bezel file (name didn't match expected pattern):", f.name);
        }
      }
    } catch (err) {
      console.error("Error loading bezel", f.name, err);
    }
  }
  if (loaded.length) {
    bezelList.textContent = "Loaded bezel assets: " + loaded.join(", ");
  } else {
    bezelList.textContent = "No valid bezel assets loaded (use names like 10-land.png).";
  }
  updateMissingAssetsIndicator();
});

/* Update missing assets UI based on a list of outputs */
function updateMissingAssetsIndicator(outputs = null) {
  // gather expected ids we may use
  const expected = outputs ? outputs.map(o => o.id) : ["gp-land","gp-port","7-land","7-port","10-land","10-port"];
  const missing = [];
  for (const id of expected) {
    if (!bezelAssets.has(id)) missing.push(id);
  }
  if (missing.length === 0) {
    missingAssets.textContent = "All bezel assets present for the requested outputs.";
  } else {
    missingAssets.textContent = "Missing bezel assets: " + missing.join(", ");
  }
}

/* -----------------------
   Buttons
   ----------------------- */
generateBtn.addEventListener("click", () => {
  const files = upload.files;
  generateAllFromFiles(files);
});

exportAllBtn.addEventListener("click", async () => {
  if (generatedImages.length === 0) {
    return alert('No images in ZIP list — generate previews first or press "Add to ZIP" on previews.');
  }
  const zip = new JSZip();
  for (const item of generatedImages) {
    zip.file(item.filename, item.blob);
  }
  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, "daily-bread-tablet-screenshots.zip");
});

// convenience: single-click generate 10" landscape only
gen10LandBtn.addEventListener("click", async () => {
  const files = upload.files;
  if (!files || files.length === 0) return alert("Please choose one or more screenshots to process.");
  const out = PRESETS["10"].find(o => o.id === "10-land");
  if (!out) return alert('10" landscape preset not found.');
  await generateAllFromFiles(files, [out]);
});

/* -----------------------
   Live bezel preview + drag-to-adjust bounds
   ----------------------- */
/* We'll implement an interactive editor on `bezelPreview` canvas.
   The editor shows the bezel (if any) and the adjustable screen inner rect.
   Drag handles available at corners and midpoints.
*/

const bezelCtx = bezelPreview.getContext('2d');
let currentBezelPreset = bezelPresetSelect.value;
let previewImgForBezel = null; // image to display (bezel asset or placeholder)
let previewWidth = bezelPreview.width;
let previewHeight = bezelPreview.height;

// setup default margin values (proportional)
function defaultMarginsForPresetId(id, outW, outH) {
  // default 6% each side
  const m = Math.round(Math.min(outW, outH) * 0.06);
  return { left: m, top: m, right: m, bottom: m };
}

// we'll store normalized margins per preset as fractions [0..1] relative to target dims too
function ensureMarginsExistForPreset(id) {
  if (!bezelMargins.has(id)) {
    // infer sizes from PRESETS
    const all = [].concat(PRESETS.gp, PRESETS['7'], PRESETS['10']);
    const p = all.find(x => x.id === id);
    if (!p) {
      // fallback
      bezelMargins.set(id, { left: 40, top: 40, right: 40, bottom: 40 });
    } else {
      const defaultM = defaultMarginsForPresetId(id, p.w, p.h);
      bezelMargins.set(id, { left: defaultM.left, top: defaultM.top, right: defaultM.right, bottom: defaultM.bottom });
    }
  }
}
bezelPresetSelect.addEventListener("change", () => {
  currentBezelPreset = bezelPresetSelect.value;
  ensureMarginsExistForPreset(currentBezelPreset);
  renderBezelPreview();
});

// draw preview of bezel and inner rect
function renderBezelPreview() {
  // 1) pick an image for display: bezel asset for current preset if available, else show any loaded bezel or a placeholder
  previewImgForBezel = bezelAssets.get(currentBezelPreset) || Array.from(bezelAssets.values())[0] || null;

  // 2) determine canvas drawing size (preview canvas is fixed; we'll center and scale content to fit)
  previewWidth = bezelPreview.width;
  previewHeight = bezelPreview.height;

  bezelCtx.clearRect(0, 0, previewWidth, previewHeight);
  bezelCtx.fillStyle = "#222";
  bezelCtx.fillRect(0, 0, previewWidth, previewHeight);

  // find preset real output sizes
  const all = [].concat(PRESETS.gp, PRESETS['7'], PRESETS['10']);
  const p = all.find(x => x.id === currentBezelPreset);
  let viewW = previewWidth, viewH = previewHeight; // default
  let scale = 1;
  if (p) {
    const ratio = p.w / p.h;
    // fit the preset size into preview keeping aspect ratio
    if (previewWidth / previewHeight > ratio) {
      viewH = previewHeight;
      viewW = Math.round(viewH * ratio);
    } else {
      viewW = previewWidth;
      viewH = Math.round(viewW / ratio);
    }
    // scale factor from preset dims to view dims
    scale = viewW / p.w;
  }

  const offsetX = Math.round((previewWidth - viewW) / 2);
  const offsetY = Math.round((previewHeight - viewH) / 2);

  // draw bezel image scaled to viewW/viewH if present
  if (previewImgForBezel) {
    try {
      bezelCtx.drawImage(previewImgForBezel, offsetX, offsetY, viewW, viewH);
      bezelStatus.textContent = "Using bezel asset: " + (bezelAssets.has(currentBezelPreset) ? currentBezelPreset : "fallback asset");
    } catch (e) {
      bezelStatus.textContent = "Bezel asset failed to draw; using fallback";
      // draw fallback
      bezelCtx.fillStyle = "#f3f1ef";
      roundRect(bezelCtx, offsetX, offsetY, viewW, viewH, Math.min(viewW, viewH) * 0.06);
      bezelCtx.fill();
    }
  } else {
    // draw fallback bezel
    drawDefaultBezel(bezelCtx, viewW, viewH);
    // translate to center properly (we drew at 0,0 so re-blit into view)
    const imageData = bezelCtx.getImageData(0,0,viewW,viewH);
    bezelCtx.clearRect(0,0,previewWidth,previewHeight);
    bezelCtx.putImageData(imageData, offsetX, offsetY);
    bezelStatus.textContent = "No bezel asset for this preset — default bezel used.";
  }

  // draw inner screen rectangle using bezelMargins (scaled)
  ensureMarginsExistForPreset(currentBezelPreset);
  const m = bezelMargins.get(currentBezelPreset);
  const rect = {
    x: offsetX + (m.left * scale),
    y: offsetY + (m.top * scale),
    w: viewW - (m.left + m.right) * scale,
    h: viewH - (m.top + m.bottom) * scale
  };
  // overlay dark mask outside
  bezelCtx.save();
  bezelCtx.fillStyle = "rgba(0,0,0,0.36)";
  bezelCtx.beginPath();
  bezelCtx.rect(0,0,previewWidth,previewHeight);
  bezelCtx.rect(rect.x, rect.y, rect.w, rect.h);
  bezelCtx.fill("evenodd");
  bezelCtx.restore();

  // draw border for inner rect
  bezelCtx.strokeStyle = "#fff";
  bezelCtx.lineWidth = 2;
  bezelCtx.strokeRect(rect.x, rect.y, rect.w, rect.h);

  // draw handles (8 handles)
  const handles = computeHandles(rect);
  for (const h of handles) {
    drawHandle(h.x, h.y);
  }

  // store for interaction
  bezelPreview._editor = { offsetX, offsetY, viewW, viewH, scale, rect, handles };
}

// helper: compute handles positions (corners + midpoints)
function computeHandles(rect) {
  const cx = rect.x + rect.w/2, cy = rect.y + rect.h/2;
  return [
    { id: "nw", x: rect.x, y: rect.y },
    { id: "n", x: cx, y: rect.y },
    { id: "ne", x: rect.x + rect.w, y: rect.y },
    { id: "e", x: rect.x + rect.w, y: cy },
    { id: "se", x: rect.x + rect.w, y: rect.y + rect.h },
    { id: "s", x: cx, y: rect.y + rect.h },
    { id: "sw", x: rect.x, y: rect.y + rect.h },
    { id: "w", x: rect.x, y: cy }
  ];
}
function drawHandle(x, y) {
  const s = 10;
  bezelCtx.fillStyle = "#fff";
  bezelCtx.fillRect(x - s/2, y - s/2, s, s);
  bezelCtx.strokeStyle = "var(--accent)";
  bezelCtx.lineWidth = 2;
  bezelCtx.strokeRect(x - s/2, y - s/2, s, s);
}

/* Interaction for dragging handles */
let activeHandle = null;
let dragStart = null;

bezelPreview.addEventListener('mousedown', (ev) => {
  const edit = bezelPreview._editor;
  if (!edit) return;
  const rect = bezelPreview.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  // find closest handle within 12 px
  for (const h of edit.handles) {
    const dist = Math.hypot(x - h.x, y - h.y);
    if (dist <= 12) {
      activeHandle = h.id;
      dragStart = { x, y, origMargins: Object.assign({}, bezelMargins.get(currentBezelPreset)) };
      document.body.style.cursor = "grabbing";
      return;
    }
  }
});

document.addEventListener('mousemove', (ev) => {
  if (!activeHandle) return;
  const edit = bezelPreview._editor;
  if (!edit) return;
  const rectB = bezelPreview.getBoundingClientRect();
  const x = ev.clientX - rectB.left;
  const y = ev.clientY - rectB.top;
  const dx = (x - dragStart.x) / edit.scale;
  const dy = (y - dragStart.y) / edit.scale;
  // update margins based on handle
  const orig = dragStart.origMargins;
  let m = { left: orig.left, top: orig.top, right: orig.right, bottom: orig.bottom };
  // for each handle id update corresponding margins
  switch (activeHandle) {
    case 'nw':
      m.left = clamp(orig.left + dx, 0, edit.viewW);
      m.top = clamp(orig.top + dy, 0, edit.viewH);
      break;
    case 'n':
      m.top = clamp(orig.top + dy, 0, edit.viewH);
      break;
    case 'ne':
      m.right = clamp(orig.right - dx, 0, edit.viewW);
      m.top = clamp(orig.top + dy, 0, edit.viewH);
      break;
    case 'e':
      m.right = clamp(orig.right - dx, 0, edit.viewW);
      break;
    case 'se':
      m.right = clamp(orig.right - dx, 0, edit.viewW);
      m.bottom = clamp(orig.bottom - dy, 0, edit.viewH);
      break;
    case 's':
      m.bottom = clamp(orig.bottom - dy, 0, edit.viewH);
      break;
    case 'sw':
      m.left = clamp(orig.left + dx, 0, edit.viewW);
      m.bottom = clamp(orig.bottom - dy, 0, edit.viewH);
      break;
    case 'w':
      m.left = clamp(orig.left + dx, 0, edit.viewW);
      break;
  }
  bezelMargins.set(currentBezelPreset, m);
  renderBezelPreview();
});

document.addEventListener('mouseup', () => {
  if (activeHandle) {
    activeHandle = null;
    dragStart = null;
    document.body.style.cursor = "";
  }
});

/* Save/reset buttons */
saveBezelBtn.addEventListener('click', () => {
  alert('Saved margins for preset: ' + currentBezelPreset + '\n' + JSON.stringify(bezelMargins.get(currentBezelPreset)));
});

resetBezelBtn.addEventListener('click', () => {
  bezelMargins.delete(currentBezelPreset);
  ensureMarginsExistForPreset(currentBezelPreset);
  renderBezelPreview();
});

/* Apply JSON as mapping presetId -> margins */
applyBezelJson.addEventListener('click', () => {
  try {
    const parsed = JSON.parse(bezelJson.value);
    for (const k of Object.keys(parsed)) {
      const obj = parsed[k];
      if (obj && typeof obj.left === 'number' && typeof obj.top === 'number' && typeof obj.right === 'number' && typeof obj.bottom === 'number') {
        bezelMargins.set(k, obj);
      }
    }
    alert('Applied bezel JSON. Re-rendering preview.');
    renderBezelPreview();
  } catch (e) {
    alert('Invalid JSON: ' + e.message);
  }
});

/* Auto-scale loaded bezel to preset (attempt using pixel-aligned scaling) */
autoScaleBtn.addEventListener('click', () => {
  // This creates a scaled canvas version of the loaded bezel asset for the current preset using stored margins
  const bezelImg = bezelAssets.get(currentBezelPreset);
  if (!bezelImg) return alert('No bezel asset loaded for selected preset.');
  const all = [].concat(PRESETS.gp, PRESETS['7'], PRESETS['10']);
  const p = all.find(x => x.id === currentBezelPreset);
  if (!p) return alert('Preset not found for auto-scale.');

  // create canvas at target dimensions and draw the bezel scaled
  const outW = p.w, outH = p.h;
  const c = document.createElement('canvas');
  c.width = outW; c.height = outH;
  const ctx = c.getContext('2d');
  // draw bezel image scaled to exactly outW/outH
  ctx.drawImage(bezelImg, 0, 0, outW, outH);
  // replace bezelAssets map entry with the scaled canvas (so drawing later will use this raster sized canvas)
  bezelAssets.set(currentBezelPreset, c);
  alert('Auto-scaled bezel for ' + currentBezelPreset + ' to ' + outW + 'x' + outH);
  renderBezelPreview();
});

/* initial render */
ensureMarginsExistForPreset(bezelPresetSelect.value);
renderBezelPreview();

/* -----------------------
   Export profiles: change which outputs are used
   ----------------------- */
storeProfile.addEventListener('change', () => {
  // you could implement logic to select a different set of outputs per store.
  // For now the UI simply switches an internal state used when the user calls generate.
  // Example extension: pre-select presets or alter DPI.
});

/* -----------------------
   Small utility: parse bezel margin JSON format and return margins as ints mapped to presets
   ----------------------- */
function parseBezelJsonString(s) {
  try {
    const obj = JSON.parse(s);
    const out = {};
    for (const k in obj) {
      const v = obj[k];
      if (v && typeof v.left === 'number' && typeof v.top === 'number' && typeof v.right === 'number' && typeof v.bottom === 'number') {
        out[k] = v;
      }
    }
    return out;
  } catch (e) {
    return null;
  }
}

/* -----------------------
   Initialize UI behaviors
   ----------------------- */
presetSelect.addEventListener('change', () => {
  if (presetSelect.value === 'gp') bgPad.checked = true;
});

/* Expose renderBezelPreview for external triggers if you programmatically change bezelAssets */
window.__renderBezelPreview = renderBezelPreview;

/* On load attempt: check service worker registration for PWA */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    // no action required here, user can register SW on deploy
  }).catch(()=>{});
}
