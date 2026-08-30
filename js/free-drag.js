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
export function makeFreeDraggable(img, entry, onTap, keys = {}) {
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
