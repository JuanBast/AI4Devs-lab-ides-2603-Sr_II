import { Request, Response, NextFunction } from 'express';
import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import { candidateRoutes } from './routes/candidateRoutes';
import {
  corsForbiddenBody,
  internalErrorBody,
  validationErrorBody,
} from './presentation/httpResponses';

dotenv.config();

const rawAllowedOrigins = process.env.ALLOWED_ORIGINS ?? '';
const configuredOrigins: string[] = rawAllowedOrigins
  .split(',')
  .map((o) => o.trim())
  .filter((o) => o.length > 0);

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

if (process.env.NODE_ENV === 'production' && configuredOrigins.length === 0) {
  console.error(
    'FATAL: ALLOWED_ORIGINS must be set to a comma-separated list in production.',
  );
  process.exit(1);
}

const effectiveAllowedOrigins: string[] =
  configuredOrigins.length > 0 ? configuredOrigins : DEFAULT_DEV_ORIGINS;

export const app = express();

const port = process.env.PORT ?? 3010;

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    xFrameOptions: { action: 'deny' },
    hsts:
      process.env.NODE_ENV === 'production'
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
  }),
);

app.use(
  cors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (effectiveAllowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS: origin not allowed'));
      }
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/', (_req: Request, res: Response) => {
  res.send('Hello LTI!!');
});

app.use('/candidates', candidateRoutes);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res
        .status(400)
        .json(
          validationErrorBody(['Resume file must be at most 10 MB']),
        );
      return;
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      res
        .status(400)
        .json(
          validationErrorBody([
            'Resume must be a PDF or Word document (DOCX)',
          ]),
        );
      return;
    }
    res
      .status(400)
      .json(validationErrorBody([err.message]));
    return;
  }

  if (err instanceof Error && err.message.startsWith('CORS:')) {
    res.status(403).json(corsForbiddenBody());
    return;
  }

  console.error(err);
  res.status(500).json(internalErrorBody());
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}
