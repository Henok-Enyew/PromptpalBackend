import { Router } from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { aiLimiter } from '../middleware/rateLimit.middleware.js';
import { requireQuota } from '../middleware/quota.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { upload } from '../utils/fileUpload.util.js';
import * as promptOptimizerController from '../controllers/promptOptimizer.controller.js';
import {
  quickOptimizeSchema,
  analyzePromptSchema,
  buildPromptSchema,
  getOptimizationSchema,
  optimizationHistorySchema,
  applyOptimizationSchema,
  feedbackSchema,
} from '../validation/promptOptimizer.schema.js';

const router = Router();

/**
 * @swagger
 * /prompt-optimizer/quick-optimize:
 *   post:
 *     summary: Quick optimize a prompt using AI (grammar, structure, and clarity improvements)
 *     description: |
 *       AI-powered optimization that follows standard prompt engineering best practices:
 *       - Fixes grammar and spelling errors
 *       - Removes unnecessary filler words and redundancy
 *       - Improves clarity and specificity
 *       - Optimizes structure and formatting
 *       - Formats for target model best practices
 *       - Preserves user intent (no creative details added)
 *       - Validates prompt quality and provides warnings for vague prompts
 *       Falls back to rule-based optimization if AI is unavailable.
 *     tags: [Prompt Optimizer]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - originalPrompt
 *               - targetModel
 *               - mediaType
 *             properties:
 *               originalPrompt:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 5000
 *                 description: The original prompt to optimize
 *                 example: "draw me a very very nice cat image please"
 *               targetModel:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Target AI model (e.g., DALL-E 3, GPT-4, Claude, Midjourney)
 *                 example: "DALL-E 3"
 *               mediaType:
 *                 type: string
 *                 enum: [text, image, video, audio]
 *                 description: Type of media the prompt generates
 *                 example: "image"
 *     responses:
 *       200:
 *         description: Successfully optimized prompt
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     optimization:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         originalPrompt:
 *                           type: string
 *                           example: "draw me a very very nice cat image please"
 *                         optimizedPrompt:
 *                           type: string
 *                           example: "Create a cat image."
 *                         targetModel:
 *                           type: string
 *                         mediaType:
 *                           type: string
 *                         optimizationType:
 *                           type: string
 *                           enum: [quick, premium]
 *                         diagnosis:
 *                           type: object
 *                           nullable: true
 *                           description: Model's structured diagnosis (quick optimize only)
 *                           properties:
 *                             ambiguities: { type: array, items: { type: string } }
 *                             roleDefinition: { type: string }
 *                             variables: { type: array, items: { type: string } }
 *                             formattingConstraints: { type: array, items: { type: string } }
 *                             changes: { type: array, items: { type: string } }
 *                         lintChecks:
 *                           type: object
 *                           description: Deterministic pattern checks for the original (before) and rewritten (after) prompt. Not a score.
 *                           properties:
 *                             before: { type: array, items: { type: object, properties: { id: { type: string }, label: { type: string }, passed: { type: boolean }, hint: { type: string } } } }
 *                             after: { type: array, items: { type: object } }
 *                         intentWarnings:
 *                           type: array
 *                           description: Details in the result that may not come from your input (premium only)
 *                           items: { type: string }
 *                         metadata:
 *                           type: object
 *                           properties:
 *                             usedAI:
 *                               type: boolean
 *                               description: Whether AI was used for optimization
 *                             validationMessage:
 *                               type: string
 *                               description: Warning message if prompt is vague or has issues
 *                         analysis:
 *                           type: object
 *                         note:
 *                           type: string
 *                           description: Information message or validation warning
 *       400:
 *         description: Bad request - prompt is invalid, nonsensical, or unacceptable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 message:
 *                   type: string
 *                   example: "Prompt is not acceptable for optimization."
 *       401:
 *         description: Unauthorized - valid JWT cookie required
 */
router.post(
  '/quick-optimize',
  protect,
  aiLimiter,
  validate(quickOptimizeSchema, 'body'),
  requireQuota('quickOptimizations'),
  promptOptimizerController.quickOptimize,
);

