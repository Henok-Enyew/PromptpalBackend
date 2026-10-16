import { describe, expect, it } from 'vitest';
import Prompt from '../models/prompt.model.js';
import BlogPost from '../models/blog.model.js';
import { migratePromptSlugs } from '../_migrations/add-prompt-slugs.migration.js';
import { api, createPrompt, createUser } from './helpers.js';

describe('prompt slugs', () => {
  it('generates a stable URL slug on create and serves prompts by slug', async () => {
    const { user } = await createUser();
    const prompt = await createPrompt(user._id, { title: 'Summarize Release Notes!' });
    expect(prompt.slug).toMatch(/^summarize-release-notes-[0-9a-f]{6}$/);

    const slug = prompt.slug;
    prompt.title = 'Renamed';
    await prompt.save();
    expect(prompt.slug).toBe(slug);

    const res = await api().get(`/api/v1/prompts/by-slug/${slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.prompt.title).toBe('Renamed');
    expect(res.body.data.prompt.user).not.toHaveProperty('email');
  });

  it('hides private prompts from slug lookups', async () => {
    const { user } = await createUser();
    const { cookie: otherCookie } = await createUser();
    const prompt = await createPrompt(user._id, { isPublic: false });

    expect((await api().get(`/api/v1/prompts/by-slug/${prompt.slug}`)).status).toBe(404);
    expect(
      (await api().get(`/api/v1/prompts/by-slug/${prompt.slug}`).set('Cookie', otherCookie)).status,
    ).toBe(404);
  });

  it('returns the slug-based share URL', async () => {
    const { user } = await createUser();
    const prompt = await createPrompt(user._id);
    const res = await api().post(`/api/v1/prompts/${prompt.id}/share`);
    expect(res.body.data.shareableUrl).toBe(`/prompts/${prompt.slug}`);
  });
});

describe('feed sorting and pagination', () => {
  it('sorts server-side across pages', async () => {
    const { user } = await createUser();
    const fans = await Promise.all([createUser(), createUser(), createUser()]);
    const low = await createPrompt(user._id, { title: 'low' });
    const high = await createPrompt(user._id, { title: 'high', likes: fans.map((f) => f.user._id) });
    const mid = await createPrompt(user._id, { title: 'mid', likes: [fans[0].user._id], shares: 9 });

    const byLikes = await api().get('/api/v1/prompts').query({ sort: 'likes', limit: 2, page: 1 });
    expect(byLikes.body.data.prompts.map((p: any) => p.title)).toEqual(['high', 'mid']);
    const page2 = await api().get('/api/v1/prompts').query({ sort: 'likes', limit: 2, page: 2 });
    expect(page2.body.data.prompts.map((p: any) => p.title)).toEqual(['low']);

    const byShares = await api().get('/api/v1/prompts').query({ sort: 'shares', limit: 1 });
    expect(byShares.body.data.prompts[0].title).toBe('mid');
    expect([low, high, mid].every((p) => p.slug)).toBe(true);
  });

  it('keeps likesCount in sync when liking', async () => {
    const { user } = await createUser();
    const { cookie } = await createUser();
    const prompt = await createPrompt(user._id);
    await api().post(`/api/v1/prompts/${prompt.id}/like`).set('Cookie', cookie);
    expect((await Prompt.findById(prompt._id))?.likesCount).toBe(1);
  });
});

describe('GET /api/v1/public/sitemap', () => {
  it('lists only public, visible prompts and published articles without user data', async () => {
    const { user } = await createUser({ role: 'admin' });
    await createPrompt(user._id, { title: 'Public one' });
    await createPrompt(user._id, { title: 'Private one', isPublic: false });
    await createPrompt(user._id, { title: 'Hidden one', isHidden: true });
    const article = {
      author: user._id, coverImage: 'https://example.com/c.png', openingQuote: 'Quote',
      category: 'TUTORIALS', readingTime: 1,
      sections: [{ sectionNumber: 1, order: 1, title: 'S', content: 'Body' }],
    };
    await BlogPost.create({ ...article, title: 'A published article', slug: 'published', status: 'published' });
    await BlogPost.create({ ...article, title: 'A draft article here', slug: 'draft', status: 'draft' });

    const res = await api().get('/api/v1/public/sitemap');
    expect(res.status).toBe(200);
    expect(res.body.data.prompts.map((p: any) => p.title)).toEqual(['Public one']);
    expect(res.body.data.playbook.map((b: any) => b.slug)).toEqual(['published']);
    expect(JSON.stringify(res.body)).not.toContain(user.email);
  });
});

describe('prompt slug migration', () => {
  it('backfills slugs and likesCount idempotently', async () => {
    const { user } = await createUser();
    const fan = await createUser();
    const prompt = await createPrompt(user._id, { title: 'Legacy prompt' });
    await Prompt.collection.updateOne(
      { _id: prompt._id },
      { $unset: { slug: '' }, $set: { likes: [fan.user._id], likesCount: 0 } },
    );

    expect((await migratePromptSlugs()).matched).toBe(1);
    const migrated = await Prompt.findById(prompt._id).lean();
    expect(migrated?.slug).toMatch(/^legacy-prompt-/);
    expect(migrated?.likesCount).toBe(1);
    expect((await migratePromptSlugs()).matched).toBe(0);
  });
});
