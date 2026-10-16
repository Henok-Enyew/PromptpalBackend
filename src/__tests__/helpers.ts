import request from 'supertest';
import app from '../app.js';
import User from '../models/user.model.js';
import Prompt from '../models/prompt.model.js';
import { signToken } from '../utils/jwt.util.js';

export const api = () => request(app);

let counter = 0;

export const createUser = async (
  overrides: Record<string, unknown> = {},
) => {
  counter += 1;
  const user = await User.create({
    firstName: 'Test',
    lastName: `User${counter}`,
    email: `user${counter}-${Date.now()}@example.com`,
    password: 'Password123!',
    isEmailVerified: true,
    status: 'approved',
    ...overrides,
  });
  // Cookie header for supertest's .set('Cookie', ...)
  const cookie = `jwt=${signToken(user.id)}`;
  return { user, cookie };
};

export const createPrompt = async (
  userId: unknown,
  overrides: Record<string, unknown> = {},
) =>
  Prompt.create({
    user: userId,
    title: 'Test prompt',
    description: 'A prompt used in tests',
    promptText: 'Summarize the following text: {{text}}',
    sampleOutput: 'A summary.',
    mediaType: 'text',
    aiModel: 'gemini-2.5-flash',
    tags: ['test'],
    isPublic: true,
    ...overrides,
  });
