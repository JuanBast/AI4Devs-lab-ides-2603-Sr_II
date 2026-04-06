# Frontend Implementation Plan: SCRUM-6 Add Candidate Form

## Overview

This plan implements **SCRUM-6**: a React 18 + TypeScript form that allows recruiters to add a new candidate to the ATS system. The form collects personal information, one or more education entries, optional work experience entries, and an optional resume file upload. It communicates exclusively through a service layer and provides inline validation, loading states, and user-friendly success/error feedback via React Bootstrap `Alert` components.

**Architecture principles:** component-based design, service layer for all API calls, controlled form inputs, local state with React hooks, React Bootstrap for UI consistency, Cypress E2E tests with `data-testid` selectors.

---

## Architecture Context

### Components / Services Involved

| Path | Role |
|------|------|
| `frontend/src/services/candidateService.ts` | New — wraps `POST /candidates` with `multipart/form-data` |
| `frontend/src/components/AddCandidateForm.tsx` | New — full form component with validation and dynamic sections |
| `frontend/src/App.tsx` | Modify — add React Router, route `/candidates/new`, nav link |
| `frontend/cypress/e2e/candidates.cy.ts` | New — E2E test suite |
| `frontend/cypress.config.ts` | New — Cypress configuration |

### Routing

- New route: `/candidates/new` → `<AddCandidateForm />`
- Main page (`/`) gets a button/link to reach the form

### State Management

Local state only (`useState` hooks). No global state is required for this feature. Form state includes:
- Personal fields (strings)
- `educations[]` array (dynamic, min 1)
- `workExperiences[]` array (dynamic, optional)
- `resume` file (optional)
- `isSubmitting`, `successMessage`, `errorMessage`, per-field validation errors

---

## Implementation Steps

### Step 0: Create Feature Branch

- **Action**: Create and switch to the feature branch before any code changes.
- **Branch Name (required)**: `feature/SCRUM-6-add-candidate-form-frontend`
- **Implementation Steps**:
  1. Ensure you are on the latest `solved-lab-ides-JFB` branch: `git checkout solved-lab-ides-JFB && git pull origin solved-lab-ides-JFB`
  2. Create the branch: `git checkout -b feature/SCRUM-6-add-candidate-form-frontend`
  3. Verify: `git branch`
- **Notes**: This must be the FIRST step. The branch name is mandated by the ticket non-functional requirements.

---

### Step 1: Install Missing Dependencies

- **File**: `frontend/package.json`
- **Action**: Install React Router DOM, React Bootstrap, Bootstrap CSS, Axios, and Cypress — none are present in the current `package.json`.
- **Implementation Steps**:
  1. In the `frontend/` directory, run:
     ```bash
     npm install react-router-dom@6 react-bootstrap@2 bootstrap@5 axios
     npm install --save-dev cypress @types/node
     ```
  2. Add Cypress scripts to `package.json`:
     ```json
     "cypress:open": "cypress open",
     "cypress:run": "cypress run"
     ```
  3. Verify the installed versions align with the standards: `react-router-dom ^6`, `react-bootstrap ^2`, `bootstrap ^5`, `axios` latest.
- **Dependencies**: npm, Node.js
- **Notes**: The `package.json` currently has none of these packages. Do not skip this step — the component imports will fail without them.

---

### Step 2: Configure Cypress

- **File**: `frontend/cypress.config.ts` (new), `frontend/cypress/e2e/` (directory scaffold)
- **Action**: Create the Cypress configuration file.
- **Implementation Steps**:
  1. Create `frontend/cypress.config.ts`:
     ```typescript
     import { defineConfig } from 'cypress';

     export default defineConfig({
       e2e: {
         baseUrl: 'http://localhost:3000',
         env: {
           API_URL: 'http://localhost:3010',
         },
         supportFile: false,
       },
     });
     ```
  2. Create the directory `frontend/cypress/e2e/` (the test file itself is created in Step 5).
- **Notes**: `supportFile: false` simplifies setup for a greenfield project with no existing support file.

---

