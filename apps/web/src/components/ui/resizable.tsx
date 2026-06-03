import type { ComponentProps } from 'react'
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
} from 'react-resizable-panels'
import { cn } from '@/lib/utils'

const ResizablePanelGroup = ({
  className,
  direction,
  orientation,
  resizeTargetMinimumSize,
  ...props
}: ComponentProps<typeof Group> & {
  direction?: ComponentProps<typeof Group>['orientation']
}) => (
  <Group
    className={cn('h-full w-full', className)}
    orientation={orientation ?? direction}
    resizeTargetMinimumSize={
      resizeTargetMinimumSize ?? { coarse: 32, fine: 12 }
    }
    {...props}
  />
)

const ResizablePanel = Panel

const ResizableHandle = ({
  className,
  ...props
}: ComponentProps<typeof Separator>) => (
  <Separator
    className={cn(
      'group relative z-10 flex w-px shrink-0 cursor-col-resize items-center justify-center bg-transparent outline-none',
      'focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
      className,
    )}
    {...props}
  >
    <span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-border transition-colors group-hover:bg-primary/45 group-active:bg-primary/70">
      <span className="absolute left-0 top-1/2 h-10 w-[7px] -translate-x-[3px] -translate-y-1/2 rounded-full border border-border bg-background transition-colors group-hover:border-primary/45 group-active:border-primary/70" />
    </span>
  </Separator>
)

const useResizableDefaultLayout = useDefaultLayout

export {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useResizableDefaultLayout,
}
