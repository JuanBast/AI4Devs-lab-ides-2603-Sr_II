# Backend Implementation Plan: SCRUM-8 Candidate Data Security & Privacy

## Overview

This plan implements **SCRUM-8**: harden the LTI ATS backend so candidate PII and resume assets are protected against unauthorized access, injection, misconfiguration, and leakage. Work spans **input validation and sanitization**, **HTTP security headers**, **restricted CORS**, **rate limiting** on candidate routes, **secure file upload handling** (magic-byte validation, storage layout, opaque identifiers), **response shaping** (no `filePath`, data minimization on lists), and **environment/config hygiene**.

**Architecture:** Domain-Driven Design (DDD) with **Presentation** (Express, middleware, controllers), **Application** (services, validators), **Domain** (models, optional sanitization helpers), **Infrastructure** (Prisma, filesystem). Security controls at the edge (helmet, CORS, rate limit) live in **`index.ts`** and **`candidateRoutes.ts`**; business-facing rules stay in validators and services. All code, comments, errors, and logs directed at operators must be **English**; never log raw PII values.

**Prerequisite:** The ticket assumes candidate APIs exist: `POST /candidates`, `PUT /candidates/:id`, `POST /candidates/:id/resume`. If the branch only has the minimal `backend/src/index.ts` stub, complete or merge **SCRUM-7** (or equivalent) first, then apply this plan on top so every step has real handlers to attach to.

**Source of requirements:** Jira **SCRUM-8** (enhanced description).

---

## Architecture Context

### Layers

| Layer | Responsibility |
|-------|----------------|
| **Presentation** | Register `helmet`, `cors`, body parsers; mount candidate router with rate limiter; controller sanitization / DTO mapping; strip internal fields from JSON |
| **Application** | Extended validation rules; service orchestration for uploads; map entities to public DTOs (no `filePath`) |
| **Domain** | Optional `Candidate` (or dedicated) sanitization helpers—keep framework-agnostic; no Express types |
| **Infrastructure** | Disk storage under configurable directory outside static hosting; UUID filenames; magic-byte verification before accepting file |

### Files to create or modify (target state)

| Path | Action |
|------|--------|
| `backend/package.json` | Add `helmet`, `cors`, `express-rate-limit`, `file-type` (or equivalent for magic-byte sniffing); add `@types/cors` if needed; verify whether `@types/express-rate-limit` is required (many versions ship types) |
| `backend/src/index.ts` | `dotenv` first; `helmet` with CSP/HSTS suitable for JSON API; `cors` from `ALLOWED_ORIGINS`; `express.json` / urlencoded limits; mount candidate routes; keep global error handler consistent with project JSON error contract |
| `backend/src/routes/candidateRoutes.ts` | Apply `express-rate-limit` to all routes under `/candidates` (100 req / 15 min / IP) |
| `backend/src/application/validator.ts` | Rules per ticket field table; shared helpers for email normalization, name charset, Spanish phone, address length, resume MIME whitelist + size (10 MB) |
| `backend/src/domain/models/Candidate.ts` | Static or instance methods for HTML stripping / normalization where domain should own invariants (avoid duplicating every message string—validator owns user-facing validation copy) |
| `backend/src/application/services/candidateService.ts` | After buffer read: `fileType.fromBuffer()` (or similar); reject mismatch with declared type; write with `randomUUID()` filename; return DTOs without `filePath` |
| `backend/src/presentation/controllers/CandidateController.ts` | Ensure inputs passed through validator/sanitizer pipeline; map responses to public shape (`resumeId` or `id` only for resume, never path) |
| `backend/.env.example` | Document `ALLOWED_ORIGINS` (comma-separated), `UPLOAD_DIR`, existing `DATABASE_URL`, `PORT`, `NODE_ENV` |
| `backend/.gitignore` | Confirm `.env` present |
| New test files | Unit tests for validators and DTO mapping; integration/supertest for headers, CORS, 429 |

**Reference specs:** `ai-specs/specs/backend-standards.mdc` (layers, validation, CORS, security, testing ≥90%, Git workflow), `ai-specs/specs/api-spec.yml` (align list/detail schemas with “minimum fields” rule where applicable).

---

## Implementation Steps

### Step 0: Create Feature Branch