### Step 3: Create Candidate Service

- **File**: `frontend/src/services/candidateService.ts` (new)
- **Action**: Implement the `createCandidate` function that sends `multipart/form-data` to `POST /candidates`.
- **Function Signature**:
  ```typescript
  export const candidateService = {
    createCandidate: async (data: FormData): Promise<CandidateResponse> => { ... }
  };
  ```
- **Implementation Steps**:
  1. Define types at the top of the file:
     ```typescript
     export type CandidateResponse = {
       id: number;
       firstName: string;
       lastName: string;
       email: string;
       phone?: string;
       address?: string;
     };
     ```
  2. Define `API_BASE_URL` using the environment variable with a fallback:
     ```typescript
     const API_BASE_URL = process.env.REACT_APP_API_URL ?? 'http://localhost:3010';
     ```
  3. Implement `createCandidate` using `axios.post` with `Content-Type: multipart/form-data`. Let axios set the boundary automatically by passing `FormData` directly — do **not** manually set the `Content-Type` header.
  4. Re-throw errors so the component can distinguish `409` (email conflict) from other errors by inspecting `error.response?.status`.
- **Dependencies**: `axios`
- **Implementation Notes**:
  - All API calls must go through this service — never inline `axios` calls in the component.
  - The service must be the only place that knows the API base URL.

---

### Step 4: Create `AddCandidateForm` Component

- **File**: `frontend/src/components/AddCandidateForm.tsx` (new)
- **Action**: Implement the full candidate creation form as a TypeScript functional component using React Bootstrap.
- **Component Signature**:
  ```typescript
  const AddCandidateForm: React.FC = () => { ... };
  export default AddCandidateForm;
  ```
