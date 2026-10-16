import { Router } from 'express';
import {
  protect,
  optionalProtect,
  restrictTo,
} from '../middleware/auth.middleware.js';
import * as blogController from '../controllers/blog.controller.js';
import * as commentController from '../controllers/comment.controller.js';
import { flagContentHandler } from '../controllers/flag.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  createBlogSchema,
  updateBlogSchema,
  addSectionSchema,
  updateSectionSchema,
  blogQuerySchema,
  blogIdSchema,
  slugParamSchema,
  sectionIdSchema,
  reorderSectionsSchema,
} from '../validation/blog.schema.js';
import {
  createCommentSchema,
  updateCommentSchema,
} from '../validation/comment.schema.js';
import {
  uploadBlogCover,
  uploadBlogSection,
} from '../utils/blogImageUpload.util.js';

const router = Router();

// The blog is an editorially controlled Playbook: only admins write to it.
const editorOnly = restrictTo('admin', 'superadmin');

/**
 * @swagger
 * tags:
 *   name: Blogs
 *   description: Blog management endpoints
 */

/**
 * @swagger
 * /blogs/upload/cover:
 *   post:
 *     summary: Upload blog cover image
 *     tags: [Blogs]
 *     description: Upload a cover/hero image for a blog post
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Image file (max 10MB, jpg/png/webp)
 *     responses:
 *       200:
 *         description: Image uploaded successfully
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
 *                     imageUrl:
 *                       type: string
 *                       example: https://res.cloudinary.com/...
 *       400:
 *         description: No image file provided
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/upload/cover',
  protect,
  editorOnly,
  uploadBlogCover.single('image'),
  blogController.uploadCoverImage,
);

/**
 * @swagger
 * /blogs/upload/section:
 *   post:
 *     summary: Upload blog section image
 *     tags: [Blogs]
 *     description: Upload an image for a blog section
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Image file (max 5MB, jpg/png/webp/gif)
 *     responses:
 *       200:
 *         description: Image uploaded successfully
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
 *                     imageUrl:
 *                       type: string
 *                       example: https://res.cloudinary.com/...
 *       400:
 *         description: No image file provided
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/upload/section',
  protect,
  editorOnly,
  uploadBlogSection.single('image'),
  blogController.uploadSectionImage,
);

/**
 * @swagger
 * /blogs/bookmarks:
 *   get:
 *     summary: Get user's bookmarked blogs
 *     tags: [Blogs]
 *     description: Retrieve all blogs the user has liked (bookmarked)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Successfully retrieved bookmarked blogs
 *       401:
 *         description: Unauthorized
 */
router.get('/bookmarks', protect, blogController.getUserBookmarkedBlogs);

/**
 * @swagger
 * /blogs/tags/cloud:
 *   get:
 *     summary: Get tag cloud
 *     tags: [Blogs]
 *     description: Get all tags with usage counts for creating tag clouds
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of tags to return
 *     responses:
 *       200:
 *         description: Successfully retrieved tag cloud
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 results:
 *                   type: integer
 *                 data:
 *                   type: object
 *                   properties:
 *                     tags:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           tag:
 *                             type: string
 *                           count:
 *                             type: integer
 *                           blogCount:
 *                             type: integer
 */
router.get('/tags/cloud', blogController.getTagCloud);

/**
 * @swagger
 * /blogs/tags/trending:
 *   get:
 *     summary: Get trending tags
 *     tags: [Blogs]
 *     description: Get trending tags based on recent activity
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *         description: Number of days to analyze
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum number of tags
 *     responses:
 *       200:
 *         description: Successfully retrieved trending tags
 */
router.get('/tags/trending', blogController.getTrendingTags);

/**
 * @swagger
 * /blogs/stats:
 *   get:
 *     summary: Get blog statistics
 *     tags: [Blogs]
 *     description: Get overall blog platform statistics
 *     responses:
 *       200:
 *         description: Successfully retrieved statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     general:
 *                       type: object
 *                       properties:
 *                         totalBlogs:
 *                           type: integer
 *                         publishedBlogs:
 *                           type: integer
 *                         draftBlogs:
 *                           type: integer
 *                         totalViews:
 *                           type: integer
 *                         totalLikes:
 *                           type: integer
 *                         totalShares:
 *                           type: integer
 *                         avgReadingTime:
 *                           type: number
 *                     byCategory:
 *                       type: array
 *                       items:
 *                         type: object
 */
