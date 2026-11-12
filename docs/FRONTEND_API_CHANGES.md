# Maintenance Genie: API Changes for Frontend

Base URL: `/api`. Protected endpoints need the header `Authorization: Bearer <access token>`.
All errors are JSON with a `message` field.

## What changed (at a glance)

| Area | Endpoint | Change |
|---|---|---|
| Auth | `POST /users/login` | Response now has `refreshToken`, `user.type`, `user.role` |
| Auth | `POST /users/social-login` | Same as login |
| Auth | `POST /users/refresh-token` | **New** |
| Admin auth | `POST /admin/login` | Response now has `refreshToken`, `user.type`, `user.role` |
| Admin auth | `POST /admin/refresh-token` | **New** |
| Items | `POST /items/add-item` | Per-category fields and validation. Home and Other added. Appliance and Electronics removed |
| Items | `GET /items/get-all-items` | Each item returns only its own category's fields |
| Items | `GET /items/get-item/:id` | Category-shaped response. Returns 403 if the item is not yours |
| Items | `GET /items/:id/questions` | Premium only. Home and Other use a new question format |
| Items | `POST /items/:id/submit-answers` | Premium only. Home and Other use a new answer format |
| Items | `POST /items/:id/generate-tasks` | Premium only. Works for Home and Other too |
| Notifications | (push, see section 7) | New notifications for login, item added, tasks created, task reminders and premium changes |
| Notifications | `GET /notifications` | **New.** The user's notification list (paged, with unread count) |
| Notifications | `PATCH /notifications/:id/read` | **New.** Mark one notification as read |
| Notifications | `DELETE /notifications/:id` | **New.** Soft delete one notification |
| Admin | `POST /admin/notifications/send` | **New.** Send a custom system message |
| Admin | `POST /admin/notifications/run-task-reminders` | **New.** Run the task reminder job now |
| Account | `POST /users/delete-account` | **New.** The user deletes their own account (soft delete, section 8) |
| Reports | `POST /reports` | **New.** Send an app complaint, with optional screenshots (section 9) |
| Reports | `GET /reports`, `GET /reports/:id`, `GET /reports/categories` | **New.** The user's own reports and the category list |
| Admin | `GET /admin/reports`, `GET /admin/reports/:id`, `PATCH /admin/reports/:id` | **New.** Review reports and answer users |
| Auth | any protected endpoint | A deleted account's token now returns 401 with `code: "ACCOUNT_DELETED"` |

Not changed: `get-all-completed-tasks`, `all-tasks`, `:id/tasks`, `upload-maintenance-history/:id`, `toggle-task-status/:id`, `delete-task/:id`, `delete-item/:id`.

---

## 1. Authentication

### 1.1 `POST /users/login` and `POST /users/social-login`

Request: unchanged.

