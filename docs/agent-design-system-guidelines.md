# Agent Design System Guidelines

This guide captures UI conventions that are easy to miss when changing
Patchlane. Agents should read it before modifying app shell, page layout,
settings screens, chat, agent task messages, overlays, or shared primitives.

Patchlane is an operational coding workspace, not a marketing surface. The UI
should stay compact, scannable, and stable while agents stream reasoning, tool
calls, metadata, and user messages.

## Core Principles

- Prefer existing primitives before creating new layout or control styles.
- Keep chrome compact. Headers, nav items, badges, dropdowns, and action
  buttons should feel like a toolbar.
- Preserve scanability over decoration. Avoid oversized cards, hero layouts,
  decorative gradients, and nested card structures.
- Keep dimensions stable. Dynamic text, streaming output, icon state changes,
  hover actions, and resizable handles must not shift neighboring content.
- Use semantic tokens and utilities from the app. Avoid one-off colors, raw
  borders, shadows, or custom spacing that creates 1px visual seams.
- Treat normal chat and agent task chat as the same product surface. If a new
  work block is needed, make it shared first.

## Start From These Primitives

Use these files as the first stop when implementing UI:

- `apps/web/src/components/layout/app-shell.tsx`: global header, primary nav,
  and main content layout.
- `apps/web/src/components/layout/settings-shell.tsx`: settings sidebar and
  settings page structure.
- `apps/web/src/components/layout/page-primitives.tsx`: page shells, headers,
  split panes, sections, list containers, list items, empty states, and loading
  lists.
- `apps/web/src/components/app/panel-primitives.tsx`: compact field and status
  rows for utilitarian panels.
- `apps/web/src/components/chat/chat-conversation.tsx`: shared chat viewport,
  input, virtualized message list, and agent task chat behavior.
- `apps/web/src/components/chat/chat-message-frame.tsx`: message block
  overlays, side rails, and metadata/accessory placement.
- `apps/web/src/components/ui/agent-work-disclosure.tsx`: common reasoning,
  tool, and pending work row primitives.
- `apps/web/src/components/chat/chat-message-action-button.ts`: shared overlay
  action button style.
- `apps/web/src/index.css`: global font rendering, animation keyframes, and
  utility classes such as `border-overlay`.

If a screen cannot be built from these primitives, add or extend a primitive
instead of copying similar Tailwind strings into a page.

## App Shell And Navigation

- The global header should stay short and toolbar-like. Avoid page-title
  treatment in the app shell.
- Primary nav active state must keep the same height as inactive nav buttons.
  The active state can change color and background, but should not become a
  taller pill.
- Keep the brand, nav, and right-side controls vertically centered on the same
  grid.
- Use lucide icons for nav and controls. Keep icon sizes close to the existing
  `h-3`, `h-3.5`, and `h-4` scale unless a local primitive says otherwise.
- Do not introduce extra borders between brand and nav. The top bar should read
  as one continuous strip.

## Page Layout

- Prefer `Page`, `PageSplit`, `PagePane`, `PageHeader`, `PageActionBar`,
  `PageScroll`, `PageSection`, `PageList`, and `PageListItem` for pages.
- `PageHeader` is compact by default. Use its title, description, icon, leading,
  and actions slots instead of creating custom title rows.
- Keep repository URLs and subtitles muted, small, and single-line truncated.
- Use `min-h-0`, `min-w-0`, and `overflow-hidden` intentionally in nested
  panes. Most layout bugs in this app come from scroll containers that cannot
  shrink.
- Avoid floating page sections as cards. Use full-height panes, borders, and
  sections; reserve cards for repeated items, modals, and framed controls.

## List Items

- Use `PageList` and `PageListItem` for project, issue, task, endpoint, and
  similar rows.
- Selection should be expressed with a left border and subtle background,
  matching `PageListItem selected`.
- Do not leave unowned blank space inside list rows. The selected area should
  cover the full row width and height.
- Keep a bottom edge on list groups. `PageList` provides `divide-y` and
  `border-b` so the last row does not visually disappear.
- Row controls should align to the row's vertical center and should not increase
  row height unexpectedly.

## Controls, Badges, And Status

- Buttons in toolbars should use existing `Button` sizes such as `xs`,
  `icon-xs`, `sm`, or `icon-sm`.
- Badges are for state, counts, or categorical filters. Do not use badges for
  every inline label.
- If an icon already communicates state, avoid a duplicate text badge. For
  example, tool work blocks use the left state icon for running, completed, and
  failed states.
- Dropdowns, badges, and buttons in the same row should share similar height,
  radius, and density.
- Prefer semantic variants and tokens over raw color literals. If a one-off
  utility is needed, define it in `index.css` and reuse it.

## Chat And Agent Work Blocks

- Normal chat and agent task chat share `ChatConversation`. Do not fork message
  layout unless the behavior is truly different.
- Agent task user and assistant message blocks should use the full available
  width so tool results, code, and metadata can scan cleanly.
- Use `MessageBlockFrame` for message overlays. It owns accessory visibility,
  side rail order, and right/left overlay positioning.
