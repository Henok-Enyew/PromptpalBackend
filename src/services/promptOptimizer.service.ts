import PromptOptimization from '../models/promptOptimization.model.js';
import { PUBLIC_AUTHOR_FIELDS } from '../utils/user.util.js';
import { literalRegex } from '../utils/regex.util.js';
import AppError from '../utils/appError.util.js';
import {
  QuickOptimizeInput,
  AnalyzePromptInput,
  BuildPromptInput,
  OptimizationHistoryParams,
} from '../validation/promptOptimizer.schema.js';
import { analyzePrompt, preValidatePrompt } from '../utils/promptAnalyzer.util.js';
import {
  generateQuestions,
  parseFreeFormInput,
  buildOptimizedPrompt,
  isGeminiAvailable,
  quickOptimizeWithAI,
} from '../utils/gemini.util.js';
import { validateIntentPreservation } from '../utils/intentPreservation.util.js';
import { calculateComprehensiveQualityScore } from '../utils/qualityScoring.util.js';
import Prompt from '../models/prompt.model.js';
import { CreatePromptInput } from '../validation/prompt.schema.js';
import { ApplyOptimizationInput, FeedbackInput } from '../validation/promptOptimizer.schema.js';
import {
  questionCache,
  optimizationCache,
  generateQuestionsCacheKey,
  generateAnalysisCacheKey,
} from '../utils/cache.util.js';
import logger from '../config/logger.config.js';

/**
 * Quick optimization - AI-powered optimization following prompt engineering best practices
 * AI optimization is required - no fallback to rule-based optimization
 */
