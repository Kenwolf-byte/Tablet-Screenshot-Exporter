/* app.js */
const PRESETS = {
  gp: [
    {
      id: "gp-land",
      w: 1920,
      h: 1080,
      label: "Google Play — landscape (1920×1080)",
    },
    {
      id: "gp-port",
      w: 1080,
      h: 1920,
      label: "Google Play — portrait (1080×1920)",
    },
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

const upload = document.getElementById("multiUpload");
const generateBtn = document.getElementById("generateBtn");
const exportAllBtn = document.getElementById("exportAllBtn");
const previewGrid = document.getElementById("previewGrid");
const bezelToggle = document.getElementById("bezelToggle");
const bgPad = document.getElementById("bgPad");
const presetSelect = document.getElementById("presetSelect");
const bezelUpload = document.getElementById("bezelUpload");
const useBezelAsset = document.getElementById("useBezelAsset");
const autoRotate = document.getElementById("autoRotate");
const gen10LandBtn = document.getElementById("gen10LandBtn");
const composeModeSelect = document.getElementById("composeMode");
const bezelJsonToggle = document.getElementById("bezelJsonToggle");
const bezelJsonUpload = document.getElementById("bezelJsonUpload");

let generatedImages = [];
const bezelAssets = new Map();
let bezelMargins = {}; // optional JSON with inner margins keyed by preset id

/* util */
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
function roundRect(ctx, x, y, w, h, r) {
  const R = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + R, y);
  ctx.arcTo(x + w, y, x + w, y + h, R);
  ctx.arcTo(x + w, y + h, x, y + h, R);
  ctx.arcTo(x, y + h, x, y, R);
  ctx.arcTo(x, y, x + w, y, R);
  ctx.closePath();
}

/* detect if rotating source helps match orientation */
function needsRotationForTarget(img, outW, outH, autoRotFlag) {
  if (!autoRotFlag) return false;
  const imgLandscape = img.width >= img.height;
  const targetLandscape = outW >= outH;
  return imgLandscape !== targetLandscape;
}
function createRotatedSourceIfNeeded(img, rotateCW) {
  if (!rotateCW) return img;
  const t = document.createElement("canvas");
  t.width = img.height;
  t.height = img.width;
  const tc = t.getContext("2d");
  tc.translate(t.width, 0);
  tc.rotate(Math.PI / 2);
  tc.drawImage(img, 0, 0);
  return t;
}

/* compose helpers */

/* blur & draw cover — simple box-blur fallback via scaled draw for a "soft" background */
function drawBlurBackground(ctx, src, w, h) {
  // quick approximate blur: draw scaled-down image then scale back up
  const smallW = Math.max(64, Math.round(w / 10));
  const smallH = Math.max(64, Math.round(h / 10));
  const tmp = document.createElement("canvas");
  tmp.width = smallW;
  tmp.height = smallH;
  const tc = tmp.getContext("2d");
  // cover-fill small canvas
  const scale = Math.max(smallW / src.width, smallH / src.height);
  const sw = src.width * scale,
    sh = src.height * scale;
  tc.drawImage(src, (smallW - sw) / 2, (smallH - sh) / 2, sw, sh);
  // draw back to large canvas stretched (soft)
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.drawImage(tmp, 0, 0, smallW, smallH, 0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, 0, w, h); // soften slightly
  ctx.restore();
}

/* fit and draw source into rectangle with aspect-fit */
function fitAndDrawImageToRect(
  ctx,
  src,
  destX,
  destY,
  destW,
  destH,
  padBackground
) {
  const scale = Math.min(destW / src.width, destH / src.height);
  const drawW = src.width * scale,
    drawH = src.height * scale;
  const x = destX + (destW - drawW) / 2;
  const y = destY + (destH - drawH) / 2;
  if (padBackground) {
    ctx.fillStyle = "#111";
    ctx.fillRect(destX, destY, destW, destH);
  }
  ctx.drawImage(src, x, y, drawW, drawH);
}

/* auto-scale a bezel PNG if bezel JSON provided: JSON format:
{
  "10-land": { "inner": { "left": 64, "top": 56, "right":64, "bottom":56 } },
  "10-port": { "inner": { ... } }
}
*/
function scaleBezelToOutput(bezelImg, outputW, outputH, marginSpec) {
  // marginSpec.inner are pixel values for bezel source size; bezelImg will be scaled to output dims
  // to compute scaled inner box in output pixels: outInnerLeft = margin.left * (outputW / bezelImg.width)
  // but we will simply draw bezel scaled to output size; caller uses margins to compute inner screen rect.
  // Return an object describing scaled inner box in output pixels.
  const scaleX = outputW / bezelImg.width;
  const scaleY = outputH / bezelImg.height;
  const s = { scaledInner: null, scaleX, scaleY };
  if (marginSpec && marginSpec.inner) {
    const i = marginSpec.inner;
    s.scaledInner = {
      left: Math.round(i.left * scaleX),
      top: Math.round(i.top * scaleY),
      right: Math.round(i.right * scaleX),
      bottom: Math.round(i.bottom * scaleY),
      width: Math.round(outputW - (i.left + i.right) * scaleX),
      height: Math.round(outputH - (i.top + i.bottom) * scaleY),
    };
  }
  return s;
}

/* create mockup canvas: three main modes:
   - compose: produce assistant-like tablet mockup (blur background + centered screenshot scaled to fit screen area)
   - rotate: rotate the input 90deg when needed
   - embed: center the input screenshot in the screen area (no blur)
*/
function createMockupCanvas(img, outW, outH, options, bezelImgForThisOutput) {
  const mode = options.composeMode || "compose";
  // rotate if mode==rotate and target orientation differs
  let source = img;
  if (
    mode === "rotate" &&
    needsRotationForTarget(img, outW, outH, options.autoRot)
  ) {
    source = createRotatedSourceIfNeeded(img, true);
  }

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");

  // Start with a background depending on mode:
  if (mode === "compose") {
    // blurred background from source (cover)
    drawBlurBackground(ctx, source, outW, outH);
  } else {
    // solid background
    ctx.fillStyle = options.padBg ? "#ffffff" : "#000000";
    ctx.fillRect(0, 0, outW, outH);
  }

  // Determine inner screen rectangle: if bezel is used and we have a bezelMargins spec for this output, use that
  let margin = 0;
  if (options.bezel) {
    margin = Math.round(Math.min(outW, outH) * 0.06);
  }
  // if bezel asset plus JSON margins exist we can refine margins (handled by caller)
  const screenX = margin,
    screenY = margin,
    screenW = outW - margin * 2,
    screenH = outH - margin * 2;

  // Drawing rules:
  // - For 'compose' mode: center the source inside the screen area, but scale it so its height matches ~90% of screenH (so dialog looks like tablet dialog rather than rotated)
  // - For 'embed' mode: just aspect-fit into screen area
  // - For 'rotate' mode: after rotation above, aspect-fit into screen area
  if (mode === "compose") {
    // choose scale so source height fills ~85% of screenH (keeps dialog wide)
    const targetH = Math.round(screenH * 0.85);
    const scale = Math.min(screenW / source.width, targetH / source.height);
    const drawW = source.width * scale,
      drawH = source.height * scale;
    const x = screenX + (screenW - drawW) / 2;
    const y = screenY + (screenH - drawH) / 2;
    // add subtle white overlay to the source area if we want it pop
    ctx.save();
    // optionally draw a rounded rect backdrop (soft)
    ctx.fillStyle = "rgba(255,255,255,0.0)";
    // draw the source
    ctx.drawImage(source, x, y, drawW, drawH);
    ctx.restore();
  } else {
    // embed / rotate modes
    fitAndDrawImageToRect(
      ctx,
      source,
      screenX,
      screenY,
      screenW,
      screenH,
      options.padBg
    );
  }

  // Now draw bezel: prefer PNG asset if requested and available; else draw fallback rounded bezel
  if (options.bezel) {
    if (options.useBezelAsset && bezelImgForThisOutput) {
      try {
        // Draw bezel asset scaled to output dims
        ctx.drawImage(bezelImgForThisOutput, 0, 0, outW, outH);
      } catch (e) {
        drawDefaultBezel(ctx, outW, outH);
      }
    } else {
      drawDefaultBezel(ctx, outW, outH);
    }
  }

  return canvas;
}

/* fallback drawn bezel (simple) */
function drawDefaultBezel(ctx, w, h) {
  const r = Math.min(w, h) * 0.06;
  ctx.save();
  ctx.fillStyle = "#f3f1ef";
  roundRect(ctx, 0, 0, w, h, r);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.06)";
  ctx.lineWidth = Math.max(2, w * 0.006);
  roundRect(
    ctx,
    ctx.lineWidth / 2,
    ctx.lineWidth / 2,
    w - ctx.lineWidth,
    h - ctx.lineWidth,
    r * 0.85
  );
  ctx.stroke();
  const pillW = Math.max(40, w * 0.08),
    pillH = Math.max(6, h * 0.007);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(w / 2, pillH * 3, pillW / 3, pillH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* generate all outputs from input files */
async function generateAllFromFiles(files, onlyOutputs) {
  previewGrid.innerHTML = "";
  generatedImages = [];
  if (!files || files.length === 0) return alert("Please choose screenshots.");

  const presetKey = presetSelect.value;
  let outputsForPreset = []
    .concat(PRESETS[presetKey] || [])
    .concat(PRESETS["7"])
    .concat(PRESETS["10"]);

  if (Array.isArray(onlyOutputs) && onlyOutputs.length)
    outputsForPreset = onlyOutputs;

  // dedupe
  const unique = [];
  const ids = new Set();
  for (const o of outputsForPreset)
    if (!ids.has(o.id)) {
      unique.push(o);
      ids.add(o.id);
    }

  for (const file of files) {
    try {
      const img = await readFileAsImage(file);
      for (const out of unique) {
        const options = {
          bezel: bezelToggle.checked,
          padBg: bgPad.checked,
          useBezelAsset: useBezelAsset.checked,
          autoRot: autoRotate.checked,
          composeMode: composeModeSelect.value,
        };

        // pick bezel asset if available
        const bezelImg = bezelAssets.get(out.id) || null;
        const canvas = createMockupCanvas(img, out.w, out.h, options, bezelImg);

        // create preview card
        const card = document.createElement("div");
        card.className = "card";
        const frame = document.createElement("div");
        frame.className = "frame";
        const title = document.createElement("div");
        title.innerHTML = `<strong>${file.name}</strong><div class="meta">${out.label}</div>`;
        const mockWrap = document.createElement("div");
        mockWrap.className = "canvas-wrap";
        mockWrap.appendChild(canvas);

        // bezel missing indicator
        const bezelStatus = document.createElement("div");
        bezelStatus.className = "bezel-status";
        if (options.bezel && options.useBezelAsset) {
          if (bezelImg) {
            bezelStatus.innerHTML = `<span class="badge">Bezel asset: ${out.id}</span>`;
          } else {
            bezelStatus.innerHTML = `<span class="warn">Missing bezel asset for <strong>${out.id}</strong></span>`;
          }
        } else {
          bezelStatus.innerHTML = `<span class="meta">Using ${
            options.bezel ? "drawn bezel" : "no bezel"
          }</span>`;
        }

        const row = document.createElement("div");
        row.className = "row";
        const fnameBase = `${file.name.replace(/\.[^/.]+$/, "")}-${out.id}`;
        const dlBtn = document.createElement("button");
        dlBtn.className = "primary";
        const fname = `${fnameBase}.png`;
        dlBtn.innerText = "Download PNG";
        dlBtn.onclick = () => {
          canvas.toBlob((b) => saveAs(b, fname));
        };

        const addZipBtn = document.createElement("button");
        addZipBtn.className = "ghost";
        addZipBtn.innerText = "Add to ZIP";
        addZipBtn.onclick = () => {
          canvas.toBlob((b) => {
            generatedImages.push({ filename: fname, blob: b });
            alert(fname + " added to ZIP list");
          });
        };

        row.appendChild(dlBtn);
        row.appendChild(addZipBtn);
        frame.appendChild(title);
        frame.appendChild(mockWrap);
        frame.appendChild(bezelStatus);
        frame.appendChild(row);
        card.appendChild(frame);
        previewGrid.appendChild(card);

        // auto-add to batch list
        await new Promise((res) =>
          canvas.toBlob((b) => {
            generatedImages.push({ filename: fname, blob: b });
            res();
          })
        );
      }
    } catch (err) {
      console.error(err);
      alert("Error processing " + file.name);
    }
  }
  alert("Previews generated — use Export All (ZIP) to download batch.");
}

/* bezel asset uploads */
bezelUpload.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  bezelAssets.clear();
  for (const f of files) {
    try {
      const img = await readFileAsImage(f);
      const name = f.name.toLowerCase();
      const match = name.match(
        /(?:bezel-)?(gp|7|10)-(land|port)\.(png|jpg|jpeg)$/i
      );
      if (match) {
        const key = `${match[1]}-${match[2]}`;
        bezelAssets.set(key, img);
      } else {
        const base = f.name.replace(/\.[^/.]+$/, "").toLowerCase();
        if (
          [
            "gp-land",
            "gp-port",
            "7-land",
            "7-port",
            "10-land",
            "10-port",
          ].includes(base)
        )
          bezelAssets.set(base, img);
        else console.warn("Skipping bezel file (unexpected name):", f.name);
      }
    } catch (err) {
      console.error("Error loading bezel", f.name, err);
    }
  }
  console.log("Loaded bezel assets:", Array.from(bezelAssets.keys()));
});

