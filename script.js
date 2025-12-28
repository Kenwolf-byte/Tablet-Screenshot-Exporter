/* Tablet Screenshot Exporter — Daily Bread Tooling (Fixed) */

// --- Presets: Output sizes ---
// Expanded to support the Store Profile selector
const ALL_PRESETS = {
  play: {
    gp: [
      { id: "gp-land", w: 1920, h: 1080, label: "Google Play — Landscape (1920×1080)" },
      { id: "gp-port", w: 1080, h: 1920, label: "Google Play — Portrait (1080×1920)" },
    ],
    7: [
      { id: "7-land", w: 1024, h: 600, label: '7" — Landscape (1024×600)' },
      { id: "7-port", w: 600, h: 1024, label: '7" — Portrait (600×1024)' },
    ],
    10: [
      { id: "10-land", w: 1280, h: 800, label: '10" — Landscape (1280×800)' },
      { id: "10-port", w: 800, h: 1280, label: '10" — Portrait (1280×800)' },
    ],
  },
  appstore: {
    ipad: [
      { id: "ipad-pro-land", w: 2732, h: 2048, label: 'iPad Pro (12.9") — Landscape' },
      { id: "ipad-pro-port", w: 2048, h: 2732, label: 'iPad Pro (12.9") — Portrait' },
    ],
    iphone: [
      { id: "iphone-max-land", w: 2778, h: 1284, label: 'iPhone (6.5") — Landscape' },
      { id: "iphone-max-port", w: 1284, h: 2778, label: 'iPhone (6.5") — Portrait' },
    ]
  },
  web: {
    hero: [
        { id: "web-hero", w: 1600, h: 900, label: 'Web Hero (16:9)' }
    ]
  }
};

// Default Margins (Embedded from your original bezel-margins.json)
const DEFAULT_MARGINS = {
  "10-land": { "left": 48, "top": 36, "right": 48, "bottom": 36 },
  "10-port": { "left": 34, "top": 56, "right": 34, "bottom": 56 },
  "gp-land": { "left": 70, "top": 50, "right": 70, "bottom": 50 } // Added generic default
};

// DOM Elements
const upload = document.getElementById("multiUpload");
const generateBtn = document.getElementById("generateBtn");
const exportAllBtn = document.getElementById("exportAllBtn");
const previewGrid = document.getElementById("previewGrid");
const bezelToggle = document.getElementById("bezelToggle");
const bgPad = document.getElementById("bgPad");
const presetSelect = document.getElementById("presetSelect");
const storeProfile = document.getElementById("storeProfile"); 
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
const missingAssets = document.getElementById("missingAssets");

// New DOM elements for file feedback
const fileListDisplay = document.getElementById("fileListDisplay");
const clearFilesBtn = document.getElementById("clearFilesBtn");


let generatedImages = []; 
const bezelAssets = new Map(); 
// Initialize margins with defaults
const bezelMargins = new Map(Object.entries(DEFAULT_MARGINS)); 


/* -----------------------
   Initial Setup / Dynamic UI Logic
   ----------------------- */
// Update preset options when Store Profile changes
storeProfile.addEventListener("change", updatePresetOptions);

function updatePresetOptions() {
  const mode = storeProfile.value; // play, appstore, web
  const group = ALL_PRESETS[mode];
  
  presetSelect.innerHTML = ""; // Clear existing
  
  Object.keys(group).forEach(key => {
    // Create option groups or simple options
    const opt = document.createElement("option");
    opt.value = key;
    // Formatting labels nicely
    if (key === 'gp') opt.text = "Google Play (Recommended)";
    else if (key === 'ipad') opt.text = "iPad Pro (12.9\")";
    else if (key === 'iphone') opt.text = "iPhone Pro Max";
    else opt.text = `${key} inch / Generic`;
    
    presetSelect.appendChild(opt);
  });
}

// Initialize on load
updatePresetOptions();


/* -----------------------
   Immediate File Feedback and Clear Functionality
   ----------------------- */

// This function updates the file list display based on the files currently in the input
function updateFileListDisplay() {
  const files = upload.files;
  
  fileListDisplay.innerHTML = "";
  clearFilesBtn.style.display = "none";

  if (!files || files.length === 0) {
    return;
  }

  // Show the clear button with the file count
  clearFilesBtn.style.display = "block";
  clearFilesBtn.textContent = `Clear (${files.length})`;

  // Create the list of files
  const list = document.createElement("ul");
  
  Array.from(files).forEach(file => {
    const li = document.createElement("li");
    li.textContent = file.name;
    list.appendChild(li);
  });

  fileListDisplay.appendChild(list);
}

