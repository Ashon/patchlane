import type { Request, Response, NextFunction } from 'express'

export type AuthUser = {
  id: string
  googleId: string
  email: string
  name: string
  picture?: string
  role: 'user' | 'admin'
  createdAt: string
  updatedAt: string
}

declare global {
  namespace Express {
    interface User extends AuthUser {}
  }
}

export const isAuthenticated = (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  if (!request.isAuthenticated || !(request.isAuthenticated() as boolean)) {
    return response.status(401).json({ error: 'Unauthorized' })
  }

  next()
}

export const isAdmin = (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  if (!request.user || (request.user as AuthUser).role !== 'admin') {
    return response.status(403).json({ error: 'Forbidden' })
  }

  next()
}

export const optionalAuth = (
  request: Request,
  _response: Response,
  next: NextFunction,
) => {
  if (request.isAuthenticated && (request.isAuthenticated() as boolean)) {
    return next()
  }

  next('router')
}