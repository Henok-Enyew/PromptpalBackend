/**
 * Escape a user-supplied string so it can be embedded in a RegExp / Mongo
 * `$regex` and only ever match literally (prevents regex injection / ReDoS).
 */
export const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive literal "contains" match for Mongo queries. */
export const literalRegex = (value: string) => ({
  $regex: escapeRegex(value),
  $options: 'i',
});
