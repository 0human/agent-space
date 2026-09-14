## Language

- Always respond to the user in Simplified Chinese.
- Keep code identifiers, commands, paths, API names, logs, and quoted
  source text in their original language.
- Write user-facing documents in Simplified Chinese unless the repository
  conventions or the user explicitly require another language.

## 协作原则

- 用户使用问句时，默认先分析和回答，可以进行必要的只读检查；只有用户明确要求修改代码时才执行代码修改。
- 对用户提出的任何意见或任务，先根据事实、目标和约束评估其正确性及方案是否合适，再回答或执行。发现错误时，明确指出并说明依据；存在更优方案时，提出当前条件下的推荐方案，并与用户方案比较收益、成本和风险。证据不足时说明不确定性，不将未经验证的判断称为“最优解”。

## Agent skills

### Issue tracker

本仓库的 issues 和 specs 使用 GitHub Issues 管理。参见 `docs/agents/issue-tracker.md`。

### Triage labels

Triage 使用五种默认规范标签。参见 `docs/agents/triage-labels.md`。

### Domain docs

本仓库采用 single-context domain docs 布局。参见 `docs/agents/domain.md`。
