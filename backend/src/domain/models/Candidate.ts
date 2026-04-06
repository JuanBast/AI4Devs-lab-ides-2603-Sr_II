import { Education } from './Education';
import { WorkExperience } from './WorkExperience';

export interface ResumeFile {
  path: string;
  mimeType: string;
}

export class Candidate {
  constructor(
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly email: string,
    public readonly educations: Education[],
    public readonly workExperiences: WorkExperience[],
    public readonly phone?: string,
    public readonly address?: string,
    public readonly resumeFile?: ResumeFile,
    public readonly id?: number,
  ) {}
}
