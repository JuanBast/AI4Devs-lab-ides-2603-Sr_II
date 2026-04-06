# Backend Implementation Plan: SCRUM-7 Add Candidate (POST /candidates)

## Overview

This plan implements **SCRUM-7**: persist a new candidate’s personal data, education, work experience, and optional resume via **`POST /candidates`** with **`multipart/form-data`**, aligned with the parent epic SCRUM-5 (“Add Candidate to the System”) and the frontend subtask SCRUM-6.

**Architecture:** Domain-Driven Design (DDD) with clear layers—**Presentation** (Express router + controller), **Application** (service + validator), **Domain** (entities + repository interface), **Infrastructure** (Prisma repository + file storage + shared Prisma client). No Prisma usage in the controller or service except through `ICandidateRepository`. All technical artifacts in **English**.

**Source of requirements:** Enriched ticket content captured in `prompt_SCRUM-7.md` (local; Jira was updated with the same substance).

---

## Architecture Context

### Layers

| Layer | Responsibility |
|-------|------------------|
| **Domain** | `Candidate` aggregate root; `Education`, `WorkExperience` (and resume metadata as part of persistence contract); `ICandidateRepository` |
| **Application** | `CandidateService.createCandidate` orchestration; `validator` functions for parsed DTOs |
| **Presentation** | `CandidateController`—parse multipart, map errors to HTTP; `candidateRoutes` + Multer |
| **Infrastructure** | `PrismaCandidateRepository`, `prismaClient` singleton, disk writes under `UPLOAD_DIR` |

### Files (create / modify)

| Path | Action |
|------|--------|
| `backend/package.json` | Add `multer`; add `@types/multer` (dev) |
| `backend/src/index.ts` | Register routes; global error handler aligned with JSON error contract; avoid ad-hoc Prisma export as app entry pattern—use `prismaClient` |
| `backend/src/infrastructure/prismaClient.ts` | **Create**—singleton `PrismaClient` |
| `backend/src/routes/candidateRoutes.ts` | **Create**—`POST /` → controller (mounted at `/candidates`) |
| `backend/src/presentation/controllers/CandidateController.ts` | **Create** |
| `backend/src/application/services/CandidateService.ts` | **Create** |
| `backend/src/application/validator.ts` | **Create**—candidate create validation |
| `backend/src/domain/models/Candidate.ts` | **Create** |
| `backend/src/domain/models/Education.ts` | **Create** |
| `backend/src/domain/models/WorkExperience.ts` | **Create** |
| `backend/src/domain/repositories/ICandidateRepository.ts` | **Create** |
| `backend/src/infrastructure/repositories/PrismaCandidateRepository.ts` | **Create** |
| `backend/src/__tests__/candidate.test.ts` | **Create**—service-level tests per ticket |
| `backend/jest.config.js` | **Modify** if needed—add `coverageThreshold` (90% all metrics) to satisfy NFR; align `collectCoverageFrom` with `src` |
| `.env` / `.env.example` | Document `UPLOAD_DIR`, `DATABASE_URL` |

**Prisma schema:** Already defines `Candidate`, `Education`, `WorkExperience`, `Resume`—no migration expected unless implementation reveals a gap.

**Reference specs:** `ai-specs/specs/backend-standards.mdc` (layers, repository pattern, testing, Git workflow), `backend/prisma/schema.prisma`.

---

## Implementation Steps

### Step 0: Create Feature Branch

- **Action:** Create and switch to a dedicated backend feature branch before any code changes.
- **Branch naming (required by `/plan-backend-ticket`):** `feature/SCRUM-7-backend`  
  - *Note:* Jira NFR also mentions `feature/SCRUM-7-add-candidate-backend`; prefer **`feature/SCRUM-7-backend`** for consistency with `backend-standards.mdc` (“`-backend`” suffix) and other plans (e.g. SCRUM-10).
- **Implementation steps:**
  1. `git checkout main` (or `develop` if that is the integration branch for this repo).
  2. `git pull origin <base-branch>`.
  3. `git checkout -b feature/SCRUM-7-backend`.
  4. `git branch` to verify.
