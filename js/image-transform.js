// Tap-to-zoom ("ratio") for every photo on the live preview — garment
// photos (top / bottom / short / shoes) and accessories alike. Works in
// all three templates, but each template keeps its OWN ratio per photo:
// resizing a photo on one template never touches how it looks on another.
//
// - Tapping/clicking a photo opens a small ratio panel docked to one
//   side, under the photo.
// - Free drag-to-move for every photo on Template 1's live preview
//   (garments AND accessories) lives in js/free-drag.js — this file only
//   handles zoom, and hands back a `toggle` function free-drag.js calls
//   whenever a press turns out to be a tap rather than a drag.
// - State lives on the product entry itself, under a different key per
//   template (scaleKey below), so it survives re-renders and is picked
//   up by html2canvas on export.

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.05;
const BUTTON_STEP = 0.05; // amount each +/- tap changes the ratio by

let panelEl = null;
let activeImg = null;
let activeAccessors = null; // { getScale, setScale, reset }

function clampScale(value) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
}

function applyScale(img, scale) {
  img.style.transform = `scale(${scale})`;
}

// ---- Floating ratio (zoom) panel — one shared instance, repositioned and
// rebound to whichever photo was last tapped. Always docks to the bottom
// of that photo, flush against one side of it. ----
function ensurePanel() {
  if (panelEl) return panelEl;

  panelEl = document.createElement('div');
  panelEl.className = 'zoom-panel is-hidden';
  panelEl.innerHTML = `
    <button type="button" class="zoom-step" data-dir="-1" aria-label="Zoom out">−</button>
    <input type="range" class="zoom-range" min="${MIN_SCALE}" max="${MAX_SCALE}" step="${SCALE_STEP}" value="1" aria-label="Photo ratio">
    <button type="button" class="zoom-step" data-dir="1" aria-label="Zoom in">+</button>
    <button type="button" class="zoom-reset">Reset</button>
  `;
  document.body.appendChild(panelEl);

  const range = panelEl.querySelector('.zoom-range');
  range.addEventListener('input', () => {
    if (!activeAccessors) return;
    activeAccessors.setScale(parseFloat(range.value));
  });
  panelEl.querySelectorAll('.zoom-step').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!activeAccessors) return;
      const dir = parseFloat(btn.dataset.dir);
      const next = clampScale(activeAccessors.getScale() + dir * BUTTON_STEP);
      activeAccessors.setScale(next);
      range.value = next;
    });
  });
  panelEl.querySelector('.zoom-reset').addEventListener('click', () => {
    if (!activeAccessors) return;
    activeAccessors.reset();
    range.value = activeAccessors.getScale();
  });
  // Interacting with the panel itself should never count as "tapped outside".
  panelEl.addEventListener('pointerdown', event => event.stopPropagation());

  document.addEventListener('pointerdown', event => {
    if (!activeImg) return;
    if (event.target === activeImg || panelEl.contains(event.target)) return;
    closePanel();
  });
  window.addEventListener('scroll', () => closePanel(), true);
  window.addEventListener('resize', () => {
    if (activeImg) positionPanel(panelEl, activeImg);
  });

  return panelEl;
}

// Always sits just under the photo, flush with its right edge — or its
// left edge when there isn't room on the right — instead of centering,
// so it reads as "one side, at the bottom" rather than floating free.
function positionPanel(panel, img) {
  const rect = img.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  panel.classList.remove('pos-bottom-right', 'pos-bottom-left');

  const pw = panel.offsetWidth;
  const ph = panel.offsetHeight;

  let top = rect.bottom + 8;
  let left;
  let placement;

  if (rect.right - pw >= 8) {
    left = rect.right - pw;
    placement = 'pos-bottom-right';
  } else {
    left = rect.left;
    placement = 'pos-bottom-left';
  }

  left = Math.max(8, Math.min(vw - pw - 8, left));
  top = Math.max(8, Math.min(vh - ph - 8, top));

  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  panel.classList.add(placement);
}

function openPanel(img, accessors) {
  const panel = ensurePanel();
  activeImg = img;
  activeAccessors = accessors;
  panel.querySelector('.zoom-range').value = accessors.getScale();
  panel.classList.remove('is-hidden');
  img.classList.add('is-zoom-active');
  positionPanel(panel, img);
}

function closePanel() {
  if (activeImg) activeImg.classList.remove('is-zoom-active');
  activeImg = null;
  activeAccessors = null;
  panelEl?.classList.add('is-hidden');
}

function toggleForTap(img, accessors) {
  if (activeImg === img) closePanel();
  else openPanel(img, accessors);
}

// ---- Any photo (garment or accessory): tap-to-zoom. Free drag-to-move
// is wired up separately, on the live-preview stage, via free-drag.js.
// scaleKey defaults to 'scale' (Template 1's live-preview stage); pass
// 'scaleList' when wiring up Template 2 so it zooms independently instead
// of sharing Template 1's ratio. Returns a `toggle` function so the drag
// module can open/close this photo's ratio panel whenever a press turns
// out to be a tap rather than a drag. onChange (optional) fires any time
// the scale actually changes (slider drag, +/- buttons, reset) — used by
// Template 1's remove-photo badge to re-anchor itself, since zooming
// changes the photo's rendered size without moving it. ----
export function makeZoomable(img, entry, scaleKey = 'scale', onChange) {
  if (typeof entry[scaleKey] !== 'number') entry[scaleKey] = 1;
  applyScale(img, entry[scaleKey]);

  const accessors = {
    getScale: () => entry[scaleKey],
    setScale: value => {
      entry[scaleKey] = value;
      applyScale(img, entry[scaleKey]);
      onChange?.();
    },
    reset: () => {
      entry[scaleKey] = 1;
      applyScale(img, entry[scaleKey]);
      onChange?.();
    }
  };

  return () => toggleForTap(img, accessors);
}
