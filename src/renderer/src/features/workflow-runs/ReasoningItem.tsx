import { BrainCircuit, ChevronDown, LoaderCircle } from 'lucide-react'

import type { RuntimeReasoningItem } from '../../../../shared/workflow-run'
import { zhCN as copy } from '@renderer/i18n/zh-CN'

export function ReasoningItem({ item, compact = false, paused = false }: { item: RuntimeReasoningItem; compact?: boolean; paused?: boolean }): React.JSX.Element {
  const thinking = item.status === 'in_progress' && !paused
  return (
    <article className="min-w-0 py-2 text-sm text-muted-foreground [overflow-wrap:anywhere]" aria-label={copy.run.reasoningItem}>
      <div className="flex items-center gap-2" role="status">
        {thinking
          ? <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
          : <BrainCircuit className="size-4 shrink-0" aria-hidden="true" />}
        <span>{paused && item.status === 'in_progress' ? copy.run.turnActivityPaused : copy.run.reasoningStatus[item.status]}</span>
      </div>
      {item.summary.some((part) => part.trim()) ? (
        <div className="mt-2 space-y-2 pl-6" aria-label={copy.run.reasoningSummary}>
          {item.summary.map((part, index) => part ? (
            <p className="whitespace-pre-wrap" key={index}>{part}</p>
          ) : null)}
        </div>
      ) : null}
      {!compact || item.content.some((part) => part.trim()) ? <details className="group mt-2 pl-6">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-xs hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          {copy.run.reasoningDetails}
          <ChevronDown className="size-3 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-3 max-h-64 space-y-3 overflow-y-auto border-l-2 pl-3 text-xs">
          {item.content.some((part) => part.trim())
            ? item.content.map((part, index) => part ? <pre className="whitespace-pre-wrap break-words font-sans" key={index}>{part}</pre> : null)
            : <p>{copy.run.reasoningUnavailable}</p>}
        </div>
      </details> : null}
    </article>
  )
}
