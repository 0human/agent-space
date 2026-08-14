---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

1. Before changing product code, inspect the repository state and create a new task branch from the intended base. Choose a descriptive, unique branch name. Keep pre-existing unrelated changes out of the task; when they prevent a clean task branch or commit, stop and ask the user how to proceed.
2. Use /tdd where possible, at pre-agreed seams.
3. Run typechecking regularly, single test files regularly, and the full test suite once at the end.
4. Once done, use /code-review to review the work and address its findings.
5. Commit only the task's changes to the task branch. Push it with its upstream set.
6. Create a pull request for the branch. Give it a clear title and body that link the relevant spec or tickets and record the checks run.
7. Wait for the pull request's required CI checks. For each failure caused by this branch, investigate it, make the smallest appropriate fix on the same branch, run the relevant local checks, commit, push, and wait for CI again. Repeat until the required checks pass.

Finish by reporting the pull request URL, commits, checks that passed, and any CI failure that cannot be fixed from this branch, including its evidence and required follow-up.
