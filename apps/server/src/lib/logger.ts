import pino from 'pino';

export type Logger = pino.Logger;

/** Pino stdout 直出，不用 worker transport（07 §3）；redact 敏感字段 */
export function createLogger(level: string = 'info'): Logger {
  return pino({
    level,
    redact: {
      paths: ['password', '*.password', 'email', '*.email', 'req.headers.authorization'],
      censor: '[redacted]',
    },
  });
}
