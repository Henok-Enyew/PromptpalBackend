import { describe, expect, it } from 'vitest';
import { api, createUser, createPrompt } from './helpers.js';

describe('health', () => {
  it('GET / responds', async () => {
    const res = await api().get('/');
    expect(res.status).toBe(200);
  });

  it('can create fixtures in the in-memory database', async () => {
    const { user } = await createUser();
    const prompt = await createPrompt(user._id);
    expect(prompt.id).toBeTruthy();
  });
});
