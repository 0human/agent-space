import { Fragment } from 'react'
import { runtimeItemIdentity, type DecisionRecord, type RuntimeItem } from '../../../../shared/workflow-run'
import { zhCN as copy } from '@renderer/i18n/zh-CN'

export interface DecisionMessages {
  afterItem: Map<string, DecisionRecord>
  unmatched: DecisionRecord[]
}

export function locateDecisionMessages(items: RuntimeItem[], decisions: DecisionRecord[]): DecisionMessages {
  const afterItem = new Map<string, DecisionRecord>()
  const unmatched: DecisionRecord[] = []
  const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim()
  let cursor = 0
  for (const decision of [...decisions].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (decision.source !== 'runtime-question') continue
    const question = normalize(decision.question)
    const index = items.findIndex((item, index) => {
      if (index < cursor || item.runId !== decision.runId || item.executionId !== decision.executionId || !question) return false
      const text = item.type === 'question' ? item.questions.map((entry) => entry.question).join('\n')
        : item.type === 'agent_message' || item.type === 'final_response' ? item.text : ''
      return normalize(text).includes(question)
    })
    if (index === -1) unmatched.push(decision)
    else {
      afterItem.set(runtimeItemIdentity(items[index]), decision)
      cursor = index + 1
    }
  }
  return { afterItem, unmatched }
}

export function UserAnswer({ decision }: { decision: DecisionRecord }): React.JSX.Element {
  return (
    <article aria-label={copy.run.userMessageItem} className="ml-auto w-fit max-w-[90%] rounded-lg bg-muted px-4 py-3 text-sm">
      <p className="mb-1 text-xs text-muted-foreground">{copy.run.userMessageAuthor}</p>
      <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{decision.answer}</p>
    </article>
  )
}

export function MissingDecisionMessages({ decisions }: { decisions: DecisionRecord[] }): React.JSX.Element {
  return <>{decisions.map((decision) => (
    <Fragment key={decision.id}>
      <article aria-label={copy.run.questionItem} className="whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">
        {decision.question}
      </article>
      <UserAnswer decision={decision} />
    </Fragment>
  ))}</>
}
