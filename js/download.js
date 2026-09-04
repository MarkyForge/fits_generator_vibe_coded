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
  // Belt-and-suspenders: also blank the inline aspect-ratio (there
  // isn't one set inline today, but this keeps the explicit height
  // from ever being second-guessed) so the pixel box above is the
  // only thing determining size during capture.
  showcase.style.aspectRatio = 'none';

  return () => {
    showcase.style.width = originalWidth;
    showcase.style.height = originalHeight;
    showcase.style.aspectRatio = originalAspectRatio;
  };
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
    // already-scaled box, throwing off any accessory (e.g. a watch) that
    // was resized with the ratio panel.
    img.style.transform = 'none';
    img.style.left = `${(boxRect.left - stageRect.left) + offsetX}px`;
    img.style.top = `${(boxRect.top - stageRect.top) + offsetY}px`;
    // .accessory-image sets width/height:18%!important in style.css, which
    // beats a plain inline style — so this HAS to be set with 'important'
    // priority, or the box silently stays at 18%x18% and html2canvas
    // stretches the full photo into it (the squash/stretch bug).
    img.style.setProperty('width', `${contentW}px`, 'important');
    img.style.setProperty('height', `${contentH}px`, 'important');

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
