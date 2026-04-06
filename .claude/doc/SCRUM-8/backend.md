# Backend Implementation Plan: SCRUM-8 — Candidate Data Security & Privacy Hardening

## Current State (from SCRUM-7 — verified by reading actual files)

All files below were read before this plan was written. Key facts:

- `backend/src/index.ts`: Exports `app`. Uses `dotenv.config()` at top. Mounts `candidateRoutes` at `/candidates`. Has a `multer.MulterError` handler that currently covers `LIMIT_FILE_SIZE` with error message `'Resume file must be at most 5 MB'`. No helmet or cors.
- `backend/src/routes/candidateRoutes.ts`: Multer configured with `MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024` (5 MB) and `ALLOWED_MIME_TYPES` covering pdf, msword, and docx. Filename uses `Date.now()-random-suffix`. Exports `candidateRoutes` (named export). No rate limiter.
- `backend/src/application/validator.ts`: Validates firstName/lastName (max 100, no min), email (regex, max 255), phone (optional, max 15 chars — no Spanish phone pattern), address (optional, max 100). Returns typed `CreateCandidateDto` directly (throws on error). No HTML stripping. Email not normalized to lowercase.
- `backend/src/application/services/CandidateService.ts`: Takes `CreateCandidateMultipartPayload { body, resumeFile? }`. Calls validator on `payload.body`. No magic-byte validation. No file rename. Passes `resumeFile` directly to `Candidate` domain model.
- `backend/src/presentation/controllers/CandidateController.ts`: Returns `{ data: result }` — result is `CreatedCandidateView { id, firstName, lastName, email, phone, address }`. No `filePath` is in the view — already correct for SCRUM-8.
- `backend/src/infrastructure/repositories/PrismaCandidateRepository.ts`: `DuplicateEmailError` class is defined here (not in errors.ts). The existing test imports it from here.
- `backend/src/domain/models/Candidate.ts`: Simple class with positional constructor params. `ResumeFile { path, mimeType }` defined here.
- `backend/jest.config.js`: `testRegex` matches `(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$` — so `src/__tests__/` and any `.test.ts` file in `src/` are both picked up.
- `backend/src/tests/app.test.ts`: Expects `'Hello LTI!!'` and is currently PASSING (the actual index.ts sends `'Hello LTI!!'`). Do NOT break this test.
- `backend/src/__tests__/candidate.test.ts`: Has a test using `phone: '+34600000001'` — this value starts with `+34` prefix, not the bare Spanish digit pattern. This is important for the phone validator update (see Step 5 below).
- `backend/package.json`: Has `multer@^2.1.1`, `dotenv`, `express`, `supertest`. No `helmet`, `cors`, `express-rate-limit`.
- TypeScript `target: es5`, `module: commonjs` — project is CJS. `file-type` v16+ is ESM-only. Must use a manual magic-byte helper instead.

---

## Branch

Create `feature/SCRUM-8-backend` from `feature/SCRUM-7-backend` (which is already implemented):

```
git checkout feature/SCRUM-7-backend
git pull  # if needed
git checkout -b feature/SCRUM-8-backend
```

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `backend/package.json` | Modify — add `helmet`, `cors`, `express-rate-limit`; add `@types/cors` to devDependencies |
| `backend/.env.example` | Create — document all env vars |
| `backend/src/index.ts` | Modify — add helmet, cors; fix MulterError message for 10 MB limit |
| `backend/src/routes/candidateRoutes.ts` | Modify — add rate limiter, update file size limit to 10 MB |
| `backend/src/application/validator.ts` | Modify — add Spanish phone pattern, HTML stripping, email normalization, name min-length (2 chars) |
| `backend/src/infrastructure/magicBytes.ts` | Create — magic-byte detection helper |
| `backend/src/application/services/CandidateService.ts` | Modify — add magic-byte validation and UUID file rename |
| `backend/src/presentation/controllers/CandidateController.ts` | Verify — already safe (no filePath in response) |
| `backend/src/__tests__/security.test.ts` | Create — unit tests for validator security rules |
| `backend/src/__tests__/magicBytes.test.ts` | Create — unit tests for magic-byte helper |
| `backend/src/__tests__/integration/security.integration.test.ts` | Create — supertest integration tests |

---

## Step-by-Step Implementation

### Step 0: Create Feature Branch

```bash
cd /home/juan/Documents/repos/AI4Devs-lab-ides-2603-Sr_II
git checkout feature/SCRUM-7-backend
git checkout -b feature/SCRUM-8-backend
```

---

### Step 1: Install Dependencies

Run inside `backend/`:

```bash
npm install helmet cors express-rate-limit
npm install --save-dev @types/cors
```

After running, `package.json` will add:
- `dependencies`: `helmet`, `cors`, `express-rate-limit`
- `devDependencies`: `@types/cors`

Note: `helmet` and `express-rate-limit` ship their own TypeScript types — no separate `@types/*` needed for them.

Do NOT install `file-type` — it is ESM-only. Use the manual `magicBytes.ts` helper instead (Step 6).

---

### Step 2: Create `backend/src/infrastructure/magicBytes.ts`

This is a new file. Full content:

```typescript
// Magic byte signatures for allowed file types
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
const DOCX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK (ZIP-based format)

export type AllowedMimeType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function detectFileType(buffer: Buffer): AllowedMimeType | null {
  if (buffer.length < 4) return null;
  const header = buffer.subarray(0, 4);
  if (header.equals(PDF_MAGIC)) return 'application/pdf';
  if (header.equals(DOCX_MAGIC))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return null;
}

export function validateMagicBytes(buffer: Buffer, declaredMimeType: string): boolean {
  const detected = detectFileType(buffer);
  if (!detected) return false;
  return detected === declaredMimeType;
}
```

