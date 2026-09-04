// Bundled, non-module build of js/*.js (each original file wrapped in its
// own IIFE acting as a tiny module, in dependency order, wired together
// with plain object namespaces instead of import/export). The original
// <script type="module" src="js/app.js"> is blocked by the browser's CORS
// policy whenever this page is opened directly as a file (file://) rather
// than served over http(s) — which silently kills the entire app,
// including every live-preview interaction (uploading and dragging
// photos). A plain <script> has no such restriction. The source files in
// js/ are unchanged and remain the source of truth for future edits.
(function(){
"use strict";

// ==== state.js ====
const ModuleState = (function(){
const MAX_ACCESSORIES = 6;
// Default spot each accessory slot starts at on the live-preview stage
// (percent of stage width/height, top-left anchored). Once a person drags
// an accessory, its own left/top is saved on the accessory entry instead.
const ACCESSORY_DEFAULT_POSITIONS = [
  { left: 60, top: 30 },
  { left: 80, top: 20 },
  { left: 4,  top: 70 },
  { left: 78, top: 74 },
  { left: 32, top: 50 },
  { left: 12, top: 42 }
];
// Default spot + starting size for each garment photo (top/bottom/short/
// shoes) the first time it's added — percent of the FULL live-preview
// stage (edge-to-edge), same coordinate space accessories use. Once a
// person drags a garment, its own left/top is saved on the product entry
// instead, exactly like accessories.
const GARMENT_DEFAULTS = {
  top:    { left: 24, top: 4,  width: 52 },
  bottom: { left: 18, top: 27, width: 58 },
  short:  { left: 18, top: 27, width: 58 },
  shoes:  { left: 46, top: 66, width: 32 }
};
// Same idea as GARMENT_DEFAULTS / ACCESSORY_DEFAULT_POSITIONS, but for
// Template 2's live preview (the list layout). Template 2 keeps its own
// separate bank of uploaded photos (state.banks.list — see below), so
// these defaults, and any position a person drags a photo to, never
// touch Template 1 or Template 3.
const LIST_GARMENT_DEFAULTS = {
  top:    { left: 52, top: 4,  width: 40 },
  bottom: { left: 46, top: 24, width: 46 },
  short:  { left: 46, top: 24, width: 46 },
  shoes:  { left: 58, top: 46, width: 22 }
};
const LIST_ACCESSORY_DEFAULT_POSITIONS = [
  { left: 48, top: 60 },
  { left: 68, top: 54 },
  { left: 40, top: 80 },
  { left: 74, top: 78 },
  { left: 56, top: 90 },
  { left: 34, top: 62 }
];
// Template 3 ("editorial") — big edge-to-edge photos with a corner label
// per piece, modeled on a reference showcase screenshot: the top garment
// large and high (front-most, so it visually reads as "tucked in" where
// it overlaps the piece below it — see the .top-image/.bottom-image
// z-index rules in css/style.css), the bottom garment large and starting
// partway down, its label to the left, shoes tucked small near the
// bottom-left overlapping the bottom garment. Template 3 keeps its own
// separate bank of uploaded photos (state.banks.editorial — see below),
// so dragging here never touches Template 1 or 2's photos or positions.
const EDITORIAL_GARMENT_DEFAULTS = {
  top:    { left: 14, top: 2,  width: 70 },
  bottom: { left: 20, top: 33, width: 68 },
  short:  { left: 20, top: 33, width: 68 },
  shoes:  { left: 2,  top: 68, width: 34 }
};
const EDITORIAL_ACCESSORY_DEFAULT_POSITIONS = [
  { left: 62, top: 60 },
  { left: 78, top: 50 },
  { left: 6,  top: 46 },
  { left: 80, top: 76 },
  { left: 30, top: 84 },
  { left: 10, top: 30 }
];
// Starting spot for each description label/section, per template — own
// coordinate space per template (percent of that template's own stage,
// see setupLabelDragging() in js/outfit-renderer.js), same idea as the
// garment position objects above. These ARE the live positions (not just
// defaults): dragging a label updates its entry here directly, so it
// persists across re-renders exactly like a garment photo's left/top.

// Each template keeps its own fully separate set of uploaded photos —
// a photo added while Template 1 is active only ever appears on
// Template 1. Switching templates and uploading again starts from a
// clean, empty set of slots for that template. Because each bank is its
// own object, every entry can just use plain left/top/scale (no
// per-template key juggling needed to avoid one template's drag
// touching another's).
function emptyBank() {
  return {
    top: null,
    bottom: null,
    shoes: null,
    short: null,
    accessories: new Array(MAX_ACCESSORIES).fill(null)
  };
}

const state = {
  banks: {
    classic: emptyBank(),
    list: emptyBank(),
    editorial: emptyBank()
  },
  labelPositions: {
    classic: {
      top:    { left: 0,  top: 5 },
      bottom: { left: 76, top: 38 },
      shoes:  { left: 0,  top: 78 }
    },
    list: {
      top:         { left: 0, top: 0 },
      bottom:      { left: 0, top: 25 },
      shoes:       { left: 0, top: 50 },
      accessories: { left: 0, top: 75 }
    },
    editorial: {
      top:    { left: 55, top: 4 },
      bottom: { left: 5,  top: 50 }
    }
  },
  template: 'classic', // 'classic' (Template 1), 'list' (Template 2), 'editorial' (Template 3)
  composition: '4:5', // '4:5' '9:16' '4:6' '4:7'
  background: 'white', // 'white' 'texture' 'grid'
  outfitName: 'STREET LEGEND',
  // Editable category names, shared across all three templates — the
  // sidebar's "Top/Bottom/Shoes label" inputs drive these the same way
  // topText/bottomText/shoesText below drive descriptions. Defaults match
  // the original static "TOP"/"BOTTOM"/"SHOES" text every template used
  // to hardcode.
  categoryLabels: {
    top: 'TOP',
    bottom: 'BOTTOM',
    shoes: 'SHOES'
  },
  descriptions: {
    top: 'Add top description',
    bottom: 'Add bottom description',
    shoes: 'Add shoes description'
  },
  visibility: {
    top: true,
    bottom: true,
    shoes: true,
    accessories: true
  },
  // Per-category "Logo + Text" nudge (px), and a single shared "Logo
  // only" nudge applied to all three tags at once — see wireNudge /
  // wireNudgeMulti in js/app.js. Kept on state (rather than as local
  // variables) so a saved/restored session picks up exactly where the
  // buttons were left, same as everything else.
  //
  // Split per template (classic / editorial) — Template 2 has no
  // showcase tag at all. Nudging the logo/text on Template 1 must never
  // move Template 3's, and vice versa, so each template keeps its own
  // independent set of offsets instead of sharing one.
  tagPositions: {
    classic: {
      groupX: { top: 0, bottom: 0, shoes: 0 },
      groupY: { top: 0, bottom: 0, shoes: 0 },
      logoX: 0,
      logoY: 0
    },
    editorial: {
      groupX: { top: 0, bottom: 0, shoes: 0 },
      groupY: { top: 0, bottom: 0, shoes: 0 },
      logoX: 0,
      logoY: 0
    }
  }
};

return { MAX_ACCESSORIES, ACCESSORY_DEFAULT_POSITIONS, GARMENT_DEFAULTS, LIST_GARMENT_DEFAULTS, LIST_ACCESSORY_DEFAULT_POSITIONS, EDITORIAL_GARMENT_DEFAULTS, EDITORIAL_ACCESSORY_DEFAULT_POSITIONS, state };
})();

// ==== utils.js ====
const ModuleUtils = (function(){
function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, character => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[character]);
}

// Turns an uploaded filename like "black-sunglasses_02.jpg" into a readable
// label like "Black Sunglasses 02" — used by the Template 2 (list) showcase
// to auto-generate accessory names when no description was typed.
function labelFromFilename(name) {
  if (!name) return '';
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

return { escapeHtml, labelFromFilename };
})();

// ==== outfit-detector.js ====
const ModuleOutfitDetector = (function(){
function getCategoryLabel(category) {
  return ({ top: 'TOP', bottom: 'BOTTOM', shoes: 'SHOES', accessory: 'ACCESSORY' })[category] || 'PRODUCT';
}

return { getCategoryLabel };
})();

// ==== free-drag.js ====
const ModuleFreeDrag = (function(){
const TAP_THRESHOLD = 4; // px of movement before a tap counts as a drag

// Makes ANY <img> on a live-preview stage draggable with the mouse or a
// finger, anywhere across the FULL stage it's on — edge to edge, no
// artificial limit. Used for the garment photos (top/bottom/short/shoes)
// and the accessories alike, across Template 1's classic stage,
// Template 2's list stage, and Template 3's editorial stage, so every
// draggable piece on any live preview behaves the same way. The dropped
// position is saved back onto the passed-in entry (percent of whichever
// stage it's on) so it survives re-renders. A press that never moves past
// TAP_THRESHOLD counts as a tap instead — onTap (if given) opens that
// photo's ratio panel from image-transform.js.
//
// keys.leftKey / keys.topKey pick which fields on the entry store the
// position — default 'left'/'top' (Template 1); pass 'leftList'/'topList'
// for Template 2, or 'leftEditorial'/'topEditorial' for Template 3, so
// each keeps its own independent position.
//
// keys.stageSelector picks which ancestor counts as the draggable
// element's "stage" (its 0–100% bounding box) — default '.drag-stage',
// used by every garment/accessory photo. Description labels aren't on
// that shared photo layer, so they pass their own container selector
// instead (e.g. '.labels', '#dragStageEditorial', '.lt-text-col') and
// drag within that box exactly the same way. That selector MUST resolve
// to an element with a real, non-collapsed box (a sized/positioned
// element) — an unstyled wrapper whose children are all position:absolute
// (like .editorial-view itself) collapses to ~0 height, which makes the
// percentage math blow up and pins the dragged element to one edge.
function makeFreeDraggable(img, entry, onTap, keys = {}) {
  const {
    leftKey = 'left', topKey = 'top', stageSelector = '.drag-stage',
    unclampLeft = false, unclampRight = false, unclampTop = false, unclampBottom = false,
    onMove
  } = keys;
  let stageRect = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let sizePctW = 0;
  let sizePctH = 0;
  let moved = false;

  function pointFromEvent(event) {
    const touch = event.touches?.[0] || event.changedTouches?.[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : { x: event.clientX, y: event.clientY };
  }

  // Clamped only enough to keep the photo touching the stage — the range
  // itself always spans the whole stage (0% to the far edge), so a drag
  // can carry the photo all the way from one edge of the live preview to
  // the other.
  //
  // unclampRight pushes the max further right: instead of stopping once
  // the photo's OWN right edge touches the stage's right edge
  // (100 - sizePct), it lets the photo's LEFT edge travel all the way to
  // the stage's right edge (100) — noticeably more rightward travel,
  // letting the photo slide flush against or past the right edge.
  //
  // unclampLeft is the mirror of that on the same axis's near edge:
  // instead of stopping once the photo's OWN left edge touches the
  // stage's left edge (0), it lets the photo's RIGHT edge travel all the
  // way to the stage's left edge (-sizePct) — extra leftward travel,
  // sliding the photo flush against or past the left edge.
  //
  // unclampTop / unclampBottom are the same two ideas mirrored onto the
  // vertical axis: unclampTop lets the photo's BOTTOM edge travel up to
  // the stage's top edge (-sizePct) instead of stopping once its own top
  // edge touches it (0); unclampBottom lets the photo's TOP edge travel
  // down to the stage's bottom edge (100) instead of stopping once its
  // own bottom edge touches it (100 - sizePct).
  //
  // All four together (see outfit-renderer.js — every garment photo on
  // Template 1 gets all four) mean a photo can be dragged fully off any
  // side of the live preview, not just up to it — genuinely edge to
  // edge, on every side, at any composition size, since sizePct is
  // measured fresh off the stage's real rendered box on every press.
  function clampAxis(value, sizePct, unclampMax = false, unclampMin = false) {
    const min = unclampMin ? -sizePct : 0;
    const max = unclampMax ? 100 : (100 - sizePct);
    return Math.max(min, Math.min(max, value));
  }

  function onPointerDown(event) {
    const stage = img.closest(stageSelector);
    if (!stage) return;
    event.preventDefault();
    stageRect = stage.getBoundingClientRect();
    const point = pointFromEvent(event);
    startX = point.x;
    startY = point.y;
    moved = false;
    // Read the element's true laid-out position/size (style left/top,
    // offsetWidth/offsetHeight) instead of getBoundingClientRect(). The
    // ratio panel in image-transform.js zooms a photo with a CSS
    // `transform: scale()`, which inflates and re-centers the RENDERED
    // box without moving the underlying left/top box it's positioned
    // from. getBoundingClientRect() reports that inflated/shifted
    // rendered box, so measuring off it made every drag start from the
    // wrong spot — the photo would jump the instant you moved it, and
    // the clamped range (sizePct, below) came out too big, cutting off
    // real travel on the far edges. offsetWidth/offsetHeight are the
    // pre-transform layout box, so they stay accurate at any zoom level,
    // on any photo, on every template's stage.
    startLeft = parseFloat(img.style.left) || 0;
    startTop = parseFloat(img.style.top) || 0;
    sizePctW = (img.offsetWidth / stageRect.width) * 100;
    sizePctH = (img.offsetHeight / stageRect.height) * 100;

    img.classList.add('dragging');
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);
    document.addEventListener('touchmove', onPointerMove, { passive: false });
    document.addEventListener('touchend', onPointerUp);
  }

  function onPointerMove(event) {
    if (!stageRect) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    if (!moved && Math.hypot(point.x - startX, point.y - startY) > TAP_THRESHOLD) moved = true;
    const deltaLeft = ((point.x - startX) / stageRect.width) * 100;
    const deltaTop = ((point.y - startY) / stageRect.height) * 100;
    const left = clampAxis(startLeft + deltaLeft, sizePctW, unclampRight, unclampLeft);
    const top = clampAxis(startTop + deltaTop, sizePctH, unclampBottom, unclampTop);
    img.style.left = `${left}%`;
    img.style.top = `${top}%`;
    img.dataset.left = left;
    img.dataset.top = top;
    // Lets a remove-photo badge (or any other overlay anchored to this
    // image) keep pace with it while it's being dragged, instead of
    // being repositioned only after the drag ends.
    onMove?.();
  }

  function onPointerUp() {
    img.classList.remove('dragging');
    document.removeEventListener('mousemove', onPointerMove);
    document.removeEventListener('mouseup', onPointerUp);
    document.removeEventListener('touchmove', onPointerMove);
    document.removeEventListener('touchend', onPointerUp);
    stageRect = null;

    if (entry && img.dataset.left !== undefined) {
      entry[leftKey] = parseFloat(img.dataset.left);
      entry[topKey] = parseFloat(img.dataset.top);
    }

    if (!moved) onTap?.();
  }

  img.addEventListener('mousedown', onPointerDown);
  img.addEventListener('touchstart', onPointerDown, { passive: false });
}

return { makeFreeDraggable };
})();

// ==== image-transform.js ====
const ModuleImageTransform = (function(){
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
function makeZoomable(img, entry, scaleKey = 'scale', onChange) {
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

return { makeZoomable };
})();

// ==== upload.js ====
const ModuleUpload = (function(){
const { state, MAX_ACCESSORIES } = ModuleState;
// Every upload targets the CURRENTLY ACTIVE template's own bank
// (state.banks[state.template]) — so a photo added while Template 1 is
// selected only ever shows up on Template 1. Switching templates and
// uploading again fills that template's own, separate slots.
function activeBank() {
  return state.banks[state.template];
}

async function uploadSingle(category, file, callbacks = {}) {
  if (!file) return;
  callbacks.onStart?.(file);

  try {
    // Use the photo exactly as uploaded — no auto-cropping. The showcase
    // scales it to fit its slot (object-fit: contain), so nothing gets cut off.
    const bank = activeBank();
    const previous = bank[category];
    const url = URL.createObjectURL(file);
    // Keep any ratio/position already set on this slot for THIS template.
    const entry = {
      id: crypto.randomUUID(), file, url,
      left: previous?.left, top: previous?.top, scale: previous?.scale
    };
    bank[category] = entry;
    if (previous?.url?.startsWith('blob:')) URL.revokeObjectURL(previous.url);
    callbacks.onComplete?.(entry);
  } catch (error) {
    console.error(error);
    callbacks.onError?.(error);
  }
}

function loadFromUrl(category, rawUrl, callbacks = {}) {
  const url = (rawUrl || '').trim();
  if (!url) return;
  callbacks.onStart?.(url);

  const test = new Image();
  test.onload = () => {
    const bank = activeBank();
    const previous = bank[category];
    const entry = {
      id: crypto.randomUUID(), file: null, url,
      left: previous?.left, top: previous?.top, scale: previous?.scale
    };
    bank[category] = entry;
    if (previous?.url?.startsWith('blob:')) URL.revokeObjectURL(previous.url);
    callbacks.onComplete?.(entry);
  };
  test.onerror = () => callbacks.onError?.(new Error('Could not load image from that URL'));
  test.src = url;
}

function addAccessoryFromUrl(rawUrl, callbacks = {}) {
  const url = (rawUrl || '').trim();
  if (!url) return;
  const bank = activeBank();
  const index = bank.accessories.findIndex(item => !item);
  if (index === -1) {
    callbacks.onLimit?.();
    return;
  }
  callbacks.onStart?.(url);

  const test = new Image();
  test.onload = () => {
    const entry = { id: crypto.randomUUID(), file: null, url };
    bank.accessories[index] = entry;
    callbacks.onComplete?.(entry);
  };
  test.onerror = () => callbacks.onError?.(new Error('Could not load image from that URL'));
  test.src = url;
}

// Each accessory now lives in its own fixed slot (0-based index) instead of
// a growing list, so uploading into a slot replaces whatever was there —
// within the currently active template's own bank.
async function setAccessory(index, file, callbacks = {}) {
  if (!file) return;
  if (index < 0 || index >= MAX_ACCESSORIES) return;
  callbacks.onStart?.(file);

  try {
    const bank = activeBank();
    const previous = bank.accessories[index];
    const url = URL.createObjectURL(file);
    // Keep any position/ratio already set on this slot for THIS template.
    const entry = {
      id: crypto.randomUUID(), file, url,
      left: previous?.left, top: previous?.top, scale: previous?.scale
    };
    bank.accessories[index] = entry;
    if (previous?.url?.startsWith('blob:')) URL.revokeObjectURL(previous.url);
    callbacks.onComplete?.(entry);
  } catch (error) {
    console.error(error);
    callbacks.onError?.(error);
  }
}

function removeAccessory(index) {
  const bank = activeBank();
  const removed = bank.accessories[index];
  if (!removed) return;
  bank.accessories[index] = null;
  if (removed.url) URL.revokeObjectURL(removed.url);
}

function removeSingle(key) {
  const bank = activeBank();
  const removed = bank[key];
  if (!removed) return;
  bank[key] = null;
  if (removed.url?.startsWith('blob:')) URL.revokeObjectURL(removed.url);
}

function resetAll() {
  Object.values(state.banks).forEach(bank => {
    [bank.top, bank.bottom, bank.shoes, bank.short, ...bank.accessories].forEach(item => {
      if (item?.url) URL.revokeObjectURL(item.url);
    });
    bank.top = null;
    bank.bottom = null;
    bank.shoes = null;
    bank.short = null;
    bank.accessories = new Array(MAX_ACCESSORIES).fill(null);
  });
}

return { uploadSingle, loadFromUrl, addAccessoryFromUrl, setAccessory, removeAccessory, removeSingle, resetAll };
})();

// ==== outfit-renderer.js ====
const ModuleOutfitRenderer = (function(){
const { state, MAX_ACCESSORIES, ACCESSORY_DEFAULT_POSITIONS, GARMENT_DEFAULTS, LIST_GARMENT_DEFAULTS, LIST_ACCESSORY_DEFAULT_POSITIONS, EDITORIAL_GARMENT_DEFAULTS, EDITORIAL_ACCESSORY_DEFAULT_POSITIONS } = ModuleState;
const { getCategoryLabel } = ModuleOutfitDetector;
const { makeFreeDraggable } = ModuleFreeDrag;
const { makeZoomable } = ModuleImageTransform;
const { labelFromFilename } = ModuleUtils;
const { removeSingle } = ModuleUpload;
function renderShowcase() {
  clearStages();
  const bank = state.banks.classic;
  if (bank.top) addProductToStage(bank.top, 'topStage', 'top', 'top');
  if (bank.bottom) addProductToStage(bank.bottom, 'bottomStage', 'bottom', 'bottom');
  if (bank.short) addProductToStage(bank.short, 'bottomStage', 'bottom', 'short');
  if (bank.shoes) addProductToStage(bank.shoes, 'shoesStage', 'shoes', 'shoes');
  bank.accessories.forEach((product, index) => {
    if (product) addAccessoryToStage(product, index);
  });
  renderSlotThumbs();
  renderAccessorySlots();
  applyVisibility();
  renderListTemplate();
  renderEditorialTemplate();
}

// ---- Template 2 ("list") ----
// Populates the second, opt-in showcase layout (big headers + bullet list +
// photo per section). Runs alongside the original renderer above and never
// touches its elements, so Template 1 keeps behaving exactly as before.
function bulletsFromText(text) {
  return (text || '')
    .split(/[,\n]/)
    .map(part => part.trim())
    .filter(Boolean);
}

// The real photo renders on the shared #dragStageList overlay (so it can
// be dragged anywhere across the whole Template 2 preview, edge to edge)
// rather than inside a per-category box.
function fillListSection(category, bulletsListId) {
  const bulletsEl = document.getElementById(bulletsListId);
  if (!bulletsEl) return;

  const items = bulletsFromText(state.descriptions[category]);
  bulletsEl.innerHTML = items.map(item => `<li>${item}</li>`).join('');

  // Re-renders (typing a description, re-adding a photo) shouldn't stack
  // up duplicate floating photos on the drag stage.
  document.querySelectorAll(`#dragStageList .${category}-image`).forEach(img => img.remove());

  const product = state.banks.list[category];
  if (product) {
    const defaults = LIST_GARMENT_DEFAULTS[category] || { left: 40, top: 10, width: 44 };
    const left = product.left ?? defaults.left;
    const top = product.top ?? defaults.top;

    const img = document.createElement('img');
    img.src = product.url;
    img.alt = getCategoryLabel(category);
    img.className = `product-image drag-image lt-drag-image ${category}-image`;
    img.dataset.key = category;
    img.style.left = `${left}%`;
    img.style.top = `${top}%`;
    img.style.width = `${defaults.width}%`;
    document.getElementById('dragStageList').appendChild(img);

    const onTap = makeZoomable(img, product, 'scale');
    // TOP gets extra upward drag range on Template 2 too, same as
    // Template 1 — see the unclampTop comment in free-drag.js — so it
    // can be dragged all the way to/past the very top edge of this
    // live preview as well, at any composition size.
    makeFreeDraggable(img, product, onTap, { unclampTop: category === 'top' });
  }
}

// "Short" has no section of its own — like Template 1, it shares the
// BOTTOM box/label and is just another photo layered into the same spot,
// with its own independent drag position on Template 2's own bank entry.
// Template 2 previously never rendered it at all, so it couldn't be
// dragged there — this brings it in line with top/bottom/shoes/accessories.
function fillListShort() {
  document.querySelectorAll('#dragStageList .short-image').forEach(img => img.remove());

  const product = state.banks.list.short;
  if (!product) return;

  const defaults = LIST_GARMENT_DEFAULTS.short;
  const left = product.left ?? defaults.left;
  const top = product.top ?? defaults.top;

  const img = document.createElement('img');
  img.src = product.url;
  img.alt = getCategoryLabel('bottom');
  img.className = 'product-image drag-image lt-drag-image short-image';
  img.dataset.key = 'short';
  img.style.left = `${left}%`;
  img.style.top = `${top}%`;
  img.style.width = `${defaults.width}%`;
  document.getElementById('dragStageList').appendChild(img);

  const onTap = makeZoomable(img, product, 'scale');
  makeFreeDraggable(img, product, onTap);
}

function fillListAccessories() {
  const bulletsEl = document.getElementById('ltAccessoryBullets');
  if (!bulletsEl) return;

  const filled = state.banks.list.accessories
    .map((product, index) => ({ product, index }))
    .filter(entry => entry.product);

  bulletsEl.innerHTML = filled
    .map(({ product, index }) => `<li>${labelFromFilename(product.file?.name) || `Accessory ${index + 1}`}</li>`)
    .join('');

  document.querySelectorAll('#dragStageList .accessory-image').forEach(img => img.remove());

  filled.forEach(({ product, index }) => {
    const fallback = LIST_ACCESSORY_DEFAULT_POSITIONS[index] || LIST_ACCESSORY_DEFAULT_POSITIONS[0];
    const left = product.left ?? fallback.left;
    const top = product.top ?? fallback.top;

    const img = document.createElement('img');
    img.src = product.url;
    img.alt = getCategoryLabel('accessory');
    img.className = 'product-image drag-image accessory-image';
    img.style.left = `${left}%`;
    img.style.top = `${top}%`;
    document.getElementById('dragStageList').appendChild(img);

    const onTap = makeZoomable(img, product, 'scale');
    makeFreeDraggable(img, product, onTap);
  });
}

function renderListTemplate() {
  fillListSection('top', 'ltTopBullets');
  fillListSection('bottom', 'ltBottomBullets');
  fillListShort();
  fillListSection('shoes', 'ltShoesBullets');
  fillListAccessories();
}

// ---- Template 3 ("editorial") ----
// Big edge-to-edge photos with a corner label per piece — modeled on a
// reference showcase screenshot. Same free-drag / zoom / visibility /
// composition-size machinery as Templates 1 and 2, just its own stage
// (#dragStageEditorial) and its own bank of uploaded photos
// (state.banks.editorial) so none of the three templates ever
// move each other's photos.
function addEditorialProduct(product, category, key = category) {
  const defaults = EDITORIAL_GARMENT_DEFAULTS[key] || EDITORIAL_GARMENT_DEFAULTS[category] || { left: 20, top: 10, width: 60 };
  const left = product.left ?? defaults.left;
  const top = product.top ?? defaults.top;

  const img = document.createElement('img');
  img.src = product.url;
  img.alt = getCategoryLabel(category);
  img.className = `product-image drag-image ed-drag-image ${category}-image`;
  img.dataset.key = key;
  img.style.left = `${left}%`;
  img.style.top = `${top}%`;
  img.style.width = `${defaults.width}%`;
  document.getElementById('dragStageEditorial').appendChild(img);

  const onTap = makeZoomable(img, product, 'scale');
  // Same four unclamp flags as Template 1's addProductToStage — without
  // them, clampAxis's default range (0 to 100-sizePct) stops each photo's
  // own edge flush against the stage's edge and never lets it past. That
  // made the TOP and BOTTOM photos on this template's live preview get
  // stuck short of the corners instead of dragging all the way off any
  // side, edge to edge, like they do on Template 1.
  makeFreeDraggable(img, product, onTap, {
    unclampLeft: true,
    unclampRight: true,
    unclampTop: true,
    unclampBottom: true
  });
}

function addEditorialAccessory(product, index) {
  const fallback = EDITORIAL_ACCESSORY_DEFAULT_POSITIONS[index] || EDITORIAL_ACCESSORY_DEFAULT_POSITIONS[0];
  const left = product.left ?? fallback.left;
  const top = product.top ?? fallback.top;

  const img = document.createElement('img');
  img.src = product.url;
  img.alt = getCategoryLabel('accessory');
  img.className = 'product-image drag-image ed-drag-image accessory-image';
  img.style.left = `${left}%`;
  img.style.top = `${top}%`;
  document.getElementById('dragStageEditorial').appendChild(img);

  const onTap = makeZoomable(img, product, 'scale');
  makeFreeDraggable(img, product, onTap);
}

function renderEditorialTemplate() {
  const stage = document.getElementById('dragStageEditorial');
  if (!stage) return;
  stage.innerHTML = '';

  const bank = state.banks.editorial;
  if (bank.top) addEditorialProduct(bank.top, 'top');
  if (bank.bottom) addEditorialProduct(bank.bottom, 'bottom', 'bottom');
  if (bank.short) addEditorialProduct(bank.short, 'bottom', 'short');
  if (bank.shoes) addEditorialProduct(bank.shoes, 'shoes');
  bank.accessories.forEach((product, index) => {
    if (product) addEditorialAccessory(product, index);
  });

  applyVisibility();
}

const STAGE_IDS = { top: 'topStage', bottom: 'bottomStage', shoes: 'shoesStage' };
const IMAGE_CLASSES = { top: 'top-image', bottom: 'bottom-image', shoes: 'shoes-image', accessories: 'accessory-image' };
const LABEL_CLASSES = { top: 'top-label', bottom: 'bottom-label', shoes: 'shoes-label' };

function applyVisibility() {
  Object.entries(STAGE_IDS).forEach(([category, stageId]) => {
    const stage = document.getElementById(stageId);
    if (stage) stage.classList.toggle('is-hidden', !state.visibility[category]);
  });
  // The real photos live on the shared full-stage drag layer for each
  // template (Template 1: #dragStage, Template 2: #dragStageList,
  // Template 3: #dragStageEditorial), not inside the per-category boxes
  // above, so their visibility is toggled by category class instead —
  // across all three stages, so the filter row behaves the same no
  // matter which template is active.
  const DRAG_STAGE_IDS = ['dragStage', 'dragStageList', 'dragStageEditorial'];
  Object.entries(IMAGE_CLASSES).forEach(([category, cls]) => {
    DRAG_STAGE_IDS.forEach(stageId => {
      document.querySelectorAll(`#${stageId} .${cls}`).forEach(img => {
        img.classList.toggle('is-hidden', !state.visibility[category]);
      });
    });
  });
  Object.entries(LABEL_CLASSES).forEach(([category, cls]) => {
    document.querySelectorAll(`.${cls}`).forEach(label => {
      label.classList.toggle('is-hidden', !state.visibility[category]);
    });
  });
}

function clearStages() {
  document.getElementById('topStage').innerHTML = '';
  document.getElementById('bottomStage').innerHTML = '';
  document.getElementById('shoesStage').innerHTML = '';
  document.getElementById('dragStage').innerHTML = '';
  // Any remove-badge sync callbacks left over from the previous render
  // point at DOM nodes that were just wiped out above — drop them so
  // resizeRemoveBadges() below doesn't keep doing pointless work on
  // detached elements.
  activeRemoveBadgeSyncs.clear();
}

// ---- Remove-photo badge (Template 1's TOP/BOTTOM/SHOES/SHORT photos) ----
// A small "×" button that floats on the live preview, anchored to the
// top-right corner of one garment photo, so it can be removed straight
// from the canvas instead of only via the sidebar upload slot.
//
// It's a plain sibling <button> (not a child of the <img>), positioned
// with real pixel math off the image's actual getBoundingClientRect()
// rather than copying the image's left/top/width percentages — that
// keeps it correctly anchored even while the photo is mid-drag or has
// been zoomed via image-transform.js's scale() transform, both of which
// make the image's true on-screen box diverge from its raw style
// left/top/width.
//
// html2canvas (see download.js) is told to skip any '.photo-remove-btn'
// element, so this never shows up in the exported PNG.
const activeRemoveBadgeSyncs = new Set();

function positionRemoveBadge(btn, img, stage) {
  const stageRect = stage.getBoundingClientRect();
  if (!stageRect.width || !stageRect.height) return;
  const imgRect = img.getBoundingClientRect();
  const leftPct = ((imgRect.right - stageRect.left) / stageRect.width) * 100;
  const topPct = ((imgRect.top - stageRect.top) / stageRect.height) * 100;
  btn.style.left = `${leftPct}%`;
  btn.style.top = `${topPct}%`;
}

// Returns a `sync()` function the caller should invoke (via free-drag's
// onMove and image-transform's onChange) any time the photo moves or
// resizes, so the badge tracks it.
function attachRemoveBadge(img, stage, key, label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'photo-remove-btn';
  btn.setAttribute('aria-label', `Remove ${label} photo`);
  btn.textContent = '×';
  stage.appendChild(btn);

  const sync = () => positionRemoveBadge(btn, img, stage);
  // The image may not have finished laying out (or decoding, for a
  // freshly uploaded file) at the instant it's inserted, so the very
  // first getBoundingClientRect() can be wrong — resync once it's
  // definitely ready, on top of the immediate best-effort call.
  sync();
  if (img.complete) requestAnimationFrame(sync);
  else img.addEventListener('load', sync, { once: true });

  // Never let a press on the badge itself be mistaken for a press on
  // the photo underneath (which would start a drag or open the zoom
  // panel).
  const stop = event => event.stopPropagation();
  btn.addEventListener('mousedown', stop);
  btn.addEventListener('touchstart', stop, { passive: true });
  btn.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    activeRemoveBadgeSyncs.delete(sync);
    removeSingle(key);
    renderShowcase();
    window.dispatchEvent(new CustomEvent('rizzfits:photo-removed', { detail: { key } }));
  });

  activeRemoveBadgeSyncs.add(sync);
  return sync;
}

// The live preview is responsive (see .showcase's width in css/style.css),
// so a browser resize changes every photo's pixel position/size even
// though nothing was dragged — resync every badge currently on screen.
window.addEventListener('resize', () => {
  activeRemoveBadgeSyncs.forEach(sync => sync());
});

// Garment photos (top/bottom/short/shoes) render onto the shared full-cover
// drag stage — same layer accessories use — so they can be dragged freely
// edge to edge across the WHOLE live preview, not just inside their own
// little box. Their old per-category box (topStage/bottomStage/shoesStage)
// now only ever holds the "TOP"/"BOTTOM"/"SHOES" placeholder text for the
// empty state.
function addProductToStage(product, stageId, category, key = category) {
  const stage = document.getElementById(stageId);
  stage.querySelector('.placeholder')?.remove();

  const defaults = GARMENT_DEFAULTS[key] || GARMENT_DEFAULTS[category] || { left: 24, top: 10, width: 50 };
  const left = product.left ?? defaults.left;
  const top = product.top ?? defaults.top;

  const img = document.createElement('img');
  img.src = product.url;
  img.alt = getCategoryLabel(category);
  img.className = `product-image drag-image ${category}-image`;
  img.dataset.key = key;
  img.style.left = `${left}%`;
  img.style.top = `${top}%`;
  img.style.width = `${defaults.width}%`;
  const dragStage = document.getElementById('dragStage');
  dragStage.appendChild(img);

  // Declared before the callbacks below so they can call the latest
  // version of it once attachRemoveBadge() hands it back.
  let syncRemoveBadge;
  const onTap = makeZoomable(img, product, 'scale', () => syncRemoveBadge?.());
  // Every garment photo on Template 1 (TOP/BOTTOM/SHOES/SHORT) gets all
  // four unclamp flags — see the unclampLeft/Right/Top/Bottom comment in
  // free-drag.js — so each one can be dragged fully off any side of the
  // live preview, genuinely edge to edge on every side, not just up to
  // one edge on one axis. Works at any composition size, since the drag
  // range is measured fresh off the stage's actual rendered box on every
  // press, not a fixed number.
  makeFreeDraggable(img, product, onTap, {
    unclampLeft: true,
    unclampRight: true,
    unclampTop: true,
    unclampBottom: true,
    onMove: () => syncRemoveBadge?.()
  });
  syncRemoveBadge = attachRemoveBadge(img, dragStage, key, getCategoryLabel(category));
}

// Accessories get their own default spot (from ACCESSORY_DEFAULT_POSITIONS)
// but share the exact same free-drag stage and mechanics as the garments
// above, so every draggable photo on the showcase behaves identically.
function addAccessoryToStage(product, index) {
  const fallback = ACCESSORY_DEFAULT_POSITIONS[index] || ACCESSORY_DEFAULT_POSITIONS[0];
  const left = product.left ?? fallback.left;
  const top = product.top ?? fallback.top;

  const img = document.createElement('img');
  img.src = product.url;
  img.alt = getCategoryLabel('accessory');
  img.className = 'product-image drag-image accessory-image';
  img.style.left = `${left}%`;
  img.style.top = `${top}%`;
  document.getElementById('dragStage').appendChild(img);

  const onTap = makeZoomable(img, product, 'scale');
  makeFreeDraggable(img, product, onTap);
}

// ---- Draggable description labels/sections (Templates 1, 2 & 3) ----
// Same free-drag mechanics as the garment photos, but for the pieces of
// text that name each item: Template 1's TOP:/BOTTOM:/SHOES: corner
// labels, Template 2's heading+bullets sections, and Template 3's big
// corner labels. Unlike the photos, these elements already exist in the
// static HTML and are never recreated on re-render, so they're wired up
// ONCE here (called from app.js after the first renderShowcase()) rather
// than inside renderShowcase()/renderListTemplate()/renderEditorialTemplate.
// Each one keeps its own position in state.labelPositions, independent
// per template, exactly like each template's own photo bank does for photos.
function setupLabelDragging() {
  const pos = state.labelPositions;

  function wire(el, entry, stageSelector) {
    if (!el) return;
    el.style.left = `${entry.left}%`;
    el.style.top = `${entry.top}%`;
    makeFreeDraggable(el, entry, null, { stageSelector });
  }

  wire(document.querySelector('#classicView .top-label'), pos.classic.top, '.labels');
  wire(document.querySelector('#classicView .bottom-label'), pos.classic.bottom, '.labels');
  wire(document.querySelector('#classicView .shoes-label'), pos.classic.shoes, '.labels');

  // Editorial labels (.ed-label) live as siblings of #dragStageEditorial
  // in the HTML, not inside it, so '#dragStageEditorial' never matches
  // via .closest() and dragging silently never starts. '#showcase' is a
  // real ancestor of both — and IS the full live-preview card — so
  // using it as the stage lets these labels drag anywhere across the
  // whole Template 3 preview, edge to edge.
  wire(document.querySelector('#editorialView .top-label'), pos.editorial.top, '#showcase');
  wire(document.querySelector('#editorialView .bottom-label'), pos.editorial.bottom, '#showcase');

  wire(document.querySelector('#listView .lt-section[data-category="top"]'), pos.list.top, '.lt-text-col');
  wire(document.querySelector('#listView .lt-section[data-category="bottom"]'), pos.list.bottom, '.lt-text-col');
  wire(document.querySelector('#listView .lt-section[data-category="shoes"]'), pos.list.shoes, '.lt-text-col');
  wire(document.querySelector('#listView .lt-section[data-category="accessories"]'), pos.list.accessories, '.lt-text-col');
}

// The sidebar upload slots always reflect whichever template is
// currently active — since each template has its own separate bank of
// photos, switching templates changes what these thumbnails show.
function renderSlotThumbs() {
  const bank = state.banks[state.template];
  ['top', 'bottom', 'shoes', 'short'].forEach(category => {
    const slot = document.getElementById(`${category}Slot`);
    const thumb = document.getElementById(`${category}Thumb`);
    const product = bank[category];
    if (product) {
      slot.classList.add('has-image');
      thumb.style.backgroundImage = `url(${product.url})`;
    } else {
      slot.classList.remove('has-image');
      thumb.style.backgroundImage = '';
    }
  });
}

function renderAccessorySlots() {
  const count = document.getElementById('accessoryCount');
  let filled = 0;
  const bank = state.banks[state.template];

  bank.accessories.forEach((product, index) => {
    const slot = document.getElementById(`accessorySlot${index}`);
    const thumb = document.getElementById(`accessoryThumb${index}`);
    if (!slot || !thumb) return;
    if (product) {
      filled++;
      slot.classList.add('has-image');
      thumb.style.backgroundImage = `url(${product.url})`;
    } else {
      slot.classList.remove('has-image');
      thumb.style.backgroundImage = '';
    }
  });

  count.textContent = `${filled} / ${MAX_ACCESSORIES}`;
}

return { renderShowcase, renderListTemplate, renderEditorialTemplate, applyVisibility, setupLabelDragging };
})();

