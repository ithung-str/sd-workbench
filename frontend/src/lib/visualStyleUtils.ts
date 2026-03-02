import type { CSSProperties } from 'react';
import type { DiagramStyleDefaults, VisualStyle } from '../types/model';

/**
 * Convert an imported VisualStyle to React inline CSS properties.
 * Returns undefined when no style is set, so existing CSS classes keep working.
 */
export function visualStyleToCss(style?: VisualStyle): CSSProperties | undefined {
  if (!style) return undefined;

  const css: CSSProperties = {};

  if (style.fill) css.backgroundColor = style.fill;
  if (style.stroke) css.borderColor = style.stroke;
  if (style.stroke_width != null) css.borderWidth = `${style.stroke_width}px`;
  if (style.opacity != null) css.opacity = style.opacity;
  if (style.text_color) css.color = style.text_color;
  if (style.font_family) css.fontFamily = style.font_family;
  if (style.font_size) css.fontSize = `${style.font_size}px`;
  if (style.font_weight) css.fontWeight = style.font_weight;
  if (style.text_align) css.textAlign = style.text_align as CSSProperties['textAlign'];

  return Object.keys(css).length > 0 ? css : undefined;
}

/**
 * Resolve a node's effective style by merging global type defaults with node-specific overrides.
 * Node-specific values take priority over global defaults.
 */
export function resolveNodeStyle(
  nodeType: 'stock' | 'flow' | 'aux' | 'lookup',
  globalDefaults?: DiagramStyleDefaults,
  nodeStyle?: VisualStyle,
): VisualStyle | undefined {
  const globalStyle = globalDefaults?.[nodeType];
  if (!globalStyle && !nodeStyle) return undefined;
  if (!globalStyle) return nodeStyle;
  if (!nodeStyle) return globalStyle;
  // Merge: node-specific overrides take priority
  const merged: VisualStyle = { ...globalStyle };
  for (const [key, value] of Object.entries(nodeStyle)) {
    if (value != null) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}