/**
 * @swagger
 * /prompt-optimizer/analyze:
 *   post:
 *     summary: Analyze prompt and generate questions for premium optimization
 *     description: Analyzes the prompt to identify missing elements and generates 3-5 smart questions to help create a premium optimized prompt. Uses AI (Gemini) to generate context-aware questions.
 *     tags: [Prompt Optimizer]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - originalPrompt
 *               - targetModel
 *               - mediaType
 *             properties:
 *               originalPrompt:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 5000
 *                 description: The original prompt to analyze
 *                 example: "create image of cat"
 *               targetModel:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Target AI model
 *                 example: "DALL-E 3"
 *               mediaType:
 *                 type: string
 *                 enum: [text, image, video, audio]
 *                 description: Type of media the prompt generates
 *                 example: "image"
 *     responses:
 *       200:
 *         description: Successfully analyzed prompt and generated questions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     originalPrompt:
 *                       type: string
 *                     analysis:
 *                       type: object
 *                       properties:
 *                         completenessScore:
 *                           type: number
 *                         missingElements:
 *                           type: array
 *                           items:
 *                             type: string
 *                         grammarFixed:
 *                           type: boolean
 *                         structureImproved:
 *                           type: boolean
 *                     questions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           question:
 *                             type: string
 *                           type:
 *                             type: string
 *                             enum: [select, select_or_text, textarea]
 *                           priority:
 *                             type: string
 *                             enum: [high, medium, low]
 *                           options:
 *                             type: array
 *                             items:
 *                               type: object
 *                           default:
 *                             type: string
 *                           required:
 *                             type: boolean
 *                     additionalDetailsField:
 *                       type: object
 *                       properties:
 *                         question:
 *                           type: string
 *                         type:
 *                           type: string
 *                         placeholder:
 *                           type: string
 *                         required:
 *                           type: boolean
 *                     quickOptimized:
 *                       type: string
 *                       description: Quick optimized version as fallback
 *                     optimizationId:
 *                       type: string
 *                       description: ID to use when building the premium prompt
 *                     note:
 *                       type: string
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized - valid JWT cookie required
 *       500:
 *         description: Internal server error - AI service unavailable
 */
router.post(
  '/analyze',
  protect,
  aiLimiter,
  validate(analyzePromptSchema, 'body'),
  // A refinery session starts at analysis; the build step is part of it.
  requireQuota('refinerySessions'),
  promptOptimizerController.analyzePrompt,
);

/**
 * @swagger
 * /prompt-optimizer/build:
 *   post:
 *     summary: Build premium optimized prompt from user answers
 *     description: Builds a premium optimized prompt using user's answers to questions and additional details. Uses AI (Gemini) to intelligently combine all inputs while preserving user intent.
 *     tags: [Prompt Optimizer]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - originalPrompt
 *               - targetModel
 *               - mediaType
 *             properties:
 *               originalPrompt:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 5000
 *                 description: The original prompt (must match the one used in analyze)
 *                 example: "create image of cat"
 *               targetModel:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Target AI model
 *                 example: "DALL-E 3"
 *               mediaType:
 *                 type: string
 *                 enum: [text, image, video, audio]
 *                 description: Type of media
 *                 example: "image"
 *               answers:
 *                 type: object
 *                 description: User answers to questions (question ID as key)
 *                 additionalProperties:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [option, custom, default, skipped]
 *                     value:
 *                       type: string
 *                     customText:
 *                       type: string
 *                 example:
 *                   style:
 *                     type: "custom"
 *                     value: "watercolor with soft pastels"
 *                   composition:
 *                     type: "option"
 *                     value: "close_up"
 *                   background:
 *                     type: "default"
 *                     value: "natural"
 *               additionalDetails:
 *                 type: string
 *                 maxLength: 2000
 *                 description: Free-form additional details (colors, moods, specific details, etc.)
 *                 example: "orange tabby cat, golden hour lighting, cozy library atmosphere"
 *     responses:
 *       200:
 *         description: Successfully built optimized prompt
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     optimization:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         originalPrompt:
 *                           type: string
 *                         optimizedPrompt:
 *                           type: string
 *                         targetModel:
 *                           type: string
 *                         mediaType:
 *                           type: string
 *                         optimizationType:
 *                           type: string
 *                           enum: [quick, premium]
 *                         diagnosis:
 *                           type: object
 *                           nullable: true
 *                           description: Model's structured diagnosis (quick optimize only)
 *                           properties:
 *                             ambiguities: { type: array, items: { type: string } }
 *                             roleDefinition: { type: string }
 *                             variables: { type: array, items: { type: string } }
 *                             formattingConstraints: { type: array, items: { type: string } }
 *                             changes: { type: array, items: { type: string } }
 *                         lintChecks:
 *                           type: object
 *                           description: Deterministic pattern checks for the original (before) and rewritten (after) prompt. Not a score.
 *                           properties:
 *                             before: { type: array, items: { type: object, properties: { id: { type: string }, label: { type: string }, passed: { type: boolean }, hint: { type: string } } } }
 *                             after: { type: array, items: { type: object } }
 *                         intentWarnings:
 *                           type: array
 *                           description: Details in the result that may not come from your input (premium only)
 *                           items: { type: string }
 *                         metadata:
 *                           type: object
 *       400:
 *         description: Bad request - validation error or optimization not found
 *       401:
 *         description: Unauthorized - valid JWT cookie required
 *       404:
 *         description: No optimization found - please analyze the prompt first
 *       500:
 *         description: Internal server error - AI service unavailable
 */
