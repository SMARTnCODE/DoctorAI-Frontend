## Frontend wiring (done)

The React (Vite + TypeScript) frontend calls this backend directly — no Next.js.

- `VITE_API_URL=http://localhost:8000`
- **Authorization:** `Bearer <access_token>` from `localStorage` (admin: `hms_access_token`, doctor: `hms_doctor_access_token`)
- Login, MFA verify, and doctor-login responses **MUST** include `access_token`
- API paths keep the `/api/...` prefix (e.g. `GET http://localhost:8000/api/doctors`)
- Error shape: `{ "error": "<message>", "code"?: "<optional>" }`
- Frontend run: `npm run dev` → http://localhost:3000

---

# Hospital HMS — FastAPI Backend Contract

Derived from Next.js route handlers under `src/app/api`. Paths keep the `/api/...` prefix. JSON bodies use `Content-Type: application/json` unless noted.

---

## 1. Functional requirements

### 1.1 Super Admin portal (Hospital HMS admin)

The Super Admin portal is restricted to users with role `SUPER_ADMIN`. It must support:

| Domain | Capabilities (from APIs + UI) |
|--------|-------------------------------|
| **Authentication & session** | Email/password login; optional MFA when enabled in settings; session probe; logout; inactivity heartbeat; self-service password change. |
| **Dashboard** | Aggregate stats (doctors, patients, shifts, departments, specializations); recent audit activity; patients-by-department chart; 7-day shift trend; shift-type distribution; optional `date` for “today”; visit trend strip (`days` 7/14/30). |
| **Doctors** | Paginated, searchable list with filters (department, specialization, employment status); create doctor (profile, HR fields, optional resume, optional portal login provisioning); full profile (patients, shifts, resume metadata, activity); update profile (tri-state resume); employment status (ACTIVE/INACTIVE/ON_LEAVE) with optional shift cancellation; bulk activate/deactivate (up to 50); suspend / lift suspension; terminate employment; permanent delete with typed confirmation and assignment acknowledgment; portal account lock/unlock/enable/disable/force-password-change; admin reset password (temporary) and admin change password; login-status metadata; resume download/delete; schedule stats and visit trend analytics; directory-wide utilization rollup. |
| **Patients** | Paginated directory with filters; full patient record (care team, visits) with **ACCESS** audit on view; assign/unassign doctors to care team (1–10 per request, archived not deleted); record visits on patient; per-patient visit trend. |
| **Visits** | Global paginated visit list with filters and search; summary counters for list header; patch and hard-delete individual visits. |
| **Shifts** | List (paginated or date range); create/update; soft-cancel (status `CANCELLED`); duplicate shift; copy week; utilization reports (date range and per-doctor `days` window). |
| **Departments & specializations** | List (search/status); create; update (including activate/deactivate and department head doctor). |
| **Settings** | Read/update hospital name, address, session timeout, MFA toggle. |
| **System** | Health probe (DB latency, counts, uptime). |
| **Audit & notifications** | Paginated audit trail with filters; facet values for filter dropdowns; topbar notification feed (excludes noisy actions). |
| **Search** | Global command-palette search (doctors, patients, departments, specializations — directory fields only). |

**Cross-cutting:** Deny-by-default authorization on protected routes; audit logging for mutating and sensitive read operations; hospital “today” in Asia/Shanghai (UTC+8) via shared date helpers; id-or-code resolution for doctors (`id` or `DOC-####`) and patients (`id` or `PAT-####`).

### 1.2 Doctor portal

Doctors authenticate with **identifier** (email, human doctor code, or username) and password. The portal must support:

| Capability | Description |
|------------|-------------|
| **Login / logout / session** | Login with rate limiting and account lifecycle (LOCKED, DEACTIVATED, auto-lock after failed attempts); session probe with public profile and `timeoutMinutes`; logout always clears client auth state. |
| **Mandatory / voluntary password change** | Change password while signed in; re-issue session with new `tokenVersion` on success. |
| **Forgot password** | Anti-enumeration generic response; OTP to registered email (10 min); verify OTP → short-lived reset grant JWT; reset password with strength rules and `tokenVersion` bump (no session issued). |

Doctor-portal API surface in this codebase is **auth-only** (`/api/doctor-auth/*`). Clinical/scheduling data for doctors would be future scope unless added elsewhere.