Response (200):
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": "…",
    "name": "…",
    "email": "…",
    "type": "USER",
    "role": "premium"
  },
  "token": "<access token>",
  "refreshToken": "<refresh token>"
}
```
- `user.type`: `USER` or `ADMIN`.
- `user.role`: `normal` (free) or `premium`.
- `refreshToken` is new. Store it in secure storage, next to the access token.
- `social-login` also still returns `newUser` and `user.provider`.

### 1.2 `POST /users/refresh-token` (new)

Request:
```json
{ "refreshToken": "<refresh token>" }
```
Response (200):
```json
{
  "success": true,
  "message": "Token refreshed",
  "token": "<new access token>",
  "refreshToken": "<new refresh token>",
  "user": { "id": "…", "name": "…", "email": "…", "type": "USER", "role": "premium" }
}
```
- **Replace both stored tokens** every time you refresh.
- 400: `refreshToken` missing.
- 401: the refresh token is invalid or expired, or the account is suspended or deleted. Send the user to the login screen.
- `role` is read fresh from the server, so call refresh after a purchase to pick up premium status.

**What to implement:** when any request returns 401 ("Invalid or expired token"), call `/users/refresh-token` once, store the new tokens and retry the original request. If refresh also returns 401, log the user out.

The access token currently lasts 100 days. It will be shortened later with no API change, so build the refresh flow now. The refresh token lasts 180 days.

### 1.3 Admin panel

- `POST /admin/login`: same new fields (`user.type`, `user.role`, `refreshToken`). `createdAt` and `updatedAt` are still returned.
- `POST /admin/refresh-token`: same request and response as the user version. Admin and user refresh tokens are not interchangeable. A user's refresh token returns 401 on the admin endpoint and the other way round.

---

## 2. Categories

Item categories are now **Home**, **Vehicle** and **Other**.
- **Appliance and Electronics are removed.** Sending them returns 400.
- Send `"Other"` for the Other category. Responses also say `"Other"`.

---

## 3. Add item: `POST /items/add-item`

Content type: `multipart/form-data`. The optional image goes in the field **`img`**.
Requires a logged-in user.

Each category accepts **only its own fields**. Sending a field from another category returns 400 `"<Category> category cannot have these fields"`.

### 3.1 Vehicle (same as before)

| Field | Required | Notes |
|---|---|---|
| `category` | Yes | `Vehicle` |
| `brand` | Yes | min 3 characters |
| `model` | Yes | |
| `purchase_date` | Yes | `YYYY-MM-DD` |
| `year_of_the_model` | Yes | |
| `name` | No | |
| `total_mileage` | No | number |
| `engine` | No | |
| `transmission` | No | |
| `drivetrain` | No | |
| `current_mileage` | No | number |
| `average_mileage_per_year` | No | number |
| `user_notes` | No | |
| `img` | No | file |

The server generates service intervals with AI before saving. **If that fails, it returns 500 and nothing is saved.** Show a "try again" message.

### 3.2 Home (new)

| Field | Required | Notes |
|---|---|---|
| `category` | Yes | `Home` |
| `name` | Yes | property name |
| `property_type` | Yes | text, for example House, Condo, Apartment |
| `year_of_the_model` | No | year built |
| `zip_code` | No | max 10 characters |
| `own_or_rent` | No | `Own` or `Rent` |
| `systems` | No | see below |
| `user_notes` | No | |
| `img` | No | property photo |

**`systems`** is the "What does this property have?" checklist. Send **slugs only**: a JSON array string such as `["septic","gutters"]`, a comma-separated string, or repeated fields. Any other value returns 400 `Invalid system "<value>"`. Sending the label ("Water heater") is also rejected. Duplicates are stored once.

| Slug | Label |
|---|---|
| `central_hvac` | Central HVAC / heat pump / furnace |
| `window_ac` | Window or mini-split AC |
| `water_heater` | Water heater |
| `well` | Well |
| `septic` | Septic |
| `municipal_water_sewer` | Municipal water/sewer |
| `gutters` | Gutters |
| `fireplace_wood_stove` | Fireplace / wood stove |
| `sump_pump` | Sump pump |
| `basement_crawlspace` | Basement / crawlspace |
| `garage` | Garage |
| `deck_porch` | Deck / porch |
| `pool_hot_tub` | Pool / hot tub |
| `irrigation_system` | Irrigation system |
| `generator` | Generator |
| `water_softener_filtration` | Water softener / filtration |

### 3.3 Other (new)

| Field | Required | Notes |
|---|---|---|
| `category` | Yes | `Other` |
| `name` | Yes | |
| `group` | No | free text for now |
| `sub_category` | No | free text. **Other only**: Home and Vehicle reject it |
| `description` | No | |
| `due_date` | No | `YYYY-MM-DD` |
| `repeat` | No | text, for example `Never` |
| `reminder` | No | text, for example `1 week before` |
| `user_notes` | No | |
| `img` | No | attachment (one file) |

Empty strings are accepted for the optional text fields.

### 3.4 Response (201)

```json
{
  "success": true,
  "message": "Item added successfully with generated data",
  "item": { "…": "see section 4" },
  "imageUrl": "https://…/uploads/abc.jpg"
}
```
**All three categories** (Vehicle, Home and Other) now get AI-generated extras when the item is added:
- `service_intervals`: a list of lines like `"Septic tank pumping - every 3-5 years"`. **Free users get up to 5, premium users up to 12.**
- `forum_suggestions`: **premium users only** (free users get an empty list). Each entry says where owner communities recommend a different interval than the standard one:
  ```json
  {
    "maintenance_item": "Septic Tank Pumping",
    "category": "Septic",
    "manufacturer_interval": "Every 3-5 years",
    "forum_recommended_interval": "Every 2-3 years",
    "reason": "Owners report slow drains and drain field backups when pumping is delayed.",
    "applies_to": "Households with a garbage disposal",
    "confidence": "Medium",
    "source_forum": "Owner communities",
    "source_url": ""
  }
  ```
  `confidence` is `High`, `Medium` or `Low`. `source_url` is often an empty string. Only show a link when it is not empty. The list can be empty (`[]`) when nothing is known.

Because the server calls the AI before saving, **add-item can take a few seconds** (premium users a bit longer, since they get two AI calls). Show a loading state and use a long enough request timeout (30 seconds is safe).

### 3.5 Errors

| Status | Body |
|---|---|
| 400 | `{ "message": "Invalid category. Must be one of: Home, Vehicle, Other" }` |
| 400 | `{ "message": "\"property_type\" is required" }` (a missing or invalid field) |
| 400 | `{ "message": "Home category cannot have these fields" }` (fields from another category) |
| 400 | `{ "message": "Invalid system \"bogus\"" }` |
| 404 | User not found |
| 500 | `Failed to generate additional data for item`: the AI call failed, **nothing is saved** (all categories). Show a "try again" message |

If a request has fields from another category, only the "cannot have these fields" message is returned.

---

## 4. Item response shapes

Used by `add-item`, `get-all-items` and `get-item/:id`. Each category returns only its own fields. `category` is `Vehicle`, `Home` or `Other`.

**Home**
```json
{
  "id": "…", "category": "Home", "name": "My House", "user_notes": null,
  "property_type": "House", "year_of_the_model": "2015", "zip_code": "12345",
  "own_or_rent": "Own", "systems": ["septic", "gutters"]
}
```
**Other**
```json
{
  "id": "…", "category": "Other", "name": "Repaint mailbox", "user_notes": null,
  "group": null, "sub_category": null, "description": null, "due_date": "2026-12-01T00:00:00.000Z",
  "repeat": "Never", "reminder": "1 week before"
}
```
**Vehicle**
```json
{
  "id": "…", "category": "Vehicle", "name": "Sedan", "user_notes": null,
  "brand": "Toyota", "model": "Camry XSE", "year_of_the_model": "2021",
  "engine": "2.5L", "transmission": "8-Speed Automatic", "drivetrain": "FWD",
  "current_mileage": 48750, "average_mileage_per_year": 12000
}
```

### 4.1 `GET /items/get-all-items`
Returns `{ success, message, items: [...] }` using the shapes above (**summary** form). It returns 404 `"No items found for this user"` when the user has none.
The list no longer includes `image_url`. Use get-item for that.

### 4.2 `GET /items/get-item/:id` and the add-item response (**detail** form)
The summary fields plus:
- All categories: `created_at`, `current_date`, `image_url` (**now a full URL**, or `null`).
- All categories also: `service_intervals` (list of strings) and `forum_suggestions` (list of objects, see section 3.4).
- Vehicle also: `purchase_date`, `total_mileage`.
- `get-item` also includes `user: { email, name }`.

Returns **403** if the item belongs to another user, and 404 if it doesn't exist.

---

## 5. Question, answer and task flow (premium only)

Order of calls for each item:

1. `GET /items/:id/questions`
2. `POST /items/:id/submit-answers`
3. `POST /items/:id/generate-tasks`

**Tasks are not created automatically.** The app must call step 3.

**Free users:** all three endpoints return 403. Show the upgrade screen.
```json
{ "success": false, "premiumRequired": true, "message": "Upgrade to Premium to …" }
```
All three return 403 `"You do not have access to this item"` for another user's item, and 404 if the item doesn't exist.

### 5.1 Vehicle (same format as before)

- `GET /:id/questions` returns `{ success, questions: [...] }`. Each question has Yes, No or Planned as its answer options.
- `POST /:id/submit-answers` body: `{ "answers": ["Yes", "No", "Planned", …] }`. There must be one answer per question, in the order the questions were returned. Casing doesn't matter. The response is `{ success, questions: [...with recommendations] }`.
- If answers were already submitted, the same endpoint returns the saved result with a message.
- **Change:** the vehicle answers now affect the generated tasks. "Yes" skips the task, "No" creates it with higher priority, "Planned" creates it as upcoming. So submit answers before generating tasks.

### 5.2 Home and Other (new format)

#### `GET /items/:id/questions`
```json
{
  "success": true,
  "round": 1,
  "needs_more_information": true,
  "questions": [
    {
      "id": "…",
      "question_id": "septic_last_pumped",
      "question_text": "When was the septic tank last pumped?",
      "input_type": "single_choice",
      "options": ["Within 1 year", "1-3 years ago", "Not sure"],
      "optional": false,
      "reason": "…",
      "maintenance_impact": "…",
      "round": 1,
      "answer": null,
      "skipped": false
    }
  ]
}
```
Render each question from `input_type`:

| `input_type` | UI | Answer to send |
|---|---|---|
| `single_choice` | radio buttons from `options` | one string from `options` |
| `multi_choice` | checkboxes from `options` | an array of strings from `options` |
| `yes_no` | Yes / No buttons (`options` has Yes, No, Not sure) | `"Yes"`, `"No"` or `"Not sure"` |
| `numeric` | number input | a number |
| `text` | text input | a string |

- `"Not sure"` is accepted as an answer for any question type.
- If `optional` is `true`, allow the user to skip the question.
- Calling the endpoint again returns the same questions with any saved `answer` or `skipped`. `needs_more_information` is `true` while some questions are still unanswered.
- Home gets about 5–8 questions in round 1, and Other about 3–6. They are generated by AI, so the number varies.

#### `POST /items/:id/submit-answers`
```json
{
  "answers": [
    { "question_id": "septic_last_pumped", "answer": "1-3 years ago" },
    { "question_id": "hvac_type", "answer": ["Ducted"] },
    { "question_id": "occupants", "answer": 4 },
    { "question_id": "extra_notes", "skipped": true }
  ]
}
```
- Use `question_id` from the question. The question's `id` is also accepted.
- Every required question (not `optional`) in the current round must be answered.
- `skipped: true` is only allowed for optional questions. Optional questions left out of the request count as skipped.
- A question can only be answered once.

Response (200):
```json
{
  "success": true,
  "round": 2,
  "needs_more_information": true,
  "questions": [ "… the next round, same format as above …" ]
}
```
- `needs_more_information: true`: show the returned `questions`, then call submit-answers again.
- `needs_more_information: false` (and `questions: []`): the question stage is finished. Go to generate-tasks.
- There are at most **3 rounds**.
- The user may go to generate-tasks at any point, even with incomplete answers.

Errors (400, with `message`): an unknown or already answered `question_id`, a required question missing, an invalid answer for the type (for example a value not in `options`, or a non-number for `numeric`), or a duplicate answer.

### 5.3 `POST /items/:id/generate-tasks` (all categories)
The body is **optional**. It only matters for shop suggestions (see below). Response: `{ "success": true, "tasks": [ … ] }`.
- It is generated once per item. Calling it again returns the existing tasks.
- For Home and Other, the schedule uses the item's details and all answers.
- For an Other item that is a one-time task, a single task is returned with the due date.
- Task fields are unchanged: `id`, `item_id`, `item_name`, `upcoming_task`, `description`, `category`, `recommended_interval`, `last_service_assumption`, `next_due_mileage`, `next_due_date`, `priority`, `status`, `manufacturer_interval_uncertain`, and so on.
- `status` values: `DueNow`, `Upcoming`, `Future`, `Overdue`, `Complete`. `priority` values: `High`, `Medium`, `Low`.

**Shop suggestions (`shop_suggestions` on each task)**

Each task has a `shop_suggestions` field. When it is filled, it is a list of up to 3 businesses that **the AI suggests** for that kind of task near the user's city or ZIP code, for example septic companies for a septic task:
```json
"shop_suggestions": [
  {
    "name": "ABC Septic",
    "description": "Pumping and inspection",
    "google_map_url": "https://www.google.com/maps/search/?api=1&query=ABC%20Septic%20Springfield%2C%20IL",
    "ai_suggested": true
  }
]
```
- **These are suggestions, not verified listings.** The AI has no live map data, so a business may be closed, or may not serve that exact area. There is deliberately **no rating, review count, phone number or address**, because the AI would have to invent them. **Please label the section clearly**, for example "Suggested shops (verify before visiting)".
- `google_map_url` is a Google Maps search for that business near the user. It opens the user's Maps app, where they can check that the shop exists and see its real details. Use it for a "View on map" button.
- `description` is a short text (under 15 words) saying what the business does.
- The field is `null` when the AI had nothing to suggest, when no location is known, or when the AI call failed. **Always handle `null`** and hide the section then.
- Suggestions are made once per kind of task (`category`), so all tasks of the same category share the same list.
- **Where it looks:** the app can send an optional body to `generate-tasks`: `{ "location": "Springfield, IL" }`. If the body is empty, the server uses, in this order: the Home item's `zip_code`, then the user's saved profile (city, state, postal code, country). With no location at all, there are no suggestions.
- Shop suggestions are only filled when the tasks are generated. Tasks that already exist are not updated.

---

## 6. Other behavior changes

- The old delayed "task generated" push and the "Still there?" login follow-up push are removed. See section 7 for the new notifications.
- A free user can still add items of any category. Only the question, answer and task endpoints are premium.

## 7. Push notifications

The server sends push notifications through Firebase to the device token saved at login (`fcm_token`). Every push has a `title`, a `body` and a data payload:

| Data key | Meaning |
|---|---|
| `type` | What the notification is about (table below). Use it to decide where a tap goes |
| `entityId` | The related record id (a task id, an item id), when there is one |
| `data` | A **JSON string** with extra ids, for example `{"taskId":"…","itemId":"…"}`. Parse it before use |

All Android notifications use the channel id `high_importance_channel`. Create that channel in the app, otherwise Android may drop the notification. Each notification now has its own tag, so a new one no longer replaces the previous one in the tray.

| `type` | When | `entityId` |
|---|---|---|
| `login` | After a successful login | |
| `welcome` | First social sign-in (new account) | |
| `item_added` | An item was added | item id |
| `tasks_created` | `generate-tasks` created tasks | item id |
| `task_reminder` | Daily digest of overdue or due-within-24-hours tasks (see below) | task id (only when the digest is about one task) |
| `premium_activated` | First purchase (subscription or lifetime) | |
| `premium_renewed` | Subscription renewed | |
| `premium_cancelled` | Auto-renew turned off (access continues until the period ends) | |
| `premium_payment_issue` | Renewal payment failed | |
| `premium_expired` | Premium ended | |
| `premium_refunded` | Purchase refunded | |
| `report_update` | An admin answered the user's report or closed it | report id |
| `system` | A custom message sent by an admin | |

After a purchase or renewal, call `POST /users/refresh-token` to get the new `role`.

**Task reminders** run **three times a day** (08:00, 13:00 and 18:00 UTC by default). Each run sends a user **at most one notification**, summarizing all of their tasks that are overdue or due within the next 24 hours, for example: "You have 3 tasks that need attention (1 overdue, 2 due within 24 hours). Next up: Oil change, Tire rotation."
- With one task, `entityId` is that task's id and `data` has `taskId`, `itemId` and `count`. With several tasks, `data` has only `count` (open the tasks list).
- A task is reminded **once**. It is not repeated in later runs.
- The reminder uses the task's `next_due_date`. A date without a time (for example `2026-12-01`) counts as due at 09:00 UTC that day. Tasks with no real date (for example "Unknown") and tasks marked `Complete` get no reminder.

### 7.1 In-app notification list (user token required)

Every notification the server sends is also saved, so the app can show a notification screen. These three endpoints only ever touch the logged-in user's own notifications. Another user's notification returns 404.

**`GET /notifications`**: the user's notifications, newest first. Deleted ones are not returned.

Query parameters (all optional): `page` (default 1), `limit` (default 20, max 100), `unread=true` (only unread).

Response (200):
```json
{
  "success": true,
  "message": "Notifications retrieved successfully",
  "notifications": [
    {
      "id": "…",
      "type": "task_reminder",
      "title": "Maintenance reminder",
      "body": "You have 3 tasks that need attention (1 overdue, 2 due within 24 hours). Next up: Oil change, Tire rotation.",
      "entity_id": null,
      "data": { "count": 3 },
      "is_read": false,
      "read_at": null,
      "created_at": "2026-11-04T08:00:00.000Z"
    }
  ],
  "unreadCount": 4,
  "page": 1,
  "limit": 20,
  "total": 12,
  "totalPages": 1
}
```
- `type` is one of the values in the table above. `entity_id` and `data` tell the app where to go when the notification is tapped (the same values as in the push).
- `data` is a real JSON object here (in the push itself it is a JSON string).
- `unreadCount` is the total number of unread notifications, regardless of the `unread` filter and the page. Use it for the badge.
- `total` and `totalPages` follow the current filter.

**`PATCH /notifications/:id/read`**: marks one notification as read. No body. It only sets `read_at` (the first time). Calling it again changes nothing and still returns 200.

Response (200):
```json
{ "success": true, "message": "Notification marked as read", "notification": { "id": "…", "is_read": true, "read_at": "2026-11-04T09:12:00.000Z", "…": "…" } }
```
- 404 `"Notification not found"`: it doesn't exist, belongs to someone else, or was deleted.

**`DELETE /notifications/:id`**: removes a notification from the user's list. It is a **soft delete**: the server keeps the record and only hides it, so it no longer appears in `GET /notifications` and does not count in `unreadCount`.

Response (200): `{ "success": true, "message": "Notification deleted" }`
- 404 `"Notification not found"`: it doesn't exist, belongs to someone else, or is already deleted.

Both PATCH and DELETE return 401 for a missing or invalid token. There is no "mark all as read" endpoint yet. To do that in the app, call PATCH for each unread notification.

### 7.2 Task reminder cron (what it does, and the admin trigger)

**Schedule:** three times a day, at 08:00, 13:00 and 18:00 UTC. The server settings `TASK_REMINDER_CRON` and `TASK_REMINDER_TZ` change the times and time zone.

**What happens on each run:**
1. It finds tasks that are overdue or due within the next 24 hours, that are not `Complete`, that have never been reminded, and whose owner is an active user.
2. It marks them as reminded, so no run ever includes a task twice.
3. It groups the tasks by user and sends each user **one** notification (type `task_reminder`), and saves it to the user's notification list.
4. Users with nothing to be reminded about get nothing.

**Admin trigger:** an admin can run the same job at any time with `POST /admin/notifications/run-task-reminders` (see below). It uses exactly the same rules. Because tasks already reminded are skipped, triggering it twice in a row does nothing the second time. It can't be used to resend reminders.

### 7.3 Admin panel: notifications (ADMIN token required)

**`POST /admin/notifications/send`**: send a custom system message.
```json
{ "title": "Scheduled maintenance", "body": "The app will be down tonight at 2 AM.", "audience": "all" }
```
- `title`: required, max 100 characters. `body`: required, max 500.
- `audience`: `all` (default), `premium`, `free` or `user`. With `user`, `user_id` is required. With any other audience, `user_id` is not allowed.
- Only active, non-deleted users are included.
- Response (200): `{ "success": true, "message": "Notification sent", "audience": "all", "matched": 120, "pushed": 97, "failed": 2, "noToken": 21 }`
  - `matched`: users who got the message. `pushed`: delivered to a device. `failed`: push attempted but failed. `noToken`: users with no device token (they still get a history row, but no push).
- 404 if no users match. 400 on validation errors.

**`POST /admin/notifications/run-task-reminders`**: run the reminder job now (it also runs automatically three times a day). No body. Tasks already reminded are not sent again.
```
POST /api/admin/notifications/run-task-reminders
Authorization: Bearer <admin access token>
```
- Response (200): `{ "success": true, "message": "Task reminders processed", "users": 3, "tasks": 7 }` (`users`: notifications sent, one per user; `tasks`: tasks included). `0` and `0` means nothing needed a reminder.
- The request waits until the job finishes. With a very large number of due tasks it can take a while, so allow a longer timeout in the admin panel.
- A non-admin token returns 403. A missing or invalid token returns 401.

---

## 8. Delete account (user token required)

**`POST /users/delete-account`**

```json
{ "password": "MyPassword123", "reason": "I no longer use the app" }
```
- `password`: **required for accounts that have a password** (email sign-up). Google and Apple accounts have no password, so for them send no password (an empty body `{}` is fine).
- `reason`: optional, max 500 characters. Shown to admins only.
- Use POST (not DELETE) so the body is easy to send from any HTTP client.

Response (200): `{ "success": true, "message": "Your account has been deleted" }`

| Status | Message |
|---|---|
| 400 | `Password is required to delete your account` (password account, none sent) |
| 401 | `Password is incorrect` |
| 404 | `User not found` (already deleted) |

**What "delete" means:** it is a **soft delete**. The server keeps all of the user's data and only marks the account deleted. After that:
- Login, social login and refresh-token no longer work for the account. Email login returns the normal `Email or password does not match`. Social login returns 403 with `code: "ACCOUNT_DELETED"`.
- The old access token stops working immediately. **Every protected endpoint returns 401 with `{ "message": "This account has been deleted", "code": "ACCOUNT_DELETED" }`.** When the app sees `code: "ACCOUNT_DELETED"`, clear the stored tokens and go to the login screen. Don't try to refresh.
- No more push notifications or reminders.
- The email address stays reserved. Signing up again with it returns `This email belongs to a deleted account. Please contact support.` Restoring or re-creating an account is a support action.
- **A store subscription is not cancelled by deleting the account.** Tell the user (before they confirm) to cancel it in Google Play or the App Store first.

Suggested flow in the app: confirm dialog → (password field for email accounts) → call the endpoint → clear tokens, FCM token and local data → login screen.

---

## 9. App reports / complaints

Users can report a problem with the app. Admins review the reports and can answer. All user endpoints need the user token; they only ever show the user's **own** reports.

**`GET /reports/categories`**: the category list for the dropdown.
```json
{ "success": true, "categories": [ { "value": "bug", "label": "Something is not working" }, "…" ] }
```
Values: `bug`, `crash`, `performance`, `ui_issue`, `ai_suggestions`, `notifications`, `payment`, `account`, `feature_request`, `other`.

**`POST /reports`**: send a report. Use `multipart/form-data` (needed for screenshots; plain text fields work too).

| Field | Required | Notes |
|---|---|---|
| `type` | Yes | one of the values above |
| `subject` | Yes | 3 to 120 characters |
| `description` | Yes | 5 to 2000 characters |
| `platform` | No | `android` or `ios` |
| `app_version` | No | for example `1.0.3` (max 30) |
| `device_model` | No | for example `Pixel 8` (max 80) |
| `os_version` | No | for example `14` (max 30) |
| `screenshots` | No | up to **3** images, field name `screenshots` (repeat it per file). JPG, PNG or GIF, max 5 MB each |

Sending `platform`, `app_version`, `device_model` and `os_version` automatically helps a lot with debugging. We recommend always sending them.

Response (201):
```json
{
  "success": true,
  "message": "Report sent. Thank you for helping us improve the app.",
  "report": {
    "id": "…",
    "type": "crash",
    "type_label": "App crashes or freezes",
    "subject": "App closes when I add an item",
    "description": "Every time I tap Save on the Home form the app closes.",
    "screenshots": ["https://…/uploads/3f2a….png"],
    "platform": "android",
    "app_version": "1.0.3",
    "device_model": "Pixel 8",
    "os_version": "14",
    "status": "open",
    "admin_response": null,
    "responded_at": null,
    "created_at": "2026-11-13T09:00:00.000Z",
    "updated_at": "2026-11-13T09:00:00.000Z"
  }
}
```
Errors: 400 for validation (`message` says which field), 400 for a bad image (`Only JPG, PNG or GIF images are allowed`, `Each image must be 5 MB or smaller`, or too many files), **429** `You can send at most 5 reports per day…` (limit: 5 reports per user per rolling 24 hours).

**`GET /reports`**: the user's reports, newest first. Query (all optional): `page` (default 1), `limit` (default 20, max 100), `status` (`open`, `in_review`, `resolved`, `rejected`).
```json
{ "success": true, "message": "Reports retrieved successfully", "reports": [ { "…same shape as above…" } ], "page": 1, "limit": 20, "total": 3, "totalPages": 1 }
```

**`GET /reports/:id`**: one report (`{ "success": true, "message": "…", "report": { … } }`). 404 `Report not found` if it doesn't exist or is not the user's.

**Report status:** `open` (just sent) → `in_review` → `resolved` or `rejected`. When an admin answers, `admin_response` and `responded_at` are filled in, and the user gets a push and a notification list entry with `type: "report_update"` and `entity_id` = the report id (open that report on tap). Users cannot edit or delete a report.

### 9.1 Admin panel: reports (ADMIN token required)

**`GET /admin/reports`**: all reports, newest first. Query (all optional): `status`, `type`, `search` (matches subject, description or the user's email), `page`, `limit` (default 20, max 100).

Each report has the same fields as above plus the sender:
```json
{ "id": "…", "type": "bug", "subject": "…", "status": "open", "…": "…",
  "user": { "id": "…", "name": "Sam", "email": "sam@example.com", "account_deleted": false } }