router.post(
  '/build',
  protect,
  aiLimiter,
  validate(buildPromptSchema, 'body'),
  promptOptimizerController.buildPrompt,
);

/**
 * @swagger
 * /prompt-optimizer/history:
 *   get:
 *     summary: Get user's optimization history
 *     description: Retrieve paginated list of user's completed optimizations with optional filtering and statistics.
 *     tags: [Prompt Optimizer]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of items per page (max 100)
 *         example: 20
 *       - in: query
 *         name: targetModel
 *         schema:
 *           type: string
 *         description: Filter by target AI model (optional)
 *         example: "DALL-E 3"
 *       - in: query
 *         name: optimizationType
 *         schema:
 *           type: string
 *           enum: [quick, premium]
 *         description: Filter by optimization type (optional)
 *         example: "premium"
 *     responses:
 *       200:
 *         description: Successfully retrieved optimization history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     optimizations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           originalPrompt:
 *                             type: string
 *                           optimizedPrompt:
 *                             type: string
 *                           targetModel:
 *                             type: string
 *                           mediaType:
 *                             type: string
 *                           optimizationType:
 *                             type: string
 *                           diagnosis:
 *                             type: object
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalOptimizations:
 *                           type: integer
 *                         quickCount:
 *                           type: integer
 *                         premiumCount:
 *                           type: integer
 *       401:
 *         description: Unauthorized - valid JWT cookie required
 */
router.get(
  '/history',
  protect,
  validate(optimizationHistorySchema, 'query'),
  promptOptimizerController.getOptimizationHistory,
);

/**
 * @swagger
 * /prompt-optimizer/{id}:
 *   get:
 *     summary: Get specific optimization by ID
 *     description: Retrieve detailed information about a specific optimization including questions, answers, and quality metrics.
 *     tags: [Prompt Optimizer]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Optimization ID (MongoDB ObjectId)
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Successfully retrieved optimization
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     optimization:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         originalPrompt:
 *                           type: string
 *                         optimizedPrompt:
 *                           type: string
 *                         targetModel:
 *                           type: string
 *                         mediaType:
 *                           type: string
 *                         optimizationType:
 *                           type: string
 *                         questions:
 *                           type: array
 *                         userAnswers:
 *                           type: object
 *                         additionalDetails:
 *                           type: string
 *                         diagnosis:
 *                           type: object
 *                         lintChecks:
 *                           type: object
 *                         metadata:
 *                           type: object
 *                         analysis:
 *                           type: object
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       401:
 *         description: Unauthorized - valid JWT cookie required
 *       404:
 *         description: Optimization not found
 */
router.get(
  '/:id',
  protect,
  validate(getOptimizationSchema, 'params'),
  promptOptimizerController.getOptimization,
);

/**
 * @swagger
 * /prompt-optimizer/{id}:
 *   delete:
 *     summary: Delete optimization
 *     description: Delete an optimization record. Only the owner can delete their optimizations.
 *     tags: [Prompt Optimizer]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Optimization ID (MongoDB ObjectId)
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Successfully deleted optimization
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: "Optimization deleted successfully."
 *       401:
 *         description: Unauthorized - valid JWT cookie required
 *       404:
 *         description: Optimization not found
 */
router.delete(
  '/:id',
  protect,
  validate(getOptimizationSchema, 'params'),
  promptOptimizerController.deleteOptimization,
);

