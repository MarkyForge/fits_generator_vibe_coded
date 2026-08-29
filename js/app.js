import { state, MAX_ACCESSORIES } from './state.js';
import { uploadSingle, setAccessory, removeAccessory, resetAll } from './upload.js';
import { renderShowcase, applyVisibility, renderListTemplate, renderEditorialTemplate, setupLabelDragging } from './outfit-renderer.js';
import { copyPrompt } from './prompt.js';
import { downloadShowcase } from './download.js';
import { loadSnapshot, scheduleSave, saveNow, clearSnapshot } from './persist.js';

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
  state.categoryLabels.top = topLabelText.value || 'TOP';
  state.categoryLabels.bottom = bottomLabelText.value || 'BOTTOM';
  state.categoryLabels.shoes = shoesLabelText.value || 'SHOES';
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

  document.getElementById('labelTop').textContent = topText.value || 'Top';
  document.getElementById('labelBottom').textContent = bottomText.value || 'Bottom';
  document.getElementById('labelShoes').textContent = shoesText.value || 'Shoes';
  document.getElementById('edLabelTop').textContent = topText.value || 'Top';
  document.getElementById('edLabelBottom').textContent = bottomText.value || 'Bottom';

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
