/**
 * Guards the persisted supervisor split layout.
 *
 * react-resizable-panels stores a layout as a `{ [panelId]: flexGrow }` map and
 * restores it verbatim — it is NOT re-clamped against the panels' size
 * constraints on restore. Because the supervisor panel is capped below half the
 * group (maxSize=45%) and the main panel has a large minimum (minSize=520px), an
 * interactive resize can never make the main panel narrower than the
 * supervisor panel. So any restored split where the supervisor is wider than
 * main is stale/corrupt and, if applied, collapses the main content to a
 * sliver when the chat opens.
 *
 * We only trust a restored layout when the main panel stays dominant; otherwise
 * we drop it and let the panels fall back to their default 70/30 sizing (which
 * respects the min/max constraints).
 */
export type SupervisorLayout = Record<string, number>

export const sanitizeSupervisorLayout = (
  layout: SupervisorLayout | undefined,
): SupervisorLayout | undefined => {
  if (!layout) {
    return undefined
  }

  const main = layout.main
  const supervisor = layout.supervisor

  if (
    typeof main !== 'number' ||
    typeof supervisor !== 'number' ||
    !Number.isFinite(main) ||
    !Number.isFinite(supervisor) ||
    main <= 0 ||
    supervisor <= 0
  ) {
    return undefined
  }

  return main > supervisor ? layout : undefined
}
