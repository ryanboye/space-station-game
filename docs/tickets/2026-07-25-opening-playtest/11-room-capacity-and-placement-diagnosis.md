# Make Room Capacity and Placement Failures Explain Themselves

**Priority:** P1 usability

## Observed failure

Hiring from 8 to 10 crew correctly produced a `sleep 8/10` shortage. Selecting the visible Crew Quarters, however, reported no modules and `beds 0/0` even though four rendered bunk fixtures supplied eight slots. Attempting to add beds showed only a red placement ghost with no reason. Expanding the room paint by one row and placing two beds eventually cleared the alert to `10/10`.

This was a good physical management loop hidden behind contradictory information.

## Required behavior

- Room inspectors must count the same fixture capacity used by needs and scheduling.
- Artwork-implied capacity and simulation capacity must agree, including multi-person bunks and tables.
- Invalid placement ghosts must state the immediate reason near the cursor: outside room, blocked footprint, wrong room type, unpowered, inaccessible, or insufficient credits.
- Capacity alerts should select or pulse the relevant rooms and fixtures.
- Show `slots / demand` and current occupancy, not only raw module counts.

## Acceptance criteria

- The starter Crew Quarters inspector reports its actual eight sleep slots.
- Adding two hires changes the shortage from `8/10` to `10/10` when two valid slots are added.
- Hovering every invalid placement location produces one specific reason.
- Global HUD, alert, room inspector, fixture overlay, and save/load all agree on capacity.
