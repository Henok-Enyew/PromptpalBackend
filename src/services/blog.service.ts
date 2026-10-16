import BlogPost from '../models/blog.model.js';
import { PUBLIC_AUTHOR_FIELDS } from '../utils/user.util.js';
import Comment from '../models/comment.model.js';
import AppError from '../utils/appError.util.js';
import logger from '../config/logger.config.js';
import { generateUniqueSlug } from '../utils/slug.util.js';
import { calculateReadingTime } from '../utils/readingTime.util.js';
import { calculateTrendingScore } from '../utils/blogHelpers.util.js';
import { shouldCountView } from '../utils/viewTracking.util.js';
import {
  CreateBlogInput,
  UpdateBlogInput,
  BlogQueryParams,
  AddSectionInput,
  UpdateSectionInput,
} from '../validation/blog.schema.js';
import { IBlogSection } from '../types/blog.types.js';
import mongoose from 'mongoose';
import { Request } from 'express';

/**
 * Create a new blog post
 */
export const createBlog = async (userId: string, input: any) => {
  // Generate unique slug from title
  const slug = await generateUniqueSlug(input.title as string, BlogPost);

  // Calculate reading time
  const readingTime = calculateReadingTime(input.sections as IBlogSection[]);

  // Create blog post
  const blogData: any = {
    ...input,
    author: userId,
    slug,
    readingTime,
    publishDate: input.status === 'published' ? new Date() : undefined,
  };

  const blog = await BlogPost.create(blogData);

  await blog.populate({
    path: 'author',
    select: PUBLIC_AUTHOR_FIELDS,
  });

  logger.info(`Blog created: ${blog._id} by user ${userId}`);

  return blog;
};

/**
 * Get paginated list of blog posts
 */
