import type { WorkflowPreflightResult } from '../../../../shared/workflow-run'
import { Alert, AlertDescription, AlertTitle } from '@renderer/components/ui/alert'
import { zhCN as copy } from '@renderer/i18n/zh-CN'

export function PreflightResult({ result }: { result: WorkflowPreflightResult }): React.JSX.Element {
  return (
    <Alert variant={result.passed ? 'default' : 'destructive'} role={result.passed ? 'status' : 'alert'}>
      <AlertTitle>{result.passed ? copy.workflow.preflightPassed : copy.workflow.preflightFailed}</AlertTitle>
      <AlertDescription>
        {[...result.checks, ...result.errors].map((message, index) => <p key={index}>{message}</p>)}
      </AlertDescription>
    </Alert>
  )
}