Notes:
- `application/msword` (legacy `.doc`) is NOT supported by magic-byte validation because `.doc` is a compound document format (starts with `D0 CF 11 E0`) and is no longer in `ALLOWED_MIME_TYPES` for SCRUM-8 (only PDF and DOCX). The `candidateRoutes.ts` `ALLOWED_MIME_TYPES` must also be updated to remove `application/msword` — see Step 3.
- `Buffer.subarray` is preferred over `Buffer.slice` (deprecated in Node 17+).

---

### Step 3: Modify `backend/src/routes/candidateRoutes.ts`

Changes needed:
1. Add `express-rate-limit` import and middleware.
2. Update `MAX_FILE_SIZE_BYTES` from 5 MB to 10 MB.
3. Remove `application/msword` from `ALLOWED_MIME_TYPES` (`.doc` format not supported by magic-byte check; SCRUM-8 requires content validation — legacy `.doc` has a different magic signature not implemented).
4. Update the multer error message to reference 10 MB.

Full content of the modified file:

```typescript
import { Router } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { CandidateController } from '../presentation/controllers/CandidateController';
import { CandidateService } from '../application/services/CandidateService';
import { PrismaCandidateRepository } from '../infrastructure/repositories/PrismaCandidateRepository';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

const candidateRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        message: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
      },
    });
  },
});

const repository = new PrismaCandidateRepository();
const service = new CandidateService(repository);
const controller = new CandidateController(service);

const router = Router();

router.use(candidateRateLimiter);

router.post('/', upload.single('resume'), (req, res, next) => {
  controller.create(req, res, next);
});

export { router as candidateRoutes };
```

Important: The `router.use(candidateRateLimiter)` line MUST come before `router.post(...)` to apply to all routes on this router.

---

### Step 4: Modify `backend/src/index.ts`

Changes needed:
1. Add `helmet` and `cors` imports.
2. Add `parseAllowedOrigins` helper function.
3. Add `app.use(helmet(...))` before routes.
4. Add `app.use(cors(...))` before routes.
5. Update the `LIMIT_FILE_SIZE` multer error message from `'Resume file must be at most 5 MB'` to `'Resume file must be at most 10 MB'` (consistent with the updated limit in routes).

Full content of the modified file:

```typescript
import { Request, Response, NextFunction } from 'express';
import express from 'express';
import multer from 'multer';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { candidateRoutes } from './routes/candidateRoutes';

dotenv.config();

export const app = express();

const port = process.env.PORT ?? 3010;

// Security headers — disable CSP for a pure JSON API; disable HSTS in non-production
app.use(
  helmet({
    contentSecurityPolicy: false,
    hsts:
      process.env.NODE_ENV === 'production'
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
  }),
);

// CORS — only allow origins listed in ALLOWED_ORIGINS env var
function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (same-origin, curl, Postman) only in non-production
      if (!origin) {
        callback(null, process.env.NODE_ENV !== 'production');
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }),
);

app.use(express.json());

app.get('/', (_req: Request, res: Response) => {
  res.send('Hello LTI!!');
});

app.use('/candidates', candidateRoutes);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        error: 'File too large',
        details: ['Resume file must be at most 10 MB'],
      });
      return;
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({
        error: 'Invalid file type',
        details: ['Resume must be a PDF or Word document (DOCX)'],
      });
      return;
    }
    res.status(400).json({
      error: 'File upload error',
      details: [err.message],
    });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
```

Critical notes:
- `helmet()` and `cors()` MUST be placed before `app.use('/candidates', candidateRoutes)`.
- `dotenv.config()` stays at the very top (already there).
- The existing `app.get('/')` route and its response text `'Hello LTI!!'` must NOT change — `src/tests/app.test.ts` asserts exactly this string and is currently passing.
- The error handler 4-argument signature `(err, _req, res, _next)` must be preserved — Express identifies error handlers by arity.

---

### Step 5: Modify `backend/src/application/validator.ts`

This is the most invasive change. The existing `validateCreateCandidateInput` function is modified in place. Changes:

1. Add `sanitizeString(input: string): string` helper — strips HTML tags using a regex.
2. Add `normalizeEmail(email: string): string` helper — lowercases and trims.
3. Update `firstName`/`lastName` validation: add minimum length 2 chars, strip HTML before length check, restrict charset to letters/spaces/hyphens/apostrophes (Unicode-aware).
4. Update `email` validation: normalize to lowercase before validation and return.
5. Update `phone` validation: change from max-15-chars to Spanish pattern `^[679]\d{8}$`.
6. Update `address` validation: strip HTML tags before returning.
7. The `CreateCandidateDto.email` field in the returned DTO must be the normalized (lowercased) value.

CRITICAL: The existing `candidate.test.ts` uses `phone: '+34600000001'` in a test that asserts `result.phone === '+34600000001'`. This phone value has a `+34` prefix and does NOT match the Spanish pattern `^[679]\d{8}$`. That test passes through the validator because it only checks that `result.phone` comes back from the saved candidate (the mock returns it directly — the validator is what throws). Looking at the test carefully: the phone goes through `validateCreateCandidateInput` in `CandidateService.createCandidate`. If the new Spanish phone regex is strict (`^[679]\d{8}$`), then `'+34600000001'` will fail validation and the existing test "returns phone and address when provided in the payload" will BREAK.

Resolution: Update that test's phone value to a valid Spanish phone like `'612345678'` when modifying the test file. Since `candidate.test.ts` is an existing SCRUM-7 test, we need to update it as part of SCRUM-8 to be consistent with the new phone validation rule. This is the correct approach — the test data was using an unrealistic phone format.

Full new content of `backend/src/application/validator.ts`:

