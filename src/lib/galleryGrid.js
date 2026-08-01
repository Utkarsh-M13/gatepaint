// Pure math for the gallery's adaptive thumbnail grid: given the pixel area
// available for the grid and a target per-thumbnail footprint (image, name
// label, and its share of the grid gap all folded together), work out how
// many columns and rows fit. No React, no DOM, easy to unit test.

// How many whole cells of size cellW x cellH fit into availW x availH.
// Always at least 1x1 so a page never shows nothing, even in a cramped panel.
export function computeGridCapacity(availW, availH, cellW, cellH) {
  const cols = Math.max(1, Math.floor(availW / cellW));
  const rows = Math.max(1, Math.floor(availH / cellH));
  return { cols, rows };
}
