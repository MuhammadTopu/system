# Maintenance Genie: Tasks API (3 endpoints)

Base URL: `/api`. All three endpoints need the header `Authorization: Bearer <user access token>`.
Errors are JSON with a `message` field.

| Endpoint | Purpose |
|---|---|
| `GET /items/all-tasks` | All of the user's tasks, paged and filtered |
| `GET /items/:itemId/tasks` | The tasks of one item, paged and filtered |
| `PATCH /items/toggle-task-status/:taskId` | Mark a task done, or reopen it |

> **Path note:** the toggle endpoint is `toggle-task-status`, **not** `toggle-item-status`. The `toggle-item-status` path does not exist and returns 404.

---

## 1. The task object

Every task in these responses has these fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | task id; use it for the toggle call |
| `item_id` | string | the item this task belongs to |
| `item_name` | string | the item's name |
| `upcoming_task` | string | the task title, for example "Oil change" |
| `description` | string or null | |
| `category` | string or null | kind of task, for example "Brakes" |
| `recommended_interval` | string or null | for example "Every 6 months" |
| `last_service_assumption` | string or null | |
| `next_due_date` | string or null | text from the AI, for example `2026-12-01` or `Unknown`. Don't parse it. Use `due_at` |
| `due_at` | ISO date or null | the real due time. `null` when the task has no date |
| `next_due_mileage` | string or null | vehicles |
| `priority` | `High`, `Medium`, `Low` or null | |
| `status` | see below | |
| `last_date` | ISO date or null | when the task was completed |
| `maintenance_history` | string[] | entries from uploaded receipts |
| `receipt_url` | string or null | file name of the last receipt |
| `shop_suggestions` | array or null | AI-suggested shops: `{ name, description, google_map_url, ai_suggested }` |
| `manufacturer_interval_uncertain` | boolean | |
| `created_at` | ISO date | |

### `status` values

| `status` | Meaning |
|---|---|
| `Overdue` | `due_at` is in the past |
| `DueNow` | due within the next 24 hours |
| `Upcoming` | due within the next 30 days |
| `Future` | due in more than 30 days |
| `Complete` | the user marked it done |

The server keeps `Overdue`, `DueNow`, `Upcoming` and `Future` up to date from `due_at` every time one of the list endpoints is called. A task with no `due_at` keeps the status it has. `Complete` is never changed by the server.

---

## 2. `GET /items/all-tasks`

All tasks of the logged-in user, newest first.

```
GET /api/items/all-tasks?filter=all&page=1&limit=20
```

| Query | Default | Notes |
|---|---|---|
| `filter` | `all` | `all`, `overdue`, `duenow`, `upcoming`, `future`, `completed` (case-insensitive) |
| `page` | `1` | |
| `limit` | `20` | max 100 |

Filters:
- `all`: every task, **including completed ones**.
- `overdue`, `duenow`, `upcoming`, `future`: tasks whose `status` is `Overdue`, `DueNow`, `Upcoming` or `Future`.
- `completed`: tasks whose `status` is `Complete`.

The filter is applied **on the server before paging**. Every page only holds matching tasks, and `total` counts only matching tasks.

Response (200):
```json
{
  "success": true,
  "message": "Tasks retrieved successfully",
  "tasks": [
    {
      "id": "cmx9k2…",
      "item_id": "cmx9j1…",
      "item_name": "Toyota Camry",
      "upcoming_task": "Brake fluid flush",
      "description": "Replace brake fluid to keep braking reliable.",
      "category": "Brakes",
      "recommended_interval": "Every 2 years",
      "next_due_date": "2026-10-01",
      "due_at": "2026-10-01T09:00:00.000Z",
      "priority": "High",
      "status": "Overdue",
      "last_date": null,
      "maintenance_history": [],
      "shop_suggestions": [
        { "name": "Midas", "description": "Brake and auto service", "google_map_url": "https://www.google.com/maps/search/?api=1&query=Midas%20Dallas", "ai_suggested": true }
      ],
      "created_at": "2026-11-14T08:12:30.000Z"
    }
  ],
  "filter": "overdue",
  "page": 1,
  "limit": 20,
  "total": 5,
  "totalPages": 1,
  "hasNextPage": false,
  "hasPreviousPage": false,
  "counts": { "all": 22, "overdue": 5, "duenow": 4, "upcoming": 6, "future": 4, "completed": 3 }
}
```

