import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  SandboxFileContent,
  SandboxFileEntry,
  SandboxWorkspace,
} from '@patchlane/shared'
import { badRequest } from '../http/errors'
import { ensureWorkspacePath } from './sandboxExecutor'

const maxReadableFileBytes = 1_000_000
const ignoredDirectoryNames = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
])

export const listWorkspaceFiles = async (
  workspace: SandboxWorkspace,
  requestedPath = '.',
): Promise<SandboxFileEntry[]> => {
  const absolutePath = ensureWorkspacePath(workspace, requestedPath)
  const entries = await readdir(absolutePath, { withFileTypes: true })

  const result = await Promise.all(
    entries
      .filter((entry) => !ignoredDirectoryNames.has(entry.name))
      .map(async (entry) => {
        const entryPath = path.join(absolutePath, entry.name)
        const entryStat = await stat(entryPath)
        const relativePath = path.relative(workspace.path, entryPath) || '.'

        return {
          name: entry.name,
          path: relativePath,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entry.isDirectory() ? undefined : entryStat.size,
          modifiedAt: entryStat.mtime.toISOString(),
        } satisfies SandboxFileEntry
      }),
  )

  return result.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'directory' ? -1 : 1
    }

    return left.name.localeCompare(right.name)
  })
}

export const readWorkspaceFile = async (
  workspace: SandboxWorkspace,
  requestedPath: string,
): Promise<SandboxFileContent> => {
  const absolutePath = ensureWorkspacePath(workspace, requestedPath)
  const fileStat = await stat(absolutePath)

  if (!fileStat.isFile()) {
    throw badRequest(`Path '${requestedPath}' is not a file`)
  }

  if (fileStat.size > maxReadableFileBytes) {
    throw badRequest(`File '${requestedPath}' is too large to read`)
  }

  return {
    path: path.relative(workspace.path, absolutePath) || '.',
    content: await readFile(absolutePath, 'utf8'),
    size: fileStat.size,
    modifiedAt: fileStat.mtime.toISOString(),
  }
}

export const writeWorkspaceFile = async (
  workspace: SandboxWorkspace,
  requestedPath: string,
  content: string,
): Promise<SandboxFileContent> => {
  const absolutePath = ensureWorkspacePath(workspace, requestedPath)

  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, content, 'utf8')

  return readWorkspaceFile(workspace, requestedPath)
}
