import type { Dispatch, ReactNode, SetStateAction } from 'react'
import {
  Loader2,
  MessageSquare,
  Monitor,
  Moon,
  Network,
  RefreshCw,
  Sun,
} from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { navigationItems } from '@/components/app/app-navigation'
import { getNextThemeMode } from '@/components/app/app-theme'
import type { ThemeMode } from '@/components/app/app-types'
import { StateBadge, StatusBadge } from '@/components/app/status-badges'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type AppRoute = {
  pathname: string
  search?: string
}

export const AppShell = ({
  apiOnline,
  buildRoute,
  children,
  enabledEndpointCount,
  endpointCount,
  githubReady,
  loading,
  onRefresh,
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
  loading: boolean
  onRefresh: () => void
  onSupervisorChatOpenChange: Dispatch<SetStateAction<boolean>>
  onThemeModeChange: (mode: ThemeMode) => void
  projectCount: number
  supervisorChatOpen: boolean
  supervisorPanel: ReactNode
  themeMode: ThemeMode
}) => {
  const location = useLocation()

  return (
    <main className="h-screen overflow-hidden bg-background">
      <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b bg-background">
          <div className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-1.5">
            <div className="flex min-w-0 shrink-0 items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Network className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold tracking-normal">
                  Agent Fleet
                </h1>
              </div>
            </div>

            <nav
              className="flex h-8 min-w-0 items-center gap-1 overflow-x-auto border-l pl-3"
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
                      'flex h-8 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
                      active && 'border-primary text-foreground',
                    )}
                    end={item.value !== 'settings'}
                    key={item.value}
                    to={buildRoute(item.path)}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                )
              })}
            </nav>

            <div className="flex shrink-0 items-center justify-end gap-1.5">
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
                variant={supervisorChatOpen ? 'secondary' : 'outline'}
                size="sm"
                className="h-8"
                onClick={() =>
                  onSupervisorChatOpenChange((current) => !current)
                }
                type="button"
              >
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">Supervisor</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={onRefresh}
                disabled={loading}
                type="button"
              >
                {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              </Button>
              <ThemeToggle mode={themeMode} onChange={onThemeModeChange} />
            </div>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden">{children}</div>

          {supervisorChatOpen ? (
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
      className="h-8 w-8"
      onClick={() => onChange(nextMode)}
      size="icon"
      title={label}
      type="button"
      variant="outline"
    >
      <Icon />
    </Button>
  )
}
