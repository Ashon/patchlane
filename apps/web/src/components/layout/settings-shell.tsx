import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { settingsPages } from '@/components/app/app-navigation'
import { cn } from '@/lib/utils'

export const SettingsShell = ({ children }: { children: ReactNode }) => {
  const location = useLocation()
  const buildSettingsRoute = (pathname: string) => {
    return { pathname, search: location.search }
  }

  return (
    <section className="grid h-full min-h-0 overflow-y-auto bg-background lg:grid-cols-[160px_minmax(0,1fr)] lg:overflow-hidden">
      <aside className="border-b bg-muted/20 p-2 lg:border-b-0 lg:border-r">
        <div className="px-2 py-1 text-[11px] font-medium uppercase text-muted-foreground">
          Settings
        </div>
        <div className="grid gap-1">
          {settingsPages.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                className={({ isActive }) =>
                  cn(
                    'flex h-7 items-center gap-1.5 rounded-md px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground',
                    isActive && 'bg-background text-foreground shadow-sm',
                  )
                }
                key={item.value}
                to={buildSettingsRoute(item.path)}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          })}
        </div>
      </aside>

      <div className="min-h-0 overflow-hidden">{children}</div>
    </section>
  )
}

