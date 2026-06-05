export type AgentRegressionCase = {
  description: string
  number: number
  quality: {
    forbiddenChangedPathPatterns?: string[]
    maxBlockedToolResults?: number
    requiredChangedPathPatterns?: string[]
  }
}

export const agentRegressionCases: AgentRegressionCase[] = [
  {
    number: 1,
    description: [
      'Improve the agent task chat UI so structured JSON tool input and output are easier to inspect.',
      '',
      'Current code areas to inspect:',
      '- apps/web/src/components/ui/tool.tsx',
      '- apps/web/src/components/chat/chat-tool-part.ts',
      '- apps/web/src/components/ui/code-block.tsx',
      '- apps/web/src/lib/agent-task-messages.ts',
      '',
      'Acceptance criteria:',
      '1. Detect JSON objects, arrays, and stringified JSON for tool input/output display.',
      '2. Keep collapsed tool rows compact and avoid dumping large one-line JSON in the preview.',
      '3. Show expanded JSON with readable indentation, stable scrolling/wrapping, and copy-friendly text.',
      '4. Preserve non-JSON output fallback behavior and the existing tool status affordances.',
      '5. Add focused web tests when parser or formatter helpers are introduced.',
      '6. Verify with pnpm --filter @patchlane/web typecheck and the relevant focused tests.',
      '',
      'Do not ask for clarification. Plan the work into issue tasks, execute the tasks, verify, add concise issue comments, and finish.',
    ].join('\n'),
    quality: {
      forbiddenChangedPathPatterns: [
        '^fix[-_].*',
        '^project-issues-view\\.tsx$',
      ],
      maxBlockedToolResults: 10,
      requiredChangedPathPatterns: [
        '^apps/web/src/components/ui/tool\\.tsx$',
        '^apps/web/src/lib/agent-task-messages\\.ts$',
      ],
    },
  },
  {
    number: 2,
    description: [
      'Allow creating a project issue with only a title.',
      '',
      'Current code areas to inspect:',
      '- packages/shared/src/issues.ts',
      '- apps/api/src/issues/issueStore.ts',
      '- apps/web/src/components/issues/project-issues-view.tsx',
      '- apps/web/src/components/app/app-command-palette.tsx',
      '',
      'Acceptance criteria:',
      '1. The API accepts POST /api/issues with title and projectId only.',
      '2. Missing or blank description is normalized safely without breaking issue parsing or persistence.',
      '3. The project issue dialog does not require the Description field.',
      '4. The command palette quick issue flow does not require the Description field.',
      '5. Existing issue creation with a description remains supported.',
      '6. Add or update focused tests for title-only issue creation.',
      '7. Verify with pnpm --filter @patchlane/api test, pnpm --filter @patchlane/web typecheck, and any focused web tests if UI helpers change.',
      '',
      'Do not ask for clarification. Plan the work into issue tasks, execute the tasks, verify, add concise issue comments, and finish.',
    ].join('\n'),
    quality: {
      forbiddenChangedPathPatterns: [
        '^fix[-_].*',
        '^project-issues-view\\.tsx$',
      ],
      maxBlockedToolResults: 20,
      requiredChangedPathPatterns: [
        '^packages/shared/src/issues\\.ts$',
        '^apps/web/src/components/issues/project-issues-view\\.tsx$',
        '^apps/web/src/components/app/app-command-palette\\.tsx$',
      ],
    },
  },
  {
    number: 3,
    description: [
      'Make running task badges visually explicit by showing a loader icon.',
      '',
      'Current code areas to inspect:',
      '- apps/web/src/components/issues/common.tsx',
      '- apps/web/src/components/issues/project-tasks-view.tsx',
      '- apps/web/src/pages/agent/agent-tasks-page.tsx',
      '',
      'Acceptance criteria:',
      '1. Running issue task status badges show a small Loader2 icon with animate-spin.',
      '2. Running agent run status badges keep a consistent icon/text layout where they are used in task lists.',
      '3. Completed, failed, pending, skipped, and awaiting_user visual states keep their current semantic tone.',
      '4. Icon size is stable so task rows do not shift when status changes.',
      '5. Verify with pnpm --filter @patchlane/web typecheck and focused tests if badge behavior is covered.',
      '',
      'Do not ask for clarification. Plan the work into issue tasks, execute the tasks, verify, add concise issue comments, and finish.',
    ].join('\n'),
    quality: {
      forbiddenChangedPathPatterns: ['^fix[-_].*', '\\.(cjs|py)$'],
      maxBlockedToolResults: 10,
      requiredChangedPathPatterns: [
        '^apps/web/src/components/issues/common\\.tsx$',
      ],
    },
  },
]
