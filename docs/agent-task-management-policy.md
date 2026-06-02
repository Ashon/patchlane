# Agent Task Management Policy

This document defines the target management policy for project-scoped coding agents, from project creation to issue execution and pull request creation.

## Goals

- Keep repository setup, issue tracking, agent task history, and coding workspaces clearly separated.
- Run each coding task in an isolated workspace so concurrent tasks do not share dirty state.
- Make every meaningful agent phase visible and recoverable from the UI.
- Preserve enough history to retry, resume, inspect, or delete failed work without blocking future work.
- Let a user move from project creation to issue registration, planning, implementation, verification, and PR creation through predictable steps.

## Core Concepts

### Project

A Project represents one repository and its default execution policy.

Project owns:

- Project name and description
- Repository URL
- Base ref, such as `main`, `develop`, or a release branch
- Branch prefix, such as `agent`
- Default LLM endpoint
- Optional default verification commands
- Optional project policy or coding constraints

Project does not own a mutable coding workspace. It should not be the place where issue-specific changes are made.

### Issue

An Issue represents a user request inside a Project.

Issue owns:

- Title and description
- Priority and status
- Project reference
- Requirement analysis output
- Work plan output
- Linked Agent Tasks
- Linked coding Agent Run
- Target branch name
- Final PR URL when available

Issue status should describe the user-visible lifecycle, not only the latest agent run status.

Recommended statuses:

- `backlog`: created, not analyzed
- `planning`: requirement analysis or work planning is running
- `ready`: analyzed and ready to run
- `running`: coding agent is working
- `awaiting_user`: agent needs clarification or approval
- `review`: PR or reviewable output exists
- `completed`: work is accepted or merged
- `blocked`: cannot proceed without external input
- `failed`: latest workflow failed, but can be retried

### Agent Task

An Agent Task is a tracked unit of agent work. It may or may not edit code.

Recommended task kinds:

- `requirements`: analyze what the issue asks for
- `planning`: create a concrete implementation plan
- `coding`: implement code changes
- `verification`: run checks and summarize results
- `publish`: push branch and create PR
- `followup`: continue or retry after user feedback

Agent Task owns:

- Task kind
- Project ID
- Issue ID when applicable
- Workspace ID when applicable
- Status
- Input prompt
- Conversation messages
- Tool events
- Result summary
- Error state

### Agent Run

An Agent Run is the conversation and execution record for a task.

For now, Agent Task and Agent Run can be represented by the same `agent_runs` table if the table keeps `kind`, `projectId`, `issueId`, `workspaceId`, `status`, context, and messages. If the model grows, Agent Task can become a separate parent entity and Agent Run can become an execution attempt.

### Task Workspace

A Task Workspace is the isolated filesystem where a coding task runs.

For coding work, the preferred policy is Git worktree based isolation:

- Keep a local project repository cache under the sandbox root.
- For each coding task, create a new Git worktree from the project base ref.
- Create or check out a task branch inside that worktree.
- Run all coding tools inside that worktree only.
- Preserve the worktree while the task is running, failed, awaiting user input, or under review.
- Delete or archive the worktree only through an explicit cleanup policy.

GitHub is the remote provider. Git worktree is the local isolation mechanism.

## Workspace Policy

### Repository Cache

Each Project should have one repository cache.

Purpose:

- Avoid cloning the full repository for every task.
- Keep remote refs up to date.
- Provide a clean base for new task worktrees.

Recommended path:

```text
.data/sandboxes/projects/{projectId}/repo
```

Before creating a task worktree:

1. Ensure the repository cache exists.
2. Fetch the remote.
3. Resolve the configured base ref.
4. Refuse to start if the base ref cannot be resolved.

### Task Worktree

Each coding task should have one task worktree.

Recommended path:

```text
.data/sandboxes/projects/{projectId}/tasks/{taskId}
```

Recommended branch name:

```text
{branchPrefix}/{issueId}-{shortTaskId}
```

Example:

```text
agent/issue-1234-a1b2c3d4
```

Creation flow:

1. Fetch project repository cache.
2. Generate a unique task branch.
3. Run `git worktree add -b {branchName} {taskPath} {baseRef}`.
4. Register the workspace as `task_worktree`.
5. Link the workspace to the coding Agent Task and Issue.

### Cleanup

Cleanup must be explicit and state-aware.

Allowed cleanup:

- Completed task with merged PR
- Failed task after user confirms deletion
- Deleted task where branch/worktree is no longer needed

Cleanup should:

1. Remove the Git worktree.
2. Optionally delete the local branch.
3. Keep the Agent Task history unless the user explicitly deletes it.
4. Never delete a remote branch without explicit confirmation.

