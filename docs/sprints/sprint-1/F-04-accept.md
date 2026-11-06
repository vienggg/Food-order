# F-04 Operator queue + accept order — engineering contract

Sprint 1. Issue #5. Owner: A (vieng). Reviewer: B (ninja). Branch `feature/F-04-accept`.
Definition of Done: [`definition-of-done.md`](definition-of-done.md). Status: **Specified** (committed before any F-04 code).

## 1. Feature and requirements

| Linked | Text (short) |
|---|---|
| FR-09 | Operator queue of PLACED orders, oldest first |
| FR-10 | Accept an order: PLACED → ACCEPTED |
| BR-06 | Only a PLACED order can be accepted, else 409 |
| BR-07 | Two operators accept at once → exactly one 200, the other 409 |
| NFR-04 | Safe concurrent accept (20 parallel accepts → exactly 1 success) |
| FR-04, NFR-03 | OPERATOR only; shared error format |

Depends on: Issue #1 (schema, seed), F-01 (`requireRole("OPERATOR")`). Orders are created by F-03; F-04 tests insert orders directly in the test database, so F-04 does not wait for F-03 code.

## 2. Behaviour

### Workflow
1. Operator opens `/operator/orders` → client calls `GET /api/operator/orders?status=PLACED`.
2. Server returns every PLACED order of every customer (one shop), oldest `createdAt` first (ties by id).
3. Operator presses **Accept order** → `POST /api/operator/orders/:id/accept`.
4. Server checks `canTransition(current, ACCEPTED)` through one conditional update:
   `UPDATE orders SET status = 'ACCEPTED', accepted_at = now() WHERE id = :id AND status IN (statuses that may move to ACCEPTED)`.
   1 row updated → 200 with the order. 0 rows → read the order: missing → 404; otherwise → 409 (status unchanged).
5. Client shows "Order #N accepted." and removes the card; the customer sees ACCEPTED on their order.

### Order status transitions
One table in `server/src/orders/transitions.ts`, used by every status change now and later:

| From | Allowed to (Sprint 1) | Added later |
|---|---|---|
| PLACED | ACCEPTED | REJECTED, CANCELLED (F-06) |
| ACCEPTED | — | PREPARING (F-07) |
| PREPARING | — | READY (F-07) |
| READY | — | PICKED_UP (F-07) |
| PICKED_UP, REJECTED, CANCELLED | — (final) | — |

`canTransition(from, to)` returns true only for a pair in the table.

### Rules, validation, boundaries
- `status` query: only `PLACED` is supported in Sprint 1; missing means `PLACED`; any other value → 400.
- `:id` must be a positive whole number, else 400; a well-formed id with no order → 404.
- 409 message: "Already accepted by another staff member." when the order is ACCEPTED; otherwise "Only PLACED orders can be accepted." `details: { status }` gives the current status.
- The race in BR-07 is decided by the database: the conditional update is atomic, so only one request can change the row.

### Permissions
| Endpoint | Anonymous | CUSTOMER | OPERATOR |
|---|---|---|---|
| `GET /api/operator/orders` | 401 | 403 | ✔ all customers' orders |
| `POST /api/operator/orders/:id/accept` | 401 | 403 | ✔ any order (rules above) |

## 3. UI — S5 Operator order queue (`/operator/orders`)

Per [`../../ui/ui-spec.md`](../../ui/ui-spec.md) S5.
- Heading "New orders" with the count; **Refresh queue** button (no auto-polling).
- Phone: one card per order — `#id`, customer name, placed time, items summary ("Latte ×2, Croissant ×1"), total `฿xx.xx`, **Accept order**. Desktop: four number cards (Waiting orders, Oldest waiting in minutes, Items to make, Queue value — worked out on the client from the list) and the orders as a table (Order, Customer, Items, Placed, Total, Action), as in `DesktopQueue.html`.
- States: loading placeholders; empty "No new orders. New orders appear here when you refresh."; load error "Couldn't load orders." + **Reload queue**; accepting: only that button shows "Accepting…" (disabled); success "Order #N accepted." and the card leaves; 409 "Order #N: Already accepted by another staff member." then reload; 404 "Order #N no longer exists." then reload.

## 4. API

Order JSON (shared with F-03): `{ id, status, total, createdAt, acceptedAt, lines: [{ menuItemId, name, unitPrice, quantity, lineTotal }] }`; money in satang, times ISO 8601. Queue items add `customer: { id, name }`. Lists are plain arrays.

