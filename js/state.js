export const MAX_ACCESSORIES = 6;
// Default spot each accessory slot starts at on the live-preview stage
// (percent of stage width/height, top-left anchored). Once a person drags
// an accessory, its own left/top is saved on the accessory entry instead.
export const ACCESSORY_DEFAULT_POSITIONS = [
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
export const GARMENT_DEFAULTS = {
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
export const LIST_GARMENT_DEFAULTS = {
  top:    { left: 52, top: 4,  width: 40 },
  bottom: { left: 46, top: 24, width: 46 },
  short:  { left: 46, top: 24, width: 46 },
  shoes:  { left: 58, top: 46, width: 22 }
};
export const LIST_ACCESSORY_DEFAULT_POSITIONS = [
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
export const EDITORIAL_GARMENT_DEFAULTS = {
  top:    { left: 14, top: 2,  width: 70 },
  bottom: { left: 20, top: 33, width: 68 },
  short:  { left: 20, top: 33, width: 68 },
  shoes:  { left: 2,  top: 68, width: 34 }
};
export const EDITORIAL_ACCESSORY_DEFAULT_POSITIONS = [
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

export const state = {
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