export const quickOptimize = async (
  userId: string,
  input: QuickOptimizeInput,
) => {
  const { originalPrompt, targetModel, mediaType } = input;
  const promptText = originalPrompt as string;

  // Pre-validate the prompt
  const preValidation = preValidatePrompt(promptText);
  
  // If prompt is completely unacceptable, throw error
  if (!preValidation.isAcceptable) {
    throw new AppError(
      preValidation.validationMessage || 'Prompt is not acceptable for optimization.',
      400,
    );
  }

  // Analyze the original prompt for comparison
  const originalAnalysis = analyzePrompt(promptText, mediaType);

  let optimizedPrompt: string = promptText;
  let aiOptimizationResult: any = null;
  let usedAI = false;
  let validationMessage: string | undefined = preValidation.validationMessage;
  let improvements: string[] = [];

  // AI optimization is required - no fallback to rule-based
  if (!isGeminiAvailable()) {
    logger.error('Gemini is not available. AI optimization is required.');
    throw new AppError(
      'AI optimization service is currently unavailable. Please try again later or contact support if the issue persists.',
      503,
    );
  }

  try {
    logger.info(
      {
        userId,
        originalPrompt: promptText,
        targetModel,
        mediaType,
      },
      'Attempting AI optimization',
    );

    aiOptimizationResult = await quickOptimizeWithAI(
      promptText,
      targetModel as string,
      mediaType,
    );
    
    logger.info(
      {
        userId,
        aiResult: {
          optimizedPrompt: aiOptimizationResult.optimizedPrompt?.substring(0, 100),
          isValid: aiOptimizationResult.isValid,
          improvementsCount: aiOptimizationResult.improvements?.length || 0,
          qualityScore: aiOptimizationResult.qualityScore,
        },
      },
      'AI optimization completed successfully',
    );
    
    optimizedPrompt = aiOptimizationResult.optimizedPrompt;
    usedAI = true;
    improvements = aiOptimizationResult.improvements || [];
    
    // Use AI's validation message if provided
    if (aiOptimizationResult.validationMessage) {
      validationMessage = aiOptimizationResult.validationMessage;
    }

    // If AI says prompt is invalid, throw error
    if (!aiOptimizationResult.isValid) {
      throw new AppError(
        aiOptimizationResult.validationMessage || 'Prompt is not valid for optimization.',
        400,
      );
    }

    logger.info(
      {
        userId,
        originalLength: promptText.length,
        optimizedLength: optimizedPrompt.length,
        qualityScore: aiOptimizationResult.qualityScore,
        improvementsCount: improvements.length,
      },
      'Quick optimization completed using AI',
    );
  } catch (error: any) {
    // Log detailed error information
    logger.error(
      {
        userId,
        originalPrompt: promptText,
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name,
        isAppError: error instanceof AppError,
      },
      'AI optimization failed',
    );
    
    // If it's a validation error, throw it as-is
    if (error instanceof AppError) {
      throw error;
    }
    
    // For technical errors, provide user-friendly message
    throw new AppError(
      'Failed to optimize prompt. The AI service encountered an error. Please try again in a moment. If the problem persists, contact support.',
      503,
    );
  }

  // AI optimization is required - if we reach here without usedAI, something went wrong
  if (!usedAI) {
    logger.error('AI optimization failed but no error was thrown. This should not happen.');
    throw new AppError(
      'Failed to optimize prompt. Please try again.',
      500,
    );
  }

  // Analyze the optimized prompt
  const optimizedAnalysis = analyzePrompt(optimizedPrompt, mediaType);

  // Calculate quality scores
  const beforeScore = Math.round(
    (originalAnalysis.clarityScore +
      originalAnalysis.specificityScore +
      originalAnalysis.structureScore) /
      3,
  );

  // Calculate quality score from AI optimization
  // AI is required, so we should always have aiOptimizationResult here
  if (!aiOptimizationResult) {
    logger.error('AI optimization result is missing. This should not happen.');
    throw new AppError('Failed to optimize prompt. Please try again.', 500);
  }

  // Use AI's quality score, but ensure it doesn't decrease
  const aiScore = aiOptimizationResult.qualityScore;
  let afterScore = Math.max(beforeScore, aiScore);
  
  // If AI made improvements but score is same, give a small boost
  if (aiOptimizationResult.improvements && aiOptimizationResult.improvements.length > 0 && afterScore === beforeScore) {
    afterScore = Math.min(100, beforeScore + 5);
  }
  
  logger.info(
    {
      beforeScore,
      aiScore,
      finalAfterScore: afterScore,
      aiImprovementsCount: aiOptimizationResult.improvements?.length || 0,
    },
    'Calculated quality score for AI optimization',
  );

  // Ensure improvements array is populated from AI
  let finalImprovements = improvements;
  
  // AI is required, so we should always have improvements from AI
  if (aiOptimizationResult && aiOptimizationResult.improvements && aiOptimizationResult.improvements.length > 0) {
    finalImprovements = aiOptimizationResult.improvements;
  } else if (finalImprovements.length === 0) {
    // If AI didn't provide improvements, use a generic message
    finalImprovements = ['Optimized prompt structure and clarity'];
    logger.warn('AI optimization completed but no improvements were listed');
  }

  const qualityScore = {
    before: beforeScore,
    after: afterScore,
    improvements: finalImprovements,
    intentPreserved: true,
  };

  // Log metadata before creating record
  logger.info(
    {
      userId,
      usedAI,
      improvementsCount: finalImprovements.length,
      qualityScoreBefore: beforeScore,
      qualityScoreAfter: afterScore,
    },
    'Creating optimization record',
  );

  // Create optimization record
  const optimization = await PromptOptimization.create({
    user: userId,
    originalPrompt: promptText,
    optimizedPrompt,
    targetModel,
    mediaType,
    optimizationType: 'quick',
    optimizationMode: 'complete',
    status: 'completed',
    qualityScore,
    metadata: {
      wordCount: {
        before: originalAnalysis.wordCount,
        after: optimizedAnalysis.wordCount,
      },
      clarityScore: {
        before: originalAnalysis.clarityScore,
        after: optimizedAnalysis.clarityScore,
      },
      specificityScore: {
        before: originalAnalysis.specificityScore,
        after: optimizedAnalysis.specificityScore,
      },
      structureScore: {
        before: originalAnalysis.structureScore,
        after: optimizedAnalysis.structureScore,
      },
      completenessScore: originalAnalysis.completenessScore,
      usedAI: usedAI, // Explicitly set to ensure it's saved
      validationMessage,
    },
    analysis: {
      completenessScore: originalAnalysis.completenessScore,
      missingElements: originalAnalysis.missingElements,
      grammarFixed: originalAnalysis.grammarFixed,
      structureImproved: originalAnalysis.structureImproved,
    },
  });

  return optimization;
};

/**
 * Analyze prompt and generate questions
 * AI optimization is required - no fallback to template questions
 */
