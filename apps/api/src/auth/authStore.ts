import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../db/database'

export type User = {
  id: string
  googleId: string
  email: string
  name: string
  picture?: string
  role: 'user' | 'admin'
  createdAt: string
  updatedAt: string
}

type UserRow = {
  id: string
  google_id: string
  email: string
  name: string
  picture: string | null
  role: string
  created_at: string
  updated_at: string
}

export class AuthStore {
  constructor(private readonly database: AppDatabase) {}

  findByGoogleId(googleId: string): User | undefined {
    const row = this.database.sqlite
      .prepare('SELECT * FROM users WHERE google_id = ?')
      .get(googleId) as UserRow | undefined

    return row ? toUser(row) : undefined
  }

  findByEmail(email: string): User | undefined {
    const row = this.database.sqlite
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email) as UserRow | undefined

    return row ? toUser(row) : undefined
  }

  findById(id: string): User | undefined {
    const row = this.database.sqlite
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(id) as UserRow | undefined

    return row ? toUser(row) : undefined
  }

  create(input: {
    googleId: string
    email: string
    name: string
    picture?: string
  }): User {
    const id = randomUUID()
    const now = new Date().toISOString()

    this.database.sqlite
      .prepare(
        `INSERT INTO users (id, google_id, email, name, picture, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'user', ?, ?)`,
      )
      .run(id, input.googleId, input.email, input.name, input.picture ?? null, now, now)

    return {
      id,
      googleId: input.googleId,
      email: input.email,
      name: input.name,
      picture: input.picture,
      role: 'user',
      createdAt: now,
      updatedAt: now,
    }
  }

  update(id: string, input: Partial<Pick<User, 'name' | 'picture'>>) {
    const now = new Date().toISOString()
    const updates: string[] = ['updated_at = ?']
    const values: (string | number)[] = [now]

    if (input.name !== undefined) {
      updates.push('name = ?')
      values.push(input.name)
    }

    if (input.picture !== undefined) {
      updates.push('picture = ?')
      values.push(input.picture)
    }

    values.push(id)

    this.database.sqlite
      .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
      .run(...values)
  }

  list(): User[] {
    const rows = this.database.sqlite
      .prepare('SELECT * FROM users ORDER BY created_at DESC')
      .all() as UserRow[]

    return rows.map(toUser)
  }
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    googleId: row.google_id,
    email: row.email,
    name: row.name,
    picture: row.picture ?? undefined,
    role: row.role as 'user' | 'admin',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}