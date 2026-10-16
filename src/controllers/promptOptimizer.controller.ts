import { Request, Response, NextFunction } from 'express';
import catchAsync from '../utils/catchAsync.util.js';
import * as promptOptimizerService from '../services/promptOptimizer.service.js';
import {
  QuickOptimizeInput,
  AnalyzePromptInput,
  BuildPromptInput,
  GetOptimizationParams,
  OptimizationHistoryParams,
  ApplyOptimizationInput,
  FeedbackInput,
} from '../validation/promptOptimizer.schema.js';
import AppError from '../utils/appError.util.js';
import type { IPromptOptimizationDocument } from '../types/promptOptimizer.types.js';

/** Mongoose creates the nested diagnosis even when unset; report null instead. */
const diagnosisOf = (optimization: IPromptOptimizationDocument) => {
  const d = optimization.diagnosis;
  const has = d && (d.changes?.length || d.ambiguities?.length || d.formattingConstraints?.length || d.variables?.length || d.roleDefinition);
  return has ? d : null;
};

/** Response shape for a finished quick or premium optimization. */
const toOptimizationResponse = (optimization: IPromptOptimizationDocument) => ({
  _id: optimization._id,
  originalPrompt: optimization.originalPrompt,
  optimizedPrompt: optimization.optimizedPrompt,
  targetModel: optimization.targetModel,
  mediaType: optimization.mediaType,
  optimizationType: optimization.optimizationType,
  diagnosis: diagnosisOf(optimization),
  lintChecks: optimization.lintChecks ?? { before: [], after: [] },
  intentWarnings: optimization.intentWarnings ?? [],
  metadata: optimization.metadata,
  note: optimization.metadata?.validationMessage || undefined,
});

/**
 * Quick optimization - AI-powered optimization following prompt engineering best practices
 */
export const quickOptimize = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('You must be logged in to optimize prompts.', 401);
    }

    const input = req.body as QuickOptimizeInput;
    const optimization = await promptOptimizerService.quickOptimize(
      req.user.id,
      input,
    );

    res.status(200).json({
      status: 'success',
      data: {
        optimization: toOptimizationResponse(optimization),
      },
    });
  },
);

/**
 * Analyze prompt and generate questions
 */
export const analyzePrompt = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('You must be logged in to analyze prompts.', 401);
    }

    const input = req.body as AnalyzePromptInput;
    const result = await promptOptimizerService.analyzePromptForQuestions(
      req.user.id,
      input,
    );

    res.status(200).json({
      status: 'success',
      data: {
        originalPrompt: result.optimization.originalPrompt,
        analysis: result.optimization.analysis,
        questions: result.questions,
        additionalDetailsField: result.additionalDetailsField,
        quickOptimized: result.quickOptimized,
        optimizationId: result.optimization._id,
        note: 'Answer these questions to get a premium optimized prompt, or use the quick version above. All questions are optional - you can skip any or use defaults.',
      },
    });
  },
);

/**
 * Build premium prompt from answers
 */
export const buildPrompt = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('You must be logged in to build prompts.', 401);
    }

    const input = req.body as BuildPromptInput;
    const optimization = await promptOptimizerService.buildPremiumPrompt(
      req.user.id,
      input,
    );

    res.status(200).json({
      status: 'success',
      data: {
        optimization: toOptimizationResponse(optimization),
      },
    });
  },
);

/**
 * Get optimization history
 */
export const getOptimizationHistory = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('You must be logged in to view optimization history.', 401);
    }

    const query = req.query as unknown as OptimizationHistoryParams;
    const result = await promptOptimizerService.getOptimizationHistory(
      req.user.id,
      query,
    );

    res.status(200).json({
      status: 'success',
      data: {
        optimizations: result.optimizations,
        pagination: {
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          limit: result.limit,
        },
        stats: result.stats,
      },
    });
  },
);

/**
 * Get optimization by ID
 */
export const getOptimization = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('You must be logged in to view optimizations.', 401);
    }

    const { id } = req.params as GetOptimizationParams;
    const optimization = await promptOptimizerService.getOptimizationById(
      id,
      req.user.id,
    );

    res.status(200).json({
      status: 'success',
      data: {
        optimization,
      },
    });
  },
);

/**
 * Delete optimization
 */
export const deleteOptimization = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('You must be logged in to delete optimizations.', 401);
    }

    const { id } = req.params as GetOptimizationParams;
    const result = await promptOptimizerService.deleteOptimization(
      id,
      req.user.id,
    );

    res.status(200).json({
      status: 'success',
      message: result.message,
    });
  },
);

/**
 * Apply optimization to create a new Prompt
 */
export const applyOptimization = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('You must be logged in to apply optimizations.', 401);
    }

    const { id } = req.params as GetOptimizationParams;
    const { title, description, tags, isPublic, sampleOutput, outputs } = req.body as ApplyOptimizationInput & { outputs?: any[] };
    
    // Handle multiple outputs if provided
    let imageUrl: string | undefined;
    if (outputs && Array.isArray(outputs) && outputs.length > 0) {
      // Process outputs array and handle file uploads
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const outputFiles = files?.outputFiles || [];
      
      // Map output files to their indices
      const outputIndices = req.body.outputIndices 
        ? (Array.isArray(req.body.outputIndices) ? req.body.outputIndices : [req.body.outputIndices])
        : [];
      
      // Update outputs with file URLs
      const processedOutputs = outputs.map((output: any, index: number) => {
        if (output.type === 'image') {
          // Find the corresponding file for this output
          const fileIndex = outputIndices.findIndex((idx: string) => parseInt(idx) === index);
          if (fileIndex !== -1 && outputFiles[fileIndex]) {
            return {
              ...output,
              content: outputFiles[fileIndex].path,
            };
          }
        }
        return output;
      });
      
      req.body.outputs = processedOutputs;
    } else {
      // Legacy single output support
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const imageFile = files?.image?.[0] || (req as any).file;
      if (imageFile) {
        imageUrl = imageFile.path;
      }
    }

    const prompt = await promptOptimizerService.applyOptimization(
      req.user.id,
      id,
      { title, description, tags, isPublic, sampleOutput, imageUrl, outputs: req.body.outputs },
    );

    res.status(201).json({
      status: 'success',
      data: {
        prompt,
      },
    });
  },
);

/**
 * Submit feedback on optimization
 */
export const submitFeedback = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('You must be logged in to submit feedback.', 401);
    }

    const { id } = req.params as GetOptimizationParams;
    const input = req.body as FeedbackInput;
    const result = await promptOptimizerService.submitFeedback(
      id,
      req.user.id,
      input,
    );

    res.status(200).json({
      status: 'success',
      data: result,
    });
  },
);

