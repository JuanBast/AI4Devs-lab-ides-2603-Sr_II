# Chat History — SCRUM-6 Ticket Enrichment

## Session Info

- **Date:** 2026-04-05
- **Ticket:** [SCRUM-6](https://juanfb.atlassian.net/rest/api/2/issue/10038)
- **Task:** Enrich and update Jira ticket SCRUM-6 following product best practices

---

## Conversation

### User

```
/enrich-us SCRUM-6
```

> Please analyze and fix the Jira ticket: SCRUM-6.

---

### Assistant

Fetched SCRUM-6 from Jira. Original ticket details:

- **Summary:** "Frontend - Implementar la interfaz de usuario para el formulario de añadir candidato."
- **Description:** "Implementar la interfaz de usuario para el formulario de añadir candidato."
- **Status:** Tareas por hacer (To Do)
- **Type:** Subtask
- **Priority:** Medium
- **Assignee:** Unassigned

Explored codebase context:

- Read `ai-specs/specs/frontend-standards.mdc`
- Read `ai-specs/specs/base-standards.mdc`
- Read `ai-specs/specs/backend-standards.mdc`
- Read `frontend/src/App.tsx`
- Read `backend/src/index.ts`
- Read `backend/prisma/schema.prisma`
- Listed all frontend source files under `frontend/src/`
- Retrieved available Jira transitions for SCRUM-6

**Problems identified in the original ticket:**

1. Written entirely in Spanish — violates the project's English-only standard.
2. Extremely vague — no field definitions, no endpoint spec, no file paths, no acceptance criteria, no testing requirements.
3. Not actionable as a development task without significant additional research.

**Enhanced ticket written and pushed to Jira**, structured as follows:

---

#### Enhanced Ticket Content

##### User Story

As a recruiter, I want to access a form to add a new candidate to the system so that their personal information, education, and work experience are registered in the ATS for future hiring processes.

---

##### Context

The `Candidate` model already exists in the Prisma schema (`backend/prisma/schema.prisma`) with relations: `Education[]`, `WorkExperience[]`, `Resume[]`, and `Application[]`. The backend `POST /candidates` endpoint must be created as a prerequisite or parallel task. The frontend is a React 18 + TypeScript app using React Bootstrap 5 and Axios, located in `frontend/src/`.

---

##### Form Fields

**Personal Information (top-level)**

| Field       | Type  | Required | Constraints                       |
|-------------|-------|----------|-----------------------------------|
| `firstName` | text  | yes      | max 100 chars                     |
| `lastName`  | text  | yes      | max 100 chars                     |
| `email`     | email | yes      | valid email, max 255 chars, unique |
| `phone`     | text  | no       | max 15 chars                      |
| `address`   | text  | no       | max 100 chars                     |

**Education (repeatable section — at least one entry required)**

| Field         | Type | Required | Constraints                              |
|---------------|------|----------|------------------------------------------|
| `institution` | text | yes      | max 100 chars                            |
| `title`       | text | yes      | max 250 chars                            |
| `startDate`   | date | yes      | —                                        |
| `endDate`     | date | no       | must be after `startDate` if set         |

**Work Experience (repeatable section — optional)**

| Field         | Type | Required | Constraints                              |
|---------------|------|----------|------------------------------------------|
| `company`     | text | yes      | max 100 chars                            |
| `position`    | text | yes      | max 100 chars                            |
| `description` | text | no       | max 200 chars                            |
| `startDate`   | date | yes      | —                                        |
| `endDate`     | date | no       | must be after `startDate` if set         |

**Resume Upload (optional)**

- File input accepting `.pdf`, `.doc`, `.docx` formats only
- Max file size: 5 MB

---

##### API Endpoint

```
POST /candidates
Content-Type: multipart/form-data
```

**Request body:**

```json
{
  "firstName": "string",
  "lastName": "string",
  "email": "string",
  "phone": "string | undefined",
  "address": "string | undefined",
  "educations": [
    {
      "institution": "string",
      "title": "string",
      "startDate": "ISO 8601 date",
      "endDate": "ISO 8601 date | undefined"
    }
  ],
  "workExperiences": [
    {
      "company": "string",
      "position": "string",
      "description": "string | undefined",
      "startDate": "ISO 8601 date",
      "endDate": "ISO 8601 date | undefined"
    }
  ],
  "resume": "File | undefined"
}
```

**Responses:**

- `201 Created` → `{ data: { id, firstName, lastName, email, ... } }`
- `400 Bad Request` → `{ error: string, details: string[] }` (validation failure)
- `409 Conflict` → `{ error: "Email already registered" }` (duplicate email)

---

##### Files to Create / Modify

**Frontend (this task)**

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/components/AddCandidateForm.tsx` | Create | New form component (TypeScript, React Bootstrap) |
| `frontend/src/services/candidateService.ts` | Create | Service exposing `createCandidate(data: FormData): Promise<Candidate>` |
| `frontend/src/App.tsx` | Modify | Add route `/candidates/new` → `<AddCandidateForm />`; add nav link from main page |
| `frontend/cypress/e2e/candidates.cy.ts` | Create | New E2E test file |

**Backend (prerequisite — separate task)**

| File | Action | Description |
|------|--------|-------------|
| `backend/src/index.ts` | Modify | Register `POST /candidates` route |
| `backend/src/application/services/CandidateService.ts` | Create | Application service |
| `backend/src/domain/repositories/ICandidateRepository.ts` | Create | Repository interface |
| `backend/src/infrastructure/repositories/PrismaCandidateRepository.ts` | Create | Prisma implementation |

---

##### Acceptance Criteria

1. The form is reachable at route `/candidates/new`.
2. A clearly labelled link/button to reach the form exists on the main dashboard page.
3. All required fields show inline validation errors before the request is sent.
4. The submit button is disabled while the HTTP request is in flight.
5. On **success (201)**: a React Bootstrap `Alert` (variant `success`) is displayed and the form is reset to its initial state.
6. On **conflict (409)**: a user-friendly error message is shown on the email field.
7. On **other error**: a general error `Alert` (variant `danger`) is shown.
8. Education entries can be added and removed dynamically; at least one is required.
9. Work experience entries can be added and removed dynamically.
10. The file upload input only accepts `.pdf`, `.doc`, `.docx`.
11. The component renders correctly at mobile (< 768 px) and desktop (≥ 992 px) widths.

---

##### Testing Requirements

File: `frontend/cypress/e2e/candidates.cy.ts`

- **Happy path:** fill all required fields and submit → assert `POST /candidates` returns 201 and success alert is visible.
- **Validation errors:** submit empty form → assert inline error messages are shown and no HTTP request is made.
- **Duplicate email:** stub API to return 409 → assert error is shown on the email field.
- **Loading state:** assert submit button is disabled while request is pending.
- Use `data-testid` attributes for all element selectors (e.g., `data-testid="submit-btn"`, `data-testid="first-name-input"`).

---

##### Non-Functional Requirements

- Component file must use `.tsx` extension with full TypeScript typing (no `any`).
- All code, comments, variable names, and test descriptions must be in **English**.
- API calls must be made exclusively through `candidateService`, never inline inside the component.
- All interactive elements must include `aria-label` attributes for accessibility.
- ESLint must pass with zero errors before the PR is opened.
- TypeScript compilation must produce zero errors.
- Git branch name must follow the convention: `feature/<ticket-id>-add-candidate-form-frontend`.

---

**Jira update result:**

- Title updated to English: "Frontend - Implement UI form to add a new candidate"
- Description updated with `[original]` and `[enhanced]` sections
- Status was "Tareas por hacer" (To Do) — no transition applied (transition only applies if status is "To refine")

---

### User

> Crea un archivo `prompt_SCRUM-6.md` incluyendo el historial de este chat. Necesito que el archivo tenga formato md. En sintaxis e identacion correctas.

---

### Assistant

Created this file: `prompt_SCRUM-6.md`
