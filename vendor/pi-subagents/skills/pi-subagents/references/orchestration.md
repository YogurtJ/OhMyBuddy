# Orchestration

Use this when several tasks need coordinated children, worktrees, or
repositories, or when a change goes through write, review, and fix rounds.
Create lanes only after delegation is operator-authorized and each lane
materially improves evidence, independent review, specialization, useful
parallelism, or isolated execution. Keep dependent work serial.

## Recipes

Recipes select a shape; they do not authorize delegation. Pick the smallest:

- **Recon then implement:** one focused `scout`, then one `worker` that gets its findings.
- **Implementation:** settle scope and acceptance first, then use a scout, writer, or fresh reviewer only where that stage earns its overhead. Split large work into serial milestones, not a writer swarm.
- **Parallel analysis:** fan out only independent read, review, or validation work, or give each writer its own worktree.

## Seams before writers

Before launching a writer for substantial mutation work, classify it as
**single-seam** or **multi-seam**. Two or more independently testable
contracts or source boundaries make it multi-seam. One PR does not imply one
writer.

- **Multi-seam:** give each component writer exclusive file or contract
  ownership, a focused gate, and a committed or otherwise durable handoff.
  Start one integration-only owner after those handoffs are ready. Repartition
  any writer brief that owns all major outcomes across independent boundaries.
- **Single-seam:** one writer is right when the work is one coupled seam, or
  when splitting would create overlapping ownership or artificial handoffs.
  Record that evidence. Do not split coupled work to raise the lane count.

## Lane board

Before more than one mutation-capable lane starts, record in the parent:

`Lane | repo/cwd | decision | owned files or contract | isolation path | authority | next gate | handoff | why independent`

One source seam or decision is one lane. Record each lane's delivery target,
allowed actions, validation, and review rigor. For cross-repository work,
name the shared contract and which repository changes first. A blocked
decision is a lane state: owner, options, recommended default, and the
evidence needed to continue.

Mutation lanes need distinct isolation paths and explicit `cwd` values.
`worktree: true` branches from `HEAD` (or `baseRef`) and refuses a dirty
checkout; in a shared or dirty checkout, commit first or give each lane a
worktree you created. Use one async workflow for a coordinated wave:
`runs.all` for independent lanes, `runs.run` for dependent stages, repo slug
or lane key in every child key and output path.

While one lane waits, run safe independent preparation, validation, or
read-only review. When only async lanes remain, record what reopens work and
yield; completion wakes the parent.

## Review loop

1. Inspect the source, diff, issue, or plan directly.
2. One writer implements inside its boundary and runs focused validation that can fail for the changed behavior.
3. When the delegation contract calls for independent review, fresh-context read-only reviewers inspect the actual worktree. Otherwise parent inspection is enough; skip review for trivial wording, renames, or local probes.
4. The parent classifies findings (below) and sends accepted fixes to one writer: resume the original worker with its latest run id, or launch one forked `worker` as `/review-loop` does.
5. Re-run affected validation and review only the changed blast radius.
6. Stop when no blocker or fix worth doing now remains, an unapproved product, scope, or architecture decision appears, or the round cap is reached (default 3). Do not loop for polish. Children never decide the loop outcome.

An async writer's handoff is an intermediate state, not completion, unless the
user asked for writer-only work.

| Situation | Review shape |
| --- | --- |
| One coherent diff or risk | one reviewer |
| Independent risks (correctness, tests, security, UI) | parallel reviewers with distinct contracts |
| Possible over-scope | same-writer challenge before fresh review |
| Material design tradeoff | council mode |

### Staged fixes

When reviews have produced findings across several clusters:

1. Run a read-only planning fanout, one reviewer per cluster or angle, each returning exact files, lines, fixes, and validation.
2. Classify the accepted fixes as single-seam or multi-seam (above) on the lane board before any writer starts.
3. Give a writer only its assigned stage. Pass each earlier result into the later task by variable or by its declared `output` path, not as a whole aggregate blob. With `runs.lanes`, keep stages narrow: red test, helper change, one render seam, validation, review.
4. Validate the integrated result with fresh read-only reviewers on distinct angles.

When a child returns a target list, validate it in JavaScript and map bounded
entries into `runs.all`.

## Finding disposition

Classify each finding against the current head:

- **Valid blocker:** concrete failure, repro, security issue, contract mismatch, or source-proven regression. Fix now.
- **Valid non-blocker:** real but outside the slice. Record or defer.
- **Stale:** already fixed or absent. Cite current evidence.
- **Invalid:** contradicted by source, tests, docs, or approved scope. Cite it.
- **Out of scope or policy:** needs an unapproved product, architecture, authority, or release decision. Escalate.
- **Speculative:** no contract, repro, or reachable failure. Do not block.

Classify bot comments the same way before assigning severity.

## Gate failures

1. Confirm the run belongs to the exact head under judgment.
2. Read the focused failing log; name the failing test, assertion, or contract.
3. Classify: current diff, stale test, environment, or existing flake.
4. Reproduce with the narrowest command when practical.
5. Patch forward when the diff caused it. For a stale or flaky failure, collect proof before one rerun.
6. Re-run the affected command or exact-head gate after every fix.

## Handoff and cleanup

A handoff states lane status, repository and worktree, changed files,
validation, open decisions, next action, and artifact or receipt paths. Copy
only final evidence to memory, a mission, a PR, or an approved docs path, then
remove scratch reports from the worktree.

Keep a worktree until its handoff is durable, no run owns it, and no later
gate needs it. If a run stops or needs attention, preserve its worktree and
artifacts, then resume that run or start one replacement lane from the
handoff. Never start a second writer while worktree ownership is unclear.

Before reporting done, check the board: every lane terminal or blocked with a
named next action; one writer per worktree; required validation and fresh
review done; accepted findings fixed and revalidated; publication authority
present before any push, comment, merge, or release; residual risks and
skipped checks stated.