---

## 2. Authentication & authorization

### 2.1 Transport (FastAPI target)

| Portal | Header | JWT algorithm | Absolute TTL |
|--------|--------|---------------|--------------|
| Super Admin | `Authorization: Bearer <access_token>` | HS256 (or equivalent) | 8 h default; 30 d if `remember: true` |
| Doctor | `Authorization: Bearer <access_token>` | HS256 | Same |

**Note:** The Next.js reference implementation stores JWTs in httpOnly cookies (`hms_session`, `hms_doctor_session`). The FastAPI backend should accept **Bearer** tokens with equivalent claims so the frontend at `localhost:3000` can call `localhost:8000` with `Authorization` and CORS (see §5).

### 2.2 Super Admin JWT payload

| Claim | Description |
|-------|-------------|
| `sub` | User id |
| `email`, `name`, `role` | Profile; `role` must be `SUPER_ADMIN` |
| `jti` | Session id for sliding inactivity and logout revocation |

### 2.3 Doctor JWT payload

| Claim | Description |
|-------|-------------|
| `sub` | Doctor row id (cuid) |
| `email`, `name`, `role` | `role` must be `DOCTOR` |
| `doc` | Human code (e.g. `DOC-0001`) |
| `tv` | `tokenVersion` at issue time; mismatch ⇒ 401 |
| `jti` | Session id for inactivity |

### 2.4 Guards

- **Super Admin:** Missing/invalid token → **401**; wrong role → **403**; idle beyond `sessionTimeoutMin` (from settings, default 30) → **401** with optional `code: "SESSION_EXPIRED"`. Successful guarded requests **touch** activity (sliding window).
- **Doctor:** Missing/invalid token → **401**; `tv` ≠ DB `tokenVersion` → **401**; `accountStatus` `LOCKED` or `DEACTIVATED` → **401**; inactivity → **401** with `code: "SESSION_EXPIRED"` when applicable.

### 2.5 MFA (Super Admin only)

When `settings.mfaEnabled` is true:

1. `POST /api/auth/login` returns **200** `{ "mfaRequired": true, "challengeId": "<string>" }` (no token yet).
2. `POST /api/auth/mfa-verify` with `{ "challengeId", "code" }` (6 digits) completes login and returns user + token.

Reference behavior validates against settings demo code server-side; production should use TOTP or similar. Rate limit MFA attempts (429).

### 2.6 Inactivity heartbeat (Super Admin)

- `POST /api/auth/heartbeat` — requires valid Super Admin session; **200** `{ "ok": true, "timeoutMinutes": <int> }`.
- Client should call on throttled user activity.
- **Doctor portal:** No dedicated heartbeat route in reference code; inactivity is refreshed on each authenticated doctor request.

### 2.7 Error shape

Failed requests return JSON:

```json
{ "error": "<human-readable message>", "code": "<optional machine code>" }
```

Additional fields may appear on specific errors (e.g. `conflict`, `assignments`, `code: "ACTIVE_ASSIGNMENTS"`). Clients should read `error` first; `code` when present (e.g. `SESSION_EXPIRED`).

Common HTTP statuses: **400** malformed body, **401** auth, **403** forbidden, **404** not found, **409** conflict, **422** validation, **429** rate limit, **500** server error, **503** system unavailable (health guard edge case).

### 2.8 Rate limiting (reference)

- Super Admin login: 5 failures / 15 min per IP+email → **429**.
- Doctor login: same in-memory limiter + DB auto-lock after 5 failures (15 min).
- Super Admin change-password: 5 wrong current passwords / 10 min per session → **429**.
- Doctor forgot-password: 3 / 15 min per IP+identifier (silent success when exhausted).
- Doctor verify-OTP: 10 / 15 min per IP → **429**.

---

## 3. Shared list & pagination conventions

### 3.1 Standard pagination (`parsePagination`)

Used by: `GET /api/doctors`, `GET /api/shifts` (non-range mode), `GET /api/patients`, `GET /api/audit-logs`.

| Query param | Default | Rules |
|-------------|---------|--------|
| `page` | `1` | Integer ≥ 1 |
| `pageSize` | `10` | Integer clamped **5–100** |

**Response fields (when paginated):**

```json
{
  "total": <int>,
  "page": <int>,
  "pageSize": <int>,
  "totalPages": <int>   // max(1, ceil(total / pageSize))
}
```