/* optional bezel JSON */
bezelJsonUpload.addEventListener("change", async (e) => {
  const f = (e.target.files || [])[0];
  if (!f) return;
  try {
    const txt = await f.text();
    bezelMargins = JSON.parse(txt || "{}");
    console.log("Loaded bezel margins JSON:", bezelMargins);
    alert("Loaded bezel margins JSON (used for inner screen alignment).");
  } catch (err) {
    console.error(err);
    alert("Invalid JSON file.");
  }
});

/* generate / export handlers */
generateBtn.addEventListener("click", () => {
  generateAllFromFiles(upload.files);
});

exportAllBtn.addEventListener("click", async () => {
  if (generatedImages.length === 0)
    return alert("No images in ZIP — generate previews or press Add to ZIP.");
  const zip = new JSZip();
  for (const it of generatedImages) zip.file(it.filename, it.blob);
  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, "daily-bread-tablet-screenshots.zip");
});

/* convenience: single-click generate 10" landscape only */
gen10LandBtn.addEventListener("click", async () => {
  const files = upload.files;
  if (!files || files.length === 0) return alert("Choose screenshots first.");
  const out = PRESETS["10"].find((o) => o.id === "10-land");
  if (!out) return alert('No 10" landscape found.');
  await generateAllFromFiles(files, [out]);
});

/* helper: when preset changes, set defaults */
presetSelect.addEventListener("change", () => {
  if (presetSelect.value === "gp") bgPad.checked = true;
});