export const analyzePromptForQuestions = async (
  userId: string,
  input: AnalyzePromptInput,
) => {
  const { originalPrompt, targetModel, mediaType } = input;
  
  // Ensure originalPrompt is a string
  const promptString = String(originalPrompt);

  // Analyze the prompt
  const analysis = analyzePrompt(promptString, mediaType);

  // Generate quick optimized version using AI (required)
  let quickOptimized: string = promptString;
  
  if (!isGeminiAvailable()) {
    logger.error('Gemini is not available. AI optimization is required for premium questions.');
    throw new AppError(
      'AI optimization service is currently unavailable. Please try again later or contact support if the issue persists.',
      503,
    );
  }

  try {
    // Use AI to generate quick optimized version
    const quickOptimizeResult = await quickOptimizeWithAI(
      promptString,
      String(targetModel),
      mediaType,
    );
    quickOptimized = quickOptimizeResult.optimizedPrompt;
    
    logger.info(
      {
        userId,
        originalLength: promptString.length,
        quickOptimizedLength: quickOptimized.length,
      },
      'Generated quick optimized version using AI',
    );
  } catch (error: any) {
    logger.error(
      {
        userId,
        originalPrompt: promptString.substring(0, 100),
        errorMessage: error.message,
      },
      'Failed to generate quick optimized version, using original',
    );
    // If AI fails for quick optimize, just use original - don't fail the whole request
    // The questions generation will still work
  }

  // Check cache first
  const cacheKey = generateQuestionsCacheKey(promptString, mediaType, String(targetModel));
  let questionsData = questionCache.get<any>(cacheKey);

  // Generate questions using Gemini (required - no template fallback)
  if (!questionsData) {
    if (!isGeminiAvailable()) {
      logger.error('Gemini is not available. AI is required for question generation.');
      throw new AppError(
        'AI optimization service is currently unavailable. Please try again later or contact support if the issue persists.',
        503,
      );
    }

    try {
      logger.info(
        {
          userId,
          originalPrompt: promptString.substring(0, 100),
          targetModel,
          mediaType,
        },
        'Generating premium questions with AI',
      );

      questionsData = await generateQuestions(promptString, mediaType, String(targetModel));
      
      logger.info(
        {
          userId,
          questionsCount: questionsData.questions?.length || 0,
        },
        'Successfully generated premium questions',
      );

      // Cache the questions
      questionCache.set(cacheKey, questionsData);
    } catch (error: any) {
      logger.error(
        {
          userId,
          originalPrompt: promptString.substring(0, 100),
          errorMessage: error.message,
          errorStack: error.stack,
        },
        'Failed to generate questions with AI',
      );
      
      // Check if it's a rate limit error
      const isRateLimit = error.message?.includes('rate limit') || 
                         error.message?.includes('Rate limit') ||
                         error.message?.includes('quota') ||
                         error.message?.includes('Quota exceeded') ||
                         error.message?.includes('429');
      
      if (isRateLimit) {
        // Extract retry delay if available from error message
        const retryDelayMatch = error.message?.match(/retry in ([\d.]+)s/i) || 
                                error.message?.match(/retryDelay.*?([\d.]+)s/i);
        const retryDelay = retryDelayMatch ? Math.ceil(parseFloat(retryDelayMatch[1])) : null;
        
        const rateLimitMessage = retryDelay
          ? `Rate limit exceeded. Please try again in ${retryDelay} seconds. You've hit the free tier limit (20 requests per day per model).`
          : 'Rate limit exceeded. Please try again later. You may have hit the free tier limit (20 requests per day per model).';
        
        throw new AppError(rateLimitMessage, 429);
      }
      
      throw new AppError(
        'Failed to generate optimization questions. The AI service encountered an error. Please try again in a moment.',
        503,
      );
    }
  } else {
    logger.info('Using cached questions for premium optimization');
  }

  // Create optimization record in 'analyzing' state
  const optimization = await PromptOptimization.create({
    user: userId,
    originalPrompt,
    optimizedPrompt: quickOptimized, // Quick fallback
    targetModel,
    mediaType,
    optimizationType: 'premium',
    optimizationMode: 'analyze',
    status: 'questions_ready',
    questions: questionsData.questions.map((q: any) => ({
      ...q,
      answered: false,
    })),
    analysis: {
      completenessScore: analysis.completenessScore,
      missingElements: analysis.missingElements,
      grammarFixed: analysis.grammarFixed,
      structureImproved: analysis.structureImproved,
    },
  });

  return {
    optimization,
    questions: questionsData.questions,
    additionalDetailsField: questionsData.additionalDetailsField,
    quickOptimized,
  };
};

/**
 * Build premium prompt from user answers
 */
