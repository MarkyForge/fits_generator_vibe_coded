export function getCategoryLabel(category) {
  return ({ top: 'TOP', bottom: 'BOTTOM', shoes: 'SHOES', accessory: 'ACCESSORY' })[category] || 'PRODUCT';
}
