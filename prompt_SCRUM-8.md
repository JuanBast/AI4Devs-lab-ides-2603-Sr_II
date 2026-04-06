# Chat History — SCRUM-8 Ticket Enrichment

## Context

- **Date:** 2026-04-05
- **Ticket:** SCRUM-8 — Seguridad - Asegurar la seguridad y privacidad de los datos del candidato.
- **Task:** Enrich the Jira ticket using the `/enrich-us` skill.

---

## Conversation

### User

```
/enrich-us SCRUM-8
```

> Please analyze and fix the Jira ticket: SCRUM-8.

---

### Assistant

Fetched the Jira ticket `SCRUM-8` and project documentation in parallel:

- `mcp__atlassian__jira_get_issue` → SCRUM-8 details
- `ai-specs/specs/backend-standards.mdc`
- `ai-specs/specs/data-model.md`
- `ai-specs/specs/development_guide.md`
- `backend/src/index.ts`

**Original ticket state:**

| Field       | Value                                                                 |
|-------------|-----------------------------------------------------------------------|
| Key         | SCRUM-8                                                               |
| Type        | Subtask (parent: SCRUM-5 — Añadir Candidato al Sistema)               |
| Status      | Tareas por hacer (To Do)                                              |
| Priority    | Medium                                                                |
| Description | "Asegurar la seguridad y privacidad de los datos del candidato."      |

**Assessment:** The ticket lacked all technical detail required for a developer to work autonomously — no scope, no affected files, no acceptance criteria, no test requirements, no NFRs.

Retrieved available transitions for SCRUM-8:

| ID | Name       |
|----|------------|
| 11 | Por hacer  |
| 21 | En curso   |
| 31 | In Review  |
| 41 | Listo      |

No "To refine" or "Pending refinement validation" columns exist, so no transition was applied.

**Updated the ticket** with the following enhanced description (appended after the original, marked with `## [Original]` and `## [Enhanced]`):

---

#### Enhanced Description Written to SCRUM-8

##### User Story

**As** a system administrator / ATS platform user,
**I want** candidate personal data to be protected against unauthorized access, injection attacks, and data leakage,
**So that** the system complies with data privacy best practices and protects sensitive PII (Personally Identifiable Information).

##### Context

The LTI ATS system stores sensitive candidate PII: `firstName`, `lastName`, `email`, `phone`, `address` (Candidate model), `filePath`/`fileType` (Resume model), plus application and interview details. The backend is **Node.js + TypeScript + Express.js + Prisma ORM + PostgreSQL** following a DDD layered architecture.

##### Scope of Work

###### 1. Input Validation & Sanitization

All incoming data to candidate-related endpoints must be validated and sanitized to prevent injection attacks and malformed data.

**Affected endpoints:**

- `POST /candidates` — Create candidate
- `PUT /candidates/:id` — Update candidate
- `POST /candidates/:id/resume` — Upload resume

**Fields and rules:**

| Field                   | Rule                                                                                        |
|-------------------------|---------------------------------------------------------------------------------------------|
| `firstName` / `lastName`| Required, 2–100 chars, letters only, strip HTML                                             |
| `email`                 | Required, valid format, unique, normalize to lowercase                                      |
| `phone`                 | Optional, Spanish format `(6\|7\|9)XXXXXXXX`                                               |
| `address`               | Optional, max 100 chars, strip HTML                                                         |
| Resume `fileType`       | Whitelist: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| Resume file size        | Max 10 MB                                                                                   |

**Files to modify:**

- `backend/src/application/validator.ts` — Add/extend candidate validation rules
- `backend/src/domain/models/Candidate.ts` — Domain-level sanitization methods
- `backend/src/presentation/controllers/candidateController.ts` — Sanitize input before passing to service

###### 2. HTTP Security Headers

Add security headers to all API responses using the `helmet` middleware.

