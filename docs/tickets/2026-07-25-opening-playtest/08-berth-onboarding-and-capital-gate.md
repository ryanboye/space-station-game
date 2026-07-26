# Make the First Berth an Understandable Capital Project

**Priority:** P1 vertical slice; lead review required

## Observed failure

The intended berth is a solid rectangular floor with hull on three sides and one edge open to space. The UI previously described a U-shaped room paint, which led to invalid construction. A canonical 4x3 bay also failed all generated contracts because medium traffic began at 20 tiles while Approach Control generated no small contracts.

After placing a gangway in a fresh bay, legacy-save compatibility could make the bay operational without the required berth control and two clamps. Dispatch then exposed a confusing two-step `Reserve` / `Assign` state; one reserved vessel sat idle for several days because the player reasonably assumed reservation had completed the action.

## Required behavior

- Preview the canonical starter bay in-world: rectangular floor, three hull sides, open space-facing edge, and station-side access.
- Before the player paints it, show minimum footprint, required hardware, and total approximate cost.
- New berths must require their intended control, clamp, and gangway hardware. Legacy compatibility may only apply to rooms loaded from an older save schema.
- The first generated contract must fit the smallest supported berth, or Approach Control must explain why no current offer fits.
- Replace `Reserve` then `Assign` with one clear action/state progression unless reservation creates a meaningful decision.
- Do not expose berth contract administration before a functional berth exists.

## Acceptance criteria

- A new player can build a functioning 4x3 medium berth without external instructions.
- The room inspector names a missing wall/access/hardware requirement at the hovered or selected bay.
- Fresh construction cannot trigger the legacy adapter path.
- At least one offer in the first post-construction traffic bank is compatible.
- One click commits a compatible ship to the berth and visible world feedback confirms the assignment.

## Current tuning note

The parent worktree lowers `BERTH_SIZE_MIN.medium` from 20 to 12 and accepts a solid rectangular bay with one space-facing edge. Preserve those semantics while hardening compatibility and onboarding.