// ==== prompt.js ====
const ModulePrompt = (function(){
const OUTFIT_GENERATION_PROMPT = `Create a professional fashion outfit product showcase using EVERY uploaded outfit/product photo as the exact visual reference. NO MANNEQUIN, NO PERSON, NO BODY, NO MODEL. For every uploaded image, automatically remove the entire original background, isolate only the actual product, clean the edges, remove people/hands/hangers/furniture and unwanted objects, correct orientation when needed, and automatically fit and scale the product proportionally. Preserve the exact original product colors, tones, graphics, prints, logos, branding, patterns, fabric texture, stitching, seams, pockets, buttons, zippers, distressing, fading, materials, shape, cut, fit, proportions, shoe details and all small details. Never redesign, recolor, simplify, beautify, replace or invent product details. Automatically identify tops, bottoms, shoes and accessories and adapt to pants, jeans, jorts, shorts, cargo pants, trousers, sweatpants, chinos, skirts and other garments. Arrange the products into one cohesive floating outfit: upper-body clothing at the top, the correct lower-body item below it, shoes at the bottom, and uploaded accessories naturally around the outfit. Keep every product fully visible, correctly scaled, inside the frame and naturally spaced. Use a pure white #FFFFFF background with no original background, room, wall, floor, grid, furniture, scenery or gradient. Let the authentic original product colors stand out with clean lighting, realistic contrast and crisp textures without recoloring or oversaturating. Use natural fabric folds, realistic draping, authentic material texture, subtle imperfections, natural shadows, realistic lighting, accurate proportions and believable product placement. Avoid AI-looking textures, plastic surfaces, artificial smoothness, fake reflections, warped products, distorted logos, incorrect graphics, unrealistic folds and CGI appearance.

Match this exact composition and camera geometry for every product: centered horizontally in the frame, front-facing orientation, camera positioned directly in front of the product with minimal perspective distortion, product occupying a consistent proportion of the frame across all items, even consistent margins around each product, and a subtle soft contact shadow beneath it — no unnecessary background elements. Treat this composition and photography style as a template only; the uploaded product photos remain the sole source of truth for the product's actual appearance, colors, and details.

Final output: vertical 9:16, premium photorealistic fashion catalog, clean, colorful, minimal, natural and accurate.`;

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(OUTFIT_GENERATION_PROMPT);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

return { OUTFIT_GENERATION_PROMPT, copyPrompt };
})();