- **Implementation Steps**:

  #### 4a — Define Local Types
  ```typescript
  type EducationEntry = {
    institution: string;
    title: string;
    startDate: string;
    endDate: string;
  };

  type WorkExperienceEntry = {
    company: string;
    position: string;
    description: string;
    startDate: string;
    endDate: string;
  };

  type FormErrors = {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: string;
    educations?: Array<Partial<Record<keyof EducationEntry, string>>>;
    workExperiences?: Array<Partial<Record<keyof WorkExperienceEntry, string>>>;
    resume?: string;
  };
  ```

  #### 4b — Initialize State
  ```typescript
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [educations, setEducations] = useState<EducationEntry[]>([
    { institution: '', title: '', startDate: '', endDate: '' },
  ]);
  const [workExperiences, setWorkExperiences] = useState<WorkExperienceEntry[]>([]);
  const [resume, setResume] = useState<File | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  ```

  #### 4c — Implement Client-Side Validation
  Create a `validate(): boolean` function that:
  - `firstName`: required, max 100 chars
  - `lastName`: required, max 100 chars
  - `email`: required, valid email regex, max 255 chars
  - `phone`: optional, max 15 chars
  - `address`: optional, max 100 chars
  - `educations`: each entry must have `institution` (max 100), `title` (max 250), `startDate`; `endDate` must be after `startDate` if provided; at least one entry is required
  - `workExperiences`: each entry must have `company` (max 100), `position` (max 100), `startDate`; `endDate` must be after `startDate` if provided
  - `resume`: if provided, must be `.pdf`, `.doc`, or `.docx`; max 5 MB
  - Returns `true` if valid, `false` if not (sets `errors` state); must not submit if validation fails

  #### 4d — Implement `handleSubmit`
  ```typescript
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    setSuccessMessage('');
    setErrorMessage('');
    try {
      const formData = buildFormData(); // constructs FormData from state
      await candidateService.createCandidate(formData);
      setSuccessMessage('Candidate added successfully.');
      resetForm();
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 409) {
        setErrors(prev => ({ ...prev, email: 'This email is already registered.' }));
      } else {
        setErrorMessage('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  ```

  #### 4e — Implement `buildFormData`
  Serialize `educations` and `workExperiences` arrays as JSON strings appended to `FormData`:
  ```typescript
  const buildFormData = (): FormData => {
    const fd = new FormData();
    fd.append('firstName', firstName);
    fd.append('lastName', lastName);
    fd.append('email', email);
    if (phone) fd.append('phone', phone);
    if (address) fd.append('address', address);
    fd.append('educations', JSON.stringify(educations));
    fd.append('workExperiences', JSON.stringify(workExperiences));
    if (resume) fd.append('resume', resume);
    return fd;
  };
  ```

  #### 4f — Dynamic Education Section Handlers
  - `addEducation`: appends a blank entry to `educations`
  - `removeEducation(index)`: removes entry at index (only if `educations.length > 1`)
  - `updateEducation(index, field, value)`: updates a single field

  #### 4g — Dynamic Work Experience Section Handlers
  - `addWorkExperience`: appends a blank entry
  - `removeWorkExperience(index)`: removes entry at index
  - `updateWorkExperience(index, field, value)`: updates a single field

  #### 4h — Implement `resetForm`
  Resets all state fields to initial values (including resetting `educations` to one blank entry and `workExperiences` to `[]`).

  #### 4i — Render JSX Structure
  Use React Bootstrap layout:
  ```
  <Container>
    <Row><Col>
      <h2>Add New Candidate</h2>
      {successMessage && <Alert variant="success" data-testid="success-alert">...</Alert>}
      {errorMessage && <Alert variant="danger" data-testid="error-alert">...</Alert>}
      <Form onSubmit={handleSubmit} noValidate>
        {/* Personal Information section */}
        {/* Education section (repeatable) */}
        {/* Work Experience section (repeatable) */}
        {/* Resume upload */}
        <Button type="submit" disabled={isSubmitting} data-testid="submit-btn">
          {isSubmitting ? 'Submitting...' : 'Add Candidate'}
        </Button>
      </Form>
    </Col></Row>
  </Container>
  ```

  #### Required `data-testid` Attributes (exhaustive list)
  | Element | `data-testid` |
  |---------|--------------|
  | First name input | `first-name-input` |
  | Last name input | `last-name-input` |
  | Email input | `email-input` |
  | Phone input | `phone-input` |
  | Address input | `address-input` |
  | Education institution (index i) | `education-institution-{i}` |
  | Education title (index i) | `education-title-{i}` |
  | Education start date (index i) | `education-start-date-{i}` |
  | Education end date (index i) | `education-end-date-{i}` |
  | Add education button | `add-education-btn` |
  | Remove education button (index i) | `remove-education-btn-{i}` |
  | Work experience company (index i) | `work-company-{i}` |
  | Work experience position (index i) | `work-position-{i}` |
  | Work experience description (index i) | `work-description-{i}` |
  | Work experience start date (index i) | `work-start-date-{i}` |
  | Work experience end date (index i) | `work-end-date-{i}` |
  | Add work experience button | `add-work-btn` |
  | Remove work experience button (index i) | `remove-work-btn-{i}` |
  | Resume file input | `resume-input` |
  | Submit button | `submit-btn` |
  | Success alert | `success-alert` |
  | Error alert | `error-alert` |
  | Email validation error | `email-error` |

  #### Required `aria-label` Attributes
  Every `Form.Control` and `Button` must include an `aria-label` describing its purpose (e.g., `aria-label="First name"`).

- **Dependencies**: `react`, `react-bootstrap`, `axios`, `candidateService`
- **Implementation Notes**:
  - No `any` types — use proper TypeScript throughout.
  - Use `isAxiosError` from axios to narrow error types safely.
  - The component must be responsive: on mobile (`< 768px`) use a single-column layout; on desktop use two-column layout for personal fields using React Bootstrap `Col md={6}`.

---

### Step 5: Update `App.tsx` with Routing and Navigation