| Method + path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/operator/orders?status=PLACED` | cookie `sid` (OPERATOR) | 200 `[ { id, status: "PLACED", total, createdAt, acceptedAt: null, customer: { id, name }, lines: [...] } ]` oldest first | 400 VALIDATION_ERROR (other status) · 401 · 403 |
| `POST /api/operator/orders/:id/accept` | cookie `sid` (OPERATOR), no body | 200 order with `status: "ACCEPTED"`, `acceptedAt` set | 400 (bad id) · 401 · 403 · 404 NOT_FOUND "Order not found." · 409 INVALID_STATE |

## 5. Data

Migration `add_order_accepted_at`: `orders.accepted_at TIMESTAMP NULL`, set when accepted. No other change. The existing index `(status, created_at)` serves the queue query.

## 6. Acceptance criteria

| ID | Given / when | Then |
|---|---|---|
| AC-F04-01 | Orders in PLACED (created at different times) and ACCEPTED; operator GETs the queue | Only PLACED orders, oldest first; each has customer name, lines (name, quantity), total |
| AC-F04-02 | PLACED orders from alice and bob | Both customers' orders are in the queue |
| AC-F04-03 | `?status=ACCEPTED` or `?status=nonsense` | 400 VALIDATION_ERROR |
| AC-F04-04 | A PLACED order; operator accepts it | 200 with `status: "ACCEPTED"` and `acceptedAt` set; the database row is ACCEPTED; the order is no longer in the queue |
| AC-F04-05 | An ACCEPTED order; operator accepts it again (BR-06) | 409 INVALID_STATE "Already accepted by another staff member."; row unchanged |
| AC-F04-06 | An order in CANCELLED (set directly in the database); operator accepts (BR-06) | 409 INVALID_STATE "Only PLACED orders can be accepted."; row unchanged |
| AC-F04-07 | One PLACED order; 20 accept requests sent at the same time (BR-07, NFR-04) | Exactly one 200 and nineteen 409; order ACCEPTED once |
| AC-F04-08 | Accept id 999999 (no such order); accept id `abc` or 3000000000 (above 2147483647) | 404 NOT_FOUND; 400 VALIDATION_ERROR (never 500) |
| AC-F04-09 | Customer session; no session — on both endpoints | 403 FORBIDDEN; 401 UNAUTHENTICATED; order unchanged |
| AC-F04-10 | `canTransition` | true only for PLACED → ACCEPTED; false for ACCEPTED → ACCEPTED, PLACED → READY, CANCELLED → ACCEPTED and every other pair |
| AC-F04-11 | UI: operator logs in with 2 PLACED orders | Two cards, oldest first, heading count 2; with none: the empty message |
| AC-F04-12 | UI: operator presses Accept order | Button shows "Accepting…"; then "Order #N accepted." and the card is gone |
| AC-F04-13 | UI: order accepted elsewhere after the page loaded; operator presses Accept order | "Order #N: Already accepted by another staff member." and the list reloads without it |

## 7. Test specification

Levels as in F-01 (unit / API with real Postgres / E2E). The test ID is at the start of each test name.

| Test ID | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F04-01 | AC-F04-01 | API | Seed; 3 orders: alice PLACED t1, bob PLACED t0 (older), alice ACCEPTED | GET queue as staff | 2 orders `[bob t0, alice t1]`; customer names; lines; totals |
| TEST-F04-02 | AC-F04-02 | API | Same as 01 | GET queue | customer ids include alice and bob |
| TEST-F04-03 | AC-F04-03 | API | Seed | GET `?status=ACCEPTED`, `?status=nonsense` | 400 both |
| TEST-F04-04 | AC-F04-04 | API | One PLACED order | POST accept as staff; GET queue | 200 ACCEPTED + acceptedAt; DB row ACCEPTED; queue empty |
| TEST-F04-05 | AC-F04-05 | API | One ACCEPTED order | POST accept | 409 message as specified; DB row still ACCEPTED, acceptedAt unchanged |
| TEST-F04-06 | AC-F04-06 | API | One CANCELLED order | POST accept | 409; DB row still CANCELLED |
| TEST-F04-07 | AC-F04-07 | API | One PLACED order | 20 POST accept in parallel (`Promise.all`) | statuses: one 200, nineteen 409; DB ACCEPTED |
| TEST-F04-08 | AC-F04-08 | API | Seed | POST accept 999999; POST accept `abc` | 404; 400 |
| TEST-F04-14 | AC-F04-08 | API | Seed | POST accept 3000000000 | 400 VALIDATION_ERROR (not 500) |
| TEST-F04-09 | AC-F04-09 | API | One PLACED order | Both endpoints as alice and anonymous | 403 / 401; order still PLACED |
| TEST-F04-10 | AC-F04-10 | unit | — | `canTransition` for every (from, to) pair of the 7 statuses | true only for PLACED → ACCEPTED |
| TEST-F04-11 | AC-F04-11 | E2E | Seed; 2 PLACED orders inserted directly in the E2E database (alice, bob), same as the API tests | Log in as staff | 2 cards oldest first, count 2 |
| TEST-F04-12 | AC-F04-12 | E2E | As 11 | Press Accept order on the first card | "Order #N accepted."; 1 card left |
| TEST-F04-13 | AC-F04-13 | E2E | As 11; then order N set to ACCEPTED directly in the E2E database | Press Accept order on N | 409 message; N not in the list |

TDD: TEST-F04-01..10 are committed failing first (`[red]`, `docs/evidence/tdd/F-04-red.txt`), then the code (`[green]`, `F-04-green.txt`). E2E tests run in Issue #10.

## 8. Definition of Done

See [`definition-of-done.md`](definition-of-done.md). F-04 specific: TEST-F04-07 runs in every test run (not skipped) because it is the evidence for BR-07.

## 9. Version history

| Date | Version | Change | Why |
|---|---|---|---|
| 6 Nov 2026 | 1 | First contract; adds `accepted_at` | Before implementation (Issue #5); accepted time requested for the order detail timeline (chat with ninja, 6 Nov) |
| 6 Nov 2026 | 1.1 | AC-F04-08 + TEST-F04-14: id above 2147483647 → 400, not 500; TEST-F04-11/13 preconditions say orders are inserted in the E2E database; UI §3: desktop cards, table is known UI debt | Recheck (#37, agreed in chat #71/#72): bug found by ninja; contract made to match the tests and code |
| 6 Nov 2026 | 1.2 | UI §3: desktop queue is a table, as in the design (no longer UI debt) | #43: desktop layouts made to match docs/ui/design |