List payload key varies: `doctors`, `shifts`, `patients`, `logs`.

### 3.2 Visits list pagination (distinct)

`GET /api/visits`: `page` default **1**; `pageSize` default **20**, range **1–100** (invalid → **422**). Response includes `total`, `page`, `pageSize` but **not** `totalPages`.

### 3.3 Non-paginated lists

- `GET /api/departments`, `GET /api/specializations`: `{ "<collection>": [...], "total": <filtered count> }`.
- `GET /api/shifts?from=&to=`: `{ "shifts": [...], "total": <count> }` (no page fields).

### 3.4 Date conventions

- Calendar dates: `YYYY-MM-DD`; validate non-existent dates (e.g. 2026-02-30) → **422** where routes use `parseIsoDate`.
- Hospital “today”: UTC+8 via shared helpers.
- Times: `HH:MM` 24h for shifts.

---

## 4. CORS

Frontend dev origin: **`http://localhost:3000`**  
Backend dev origin: **`http://localhost:8000`**

FastAPI should enable CORS for the frontend origin with:

- `Access-Control-Allow-Origin: http://localhost:3000` (or configured allowlist)
- `Access-Control-Allow-Credentials: true` if cookies are ever used
- `Access-Control-Allow-Headers: Authorization, Content-Type`
- `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`

For Bearer-only auth, credentials may be omitted; preflight must allow `Authorization`.

---

## 5. API endpoint reference

Legend: **Auth** = `SuperAdmin` | `Doctor` | `Public`. Path params `{id}` accept cuid or human code where noted.

---

### 5.1 Root

#### `GET /api`

- **Auth:** Public  
- **Response 200:** `{ "message": "Hello, world!" }`

---

### 5.2 Super Admin auth — `/api/auth`

#### `POST /api/auth/login`

- **Auth:** Public  
- **Body:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `email` | string | yes | Valid email, max 200 |
| `password` | string | yes | max 200 |
| `remember` | boolean | no | default `false` |

- **Response 200 (no MFA):** `{ "user": { "id", "name", "email", "role" }, "access_token": "<jwt>" }` *(Bearer contract; reference sets cookie)*  
- **Response 200 (MFA):** `{ "mfaRequired": true, "challengeId": "<string>" }`  
- **Errors:** 400, 401, 403, 429  

#### `POST /api/auth/mfa-verify`

- **Auth:** Public  
- **Body:** `{ "challengeId": string (10–100), "code": string (6 digits) }`  
- **Response 200:** Same as successful login (user + token)  
- **Errors:** 400, 401, 403, 429  

#### `GET /api/auth/session`

- **Auth:** SuperAdmin (read-only; does not refresh activity in reference)  
- **Response 200:** `{ "user": { "id", "name", "email", "role" }, "timeoutMinutes": number }`  
- **Errors:** 401 `{ "error", "code": "SESSION_EXPIRED" }` when idle  

#### `POST /api/auth/logout`

- **Auth:** Best-effort session  
- **Response 200:** `{ "ok": true }`  

#### `POST /api/auth/heartbeat`

- **Auth:** SuperAdmin  
- **Body:** none  
- **Response 200:** `{ "ok": true, "timeoutMinutes": number }`  

#### `POST /api/auth/change-password`

- **Auth:** SuperAdmin  
- **Body:** `{ "currentPassword": string, "newPassword": string }` — new password ≥10 chars, upper, lower, digit, special  
- **Response 200:** `{ "ok": true }`  
- **Errors:** 400, 401, 404, 422, 429  

---

### 5.3 Doctor auth — `/api/doctor-auth`

#### `POST /api/doctor-auth/login`

- **Auth:** Public  
- **Body:** `{ "identifier": string, "password": string, "remember"?: boolean }`  
- **Response 200:** `{ "user": { "id", "doctorId", "name", "email", "designation", "department", "accountStatus", "lastLoginAt", "passwordChangedAt", "mustChangePassword" }, "mustChangePassword": boolean, "access_token": "<jwt>" }`  
- **Errors:** 400, 401, 403, 429  

#### `GET /api/doctor-auth/session`

- **Auth:** Doctor  
- **Response 200:** `{ "user": <getDoctorPublic>, "timeoutMinutes": number }`  

