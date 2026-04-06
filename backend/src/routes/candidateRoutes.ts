import { Router } from 'express';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { CandidateController } from '../presentation/controllers/CandidateController';
import { CandidateService } from '../application/services/CandidateService';
import { PrismaCandidateRepository } from '../infrastructure/repositories/PrismaCandidateRepository';
import { createCandidateResumeUpload } from './candidateResumeMulter';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(__dirname, '..', '..', 'uploads');

const upload = createCandidateResumeUpload(UPLOAD_DIR);

const rateLimitWindowMs = Number.parseInt(
  process.env.CANDIDATE_RATE_LIMIT_WINDOW_MS ?? '',
  10,
);
const rateLimitMax = Number.parseInt(
  process.env.CANDIDATE_RATE_LIMIT_MAX ?? '',
  10,
);

const candidateRateLimiter = rateLimit({
  windowMs: Number.isFinite(rateLimitWindowMs)
    ? rateLimitWindowMs
    : 15 * 60 * 1000,
  max: Number.isFinite(rateLimitMax) && rateLimitMax > 0 ? rateLimitMax : 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn('[RATE_LIMIT]', {
      ip: req.ip,
      path: req.path,
      at: new Date().toISOString(),
    });
    res.status(429).json({
      success: false,
      error: { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
    });
  },
});

const repository = new PrismaCandidateRepository();
const service = new CandidateService(repository);
const controller = new CandidateController(service);

const router = Router();

router.use(candidateRateLimiter);

router.post('/', upload.single('resume'), (req, res, next) => {
  controller.create(req, res, next);
});

export { router as candidateRoutes };
