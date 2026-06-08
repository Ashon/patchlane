import type { LucideIcon } from 'lucide-react'
import {
  ChartColumn,
  ClipboardList,
  Folder,
  Server,
  Settings,
  Terminal,
  Wrench,
} from 'lucide-react'
import type { AppView } from './app-types'

export const navigationItems = [
  {
    value: 'projects',
    label: 'Projects',
    icon: ClipboardList,
    path: '/projects',
  },
  { value: 'sandbox', label: 'Agent Tasks', icon: Terminal, path: '/agent' },
  {
    value: 'workspaces',
    label: 'Workspaces',
    icon: Folder,
    path: '/workspaces',
  },
  {
    value: 'stats',
    label: 'Statistics',
    icon: ChartColumn,
    path: '/stats',
  },
  {
    value: 'settings',
    label: 'Settings',
    icon: Settings,
    path: '/settings/endpoints',
  },
] satisfies Array<{
  value: AppView
  label: string
  icon: LucideIcon
  path: string
}>

export const settingsPages = [
  {
    value: 'endpoints',
    label: 'Agent Runtime',
    icon: Server,
    path: '/settings/endpoints',
  },
  { value: 'tools', label: 'Tools', icon: Wrench, path: '/settings/tools' },
] satisfies Array<{
  value: string
  label: string
  icon: LucideIcon
  path: string
}>