```
The response also has `openCount`: the number of open reports in total (for a badge), regardless of the filters. Reports of deleted accounts are still listed, with `account_deleted: true`.

**`GET /admin/reports/:id`**: one report with the user. 404 `Report not found`.

**`PATCH /admin/reports/:id`**: change the status and / or answer the user. Send at least one field.
```json
{ "status": "resolved", "admin_response": "Fixed in version 1.0.4. Please update the app." }
```
- `status`: `open`, `in_review`, `resolved` or `rejected`. `admin_response`: 1 to 2000 characters (shown to the user).
- The user is notified when there is an `admin_response`, or when the status becomes `resolved` or `rejected`. A deleted account gets no notification.
- Response (200): `{ "success": true, "message": "Report updated", "report": { … } }`

**Admin user list:** `GET /admin/user-management/get-all-users` now also returns `deleted_at` and `deletion_reason` for each user, so deleted accounts can be shown or filtered in the panel.

---

## 10. Error quick reference

| Status | Meaning |
|---|---|
| 400 | Validation error. Show `message` |
| 401 + `code: "ACCOUNT_DELETED"` | The account was deleted. Clear tokens and go to login. Don't refresh |
| 401 | Access token invalid or expired. Call refresh, then retry |
| 429 | Too many reports today |
| 403 + `premiumRequired: true` | Free user on a premium endpoint. Show the upgrade screen |
| 403 | Not your item |
| 404 | Item or user not found |
| 500 | Server or AI failure. Show a "try again" message |
