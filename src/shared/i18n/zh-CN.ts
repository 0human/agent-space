export const zhCNMain = {
  projectImport: {
    dialogTitle: '选择 Project Workspace',
    dirtyTitle: 'Dirty Workspace',
    dirtyMessage: '该 Workspace 有未提交修改。',
    dirtyDetail: '继续导入不会 stash、reset 或丢弃这些修改。',
    dirtyWarning: '该 Workspace 有未提交修改。继续导入不会 stash、reset 或丢弃这些修改。',
    continueAction: '继续导入',
    cancelAction: '取消'
  },
  projectOpen: {
    error: '没有找到可用的外部 IDE。请安装并启用 IDE 的命令行启动器。'
  },
  workflowRun: {
    runtimeBlocked: 'Runtime 报告当前 Step blocked。',
    workspaceUnavailable: 'Project Workspace 不可访问。',
    workflowInvalid: (errors: string) => `Project Workflow Validation 失败：${errors}`,
    ideaRequired: 'Idea 不能为空。',
    workspaceAvailable: 'Project Workspace 可访问。',
    workflowValid: 'Project Workflow Validation 通过。',
    ideaFilled: 'Idea 已填写。',
    fakeStepMissing: 'Workflow Step 不存在。',
    fakeFailure: 'fake Runtime 模拟失败。',
    runtimeInvalid: 'Runtime 未报告有效的终态。',
    fakeQuestion: (step: string) => `请确认：${step}`,
    nextAction: {
      running: '等待 Runtime 完成当前 Step。',
      paused: 'Workflow Run 已暂停。',
      waiting: '等待用户处理当前 Step。',
      blocked: 'Workflow Run 已 blocked，需要处理阻塞原因。',
      failed: '当前 Step 失败，可重试。',
      cancelled: 'Workflow Run 已取消。',
      completed: 'Workflow Run 已完成。'
    }
  }
} as const
