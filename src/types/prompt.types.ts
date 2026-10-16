import { Document, Types } from 'mongoose';
import { ModerationReason } from './moderation.types.js';

export type MediaType = 'text' | 'image' | 'video' | 'audio';

export interface IPromptVersion {
  versionNumber: number;
  promptText: string;
  templateVariables: string[];
  changeSummary: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
}

export interface IPromptTestCase {
  _id?: Types.ObjectId;
  name: string;
  variables: Map<string, string>;
  expectedAssertions?: string[];
}

export interface IPromptDocument extends Document {
  user: Types.ObjectId;
  title: string;
  description?: string;
  promptText: string;
  sampleOutput: string;
  outputs?: Array<{
    type: 'text' | 'image' | 'video' | 'audio' | 'url';
    content: string;
    title?: string;
  }>;
  mediaType: MediaType;
  aiModel: string;
  tags: string[];
  slug?: string;
  currentVersion: number;
  versions?: IPromptVersion[];
  testCases?: IPromptTestCase[];
  forkedFrom?: Types.ObjectId | null;
  forksCount: number;
  likes: Types.ObjectId[];
  likesCount: number;
  views: number;
  shares: number;
  isPublic: boolean;
  originalPromptText?: string;
  isOptimized?: boolean;
  optimizationId?: Types.ObjectId;
  // Moderation fields
  isHidden: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  moderationReason?: ModerationReason;
  moderationNotes?: string;
  flaggedCount: number;
  lastFlaggedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