- Use `overlayActionButtonClass` for copy, rewind, and metadata overlay chips.
  It includes `border-overlay`, which adds a subtle outline without changing
  layout.
- Metadata overlays should be hidden until hover or focus, except when a
  reasoning or tool block is expanded and the metadata is part of the active
  inspection state.
- Keep compact token or duration metadata at the far right of the overlay rail.

Agent work rows:

- Use `AgentWorkDisclosureTrigger` for collapsible work rows.
- Use `AgentWorkPendingIndicator` for the first assistant placeholder before
  reasoning text exists.
- Use `AgentWorkPulseIndicator` for running or thinking states. This keeps
  Thinking, Reasoning, and Tool pulse dots aligned.
- Reasoning rows should read like `Reasoning:` followed by a truncated preview.
  While reasoning is active, the left icon slot can show the pulse indicator.
- Tool rows should read like `<tool_name>:` followed by a compact preview. Do
  not prefix with `Tool:` and do not wrap the tool name in a badge.
- Tool completed, running, and error states belong in the left icon slot. Avoid
  `Completed`, `Running`, or `Error` text badges in the row unless the icon is
  not enough.
- When a work row expands, show structured details inside
  `AgentWorkDisclosurePanel` and `AgentWorkDisclosureSection`.
- Do not render raw tool transcripts as assistant prose. Tool input/output
  belongs in Tool UI.

## Reasoning, Shimmer, And Streaming Text

- Streaming labels and completed labels must share the same line-height and
  inline box. `AgentWorkDisclosureTrigger` handles this through its inline text
  slot.
- Do not place `TextShimmer` directly into ad hoc flex rows unless its
  line-height matches the completed text. Small mismatches are visible while
  reasoning streams.
- Reasoning should be truncated in the trigger and fully readable only after
  expansion.
- If a model sends reasoning metadata separately from content, preserve that
  metadata through the shared schema, API store, and UI overlay.

## Resizable Panels

- Use `ResizablePanelGroup`, `ResizablePanel`, and `ResizableHandle` from
  `apps/web/src/components/ui/resizable.tsx`.
- Keep the handle visually attached to the panel divider. Do not add separate
  borders, shadows, margins, or transforms that make the handle drift while
  dragging.
- Prefer one continuous divider line between panels. Avoid doubled or broken
  1px lines around a panel divider.
- Store default layouts with stable panel IDs when the layout should persist.

## Borders, Overlays, And 1px Seams

- Use tokenized borders: `border`, `border-b`, `border-l`, `divide-y`, and
  semantic border colors.
- Use `outline` for overlay chip borders so the button height and layout do not
  change. The `border-overlay` utility is the preferred style:

```css
.border-overlay {
  outline: 1px solid rgb(0 0 0 / 10%);
  outline-offset: -1px;
}

.dark .border-overlay {
  outline-color: rgb(255 255 255 / 10%);
}
```

- If a line looks broken, inspect both adjacent panes. Often the issue is a
  padding, margin, or different border owner, not the line color itself.
- Avoid shadows on structural dividers and resizable handles. They make 1px
  alignment problems more visible.

## Typography And Rendering

- Global font rendering is configured in `index.css`. Keep `antialiased`,
  `-webkit-font-smoothing`, `-moz-osx-font-smoothing`, `font-kerning`,
  `font-optical-sizing`, and `text-rendering` in place.
- Use compact type for compact UI: `text-xs`, `text-[11px]`, `text-sm`, and
  explicit `leading-*` where rows must align.
- Do not scale font size with viewport width.
- Do not use negative letter spacing.
- Reserve monospace for code, file paths, command names, and raw values. Avoid
  monospace for ordinary UI labels such as tool row names unless the local
  design explicitly calls for it.

## Icons And Brand Assets

- Use lucide icons for UI controls and nav where possible.
- Keep the app logo icon, favicon, and app shell brand icon aligned. If one
  changes, check the others.
- Prefer a familiar icon over a text-only control when the command is common,
  such as refresh, copy, save, delete, send, or theme.

## Data And Metadata Changes

When adding agent message metadata:

1. Update shared types and schemas in `packages/shared/src/agent.ts`.
2. Persist the field in API storage or migration logic.
3. Preserve the field during stream merge and server reconciliation.
4. Render compact metadata through `chat-message-metadata.tsx`.
5. Add or update focused web tests for message merge/reflow behavior.

Do not rely only on currently streamed UI state. Existing stored runs and
server-reconciled messages must still render coherently.

## Agent Implementation Checklist

Before editing UI:

- Identify the closest existing primitive and extend it if needed.
- Check whether the same pattern appears in projects, settings, and agent task
  pages.
- Decide which element owns the border or divider before adding a new one.
- Verify hover-only overlays do not reserve layout space.
- Confirm compact rows stay the same height across inactive, active, streaming,
  completed, and expanded states.

Before finishing:

- Run `pnpm typecheck`.
- Run `pnpm lint`.
- Run `pnpm --filter @patchlane/web test` if chat, agent run, message reflow,
  metadata, or tool rendering changed.
- For visual changes, inspect both desktop and narrow widths. Pay special
  attention to 1px seams, clipped text, overflowing controls, and mismatched
  icon/text baselines.
