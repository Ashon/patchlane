import type { KeyboardEvent, ReactNode } from 'react'
import { useState } from 'react'
import { Loader2, TriangleAlert } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@patchlane/ui/alert-dialog'
import { Button } from '@patchlane/ui/button'
import { Input } from '@patchlane/ui/input'
import { Label } from '@patchlane/ui/label'

export type DangerConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /**
   * When set, the confirm action stays disabled until the user types this
   * exact phrase (case-insensitive). Use for high-consequence deletions.
   */
  confirmPhrase?: string
  confirmPhraseHint?: ReactNode
  loading?: boolean
  error?: string | null
  onConfirm: () => void
}

const normalize = (value: string) => value.trim().toLowerCase()

// Kept as a separate component so its typed-phrase state is created fresh every
// time the dialog opens (the content unmounts on close) rather than persisting
// between openings.
const DangerConfirmBody = ({
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  confirmPhrase,
  confirmPhraseHint,
  loading = false,
  error,
  onConfirm,
}: Omit<DangerConfirmDialogProps, 'open' | 'onOpenChange'>) => {
  const [typed, setTyped] = useState('')

  const phraseSatisfied =
    !confirmPhrase || normalize(typed) === normalize(confirmPhrase)
  const canConfirm = phraseSatisfied && !loading

  const confirm = () => {
    if (!canConfirm) {
      return
    }

    onConfirm()
  }

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      confirm()
    }
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle className="flex items-center gap-2">
          <TriangleAlert className="h-4 w-4 text-destructive" />
          {title}
        </AlertDialogTitle>
        {description ? (
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        ) : null}
      </AlertDialogHeader>

      {confirmPhrase ? (
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">
            {confirmPhraseHint ?? (
              <>
                Type{' '}
                <span className="font-mono font-semibold text-foreground">
                  {confirmPhrase}
                </span>{' '}
                to confirm
              </>
            )}
          </Label>
          <Input
            autoFocus
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={confirmPhrase}
            value={typed}
          />
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <AlertDialogFooter>
        <AlertDialogCancel asChild>
          <Button disabled={loading} size="sm" type="button" variant="outline">
            {cancelLabel}
          </Button>
        </AlertDialogCancel>
        <Button
          disabled={!canConfirm}
          onClick={confirm}
          size="sm"
          type="button"
          variant="destructive"
        >
          {loading ? <Loader2 className="animate-spin" /> : null}
          {confirmLabel}
        </Button>
      </AlertDialogFooter>
    </>
  )
}

export const DangerConfirmDialog = ({
  open,
  onOpenChange,
  ...bodyProps
}: DangerConfirmDialogProps) => (
  <AlertDialog onOpenChange={onOpenChange} open={open}>
    <AlertDialogContent>
      <DangerConfirmBody {...bodyProps} />
    </AlertDialogContent>
  </AlertDialog>
)
