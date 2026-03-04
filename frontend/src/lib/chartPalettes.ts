const PALETTES: Record<string, string[]> = {
  default: ['#1b6ca8', '#d46a00', '#2f7d32', '#8a2be2', '#d32f2f', '#00838f', '#c2185b', '#455a64'],
  warm: ['#d32f2f', '#e64a19', '#f57c00', '#ffa000', '#fbc02d', '#afb42b'],
  cool: ['#1565c0', '#0277bd', '#00838f', '#00695c', '#2e7d32', '#558b2f'],
  pastel: ['#90caf9', '#f48fb1', '#ce93d8', '#80cbc4', '#a5d6a7', '#ffe082'],
  vivid: ['#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#00bcd4', '#4caf50'],
};

export function getPalette(name?: string): string[] {
  return PALETTES[name ?? 'default'] ?? PALETTES.default;
}
