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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Spanish mobile/landline: starts with 6, 7, or 9; exactly 9 digits
const SPANISH_PHONE_REGEX = /^[679]\d{8}$/;

/** Letters (any Unicode script), spaces, apostrophes, hyphens — after HTML strip. */
const PERSON_NAME_REGEX = /^[\p{L}\s'-]+$/u;

/** Strip HTML tags from a string to prevent stored XSS. */
export function sanitizeString(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

/** Normalize email to lowercase for consistent storage and lookup. */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

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

  // firstName — strip HTML, enforce 2-100 chars
  if (!isNonEmptyString(input.firstName)) {
    errors.push('firstName: required');
  } else {
    const sanitized = sanitizeString(input.firstName as string);
    if (sanitized.length < 2) {
      errors.push('firstName: must be at least 2 characters');
    } else if (sanitized.length > 100) {
      errors.push('firstName: must be at most 100 characters');
    } else if (!PERSON_NAME_REGEX.test(sanitized)) {
      errors.push(
        'firstName: must contain only letters, spaces, hyphens, and apostrophes',
      );
    }
  }

  // lastName — strip HTML, enforce 2-100 chars
  if (!isNonEmptyString(input.lastName)) {
    errors.push('lastName: required');
  } else {
    const sanitized = sanitizeString(input.lastName as string);
    if (sanitized.length < 2) {
      errors.push('lastName: must be at least 2 characters');
    } else if (sanitized.length > 100) {
      errors.push('lastName: must be at most 100 characters');
    } else if (!PERSON_NAME_REGEX.test(sanitized)) {
      errors.push(
        'lastName: must contain only letters, spaces, hyphens, and apostrophes',
      );
    }
  }

  // email — normalize to lowercase
  if (!isNonEmptyString(input.email)) {
    errors.push('email: required');
  } else {
    const normalizedEmail = normalizeEmail(input.email as string);
    if (normalizedEmail.length > 255) {
      errors.push('email: must be at most 255 characters');
    } else if (!EMAIL_REGEX.test(normalizedEmail)) {
      errors.push('email: must be a valid email address');
    }
  }

  // phone (optional) — Spanish phone pattern if provided
  if (input.phone !== undefined && input.phone !== null && input.phone !== '') {
    if (typeof input.phone !== 'string') {
      errors.push('phone: must be a string');
    } else if (!SPANISH_PHONE_REGEX.test(input.phone.trim())) {
      errors.push('phone: must be a valid Spanish phone number (9 digits starting with 6, 7, or 9)');
    }
  }

  // address (optional) — strip HTML
  if (input.address !== undefined && input.address !== null && input.address !== '') {
    if (typeof input.address !== 'string') {
      errors.push('address: must be a string');
    } else {
      const sanitizedAddr = sanitizeString(input.address);
      if (sanitizedAddr.length > 100) {
        errors.push('address: must be at most 100 characters');
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
    firstName: sanitizeString(input.firstName as string),
    lastName: sanitizeString(input.lastName as string),
    email: normalizeEmail(input.email as string),
    educations: (input.educations as EducationDto[]),
    workExperiences: Array.isArray(input.workExperiences)
      ? (input.workExperiences as WorkExperienceDto[])
      : [],
  };

  if (input.phone && typeof input.phone === 'string' && input.phone.trim().length > 0) {
    dto.phone = input.phone.trim();
  }

  if (input.address && typeof input.address === 'string' && input.address.trim().length > 0) {
    dto.address = sanitizeString(input.address);
  }

  return dto;
}
