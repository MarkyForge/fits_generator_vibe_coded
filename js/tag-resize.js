// Tap-to-resize for the "Showcase" tag (logo icon + wordmark) directly on
// the live preview — same interaction pattern as the photo zoom panel in
// image-transform.js, but with two sliders (logo size, text size) instead
// of a single scale.
//
// The tag markup (.showcase-tag) is identical across Template 1, 2 and 3,
// and its size is driven by two CSS custom properties set once on the
// shared #showcase root (--tag-logo-size / --tag-text-size), so opening
// the panel from ANY tag on ANY template resizes it everywhere at once —
// same behavior as the existing side-panel number inputs this reuses.

let panelEl = null;
let activeTag = null;

function ensurePanel(logoInput, textInput, onChange) {
  if (panelEl) return panelEl;

  panelEl = document.createElement('div');
  panelEl.className = 'zoom-panel tag-resize-panel is-hidden';
  panelEl.innerHTML = `
    <div class="tag-resize-row">
      <span class="tag-resize-label">Logo</span>
      <input type="range" class="zoom-range tag-resize-logo" min="${logoInput.min}" max="${logoInput.max}" value="${logoInput.value}" aria-label="Logo size">
    </div>
    <div class="tag-resize-row">
      <span class="tag-resize-label">Text</span>
      <input type="range" class="zoom-range tag-resize-text" min="${textInput.min}" max="${textInput.max}" value="${textInput.value}" aria-label="Text size">
    </div>
  `;
  document.body.appendChild(panelEl);

  const logoRange = panelEl.querySelector('.tag-resize-logo');
  const textRange = panelEl.querySelector('.tag-resize-text');

  logoRange.addEventListener('input', () => {
    logoInput.value = logoRange.value;
    onChange('logo');
  });
  textRange.addEventListener('input', () => {
    textInput.value = textRange.value;
    onChange('text');
  });

  // Keep the panel's sliders in sync if the size is changed from the
  // side-panel number inputs while this panel happens to be open.
  logoInput.addEventListener('input', () => { logoRange.value = logoInput.value; });
  textInput.addEventListener('input', () => { textRange.value = textInput.value; });

  panelEl.addEventListener('pointerdown', event => event.stopPropagation());
  document.addEventListener('pointerdown', event => {
    if (!activeTag) return;
    if (activeTag.contains(event.target) || panelEl.contains(event.target)) return;
    closePanel();
  });
  window.addEventListener('scroll', () => closePanel(), true);
  window.addEventListener('resize', () => {
    if (activeTag) positionPanel(panelEl, activeTag);
  });

  return panelEl;
}

// Same "dock just under, flush with one side, stay on-screen" placement
// used by the photo ratio panel.
function positionPanel(panel, tag) {
  const rect = tag.getBoundingClientRect();
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

function closePanel() {
  if (activeTag) activeTag.classList.remove('is-resize-active');
  activeTag = null;
  panelEl?.classList.add('is-hidden');
}

// logoInput / textInput are the existing side-panel number inputs
// (tagLogoControls.size / tagTextControls.size) — this panel reads and
// writes them directly and fires their native 'input' event so the
// existing applyTagLogoStyle/applyTagTextStyle + persistNow wiring in
// app.js runs unchanged.
export function initTagResize(logoInput, textInput) {
  function onChange(which) {
    const input = which === 'logo' ? logoInput : textInput;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  document.addEventListener('click', event => {
    const btn = event.target.closest('.tag-resize-btn');
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    const tag = btn.closest('.showcase-tag');
    if (!tag) return;

    const panel = ensurePanel(logoInput, textInput, onChange);
    if (activeTag === tag) {
      closePanel();
      return;
    }
    if (activeTag) activeTag.classList.remove('is-resize-active');
    activeTag = tag;
    tag.classList.add('is-resize-active');
    panel.querySelector('.tag-resize-logo').value = logoInput.value;
    panel.querySelector('.tag-resize-text').value = textInput.value;
    panel.classList.remove('is-hidden');
    positionPanel(panel, btn);
  });
}
