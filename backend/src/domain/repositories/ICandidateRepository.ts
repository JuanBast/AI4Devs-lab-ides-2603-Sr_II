import type { Candidate } from '../models/Candidate';

export interface ICandidateRepository {
  save(candidate: Candidate): Promise<Candidate>;
}
