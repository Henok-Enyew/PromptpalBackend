import { Router } from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as billingController from '../controllers/billing.controller.js';
import { checkoutSchema } from '../validation/billing.schema.js';

// The webhook is mounted separately in app.ts (it needs the raw body).
const router = Router();

/**
 * @swagger
 * /billing/plans:
 *   get:
 *     summary: Plans, their monthly limits, and Pro prices from Lemon Squeezy
 *     tags: [Billing]
 *     description: Limits of null mean unlimited. Prices are omitted when billing isn't configured or the provider can't be reached.
 *     responses:
 *       200:
 *         description: Plans and whether checkout is available
 */
router.get('/plans', billingController.getPlans);

/**
 * @swagger
 * /billing/usage:
 *   get:
 *     summary: Current plan, limits and this month's usage
 *     tags: [Billing]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Plan, limits, usage counters, reset date and subscription status
 *       401:
 *         description: Not signed in
 */
router.get('/usage', protect, billingController.getUsage);

/**
 * @swagger
 * /billing/checkout:
 *   post:
 *     summary: Create a Lemon Squeezy checkout for Pro
 *     tags: [Billing]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               interval: { type: string, enum: [monthly, yearly], default: monthly }
 *     responses:
 *       200:
 *         description: "{ url } of the hosted checkout"
 *       409:
 *         description: Already on Pro
 *       503:
 *         description: Billing not configured
 */
router.post('/checkout', protect, validate(checkoutSchema), billingController.createCheckout);

/**
 * @swagger
 * /billing/portal:
 *   get:
 *     summary: Signed link to the Lemon Squeezy customer portal
 *     tags: [Billing]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: "{ url }"
 *       404:
 *         description: No subscription
 */
router.get('/portal', protect, billingController.getPortal);

export default router;