export const getBlogs = async (query: BlogQueryParams, userId?: string) => {
  const {
    page = 1,
    limit = 10,
    category,
    tags,
    author,
    search,
    sort = 'latest',
    status,
  } = query;

  const filter: any = {
    isDeleted: false,
  };

  // Public users only see published, non-hidden blogs
  if (!userId) {
    filter.status = 'published';
    filter.isPublic = true;
    filter.isHidden = false;
  } else if (status) {
    filter.status = status;
  } else {
    // Logged-in users see published and their own drafts
    filter.$or = [
      { status: 'published', isPublic: true, isHidden: false },
      { author: userId, status: { $in: ['draft', 'published'] } },
    ];
  }

  // Apply filters
  if (category) {
    filter.category = category;
  }

  if (tags && typeof tags === 'string') {
    const tagArray = tags.split(',').map((t: string) => t.trim());
    filter.tags = { $in: tagArray };
  }

  if (author) {
    filter.author = author;
  }

  if (search) {
    filter.$text = { $search: search };
  }

  const skip = (page - 1) * limit;

  // Build query
  let queryBuilder = BlogPost.find(filter)
    .populate({
      path: 'author',
      select: PUBLIC_AUTHOR_FIELDS,
    })
    .skip(skip)
    .limit(limit);

  // Apply sorting
  if (sort === 'popular') {
    queryBuilder = queryBuilder.sort({ views: -1, likes: -1, createdAt: -1 });
  } else if (sort === 'trending') {
    // For trending, we'll calculate scores in memory after fetching
    queryBuilder = queryBuilder.sort({ publishDate: -1 }).limit(limit * 3); // Fetch more for filtering
  } else {
    // Default: latest
    queryBuilder = queryBuilder.sort({ publishDate: -1, createdAt: -1 });
  }

  if (search) {
    queryBuilder = queryBuilder.sort({ score: { $meta: 'textScore' } });
  }

  let blogs = await queryBuilder;

  // Calculate trending scores if needed
  if (sort === 'trending') {
    const blogsWithScores = blogs
      .map((blog) => ({
        blog,
        score: calculateTrendingScore(blog),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.blog);

    blogs = blogsWithScores;
  }

  const total = await BlogPost.countDocuments(filter);

  // Get comment counts efficiently
  const blogIds = blogs.map((b) => b._id);
  const commentCounts = await Comment.aggregate([
    {
      $match: {
        contentId: { $in: blogIds },
        contentType: 'blog',
        isDeleted: false,
        isHidden: false,
      },
    },
    { $group: { _id: '$contentId', count: { $sum: 1 } } },
  ]);

  const commentCountMap = new Map(
    commentCounts.map((item) => [item._id.toString(), item.count]),
  );

  // Format response
  const blogsWithCounts = blogs.map((blog) => {
    const blogObj = blog.toObject();
    // Check if user liked this blog
    let isLikedByUser = false;
    if (userId) {
      isLikedByUser = blog.likes.some((id) => id.toString() === userId);
    }
    return {
      ...blogObj,
      likesCount: blog.likes?.length || 0,
      commentCount: commentCountMap.get(blog._id.toString()) || 0,
      sharesCount: blog.shares || 0,
      isLikedByUser,
    };
  });

  return {
    blogs: blogsWithCounts,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    limit,
  };
};

/**
 * Get single blog by slug
 */
export const getBlogBySlug = async (
  slug: string,
  userId?: string,
  req?: Request,
) => {
  const blog = await BlogPost.findOne({
    slug,
    isDeleted: false,
  })
    .populate({
      path: 'author',
      select: PUBLIC_AUTHOR_FIELDS,
    })
    .populate({
      path: 'upNext',
      select: 'title slug coverImage category',
    });

  if (!blog) {
    throw new AppError('Blog post not found.', 404);
  }

  // Check permissions
  if (
    blog.isHidden ||
    blog.status !== 'published' ||
    !blog.isPublic
  ) {
    // Only author and admins can view
    if (!userId || blog.author._id.toString() !== userId) {
      throw new AppError('Blog post not found.', 404);
    }
  }

  // Increment view count with IP throttling (only count once per IP per 5 minutes)
  if (req && shouldCountView(blog._id.toString(), req, 5)) {
    blog.views += 1;
    await blog.save();
  }

  // Get comment count
  const commentCount = await Comment.countDocuments({
    contentId: blog._id,
    contentType: 'blog',
    isDeleted: false,
  });

  // Check if user liked this blog
  let isLikedByUser = false;
  if (userId) {
    isLikedByUser = blog.likes.some((id) => id.toString() === userId);
  }

  const blogObj = blog.toObject();

  return {
    ...blogObj,
    likesCount: blog.likes?.length || 0,
    commentCount,
    sharesCount: blog.shares || 0,
    isLikedByUser,
  };
};

/**
 * Get single blog by ID
 */
export const getBlogById = async (blogId: string, userId?: string) => {
  const blog = await BlogPost.findOne({
    _id: blogId,
    isDeleted: false,
  })
    .populate({
      path: 'author',
      select: PUBLIC_AUTHOR_FIELDS,
    })
    .populate({
      path: 'upNext',
      select: 'title slug coverImage category',
    });

  if (!blog) {
    throw new AppError('Blog post not found.', 404);
  }

  // Check permissions
  if (blog.isHidden || blog.status !== 'published' || !blog.isPublic) {
    if (!userId || blog.author._id.toString() !== userId) {
      throw new AppError('Blog post not found.', 404);
    }
  }

  const commentCount = await Comment.countDocuments({
    contentId: blog._id,
    contentType: 'blog',
    isDeleted: false,
  });

  let isLikedByUser = false;
  if (userId) {
    isLikedByUser = blog.likes.some((id) => id.toString() === userId);
  }

  const blogObj = blog.toObject();

  return {
    ...blogObj,
    likesCount: blog.likes?.length || 0,
    commentCount,
    sharesCount: blog.shares || 0,
    isLikedByUser,
  };
};

/**
 * Update blog post
 */
export const updateBlog = async (
  blogId: string,
  userId: string,
  input: any,
  userRole: string,
) => {
  const blog = await BlogPost.findOne({
    _id: blogId,
    isDeleted: false,
  });

  if (!blog) {
    throw new AppError('Blog post not found.', 404);
  }

  // Check permissions
  const isAuthor = blog.author.toString() === userId;
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  if (!isAuthor && !isAdmin) {
    throw new AppError('You do not have permission to update this blog.', 403);
  }

  // Update slug if title changed
  if (input.title && input.title !== blog.title) {
    blog.slug = await generateUniqueSlug(input.title as string, BlogPost, String(blogId));
  }

  // Recalculate reading time if sections changed
  if (input.sections) {
    blog.readingTime = calculateReadingTime(input.sections as IBlogSection[]);
  }

  // Update publish date if status changed to published
  if (input.status === 'published' && blog.status !== 'published') {
    blog.publishDate = new Date();
  }

  // Apply updates
  Object.assign(blog, input);

  await blog.save();

  await blog.populate({
    path: 'author',
    select: PUBLIC_AUTHOR_FIELDS,
  });

  logger.info(`Blog updated: ${blog._id} by user ${userId}`);

  return blog;
};

/**
 * Delete blog post (soft delete)
 */
export const deleteBlog = async (
  blogId: string,
  userId: string,
  userRole: string,
) => {
  const blog = await BlogPost.findOne({
    _id: blogId,
    isDeleted: false,
  });

  if (!blog) {
    throw new AppError('Blog post not found.', 404);
  }

  const isAuthor = blog.author.toString() === userId;
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  if (!isAuthor && !isAdmin) {
    throw new AppError('You do not have permission to delete this blog.', 403);
  }

  blog.isDeleted = true;
  blog.deletedAt = new Date();
  blog.deletedBy = new mongoose.Types.ObjectId(userId);

  await blog.save();

  logger.info(`Blog deleted: ${blog._id} by user ${userId}`);

  return { message: 'Blog post deleted successfully.' };
};

/**
 * Add section to blog post
 */
export const addSection = async (
  blogId: string,
  userId: string,
  input: AddSectionInput,
  userRole: string,
) => {
  const blog = await BlogPost.findOne({
    _id: blogId,
    isDeleted: false,
  });

  if (!blog) {
    throw new AppError('Blog post not found.', 404);
  }

  const isAuthor = blog.author.toString() === userId;
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  if (!isAuthor && !isAdmin) {
    throw new AppError('You do not have permission to modify this blog.', 403);
  }

  // Add section
  (blog.sections as any).push(input);

  // Recalculate reading time
  blog.readingTime = calculateReadingTime(blog.sections);

  await blog.save();

  logger.info(`Section added to blog: ${blog._id}`);

  return blog;
};

/**
 * Update specific section
 */
export const updateSection = async (
  blogId: string,
  sectionId: string,
  userId: string,
  input: UpdateSectionInput,
  userRole: string,
) => {
  const blog = await BlogPost.findOne({
    _id: blogId,
    isDeleted: false,
  });

  if (!blog) {
    throw new AppError('Blog post not found.', 404);
  }

  const isAuthor = blog.author.toString() === userId;
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  if (!isAuthor && !isAdmin) {
    throw new AppError('You do not have permission to modify this blog.', 403);
  }

  // Find section
  const section = blog.sections.find((s) => s._id?.toString() === sectionId);

  if (!section) {
    throw new AppError('Section not found.', 404);
  }

  // Update section
  Object.assign(section, input);

  // Recalculate reading time
  blog.readingTime = calculateReadingTime(blog.sections);

  await blog.save();

  logger.info(`Section updated in blog: ${blog._id}`);

  return blog;
};

/**
 * Reorder sections in blog post
 */
export const reorderSections = async (
  blogId: string,
  sectionIds: string[],
  userId: string,
  userRole: string,
) => {
  const blog = await BlogPost.findOne({
    _id: blogId,
    isDeleted: false,
  });

  if (!blog) {
    throw new AppError('Blog post not found.', 404);
  }

  const isAuthor = blog.author.toString() === userId;
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  if (!isAuthor && !isAdmin) {
    throw new AppError('You do not have permission to modify this blog.', 403);
  }

  // Validate that all section IDs exist
  const existingSectionIds = blog.sections.map((s) => s._id?.toString());
  const allIdsExist = sectionIds.every((id) => existingSectionIds.includes(id));

  if (!allIdsExist || sectionIds.length !== blog.sections.length) {
    throw new AppError('Invalid section IDs provided.', 400);
  }

  // Reorder sections based on provided order
  const reorderedSections = sectionIds
    .map((id) => blog.sections.find((s) => s._id?.toString() === id))
    .filter((s) => s !== undefined);

  // Update order property for each section
  reorderedSections.forEach((section, index) => {
    if (section) {
      section.order = index;
    }
  });

  blog.sections = reorderedSections as any;
  await blog.save();

  logger.info(`Sections reordered in blog: ${blog._id}`);

  return blog;
};

/**
 * Delete section from blog post
 */
export const deleteSection = async (
  blogId: string,
  sectionId: string,
  userId: string,
  userRole: string,
) => {
  const blog = await BlogPost.findOne({
    _id: blogId,
    isDeleted: false,
  });

  if (!blog) {
    throw new AppError('Blog post not found.', 404);
  }

  const isAuthor = blog.author.toString() === userId;
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  if (!isAuthor && !isAdmin) {
    throw new AppError('You do not have permission to modify this blog.', 403);
  }

  // Remove section
  blog.sections = blog.sections.filter((s) => s._id?.toString() !== sectionId);

  if (blog.sections.length === 0) {
    throw new AppError('Blog must have at least one section.', 400);
  }

  // Recalculate reading time
  blog.readingTime = calculateReadingTime(blog.sections);

  await blog.save();

  logger.info(`Section deleted from blog: ${blog._id}`);

  return blog;
};

/**
 * Toggle like on blog post
 */
export const toggleLike = async (blogId: string, userId: string) => {
  const blog = await BlogPost.findOne({
    _id: blogId,
    isDeleted: false,
    status: 'published',
  });

  if (!blog) {
    throw new AppError('Blog post not found.', 404);
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const likeIndex = blog.likes.findIndex((id) => id.toString() === userId);

  if (likeIndex > -1) {
    // Unlike
    blog.likes.splice(likeIndex, 1);
    await blog.save();
    return { liked: false, likeCount: blog.likes.length };
  } else {
    // Like
    blog.likes.push(userObjectId);
    await blog.save();
    return { liked: true, likeCount: blog.likes.length };
  }
};

/**
 * Increment share count
 */
export const incrementShare = async (blogId: string) => {
  const blog = await BlogPost.findOne({
    _id: blogId,
    isDeleted: false,
    status: 'published',
  });

  if (!blog) {
    throw new AppError('Blog post not found.', 404);
  }

  blog.shares += 1;
  await blog.save();

  return { shareCount: blog.shares };
};

/**
 * Get related blog posts
 */
export const getRelatedBlogs = async (blogId: string, limit: number = 3) => {
  const blog = await BlogPost.findById(blogId);

  if (!blog) {
    throw new AppError('Blog post not found.', 404);
  }

  // Find related blogs based on category and tags
  const relatedBlogs = await BlogPost.find({
    _id: { $ne: blogId },
    isDeleted: false,
    status: 'published',
    isPublic: true,
    isHidden: false,
    $or: [{ category: blog.category }, { tags: { $in: blog.tags } }],
  })
    .select('title slug coverImage category tags readingTime publishDate')
    .populate({
      path: 'author',
      select: 'firstName lastName profileImage',
    })
    .sort({ publishDate: -1 })
    .limit(limit);

  return relatedBlogs;
};

/**
 * Get blogs by author
 */
export const getBlogsByAuthor = async (
  authorId: string,
  page: number = 1,
  limit: number = 10,
  requestUserId?: string,
) => {
  const filter: any = {
    author: authorId,
    isDeleted: false,
  };

  // Only show published blogs unless it's the author viewing
  if (requestUserId !== authorId) {
    filter.status = 'published';
    filter.isPublic = true;
    filter.isHidden = false;
  }

  const skip = (page - 1) * limit;

  const blogs = await BlogPost.find(filter)
    .select('title slug coverImage category tags readingTime publishDate status views likes')
    .sort({ publishDate: -1 })
    .skip(skip)
    .limit(limit);

  const total = await BlogPost.countDocuments(filter);

  return {
    blogs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    limit,
  };
};

/**
 * Get user's liked blogs (bookmarked)
 */
export const getLikedBlogs = async (
  userId: string,
  page: number = 1,
  limit: number = 10,
) => {
  const skip = (page - 1) * limit;

  const blogs = await BlogPost.find({
    likes: userId,
    isDeleted: false,
    status: 'published',
    isPublic: true,
    isHidden: false,
  })
    .populate({
      path: 'author',
      select: 'firstName lastName profileImage',
    })
    .select(
      'title slug coverImage category tags readingTime publishDate likes views shares',
    )
    .sort({ publishDate: -1 })
    .skip(skip)
    .limit(limit);

  const total = await BlogPost.countDocuments({
    likes: userId,
    isDeleted: false,
    status: 'published',
    isPublic: true,
    isHidden: false,
  });

  return {
    blogs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    limit,
  };
};

/**
 * Get tag cloud with usage counts
 */
export const getTagCloud = async (limit: number = 50) => {
  const tags = await BlogPost.aggregate([
    {
      $match: {
        status: 'published',
        isPublic: true,
        isHidden: false,
        isDeleted: false,
      },
    },
    { $unwind: '$tags' },
    {
      $group: {
        _id: '$tags',
        count: { $sum: 1 },
        blogs: { $push: '$_id' },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        tag: '$_id',
        count: 1,
        blogCount: { $size: '$blogs' },
      },
    },
  ]);

  return tags;
};

/**
 * Get trending tags (based on recent activity)
 */
export const getTrendingTags = async (
  days: number = 7,
  limit: number = 20,
) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const tags = await BlogPost.aggregate([
    {
      $match: {
        status: 'published',
        isPublic: true,
        isHidden: false,
        isDeleted: false,
        publishDate: { $gte: startDate },
      },
    },
    { $unwind: '$tags' },
    {
      $group: {
        _id: '$tags',
        count: { $sum: 1 },
        totalViews: { $sum: '$views' },
        totalLikes: { $sum: { $size: '$likes' } },
        totalShares: { $sum: '$shares' },
      },
    },
    {
      $addFields: {
        trendScore: {
          $add: [
            { $multiply: ['$count', 10] },
            { $multiply: ['$totalViews', 1] },
            { $multiply: ['$totalLikes', 3] },
            { $multiply: ['$totalShares', 5] },
          ],
        },
      },
    },
    { $sort: { trendScore: -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        tag: '$_id',
        count: 1,
        totalViews: 1,
        totalLikes: 1,
        totalShares: 1,
        trendScore: 1,
      },
    },
  ]);

  return tags;
};

/**
 * Get blog statistics
 */
export const getBlogStats = async () => {
  const stats = await BlogPost.aggregate([
    {
      $match: {
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: null,
        totalBlogs: { $sum: 1 },
        publishedBlogs: {
          $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] },
        },
        draftBlogs: {
          $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] },
        },
        totalViews: { $sum: '$views' },
        totalLikes: { $sum: { $size: '$likes' } },
        totalShares: { $sum: '$shares' },
        avgReadingTime: { $avg: '$readingTime' },
      },
    },
  ]);

  const categoryStats = await BlogPost.aggregate([
    {
      $match: {
        status: 'published',
        isPublic: true,
        isHidden: false,
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        totalViews: { $sum: '$views' },
        avgReadingTime: { $avg: '$readingTime' },
      },
    },
    { $sort: { count: -1 } },
  ]);

  return {
    general: stats[0] || {
      totalBlogs: 0,
      publishedBlogs: 0,
      draftBlogs: 0,
      totalViews: 0,
      totalLikes: 0,
      totalShares: 0,
      avgReadingTime: 0,
    },
    byCategory: categoryStats,
  };
};

