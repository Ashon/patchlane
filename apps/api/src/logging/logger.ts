import pino, { type Logger, type LoggerOptions } from 'pino'

export type ApiLogger = Logger

const serviceName = 'patchlane-api'

export const logger = pino(getLoggerOptions())

export const createChildLogger = (
  bindings: Record<string, unknown>,
  parent: ApiLogger = logger,
) => parent.child(bindings)

function getLoggerOptions(): LoggerOptions {
  const level = getLogLevel()
  const pretty = level !== 'silent' && getLogFormat() === 'pretty'

  return {
    base: {
      service: serviceName,
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    level,
    messageKey: 'message',
    redact: {
      paths: [
        'apiKey',
        'authorization',
        'cookie',
        'githubToken',
        'headers.authorization',
        'headers.cookie',
        'password',
        'request.headers.authorization',
        'request.headers.cookie',
        'token',
      ],
      censor: '[redacted]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: pretty
      ? {
          target: 'pino-pretty',
          options: {
            colorize: process.env.NO_COLOR !== '1',
            ignore: 'pid,hostname',
            messageFormat: '[{component}] {event} {message}',
            singleLine: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
          },
        }
      : undefined,
  }
}

function isTruthy(value: string | undefined) {
  return value === '1' || value?.toLowerCase() === 'true'
}

function getLogLevel() {
  return (
    process.env.LOG_LEVEL?.trim() ||
    (process.env.NODE_ENV === 'test' ? 'silent' : 'info')
  )
}

function getLogFormat() {
  const format = process.env.LOG_FORMAT?.trim().toLowerCase()

  if (format === 'json' || format === 'pretty') {
    return format
  }

  if (format) {
    throw new Error('LOG_FORMAT must be either "pretty" or "json"')
  }

  if (process.env.LOG_PRETTY !== undefined) {
    return isTruthy(process.env.LOG_PRETTY) ? 'pretty' : 'json'
  }

  return 'pretty'
}
