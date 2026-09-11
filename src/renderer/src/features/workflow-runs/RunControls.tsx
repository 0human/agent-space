import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'

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
  const question = run.status === 'waiting' ? run.snapshot.pendingQuestionDetails : null
  const canResume = run.status === 'paused' || (run.status === 'blocked' && run.snapshot.blockedBy?.recoveryAction === 'resume')
  const canSend = run.status === 'failed' || question?.answer === null
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
      {question?.answer === null ? <p className="text-sm">{question.question}</p> : null}
      {run.status === 'waiting' && run.snapshot.pendingApprovalDetails?.decision === null
        ? <p className="text-sm">{copy.run.approvalComposerHint}</p> : null}
      <label className="text-xs" htmlFor="run-input">{copy.run.composerLabel}</label>
      <Textarea id="run-input" value={input} disabled={!enabled} onChange={(event) => setInput(event.target.value)} />
      {run.status === 'running' || pending === 'pause' ? (
        <Button className="w-fit" type="button" disabled={pending !== null} onClick={() => { void onPause() }}>{label}</Button>
      ) : canResume || canSend ? (
        <Button className="w-fit" type="submit" disabled={!enabled || (!canResume && !input.trim())}>{label}</Button>
      ) : null}
    </form>
  )
}

export function RunEndMenu({ disabled, onEnd }: { disabled: boolean; onEnd: () => void }): React.JSX.Element {
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label={copy.run.moreActions} disabled={disabled}><MoreHorizontal aria-hidden="true" /></Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" className="z-50 rounded-md border bg-popover p-1 shadow-md">
            <DropdownMenu.Item className="cursor-pointer rounded px-3 py-2 text-sm text-destructive outline-none focus:bg-accent" disabled={disabled} onSelect={() => setConfirm(true)}>
              {copy.run.cancel}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
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