// ==== download.js ====
const ModuleDownload = (function(){
// Waits for every <img> inside the showcase to finish loading/decoding.
// Without this, a photo that was just uploaded (or is still mid-decode)
// can get captured blank or half-drawn — the downloaded PNG then looks
// different from what's visibly on screen even though the screen itself
// is fine.
async function waitForImages(root) {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  }));
  // decode() double-checks the browser has actually finished decoding
  // pixel data, not just fired the load event.
  await Promise.all(imgs.map(img => img.decode?.().catch(() => {})));
}

// ---- Photo Outline / Highlight: baking for export ----
// The live preview draws the outline with `filter: drop-shadow(...)`
// (see buildOutlineFilter() in app.js — an 8-step ring of zero-blur
// drop-shadows, or a few blurred ones for the glow option). html2canvas
// does not reliably render the CSS `filter` property at all, so a photo
// with the outline enabled looks correct on screen but comes out with
// no outline (or the wrong one) in the downloaded PNG.
//
// The fix: right before capture, redraw each outlined photo onto an
// offscreen canvas with the same ring baked into real pixels, and swap
// the <img>'s src to that composited image just for the capture. That
// way html2canvas is handed a plain PNG that already contains the
// outline, instead of a filter it can't see. Everything is restored
// immediately afterward so the live, editable preview is untouched.
const OUTLINE_RING_STEPS = 8; // must match app.js's buildOutlineFilter
const AMBIENT_SHADOW_BLUR = 10;
const AMBIENT_SHADOW_Y = 12;
const AMBIENT_SHADOW_COLOR = 'rgba(0,0,0,.12)';

