import { existsSync, readFileSync } from 'node:fs'
import type { z } from 'zod'

export const readLegacyJson = <TSchema extends z.ZodTypeAny>(
  filePath: string | undefined,
  schema: TSchema,
): z.output<TSchema> | undefined => {
  if (!filePath || !existsSync(filePath)) {
    return undefined
  }

  const raw = readFileSync(filePath, 'utf8')
  return schema.parse(JSON.parse(raw))
}