- **References:** `ai-specs/specs/backend-standards.mdc` — Development Workflow / Git Workflow.

---

### Step 1: Add Dependencies and Environment

- **Files:** `backend/package.json`, optional `backend/.env.example`.
- **Action:** Add runtime and type dependencies for multipart handling.
- **Implementation steps:**
  1. Add `multer` to `dependencies`.
  2. Add `@types/multer` to `devDependencies`.
  3. Run `npm install` in `backend/`.
  4. Document `UPLOAD_DIR` (default e.g. `uploads` relative to `backend/` or absolute path); ensure directory is created at startup or on first upload (outside `src/`).
- **Implementation notes:** Do not rely on file extension alone—use Multer `fileFilter` **and** `limits.fileSize` (5 MB); whitelist MIME types for PDF and Word (`application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`).

---

### Step 2: Shared Prisma Client

- **File:** `backend/src/infrastructure/prismaClient.ts`
- **Action:** Export a single shared `PrismaClient` instance (singleton pattern used across repositories).
- **Function signatures:**
  ```typescript
  import { PrismaClient } from '@prisma/client';
  export const prisma: PrismaClient;
  ```
- **Implementation steps:**
  1. Instantiate once; reuse in `PrismaCandidateRepository`.
  2. Update `backend/src/index.ts` to import `prisma` only if still needed for non-feature code; prefer removing duplicate `new PrismaClient()` from `index.ts`.
- **Dependencies:** `@prisma/client`, `dotenv` loaded before first DB use.

---

### Step 3: Domain Models

- **Files:**  
  `backend/src/domain/models/Education.ts`  
  `backend/src/domain/models/WorkExperience.ts`  
  `backend/src/domain/models/Candidate.ts`
- **Action:** Type-safe domain types representing the create aggregate (IDs optional until persisted). Keep models **free of Prisma imports**.
- **Suggested shapes (adjust naming to taste, keep strict typing):**
  ```typescript
  // Education.ts — constructor or factory from plain object
  export class Education { /* institution, title, startDate, endDate? */ }

  // WorkExperience.ts
  export class WorkExperience { /* company, position, description?, startDate, endDate? */ }

  // Candidate.ts — aggregate root holding arrays + optional resume file info for handoff to repository
  export class Candidate { /* firstName, lastName, email, phone?, address?, educations, workExperiences, resumeFile?: { path, mimeType } */ }
  ```
- **Implementation steps:**
  1. Encode invariants that belong in domain (e.g. non-empty required strings) only where they complement validator; avoid duplicating every rule twice—validator handles HTTP-facing messages, domain holds structural typing.
  2. `Candidate` should carry everything `PrismaCandidateRepository.save` needs to create nested `Education`, `WorkExperience`, and optional `Resume` rows in one transaction.
- **Implementation notes:** Ticket requires **at least one** education entry—enforce in validator, not only in DB.

---

### Step 4: Repository Interface

- **File:** `backend/src/domain/repositories/ICandidateRepository.ts`
- **Action:** Define the persistence port for the aggregate.
- **Function signature:**
  ```typescript
  import type { Candidate } from '../models/Candidate';

  export interface ICandidateRepository {
    save(candidate: Candidate): Promise<Candidate>; // returned Candidate should include assigned id (and nested ids if needed)
  }
  ```
- **Implementation notes:** Interface lives in **domain**; implementation in infrastructure.

---

### Step 5: Prisma Repository Implementation

- **File:** `backend/src/infrastructure/repositories/PrismaCandidateRepository.ts`
- **Action:** Implement `ICandidateRepository` using `prisma.$transaction` (or nested `create` with `include`) to insert `Candidate` + related records + optional `Resume`.
- **Implementation steps:**
  1. Map domain `Candidate` to Prisma `create` input (`educations`, `workExperiences`, `resumes` as nested creates).
  2. Map Prisma result back to domain `Candidate` with `id` populated.
  3. Catch Prisma **`P2002`** (unique constraint on `email`) and rethrow a **typed domain/application error** (e.g. `DuplicateEmailError`) that the service maps to **409**.
  4. Do not catch generic errors silently—let service/controller map to 500 where appropriate.
