export function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, character => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[character]);
}

// Turns an uploaded filename like "black-sunglasses_02.jpg" into a readable
// label like "Black Sunglasses 02" — used by the Template 2 (list) showcase
// to auto-generate accessory names when no description was typed.
export function labelFromFilename(name) {
  if (!name) return '';
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}