export const buildPremiumPrompt = async (
  userId: string,
  input: BuildPromptInput,
) => {
  const { originalPrompt, targetModel, mediaType, answers, additionalDetails } = input;

  // Find existing optimization or create new one
  const optimization = await PromptOptimization.findOne({
    user: userId,
    originalPrompt,
    targetModel,
    mediaType,
    optimizationType: 'premium',
    status: 'questions_ready',
  }).sort({ createdAt: -1 });

  if (!optimization) {
    throw new AppError('No optimization found. Please analyze the prompt first.', 404);
  }

  // Parse additional details if provided (with media type context)
  let parsedDetails: Record<string, any> = {};
  if (additionalDetails && typeof additionalDetails === 'string' && additionalDetails.trim()) {
    if (isGeminiAvailable()) {
      try {
        parsedDetails = await parseFreeFormInput(additionalDetails, mediaType);
      } catch (error: any) {
        logger.error(error, 'Failed to parse additional details');
        parsedDetails = { other: additionalDetails };
      }
    } else {
      parsedDetails = { other: additionalDetails };
    }
  }

  // Build optimized prompt using Gemini
  let optimizedPrompt: string;
  if (isGeminiAvailable()) {
    try {
      const userAnswers: Record<string, any> = answers || {};
      const additionalDetailsStr: string = (additionalDetails && typeof additionalDetails === 'string') ? additionalDetails : '';
      optimizedPrompt = await buildOptimizedPrompt(
        originalPrompt as string,
        userAnswers,
        additionalDetailsStr || undefined,
        targetModel as string,
      );
    } catch (error: any) {
      logger.error(error, 'Failed to build prompt with Gemini');
      throw new AppError('Failed to build optimized prompt. Please try again.', 500);
    }
  } else {
    throw new AppError(
      'AI is not available. Please configure GROQ_API_KEY or GOOGLE_AI_API_KEY.',
      500,
    );
  }

  // Validate intent preservation
  const userAnswers: Record<string, any> = answers || {};
  const additionalDetailsStr: string = (additionalDetails && typeof additionalDetails === 'string') ? additionalDetails : '';
  const intentValidation = validateIntentPreservation(
    originalPrompt as string,
    optimizedPrompt,
    userAnswers,
    additionalDetailsStr || undefined,
  );

  // Log intent preservation violations if any
  if (!intentValidation.preserved) {
    logger.warn(
      {
        violations: intentValidation.violations,
        addedDetails: intentValidation.addedDetails,
      },
      'Intent preservation violations detected',
    );
  }

  // Calculate comprehensive quality scores
  const comprehensiveScore = calculateComprehensiveQualityScore(
    originalPrompt as string,
    optimizedPrompt,
    mediaType,
    userAnswers,
    additionalDetailsStr || undefined,
  );

  const beforeAnalysis = analyzePrompt(originalPrompt as string, mediaType);
  const afterAnalysis = analyzePrompt(optimizedPrompt, mediaType);

  const qualityScore = {
    before: Math.round(
      (beforeAnalysis.clarityScore +
        beforeAnalysis.specificityScore +
        beforeAnalysis.structureScore) /
        3,
    ),
    after: comprehensiveScore.overall,
    improvements: [
      'Applied user preferences',
      'Enhanced structure and clarity',
      'Improved specificity',
      ...(intentValidation.preserved ? [] : ['Intent preservation warnings detected']),
    ],
    intentPreserved: intentValidation.preserved,
    intentPreservationScore: intentValidation.score,
    comprehensive: comprehensiveScore,
  };

  // Update optimization record
  optimization.optimizedPrompt = optimizedPrompt;
  optimization.optimizationMode = 'complete';
  optimization.status = 'completed';
  optimization.userAnswers = userAnswers;
  optimization.additionalDetails = additionalDetailsStr || undefined;
  optimization.qualityScore = qualityScore;
  optimization.metadata = {
    wordCount: {
      before: beforeAnalysis.wordCount,
      after: afterAnalysis.wordCount,
    },
    clarityScore: {
      before: beforeAnalysis.clarityScore,
      after: afterAnalysis.clarityScore,
    },
    specificityScore: {
      before: beforeAnalysis.specificityScore,
      after: afterAnalysis.specificityScore,
    },
    structureScore: {
      before: beforeAnalysis.structureScore,
      after: afterAnalysis.structureScore,
    },
    completenessScore: afterAnalysis.completenessScore,
  };

  // Update question answers
  if (answers && optimization.questions) {
    optimization.questions = optimization.questions.map((q) => {
      const answer = answers[q.id];
      if (answer) {
        return {
          ...q,
          answered: true,
          answer,
        };
      }
      return q;
    });
  }

  await optimization.save();

  return optimization;
};

