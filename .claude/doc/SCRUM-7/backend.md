# Backend Implementation Plan: SCRUM-7 — POST /candidates

## Current State Analysis

### Existing codebase facts (read before implementation)

- `backend/src/index.ts`: 27 lines. Imports `PrismaClient` directly and exports it as `default`. Has a generic string "Something broke!" 500 handler using `res.type('text/plain')`. Has no `express.json()` middleware. Has no routes beyond `GET /`.
- `backend/src/tests/app.test.ts`: Expects `GET /` to return text `"Hello World!"` — but `index.ts` currently sends `"Hola LTI!"`. This test already fails; do not break it further, but also do not fix it as a side effect of SCRUM-7 work.
- `backend/jest.config.js`: No `coverageThreshold` configured. `testRegex` matches `(/tests/.*|(\\.|/)(test|spec))\\.tsx?$`, so files under `src/__tests__/` with `.test.ts` extension are matched by the second clause.
- `backend/prisma/schema.prisma`: Already has `Candidate`, `Education`, `WorkExperience`, `Resume` models matching all needed columns. No Prisma migration is needed.
- `backend/package.json`: No `multer` or `@types/multer`. Has `supertest`, `ts-jest`, Jest. TypeScript target `es5`, module `commonjs`, strict mode on.
- Directory `backend/src/` only contains `index.ts` and `tests/`. No domain/application/presentation/infrastructure subdirectories yet.

---

## Branch

Create branch `feature/SCRUM-7-backend` from the current branch (`solved-lab-ides-JFB`) before making any code changes:

```
git checkout -b feature/SCRUM-7-backend
```

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `backend/package.json` | Modify — add `multer` to dependencies, `@types/multer` to devDependencies |
| `backend/uploads/.gitkeep` | Create — empty file so the directory is tracked; add `backend/uploads/*` to `.gitignore` |
| `backend/src/infrastructure/prismaClient.ts` | Create |
| `backend/src/domain/models/Education.ts` | Create |
| `backend/src/domain/models/WorkExperience.ts` | Create |
| `backend/src/domain/models/Candidate.ts` | Create |
| `backend/src/domain/repositories/ICandidateRepository.ts` | Create |
| `backend/src/infrastructure/repositories/PrismaCandidateRepository.ts` | Create |
| `backend/src/application/errors.ts` | Create — typed domain errors |
| `backend/src/application/validator.ts` | Create |
| `backend/src/application/services/CandidateService.ts` | Create |
| `backend/src/presentation/controllers/CandidateController.ts` | Create |
| `backend/src/routes/candidateRoutes.ts` | Create |
| `backend/src/index.ts` | Modify — mount routes, fix error handler, add `express.json()`, remove inline PrismaClient construction |
| `backend/jest.config.js` | Modify — add `coverageThreshold` (90%) and `collectCoverageFrom` |
| `backend/src/__tests__/candidate.test.ts` | Create |
| `ai-specs/specs/api-spec.yml` | Modify — update `POST /candidates` to multipart/form-data, add 409, align success schema |

---

## Step-by-Step Implementation

### Step 1: Install multer

Run inside `backend/`:
```
npm install multer
npm install --save-dev @types/multer
```

Then manually confirm `backend/package.json` now lists:
- `"multer": "^1.x.x"` under `dependencies`
- `"@types/multer": "^1.x.x"` under `devDependencies`

Create `backend/uploads/.gitkeep` (empty file). Add `backend/uploads/*` and `!backend/uploads/.gitkeep` to `.gitignore` at the repo root or backend level if one exists.

---

### Step 2: `backend/src/infrastructure/prismaClient.ts`

**Purpose:** Single shared `PrismaClient` instance. All repositories import from here.

**Full content:**
```typescript
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

No additional configuration needed. `dotenv` is already loaded in `index.ts` before this module is first imported at request time.

---

### Step 3: Domain Models

All domain model files must have **zero Prisma imports**. They are plain TypeScript classes.

#### `backend/src/domain/models/Education.ts`

```typescript
export interface EducationData {
  institution: string;
  title: string;
  startDate: Date;
  endDate?: Date;
}

export class Education {
  readonly institution: string;
  readonly title: string;
  readonly startDate: Date;
  readonly endDate?: Date;

