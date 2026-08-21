---
name: complete-ticket
description: Verify that a ticket's acceptance criteria are satisfied, merge its verified implementation PR before closing the ticket, record completion evidence, and identify newly unblocked work. Use only when the user explicitly asks to complete, close, or finish a ticket after implementation.
---

# Complete Ticket

Complete one implemented ticket without changing its intended scope.

## Input

Accept a GitHub issue number or URL. If the user does not name a ticket, infer it only when the current conversation identifies exactly one ticket; otherwise ask for the ticket.

## Process

1. Read `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `CONTEXT.md`, applicable ADRs, and repository instructions.
2. Fetch the full ticket, including its body, comments, labels, parent, blockers, and linked spec. Identify the implementation commit or diff and the linked implementation PR. Fetch each linked PR's status, required checks, reviews, mergeability, and diff, and confirm that it contains the implementation being verified. Never infer completion from an implementer's claim alone. If a repository with a remote implementation has no identifiable PR, stop and report that the ticket cannot be closed until its implementation PR is identified.
3. Map every acceptance criterion to concrete evidence in the code, tests, command output, or commit. Run the narrowest relevant tests and type checks, then the broader checks required by the repository. Do not edit product code as part of completion; report unmet criteria back to implementation.
4. If any criterion is unmet, ambiguous, or unverified, do not modify or close the ticket. Report each gap, the evidence checked, and the next required action.
5. If every criterion is verified, prepare the exact GitHub changes in this order:
   - if the verified implementation PR is not already `MERGED`, merge it;
   - mark checklist items complete when the tracker supports it;
   - add a concise completion comment with the commit, checks run, and evidence;
   - remove the mapped `ready-for-agent` label when present;
   - close the ticket as completed.
6. Before the first GitHub write, show the PR merge target and method, the remote and local feature branches that will be deleted after the merge, the base branch that will be refreshed, the planned comment, label changes, and close action, then obtain explicit user approval. Treat approval for one ticket as applying only to that ticket.
7. After approval, use `gh pr merge` for the verified implementation PR first when it is not already `MERGED`. Re-fetch the PR and confirm that its state is `MERGED`; only then apply checklist, comment, label, and close changes with the `gh` CLI conventions in `docs/agents/issue-tracker.md`. If the PR merge or any later write fails, report the partial state and stop; do not close the ticket or claim completion.
8. After the PR is confirmed `MERGED`, fetch its `headRefName`, head repository, and `baseRefName` again. If the head belongs to the current repository, delete that remote feature branch. Then require a clean worktree, switch the local worktree to `baseRefName`, fast-forward it from `origin`, and delete the local feature branch. Verify the final branch, upstream synchronization, and absence of both feature-branch refs. Never target the base/default branch, infer a branch name, or delete a fork branch that the current repository does not administer. If cleanup cannot be completed, report the exact partial state and required recovery instead of claiming completion.
9. Recompute the frontier: find open sibling or child tickets whose blockers are now all closed and which have no assignee. Report every newly unblocked ticket and identify the first next ticket using the tracker-defined ordering. Do not claim or implement it.

## Output

Respond in Simplified Chinese unless the user requests another language. Include:

- ticket and final state;
- acceptance criteria with evidence;
- checks run and their results;
- commit or diff used for verification;
- tracker mutations applied;
- remote and local feature-branch cleanup, current branch, and base-branch synchronization;
- newly unblocked tickets and the next frontier ticket;
- remaining gaps or follow-up work.

Never close a ticket merely because code was committed, tests passed generally, or another agent said the work was done.
