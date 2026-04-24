import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: isDev ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  redact: ['authorization', 'apiKey', 'password', 'jwt_secret'],
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

export type Logger = pino.Logger;