| Field | Meaning |
|---|---|
| `tasks` | the tasks on this page |
| `filter` | the filter that was applied |
| `page`, `limit` | the page and page size used |
| `total` | number of tasks matching the filter |
| `totalPages` | `ceil(total / limit)` |
| `hasNextPage`, `hasPreviousPage` | use them to load more or stop |
| `counts` | number of tasks per filter, for **tab badges**. It ignores the current `filter` and page |

Notes:
- A page past the end returns `tasks: []` with the real `total`.
- A user with no tasks gets `tasks: []`, `total: 0` and every value in `counts` is 0 (status 200, not 404).
- An invalid `page` or `limit` (`abc`, `0`, `-1`) falls back to the default. A `limit` over 100 becomes 100.
- Without `page` and `limit` you only get the **first 20** tasks.

Errors:

| Status | Message |
|---|---|
| 400 | `Invalid filter. Must be one of: all, overdue, duenow, upcoming, future, completed` |
| 401 | missing or invalid token. If the body has `code: "ACCOUNT_DELETED"`, go to the login screen |
| 403 | `code: "ACCOUNT_SUSPENDED"`: the account is suspended |

---

## 3. `GET /items/:itemId/tasks`

The tasks of **one item**. It takes the same query parameters and returns the same response as `all-tasks`, but only for this item. `counts` is also for this item only.

```
GET /api/items/cmx9j1…/tasks?filter=upcoming&page=1&limit=20
```

Response (200): same shape as section 2.

Extra errors:

| Status | Message |
|---|---|
| 404 | `Item not found` (wrong or deleted item id) |
| 403 | `You do not have access to this item` (the item belongs to another user) |

---

## 4. `PATCH /items/toggle-task-status/:taskId`

Marks a task done, or reopens a task that was done.

```
PATCH /api/items/toggle-task-status/cmx9k2…
```

**Simplest use: send no body.** It switches the task:

| Task is now | Result |
|---|---|
| not complete | becomes `Complete`, and `last_date` is set to now |
| `Complete` | is reopened. `status` becomes `Overdue`, `DueNow`, `Upcoming` or `Future` from its `due_at`, and `last_date` is cleared |

Optional body (JSON):
```json
{ "status": "Complete" }
```
| Body `status` | Result |
|---|---|
| `Complete` | marks it complete. If it already is, nothing changes and the original `last_date` is kept |
| `Overdue`, `DueNow`, `Upcoming` or `Future` | reopens it. The server sets the real status from `due_at`, so the value only means "not complete". A task with no `due_at` gets the value you sent |
| anything else | 400 |

Response (200):
```json
{
  "success": true,
  "message": "Task status updated successfully",
  "task": { "id": "cmx9k2…", "status": "Complete", "last_date": "2026-11-16T10:30:00.000Z", "…": "…" }
}
```
`task` is the full task object (section 1). Use it to update the row in the list.

Errors:

| Status | Message |
|---|---|
| 400 | `Invalid status. Must be one of: DueNow, Upcoming, Future, Overdue, Complete` |
| 403 | `You do not have access to this task` (not the user's task) |
| 404 | `Task not found` |
| 401 / 403 | token problems (see section 5) |

---

## 5. Common errors

| Status | Meaning | What to do |
|---|---|---|
| 401 | Token invalid or expired | Call `POST /users/refresh-token`, then retry |
| 401 + `code: "ACCOUNT_DELETED"` | The account was deleted | Clear tokens and go to login. Don't refresh |
| 403 + `code: "ACCOUNT_SUSPENDED"` | The account is suspended | Show the message and go to login |
| 500 | Server problem | Show a "try again" message |

---

## 6. Integration tips

- **Tabs:** one tab per filter (`all`, `overdue`, `duenow`, `upcoming`, `future`, `completed`). Show `counts[filter]` as the badge. Call `all-tasks?filter=<tab>` when a tab opens.
- **Infinite scroll:** load `page=1`, then the next page while `hasNextPage` is true.
- **After the toggle:** update that task from the response. Counts change, so refresh the tab badges (call the list again, or adjust the numbers locally).
- **Showing dates:** use `due_at`, not `next_due_date`. It can be text like `Unknown`.
- **Item screen:** use `GET /items/:itemId/tasks` there, and `all-tasks` for the global task list.
