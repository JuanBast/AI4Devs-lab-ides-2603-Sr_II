import multer from 'multer';
import { Request } from 'express';
import {
  buildResumeDiskStorage,
  createCandidateResumeUpload,
  resumeFileFilter,
  ALLOWED_RESUME_MIME_TYPES,
} from '../routes/candidateResumeMulter';

describe('candidateResumeMulter', () => {
  describe('buildResumeDiskStorage', () => {
    it('writes uploads to the configured directory', (done) => {
      const opts = buildResumeDiskStorage('/var/uploads');
      const file = { fieldname: 'resume', originalname: 'cv.pdf' } as Express.Multer.File;

      if (typeof opts.destination !== 'function') {
        throw new Error('expected destination callback');
      }
      opts.destination({} as Request, file, (err: Error | null, dest: string) => {
        expect(err).toBeNull();
        expect(dest).toBe('/var/uploads');
        done();
      });
    });

    it('builds a filename with field name, suffix, and original extension', (done) => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const opts = buildResumeDiskStorage('/tmp');
      const file = { fieldname: 'resume', originalname: 'My CV.pdf' } as Express.Multer.File;

      if (typeof opts.filename !== 'function') {
        throw new Error('expected filename callback');
      }
      opts.filename({} as Request, file, (err: Error | null, name: string) => {
        expect(err).toBeNull();
        expect(name).toMatch(/^resume-1700000000000-500000000\.pdf$/);
        nowSpy.mockRestore();
        randomSpy.mockRestore();
        done();
      });
    });
  });

  describe('resumeFileFilter', () => {
    it('accepts PDF MIME type', (done) => {
      const file = {
        fieldname: 'resume',
        mimetype: ALLOWED_RESUME_MIME_TYPES[0],
      } as Express.Multer.File;

      resumeFileFilter({} as Request, file, (err: Error | null, accept?: boolean) => {
        expect(err).toBeNull();
        expect(accept).toBe(true);
        done();
      });
    });

    it('rejects disallowed MIME types with LIMIT_UNEXPECTED_FILE', (done) => {
      const file = {
        fieldname: 'resume',
        mimetype: 'application/x-msdownload',
      } as Express.Multer.File;

      resumeFileFilter({} as Request, file, (err: Error | null) => {
        expect(err).toBeInstanceOf(multer.MulterError);
        expect((err as multer.MulterError).code).toBe('LIMIT_UNEXPECTED_FILE');
        done();
      });
    });
  });

  describe('createCandidateResumeUpload', () => {
    it('returns a multer instance with single-file middleware', () => {
      const upload = createCandidateResumeUpload('/tmp/uploads');
      expect(upload.single).toEqual(expect.any(Function));
    });
  });
});