#### `POST /api/doctor-auth/logout`

- **Auth:** Best-effort Doctor  
- **Response 200:** `{ "message": "Signed out." }`  

#### `POST /api/doctor-auth/forgot-password`

- **Auth:** Public  
- **Body:** `{ "identifier": string }`  
- **Response 200 (always):** `{ "message": "If this account exists and is eligible, a 6-digit verification code has been sent to its registered email address." }`  

#### `POST /api/doctor-auth/verify-otp`

- **Auth:** Public  
- **Body:** `{ "identifier": string, "code": string (6 digits) }`  
- **Response 200:** `{ "resetToken": "<jwt grant, 10 min, single-use>" }`  
- **Errors:** 400, 429  

#### `POST /api/doctor-auth/reset-password`

- **Auth:** Public  
- **Body:** `{ "resetToken": string, "newPassword": string }` — doctor password strength schema  
- **Response 200:** `{ "message": "Password reset successful. You can now sign in with your new password." }`  
- **Errors:** 400, 422  

#### `POST /api/doctor-auth/change-password`

- **Auth:** Doctor  
- **Body:** `{ "currentPassword": string, "newPassword": string }`  
- **Response 200:** `{ "user": <getDoctorPublic> }` + new token *(reference refreshes cookie)*  
- **Errors:** 400, 401, 409, 422  

---

### 5.4 Dashboard

#### `GET /api/dashboard`

- **Auth:** SuperAdmin  
- **Query:** `date` optional `YYYY-MM-DD` (defaults hospital today)  
- **Response 200:**

```json
{
  "stats": {
    "totalDoctors", "activeDoctors", "inactiveDoctors",
    "totalPatients", "todayShifts", "upcomingShifts",
    "totalDepartments", "totalSpecializations"
  },
  "recentActivity": [{ "id", "action", "module", "description", "userName", "timestamp" }],
  "patientsByDepartment": [{ "department", "code", "count" }],
  "weekTrend": [{ "date", "label", "scheduled", "cancelled" }],
  "shiftTypeDistribution": [{ "type", "label", "count" }]
}
```

#### `GET /api/dashboard/visits-trend`

- **Auth:** SuperAdmin  
- **Query:** `days` optional — **7 | 14 | 30** (default **14**); invalid → **422**  
- **Response 200:** `{ "days", "from", "to", "points": [{ "date", "weekday", "scheduled", "completed", "cancelled", "total" }] }`  

---

### 5.5 Doctors

#### `GET /api/doctors`

- **Auth:** SuperAdmin  
- **Query:** `page`, `pageSize`, `search`, `departmentId`, `specializationId`, `status`  
- **Response 200:** `{ "doctors": [DoctorListItem...], "total", "page", "pageSize", "totalPages" }`  
  - DoctorListItem: `id`, `doctorId`, `firstName`, `lastName`, `photo`, `gender`, `phone`, `email`, `designation`, `qualification`, `status`, `accountStatus`, `username`, `employeeId`, `employmentType`, `department`, `specializations[]`, `nextShift`, `patientsCount`, `hasResume`, `updatedByName`, `updatedAt`  

#### `POST /api/doctors`

- **Auth:** SuperAdmin  
- **Body:** `doctorCreateSchema` fields (see validation): names, contact, registration, qualifications, employment (`employeeId`, `employmentType`, `joinDate`), `status`, `departmentId`, `specializationIds[]`, optional `resume` `{ fileName, fileType, fileSize, data (base64) }`, optional `login` `{ username?, password, forceChangePassword? }`  
- **Response 201:** `{ "doctor": <record without passwordHash/resume data>, "login"?: { "username", "accountStatus" } }`  
- **Errors:** 409 duplicate email/registration  

#### `GET /api/doctors/utilization`

- **Auth:** SuperAdmin  
- **Query:** `days` — **7 | 14 | 30** (default 30)  
- **Response 200:** `{ "days", "from", "to", "rows": [{ "doctor": { "code", "name", "specializations", "status" }, "scheduledShifts", "scheduledHours", "cancelledShifts", "cancelledHours", "completedShifts", "completedHours", "utilizationPct" }] }`  

#### `PATCH /api/doctors/bulk-status`

