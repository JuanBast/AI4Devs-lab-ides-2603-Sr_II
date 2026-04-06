# SCRUM-6 Frontend Implementation Plan: Add Candidate Form

## Current State Analysis

### What exists
- `frontend/` is a Create React App + TypeScript project (`react-scripts 5.0.1`, TypeScript 4.9.5)
- `frontend/src/App.tsx` is the CRA default template (renders "Learn React" link, no routing)
- `frontend/src/tests/App.test.tsx` tests for the default "learn react" text — this test WILL BREAK and must be updated
- `frontend/src/index.css` has only basic body/code font stacks, no custom color variables
- `tsconfig.json` has `strict: true`, `noEmit: true`, target `es5`, module `esnext`
- `package.json` is missing: `react-router-dom`, `react-bootstrap`, `bootstrap`, `axios`, `cypress`
- No `src/services/` directory
- No `src/components/` directory
- No `cypress/` directory
- No `cypress.config.ts`

### What the api-spec says about POST /candidates
The `api-spec.yml` already fully documents `POST /candidates` with multipart/form-data, 201/400/409/429/500 responses, and the `CreateCandidateResponse` schema. No changes needed to api-spec.yml.

### What frontend-standards.mdc currently lacks
The `frontend-standards.mdc` documents `cy.request` API testing patterns but does NOT document:
1. `cy.intercept` stubbing pattern (used in this feature's E2E tests)
2. `multipart/form-data` service pattern (FormData + JSON-serialized arrays)

These two patterns must be added to `frontend-standards.mdc` as part of Step 7.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `frontend/package.json` | Modify — add dependencies + scripts |
| `frontend/cypress.config.ts` | Create |
| `frontend/src/services/candidateService.ts` | Create |
| `frontend/src/components/AddCandidateForm.tsx` | Create |
| `frontend/src/App.tsx` | Replace entirely |
| `frontend/src/tests/App.test.tsx` | Modify — update to match new App content |
| `frontend/cypress/e2e/candidates.cy.ts` | Create |
| `ai-specs/specs/frontend-standards.mdc` | Modify — add cy.intercept and multipart patterns |

---

## Step-by-Step Implementation Plan

### Step 0: Create Feature Branch

```bash
git checkout solved-lab-ides-JFB && git pull origin solved-lab-ides-JFB
git checkout -b feature/SCRUM-6-add-candidate-form-frontend
```

Branch name is mandated: `feature/SCRUM-6-add-candidate-form-frontend`.

---

### Step 1: Install Dependencies

Run inside `frontend/`:

```bash
npm install react-router-dom@6 react-bootstrap@2 bootstrap@5 axios
npm install --save-dev cypress
```

Then update `frontend/package.json` scripts section to add:

```json
"cypress:open": "cypress open",
"cypress:run": "cypress run"
```

IMPORTANT: `@types/node` is already in `package.json` at `^16.18.97` — do not duplicate it. The `cypress` devDependency must be added only under `devDependencies`.

---

### Step 2: Create `frontend/cypress.config.ts`

Full file content:

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

`supportFile: false` is required — there is no existing Cypress support file in this project.

---

### Step 3: Create `frontend/src/services/candidateService.ts`

Create the directory `frontend/src/services/` if it does not exist.

Full file content (all in TypeScript, no `any`):

```typescript
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL ?? 'http://localhost:3010';

export type CandidateResponse = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
};

export const candidateService = {
  createCandidate: async (data: FormData): Promise<CandidateResponse> => {
    try {
      const response = await axios.post<{ success: boolean; data: CandidateResponse }>(
        `${API_BASE_URL}/candidates`,
        data
        // DO NOT set Content-Type header — axios sets it automatically with the correct boundary when FormData is passed
      );
      return response.data.data;
    } catch (error) {
      // Re-throw so the component can inspect error.response?.status
      throw error;
    }
  },
};
```

IMPORTANT NOTES:
- Never set `Content-Type: multipart/form-data` manually. When axios receives a `FormData` object it automatically sets the header with the correct multipart boundary. Setting it manually will break the boundary and the server will reject the request.
- The response envelope shape from the backend is `{ success: boolean, data: CandidateResponse }` per api-spec.yml `CreateCandidateResponse` schema. The service unwraps `response.data.data` before returning.
- The `try/catch` only re-throws — it does NOT swallow errors. The component is responsible for inspecting the status code.

---

### Step 4: Create `frontend/src/components/AddCandidateForm.tsx`

Create the directory `frontend/src/components/` if it does not exist.

#### 4a: Type Definitions (at the top of the file, no `any`)

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

#### 4b: Imports

```typescript
import React, { useState } from 'react';
import { Container, Row, Col, Form, Button, Alert, Card } from 'react-bootstrap';
import { isAxiosError } from 'axios';
import { candidateService } from '../services/candidateService';
```

IMPORTANT: Import `isAxiosError` directly from `axios` (named export). This is the correct way in axios >= 1.0. Do NOT use `axios.isAxiosError` — use the named import.

#### 4c: State Initialization

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

#### 4d: Validation Function

```typescript
const validate = (): boolean => {
  const newErrors: FormErrors = {};

  // firstName
  if (!firstName.trim()) {
    newErrors.firstName = 'First name is required';
  } else if (firstName.length > 100) {
    newErrors.firstName = 'First name must not exceed 100 characters';
  }

  // lastName
  if (!lastName.trim()) {
    newErrors.lastName = 'Last name is required';
  } else if (lastName.length > 100) {
    newErrors.lastName = 'Last name must not exceed 100 characters';
  }

  // email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email.trim()) {
    newErrors.email = 'Email is required';
  } else if (!emailRegex.test(email)) {
    newErrors.email = 'Please enter a valid email address';
  } else if (email.length > 255) {
    newErrors.email = 'Email must not exceed 255 characters';
  }

  // phone (optional)
  if (phone && phone.length > 15) {
    newErrors.phone = 'Phone must not exceed 15 characters';
  }

  // address (optional)
  if (address && address.length > 100) {
    newErrors.address = 'Address must not exceed 100 characters';
  }

  // educations — at least one entry always present, each must have institution, title, startDate
  const educationErrors: Array<Partial<Record<keyof EducationEntry, string>>> = educations.map(
    (edu) => {
      const entryErrors: Partial<Record<keyof EducationEntry, string>> = {};
      if (!edu.institution.trim()) {
        entryErrors.institution = 'Institution is required';
      } else if (edu.institution.length > 100) {
        entryErrors.institution = 'Institution must not exceed 100 characters';
      }
      if (!edu.title.trim()) {
        entryErrors.title = 'Title is required';
      } else if (edu.title.length > 250) {
        entryErrors.title = 'Title must not exceed 250 characters';
      }
      if (!edu.startDate) {
        entryErrors.startDate = 'Start date is required';
      }
      if (edu.endDate && edu.startDate && edu.endDate < edu.startDate) {
        entryErrors.endDate = 'End date must be after start date';
      }
      return entryErrors;
    }
  );
  if (educationErrors.some((e) => Object.keys(e).length > 0)) {
    newErrors.educations = educationErrors;
  }

  // workExperiences (optional entries, but if provided each must have company, position, startDate)
  const workErrors: Array<Partial<Record<keyof WorkExperienceEntry, string>>> =
    workExperiences.map((work) => {
      const entryErrors: Partial<Record<keyof WorkExperienceEntry, string>> = {};
      if (!work.company.trim()) {
        entryErrors.company = 'Company is required';
      } else if (work.company.length > 100) {
        entryErrors.company = 'Company must not exceed 100 characters';
      }
      if (!work.position.trim()) {
        entryErrors.position = 'Position is required';
      } else if (work.position.length > 100) {
        entryErrors.position = 'Position must not exceed 100 characters';
      }
      if (!work.startDate) {
        entryErrors.startDate = 'Start date is required';
      }
      if (work.endDate && work.startDate && work.endDate < work.startDate) {
        entryErrors.endDate = 'End date must be after start date';
      }
      return entryErrors;
    });
  if (workErrors.some((e) => Object.keys(e).length > 0)) {
    newErrors.workExperiences = workErrors;
  }

  // resume (optional)
  if (resume) {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const allowedExtensions = /\.(pdf|doc|docx)$/i;
    if (!allowedTypes.includes(resume.type) && !allowedExtensions.test(resume.name)) {
      newErrors.resume = 'Only .pdf, .doc, and .docx files are allowed';
    } else if (resume.size > 5 * 1024 * 1024) {
      newErrors.resume = 'File size must not exceed 5MB';
    }
  }

  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};
```

IMPORTANT: Check BOTH MIME type AND file extension for the resume, because browser-reported MIME types for `.doc` files can vary (some browsers report `application/msword`, others `application/octet-stream`).

#### 4e: buildFormData Function

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

IMPORTANT: Arrays (`educations`, `workExperiences`) must be serialized as JSON strings using `JSON.stringify` because `multipart/form-data` has no native concept of nested arrays. The backend expects to call `JSON.parse` on these fields.

#### 4f: handleSubmit Function

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!validate()) return;
  setIsSubmitting(true);
  setSuccessMessage('');
  setErrorMessage('');
  try {
    const formData = buildFormData();
    await candidateService.createCandidate(formData);
    setSuccessMessage('Candidate added successfully.');
    resetForm();
  } catch (err: unknown) {
    if (isAxiosError(err) && err.response?.status === 409) {
      setErrors((prev) => ({ ...prev, email: 'This email is already registered.' }));
    } else {
      setErrorMessage('An unexpected error occurred. Please try again.');
    }
  } finally {
    setIsSubmitting(false);
  }
};
```

IMPORTANT: Use `err: unknown` (not `err: any`) and narrow with `isAxiosError(err)` before accessing `err.response`. This is the zero-`any` approach.

#### 4g: resetForm Function

```typescript
const resetForm = () => {
  setFirstName('');
  setLastName('');
  setEmail('');
  setPhone('');
  setAddress('');
  setEducations([{ institution: '', title: '', startDate: '', endDate: '' }]);
  setWorkExperiences([]);
  setResume(null);
  setErrors({});
};
```

#### 4h: Dynamic Section Handlers

```typescript
// Education handlers
const addEducation = () => {
  setEducations((prev) => [
    ...prev,
    { institution: '', title: '', startDate: '', endDate: '' },
  ]);
};