- **File**: `frontend/src/App.tsx`
- **Action**: Replace the CRA default template with a proper application shell using React Router DOM v6. Add a route for `/candidates/new` and a navigation link from the main page.
- **Implementation Steps**:
  1. Import `BrowserRouter`, `Routes`, `Route`, `Link` from `react-router-dom`
  2. Import `AddCandidateForm` from `./components/AddCandidateForm`
  3. Import Bootstrap CSS: `import 'bootstrap/dist/css/bootstrap.min.css'`
  4. Create a simple `Dashboard` inline component (or section) that renders a welcome message and a `Button` (or `Link`) pointing to `/candidates/new` with `data-testid="add-candidate-link"` and `aria-label="Add new candidate"`
  5. Set up `BrowserRouter > Routes`:
     ```tsx
     <Route path="/" element={<Dashboard />} />
     <Route path="/candidates/new" element={<AddCandidateForm />} />
     ```
- **Notes**: Keep the dashboard minimal — only what's needed to satisfy the acceptance criteria (a link to the form). Do not add unrelated routes or structure.

---

### Step 6: Write Cypress E2E Tests

- **File**: `frontend/cypress/e2e/candidates.cy.ts` (new)
- **Action**: Write four test scenarios as specified in the ticket testing requirements.
- **Implementation Steps**:

  #### 6a — File Header
  ```typescript
  const API_URL = Cypress.env('API_URL') ?? 'http://localhost:3010';
  ```

  #### 6b — Happy Path Test
  ```typescript
  describe('Add Candidate Form', () => {
    beforeEach(() => {
      cy.visit('/candidates/new');
    });

    it('submits the form successfully and shows success alert', () => {
      cy.intercept('POST', `${API_URL}/candidates`, {
        statusCode: 201,
        body: { data: { id: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' } },
      }).as('createCandidate');

      cy.get('[data-testid="first-name-input"]').type('Jane');
      cy.get('[data-testid="last-name-input"]').type('Doe');
      cy.get('[data-testid="email-input"]').type('jane@example.com');
      cy.get('[data-testid="education-institution-0"]').type('MIT');
      cy.get('[data-testid="education-title-0"]').type('BSc Computer Science');
      cy.get('[data-testid="education-start-date-0"]').type('2018-09-01');
      cy.get('[data-testid="submit-btn"]').click();

      cy.wait('@createCandidate');
      cy.get('[data-testid="success-alert"]').should('be.visible');
      // Form should be reset
      cy.get('[data-testid="first-name-input"]').should('have.value', '');
    });
  });
  ```

  #### 6c — Validation Errors Test
  ```typescript
  it('shows inline validation errors on empty submit without sending HTTP request', () => {
    cy.intercept('POST', `${API_URL}/candidates`).as('createCandidate');

    cy.get('[data-testid="submit-btn"]').click();

    // Assert errors are shown and no request was made
    cy.get('@createCandidate.all').should('have.length', 0);
    // At minimum, first name, last name, email, and education fields should show errors
    cy.contains('First name is required').should('be.visible');
    cy.contains('Last name is required').should('be.visible');
    cy.contains('Email is required').should('be.visible');
  });
  ```

  #### 6d — Duplicate Email (409) Test
  ```typescript
  it('shows email conflict error on 409 response', () => {
    cy.intercept('POST', `${API_URL}/candidates`, {
      statusCode: 409,
      body: { error: 'Email already registered' },
    }).as('createCandidate');

    cy.get('[data-testid="first-name-input"]').type('Jane');
    cy.get('[data-testid="last-name-input"]').type('Doe');
    cy.get('[data-testid="email-input"]').type('duplicate@example.com');
    cy.get('[data-testid="education-institution-0"]').type('MIT');
    cy.get('[data-testid="education-title-0"]').type('BSc Computer Science');
    cy.get('[data-testid="education-start-date-0"]').type('2018-09-01');
    cy.get('[data-testid="submit-btn"]').click();

    cy.wait('@createCandidate');
    cy.get('[data-testid="email-error"]').should('be.visible');
    cy.get('[data-testid="success-alert"]').should('not.exist');
  });
  ```

  #### 6e — Loading State Test
  ```typescript
  it('disables submit button while request is in flight', () => {
    cy.intercept('POST', `${API_URL}/candidates`, (req) => {
      req.on('response', (res) => { res.setDelay(500); });
      req.reply({ statusCode: 201, body: { data: { id: 1 } } });
    }).as('createCandidate');

    cy.get('[data-testid="first-name-input"]').type('Jane');
    cy.get('[data-testid="last-name-input"]').type('Doe');
    cy.get('[data-testid="email-input"]').type('jane@example.com');
    cy.get('[data-testid="education-institution-0"]').type('MIT');
    cy.get('[data-testid="education-title-0"]').type('BSc Computer Science');
    cy.get('[data-testid="education-start-date-0"]').type('2018-09-01');
    cy.get('[data-testid="submit-btn"]').click();

    cy.get('[data-testid="submit-btn"]').should('be.disabled');
    cy.wait('@createCandidate');
    cy.get('[data-testid="submit-btn"]').should('not.be.disabled');
  });
  ```