- **Auth:** SuperAdmin  
- **Body:** `{ "doctorIds": string[] (1–50), "status": "ACTIVE"|"INACTIVE", "cancelUpcomingShifts"?: boolean }`  
- **Response 200:** `{ "updated", "cancelledShifts", "changed": [{ "doctorId", "name", "status" }], "skipped": [{ "doctorId", "name", "reason" }] }`  
- **Errors:** 404 if any id unknown  

#### `GET /api/doctors/{id}`

- **Auth:** SuperAdmin — `{id}` = cuid or `DOC-####`  
- **Response 200:** `{ "doctor": <full profile, patients[], shifts[], resume metadata>, "activity": [audit entries] }`  

#### `PUT /api/doctors/{id}`

- **Auth:** SuperAdmin  
- **Body:** partial `doctorUpdateSchema`; `resume`: undefined | null (remove) | object (replace); cannot set `login` or `status` SUSPENDED/TERMINATED via this route  
- **Response 200:** `{ "doctor": <safe> }`  

#### `DELETE /api/doctors/{id}`

- **Auth:** SuperAdmin  
- **Body:** `{ "confirm": string (full display name), "acknowledgeAssignments"?: boolean }`  
- **Response 200:** `{ "deleted": true, "removedAssignments", "removedShifts", "removedSpecializations", "removedResume", "preservedVisits" }`  
- **Errors:** 409 `{ "error", "code": "ACTIVE_ASSIGNMENTS", "assignments": { ... } }`  

#### `PATCH /api/doctors/{id}/status`

- **Auth:** SuperAdmin  
- **Body:** `{ "status": "ACTIVE"|"INACTIVE"|"ON_LEAVE", "cancelUpcomingShifts"?: boolean }`  
- **Response 200:** `{ "doctor": <safe>, "cancelledShifts": number }`  

#### `POST /api/doctors/{id}/suspend`

- **Auth:** SuperAdmin  
- **Body:** `{ "reason": string (5–500), "startDate"?: YYYY-MM-DD, "endDate"?: YYYY-MM-DD|null, "notes"?: string }`  
- **Response 200:** `{ "doctor", "suspension": { "reason", "startDate", "endDate" } }`  

#### `DELETE /api/doctors/{id}/suspend`

- **Auth:** SuperAdmin — lift suspension  
- **Response 200:** `{ "doctor": <safe> }`  

#### `POST /api/doctors/{id}/terminate`

- **Auth:** SuperAdmin  
- **Body:** `{ "terminationType": "RESIGNATION"|"CONTRACT_COMPLETED"|"RETIREMENT"|"DISMISSAL"|"OTHER", "terminationDate"?, "lastWorkingDate"?, "reason", "notes"?, "disableLogin"?, "cancelFutureShifts"?, "preventNewPatientAssignments"? }` (booleans default true)  
- **Response 200:** `{ "doctor", "cancelledShifts" }`  

#### `GET /api/doctors/{id}/delete-summary`

- **Auth:** SuperAdmin  
- **Response 200:** `{ "doctor": { "id", "doctorId", "firstName", "lastName", "status" }, "assignments": DoctorDeleteSummary }`  

#### `GET /api/doctors/{id}/login-status`

- **Auth:** SuperAdmin  
- **Response 200:** `{ "doctor": { "id", "doctorId", "firstName", "lastName", "status" }, "login": { "hasCredentials", "lastLoginAt", "passwordChangedAt", "accountStatus", "lockedUntil", "lockReason", "failedLoginCount" } }`  

#### `PATCH /api/doctors/{id}/account`

- **Auth:** SuperAdmin  
- **Body:** `{ "action": "lock"|"unlock"|"enable"|"disable"|"force-password-change" }`  
- **Response 200:** `{ "doctor": <safe>, "accountStatus" }`  

#### `POST /api/doctors/{id}/reset-password`

- **Auth:** SuperAdmin  
- **Body:** optional `{ "forceChangePassword"?: boolean }` (default true)  
- **Response 200:** `{ "temporaryPassword", "passwordChangedAt", "accountStatus", "doctor": { "id", "doctorId", "name" } }`  

#### `POST /api/doctors/{id}/change-password`

- **Auth:** SuperAdmin  
- **Body:** `{ "newPassword": string, "forceChangePassword"?: boolean }`  
- **Response 200:** `{ "passwordChangedAt", "accountStatus", "doctor": { "id", "doctorId", "name" } }`  