## User Use Cases

### 1. User Creates A Project

User action:

1. Open Projects.
2. Click New Project.
3. Enter name, repository URL, base ref, branch prefix, and default endpoint.
4. Submit.

System flow:

1. Validate repository URL and project fields.
2. Save Project.
3. Create or refresh the project repository cache.
4. Validate GitHub credentials if the repository requires authentication.
5. Fetch remote refs.
6. Mark Project as ready if the base ref can be resolved.

Expected UI:

- Project appears in the Projects list.
- Repository readiness is visible.
- Misconfigured GitHub credentials or missing base ref are shown as actionable errors.

Failure behavior:

- Project can still exist with an error state.
- Issue creation may be allowed, but Analyze/Run should warn that repository setup is not ready.

### 2. User Registers An Issue

User action:

1. Open a Project detail page.
2. Click New Issue.
3. Enter title, description, and priority.
4. Submit.

System flow:

1. Create Issue with `backlog` status.
2. Link Issue to Project.
3. Precompute a suggested branch name.
4. Do not create a coding worktree yet.

Expected UI:

- Issue appears in Project Issues.
- Available primary action is Analyze.
- Run is disabled until planning is complete, unless the user chooses a direct-run mode.

### 3. User Starts Requirement Analysis

User action:

1. Click Analyze on an Issue.

System flow:

1. Check Project repository readiness.
2. Create `requirements` Agent Task.
3. Create `planning` Agent Task after or alongside requirements.
4. Set Issue status to `planning`.
5. Run requirement analysis using project metadata, issue text, and a read-only repository snapshot.
6. Store requirement output in the task conversation.

Expected UI:

- Project scoped Tasks page shows the requirements task immediately.
- Global Agent Tasks page also shows the task.
- Issue status changes to `planning`.
- User can open the task and inspect messages.

Failure behavior:

- Failed requirement task sets Issue to `failed` or `blocked` depending on error type.
- User can retry Analyze.
- Missing/deleted task records must not permanently block retry.

### 4. System Creates A Work Plan

Trigger:

- Requirement analysis completes.

System flow:

1. Start or continue the `planning` Agent Task.
2. Use requirement output, project policy, repository snapshot, and issue description.
3. Produce a plan that includes:
   - Scope
   - Files or areas likely to change
   - Verification commands
   - Risks
   - Expected branch/worktree
4. Save combined analysis on the Issue.
5. Set Issue status to `ready`.

Expected UI:

- Issue shows the requirement analysis and work plan.
- Run becomes available.
- The planning task is visible in both global and project-scoped task lists.

Failure behavior:

- Issue can be retried from Analyze.
- Existing stale task IDs should be ignored if the linked tasks no longer exist or are terminal.

### 4.1. System Reconciles A Completed Plan

Trigger:

- A `planning` Agent Task is completed through the Agent Tasks conversation.
- A previous requirement task failed or timed out, but the planning task still produced a usable handoff plan.
- An Issue has a stale coding run ID because a previous Agent Task was deleted.
- User clicks Run on an Issue whose planning task is complete but whose Issue analysis was not updated.

System flow:

1. Load the Issue and linked Agent Tasks.
2. If `agent_run_id` points to a missing coding task, clear that stale link.
3. If Issue already has `analysis`, keep it and continue.
4. If linked `planning` task is `completed`, extract the result from `result_summary`, `finish` tool output, or the latest assistant result.
5. If linked `requirements` task is completed, include its result.
6. If the requirements result is missing or failed, build a fallback requirement context from the Issue title, description, priority, and requirement task state.
7. Combine requirement context and work plan into Issue `analysis`.
8. Set Issue status to `ready`.
9. Keep the completed planning task linked so users can inspect the original task history.

Expected UI:

- A completed Plan task makes Run available even if the Issue was previously `failed`.
- Clicking Run first reconciles the Issue state, then starts the coding run.
- Agent Tasks completion refreshes issue state so Projects reflects the latest lifecycle.

Failure behavior:

- If no usable planning result exists, keep the Issue unready and create or retry planning from Analyze.
- If a coding run is still active, block duplicate Run even if planning is ready.
- Missing deleted task records should be treated as stale links, not permanent blockers.

### 5. User Starts Coding Run

User action:

1. Click Run on a ready Issue.

System flow:

1. Verify Issue is ready.
2. Check there is no active coding task for the Issue.
3. Refresh Project repository cache.
4. Create task branch.
5. Create task Git worktree.
6. Register task workspace.
7. Create `coding` Agent Task and Agent Run.
8. Link coding run and workspace to Issue.
9. Set Issue status to `running`.
10. Navigate user to the coding conversation.

