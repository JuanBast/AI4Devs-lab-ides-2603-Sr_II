import { Prisma } from '@prisma/client';
import { prisma } from '../prismaClient';
import type { ICandidateRepository } from '../../domain/repositories/ICandidateRepository';
import { Candidate } from '../../domain/models/Candidate';
import { Education } from '../../domain/models/Education';
import { WorkExperience } from '../../domain/models/WorkExperience';

export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`A candidate with email "${email}" already exists`);
    this.name = 'DuplicateEmailError';
    Object.setPrototypeOf(this, DuplicateEmailError.prototype);
  }
}

export class PrismaCandidateRepository implements ICandidateRepository {
  async save(candidate: Candidate): Promise<Candidate> {
    try {
      const result = await prisma.candidate.create({
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
            create: candidate.workExperiences.map((exp) => ({
              company: exp.company,
              position: exp.position,
              description: exp.description ?? null,
              startDate: exp.startDate,
              endDate: exp.endDate ?? null,
            })),
          },
          ...(candidate.resumeFile
            ? {
                resumes: {
                  create: [
                    {
                      filePath: candidate.resumeFile.path,
                      fileType: candidate.resumeFile.mimeType,
                      uploadDate: new Date(),
                    },
                  ],
                },
              }
            : {}),
        },
        include: {
          educations: true,
          workExperiences: true,
          resumes: true,
        },
      });

      const educations = result.educations.map(
        (edu) =>
          new Education(
            edu.institution,
            edu.title,
            edu.startDate,
            edu.endDate ?? undefined,
            edu.id,
          ),
      );

      const workExperiences = result.workExperiences.map(
        (exp) =>
          new WorkExperience(
            exp.company,
            exp.position,
            exp.startDate,
            exp.description ?? undefined,
            exp.endDate ?? undefined,
            exp.id,
          ),
      );

      return new Candidate(
        result.firstName,
        result.lastName,
        result.email,
        educations,
        workExperiences,
        result.phone ?? undefined,
        result.address ?? undefined,
        candidate.resumeFile,
        result.id,
      );
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new DuplicateEmailError(candidate.email);
      }
      throw error;
    }
  }
}