**Headers to enforce:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Content-Security-Policy`.

**Files to modify:**

- `backend/src/index.ts` — Register `helmet()` as global middleware

###### 3. CORS Configuration

Restrict CORS to an explicit allowlist — no wildcard `*` in production.

**Files to modify:**

- `backend/src/index.ts` — Configure `cors` middleware with `origin` allowlist read from environment variables (e.g. `ALLOWED_ORIGINS`)

###### 4. Rate Limiting

Apply rate limiting to candidate endpoints to prevent abuse and brute-force attempts.

**Configuration:** max **100 requests per 15-minute window per IP** on all `/candidates` routes.

**Files to modify:**

- `backend/src/routes/candidateRoutes.ts` (or `backend/src/index.ts`) — Apply `express-rate-limit` middleware

###### 5. File Upload Security (Resume)

Validate uploaded resume files beyond the declared MIME type.

**Requirements:**

- Validate actual file content via magic bytes (not just `Content-Type` header)
- Store files outside the web root (not directly URL-accessible)
- Generate a randomized filename (UUID-based) to prevent path traversal
- Never expose the raw `filePath` in API responses — return an opaque reference ID

**Files to modify:**

- `backend/src/application/services/candidateService.ts` — File handling and storage logic
- `backend/src/presentation/controllers/candidateController.ts` — Strip `filePath` from responses

###### 6. Sensitive Data Masking in API Responses

API responses must not expose internal paths or unnecessary PII.

**Rules:**

- `filePath` must be omitted from all Resume responses
- List endpoints return only the minimum candidate fields needed

**Files to modify:**

- `backend/src/presentation/controllers/candidateController.ts` — DTO shaping
- `backend/src/application/services/candidateService.ts` — DTO mapping layer

###### 7. Environment Variable Security

No secrets, credentials, or PII in source code.

**Checklist:**

- `DATABASE_URL`, `PORT`, `NODE_ENV`, and future secrets loaded exclusively from `.env`
- `.env` is listed in `.gitignore`

**Files to check:**

- `backend/src/index.ts`
- `backend/src/infrastructure/prismaClient.ts`
- `backend/.gitignore`

##### Files to Modify (Summary)

| File                                                                    | Change                                              |
|-------------------------------------------------------------------------|-----------------------------------------------------|
| `backend/src/index.ts`                                                  | Add `helmet`, restricted `cors`, `express-rate-limit` |
| `backend/src/application/validator.ts`                                  | Extend candidate and resume validation rules        |
| `backend/src/domain/models/Candidate.ts`                                | Domain-level sanitization methods                   |
| `backend/src/application/services/candidateService.ts`                  | Secure file handling, DTO mapping (omit sensitive fields) |
| `backend/src/presentation/controllers/candidateController.ts`           | Input sanitization, response shaping                |
| `backend/src/routes/candidateRoutes.ts`                                 | Apply rate limiter middleware                        |

##### Dependencies to Add

```bash
npm install helmet express-rate-limit
npm install --save-dev @types/express-rate-limit
```

##### Acceptance Criteria

- [ ] All candidate input is validated and sanitized before processing
- [ ] HTTP security headers are present on all API responses (`helmet`)
- [ ] CORS is restricted to configured allowed origins (no wildcard `*` in production)
- [ ] `/candidates` routes are rate-limited (max 100 req / 15 min per IP)
- [ ] Uploaded resume files are validated by content (magic bytes), stored with randomized names outside the web root
- [ ] `filePath` is never returned in any API response
- [ ] No secrets or credentials are hardcoded in any source file
- [ ] `.env` is confirmed to be in `.gitignore`

##### Testing Requirements

**Unit tests** (`backend/src/tests/`):

- Validation rejects invalid `email`, `phone`, and oversized fields
- `filePath` is absent from all candidate/resume API responses
- File type whitelist enforcement rejects disallowed MIME types

**Integration tests:**

- Security headers (`X-Content-Type-Options`, `X-Frame-Options`) are present in responses
- Rate limiting returns HTTP `429` after exceeding the threshold
- CORS rejects requests from disallowed origins

**Coverage target:** >= 90% branches, functions, lines, and statements (per project standards).

##### Non-Functional Requirements

| Requirement       | Detail                                                                                  |
|-------------------|-----------------------------------------------------------------------------------------|
| **Security**      | Mitigate OWASP Top 10: Injection (A03), Security Misconfiguration (A05), Sensitive Data Exposure (A02) |
| **Performance**   | Validation and rate-limit middleware must not add > 5 ms p99 latency overhead           |
| **Compliance**    | PII handling aligned with GDPR: data minimization, purpose limitation                  |
| **Observability** | Log all validation failures and rate-limit breaches — never log raw PII values          |

---

### User

> Crea un archivo prompt_SCRUM-8.md. Incluye el historial de este chat. El formato debe ser un formato valido de md, en sintaxis e identacion.

---

### Assistant

Created this file: `prompt_SCRUM-8.md`.
