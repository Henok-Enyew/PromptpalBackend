import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const usageSchema = new Schema(
  { inputTokens: { type: Number, default: 0 }, outputTokens: { type: Number, default: 0 } },
  { _id: false },
);

const rubricSchema = new Schema(
  {
    instructionAdherenceScore: Number,
    constraintCompliance: Boolean,
    concisenessScore: Number,
    hallucinationRiskScore: Number,
    reasoning: String,
    identifiedFailureModes: [String],
  },
  { _id: false },
);

const resultSchema = new Schema(
  {
    modelId: { type: String, required: true },
    status: { type: String, enum: ['pending', 'done', 'error', 'cancelled'], default: 'pending' },
    output: { type: String, default: '' },
    truncated: { type: Boolean, default: false },
    latencyMs: Number,
    usage: usageSchema,
    costUsd: { type: Number, default: null },
    judge: { type: rubricSchema, default: null },
    judgeCostUsd: { type: Number, default: null },
    error: { code: String, message: String },
    judgeError: { code: String, message: String },
  },
  { _id: false },
);

/** One multi-model benchmark of a prompt, with independent judge scores. */
const evaluationRunSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    prompt: { type: Schema.Types.ObjectId, ref: 'Prompt', default: null },
    versionNumber: { type: Number, default: null },
    promptText: { type: String, required: true },
    renderedPrompt: { type: String, required: true },
    variables: { type: Map, of: String, default: {} },
    criteria: { type: String, default: '' },
    judgeModel: { type: String, required: true },
    // True when no independent judge model was configured, so the judge is
    // also one of the evaluated models; the UI must say so.
    selfJudged: { type: Boolean, default: false },
    status: { type: String, enum: ['running', 'done', 'cancelled', 'failed'], default: 'running' },
    results: { type: [resultSchema], default: [] },
    totalCostUsd: { type: Number, default: null },
  },
  { timestamps: true },
);

evaluationRunSchema.index({ user: 1, createdAt: -1 });
evaluationRunSchema.index({ prompt: 1, createdAt: -1 });

export type EvaluationRunDoc = InferSchemaType<typeof evaluationRunSchema>;

const EvaluationRun = mongoose.model('EvaluationRun', evaluationRunSchema);
export default EvaluationRun;
