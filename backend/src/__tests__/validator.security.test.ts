import {
  validateCreateCandidateInput,
  sanitizeString,
  normalizeEmail,
  ValidationError,
} from '../application/validator';

const baseValidInput = () => ({
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
  it('strips HTML tags from a string', () => {
    expect(sanitizeString('<b>Hello</b>')).toBe('Hello');
  });

  it('strips nested and multiple HTML tags', () => {
    expect(sanitizeString('<script>alert("xss")</script>')).toBe('alert("xss")');
  });

  it('trims whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  it('returns plain strings unchanged (aside from trim)', () => {
    expect(sanitizeString('John')).toBe('John');
  });
});

describe('normalizeEmail', () => {
  it('converts email to lowercase', () => {
    expect(normalizeEmail('Jane.Doe@Example.COM')).toBe('jane.doe@example.com');
  });

  it('trims whitespace', () => {
    expect(normalizeEmail('  jane@example.com  ')).toBe('jane@example.com');
  });
});

describe('validateCreateCandidateInput — security rules', () => {
  describe('HTML sanitization', () => {
    it('strips HTML tags from firstName and still passes validation', () => {
      const input = { ...baseValidInput(), firstName: '<b>Jane</b>' };
      const dto = validateCreateCandidateInput(input);
      expect(dto.firstName).toBe('Jane');
    });

    it('strips HTML tags from lastName and still passes validation', () => {
      const input = { ...baseValidInput(), lastName: '<i>Doe</i>' };
      const dto = validateCreateCandidateInput(input);
      expect(dto.lastName).toBe('Doe');
    });

    it('strips HTML tags from address and still passes validation', () => {
      const input = { ...baseValidInput(), address: '<div>123 Main St</div>' };
      const dto = validateCreateCandidateInput(input);
      expect(dto.address).toBe('123 Main St');
    });

    it('allows address up to 100 characters after HTML is stripped', () => {
      const inner = 'a'.repeat(100);
      const input = {
        ...baseValidInput(),
        address: `<span>${inner}</span>`,
      };
      const dto = validateCreateCandidateInput(input);
      expect(dto.address).toBe(inner);
    });

    it('throws when sanitized address exceeds 100 characters', () => {
      const inner = 'b'.repeat(101);
      const input = {
        ...baseValidInput(),
        address: inner,
      };
      expect(() => validateCreateCandidateInput(input)).toThrow(ValidationError);
      expect(() => validateCreateCandidateInput(input)).toThrow(
        expect.objectContaining({
          details: expect.arrayContaining(['address: must be at most 100 characters']),
        }),
      );
    });

    it('throws ValidationError when firstName after sanitization is too short (1 char)', () => {
      const input = { ...baseValidInput(), firstName: 'J' };
      expect(() => validateCreateCandidateInput(input)).toThrow(ValidationError);
      expect(() => validateCreateCandidateInput(input)).toThrow(
        expect.objectContaining({
          details: expect.arrayContaining(['firstName: must be at least 2 characters']),
        }),
      );
    });

    it('throws ValidationError when lastName after sanitization is too short (1 char)', () => {
      const input = { ...baseValidInput(), lastName: 'D' };
      expect(() => validateCreateCandidateInput(input)).toThrow(ValidationError);
      expect(() => validateCreateCandidateInput(input)).toThrow(
        expect.objectContaining({
          details: expect.arrayContaining(['lastName: must be at least 2 characters']),
        }),
      );
    });
  });

  describe('email normalization', () => {
    it('normalizes email to lowercase in the returned DTO', () => {
      const input = { ...baseValidInput(), email: 'Jane.Doe@Example.COM' };
      const dto = validateCreateCandidateInput(input);
      expect(dto.email).toBe('jane.doe@example.com');
    });
  });

  describe('person name (letters-only) rules', () => {
    it('accepts names with Spanish accents', () => {
      const input = { ...baseValidInput(), firstName: 'José', lastName: 'García' };
      const dto = validateCreateCandidateInput(input);
      expect(dto.firstName).toBe('José');
      expect(dto.lastName).toBe('García');
    });

    it('accepts hyphenated and spaced names', () => {
      const input = {
        ...baseValidInput(),
        firstName: 'Mary-Jane',
        lastName: "O'Brien",
      };
      const dto = validateCreateCandidateInput(input);
      expect(dto.firstName).toBe('Mary-Jane');
      expect(dto.lastName).toBe("O'Brien");
    });

    it('throws ValidationError when firstName contains digits', () => {
      const input = { ...baseValidInput(), firstName: 'John3' };
      expect(() => validateCreateCandidateInput(input)).toThrow(ValidationError);
      expect(() => validateCreateCandidateInput(input)).toThrow(
        expect.objectContaining({
          details: expect.arrayContaining([
            'firstName: must contain only letters, spaces, hyphens, and apostrophes',
          ]),
        }),
      );
    });

    it('throws ValidationError when lastName contains symbols', () => {
      const input = { ...baseValidInput(), lastName: 'Doe@' };
      expect(() => validateCreateCandidateInput(input)).toThrow(ValidationError);
    });
  });

  describe('Spanish phone validation', () => {
    it('accepts phone starting with 6', () => {
      const input = { ...baseValidInput(), phone: '612345678' };
      const dto = validateCreateCandidateInput(input);
      expect(dto.phone).toBe('612345678');
    });

    it('accepts phone starting with 7', () => {
      const input = { ...baseValidInput(), phone: '712345678' };
      const dto = validateCreateCandidateInput(input);
      expect(dto.phone).toBe('712345678');
    });

    it('accepts phone starting with 9', () => {
      const input = { ...baseValidInput(), phone: '912345678' };
      const dto = validateCreateCandidateInput(input);
      expect(dto.phone).toBe('912345678');
    });

    it('throws ValidationError for phone with international prefix +34600000001', () => {
      const input = { ...baseValidInput(), phone: '+34600000001' };
      expect(() => validateCreateCandidateInput(input)).toThrow(ValidationError);
      expect(() => validateCreateCandidateInput(input)).toThrow(
        expect.objectContaining({
          details: expect.arrayContaining([
            'phone: must be a valid Spanish phone number (9 digits starting with 6, 7, or 9)',
          ]),
        }),
      );
    });

    it('throws ValidationError for phone starting with disallowed digit (1)', () => {
      const input = { ...baseValidInput(), phone: '123456789' };
      expect(() => validateCreateCandidateInput(input)).toThrow(ValidationError);
      expect(() => validateCreateCandidateInput(input)).toThrow(
        expect.objectContaining({
          details: expect.arrayContaining([
            'phone: must be a valid Spanish phone number (9 digits starting with 6, 7, or 9)',
          ]),
        }),
      );
    });

    it('throws ValidationError for phone starting with disallowed digit (8)', () => {
      const input = { ...baseValidInput(), phone: '812345678' };
      expect(() => validateCreateCandidateInput(input)).toThrow(ValidationError);
    });

    it('throws ValidationError for phone that is too short (8 digits)', () => {
      const input = { ...baseValidInput(), phone: '61234567' };
      expect(() => validateCreateCandidateInput(input)).toThrow(ValidationError);
    });

    it('throws ValidationError for phone that is too long (10 digits)', () => {
      const input = { ...baseValidInput(), phone: '6123456789' };
      expect(() => validateCreateCandidateInput(input)).toThrow(ValidationError);
    });

    it('omits phone from DTO when not provided', () => {
      const dto = validateCreateCandidateInput(baseValidInput());
      expect(dto.phone).toBeUndefined();
    });
  });
});
