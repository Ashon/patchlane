import { useLocation, useNavigate } from 'react-router-dom'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@patchlane/ui/command'
import { navigationItems, settingsPages } from '@/components/app/app-navigation'

const CommandMeta = ({ children }: { children: string }) => (
  <CommandShortcut className="max-w-24 shrink-0 self-center truncate tracking-normal">
    {children}
  </CommandShortcut>
)

const commandItemClassName = 'mx-0'
const commandListClassName =
  'max-h-80 scroll-py-2 overflow-x-hidden overflow-y-auto p-1'

export const AppCommandPalette = ({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) => {
  const location = useLocation()
  const navigate = useNavigate()

  const navigateWithSearch = (
    pathname: string,
    updates: Record<string, string | null> = {},
  ) => {
    const params = new URLSearchParams(location.search)

    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    }

    const search = params.toString()
    onOpenChange(false)
    navigate({ pathname, search: search ? `?${search}` : '' })
  }

  return (
    <CommandDialog
      className="max-w-sm"
      description="Search pages and actions."
      onOpenChange={onOpenChange}
      open={open}
      title="Command menu"
    >
      <Command className="bg-transparent" shouldFilter>
        <CommandInput autoFocus placeholder="Type a command or search..." />
        <CommandList className={commandListClassName}>
          <CommandEmpty>
            <div className="p-4 text-center text-sm text-muted-foreground">
              No command found
            </div>
          </CommandEmpty>

          <CommandGroup heading="Navigation">
            {navigationItems.map((item) => {
              const Icon = item.icon

              return (
                <CommandItem
                  className={commandItemClassName}
                  key={item.value}
                  keywords={[item.path, item.value]}
                  onSelect={() => navigateWithSearch(item.path, { run: null })}
                  value={`${item.label} ${item.path}`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="block min-w-0 flex-1 overflow-hidden truncate">
                    {item.label}
                  </span>
                  <CommandMeta>Page</CommandMeta>
                </CommandItem>
              )
            })}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Settings">
            {settingsPages.map((item) => {
              const Icon = item.icon

              return (
                <CommandItem
                  className={commandItemClassName}
                  key={item.value}
                  keywords={[item.path, item.value, 'settings']}
                  onSelect={() => navigateWithSearch(item.path, { run: null })}
                  value={`${item.label} settings ${item.path}`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="block min-w-0 flex-1 overflow-hidden truncate">
                    {item.label}
                  </span>
                  <CommandMeta>Settings</CommandMeta>
                </CommandItem>
              )
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
