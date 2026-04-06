import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL ?? 'http://localhost:3010';

export type CandidateResponse = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
};

export const candidateService = {
  createCandidate: async (data: FormData): Promise<CandidateResponse> => {
    try {
      const response = await axios.post<{ data: CandidateResponse }>(
        `${API_BASE_URL}/candidates`,
        data
      );
      return response.data.data;
    } catch (error) {
      console.error('Error creating candidate:', error);
      throw error;
    }
  },
};