```typescript
export interface EducationDto {
  institution: string;
  title: string;
  startDate: string;
  endDate?: string;
}

export interface WorkExperienceDto {
  company: string;
  position: string;
  description?: string;
  startDate: string;
  endDate?: string;
}

export interface CreateCandidateDto {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  educations: EducationDto[];
  workExperiences: WorkExperienceDto[];
}

export class ValidationError extends Error {
  constructor(public readonly details: string[]) {
    super('Validation failed');
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

// Helpers

/**
 * Strips HTML tags from a string to prevent stored XSS.
 */
export function sanitizeString(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

/**
 * Normalizes an email address to lowercase and removes surrounding whitespace.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Validation constants
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Spanish phone: 9 digits starting with 6, 7, or 9
const SPANISH_PHONE_REGEX = /^[679]\d{8}$/;
// Allowed characters for names: letters (Unicode), spaces, hyphens, apostrophes
const NAME_CHARS_REGEX = /^[\p{L}\s'\-]+$/u;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidIsoDate(value: string): boolean {
  const date = new Date(value);
  return !isNaN(date.getTime());
}

function validateEducation(item: unknown, index: number, errors: string[]): void {
  if (typeof item !== 'object' || item === null) {
    errors.push(`educations[${index}]: must be an object`);
    return;
  }

  const edu = item as Record<string, unknown>;

  if (!isNonEmptyString(edu.institution)) {
    errors.push(`educations[${index}].institution: required`);
  } else if ((edu.institution as string).length > 100) {
    errors.push(`educations[${index}].institution: must be at most 100 characters`);
  }

  if (!isNonEmptyString(edu.title)) {
    errors.push(`educations[${index}].title: required`);
  } else if ((edu.title as string).length > 250) {
    errors.push(`educations[${index}].title: must be at most 250 characters`);
  }

  if (!isNonEmptyString(edu.startDate)) {
    errors.push(`educations[${index}].startDate: required`);
  } else if (!isValidIsoDate(edu.startDate as string)) {
    errors.push(`educations[${index}].startDate: must be a valid date`);
  } else if (edu.endDate !== undefined && edu.endDate !== null && edu.endDate !== '') {
    if (!isNonEmptyString(edu.endDate)) {
      errors.push(`educations[${index}].endDate: must be a valid date string if provided`);
    } else if (!isValidIsoDate(edu.endDate as string)) {
      errors.push(`educations[${index}].endDate: must be a valid date`);
    } else {
      const start = new Date(edu.startDate as string);
      const end = new Date(edu.endDate as string);
      if (end <= start) {
        errors.push(`educations[${index}].endDate: must be after startDate`);
      }
    }
  }
}

function validateWorkExperience(item: unknown, index: number, errors: string[]): void {
  if (typeof item !== 'object' || item === null) {
    errors.push(`workExperiences[${index}]: must be an object`);
    return;
  }

  const exp = item as Record<string, unknown>;

  if (!isNonEmptyString(exp.company)) {
    errors.push(`workExperiences[${index}].company: required`);
  }

  if (!isNonEmptyString(exp.position)) {
    errors.push(`workExperiences[${index}].position: required`);
  }

  if (!isNonEmptyString(exp.startDate)) {
    errors.push(`workExperiences[${index}].startDate: required`);
  } else if (!isValidIsoDate(exp.startDate as string)) {
    errors.push(`workExperiences[${index}].startDate: must be a valid date`);
  } else if (exp.endDate !== undefined && exp.endDate !== null && exp.endDate !== '') {
    if (!isNonEmptyString(exp.endDate)) {
      errors.push(`workExperiences[${index}].endDate: must be a valid date string if provided`);
    } else if (!isValidIsoDate(exp.endDate as string)) {
      errors.push(`workExperiences[${index}].endDate: must be a valid date`);
    } else {
      const start = new Date(exp.startDate as string);
      const end = new Date(exp.endDate as string);
      if (end <= start) {
        errors.push(`workExperiences[${index}].endDate: must be after startDate`);
      }
    }
  }
}

export function validateCreateCandidateInput(data: unknown): CreateCandidateDto {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null) {
    throw new ValidationError(['Input must be an object']);
  }

  const input = data as Record<string, unknown>;

  // firstName: required, 2-100 chars, letters/spaces/hyphens/apostrophes only, strip HTML first
  let firstName = '';
  if (!isNonEmptyString(input.firstName)) {
    errors.push('firstName: required');
  } else {
    firstName = sanitizeString((input.firstName as string).trim());
    if (firstName.length < 2) {
      errors.push('firstName: must be at least 2 characters');
    } else if (firstName.length > 100) {
      errors.push('firstName: must be at most 100 characters');
    } else if (!NAME_CHARS_REGEX.test(firstName)) {
      errors.push('firstName: must contain only letters, spaces, hyphens, or apostrophes');
    }
  }

  // lastName: same rules as firstName
  let lastName = '';
  if (!isNonEmptyString(input.lastName)) {
    errors.push('lastName: required');
  } else {
    lastName = sanitizeString((input.lastName as string).trim());
    if (lastName.length < 2) {
      errors.push('lastName: must be at least 2 characters');
    } else if (lastName.length > 100) {
      errors.push('lastName: must be at most 100 characters');
    } else if (!NAME_CHARS_REGEX.test(lastName)) {
      errors.push('lastName: must contain only letters, spaces, hyphens, or apostrophes');
    }
  }

  // email: required, valid format, max 255, normalize to lowercase
  let normalizedEmail = '';
  if (!isNonEmptyString(input.email)) {
    errors.push('email: required');
  } else {
    normalizedEmail = normalizeEmail(input.email as string);
    if (normalizedEmail.length > 255) {
      errors.push('email: must be at most 255 characters');
    } else if (!EMAIL_REGEX.test(normalizedEmail)) {
      errors.push('email: must be a valid email address');
    }
  }

  // phone: optional, Spanish pattern (9 digits starting with 6, 7, or 9)
  let phone: string | undefined;
  if (input.phone !== undefined && input.phone !== null && input.phone !== '') {
    if (typeof input.phone !== 'string') {
      errors.push('phone: must be a string');
    } else {
      const trimmedPhone = input.phone.trim();
      if (!SPANISH_PHONE_REGEX.test(trimmedPhone)) {
        errors.push('phone: must be a valid Spanish phone number (9 digits starting with 6, 7, or 9)');
      } else {
        phone = trimmedPhone;
      }
    }
  }

  // address: optional, max 100 chars, strip HTML
  let address: string | undefined;
  if (input.address !== undefined && input.address !== null && input.address !== '') {
    if (typeof input.address !== 'string') {
      errors.push('address: must be a string');
    } else {
      const sanitizedAddress = sanitizeString(input.address.trim());
      if (sanitizedAddress.length > 100) {
        errors.push('address: must be at most 100 characters');
      } else {
        address = sanitizedAddress;
      }
    }
  }

  // educations
  if (!Array.isArray(input.educations)) {
    errors.push('educations: required and must be an array');
  } else if (input.educations.length === 0) {
    errors.push('educations: must contain at least one entry');
  } else {
    input.educations.forEach((item: unknown, index: number) => {
      validateEducation(item, index, errors);
    });
  }

  // workExperiences
  const workExperiences = input.workExperiences;
  if (workExperiences !== undefined && !Array.isArray(workExperiences)) {
    errors.push('workExperiences: must be an array if provided');
  } else if (Array.isArray(workExperiences)) {
    workExperiences.forEach((item: unknown, index: number) => {
      validateWorkExperience(item, index, errors);
    });
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  const dto: CreateCandidateDto = {
    firstName,
    lastName,
    email: normalizedEmail,
    educations: (input.educations as EducationDto[]),
    workExperiences: Array.isArray(input.workExperiences)
      ? (input.workExperiences as WorkExperienceDto[])
      : [],
  };

  if (phone !== undefined) {
    dto.phone = phone;
  }

  if (address !== undefined) {
    dto.address = address;
  }

  return dto;
}
```