// Listen for file selection changes (fixes the issue)
upload.addEventListener("change", updateFileListDisplay);

// Clear files button handler
clearFilesBtn.addEventListener('click', () => {
    // This is the standard way to clear a file input
    upload.value = null; 
    updateFileListDisplay();
    // Clear preview grid too for clean slate
    previewGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; border: 2px dashed var(--border); border-radius: 12px; color: var(--text-muted);">Upload images and click "Generate" to see results here.</div>';
    generatedImages = [];
});

/* -----------------------
   Helpers
   ----------------------- */
function readFileAsImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); rej(e); };
    img.src = url;
  });
}

function filenameBase(name) { return name.replace(/\.[^/.]+$/, ""); }

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

/* -----------------------
   Rotation & Scaling Logic (Includes Aspect Fill Fix)
   ----------------------- */
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
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(sourceImg, 0, 0);
  return c;
}

// Fill: Fills area (Crops edges) - Prevents distortion
function drawImageAspectFill(ctx, img, rect) {
  const scale = Math.max(rect.w / img.width, rect.h / img.height);
  const dW = img.width * scale;
  const dH = img.height * scale;
  const dx = rect.x + (rect.w - dW) / 2;
  const dy = rect.y + (rect.h - dH) / 2;
  ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, dW, dH);
}

// Fit: Shows entire image with black bars
function drawImageAspectFit(ctx, img, rect) {
  const scale = Math.min(rect.w / img.width, rect.h / img.height);
  const dW = img.width * scale;
  const dH = img.height * scale;
  const dx = rect.x + (rect.w - dW) / 2;
  const dy = rect.y + (rect.h - dH) / 2;
  ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, dW, dH);
}

/* -----------------------
   Drawing Logic
   ----------------------- */

function createMockupCanvas(img, outW, outH, options = {}, bezelImg = null) {
  const bezelOn = options.bezel;
  const padBg = options.padBg;
  const autoRot = options.autoRot;
  const useBezelAsset = options.useBezelAsset;

  let source = img;
  if (needsRotationForTarget(img, outW, outH, autoRot)) {
    source = createRotatedCanvas(img);
  }

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = padBg ? "#f7eee6" : "#000000"; 
  ctx.fillRect(0, 0, outW, outH);

  let screenRect = { x: 0, y: 0, w: outW, h: outH };
  
  // -- MODE A: BEZEL IS ON --
  if (bezelOn) {
    const key = findPresetIdForWh(outW, outH);
    const saved = key ? bezelMargins.get(key) : null;
    
    if (saved) {
      screenRect = {
        x: saved.left, y: saved.top,
        w: outW - saved.left - saved.right,
        h: outH - saved.top - saved.bottom
      };
    } else {
      const m = Math.round(Math.min(outW, outH) * 0.06);
      screenRect = { x: m, y: m, w: outW - m * 2, h: outH - m * 2 };
    }

    ctx.save();
    roundRect(ctx, screenRect.x, screenRect.y, screenRect.w, screenRect.h, Math.min(screenRect.w, screenRect.h) * 0.03);
    ctx.clip();
    
    ctx.fillStyle = "#000";
    ctx.fillRect(screenRect.x, screenRect.y, screenRect.w, screenRect.h);
    
    // FIX: Uses AspectFill to prevent distortion
    drawImageAspectFill(ctx, source, screenRect);
    ctx.restore();

    if (useBezelAsset && bezelImg) {
      ctx.drawImage(bezelImg, 0, 0, outW, outH);
    } else {
      drawDefaultBezel(ctx, outW, outH);
    }

  } 
  // -- MODE B: PADDED --
  else if (padBg) {
    const padding = Math.min(outW, outH) * 0.08;
    screenRect = {
      x: padding, y: padding,
      w: outW - (padding * 2),
      h: outH - (padding * 2)
    };

    const cardRadius = Math.min(screenRect.w, screenRect.h) * 0.04;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
    ctx.shadowBlur = Math.min(outW, outH) * 0.04;
    ctx.shadowOffsetY = Math.min(outW, outH) * 0.02;
    ctx.fillStyle = "#000"; 
    roundRect(ctx, screenRect.x, screenRect.y, screenRect.w, screenRect.h, cardRadius);
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRect(ctx, screenRect.x, screenRect.y, screenRect.w, screenRect.h, cardRadius);
    ctx.clip();
    drawImageAspectFill(ctx, source, screenRect);
    ctx.restore();

  } 
  // -- MODE C: RAW FIT --
  else {
    drawImageAspectFit(ctx, source, screenRect);
  }

  return canvas;
}

