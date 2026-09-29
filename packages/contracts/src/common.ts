import { z } from 'zod';

/** 语言偏好（13 §3/§6） */
export const localeSchema = z.enum(['zh-CN', 'en']);
export type Locale = z.infer<typeof localeSchema>;

/** 邮箱：入库前统一小写（08 §3.1） */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email());

export const passwordSchema = z.string().min(8).max(72);
export const nameSchema = z.string().trim().min(1).max(64);
export const idSchema = z.uuid();
export const pageIconSchema = z.string().max(64);

/** ISO 8601 UTC 字符串（10 §1） */
export const isoDatetimeSchema = z.iso.datetime();
