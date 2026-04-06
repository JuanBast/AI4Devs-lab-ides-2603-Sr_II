import { Request, Response, NextFunction } from 'express';
import { CandidateController } from '../presentation/controllers/CandidateController';
import { CandidateService } from '../application/services/CandidateService';
import { ValidationError } from '../application/validator';
import { DuplicateEmailError } from '../infrastructure/repositories/PrismaCandidateRepository';

function mockRes(): Response {
  const res = {} as Partial<Response>;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('CandidateController.create', () => {
  let service: jest.Mocked<Pick<CandidateService, 'createCandidate'>>;
  let controller: CandidateController;
  let next: NextFunction;

  beforeEach(() => {
    service = { createCandidate: jest.fn() };
    controller = new CandidateController(service as unknown as CandidateService);
    next = jest.fn();
  });

  const baseBody = {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    educations: [],
    workExperiences: [],
  };

  it('returns 201 with success envelope when creation succeeds', async () => {
    service.createCandidate.mockResolvedValue({
      id: 1,
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: null,
      address: null,
    });

    const req = {
      body: baseBody,
    } as Request;
    const res = mockRes();

    await controller.create(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        id: 1,
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        phone: null,
        address: null,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when service throws ValidationError', async () => {
    service.createCandidate.mockRejectedValue(
      new ValidationError(['firstName: required']),
    );

    const req = { body: baseBody } as Request;
    const res = mockRes();

    await controller.create(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: ['firstName: required'],
      },
    });
  });

  it('returns 409 DUPLICATE_EMAIL when email is duplicated', async () => {
    service.createCandidate.mockRejectedValue(
      new DuplicateEmailError('jane@example.com'),
    );

    const req = { body: baseBody } as Request;
    const res = mockRes();

    await controller.create(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        message: 'A candidate with this email already exists',
        code: 'DUPLICATE_EMAIL',
      },
    });
  });

  it('calls next for unexpected errors', async () => {
    service.createCandidate.mockRejectedValue(new Error('boom'));

    const req = { body: baseBody } as Request;
    const res = mockRes();

    await controller.create(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('returns 400 when educations string is invalid JSON', async () => {
    const req = {
      body: { ...baseBody, educations: 'not-json{' },
    } as Request;
    const res = mockRes();

    await controller.create(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: ['educations: must be a valid JSON array'],
      },
    });
    expect(service.createCandidate).not.toHaveBeenCalled();
  });

  it('returns 400 when workExperiences string is invalid JSON', async () => {
    const req = {
      body: { ...baseBody, workExperiences: 'x' },
    } as Request;
    const res = mockRes();

    await controller.create(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: ['workExperiences: must be a valid JSON array'],
      },
    });
  });

  it('forwards resume file path and MIME type when req.file is present', async () => {
    service.createCandidate.mockResolvedValue({
      id: 3,
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: null,
      address: null,
    });

    const req = {
      body: baseBody,
      file: {
        path: '/tmp/uuid.pdf',
        mimetype: 'application/pdf',
      },
    } as unknown as Request;
    const res = mockRes();

    await controller.create(req, res, next);

    expect(service.createCandidate).toHaveBeenCalledWith({
      body: expect.any(Object),
      resumeFile: { path: '/tmp/uuid.pdf', mimeType: 'application/pdf' },
    });
  });

  it('parses stringified educations and workExperiences before calling service', async () => {
    service.createCandidate.mockResolvedValue({
      id: 2,
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: null,
      address: null,
    });

    const edu = [{ institution: 'MIT', title: 'BSc', startDate: '2015-09-01' }];
    const req = {
      body: {
        ...baseBody,
        educations: JSON.stringify(edu),
        workExperiences: '[]',
      },
      file: undefined,
    } as Request;
    const res = mockRes();

    await controller.create(req, res, next);

    expect(service.createCandidate).toHaveBeenCalledWith({
      body: expect.objectContaining({ educations: edu, workExperiences: [] }),
      resumeFile: undefined,
    });
  });
});