/**
 * Get template questions (DEPRECATED - no longer used, AI is required)
 * Kept for reference but should not be called
 */
function getTemplateQuestions(mediaType: 'text' | 'image' | 'video' | 'audio'): any {
  if (mediaType === 'image') {
    return {
      questions: [
        {
          id: 'style',
          question: 'What style do you prefer?',
          type: 'select_or_text',
          priority: 'high',
          options: [
            { value: 'photorealistic', label: 'Photorealistic' },
            { value: 'cartoon', label: 'Cartoon/Illustration' },
            { value: 'artistic', label: 'Artistic/Painting' },
            { value: 'abstract', label: 'Abstract' },
            { value: 'minimalist', label: 'Minimalist' },
            { value: 'custom', label: 'Other (describe)', allowsTextInput: true },
            { value: 'no_preference', label: 'No preference' },
          ],
          default: 'photorealistic',
          required: false,
        },
        {
          id: 'composition',
          question: 'How should the subject be positioned?',
          type: 'select_or_text',
          priority: 'medium',
          options: [
            { value: 'centered', label: 'Centered' },
            { value: 'rule_of_thirds', label: 'Rule of thirds' },
            { value: 'close_up', label: 'Close-up' },
            { value: 'full_body', label: 'Full body' },
            { value: 'portrait', label: 'Portrait style' },
            { value: 'custom', label: 'Other (describe)', allowsTextInput: true },
            { value: 'no_preference', label: 'No preference' },
          ],
          default: 'centered',
          required: false,
        },
        {
          id: 'background',
          question: 'What background do you want?',
          type: 'select_or_text',
          priority: 'medium',
          options: [
            { value: 'indoor', label: 'Indoor' },
            { value: 'outdoor', label: 'Outdoor' },
            { value: 'studio', label: 'Studio/Plain' },
            { value: 'transparent', label: 'Transparent' },
            { value: 'natural', label: 'Natural environment' },
            { value: 'custom', label: 'Other (describe)', allowsTextInput: true },
            { value: 'no_preference', label: 'No preference' },
          ],
          default: 'natural',
          required: false,
        },
        {
          id: 'quality',
          question: 'What quality level?',
          type: 'select',
          priority: 'low',
          options: [
            { value: 'standard', label: 'Standard' },
            { value: 'high', label: 'High quality' },
            { value: 'professional', label: 'Professional/8K' },
            { value: 'no_preference', label: 'No preference' },
          ],
          default: 'high',
          required: false,
        },
      ],
      additionalDetailsField: {
        question: 'Any additional details you\'d like to include?',
        type: 'textarea',
        placeholder: 'E.g., colors, moods, specific details, references - Add anything else you want!',
        required: false,
      },
    };
  }

  // Default template for text prompts
  return {
    questions: [
      {
        id: 'tone',
        question: 'What tone do you prefer?',
        type: 'select_or_text',
        priority: 'high',
        options: [
          { value: 'professional', label: 'Professional' },
          { value: 'casual', label: 'Casual' },
          { value: 'formal', label: 'Formal' },
          { value: 'friendly', label: 'Friendly' },
          { value: 'custom', label: 'Other (describe)', allowsTextInput: true },
          { value: 'no_preference', label: 'No preference' },
        ],
        default: 'professional',
        required: false,
      },
    ],
    additionalDetailsField: {
      question: 'Any additional details?',
      type: 'textarea',
      placeholder: 'Add any specific requirements or details',
      required: false,
    },
  };
}

/**
 * Get optimization history with enhanced filtering
 */
export const getOptimizationHistory = async (
  userId: string,
  query: OptimizationHistoryParams,
) => {
  const { page = 1, limit = 20, targetModel, optimizationType } = query;

  const filter: any = {
    user: userId,
    status: 'completed', // Only show completed optimizations
  };

  if (targetModel) {
    filter.targetModel = literalRegex(String(targetModel));
  }

  if (optimizationType) {
    filter.optimizationType = optimizationType;
  }

  const skip = (page - 1) * limit;

  const optimizations = await PromptOptimization.find(filter)
    .select('-questions') // Don't return full questions array for list view
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean(); // Use lean for better performance

  const total = await PromptOptimization.countDocuments(filter);

  // Calculate statistics
  const stats = await PromptOptimization.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        avgQualityImprovement: {
          $avg: {
            $subtract: [
              '$qualityScore.after',
              '$qualityScore.before',
            ],
          },
        },
        totalOptimizations: { $sum: 1 },
        quickCount: {
          $sum: { $cond: [{ $eq: ['$optimizationType', 'quick'] }, 1, 0] },
        },
        premiumCount: {
          $sum: { $cond: [{ $eq: ['$optimizationType', 'premium'] }, 1, 0] },
        },
      },
    },
  ]);

  return {
    optimizations,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    limit,
    stats: stats[0] || {
      avgQualityImprovement: 0,
      totalOptimizations: 0,
      quickCount: 0,
      premiumCount: 0,
    },
  };
};

