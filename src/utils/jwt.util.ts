import Jwt from 'jsonwebtoken';
import config from '../config/env.config.js';
import logger from '@/config/logger.config.js';

export const signToken = (userId: string): string => {
  // JWT_EXPIRES_IN may be seconds ("7776000") or a duration ("90d").
  const { expiresIn: raw } = config.jwt;
  const expiresIn = /^\d+$/.test(raw)
    ? parseInt(raw, 10)
    : (raw as Jwt.SignOptions['expiresIn']);
  const token = Jwt.sign({ id: userId }, config.jwt.secret, { expiresIn });
  logger.debug(
    `Generated JWT for user ${userId} with expiration ${config.jwt.expiresIn}`,
  );
  return token;
};
