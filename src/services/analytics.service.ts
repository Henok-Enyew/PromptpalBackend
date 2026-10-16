import User from '../models/user.model.js';
import Prompt from '../models/prompt.model.js';
import Comment from '../models/comment.model.js';
import PromptOptimization from '../models/promptOptimization.model.js';
import { analyticsCache } from '../utils/cache.util.js';
import {
  DashboardStats,
  UserStats,
  PromptStats,
  CommentStats,
  OptimizationStats,
  GrowthMetrics,
  EngagementMetrics,
  TopContent,
  TopUser,
  TimePeriod,
  GroupBy,
} from '../types/analytics.types.js';

// ============================================================================
// DASHBOARD STATS
// ============================================================================

export const getDashboardStats = async (): Promise<DashboardStats> => {
  const cacheKey = 'analytics:dashboard';
  const cached = analyticsCache.get<DashboardStats>(cacheKey);
  if (cached) return cached;

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(now);
  monthStart.setDate(monthStart.getDate() - 30);

  // Get overview stats
  const [
    totalUsers,
    totalPrompts,
    totalComments,
    totalOptimizations,
    activeUsers,
  ] = await Promise.all([
    User.countDocuments({ isDeleted: { $ne: true } }),
    Prompt.countDocuments({ isDeleted: false }),
    Comment.countDocuments({ isDeleted: false }),
    PromptOptimization.countDocuments({ status: 'completed' }),
    User.countDocuments({
      updatedAt: { $gte: monthStart },
      isDeleted: { $ne: true },
    }),
  ]);

  // Get growth stats
  const [usersToday, usersThisWeek, usersThisMonth] = await Promise.all([
    User.countDocuments({
      createdAt: { $gte: todayStart },
      isDeleted: { $ne: true },
    }),
    User.countDocuments({
      createdAt: { $gte: weekStart },
      isDeleted: { $ne: true },
    }),
    User.countDocuments({
      createdAt: { $gte: monthStart },
      isDeleted: { $ne: true },
    }),
  ]);

  const [promptsToday, promptsThisWeek, promptsThisMonth] = await Promise.all([
    Prompt.countDocuments({
      createdAt: { $gte: todayStart },
      isDeleted: false,
    }),
    Prompt.countDocuments({
      createdAt: { $gte: weekStart },
      isDeleted: false,
    }),
    Prompt.countDocuments({
      createdAt: { $gte: monthStart },
      isDeleted: false,
    }),
  ]);

  const [commentsToday, commentsThisWeek, commentsThisMonth] =
    await Promise.all([
      Comment.countDocuments({
        createdAt: { $gte: todayStart },
        isDeleted: false,
      }),
      Comment.countDocuments({
        createdAt: { $gte: weekStart },
        isDeleted: false,
      }),
      Comment.countDocuments({
        createdAt: { $gte: monthStart },
        isDeleted: false,
      }),
    ]);

  const [optimizationsToday, optimizationsThisWeek, optimizationsThisMonth] =
    await Promise.all([
      PromptOptimization.countDocuments({
        createdAt: { $gte: todayStart },
        status: 'completed',
      }),
      PromptOptimization.countDocuments({
        createdAt: { $gte: weekStart },
        status: 'completed',
      }),
      PromptOptimization.countDocuments({
        createdAt: { $gte: monthStart },
        status: 'completed',
      }),
    ]);

  // Get engagement stats
  const engagementStats = await Prompt.aggregate([
    {
      $match: {
        isDeleted: false,
        isHidden: false,
      },
    },
    {
      $group: {
        _id: null,
        totalLikes: { $sum: { $size: '$likes' } },
        totalViews: { $sum: '$views' },
        totalShares: { $sum: '$shares' },
        promptCount: { $sum: 1 },
      },
    },
  ]);

  const engagement = engagementStats[0] || {
    totalLikes: 0,
    totalViews: 0,
    totalShares: 0,
    promptCount: 0,
  };

  const stats: DashboardStats = {
    overview: {
      totalUsers,
      totalPrompts,
      totalComments,
      totalOptimizations,
      activeUsers,
    },
    growth: {
      users: {
        today: usersToday,
        thisWeek: usersThisWeek,
        thisMonth: usersThisMonth,
      },
      prompts: {
        today: promptsToday,
        thisWeek: promptsThisWeek,
        thisMonth: promptsThisMonth,
      },
      comments: {
        today: commentsToday,
        thisWeek: commentsThisWeek,
        thisMonth: commentsThisMonth,
      },
      optimizations: {
        today: optimizationsToday,
        thisWeek: optimizationsThisWeek,
        thisMonth: optimizationsThisMonth,
      },
    },
    engagement: {
      totalLikes: engagement.totalLikes,
      totalViews: engagement.totalViews,
      totalShares: engagement.totalShares,
      avgLikesPerPrompt:
        engagement.promptCount > 0
          ? engagement.totalLikes / engagement.promptCount
          : 0,
      avgViewsPerPrompt:
        engagement.promptCount > 0
          ? engagement.totalViews / engagement.promptCount
          : 0,
    },
  };

  // Cache for 5 minutes
  analyticsCache.set(cacheKey, stats, 300);
  return stats;
};

