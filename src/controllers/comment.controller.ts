import { Request, Response, NextFunction } from 'express';
import catchAsync from '../utils/catchAsync.util.js';
import * as commentService from '../services/comment.service.js';
import {
  GetCommentParams,
  GetCommentsParams,
  GetCommentsQuery,
  ToggleCommentLikeParams,
} from '../validation/comment.schema.js';
import AppError from '../utils/appError.util.js';

export const createComment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('You must be logged in to create a comment.', 401);
    }

    const { promptId } = req.params as GetCommentsParams;
    const comment = await commentService.createComment(
      promptId,
      'prompt',
      req.user.id,
      req.body,
      req.user,
    );

    res.status(201).json({
      status: 'success',
      data: {
        comment,
      },
    });
  },
);

export const getComments = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { promptId } = req.params as GetCommentsParams;
    const query = req.query as unknown as GetCommentsQuery;
    const data = await commentService.getCommentsByPrompt(
      promptId,
      query,
      req.user,
    );

    res.status(200).json({
      status: 'success',
      data: {
        comments: data.comments,
        pagination: {
          total: data.total,
          page: data.page,
          totalPages: data.totalPages,
          limit: data.limit,
        },
      },
    });
  },
);

export const getComment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { commentId } = req.params as GetCommentParams;
    const comment = await commentService.getCommentById(commentId, req.user);

    res.status(200).json({
      status: 'success',
      data: {
        comment,
      },
    });
  },
);

export const updateComment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('You must be logged in to update a comment.', 401);
    }

    const { commentId } = req.params as GetCommentParams;
    const comment = await commentService.updateComment(
      commentId,
      req.user.id,
      req.body,
      req.user.role,
    );

    res.status(200).json({
      status: 'success',
      data: {
        comment,
      },
    });
  },
);

export const deleteComment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('You must be logged in to delete a comment.', 401);
    }

    const { commentId } = req.params as GetCommentParams;
    const result = await commentService.deleteComment(
      commentId,
      req.user.id,
      req.user.role,
    );

    res.status(200).json({
      status: 'success',
      message: result.message,
    });
  },
);

export const toggleCommentLike = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('You must be logged in to like a comment.', 401);
    }

    const { commentId } = req.params as ToggleCommentLikeParams;
    const comment = await commentService.toggleCommentLike(
      commentId,
      req.user.id,
    );

    res.status(200).json({
      status: 'success',
      data: {
        comment,
      },
    });
  },
);

