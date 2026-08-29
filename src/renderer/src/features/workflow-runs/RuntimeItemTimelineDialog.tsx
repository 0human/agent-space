import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Activity } from 'lucide-react'

import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@renderer/components/ui/dialog'
import { zhCN as copy } from '@renderer/i18n/zh-CN'

import type { RuntimeItem } from '../../../../shared/workflow-run'

import { RuntimeItemList } from './RuntimeItemList'

export interface RuntimeItemTimelineDialogProps {
  runId: string
  phaseName: string
  stepName: string
  executionId: string
  items: RuntimeItem[]
  historyUnavailable?: boolean
}

export function RuntimeItemTimelineDialog({
  runId,
  phaseName,
  stepName,
  executionId,
  items,
  historyUnavailable = false,
}: RuntimeItemTimelineDialogProps): React.JSX.Element {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-fit" size="sm" type="button" variant="outline">
          <Activity aria-hidden="true" />
          {copy.run.runtimeTimelineTrigger}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="grid max-h-[calc(100vh-2rem)] max-w-[calc(100%-2rem)] grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden p-4 sm:max-w-4xl sm:p-6"
        closeLabel={copy.run.runtimeTimelineClose}
      >
        <DialogHeader>
          <DialogTitle>{copy.run.runtimeTimelineTitle}</DialogTitle>
          <DialogDescription>
            {copy.run.runtimeTimelineDescription}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 grid-cols-1 gap-2 rounded-lg border bg-muted/20 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <span className="min-w-0 break-words">
            {copy.run.runId(runId)}
          </span>
          <span className="min-w-0 break-words">
            {copy.run.runtimeTimelinePhase(phaseName)}
          </span>
          <span className="min-w-0 break-words">
            {copy.run.runtimeTimelineStep(stepName)}
          </span>
          <span className="min-w-0 break-words">
            {copy.run.runtimeTimelineExecution(executionId)}
          </span>
        </div>
        <RuntimeItemTimeline
          items={items}
          historyUnavailable={historyUnavailable}
        />
      </DialogContent>
    </Dialog>
  )
}

function RuntimeItemTimeline({
  items,
  historyUnavailable,
}: {
  items: RuntimeItem[]
  historyUnavailable: boolean
}): React.JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null)
  const followBottomRef = useRef(true)
  const [showBackToBottom, setShowBackToBottom] = useState(false)

  const scrollToBottom = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.scrollTop = Math.max(
      0,
      viewport.scrollHeight - viewport.clientHeight,
    )
  }, [])

  useLayoutEffect(() => {
    if (followBottomRef.current) scrollToBottom()
  }, [items, scrollToBottom])

  const handleScroll = (): void => {
    const viewport = viewportRef.current
    if (!viewport) return
    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
    const nearBottom = distanceFromBottom <= 48
    followBottomRef.current = nearBottom
    setShowBackToBottom(!nearBottom)
  }

  return (
    <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3 pt-4">
      <div
        ref={viewportRef}
        className="min-h-32 overflow-y-auto pr-1"
        role="region"
        aria-label={copy.run.runtimeTimelineRegion}
        tabIndex={0}
        onScroll={handleScroll}
      >
        {historyUnavailable && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {copy.run.runtimeTimelineUnavailable}
          </p>
        ) : (
          <RuntimeItemList items={items} />
        )}
      </div>
      {showBackToBottom ? (
        <Button
          className="justify-self-end"
          size="sm"
          type="button"
          variant="outline"
          onClick={() => {
            followBottomRef.current = true
            scrollToBottom()
            setShowBackToBottom(false)
          }}
        >
          {copy.run.runtimeTimelineBackToBottom}
        </Button>
      ) : null}
    </div>
  )
}
