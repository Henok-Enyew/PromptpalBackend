import { describe, expect, it } from 'vitest';
import Comment from '../models/comment.model.js';
import { api, createPrompt, createUser } from './helpers.js';

const P = '/api/v1/prompts';

describe('private prompt access (IDOR)', () => {
  it('hides another user’s private prompt from anonymous users, other users and like/share/comment routes', async () => {
    const { user: owner } = await createUser();
    const { cookie: otherCookie } = await createUser();
    const prompt = await createPrompt(owner._id, { isPublic: false });

    expect((await api().get(`${P}/${prompt.id}`)).status).toBe(404);
    expect(
      (await api().get(`${P}/${prompt.id}`).set('Cookie', otherCookie)).status,
    ).toBe(404);
    expect(
      (await api().post(`${P}/${prompt.id}/like`).set('Cookie', otherCookie))
        .status,
    ).toBe(404);
    expect((await api().post(`${P}/${prompt.id}/share`)).status).toBe(404);
    expect((await api().get(`${P}/${prompt.id}/comments`)).status).toBe(404);
    expect(
      (
        await api()
          .post(`${P}/${prompt.id}/comments`)
          .set('Cookie', otherCookie)
          .send({ text: 'sneaky' })
      ).status,
    ).toBe(404);
  });

  it('lets the owner and admins read a private prompt', async () => {
    const { user: owner, cookie: ownerCookie } = await createUser();
    const { cookie: adminCookie } = await createUser({ role: 'admin' });
    const prompt = await createPrompt(owner._id, { isPublic: false });

    expect(
      (await api().get(`${P}/${prompt.id}`).set('Cookie', ownerCookie)).status,
    ).toBe(200);
    expect(
      (await api().get(`${P}/${prompt.id}`).set('Cookie', adminCookie)).status,
    ).toBe(200);
  });

  it('serves public prompts anonymously but hides moderated ones', async () => {
    const { user } = await createUser();
    const open = await createPrompt(user._id);
    const hidden = await createPrompt(user._id, { isHidden: true });

    expect((await api().get(`${P}/${open.id}`)).status).toBe(200);
    expect((await api().get(`${P}/${hidden.id}`)).status).toBe(404);
  });

  it('drops liked prompts from favorites once they turn private', async () => {
    const { user: owner } = await createUser();
    const { user: fan, cookie: fanCookie } = await createUser();
    const prompt = await createPrompt(owner._id, { likes: [fan._id] });

    let res = await api().get(`${P}/favorites`).set('Cookie', fanCookie);
    expect(res.body.data.prompts).toHaveLength(1);

    prompt.isPublic = false;
    await prompt.save();
    res = await api().get(`${P}/favorites`).set('Cookie', fanCookie);
    expect(res.body.data.prompts).toHaveLength(0);
  });
});

describe('PII in public payloads', () => {
  it('never exposes author email or phone in feed, prompt detail or comments', async () => {
    const { user } = await createUser({ phoneNumber: '0911223344' });
    const prompt = await createPrompt(user._id);
    await Comment.create({
      contentType: 'prompt',
      contentId: prompt._id,
      prompt: prompt._id,
      user: user._id,
      text: 'Nice prompt',
    });

    const feed = await api().get(P);
    const detail = await api().get(`${P}/${prompt.id}`);
    const comments = await api().get(`${P}/${prompt.id}/comments`);

    const authors = [
      feed.body.data.prompts[0].user,
      detail.body.data.prompt.user,
      comments.body.data.comments[0].user,
    ];
    for (const author of authors) {
      expect(author.firstName).toBe('Test');
      expect(author).not.toHaveProperty('email');
      expect(author).not.toHaveProperty('phoneNumber');
    }
  });

  it('returns the user’s own profile without internal auth fields', async () => {
    const { user, cookie } = await createUser();
    const res = await api().get('/api/v1/user/userProfile').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.data.user).not.toHaveProperty('password');
    expect(res.body.data.user).not.toHaveProperty('passwordChangedAt');
    expect(res.body.data.user).not.toHaveProperty('active');
  });
});

describe('prompt text storage', () => {
  it('keeps XML-style tags in prompt text but strips HTML from titles', async () => {
    const { cookie } = await createUser();
    const promptText = '<context>{{doc}}</context>\n<task>Summarize it.</task>';
    const res = await api()
      .post(P)
      .set('Cookie', cookie)
      .send({
        title: '<b>Summarizer</b>',
        description: 'Summarizes a document',
        promptText,
        sampleOutput: 'A summary',
        mediaType: 'text',
        aiModel: 'claude',
        isPublic: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.prompt.promptText).toBe(promptText);
    expect(res.body.data.prompt.title).toBe('Summarizer');
  });
});

describe('search input is treated literally', () => {
  it('does not interpret aiModel as a regular expression', async () => {
    const { user } = await createUser();
    await createPrompt(user._id, { aiModel: 'gemini-2.5-flash' });

    const wildcard = await api().get(P).query({ aiModel: '.*' });
    expect(wildcard.status).toBe(200);
    expect(wildcard.body.data.prompts).toHaveLength(0);

    const evil = await api().get(P).query({ aiModel: '(a+)+$' });
    expect(evil.status).toBe(200);

    const literal = await api().get(P).query({ aiModel: 'GEMINI' });
    expect(literal.body.data.prompts).toHaveLength(1);
  });
});

describe('auth hardening', () => {
  it('does not log out via GET and does not return the JWT in the login body', async () => {
    const { user } = await createUser();

    expect((await api().get('/api/v1/auth/logout')).status).toBe(404);
    expect((await api().post('/api/v1/auth/logout')).status).toBe(200);

    const login = await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'Password123!' });
    expect(login.status).toBe(200);
    expect(login.headers['set-cookie']?.[0]).toMatch(/^jwt=.*HttpOnly/i);
    expect(login.body.data?.token).toBeUndefined();
    expect(login.body.token).toBeUndefined();
  });

  it('rejects state-changing requests from foreign origins', async () => {
    const { cookie } = await createUser();
    const evil = await api()
      .post('/api/v1/auth/logout')
      .set('Origin', 'https://evil.example')
      .set('Cookie', cookie);
    expect(evil.status).toBe(403);

    const ours = await api()
      .post('/api/v1/auth/logout')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', cookie);
    expect(ours.status).toBe(200);
  });

  it('rate limits repeated login attempts', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong-password' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses.at(-1)).toBe(429);
  });
});