- **Dependencies:** `../prismaClient`, Prisma types from `@prisma/client`.

---

### Step 6: Validation (Application Layer)

- **File:** `backend/src/application/validator.ts`
- **Action:** Validate the **parsed** candidate DTO (after multipart fields are read and JSON arrays decoded).
- **Function signatures (example):**
  ```typescript
  export type ValidationFailure = { message: string; details: string[] };

  export function validateCreateCandidateInput(data: unknown): asserts data is CreateCandidateDto;
  // OR return { valid: false, error, details } pattern if you avoid assertions
  ```
- **Implementation steps:**
  1. **Scalar fields:** `firstName`, `lastName`, `email` required; max lengths per ticket (100, 100, 255); email format regex or lightweight RFC-safe check.
  2. **`phone`**, **`address`:** optional; max 15 / 100.
  3. **`educations`:** required array, **min length 1**; each item: `institution` (max 100), `title` (max 250), `startDate` required ISO date; `endDate` optional; if both dates present, **`endDate` > `startDate`** (strictly after).
  4. **`workExperiences`:** allow empty array or require at least one—ticket only mandates **educations** minimum; if absent, treat as empty array after parse.
  5. **Resume:** if present (handled in controller/multer), type/size already filtered by Multer; validator may assert metadata present when file was uploaded.
  6. On failure, produce **`details: string[]`** with **English** messages for each rule violation.
- **Multipart parsing note:** With `multipart/form-data`, `educations` and `workExperiences` are typically sent as **JSON strings** in text fields (e.g. field `educations` = `'[{"institution":"..."}]'`). Controller must `JSON.parse` with try/catch → **400** with clear `details` if invalid JSON.

---

### Step 7: Candidate Service

- **File:** `backend/src/application/services/CandidateService.ts`
- **Action:** Orchestrate validation, optional file persistence (path already set by Multer `diskStorage` destination), and repository `save`.
- **Function signature:**
  ```typescript
  export class CandidateService {
    constructor(private readonly candidateRepository: ICandidateRepository) {}
    async createCandidate(rawInput: CreateCandidateMultipartPayload): Promise<CreatedCandidateView>;
  }
  ```
- **Implementation steps:**
  1. Parse/normalize input (or receive pre-parsed DTO from controller—keep controller thin).
  2. Run validator; on validation errors, throw a **typed error** (e.g. `ValidationError` with `details: string[]`) for the controller to map to **400**.
  3. Build domain `Candidate` from DTO + uploaded file path/type.
  4. Call `this.candidateRepository.save(candidate)`.
  5. Map `DuplicateEmailError` to a distinct outcome for **409**.
  6. Return a view model matching **201** body: `{ id, firstName, lastName, email, phone, address }` (phone/address nullable/undefined per schema).
- **Dependencies:** `ICandidateRepository`, validator, domain models.
- **Implementation notes:** **No** direct `PrismaClient` usage in this class. Inject repository in constructor for tests (DIP).

---

### Step 8: Candidate Controller

- **File:** `backend/src/presentation/controllers/CandidateController.ts`
- **Action:** Thin HTTP adapter for `POST /candidates`.
- **Function signature:**
  ```typescript
  export class CandidateController {
    constructor(private readonly candidateService: CandidateService) {}
    create = async (req: Request, res: Response, next: NextFunction): Promise<void>;
  }
  ```
- **Implementation steps:**
  1. Read `req.body` fields from Multer-populated body; parse `educations` / `workExperiences` JSON strings.
  2. Multer errors (file too large, wrong MIME) → **400** with `{ error, details }`.
  3. Delegate to `candidateService.createCandidate`.
  4. Map outcomes:
     - Success → **201** `{ data: { id, firstName, lastName, email, phone, address } }`.
     - Validation → **400** `{ error: string, details: string[] }`.
     - Duplicate email → **409** `{ error: "Email already registered" }`.
     - Unexpected → **500** `{ error: "Internal server error" }` (no stack leak).
