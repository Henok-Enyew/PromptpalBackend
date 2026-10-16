import { Document, Types } from 'mongoose';
import { MediaType } from './prompt.types.js';

export type OptimizationType = 'quick' | 'premium';
export type OptimizationMode = 'analyze' | 'build' | 'complete';
export type OptimizationStatus = 'pending' | 'analyzing' | 'questions_ready' | 'building' | 'completed' | 'failed';

export interface QuestionAnswer {
  type: 'option' | 'custom' | 'default' | 'skipped';
  value: string;
  customText?: string;
}

export interface OptimizationQuestion {
  id: string;
  question: string;
  type: 'select' | 'select_or_text' | 'textarea';
  priority: 'high' | 'medium' | 'low';
  answered: boolean;
  answer?: QuestionAnswer;
}

export interface QualityScore {
  before: number;
  after: number;
  improvements: string[];
  intentPreserved: boolean;
}

export interface OptimizationMetadata {
  wordCount: {
    before: number;
    after: number;
  };
  /** Legacy heuristic scores, no longer written. */
  clarityScore?: {
    before: number;
    after: number;
  };
  /** Legacy heuristic scores, no longer written. */
  specificityScore?: {
    before: number;
    after: number;
  };
  /** Legacy heuristic scores, no longer written. */
  structureScore?: {
    before: number;
    after: number;
  };
  completenessScore?: number;
  usedAI?: boolean;
  validationMessage?: string;
  model?: string;
  costUsd?: number | null;
}

export interface LintCheckRecord {
  id: string;
  label: string;
  passed: boolean;
  hint: string;
}

/** Structured diagnosis returned by the optimizer model (no scores). */
export interface OptimizationDiagnosis {
  ambiguities: string[];
  roleDefinition: string;
  variables: string[];
  formattingConstraints: string[];
  changes: string[];
}

export interface PromptAnalysis {
  completenessScore: number;
  missingElements: string[];
  grammarFixed: boolean;
  structureImproved: boolean;
}

export interface IPromptOptimizationDocument extends Document {
  user: Types.ObjectId;
  originalPrompt: string;
  optimizedPrompt?: string;
  targetModel: string;
  mediaType: MediaType;
  optimizationType: OptimizationType;
  optimizationMode: OptimizationMode;
  
  // Question-based optimization data
  questions?: OptimizationQuestion[];
  additionalDetails?: string;
  userAnswers?: Record<string, QuestionAnswer>;
  
  // Diagnosis and lint checks (new records). `qualityScore` is legacy and
  // no longer written: its before/after numbers were not meaningful.
  diagnosis?: OptimizationDiagnosis;
  lintChecks?: { before: LintCheckRecord[]; after: LintCheckRecord[] };
  intentWarnings?: string[];
  qualityScore?: QualityScore;
  metadata?: OptimizationMetadata;
  analysis?: PromptAnalysis;
  
  // Suggestions
  suggestions?: Array<{
    type: string;
    section: string;
    original: string;
    suggested: string;
    reason: string;
  }>;
  
  // Context
  promptContext?: {
    useCase?: string;
    outputType?: string;
    tone?: string;
    length?: string;
  };
  
  // Feedback
  feedback?: {
    rating?: number;
    wasHelpful?: boolean;
    comments?: string;
    submittedAt?: Date;
  };
  
  status: OptimizationStatus;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