- **Action:** Create and switch to a dedicated backend feature branch before any code changes.
- **Branch naming (required):** `feature/SCRUM-8-backend`  
  Do not implement on a generic `feature/SCRUM-8` branch if the team uses `-backend` to separate concerns.
- **Implementation steps:**
  1. `git checkout main` (or `develop` if that is the integration branch).
  2. `git pull origin <base-branch>`.
  3. Merge or rebase prerequisite candidate feature branch if SCRUM-7 is not yet on the base.
  4. `git checkout -b feature/SCRUM-8-backend`.
  5. `git branch` to verify.
- **References:** `ai-specs/specs/backend-standards.mdc` — Development Workflow / Git Workflow.

---

### Step 1: Dependencies and environment

- **Files:** `backend/package.json`, `backend/.env.example`
- **Action:** Add security-related dependencies and document env vars.
- **Implementation steps:**
  1. Install: `helmet`, `cors`, `express-rate-limit`, `file-type` (v16+ is ESM—if the project stays CJS, use a compatible major or `file-type`’s documented CJS interop, or an alternative such as reading magic bytes with a small typed helper for PDF/DOCX only).
  2. Add `@types/cors` to devDependencies if TypeScript complains.
  3. Document `ALLOWED_ORIGINS` (e.g. `http://localhost:3000,http://localhost:5173`)—parse split-by-comma in code, trim whitespace.
  4. Confirm `UPLOAD_DIR` points to a directory **outside** any Express `static` root.
- **Implementation notes:** Ticket NFR: validation + rate-limit overhead target &lt; 5 ms p99—avoid heavy sync work in hot path; file sniffing is only on upload endpoints.

---

### Step 2: Global security middleware (`index.ts`)

- **File:** `backend/src/index.ts`
- **Action:** Apply `helmet()` and restricted `cors()` before routes.
- **Function signatures (illustrative):**
  ```typescript
  import helmet from 'helmet';
  import cors from 'cors';

  function parseAllowedOrigins(raw: string | undefined): string[] { ... }

  app.use(helmet({
    contentSecurityPolicy: { /* directives appropriate for API JSON responses */ },
    hsts: process.env.NODE_ENV === 'production'
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
  }));

  app.use(cors({
    origin: (origin, callback) => { /* allowlist logic; reject * in production */ },
    credentials: true,
  }));
  ```
