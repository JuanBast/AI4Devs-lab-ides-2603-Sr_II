import { CandidateService, CreateCandidateMultipartPayload } from '../application/services/CandidateService';
import type { ICandidateRepository } from '../domain/repositories/ICandidateRepository';
import { Candidate } from '../domain/models/Candidate';
import { Education } from '../domain/models/Education';
import { WorkExperience } from '../domain/models/WorkExperience';
import { ValidationError } from '../application/validator';
import { DuplicateEmailError } from '../infrastructure/repositories/PrismaCandidateRepository';

const makeValidPayload = (): CreateCandidateMultipartPayload => ({
  body: {
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
  },
});

const makeSavedCandidate = (): Candidate =>
  new Candidate(
    'Jane',
    'Doe',
    'jane.doe@example.com',
    [new Education('MIT', 'BSc Computer Science', new Date('2015-09-01'), new Date('2019-06-30'), 10)],
    [],
    undefined,
    undefined,
    undefined,
    42,
  );

describe('CandidateService.createCandidate', () => {
  let mockRepository: jest.Mocked<ICandidateRepository>;
  let service: CandidateService;

  beforeEach(() => {
    mockRepository = {
      save: jest.fn(),
    };
    service = new CandidateService(mockRepository);
  });

  describe('happy path', () => {
    it('returns a CreatedCandidateView with the saved candidate id when payload is valid', async () => {
      // Arrange
      mockRepository.save.mockResolvedValue(makeSavedCandidate());
      const payload = makeValidPayload();

      // Act
      const result = await service.createCandidate(payload);

      // Assert
      expect(result.id).toBe(42);
      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Doe');
      expect(result.email).toBe('jane.doe@example.com');
      expect(result.phone).toBeNull();
      expect(result.address).toBeNull();
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('passes resume file metadata to the repository when a file is provided', async () => {
      // Arrange
      const savedWithResume = new Candidate(
        'Jane',
        'Doe',
        'jane.doe@example.com',
        [new Education('MIT', 'BSc', new Date('2015-09-01'), undefined, 11)],
        [],
        undefined,
        undefined,
        { path: 'uploads/resume-123.pdf', mimeType: 'application/pdf' },
        43,
      );
      mockRepository.save.mockResolvedValue(savedWithResume);

      const payload: CreateCandidateMultipartPayload = {
        ...makeValidPayload(),
        resumeFile: { path: 'uploads/resume-123.pdf', mimeType: 'application/pdf' },
      };

      // Act
      const result = await service.createCandidate(payload);

      // Assert
      expect(result.id).toBe(43);
      const savedArg = mockRepository.save.mock.calls[0][0];
      expect(savedArg.resumeFile).toEqual({
        path: 'uploads/resume-123.pdf',
        mimeType: 'application/pdf',
      });
    });

    it('returns phone and address when provided in the payload', async () => {
      // Arrange
      const saved = new Candidate(
        'Jane',
        'Doe',
        'jane.doe@example.com',
        [new Education('MIT', 'BSc', new Date('2015-09-01'), undefined, 10)],
        [new WorkExperience('Acme', 'Engineer', new Date('2019-07-01'), undefined, undefined, 20)],
        '+34600000001',
        '123 Main St',
        undefined,
        44,
      );
      mockRepository.save.mockResolvedValue(saved);

      const payload: CreateCandidateMultipartPayload = {
        body: {
          ...makeValidPayload().body,
          phone: '+34600000001',
          address: '123 Main St',
          workExperiences: [
            { company: 'Acme', position: 'Engineer', startDate: '2019-07-01' },
          ],
        },
      };

      // Act
      const result = await service.createCandidate(payload);

      // Assert
      expect(result.phone).toBe('+34600000001');
      expect(result.address).toBe('123 Main St');
    });
  });

  describe('validation errors', () => {
    it('throws ValidationError with details when firstName is missing', async () => {
      // Arrange
      const payload: CreateCandidateMultipartPayload = {
        body: {
          lastName: 'Doe',
          email: 'jane@example.com',
          educations: [{ institution: 'MIT', title: 'BSc', startDate: '2015-09-01' }],
          workExperiences: [],
        },
      };

      // Act & Assert
      await expect(service.createCandidate(payload)).rejects.toThrow(ValidationError);
      await expect(service.createCandidate(payload)).rejects.toMatchObject({
        details: expect.arrayContaining(['firstName: required']),
      });
    });

    it('throws ValidationError with details when email is missing', async () => {
      // Arrange
      const payload: CreateCandidateMultipartPayload = {
        body: {
          firstName: 'Jane',
          lastName: 'Doe',
          educations: [{ institution: 'MIT', title: 'BSc', startDate: '2015-09-01' }],
          workExperiences: [],
        },
      };

      // Act & Assert
      await expect(service.createCandidate(payload)).rejects.toThrow(ValidationError);
      await expect(service.createCandidate(payload)).rejects.toMatchObject({
        details: expect.arrayContaining(['email: required']),
      });
    });

    it('throws ValidationError when educations array is empty', async () => {
      // Arrange
      const payload: CreateCandidateMultipartPayload = {
        body: {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          educations: [],
          workExperiences: [],
        },
      };

      // Act & Assert
      await expect(service.createCandidate(payload)).rejects.toThrow(ValidationError);
      await expect(service.createCandidate(payload)).rejects.toMatchObject({
        details: expect.arrayContaining(['educations: must contain at least one entry']),
      });
    });

    it('throws ValidationError when education endDate is before startDate', async () => {
      // Arrange
      const payload: CreateCandidateMultipartPayload = {
        body: {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          educations: [
            {
              institution: 'MIT',
              title: 'BSc',
              startDate: '2019-01-01',
              endDate: '2018-01-01',
            },
          ],
          workExperiences: [],
        },
      };

      // Act & Assert
      await expect(service.createCandidate(payload)).rejects.toThrow(ValidationError);
      await expect(service.createCandidate(payload)).rejects.toMatchObject({
        details: expect.arrayContaining(['educations[0].endDate: must be after startDate']),
      });
    });

    it('throws ValidationError when email format is invalid', async () => {
      // Arrange
      const payload: CreateCandidateMultipartPayload = {
        body: {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'not-an-email',
          educations: [{ institution: 'MIT', title: 'BSc', startDate: '2015-09-01' }],
          workExperiences: [],
        },
      };

      // Act & Assert
      await expect(service.createCandidate(payload)).rejects.toThrow(ValidationError);
      await expect(service.createCandidate(payload)).rejects.toMatchObject({
        details: expect.arrayContaining(['email: must be a valid email address']),
      });
    });

    it('throws ValidationError when educations is not an array', async () => {
      // Arrange
      const payload: CreateCandidateMultipartPayload = {
        body: {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          educations: 'not-an-array',
          workExperiences: [],
        },
      };

      // Act & Assert
      await expect(service.createCandidate(payload)).rejects.toThrow(ValidationError);
      await expect(service.createCandidate(payload)).rejects.toMatchObject({
        details: expect.arrayContaining(['educations: required and must be an array']),
      });
    });
  });

  describe('duplicate email', () => {
    it('propagates DuplicateEmailError from the repository', async () => {
      // Arrange
      mockRepository.save.mockRejectedValue(
        new DuplicateEmailError('jane.doe@example.com'),
      );

      // Act & Assert
      await expect(service.createCandidate(makeValidPayload())).rejects.toThrow(
        DuplicateEmailError,
      );
    });
  });

  describe('unknown errors', () => {
    it('propagates unexpected repository errors', async () => {
      // Arrange
      mockRepository.save.mockRejectedValue(new Error('DB connection failed'));

      // Act & Assert
      await expect(service.createCandidate(makeValidPayload())).rejects.toThrow(
        'DB connection failed',
      );
    });
  });
});
