# Maintenance Genie: Delete Account and App Reports API

Base URL: `/api`. Protected endpoints need the header `Authorization: Bearer <access token>`.
All errors are JSON with a `message` field.

| Area | Endpoint | Who |
|---|---|---|
| Account | `POST /users/delete-account` | User |
| Reports | `GET /reports/categories` | User |
| Reports | `POST /reports` | User |
| Reports | `GET /reports` | User |
| Reports | `GET /reports/:id` | User |
| Admin reports | `GET /admin/reports` | Admin |
| Admin reports | `GET /admin/reports/:id` | Admin |
| Admin reports | `PATCH /admin/reports/:id` | Admin |

---

## 1. Delete account (user token required)

**`POST /users/delete-account`**

```json
{ "password": "MyPassword123", "reason": "I no longer use the app" }
```
- `password`: **required for accounts that have a password** (email sign-up). Google and Apple accounts have no password, so send `{}`.
- `reason`: optional, max 500 characters. Shown to admins only.
- It is a POST (not DELETE) so the body is easy to send from any HTTP client.

Response (200): `{ "success": true, "message": "Your account has been deleted" }`

| Status | Message |
|---|---|
| 400 | `Password is required to delete your account` (password account, none sent) |
| 401 | `Password is incorrect` |
| 404 | `User not found` (already deleted) |

### What "delete" means

It is a **soft delete**: the server keeps all of the user's data and only marks the account deleted. After that:

- Login, social login and refresh-token no longer work. Email login returns the normal `Email or password does not match`. Social login returns 403 with `code: "ACCOUNT_DELETED"`.
- The old access token stops working immediately. **Every protected endpoint returns 401:**
  ```json
  { "message": "This account has been deleted", "code": "ACCOUNT_DELETED" }
  ```
  When the app sees `code: "ACCOUNT_DELETED"`, clear the stored tokens and go to the login screen. Do not try to refresh.
- No more push notifications or reminders.
- The email stays reserved. Signing up again with it returns `This email belongs to a deleted account. Please contact support.`
- **A store subscription is not cancelled.** Before the user confirms, tell them to cancel it in Google Play or the App Store.

Suggested flow: confirm dialog → password field (email accounts only) → call the endpoint → clear tokens, FCM token and local data → login screen.

---

## 2. App reports / complaints (user token required)

Users can report a problem with the app. A user only ever sees their **own** reports.

### 2.1 `GET /reports/categories`

The list for the `type` dropdown.
```json
{ "success": true, "categories": [ { "value": "bug", "label": "Something is not working" }, "…" ] }
```

| `value` | `label` |
|---|---|
| `bug` | Something is not working |
| `crash` | App crashes or freezes |
| `performance` | App is slow |
| `ui_issue` | Screen or design problem |
| `ai_suggestions` | Wrong AI suggestions / tasks |
| `notifications` | Notifications |
| `payment` | Payment or subscription |
| `account` | Account or login |
| `feature_request` | Feature request |
| `other` | Something else |

### 2.2 `POST /reports`: send a report

Only **3 fields** are needed. A normal JSON body works:

```json
{ "type": "crash", "subject": "App closes when I add an item", "description": "Every time I tap Save on the Home form the app closes." }
```

| Field | Required | Notes |
|---|---|---|
| `type` | **Yes** | one of the values above |
| `subject` | **Yes** | 3 to 120 characters |
| `description` | **Yes** | 5 to 2000 characters |

Everything below is **optional**. Skip it if you don't need it:

| Field | Notes |
|---|---|
| `screenshots` | up to 3 images. Needs `multipart/form-data`, field name `screenshots`, repeated per file. JPG, PNG or GIF, max 5 MB each |
| `platform` | `android` or `ios` |
| `app_version` | for example `1.0.3` |
| `device_model` | for example `Pixel 8` |
| `os_version` | for example `14` |

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

Errors:

