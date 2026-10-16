import { Request, Response, NextFunction } from 'express';
import { literalRegex } from '../utils/regex.util.js';
import catchAsync from '../utils/catchAsync.util.js';
import * as userService from '../services/user.service.js';
import * as moderationService from '../services/moderation.service.js';
import Prompt from '../models/prompt.model.js';
import Comment from '../models/comment.model.js';
import {
  GetUsersAdminQuery,
  UpdateUserStatusInput,
  UpdateUserRoleInput,
  ModerateContentInput,
  BulkModerateInput,
  GetPromptsAdminQuery,
  UpdatePromptStatusInput,
  GetCommentsAdminQuery,
  GetFlaggedContentQuery,
  ReviewFlagInput,
} from '../validation/admin.validation.js';

export const updateUserRoleHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.params.id;
    const { role } = req.body as UpdateUserRoleInput;
    const currentUserId = req.user!.id;

    const user = await userService.updateUserRole(userId, role, currentUserId);

    res.status(200).json({
      status: 'success',
      message: `User role updated to ${role}.`,
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          fullName: user.fullName,
        },
      },
    });
  },
);

export const getAllUsersAdminHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const query = req.query as unknown as GetUsersAdminQuery;
    const data = await userService.getAllUsersAdmin(query);

    res.status(200).json({
      status: 'success',
      ...data,
    });
  },
);

export const updateUserStatusHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.params.id;
    const { status } = req.body as UpdateUserStatusInput;

    const user = await userService.updateUserStatus(userId, status);

    res.status(200).json({
      status: 'success',
      message: `User status updated to ${status}.`,
      data: {
        user: {
          id: user.id,
          email: user.email,
          status: user.status,
          fullName: user.fullName,
        },
      },
    });
  },
);

export const getUserDetailsHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const data = await userService.getUserByIdAdmin(id);

    res.status(200).json({
      status: 'success',
      data,
    });
  },
);

// ============================================================================
// PROMPT MODERATION HANDLERS
// ============================================================================

export const getPromptsAdminHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const query = req.query as unknown as GetPromptsAdminQuery;
    const {
      search,
      isHidden,
      isDeleted,
      moderationReason,
      flaggedOnly,
      page = 1,
      limit = 20,
    } = query;

    const filter: any = {};

    if (isHidden !== undefined) filter.isHidden = isHidden;
    if (isDeleted !== undefined) filter.isDeleted = isDeleted;
    if (moderationReason) filter.moderationReason = moderationReason;
    if (flaggedOnly) filter.flaggedCount = { $gt: 0 };
    if (search) {
      filter.$or = [
        { title: literalRegex(search) },
        { promptText: literalRegex(search) },
        { description: literalRegex(search) },
      ];
    }

    const skip = (page - 1) * limit;

    const prompts = await Prompt.find(filter)
      .populate({
        path: 'user',
        select: 'firstName lastName email profileImage',
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Prompt.countDocuments(filter);

    res.status(200).json({
      status: 'success',
      data: {
        prompts,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        limit,
      },
    });
  },
);

export const getPromptDetailsAdminHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const prompt = await Prompt.findById(id).populate({
      path: 'user',
      select: 'firstName lastName email profileImage',
    });

    if (!prompt) {
      return res.status(404).json({
        status: 'error',
        message: 'Prompt not found.',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { prompt },
    });
  },
);

export const updatePromptStatusHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { status } = req.body as UpdatePromptStatusInput;

    const prompt = await Prompt.findById(id);

    if (!prompt) {
      return res.status(404).json({
        status: 'error',
        message: 'Prompt not found.',
      });
    }

    // Map status to isHidden and isDeleted fields
    if (status === 'active') {
      prompt.isHidden = false;
      prompt.isDeleted = false;
      if (prompt.deletedAt) prompt.deletedAt = undefined;
      if (prompt.deletedBy) prompt.deletedBy = undefined;
    } else if (status === 'inactive') {
      prompt.isHidden = true;
      prompt.isDeleted = false;
      if (prompt.deletedAt) prompt.deletedAt = undefined;
      if (prompt.deletedBy) prompt.deletedBy = undefined;
    } else if (status === 'deleted') {
      prompt.isHidden = true;
      prompt.isDeleted = true;
      prompt.deletedAt = new Date();
      prompt.deletedBy = req.user!.id as any;
    }

    await prompt.save();

    res.status(200).json({
      status: 'success',
      message: `Prompt status updated to ${status}.`,
      data: {
        prompt: {
          id: prompt.id,
          status,
          isHidden: prompt.isHidden,
          isDeleted: prompt.isDeleted,
        },
      },
    });
  },
);