function drawDefaultBezel(ctx, w, h) {
  const r = Math.min(w, h) * 0.06;
  ctx.save();
  ctx.strokeStyle = "#d1d5db"; 
  ctx.lineWidth = Math.max(2, w * 0.01);
  roundRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth, r);
  ctx.stroke();
  ctx.restore();
}

function findPresetIdForWh(w, h) {
  const categories = Object.values(ALL_PRESETS);
  for (const cat of categories) {
    for (const groupKey in cat) {
      const group = cat[groupKey];
      for (const p of group) {
        if (p.w === w && p.h === h) return p.id;
      }
    }
  }
  return null;
}

/* -----------------------
   Generate Pipeline
   ----------------------- */
async function generateAllFromFiles(files, onlyOutputs = null) {
  previewGrid.innerHTML = "";
  generatedImages = [];

  if (!files || files.length === 0) {
    alert("Please choose one or more screenshots to process.");
    return;
  }

  let targets = [];
  if (Array.isArray(onlyOutputs) && onlyOutputs.length > 0) {
    targets = onlyOutputs;
  } else {
    const mode = storeProfile.value;
    const presetKey = presetSelect.value;
    const group = ALL_PRESETS[mode][presetKey];
    
    if (mode === 'play') {
       targets = [].concat(ALL_PRESETS.play[presetKey] || [])
                   .concat(ALL_PRESETS.play["7"])
                   .concat(ALL_PRESETS.play["10"]);
    } else {
       targets = group || [];
    }
  }

  // Deduplicate
  const unique = [];
  const ids = new Set();
  for (const o of targets) {
    if (!ids.has(o.id)) { unique.push(o); ids.add(o.id); }
  }

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
        const canvas = createMockupCanvas(img, out.w, out.h, options, bezelImg);

        const card = document.createElement("div");
        card.className = "card preview-card";
        const title = document.createElement("div");
        title.innerHTML = `<strong>${file.name}</strong><div class="meta">${out.label}</div>`;
        card.appendChild(title);

        const previewCanvas = document.createElement("canvas");
        const previewMaxWidth = 480;
        const scale = Math.min(1, previewMaxWidth / out.w);
        previewCanvas.width = Math.round(out.w * scale);
        previewCanvas.height = Math.round(out.h * scale);
        previewCanvas.getContext('2d').drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);
        card.appendChild(previewCanvas);

        const btnRow = document.createElement("div");
        btnRow.className = "row btn-group"; 
        
        const fnameBaseStr = `${filenameBase(file.name)}-${out.id}`;
        
        const dlBtn = document.createElement("button");
        dlBtn.className = "primary";
        dlBtn.innerText = "Download PNG";
        dlBtn.onclick = () => {
          canvas.toBlob((b) => { saveAs(b, `${fnameBaseStr}.png`); });
        };

        const addZipBtn = document.createElement("button");
        addZipBtn.className = "ghost";
        addZipBtn.innerText = "Add to ZIP";
        addZipBtn.onclick = () => {
          addZipBtn.innerText = "Included";
        };

        btnRow.appendChild(dlBtn);
        btnRow.appendChild(addZipBtn);
        card.appendChild(btnRow);
        previewGrid.appendChild(card);

        await new Promise((res) => canvas.toBlob((b) => { 
            generatedImages.push({ filename: `${fnameBaseStr}.png`, blob: b }); 
            res(); 
        }));
      }
    } catch (err) {
      console.error(err);
      alert("Error processing file " + file.name);
    }
  }
}

/* -----------------------
   Bezel Asset Management
   ----------------------- */
bezelUpload.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  bezelAssets.clear();
  const loaded = [];
  for (const f of files) {
    try {
      const img = await readFileAsImage(f);
      const name = f.name.toLowerCase();
      const match = name.match(/(?:bezel-)?([a-z0-9]+)-(land|port)\.(png)$/i);
      
      if (match) {
        const key = `${match[1]}-${match[2]}`;
        bezelAssets.set(key, img);
        loaded.push(key);
      }
    } catch (err) { console.error(err); }
  }
  
  if (loaded.length) {
    bezelList.textContent = "Loaded: " + loaded.join(", ");
  } else {
    bezelList.textContent = "No matching assets. Use format 'id-orientation.png' (e.g., 10-land.png)";
  }
  updateMissingAssetsIndicator();
});

