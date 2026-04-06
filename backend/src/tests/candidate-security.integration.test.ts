import request from 'supertest';

describe('SCRUM-8 security integration', () => {
  afterEach(() => {
    jest.resetModules();
    delete process.env.CANDIDATE_RATE_LIMIT_MAX;
    delete process.env.CANDIDATE_RATE_LIMIT_WINDOW_MS;
    delete process.env.ALLOWED_ORIGINS;
  });

  describe('HTTP security headers (helmet)', () => {
    it('sets X-Content-Type-Options and X-Frame-Options on responses', async () => {
      jest.resetModules();
      process.env.NODE_ENV = 'test';
      process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('../index');

      const response = await request(app).get('/');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
    });
  });

  describe('CORS allowlist', () => {
    it('returns 403 when Origin is not in ALLOWED_ORIGINS', async () => {
      jest.resetModules();
      process.env.NODE_ENV = 'test';
      process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('../index');

      const response = await request(app)
        .get('/')
        .set('Origin', 'https://evil.example');

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'CORS_FORBIDDEN' },
      });
    });
  });

  describe('Rate limiting on /candidates', () => {
    it('returns 429 after exceeding the configured limit', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.resetModules();
      process.env.NODE_ENV = 'test';
      process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
      process.env.CANDIDATE_RATE_LIMIT_MAX = '2';
      process.env.CANDIDATE_RATE_LIMIT_WINDOW_MS = '900000';
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('../index');

      await request(app).post('/candidates').send({});
      await request(app).post('/candidates').send({});
      const third = await request(app).post('/candidates').send({});

      expect(third.status).toBe(429);
      expect(third.body).toMatchObject({
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED' },
      });
      warnSpy.mockRestore();
    });
  });
});
