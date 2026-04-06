# Chat History — SCRUM-7 Ticket Enrichment

## Context

Ticket: **SCRUM-7** — Backend subtask of SCRUM-5 ("Añadir Candidato al Sistema")  
Date: 2026-04-05  
Branch: `solved-lab-ides-JFB`

---

## Conversation

### User

```
/enrich-us SCRUM-7
```

> Please analyze and fix the Jira ticket: SCRUM-7.

---

### Assistant

Fetched ticket **SCRUM-7** from Jira. Original content:

- **Summary:** `Backend - Desarrollar el backend necesario para procesar la información ingresada en el formulario.`
- **Description:** `Desarrollar el backend necesario para procesar la información ingresada en el formulario.`
- **Status:** Tareas por hacer
- **Type:** Subtask
- **Parent:** SCRUM-5 — "Añadir Candidato al Sistema"

Also fetched sibling ticket **SCRUM-6** (frontend subtask) for cross-reference context, read `ai-specs/specs/backend-standards.mdc`, `backend/src/index.ts`, and `backend/prisma/schema.prisma` to understand the existing architecture.

**Assessment:** The ticket lacked all technical detail required for autonomous developer execution — no endpoint spec, no file list, no acceptance criteria, no testing requirements, no non-functional requirements, and the description was in Spanish.

Updated SCRUM-7 in Jira with the structure below, marking original and enhanced sections with `h2` tags. Summary was also translated to English.

---

### Enhanced Ticket Content Written to Jira

#### [original]

Desarrollar el backend necesario para procesar la información ingresada en el formulario.

---

#### [enhanced]

##### User Story

As a recruiter, I want the system to persist a new candidate's personal information, education, work experience, and resume via a REST API so that the data is stored in the database and available for future hiring processes.

---

##### Context

The `Candidate`, `Education`, `WorkExperience`, and `Resume` models are already defined in `backend/prisma/schema.prisma`. The backend is a Node.js + TypeScript + Express app using Prisma ORM with PostgreSQL. The entry point is `backend/src/index.ts`, which currently has no domain structure.

This task must be completed before (or in parallel with) SCRUM-6 (frontend form). It implements the `POST /candidates` endpoint that the frontend will call.

---

##### Endpoint Specification

```
POST /candidates
Content-Type: multipart/form-data
```

**Request body (multipart fields + optional file):**

```json
{
  "firstName": "string",           // required, max 100 chars
  "lastName": "string",            // required, max 100 chars
  "email": "string",               // required, valid email, max 255 chars, unique
  "phone": "string | undefined",   // optional, max 15 chars
  "address": "string | undefined", // optional, max 100 chars
  "educations": [
    {
      "institution": "string",      // required, max 100 chars
      "title": "string",            // required, max 250 chars
      "startDate": "ISO 8601",      // required
      "endDate": "ISO 8601 | undefined" // optional, must be after startDate
    }
  ],
  "workExperiences": [
    {
      "company": "string",          // required, max 100 chars
      "position": "string",         // required, max 100 chars
      "description": "string | undefined", // optional, max 200 chars
      "startDate": "ISO 8601",      // required
      "endDate": "ISO 8601 | undefined"    // optional, must be after startDate
    }
  ],
  "resume": "File | undefined"     // optional, .pdf/.doc/.docx, max 5 MB
}
```

**Responses:**

| Status | Body | Condition |
|---|---|---|
| `201 Created` | `{ data: { id, firstName, lastName, email, phone, address } }` | Success |
| `400 Bad Request` | `{ error: string, details: string[] }` | Validation failure |
| `409 Conflict` | `{ error: "Email already registered" }` | Duplicate email |
| `500 Internal Server Error` | `{ error: "Internal server error" }` | Unexpected error |

---

##### Files to Create / Modify

| File | Action | Purpose |
|---|---|---|
| `backend/src/index.ts` | Modify | Register `POST /candidates` route; add `multer` middleware |
| `backend/src/routes/candidateRoutes.ts` | Create | Express router for candidate endpoints |
| `backend/src/presentation/controllers/CandidateController.ts` | Create | HTTP handler — parse request, call service, return response |
| `backend/src/application/services/CandidateService.ts` | Create | Orchestrates validation, file storage, and persistence |
| `backend/src/application/validator.ts` | Create | Input validation logic (reusable across controllers) |
| `backend/src/domain/models/Candidate.ts` | Create | Domain entity — aggregate root with `Education[]`, `WorkExperience[]`, `Resume[]` |
| `backend/src/domain/models/Education.ts` | Create | Domain entity |
| `backend/src/domain/models/WorkExperience.ts` | Create | Domain entity |
| `backend/src/domain/repositories/ICandidateRepository.ts` | Create | Repository interface: `save(candidate: Candidate): Promise<Candidate>` |
| `backend/src/infrastructure/repositories/PrismaCandidateRepository.ts` | Create | Prisma implementation of `ICandidateRepository` |
| `backend/src/infrastructure/prismaClient.ts` | Create | Shared Prisma client singleton |
| `backend/src/__tests__/candidate.test.ts` | Create | Unit tests for `CandidateService` |

---

##### Acceptance Criteria

1. `POST /candidates` returns `201` with the created candidate data when all required fields are valid
2. `POST /candidates` returns `400` when required fields are missing or constraints are violated (e.g. email format, max lengths)
3. `POST /candidates` returns `409` when the email is already registered
4. At least one `education` entry is required; the request is rejected with `400` if absent
5. If a resume file is provided, it is stored on disk and its path/type recorded in the `Resume` table
6. The endpoint rejects files that are not `.pdf`, `.doc`, or `.docx`, or that exceed 5 MB
7. All database operations use `PrismaCandidateRepository` via `ICandidateRepository` (no direct Prisma calls in the service or controller)
8. No request data is trusted without validation before it reaches the service layer
9. `endDate` must be strictly after `startDate` when both are provided (for both `Education` and `WorkExperience`)

---

##### Testing Requirements

File: `backend/src/__tests__/candidate.test.ts`

- **Happy path:** mock `ICandidateRepository.save` → call `CandidateService.createCandidate()` with valid data → assert `201` response shape
- **Missing required fields:** omit `firstName`, `email`, or `educations` → assert `400` with descriptive `details`
- **Duplicate email:** mock repository to throw a unique-constraint error → assert `409` response
- **Invalid file type:** pass a `.exe` file → assert `400` rejection before hitting the DB
- **Date validation:** `endDate` before `startDate` → assert `400`

---

##### Non-Functional Requirements

- All code, variable names, comments, and test descriptions must be in **English**
- No `any` types — full TypeScript strict-mode compliance
- Coverage threshold: **90%** for branches, functions, lines, and statements (per `jest.config.js`)
- Repository interface must be injected into the service (Dependency Inversion Principle)
- `multer` must be configured with file-size and MIME-type filters; do not rely solely on file-extension checks
- Uploaded files must be stored outside the `src/` tree (e.g., `backend/uploads/`); path configurable via `UPLOAD_DIR` environment variable
- ESLint must pass with zero errors before the PR is opened
- TypeScript compilation must produce zero errors
- Git branch: `feature/SCRUM-7-add-candidate-backend`

---

### User

> Crea un archivo prompt_SCRUM-7.md. Incluye el historial de este chat. El formato debe ser md correcto en sintaxis e identación.

---

### Assistant

Created this file: `prompt_SCRUM-7.md`
