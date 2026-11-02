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
  "message": "Item added successfully",
  "item": { "…": "see section 4" },
  "imageUrl": "https://…/uploads/abc.jpg"
}
```
For Vehicle the message is "Item added successfully with generated data".
Home and Other are saved immediately and have no AI step.

### 3.5 Errors

| Status | Body |
|---|---|
| 400 | `{ "message": "Invalid category. Must be one of: Home, Vehicle, Other" }` |
| 400 | `{ "message": "\"property_type\" is required" }` (a missing or invalid field) |
| 400 | `{ "message": "Home category cannot have these fields" }` (fields from another category) |
| 400 | `{ "message": "Invalid system \"bogus\"" }` |
| 404 | User not found |
| 500 | Vehicle only: AI generation failed, nothing saved |

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
  "group": null, "description": null, "due_date": "2026-12-01T00:00:00.000Z",
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
- Vehicle also: `purchase_date`, `total_mileage`, `service_intervals`, `forum_suggestions`.
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
No request body. Response: `{ "success": true, "tasks": [ … ] }`.
- It is generated once per item. Calling it again returns the existing tasks.
- For Home and Other, the schedule uses the item's details and all answers.
- For an Other item that is a one-time task, a single task is returned with the due date.
- Task fields are unchanged: `id`, `item_id`, `item_name`, `upcoming_task`, `description`, `category`, `recommended_interval`, `last_service_assumption`, `next_due_mileage`, `next_due_date`, `priority`, `status`, `manufacturer_interval_uncertain`, and so on.
- `status` values: `DueNow`, `Upcoming`, `Future`, `Overdue`, `Complete`. `priority` values: `High`, `Medium`, `Low`.

---

## 6. Other behavior changes

- Adding an item now sends **one** push notification ("Add Item Success"). The delayed "task generated" push is removed.
- A free user can still add items of any category. Only the question, answer and task endpoints are premium.

## 7. Error quick reference

| Status | Meaning |
|---|---|
| 400 | Validation error. Show `message` |
| 401 | Access token invalid or expired. Call refresh, then retry |
| 403 + `premiumRequired: true` | Free user on a premium endpoint. Show the upgrade screen |
| 403 | Not your item |
| 404 | Item or user not found |
| 500 | Server or AI failure. Show a "try again" message |
