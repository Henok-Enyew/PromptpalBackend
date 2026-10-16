import { Router } from 'express';
import { protect, optionalProtect } from '../middleware/auth.middleware.js';
import * as commentController from '../controllers/comment.controller.js';
import * as flagController from '../controllers/flag.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  createCommentSchema,
  createCommentParamsSchema,
  updateCommentSchema,
  getCommentSchema,
  getCommentsParamsSchema,
  getCommentsQuerySchema,
  toggleCommentLikeSchema,
} from '../validation/comment.schema.js';
import { flagContentSchema } from '../validation/admin.validation.js';

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /prompts/{promptId}/comments:
 *   post:
 *     summary: Create a comment on a prompt
 *     tags: [Comments]
 *     description: Create a new comment on a specific prompt. Requires authentication.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: promptId
 *         required: true
 *         schema:
 *           type: string
 *         description: Prompt ID - must be a valid MongoDB ObjectId
 *         example: 507f1f77bcf86cd799439011
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
 *                 example: This prompt worked great for my project!
 *     responses:
 *       201:
 *         description: Comment created successfully
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
 *                     comment:
 *                       $ref: '#/components/schemas/Comment'
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized - valid JWT cookie required
 *       404:
 *         description: Prompt not found
 */
router.post(
  '/',
  protect,
  validate(createCommentParamsSchema, 'params'),
  validate(createCommentSchema, 'body'),
  commentController.createComment,
);

/**
 * @swagger
 * /prompts/{promptId}/comments:
 *   get:
 *     summary: Get all comments for a prompt
 *     tags: [Comments]
 *     description: Retrieve a paginated list of comments for a specific prompt.
 *     parameters:
 *       - in: path
 *         name: promptId
 *         required: true
 *         schema:
 *           type: string
 *         description: Prompt ID - must be a valid MongoDB ObjectId
 *         example: 507f1f77bcf86cd799439011
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
 *     responses:
 *       200:
 *         description: Successfully retrieved comments
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
 *                     comments:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Comment'
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
 *       404:
 *         description: Prompt not found
 */
router.get(
  '/',
  optionalProtect,
  validate(getCommentsParamsSchema, 'params'),
  validate(getCommentsQuerySchema, 'query'),
  commentController.getComments,
);

/**
 * @swagger
 * /prompts/{promptId}/comments/{commentId}:
 *   get:
 *     summary: Get a comment by ID
 *     tags: [Comments]
 *     description: Retrieve a single comment by its ID.
 *     parameters:
 *       - in: path
 *         name: promptId
 *         required: true
 *         schema:
 *           type: string
 *         description: Prompt ID - must be a valid MongoDB ObjectId
 *         example: 507f1f77bcf86cd799439011
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Comment ID - must be a valid MongoDB ObjectId
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Successfully retrieved comment
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
 *                     comment:
 *                       $ref: '#/components/schemas/Comment'
 *       404:
 *         description: Comment not found
 */
router.get(
  '/:commentId',
  optionalProtect,
  validate(getCommentSchema, 'params'),
  commentController.getComment,
);

/**
 * @swagger
 * /prompts/{promptId}/comments/{commentId}:
 *   patch:
 *     summary: Update a comment
 *     tags: [Comments]
 *     description: Update a comment. Only the owner or an admin can update a comment.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: promptId
 *         required: true
 *         schema:
 *           type: string
 *         description: Prompt ID - must be a valid MongoDB ObjectId
 *         example: 507f1f77bcf86cd799439011
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Comment ID - must be a valid MongoDB ObjectId
 *         example: 507f1f77bcf86cd799439011
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
 *                 example: Updated comment text
 *     responses:
 *       200:
 *         description: Comment updated successfully
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
 *                     comment:
 *                       $ref: '#/components/schemas/Comment'
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized - valid JWT cookie required
 *       403:
 *         description: Forbidden - only owner or admin can update
 *       404:
 *         description: Comment not found
 */
router.patch(
  '/:commentId',
  protect,
  validate(getCommentSchema, 'params'),
  validate(updateCommentSchema, 'body'),
  commentController.updateComment,
);

/**
 * @swagger
 * /prompts/{promptId}/comments/{commentId}:
 *   delete:
 *     summary: Delete a comment
 *     tags: [Comments]
 *     description: Delete a comment. Only the owner or an admin can delete a comment.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: promptId
 *         required: true
 *         schema:
 *           type: string
 *         description: Prompt ID - must be a valid MongoDB ObjectId
 *         example: 507f1f77bcf86cd799439011
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Comment ID - must be a valid MongoDB ObjectId
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Comment deleted successfully
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
 *                   example: Comment deleted successfully.
 *       401:
 *         description: Unauthorized - valid JWT cookie required
 *       403:
 *         description: Forbidden - only owner or admin can delete
 *       404:
 *         description: Comment not found
 */
router.delete(
  '/:commentId',
  protect,
  validate(getCommentSchema, 'params'),
  commentController.deleteComment,
);

/**
 * @swagger
 * /prompts/{promptId}/comments/{commentId}/like:
 *   post:
 *     summary: Like or unlike a comment
 *     tags: [Comments]
 *     description: Toggle like status for a comment. If the user has already liked the comment, it will be unliked.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: promptId
 *         required: true
 *         schema:
 *           type: string
 *         description: Prompt ID - must be a valid MongoDB ObjectId
 *         example: 507f1f77bcf86cd799439011
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Comment ID - must be a valid MongoDB ObjectId
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Like status toggled successfully
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
 *                     comment:
 *                       $ref: '#/components/schemas/Comment'
 *       401:
 *         description: Unauthorized - valid JWT cookie required
 *       404:
 *         description: Comment not found
 */
router.post(
  '/:commentId/like',
  protect,
  validate(toggleCommentLikeSchema, 'params'),
  commentController.toggleCommentLike,
);

/**
 * @swagger
 * /prompts/{promptId}/comments/{commentId}/flag:
 *   post:
 *     summary: Flag a comment
 *     tags: [Comments]
 *     description: Report a comment for review. Requires authentication. Users can only flag a comment once.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: promptId
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
 *               - contentType
 *               - contentId
 *               - reason
 *             properties:
 *               contentType:
 *                 type: string
 *                 enum: [comment]
 *                 example: comment
 *               contentId:
 *                 type: string
 *                 example: 507f1f77bcf86cd799439011
 *               reason:
 *                 type: string
 *                 enum: [spam, inappropriate, copyright, harassment, other]
 *                 example: inappropriate
 *               description:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       201:
 *         description: Comment flagged successfully
 *       400:
 *         description: Bad request - already flagged or invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Comment not found
 */
router.post(
  '/:commentId/flag',
  protect,
  validate(toggleCommentLikeSchema, 'params'),
  validate(flagContentSchema, 'body'),
  flagController.flagContentHandler,
);

export default router;

