import { IUserDocument } from '../user.types.js';

declare global {
  namespace Express {
    export interface Request {
      user?: IUserDocument;
    }
    export interface Locals {
      /** Give back the unit reserved by requireQuota (failed or free work). */
      refundQuota?: () => Promise<void>;
    }
  }
}
