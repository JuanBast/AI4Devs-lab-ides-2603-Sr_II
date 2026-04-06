import { Prisma } from '@prisma/client';
import { PrismaCandidateRepository } from '../infrastructure/repositories/PrismaCandidateRepository';
import { prisma } from '../infrastructure/prismaClient';
import { Candidate } from '../domain/models/Candidate';
import { Education } from '../domain/models/Education';
import { WorkExperience } from '../domain/models/WorkExperience';

jest.mock('../infrastructure/prismaClient', () => ({
  prisma: {
    candidate: {
      create: jest.fn(),
    },
  },
}));

const prismaMock = prisma as unknown as {
  candidate: { create: jest.Mock };
};

describe('PrismaCandidateRepository.save', () => {
  let repository: PrismaCandidateRepository;

  beforeEach(() => {
    repository = new PrismaCandidateRepository();
    prismaMock.candidate.create.mockReset();
  });

  it('persists a candidate and maps the Prisma result to a domain Candidate', async () => {
    const candidate = new Candidate(
      'Jane',
      'Doe',
      'jane@example.com',
      [new Education('MIT', 'BSc', new Date('2015-09-01'), undefined, 10)],
      [],
      undefined,
      undefined,
      undefined,
      undefined,
    );

    prismaMock.candidate.create.mockResolvedValue({
      id: 5,
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: null,
      address: null,
      educations: [
        {
          id: 10,
          institution: 'MIT',
          title: 'BSc',
          startDate: new Date('2015-09-01'),
          endDate: null,
        },
      ],
      workExperiences: [],
      resumes: [],
    });

    const result = await repository.save(candidate);

    expect(result.id).toBe(5);
    expect(result.firstName).toBe('Jane');
    expect(prismaMock.candidate.create).toHaveBeenCalledTimes(1);
  });

  it('maps work experiences including description and endDate from Prisma', async () => {
    const candidate = new Candidate(
      'Jane',
      'Doe',
      'jane@example.com',
      [new Education('MIT', 'BSc', new Date('2015-09-01'), undefined, 10)],
      [
        new WorkExperience(
          'Acme',
          'Engineer',
          new Date('2019-01-01'),
          'Built APIs',
          new Date('2020-01-01'),
          20,
        ),
      ],
      undefined,
      undefined,
      undefined,
      undefined,
    );

    prismaMock.candidate.create.mockResolvedValue({
      id: 7,
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: null,
      address: null,
      educations: [
        {
          id: 10,
          institution: 'MIT',
          title: 'BSc',
          startDate: new Date('2015-09-01'),
          endDate: null,
        },
      ],
      workExperiences: [
        {
          id: 20,
          company: 'Acme',
          position: 'Engineer',
          description: 'Built APIs',
          startDate: new Date('2019-01-01'),
          endDate: new Date('2020-01-01'),
        },
      ],
      resumes: [],
    });

    const result = await repository.save(candidate);

    expect(result.workExperiences).toHaveLength(1);
    const wx = result.workExperiences[0];
    expect(wx.company).toBe('Acme');
    expect(wx.description).toBe('Built APIs');
    expect(wx.endDate).toEqual(new Date('2020-01-01'));
  });

  it('creates resume row when candidate includes resumeFile', async () => {
    const candidate = new Candidate(
      'Jane',
      'Doe',
      'jane@example.com',
      [new Education('MIT', 'BSc', new Date('2015-09-01'), undefined, 10)],
      [],
      undefined,
      undefined,
      { path: '/data/uuid.pdf', mimeType: 'application/pdf' },
      undefined,
    );

    prismaMock.candidate.create.mockResolvedValue({
      id: 6,
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: null,
      address: null,
      educations: [
        {
          id: 10,
          institution: 'MIT',
          title: 'BSc',
          startDate: new Date('2015-09-01'),
          endDate: null,
        },
      ],
      workExperiences: [],
      resumes: [{ id: 99, filePath: '/data/uuid.pdf', fileType: 'application/pdf' }],
    });

    const result = await repository.save(candidate);

    expect(result.resumeFile?.path).toBe('/data/uuid.pdf');
    const callArg = prismaMock.candidate.create.mock.calls[0][0];
    expect(callArg.data.resumes?.create?.[0]).toMatchObject({
      filePath: '/data/uuid.pdf',
      fileType: 'application/pdf',
    });
  });

  it('rethrows non-unique Prisma errors', async () => {
    const candidate = new Candidate(
      'Jane',
      'Doe',
      'jane@example.com',
      [new Education('MIT', 'BSc', new Date('2015-09-01'), undefined, 10)],
      [],
      undefined,
      undefined,
      undefined,
      undefined,
    );

    prismaMock.candidate.create.mockRejectedValue(new Error('connection reset'));

    await expect(repository.save(candidate)).rejects.toThrow('connection reset');
  });

  it('throws DuplicateEmailError on unique constraint violation (P2002)', async () => {
    const candidate = new Candidate(
      'Jane',
      'Doe',
      'dup@example.com',
      [new Education('MIT', 'BSc', new Date('2015-09-01'), undefined, 10)],
      [],
      undefined,
      undefined,
      undefined,
      undefined,
    );

    const prismaError = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    prismaMock.candidate.create.mockRejectedValue(prismaError);

    await expect(repository.save(candidate)).rejects.toMatchObject({
      name: 'DuplicateEmailError',
    });
  });
});
