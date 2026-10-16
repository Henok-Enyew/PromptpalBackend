import { Request, Response } from 'express';
import catchAsync from '../utils/catchAsync.util.js';
import { getPublicSitemapPrompts } from '../services/prompt.service.js';
import { getPublicSitemapPlaybook } from '../services/blog.service.js';

export const getSitemap = catchAsync(async (_req: Request, res: Response) => {
  const [prompts, playbook] = await Promise.all([
    getPublicSitemapPrompts(),
    getPublicSitemapPlaybook(),
  ]);

  res.set('Cache-Control', 'public, max-age=300');
  res.status(200).json({
    status: 'success',
    data: {
      prompts: prompts.map((p) => ({
        slug: p.slug,
        title: p.title,
        description: p.description,
        aiModel: p.aiModel,
        tags: p.tags,
        image: p.mediaType === 'image' ? p.sampleOutput : undefined,
        updatedAt: p.updatedAt,
      })),
      playbook: playbook.map((b) => ({
        slug: b.slug,
        title: b.title,
        description: b.openingQuote,
        image: b.coverImage,
        category: b.category,
        tags: b.tags,
        updatedAt: b.updatedAt,
      })),
    },
  });
});