function updateMissingAssetsIndicator(outputs = null) {
  if(!outputs) return;
  
  const missing = [];
  for (const out of outputs) {
    if (!bezelAssets.has(out.id)) missing.push(out.id);
  }
  
  if (missing.length === 0) {
    missingAssets.textContent = "All bezel assets ready.";
    missingAssets.style.color = "green";
  } else {
    missingAssets.textContent = "Missing: " + missing.join(", ");
    missingAssets.style.color = "var(--primary)";
  }
}

/* -----------------------
   Buttons & Listeners
   ----------------------- */
generateBtn.addEventListener("click", () => {
  const files = upload.files;
  generateAllFromFiles(files);
});

exportAllBtn.addEventListener("click", async () => {
  if (generatedImages.length === 0) {
    return alert('No images generated yet.');
  }
  const zip = new JSZip();
  for (const item of generatedImages) {
    zip.file(item.filename, item.blob);
  }
  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, "daily-bread-screenshots.zip");
});

gen10LandBtn.addEventListener("click", async () => {
  const files = upload.files;
  if (!files || files.length === 0) return alert("Select screenshots first.");
  const out = ALL_PRESETS.play["10"].find(o => o.id === "10-land");
  await generateAllFromFiles(files, [out]);
});

/* -----------------------
   Bezel Editor (Live Preview)
   ----------------------- */
const bezelCtx = bezelPreview.getContext('2d');
let currentBezelPreset = bezelPresetSelect.value;

function ensureMarginsExistForPreset(id) {
  if (!bezelMargins.has(id)) {
      const w = 1280; // fallback
      const m = Math.round(w * 0.06); 
      bezelMargins.set(id, { left: m, top: m, right: m, bottom: m });
  }
}

bezelPresetSelect.addEventListener("change", () => {
  currentBezelPreset = bezelPresetSelect.value;
  ensureMarginsExistForPreset(currentBezelPreset);
  renderBezelPreview();
});

function renderBezelPreview() {
  const previewImgForBezel = bezelAssets.get(currentBezelPreset) || null;
  const pWidth = bezelPreview.width;
  const pHeight = bezelPreview.height;

  bezelCtx.clearRect(0, 0, pWidth, pHeight);
  bezelCtx.fillStyle = "#222";
  bezelCtx.fillRect(0, 0, pWidth, pHeight);

  let p = null;
  const allCats = Object.values(ALL_PRESETS);
  for(const cat of allCats) {
      for(const group in cat) {
          const found = cat[group].find(x => x.id === currentBezelPreset);
          if(found) p = found;
      }
  }
  if (!p) p = { w: 1280, h: 800 }; 

  let viewW = pWidth, viewH = pHeight;
  const ratio = p.w / p.h;
  if (pWidth / pHeight > ratio) {
    viewH = pHeight;
    viewW = Math.round(viewH * ratio);
  } else {
    viewW = pWidth;
    viewH = Math.round(viewW / ratio);
  }
  const scale = viewW / p.w;
  const offsetX = Math.round((pWidth - viewW) / 2);
  const offsetY = Math.round((pHeight - viewH) / 2);

  if (previewImgForBezel) {
      bezelCtx.drawImage(previewImgForBezel, offsetX, offsetY, viewW, viewH);
      bezelStatus.textContent = "Asset Loaded: " + currentBezelPreset;
  } else {
      bezelCtx.fillStyle = "#f3f1ef";
      roundRect(bezelCtx, offsetX, offsetY, viewW, viewH, Math.min(viewW, viewH) * 0.06);
      bezelCtx.fill();
      bezelStatus.textContent = "Using fallback (No Asset)";
  }

  ensureMarginsExistForPreset(currentBezelPreset);
  const m = bezelMargins.get(currentBezelPreset);
  const rect = {
    x: offsetX + (m.left * scale),
    y: offsetY + (m.top * scale),
    w: viewW - (m.left + m.right) * scale,
    h: viewH - (m.top + m.bottom) * scale
  };

  bezelCtx.save();
  bezelCtx.fillStyle = "rgba(0,0,0,0.5)";
  bezelCtx.beginPath();
  bezelCtx.rect(0,0,pWidth,pHeight); 
  bezelCtx.rect(rect.x, rect.y, rect.w, rect.h);
  bezelCtx.fill("evenodd"); 
  bezelCtx.restore();

  bezelCtx.strokeStyle = "#00e676"; 
  bezelCtx.lineWidth = 2;
  bezelCtx.strokeRect(rect.x, rect.y, rect.w, rect.h);

  const handles = computeHandles(rect);
  for (const h of handles) drawHandle(h.x, h.y);

  bezelPreview._editor = { 
      offsetX, offsetY, viewW, viewH, scale, rect, handles 
  };
}

