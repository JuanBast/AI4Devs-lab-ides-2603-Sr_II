import React, { useState } from 'react';
import { Alert, Button, Col, Container, Form, Row } from 'react-bootstrap';
import { isAxiosError } from 'axios';
import { candidateService } from '../services/candidateService';

// ─── Types ───────────────────────────────────────────────────────────────────

type EducationEntry = {
  institution: string;
  title: string;
  startDate: string;
  endDate: string;
};

type WorkExperienceEntry = {
  company: string;
  position: string;
  description: string;
  startDate: string;
  endDate: string;
};

type FormErrors = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  educations?: Array<Partial<Record<keyof EducationEntry, string>>>;
  workExperiences?: Array<Partial<Record<keyof WorkExperienceEntry, string>>>;
  resume?: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const BLANK_EDUCATION: EducationEntry = {
  institution: '',
  title: '',
  startDate: '',
  endDate: '',
};

const BLANK_WORK: WorkExperienceEntry = {
  company: '',
  position: '',
  description: '',
  startDate: '',
  endDate: '',
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCEPTED_RESUME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB

// ─── Component ───────────────────────────────────────────────────────────────

const AddCandidateForm: React.FC = () => {
  // Personal fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  // Dynamic sections
  const [educations, setEducations] = useState<EducationEntry[]>([{ ...BLANK_EDUCATION }]);
  const [workExperiences, setWorkExperiences] = useState<WorkExperienceEntry[]>([]);

  // File
  const [resume, setResume] = useState<File | null>(null);

  // UI state
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // ── Validation ─────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!firstName.trim()) {
      newErrors.firstName = 'First name is required.';
    } else if (firstName.length > 100) {
      newErrors.firstName = 'First name must not exceed 100 characters.';
    }

    if (!lastName.trim()) {
      newErrors.lastName = 'Last name is required.';
    } else if (lastName.length > 100) {
      newErrors.lastName = 'Last name must not exceed 100 characters.';
    }

    if (!email.trim()) {
      newErrors.email = 'Email is required.';
    } else if (!EMAIL_REGEX.test(email)) {
      newErrors.email = 'Please enter a valid email address.';
    } else if (email.length > 255) {
      newErrors.email = 'Email must not exceed 255 characters.';
    }

    if (phone && phone.length > 15) {
      newErrors.phone = 'Phone must not exceed 15 characters.';
    }

    if (address && address.length > 100) {
      newErrors.address = 'Address must not exceed 100 characters.';
    }

    // Education validation
    const educationErrors: Array<Partial<Record<keyof EducationEntry, string>>> =
      educations.map((edu) => {
        const eduErrors: Partial<Record<keyof EducationEntry, string>> = {};
        if (!edu.institution.trim()) {
          eduErrors.institution = 'Institution is required.';
        } else if (edu.institution.length > 100) {
          eduErrors.institution = 'Institution must not exceed 100 characters.';
        }
        if (!edu.title.trim()) {
          eduErrors.title = 'Title is required.';
        } else if (edu.title.length > 250) {
          eduErrors.title = 'Title must not exceed 250 characters.';
        }
        if (!edu.startDate) {
          eduErrors.startDate = 'Start date is required.';
        }
        if (edu.endDate && edu.startDate && edu.endDate <= edu.startDate) {
          eduErrors.endDate = 'End date must be after start date.';
        }
        return eduErrors;
      });

    if (educationErrors.some((e) => Object.keys(e).length > 0)) {
      newErrors.educations = educationErrors;
    }

    // Work experience validation
    if (workExperiences.length > 0) {
      const workErrors: Array<Partial<Record<keyof WorkExperienceEntry, string>>> =
        workExperiences.map((work) => {
          const workErr: Partial<Record<keyof WorkExperienceEntry, string>> = {};
          if (!work.company.trim()) {
            workErr.company = 'Company is required.';
          } else if (work.company.length > 100) {
            workErr.company = 'Company must not exceed 100 characters.';
          }
          if (!work.position.trim()) {
            workErr.position = 'Position is required.';
          } else if (work.position.length > 100) {
            workErr.position = 'Position must not exceed 100 characters.';
          }
          if (work.description && work.description.length > 200) {
            workErr.description = 'Description must not exceed 200 characters.';
          }
          if (!work.startDate) {
            workErr.startDate = 'Start date is required.';
          }
          if (work.endDate && work.startDate && work.endDate <= work.startDate) {
            workErr.endDate = 'End date must be after start date.';
          }
          return workErr;
        });

      if (workErrors.some((e) => Object.keys(e).length > 0)) {
        newErrors.workExperiences = workErrors;
      }
    }

    // Resume validation
    if (resume) {
      if (!ACCEPTED_RESUME_TYPES.includes(resume.type)) {
        newErrors.resume = 'Only .pdf, .doc, and .docx files are accepted.';
      } else if (resume.size > MAX_RESUME_BYTES) {
        newErrors.resume = 'File size must not exceed 5 MB.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── Form Data Builder ──────────────────────────────────────────────────────

  const buildFormData = (): FormData => {
    const fd = new FormData();
    fd.append('firstName', firstName);
    fd.append('lastName', lastName);
    fd.append('email', email);
    if (phone) fd.append('phone', phone);
    if (address) fd.append('address', address);
    fd.append('educations', JSON.stringify(educations));
    fd.append('workExperiences', JSON.stringify(workExperiences));
    if (resume) fd.append('resume', resume);
    return fd;
  };

  // ── Form Reset ─────────────────────────────────────────────────────────────

  const resetForm = (): void => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setAddress('');
    setEducations([{ ...BLANK_EDUCATION }]);
    setWorkExperiences([]);
    setResume(null);
    setErrors({});
  };

  // ── Submit Handler ─────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setSuccessMessage('');
    setErrorMessage('');

    try {
      await candidateService.createCandidate(buildFormData());
      setSuccessMessage('Candidate added successfully.');
      resetForm();
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 409) {
        setErrors((prev) => ({ ...prev, email: 'This email is already registered.' }));
      } else {
        setErrorMessage('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Education Handlers ─────────────────────────────────────────────────────

  const addEducation = (): void => {
    setEducations((prev) => [...prev, { ...BLANK_EDUCATION }]);
  };

  const removeEducation = (index: number): void => {
    setEducations((prev) => prev.filter((_, i) => i !== index));
  };

  const updateEducation = (
    index: number,
    field: keyof EducationEntry,
    value: string
  ): void => {
    setEducations((prev) =>
      prev.map((edu, i) => (i === index ? { ...edu, [field]: value } : edu))
    );
  };

  // ── Work Experience Handlers ───────────────────────────────────────────────

  const addWorkExperience = (): void => {
    setWorkExperiences((prev) => [...prev, { ...BLANK_WORK }]);
  };

  const removeWorkExperience = (index: number): void => {
    setWorkExperiences((prev) => prev.filter((_, i) => i !== index));
  };

  const updateWorkExperience = (
    index: number,
    field: keyof WorkExperienceEntry,
    value: string
  ): void => {
    setWorkExperiences((prev) =>
      prev.map((work, i) => (i === index ? { ...work, [field]: value } : work))
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Container className="py-4">
      <Row className="justify-content-center">
        <Col xs={12} lg={10}>
          <h2 className="mb-4">Add New Candidate</h2>

          {successMessage && (
            <Alert variant="success" data-testid="success-alert">
              {successMessage}
            </Alert>
          )}
          {errorMessage && (
            <Alert variant="danger" data-testid="error-alert">
              {errorMessage}
            </Alert>
          )}

          <Form onSubmit={handleSubmit} noValidate>
            {/* ── Personal Information ───────────────────────────────────── */}
            <h5 className="mb-3">Personal Information</h5>
            <Row>
              <Col xs={12} md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>First Name *</Form.Label>
                  <Form.Control
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    isInvalid={!!errors.firstName}
                    data-testid="first-name-input"
                    aria-label="First name"
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.firstName}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col xs={12} md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Last Name *</Form.Label>
                  <Form.Control
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    isInvalid={!!errors.lastName}
                    data-testid="last-name-input"
                    aria-label="Last name"
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.lastName}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>

            <Row>
              <Col xs={12} md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Email *</Form.Label>
                  <Form.Control
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    isInvalid={!!errors.email}
                    data-testid="email-input"
                    aria-label="Email address"
                  />
                  <div
                    data-testid="email-error"
                    className={`invalid-feedback${errors.email ? ' d-block' : ''}`}
                  >
                    {errors.email}
                  </div>
                </Form.Group>
              </Col>
              <Col xs={12} md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Phone</Form.Label>
                  <Form.Control
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    isInvalid={!!errors.phone}
                    data-testid="phone-input"
                    aria-label="Phone number"
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.phone}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>

            <Form.Group className="mb-4">
              <Form.Label>Address</Form.Label>
              <Form.Control
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                isInvalid={!!errors.address}
                data-testid="address-input"
                aria-label="Address"
              />
              <Form.Control.Feedback type="invalid">
                {errors.address}
              </Form.Control.Feedback>
            </Form.Group>

            {/* ── Education ─────────────────────────────────────────────── */}
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0">Education *</h5>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={addEducation}
                data-testid="add-education-btn"
                aria-label="Add education entry"
              >
                + Add Education
              </Button>
            </div>

            {educations.map((edu, i) => (
              <div key={i} className="border rounded p-3 mb-3">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <strong>Education {i + 1}</strong>
                  {educations.length > 1 && (
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => removeEducation(i)}
                      data-testid={`remove-education-btn-${i}`}
                      aria-label={`Remove education entry ${i + 1}`}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <Row>
                  <Col xs={12} md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Institution *</Form.Label>
                      <Form.Control
                        type="text"
                        value={edu.institution}
                        onChange={(e) => updateEducation(i, 'institution', e.target.value)}
                        isInvalid={!!errors.educations?.[i]?.institution}
                        data-testid={`education-institution-${i}`}
                        aria-label={`Education ${i + 1} institution`}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.educations?.[i]?.institution}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Title / Degree *</Form.Label>
                      <Form.Control
                        type="text"
                        value={edu.title}
                        onChange={(e) => updateEducation(i, 'title', e.target.value)}
                        isInvalid={!!errors.educations?.[i]?.title}
                        data-testid={`education-title-${i}`}
                        aria-label={`Education ${i + 1} title`}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.educations?.[i]?.title}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>
                <Row>
                  <Col xs={12} md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Start Date *</Form.Label>
                      <Form.Control
                        type="date"
                        value={edu.startDate}
                        onChange={(e) => updateEducation(i, 'startDate', e.target.value)}
                        isInvalid={!!errors.educations?.[i]?.startDate}
                        data-testid={`education-start-date-${i}`}
                        aria-label={`Education ${i + 1} start date`}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.educations?.[i]?.startDate}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>End Date</Form.Label>
                      <Form.Control
                        type="date"
                        value={edu.endDate}
                        onChange={(e) => updateEducation(i, 'endDate', e.target.value)}
                        isInvalid={!!errors.educations?.[i]?.endDate}
                        data-testid={`education-end-date-${i}`}
                        aria-label={`Education ${i + 1} end date`}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.educations?.[i]?.endDate}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>
              </div>
            ))}

            {/* ── Work Experience ────────────────────────────────────────── */}
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0">Work Experience</h5>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={addWorkExperience}
                data-testid="add-work-btn"
                aria-label="Add work experience entry"
              >
                + Add Work Experience
              </Button>
            </div>

            {workExperiences.map((work, i) => (
              <div key={i} className="border rounded p-3 mb-3">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <strong>Work Experience {i + 1}</strong>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => removeWorkExperience(i)}
                    data-testid={`remove-work-btn-${i}`}
                    aria-label={`Remove work experience entry ${i + 1}`}
                  >
                    Remove
                  </Button>
                </div>
                <Row>
                  <Col xs={12} md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Company *</Form.Label>
                      <Form.Control
                        type="text"
                        value={work.company}
                        onChange={(e) => updateWorkExperience(i, 'company', e.target.value)}
                        isInvalid={!!errors.workExperiences?.[i]?.company}
                        data-testid={`work-company-${i}`}
                        aria-label={`Work experience ${i + 1} company`}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.workExperiences?.[i]?.company}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Position *</Form.Label>
                      <Form.Control
                        type="text"
                        value={work.position}
                        onChange={(e) => updateWorkExperience(i, 'position', e.target.value)}
                        isInvalid={!!errors.workExperiences?.[i]?.position}
                        data-testid={`work-position-${i}`}
                        aria-label={`Work experience ${i + 1} position`}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.workExperiences?.[i]?.position}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>
                <Form.Group className="mb-3">
                  <Form.Label>Description</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    value={work.description}
                    onChange={(e) => updateWorkExperience(i, 'description', e.target.value)}
                    isInvalid={!!errors.workExperiences?.[i]?.description}
                    data-testid={`work-description-${i}`}
                    aria-label={`Work experience ${i + 1} description`}
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.workExperiences?.[i]?.description}
                  </Form.Control.Feedback>
                </Form.Group>
                <Row>
                  <Col xs={12} md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Start Date *</Form.Label>
                      <Form.Control
                        type="date"
                        value={work.startDate}
                        onChange={(e) => updateWorkExperience(i, 'startDate', e.target.value)}
                        isInvalid={!!errors.workExperiences?.[i]?.startDate}
                        data-testid={`work-start-date-${i}`}
                        aria-label={`Work experience ${i + 1} start date`}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.workExperiences?.[i]?.startDate}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>End Date</Form.Label>
                      <Form.Control
                        type="date"
                        value={work.endDate}
                        onChange={(e) => updateWorkExperience(i, 'endDate', e.target.value)}
                        isInvalid={!!errors.workExperiences?.[i]?.endDate}
                        data-testid={`work-end-date-${i}`}
                        aria-label={`Work experience ${i + 1} end date`}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.workExperiences?.[i]?.endDate}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>
              </div>
            ))}

            {/* ── Resume Upload ──────────────────────────────────────────── */}
            <h5 className="mb-3">Resume</h5>
            <Form.Group className="mb-4">
              <Form.Label>Upload Resume (optional)</Form.Label>
              <Form.Control
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => {
                  const files = (e.target as HTMLInputElement).files;
                  setResume(files?.[0] ?? null);
                }}
                isInvalid={!!errors.resume}
                data-testid="resume-input"
                aria-label="Upload resume file"
              />
              <Form.Text className="text-muted">
                Accepted formats: PDF, DOC, DOCX. Max size: 5 MB.
              </Form.Text>
              <Form.Control.Feedback type="invalid">
                {errors.resume}
              </Form.Control.Feedback>
            </Form.Group>

            {/* ── Submit ────────────────────────────────────────────────── */}
            <div className="d-flex gap-2">
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
                data-testid="submit-btn"
                aria-label="Submit add candidate form"
              >
                {isSubmitting ? 'Submitting...' : 'Add Candidate'}
              </Button>
            </div>
          </Form>
        </Col>
      </Row>
    </Container>
  );
};

export default AddCandidateForm;
