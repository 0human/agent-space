---
name: create-bug-ticket
description: Investigate a reported defect or GitHub Actions failure and draft an evidence-backed GitHub bug ticket. Use only when the user explicitly asks to create a bug ticket from a CI failure, failed check, error report, or reproducible defect.
---

# Create Bug Ticket

Turn verified evidence into one actionable GitHub issue. Do not implement a fix.

## Input

Accept one or more of: a GitHub Actions run URL or ID, PR number, commit SHA, failing check name, local command output, error report, or reproducible defect description. If the source is insufficient to investigate, ask for the smallest missing reference.

## Process

1. Read `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `CONTEXT.md`, applicable ADRs, and repository instructions.
2. Gather primary evidence. For CI, use `gh` to inspect the workflow run, failed jobs, annotations, and logs; identify the workflow, commit, branch, PR, command, first meaningful failure, and log URL. For a reported defect, reproduce it when practical and collect the minimal failing command or steps.
3. Classify the failure before proposing a ticket:
   - product or code defect;
   - test defect or flaky test;
   - CI configuration or dependency failure;
   - external service, runner, credential, quota, or GitHub platform failure;
   - cancelled, superseded, or insufficient evidence.
   Do not create a product bug ticket for the last two categories. Report the evidence and recommended next action instead. For a likely flake, seek at least one additional run or local repetition before creating a ticket; state uncertainty if that is unavailable.
4. Search open issues by the failing component, error signature, and user-visible symptom. Reuse or comment on an existing matching issue rather than creating a duplicate. Show the matching issue and ask for direction when its scope is ambiguous.
5. Draft a Chinese GitHub issue using this structure:

   ```markdown
   ## 问题

   <用户可理解的故障描述>

   ## 证据

   - CI run / PR / commit: <links or identifiers>
   - 失败检查: <workflow and job>
   - 首个有效错误: `<short error excerpt>`

   ## 复现步骤

   1. <minimal reproducible step>

   ## 预期行为

   <what should happen>

   ## 实际行为

   <what happened>

   ## 影响范围

   <affected users, workflow, branch, or release risk>

   ## 验收标准

   - [ ] <observable fix>
   - [ ] <regression test or durable verification>
   - [ ] <relevant CI checks pass>

   ## 已知线索

   <root-cause hypotheses clearly marked as unverified>
   ```

   Never include credentials, tokens, personally identifiable information, or long raw logs. Link to the original run instead.
6. Show the classification, duplicate-search result, draft title, body, and labels. Apply the mapped `ready-for-agent` label only when the ticket has enough evidence and acceptance criteria for implementation; otherwise use `needs-triage` or `needs-info`. Obtain explicit user approval before the first GitHub write.
7. After approval, create the GitHub issue with the `gh` CLI conventions in `docs/agents/issue-tracker.md`, apply the selected label, then fetch and report the resulting issue URL. If any write fails, report the partial state and stop.

## Output

Respond in Simplified Chinese unless the user requests another language. Include the source inspected, classification, duplicate search, issue draft or URL, labels applied, evidence gaps, and the recommended next skill. Suggest `$diagnosing-bugs` for an unresolved code defect, `$implement` for an already well-understood fix, and `$complete-ticket` only after implementation is committed and verified.
