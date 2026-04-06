/** Standard JSON error/success bodies (backend-standards.mdc). */

export function successData<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}

export function validationErrorBody(details: string[]): {
  success: false;
  error: { message: string; code: 'VALIDATION_ERROR'; details: string[] };
} {
  return {
    success: false,
    error: {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details,
    },
  };
}

export function jsonParseErrorBody(field: string): {
  success: false;
  error: { message: string; code: 'VALIDATION_ERROR'; details: string[] };
} {
  return {
    success: false,
    error: {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: [`${field}: must be a valid JSON array`],
    },
  };
}

export function duplicateEmailBody(): {
  success: false;
  error: { message: string; code: 'DUPLICATE_EMAIL' };
} {
  return {
    success: false,
    error: {
      message: 'A candidate with this email already exists',
      code: 'DUPLICATE_EMAIL',
    },
  };
}

export function corsForbiddenBody(): {
  success: false;
  error: { message: string; code: 'CORS_FORBIDDEN' };
} {
  return {
    success: false,
    error: {
      message: 'Origin is not allowed by CORS policy',
      code: 'CORS_FORBIDDEN',
    },
  };
}

export function internalErrorBody(): {
  success: false;
  error: { message: string; code: 'INTERNAL_ERROR' };
} {
  return {
    success: false,
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
  };
}