/**
 * Get popular blogs (most viewed/liked/shared)
 */
export const getPopularBlogs = async (
  metric: 'views' | 'likes' | 'shares' = 'views',
  limit: number = 10,
  days?: number,
) => {
  const filter: any = {
    status: 'published',
    isPublic: true,
    isHidden: false,
    isDeleted: false,
  };

  // Filter by date range if specified
  if (days) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    filter.publishDate = { $gte: startDate };
  }

  let sortCriteria: any;
  if (metric === 'likes') {
    // For likes, we sort by the array size, but that's complex
    // For now, we'll fetch and sort in memory
    sortCriteria = { publishDate: -1 };
  } else {
    sortCriteria = { [metric]: -1, publishDate: -1 };
  }

  let blogs = await BlogPost.find(filter)
    .populate({
      path: 'author',
      select: 'firstName lastName profileImage',
    })
    .select(
      'title slug coverImage category tags readingTime publishDate likes views shares',
    )
    .sort(sortCriteria)
    .limit(metric === 'likes' ? limit * 3 : limit); // Fetch more if sorting by likes

  // If sorting by likes, sort in memory
  if (metric === 'likes') {
    blogs = blogs
      .sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0))
      .slice(0, limit);
  }

  // Add counts
  const blogsWithCounts = blogs.map((blog) => {
    const blogObj = blog.toObject();
    return {
      ...blogObj,
      likesCount: blog.likes?.length || 0,
    };
  });

  return blogsWithCounts;
};

