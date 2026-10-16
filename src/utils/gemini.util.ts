/**
 * Prompt optimizer LLM helpers.
 * Model calls go through the provider registry in services/llm; this module
 * picks which configured model the optimizer uses and keeps the original
 * string-in/string-out API for the optimizer service.
 */
import config from '../config/env.config.js';
import logger from '../config/logger.config.js';
import { generate, listAvailableModels } from '../services/llm/registry.js';
import type { ProviderId } from '../services/llm/types.js';

export type AIProvider = 'gemini' | 'groq' | 'anthropic';

const temperature = config.gemini.temperature ?? 0.7;
const maxTokens = config.gemini.maxTokens ?? 4000;

const PROVIDER_IDS: Record<AIProvider, ProviderId> = {
  gemini: 'google',
  groq: 'groq',
  anthropic: 'anthropic',
};
const toAIProvider = (id: ProviderId): AIProvider =>
  (Object.keys(PROVIDER_IDS) as AIProvider[]).find((k) => PROVIDER_IDS[k] === id)!;

/**
 * Model the optimizer uses: AI_PROVIDER=groq|gemini|anthropic|auto.
 * `auto` prefers Groq, then Gemini, then Anthropic (cheapest/fastest first).
 */
function resolveOptimizerModel(): { id: string; provider: AIProvider } | null {
  const available = listAvailableModels();
  const preferred = config.aiProvider.toLowerCase() as AIProvider | 'auto';
  const order: ProviderId[] =
    preferred in PROVIDER_IDS
      ? [PROVIDER_IDS[preferred as AIProvider], 'groq', 'google', 'anthropic']
      : ['groq', 'google', 'anthropic'];
  for (const providerId of order) {
    const model = available.find((m) => m.provider === providerId);
    if (model) return { id: model.id, provider: toAIProvider(model.provider) };
  }
  return null;
}

/** Log which optimizer model is active (called once at startup). */
export function initializeGemini() {
  const active = resolveOptimizerModel();
  if (active) {
    logger.info(`Optimizer AI model: ${active.id}`);
  } else {
    logger.warn('No AI provider configured. Set GROQ_API_KEY, GOOGLE_AI_API_KEY or ANTHROPIC_API_KEY.');
  }
}

/** True when any AI provider is configured. */
export function isGeminiAvailable(): boolean {
  return resolveOptimizerModel() !== null;
}

export function getActiveAIProvider(): AIProvider | null {
  return resolveOptimizerModel()?.provider ?? null;
}

/**
 * Generate text with the optimizer's model. Retries transient failures;
 * errors carry user-safe messages (rate limit, auth, unavailable).
 */
export async function generateContent(prompt: string, maxRetries: number = 3): Promise<string> {
  const active = resolveOptimizerModel();
  if (!active) {
    throw new Error('No AI provider is configured. Please set GROQ_API_KEY, GOOGLE_AI_API_KEY or ANTHROPIC_API_KEY.');
  }
  logger.debug({ model: active.id }, 'Generating content with AI provider');
  const result = await generate(active.id, { prompt, temperature, maxTokens, attempts: maxRetries });
  if (result.truncated) {
    logger.warn({ model: active.id, responseLength: result.text.length }, 'AI response may be truncated (token limit)');
  }
  return result.text;
}

/**
 * Generate questions for prompt optimization with model-specific support
 */
