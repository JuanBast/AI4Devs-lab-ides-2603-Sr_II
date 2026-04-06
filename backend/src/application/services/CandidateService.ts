import type { ICandidateRepository } from '../../domain/repositories/ICandidateRepository';
import { Candidate } from '../../domain/models/Candidate';
import { Education } from '../../domain/models/Education';
import { WorkExperience } from '../../domain/models/WorkExperience';
import { validateCreateCandidateInput } from '../validator';

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
      payload.resumeFile,
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
