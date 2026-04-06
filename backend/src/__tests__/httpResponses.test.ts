import {
  corsForbiddenBody,
  duplicateEmailBody,
  internalErrorBody,
  jsonParseErrorBody,
  successData,
  validationErrorBody,
} from '../presentation/httpResponses';

describe('httpResponses', () => {
  it('builds successData', () => {
    expect(successData({ id: 1 })).toEqual({ success: true, data: { id: 1 } });
  });

  it('builds validationErrorBody', () => {
    expect(validationErrorBody(['a'])).toEqual({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: ['a'],
      },
    });
  });

  it('builds jsonParseErrorBody', () => {
    expect(jsonParseErrorBody('educations')).toEqual({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: ['educations: must be a valid JSON array'],
      },
    });
  });

  it('builds duplicateEmailBody', () => {
    expect(duplicateEmailBody().error.code).toBe('DUPLICATE_EMAIL');
  });

  it('builds corsForbiddenBody', () => {
    expect(corsForbiddenBody().error.code).toBe('CORS_FORBIDDEN');
  });

  it('builds internalErrorBody', () => {
    expect(internalErrorBody().error.code).toBe('INTERNAL_ERROR');
  });
});