- **Implementation steps:**
  1. Load `dotenv` before reading `process.env`.
  2. Enforce headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security` (production), `Content-Security-Policy`—`helmet` defaults cover most; tune CSP so Swagger UI still works if mounted.
  3. **Production:** if `ALLOWED_ORIGINS` is missing or empty, fail fast at startup or default to same-origin only—**never** `origin: '*'`.
  4. **Development:** allow configurable localhost origins explicitly.
- **Dependencies:** `helmet`, `cors`

---

### Step 3: Rate limiting on `/candidates`

- **File:** `backend/src/routes/candidateRoutes.ts` (preferred) or `index.ts` if router not split yet
- **Action:** Limit abuse on all candidate routes.
- **Function signature (illustrative):**
  ```typescript
  import rateLimit from 'express-rate-limit';

  export const candidateRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ success: false, error: { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' } });
    },
  });
  ```
- **Implementation steps:**
  1. `router.use(candidateRateLimiter)` before defining `POST`, `PUT`, `GET`, etc.
  2. Log rate-limit events with **IP + route + timestamp** only—no PII in log lines.
- **Implementation notes:** Align JSON error shape with `backend-standards.mdc` error response format.

---

### Step 4: Validation and sanitization (`validator.ts` + domain helpers)

- **Files:** `backend/src/application/validator.ts`, `backend/src/domain/models/Candidate.ts`
- **Action:** Implement ticket rules for all candidate-related inputs.

| Field | Rule |
|-------|------|
| `firstName` / `lastName` | Required, 2–100 chars, letters only (define allowed Unicode/locale if needed), strip HTML |
| `email` | Required, valid format, normalize to lowercase, uniqueness enforced at service/DB |
| `phone` | Optional, Spanish pattern `(6\|7\|9)XXXXXXXX` (9 digits after leading 6/7/9—confirm exact regex with product) |
| `address` | Optional, max 100 chars, strip HTML |
| Resume | Whitelist MIME `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`; max **10 MB** |

- **Implementation steps:**
  1. Add pure functions e.g. `validateCreateCandidatePayload`, `validateUpdateCandidatePayload`, `validateResumeUpload` returning typed errors for 400 responses.
  2. HTML strip: use a small sanitizer (strip tags) or domain helper—avoid allowing script-bearing strings into DB.
  3. **TDD:** write failing tests first for invalid email, phone, oversized fields, disallowed MIME.
- **Dependencies:** No unsafe `eval`; prefer allowlists.

---

### Step 5: Secure resume handling (`candidateService.ts`)

- **File:** `backend/src/application/services/candidateService.ts`
- **Action:** Validate file **content** with magic bytes; store with random name; never return `filePath`.
- **Implementation steps:**
  1. Read upload into memory or temp stream bounded by 10 MB (Multer `limits` + validator).
  2. Run magic-byte detection; must match whitelist for PDF/DOCX.
  3. Persist file as `{uuid}.{ext}` under `UPLOAD_DIR`; store only relative or absolute path in DB **internally**—never serialize to client.
  4. Public API returns e.g. `{ resumeId: number, fileType: string, uploadDate: string }` (ticket: opaque reference—numeric `Resume.id` is acceptable if `filePath` is omitted).
  5. On mismatch between `Content-Type` and sniffed type, reject with 400.
- **Implementation notes:** GDPR-oriented data minimization: do not add new PII fields to responses.

---

### Step 6: Controller response shaping (`CandidateController.ts`)

- **File:** `backend/src/presentation/controllers/CandidateController.ts`
- **Action:** Sanitize inbound delegated to validator/service; outbound strip `filePath` everywhere.
- **Implementation steps:**
  1. Add a `toPublicCandidate(candidate)` / `toPublicResume(resume)` mapper layer (could live in service)—**delete** or omit `filePath` key.
  2. List endpoints (`GET /candidates`): return minimal fields (e.g. `id`, `firstName`, `lastName`, `email` only—confirm with `api-spec.yml` and adjust spec in documentation step).
  3. Ensure no `console.log` of full request bodies in production paths.

---

### Step 7: Environment and secrets audit

- **Files:** `backend/src/index.ts`, `backend/src/infrastructure/prismaClient.ts`, `backend/.gitignore`
- **Action:** Confirm no secrets or PII in source; config from `.env` only.
- **Implementation steps:**
  1. Grep for hardcoded URLs, keys, or sample passwords—remove.
  2. Ensure `.env` is in `.gitignore`; `.env.example` has placeholders only.
  3. Optional: validate required env vars at startup (`DATABASE_URL`, `PORT`, and in production `ALLOWED_ORIGINS`).

---

### Step 8: Unit tests

- **Files:** e.g. `backend/src/application/__tests__/validator.candidate-security.test.ts`, `backend/src/application/services/__tests__/candidateService.resume-security.test.ts` (paths aligned with existing project convention)
- **Action:** Meet ticket testing requirements and 90% coverage threshold.
- **Categories:**
  1. **Successful cases:** valid payload passes; valid PDF/DOCX by magic bytes accepted.
  2. **Validation errors:** bad email, phone, oversize name/address, wrong MIME, file too large.
  3. **Response contract:** every test that hits serialization asserts `filePath` is absent (use `expect(obj).not.toHaveProperty('filePath')` or equivalent).
  4. **Edge cases:** missing optional fields; update partial payloads if `PUT` supports partial (see Partial Update section).

---

### Step 9: Integration tests

- **Files:** e.g. `backend/src/tests/candidate-security.integration.test.ts` or `backend/src/__tests__/integration/...`
- **Action:** Supertest against `app` export (avoid listening on real port in tests if project pattern uses `app` only).
- **Cases:**
  1. **Security headers:** `GET` or `POST` any route → assert `x-content-type-options`, `x-frame-options` (and others as configured).
  2. **Rate limiting:** mock or shorten window in test via `rateLimit` options / env—fire &gt;100 requests in window, expect **429**.
  3. **CORS:** request with `Origin: https://evil.example` disallowed → expect no `Access-Control-Allow-Origin` match or appropriate failure for preflight.
- **Implementation notes:** Use a dedicated test `ALLOWED_ORIGINS` in `jest` setup so CI is deterministic.

---

### Step 10: Update technical documentation