- **Notes**: All test descriptions must be in English. Use `cy.intercept` for all API stubs — never rely on a running backend in E2E tests.

---

### Step 7: Update Technical Documentation

- **Action**: Review all changes made during implementation and update relevant documentation.
- **Implementation Steps**:
  1. **Review Changes**: All changes involve the frontend — new service, new component, updated routing, new Cypress setup, new dependencies.
  2. **Identify Documentation Files**:
     - New frontend patterns (dynamic form sections, `multipart/form-data` service, Cypress `cy.intercept`) → update `ai-specs/specs/frontend-standards.mdc`
     - New `POST /candidates` endpoint consumed by frontend → verify `ai-specs/specs/api-spec.yml` reflects the endpoint contract (add if missing)
  3. **Update `frontend-standards.mdc`** if the Cypress `cy.intercept` pattern or `multipart/form-data` service pattern is not already documented
  4. **Verify `api-spec.yml`** contains `POST /candidates` with correct request/response schema. Add or update if missing.
  5. **Report** which files were updated.
- **References**: Follow `ai-specs/specs/documentation-standards.mdc` — all documentation in English.
- **Notes**: This step is MANDATORY before the implementation is considered complete.

---

## Implementation Order

1. **Step 0** — Create feature branch `feature/SCRUM-6-add-candidate-form-frontend`
2. **Step 1** — Install missing npm dependencies
3. **Step 2** — Configure Cypress (`cypress.config.ts`)
4. **Step 3** — Create `candidateService.ts`
5. **Step 4** — Create `AddCandidateForm.tsx`
6. **Step 5** — Update `App.tsx` (routing + nav link)
7. **Step 6** — Write `cypress/e2e/candidates.cy.ts`
8. **Step 7** — Update technical documentation

---

## Testing Checklist

- [ ] `npm run cypress:run` — all 4 E2E scenarios pass
- [ ] Happy path: form submits, `POST /candidates` is called, success alert is visible, form resets
- [ ] Validation: empty submit shows all required-field errors, no HTTP request is fired
- [ ] Conflict: 409 response shows error on the email field, no success alert
- [ ] Loading: submit button is disabled while request is in flight
- [ ] Education section: can add a second entry; can remove an entry (remove button hidden when only one entry)
- [ ] Work experience section: can add and remove entries
- [ ] File input: only accepts `.pdf`, `.doc`, `.docx`
- [ ] Responsive: form is usable at 375px wide (mobile) and 1280px wide (desktop)
- [ ] `npx tsc --noEmit` — zero TypeScript errors
- [ ] `npx eslint src/` — zero ESLint errors

---

## Error Handling Patterns

| Scenario | Handling |
|----------|----------|
| Client-side validation failure | Set `errors` state, do not submit, show inline messages near each field |
| 409 Conflict (duplicate email) | Set `errors.email` to `'This email is already registered.'`, display near email field via `data-testid="email-error"` |
| Other HTTP error (5xx, network) | Set `errorMessage` state, render `<Alert variant="danger" data-testid="error-alert">` |
| Success (201) | Set `successMessage`, render `<Alert variant="success" data-testid="success-alert">`, call `resetForm()` |
| `isSubmitting` race protection | Set `isSubmitting = true` before request, `false` in `finally` block; disable submit button while true |