Note on `NAME_CHARS_REGEX = /^[\p{L}\s'\-]+$/u`: The `\p{L}` Unicode category property requires the `u` flag (ECMAScript 2018+). TypeScript target `es5` compiles to ES5 JavaScript but the `u` flag is a runtime feature — Node.js 14+ supports it. The project uses Node.js 20 (from `@types/node@^20`), so this is safe. The compiled output will still work at runtime.

---

### Step 6: Modify `backend/src/application/services/CandidateService.ts`

Changes:
1. Import `readFileSync`, `renameSync`, `unlinkSync`, `existsSync` from `fs`.
2. Import `randomUUID` from `crypto`.
3. Import `extname` from `path`.
4. Import `validateMagicBytes` from `../../infrastructure/magicBytes`.
5. After validator runs, if `payload.resumeFile` is provided: read file bytes, validate magic bytes, throw `ValidationError` on mismatch (and delete the invalid file), then rename to UUID-based filename.

Full content of the modified file:

```typescript
import { readFileSync, renameSync, unlinkSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { extname, dirname } from 'path';
import type { ICandidateRepository } from '../../domain/repositories/ICandidateRepository';
import { Candidate } from '../../domain/models/Candidate';
import { Education } from '../../domain/models/Education';
import { WorkExperience } from '../../domain/models/WorkExperience';
import { validateCreateCandidateInput, ValidationError } from '../validator';
import { validateMagicBytes } from '../../infrastructure/magicBytes';

export interface CreateCandidateMultipartPayload {
  body: Record<string, unknown>;
  resumeFile?: { path: string; mimeType: string };
}

export interface CreatedCandidateView {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  address: string | null;
}

export class CandidateService {
  constructor(private readonly candidateRepository: ICandidateRepository) {}

  async createCandidate(payload: CreateCandidateMultipartPayload): Promise<CreatedCandidateView> {
    const dto = validateCreateCandidateInput(payload.body);

    // Magic-byte validation and UUID rename for uploaded resume
    let resolvedResumeFile = payload.resumeFile;
    if (resolvedResumeFile) {
      const fileBuffer = readFileSync(resolvedResumeFile.path);
      if (!validateMagicBytes(fileBuffer, resolvedResumeFile.mimeType)) {
        // Delete the invalid uploaded file before rejecting
        if (existsSync(resolvedResumeFile.path)) {
          unlinkSync(resolvedResumeFile.path);
        }
        throw new ValidationError([
          'Resume file content does not match the declared file type',
        ]);
      }
      // Rename to UUID-based filename for opaque storage
      const ext = extname(resolvedResumeFile.path);
      const dir = dirname(resolvedResumeFile.path);
      const newFilename = `${randomUUID()}${ext}`;
      const newPath = `${dir}/${newFilename}`;
      renameSync(resolvedResumeFile.path, newPath);
      resolvedResumeFile = { ...resolvedResumeFile, path: newPath };
    }

    const educations = dto.educations.map(
      (edu) =>
        new Education(
          edu.institution,
          edu.title,
          new Date(edu.startDate),
          edu.endDate ? new Date(edu.endDate) : undefined,
        ),
    );

    const workExperiences = dto.workExperiences.map(
      (exp) =>
        new WorkExperience(
          exp.company,
          exp.position,
          new Date(exp.startDate),
          exp.description,
          exp.endDate ? new Date(exp.endDate) : undefined,
        ),
    );

    const candidate = new Candidate(
      dto.firstName,
      dto.lastName,
      dto.email,
      educations,
      workExperiences,
      dto.phone,
      dto.address,
      resolvedResumeFile,
    );

    const savedCandidate = await this.candidateRepository.save(candidate);

    return {
      id: savedCandidate.id!,
      firstName: savedCandidate.firstName,
      lastName: savedCandidate.lastName,
      email: savedCandidate.email,
      phone: savedCandidate.phone ?? null,
      address: savedCandidate.address ?? null,
    };
  }
}
```

Important:
- `readFileSync` is synchronous. This is acceptable for a file just uploaded in the same request (small file already on disk). For a production system handling high concurrency, `fs/promises` + `readFile` async would be preferred — but the instruction says to use `readFileSync`.
- `dirname` from `path` is used instead of string manipulation to get the directory, which is safer than `path.replace(/[^/\\]*$/, '')`.
- The `resolvedResumeFile` local variable shadows `payload.resumeFile` so we don't mutate the input object.
- No Prisma imports in this file.

