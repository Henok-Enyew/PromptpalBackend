import DOMPurify from 'isomorphic-dompurify';

/** Strip every HTML tag. For short display fields: titles, names, tags. */
export const sanitizeInput = (dirty: string): string =>
  DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [] });

/** zod transform: trim, then strip HTML tags. */
export const trimAndSanitize = (input: unknown) =>
  typeof input === 'string' ? sanitizeInput(input.trim()) : input;

/**
 * zod transform: trim only. For prompt text, optimizer input and markdown
 * content, which legitimately contain `<tags>` (e.g. XML-structured prompts).
 * These are stored raw and must only ever be rendered as text or as markdown
 * without raw HTML on the frontend.
 */
export const trimOnly = (input: unknown) =>
  typeof input === 'string' ? input.trim() : input;
