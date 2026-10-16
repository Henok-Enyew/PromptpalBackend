export interface ExtendedError extends Error {
  statusCode?: number;
  status?: 'fail' | 'error';
  isOperational?: boolean;
  code?: number;
  path?: string;
  value?: any;
  errmsg?: string;
  details?: Record<string, unknown>;
}