const removeEducation = (index: number) => {
  if (educations.length <= 1) return; // at least one entry must remain
  setEducations((prev) => prev.filter((_, i) => i !== index));
};

const updateEducation = (index: number, field: keyof EducationEntry, value: string) => {
  setEducations((prev) =>
    prev.map((edu, i) => (i === index ? { ...edu, [field]: value } : edu))
  );
};

// Work experience handlers
const addWorkExperience = () => {
  setWorkExperiences((prev) => [
    ...prev,
    { company: '', position: '', description: '', startDate: '', endDate: '' },
  ]);
};

const removeWorkExperience = (index: number) => {
  setWorkExperiences((prev) => prev.filter((_, i) => i !== index));
};

const updateWorkExperience = (
  index: number,
  field: keyof WorkExperienceEntry,
  value: string
) => {
  setWorkExperiences((prev) =>
    prev.map((work, i) => (i === index ? { ...work, [field]: value } : work))
  );
};
```

#### 4i: JSX Structure and Required Attributes

The component renders using React Bootstrap components. The complete layout:

```
<Container className="py-4">
  <Row className="justify-content-center">
    <Col md={8} lg={7}>
      <h2>Add New Candidate</h2>
      
      {successMessage and <Alert variant="success" data-testid="success-alert">}
      {errorMessage and <Alert variant="danger" data-testid="error-alert">}
      
      <Form onSubmit={handleSubmit} noValidate>
        
        {/* --- Personal Information --- */}
        <Card className="mb-4">
          <Card.Header><h5 className="mb-0">Personal Information</h5></Card.Header>
          <Card.Body>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>First Name *</Form.Label>
                  <Form.Control
                    type="text"
                    data-testid="first-name-input"
                    aria-label="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    isInvalid={!!errors.firstName}
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.firstName}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={6}>
                {/* lastName, same pattern, data-testid="last-name-input" */}
              </Col>
            </Row>
            <Row>
              <Col md={6}>
                {/* email, data-testid="email-input" */}
                {/* When errors.email is set from 409 response, render:
                    <div data-testid="email-error" className="text-danger">
                      {errors.email}
                    </div>
                    or use Form.Control.Feedback with an extra data-testid span
                */}
              </Col>
              <Col md={6}>
                {/* phone, data-testid="phone-input" */}
              </Col>
            </Row>
            <Row>
              <Col>
                {/* address, data-testid="address-input" */}
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* --- Education Section --- */}
        <Card className="mb-4">
          <Card.Header>
            <h5 className="mb-0">Education</h5>
          </Card.Header>
          <Card.Body>
            {educations.map((edu, i) => (
              <div key={i}>
                <Row>
                  <Col md={6}>
                    <Form.Control
                      data-testid={`education-institution-${i}`}
                      aria-label={`Education institution ${i + 1}`}
                      value={edu.institution}
                      onChange={(e) => updateEducation(i, 'institution', e.target.value)}
                      isInvalid={!!errors.educations?.[i]?.institution}
                    />
                    {/* feedback */}
                  </Col>
                  <Col md={6}>
                    {/* education-title-{i} */}
                  </Col>
                </Row>
                <Row>
                  <Col md={6}>
                    {/* education-start-date-{i}, type="date" */}
                  </Col>
                  <Col md={6}>
                    {/* education-end-date-{i}, type="date" */}
                  </Col>
                </Row>
                {educations.length > 1 && (
                  <Button
                    variant="outline-danger"
                    data-testid={`remove-education-btn-${i}`}
                    aria-label={`Remove education entry ${i + 1}`}
                    onClick={() => removeEducation(i)}
                    size="sm"
                    className="mb-3"
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline-secondary"
              data-testid="add-education-btn"
              aria-label="Add another education entry"
              onClick={addEducation}
              size="sm"
            >
              + Add Education
            </Button>
          </Card.Body>
        </Card>

        {/* --- Work Experience Section --- */}
        <Card className="mb-4">
          {/* similar pattern to education */}
          {/* work-company-{i}, work-position-{i}, work-description-{i} */}
          {/* work-start-date-{i}, work-end-date-{i} */}
          {/* add-work-btn, remove-work-btn-{i} */}
        </Card>

        {/* --- Resume Upload --- */}
        <Card className="mb-4">
          <Card.Body>
            <Form.Group>
              <Form.Label>Resume (optional)</Form.Label>
              <Form.Control
                type="file"
                accept=".pdf,.doc,.docx"
                data-testid="resume-input"
                aria-label="Upload resume"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setResume(e.target.files?.[0] ?? null);
                }}
                isInvalid={!!errors.resume}
              />
              <Form.Control.Feedback type="invalid">
                {errors.resume}
              </Form.Control.Feedback>
            </Form.Group>
          </Card.Body>
        </Card>

        <Button
          type="submit"
          variant="primary"
          data-testid="submit-btn"
          aria-label="Submit candidate form"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Add Candidate'}
        </Button>

      </Form>
    </Col>
  </Row>
</Container>
```

IMPORTANT — email-error testid: The `data-testid="email-error"` element must be present whenever `errors.email` is set (from either client-side validation or 409 response). The recommended implementation:

```tsx
{errors.email && (
  <div data-testid="email-error" className="invalid-feedback d-block">
    {errors.email}
  </div>
)}
```

Place this div directly below the email `Form.Control`. Also set `isInvalid={!!errors.email}` on the email input so Bootstrap renders the red border. However, the `Form.Control.Feedback` component does NOT receive the `data-testid` — use the explicit div instead.

IMPORTANT — Remove education button visibility: The remove button should only render when `educations.length > 1`. Do NOT render a disabled button — do NOT render the element at all. This ensures Cypress `cy.get('[data-testid="remove-education-btn-0"]')` would fail when there is only one entry (as expected by test logic).

---

### Step 5: Update `frontend/src/App.tsx`

Replace the entire file. The new file must:
1. Import `BrowserRouter`, `Routes`, `Route`, `Link` from `react-router-dom`
2. Import `'bootstrap/dist/css/bootstrap.min.css'`
3. Import `AddCandidateForm` from `./components/AddCandidateForm`
4. Remove the import of `logo.svg` and `./App.css` (no longer needed after replacement)

Minimal Dashboard component:

```tsx
import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Container, Button } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import AddCandidateForm from './components/AddCandidateForm';

const Dashboard: React.FC = () => (
  <Container className="py-5 text-center">
    <h1>LTI ATS Dashboard</h1>
    <p>Applicant Tracking System</p>
    <Link to="/candidates/new">
      <Button
        variant="primary"
        data-testid="add-candidate-link"
        aria-label="Add new candidate"
      >
        Add New Candidate
      </Button>
    </Link>
  </Container>
);

const App: React.FC = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/candidates/new" element={<AddCandidateForm />} />
    </Routes>
  </BrowserRouter>
);

export default App;
```

IMPORTANT: Wrap the `Button` inside a `Link` component (not `as={Link}` prop) to avoid TypeScript type conflicts between react-bootstrap and react-router-dom prop shapes. The `Link` component from react-router-dom renders an anchor; wrapping a Button is the safest zero-TypeScript-error approach.

---

### Step 6: Update `frontend/src/tests/App.test.tsx`

The existing test checks for `learn react` text which will no longer exist. Update the test to match the new Dashboard content:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../App';

test('renders dashboard heading', () => {
  render(<App />);
  const heading = screen.getByText(/LTI ATS Dashboard/i);
  expect(heading).toBeInTheDocument();
});
```

IMPORTANT: This file must be updated or `npm test` will fail because the old assertion (`learn react`) no longer matches any rendered content.

---

### Step 7: Create `frontend/cypress/e2e/candidates.cy.ts`

Create the directory `frontend/cypress/e2e/` first.

Full file content:

```typescript
const API_URL = Cypress.env('API_URL') ?? 'http://localhost:3010';

describe('Add Candidate Form', () => {
  beforeEach(() => {
    cy.visit('/candidates/new');
  });

  it('submits the form successfully and shows success alert', () => {
    cy.intercept('POST', `${API_URL}/candidates`, {
      statusCode: 201,
      body: {
        success: true,
        data: { id: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
      },
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
    cy.get('[data-testid="first-name-input"]').should('have.value', '');
  });

  it('shows inline validation errors on empty submit without sending HTTP request', () => {
    cy.intercept('POST', `${API_URL}/candidates`).as('createCandidate');

    cy.get('[data-testid="submit-btn"]').click();

    cy.get('@createCandidate.all').should('have.length', 0);
    cy.contains('First name is required').should('be.visible');
    cy.contains('Last name is required').should('be.visible');
    cy.contains('Email is required').should('be.visible');
  });

  it('shows email conflict error on 409 response', () => {
    cy.intercept('POST', `${API_URL}/candidates`, {
      statusCode: 409,
      body: { success: false, error: { message: 'Email already registered', code: 'DUPLICATE_EMAIL' } },
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

  it('disables submit button while request is in flight', () => {
    cy.intercept('POST', `${API_URL}/candidates`, (req) => {
      req.on('response', (res) => {
        res.setDelay(500);
      });
      req.reply({
        statusCode: 201,
        body: { success: true, data: { id: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' } },
      });
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
});
```

IMPORTANT NOTES on Cypress intercepts:
- `cy.intercept` stubs the network request at the browser level — no real backend needed for these tests.
- The validation test uses `cy.get('@createCandidate.all').should('have.length', 0)` to assert no HTTP request was fired.
- `res.setDelay(500)` in the loading state test requires Cypress >= 7 (standard for Cypress 14).
- The intercepted URL `${API_URL}/candidates` must match the URL axios sends. Since `API_BASE_URL` defaults to `http://localhost:3010`, and `cypress.config.ts` sets `env.API_URL` to `http://localhost:3010`, these match.

---

### Step 8: Update `ai-specs/specs/frontend-standards.mdc`

Add two new subsections to the `Testing Standards > End-to-End Testing with Cypress` section. Append them after the existing `cy.request` example.

#### New subsection: cy.intercept Stubbing Pattern

```markdown
#### API Stubbing with cy.intercept

Use `cy.intercept` to stub API calls in E2E tests. This avoids test dependency on a running backend and enables testing of error scenarios (409, 500) reliably.

```typescript
// Stub a successful POST response
cy.intercept('POST', `${API_URL}/candidates`, {
  statusCode: 201,
  body: { success: true, data: { id: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' } },
}).as('createCandidate');

// Stub a conflict response
cy.intercept('POST', `${API_URL}/candidates`, {
  statusCode: 409,
  body: { success: false, error: { message: 'Email already registered', code: 'DUPLICATE_EMAIL' } },
}).as('createCandidate');

// Assert no request was made (validation prevented submission)
cy.get('@createCandidate.all').should('have.length', 0);

// Stub with delay (to test loading states)
cy.intercept('POST', `${API_URL}/candidates`, (req) => {
  req.on('response', (res) => { res.setDelay(500); });
  req.reply({ statusCode: 201, body: { success: true, data: { id: 1 } } });
}).as('createCandidate');
```
```

#### New subsection: multipart/form-data Service Pattern

```markdown
#### multipart/form-data Service Pattern

When sending `multipart/form-data` requests (e.g., file uploads with structured data):

1. Build a `FormData` object in the component and pass it to the service function.
2. Let axios set `Content-Type` automatically — never set it manually (axios adds the correct `boundary` parameter when it detects `FormData`).
3. Serialize nested arrays as JSON strings using `JSON.stringify`, because `multipart/form-data` does not support nested structures natively.

```typescript
// In the component
const fd = new FormData();
fd.append('firstName', firstName);
fd.append('educations', JSON.stringify(educations)); // array as JSON string
if (resume) fd.append('resume', resume); // File object

await candidateService.createCandidate(fd);

// In the service
export const candidateService = {
  createCandidate: async (data: FormData): Promise<CandidateResponse> => {
    // Do NOT set Content-Type header — axios handles it
    const response = await axios.post(`${API_BASE_URL}/candidates`, data);
    return response.data.data;
  },
};
```
```

---

## TypeScript Compilation Notes

The `tsconfig.json` has `"strict": true`. Critical consequences:

1. No implicit `any` anywhere — all function parameters and return types must be explicit.
2. `err: unknown` in catch blocks (not `err: any`) — use `isAxiosError(err)` for narrowing.
3. `File | null` for resume state — never just `File`.
4. Array index access like `errors.educations?.[i]?.institution` requires optional chaining because `errors.educations` may be undefined.
5. `e.target.files?.[0]` for the file input change handler — `files` can be null.

The `tsconfig.json` also sets `"include": ["src"]` — Cypress files at `cypress/e2e/` are NOT included in the TypeScript compilation. Cypress tests compile with their own separate config (Cypress handles this internally). Do NOT add `"cypress"` to `tsconfig.json` include array — it would break the CRA build.

---

## Potential Pitfalls and Edge Cases

### 1. Bootstrap CSS import in App.tsx
`import 'bootstrap/dist/css/bootstrap.min.css'` must be in `App.tsx` (or `index.tsx`) BEFORE any component imports. If placed after component imports, styles may load in the wrong order.

### 2. The existing App.test.tsx will break
The test file at `frontend/src/tests/App.test.tsx` checks for "learn react" text. After replacing `App.tsx`, this test fails. Update the test as shown in Step 6.

### 3. React Bootstrap Form.Control.Feedback vs custom div for email-error testid
`Form.Control.Feedback` renders a div with class `invalid-feedback`. You cannot easily add `data-testid` to it without a wrapper. Use an explicit conditional div:
```tsx
{errors.email && (
  <div data-testid="email-error" className="invalid-feedback d-block">
    {errors.email}
  </div>
)}
```
The `d-block` Bootstrap class makes the element visible (normally `invalid-feedback` has `display: none` unless Bootstrap's validation classes apply).

### 4. Remove button visibility vs accessibility
The remove education button must NOT render when there is only one education entry (not just disabled — entirely absent). The Cypress test for validation does not attempt to remove, but other test scenarios or checklist items depend on this behavior.

### 5. Date comparison for endDate validation
Use string comparison (`edu.endDate < edu.startDate`) since the values from `type="date"` inputs are in `YYYY-MM-DD` ISO format. String lexicographic comparison is correct for ISO dates.

### 6. FormData and TypeScript's File type
When setting resume state from a file input: `e.target.files?.[0] ?? null`. TypeScript requires `e: React.ChangeEvent<HTMLInputElement>` (not the generic `React.ChangeEvent`).

### 7. cy.intercept URL matching
Cypress `cy.intercept` matches the full URL. The axios call goes to `http://localhost:3010/candidates`. The `cypress.config.ts` sets `env.API_URL` to `http://localhost:3010`. The test file reads `const API_URL = Cypress.env('API_URL') ?? 'http://localhost:3010'` and intercepts `${API_URL}/candidates`. These must align — they do with the defaults defined.

### 8. Cypress loading state test timing
The `res.setDelay(500)` delay in the loading state test gives Cypress 500ms to assert the button is disabled. The Cypress default command timeout is 4000ms, so `cy.get('[data-testid="submit-btn"]').should('be.disabled')` runs immediately after click and will catch the disabled state before the 500ms delay elapses.

---

## Colors

`frontend/src/index.css` currently has no custom CSS variables. Bootstrap 5 provides its own color system. Use only Bootstrap variant props (`variant="primary"`, `variant="outline-danger"`, etc.) for buttons and alerts. Do not add custom color classes — they are not defined in `index.css`.

---

## Summary of Files to Create/Modify

### New Files
- `/home/juan/Documents/repos/AI4Devs-lab-ides-2603-Sr_II/frontend/cypress.config.ts`
- `/home/juan/Documents/repos/AI4Devs-lab-ides-2603-Sr_II/frontend/src/services/candidateService.ts`
- `/home/juan/Documents/repos/AI4Devs-lab-ides-2603-Sr_II/frontend/src/components/AddCandidateForm.tsx`
- `/home/juan/Documents/repos/AI4Devs-lab-ides-2603-Sr_II/frontend/cypress/e2e/candidates.cy.ts`

### Modified Files
- `/home/juan/Documents/repos/AI4Devs-lab-ides-2603-Sr_II/frontend/package.json` — add dependencies + cypress scripts
- `/home/juan/Documents/repos/AI4Devs-lab-ides-2603-Sr_II/frontend/src/App.tsx` — full replacement
- `/home/juan/Documents/repos/AI4Devs-lab-ides-2603-Sr_II/frontend/src/tests/App.test.tsx` — update assertion
- `/home/juan/Documents/repos/AI4Devs-lab-ides-2603-Sr_II/ai-specs/specs/frontend-standards.mdc` — add cy.intercept and multipart patterns

### No Changes Needed
- `ai-specs/specs/api-spec.yml` — already fully documents `POST /candidates` with multipart/form-data, 201/409 responses
