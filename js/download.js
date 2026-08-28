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

export async function downloadShowcase(callbacks = {}) {
  callbacks.onStart?.();
  let restoreOutline = () => {};
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