/**
 * Get all categories with blog counts and statistics
 */
export const getCategories = async () => {
  const categories = await BlogPost.aggregate([
    {
      $match: {
        status: 'published',
        isPublic: true,
        isHidden: false,
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        totalViews: { $sum: '$views' },
        totalLikes: { $sum: { $size: '$likes' } },
        totalShares: { $sum: '$shares' },
        avgReadingTime: { $avg: '$readingTime' },
        latestBlog: { $max: '$publishDate' },
      },
    },
    { $sort: { count: -1 } },
    {
      $project: {
        _id: 0,
        category: '$_id',
        count: 1,
        totalViews: 1,
        totalLikes: 1,
        totalShares: 1,
        avgReadingTime: { $round: ['$avgReadingTime', 0] },
        latestBlog: 1,
      },
    },
  ]);

  // Add category metadata
  const categoryInfo: Record<string, any> = {
    MODELS: {
      name: 'AI Models',
      description: 'Latest AI model releases and breakthroughs',
      icon: '🤖',
      color: '#3B82F6',
    },
    RESEARCH: {
      name: 'Research',
      description: 'Academic research and papers',
      icon: '🔬',
      color: '#8B5CF6',
    },
    TECHNIQUES: {
      name: 'Techniques',
      description: 'Prompt engineering techniques and best practices',
      icon: '⚡',
      color: '#F59E0B',
    },
    TUTORIALS: {
      name: 'Tutorials',
      description: 'Step-by-step guides and how-tos',
      icon: '📚',
      color: '#10B981',
    },
    NEWS: {
      name: 'News',
      description: 'Latest AI news and updates',
      icon: '📰',
      color: '#EF4444',
    },
    CASE_STUDIES: {
      name: 'Case Studies',
      description: 'Real-world applications and success stories',
      icon: '💼',
      color: '#6366F1',
    },
  };

  const enrichedCategories = categories.map((cat) => ({
    ...cat,
    ...categoryInfo[cat.category],
  }));

  return enrichedCategories;
};

