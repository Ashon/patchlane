# Agent Task UI Tracking Plan

This document tracks the information architecture for issue-scoped agent work.
It is written for agents changing the Issues or Tasks surfaces.

## Current Model

- An issue owns the work plan and progress.
- The work plan is an ordered list of issue tasks. The persisted field is still
  `issue.subtasks` for compatibility, but new API/UI code should use
  `IssueTask` naming and `/issues/:id/tasks` routes.
- Each issue task can link to one agent run through `agentRunId`/`subtaskId`.
- Standalone ad-hoc agent runs are still task history, but they are not part of
  an issue progress calculation unless linked to an issue task.

## Target Behavior

- Issues show task progress because the issue is the parent workflow.
- The issue detail view shows the issue brief first, then task progress and the
  ordered issue task list, then activity.
- Project Tasks and global Agent Tasks list executable task rows and ad-hoc
  runs. They should not add a second workflow-summary row that competes with
  the issue progress shown in Issues.
- Clicking a linked issue task opens the associated agent chat. Planned tasks
  without a run remain visible but non-interactive until started.

## API Guidelines

- Prefer `/api/issues/:id/tasks` for new client code.
- Keep legacy `/api/issues/:id/subtasks` routes working until persisted data and
  older clients are migrated.
- Prefer `replaceIssueTasks`, `updateIssueTask`, and `markTaskRunStarted` in new
  API/store code. Legacy store methods may remain as compatibility wrappers.
- Planning prompts should ask models for `{ "tasks": [...] }`. Parsers may keep
  accepting legacy `{ "subtasks": [...] }` responses.

## UI Guidelines

- Put aggregate progress next to the issue, not as a separate workflow item in
  the Tasks tab.
- In task lists, each row should represent one executable unit: either an issue
  task or an ad-hoc agent run.
- Use compact metadata such as `Step n/m`, issue title, status, and timestamp.
- Avoid duplicating the same status in multiple nearby badges.
- Preserve existing chat behavior and resizable panel behavior.

## Follow-Up TODO

- Add explicit Resume, Retry, and Discard actions for stuck issue tasks.
- Add a detail pane for planned issue tasks that do not yet have a run.
- Add E2E assertions for progress after planning, partial completion, awaiting
  user input, failure, and completion.
- Plan a database/API migration from persisted `subtasks` naming to `tasks` once
  the compatibility surface is no longer needed.
