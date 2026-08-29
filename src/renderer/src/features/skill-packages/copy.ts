export const skillPackageCopy = {
  skillPackages: {
    title: 'Skill Package',
    description:
      '从用户指定的来源解析并安装 Skill；安装前会显示来源、固定版本、依赖和权限。',
    sourceType: '来源类型',
    sourceValue: '来源地址或路径',
    sourcePlaceholder: '/path/to/package 或 https://github.com/...',
    sourceTypes: { localDirectory: '本地目录', archive: '压缩包' },
    previewAction: '解析并预览',
    previewLabel: 'Skill Package 安装预览',
    previewDescription: '确认来源、依赖、兼容 Runtime、权限和风险后再安装。',
    previewBack: '返回',
    installAction: '确认安装',
    dialogClose: '关闭安装预览',
    installedLabel: '已安装 Skill',
    installedEmpty: '还没有已安装 Skill。',
    listError: '读取已安装 Skill 失败。',
    installSuccess: (name: string, version: string) =>
      `${name}@${version} 已安装。`,
    source: '来源',
    skills: 'Skills',
    dependencies: '依赖',
    runtimes: '兼容 Runtime',
    permissions: '权限',
    hash: '内容 hash',
    none: '无',
  },
} as const
