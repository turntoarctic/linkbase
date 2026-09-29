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
