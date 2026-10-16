import { Router } from 'express';
import { protect, restrictTo } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as analyticsController from '../controllers/analytics.controller.js';
import {
  getDashboardStatsSchema,
  getUserStatsSchema,
  getPromptStatsSchema,
  getCommentStatsSchema,
  getOptimizationStatsSchema,
  getGrowthMetricsSchema,
  getEngagementMetricsSchema,
  getOverviewStatsSchema,
} from '../validation/analytics.validation.js';

const router = Router();

// All analytics routes require admin authentication
router.use(protect, restrictTo('admin', 'superadmin'));

// ============================================================================
// DASHBOARD & OVERVIEW
// ============================================================================

/**
 * @swagger
 * /admin/analytics/dashboard:
 *   get:
 *     summary: Get complete dashboard statistics
 *     tags: [Analytics]
 *     description: Retrieve comprehensive dashboard data including overview, growth, and engagement metrics. Requires admin or superadmin role.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved dashboard statistics
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
 *                     overview:
 *                       type: object
 *                       properties:
 *                         totalUsers:
 *                           type: integer
 *                         totalPrompts:
 *                           type: integer
 *                         totalComments:
 *                           type: integer
 *                         totalOptimizations:
 *                           type: integer
 *                         activeUsers:
 *                           type: integer
 *                     growth:
 *                       type: object
 *                     engagement:
 *                       type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin role required
 */
router.get(
  '/dashboard',
  validate(getDashboardStatsSchema, 'query'),
  analyticsController.getDashboardStatsHandler,
);

/**
 * @swagger
 * /admin/analytics/overview:
 *   get:
 *     summary: Get quick overview statistics
 *     tags: [Analytics]
 *     description: Retrieve quick overview of platform statistics. Requires admin or superadmin role.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved overview statistics
 */
router.get(
  '/overview',
  validate(getOverviewStatsSchema, 'query'),
  analyticsController.getOverviewStatsHandler,
);

// ============================================================================
// PLATFORM STATISTICS
// ============================================================================

/**
 * @swagger
 * /admin/analytics/users:
 *   get:
 *     summary: Get user statistics
 *     tags: [Analytics]
 *     description: Retrieve detailed user statistics including counts by role, status, and verification. Requires admin or superadmin role.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved user statistics
 */
router.get(
  '/users',
  validate(getUserStatsSchema, 'query'),
  analyticsController.getUserStatsHandler,
);

/**
 * @swagger
 * /admin/analytics/prompts:
 *   get:
 *     summary: Get prompt statistics
 *     tags: [Analytics]
 *     description: Retrieve detailed prompt statistics including counts by media type and engagement metrics. Requires admin or superadmin role.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved prompt statistics
 */
router.get(
  '/prompts',
  validate(getPromptStatsSchema, 'query'),
  analyticsController.getPromptStatsHandler,
);

/**
 * @swagger
 * /admin/analytics/comments:
 *   get:
 *     summary: Get comment statistics
 *     tags: [Analytics]
 *     description: Retrieve detailed comment statistics including engagement metrics. Requires admin or superadmin role.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved comment statistics
 */
router.get(
  '/comments',
  validate(getCommentStatsSchema, 'query'),
  analyticsController.getCommentStatsHandler,
);

/**
 * @swagger
 * /admin/analytics/optimizations:
 *   get:
 *     summary: Get optimization statistics
 *     tags: [Analytics]
 *     description: Retrieve detailed optimization statistics including quality metrics and usage breakdown. Requires admin or superadmin role.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved optimization statistics
 */
router.get(
  '/optimizations',
  validate(getOptimizationStatsSchema, 'query'),
  analyticsController.getOptimizationStatsHandler,
);

// ============================================================================
// GROWTH METRICS
// ============================================================================

/**
 * @swagger
 * /admin/analytics/growth/users:
 *   get:
 *     summary: Get user growth metrics
 *     tags: [Analytics]
 *     description: Retrieve user growth over time with optional period filtering. Requires admin or superadmin role.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, year, custom]
 *           default: month
 *         description: Time period for growth metrics
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for custom period (ISO 8601)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for custom period (ISO 8601)
 *     responses:
 *       200:
 *         description: Successfully retrieved user growth metrics
 */
router.get(
  '/growth/users',
  validate(getGrowthMetricsSchema, 'query'),
  analyticsController.getUserGrowthHandler,
);

/**
 * @swagger
 * /admin/analytics/growth/prompts:
 *   get:
 *     summary: Get prompt growth metrics
 *     tags: [Analytics]
 *     description: Retrieve prompt growth over time. Requires admin or superadmin role.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, year, custom]
 *           default: month
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Successfully retrieved prompt growth metrics
 */
router.get(
  '/growth/prompts',
  validate(getGrowthMetricsSchema, 'query'),
  analyticsController.getPromptGrowthHandler,
);

/**
 * @swagger
 * /admin/analytics/growth/overview:
 *   get:
 *     summary: Get overall growth metrics
 *     tags: [Analytics]
 *     description: Retrieve growth metrics for all content types (users, prompts, comments, optimizations). Requires admin or superadmin role.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, year, custom]
 *           default: month
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Successfully retrieved overall growth metrics
 */
router.get(
  '/growth/overview',
  validate(getGrowthMetricsSchema, 'query'),
  analyticsController.getGrowthOverviewHandler,
);

// ============================================================================
// ENGAGEMENT METRICS
// ============================================================================

/**
 * @swagger
 * /admin/analytics/engagement/top-prompts:
 *   get:
 *     summary: Get top prompts by engagement
 *     tags: [Analytics]
 *     description: Retrieve most liked and viewed prompts. Requires admin or superadmin role.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Number of top prompts to return
 *     responses:
 *       200:
 *         description: Successfully retrieved top prompts
 */
router.get(
  '/engagement/top-prompts',
  validate(getEngagementMetricsSchema, 'query'),
  analyticsController.getTopPromptsHandler,
);

/**
 * @swagger
 * /admin/analytics/engagement/top-users:
 *   get:
 *     summary: Get top users by activity
 *     tags: [Analytics]
 *     description: Retrieve most active users and activity metrics. Requires admin or superadmin role.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Number of top users to return
 *     responses:
 *       200:
 *         description: Successfully retrieved top users
 */
router.get(
  '/engagement/top-users',
  validate(getEngagementMetricsSchema, 'query'),
  analyticsController.getTopUsersHandler,
);

/**
 * @swagger
 * /admin/analytics/engagement/activity:
 *   get:
 *     summary: Get user activity metrics
 *     tags: [Analytics]
 *     description: Retrieve daily, weekly, and monthly active user counts. Requires admin or superadmin role.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved activity metrics
 */
router.get(
  '/engagement/activity',
  analyticsController.getUserActivityHandler,
);

// ============================================================================
// OPTIMIZATION ANALYTICS
// ============================================================================

/**
 * @swagger
 * /admin/analytics/optimizations/usage:
 *   get:
 *     summary: Get optimization usage statistics
 *     tags: [Analytics]
 *     description: Retrieve optimization usage breakdown by type and media type. Requires admin or superadmin role.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved optimization usage statistics
 */
router.get(
  '/optimizations/usage',
  analyticsController.getOptimizationUsageHandler,
);

export default router;