Expected UI:

- User lands directly in the coding agent conversation.
- The task workspace, branch, project, and issue context are visible.
- Streaming output, reasoning, and tool use share the same chat UI pattern.
- Tool use is compact and inline with the agent's workflow.

Failure behavior:

- If worktree creation fails, no coding run should start.
- If a stale run ID exists but the run was deleted, Run should be enabled again.
- If a run is active, starting another coding run should be blocked unless the user explicitly creates a parallel attempt.

### 6. Coding Agent Works In The Task Workspace

Agent flow:

1. Read issue and plan.
2. Inspect repository files.
3. Edit files only inside the task workspace.
4. Run relevant checks.
5. Inspect git status and diff.
6. Ask user for clarification if blocked.
7. Summarize changes and verification results.

Tool policy:

- File and command tools must be scoped to the task workspace path.
- Git commands are allowed only through allowlisted command execution.
- Basic file-operation commands (`mkdir`, `cp`, `mv`, `rm`, `touch`, `chmod`) are allowlisted so coding tasks can edit worktree files without needing a container yet.
- File-operation path arguments must stay inside the task workspace.
- Recursive `rm`, destructive git subcommands, and dangerous `find` actions such as `-delete` and `-exec` are blocked by the sandbox executor.
- GitHub credentials are injected server-side and are never exposed to the UI.
- Raw tool JSON should be rendered as Tool UI, not copied into assistant messages.

Expected UI:

- Assistant messages, tool calls, and reasoning appear as one continuous workflow.
- User can send follow-up messages while the task is awaiting input.
- Context compaction is visible when applied.

### 6.1. Context Compaction And Continuation

Trigger:

- Agent Run messages exceed the configured context input budget.
- Large tool results, repeated file reads, or long conversations make the full transcript too large to send.

Current policy:

1. Before each Agent Run continuation, build the model prompt from stored run messages.
2. If the full prompt fits the input budget, use the full transcript.
3. If it does not fit, build a compacted prompt:
   - System prompt
   - `Context memory` system message summarizing older stored messages
   - Recent retained messages
4. Save context metadata on the Agent Run:
   - `strategy`
   - `estimatedTokens`
   - `tokenBudget`
   - `summarizedMessages`
   - `retainedMessages`
   - compacted `summary`
5. Show compacted memory in the Agent conversation UI.

Continuation behavior:

- The compacted context is used as the next model prompt.
- The raw database transcript is not deleted; each continuation can rebuild a fresh compacted prompt.
- Tool results are treated as private context and should not be copied into assistant-facing prose.
- Replay after a stalled run should add recovery guidance so the agent does not repeat the same exploration loop.
- If a model emits only private reasoning without a tool call, finish, or blocking question, the runtime should continue internally with a nudge instead of treating it as user input needed.

Large result policy:

- `read_file` returns a line window by default so large files do not fill context.
- Agents should request `startLine` and `maxLines` for targeted inspection.
- `write_file` returns write metadata instead of echoing the full file content.
- In-loop tool result content is capped before being sent back to the model.

Known limitations:

- The current context memory is deterministic transcript compaction, not a semantic LLM summary.
- Compaction occurs at continuation boundaries; a single long continuation can still grow through repeated tool calls.
- Future optimization should add semantic memory checkpoints and stricter per-turn token budgeting.

### 7. Agent Needs User Input

Trigger:

- Agent cannot proceed safely.
- Agent hits a policy boundary.
- Agent needs a design or product decision.

System flow:

1. Set Agent Task status to `awaiting_user`.
2. Set Issue status to `awaiting_user` or keep `running` with a visible blocked marker.
3. Show the agent's question in the conversation.

User action:

1. Reply in the coding conversation.
2. Continue the run.

System flow after reply:

1. Append user message.
2. Continue the same Agent Run in the same task workspace.
3. Preserve previous context and tool history.

### 8. Agent Verifies Work

Trigger:

- Coding changes are complete.

System flow:

1. Run project-specific verification commands if configured.
2. Otherwise infer reasonable checks from the repository.
3. Store command outputs as tool results.
4. Summarize pass/fail status.

Expected UI:

- Verification result is visible in the conversation.
- Failed checks keep the Issue in `running` or `awaiting_user`.
- Passing checks allow Publish.

### 9. Agent Publishes PR

Trigger:

- User requested PR creation, or project policy requires PR after successful verification.

System flow:

