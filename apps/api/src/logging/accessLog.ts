import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { logger, type ApiLogger } from './logger'

type ResponseWithLogger = Response & {
  locals: Response['locals'] & {
    logger?: ApiLogger
    requestId?: string
  }
}

const requestIdHeader = 'x-request-id'

export const createAccessLogMiddleware =
  (rootLogger: ApiLogger = logger) =>
  (request: Request, response: Response, next: NextFunction) => {
    const startedAt = Date.now()
    const requestId = getRequestId(request)
    const responseWithLogger = response as ResponseWithLogger
    const requestLogger = rootLogger.child({ requestId })

    responseWithLogger.locals.requestId = requestId
    responseWithLogger.locals.logger = requestLogger
    response.setHeader('X-Request-Id', requestId)

    requestLogger.debug(
      {
        component: 'http',
        event: 'http.request.start',
        method: request.method,
        path: request.originalUrl,
      },
      'HTTP request started',
    )

    response.on('finish', () => {
      const durationMs = Date.now() - startedAt
      const statusCode = response.statusCode
      const logPayload = {
        component: 'http',
        event: 'http.request.complete',
        method: request.method,
        path: request.originalUrl,
        statusCode,
        durationMs,
        remoteAddress: request.ip,
        userAgent: request.get('user-agent'),
        contentLength: getHeaderValue(response.getHeader('content-length')),
      }

      if (statusCode >= 500) {
        requestLogger.error(logPayload, 'HTTP request completed')
        return
      }

      if (statusCode >= 400) {
        requestLogger.warn(logPayload, 'HTTP request completed')
        return
      }

      requestLogger.info(logPayload, 'HTTP request completed')
    })

    response.on('close', () => {
      if (response.writableEnded) {
        return
      }

      requestLogger.warn(
        {
          component: 'http',
          event: 'http.request.aborted',
          method: request.method,
          path: request.originalUrl,
          durationMs: Date.now() - startedAt,
          remoteAddress: request.ip,
        },
        'HTTP request aborted before response finished',
      )
    })

    next()
  }

export const getRequestLogger = (response: Response): ApiLogger => {
  return (response as ResponseWithLogger).locals.logger ?? logger
}

const getRequestId = (request: Request) => {
  const header = request.get(requestIdHeader)?.trim()

  return header || randomUUID()
}

const getHeaderValue = (value: number | string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value.join(',')
  }

  return value
}
