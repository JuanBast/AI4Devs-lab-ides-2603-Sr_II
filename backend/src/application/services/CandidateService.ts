import { readFileSync, renameSync, unlinkSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { extname, dirname, join } from 'path';
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

    let resolvedResumeFile = payload.resumeFile;

    if (resolvedResumeFile) {
      const filePath = resolvedResumeFile.path;
      const declaredMimeType = resolvedResumeFile.mimeType;

      // Read file and verify magic bytes to prevent MIME spoofing
      let fileBuffer: Buffer;
      try {
        fileBuffer = readFileSync(filePath);
      } catch {
        throw new ValidationError(['Resume file could not be read']);
      }

      const isValid = validateMagicBytes(fileBuffer, declaredMimeType);
      if (!isValid) {
        // Clean up the rejected file
        try {
          if (existsSync(filePath)) {
            unlinkSync(filePath);
          }
        } catch {
          // Best-effort cleanup — do not mask original error
        }
        throw new ValidationError(['Resume file content does not match declared type']);
      }

      // Rename to UUID-based opaque filename
      const ext = extname(filePath);
      const dir = dirname(filePath);
      const newFilename = `${randomUUID()}${ext}`;
      const newFilePath = join(dir, newFilename);

      renameSync(filePath, newFilePath);
      resolvedResumeFile = { path: newFilePath, mimeType: declaredMimeType };
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