#### `GET /api/doctors/{id}/resume`

- **Auth:** SuperAdmin  
- **Query:** `download=1` → attachment disposition  
- **Response 200:** raw file bytes (`Content-Type`, `Content-Disposition`, `Cache-Control: no-store`)  
- **Errors:** 404 JSON if no file  

#### `DELETE /api/doctors/{id}/resume`

- **Auth:** SuperAdmin  
- **Response 200:** `{ "removed": true }`  

#### `GET /api/doctors/{id}/schedule-stats`

- **Auth:** SuperAdmin  
- **Query:** `days` — **7 | 14 | 30** (default 14)  
- **Response 200:** `{ "doctor": { "id", "code", "name", "status" }, "from", "to", "days", "buckets": [...], "totals": {...} }`  

#### `GET /api/doctors/{id}/visit-trend`

- **Auth:** SuperAdmin  
- **Query:** `days` — **7 | 14 | 30** (default 30)  
- **Response 200:** `{ "doctor": { "id", "name", "doctorCode" }, "days", "points": [{ "date", "count", "completed", "cancelled", "scheduled" }], "total" }`  
- **Headers:** `Cache-Control: no-store`  

---

### 5.6 Patients

#### `GET /api/patients`

- **Auth:** SuperAdmin  
- **Query:** `page`, `pageSize`, `search`, `doctorId`, `departmentId`, `specializationId`, `status`  
- **Response 200:** `{ "patients": [PatientListItem...], "total", "page", "pageSize", "totalPages" }`  

#### `GET /api/patients/{id}`

- **Auth:** SuperAdmin — `{id}` = cuid or `PAT-####`  
- **Response 200:** `{ "patient": { demographics, `doctors[]`, `visits[]` } }`  

#### `POST /api/patients/{id}/doctors`

- **Auth:** SuperAdmin  
- **Body:** `{ "doctorIds": string[] }` — 1–10 after normalize  
- **Response 200:** `{ "assigned": [{ "id", "doctorId", "name", "department" }], "total" }`  

#### `DELETE /api/patients/{id}/doctors/{doctorId}`

- **Auth:** SuperAdmin — both segments id-or-code  
- **Response 200:** `{ "ok": true, "doctor": { "name" } }`  

#### `POST /api/patients/{id}/visits`

- **Auth:** SuperAdmin  
- **Body:** `visitCreateSchema`: `visitDate`, `reason`, `diagnosis?`, `notes?`, `doctorId?`, `status?` (default `SCHEDULED`)  
- **Response 201:** `{ "visit": <serializeVisit> }`  

#### `GET /api/patients/{id}/visit-trend`

- **Auth:** SuperAdmin  
- **Query:** `days` — **7 | 14 | 30** (default 30)  
- **Response 200:** `{ "patient": { "id", "name", "patientCode" }, "days", "points", "total" }`  

**Visit wire shape (`serializeVisit`):**

```json
{
  "id", "patientId",
  "patient": { "id", "code", "firstName", "lastName" },
  "doctorId",
  "doctor": { "id", "code", "firstName", "lastName" } | null,
  "visitDate": "<ISO datetime>",
  "reason", "diagnosis", "notes", "status",
  "createdAt": "<ISO datetime>"
}
```

---

### 5.7 Visits

#### `GET /api/visits`

- **Auth:** SuperAdmin  
- **Query:** `patientId`, `doctorId`, `status`, `from`, `to`, `q` (max 80 chars), `page`, `pageSize`  
- **Response 200:** `{ "visits": [...], "total", "page", "pageSize" }`  

#### `GET /api/visits/summary`

- **Auth:** SuperAdmin  
- **Response 200:** `{ "total", "byStatus": { "SCHEDULED", "COMPLETED", "CANCELLED" }, "next7Days", "upcoming", "thisMonth" }`  

#### `PATCH /api/visits/{id}`

- **Auth:** SuperAdmin  
- **Body:** partial `visitUpdateSchema`  
- **Response 200:** `{ "visit": <serializeVisit> }` (no audit if no-op)  

#### `DELETE /api/visits/{id}`

- **Auth:** SuperAdmin  
- **Response 200:** `{ "ok": true }`  

---

### 5.8 Shifts

