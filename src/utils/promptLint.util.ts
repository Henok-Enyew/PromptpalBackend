/**
 * Deterministic prompt lint checks.
 *
 * These are pattern checks ("does the prompt state an output format?"), not
 * a quality score. Each check passes or fails with a hint; the optimizer
 * reports them for the original and the rewritten prompt so users can see
 * what changed, without a made-up before/after number.
 */
import { extractTemplateVariables } from './template.util.js';

export type MediaType = 'text' | 'image' | 'video' | 'audio';

export interface LintCheck {
  id: string;
  label: string;
  passed: boolean;
  hint: string;
}

type Rule = { id: string; label: string; hint: string; test: (text: string) => boolean };

const has = (re: RegExp) => (text: string) => re.test(text);

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const COMMON: Rule[] = [
  {
    id: 'length',
    label: 'Enough detail',
    hint: 'Very short prompts leave the model guessing. Say what you want, for whom, and in what form.',
    test: (text) => wordCount(text) >= 8,
  },
  {
    id: 'constraints',
    label: 'States constraints',
    hint: 'Add explicit limits or rules (length, what to avoid, what must be included).',
    test: has(/\b(must|should|never|always|avoid|only|do not|don't|limit|at most|no more than|under \d+|maximum|minimum|at least|exactly)\b/i),
  },
];

const TEXT: Rule[] = [
  {
    id: 'role',
    label: 'Defines a role',
    hint: 'Tell the model who it is acting as, e.g. "You are a senior data analyst".',
    test: has(/\b(you are|act as|acting as|as an? [a-z]+ (expert|engineer|writer|analyst|developer|teacher|editor|assistant|specialist|consultant)|your role)\b/i),
  },
  {
    id: 'task',
    label: 'Clear task verb',
    hint: 'Start the instruction with a concrete verb: summarize, write, list, classify, explain.',
    test: has(/\b(write|summari[sz]e|explain|list|create|generate|draft|translate|classify|extract|review|analy[sz]e|compare|rewrite|describe|answer|outline|design|plan|convert|identify|evaluate|suggest|build)\b/i),
  },
  {
    id: 'format',
    label: 'Specifies output format',
    hint: 'Say what the answer should look like: bullet list, JSON, a table, N sentences, a word limit.',
    test: has(/\b(format|json|yaml|xml|csv|markdown|table|bullet|bulleted|numbered|list|paragraphs?|sentences?|words|headings?|sections?|code block|one line|steps)\b/i),
  },
  {
    id: 'context',
    label: 'Gives context or audience',
    hint: 'Explain the situation, goal or audience so the model can pitch the answer correctly.',
    test: has(/\b(context|background|audience|for (a|an|the|my|our) |reader|beginner|expert|customers?|users?|team|goal|purpose|because|so that|in order to)\b/i),
  },
  {
    id: 'delimiters',
    label: 'Separates input from instructions',
    hint: 'Wrap pasted input in tags or a placeholder, e.g. <document>{{text}}</document>, so it is not read as instructions.',
    test: (text) => extractTemplateVariables(text).length > 0 || /<[a-z_][\w-]*>[\s\S]*<\/[a-z_][\w-]*>|```|"""/i.test(text),
  },
];

const IMAGE: Rule[] = [
  {
    id: 'subject',
    label: 'Describes the subject',
    hint: 'Name the main subject and its key details.',
    test: (text) => wordCount(text) >= 4,
  },
  {
    id: 'style',
    label: 'Sets a style',
    hint: 'Name a medium or style: photograph, watercolor, 3D render, flat illustration.',
    test: has(/\b(style|photo|photograph|photorealistic|realistic|illustration|watercolou?r|oil painting|painting|sketch|3d|render|cartoon|anime|minimalist|cinematic|vector|pixel art|digital art)\b/i),
  },
  {
    id: 'composition',
    label: 'Mentions composition',
    hint: 'Say how it is framed: close-up, wide shot, centered, from above.',
    test: has(/\b(close-?up|wide|shot|angle|centered|centred|framing|composition|portrait|landscape|aerial|overhead|from above|rule of thirds|full body|foreground|background)\b/i),
  },
  {
    id: 'lighting',
    label: 'Mentions lighting',
    hint: 'Describe light: soft daylight, golden hour, studio lighting, neon.',
    test: has(/\b(light|lighting|lit|sunlight|daylight|golden hour|shadow|shadows|neon|backlit|studio|dramatic|soft)\b/i),
  },
  {
    id: 'output-specs',
    label: 'Gives output specs',
    hint: 'Add aspect ratio, resolution or detail level if it matters.',
    test: has(/\b(aspect ratio|\d+:\d+|resolution|4k|8k|hd|high detail|highly detailed|sharp|square|vertical|horizontal)\b/i),
  },
];

const AV: Rule[] = [
  {
    id: 'duration',
    label: 'States duration',
    hint: 'Give a target length, e.g. "30 seconds".',
    test: has(/\b(\d+\s*(s|sec|secs|seconds?|min|mins|minutes?)|duration|length|short|long)\b/i),
  },
  {
    id: 'style',
    label: 'Sets a style or mood',
    hint: 'Describe the style, genre or mood.',
    test: has(/\b(style|genre|mood|tone|cinematic|upbeat|calm|dramatic|ambient|documentary|animated|lo-?fi|energetic|tempo|bpm)\b/i),
  },
  {
    id: 'technical',
    label: 'Gives technical specs',
    hint: 'Add specs that matter: resolution, frame rate, camera movement, instruments, voice.',
    test: has(/\b(\d+\s*fps|frame rate|resolution|1080p|4k|camera|pan|zoom|tracking shot|instrument|vocals?|voice|narrat|bpm|stereo|tempo)\b/i),
  },
];

const RULES: Record<MediaType, Rule[]> = {
  text: [...TEXT, ...COMMON],
  image: [...IMAGE, ...COMMON],
  video: [...AV, ...COMMON],
  audio: [...AV, ...COMMON],
};

export const lintPrompt = (text: string, mediaType: MediaType): LintCheck[] =>
  RULES[mediaType].map(({ id, label, hint, test }) => ({ id, label, hint, passed: test(text) }));
