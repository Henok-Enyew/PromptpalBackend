import { Request, Response, NextFunction } from 'express';
import catchAsync from '../utils/catchAsync.util.js';
import * as analyticsService from '../services/analytics.service.js';
import {
  GetGrowthMetricsQuery,
  GetEngagementMetricsQuery,
} from '../validation/analytics.validation.js';

// ============================================================================
// DASHBOARD & OVERVIEW
// ============================================================================

export const getDashboardStatsHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const stats = await analyticsService.getDashboardStats();

    res.status(200).json({
      status: 'success',
      data: stats,
    });
  },
);

export const getOverviewStatsHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const stats = await analyticsService.getDashboardStats();

    res.status(200).json({
      status: 'success',
      data: {
        overview: stats.overview,
      },
    });
  },
);

// ============================================================================
// PLATFORM STATISTICS
// ============================================================================

export const getUserStatsHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const stats = await analyticsService.getUserStats();

    res.status(200).json({
      status: 'success',
      data: { stats },
    });
  },
);

export const getPromptStatsHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const stats = await analyticsService.getPromptStats();

    res.status(200).json({
      status: 'success',
      data: { stats },
    });
  },
);

export const getCommentStatsHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const stats = await analyticsService.getCommentStats();

    res.status(200).json({
      status: 'success',
      data: { stats },
    });
  },
);

export const getOptimizationStatsHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const stats = await analyticsService.getOptimizationStats();

    res.status(200).json({
      status: 'success',
      data: { stats },
    });
  },
);

// ============================================================================
// GROWTH METRICS
// ============================================================================

export const getGrowthMetricsHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const query = req.query as unknown as GetGrowthMetricsQuery;
    const { contentType, period, startDate, endDate } = query;

    const metrics = await analyticsService.getGrowthMetrics(
      contentType || 'users',
      period || 'month',
      startDate,
      endDate,
    );

    res.status(200).json({
      status: 'success',
      data: { metrics },
    });
  },
);

export const getUserGrowthHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const query = req.query as unknown as GetGrowthMetricsQuery;
    const { period, startDate, endDate } = query;

    const metrics = await analyticsService.getGrowthMetrics(
      'users',
      period || 'month',
      startDate,
      endDate,
    );

    res.status(200).json({
      status: 'success',
      data: { metrics },
    });
  },
);

export const getPromptGrowthHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const query = req.query as unknown as GetGrowthMetricsQuery;
    const { period, startDate, endDate } = query;

    const metrics = await analyticsService.getGrowthMetrics(
      'prompts',
      period || 'month',
      startDate,
      endDate,
    );

    res.status(200).json({
      status: 'success',
      data: { metrics },
    });
  },
);

export const getGrowthOverviewHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const query = req.query as unknown as GetGrowthMetricsQuery;
    const { period, startDate, endDate } = query;

    const [users, prompts, comments, optimizations] = await Promise.all([
      analyticsService.getGrowthMetrics(
        'users',
        period || 'month',
        startDate,
        endDate,
      ),
      analyticsService.getGrowthMetrics(
        'prompts',
        period || 'month',
        startDate,
        endDate,
      ),
      analyticsService.getGrowthMetrics(
        'comments',
        period || 'month',
        startDate,
        endDate,
      ),
      analyticsService.getGrowthMetrics(
        'optimizations',
        period || 'month',
        startDate,
        endDate,
      ),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        users,
        prompts,
        comments,
        optimizations,
      },
    });
  },
);

// ============================================================================
// ENGAGEMENT METRICS
// ============================================================================

export const getEngagementMetricsHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const query = req.query as unknown as GetEngagementMetricsQuery;
    const { limit = 10 } = query;

    const metrics = await analyticsService.getEngagementMetrics(limit);

    res.status(200).json({
      status: 'success',
      data: { metrics },
    });
  },
);

export const getTopPromptsHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const query = req.query as unknown as GetEngagementMetricsQuery;
    const { limit = 10 } = query;

    const metrics = await analyticsService.getEngagementMetrics(limit);

    res.status(200).json({
      status: 'success',
      data: {
        topPrompts: metrics.topPrompts,
        topPromptsByViews: metrics.topPrompts, // Same data for now
      },
    });
  },
);

export const getTopUsersHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const query = req.query as unknown as GetEngagementMetricsQuery;
    const { limit = 10 } = query;

    const metrics = await analyticsService.getEngagementMetrics(limit);

    res.status(200).json({
      status: 'success',
      data: {
        topUsers: metrics.topUsers,
        activity: metrics.activity,
      },
    });
  },
);

export const getUserActivityHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const metrics = await analyticsService.getEngagementMetrics(10);

    res.status(200).json({
      status: 'success',
      data: {
        activity: metrics.activity,
      },
    });
  },
);

// ============================================================================
// OPTIMIZATION ANALYTICS
// ============================================================================

export const getOptimizationUsageHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const stats = await analyticsService.getOptimizationStats();

    res.status(200).json({
      status: 'success',
      data: {
        usage: {
          byType: stats.byType,
          byMediaType: stats.byMediaType,
          total: stats.total,
          completed: stats.completed,
          failed: stats.failed,
        },
      },
    });
  },
);
