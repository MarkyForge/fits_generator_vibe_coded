import { state, MAX_ACCESSORIES, ACCESSORY_DEFAULT_POSITIONS, GARMENT_DEFAULTS, LIST_GARMENT_DEFAULTS, LIST_ACCESSORY_DEFAULT_POSITIONS, EDITORIAL_GARMENT_DEFAULTS, EDITORIAL_ACCESSORY_DEFAULT_POSITIONS } from './state.js';
import { getCategoryLabel } from './outfit-detector.js';
import { makeFreeDraggable } from './free-drag.js';
import { makeZoomable } from './image-transform.js';
import { labelFromFilename } from './utils.js';
import { removeSingle } from './upload.js';

export function renderShowcase() {
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

export function renderListTemplate() {
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
  makeFreeDraggable(img, product, onTap);
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

export function renderEditorialTemplate() {
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

export function applyVisibility() {
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
export function setupLabelDragging() {
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