// ============================================================================
// USER STATISTICS
// ============================================================================

export const getUserStats = async (): Promise<UserStats> => {
  const cacheKey = 'analytics:users';
  const cached = analyticsCache.get<UserStats>(cacheKey);
  if (cached) return cached;

  const stats = await User.aggregate([
    {
      $match: {
        isDeleted: { $ne: true },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pending: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
        },
        approved: {
          $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] },
        },
        blocked: {
          $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] },
        },
        userRole: {
          $sum: { $cond: [{ $eq: ['$role', 'user'] }, 1, 0] },
        },
        adminRole: {
          $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] },
        },
        superadminRole: {
          $sum: { $cond: [{ $eq: ['$role', 'superadmin'] }, 1, 0] },
        },
        emailVerified: {
          $sum: { $cond: ['$isEmailVerified', 1, 0] },
        },
      },
    },
  ]);

  const result = stats[0] || {
    total: 0,
    pending: 0,
    approved: 0,
    blocked: 0,
    userRole: 0,
    adminRole: 0,
    superadminRole: 0,
    emailVerified: 0,
  };

  const activeUsers = await User.countDocuments({
    updatedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    isDeleted: { $ne: true },
  });

  const userStats: UserStats = {
    total: result.total,
    active: activeUsers,
    pending: result.pending,
    approved: result.approved,
    blocked: result.blocked,
    byRole: {
      user: result.userRole,
      admin: result.adminRole,
      superadmin: result.superadminRole,
    },
    verified: {
      email: result.emailVerified,
    },
  };

  // Cache for 10 minutes
  analyticsCache.set(cacheKey, userStats, 600);
  return userStats;
};

// ============================================================================
// PROMPT STATISTICS
// ============================================================================

export const getPromptStats = async (): Promise<PromptStats> => {
  const cacheKey = 'analytics:prompts';
  const cached = analyticsCache.get<PromptStats>(cacheKey);
  if (cached) return cached;

  const stats = await Prompt.aggregate([
    {
      $match: {
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        public: {
          $sum: { $cond: ['$isPublic', 1, 0] },
        },
        hidden: {
          $sum: { $cond: ['$isHidden', 1, 0] },
        },
        text: {
          $sum: { $cond: [{ $eq: ['$mediaType', 'text'] }, 1, 0] },
        },
        image: {
          $sum: { $cond: [{ $eq: ['$mediaType', 'image'] }, 1, 0] },
        },
        video: {
          $sum: { $cond: [{ $eq: ['$mediaType', 'video'] }, 1, 0] },
        },
        audio: {
          $sum: { $cond: [{ $eq: ['$mediaType', 'audio'] }, 1, 0] },
        },
        totalLikes: { $sum: { $size: '$likes' } },
        totalViews: { $sum: '$views' },
        totalShares: { $sum: '$shares' },
        promptCount: { $sum: 1 },
      },
    },
  ]);

  const result = stats[0] || {
    total: 0,
    public: 0,
    hidden: 0,
    text: 0,
    image: 0,
    video: 0,
    audio: 0,
    totalLikes: 0,
    totalViews: 0,
    totalShares: 0,
    promptCount: 0,
  };

  const deletedCount = await Prompt.countDocuments({ isDeleted: true });

  const promptStats: PromptStats = {
    total: result.total,
    public: result.public,
    hidden: result.hidden,
    deleted: deletedCount,
    byMediaType: {
      text: result.text,
      image: result.image,
      video: result.video,
      audio: result.audio,
    },
    engagement: {
      totalLikes: result.totalLikes,
      totalViews: result.totalViews,
      totalShares: result.totalShares,
      avgLikes:
        result.promptCount > 0 ? result.totalLikes / result.promptCount : 0,
      avgViews:
        result.promptCount > 0 ? result.totalViews / result.promptCount : 0,
    },
  };

  // Cache for 10 minutes
  analyticsCache.set(cacheKey, promptStats, 600);
  return promptStats;
};

