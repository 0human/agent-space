# Issue tracker: GitHub

本仓库的 issues 和 specs 存放在 GitHub Issues 中。所有操作均使用 `gh` CLI。

## 约定

- **创建 issue**：`gh issue create --title "..." --body "..."`。多行正文使用 heredoc。
- **读取 issue**：`gh issue view <number> --comments`，同时获取 labels，并使用 `jq` 过滤 comments。
- **列出 issues**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，按需使用 `--label` 和 `--state` 过滤。
- **评论 issue**：`gh issue comment <number> --body "..."`
- **添加/移除 labels**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **关闭 issue**：`gh issue close <number> --comment "..."`

从 `git remote -v` 推断仓库；在 clone 内运行时，`gh` 会自动完成此操作。

## Pull requests as a triage surface

**PRs as a request surface: no.** _（如果本仓库将外部 PR 视为功能请求，可改为 `yes`；`/triage` 会读取此标志。）_

设为 `yes` 时，PR 使用与 issues 相同的 labels 和状态，并通过对应的 `gh pr` 命令操作：

- **读取 PR**：`gh pr view <number> --comments`；使用 `gh pr diff <number>` 查看 diff。
- **列出待 triage 的外部 PR**：运行 `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`，仅保留 `authorAssociation` 为 `CONTRIBUTOR`、`FIRST_TIME_CONTRIBUTOR` 或 `NONE` 的记录。
- **评论、标记或关闭**：使用 `gh pr comment`、`gh pr edit --add-label` / `--remove-label`、`gh pr close`。

GitHub 的 issues 和 PRs 共用编号空间，因此 `#42` 可能是其中任一种。先运行 `gh pr view 42`，失败后再运行 `gh issue view 42`。

## 当 skill 要求 “publish to the issue tracker”

创建一个 GitHub issue。

## 当 skill 要求 “fetch the relevant ticket”

运行 `gh issue view <number> --comments`。

## Wayfinding 操作

供 `/wayfinder` 使用。**Map** 是一个包含多个 child issues 的独立 issue。

- **Map**：带有 `wayfinder:map` label 的独立 issue，正文包含 Notes、Decisions-so-far 和 Fog。使用 `gh issue create --label wayfinder:map`。
- **Child ticket**：通过 GitHub sub-issue 关联到 map。若未启用 sub-issues，则将 child 加入 map 正文的 task list，并在 child 正文顶部写入 `Part of #<map>`。Labels 使用 `wayfinder:<type>`，其中 type 为 `research`、`prototype`、`grilling` 或 `task`。被领取后，将 ticket 分配给负责推进的开发者。
- **Blocking**：以 GitHub 原生 issue dependencies 作为规范且可在 UI 中查看的表示。使用 `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>` 添加依赖边，其中 `<blocker-db-id>` 是 blocker 的数字 database id，可通过 `gh api repos/<owner>/<repo>/issues/<n> --jq .id` 获取，不是 `#number` 或 `node_id`。若 dependencies 不可用，则在 child 正文顶部使用 `Blocked by: #<n>, #<n>`。所有 blocker 关闭后，ticket 即解除阻塞。
- **Frontier query**：列出 map 的 open children，排除仍有 open blocker 或已有 assignee 的 ticket；按 map 中的顺序选择第一个。
- **Claim**：`gh issue edit <n> --add-assignee @me`，这是 session 中的首次写操作。
- **Resolve**：运行 `gh issue comment <n> --body "<answer>"`，随后运行 `gh issue close <n>`，再把 context pointer（gist + link）追加到 map 的 Decisions-so-far。