function getPhotoOutlineSettings() {
  const enable = document.getElementById('photoOutlineToggle');
  const color = document.getElementById('photoOutlineColorInput');
  const width = document.getElementById('photoOutlineWidthInput');
  const glow = document.getElementById('photoOutlineGlowToggle');
  if (!enable?.checked) return null;
  return {
    color: color?.value || '#ffffff',
    width: Number(width?.value) || 0,
    glow: !!glow?.checked
  };
}

// Draws `img` into a same-size canvas, then paints a solid silhouette
// of it (color fills every non-transparent pixel, alpha shape kept
// intact) using source-in compositing — this is what gets stamped
// around the photo to form the ring/glow, exactly like the drop-shadow
// trick it's replacing.
function makeSilhouette(img, w, h, color) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return c;
}

// Note: the bake canvas is exactly the photo's natural width/height, so
// any part of the ring/glow that would fall *outside* those bounds gets
// clipped (same as any canvas draw). In the live preview the CSS
// drop-shadow filter is allowed to overflow the <img> box, so this can
// differ slightly for a garment cutout with almost no transparent
// margin around it. In practice cutout product photos carry a margin
// well past this control's max width (14px), so the ring stays inside
// the frame; a near-edge-to-edge cutout is the one case worth checking
// after export.
function bakeOutlineOntoImage(img, settings, renderedWidth) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;

  // The width/glow-radius controls are defined in on-screen CSS pixels
  // (that's what the live drop-shadow filter uses), but we're baking
  // at the photo's full natural resolution to avoid a quality
  // downgrade. Scale every offset by naturalWidth/renderedWidth so the
  // ring ends up the *requested* width once the browser scales this
  // image back down to its normal display box.
  const scale = renderedWidth > 0 ? w / renderedWidth : 1;
  const ringWidth = settings.width * scale;
  const ambientBlur = AMBIENT_SHADOW_BLUR * scale;
  const ambientOffsetY = AMBIENT_SHADOW_Y * scale;

  const silhouette = makeSilhouette(img, w, h, settings.color);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');

  // Ambient shadow first (same soft drop-shadow the un-outlined photos
  // already carry), so outlined photos still sit on the page the same
  // way as every other photo.
  ctx.save();
  ctx.shadowColor = AMBIENT_SHADOW_COLOR;
  ctx.shadowBlur = ambientBlur;
  ctx.shadowOffsetY = ambientOffsetY;
  ctx.drawImage(silhouette, 0, 0);
  ctx.restore();

  if (settings.glow) {
    // Soft glow: a few blurred silhouette stamps, growing outward —
    // canvas shadowBlur does the softening natively, no ring needed.
    const glowSteps = [ringWidth * 0.4, ringWidth * 0.75, ringWidth * 1.1];
    glowSteps.forEach(radius => {
      ctx.save();
      ctx.shadowColor = settings.color;
      ctx.shadowBlur = radius;
      ctx.drawImage(silhouette, 0, 0);
      ctx.restore();
    });
  } else {
    // Hard ring: stamp the silhouette at N evenly spaced angles around
    // the photo — same geometry as OUTLINE_RING_STEPS in app.js, just
    // painted as real pixels instead of a filter.
    for (let i = 0; i < OUTLINE_RING_STEPS; i++) {
      const angle = (i / OUTLINE_RING_STEPS) * Math.PI * 2;
      const dx = Math.cos(angle) * ringWidth;
      const dy = Math.sin(angle) * ringWidth;
      ctx.drawImage(silhouette, dx, dy);
    }
  }

  // Original photo on top, unshifted.
  ctx.drawImage(img, 0, 0);
  return out;
}