// ============================================================================
// COMMENT STATISTICS
// ============================================================================

export const getCommentStats = async (): Promise<CommentStats> => {
  const cacheKey = 'analytics:comments';
  const cached = analyticsCache.get<CommentStats>(cacheKey);
  if (cached) return cached;

  const stats = await Comment.aggregate([
    {
      $match: {
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        hidden: {
          $sum: { $cond: ['$isHidden', 1, 0] },
        },
        totalLikes: { $sum: { $size: '$likes' } },
        commentCount: { $sum: 1 },
      },
    },
  ]);

  const result = stats[0] || {
    total: 0,
    hidden: 0,
    totalLikes: 0,
    commentCount: 0,
  };

  const deletedCount = await Comment.countDocuments({ isDeleted: true });

  const commentStats: CommentStats = {
    total: result.total,
    visible: result.total - result.hidden,
    hidden: result.hidden,
    deleted: deletedCount,
    engagement: {
      totalLikes: result.totalLikes,
      avgLikes:
        result.commentCount > 0
          ? result.totalLikes / result.commentCount
          : 0,
    },
  };

  // Cache for 10 minutes
  analyticsCache.set(cacheKey, commentStats, 600);
  return commentStats;
};

// ============================================================================
// OPTIMIZATION STATISTICS
// ============================================================================

export const getOptimizationStats = async (): Promise<OptimizationStats> => {
  const cacheKey = 'analytics:optimizations';
  const cached = analyticsCache.get<OptimizationStats>(cacheKey);
  if (cached) return cached;

  const stats = await PromptOptimization.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
        },
        quick: {
          $sum: { $cond: [{ $eq: ['$optimizationType', 'quick'] }, 1, 0] },
        },
        premium: {
          $sum: { $cond: [{ $eq: ['$optimizationType', 'premium'] }, 1, 0] },
        },
        text: {
          $sum: { $cond: [{ $eq: ['$mediaType', 'text'] }, 1, 0] },
        },
        image: {
          $sum: { $cond: [{ $eq: ['$mediaType', 'image'] }, 1, 0] },
        },
        video: {
          $sum: { $cond: [{ $eq: ['$mediaType', 'video'] }, 1, 0] },
        },
        audio: {
          $sum: { $cond: [{ $eq: ['$mediaType', 'audio'] }, 1, 0] },
        },
        avgBefore: {
          $avg: '$qualityScore.before',
        },
        avgAfter: {
          $avg: '$qualityScore.after',
        },
      },
    },
  ]);

  const result = stats[0] || {
    total: 0,
    completed: 0,
    failed: 0,
    quick: 0,
    premium: 0,
    text: 0,
    image: 0,
    video: 0,
    audio: 0,
    avgBefore: 0,
    avgAfter: 0,
  };

  const optimizationStats: OptimizationStats = {
    total: result.total,
    completed: result.completed,
    failed: result.failed,
    byType: {
      quick: result.quick,
      premium: result.premium,
    },
    quality: {
      avgBefore: result.avgBefore || 0,
      avgAfter: result.avgAfter || 0,
      avgImprovement: (result.avgAfter || 0) - (result.avgBefore || 0),
    },
    byMediaType: {
      text: result.text,
      image: result.image,
      video: result.video,
      audio: result.audio,
    },
  };

  // Cache for 15 minutes
  analyticsCache.set(cacheKey, optimizationStats, 900);
  return optimizationStats;
};