function computeHandles(rect) {
  const cx = rect.x + rect.w/2, cy = rect.y + rect.h/2;
  return [
    { id: "nw", x: rect.x, y: rect.y }, { id: "n", x: cx, y: rect.y },
    { id: "ne", x: rect.x + rect.w, y: rect.y }, { id: "e", x: rect.x + rect.w, y: cy },
    { id: "se", x: rect.x + rect.w, y: rect.y + rect.h }, { id: "s", x: cx, y: rect.y + rect.h },
    { id: "sw", x: rect.x, y: rect.y + rect.h }, { id: "w", x: rect.x, y: cy }
  ];
}
function drawHandle(x, y) {
  bezelCtx.fillStyle = "#fff";
  bezelCtx.fillRect(x - 5, y - 5, 10, 10);
  bezelCtx.strokeStyle = "#000";
  bezelCtx.strokeRect(x - 5, y - 5, 10, 10);
}

// -- Dragging Logic for Editor --
let activeHandle = null;
let dragStart = null;

bezelPreview.addEventListener('mousedown', (ev) => {
  const edit = bezelPreview._editor;
  if (!edit) return;
  
  const rect = bezelPreview.getBoundingClientRect();
  const scaleX = bezelPreview.width / rect.width;
  const scaleY = bezelPreview.height / rect.height;
  
  const x = (ev.clientX - rect.left) * scaleX;
  const y = (ev.clientY - rect.top) * scaleY;

  for (const h of edit.handles) {
    if (Math.hypot(x - h.x, y - h.y) <= 20) {
      activeHandle = h.id;
      dragStart = { x, y, origMargins: { ...bezelMargins.get(currentBezelPreset) } };
      document.body.style.cursor = "grabbing";
      return;
    }
  }
});

document.addEventListener('mousemove', (ev) => {
  if (!activeHandle) return;
  const edit = bezelPreview._editor;
  
  // FIX: Apply same coordinate scaling
  const rectB = bezelPreview.getBoundingClientRect();
  const scaleX = bezelPreview.width / rectB.width;
  const scaleY = bezelPreview.height / rectB.height;
  
  const x = (ev.clientX - rectB.left) * scaleX;
  const y = (ev.clientY - rectB.top) * scaleY;
  
  const dx = (x - dragStart.x) / edit.scale;
  const dy = (y - dragStart.y) / edit.scale;
  
  const m = { ...dragStart.origMargins };
  if (activeHandle.includes('n')) m.top += dy;
  if (activeHandle.includes('s')) m.bottom -= dy;
  if (activeHandle.includes('w')) m.left += dx;
  if (activeHandle.includes('e')) m.right -= dx;
  
  m.top = Math.max(0, m.top); m.bottom = Math.max(0, m.bottom);
  m.left = Math.max(0, m.left); m.right = Math.max(0, m.right);

  bezelMargins.set(currentBezelPreset, m);
  renderBezelPreview();
});

document.addEventListener('mouseup', () => {
  activeHandle = null;
  document.body.style.cursor = "";
});

saveBezelBtn.addEventListener('click', () => {
  bezelJson.value = JSON.stringify(Object.fromEntries(bezelMargins), null, 2);
  alert(`Configuration saved to JSON box below.`);
});
resetBezelBtn.addEventListener('click', () => {
  bezelMargins.delete(currentBezelPreset);
  ensureMarginsExistForPreset(currentBezelPreset);
  renderBezelPreview();
});
applyBezelJson.addEventListener('click', () => {
  try {
    const parsed = JSON.parse(bezelJson.value);
    for (const k in parsed) bezelMargins.set(k, parsed[k]);
    alert('JSON Applied');
    renderBezelPreview();
  } catch (e) { alert('Invalid JSON'); }
});

// Initial kick off
renderBezelPreview();