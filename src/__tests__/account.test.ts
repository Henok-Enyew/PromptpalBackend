import { describe, expect, it } from 'vitest';
import Prompt from '../models/prompt.model.js';
import User from '../models/user.model.js';
import { api, createPrompt, createUser } from './helpers.js';

describe('DELETE /api/v1/user/me', () => {
  it('requires the password and the DELETE confirmation', async () => {
    const { cookie } = await createUser();

    const noConfirm = await api()
      .delete('/api/v1/user/me')
      .set('Cookie', cookie)
      .send({ password: 'Password123!' });
    expect(noConfirm.status).toBe(400);

    const wrongPassword = await api()
      .delete('/api/v1/user/me')
      .set('Cookie', cookie)
      .send({ password: 'nope', confirm: 'DELETE' });
    expect(wrongPassword.status).toBe(401);
  });

  it('soft-deletes content, anonymizes the user and ends the session', async () => {
    const { user, cookie } = await createUser({ phoneNumber: '0911000000' });
    const prompt = await createPrompt(user._id);

    const res = await api()
      .delete('/api/v1/user/me')
      .set('Cookie', cookie)
      .send({ password: 'Password123!', confirm: 'DELETE' });
    expect(res.status).toBe(200);

    const stored = await User.findById(user._id)
      .select('+active')
      .setOptions({ includeInactive: true })
      .lean();
    expect(stored?.email).not.toBe(user.email);
    expect(stored?.phoneNumber).toBeUndefined();
    expect(stored?.active).toBe(false);

    expect((await Prompt.findById(prompt._id))?.isDeleted).toBe(true);
    expect((await api().get(`/api/v1/prompts/${prompt.id}`)).status).toBe(404);
    expect(
      (await api().get('/api/v1/user/userProfile').set('Cookie', cookie)).status,
    ).toBe(401);
  });
});

describe('Playbook (blog) is admin-authored', () => {
  it('forbids regular users from creating posts', async () => {
    const { cookie } = await createUser();
    const res = await api().post('/api/v1/blogs').set('Cookie', cookie).send({});
    expect(res.status).toBe(403);
  });

  it('handles reports on blog posts without crashing', async () => {
    const { cookie } = await createUser();
    const res = await api()
      .post('/api/v1/blogs/507f1f77bcf86cd799439011/flag')
      .set('Cookie', cookie)
      .send({ reason: 'spam' });
    expect(res.status).toBeLessThan(500);
  });

  it('lets admins through to validation', async () => {
    const { cookie } = await createUser({ role: 'admin' });
    const res = await api().post('/api/v1/blogs').set('Cookie', cookie).send({});
    expect(res.status).toBe(400);
  });
});