// ============================================================================
// GROWTH METRICS
// ============================================================================

export const getGrowthMetrics = async (
  contentType: 'users' | 'prompts' | 'comments' | 'optimizations',
  period: TimePeriod = 'month',
  startDate?: string,
  endDate?: string,
): Promise<GrowthMetrics> => {
  const cacheKey = `analytics:growth:${contentType}:${period}:${startDate || ''}:${endDate || ''}`;
  const cached = analyticsCache.get<GrowthMetrics>(cacheKey);
  if (cached) return cached;

  let dateFilter: any = {};
  let groupByFormat: string;

  const now = new Date();
  let periodStart: Date;

  switch (period) {
    case 'day':
      periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 30);
      groupByFormat = '%Y-%m-%d';
      break;
    case 'week':
      periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 12 * 7);
      groupByFormat = '%Y-%U';
      break;
    case 'month':
      periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 12 * 30);
      groupByFormat = '%Y-%m';
      break;
    case 'year':
      periodStart = new Date(now);
      periodStart.setFullYear(periodStart.getFullYear() - 5);
      groupByFormat = '%Y';
      break;
    case 'custom': {
      if (!startDate || !endDate) {
        throw new Error('Start date and end date are required for custom period');
      }
      periodStart = new Date(startDate);
      const periodEnd = new Date(endDate);
      dateFilter = {
        createdAt: { $gte: periodStart, $lte: periodEnd },
      };
      groupByFormat = '%Y-%m-%d';
      break;
    }
    default:
      periodStart = new Date(now.setDate(now.getDate() - 30));
      groupByFormat = '%Y-%m-%d';
  }

  if (period !== 'custom') {
    dateFilter = { createdAt: { $gte: periodStart } };
  }

  const Model =
    contentType === 'users'
      ? User
      : contentType === 'prompts'
        ? Prompt
        : contentType === 'comments'
          ? Comment
          : PromptOptimization;

  const baseFilter: any = {
    ...dateFilter,
  };

  if (contentType === 'users') {
    baseFilter.isDeleted = { $ne: true };
  } else if (contentType === 'prompts' || contentType === 'comments') {
    baseFilter.isDeleted = false;
  } else {
    baseFilter.status = 'completed';
  }

  const pipeline: any[] = [
    { $match: baseFilter },
    {
      $group: {
        _id: {
          $dateToString: {
            format: groupByFormat,
            date: '$createdAt',
          },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ];

  const data = await Model.aggregate(pipeline);

  const total = data.reduce((sum, item) => sum + item.count, 0);
  const firstCount = data[0]?.count || 0;
  const lastCount = data[data.length - 1]?.count || 0;
  const change = lastCount - firstCount;
  const percentage =
    firstCount > 0 ? Number(((change / firstCount) * 100).toFixed(2)) : 0;

  const growthMetrics: GrowthMetrics = {
    period,
    data: data.map((item) => ({
      date: item._id,
      count: item.count,
    })),
    total,
    change: {
      absolute: change,
      percentage: percentage,
    },
  };

  // Cache for 15 minutes
  analyticsCache.set(cacheKey, growthMetrics, 900);
  return growthMetrics;
};

// ============================================================================
// ENGAGEMENT METRICS
// ============================================================================

export const getEngagementMetrics = async (
  limit: number = 10,
): Promise<EngagementMetrics> => {
  const cacheKey = `analytics:engagement:${limit}`;
  const cached = analyticsCache.get<EngagementMetrics>(cacheKey);
  if (cached) return cached;

  // Top prompts by likes
  const topPromptsByLikes = await Prompt.aggregate([
    {
      $match: {
        isDeleted: false,
        isHidden: false,
      },
    },
    {
      $addFields: {
        likesCount: { $size: '$likes' },
      },
    },
    { $sort: { likesCount: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    {
      $project: {
        _id: 1,
        title: 1,
        promptText: 1,
        likesCount: 1,
        viewsCount: '$views',
        sharesCount: '$shares',
        createdAt: 1,
        user: {
          _id: '$user._id',
          firstName: '$user.firstName',
          lastName: '$user.lastName',
          email: '$user.email',
        },
      },
    },
  ]);

  // Top prompts by views
  const topPromptsByViews = await Prompt.aggregate([
    {
      $match: {
        isDeleted: false,
        isHidden: false,
      },
    },
    { $sort: { views: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    {
      $project: {
        _id: 1,
        title: 1,
        promptText: 1,
        likesCount: { $size: '$likes' },
        viewsCount: '$views',
        sharesCount: '$shares',
        createdAt: 1,
        user: {
          _id: '$user._id',
          firstName: '$user.firstName',
          lastName: '$user.lastName',
          email: '$user.email',
        },
      },
    },
  ]);

  // Top comments by likes
  const topComments = await Comment.aggregate([
    {
      $match: {
        isDeleted: false,
        isHidden: false,
      },
    },
    {
      $addFields: {
        likesCount: { $size: '$likes' },
      },
    },
    { $sort: { likesCount: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    {
      $project: {
        _id: 1,
        text: 1,
        likesCount: 1,
        createdAt: 1,
        user: {
          _id: '$user._id',
          firstName: '$user.firstName',
          lastName: '$user.lastName',
          email: '$user.email',
        },
      },
    },
  ]);

  // Top users by activity
  const topUsers = await User.aggregate([
    {
      $match: {
        isDeleted: { $ne: true },
      },
    },
    {
      $lookup: {
        from: 'prompts',
        localField: '_id',
        foreignField: 'user',
        as: 'prompts',
      },
    },
    {
      $lookup: {
        from: 'comments',
        localField: '_id',
        foreignField: 'user',
        as: 'comments',
      },
    },
    {
      $addFields: {
        promptsCount: {
          $size: {
            $filter: {
              input: '$prompts',
              cond: { $eq: ['$$this.isDeleted', false] },
            },
          },
        },
        commentsCount: {
          $size: {
            $filter: {
              input: '$comments',
              cond: { $eq: ['$$this.isDeleted', false] },
            },
          },
        },
      },
    },
    {
      $addFields: {
        totalActivity: {
          $add: ['$promptsCount', '$commentsCount'],
        },
      },
    },
    { $sort: { totalActivity: -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 1,
        firstName: 1,
        lastName: 1,
        email: 1,
        promptsCount: 1,
        commentsCount: 1,
        likesReceived: 0, // Would need additional aggregation
        totalActivity: 1,
      },
    },
  ]);

  // Calculate active users
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(now);
  monthStart.setDate(monthStart.getDate() - 30);

  const [dailyActive, weeklyActive, monthlyActive] = await Promise.all([
    User.countDocuments({
      updatedAt: { $gte: dayStart },
      isDeleted: { $ne: true },
    }),
    User.countDocuments({
      updatedAt: { $gte: weekStart },
      isDeleted: { $ne: true },
    }),
    User.countDocuments({
      updatedAt: { $gte: monthStart },
      isDeleted: { $ne: true },
    }),
  ]);

  const engagementMetrics: EngagementMetrics = {
    topPrompts: topPromptsByLikes as TopContent[],
    topComments: topComments as TopContent[],
    topUsers: topUsers as TopUser[],
    activity: {
      dailyActiveUsers: dailyActive,
      weeklyActiveUsers: weeklyActive,
      monthlyActiveUsers: monthlyActive,
    },
  };

  // Cache for 10 minutes
  analyticsCache.set(cacheKey, engagementMetrics, 600);
  return engagementMetrics;
};