/**
 * Get optimization by ID
 */
export const getOptimizationById = async (
  optimizationId: string,
  userId: string,
) => {
  const optimization = await PromptOptimization.findOne({
    _id: optimizationId,
    user: userId,
  });

  if (!optimization) {
    throw new AppError('Optimization not found.', 404);
  }

  return optimization;
};

/**
 * Delete optimization
 */
export const deleteOptimization = async (
  optimizationId: string,
  userId: string,
) => {
  const optimization = await PromptOptimization.findOne({
    _id: optimizationId,
    user: userId,
  });

  if (!optimization) {
    throw new AppError('Optimization not found.', 404);
  }

  await PromptOptimization.findByIdAndDelete(optimizationId);

  return { message: 'Optimization deleted successfully.' };
};

/**
 * Apply optimization to create a new Prompt
 */
export const applyOptimization = async (
  userId: string,
  optimizationId: string,
  input: Omit<ApplyOptimizationInput, 'optimizationId'> & { imageUrl?: string; outputs?: any[] },
) => {
  const { title, description, tags, isPublic, sampleOutput, imageUrl, outputs } = input;

  // Get the optimization
  const optimization = await PromptOptimization.findOne({
    _id: optimizationId,
    user: userId,
    status: 'completed',
  });

  if (!optimization) {
    throw new AppError('Optimization not found or not completed.', 404);
  }

  if (!optimization.optimizedPrompt) {
    throw new AppError('Optimized prompt not available.', 400);
  }

  // Handle multiple outputs if provided, otherwise use legacy validation
  if (outputs && outputs.length > 0) {
    // Validate outputs
    for (const output of outputs) {
      if (!output.content || !output.content.trim()) {
        throw new AppError('All outputs must have content.', 400);
      }
    }
  } else {
    // Legacy validation
    if (optimization.mediaType === 'image') {
      if (!imageUrl) {
        throw new AppError('Image is required for image media type.', 400);
      }
    } else {
      if (!sampleOutput || !sampleOutput.trim()) {
        throw new AppError('Sample output is required for non-image media types.', 400);
      }
    }
  }

  // Create prompt from optimization
  const promptData: CreatePromptInput = {
    title,
    description,
    promptText: optimization.optimizedPrompt,
    sampleOutput: outputs && outputs.length > 0 
      ? outputs[0].content 
      : (optimization.mediaType === 'image' ? imageUrl! : sampleOutput!),
    outputs: outputs && outputs.length > 0 ? outputs : undefined,
    mediaType: optimization.mediaType,
    aiModel: optimization.targetModel,
    tags: tags || [],
    isPublic: isPublic ?? true,
  };

  const prompt = await Prompt.create({
    ...promptData,
    user: userId,
    originalPromptText: optimization.originalPrompt,
    isOptimized: true,
    optimizationId: optimization._id,
  });

  await prompt.populate({
    path: 'user',
    select: PUBLIC_AUTHOR_FIELDS,
  });

  return prompt;
};

/**
 * Submit feedback on optimization
 */
export const submitFeedback = async (
  optimizationId: string,
  userId: string,
  input: FeedbackInput,
) => {
  const optimization = await PromptOptimization.findOne({
    _id: optimizationId,
    user: userId,
  });

  if (!optimization) {
    throw new AppError('Optimization not found.', 404);
  }

  // Add feedback to optimization (we'll store it in a feedback field)
  // For now, we'll add it to the document
  (optimization as any).feedback = {
    rating: input.rating,
    wasHelpful: input.wasHelpful,
    comments: input.comments,
    submittedAt: new Date(),
  };

  await optimization.save();

  return {
    message: 'Feedback submitted successfully.',
    feedback: {
      rating: input.rating,
      wasHelpful: input.wasHelpful,
      comments: input.comments,
    },
  };
};

