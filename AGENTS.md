# Agent Collaboration

The lead agent is responsible for product judgment, game design, architecture, and final quality. Subagents extend the lead's reach; they do not replace the lead's reasoning.

## Lead Responsibilities

The lead agent personally owns:

- clarifying the intended player experience and design goals;
- making architectural and game-system decisions;
- decomposing work and defining acceptance criteria;
- resolving conflicting findings or recommendations;
- reviewing implementation, visual behavior, and gameplay consequences;
- synthesizing results and recommending what should happen next.

Preserve lead context for these high-value decisions. Do not spend it on exhaustive file discovery, repetitive searches, log transcription, or mechanical QA when those tasks can be delegated cleanly.

## Delegation

Use Luna subagents for bounded, read-heavy work such as:

- locating relevant files, systems, tests, and documentation;
- reviewing design documents or prior research;
- mapping branch overlap and likely integration risks;
- inspecting logs, saves, screenshots, or repetitive QA evidence;
- returning concise findings with file references, evidence, uncertainties, and recommended next steps.

Use Terra subagents for substantive but well-specified execution such as:

- implementing a defined system or UI slice;
- resolving ordinary merge conflicts under an explicit design contract;
- fixing a reproducible bug with clear acceptance criteria;
- adding focused tests for an agreed behavior;
- performing mechanical integration after the lead has made the architectural decisions.

Do not delegate an ambiguous product problem and ask a subagent to invent the design direction. The lead should first decide what experience and behavior the implementation must produce.

## Handoffs

Every implementation handoff should include:

- the player-facing goal and why it matters;
- the exact scope and files or ownership boundaries when known;
- behaviors that must be preserved;
- explicit acceptance criteria and focused checks;
- design decisions already made and decisions the subagent must not reopen;
- files or unrelated work that must not be touched;
- a request for a concise return containing changed files, checks run, uncertainties, and issues requiring lead review.

Prefer one coherent worker for tightly coupled files. Do not run dependent tasks in parallel, and never allow parallel agents to edit overlapping files. Parallelize independent discovery or disjoint implementation only when integration boundaries are clear.

## Review And Completion

The lead must review subagent output before accepting it. A green build is not sufficient for player-facing work: inspect the relevant code paths, run focused checks, and visually or interactively validate the actual gameplay flow. If a subagent uncovers a design conflict, return the decision to the lead rather than allowing mechanical implementation to choose the design accidentally.