export async function generateQuestions(
  prompt: string,
  mediaType: 'text' | 'image' | 'video' | 'audio',
  targetModel: string,
): Promise<any> {
  // Get model-specific guidance
  const modelGuidance = getModelSpecificGuidance(targetModel, mediaType);

  const systemPrompt = `You are a prompt optimization expert. Analyze this prompt and generate comprehensive questions (5-10 questions, up to 10 for complex prompts) to help create a premium, high-quality optimized prompt.

Original prompt: "${prompt}"
Media type: ${mediaType}
Target model: ${targetModel}

${modelGuidance}

Based on prompt engineering best practices for ${targetModel}, identify ALL missing elements that would significantly improve this prompt. For premium optimization, we need comprehensive details covering all aspects.

IMPORTANT: Generate 5-10 questions (closer to 10 for simple/vague prompts like this one, fewer for already detailed prompts). The goal is to gather enough information to create a truly premium, detailed prompt.

Each question should:
1. Address a critical missing element (style, composition, quality, details, context, lighting, mood, setting, etc.)
2. Have clear, simple options with good defaults
3. Include a sensible default value
4. Be optional (user can skip)
5. Include an "Other" option with text input capability for flexibility
6. Cover different aspects: style, composition, quality, details, setting, mood, lighting, camera angle, aspect ratio, color palette, etc.

For image generation prompts, ensure you cover: style, subject details, composition, lighting, mood/atmosphere, background/setting, quality indicators, color palette, camera angle/perspective, and any model-specific requirements.

Return your response as valid JSON in this exact format:
{
  "questions": [
    {
      "id": "style",
      "question": "What style do you prefer?",
      "type": "select_or_text",
      "priority": "high",
      "options": [
        {"value": "photorealistic", "label": "Photorealistic"},
        {"value": "cartoon", "label": "Cartoon/Illustration"},
        {"value": "custom", "label": "Other (describe)", "allowsTextInput": true},
        {"value": "no_preference", "label": "No preference"}
      ],
      "default": "photorealistic",
      "required": false
    }
  ],
  "additionalDetailsField": {
    "question": "Any additional details you'd like to include?",
    "type": "textarea",
    "placeholder": "E.g., colors, moods, specific details, references - Add anything else you want!",
    "required": false
  }
}

Only return the JSON, no other text.`;

  try {
    logger.info('Calling Gemini API for question generation');
    const response = await generateContent(systemPrompt);
    
    logger.info(
      {
        responseLength: response.length,
        responsePreview: response.substring(0, 200),
      },
      'Received response from Gemini for questions',
    );
    
    // Parse JSON with robust error handling (same as quick optimize)
    let parsed: any;
    try {
      parsed = parseJSONResponse(response);
      logger.info('Successfully parsed JSON response from Gemini for questions');
    } catch (parseError: any) {
      logger.error(
        {
          parseError: parseError.message,
          responsePreview: response.substring(0, 500),
          responseLength: response.length,
        },
        'Failed to parse Gemini JSON response for questions',
      );
      throw new Error(`Failed to parse AI response: ${parseError.message}`);
    }
    
    // Validate the response structure
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      logger.error(
        {
          parsedKeys: Object.keys(parsed),
          questionsType: typeof parsed.questions,
          questionsValue: parsed.questions,
        },
        'Invalid response structure: missing or invalid questions array',
      );
      throw new Error('Invalid response: missing questions array');
    }
    
    // Validate questions structure
    for (const question of parsed.questions) {
      if (!question.id || !question.question || !question.type) {
        logger.error(
          {
            question,
          },
          'Invalid question structure',
        );
        throw new Error('Invalid response: questions must have id, question, and type fields');
      }
    }
    
    // Ensure additionalDetailsField exists
    if (!parsed.additionalDetailsField) {
      logger.warn('Response missing additionalDetailsField, adding default');
      parsed.additionalDetailsField = {
        question: 'Any additional details you\'d like to include?',
        type: 'textarea',
        placeholder: 'E.g., colors, moods, specific details, references - Add anything else you want!',
        required: false,
      };
    }
    
    logger.info(
      {
        questionsCount: parsed.questions.length,
        hasAdditionalDetails: !!parsed.additionalDetailsField,
      },
      'Successfully processed AI question generation result',
    );
    
    return parsed;
  } catch (error: any) {
    logger.error(
      {
        errorMessage: error.message,
        errorStack: error.stack,
        originalPrompt: prompt.substring(0, 100),
        targetModel,
        mediaType,
      },
      'Failed to generate questions with AI',
    );
    throw new Error(`AI question generation failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Parse free-form user input to extract structured information with enhanced AI parsing
 */
export async function parseFreeFormInput(
  freeText: string,
  mediaType?: 'text' | 'image' | 'video' | 'audio',
): Promise<any> {
  const mediaContext = mediaType
    ? `Media type: ${mediaType}. Focus on ${mediaType}-specific details.`
    : '';

  const prompt = `You are an expert at parsing user input for prompt optimization. Extract structured information from this user input: "${freeText}"

${mediaContext}

Extract and categorize:
- Style/artistic direction (photorealistic, cartoon, artistic, etc.)
- Colors/color palette (specific colors, warm/cool tones, etc.)
- Lighting conditions (natural, studio, golden hour, etc.)
- Mood/atmosphere (cozy, dramatic, peaceful, etc.)
- Specific details (breed, pose, accessories, etc.)
- Setting/background (indoor, outdoor, specific locations, etc.)
- Composition elements (centered, rule of thirds, close-up, etc.)
- Quality indicators (high-resolution, professional, etc.)
- Any other relevant characteristics

IMPORTANT: Only extract what is explicitly mentioned. Do not infer or add details.

Return as valid JSON with these categories. If something doesn't fit a category, include it in "other".

Format:
{
  "style": "...",
  "colors": "...",
  "lighting": "...",
  "mood": "...",
  "details": "...",
  "background": "...",
  "composition": "...",
  "quality": "...",
  "other": "..."
}

Only return the JSON, no other text.`;

  const response = await generateContent(prompt);
  
  try {
    const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanedResponse);
    
    // Validate and clean the parsed data
    return validateParsedInput(parsed, freeText);
  } catch (parseError) {
    logger.error(parseError, 'Failed to parse free-form input');
    // Return a basic structure if parsing fails
    return {
      other: freeText,
    };
  }
}

/**
 * Validate and clean parsed input
 */
function validateParsedInput(parsed: any, originalText: string): any {
  const validated: any = {
    style: parsed.style || '',
    colors: parsed.colors || '',
    lighting: parsed.lighting || '',
    mood: parsed.mood || '',
    details: parsed.details || '',
    background: parsed.background || '',
    composition: parsed.composition || '',
    quality: parsed.quality || '',
    other: parsed.other || '',
  };

  // Remove empty strings and keep only meaningful data
  Object.keys(validated).forEach((key) => {
    if (!validated[key] || validated[key].trim() === '') {
      delete validated[key];
    }
  });

  // If nothing was extracted, put everything in "other"
  if (Object.keys(validated).length === 0) {
    validated.other = originalText;
  }

  return validated;
}

/**
 * Build optimized prompt from user answers with intent preservation
 */
export async function buildOptimizedPrompt(
  originalPrompt: string,
  answers: Record<string, any>,
  additionalDetails: string | undefined,
  targetModel: string,
): Promise<string> {
  // Extract what user actually specified to reinforce intent preservation
  const userSpecified = extractUserSpecifiedInfo(originalPrompt, answers, additionalDetails);

  const prompt = `You are a prompt optimization expert. Build a premium optimized prompt from the following information using advanced prompt engineering techniques.

Original prompt: "${originalPrompt}"
User Answers: ${JSON.stringify(answers)}
Additional Details: "${additionalDetails || 'None'}"
Target Model: ${targetModel}

USER SPECIFIED DETAILS (ONLY USE THESE):
${userSpecified}

ADVANCED PROMPT ENGINEERING TECHNIQUES (Apply these to create a high-quality prompt):
1. **Action-Oriented Language**: Start with strong action verbs (Act as, Generate, Create, Write, Design, Build)
2. **Role-Playing**: Explicitly define roles when appropriate (e.g., "Act as a historian", "Act as a developer")
3. **Output Format Specification**: Clearly state the expected output format (e.g., "Generate a single paragraph", "Create an image")
4. **Strong Verbs**: Use powerful, specific verbs (Generate, Prioritize, Maintain, Ensure, Specify)
5. **Remove Redundancy**: Consolidate repetitive phrases and remove unnecessary words
6. **Better Structure**: Organize as Subject → Action → Object → Context → Constraints
7. **Specific Constraints**: Use clear prioritization (e.g., "Prioritize X over Y", "Focus on A rather than B")
8. **Clear Instructions**: Make instructions direct, actionable, and unambiguous
9. **Grammar & Clarity**: Fix all grammar errors, improve clarity, use proper punctuation
10. **Concise Language**: Remove filler words, be direct and specific

CRITICAL RULES - INTENT PRESERVATION:
1. ONLY use information the user provided (original prompt + answers + additional details)
2. DO NOT add creative details (colors, backgrounds, styles, moods) NOT in the "USER SPECIFIED DETAILS" above
3. DO NOT assume preferences - if user didn't specify something, don't add it
4. DO NOT add backgrounds, settings, or environments not mentioned by the user
5. DO NOT add moods, emotions, or atmospheres not specified
6. Maintain the user's original intent and simplicity level - if they wanted simple, keep it simple
7. Structure the prompt for ${targetModel} best practices
8. Combine all user inputs intelligently
9. Apply advanced prompt engineering techniques while preserving intent

VALIDATION CHECKLIST:
- Every color mentioned must be in USER SPECIFIED DETAILS
- Every style mentioned must be in USER SPECIFIED DETAILS  
- Every background mentioned must be in USER SPECIFIED DETAILS
- Every mood mentioned must be in USER SPECIFIED DETAILS

OUTPUT REQUIREMENTS:
- Use action-oriented language (start with verbs like "Act as", "Generate", "Create")
- Specify output format clearly
- Use strong, specific verbs throughout
- Remove redundancy and improve clarity
- Structure the prompt professionally
- Make it concise but complete
- Ensure proper punctuation and grammar

Return ONLY the optimized prompt text, nothing else. No explanations, no JSON, just the final optimized prompt ready to use.`;

  const response = await generateContent(prompt);
  return response.trim();
}

/**
 * Extract user-specified information to reinforce intent preservation
 */
function extractUserSpecifiedInfo(
  originalPrompt: string,
  answers: Record<string, any>,
  additionalDetails?: string,
): string {
  const parts: string[] = [];
  
  parts.push(`Original prompt: "${originalPrompt}"`);
  
  if (answers && Object.keys(answers).length > 0) {
    const answerList = Object.entries(answers)
      .map(([key, value]: [string, any]) => {
        if (value && typeof value === 'object') {
          const val = value.customText || value.value || '';
          if (val && val !== 'no_preference' && val !== 'default' && val !== 'skipped') {
            return `${key}: ${val}`;
          }
        }
        return null;
      })
      .filter(Boolean)
      .join(', ');
    
    if (answerList) {
      parts.push(`User answers: ${answerList}`);
    }
  }
  
  if (additionalDetails && additionalDetails.trim()) {
    parts.push(`Additional details: "${additionalDetails.trim()}"`);
  }
  
  return parts.join('\n') || 'No additional user specifications beyond original prompt.';
}

/**
 * Get model-specific guidance for question generation
 */
function getModelSpecificGuidance(
  targetModel: string,
  mediaType: string,
): string {
  const modelLower = targetModel.toLowerCase();

  // Image generation models
  if (mediaType === 'image') {
    if (modelLower.includes('dall-e') || modelLower.includes('dalle')) {
      return `DALL-E specific guidance:
- Focus on clear, descriptive language
- DALL-E works best with comma-separated descriptors
- Include style, composition, and quality indicators
- Consider aspect ratio and detail level`;
    } else if (modelLower.includes('midjourney')) {
      return `Midjourney specific guidance:
- Focus on artistic style and composition
- Consider aspect ratios and quality parameters
- Include style modifiers and artistic references
- Think about lighting and mood`;
    } else if (modelLower.includes('stable diffusion')) {
      return `Stable Diffusion specific guidance:
- Include quality tags and style modifiers
- Consider negative prompts (what to avoid)
- Focus on technical parameters and style
- Include composition and framing details`;
    }
  }

  // Text generation models
  if (mediaType === 'text') {
    if (modelLower.includes('gpt') || modelLower.includes('chatgpt')) {
      return `GPT specific guidance:
- Focus on role, context, and output format
- Include examples when helpful
- Specify tone and style preferences
- Consider token limits and response length`;
    } else if (modelLower.includes('claude')) {
      return `Claude specific guidance:
- Emphasize clarity and structure
- Include context and constraints
- Specify output format and style
- Consider conversation context if applicable`;
    }
  }

  // Default guidance
  return `General guidance:
- Focus on clarity, specificity, and structure
- Include relevant context and constraints
- Consider output format and quality requirements`;
}

/**
 * Get media-specific prompt engineering guidance
 */
function getMediaSpecificPromptGuidance(
  mediaType: 'text' | 'image' | 'video' | 'audio',
  targetModel: string,
): string {
  if (mediaType === 'text') {
    return `TEXT PROMPT OPTIMIZATION GUIDANCE:
- Add role/context when appropriate (e.g., "Act as a [role]", "You are a [expert]")
- Specify output format (paragraph, list, structured, code, JSON, etc.)
- Include tone and style specifications (professional, casual, technical, creative)
- Add constraints and guidelines when relevant
- Include examples or few-shot patterns if the prompt benefits from them
- Specify length requirements if implied (short, detailed, comprehensive)
- Add chain-of-thought reasoning if the task requires step-by-step thinking`;
  } else if (mediaType === 'image') {
    return `IMAGE PROMPT OPTIMIZATION GUIDANCE:
- Include technical specifications (resolution, aspect ratio, quality)
- Add style modifiers and artistic direction
- Specify composition rules (rule of thirds, centered, etc.)
- Include lighting and mood specifications if relevant
- Add quality indicators (high-resolution, professional, detailed)
- Format for ${targetModel} best practices (comma-separated for DALL-E, style tags for Midjourney)`;
  } else if (mediaType === 'video' || mediaType === 'audio') {
    return `${mediaType.toUpperCase()} PROMPT OPTIMIZATION GUIDANCE:
- Specify duration and pacing
- Include technical specs (fps, resolution, bitrate, format)
- Add style and mood specifications
- Include composition and framing for video
- Add quality and format requirements`;
  }
  return '';
}

/**
 * Parse JSON response from AI with robust error handling
 * Handles malformed JSON, unescaped quotes, and other common issues
 */
function parseJSONResponse(response: string): any {
  // Step 1: Remove markdown code blocks
  let cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  // Step 2: Extract JSON object (handle text before/after)
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  
  // Step 3: Try direct parsing first
  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    // Step 4: Try to repair common JSON issues
    try {
      // Fix unescaped quotes in string values using a more robust approach
      let fixed = cleaned;
      
      // Find all string values and fix unescaped quotes
      // This regex matches: "key": "value" where value may contain unescaped quotes
      fixed = fixed.replace(/"([^"]+)":\s*"([^"]*)"([,}\]]|$)/g, (match, key, value, ending) => {
        // If value contains unescaped quotes, escape them
        if (value.includes('"') && !value.includes('\\"')) {
          const escapedValue = value.replace(/"/g, '\\"');
          return `"${key}": "${escapedValue}"${ending}`;
        }
        return match;
      });
      
      // Try parsing the fixed version
      return JSON.parse(fixed);
    } catch (secondError) {
      // Step 5: Manual extraction as last resort
      try {
        const result: any = {};
        
        // Extract optimizedPrompt - handle escaped and unescaped quotes, and incomplete/truncated strings
        // First try standard format with escaped quotes
        let optimizedMatch = cleaned.match(/"optimizedPrompt"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        
        if (!optimizedMatch) {
          // Try with unescaped quotes (handle malformed JSON)
          optimizedMatch = cleaned.match(/"optimizedPrompt"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
        }
        
        if (!optimizedMatch) {
          // More aggressive: find the key and extract everything after the opening quote
          // This handles truncated/incomplete JSON responses
          const keyStart = cleaned.indexOf('"optimizedPrompt"');
          if (keyStart !== -1) {
            const colonIndex = cleaned.indexOf(':', keyStart);
            if (colonIndex !== -1) {
              const quoteStart = cleaned.indexOf('"', colonIndex);
              if (quoteStart !== -1) {
                const valueContentStart = quoteStart + 1;
                
                // Try to find the closing quote, but handle truncated responses
                let valueEnd = -1;
                
                // Look for ", (comma after quote) - indicates end of string value
                const commaAfterQuote = cleaned.indexOf('",', valueContentStart);
                if (commaAfterQuote !== -1) {
                  valueEnd = commaAfterQuote;
                } else {
                  // Look for "} (quote before closing brace)
                  const quoteBeforeBrace = cleaned.indexOf('"}', valueContentStart);
                  if (quoteBeforeBrace !== -1) {
                    valueEnd = quoteBeforeBrace;
                  } else {
                    // Look for just " followed by whitespace and } or ,
                    const nextQuote = cleaned.indexOf('"', valueContentStart + 10);
                    if (nextQuote !== -1) {
                      const afterQuote = cleaned.substring(nextQuote + 1, nextQuote + 10).trim();
                      if (afterQuote.startsWith(',') || afterQuote.startsWith('}')) {
                        valueEnd = nextQuote;
                      }
                    }
                  }
                }
                
                // If we still can't find the end, the response might be truncated
                // In that case, take everything from the opening quote to the end (or next key)
                if (valueEnd === -1) {
                  // Check if there's a next key (like "isValid")
                  const nextKeyPattern = /"isValid"|"validationMessage"|"improvements"|"qualityScore"/;
                  const nextKeyMatch = cleaned.substring(valueContentStart).match(nextKeyPattern);
                  if (nextKeyMatch && nextKeyMatch.index !== undefined) {
                    // Take everything up to the next key
                    valueEnd = valueContentStart + nextKeyMatch.index - 1;
                    // Remove any trailing quote or comma
                    while (valueEnd > valueContentStart && (cleaned[valueEnd] === '"' || cleaned[valueEnd] === ',')) {
                      valueEnd--;
                    }
                  } else {
                    // Last resort: take everything to the end of the string
                    valueEnd = cleaned.length;
                  }
                }
                
                if (valueEnd > valueContentStart) {
                  const extracted = cleaned.substring(valueContentStart, valueEnd);
                  result.optimizedPrompt = extracted
                    .replace(/\\"/g, '"')
                    .replace(/\\n/g, '\n')
                    .replace(/\\\\/g, '\\')
                    .replace(/\\t/g, '\t')
                    .trim();
                }
              }
            }
          }
        } else {
          result.optimizedPrompt = optimizedMatch[1]
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\\\/g, '\\')
            .replace(/\\t/g, '\t');
        }
        
        if (!result.optimizedPrompt || result.optimizedPrompt.length === 0) {
          throw new Error('Could not extract optimizedPrompt');
        }
        
        // Extract isValid
        const isValidMatch = cleaned.match(/"isValid"\s*:\s*(true|false)/);
        result.isValid = isValidMatch ? isValidMatch[1] === 'true' : true;
        
        // Extract validationMessage
        const validationRegex = /"validationMessage"\s*:\s*"((?:[^"\\]|\\.)*)"/;
        const validationMatch = cleaned.match(validationRegex);
        if (validationMatch) {
          result.validationMessage = validationMatch[1]
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\\\/g, '\\');
        }
        
        // Extract improvements array
        const improvementsRegex = /"improvements"\s*:\s*\[(.*?)\]/s;
        const improvementsMatch = cleaned.match(improvementsRegex);
        if (improvementsMatch) {
          try {
            // Try to parse as JSON array
            const arrayStr = '[' + improvementsMatch[1] + ']';
            result.improvements = JSON.parse(arrayStr);
          } catch {
            // Fallback: extract strings manually
            const stringMatches = improvementsMatch[1].match(/"([^"]+)"/g);
            result.improvements = stringMatches 
              ? stringMatches.map((m: string) => m.replace(/^"|"$/g, '').replace(/\\"/g, '"'))
              : [];
          }
        } else {
          result.improvements = [];
        }
        
        // Extract qualityScore
        const qualityScoreMatch = cleaned.match(/"qualityScore"\s*:\s*(\d+)/);
        result.qualityScore = qualityScoreMatch ? parseInt(qualityScoreMatch[1], 10) : 70;
        
        // Validate we have at least optimizedPrompt
        if (!result.optimizedPrompt) {
          throw new Error('Could not extract required fields');
        }
        
        return result;
      } catch (thirdError) {
        logger.error(
          {
            firstError: firstError instanceof Error ? firstError.message : String(firstError),
            secondError: secondError instanceof Error ? secondError.message : String(secondError),
            thirdError: thirdError instanceof Error ? thirdError.message : String(thirdError),
            responsePreview: response.substring(0, 500), // Log first 500 chars
          },
          'Failed to parse JSON response after all attempts',
        );
        throw new Error('Failed to parse AI response as valid JSON');
      }
    }
  }
}

/**
 * Get advanced prompt engineering techniques guidance based on media type
 */
function getAdvancedTechniquesGuidance(mediaType: 'text' | 'image' | 'video' | 'audio'): string {
  if (mediaType === 'text') {
    return `For TEXT prompts, apply these techniques when appropriate:
1. ROLE-PLAYING: Add "Act as a [role]" or "You are a [expert]" when the prompt implies a specific role
   - Example: "explain quantum physics" → "Act as a physics professor. Explain quantum physics..."
   - Example: "write code" → "Act as a senior software engineer. Write code..."
   - Only add if role is naturally implied by the task

2. CONTEXT SETTING: Add relevant context, background, or constraints
   - Example: "write a blog post" → "Write a blog post for a tech-savvy audience..."
   - Only add context that enhances clarity without changing intent

3. OUTPUT FORMAT: Specify desired output format (paragraph, list, JSON, code, table, etc.)
   - Example: "list benefits" → "List the benefits in bullet points..."
   - Only add if format is implied or would significantly improve results

4. TONE & STYLE: Specify tone (professional, casual, technical, creative, formal)
   - Example: "write email" → "Write a professional email..."
   - Only add if tone is implied by context

5. CONSTRAINTS: Add relevant constraints or guidelines
   - Example: "generate ideas" → "Generate 5 creative ideas, each in one sentence..."
   - Only add if constraints would improve specificity

6. EXAMPLES: Add few-shot examples if the task benefits from demonstration
   - Only add if the prompt type naturally benefits from examples (classification, formatting, etc.)

7. CHAIN OF THOUGHT: Add step-by-step reasoning for complex tasks
   - Example: "solve math problem" → "Solve this math problem step by step, showing your reasoning..."
   - Only add for analytical or problem-solving tasks`;
  } else if (mediaType === 'image') {
    return `For IMAGE prompts, apply these techniques when appropriate:
1. TECHNICAL SPECIFICATIONS: Add resolution, aspect ratio, quality indicators
   - Example: "create image" → "Create a high-resolution 16:9 image..."
   - Only add if it improves the prompt without changing creative intent

2. STYLE MODIFIERS: Add appropriate style tags for the target model
   - Example: For Midjourney: add style tags like "--style raw --ar 16:9"
   - Example: For DALL-E: use comma-separated descriptive style terms

3. COMPOSITION RULES: Add framing and composition guidance
   - Example: "portrait" → "Portrait composition, rule of thirds..."
   - Only add if it enhances the prompt naturally

4. QUALITY INDICATORS: Add professional quality markers
   - Example: "high quality", "professional", "detailed", "sharp focus"
   - Only add if it improves the prompt without being redundant`;
  } else {
    return `For ${mediaType.toUpperCase()} prompts, apply these techniques when appropriate:
1. TECHNICAL SPECIFICATIONS: Add fps, resolution, bitrate, format, duration
2. STYLE & PACING: Add style modifiers and pacing specifications
3. QUALITY INDICATORS: Add professional quality markers
4. COMPOSITION: For video, add framing and composition guidance`;
  }
}

/**
 * Quick optimize prompt using AI following standard prompt engineering best practices
 * Returns optimized prompt with validation and improvements list
 */
export interface QuickOptimizeResult {
  optimizedPrompt: string;
  isValid: boolean;
  validationMessage?: string;
  improvements: string[];
  qualityScore: number;
}

export async function quickOptimizeWithAI(
  originalPrompt: string,
  targetModel: string,
  mediaType: 'text' | 'image' | 'video' | 'audio',
): Promise<QuickOptimizeResult> {
  const modelGuidance = getModelSpecificGuidance(targetModel, mediaType);

  // Get media-specific prompt engineering guidance
  const mediaSpecificGuidance = getMediaSpecificPromptGuidance(mediaType, targetModel);

  const systemPrompt = `You are a prompt optimization expert. Optimize this prompt following advanced prompt engineering best practices.

ORIGINAL PROMPT: "${originalPrompt}"
TARGET MODEL: ${targetModel}
MEDIA TYPE: ${mediaType}

${modelGuidance}

${mediaSpecificGuidance}

OPTIMIZATION RULES (CRITICAL - Apply ALL of these):
1. Fix ALL grammar and spelling errors
2. Remove unnecessary filler words ("very", "really", "quite", "actually", "just", "kind of", "sort of")
3. Remove redundancy and repetitive phrases
4. Improve clarity - replace vague terms with specific ones (e.g., "nice" → "professional", "good" → "high-quality")
5. Ensure proper structure: Subject → Action → Object → Context
6. Use action-oriented, strong verbs (create, generate, design, build)
7. Format appropriately for ${targetModel} best practices
8. Maintain appropriate length (not too short, not too long - typically 10-150 words for most prompts)
9. Ensure proper punctuation and capitalization
10. Remove any nonsensical or contradictory elements
11. Improve sentence flow and readability
12. Use concise, direct language

ADVANCED PROMPT ENGINEERING TECHNIQUES (Apply when appropriate):
${getAdvancedTechniquesGuidance(mediaType)}

INTENT PRESERVATION (CRITICAL - DO NOT VIOLATE):
- DO NOT add creative details (colors, backgrounds, styles, moods) not in the original prompt
- DO NOT add new subjects, objects, or concepts not mentioned
- DO NOT change the core meaning or intent
- ONLY improve grammar, structure, clarity, formatting, and apply appropriate prompt engineering techniques
- Preserve the user's original simplicity level - if they wanted simple, keep it simple
- If the original is vague, improve clarity WITH appropriate prompt engineering techniques (role, context, format) WITHOUT adding unsolicited creative details
- When adding role/context, infer it naturally from the prompt's intent (e.g., "write code" → add developer role, "explain physics" → add teacher role)

VALIDATION:
- If the prompt is completely nonsensical (random characters, gibberish, no coherent meaning), set isValid to false and explain why
- If the prompt is too vague to be useful (single word, extremely generic), set isValid to true but add a validationMessage warning
- If the prompt contains contradictions, resolve them by keeping the most logical interpretation
- If the prompt is inappropriate (harmful, illegal, unethical), set isValid to false and explain why

QUALITY SCORING:
- Rate the optimized prompt quality from 0-100
- Consider: clarity, specificity, structure, grammar, and adherence to prompt engineering best practices
- Higher scores for well-structured, clear, specific prompts
- Lower scores for vague, poorly structured prompts

Return your response as valid JSON in this exact format:
{
  "optimizedPrompt": "the optimized prompt text here",
  "isValid": true or false,
  "validationMessage": "optional message if prompt has issues or warnings",
  "improvements": ["Fixed grammar errors", "Removed filler words", "Improved clarity", ...],
  "qualityScore": 85
}

CRITICAL JSON FORMATTING RULES:
- Return ONLY valid JSON, no other text before or after
- ALL quotes inside string values MUST be escaped with backslash: \\"
- ALL newlines inside string values MUST be escaped: \\n
- ALL backslashes MUST be escaped: \\\\
- The JSON must be valid and parseable
- Do NOT include any explanatory text outside the JSON

IMPORTANT:
- The optimizedPrompt must be the final, ready-to-use prompt
- The optimizedPrompt must be COMPLETE - do not truncate or cut off mid-sentence
- Ensure the optimizedPrompt ends with proper punctuation (., !, or ?)
- Keep the optimizedPrompt concise but complete (typically 50-200 words, but can be longer if needed)
- If the prompt needs to be long, ensure it's complete and properly formatted
- List specific improvements made (e.g., "Fixed grammar: added missing articles", "Removed redundancy: 'very very' → removed")
- If isValid is false, validationMessage is required
- qualityScore must be a number between 0-100
- CRITICAL: Return the FULL optimizedPrompt, not a truncated version
- CRITICAL: Ensure the JSON is complete - all string values must be properly closed with quotes`;

  try {
    logger.info('Calling Gemini API for quick optimization');
    const response = await generateContent(systemPrompt);
    
    logger.info(
      {
        responseLength: response.length,
        responsePreview: response.substring(0, 200),
      },
      'Received response from Gemini',
    );
    
    // Parse JSON with robust error handling
    let parsed: QuickOptimizeResult;
    try {
      parsed = parseJSONResponse(response) as QuickOptimizeResult;
      logger.info('Successfully parsed JSON response from Gemini');
    } catch (parseError: any) {
      logger.error(
        {
          parseError: parseError.message,
          responsePreview: response.substring(0, 500),
          responseLength: response.length,
        },
        'Failed to parse Gemini JSON response',
      );
      throw new Error(`Failed to parse AI response: ${parseError.message}`);
    }
    
    // Validate the response structure
    if (!parsed.optimizedPrompt || typeof parsed.optimizedPrompt !== 'string') {
      logger.error(
        {
          parsedKeys: Object.keys(parsed),
          optimizedPromptType: typeof parsed.optimizedPrompt,
          optimizedPromptValue: parsed.optimizedPrompt,
        },
        'Invalid response structure: missing or invalid optimizedPrompt',
      );
      throw new Error('Invalid response: missing optimizedPrompt');
    }
    
    // Check for truncated prompt (ends with escape sequence, incomplete sentence, or very short)
    const endsWithEscape = parsed.optimizedPrompt.endsWith('\\') || parsed.optimizedPrompt.endsWith('\\"');
    const missingPunctuation = !/[.!?]$/.test(parsed.optimizedPrompt.trim()) && parsed.optimizedPrompt.length > 50;
    const suspiciouslyShort = response.length < 500 && parsed.optimizedPrompt.length < 200;
    const isTruncated = endsWithEscape || missingPunctuation || suspiciouslyShort;
    
    if (isTruncated) {
      logger.warn(
        {
          optimizedPrompt: parsed.optimizedPrompt.substring(0, 100),
          promptLength: parsed.optimizedPrompt.length,
          responseLength: response.length,
          endsWithPunctuation: /[.!?]$/.test(parsed.optimizedPrompt.trim()),
          endsWithEscape,
          missingPunctuation,
          suspiciouslyShort,
        },
        'Optimized prompt appears truncated or incomplete',
      );
      
      // Try to clean up the truncated ending
      let cleanedPrompt = parsed.optimizedPrompt
        .replace(/\\+$/, '')
        .replace(/\\"$/, '')
        .trim();
      
      // If the prompt seems incomplete (no ending punctuation and reasonable length), 
      // try to complete it intelligently
      if (!/[.!?]$/.test(cleanedPrompt.trim()) && cleanedPrompt.length > 50) {
        // Check if it ends mid-word or mid-sentence
        const lastWord = cleanedPrompt.trim().split(/\s+/).pop() || '';
        const endsMidWord = lastWord.length > 0 && !/[.!?,;:]$/.test(lastWord);
        
        if (endsMidWord) {
          // Likely truncated mid-word, remove the incomplete word
          cleanedPrompt = cleanedPrompt.trim().replace(/\s+\S+$/, '');
        }
        
        // Add proper ending
        if (cleanedPrompt.length > 0) {
          cleanedPrompt = cleanedPrompt.trim() + '.';
        }
        
        parsed.validationMessage = 'Response was truncated. The prompt has been completed with best effort. Consider using premium optimization for more detailed prompts.';
      }
      
      parsed.optimizedPrompt = cleanedPrompt;
    }
    
    if (typeof parsed.isValid !== 'boolean') {
      parsed.isValid = true; // Default to valid if not specified
    }
    
    if (!Array.isArray(parsed.improvements)) {
      logger.warn(
        {
          improvementsType: typeof parsed.improvements,
          improvementsValue: parsed.improvements,
        },
        'Improvements is not an array, defaulting to empty array',
      );
      parsed.improvements = [];
    }
    
    if (typeof parsed.qualityScore !== 'number') {
      logger.warn(
        {
          qualityScoreType: typeof parsed.qualityScore,
          qualityScoreValue: parsed.qualityScore,
        },
        'Quality score is not a number, defaulting to 70',
      );
      parsed.qualityScore = 70; // Default score
    }
    
    // Ensure qualityScore is within bounds
    parsed.qualityScore = Math.max(0, Math.min(100, parsed.qualityScore));
    
    logger.info(
      {
        optimizedPromptLength: parsed.optimizedPrompt.length,
        improvementsCount: parsed.improvements.length,
        qualityScore: parsed.qualityScore,
        isValid: parsed.isValid,
      },
      'Successfully processed AI optimization result',
    );
    
    return parsed;
  } catch (error: any) {
    logger.error(
      {
        errorMessage: error.message,
        errorStack: error.stack,
        originalPrompt: originalPrompt.substring(0, 100),
        targetModel,
        mediaType,
      },
      'Failed to quick optimize with AI',
    );
    throw new Error(`AI optimization failed: ${error.message || 'Unknown error'}`);
  }
}

// Initialize on module load
initializeGemini();

