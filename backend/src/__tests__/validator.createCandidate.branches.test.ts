import {
  validateCreateCandidateInput,
  ValidationError,
} from '../application/validator';

const oneEducation = [
  { institution: 'MIT', title: 'BSc', startDate: '2015-09-01' },
];

const base = () => ({
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  educations: oneEducation,
  workExperiences: [] as unknown[],
});

describe('validateCreateCandidateInput — nested branches', () => {
  it('throws when input is not an object', () => {
    expect(() => validateCreateCandidateInput(null)).toThrow(ValidationError);
    expect(() => validateCreateCandidateInput(null)).toThrow(
      expect.objectContaining({ details: ['Input must be an object'] }),
    );
  });

  it('rejects education entry that is not an object', () => {
    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        educations: ['x'],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining(['educations[0]: must be an object']),
      }),
    );
  });

  it('rejects missing institution and oversize institution', () => {
    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        educations: [{ institution: '', title: 'BSc', startDate: '2015-09-01' }],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining(['educations[0].institution: required']),
      }),
    );

    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        educations: [
          {
            institution: 'a'.repeat(101),
            title: 'BSc',
            startDate: '2015-09-01',
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining([
          'educations[0].institution: must be at most 100 characters',
        ]),
      }),
    );
  });

  it('rejects missing title and oversize title', () => {
    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        educations: [
          { institution: 'MIT', title: '  ', startDate: '2015-09-01' },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining(['educations[0].title: required']),
      }),
    );

    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        educations: [
          {
            institution: 'MIT',
            title: 'b'.repeat(251),
            startDate: '2015-09-01',
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining([
          'educations[0].title: must be at most 250 characters',
        ]),
      }),
    );
  });

  it('rejects missing education startDate', () => {
    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        educations: [{ institution: 'MIT', title: 'BSc', startDate: '' }],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining(['educations[0].startDate: required']),
      }),
    );
  });

  it('rejects education endDate on or before startDate', () => {
    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        educations: [
          {
            institution: 'MIT',
            title: 'BSc',
            startDate: '2019-06-01',
            endDate: '2019-06-01',
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining([
          'educations[0].endDate: must be after startDate',
        ]),
      }),
    );
  });

  it('rejects invalid education startDate and endDate edge cases', () => {
    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        educations: [
          { institution: 'MIT', title: 'BSc', startDate: 'not-a-date' },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining([
          'educations[0].startDate: must be a valid date',
        ]),
      }),
    );

    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        educations: [
          {
            institution: 'MIT',
            title: 'BSc',
            startDate: '2015-09-01',
            endDate: 123 as unknown as string,
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining([
          'educations[0].endDate: must be a valid date string if provided',
        ]),
      }),
    );

    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        educations: [
          {
            institution: 'MIT',
            title: 'BSc',
            startDate: '2015-09-01',
            endDate: 'bad',
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining([
          'educations[0].endDate: must be a valid date',
        ]),
      }),
    );
  });

  it('rejects work experience that is not an object', () => {
    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        workExperiences: [null],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining(['workExperiences[0]: must be an object']),
      }),
    );
  });

  it('rejects missing work experience startDate', () => {
    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        workExperiences: [
          { company: 'Acme', position: 'Dev', startDate: '' },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining([
          'workExperiences[0].startDate: required',
        ]),
      }),
    );
  });

  it('rejects invalid work experience fields', () => {
    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        workExperiences: [
          { company: '', position: 'Dev', startDate: '2019-01-01' },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining(['workExperiences[0].company: required']),
      }),
    );

    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        workExperiences: [
          { company: 'Acme', position: '', startDate: '2019-01-01' },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining(['workExperiences[0].position: required']),
      }),
    );

    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        workExperiences: [
          { company: 'Acme', position: 'Dev', startDate: 'x' },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining([
          'workExperiences[0].startDate: must be a valid date',
        ]),
      }),
    );

    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        workExperiences: [
          {
            company: 'Acme',
            position: 'Dev',
            startDate: '2019-01-01',
            endDate: true as unknown as string,
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining([
          'workExperiences[0].endDate: must be a valid date string if provided',
        ]),
      }),
    );

    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        workExperiences: [
          {
            company: 'Acme',
            position: 'Dev',
            startDate: '2019-01-01',
            endDate: 'nope',
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining([
          'workExperiences[0].endDate: must be a valid date',
        ]),
      }),
    );

    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        workExperiences: [
          {
            company: 'Acme',
            position: 'Dev',
            startDate: '2019-06-01',
            endDate: '2019-01-01',
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining([
          'workExperiences[0].endDate: must be after startDate',
        ]),
      }),
    );
  });

  it('rejects oversize email and invalid lastName characters', () => {
    const longEmail = `${'a'.repeat(249)}@example.com`;
    expect(longEmail.length).toBeGreaterThan(255);
    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        email: longEmail,
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining(['email: must be at most 255 characters']),
      }),
    );

    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        lastName: 'Doe2',
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining([
          'lastName: must contain only letters, spaces, hyphens, and apostrophes',
        ]),
      }),
    );
  });

  it('rejects oversize firstName and oversize lastName', () => {
    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        firstName: 'a'.repeat(101),
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining(['firstName: must be at most 100 characters']),
      }),
    );

    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        lastName: 'b'.repeat(101),
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining(['lastName: must be at most 100 characters']),
      }),
    );

    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        phone: 123 as unknown as string,
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining(['phone: must be a string']),
      }),
    );
  });

  it('rejects workExperiences when provided but not an array', () => {
    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        workExperiences: 'nope' as unknown as unknown[],
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining([
          'workExperiences: must be an array if provided',
        ]),
      }),
    );
  });

  it('accepts education with endDate after startDate', () => {
    const dto = validateCreateCandidateInput({
      ...base(),
      educations: [
        {
          institution: 'MIT',
          title: 'BSc',
          startDate: '2015-09-01',
          endDate: '2019-06-30',
        },
      ],
    });
    expect(dto.educations[0].endDate).toBe('2019-06-30');
  });

  it('rejects non-string address', () => {
    expect(() =>
      validateCreateCandidateInput({
        ...base(),
        address: 1 as unknown as string,
      }),
    ).toThrow(
      expect.objectContaining({
        details: expect.arrayContaining(['address: must be a string']),
      }),
    );
  });
});
