import http from 'http';
import { v2 as cloudinary } from 'cloudinary';

import config from './config/env.config.js';
import logger from './config/logger.config.js';
import connectDB, { disconnectDB } from './config/db.config.js';

import app from './app.js';
import { shutdownProductAnalytics } from './services/productAnalytics.service.js';

process.on('uncaughtException', (err: Error) => {
  logger.fatal(err, '💥 UNCAUGHT EXCEPTION! Shutting down...');
  process.exit(1);
});

if (config.cloudinary.cloudName) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
  });
  logger.info('[Cloudinary]: Configured successfully');
} else {
  logger.warn('[Cloudinary]: Env vars not found, skipping configuration.');
}

const port = config.port;
let server: http.Server;

const startServer = async () => {
  try {
    await connectDB();

    server = app.listen(port, () => {
      logger.info(
        `[Server]: App running on port ${port} in ${config.nodeEnv} mode...`,
      );
    });
  } catch (err) {
    logger.fatal(err, '💥 FATAL: Failed to start server!');
    process.exit(1);
  }
};

startServer();

process.on('unhandledRejection', (reason: Error | any) => {
  logger.fatal(reason, '💥 UNHANDLED REJECTION! Shutting down gracefully...');
  if (server) {
    server.close(() => {
      logger.info('[Server]: Closed due to unhandled rejection.');
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

const gracefulShutdown = (signal: string) => {
  logger.info(`👋 ${signal} RECEIVED. Shutting down gracefully...`);
  void shutdownProductAnalytics();
  if (server) {
    server.close(async () => {
      logger.info('[Server]: HTTP server closed.');
      await disconnectDB();
      process.exit(0);
    });
  } else {
    (async () => {
      await disconnectDB();
      process.exit(0);
    })();
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
