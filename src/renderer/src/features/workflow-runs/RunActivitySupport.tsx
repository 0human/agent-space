import type { WorkflowRunStatus } from '../../../../shared/workflow-run'
import { Badge } from '@renderer/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card'
import { zhCN as copy } from '@renderer/i18n/zh-CN'

import type { DeliveryProjection } from './run-activity-model'

export function DeliveryCard({
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

export function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const label =
    copy.run.status[status as WorkflowRunStatus] ??
    (status === 'interrupting' ? copy.run.pausing : status === 'pending' ? copy.run.pending : status)
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

export function Artifact({
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