  constructor(data: EducationData) {
    this.institution = data.institution;
    this.title = data.title;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
  }
}
```

#### `backend/src/domain/models/WorkExperience.ts`

```typescript
export interface WorkExperienceData {
  company: string;
  position: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
}

export class WorkExperience {
  readonly company: string;
  readonly position: string;
  readonly description?: string;
  readonly startDate: Date;
  readonly endDate?: Date;

  constructor(data: WorkExperienceData) {
    this.company = data.company;
    this.position = data.position;
    this.description = data.description;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
  }
}
```

#### `backend/src/domain/models/Candidate.ts`

```typescript
import { Education } from './Education';
import { WorkExperience } from './WorkExperience';

export interface ResumeFile {
  path: string;
  mimeType: string;
}

export interface CandidateData {
  id?: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  educations: Education[];
  workExperiences: WorkExperience[];
  resumeFile?: ResumeFile;
}

export class Candidate {
  readonly id?: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone?: string;
  readonly address?: string;
  readonly educations: Education[];
  readonly workExperiences: WorkExperience[];
  readonly resumeFile?: ResumeFile;

  constructor(data: CandidateData) {
    this.id = data.id;
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.email = data.email;
    this.phone = data.phone;
    this.address = data.address;
    this.educations = data.educations;
    this.workExperiences = data.workExperiences;
    this.resumeFile = data.resumeFile;
  }
}
```

---

### Step 4: Repository Interface

#### `backend/src/domain/repositories/ICandidateRepository.ts`

```typescript
import type { Candidate } from '../models/Candidate';

export interface ICandidateRepository {
  save(candidate: Candidate): Promise<Candidate>;
}
```

The returned `Candidate` must include the database-assigned `id` (and nested IDs are not needed in the return contract for SCRUM-7, only the top-level id matters for the 201 response).

---

### Step 5: Typed Domain/Application Errors

#### `backend/src/application/errors.ts`

```typescript
export class ValidationError extends Error {
  readonly details: string[];