- **Dependencies:** Express types, `CandidateService`.

---

### Step 9: Routes and Multer Configuration

- **File:** `backend/src/routes/candidateRoutes.ts`
- **Action:** Define router and Multer middleware for field `resume` (or name agreed with SCRUM-6—document in API spec).
- **Implementation steps:**
  1. `const router = Router();`
  2. Configure `multer.diskStorage` with `destination`/`filename` under `process.env.UPLOAD_DIR`.
  3. `upload.single('resume')` (or ticket-agreed field name).
  4. `router.post('/', upload.single('resume'), (req, res, next) => controller.create(req, res, next));`
  5. Export `router`.
- **Implementation notes:** Ensure `express.urlencoded({ extended: true })` if needed for non-file fields alongside Multer (often `extended: true` for nested-like flat fields).

---

### Step 10: Wire Application in `index.ts`

- **File:** `backend/src/index.ts`
- **Action:** Mount candidate routes and improve global error handler.
- **Implementation steps:**
  1. `app.use(express.json())` — optional for other future JSON routes; **multipart route** must use Multer, not JSON body parser for the same request.
  2. `app.use('/candidates', candidateRoutes);`
  3. Replace generic “Something broke!” with JSON **500** shape when error is not already handled (see section 7).
  4. Remove unused `PrismaClient` construction if fully moved to `prismaClient.ts`.
- **CORS:** If SCRUM-6 serves the UI from another origin, add `cors` package and configure allowed origins—only if required by integration (not explicitly in SCRUM-7; verify with frontend port).

---

### Step 11: Unit Tests

- **File:** `backend/src/__tests__/candidate.test.ts`
- **Action:** Test **`CandidateService`** with **mocked `ICandidateRepository`** (per ticket: no real DB in these unit tests).
- **Test cases:**
  1. **Happy path:** mock `save` to resolve with candidate including `id`; call `createCandidate` with valid payload (+ optional file metadata); assert result shape for 201 mapping (or assert service return object).
  2. **Missing required fields:** omit `firstName`, `email`, or `educations` / empty educations; expect validation error with `details` containing expected messages.
  3. **Duplicate email:** mock `save` to reject with Prisma-like `P2002` **or** throw `DuplicateEmailError` from repository; service should surface 409 mapping (test via thrown error type or return contract).
  4. **Invalid file:** simulate Multer rejection at controller level **or** service receiving invalid file meta—ticket asks for rejection before DB; prefer **controller/Multer tests** or a small dedicated test for `fileFilter` if extracted.
  5. **Date validation:** `endDate` before `startDate` on education or work experience → validation failure / 400 path.
  6. **Invalid JSON** for `educations` string → 400 with descriptive details (controller or parser utility tests).
- **Implementation notes:** Use Jest mocks; follow AAA; English `describe`/`it` strings. Add `coverageThreshold` in Jest if missing to meet **90%** NFR.

---

### Step 12: Quality Gates

- **Action:** Before PR: `npm run build`, `npm test`, ESLint with zero errors, coverage ≥ 90% if thresholds configured.

---

### Step 13: Update Technical Documentation

- **Action:** Align published specs with implemented behavior (mandatory before closing the ticket).
- **Implementation steps:**
  1. **`ai-specs/specs/api-spec.yml`:** Change `POST /candidates` to **`multipart/form-data`**; document text fields and file part; add **409** response; align success schema with `{ data: { id, firstName, lastName, email, phone, address } }`; document 400 body `{ error, details }`.
  2. **`ai-specs/specs/data-model.md`:** Reconcile validation bullets with ticket rules (e.g. “at least one education”, resume file rules, `UPLOAD_DIR`) if they contradict current prose (e.g. “letters only” for names vs ticket “max 100 chars”).
  3. **`documentation-standards.mdc`:** Only touch if global doc process changed (unlikely).
- **All documentation in English.**

---

## Implementation Order