**Shift types:** `MORNING`, `AFTERNOON`, `EVENING`, `NIGHT`, `EMERGENCY`, `CUSTOM`  
**Shift statuses:** `SCHEDULED`, `CANCELLED`, `COMPLETED`

#### `GET /api/shifts`

- **Auth:** SuperAdmin  
- **Query (range mode):** `from`, `to` (`YYYY-MM-DD`) → `{ "shifts", "total" }`  
- **Query (list mode):** `page`, `pageSize`, `doctorId`, `departmentId`, `shiftType`, `status`, `search`, `date`  
- **Response 200 (list):** `{ "shifts", "total", "page", "pageSize", "totalPages", "today" }`  

#### `POST /api/shifts`

- **Auth:** SuperAdmin  
- **Body:** `{ "doctorId", "departmentId"?, "date", "startTime", "endTime", "shiftType", "room"?, "notes"? }`  
- **Response 201:** `{ "shift": <with nested doctor, department> }`  
- **Errors:** 409 conflict with optional `{ "conflict": { "date", "startTime", "endTime" } }`  

#### `PUT /api/shifts/{id}`

- **Auth:** SuperAdmin  
- **Body:** partial shift fields  
- **Response 200:** `{ "shift" }`  

#### `DELETE /api/shifts/{id}`

- **Auth:** SuperAdmin — soft cancel  
- **Response 200:** `{ "shift" }` with `status: "CANCELLED"`  

#### `POST /api/shifts/{id}/duplicate`

- **Auth:** SuperAdmin  
- **Body:** optional `{ "date"?: YYYY-MM-DD }` (default next calendar day)  
- **Response 200:** `{ "shift" }`  
- **Errors:** 409 with `conflictShift` object  

#### `POST /api/shifts/copy-week`

- **Auth:** SuperAdmin  
- **Body:** `{ "sourceDate", "targetDate" }`  
- **Response 200:** `{ "sourceWeek", "targetWeek", "created", "skipped": [{ "doctor", "date", "reason" }], "createdShifts": [...] }`  

#### `GET /api/shifts/utilization`

- **Auth:** SuperAdmin  
- **Query:** `from`, `to` required; span ≤ 31 days; `from` ≤ `to`  
- **Response 200:** `{ "from", "to", "rows": [{ "doctorId", "code", "name", "department", "doctorStatus", "scheduledShifts", "scheduledHours", "cancelledShifts", "cancelledHours", "completedShifts" }] }`  

---

### 5.9 Departments

#### `GET /api/departments`

- **Auth:** SuperAdmin  
- **Query:** `search`, `status`  
- **Response 200:** `{ "departments": [{ "id", "name", "code", "description", "status", "headDoctor", "doctorsCount", "specializationsCount", "createdAt" }], "total" }`  

#### `POST /api/departments`

- **Auth:** SuperAdmin  
- **Body:** `{ "name", "code" (uppercase A-Z0-9), "description"?, "headDoctorId"?, "status"?: ACTIVE|INACTIVE }`  
- **Response 201:** `{ "department" }`  

#### `PUT /api/departments/{id}`

- **Auth:** SuperAdmin  
- **Body:** partial department schema  
- **Response 200:** `{ "department" }`  

---

### 5.10 Specializations

#### `GET /api/specializations`

- **Auth:** SuperAdmin  
- **Query:** `search`, `status`  
- **Response 200:** `{ "specializations": [...], "total" }`  

#### `POST /api/specializations`

- **Auth:** SuperAdmin  
- **Body:** `{ "name", "description"?, "departmentId"?, "status"?: ACTIVE|INACTIVE }`  
- **Response 201:** `{ "specialization" }`  

#### `PUT /api/specializations/{id}`

- **Auth:** SuperAdmin  
- **Body:** partial specialization schema  
- **Response 200:** `{ "specialization" }`  

---

### 5.11 Settings

#### `GET /api/settings`

- **Auth:** SuperAdmin  
- **Response 200:** `{ "settings": { "id": "singleton", "hospitalName", "hospitalAddress", "sessionTimeoutMin", "mfaEnabled", "mfaDemoCode", "updatedAt" } }`  

#### `PUT /api/settings`

- **Auth:** SuperAdmin  
- **Body:** `{ "hospitalName", "hospitalAddress"?, "sessionTimeoutMin": 5–240, "mfaEnabled": boolean }`  
- **Response 200:** `{ "settings" }`  

---