  constructor(message: string, details: string[]) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class DuplicateEmailError extends Error {
  constructor() {
    super('Email already registered');
    this.name = 'DuplicateEmailError';
  }
}
```

These are the only two typed errors surfaced to the controller. All other errors bubble up as generic `Error` and map to 500.

---

### Step 6: Prisma Repository Implementation

#### `backend/src/infrastructure/repositories/PrismaCandidateRepository.ts`

**Import:** `prisma` from `../prismaClient`. `Prisma` namespace from `@prisma/client` for error code checking. Domain models from `../../domain/models/*`. Interface from `../../domain/repositories/ICandidateRepository`. `DuplicateEmailError` from `../../application/errors`.

**Implementation notes:**

- Use a single `prisma.candidate.create()` with nested `create` blocks for `educations`, `workExperiences`, and optionally `resumes`. This is equivalent to a transaction for a single aggregate root create and avoids the overhead of explicit `$transaction`.
- The `Resume` model in the schema has `uploadDate DateTime` — populate it with `new Date()` at persist time.
- Catch `Prisma.PrismaClientKnownRequestError` where `error.code === 'P2002'` and rethrow `new DuplicateEmailError()`.
- All other errors propagate unchanged.

**Full structure:**
```typescript
import { Prisma } from '@prisma/client';
import { ICandidateRepository } from '../../domain/repositories/ICandidateRepository';
import { Candidate } from '../../domain/models/Candidate';
import { Education } from '../../domain/models/Education';
import { WorkExperience } from '../../domain/models/WorkExperience';
import { prisma } from '../prismaClient';
import { DuplicateEmailError } from '../../application/errors';

export class PrismaCandidateRepository implements ICandidateRepository {
  async save(candidate: Candidate): Promise<Candidate> {
    try {
      const created = await prisma.candidate.create({
        data: {
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          phone: candidate.phone ?? null,
          address: candidate.address ?? null,
          educations: {
            create: candidate.educations.map((edu) => ({
              institution: edu.institution,
              title: edu.title,
              startDate: edu.startDate,
              endDate: edu.endDate ?? null,
            })),
          },
          workExperiences: {
            create: candidate.workExperiences.map((we) => ({
              company: we.company,
              position: we.position,
              description: we.description ?? null,
              startDate: we.startDate,
              endDate: we.endDate ?? null,
            })),
          },
          resumes: candidate.resumeFile
            ? {
                create: [
                  {
                    filePath: candidate.resumeFile.path,
                    fileType: candidate.resumeFile.mimeType,
                    uploadDate: new Date(),
                  },
                ],
              }
            : undefined,
        },
      });

      return new Candidate({
        id: created.id,
        firstName: created.firstName,
        lastName: created.lastName,
        email: created.email,
        phone: created.phone ?? undefined,
        address: created.address ?? undefined,
        educations: candidate.educations,
        workExperiences: candidate.workExperiences,
        resumeFile: candidate.resumeFile,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new DuplicateEmailError();
      }
      throw error;
    }
  }
}
```

---

### Step 7: Validator

#### `backend/src/application/validator.ts`

**Purpose:** Validate the parsed DTO before the service builds domain objects. Returns typed result rather than throwing — the service throws on failure.

**Types to define in this file:**

```typescript
export interface EducationInput {
  institution: string;
  title: string;
  startDate: string;
  endDate?: string;
}

export interface WorkExperienceInput {
  company: string;
  position: string;
  description?: string;
  startDate: string;
  endDate?: string;
}

export interface CreateCandidateInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  educations: EducationInput[];
  workExperiences: WorkExperienceInput[];
  resumeFile?: { path: string; mimeType: string };
}

export interface ValidationResult {
  valid: boolean;
  details: string[];
}
```

**Validation rules (all error messages in English):**

Scalar fields:
- `firstName`: required, non-empty string, max 100 chars
- `lastName`: required, non-empty string, max 100 chars
- `email`: required, valid email format (use simple regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`), max 255 chars
- `phone`: optional; if present, max 15 chars
- `address`: optional; if present, max 100 chars

`educations` array:
- Required, must be an array
- Minimum 1 element
- Each element:
  - `institution`: required string, max 100 chars
  - `title`: required string, max 250 chars
  - `startDate`: required, must be a valid ISO date string (use `!isNaN(Date.parse(value))`)
  - `endDate`: optional; if present, must be valid ISO date; if both `startDate` and `endDate` are valid dates, `endDate` must be strictly after `startDate`

`workExperiences` array:
- Optional; if absent defaults to `[]`; if present and is an array, validate each element:
  - `company`: required string, max 100 chars
  - `position`: required string, max 100 chars
  - `description`: optional string, max 200 chars
  - `startDate`: required, valid ISO date string
  - `endDate`: optional; if present, valid ISO date; if both present, `endDate` must be strictly after `startDate`

**Function signature:**
```typescript
export function validateCreateCandidateInput(data: unknown): ValidationResult
```

Collect all errors into `details: string[]` and return `{ valid: false, details }` when any rule fails. Return `{ valid: true, details: [] }` when all pass.

**Important:** Do not use `any` type anywhere. The `data: unknown` parameter requires explicit type-narrowing before accessing properties. A practical approach: cast `data` to `Record<string, unknown>` after confirming it is a non-null object, then access each property and narrow individually.

---

### Step 8: Candidate Service

#### `backend/src/application/services/CandidateService.ts`

**Purpose:** Orchestrate validation → domain model construction → repository save → view mapping.

**Types:**

```typescript
// Input type — what the controller passes after parsing multipart fields
export interface CreateCandidateMultipartPayload {
  firstName: unknown;
  lastName: unknown;
  email: unknown;
  phone?: unknown;
  address?: unknown;
  educations: unknown;       // already JSON.parsed by controller, or raw unknown
  workExperiences: unknown;  // same
  resumeFile?: { path: string; mimeType: string };
}

// Output type — what maps to the 201 response body
export interface CreatedCandidateView {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  address: string | null;
}
```

**Constructor:**
```typescript
export class CandidateService {
  constructor(private readonly candidateRepository: ICandidateRepository) {}

  async createCandidate(
    payload: CreateCandidateMultipartPayload
  ): Promise<CreatedCandidateView>
}
```

**`createCandidate` implementation steps:**

1. Normalize the payload into the `CreateCandidateInput` shape expected by validator:
   - Coerce scalar fields to `string` (they come from `req.body` as `string` already for multipart text fields; treat missing/undefined as empty string for validator to catch as required-field error).
   - `educations` and `workExperiences` arrive as already-parsed arrays (the controller did JSON.parse before calling the service — see controller step).
   - `workExperiences` defaults to `[]` if not provided.
2. Call `validateCreateCandidateInput(normalizedInput)`.
3. If `!result.valid`, throw `new ValidationError('Validation failed', result.details)`.
4. Build domain `Candidate` from validated input:
   - Convert `startDate`/`endDate` strings to `Date` objects for `Education` and `WorkExperience` constructors.
   - Include `resumeFile` if present.
5. Call `this.candidateRepository.save(candidate)`.
6. If `DuplicateEmailError` is thrown from the repository, rethrow it (the controller catches it for 409).
7. Map the returned `Candidate` to `CreatedCandidateView`:
   ```typescript
   return {
     id: savedCandidate.id!,
     firstName: savedCandidate.firstName,
     lastName: savedCandidate.lastName,
     email: savedCandidate.email,
     phone: savedCandidate.phone ?? null,
     address: savedCandidate.address ?? null,
   };
   ```

**No Prisma imports in this file.**

---

### Step 9: Candidate Controller

#### `backend/src/presentation/controllers/CandidateController.ts`

**Purpose:** Parse multipart request, call service, map errors to HTTP.

```typescript
import { Request, Response, NextFunction } from 'express';
import { CandidateService } from '../../application/services/CandidateService';
import { ValidationError, DuplicateEmailError } from '../../application/errors';

export class CandidateController {
  constructor(private readonly candidateService: CandidateService) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // ... implementation
  };
}
```

**`create` method implementation:**

1. Extract text fields from `req.body` (populated by Multer for multipart):
   ```typescript
   const { firstName, lastName, email, phone, address } = req.body as Record<string, string | undefined>;
   ```

2. Parse `educations` JSON string with try/catch:
   ```typescript
   let educations: unknown;
   try {
     educations = req.body.educations ? JSON.parse(req.body.educations as string) : [];
   } catch {
     res.status(400).json({ error: 'Invalid JSON in educations field', details: ['educations must be a valid JSON array'] });
     return;
   }
   ```

3. Parse `workExperiences` JSON string with try/catch:
   ```typescript
   let workExperiences: unknown;
   try {
     workExperiences = req.body.workExperiences ? JSON.parse(req.body.workExperiences as string) : [];
   } catch {
     res.status(400).json({ error: 'Invalid JSON in workExperiences field', details: ['workExperiences must be a valid JSON array'] });
     return;
   }
   ```

4. Build `resumeFile` from `req.file` if present:
   ```typescript
   const resumeFile = req.file
     ? { path: req.file.path, mimeType: req.file.mimetype }
     : undefined;
   ```

5. Call service:
   ```typescript
   const result = await this.candidateService.createCandidate({
     firstName,
     lastName,
     email,
     phone,
     address,
     educations,
     workExperiences,
     resumeFile,
   });
   ```

6. Return 201:
   ```typescript
   res.status(201).json({ data: result });
   ```

7. Catch block:
   ```typescript
   catch (error: unknown) {
     if (error instanceof ValidationError) {
       res.status(400).json({ error: error.message, details: error.details });
       return;
     }
     if (error instanceof DuplicateEmailError) {
       res.status(409).json({ error: 'Email already registered' });
       return;
     }
     next(error); // let global handler return 500
   }
   ```

**Important:** Use `create = async (...) => {}` (arrow function as class property) so `this` binding is preserved when the method is passed as a route handler.

---

### Step 10: Routes

#### `backend/src/routes/candidateRoutes.ts`

**Purpose:** Mount Multer middleware and wire controller.

**Multer configuration:**
- Storage: `multer.diskStorage` with:
  - `destination`: `process.env.UPLOAD_DIR ?? 'uploads'`
  - `filename`: `Date.now() + '-' + file.originalname` (or similar unique name)
- `fileFilter`: Check `file.mimetype` against `['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']`. If not whitelisted, call `cb(new Error('Invalid file type. Only PDF, DOC, and DOCX are allowed'), false)`.
- `limits`: `{ fileSize: 5 * 1024 * 1024 }` (5 MB)

**Route setup:**
```typescript
import { Router } from 'express';
import multer from 'multer';
import { CandidateController } from '../presentation/controllers/CandidateController';
import { CandidateService } from '../application/services/CandidateService';
import { PrismaCandidateRepository } from '../infrastructure/repositories/PrismaCandidateRepository';

const repository = new PrismaCandidateRepository();
const service = new CandidateService(repository);
const controller = new CandidateController(service);

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, process.env.UPLOAD_DIR ?? 'uploads');
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, and DOCX are allowed'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = Router();

router.post('/', upload.single('resume'), controller.create);

export default router;
```

**Multer error handling note:** When Multer rejects a file (fileFilter cb with Error, or fileSize exceeded), it calls `next(err)` automatically. The controller will not be invoked. The global error handler in `index.ts` must handle Multer errors and return 400. See Step 11.

---

### Step 11: Update `backend/src/index.ts`

**Current state:** Has inline `new PrismaClient()`, plain-text 500 handler, no `express.json()`, no routes beyond `GET /`.

**Required changes:**

1. Remove `import { PrismaClient } from '@prisma/client'` and `const prisma = new PrismaClient()` and `export default prisma` — prisma is now in `infrastructure/prismaClient.ts`.
2. Add `app.use(express.json())` — needed for any future JSON routes (multipart route uses Multer, not JSON body parser, but no harm adding).
3. Import and mount `candidateRoutes`:
   ```typescript
   import candidateRouter from './routes/candidateRoutes';
   app.use('/candidates', candidateRouter);
   ```
4. Replace the global error handler with a JSON-returning version that also handles Multer errors:
   ```typescript
   app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
     console.error(err);
     // Multer errors (file too large, invalid type) — return 400
     if (err instanceof Error && (err.message.startsWith('Invalid file type') || err.message === 'File too large')) {
       res.status(400).json({ error: err.message, details: [err.message] });
       return;
     }
     res.status(500).json({ error: 'Internal server error' });
   });
   ```
5. Keep `export const app = express()` for supertest compatibility with existing tests.
6. Keep `app.listen(...)`.

**Complete new `index.ts`:**
```typescript
import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import candidateRouter from './routes/candidateRoutes';

dotenv.config();

export const app = express();

const port = process.env.PORT ?? 3010;

app.use(express.json());

app.get('/', (_req: Request, res: Response) => {
  res.send('Hola LTI!');
});

app.use('/candidates', candidateRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (err instanceof Error) {
    if (
      err.message.startsWith('Invalid file type') ||
      err.message === 'File too large'
    ) {
      res.status(400).json({ error: err.message, details: [err.message] });
      return;
    }
  }
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
```

**Note:** The existing `app.test.ts` expects `res.text === 'Hello World!'` but index sends `'Hola LTI!'` — that test was already failing before SCRUM-7. Do not change the route text (it is out of scope). The test failure is pre-existing.

---

### Step 12: Update `backend/jest.config.js`

Add `coverageThreshold` and `collectCoverageFrom`:

```javascript
module.exports = {
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testRegex: '(/tests/.*|(\\.|/)(test|spec))\\.tsx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
```

The `testRegex` already matches `src/__tests__/candidate.test.ts` via the `(\\.|/)(test|spec)` clause.

---

### Step 13: Tests

#### `backend/src/__tests__/candidate.test.ts`

**Purpose:** Unit tests for `CandidateService` with mocked `ICandidateRepository`. No real database.

**Test structure:**

```typescript
import { CandidateService } from '../application/services/CandidateService';
import { ICandidateRepository } from '../domain/repositories/ICandidateRepository';
import { Candidate } from '../domain/models/Candidate';
import { ValidationError, DuplicateEmailError } from '../application/errors';

// Minimal valid payload factory
const makeValidPayload = () => ({
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane.doe@example.com',
  phone: undefined,
  address: undefined,
  educations: [
    {
      institution: 'MIT',
      title: 'Computer Science',
      startDate: '2015-09-01',
      endDate: '2019-06-30',
    },
  ],
  workExperiences: [],
  resumeFile: undefined,
});
```

**Test cases (describe blocks and it descriptions):**

```
describe('CandidateService.createCandidate', () => {
  describe('happy path', () => {
    it('should return a CreatedCandidateView with id when payload is valid', ...)
    it('should include phone and address when provided', ...)
    it('should handle optional resumeFile when provided', ...)
  });

  describe('validation errors', () => {
    it('should throw ValidationError when firstName is missing', ...)
    it('should throw ValidationError when email is missing', ...)
    it('should throw ValidationError when email format is invalid', ...)
    it('should throw ValidationError when educations array is empty', ...)
    it('should throw ValidationError when education endDate is before startDate', ...)
    it('should throw ValidationError when firstName exceeds 100 characters', ...)
  });

  describe('duplicate email', () => {
    it('should rethrow DuplicateEmailError when repository throws it', ...)
  });
});
```

**Mocking approach:**
```typescript
const mockRepository: jest.Mocked<ICandidateRepository> = {
  save: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRepository.save.mockResolvedValue(
    new Candidate({ id: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane.doe@example.com', educations: [], workExperiences: [] })
  );
});
```

**Important notes on test file:**
- The test file is at `src/__tests__/candidate.test.ts`. Jest's `testRegex` in the current config matches this path.
- Do not mock `PrismaCandidateRepository` — inject `mockRepository` directly into `CandidateService` constructor.
- All test strings and descriptions in English.
- Follow AAA (Arrange / Act / Assert) with a blank line between sections.
- Use `await expect(promise).rejects.toThrow(ValidationError)` pattern and also check `.rejects.toMatchObject({ details: expect.arrayContaining(['...message...']) })` for detail assertions.

---

### Step 14: Update `ai-specs/specs/api-spec.yml`

Changes needed in the existing file:

1. Change `POST /candidates` request body from `application/json` with `$ref: '#/components/schemas/CreateCandidateRequest'` to `multipart/form-data` with inline schema:
   ```yaml
   requestBody:
     required: true
     content:
       multipart/form-data:
         schema:
           type: object
           required:
             - firstName
             - lastName
             - email
             - educations
           properties:
             firstName:
               type: string
               maxLength: 100
             lastName:
               type: string
               maxLength: 100
             email:
               type: string
               format: email
               maxLength: 255
             phone:
               type: string
               maxLength: 15
             address:
               type: string
               maxLength: 100
             educations:
               type: string
               description: JSON-encoded array of education objects
             workExperiences:
               type: string
               description: JSON-encoded array of work experience objects (optional, defaults to empty array)
             resume:
               type: string
               format: binary
               description: Resume file (PDF, DOC, or DOCX, max 5MB)
   ```

2. Change `POST /candidates` 400 response to use a specific error schema (or inline) that shows `{ error, details }`.

3. Add `409` response to `POST /candidates`:
   ```yaml
   '409':
     description: Email already registered
     content:
       application/json:
         schema:
           type: object
           properties:
             error:
               type: string
               example: "Email already registered"
   ```

4. Change `CreateCandidateResponse` to show the `{ data: { ... } }` wrapper:
   ```yaml
   CreateCandidateResponse:
     type: object
     properties:
       data:
         type: object
         properties:
           id:
             type: integer
           firstName:
             type: string
           lastName:
             type: string
           email:
             type: string
           phone:
             type: string
             nullable: true
           address:
             type: string
             nullable: true
         required:
           - id
           - firstName
           - lastName
           - email
     required:
       - data
   ```

5. Update `ErrorResponse` to match actual 400 body shape used by this endpoint:
   The existing `ErrorResponse` has `message` and `error`. The implementation sends `{ error, details }`. Either update the schema or add a new `ValidationErrorResponse` schema and reference it only from the 400 response of POST /candidates.

---

## Implementation Order

Execute in this exact order to avoid import-time errors:

1. Create feature branch
2. Install multer (npm install)
3. Create `uploads/.gitkeep` and update `.gitignore`
4. Create `src/infrastructure/prismaClient.ts`
5. Create `src/domain/models/Education.ts`
6. Create `src/domain/models/WorkExperience.ts`
7. Create `src/domain/models/Candidate.ts`
8. Create `src/domain/repositories/ICandidateRepository.ts`
9. Create `src/application/errors.ts`
10. Create `src/infrastructure/repositories/PrismaCandidateRepository.ts`
11. Create `src/application/validator.ts`
12. Create `src/application/services/CandidateService.ts`
13. Create `src/presentation/controllers/CandidateController.ts`
14. Create `src/routes/candidateRoutes.ts`
15. Modify `src/index.ts`
16. Modify `jest.config.js`
17. Create `src/__tests__/candidate.test.ts`
18. Run `npm run build` — fix any TypeScript errors before running tests
19. Run `npm test` — fix failures
20. Modify `ai-specs/specs/api-spec.yml`
21. Commit all files

---

## Critical Implementation Notes

### TypeScript strict mode compliance

- **Never use `any` type.** Use `unknown` and narrow types explicitly.
- `req.body` fields from Multer multipart are `string | undefined` for text fields. Type them as `Record<string, string | undefined>` or access via bracket notation with explicit type assertions.
- `req.file` is `Express.Multer.File | undefined`. Check for existence before accessing properties.
- The `err` parameter in the global error handler and catch blocks must be typed `unknown`, then narrowed with `instanceof Error` before accessing `.message`.

### Multer and `express.json()` coexistence

- `express.json()` and Multer can coexist. Multer only processes multipart requests for the routes it is applied to. `express.json()` processes requests with `Content-Type: application/json` and ignores multipart. No conflict.

### `id` optionality on `Candidate`

- `Candidate.id` is `number | undefined` (optional, not yet assigned before persistence). After `repository.save()` returns, `id` is always defined. Use non-null assertion `savedCandidate.id!` in the service when building the view, since the type cannot be narrowed further without runtime check.

### Existing test failure

- `src/tests/app.test.ts` expects `"Hello World!"` but `index.ts` sends `"Hola LTI!"`. This test fails today before SCRUM-7. Do not fix it as part of this ticket (it is out of scope). The test run will show this failure as pre-existing.

### The `__tests__` vs `tests` directory distinction

- Existing tests are in `src/tests/` (the `tests` folder with no double underscore).
- New tests go in `src/__tests__/` (double underscore, matching Jest's default `testMatch` for `__tests__` directories AND covered by the existing `testRegex` second clause `(\\.|/)(test|spec)` which matches any `.test.ts` file regardless of directory).
- Both directories will be picked up by Jest. Do not rename the existing `tests/` directory.

### PrismaClient export change in index.ts

- Current `index.ts` exports `default prisma`. Removing this will break any code that does `import prisma from '../index'`. Search the codebase for such imports before removing. Since `src/` currently only contains `index.ts` and `tests/`, and the test does not import prisma, this is safe to remove.

### `uploadDate` in Resume model

- The Prisma `Resume` model requires `uploadDate DateTime`. The repository must provide `uploadDate: new Date()` in the nested `resumes.create` block. Do not forget this field — its absence will cause a Prisma runtime error (not a TypeScript error if you cast incorrectly).

### Error handler signature

- Express's 4-argument error handler `(err, req, res, next)` must have all 4 parameters declared for Express to recognize it as an error handler, even if `next` is unused. Prefix unused parameters with underscore (`_next`) to satisfy the `no-unused-vars` TypeScript rule.

### `workExperiences` nullability

- The `workExperiences` field in the schema has `startDate DateTime` (non-nullable). The validator must enforce `startDate` is present for each work experience item.

### File upload directory must exist at runtime

- Multer diskStorage will throw if `UPLOAD_DIR` does not exist on the filesystem. Either:
  - Create `backend/uploads/` with the `.gitkeep` file (done in Step 3), OR
  - Add startup code in `index.ts` to `fs.mkdirSync(process.env.UPLOAD_DIR ?? 'uploads', { recursive: true })`.
  - Recommended: do both — commit `.gitkeep` so CI has the directory, and add `mkdirSync` as a safety net.

---

## Error Response Contract (reference)

| HTTP Status | Body | Trigger |
|-------------|------|---------|
| 201 | `{ "data": { "id": number, "firstName": string, "lastName": string, "email": string, "phone": string\|null, "address": string\|null } }` | Successful creation |
| 400 | `{ "error": string, "details": string[] }` | Validation failure, bad JSON in multipart fields, Multer file rejection |
| 409 | `{ "error": "Email already registered" }` | Unique constraint on `email` (Prisma P2002) |
| 500 | `{ "error": "Internal server error" }` | Any unhandled error |
