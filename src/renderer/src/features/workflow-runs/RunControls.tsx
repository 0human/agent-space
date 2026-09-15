import { useState } from 'react'
import { runControlAvailability } from './run-activity-model'

import type { WorkflowRun } from '../../../../shared/workflow-run'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@renderer/components/ui/alert-dialog'
import { zhCN as copy } from '@renderer/i18n/zh-CN'

export type RunControlAction = 'pause' | 'send' | 'end' | 'approve' | 'reject'

export function RunComposer({ run, pending, onPause, onSubmit }: {
  run: WorkflowRun
  pending: RunControlAction | null
  onPause: () => Promise<boolean>
  onSubmit: (guidance?: string) => Promise<boolean>
}): React.JSX.Element {
  const [input, setInput] = useState('')
  const { canResume, canRetry, canAnswer } = runControlAvailability(run)
  const canSend = canRetry || canAnswer
  const enabled = pending === null && (canResume || canSend)
  const label = pending === 'pause' ? copy.run.pausing
    : pending ? copy.run.processing
      : run.status === 'running' ? copy.run.pause
        : canResume ? input.trim() ? copy.run.sendAndResume : run.status === 'blocked' ? copy.run.recover : copy.run.resume
          : copy.run.send
  return (
    <form className="mt-3 grid gap-2" onSubmit={async (event) => {
      event.preventDefault()
      if (!enabled || (!canResume && !input.trim())) return
      if (await onSubmit(input.trim() || undefined)) setInput('')
    }}>
      {run.status === 'waiting' && run.snapshot.pendingApprovalDetails?.decision === null
        ? <p className="text-sm">{copy.run.approvalComposerHint}</p> : null}
      <label className="text-xs" htmlFor="run-input">{copy.run.composerLabel}</label>
      <Textarea
        id="run-input"
        value={input}
        disabled={!enabled}
        aria-describedby="run-input-hint"
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
          event.preventDefault()
          if (enabled && input.trim() && !event.repeat) event.currentTarget.form?.requestSubmit()
        }}
      />
      <p id="run-input-hint" className="text-xs text-muted-foreground">{copy.run.composerHint}</p>
      {run.status === 'running' || pending === 'pause' ? (
        <Button className="w-fit" type="button" disabled={pending !== null} onClick={() => { void onPause() }}>{label}</Button>
      ) : canResume || canSend ? (
        <Button className="w-fit" type="submit" disabled={!enabled || (!canResume && !input.trim())}>{label}</Button>
      ) : null}
    </form>
  )
}

export function RunEndButton({ disabled, onEnd }: { disabled: boolean; onEnd: () => void }): React.JSX.Element {
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <Button variant="destructive" size="sm" disabled={disabled} onClick={() => setConfirm(true)}>
        {copy.run.cancel}
      </Button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.run.cancelConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.run.cancelConfirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.run.cancelConfirmBack}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={disabled} onClick={onEnd}>{copy.run.cancelConfirmAction}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