// ---- Pin #showcase's CSS `aspect-ratio` box to a real pixel height ----
// #showcase (style.css / composition.css) is sized purely with
// `aspect-ratio` — no explicit width/height is ever set, and every photo
// and garment slot inside it is positioned with percentages against
// that box. Real browsers compute `aspect-ratio` fine, so the live
// preview always looks right.
//
// html2canvas (last released 2021) predates the `aspect-ratio` property
// and does not understand it. When it clones #showcase into its
// offscreen render, the clone's height collapses to something other
// than the real element's height; html2canvas then stretches that
// mis-sized clone to match the real element's measured bounding box for
// the final canvas. Every percentage-positioned child stretches with
// it — most visibly the top garment photo, since it spans the largest
// share of the showcase's height.
//
// Fix: right before capture, measure #showcase's actual rendered
// height and width and set them as explicit inline pixel styles. That
// gives html2canvas's clone a real, definite box to lay out against
// instead of an `aspect-ratio` it can't resolve, so nothing inside
// needs to stretch. The inline styles are removed again immediately
// after capture so the live, CSS-aspect-ratio-driven preview (which
// must keep resizing with the viewport) is untouched.
function pinShowcaseBoxForCapture(showcase) {
  const rect = showcase.getBoundingClientRect();
  const originalWidth = showcase.style.width;
  const originalHeight = showcase.style.height;
  const originalAspectRatio = showcase.style.aspectRatio;

  showcase.style.width = `${rect.width}px`;
  showcase.style.height = `${rect.height}px`;
  showcase.style.aspectRatio = 'none';

  return () => {
    showcase.style.width = originalWidth;
    showcase.style.height = originalHeight;
    showcase.style.aspectRatio = originalAspectRatio;
  };
}

async function bakePhotoOutlineForCapture(root) {
  const settings = getPhotoOutlineSettings();
  if (!settings) return () => {};

  const imgs = Array.from(root.querySelectorAll('.product-image, .flat-item img'));
  const restores = [];

  for (const img of imgs) {
    if (!img.naturalWidth || !img.naturalHeight) continue;
    const renderedWidth = img.getBoundingClientRect().width || img.offsetWidth;
    let baked;
    try {
      baked = bakeOutlineOntoImage(img, settings, renderedWidth);
    } catch (err) {
      console.error('Photo outline bake failed for one image, leaving it as-is', err);
      continue;
    }
    if (!baked) continue;

    const dataUrl = baked.toDataURL('image/png');
    const originalSrc = img.src;
    const originalFilter = img.style.filter;
    // Neutralize the live CSS filter on this element for the capture —
    // the outline is now baked into pixels, so leaving the filter in
    // place risks a doubled-up look on any renderer that *does*
    // support it.
    img.style.filter = 'none';

    await new Promise(resolve => {
      const onLoad = () => { img.removeEventListener('load', onLoad); resolve(); };
      img.addEventListener('load', onLoad, { once: true });
      img.src = dataUrl;
    });

    restores.push(() => {
      img.src = originalSrc;
      img.style.filter = originalFilter;
    });
  }

  return () => restores.forEach(restore => restore());
}

// ---- Accessory photos: baking object-fit for export ----
// Every accessory photo (Template 1, 2 and 3's floating accessory images,
// class `.accessory-image`) is a FIXED 18% x 18% box (see css/style.css)
// that relies on `object-fit: contain` to shrink the actual photo down to
// fit inside that square without stretching it — the photo is scaled
// down and centered inside the box, keeping its real aspect ratio.
//
// html2canvas (last released 2021) does not support the `object-fit`
// property at all: it ignores it completely and just draws the raw image
// stretched across the element's full width/height box. Every OTHER photo
// (top/bottom/shoes) escapes this because they're only ever given an
// explicit WIDTH with height left auto — the browser (and html2canvas)
// both compute the height from the image's natural ratio, so there's
// nothing to stretch. Accessories are the only photos with both width AND
// height forced, so they're the only ones that come out squashed/stretched
// in the downloaded PNG even though they look perfectly proportioned in
// the live preview.
//
// The fix: right before capture, for every accessory image, work out the
// same "contain" box object-fit would have produced (based on its real
// natural aspect ratio and its current on-screen box), then shrink the
// element itself down to that exact pixel size/position. html2canvas is
// then handed an element whose box IS the correctly proportioned photo,
// so there's nothing left for it to stretch. Restored immediately after
// capture so the live, CSS-driven preview is untouched.
function bakeAccessoryFitForCapture(root) {
  const imgs = Array.from(root.querySelectorAll('.accessory-image'));
  const restores = [];

  imgs.forEach(img => {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const stage = img.closest('.drag-stage') || img.parentElement;
    if (!stage) return;

    const boxRect = img.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    if (!boxRect.width || !boxRect.height) return;

    const naturalRatio = img.naturalWidth / img.naturalHeight;
    const boxRatio = boxRect.width / boxRect.height;

    // Same math the browser's object-fit:contain does: fit to whichever
    // axis is the tighter constraint, keep the natural ratio, center the
    // rest inside the original box.
    let contentW, contentH;
    if (naturalRatio > boxRatio) {
      contentW = boxRect.width;
      contentH = boxRect.width / naturalRatio;
    } else {
      contentH = boxRect.height;
      contentW = boxRect.height * naturalRatio;
    }
    const offsetX = (boxRect.width - contentW) / 2;
    const offsetY = (boxRect.height - contentH) / 2;

    const originalLeft = img.style.left;
    const originalTop = img.style.top;
    const originalWidth = img.style.width;
    const originalHeight = img.style.height;
    const originalTransform = img.style.transform;

    // boxRect (above) was read via getBoundingClientRect(), which already
    // reflects any ratio-panel zoom (image-transform.js applies that as a
    // CSS `transform: scale()` directly on this <img>). The left/top/width/
    // height we're about to set already bake that scaled size/position in
    // as real pixels — so the `transform: scale()` itself must be cleared
    // here, or html2canvas would apply it a second time on top of the
    // already-scaled box, throwing off any accessory that was resized
    // with the ratio panel.
    img.style.transform = 'none';
    img.style.left = `${(boxRect.left - stageRect.left) + offsetX}px`;
    img.style.top = `${(boxRect.top - stageRect.top) + offsetY}px`;
    img.style.width = `${contentW}px`;
    img.style.height = `${contentH}px`;

    restores.push(() => {
      img.style.left = originalLeft;
      img.style.top = originalTop;
      img.style.width = originalWidth;
      img.style.height = originalHeight;
      img.style.transform = originalTransform;
    });
  });

  return () => restores.forEach(restore => restore());
}