router.get('/stats', blogController.getBlogStats);

/**
 * @swagger
 * /blogs/popular:
 *   get:
 *     summary: Get popular blogs
 *     tags: [Blogs]
 *     description: Get most popular blogs by views, likes, or shares
 *     parameters:
 *       - in: query
 *         name: metric
 *         schema:
 *           type: string
 *           enum: [views, likes, shares]
 *           default: views
 *         description: Popularity metric
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *         description: Filter by last N days (optional)
 *     responses:
 *       200:
 *         description: Successfully retrieved popular blogs
 */
router.get('/popular', blogController.getPopularBlogs);

/**
 * @swagger
 * /blogs/categories:
 *   get:
 *     summary: Get all blog categories
 *     tags: [Blogs]
 *     description: Get all categories with statistics and metadata
 *     responses:
 *       200:
 *         description: Successfully retrieved categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 results:
 *                   type: integer
 *                 data:
 *                   type: object
 *                   properties:
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           category:
 *                             type: string
 *                           name:
 *                             type: string
 *                           description:
 *                             type: string
 *                           icon:
 *                             type: string
 *                           color:
 *                             type: string
 *                           count:
 *                             type: integer
 *                           totalViews:
 *                             type: integer
 *                           avgReadingTime:
 *                             type: number
 */
router.get('/categories', blogController.getCategories);

/**
 * @swagger
 * /blogs:
 *   get:
 *     summary: Get all blog posts
 *     tags: [Blogs]
 *     description: Retrieve a paginated list of blog posts with optional filtering
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [MODELS, RESEARCH, TECHNIQUES, TUTORIALS, NEWS, CASE_STUDIES]
 *         description: Filter by category
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Comma-separated tags
 *         example: ai,prompt-engineering
 *       - in: query
 *         name: author
 *         schema:
 *           type: string
 *         description: Filter by author ID
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Text search in title, content, tags
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [latest, popular, trending]
 *           default: latest
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Successfully retrieved blog posts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 results:
 *                   type: integer
 *                 data:
 *                   type: object
 *                   properties:
 *                     blogs:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/BlogPost'
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
 */
router.get('/', validate(blogQuerySchema, 'query'), blogController.getBlogs);

/**
 * @swagger
 * /blogs:
 *   post:
 *     summary: Create a new blog post
 *     tags: [Blogs]
 *     description: Create a new blog post (requires authentication)
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - openingQuote
 *               - coverImage
 *               - category
 *               - sections
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 200
 *                 example: The Emergence of Reasoning Models
 *               openingQuote:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 500
 *                 example: Why 'Chain-of-Thought' isn't just a buzzword anymore
 *               coverImage:
 *                 type: string
 *                 format: uri
 *                 example: https://res.cloudinary.com/example/image.jpg
 *               category:
 *                 type: string
 *                 enum: [MODELS, RESEARCH, TECHNIQUES, TUTORIALS, NEWS, CASE_STUDIES]
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 maxItems: 10
 *                 example: [ai, reasoning, models]
 *               sections:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 20
 *                 items:
 *                   $ref: '#/components/schemas/BlogSection'
 *               status:
 *                 type: string
 *                 enum: [draft, published]
 *                 default: draft
 *               authorRole:
 *                 type: string
 *                 maxLength: 100
 *                 example: LEAD MODEL ARCHITECT
 *     responses:
 *       201:
 *         description: Blog post created successfully
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
 *                     blog:
 *                       $ref: '#/components/schemas/BlogPost'
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/',
  protect,
  editorOnly,
  validate(createBlogSchema, 'body'),
  blogController.createBlog,
);

/**
 * @swagger
 * /blogs/slug/{slug}:
 *   get:
 *     summary: Get blog post by slug
 *     tags: [Blogs]
 *     description: Retrieve a single blog post by its slug
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog post slug
 *         example: the-emergence-of-reasoning-models
 *     responses:
 *       200:
 *         description: Successfully retrieved blog post
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
 *                     blog:
 *                       $ref: '#/components/schemas/BlogPost'
 *       404:
 *         description: Blog post not found
 */
