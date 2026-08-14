---
name: complete-ticket
description: Verify that a ticket's acceptance criteria are satisfied, record completion evidence, close the ticket, and identify newly unblocked work. Use only when the user explicitly asks to complete, close, or finish a ticket after implementation.
---

# Complete Ticket

Complete one implemented ticket without changing its intended scope.

## Input

Accept a GitHub issue number or URL. If the user does not name a ticket, infer it only when the current conversation identifies exactly one ticket; otherwise ask for the ticket.

## Process

1. Read `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `CONTEXT.md`, applicable ADRs, and repository instructions.
2. Fetch the full ticket, including its body, comments, labels, parent, blockers, and linked spec. Identify the implementation commit or diff. Never infer completion from an implementer's claim alone.
3. Map every acceptance criterion to concrete evidence in the code, tests, command output, or commit. Run the narrowest relevant tests and type checks, then the broader checks required by the repository. Do not edit product code as part of completion; report unmet criteria back to implementation.
4. If any criterion is unmet, ambiguous, or unverified, do not modify or close the ticket. Report each gap, the evidence checked, and the next required action.
5. If every criterion is verified, prepare the exact tracker changes:
   - mark checklist items complete when the tracker supports it;
   - add a concise completion comment with the commit, checks run, and evidence;
   - remove the mapped `ready-for-agent` label when present;
   - close the ticket as completed.
6. Before the first GitHub write, show the planned comment, label changes, and close action, then obtain explicit user approval. Treat approval for one ticket as applying only to that ticket.
7. After approval, apply the changes with the `gh` CLI conventions in `docs/agents/issue-tracker.md`. Re-fetch the ticket and confirm the final state. If any write fails, report the partial state and stop; do not claim completion.
8. Recompute the frontier: find open sibling or child tickets whose blockers are now all closed and which have no assignee. Report every newly unblocked ticket and identify the first next ticket using the tracker-defined ordering. Do not claim or implement it.

## Output

Respond in Simplified Chinese unless the user requests another language. Include:

- ticket and final state;
- acceptance criteria with evidence;
- checks run and their results;
- commit or diff used for verification;
- tracker mutations applied;
- newly unblocked tickets and the next frontier ticket;
- remaining gaps or follow-up work.

Never close a ticket merely because code was committed, tests passed generally, or another agent said the work was done.