- **Action:** Keep specs consistent with behavior (mandatory before considering work complete).
- **Implementation steps:**
  1. **`ai-specs/specs/api-spec.yml`:** Ensure `Resume` / candidate schemas **do not** include `filePath`; document rate limit and security headers in description or `info` if the team documents operational behavior there; align list candidate schema with minimized fields.
  2. **`ai-specs/specs/backend-standards.mdc`:** If new global patterns are introduced (e.g. `ALLOWED_ORIGINS` convention), add a short subsection under Security or CORS.
  3. **`ai-specs/specs/data-model.md`:** If it documents API exposure, state that `filePath` is persistence-only, not API-facing.
  4. All edits in **English**.
- **References:** `ai-specs/specs/documentation-standards.mdc`

---

## Implementation Order

1. Step 0: Create Feature Branch  
2. Step 1: Dependencies and environment  
3. Step 2: Global security middleware (`index.ts`)  
4. Step 3: Rate limiting on `/candidates`  
5. Step 4: Validation and sanitization  
6. Step 5: Secure resume handling  
7. Step 6: Controller response shaping  
8. Step 7: Environment and secrets audit  
9. Step 8: Unit tests  
10. Step 9: Integration tests  
11. Step 10: Update technical documentation  

---

## Testing Checklist

- [ ] Invalid `email`, `phone`, and oversize fields rejected with 400 and structured error body  
- [ ] `filePath` never appears in any JSON response (grep tests + manual spot-check)  
- [ ] Disallowed resume MIME and magic-byte mismatch rejected  
- [ ] Files saved under `UPLOAD_DIR` with UUID name; not web-served as static files  
- [ ] `helmet` security headers present on responses  
- [ ] More than 100 requests per 15 minutes per IP to `/candidates/*` yields 429  
- [ ] Disallowed CORS origin rejected in production configuration  
- [ ] `npm test` passes; coverage ≥ 90% branches, functions, lines, statements  
- [ ] Logs on validation failure / rate limit do not contain raw PII  

---

## Error Response Format

Align with `backend-standards.mdc`:

```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": []
  }
}
```

| HTTP | Code / scenario |
|------|------------------|
| 400 | `VALIDATION_ERROR`, malformed input, MIME/size violations, magic-byte mismatch |
| 404 | `NOT_FOUND` — candidate or resume target missing |
| 429 | `RATE_LIMIT_EXCEEDED` |
| 500 | Generic server error; no stack traces or paths leaked to client in production |

---

## Partial Update Support

For **`PUT /candidates/:id`** (if implemented as partial update):

- Apply validation only to fields present in the body; still run sanitization on provided string fields.
- Do not clear unspecified fields unless the API contract explicitly uses `PUT` as full replacement—document the chosen semantics in `api-spec.yml` and tests.

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `helmet` | Security headers |
| `cors` | Allowlist origins |
| `express-rate-limit` | Per-IP throttling |
| `file-type` (or equivalent) | Magic-byte validation |
| `multer` | (If not already) multipart handling for resume—align limits with 10 MB ticket requirement |
| `jest`, `supertest` | Tests (existing) |

---

## Notes

- **OWASP alignment:** Injection (A03), misconfiguration (A05), sensitive data exposure (A02).  
- **Observability:** Log validation and rate-limit events without PII; use error codes and field names in logs if needed, not user-supplied values.  
- **Performance NFR:** Keep middleware chain light; profile if necessary.  
- **Naming:** Prefer **PascalCase** controller file `CandidateController.ts` to match class name and SCRUM-7 plan unless the repo already standardized on a different casing—stay consistent within the branch.  
- **Spanish phone regex:** Confirm with PM whether leading `+34` or spaces are accepted; ticket shows a strict digit pattern.

---

## Next Steps After Implementation

- Run full test suite and lint in CI.  
- Security smoke test on staging with real `ALLOWED_ORIGINS`.  
- Coordinate with frontend for CORS origin list and resume download flow (if downloads use signed URLs or separate authenticated endpoint—out of scope unless specified).  

---

## Implementation Verification

- [ ] Layering respected: no Prisma in controllers; validators testable without HTTP  
- [ ] TypeScript strict: no `any` for public DTOs  
- [ ] Acceptance criteria from Jira SCRUM-8 all traceable to code or tests  
- [ ] Documentation updates completed (`api-spec.yml`, `data-model.md` / standards as needed)  
- [ ] Branch ready for PR with English commit messages  