---

### Step 7: Verify `backend/src/presentation/controllers/CandidateController.ts`

No changes needed. The current `create` method returns:

```typescript
res.status(201).json({ data: result });
```

Where `result` is `CreatedCandidateView { id, firstName, lastName, email, phone, address }`. There is no `filePath` in this type. SCRUM-8 response shaping requirement is already satisfied.

The controller already catches `ValidationError` and maps to 400, and `DuplicateEmailError` maps to 409. No changes required.

---

### Step 8: Create `backend/.env.example`

Full content:

```
DATABASE_URL=postgresql://user:password@localhost:5432/lti_ats
PORT=3010
NODE_ENV=development
UPLOAD_DIR=./uploads
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

Notes:
- The root `.gitignore` has `**/.env.example` in its ignore list. This means `.env.example` would be gitignored at the repository level. Check if this is intentional — if the team wants `.env.example` tracked in git (which is the standard practice), the root `.gitignore` line `**/.env.example` should be removed or overridden. This is a decision for the team; the file should still be created for documentation purposes.
- Port is `3010` to match the default in `index.ts` (`process.env.PORT ?? 3010`).

---

### Step 9: Update `backend/src/__tests__/candidate.test.ts`

The existing test "returns phone and address when provided in the payload" uses `phone: '+34600000001'`. With the new Spanish phone regex `^[679]\d{8}$`, this value will fail validation because it starts with `+34`. Update this test to use a valid bare Spanish phone number.

Change in test file — locate the payload inside the test:

```typescript
// BEFORE:
phone: '+34600000001',

// AFTER:
phone: '612345678',
```

And in the `makeSavedCandidate` mock return for that test:

```typescript
// BEFORE:
'+34600000001',

// AFTER:
'612345678',
```

And in the assertion:

```typescript
// BEFORE:
expect(result.phone).toBe('+34600000001');

// AFTER:
expect(result.phone).toBe('612345678');
```

This is the ONLY change needed in `candidate.test.ts`. All other tests remain unchanged.

---

### Step 10: Create `backend/src/__tests__/security.test.ts`

Full content:

```typescript
import { validateCreateCandidateInput, sanitizeString, normalizeEmail, ValidationError } from '../application/validator';

// Minimal valid payload factory
const makeValidPayload = () => ({
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane.doe@example.com',
  educations: [
    {
      institution: 'MIT',
      title: 'BSc Computer Science',
      startDate: '2015-09-01',
      endDate: '2019-06-30',
    },
  ],
  workExperiences: [],
});

describe('sanitizeString', () => {
  it('strips HTML tags from input', () => {
    expect(sanitizeString('<script>alert(1)</script>Jane')).toBe('Jane');
  });

  it('strips anchor tags while keeping text content', () => {
    expect(sanitizeString('<a href="x">link</a>')).toBe('link');
  });

  it('returns plain string unchanged', () => {
    expect(sanitizeString('O\'Brien-Smith')).toBe('O\'Brien-Smith');
  });
});

describe('normalizeEmail', () => {
  it('converts uppercase letters to lowercase', () => {
    expect(normalizeEmail('Jane.DOE@EXAMPLE.COM')).toBe('jane.doe@example.com');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeEmail('  jane@example.com  ')).toBe('jane@example.com');
  });
});

