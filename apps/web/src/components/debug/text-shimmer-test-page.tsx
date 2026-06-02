import { useEffect, useMemo, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ui/reasoning'
import { TextShimmer } from '@/components/ui/text-shimmer'

const reasoningSample =
  "I've created a concrete work plan. Now I am checking the streamed tool lifecycle and keeping the reasoning block mounted while the content grows. The goal is to make shimmer visible without causing the surrounding message stack to jump."

const multilineSample =
  'The assistant is still thinking through the tool result. This sample wraps across multiple lines so the shimmer can be checked against the same text shape used by the Agent Task reasoning block.'

export function TextShimmerTestPage() {
  const [playing, setPlaying] = useState(true)
  const [duration, setDuration] = useState(3)
  const [spread, setSpread] = useState(24)
  const [visibleLength, setVisibleLength] = useState(48)

  useEffect(() => {
    if (!playing) return

    const timer = window.setInterval(() => {
      setVisibleLength((current) => {
        if (current >= reasoningSample.length) return 24
        return Math.min(reasoningSample.length, current + 8)
      })
    }, 180)

    return () => window.clearInterval(timer)
  }, [playing])

  const streamedReasoning = useMemo(
    () => reasoningSample.slice(0, visibleLength),
    [visibleLength],
  )

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4">
        <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-normal">
                TextShimmer Test
              </h1>
              <Badge variant="secondary">debug</Badge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Compare default shimmer, high contrast shimmer, and the actual
              Reasoning streaming path.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              onClick={() => setPlaying((current) => !current)}
              size="sm"
              type="button"
              variant="outline"
            >
              {playing ? <Pause /> : <Play />}
              {playing ? 'Pause' : 'Play'}
            </Button>
            <Button
              onClick={() => setVisibleLength(24)}
              size="sm"
              type="button"
              variant="secondary"
            >
              <RotateCcw />
              Reset
            </Button>
          </div>
        </div>

        <section className="grid gap-3 rounded-md border bg-muted/20 p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Duration: {duration.toFixed(1)}s
              <input
                className="h-2 w-full accent-primary"
                max="8"
                min="1"
                onChange={(event) => setDuration(Number(event.target.value))}
                step="0.5"
                type="range"
                value={duration}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Spread: {spread}%
              <input
                className="h-2 w-full accent-primary"
                max="45"
                min="5"
                onChange={(event) => setSpread(Number(event.target.value))}
                step="1"
                type="range"
                value={spread}
              />
            </label>
          </div>
        </section>

        <section className="grid gap-3 rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Single line</h2>
            <Badge variant="outline">TextShimmer</Badge>
          </div>
          <div className="overflow-hidden rounded-md bg-muted/40 px-3 py-2 text-sm">
            <TextShimmer duration={duration} spread={spread}>
              Thinking through streamed reasoning text...
            </TextShimmer>
          </div>
        </section>

        <section className="grid gap-3 rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Multiline default</h2>
            <Badge variant="outline">wrap</Badge>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2 text-sm leading-6">
            <TextShimmer
              as="div"
              duration={duration}
              multiline
              spread={spread}
            >
              {multilineSample}
            </TextShimmer>
          </div>
        </section>

        <section className="grid gap-3 rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Multiline high contrast</h2>
            <Badge variant="outline">diagnostic</Badge>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2 text-sm leading-6">
            <TextShimmer
              as="div"
              baseColor="color-mix(in oklch, var(--muted-foreground) 70%, transparent)"
              duration={duration}
              highlightColor="var(--foreground)"
              multiline
              spread={spread}
            >
              {multilineSample}
            </TextShimmer>
          </div>
        </section>

        <section className="grid gap-3 rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Reasoning streaming</h2>
            <Badge variant={playing ? 'default' : 'secondary'}>
              {playing ? 'streaming' : 'paused'}
            </Badge>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <Reasoning open>
              <ReasoningTrigger streaming>Reasoning</ReasoningTrigger>
              <ReasoningContent
                className="mt-2"
                contentClassName="text-sm leading-6"
                markdown
                streaming
              >
                {streamedReasoning}
              </ReasoningContent>
            </Reasoning>
          </div>
        </section>

        <section className="grid gap-3 rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Reasoning completed</h2>
            <Badge variant="secondary">markdown</Badge>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <Reasoning open>
              <ReasoningTrigger>Reasoning</ReasoningTrigger>
              <ReasoningContent
                className="mt-2"
                contentClassName="text-sm leading-6"
                markdown
              >
                {reasoningSample}
              </ReasoningContent>
            </Reasoning>
          </div>
        </section>
      </div>
    </div>
  )
}
