import { Request, Response, NextFunction } from 'express';
import { CandidateService } from '../../application/services/CandidateService';
import { ValidationError } from '../../application/validator';
import { DuplicateEmailError } from '../../infrastructure/repositories/PrismaCandidateRepository';

export class CandidateController {
  constructor(private readonly candidateService: CandidateService) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let educations: unknown = req.body.educations;
      let workExperiences: unknown = req.body.workExperiences;

      if (typeof educations === 'string') {
        try {
          educations = JSON.parse(educations);
        } catch {
          res.status(400).json({
            error: 'Validation failed',
            details: ['educations: must be a valid JSON array'],
          });
          return;
        }
      }

      if (typeof workExperiences === 'string') {
        try {
          workExperiences = JSON.parse(workExperiences);
        } catch {
          res.status(400).json({
            error: 'Validation failed',
            details: ['workExperiences: must be a valid JSON array'],
          });
          return;
        }
      }

      const body: Record<string, unknown> = {
        ...req.body,
        educations,
        workExperiences,
      };

      const resumeFile = req.file
        ? { path: req.file.path, mimeType: req.file.mimetype }
        : undefined;

      const result = await this.candidateService.createCandidate({ body, resumeFile });

      res.status(201).json({ data: result });
    } catch (error: unknown) {
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message, details: error.details });
        return;
      }

      if (error instanceof DuplicateEmailError) {
        res.status(409).json({ error: 'Email already registered' });
        return;
      }

      next(error);
    }
  };
}