describe('validateCreateCandidateInput — security rules', () => {
  describe('firstName and lastName HTML sanitization', () => {
    it('strips HTML tags from firstName and passes validation with remaining valid text', () => {
      // Arrange
      const input = {
        ...makeValidPayload(),
        firstName: '<b>Jane</b>',
      };

      // Act
      const result = validateCreateCandidateInput(input);

      // Assert — HTML stripped, valid letters remain
      expect(result.firstName).toBe('Jane');
    });

    it('throws ValidationError when firstName is only HTML tags (empty after stripping)', () => {
      // Arrange
      const input = {
        ...makeValidPayload(),
        firstName: '<script></script>',
      };

      // Act & Assert
      expect(() => validateCreateCandidateInput(input)).toThrow(ValidationError);
      expect(() => validateCreateCandidateInput(input)).toThrow(
        expect.objectContaining({
          details: expect.arrayContaining(['firstName: required']),
        }),
      );
    });

    it('throws ValidationError when firstName is too short after stripping (less than 2 chars)', () => {
      // Arrange
      const input = {
        ...makeValidPayload(),
        firstName: 'J',
      };

      // Act & Assert
      expect(() => validateCreateCandidateInput(input)).toThrow(ValidationError);
      expect(() => validateCreateCandidateInput(input)).toThrow(
        expect.objectContaining({
          details: expect.arrayContaining(['firstName: must be at least 2 characters']),
        }),
      );
    });

    it('throws ValidationError when firstName contains invalid characters', () => {
      // Arrange
      const input = {
        ...makeValidPayload(),
        firstName: 'Jane123',
      };

      // Act & Assert
      expect(() => validateCreateCandidateInput(input)).toThrow(ValidationError);
      expect(() => validateCreateCandidateInput(input)).toThrow(
        expect.objectContaining({
          details: expect.arrayContaining([
            'firstName: must contain only letters, spaces, hyphens, or apostrophes',
          ]),
        }),
      );
    });

    it('accepts firstName with hyphens and apostrophes', () => {
      // Arrange
      const input = {
        ...makeValidPayload(),
        firstName: "Mary-Jo",
      };

      // Act
      const result = validateCreateCandidateInput(input);

      // Assert
      expect(result.firstName).toBe('Mary-Jo');
    });
  });

  describe('email normalization', () => {
    it('normalizes email to lowercase in the returned DTO', () => {
      // Arrange
      const input = {
        ...makeValidPayload(),
        email: 'Jane.DOE@EXAMPLE.COM',
      };

      // Act
      const result = validateCreateCandidateInput(input);

      // Assert
      expect(result.email).toBe('jane.doe@example.com');
    });
  });

  describe('phone validation — Spanish pattern', () => {
    it('throws ValidationError when phone does not match Spanish pattern', () => {
      // Arrange
      const input = {
        ...makeValidPayload(),
        phone: '+34612345678', // international format — not allowed
      };

      // Act & Assert
      expect(() => validateCreateCandidateInput(input)).toThrow(ValidationError);
      expect(() => validateCreateCandidateInput(input)).toThrow(
        expect.objectContaining({
          details: expect.arrayContaining([
            'phone: must be a valid Spanish phone number (9 digits starting with 6, 7, or 9)',
          ]),
        }),
      );
    });

    it('throws ValidationError when phone starts with an invalid digit', () => {
      // Arrange
      const input = {
        ...makeValidPayload(),
        phone: '512345678', // starts with 5 — invalid
      };

      // Act & Assert
      expect(() => validateCreateCandidateInput(input)).toThrow(ValidationError);
    });

    it('accepts a valid Spanish mobile number starting with 6', () => {
      // Arrange
      const input = {
        ...makeValidPayload(),
        phone: '612345678',
      };

      // Act
      const result = validateCreateCandidateInput(input);

      // Assert
      expect(result.phone).toBe('612345678');
    });

    it('accepts a valid Spanish mobile number starting with 7', () => {
      // Arrange
      const input = {
        ...makeValidPayload(),
        phone: '712345678',
      };

      // Act
      const result = validateCreateCandidateInput(input);

      // Assert
      expect(result.phone).toBe('712345678');
    });

    it('accepts a valid Spanish landline number starting with 9', () => {
      // Arrange
      const input = {
        ...makeValidPayload(),
        phone: '912345678',
      };

      // Act
      const result = validateCreateCandidateInput(input);

      // Assert
      expect(result.phone).toBe('912345678');
    });
  });

  describe('address HTML sanitization', () => {
    it('strips HTML tags from address', () => {
      // Arrange
      const input = {
        ...makeValidPayload(),
        address: '<b>123 Main St</b>',
      };

      // Act
      const result = validateCreateCandidateInput(input);

      // Assert
      expect(result.address).toBe('123 Main St');
    });
  });

  describe('response never includes filePath', () => {
    it('CreatedCandidateView type does not include filePath property', () => {
      // This is a structural type test — we verify the validator output DTO
      // does not have filePath. The service's CreatedCandidateView is the public
      // API contract and is tested separately in candidate.test.ts.
      const input = makeValidPayload();
      const result = validateCreateCandidateInput(input);
      expect(result).not.toHaveProperty('filePath');
    });
  });
});
```

---

### Step 11: Create `backend/src/__tests__/magicBytes.test.ts`

Full content:

```typescript
import { detectFileType, validateMagicBytes } from '../infrastructure/magicBytes';

describe('detectFileType', () => {
  it('returns application/pdf for a buffer starting with PDF magic bytes', () => {
    // Arrange — %PDF = 0x25 0x50 0x44 0x46
    const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0x00]);

    // Act
    const result = detectFileType(buffer);

    // Assert
    expect(result).toBe('application/pdf');
  });

  it('returns docx mime type for a buffer starting with PK ZIP magic bytes', () => {
    // Arrange — PK = 0x50 0x4B 0x03 0x04
    const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);

    // Act
    const result = detectFileType(buffer);

    // Assert
    expect(result).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('returns null for a buffer with unknown magic bytes', () => {
    // Arrange
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);

    // Act
    const result = detectFileType(buffer);

    // Assert
    expect(result).toBeNull();
  });

  it('returns null for a buffer shorter than 4 bytes', () => {
    // Arrange
    const buffer = Buffer.from([0x25, 0x50]);

    // Act
    const result = detectFileType(buffer);

    // Assert
    expect(result).toBeNull();
  });

  it('returns null for an empty buffer', () => {
    // Arrange
    const buffer = Buffer.alloc(0);

    // Act
    const result = detectFileType(buffer);

    // Assert
    expect(result).toBeNull();
  });
});

describe('validateMagicBytes', () => {
  it('returns true when buffer magic bytes match the declared PDF mime type', () => {
    // Arrange
    const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00]);

    // Act
    const result = validateMagicBytes(buffer, 'application/pdf');

    // Assert
    expect(result).toBe(true);
  });

  it('returns true when buffer magic bytes match the declared DOCX mime type', () => {
    // Arrange
    const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);

    // Act
    const result = validateMagicBytes(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    // Assert
    expect(result).toBe(true);
  });

  it('returns false when buffer has PDF magic bytes but declared type is DOCX (mismatch)', () => {
    // Arrange
    const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00]);

    // Act
    const result = validateMagicBytes(
      buffer,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    // Assert
    expect(result).toBe(false);
  });

  it('returns false when buffer has DOCX magic bytes but declared type is PDF (mismatch)', () => {
    // Arrange
    const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);

    // Act
    const result = validateMagicBytes(buffer, 'application/pdf');

    // Assert
    expect(result).toBe(false);
  });

  it('returns false when buffer has unknown magic bytes regardless of declared type', () => {
    // Arrange
    const buffer = Buffer.from([0xff, 0xfe, 0x00, 0x00]);

    // Act
    const result = validateMagicBytes(buffer, 'application/pdf');

    // Assert
    expect(result).toBe(false);
  });
});
```

---

### Step 12: Create `backend/src/__tests__/integration/security.integration.test.ts`

This file requires the `src/__tests__/integration/` directory to be created first.

The integration tests use supertest against the exported `app` from `index.ts`. The `app` is already exported — `export const app = express();`.

IMPORTANT: When importing `app` from `index.ts` in tests, `app.listen()` is called at module load time. This is the current pattern already working in `src/tests/app.test.ts`. The port may conflict in CI. If needed, the `index.ts` can be restructured to guard `app.listen()` with `if (require.main === module)`. However, since the existing tests already import `app` and work, keep the same pattern.

Full content:

```typescript
import request from 'supertest';
import { app } from '../../index';

