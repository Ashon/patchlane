import { useEffect, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import {
  Bot,
  Command,
  GitPullRequestArrow,
  Monitor,
  Moon,
  Sun,
} from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { navigationItems } from '@/components/app/app-navigation'
import { getNextThemeMode } from '@/components/app/app-theme'
import type { ThemeMode } from '@/components/app/app-types'
import { StateBadge, StatusBadge } from '@/components/app/status-badges'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useResizableDefaultLayout,
} from '@/components/ui/resizable'
import { cn } from '@/lib/utils'

type AppRoute = {
  pathname: string
  search?: string
}

const supervisorPanelIds = ['main', 'supervisor']

export const AppShell = ({
  apiOnline,
  buildRoute,
  children,
  enabledEndpointCount,
  endpointCount,
  githubReady,
  onCommandMenuOpen,
  onSupervisorChatOpenChange,
  onThemeModeChange,
  projectCount,
  supervisorChatOpen,
  supervisorPanel,
  themeMode,
}: {
  apiOnline: boolean | null
  buildRoute: (pathname: string) => AppRoute
  children: ReactNode
  enabledEndpointCount: number
  endpointCount: number
  githubReady: boolean
  onCommandMenuOpen: () => void
  onSupervisorChatOpenChange: Dispatch<SetStateAction<boolean>>
  onThemeModeChange: (mode: ThemeMode) => void
  projectCount: number
  supervisorChatOpen: boolean
  supervisorPanel: ReactNode
  themeMode: ThemeMode
}) => {
  const location = useLocation()
  const supervisorLayout = useResizableDefaultLayout({
    id: 'patchlane-supervisor-layout',
    panelIds: supervisorPanelIds,
  })
  const [resizableLayoutEnabled, setResizableLayoutEnabled] = useState(() =>
    typeof window === 'undefined'
      ? true
      : window.matchMedia('(min-width: 1280px)').matches,
  )
  const desktopPlatform =
    typeof window === 'undefined' ? undefined : window.patchlaneDesktop?.platform
  const isDesktop = Boolean(desktopPlatform)
  const isDesktopMac = desktopPlatform === 'darwin'
  const showResizableSupervisor = supervisorChatOpen && resizableLayoutEnabled

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1280px)')
    const syncResizableLayout = () =>
      setResizableLayoutEnabled(mediaQuery.matches)

    syncResizableLayout()
    mediaQuery.addEventListener('change', syncResizableLayout)

    return () => mediaQuery.removeEventListener('change', syncResizableLayout)
  }, [])

  return (
    <main className="h-screen overflow-hidden bg-background">
      <div className="flex h-full min-h-0 flex-col">
        <header
          className={cn(
            'shrink-0 border-b bg-[var(--surface-app-header)]',
            isDesktop && 'desktop-window-titlebar',
          )}
        >
          <div
            className={cn(
              'grid min-h-9 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1',
              isDesktopMac && 'pl-21',
            )}
          >
            <div className="flex min-w-0 shrink-0 items-center gap-1.5">
              <div className="patchlane-logo-mark flex h-[22px] w-[22px] items-center justify-center rounded-md text-white">
                <GitPullRequestArrow className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xs font-semibold tracking-normal">
                  Patchlane
                </h1>
              </div>
            </div>

            <nav
              className="flex h-6 min-w-0 items-center gap-1 overflow-x-auto pl-2"
              aria-label="Primary"
            >
              {navigationItems.map((item) => {
                const Icon = item.icon
                const active =
                  item.value === 'settings'
                    ? location.pathname.startsWith('/settings')
                    : item.value === 'projects'
                      ? location.pathname.startsWith('/projects')
                      : location.pathname === item.path

                return (
                  <NavLink
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                      active &&
                        'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground',
                    )}
                    end={item.value !== 'settings'}
                    key={item.value}
                    to={buildRoute(item.path)}
                  >
                    <Icon className="h-3 w-3" />
                    {item.label}
                  </NavLink>
                )
              })}
            </nav>

            <div className="flex shrink-0 items-center justify-end gap-1">
              <div className="hidden items-center gap-1 2xl:flex">
                <StatusBadge online={apiOnline} />
                <Badge variant="secondary">{endpointCount} endpoints</Badge>
                <StateBadge
                  tone={enabledEndpointCount > 0 ? 'success' : 'warning'}
                >
                  {enabledEndpointCount} enabled
                </StateBadge>
                <StateBadge tone={githubReady ? 'success' : 'warning'}>
                  {githubReady ? 'GitHub ready' : 'GitHub missing'}
                </StateBadge>
                <Badge variant="secondary">{projectCount} projects</Badge>
              </div>

              <Button
                aria-label="Open command menu"
                onClick={onCommandMenuOpen}
                size="icon-xs"
                title="Open command menu (Cmd/Ctrl+K)"
                type="button"
                variant="outline"
              >
                <Command />
              </Button>
              <Button
                aria-label={
                  supervisorChatOpen ? 'Close supervisor' : 'Open supervisor'
                }
                aria-pressed={supervisorChatOpen}
                onClick={() =>
                  onSupervisorChatOpenChange((current) => !current)
                }
                size="icon-xs"
                title={
                  supervisorChatOpen ? 'Close supervisor' : 'Open supervisor'
                }
                type="button"
                variant={supervisorChatOpen ? 'default' : 'outline'}
              >
                <Bot />
              </Button>
              <ThemeToggle mode={themeMode} onChange={onThemeModeChange} />
            </div>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {showResizableSupervisor ? (
            <ResizablePanelGroup
              className="min-w-0 flex-1"
              defaultLayout={supervisorLayout.defaultLayout}
              direction="horizontal"
              id="patchlane-supervisor-layout"
              onLayoutChanged={supervisorLayout.onLayoutChanged}
            >
              <ResizablePanel
                className="min-w-0 overflow-hidden"
                defaultSize="70%"
                id="main"
                minSize="520px"
              >
                <div className="@container h-full min-w-0 overflow-hidden">
                  {children}
                </div>
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel
                className="min-w-0 overflow-hidden"
                defaultSize="30%"
                id="supervisor"
                maxSize="560px"
                minSize="320px"
              >
                <aside className="flex h-full min-h-0 bg-background">
                  {supervisorPanel}
                </aside>
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <div className="@container min-w-0 flex-1 overflow-hidden">
              {children}
            </div>
          )}

          {supervisorChatOpen && !resizableLayoutEnabled ? (
            <>
              <button
                aria-label="Close supervisor chat backdrop"
                className="absolute inset-0 z-30 bg-background/60 backdrop-blur-sm xl:hidden"
                onClick={() => onSupervisorChatOpenChange(false)}
                type="button"
              />
              <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-[420px] min-h-0 border-l bg-background shadow-xl xl:relative xl:z-auto xl:w-[380px] xl:max-w-none xl:shrink-0 xl:shadow-none 2xl:w-[420px]">
                {supervisorPanel}
              </aside>
            </>
          ) : null}
        </div>
      </div>
    </main>
  )
}

const ThemeToggle = ({
  mode,
  onChange,
}: {
  mode: ThemeMode
  onChange: (mode: ThemeMode) => void
}) => {
  const nextMode = getNextThemeMode(mode)
  const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor
  const label = `Theme: ${mode}. Switch to ${nextMode}.`

  return (
    <Button
      aria-label={label}
      onClick={() => onChange(nextMode)}
      size="icon-xs"
      title={label}
      type="button"
      variant="outline"
    >
      <Icon />
    </Button>
  )
}