/**
 * @swagger
 * /prompt-optimizer/{id}/apply:
 *   post:
 *     summary: Apply optimization to create a new Prompt
 *     description: Creates a new Prompt in the system using the optimized prompt. Links the new prompt to the optimization record.
 *     tags: [Prompt Optimizer]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Optimization ID (MongoDB ObjectId)
 *         example: "507f1f77bcf86cd799439011"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 200
 *                 description: Title for the new prompt
 *                 example: "Optimized Cat Image Prompt"
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *                 description: Optional description
 *                 example: "A premium optimized prompt for generating cat images"
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 maxItems: 10
 *                 description: Tags for categorization
 *                 example: ["cat", "image", "optimized"]
 *               isPublic:
 *                 type: boolean
 *                 default: false
 *                 description: Whether the prompt should be publicly visible (private unless set)
 *                 example: false
 *     responses:
 *       201:
 *         description: Prompt created successfully from optimization
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     prompt:
 *                       $ref: '#/components/schemas/Prompt'
 *       400:
 *         description: Bad request - validation error or optimization not completed
 *       401:
 *         description: Unauthorized - valid JWT cookie required
 *       404:
 *         description: Optimization not found or not completed
 */
router.post(
  '/:id/apply',
  protect,
  validate(getOptimizationSchema, 'params'),
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'outputFiles', maxCount: 10 },
  ]), // Handle image upload if present (parses FormData into req.body)
  // Parse FormData arrays before validation
  (req: any, res: any, next: any) => {
    // Parse outputs array from FormData notation
    if (req.body && typeof req.body === 'object') {
      const outputs: any = {};
      Object.keys(req.body).forEach(key => {
        const match = key.match(/^outputs\[(\d+)\]\[(\w+)\]$/);
        if (match) {
          const index = parseInt(match[1]);
          const field = match[2];
          if (!outputs[index]) {
            outputs[index] = {};
          }
          outputs[index][field] = req.body[key];
          delete req.body[key];
        }
      });
      
      // Convert outputs object to array
      if (Object.keys(outputs).length > 0) {
        const outputsArray: any[] = [];
        Object.keys(outputs).sort((a, b) => parseInt(a) - parseInt(b)).forEach(key => {
          outputsArray[parseInt(key)] = outputs[key];
        });
        req.body.outputs = outputsArray.filter(o => o !== undefined);
      }
      
      // Parse outputIndices array from FormData notation (outputIndices[])
      if (req.body.outputIndices) {
        if (typeof req.body.outputIndices === 'string') {
          req.body.outputIndices = [req.body.outputIndices];
        } else if (Array.isArray(req.body.outputIndices)) {
          // Already an array
        } else if (typeof req.body.outputIndices === 'object') {
          // Convert object with numeric keys to array
          const indices: any[] = [];
          Object.keys(req.body.outputIndices).sort((a, b) => parseInt(a) - parseInt(b)).forEach(key => {
            const index = parseInt(key);
            if (!isNaN(index)) {
              indices[index] = req.body.outputIndices[key];
            }
          });
          req.body.outputIndices = indices.filter(i => i !== undefined);
        }
      }
    }
    next();
  },
  validate(applyOptimizationSchema, 'body'), // Validate after multer parses FormData
  promptOptimizerController.applyOptimization,
);

/**
 * @swagger
 * /prompt-optimizer/{id}/feedback:
 *   post:
 *     summary: Submit feedback on optimization
 *     description: Submit user feedback on the quality and helpfulness of an optimization. Used to improve the optimization system.
 *     tags: [Prompt Optimizer]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Optimization ID (MongoDB ObjectId)
 *         example: "507f1f77bcf86cd799439011"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rating
 *               - wasHelpful
 *             properties:
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Rating from 1 (poor) to 5 (excellent)
 *                 example: 5
 *               wasHelpful:
 *                 type: boolean
 *                 description: Whether the optimization was helpful
 *                 example: true
 *               comments:
 *                 type: string
 *                 maxLength: 500
 *                 description: Optional feedback comments
 *                 example: "The optimized prompt was exactly what I needed!"
 *     responses:
 *       200:
 *         description: Feedback submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Feedback submitted successfully."
 *                     feedback:
 *                       type: object
 *                       properties:
 *                         rating:
 *                           type: integer
 *                         wasHelpful:
 *                           type: boolean
 *                         comments:
 *                           type: string
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized - valid JWT cookie required
 *       404:
 *         description: Optimization not found
 */
router.post(
  '/:id/feedback',
  protect,
  validate(getOptimizationSchema, 'params'),
  validate(feedbackSchema, 'body'),
  promptOptimizerController.submitFeedback,
);

export default router;

