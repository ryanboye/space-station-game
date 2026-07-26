# Establish One Truth for Prepared Meals, Counters, and Buying

**Priority:** P1 simulation/UI contract

## Observed failure

During the medium-ship surges, the header showed `Prepared Meals 0` while its tooltip said there were 12 cooked meals and 12 clean trays at counters. The alert simultaneously said `12 left`. Earlier, the header showed 6 while another alert reported 18. The `Buy 12` button also silently did nothing at one point while remaining enabled.

The player cannot answer the basic operating question: how many people can be fed right now?

## Required behavior

- Define and display separate quantities only where they produce a decision: station stock, servings ready now, counter capacity, clean trays, and inbound purchases.
- The primary HUD number should mean `servings available to take now` or another clearly named, actionable quantity.
- Buying meals must either complete, queue an order with ETA and destination, or refuse with an explicit reason such as storage/counter capacity.
- Counter stock transfers must not duplicate or hide meals across multiple serving stations.
- Arrival forecasts should compare expected meal demand with servings available plus realistic production before arrival.

## Acceptance criteria

- Header, tooltip, alert, room label, and diagnostics reconcile to the same inventory ledger.
- The buy button is disabled with a visible reason when no order can be accepted.
- Multiple serving counters cannot consume or reserve the same meal batch.
- A player can tell before a ship docks whether meal coverage is adequate.
- Saving/loading preserves every stock bucket without changing the total.
