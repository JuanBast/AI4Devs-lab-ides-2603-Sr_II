import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import { Request } from 'express';

export const ALLOWED_RESUME_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const MAX_RESUME_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function buildResumeDiskStorage(uploadDir: string): multer.DiskStorageOptions {
  return {
    destination: (_req: Request, _file: Express.Multer.File, cb) => {
      cb(null, uploadDir);
    },
    filename: (_req: Request, file: Express.Multer.File, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname);
      cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    },
  };
}

export function resumeFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void {
  if (
    (ALLOWED_RESUME_MIME_TYPES as readonly string[]).includes(file.mimetype)
  ) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
  }
}

export function createCandidateResumeUpload(uploadDir: string): multer.Multer {
  return multer({
    storage: multer.diskStorage(buildResumeDiskStorage(uploadDir)),
    fileFilter: resumeFileFilter,
    limits: { fileSize: MAX_RESUME_FILE_SIZE_BYTES },
  });
}