router.get(
  '/slug/:slug',
  optionalProtect,
  validate(slugParamSchema, 'params'),
  blogController.getBlogBySlug,
);

/**
 * @swagger
 * /blogs/author/{authorId}:
 *   get:
 *     summary: Get blogs by author
 *     tags: [Blogs]
 *     description: Retrieve all blog posts by a specific author
 *     parameters:
 *       - in: path
 *         name: authorId
 *         required: true
 *         schema:
 *           type: string
 *         description: Author user ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Successfully retrieved author's blog posts
 */
router.get('/author/:authorId', optionalProtect, blogController.getBlogsByAuthor);

/**
 * @swagger
 * /blogs/{id}:
 *   get:
 *     summary: Get blog post by ID
 *     tags: [Blogs]
 *     description: Retrieve a single blog post by its ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog post ID
 *     responses:
 *       200:
 *         description: Successfully retrieved blog post
 *       404:
 *         description: Blog post not found
 */
router.get(
  '/:id',
  optionalProtect,
  validate(blogIdSchema, 'params'),
  blogController.getBlogById,
);

/**
 * @swagger
 * /blogs/{id}:
 *   patch:
 *     summary: Update blog post
 *     tags: [Blogs]
 *     description: Update an existing blog post (author or admin only)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog post ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               openingQuote:
 *                 type: string
 *               coverImage:
 *                 type: string
 *               category:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               sections:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/BlogSection'
 *               status:
 *                 type: string
 *                 enum: [draft, published, hidden]
 *     responses:
 *       200:
 *         description: Blog post updated successfully
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Blog post not found
 */
router.patch(
  '/:id',
  protect,
  editorOnly,
  validate(blogIdSchema, 'params'),
  validate(updateBlogSchema, 'body'),
  blogController.updateBlog,
);

/**
 * @swagger
 * /blogs/{id}:
 *   delete:
 *     summary: Delete blog post
 *     tags: [Blogs]
 *     description: Soft delete a blog post (author or admin only)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog post ID
 *     responses:
 *       200:
 *         description: Blog post deleted successfully
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Blog post not found
 */
router.delete(
  '/:id',
  protect,
  editorOnly,
  validate(blogIdSchema, 'params'),
  blogController.deleteBlog,
);

/**
 * @swagger
 * /blogs/{id}/sections:
 *   post:
 *     summary: Add section to blog post
 *     tags: [Blogs]
 *     description: Add a new section to an existing blog post
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog post ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BlogSection'
 *     responses:
 *       200:
 *         description: Section added successfully
 *       403:
 *         description: Forbidden
 */
router.post(
  '/:id/sections',
  protect,
  editorOnly,
  validate(blogIdSchema, 'params'),
  validate(addSectionSchema, 'body'),
  blogController.addSection,
);

/**
 * @swagger
 * /blogs/{id}/sections/reorder:
 *   patch:
 *     summary: Reorder blog sections
 *     tags: [Blogs]
 *     description: Reorder sections in a blog post
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog post ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sectionIds
 *             properties:
 *               sectionIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of section IDs in desired order
 *                 example: ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]
 *     responses:
 *       200:
 *         description: Sections reordered successfully
 *       400:
 *         description: Invalid section IDs
 *       403:
 *         description: Forbidden
 */
router.patch(
  '/:id/sections/reorder',
  protect,
  editorOnly,
  validate(blogIdSchema, 'params'),
  validate(reorderSectionsSchema, 'body'),
  blogController.reorderSections,
);

/**
 * @swagger
 * /blogs/{id}/sections/{sectionId}:
 *   patch:
 *     summary: Update blog section
 *     tags: [Blogs]
 *     description: Update a specific section in a blog post
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog post ID
 *       - in: path
 *         name: sectionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Section ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sectionNumber:
 *                 type: integer
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               promptSnippet:
 *                 $ref: '#/components/schemas/PromptSnippet'
 *               image:
 *                 type: object
 *               order:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Section updated successfully
 */
router.patch(
  '/:id/sections/:sectionId',
  protect,
  editorOnly,
  validate(sectionIdSchema, 'params'),
  validate(updateSectionSchema, 'body'),
  blogController.updateSection,
);

/**
 * @swagger
 * /blogs/{id}/sections/{sectionId}:
 *   delete:
 *     summary: Delete blog section
 *     tags: [Blogs]
 *     description: Remove a section from a blog post
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: sectionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Section deleted successfully
 */
