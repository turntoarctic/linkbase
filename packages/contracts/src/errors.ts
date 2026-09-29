import { z } from 'zod';

/**
 * LB_* 错误码全集（10 §6）——前后端唯一来源。
 * message 仅是 zh 兜底文案（客户端按 code 本地化，13 §4），服务端日志用英文。
 */
export const errorCodes = {
  VALIDATION: 'LB_VALIDATION',
  UNAUTHORIZED: 'LB_UNAUTHORIZED',
  TOKEN_INVALID: 'LB_TOKEN_INVALID',
  FORBIDDEN: 'LB_FORBIDDEN',
  NOT_FOUND: 'LB_NOT_FOUND',
  PAGE_NOT_FOUND: 'LB_PAGE_NOT_FOUND',
  EMAIL_TAKEN: 'LB_EMAIL_TAKEN',
  TAG_EXISTS: 'LB_TAG_EXISTS',
  RATE_LIMITED: 'LB_RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'LB_PAYLOAD_TOO_LARGE',
  INTERNAL: 'LB_INTERNAL',
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];

export const errorFallbackMessages: Record<ErrorCode, string> = {
  LB_VALIDATION: '请求参数无效',
  LB_UNAUTHORIZED: '未登录或登录已过期',
  LB_TOKEN_INVALID: '登录已失效，请重新登录',
  LB_FORBIDDEN: '没有权限执行此操作',
  LB_NOT_FOUND: '资源不存在',
  LB_PAGE_NOT_FOUND: '页面不存在',
  LB_EMAIL_TAKEN: '该邮箱已被注册',
  LB_TAG_EXISTS: '同名标签已存在',
  LB_RATE_LIMITED: '操作过于频繁，请稍后再试',
  LB_PAYLOAD_TOO_LARGE: '内容超过大小限制',
  LB_INTERNAL: '服务开小差了，请稍后再试',
};

/** 统一错误响应体（10 §1） */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().nullable(),
  }),
});
