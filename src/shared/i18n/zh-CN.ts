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
  }
} as const