router.delete(
  '/:id/sections/:sectionId',
  protect,
  editorOnly,
  validate(sectionIdSchema, 'params'),
  blogController.deleteSection,
);

/**
 * @swagger
 * /blogs/{id}/like:
 *   post:
 *     summary: Toggle like on blog post
 *     tags: [Blogs]
 *     description: Like or unlike a blog post
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog post ID
 *     responses:
 *       200:
 *         description: Like toggled successfully
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
 *                     liked:
 *                       type: boolean
 *                     likeCount:
 *                       type: integer
 */
router.post(
  '/:id/like',
  protect,
  validate(blogIdSchema, 'params'),
  blogController.toggleLike,
);

/**
 * @swagger
 * /blogs/{id}/share:
 *   post:
 *     summary: Increment share count
 *     tags: [Blogs]
 *     description: Track when a blog post is shared
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog post ID
 *     responses:
 *       200:
 *         description: Share count incremented
 */
router.post(
  '/:id/share',
  validate(blogIdSchema, 'params'),
  blogController.incrementShare,
);

/**
 * @swagger
 * /blogs/{id}/flag:
 *   post:
 *     summary: Flag a blog post
 *     tags: [Blogs]
 *     description: Report a blog post for moderation review
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog post ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               contentType:
 *                 type: string
 *                 enum: [blog]
 *                 default: blog
 *               reason:
 *                 type: string
 *                 enum: [spam, inappropriate, copyright, harassment, other]
 *               description:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       201:
 *         description: Content flagged successfully
 *       400:
 *         description: Already flagged by user
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/:id/flag',
  protect,
  validate(blogIdSchema, 'params'),
  async (req, res, next) => {
    // Set contentType and contentId for the flag
    req.body.contentType = 'blog';
    req.body.contentId = req.params.id;
    next();
  },
  flagContentHandler,
);

/**
 * @swagger
 * /blogs/{id}/related:
 *   get:
 *     summary: Get related blog posts
 *     tags: [Blogs]
 *     description: Get blog posts related to the specified blog
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 3
 *     responses:
 *       200:
 *         description: Successfully retrieved related blogs
 */
router.get(
  '/:id/related',
  validate(blogIdSchema, 'params'),
  blogController.getRelatedBlogs,
);

/**
 * @swagger
 * /blogs/{id}/sections/{sectionId}/prompt:
 *   get:
 *     summary: Get prompt snippet for copying
 *     tags: [Blogs]
 *     description: Retrieve a prompt snippet from a blog section for copying
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: sectionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Prompt snippet retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     fullPromptText:
 *                       type: string
 *                     metadata:
 *                       $ref: '#/components/schemas/PromptSnippet'
 */
router.get(
  '/:id/sections/:sectionId/prompt',
  validate(sectionIdSchema, 'params'),
  blogController.getPromptSnippet,
);

/**
 * @swagger
 * /blogs/{id}/comments:
 *   get:
 *     summary: Get all comments for a blog post
 *     tags: [Blogs]
 *     description: Retrieve paginated comments for a blog
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog post ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Successfully retrieved comments
 *   post:
 *     summary: Create a comment on a blog post
 *     tags: [Blogs]
 *     description: Add a new comment to a blog post
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog post ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 1000
 *                 example: Great article! Very insightful.
 *     responses:
 *       201:
 *         description: Comment created successfully
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/:id/comments',
  validate(blogIdSchema, 'params'),
  blogController.getBlogComments,
);

router.post(
  '/:id/comments',
  protect,
  validate(blogIdSchema, 'params'),
  validate(createCommentSchema, 'body'),
  blogController.createBlogComment,
);

/**
 * @swagger
 * /blogs/{id}/comments/{commentId}:
 *   patch:
 *     summary: Update a comment on a blog
 *     tags: [Blogs]
 *     description: Update your own comment
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Comment updated successfully
 *   delete:
 *     summary: Delete a comment from a blog
 *     tags: [Blogs]
 *     description: Delete your own comment
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Comment deleted successfully
 */
router.patch(
  '/:id/comments/:commentId',
  protect,
  blogController.updateBlogComment,
);

router.delete(
  '/:id/comments/:commentId',
  protect,
  blogController.deleteBlogComment,
);

export default router;

