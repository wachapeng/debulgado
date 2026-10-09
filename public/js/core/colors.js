// Category colors: the edge of each product card shows its category's color.
// Chosen to stay clear on both the light and the dark theme, and distinct from each other.
export const PALETTE = [
  { hex: '#a0643c', name: 'Coffee' },
  { hex: '#2e8b7a', name: 'Teal' },
  { hex: '#d9822b', name: 'Orange' },
  { hex: '#c2453e', name: 'Red' },
  { hex: '#4f8f3a', name: 'Green' },
  { hex: '#7b5bb5', name: 'Purple' },
  { hex: '#3a72c0', name: 'Blue' },
  { hex: '#c4568f', name: 'Pink' },
  { hex: '#b38f1d', name: 'Gold' },
  { hex: '#5f7482', name: 'Slate' },
];

/** The category's own color, or one from the palette by its place in the list. */
export function categoryColor(category, index = 0) {
  if (category?.color && /^#[0-9a-f]{6}$/i.test(category.color)) return category.color;
  return PALETTE[Math.max(0, index) % PALETTE.length].hex;
}