export const moderatePromptHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const input = req.body as ModerateContentInput;
    const adminId = req.user!.id;

    const prompt = await moderationService.moderatePrompt(id, adminId, input);

    const actionMessages: Record<string, string> = {
      hide: 'Prompt hidden successfully.',
      unhide: 'Prompt unhidden successfully.',
      delete: 'Prompt deleted successfully.',
      restore: 'Prompt restored successfully.',
    };

    res.status(200).json({
      status: 'success',
      message: actionMessages[input.action] || 'Action completed successfully.',
      data: { prompt },
    });
  },
);

export const bulkModeratePromptsHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const input = req.body as BulkModerateInput;
    const adminId = req.user!.id;

    // Ensure contentType is prompt
    if (input.contentType !== 'prompt') {
      return res.status(400).json({
        status: 'error',
        message: 'This endpoint is for prompts only. Use /admin/comments/bulk for comments.',
      });
    }

    const result = await moderationService.bulkModerate(adminId, input);

    res.status(200).json({
      status: 'success',
      message: `Bulk moderation completed. ${result.modified} prompt(s) modified.`,
      data: result,
    });
  },
);

// ============================================================================
// COMMENT MODERATION HANDLERS
// ============================================================================

export const getCommentsAdminHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const query = req.query as unknown as GetCommentsAdminQuery;
    const {
      promptId,
      isHidden,
      isDeleted,
      moderationReason,
      flaggedOnly,
      page = 1,
      limit = 20,
    } = query;

    const filter: any = {};

    if (promptId) filter.prompt = promptId;
    if (isHidden !== undefined) filter.isHidden = isHidden;
    if (isDeleted !== undefined) filter.isDeleted = isDeleted;
    if (moderationReason) filter.moderationReason = moderationReason;
    if (flaggedOnly) filter.flaggedCount = { $gt: 0 };

    const skip = (page - 1) * limit;

    const comments = await Comment.find(filter)
      .populate({
        path: 'user',
        select: 'firstName lastName email profileImage',
      })
      .populate({
        path: 'prompt',
        select: 'title',
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Comment.countDocuments(filter);

    res.status(200).json({
      status: 'success',
      data: {
        comments,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        limit,
      },
    });
  },
);

export const getCommentDetailsAdminHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const comment = await Comment.findById(id)
      .populate({
        path: 'user',
        select: 'firstName lastName email profileImage',
      })
      .populate({
        path: 'prompt',
        select: 'title',
      });

    if (!comment) {
      return res.status(404).json({
        status: 'error',
        message: 'Comment not found.',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { comment },
    });
  },
);

export const moderateCommentHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const input = req.body as ModerateContentInput;
    const adminId = req.user!.id;

    const comment = await moderationService.moderateComment(id, adminId, input);

    const actionMessages: Record<string, string> = {
      hide: 'Comment hidden successfully.',
      unhide: 'Comment unhidden successfully.',
      delete: 'Comment deleted successfully.',
      restore: 'Comment restored successfully.',
    };

    res.status(200).json({
      status: 'success',
      message: actionMessages[input.action] || 'Action completed successfully.',
      data: { comment },
    });
  },
);

export const bulkModerateCommentsHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const input = req.body as BulkModerateInput;
    const adminId = req.user!.id;

    // Ensure contentType is comment
    if (input.contentType !== 'comment') {
      return res.status(400).json({
        status: 'error',
        message: 'This endpoint is for comments only. Use /admin/prompts/bulk for prompts.',
      });
    }

    const result = await moderationService.bulkModerate(adminId, input);

    res.status(200).json({
      status: 'success',
      message: `Bulk moderation completed. ${result.modified} comment(s) modified.`,
      data: result,
    });
  },
);

// ============================================================================
// FLAG MANAGEMENT HANDLERS
// ============================================================================

export const getFlaggedContentHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const query = req.query as unknown as GetFlaggedContentQuery;
    const data = await moderationService.getFlaggedContent(query);

    res.status(200).json({
      status: 'success',
      ...data,
    });
  },
);

export const getFlagDetailsHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const ContentFlag = (await import('../models/contentFlag.model.js')).default;
    const flag = await ContentFlag.findById(id)
      .populate({
        path: 'reportedBy',
        select: 'firstName lastName email',
      })
      .populate({
        path: 'reviewedBy',
        select: 'firstName lastName email',
      });

    if (!flag) {
      return res.status(404).json({
        status: 'error',
        message: 'Flag not found.',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { flag },
    });
  },
);

export const reviewFlagHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const input = req.body as ReviewFlagInput;
    const adminId = req.user!.id;

    const flag = await moderationService.reviewFlag(id, adminId, input);

    res.status(200).json({
      status: 'success',
      message: 'Flag reviewed and resolved successfully.',
      data: { flag },
    });
  },
);

export const dismissFlagHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const adminId = req.user!.id;

    const flag = await moderationService.dismissFlag(id, adminId);

    res.status(200).json({
      status: 'success',
      message: 'Flag dismissed successfully.',
      data: { flag },
    });
  },
);

export const getFlagStatsHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const stats = await moderationService.getFlagStats();

    res.status(200).json({
      status: 'success',
      data: { stats },
    });
  },
);
