const API_URL = Cypress.env('API_URL') ?? 'http://localhost:3010';

describe('Add Candidate Form', () => {
  beforeEach(() => {
    cy.visit('/candidates/new');
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('submits the form successfully and shows success alert, then resets the form', () => {
    cy.intercept('POST', `${API_URL}/candidates`, {
      statusCode: 201,
      body: {
        data: {
          id: 1,
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
        },
      },
    }).as('createCandidate');

    cy.get('[data-testid="first-name-input"]').type('Jane');
    cy.get('[data-testid="last-name-input"]').type('Doe');
    cy.get('[data-testid="email-input"]').type('jane@example.com');
    cy.get('[data-testid="education-institution-0"]').type('MIT');
    cy.get('[data-testid="education-title-0"]').type('BSc Computer Science');
    cy.get('[data-testid="education-start-date-0"]').type('2018-09-01');

    cy.get('[data-testid="submit-btn"]').click();

    cy.wait('@createCandidate');

    cy.get('[data-testid="success-alert"]').should('be.visible');
    cy.get('[data-testid="success-alert"]').should('contain.text', 'Candidate added successfully');

    // Form should be reset after success
    cy.get('[data-testid="first-name-input"]').should('have.value', '');
    cy.get('[data-testid="last-name-input"]').should('have.value', '');
    cy.get('[data-testid="email-input"]').should('have.value', '');
  });

  // ── Validation errors ───────────────────────────────────────────────────────

  it('shows inline validation errors on empty submit without sending an HTTP request', () => {
    cy.intercept('POST', `${API_URL}/candidates`).as('createCandidate');

    cy.get('[data-testid="submit-btn"]').click();

    // No HTTP request should have been made
    cy.get('@createCandidate.all').should('have.length', 0);

    // Required field error messages must be visible
    cy.contains('First name is required').should('be.visible');
    cy.contains('Last name is required').should('be.visible');
    cy.contains('Email is required').should('be.visible');

    // Success alert must not appear
    cy.get('[data-testid="success-alert"]').should('not.exist');
  });

  // ── 409 Conflict ────────────────────────────────────────────────────────────

  it('shows email conflict error on 409 response', () => {
    cy.intercept('POST', `${API_URL}/candidates`, {
      statusCode: 409,
      body: { error: 'Email already registered' },
    }).as('createCandidate');

    cy.get('[data-testid="first-name-input"]').type('Jane');
    cy.get('[data-testid="last-name-input"]').type('Doe');
    cy.get('[data-testid="email-input"]').type('duplicate@example.com');
    cy.get('[data-testid="education-institution-0"]').type('MIT');
    cy.get('[data-testid="education-title-0"]').type('BSc Computer Science');
    cy.get('[data-testid="education-start-date-0"]').type('2018-09-01');

    cy.get('[data-testid="submit-btn"]').click();

    cy.wait('@createCandidate');

    cy.get('[data-testid="email-error"]').should('be.visible');
    cy.get('[data-testid="email-error"]').should('contain.text', 'already registered');
    cy.get('[data-testid="success-alert"]').should('not.exist');
  });

  // ── Loading state ───────────────────────────────────────────────────────────

  it('disables the submit button while the request is in flight', () => {
    cy.intercept('POST', `${API_URL}/candidates`, (req) => {
      req.on('response', (res) => {
        res.setDelay(800);
      });
      req.reply({
        statusCode: 201,
        body: { data: { id: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' } },
      });
    }).as('createCandidate');

    cy.get('[data-testid="first-name-input"]').type('Jane');
    cy.get('[data-testid="last-name-input"]').type('Doe');
    cy.get('[data-testid="email-input"]').type('jane@example.com');
    cy.get('[data-testid="education-institution-0"]').type('MIT');
    cy.get('[data-testid="education-title-0"]').type('BSc Computer Science');
    cy.get('[data-testid="education-start-date-0"]').type('2018-09-01');

    cy.get('[data-testid="submit-btn"]').click();

    // Button must be disabled while request is pending
    cy.get('[data-testid="submit-btn"]').should('be.disabled');
    cy.get('[data-testid="submit-btn"]').should('contain.text', 'Submitting...');

    cy.wait('@createCandidate');

    // Button must be re-enabled after request completes
    cy.get('[data-testid="submit-btn"]').should('not.be.disabled');
  });
});
