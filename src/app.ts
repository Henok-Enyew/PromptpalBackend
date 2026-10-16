import express, { Express, Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import config from './config/env.config.js';
import logger from './config/logger.config.js';
import swaggerSpec from './config/swagger.js';
import AppError from './utils/appError.util.js';
import { globalErrorHandler } from './middleware/error.middleware.js';
import { globalLimiter } from './middleware/rateLimit.middleware.js';
import { originCheck } from './middleware/originCheck.middleware.js';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import adminRoutes from './routes/admin.routes.js';
import promptRoutes from './routes/prompt.routes.js';
import promptOptimizerRoutes from './routes/promptOptimizer.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import blogRoutes from './routes/blog.routes.js';
import blogAdminRoutes from './routes/blogAdmin.routes.js';
import publicRoutes from './routes/public.routes.js';
import evaluationRoutes from './routes/evaluation.routes.js';

const app: Express = express();

// Number of reverse proxies in front of the app (Render = 1; Render behind the
// Vercel /api rewrite = 2). Never `true`: that lets clients spoof their IP and
// bypass rate limits.
app.set('trust proxy', config.trustProxyHops);

// Configure Helmet to allow cross-origin cookies
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  }),
);

const morganStream = {
  write: (message: string) => logger.debug(message.trim()),
};

if (!config.isProduction) {
  app.use(morgan('dev', { stream: morganStream }));
} else {
  app.use(morgan('short', { stream: morganStream }));
}

app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Set-Cookie'],
  }),
);

app.use(cookieParser());

app.use('/api', globalLimiter);
app.use('/api', originCheck);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/admin/analytics', analyticsRoutes);
app.use('/api/v1/admin/blogs', blogAdminRoutes);
app.use('/api/v1/prompts', promptRoutes);
app.use('/api/v1/prompt-optimizer', promptOptimizerRoutes);
app.use('/api/v1/blogs', blogRoutes);
app.use('/api/v1/public', publicRoutes);
app.use('/api/v1/evaluations', evaluationRoutes);

app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'success',
    message: 'Prompt Pal Backend API is running!',
  });
});

app.use((req: Request, res: Response, next: NextFunction) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

export default app;