1. Confirm there are meaningful changes.
2. Commit changes on the task branch.
3. Push branch to remote.
4. Create PR against Project base ref.
5. Store PR URL on Issue and Agent Task.
6. Set Issue status to `review`.
7. Set Agent Task status to `completed`.

Expected UI:

- PR URL appears on Issue detail and Agent Task detail.
- Project Issues list shows the Issue in review.
- The task workspace remains available until cleanup.

Failure behavior:

- If push fails due to credentials, keep the task workspace and branch.
- If PR creation fails, keep the branch pushed if it already exists.
- User can retry Publish without rerunning implementation.

### 10. User Retries A Failed Task

User action:

1. Open failed Issue or Agent Task.
2. Click Retry.

Policy:

- Requirement/planning retry can reuse read-only repository context.
- Coding retry should default to creating a new task worktree unless the user explicitly resumes the existing one.
- Publish retry should reuse the existing task worktree and branch.

System flow:

1. Check linked task and workspace state.
2. If active task exists, block duplicate retry.
3. If linked task was deleted or terminal, allow a new task.
4. Preserve previous failed task history unless explicitly deleted.

### 11. User Deletes An Agent Task

User action:

1. Delete task from Agent Tasks.

Policy:

- Deleting task history should not permanently block the Issue.
- If the task has an active workspace, ask whether to keep or delete it.
- If only history is deleted, Issue links should be cleared or treated as stale.

System behavior:

1. Delete Agent Task or mark it deleted.
2. Preserve Issue if it still exists.
3. Recompute Issue available actions based on actual active tasks, not stale IDs.
4. Allow Analyze or Run again if no active task remains.

### 12. User Deletes A Project

User action:

1. Delete Project.

Policy:

- Deleting a Project is destructive because it affects Issues, Agent Tasks, repository cache, and task workspaces.
- The UI should require confirmation.

System flow:

1. Refuse deletion if active tasks exist, unless force cleanup is explicitly selected.
2. Delete or archive Issues.
3. Remove project repository cache.
4. Remove task worktrees according to cleanup policy.
5. Keep audit records if audit mode is enabled.

## State Transitions

Recommended Issue lifecycle:

```text
backlog
  -> planning
  -> ready
  -> running
  -> awaiting_user
  -> running
  -> review
  -> completed
```

Failure branches:

```text
planning -> failed -> planning
running -> failed -> running
running -> blocked -> running
review -> completed
```

Recommended Agent Task lifecycle:

```text
idle -> running -> completed
idle -> running -> awaiting_user -> running -> completed
idle -> running -> failed -> running
```

Deleted task records should be terminal and should not count as active blockers.

## API Expectations

Project APIs:

- Create Project
- Update Project
- Delete Project
- Refresh repository cache
- Validate repository readiness

Issue APIs:

- Create Issue
- Update Issue
- Analyze Issue
- Start Coding Run
- Retry Issue phase
- Link or clear stale task references

Agent Task APIs:

- List all tasks
- List tasks by Project
- List tasks by Issue
- Get task conversation
- Continue task
- Retry task
- Delete task

Workspace APIs:

- Create repository cache
- Create task worktree
- Get workspace status
- Cleanup workspace
- List workspaces by Project or Issue

## UI Expectations

Projects page:

- Project list only
- New Project dialog
- Repository readiness summary

Project detail page:

- Project settings
- Issues tab scoped to Project
- Tasks tab scoped to Project
- Repository/workspace health

Issue detail:

- Requirement analysis
- Work plan
- Linked tasks
- Current task workspace and branch
- PR link when available
- Available next actions

Agent Tasks page:

- Global task list across all Projects
- Filter by Project, Issue, status, and kind
- Clear indication of active, failed, awaiting user, and completed tasks

Coding conversation:

- Shared chat container used by normal chat and agent chat
- Streaming assistant output
- Compact Tool UI
- Reasoning/Thinking bar
- Markdown rendering
- Context memory panel when compacted

## Implementation Priorities

1. Add workspace kind and task linkage metadata.
2. Add Project repository cache provisioning.
3. Add Git worktree creation for coding runs.
4. Change Issue Run to create a task worktree before creating the coding Agent Run.
5. Add stale task cleanup and link reconciliation.
6. Add PR URL tracking on Issue and Agent Task.
7. Add project-scoped task/workspace views.
8. Add cleanup and archive controls.

## Open Decisions

- Whether Agent Task and Agent Run remain the same table or split into parent task plus execution attempts.
- Whether Analyze should use a read-only task workspace or project repository cache only.
- Whether direct-run without Analyze should be allowed.
- Whether cleanup should be automatic after PR merge or always manual.
- Whether multiple parallel coding attempts for one Issue should be supported.