---

## UI/UX Considerations

- **Bootstrap Grid**: Use `Container > Row > Col md={6}` for two-column personal fields layout on desktop; single column on mobile.
- **Section headers**: Use `<h5>` or `<Card.Header>` to visually separate Personal Info, Education, and Work Experience sections.
- **Dynamic section add/remove**: "Add Education" button uses `variant="outline-secondary"`; "Remove" button uses `variant="outline-danger"` and is hidden (or disabled) when only one education entry remains.
- **Submit button state**: Text changes from `"Add Candidate"` to `"Submitting..."` when `isSubmitting` is true.
- **Alerts**: Place `success` and `danger` alerts above the form so they are immediately visible without scrolling.
- **Date fields**: Use `<Form.Control type="date">` — no external date picker dependency is needed for this ticket.
- **File input**: Use `<Form.Control type="file" accept=".pdf,.doc,.docx">` and validate size client-side in the `validate()` function.

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `react-router-dom` | `^6` | Client-side routing (`BrowserRouter`, `Routes`, `Route`, `Link`) |
| `react-bootstrap` | `^2` | React Bootstrap components (`Form`, `Button`, `Alert`, `Container`, `Row`, `Col`) |
| `bootstrap` | `^5` | Bootstrap CSS |
| `axios` | latest | HTTP client for the service layer |
| `cypress` | `^14` | E2E testing (already in standards; install as devDependency) |

All others (`react`, `typescript`, `react-dom`) are already in `package.json`.

---

## Notes

- **Branch name is required by ticket**: `feature/SCRUM-6-add-candidate-form-frontend` — do not use the generic `SCRUM-6` branch.
- **English only**: All variable names, comments, error messages, test descriptions, and component text must be in English.
- **No `any` types**: Full TypeScript typing required across all new files.
- **Service layer boundary**: `axios` must only appear in `candidateService.ts`, never directly in `AddCandidateForm.tsx`.
- **FormData serialization**: `educations` and `workExperiences` arrays should be appended as JSON strings since `multipart/form-data` does not natively support nested objects.
- **Backend prerequisite**: SCRUM-7 (backend `POST /candidates` endpoint) must be merged and running for the happy-path E2E test to pass against a real backend. Cypress intercepts allow the tests to run independently.
- **ESLint and TypeScript** must pass with zero errors before opening a PR.

---

## Next Steps After Implementation

- Open PR from `feature/SCRUM-6-add-candidate-form-frontend` → `solved-lab-ides-JFB`, referencing SCRUM-6.
- Verify integration against the running backend from SCRUM-7/SCRUM-8.
- Transition SCRUM-6 Jira ticket to "Done" after PR is merged.

---

## Implementation Verification

### Code Quality
- [ ] No `any` types anywhere in new files
- [ ] No inline `axios` calls in `AddCandidateForm.tsx`
- [ ] All variables, functions, and comments in English
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npx eslint src/` passes with zero errors

### Functionality
- [ ] Form reachable at `/candidates/new`
- [ ] Navigation link exists on the main page (`/`)
- [ ] Required fields show inline errors on invalid submit
- [ ] At least one education entry is always present
- [ ] Education and work experience entries can be added and removed dynamically
- [ ] File input restricted to `.pdf`, `.doc`, `.docx`; max 5 MB client-side check
- [ ] Submit button disabled during submission

### Testing
- [ ] All 4 Cypress scenarios pass: happy path, validation errors, 409 conflict, loading state
- [ ] `data-testid` attributes present on all required elements (see table in Step 4i)

### Integration
- [ ] `POST /candidates` called with correct `multipart/form-data` body when submitting a valid form
- [ ] 201 response → success alert shown, form reset
- [ ] 409 response → email field error shown
- [ ] Other error → general danger alert shown

### Documentation
- [ ] `ai-specs/specs/api-spec.yml` updated to include `POST /candidates` contract
- [ ] `ai-specs/specs/frontend-standards.mdc` updated if new patterns were introduced
