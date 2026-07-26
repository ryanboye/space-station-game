# Make Revenue Depend on Operating a Good Station

**Priority:** P1 balance and accounting

## Observed failure

The playthrough reached 2,095 credits and Tier 3 with one medium berth. A project paid an 80-credit advance and then a 300-credit completion award almost immediately. Project advances appeared to count as traffic revenue. The third ship paid 343 credits despite only `2/17` meals, `6/13` drinks, `6/13` lounge, `4/11` restroom, `0/2` wash, and `22/24` passengers returned.

The station therefore compounds capital even when hospitality is failing. Rooms, staffing, layout, stock, and tenants become optional flavor instead of operating decisions.

## Proposed economic shape

- Contract advance covers some setup risk but does not count as earned traffic revenue.
- A small base docking/access fee keeps failure recoverable.
- Most margin comes from fulfilled services, retail, fuel, freight, and on-time departure.
- Missed explicit promises reduce payout and cumulative rating; severe failures can make a turnaround marginal or negative without causing an instant death spiral.
- Better ships bring more gross opportunity and more demanding operating costs, not guaranteed profit.
- Capital projects should require meaningful time or player action before awarding the completion payment.

## Acceptance criteria

- The ledger separates traffic, service sales, tenant income, project advances, project awards, payroll, supplies, and penalties.
- Project money does not advance a traffic-revenue goal.
- A high-service turnaround earns materially more net profit and rating than a low-service turnaround of the same class.
- A result comparable to the observed `2/17` meal run cannot pay hundreds in clean profit.
- A five-minute no-input run grows slower than a player who invests in the forecast demand.
- Balance values live in configuration rather than being duplicated across UI and simulation.
