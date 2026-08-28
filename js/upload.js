import { state, MAX_ACCESSORIES } from './state.js';

// Every upload targets the CURRENTLY ACTIVE template's own bank
// (state.banks[state.template]) — so a photo added while Template 1 is
// selected only ever shows up on Template 1. Switching templates and
// uploading again fills that template's own, separate slots.
function activeBank() {
  return state.banks[state.template];
}

export async function uploadSingle(category, file, callbacks = {}) {
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

export function loadFromUrl(category, rawUrl, callbacks = {}) {
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

export function addAccessoryFromUrl(rawUrl, callbacks = {}) {
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
export async function setAccessory(index, file, callbacks = {}) {
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

export function removeAccessory(index) {
  const bank = activeBank();
  const removed = bank.accessories[index];
  if (!removed) return;
  bank.accessories[index] = null;
  if (removed.url) URL.revokeObjectURL(removed.url);
}

export function removeSingle(key) {
  const bank = activeBank();
  const removed = bank[key];
  if (!removed) return;
  bank[key] = null;
  if (removed.url?.startsWith('blob:')) URL.revokeObjectURL(removed.url);
}

export function resetAll() {
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
