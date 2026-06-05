import type { ReactNode } from 'react'
import { Settings } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { settingsPages } from '@/components/app/app-navigation'
import { PageHeader, PageScroll } from '@/components/layout/page-primitives'
import { cn } from '@/lib/utils'

export const SettingsShell = ({ children }: { children: ReactNode }) => {
  const location = useLocation()
  const buildSettingsRoute = (pathname: string) => {
    return { pathname, search: location.search }
  }

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background lg:grid-cols-[176px_minmax(0,1fr)] lg:grid-rows-1">
      <aside className="flex min-h-0 flex-col border-b bg-[var(--surface-page-header)] lg:border-b-0 lg:border-r">
        <PageHeader
          className="min-h-12 px-2.5"
          description="App configuration"
          icon={<Settings className="h-4 w-4" />}
          title="Settings"
        />
        <PageScroll className="hidden lg:block" viewportClassName="p-2">
          <SettingsNavigation buildSettingsRoute={buildSettingsRoute} />
        </PageScroll>
        <nav
          aria-label="Settings"
          className="flex gap-1 overflow-x-auto px-2 py-1.5 lg:hidden"
        >
          <SettingsNavigation
            buildSettingsRoute={buildSettingsRoute}
            horizontal
          />
        </nav>
      </aside>

      <div className="min-h-0 overflow-hidden bg-background">{children}</div>
    </section>
  )
}

const SettingsNavigation = ({
  buildSettingsRoute,
  horizontal = false,
}: {
  buildSettingsRoute: (pathname: string) => { pathname: string; search: string }
  horizontal?: boolean
}) => {
  return (
    <div className={cn('grid gap-1', horizontal && 'flex min-w-max')}>
      {settingsPages.map((item) => {
        const Icon = item.icon

        return (
          <NavLink
            aria-label={item.label}
            className={({ isActive }) =>
              cn(
                'flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                isActive &&
                  'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground',
              )
            }
            key={item.value}
            to={buildSettingsRoute(item.path)}
          >
            <Icon className="h-3.5 w-3.5" />
            {item.label}
          </NavLink>
        )
      })}
    </div>
  )
}
