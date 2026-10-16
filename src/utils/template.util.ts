/**
 * Prompt templates use {{variable}} placeholders. Names start with a letter
 * or underscore and contain letters, digits or underscores; surrounding
 * whitespace inside the braces is allowed ({{ topic }}).
 *
 * Mirrored in Frontend/src/lib/template.ts; keep both (and their tests) in sync.
 */
const VARIABLE_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export const MAX_TEMPLATE_VARIABLES = 30;

/** Unique variable names in order of first appearance. */
export const extractTemplateVariables = (text: string): string[] => {
  const seen = new Set<string>();
  for (const match of text.matchAll(VARIABLE_PATTERN)) seen.add(match[1]);
  return [...seen];
};

/**
 * Substitute values for {{variables}}. Unknown placeholders are left as-is
 * and reported in `missing` so callers can reject or warn.
 */
export const renderTemplate = (
  text: string,
  values: Record<string, string>,
): { rendered: string; missing: string[] } => {
  const missing = new Set<string>();
  const rendered = text.replace(VARIABLE_PATTERN, (placeholder, name: string) => {
    if (Object.prototype.hasOwnProperty.call(values, name)) return values[name];
    missing.add(name);
    return placeholder;
  });
  return { rendered, missing: [...missing] };
};