async function downloadShowcase(callbacks = {}) {
  callbacks.onStart?.();
  let restoreOutline = () => {};
  let restoreAccessoryFit = () => {};
  let restoreShowcaseBox = () => {};
  try {
    const showcase = document.getElementById('showcase');
    // Custom webfonts (Inter / Space Grotesk) can still be swapping in
    // when the click happens; html2canvas snapshots whatever is painted
    // at that instant, so an early capture can bake in the fallback
    // system font even though the live preview looks correct a moment
    // later. Waiting for document.fonts.ready removes that race.
    await Promise.all([
      document.fonts?.ready ?? Promise.resolve(),
      waitForImages(showcase)
    ]);

    // Bake the outline into real pixels before handing the DOM to
    // html2canvas — see bakePhotoOutlineForCapture() above for why.
    restoreOutline = await bakePhotoOutlineForCapture(showcase);

    // Fix accessory photos being stretched by html2canvas's lack of
    // object-fit support — see bakeAccessoryFitForCapture() above for
    // why. Must run after the outline bake (so it measures the final
    // baked <img>s) and before the showcase box is pinned/captured.
    restoreAccessoryFit = bakeAccessoryFitForCapture(showcase);

    // Pin the aspect-ratio-sized #showcase box to real pixels — see
    // pinShowcaseBoxForCapture() above for why. Must happen after the
    // outline bake (which doesn't change layout) and right before
    // capture, using the final on-screen dimensions.
    restoreShowcaseBox = pinShowcaseBoxForCapture(showcase);

    let canvas;
    try {
      const module = await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm');
      canvas = await module.default(showcase, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        // The Template 1 remove-photo badge (js/outfit-renderer.js) is
        // an editor-only control living inside #showcase — it must never
        // end up baked into the downloaded PNG.
        ignoreElements: el => el.classList?.contains('photo-remove-btn')
      });
    } finally {
      // Always swap the baked images back out, even if html2canvas
      // itself throws — otherwise the live editor is left showing the
      // export-only composited photos instead of the originals.
      restoreOutline();
      restoreAccessoryFit();
      restoreShowcaseBox();
    }

    const outfitName = document.getElementById('outfitName').value || 'rizz-fits-outfit';
    const fileName = outfitName.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
    const link = document.createElement('a');
    link.download = `${fileName}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    link.remove();
    callbacks.onComplete?.();
  } catch (error) {
    console.error(error);
    callbacks.onError?.(error);
    alert('Export needs an internet connection the first time so the PNG renderer can load.');
  }
}

return { downloadShowcase };
})();

// ==== persist.js ====
const ModulePersist = (function(){
// ---- Persisting the whole editor across page refreshes ----
// Everything the person edits (uploaded photos, positions, text, colors,
// fonts, nudges, template/composition/background choice, visibility) gets
// saved here and restored the next time the page loads — so refreshing the
// browser (or closing the tab and coming back) picks up exactly where they
// left off.
//
// Uses IndexedDB rather than localStorage because uploaded photos are
// stored as real File objects (IndexedDB can store Blob/File data
// natively via the structured clone algorithm), which avoids both
// localStorage's ~5-10MB quota (a handful of photos blows past that
// instantly) and the CPU cost of base64-encoding every photo on every
// save. Blob/File values survive being written to and read back from
// IndexedDB across page loads; a fresh blob: object URL just needs to be
// re-created for each restored File, since blob URLs themselves don't
// survive a reload.
const DB_NAME = 'rizzFitsShowcase';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';
const SNAPSHOT_KEY = 'current';

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveSnapshot(snapshot) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(snapshot, SNAPSHOT_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    // Saving progress is a nice-to-have — never let it break editing.
    console.warn('Could not save showcase progress', error);
  }
}

async function loadSnapshot() {
  try {
    const db = await openDB();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch (error) {
    console.warn('Could not load saved showcase progress', error);
    return null;
  }
}

async function clearSnapshot() {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(SNAPSHOT_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    // Nothing to clean up if this fails — a stale snapshot just gets
    // overwritten by the next successful save anyway.
  }
}

// Debounced save — lets many rapid changes (typing, dragging a color
// slider) collapse into a single write instead of hammering IndexedDB on
// every keystroke.
let saveTimer = null;
function scheduleSave(buildSnapshot, delay = 500) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveSnapshot(buildSnapshot());
  }, delay);
}

// Saves right away (no debounce) — used when the page is about to be
// hidden/closed, so nothing typed or dragged in the last moment is lost.
function saveNow(buildSnapshot) {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  saveSnapshot(buildSnapshot());
}

return { saveSnapshot, loadSnapshot, clearSnapshot, scheduleSave, saveNow };
})();

// ==== app.js ====
const ModuleApp = (function(){
const { state, MAX_ACCESSORIES } = ModuleState;
const { uploadSingle, setAccessory, removeAccessory, resetAll } = ModuleUpload;
const { renderShowcase, applyVisibility, renderListTemplate, renderEditorialTemplate, setupLabelDragging } = ModuleOutfitRenderer;
const { copyPrompt } = ModulePrompt;
const { downloadShowcase } = ModuleDownload;
const { loadSnapshot, scheduleSave, saveNow, clearSnapshot } = ModulePersist;
const statusEl = document.getElementById('autoStatus');
const outfitName = document.getElementById('outfitName');
const topLabelText = document.getElementById('topLabelText');
const bottomLabelText = document.getElementById('bottomLabelText');
const shoesLabelText = document.getElementById('shoesLabelText');
const topText = document.getElementById('topText');
const bottomText = document.getElementById('bottomText');
const shoesText = document.getElementById('shoesText');
const showcaseEl = document.getElementById('showcase');
// Two control groups — one for the category tag/heading text (Template
// 1's bold "TOP:" prefix, Template 2's section heading, Template 3's
// small uppercase caption), one for the actual typed description copy
// (Template 1's .label span, Template 2's .lt-bullets li, Template 3's
// .ed-label b). Each drives its own --label-*/--desc-* CSS vars.
const textStyleControls = {
  label: {
    font: document.getElementById('labelFontSelect'),
    size: document.getElementById('labelSizeInput'),
    weight: document.getElementById('labelWeightSelect'),
    color: document.getElementById('labelColorInput'),
    italic: document.getElementById('labelItalicInput')
  },
  desc: {
    font: document.getElementById('descFontSelect'),
    size: document.getElementById('descSizeInput'),
    weight: document.getElementById('descWeightSelect'),
    color: document.getElementById('descColorInput'),
    italic: document.getElementById('descItalicInput')
  }
};

// ---- "Showcase" tag style — logo icon and "Showcase" text, each with
// their own font/size/color. Text styling applies as CSS custom
// properties the same way textStyleControls above does. The logo icon
// is a near-monochrome PNG (assets/images/icons/showcase-logo.png), so
// "color" is achieved by recoloring the actual pixels on a canvas
// (source-in compositing) rather than a CSS filter/mask — canvas
// recoloring renders identically in the live preview AND in the
// html2canvas export, whereas CSS mask-image/filter are not reliably
// captured by html2canvas. See applyTagTextStyle / applyTagLogoStyle
// below. Position (left/right, per top/bottom/shoes category) is
// handled separately by wireNudge.
const tagTextControls = {
  font: document.getElementById('tagTextFontSelect'),
  size: document.getElementById('tagTextSizeInput'),
  weight: document.getElementById('tagTextWeightSelect'),
  color: document.getElementById('tagTextColorInput'),
  italic: document.getElementById('tagTextItalicInput')
};
const tagLogoControls = {
  size: document.getElementById('tagLogoSizeInput'),
  color: document.getElementById('tagLogoColorInput')
};
const TAG_LOGO_SRC = 'assets/images/icons/showcase-logo.png';
let tagLogoSourceImg = null; // the original PNG, loaded once and reused for every recolor

const photoOutlineControls = {
  enable: document.getElementById('photoOutlineToggle'),
  color: document.getElementById('photoOutlineColorInput'),
  width: document.getElementById('photoOutlineWidthInput'),
  glow: document.getElementById('photoOutlineGlowToggle')
};

// ---- Save / restore across page refreshes ----
// Everything editable lives either on `state` (photos, positions, text,
// visibility, template/composition/background, nudge offsets) or as plain
// DOM control values (fonts, sizes, colors, checkboxes) — this snapshot
// bundles both so a reload can put every one of them back exactly as they
// were. See js/persist.js for how/where it's actually stored.
function readControlGroup(group) {
  const out = {};
  Object.entries(group).forEach(([key, el]) => {
    if (!el) return;
    out[key] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return out;
}
function writeControlGroup(group, values) {
  if (!values) return;
  Object.entries(group).forEach(([key, el]) => {
    if (!el || !(key in values)) return;
    if (el.type === 'checkbox') el.checked = values[key];
    else el.value = values[key];
  });
}
function buildSnapshot() {
  return {
    state,
    controls: {
      label: readControlGroup(textStyleControls.label),
      desc: readControlGroup(textStyleControls.desc),
      tagText: readControlGroup(tagTextControls),
      tagLogo: readControlGroup(tagLogoControls),
      tagComboSize: tagComboSizeInput.value,
      photoOutline: readControlGroup(photoOutlineControls)
    }
  };
}
function persistNow() {
  scheduleSave(buildSnapshot);
}

function setStatus(text, mode = 'ready') {
  statusEl.className = 'auto-status';
  if (mode === 'busy') statusEl.classList.add('busy');
  if (mode === 'error') statusEl.classList.add('error');
  statusEl.lastChild.textContent = ` ${text}`;
}

function syncText() {
  state.outfitName = outfitName.value;
  state.categoryLabels.top = topLabelText.value.trim() ? topLabelText.value : 'TOP';
  state.categoryLabels.bottom = bottomLabelText.value.trim() ? bottomLabelText.value : 'BOTTOM';
  state.categoryLabels.shoes = shoesLabelText.value.trim() ? shoesLabelText.value : 'SHOES';
  state.descriptions.top = topText.value;
  state.descriptions.bottom = bottomText.value;
  state.descriptions.shoes = shoesText.value;

  // Category name — Template 1's bold "TOP:" prefix, Template 2's section
  // heading, Template 3's small caption. Template 1 keeps its trailing
  // colon (baked on here, not typed by the user); Templates 2 & 3 show
  // the label as typed (Template 2's CSS uppercases it either way).
  document.getElementById('catLabelTop').textContent = `${state.categoryLabels.top}:`;
  document.getElementById('catLabelBottom').textContent = `${state.categoryLabels.bottom}:`;
  document.getElementById('catLabelShoes').textContent = `${state.categoryLabels.shoes}:`;
  document.getElementById('catHeadingTop').textContent = state.categoryLabels.top;
  document.getElementById('catHeadingBottom').textContent = state.categoryLabels.bottom;
  document.getElementById('catHeadingShoes').textContent = state.categoryLabels.shoes;
  document.getElementById('edCatLabelTop').textContent = state.categoryLabels.top;
  document.getElementById('edCatLabelBottom').textContent = state.categoryLabels.bottom;

  document.getElementById('labelTop').textContent = topText.value.trim() ? topText.value : 'Top';
  document.getElementById('labelBottom').textContent = bottomText.value.trim() ? bottomText.value : 'Bottom';
  document.getElementById('labelShoes').textContent = shoesText.value.trim() ? shoesText.value : 'Shoes';
  document.getElementById('edLabelTop').textContent = topText.value.trim() ? topText.value : 'Top';
  document.getElementById('edLabelBottom').textContent = bottomText.value.trim() ? bottomText.value : 'Bottom';

  renderListTemplate();
  renderEditorialTemplate();
}

[outfitName, topLabelText, bottomLabelText, shoesLabelText, topText, bottomText, shoesText].forEach(input => {
  input.addEventListener('input', () => {
    syncText();
    persistNow();
  });
});

// ---- Label vs description text style (font/size/weight/color/italic) ----
// Applies as CSS custom properties on #showcase, which every template's
// category tag/heading (Template 1's bold "TOP:" prefix, Template 2's
// section heading, Template 3's small caption) reads via var(--label-*),
// and every template's typed description text (Template 1's .label
// span, Template 2's .lt-bullets li, Template 3's .ed-label b) reads via
// var(--desc-*) — see css/style.css, css/template-list.css,
// css/template-editorial.css. Two control groups — Label Style and
// Description Style — so the tag and the copy can each have their own
// font, size, weight, color and italic setting.
function applyTextStyle(kind) {
  const c = textStyleControls[kind];
  const prefix = kind === 'label' ? '--label' : '--desc';
  showcaseEl.style.setProperty(`${prefix}-font`, c.font.value);
  showcaseEl.style.setProperty(`${prefix}-size`, `${c.size.value}px`);
  showcaseEl.style.setProperty(`${prefix}-weight`, c.weight.value);
  showcaseEl.style.setProperty(`${prefix}-color`, c.color.value);
  showcaseEl.style.setProperty(`${prefix}-style`, c.italic.checked ? 'italic' : 'normal');
}

Object.entries(textStyleControls).forEach(([kind, c]) => {
  Object.values(c).forEach(input => {
    input.addEventListener('input', () => {
      applyTextStyle(kind);
      persistNow();
    });
  });
  applyTextStyle(kind);
});

// ---- Showcase tag text style (font/size/weight/color/italic) ----
function applyTagTextStyle() {
  const c = tagTextControls;
  showcaseEl.style.setProperty('--tag-text-font', c.font.value);
  showcaseEl.style.setProperty('--tag-text-size', `${c.size.value}px`);
  showcaseEl.style.setProperty('--tag-text-weight', c.weight.value);
  showcaseEl.style.setProperty('--tag-text-color', c.color.value);
  showcaseEl.style.setProperty('--tag-text-style', c.italic.checked ? 'italic' : 'normal');
}
Object.values(tagTextControls).forEach(input => {
  input.addEventListener('input', () => {
    applyTagTextStyle();
    persistNow();
  });
});
applyTagTextStyle();

// ---- Showcase tag logo style (size/color) ----
// Recolors the logo PNG on a canvas (source-in composite over the
// icon's own alpha) and swaps every .showcase-tag-icon's src to the
// result, so the tint shows correctly both live and in the exported
// PNG. Size is a plain CSS var.
function recolorTagLogo(color) {
  return new Promise(resolve => {
    if (!tagLogoSourceImg) {
      tagLogoSourceImg = new Image();
      tagLogoSourceImg.src = TAG_LOGO_SRC;
    }
    const draw = () => {
      const canvas = document.createElement('canvas');
      canvas.width = tagLogoSourceImg.naturalWidth;
      canvas.height = tagLogoSourceImg.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(tagLogoSourceImg, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    if (tagLogoSourceImg.complete && tagLogoSourceImg.naturalWidth) draw();
    else tagLogoSourceImg.onload = draw;
  });
}
async function applyTagLogoStyle() {
  const c = tagLogoControls;
  showcaseEl.style.setProperty('--tag-logo-size', `${c.size.value}px`);
  const dataUrl = await recolorTagLogo(c.color.value);
  document.querySelectorAll('.showcase-tag-icon').forEach(img => { img.src = dataUrl; });
}
Object.values(tagLogoControls).forEach(input => {
  input.addEventListener('input', () => {
    applyTagLogoStyle();
    persistNow();
  });
});
applyTagLogoStyle();

// "Logo + Text size" field — an overall size control for the whole
// "Showcase" tag (icon + wordmark together), kept fully INDEPENDENT
// from "Logo size (px)": resizing this never reads, writes, or
// otherwise touches the Logo size field (or the Font size field), and
// resizing those never touches this one. It works by scaling the tag
// as a unit via its own CSS custom property (--tag-combo-scale) rather
// than by deriving a logo px value or a text px value from it, so
// there's no shared state between the two controls at all.
const tagComboSizeInput = document.getElementById('tagComboSizeInput');
function clampToInput(input, value) {
  return Math.max(Number(input.min), Math.min(Number(input.max), value));
}
const TAG_COMBO_BASE = 18; // px value at which the combined scale is 1 (neutral)
function applyTagComboScale() {
  const scale = Number(tagComboSizeInput.value) / TAG_COMBO_BASE;
  showcaseEl.style.setProperty('--tag-combo-scale', scale);
}
tagComboSizeInput.addEventListener('input', () => {
  tagComboSizeInput.value = clampToInput(tagComboSizeInput, Number(tagComboSizeInput.value));
  applyTagComboScale();
  persistNow();
});
applyTagComboScale();

// ---- Showcase tag position (left/right), per category ----
// Each of the top/bottom/shoes tags gets two independent nudges: one
// moves that category's logo + "Showcase" text together as one unit
// (--tag-group-x-<cat>, on .showcase-tag), the other moves ONLY the
// logo icon on top of that (--tag-logo-x-<cat>, on
// .showcase-tag-icon-wrap — a child of .showcase-tag, so the two
// offsets stack additively). Both scoped by the shared
// .top-label/.bottom-label/.shoes-label classes every template's
// labels carry (see css/style.css), so one set of controls covers
// Templates 1 and 3 automatically.
//
// Template 1 and Template 3 each keep their OWN offsets (state.tagPositions.classic
// / state.tagPositions.editorial), exactly like they already keep separate
// photo banks and drag positions. The buttons apply to whichever template
// is currently active, and — crucially — the resulting CSS variables are
// set on that template's own container (#classicView / #editorialView)
// rather than on the shared #showcase element, so a nudge made while
// viewing Template 1 cannot bleed into Template 3's layout, and vice
// versa. The running offsets live on state.tagPositions (rather than a
// local variable) so they can be saved and put back exactly where they
// were after a refresh — see applyTagPositions() below, called once on
// restore.
function activeTagBucket() {
  // Template 2 ("list") has no showcase tag at all, so its nudges (if
  // ever clicked while it's active) fall back to the classic bucket —
  // harmless since nothing reads it there.
  return state.template === 'editorial' ? 'editorial' : 'classic';
}
function activeTagContainer() {
  return state.template === 'editorial'
    ? document.getElementById('editorialView')
    : document.getElementById('classicView');
}

function wireNudge(varName, leftBtnId, rightBtnId, catKey) {
  const STEP = 2;   // px nudge per click
  const LIMIT = 80;  // px, either direction
  const leftBtn = document.getElementById(leftBtnId);
  const rightBtn = document.getElementById(rightBtnId);
  if (!leftBtn || !rightBtn) return;

  function apply() {
    const bucket = state.tagPositions[activeTagBucket()];
    activeTagContainer().style.setProperty(varName, `${bucket.groupX[catKey]}px`);
  }
  leftBtn.addEventListener('click', () => {
    const bucket = state.tagPositions[activeTagBucket()];
    bucket.groupX[catKey] = Math.max(-LIMIT, bucket.groupX[catKey] - STEP);
    apply();
    persistNow();
  });
  rightBtn.addEventListener('click', () => {
    const bucket = state.tagPositions[activeTagBucket()];
    bucket.groupX[catKey] = Math.min(LIMIT, bucket.groupX[catKey] + STEP);
    apply();
    persistNow();
  });
}

// Same idea, but vertical — nudges the whole logo+"Showcase" text unit
// up/down for one category (top/bottom/shoes), via --tag-group-y-<cat>.
function wireNudgeY(varName, upBtnId, downBtnId, catKey) {
  const STEP = 2;   // px nudge per click
  const LIMIT = 80;  // px, either direction
  const upBtn = document.getElementById(upBtnId);
  const downBtn = document.getElementById(downBtnId);
  if (!upBtn || !downBtn) return;

  function apply() {
    const bucket = state.tagPositions[activeTagBucket()];
    activeTagContainer().style.setProperty(varName, `${bucket.groupY[catKey]}px`);
  }
  upBtn.addEventListener('click', () => {
    const bucket = state.tagPositions[activeTagBucket()];
    bucket.groupY[catKey] = Math.max(-LIMIT, bucket.groupY[catKey] - STEP);
    apply();
    persistNow();
  });
  downBtn.addEventListener('click', () => {
    const bucket = state.tagPositions[activeTagBucket()];
    bucket.groupY[catKey] = Math.min(LIMIT, bucket.groupY[catKey] + STEP);
    apply();
    persistNow();
  });
}

['Top', 'Bottom', 'Shoes'].forEach(cat => {
  const key = cat.toLowerCase();
  wireNudge(`--tag-group-x-${key}`, `tagMoveLeftBtn${cat}`, `tagMoveRightBtn${cat}`, key);
  wireNudgeY(`--tag-group-y-${key}`, `tagMoveUpBtn${cat}`, `tagMoveDownBtn${cat}`, key);
});

// Single "Logo only" Left/Right pair that nudges the logo icon on all
// three tags (top/bottom/shoes) together, instead of a separate pair
// per tag.
function wireNudgeMulti(varNames, leftBtnId, rightBtnId) {
  const STEP = 2;   // px nudge per click
  const LIMIT = 80;  // px, either direction
  const leftBtn = document.getElementById(leftBtnId);
  const rightBtn = document.getElementById(rightBtnId);
  if (!leftBtn || !rightBtn) return;

  function apply() {
    const bucket = state.tagPositions[activeTagBucket()];
    const container = activeTagContainer();
    varNames.forEach(varName => {
      container.style.setProperty(varName, `${bucket.logoX}px`);
    });
  }
  leftBtn.addEventListener('click', () => {
    const bucket = state.tagPositions[activeTagBucket()];
    bucket.logoX = Math.max(-LIMIT, bucket.logoX - STEP);
    apply();
    persistNow();
  });
  rightBtn.addEventListener('click', () => {
    const bucket = state.tagPositions[activeTagBucket()];
    bucket.logoX = Math.min(LIMIT, bucket.logoX + STEP);
    apply();
    persistNow();
  });
}

wireNudgeMulti(
  ['--tag-logo-x-top', '--tag-logo-x-bottom', '--tag-logo-x-shoes'],
  'tagLogoMoveLeftBtnAll',
  'tagLogoMoveRightBtnAll'
);

// Same idea, but vertical (up/down) — nudges the logo icon on all
// three tags together via --tag-logo-y-<cat>.
function wireNudgeMultiY(varNames, upBtnId, downBtnId) {
  const STEP = 2;   // px nudge per click
  const LIMIT = 80;  // px, either direction
  const upBtn = document.getElementById(upBtnId);
  const downBtn = document.getElementById(downBtnId);
  if (!upBtn || !downBtn) return;

  function apply() {
    const bucket = state.tagPositions[activeTagBucket()];
    const container = activeTagContainer();
    varNames.forEach(varName => {
      container.style.setProperty(varName, `${bucket.logoY}px`);
    });
  }
  upBtn.addEventListener('click', () => {
    const bucket = state.tagPositions[activeTagBucket()];
    bucket.logoY = Math.max(-LIMIT, bucket.logoY - STEP);
    apply();
    persistNow();
  });
  downBtn.addEventListener('click', () => {
    const bucket = state.tagPositions[activeTagBucket()];
    bucket.logoY = Math.min(LIMIT, bucket.logoY + STEP);
    apply();
    persistNow();
  });
}

wireNudgeMultiY(
  ['--tag-logo-y-top', '--tag-logo-y-bottom', '--tag-logo-y-shoes'],
  'tagLogoMoveUpBtnAll',
  'tagLogoMoveDownBtnAll'
);

// ---- Photo Outline / Highlight ----
// Every uploaded photo across all 3 templates shares the same
// `.product-image` class (see css/style.css), so a single CSS custom
// property on #showcase — --photo-fx — controls all of them at once.
// A plain CSS border/outline would just draw a box around the image's
// rectangular bounding area (including any transparent padding in a
// cutout PNG), not hug the actual garment silhouette. Instead this
// stamps a ring of zero-blur drop-shadows around the image at evenly
// spaced angles (same trick as the "Showcase" tag text outline above,
// just done with filter instead of text-shadow) — since drop-shadow
// follows the alpha channel, the result hugs the real photo outline.
// (photoOutlineControls itself is declared near the top of the file, next
// to buildSnapshot(), so the save/restore code can reference it too.)
const OUTLINE_RING_STEPS = 8;
const AMBIENT_SHADOW = 'drop-shadow(0 12px 10px rgba(0,0,0,.12))';

function buildOutlineFilter() {
  const c = photoOutlineControls;
  const width = Number(c.width.value) || 0;
  const color = c.color.value;
  if (c.glow.checked) {
    // Soft glow: a handful of blurred drop-shadows stacked outward
    // instead of a hard ring, so it reads as a halo rather than a line.
    const glowSteps = [width * 0.4, width * 0.75, width * 1.1];
    const glow = glowSteps.map(r => `drop-shadow(0 0 ${r}px ${color})`).join(' ');
    return `${AMBIENT_SHADOW} ${glow}`;
  }
  // 8 evenly-spaced steps is enough to read as a continuous ring at the
  // widths this control allows (max 14px) — halving it from the
  // original 16 roughly halves the compositing cost per photo, on top
  // of the debounce below.
  const ring = [];
  for (let i = 0; i < OUTLINE_RING_STEPS; i++) {
    const angle = (i / OUTLINE_RING_STEPS) * Math.PI * 2;
    const dx = (Math.cos(angle) * width).toFixed(2);
    const dy = (Math.sin(angle) * width).toFixed(2);
    ring.push(`drop-shadow(${dx}px ${dy}px 0 ${color})`);
  }
  return `${AMBIENT_SHADOW} ${ring.join(' ')}`;
}

function applyPhotoOutline() {
  const c = photoOutlineControls;
  if (c.enable.checked) {
    showcaseEl.style.setProperty('--photo-fx', buildOutlineFilter());
  } else {
    showcaseEl.style.removeProperty('--photo-fx');
  }
}
// Recalculating and reassigning a multi-drop-shadow filter across every
// uploaded photo is expensive — cheap enough for one click, but a color
// or number input fires 'input' many times per second while it's being
// dragged. Without debouncing, that reflows/repaints every photo on
// every one of those events synchronously, which is what actually reads
// as "lag". requestAnimationFrame coalesces any burst of events down to
// once per rendered frame, and the enable checkbox (no dragging
// involved) still applies instantly.
let outlineFrame = null;
function scheduleApplyPhotoOutline() {
  if (outlineFrame) return;
  outlineFrame = requestAnimationFrame(() => {
    outlineFrame = null;
    applyPhotoOutline();
  });
}
Object.values(photoOutlineControls).forEach(input => {
  input.addEventListener('input', () => {
    scheduleApplyPhotoOutline();
    persistNow();
  });
});
applyPhotoOutline();

function wireSlot(category) {
  const slot = document.getElementById(`${category}Slot`);
  const input = document.getElementById(`${category}Input`);

  function handleFile(file) {
    if (!file) return;
    uploadSingle(category, file, {
      onStart() {
        setStatus(`ADDING PHOTO — ${file.name}`, 'busy');
      },
      onComplete() {
        setStatus('AUTO-FIT READY', 'ready');
        renderShowcase();
        persistNow();
      },
      onError() {
        setStatus('COULD NOT ADD PHOTO', 'error');
      }
    });
  }

  input.addEventListener('change', () => {
    const file = input.files[0];
    input.value = '';
    handleFile(file);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    slot.addEventListener(eventName, event => {
      event.preventDefault();
      slot.classList.add('dragging');
    });
  });
  ['dragleave', 'drop'].forEach(eventName => {
    slot.addEventListener(eventName, event => {
      event.preventDefault();
      slot.classList.remove('dragging');
    });
  });
  slot.addEventListener('drop', event => {
    handleFile(event.dataTransfer.files[0]);
  });
}

['top', 'bottom', 'shoes', 'short'].forEach(wireSlot);

function wireAccessorySlot(index) {
  const slot = document.getElementById(`accessorySlot${index}`);
  const input = document.getElementById(`accessoryInput${index}`);
  const removeBtn = slot.querySelector('.slot-remove');

  function handleFile(file) {
    if (!file) return;
    setAccessory(index, file, {
      onStart() {
        setStatus(`ADDING PHOTO — ${file.name}`, 'busy');
      },
      onComplete() {
        setStatus('ACCESSORY ADDED', 'ready');
        renderShowcase();
        persistNow();
      },
      onError() {
        setStatus('COULD NOT ADD PHOTO', 'error');
      }
    });
  }

  input.addEventListener('change', () => {
    const file = input.files[0];
    input.value = '';
    handleFile(file);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    slot.addEventListener(eventName, event => {
      event.preventDefault();
      slot.classList.add('dragging');
    });
  });
  ['dragleave', 'drop'].forEach(eventName => {
    slot.addEventListener(eventName, event => {
      event.preventDefault();
      slot.classList.remove('dragging');
    });
  });
  slot.addEventListener('drop', event => {
    handleFile(event.dataTransfer.files[0]);
  });

  removeBtn.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    removeAccessory(index);
    setStatus('ACCESSORY REMOVED', 'ready');
    renderShowcase();
    persistNow();
  });
}

for (let i = 0; i < MAX_ACCESSORIES; i++) wireAccessorySlot(i);

// Fired by outfit-renderer.js's remove-photo badge (Template 1's
// top/bottom/shoes/short "×" button on the live preview) after it has
// already cleared the bank entry and re-rendered — this just handles the
// same status/persist side effects every other edit gets.
window.addEventListener('rizzfits:photo-removed', () => {
  setStatus('PHOTO REMOVED', 'ready');
  persistNow();
});

document.getElementById('copyPromptBtn').addEventListener('click', async () => {
  const success = await copyPrompt();
  setStatus(success ? 'AI PROMPT COPIED' : 'COULD NOT COPY PROMPT', success ? 'ready' : 'error');
});

document.getElementById('downloadBtn').addEventListener('click', () => {
  downloadShowcase({
    onStart() {
      setStatus('PREPARING DOWNLOAD…', 'busy');
    },
    onComplete() {
      setStatus('SHOWCASE DOWNLOADED', 'ready');
    },
    onError() {
      setStatus('DOWNLOAD FAILED — CHECK INTERNET CONNECTION', 'error');
    }
  });
});

document.getElementById('stageFilters').addEventListener('click', event => {
  const btn = event.target.closest('.filter-btn');
  if (!btn) return;
  const category = btn.dataset.category;
  state.visibility[category] = !state.visibility[category];
  btn.classList.toggle('active', state.visibility[category]);
  applyVisibility();
  persistNow();
});

// Template 2 ("list") / Template 3 ("editorial") toggles — purely display
// switches on top of the existing showcase; Template 1 keeps rendering
// exactly as it always has.
function applyTemplateUI(template) {
  document.querySelectorAll('.template-btn').forEach(b => b.classList.toggle('active', b.dataset.template === template));
  document.getElementById('classicView').classList.toggle('is-hidden', template !== 'classic');
  document.getElementById('listView').classList.toggle('is-hidden', template !== 'list');
  document.getElementById('editorialView').classList.toggle('is-hidden', template !== 'editorial');
  document.getElementById('showcase').classList.toggle('mode-list', template === 'list');
  document.getElementById('showcase').classList.toggle('mode-editorial', template === 'editorial');
}
document.getElementById('templateSwitch').addEventListener('click', event => {
  const btn = event.target.closest('.template-btn');
  if (!btn) return;
  const template = btn.dataset.template;
  state.template = template;
  applyTemplateUI(template);

  // Each template keeps its own separate set of uploaded photos, so a
  // full re-render (not just the newly-selected template's view) is what
  // refreshes the sidebar upload slots to show THIS template's photos
  // instead of whichever template was active before.
  renderShowcase();
  persistNow();
});

// ---- Background chooser ----
// Toggles a class on #showcase between the default pure-white card and
// the uploaded texture background. Works identically across all three
// templates and every composition size since they all share the same
// #showcase element (see css/composition.css .bg-texture rule).
function applyBackgroundUI(bg) {
  document.querySelectorAll('#bgRow .bg-btn').forEach(b => b.classList.toggle('active', b.dataset.bg === bg));
  showcaseEl.classList.toggle('bg-texture', bg === 'texture');
  showcaseEl.classList.toggle('bg-grid', bg === 'grid');
}
(function wireBackground() {
  const row = document.getElementById('bgRow');
  row.addEventListener('click', event => {
    const btn = event.target.closest('.bg-btn');
    if (!btn) return;
    const bg = btn.dataset.bg;
    state.background = bg;
    applyBackgroundUI(bg);
    persistNow();
  });
}());

// ---- Composition chooser ----
// Switches aspect ratio on Template 1's showcase card and adjusts
// Template 2's column proportions. Works independently of the template
// toggle so you can pick a composition first, then flip between T1/T2.
function applyCompositionUI(comp) {
  document.querySelectorAll('#compositionRow .comp-btn').forEach(b => b.classList.toggle('active', b.dataset.comp === comp));
  showcaseEl.setAttribute('data-comp', comp);
}
(function wireComposition() {
  const row = document.getElementById('compositionRow');
  row.addEventListener('click', event => {
    const btn = event.target.closest('.comp-btn');
    if (!btn) return;
    const comp = btn.dataset.comp;
    state.composition = comp;
    applyCompositionUI(comp);
    persistNow();
  });
}());

// ---- Restore a previously-saved session, if there is one ----
// Re-creates fresh blob: object URLs for any restored photo — the File
// itself survives being stored in IndexedDB across a reload, but the old
// blob: URL string doesn't, so every photo needs a new one pointing at
// the same File data.
function reviveBankUrls(bank) {
  if (!bank) return;
  ['top', 'bottom', 'shoes', 'short'].forEach(category => {
    const entry = bank[category];
    if (entry?.file instanceof Blob) entry.url = URL.createObjectURL(entry.file);
  });
  (bank.accessories || []).forEach(entry => {
    if (entry?.file instanceof Blob) entry.url = URL.createObjectURL(entry.file);
  });
}

function applyTagPositions() {
  const classicEl = document.getElementById('classicView');
  const editorialEl = document.getElementById('editorialView');
  [['classic', classicEl], ['editorial', editorialEl]].forEach(([bucketKey, containerEl]) => {
    const p = state.tagPositions[bucketKey];
    ['top', 'bottom', 'shoes'].forEach(key => {
      containerEl.style.setProperty(`--tag-group-x-${key}`, `${p.groupX[key] ?? 0}px`);
      containerEl.style.setProperty(`--tag-group-y-${key}`, `${p.groupY?.[key] ?? 0}px`);
      containerEl.style.setProperty(`--tag-logo-x-${key}`, `${p.logoX ?? 0}px`);
      containerEl.style.setProperty(`--tag-logo-y-${key}`, `${p.logoY ?? 0}px`);
    });
  });
}

async function init() {
  const saved = await loadSnapshot();
  if (saved?.state) {
    const s = saved.state;
    state.banks = s.banks || state.banks;
    state.labelPositions = s.labelPositions || state.labelPositions;
    state.template = s.template || state.template;
    state.composition = s.composition || state.composition;
    state.background = s.background || state.background;
    state.outfitName = s.outfitName ?? state.outfitName;
    state.categoryLabels = s.categoryLabels || state.categoryLabels;
    state.descriptions = s.descriptions || state.descriptions;
    state.visibility = s.visibility || state.visibility;
    // Older saved sessions stored one flat {groupX, logoX, logoY} shared
    // across templates. Migrate that shape into today's per-template
    // {classic:{...}, editorial:{...}} structure — as the classic
    // bucket, since that's what it used to visually apply to — so old
    // sessions still restore instead of throwing on the new lookups.
    if (s.tagPositions?.groupX && !s.tagPositions?.classic) {
      state.tagPositions = { classic: s.tagPositions, editorial: state.tagPositions.editorial };
    } else {
      state.tagPositions = s.tagPositions || state.tagPositions;
    }
    // Sessions saved before the Up/Down "Logo + Text" nudge existed
    // won't have a groupY bucket yet — backfill it so the new buttons'
    // click handlers (which mutate bucket.groupY[key] directly) have
    // something to write into instead of throwing.
    ['classic', 'editorial'].forEach(bucketKey => {
      const bucket = state.tagPositions[bucketKey];
      if (bucket && !bucket.groupY) bucket.groupY = { top: 0, bottom: 0, shoes: 0 };
    });

    reviveBankUrls(state.banks.classic);
    reviveBankUrls(state.banks.list);
    reviveBankUrls(state.banks.editorial);

    outfitName.value = state.outfitName;
    topLabelText.value = state.categoryLabels.top;
    bottomLabelText.value = state.categoryLabels.bottom;
    shoesLabelText.value = state.categoryLabels.shoes;
    topText.value = state.descriptions.top;
    bottomText.value = state.descriptions.bottom;
    shoesText.value = state.descriptions.shoes;

    writeControlGroup(textStyleControls.label, saved.controls?.label);
    writeControlGroup(textStyleControls.desc, saved.controls?.desc);
    writeControlGroup(tagTextControls, saved.controls?.tagText);
    writeControlGroup(tagLogoControls, saved.controls?.tagLogo);
    writeControlGroup(photoOutlineControls, saved.controls?.photoOutline);

    applyTextStyle('label');
    applyTextStyle('desc');
    applyTagTextStyle();
    await applyTagLogoStyle();
    if (saved.controls?.tagComboSize !== undefined) tagComboSizeInput.value = saved.controls.tagComboSize;
    applyTagComboScale();
    applyPhotoOutline();
    applyTagPositions();
    applyTemplateUI(state.template);
    applyBackgroundUI(state.background);
    applyCompositionUI(state.composition);
    document.querySelectorAll('#stageFilters .filter-btn').forEach(btn => {
      btn.classList.toggle('active', state.visibility[btn.dataset.category]);
    });
  }

  syncText();
  renderShowcase();
  setupLabelDragging();

  // Catches photo drag/zoom position changes, which mutate state
  // directly (see js/free-drag.js and js/image-transform.js) without a
  // callback to hook into — a light periodic autosave picks those up
  // too, on top of every explicit persistNow() call above.
  setInterval(persistNow, 2000);

  // Flush immediately (no debounce) right before the tab is hidden/
  // closed/refreshed, so nothing from the last moment is lost.
  const flush = () => saveNow(buildSnapshot);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}

init();

return {};
})();

})();
