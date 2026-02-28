export type VensimPresetDescriptor = {
  id: string;
  filename: string;
  label: string;
  source: string;
  features: string[];
};

function toId(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/\.mdl$/i, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function detectFeatures(source: string): string[] {
  const out: string[] = [];
  const upper = source.toUpperCase();
  if (upper.includes('INTEG(')) out.push('stocks');
  if (upper.includes('WITH LOOKUP')) out.push('lookup');
  if (upper.includes('GAME(')) out.push('policy');
  if (upper.includes('RANDOM ')) out.push('stochastic');
  if (upper.includes('IF THEN ELSE(')) out.push('conditionals');
  if (upper.includes('SWITCH TIME')) out.push('switch-time');
  return out;
}

const modules = import.meta.glob('../../models/*.mdl', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const presets = Object.entries(modules)
  .map(([path, source]) => {
    const filename = path.split('/').pop() ?? path;
    return {
      id: `mdl_${toId(filename)}`,
      filename,
      label: filename.replace(/\.mdl$/i, ''),
      source,
      features: detectFeatures(source),
    } satisfies VensimPresetDescriptor;
  })
  .sort((a, b) => a.label.localeCompare(b.label));

export const vensimPresets: VensimPresetDescriptor[] = presets;
