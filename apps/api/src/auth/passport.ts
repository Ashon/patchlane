import passport from 'passport'
import { Strategy as GoogleStrategy, VerifyCallback } from 'passport-google-oauth20'
import type { User } from './authStore'
import type { AuthUser } from './authMiddleware'

type PassportConfig = {
  clientID: string
  clientSecret: string
  callbackURL: string
}

export const createPassportConfig = (
  config: PassportConfig,
  findOrCreateUser: (profile: {
    googleId: string
    email: string
    name: string
    picture?: string
  }) => User,
) => {
  const strategy = new GoogleStrategy(
    {
      clientID: config.clientID,
      clientSecret: config.clientSecret,
      callbackURL: config.callbackURL,
    },
    (
      _accessToken: string,
      _refreshToken: string,
      profile: passport.Profile,
      done: VerifyCallback,
    ) => {
      try {
        const user = findOrCreateUser({
          googleId: profile.id,
          email: profile.emails?.[0]?.value ?? '',
          name: profile.displayName,
          picture: profile.photos?.[0]?.value,
        })

        done(null, user)
      } catch (error) {
        done(error as Error)
      }
    },
  )

  passport.use(strategy)

  passport.serializeUser((user: AuthUser, done: (err: Error | null, id?: string) => void) => {
    done(null, user.id)
  })

  passport.deserializeUser((id: string, done: (err: Error | null, user?: AuthUser | false) => void) => {
    done(null, { id } as AuthUser)
  })

  return passport
}

export { passport }