describe('Security headers (helmet)', () => {
  it('includes x-content-type-options: nosniff on any response', async () => {
    // Act
    const response = await request(app).get('/');

    // Assert
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('includes x-frame-options header on any response', async () => {
    // Act
    const response = await request(app).get('/');

    // Assert
    // helmet sets x-frame-options to SAMEORIGIN by default (not DENY)
    // Accept either value — the important thing is the header is present
    expect(response.headers['x-frame-options']).toBeDefined();
  });

  it('includes x-dns-prefetch-control header', async () => {
    // Act
    const response = await request(app).get('/');

    // Assert
    expect(response.headers['x-dns-prefetch-control']).toBeDefined();
  });
});

describe('CORS behavior', () => {
  it('does not include Access-Control-Allow-Origin for a disallowed origin', async () => {
    // Act — send request with an origin not in ALLOWED_ORIGINS
    const response = await request(app)
      .get('/')
      .set('Origin', 'https://evil.example.com');

    // Assert — no ACAO header or it doesn't match the evil origin
    const acao = response.headers['access-control-allow-origin'];
    expect(acao).not.toBe('https://evil.example.com');
  });

  it('includes Access-Control-Allow-Origin for an allowed origin', async () => {
    // Arrange — set env var before test (must be done before app initializes in real usage;
    // here we test the CORS callback behavior directly via a pre-configured origin)
    // Note: ALLOWED_ORIGINS is parsed at module load time from process.env.
    // For this test to work with a specific allowed origin, set the env var before running
    // OR use process.env.ALLOWED_ORIGINS in jest setup.
    // Since the integration test environment may not have ALLOWED_ORIGINS set,
    // this test verifies the no-origin case (curl/Postman in non-production).
    const response = await request(app).get('/');

    // Assert — no Origin header means supertest sends without Origin
    // In non-production (NODE_ENV=test), requests with no origin are allowed
    expect(response.statusCode).toBe(200);
  });
});
```

Note on CORS test limitations: The `parseAllowedOrigins` call and `allowedOrigins` array are initialized when `index.ts` is first imported (module-level code). To test the allowed-origin case with a specific origin, the test environment must set `ALLOWED_ORIGINS` in `process.env` BEFORE the first import of `index.ts`. The recommended approach is to add a `jest.setup.ts` file (or inline `process.env.ALLOWED_ORIGINS = 'http://localhost:5173'` at the very top of the integration test file, before the import). Add this at the top of the integration test file:

```typescript
// Must be set before index.ts is imported
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
process.env.NODE_ENV = 'test';
```

Then the test for allowed origin:

```typescript
it('includes Access-Control-Allow-Origin for a configured allowed origin', async () => {
  const response = await request(app)
    .get('/')
    .set('Origin', 'http://localhost:5173');

  expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
});
```

---

### Step 13: Run Quality Gates

```bash
cd /home/juan/Documents/repos/AI4Devs-lab-ides-2603-Sr_II/backend
npm run build 2>&1 | tail -40
npm test 2>&1 | tail -60
```

Expected: Zero TypeScript errors. All tests pass. The pre-existing `src/tests/app.test.ts` (which tests `GET /` → `'Hello LTI!!'`) should still pass since we preserved that response text.

If the integration test's `app.listen()` causes port conflicts in the test environment, add `afterAll(() => { server.close(); })` where `server` is the return value of `app.listen()` — but this requires restructuring `index.ts` to export the server. Alternative: guard `app.listen()` with:

```typescript
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}
```

This is the cleanest approach and is standard for Express apps used with supertest.

---

### Step 14: Stage and Commit

Stage only SCRUM-8 files:

```bash
git add backend/src/index.ts
git add backend/src/routes/candidateRoutes.ts
git add backend/src/application/validator.ts
git add backend/src/application/services/CandidateService.ts
git add backend/src/infrastructure/magicBytes.ts
git add backend/.env.example
git add backend/package.json backend/package-lock.json
git add backend/src/__tests__/candidate.test.ts
git add backend/src/__tests__/security.test.ts
git add backend/src/__tests__/magicBytes.test.ts
git add backend/src/__tests__/integration/security.integration.test.ts
```

Note: `CandidateController.ts` is NOT staged — no changes were made to it.

Commit:

```bash
git commit -m "$(cat <<'EOF'
feat(SCRUM-8): add security hardening for candidate PII and resume assets

- Add helmet security headers and restricted CORS with ALLOWED_ORIGINS
- Add express-rate-limit (100 req/15min/IP) on /candidates routes
- Extend validator: Spanish phone pattern, HTML sanitization, email normalization, name min-length
- Update file size limit from 5 MB to 10 MB, remove legacy .doc MIME type
- Implement magic-byte validation for PDF/DOCX file uploads
- Rename uploaded files to UUID-based names for opaque storage
- Strip filePath from all API responses (data minimization)
- Add unit tests for security rules and magic-byte detection
- Add integration tests for security headers and CORS behavior

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Step 15: Push and Create PR

```bash
git push -u origin feature/SCRUM-8-backend
gh pr create \
  --title "feat(SCRUM-8): Candidate data security and privacy hardening" \
  --body "$(cat <<'EOF'
## Summary

- helmet security headers on all responses (X-Content-Type-Options, X-Frame-Options, etc.)
- Restricted CORS via ALLOWED_ORIGINS env var — no wildcard, origin allowlist only
- Rate limiting on all /candidates routes: 100 requests / 15 min / IP → 429
- Enhanced input validation: Spanish phone pattern (9 digits, 6/7/9 prefix), HTML stripping on names and address, email normalization to lowercase, name minimum 2 chars
- Magic-byte validation for resume uploads (PDF/DOCX) to prevent MIME spoofing
- UUID-based opaque filenames for uploaded resumes (replaces timestamp-based names)
- File size limit increased to 10 MB, legacy .doc MIME removed (only PDF and DOCX supported with magic-byte check)
- filePath never exposed in any API response (GDPR data minimization)
- Unit tests for security rules and magic-byte detection
- Integration tests for headers and CORS

## Test plan
- [ ] npm test passes in backend/
- [ ] npm run build passes (zero TypeScript errors)
- [ ] Security headers present on responses (helmet)
- [ ] CORS rejects disallowed origins
- [ ] Rate limiter returns 429 after 100 requests/15min
- [ ] Phone validation: rejects non-Spanish patterns (e.g., +34612345678)
- [ ] Phone validation: accepts bare 9-digit Spanish numbers (e.g., 612345678)
- [ ] HTML in firstName/lastName/address is stripped
- [ ] MIME-spoofed resume rejected (magic-byte mismatch)
- [ ] No filePath in any API response

Closes SCRUM-8

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Implementation Order

Execute in this exact order to avoid import resolution errors:

1. Create feature branch
2. Install dependencies (`npm install helmet cors express-rate-limit && npm install --save-dev @types/cors`)
3. Create `backend/src/infrastructure/magicBytes.ts`
4. Modify `backend/src/application/validator.ts`
5. Modify `backend/src/application/services/CandidateService.ts`
6. Modify `backend/src/routes/candidateRoutes.ts`
7. Modify `backend/src/index.ts`
8. Create `backend/.env.example`
9. Update `backend/src/__tests__/candidate.test.ts` (phone value change only)
10. Create `backend/src/__tests__/security.test.ts`
11. Create `backend/src/__tests__/magicBytes.test.ts`
12. Create `backend/src/__tests__/integration/security.integration.test.ts`
13. Run `npm run build` — fix TypeScript errors
14. Run `npm test` — fix test failures
15. Stage and commit
16. Push and create PR

---

## Critical Implementation Notes

### The `application/msword` MIME type removal

The SCRUM-7 `candidateRoutes.ts` accepts `application/msword` (legacy `.doc` files). SCRUM-8 requires magic-byte validation for all uploaded files. The legacy `.doc` format uses the Compound Document File Format with magic bytes `D0 CF 11 E0 A1 B1 1A E1` — a different signature than what the `magicBytes.ts` helper supports. Since `.doc` files are rarely needed in modern systems and implementing another magic signature adds complexity with low value, the plan removes `application/msword` from `ALLOWED_MIME_TYPES`. Only PDF and DOCX (both supported by `magicBytes.ts`) are allowed.

### The `app.listen()` and supertest port conflict

The current `index.ts` calls `app.listen()` unconditionally at module load. When supertest imports `app`, this triggers a listen on port 3010 (or `process.env.PORT`). This works if no other test is already listening on the same port. The existing `src/tests/app.test.ts` already uses this pattern successfully. The integration test follows the same pattern.

If port conflicts appear in CI (running all test files in parallel), wrap `app.listen()` in a `require.main === module` guard. This is best practice and should be done as an improvement if tests fail due to EADDRINUSE errors.

### TypeScript strict mode and `\p{L}` Unicode property escape

The `NAME_CHARS_REGEX = /^[\p{L}\s'\-]+$/u` uses Unicode property escapes. TypeScript's `es5` target means the output JavaScript will keep the regex as-is (TypeScript does not transpile regex syntax). Node.js 20 (which this project uses based on `@types/node@^20`) natively supports `\p{L}`. This is safe.

### `sanitizeString` — exported for testing

The `sanitizeString` and `normalizeEmail` helpers are exported from `validator.ts` so they can be unit-tested directly in `security.test.ts`. This is intentional.

### Existing test `src/tests/app.test.ts` must stay passing

The test `expects(response.text).toBe('Hello LTI!!')` — the `index.ts` GET `/` route sends `'Hello LTI!!'`. This must not change. Verified: the response text is `res.send('Hello LTI!!')` and the test expects exactly `'Hello LTI!!'`.

### `DuplicateEmailError` is in infrastructure — not errors.ts

The plan description mentions an `errors.ts` file. In the actual codebase, `DuplicateEmailError` is defined inside `PrismaCandidateRepository.ts` and `ValidationError` is defined inside `validator.ts`. There is no separate `errors.ts`. Do not create one — follow the existing pattern.

### File size error message consistency

`index.ts` global error handler for `LIMIT_FILE_SIZE` has the error detail message. When updating the limit from 5 MB to 10 MB in `candidateRoutes.ts`, also update the error message in `index.ts` from `'Resume file must be at most 5 MB'` to `'Resume file must be at most 10 MB'`.

### `jest.config.js` — integration test directory coverage exclusion

The current `jest.config.js` excludes `src/__tests__/**` from coverage collection:

```javascript
collectCoverageFrom: [
  'src/**/*.ts',
  '!src/__tests__/**',
  '!src/tests/**',
  '!src/index.ts',
],
```

The new `src/__tests__/integration/` directory is already covered by `!src/__tests__/**`. No changes needed to `jest.config.js`.

### Rate limiter `_req` unused parameter

The rate limiter `handler` receives `(_req, res)`. TypeScript may warn about unused parameter. Use `_req` prefix (underscore convention) to suppress the warning without ignoring it.

---

## Error Response Contract

| HTTP | Body | Trigger |
|------|------|---------|
| 201 | `{ "data": { "id", "firstName", "lastName", "email", "phone", "address" } }` | Successful creation |
| 400 | `{ "error": "Validation failed", "details": string[] }` | Validation failure, magic-byte mismatch, Multer file rejection |
| 409 | `{ "error": "Email already registered" }` | Unique constraint violation (Prisma P2002) |
| 429 | `{ "success": false, "error": { "message": "Too many requests", "code": "RATE_LIMIT_EXCEEDED" } }` | Rate limit exceeded |
| 500 | `{ "error": "Internal server error" }` | Unhandled errors |

Note: The 429 response shape uses `success: false` and a nested `error` object — this is slightly different from the 400/409 shape (which uses a flat `error` string). This is as specified in the task description.
