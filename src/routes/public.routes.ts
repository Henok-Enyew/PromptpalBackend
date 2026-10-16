import { Router } from 'express';
import { getSitemap } from '../controllers/public.controller.js';

const router = Router();

/**
 * @swagger
 * /public/sitemap:
 *   get:
 *     summary: Public prompts and Playbook articles for prerendering and sitemap.xml
 *     tags: [Public]
 *     description: Only public, visible prompts with a slug and published Playbook articles. No user data.
 *     responses:
 *       200:
 *         description: Sitemap entries
 */
router.get('/sitemap', getSitemap);

export default router;
