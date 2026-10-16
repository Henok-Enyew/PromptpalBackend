export type TimePeriod = 'day' | 'week' | 'month' | 'year' | 'custom';

export type GroupBy = 'day' | 'week' | 'month';

export interface DashboardStats {
  overview: {
    totalUsers: number;
    totalPrompts: number;
    totalComments: number;
    totalOptimizations: number;
    activeUsers: number;
  };
  growth: {
    users: {
      today: number;
      thisWeek: number;
      thisMonth: number;
    };
    prompts: {
      today: number;
      thisWeek: number;
      thisMonth: number;
    };
    comments: {
      today: number;
      thisWeek: number;
      thisMonth: number;
    };
    optimizations: {
      today: number;
      thisWeek: number;
      thisMonth: number;
    };
  };
  engagement: {
    totalLikes: number;
    totalViews: number;
    totalShares: number;
    avgLikesPerPrompt: number;
    avgViewsPerPrompt: number;
  };
}

export interface UserStats {
  total: number;
  active: number;
  pending: number;
  approved: number;
  blocked: number;
  byRole: {
    user: number;
    admin: number;
    superadmin: number;
  };
  verified: {
    email: number;
  };
}

export interface PromptStats {
  total: number;
  public: number;
  hidden: number;
  deleted: number;
  byMediaType: {
    text: number;
    image: number;
    video: number;
    audio: number;
  };
  engagement: {
    totalLikes: number;
    totalViews: number;
    totalShares: number;
    avgLikes: number;
    avgViews: number;
  };
}

export interface CommentStats {
  total: number;
  visible: number;
  hidden: number;
  deleted: number;
  engagement: {
    totalLikes: number;
    avgLikes: number;
  };
}

export interface OptimizationStats {
  total: number;
  completed: number;
  failed: number;
  byType: {
    quick: number;
    premium: number;
  };
  quality: {
    avgBefore: number;
    avgAfter: number;
    avgImprovement: number;
  };
  byMediaType: {
    text: number;
    image: number;
    video: number;
    audio: number;
  };
}

export interface GrowthDataPoint {
  date: string;
  count: number;
}

export interface GrowthMetrics {
  period: TimePeriod;
  data: GrowthDataPoint[];
  total: number;
  change: {
    absolute: number;
    percentage: number;
  };
}

export interface TopContent {
  _id: string;
  title?: string;
  promptText?: string;
  text?: string;
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  likesCount: number;
  viewsCount?: number;
  sharesCount?: number;
  createdAt: Date;
}

export interface TopUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  promptsCount: number;
  commentsCount: number;
  likesReceived: number;
  totalActivity: number;
}

export interface EngagementMetrics {
  topPrompts: TopContent[];
  topComments: TopContent[];
  topUsers: TopUser[];
  activity: {
    dailyActiveUsers: number;
    weeklyActiveUsers: number;
    monthlyActiveUsers: number;
  };
}