| Status | Message |
|---|---|
| 400 | Validation message naming the field, for example `"description" length must be at least 5 characters long` |
| 400 | `Only JPG, PNG or GIF images are allowed` |
| 400 | `Each image must be 5 MB or smaller` |
| 400 | `Too many files, or wrong field name (use 'screenshots', max 3)` |
| 429 | `You can send at most 5 reports per day. Please try again tomorrow.` (5 per user per rolling 24 hours) |

### 2.3 `GET /reports`: my reports

Newest first. Query (all optional): `page` (default 1), `limit` (default 20, max 100), `status` (`open`, `in_review`, `resolved`, `rejected`).
```json
{
  "success": true,
  "message": "Reports retrieved successfully",
  "reports": [ { "…same shape as above…" } ],
  "page": 1, "limit": 20, "total": 3, "totalPages": 1
}
```

### 2.4 `GET /reports/:id`: one report

```json
{ "success": true, "message": "Report retrieved successfully", "report": { "…": "…" } }
```
404 `Report not found` if it doesn't exist or isn't the user's.

### 2.5 Status and admin reply

`open` (just sent) → `in_review` → `resolved` or `rejected`.

When an admin answers, `admin_response` and `responded_at` are filled in. The user also gets a push and an entry in their notification list:
- `type`: `report_update`
- `entity_id`: the report id (open that report when the user taps it)
- `data`: `{ "report_id": "…", "status": "resolved" }`

Users cannot edit or delete a report.

---

## 3. Admin panel: reports (ADMIN token required)

A non-admin token returns 403.

### 3.1 `GET /admin/reports`

Newest first. Query (all optional): `status`, `type`, `search` (matches subject, description or the user's email), `page`, `limit` (default 20, max 100).

```json
{
  "success": true,
  "message": "Reports retrieved successfully",
  "reports": [
    {
      "id": "…", "type": "bug", "subject": "…", "description": "…",
      "screenshots": [], "platform": "android", "app_version": "1.0.3",
      "device_model": "Pixel 8", "os_version": "14",
      "status": "open", "admin_response": null, "responded_at": null,
      "created_at": "…", "updated_at": "…",
      "user": { "id": "…", "name": "Sam", "email": "sam@example.com", "account_deleted": false }
    }
  ],
  "openCount": 7,
  "page": 1, "limit": 20, "total": 42, "totalPages": 3
}
```
- `openCount` is the total number of open reports, regardless of filters. Use it for a badge.
- Reports from deleted accounts are still listed, with `account_deleted: true`.

### 3.2 `GET /admin/reports/:id`

One report with the `user` object. 404 `Report not found`.

### 3.3 `PATCH /admin/reports/:id`

Change the status and / or answer the user. Send at least one field.
```json
{ "status": "resolved", "admin_response": "Fixed in version 1.0.4. Please update the app." }
```
- `status`: `open`, `in_review`, `resolved` or `rejected`.
- `admin_response`: 1 to 2000 characters. Shown to the user.
- The user is notified when there is an `admin_response`, or when the status becomes `resolved` or `rejected`. A deleted account gets no notification.

Response (200): `{ "success": true, "message": "Report updated", "report": { … } }`

Errors: 400 for validation (including an empty body: `"value" must contain at least one of [status, admin_response]`), 404 `Report not found`.

### 3.4 Admin user list

`GET /admin/user-management/get-all-users` now also returns `deleted_at` and `deletion_reason` for each user, so the panel can show or filter deleted accounts.

---

## 4. Error quick reference

| Status | Meaning |
|---|---|
| 400 | Validation error. Show `message` |
| 401 + `code: "ACCOUNT_DELETED"` | Account was deleted. Clear tokens and go to login. Don't refresh |
| 401 | Access token invalid or expired. Call refresh, then retry |
| 403 | Wrong role (for example a user token on an admin endpoint) |
| 404 | Report not found |
| 429 | Too many reports today |