1. Step 0: Create feature branch `feature/SCRUM-7-backend`
2. Step 1: Dependencies and environment (`multer`, `UPLOAD_DIR`)
3. Step 2: `prismaClient.ts` and clean up `index.ts` Prisma usage
4. Step 3: Domain models (`Education`, `WorkExperience`, `Candidate`)
5. Step 4: `ICandidateRepository`
6. Step 5: `PrismaCandidateRepository`
7. Step 6: `validator.ts` (create candidate)
8. Step 7: `CandidateService`
9. Step 8: `CandidateController`
10. Step 9: `candidateRoutes` + Multer
11. Step 10: Wire `index.ts`
12. Step 11: `candidate.test.ts` (+ Jest coverage config if needed)
13. Step 12: Quality gates
14. Step 13: Update `api-spec.yml`, `data-model.md` as needed

---

## Testing Checklist

- [ ] `POST /candidates` returns **201** with `data` object containing `id`, `firstName`, `lastName`, `email`, `phone`, `address` when payload is valid
- [ ] **400** when required fields missing, lengths exceeded, bad email, invalid dates, or `educations` empty
- [ ] **409** when email already exists (`P2002` / unique)
- [ ] Resume optional; when provided, row in `Resume` with `filePath`, `fileType`, `uploadDate`
- [ ] Reject non-PDF/DOC/DOCX (MIME + filter) and files **> 5 MB**
- [ ] No Prisma in controller/service—only repository implementation
- [ ] `npm test` passes; coverage meets **90%** if enforced
- [ ] `npm run build` and ESLint clean

---

## Error Response Format

| HTTP | Body | When |
|------|------|------|
| **400** | `{ "error": string, "details": string[] }` | Validation failure, bad JSON in multipart fields, Multer file rejection |
| **409** | `{ "error": "Email already registered" }` | Unique constraint on `email` |
| **500** | `{ "error": "Internal server error" }` | Unexpected errors (log server-side, do not expose stack) |

**201 success:**

```json
{
  "data": {
    "id": 1,
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "phone": "string or null",
    "address": "string or null"
  }
}
```

---

## Partial Update Support

**Not applicable.** This ticket implements **resource creation** (`POST`), not `PATCH`/`PUT`.

---

## Dependencies

| Item | Purpose |
|------|---------|
| `multer` | `multipart/form-data` parsing and file upload |
| `@types/multer` | TypeScript types |
| `@prisma/client` | Already present—persistence |
| `express` | Already present—HTTP |
| `dotenv` | Already present—`UPLOAD_DIR`, `DATABASE_URL` |

Optional later: `cors` for cross-origin frontend during SCRUM-6 integration.

---

## Notes

- **Branch name:** Use `feature/SCRUM-7-backend` per project planning convention; aligns with `backend-standards.mdc` backend suffix rule.
- **Multipart + arrays:** Standard practice is JSON-encoded strings for `educations` and `workExperiences`; coordinate field names with SCRUM-6.
- **MIME vs extension:** Multer `fileFilter` must inspect `file.mimetype`; do not use extension alone.
- **Upload directory:** Must be outside `src/` (e.g. `backend/uploads/`); gitignore uploaded binaries; configurable via `UPLOAD_DIR`.
- **Strict TypeScript:** No `any`; type `Request`/`Response` handlers and DTOs explicitly.
- **`jest.config.js`:** Current file may lack `coverageThreshold`; add it to satisfy the ticket NFR if not already defined elsewhere.

---

## Next Steps After Implementation

- Manual or integration test against real PostgreSQL (optional follow-up: supertest route tests).
- Confirm SCRUM-6 form field names and file input name match the API.
- Open PR with English description; link SCRUM-7.

---

## Implementation Verification

- [ ] **Code quality:** ESLint clean, strict TS, English-only identifiers/messages
- [ ] **Functionality:** All acceptance criteria in `prompt_SCRUM-7.md` satisfied
- [ ] **Testing:** Unit tests for service + critical controller/Multer paths; coverage ≥ 90% if configured
- [ ] **Integration:** Frontend can call `POST /candidates` with multipart (CORS if needed)
- [ ] **Documentation:** `api-spec.yml` and `data-model.md` updated (Step 13)
