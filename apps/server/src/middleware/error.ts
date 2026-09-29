import { ZodError } from 'zod';
import type { ErrorHandler, NotFoundHandler } from 'hono';
import { AppError } from '../lib/errors';
import type { AppDeps } from '../types';

/** 统一错误处理（07 §4）：AppError → 结构化；ZodError → LB_VALIDATION；其余 → 500 只记日志 */
export function errorHandler(deps: AppDeps): ErrorHandler {
  return (err, c) => {
    if (err instanceof AppError) {
      if (err.status >= 500) {
        deps.logger.error({ err, reqId: c.get('reqId') }, 'app error');
      }
      return c.json(
        { error: { code: err.code, message: err.message, details: err.details ?? null } },
        err.status as 400,
      );
    }
    if (err instanceof ZodError) {
      return c.json(
        {
          error: {
            code: 'LB_VALIDATION',
            message: 'validation failed',
            details: err.issues,
          },
        },
        400,
      );
    }
    deps.logger.error({ err, reqId: c.get('reqId'), stack: err.stack }, 'unhandled error');
    return c.json(
      { error: { code: 'LB_INTERNAL', message: 'internal error', details: null } },
      500,
    );
  };
}

export const notFoundHandler: NotFoundHandler = (c) =>
  c.json(
    { error: { code: 'LB_NOT_FOUND', message: 'route not found', details: null } },
    404,
  );
