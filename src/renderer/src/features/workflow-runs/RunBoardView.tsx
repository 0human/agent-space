import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Pause,
  RotateCcw,
  Send,
  Square,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'

import type {
  RuntimeItem,
  WorkflowRun,
  WorkflowRunStatus,
} from '../../../../shared/workflow-run'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@renderer/components/ui/alert-dialog'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
import { Textarea } from '@renderer/components/ui/textarea'
import { zhCN as copy } from '@renderer/i18n/zh-CN'

import { createRunBoardModel, type DeliveryProjection } from './run-board-model'
import { RuntimeItemList } from './RuntimeItemList'

interface RunBoardViewProps {
  run: WorkflowRun
  runtimeItems: RuntimeItem[]
  error: string | null
  onBack: () => void
  onPause: () => void
  onResume: () => void
  onRetry: () => void
  onCancel: () => void
  onAnswer: (answer: string) => void
  onApprove: () => void
  onReject: () => void
}

export function RunBoardView(props: RunBoardViewProps): React.JSX.Element {
  const {
    run,
    runtimeItems,
    error,
    onBack,
    onPause,
    onResume,
    onRetry,
    onCancel,
    onAnswer,
    onApprove,
    onReject,
  } = props
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const model = createRunBoardModel(run, runtimeItems, selectedStepId)
  const {
    selectedStep,
    selectedExecution,
    selectedPhaseContext,
    selectedDecisions,
    selectedLogs,
    selectedRuntimeItems,
    selectedBlocker,
  } = model

  return (
    <main
      className="flex min-w-0 flex-1 flex-col px-5 py-6 sm:px-8 lg:px-14"
      aria-labelledby="run-board-title"
    >
      <div className="flex min-h-7 items-center justify-between border-b border-border pb-4 text-[11px] font-semibold text-muted-foreground">
        <p>{copy.run.eyebrow}</p>
        <p className="font-normal">
          {run.workflowId}@{run.workflowVersion}
        </p>
      </div>
      <section className="py-8">
        <Button
          variant="ghost"
          className="mb-6 -ml-3"
          type="button"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" />
          {copy.run.backAction}
        </Button>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge status={run.status} />
              <span>{copy.run.projectId(run.projectId)}</span>
              <span>{copy.run.runId(run.id)}</span>
              <span>
                {copy.run.sourceSnapshot(
                  run.workflowSource?.source ?? 'project',
                  run.workflowSource?.version ?? run.workflowVersion,
                )}
              </span>
            </div>
            <h1
              id="run-board-title"
              className="mt-3 text-3xl font-semibold tracking-tight"
            >
              {run.idea}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {run.snapshot.nextAction}
            </p>
          </div>
          <RunActionButtons
            {...model}
            onPause={onPause}
            onResume={onResume}
            onRetry={onRetry}
            onCancel={onCancel}
          />
        </div>
        {run.error ? (
          <Alert variant="destructive" className="mt-5" role="alert">
            <AlertDescription>{run.error}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive" className="mt-5" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <DeliveryCard delivery={model.delivery} />
        <ScrollArea
          className="mt-7 w-full whitespace-nowrap rounded-xl border"
          aria-label={copy.run.runBoardLabel}
        >
          <div className="flex min-w-max gap-4 p-4">
            {run.definition.phases.map((phase, phaseIndex) => (
              <section
                className={`w-[19rem] shrink-0 rounded-lg border p-3 ${phaseIndex === run.snapshot.phaseIndex ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/20'}`}
                key={phase.id}
              >
                <div className="mb-3 flex items-center gap-2">
                  <Badge variant="outline">
                    {String(phaseIndex + 1).padStart(2, '0')}
                  </Badge>
                  <h2 className="truncate text-sm font-semibold">
                    {phase.name}
                  </h2>
                </div>
                <div className="grid gap-3">
                  {phase.steps.map((step, stepIndex) => {
                    const projection = model.projectStep(
                      step,
                      phaseIndex,
                      stepIndex,
                    )
                    const execution = projection.execution
                    return (
                      <div className="grid gap-2" key={step.id}>
                        <button
                          className={`whitespace-normal rounded-lg border bg-card p-4 text-left shadow-xs transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary ${projection.isCurrent ? 'border-primary' : 'border-border'} ${selectedStepId === step.id ? 'ring-2 ring-primary/30' : ''}`}
                          type="button"
                          aria-pressed={selectedStepId === step.id}
                          onClick={() => setSelectedStepId(step.id)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <strong className="text-sm">{step.name}</strong>
                            {execution ? (
                              <span className="text-xs text-muted-foreground">
                                {copy.run.attempt(execution.attempt)}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-3">
                            <StatusBadge
                              status={execution?.status ?? 'pending'}
                            />
                          </div>
                          {execution?.error ? (
                            <p className="mt-2 text-xs text-destructive">
                              {execution.error}
                            </p>
                          ) : null}
                          {execution?.status === 'skipped' &&
                          typeof execution.output?.reason === 'string' ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {execution.output.reason}
                            </p>
                          ) : null}
                          {execution &&
                          run.snapshot.blockedBy?.executionId ===
                            execution.id ? (
                            <p className="mt-2 text-xs text-destructive">
                              {run.snapshot.blockedBy.reason}
                            </p>
                          ) : null}
                          {projection.isCurrent &&
                          (run.snapshot.pendingQuestion ||
                            run.snapshot.pendingApproval) ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {run.snapshot.pendingQuestion ??
                                run.snapshot.pendingApproval}
                            </p>
                          ) : null}
                        </button>
                        {step.approvalGate ? (
                          <article
                            className={`whitespace-normal rounded-lg border border-dashed p-4 ${projection.isApprovalPending ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
                            aria-label={`${copy.run.approvalTitle}: ${step.approvalGate}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <strong className="text-sm">
                                {copy.run.approvalTitle}
                              </strong>
                              <span className="text-xs text-muted-foreground">
                                {step.name}
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {step.approvalGate}
                            </p>
                            <div className="mt-3">
                              <StatusBadge
                                status={
                                  projection.isApprovalPending
                                    ? 'waiting'
                                    : (execution?.status ?? 'pending')
                                }
                              />
                            </div>
                            {projection.isApprovalPending ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  type="button"
                                  onClick={onApprove}
                                  disabled={!projection.canApprove}
                                >
                                  <ThumbsUp aria-hidden="true" />
                                  {copy.run.approveAction}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                  onClick={onReject}
                                >
                                  <ThumbsDown aria-hidden="true" />
                                  {copy.run.rejectAction}
                                </Button>
                              </div>
                            ) : null}
                            {projection.isApprovalPending &&
                            !projection.canApprove ? (
                              <p className="mt-2 text-xs text-destructive">
                          {projection.approvalBlockedReason ??
                            copy.run.mergeGateBlocked}
                              </p>
                            ) : null}
                          </article>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <Card className="mt-7" aria-labelledby="run-details-title">
          <CardHeader>
            <CardTitle>
              <h2 id="run-details-title">{copy.run.detailsTitle}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedStep && selectedExecution ? (
              <div className="grid gap-7 lg:grid-cols-2">
                <div className="min-w-0">
                  <h3 className="font-semibold">{selectedStep.name}</h3>
                  <p className="mt-1 text-sm text-primary">
                    {copy.run.status[
                      selectedExecution.status as WorkflowRunStatus
                    ] ?? selectedExecution.status}{' '}
                    · {copy.run.attempt(selectedExecution.attempt)}
                  </p>
                  <Detail title={copy.run.contextTitle}>
                    <p>
                      {selectedPhaseContext?.content ??
                        run.definition.phases.find(
                          (phase) => phase.id === selectedExecution.phaseId,
                        )?.goal ??
                        copy.run.noContext}
                    </p>
                  </Detail>
                  <Detail title={copy.run.inputTitle}>
                    <DataBlock
                      value={selectedExecution.input}
                      empty={copy.run.noInput}
                    />
                  </Detail>
                  <Detail title={copy.run.outputTitle}>
                    <DataBlock
                      value={selectedExecution.output}
                      empty={copy.run.noOutput}
                    />
                  </Detail>
                  <Detail title={copy.run.runtimeItemsTitle}>
                    <RuntimeItemList items={selectedRuntimeItems} />
                  </Detail>
                  <p
                    className={`mt-5 text-sm ${selectedExecution.error ? 'text-destructive' : 'text-muted-foreground'}`}
                  >
                    {selectedExecution.error ?? copy.run.noError}
                  </p>
                </div>
                <div className="min-w-0">
                  <Detail title={copy.run.artifactsTitle}>
                    {run.artifacts
                      .filter(
                        (artifact) =>
                          artifact.stepExecutionId === selectedExecution.id,
                      )
                      .map((artifact) => (
                        <Artifact
                          key={artifact.id}
                          name={artifact.name}
                          type={artifact.type}
                          location={artifact.location}
                        />
                      ))}
                    {run.artifacts.every(
                      (artifact) =>
                        artifact.stepExecutionId !== selectedExecution.id,
                    ) ? (
                      <p>{copy.run.noArtifacts}</p>
                    ) : null}
                  </Detail>
                  <Detail title={copy.run.decisionsTitle}>
                    {selectedDecisions.length > 0 ? (
                      selectedDecisions.map((decision) => (
                        <div
                          className="mb-2 rounded-lg border p-3 text-sm"
                          key={decision.id}
                        >
                          <strong className="block">{decision.question}</strong>
                          <span className="mt-1 block text-muted-foreground">
                            {decision.answer}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p>{copy.run.noDecisions}</p>
                    )}
                  </Detail>
                  <Detail title={copy.run.logsTitle}>
                    {selectedLogs.length > 0 ? (
                      selectedLogs.map((log) => (
                        <div
                          className="mb-2 rounded-lg border p-3 text-sm"
                          key={log.id}
                        >
                          <span className="text-xs text-muted-foreground">
                            {log.type}
                          </span>
                          <p>{log.message}</p>
                        </div>
                      ))
                    ) : (
                      <p>{copy.run.noLogs}</p>
                    )}
                  </Detail>
                  {selectedBlocker ? (
                    <Detail title={copy.run.blockerTitle}>
                      <p className="text-destructive">
                        {selectedBlocker.reason}
                      </p>
                      {run.status === 'blocked' &&
                      model.selectedIsMergeConflict ? (
                        <Alert className="mt-3" role="status">
                          <AlertDescription>
                            <strong className="block">
                              {copy.run.conflictResolutionTitle}
                            </strong>
                            <p className="mt-1">
                              {copy.run.conflictResolutionDescription}
                            </p>
                            <span className="mt-2 block">
                              {copy.run.conflictResolutionSkill}
                            </span>
                            <span className="block">
                              {copy.run.conflictResolutionHuman}
                            </span>
                          </AlertDescription>
                        </Alert>
                      ) : null}
                    </Detail>
                  ) : null}
                  <Detail title={copy.run.availableActionsTitle}>
                    {model.selectedIsCurrent ||
                    selectedExecution.status === 'skipped' ? (
                      <RunActionButtons
                        {...model}
                        canRetry={
                          selectedExecution.status === 'skipped' ||
                          model.canRetry
                        }
                        onPause={onPause}
                        onResume={onResume}
                        onRetry={onRetry}
                        onCancel={onCancel}
                      />
                    ) : (
                      <p>{copy.run.noAvailableActions}</p>
                    )}
                  </Detail>
                  <Detail title={copy.run.eventsTitle}>
                    <div className="flex flex-wrap gap-2">
                      {run.events
                        .filter(
                          (event) =>
                            event.data.executionId === selectedExecution.id,
                        )
                        .map((event) => (
                          <Badge variant="outline" key={event.id}>
                            {event.type}
                          </Badge>
                        ))}
                    </div>
                  </Detail>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {copy.run.noSelection}
              </p>
            )}
          </CardContent>
        </Card>
        {run.status === 'waiting' &&
        run.snapshot.pendingQuestionDetails?.answer === null ? (
          <Card className="mt-7" aria-labelledby="run-question-title">
            <CardHeader>
              <CardTitle>
                <h2 id="run-question-title">{copy.run.questionTitle}</h2>
              </CardTitle>
              <CardDescription>
                {run.snapshot.pendingQuestionDetails.question}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <label className="text-sm font-medium" htmlFor="run-answer">
                {copy.run.answerPlaceholder}
              </label>
              <Textarea
                id="run-answer"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder={copy.run.answerPlaceholder}
              />
              <Button
                className="w-fit"
                type="button"
                onClick={() => {
                  onAnswer(answer)
                  setAnswer('')
                }}
                disabled={!answer.trim()}
              >
                <Send aria-hidden="true" />
                {copy.run.answerAction}
              </Button>
            </CardContent>
          </Card>
        ) : null}
        <div className="mt-7 grid gap-5 lg:grid-cols-2">
          <Card aria-labelledby="run-artifacts-title">
            <CardHeader>
              <CardTitle>
                <h2 id="run-artifacts-title">{copy.run.artifactsTitle}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {run.artifacts.length > 0 ? (
                run.artifacts.map((artifact) => (
                  <Artifact
                    key={artifact.id}
                    name={artifact.name}
                    type={artifact.type}
                    location={artifact.location}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  {copy.run.noArtifacts}
                </p>
              )}
            </CardContent>
          </Card>
          <Card aria-labelledby="run-events-title">
            <CardHeader>
              <CardTitle>
                <h2 id="run-events-title">{copy.run.eventsTitle}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {run.events.map((event) => (
                <Badge variant="outline" key={event.id}>
                  {event.type}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  )
}

function RunActionButtons({
  canPause,
  canResume,
  canRetry,
  canCancel,
  onPause,
  onResume,
  onRetry,
  onCancel,
}: {
  canPause: boolean
  canResume: boolean
  canRetry: boolean
  canCancel: boolean
  onPause: () => void
  onResume: () => void
  onRetry: () => void
  onCancel: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        type="button"
        onClick={onPause}
        disabled={!canPause}
      >
        <Pause aria-hidden="true" />
        {copy.run.pause}
      </Button>
      <Button
        size="sm"
        variant="outline"
        type="button"
        onClick={onResume}
        disabled={!canResume}
      >
        <ArrowRight aria-hidden="true" />
        {copy.run.resume}
      </Button>
      <Button
        size="sm"
        variant="outline"
        type="button"
        onClick={onRetry}
        disabled={!canRetry}
      >
        <RotateCcw aria-hidden="true" />
        {copy.run.retry}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            type="button"
            disabled={!canCancel}
          >
            <Square aria-hidden="true" />
            {copy.run.cancel}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.run.cancelConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {copy.run.cancelConfirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.run.cancelConfirmBack}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onCancel}>
              {copy.run.cancelConfirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function DeliveryCard({
  delivery,
}: {
  delivery: DeliveryProjection
}): React.JSX.Element {
  const { pullRequest } = delivery
  return (
    <Card className="mt-7" aria-labelledby="run-delivery-title">
      <CardHeader>
        <CardTitle>
          <h2 id="run-delivery-title">{copy.run.deliveryTitle}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Metadata
            label={copy.run.baseCommit}
            value={delivery.baseCommit ?? copy.projectDetail.noCommit}
          />
          <Metadata
            label={copy.run.branch}
            value={delivery.branch ?? copy.projectDetail.detached}
          />
          {pullRequest ? (
            <>
              <Metadata
                label={copy.run.pullRequest}
                value={pullRequest.url || copy.run.noLocation}
              />
              <Metadata
                label={copy.run.checks}
                value={
                  pullRequest.checks.length > 0
                    ? pullRequest.checks
                        .map((check) => `${check.name}: ${check.result}`)
                        .join(', ')
                    : copy.run.noChecks
                }
              />
              <Metadata
                label={copy.run.reviews}
                value={`${pullRequest.approvedReviews} / ${pullRequest.totalReviews}`}
              />
              <Metadata
                label={copy.run.mergeability}
                value={pullRequest.mergeable}
              />
            </>
          ) : null}
        </dl>
        {pullRequest ? (
          <p
            className={`mt-4 text-sm ${pullRequest.canMerge ? 'text-primary' : 'text-destructive'}`}
          >
            {pullRequest.canMerge
              ? copy.run.mergeGateReady
              : `${copy.run.mergeGateBlocked} ${pullRequest.blockedReason ?? ''}`}
          </p>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            {delivery.isLocalOnly
              ? copy.run.localDelivery
              : copy.run.remoteDelivery}
          </p>
        )}
        {pullRequest ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {copy.run.deliveryTransferNotice}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const label =
    copy.run.status[status as WorkflowRunStatus] ??
    (status === 'pending' ? copy.run.pending : status)
  return (
    <Badge
      variant={
        status === 'failed' || status === 'blocked' || status === 'cancelled'
          ? 'destructive'
          : status === 'running' || status === 'completed'
            ? 'default'
            : 'secondary'
      }
    >
      {label}
    </Badge>
  )
}

function Detail({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="mt-5 text-sm">
      <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  )
}

function DataBlock({
  value,
  empty,
}: {
  value: Record<string, unknown> | null
  empty: string
}): React.JSX.Element {
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs">
      {value ? JSON.stringify(value, null, 2) : empty}
    </pre>
  )
}

function Metadata({
  label,
  value,
}: {
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
    </div>
  )
}

function Artifact({
  name,
  type,
  location,
}: {
  name: string
  type: string
  location: string | null
}): React.JSX.Element {
  return (
    <div className="mb-2 grid gap-1 rounded-lg border p-3 text-sm">
      <strong>{name}</strong>
      <span className="text-xs text-muted-foreground">{type}</span>
      <span className="break-all text-xs text-muted-foreground">
        {location ?? copy.run.noLocation}
      </span>
    </div>
  )
}
