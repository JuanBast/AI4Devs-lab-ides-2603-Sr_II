import { Request, Response, NextFunction } from 'express';
import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import { candidateRoutes } from './routes/candidateRoutes';

dotenv.config();

export const app = express();

const port = process.env.PORT ?? 3010;

app.use(express.json());

app.get('/', (_req: Request, res: Response) => {
  res.send('Hola LTI!');
});

app.use('/candidates', candidateRoutes);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        error: 'File too large',
        details: ['Resume file must be at most 5 MB'],
      });
      return;
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({
        error: 'Invalid file type',
        details: ['Resume must be a PDF or Word document (DOC/DOCX)'],
      });
      return;
    }
    res.status(400).json({
      error: 'File upload error',
      details: [err.message],
    });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