### 5.12 Audit logs

#### `GET /api/audit-logs`

- **Auth:** SuperAdmin  
- **Query:** `page`, `pageSize`, `action`, `module`, `user`, `from`, `to`  
- **Response 200:** `{ "logs": [AuditLogItem...], "total", "page", "pageSize", "totalPages" }`  

Audit log item: `id`, `userId`, `userName`, `action`, `module`, `recordId`, `recordLabel`, `description`, `ipAddress`, `userAgent`, `timestamp`

#### `GET /api/audit-logs/facets`

- **Auth:** SuperAdmin  
- **Response 200:** `{ "actions": [{ "value", "count" }], "modules": [...], "users": [...], "totalLogs" }` (cached ~30s in reference)  

---

### 5.13 Search & notifications

#### `GET /api/search`

- **Auth:** SuperAdmin  
- **Query:** `q` — if length &lt; 2, empty result sets  
- **Response 200:** `{ "doctors": [...], "patients": [...], "departments": [...], "specializations": [...] }` (max 5/5/3/3)  

#### `GET /api/notifications`

- **Auth:** SuperAdmin  
- **Response 200:** `{ "notifications": [{ "id", "action", "module", "recordLabel", "description", "userName", "timestamp" }] }` (12 recent; excludes VIEW, ACCESS, LOGIN, LOGOUT, SEARCH)  

---

### 5.14 System health

#### `GET /api/system/health`

- **Auth:** SuperAdmin  
- **Response 200 (ok):**

```json
{
  "status": "ok" | "degraded",
  "database": { "ok": boolean, "latencyMs": number | null },
  "uptimeSeconds": number,
  "serverTime": "<ISO>",
  "counts": {
    "doctors", "activeDoctors", "inactiveDoctors",
    "patients", "shifts", "upcomingShifts", "auditLogs"
  } | null
}
```

- DB failure still **200** with `status: "degraded"` and `counts: null`  
- Guard DB failure → **503** `{ "error": "System temporarily unavailable. Database unreachable." }`  

---

## 6. Enumerations (reference)

| Domain | Values |
|--------|--------|
| Doctor employment `status` | `ACTIVE`, `INACTIVE`, `ON_LEAVE`, `SUSPENDED`, `TERMINATED` |
| Doctor portal `accountStatus` | `ACTIVE`, `LOCKED`, `PASSWORD_RESET_REQUIRED`, `DEACTIVATED` |
| Doctor `employmentType` | `FULL_TIME`, `PART_TIME`, `CONTRACT`, `LOCUM` |
| Doctor `designation` | `Consultant`, `Senior Consultant`, `Specialist`, `Senior Specialist`, `Junior Doctor`, `Medical Officer`, `Head of Department` |
| Doctor `consultationType` | `In-Person`, `Video`, `Both` |
| Department / specialization `status` | `ACTIVE`, `INACTIVE` |
| Visit `status` | `SCHEDULED`, `COMPLETED`, `CANCELLED` |
| Care-team assignment `status` | `ACTIVE`, `ARCHIVED` |
| Termination `terminationType` | `RESIGNATION`, `CONTRACT_COMPLETED`, `RETIREMENT`, `DISMISSAL`, `OTHER` |

---

## 7. Implementation notes for FastAPI parity

1. **Bearer vs cookie:** Map login responses to include `access_token`; validate `Authorization: Bearer` on all guarded routes.  
2. **Sliding inactivity:** Server-side store `jti → lastActivity`; compare to `settings.sessionTimeoutMin`; expose `timeoutMinutes` on session and heartbeat.  
3. **Doctor `tokenVersion`:** Increment on password reset, lock, disable, suspend, terminate (when disable login), admin password ops, and successful doctor change-password.  
4. **Passwords:** bcrypt cost 10; never return or audit plaintext passwords (except one-time `temporaryPassword` on admin reset).  
5. **Resume upload:** Max 5 MB; types PDF, DOC, DOCX; store base64 in DB; never echo `data` in JSON list/detail.  
6. **Static route precedence:** Literal paths such as `/api/visits/summary`, `/api/doctors/utilization`, `/api/shifts/utilization` must not be captured by `{id}` dynamic routes.  
7. **Hospital timezone:** Implement `todayISO()` as UTC+8 calendar date for analytics windows consistent with the reference frontend.