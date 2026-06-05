# Agent E2E Regression

Patchlane keeps live agent regression cases in `e2e/agent-regression-cases.ts`.
These cases reset existing project issues, rerun the issue workflow, and record
both workflow status and artifact quality signals.

## Run

Start the local API and web services first, then run:

```sh
pnpm e2e:agent-regression
```

The script defaults to project code `PLN` and the issue numbers defined in
`agentRegressionCases`. It writes a JSON report to:

```text
apps/api/.data/e2e/agent-existing-issues-report.json
```

## Useful Env Vars

- `PATCHLANE_EXISTING_ISSUES_API_BASE_URL`: API base URL. Defaults to `http://localhost:8787`.
- `PATCHLANE_EXISTING_ISSUES_PROJECT_CODE`: project code. Defaults to `PLN`.
- `PATCHLANE_EXISTING_ISSUE_NUMBERS`: comma-separated issue numbers.
- `PATCHLANE_EXISTING_ISSUES_ENDPOINT_ID`: endpoint override.
- `PATCHLANE_EXISTING_ISSUES_MODEL`: model override.
- `PATCHLANE_EXISTING_ISSUES_REPORT_FILE`: report output path.

## What Fails A Regression

Each case can define:

- required changed path patterns
- forbidden changed path patterns
- a maximum blocked or failed tool-result count

The script fails when the issue workflow does not complete, when issue tasks do
not finish, or when a quality gate fails. This catches cases where the agent
marks a workflow complete but edits the wrong file, creates stray repair
scripts, or spends too many turns in blocked tool loops.
