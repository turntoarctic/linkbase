/** 统一业务错误（07 §4）：service 层只 throw 这个，路由不拼错误响应 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError('LB_VALIDATION', 400, message, details);
export const unauthorized = (message = 'missing or invalid credentials') =>
  new AppError('LB_UNAUTHORIZED', 401, message);
export const forbidden = (message = 'not allowed') => new AppError('LB_FORBIDDEN', 403, message);
export const notFound = (message = 'resource not found') =>
  new AppError('LB_NOT_FOUND', 404, message);
export const pageNotFound = () => new AppError('LB_PAGE_NOT_FOUND', 404, 'page not found');

/**
 * 唯一冲突（PG 23505）检测：drizzle 会把驱动错误包在 DrizzleQueryError 里，
 * 需沿 cause 链逐层找原始 PG 错误（constraint 名或 message）。
 */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  for (let e = err; e instanceof Error; e = (e as { cause?: Error }).cause) {
    const pg = e as Error & { code?: string; constraint?: string };
    if (pg.code === '23505' && (!constraint || pg.constraint === constraint)) return true;
    if (constraint && e.message.includes(constraint)) return true;
  }
  return false;
}
