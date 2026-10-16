import { Router } from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { aiLimiter } from '../middleware/rateLimit.middleware.js';
import { requireQuota } from '../middleware/quota.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as evaluationController from '../controllers/evaluation.controller.js';
import {
  evaluationParamsSchema,
  listEvaluationsQuerySchema,
  runEvaluationSchema,
} from '../validation/evaluation.schema.js';

const router = Router();
router.use(protect);

/**
 * @swagger
 * /evaluations/options:
 *   get:
 *     summary: Models available for benchmarking and the default judge
 *     tags: [Evaluations]
 *     responses:
 *       200:
 *         description: Available models (only providers configured on this server)
 */
router.get('/options', evaluationController.getOptions);

/**
 * @swagger
 * /evaluations:
 *   post:
 *     summary: Run a prompt on 1-3 models in parallel and judge each output (Server-Sent Events)
 *     tags: [Evaluations]
 *     description: >
 *       Responds with text/event-stream. Events - run.started, model.delta, model.done,
 *       model.error, judge.result, judge.error, run.done, run.error. Validation errors
 *       (unknown models, unfilled {{variables}}) return a normal 400 JSON response.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [promptText, models]
 *             properties:
 *               promptText:
 *                 type: string
 *               variables:
 *                 type: object
 *                 additionalProperties:
 *                   type: string
 *               models:
 *                 type: array
 *                 items:
 *                   type: string
 *                   example: google:gemini-2.5-flash
 *               criteria:
 *                 type: string
 *               promptId:
 *                 type: string
 *               versionNumber:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Event stream
 *       400:
 *         description: Invalid request
 *   get:
 *     summary: Your past benchmark runs (newest first)
 *     tags: [Evaluations]
 *     responses:
 *       200:
 *         description: Runs with scores (outputs omitted)
 */
router.post('/', aiLimiter, validate(runEvaluationSchema), requireQuota('benchmarkRuns'), evaluationController.runEvaluation);
router.get('/', validate(listEvaluationsQuerySchema, 'query'), evaluationController.listRuns);

/**
 * @swagger
 * /evaluations/{id}:
 *   get:
 *     summary: One of your benchmark runs with full outputs
 *     tags: [Evaluations]
 *     responses:
 *       200:
 *         description: The run
 *       404:
 *         description: Not found (or not yours)
 */
router.get('/:id', validate(evaluationParamsSchema, 'params'), evaluationController.getRun);

export default router;
