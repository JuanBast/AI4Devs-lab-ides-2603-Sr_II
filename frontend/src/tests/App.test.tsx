import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../App';

test('renders the dashboard with add candidate link', () => {
  render(<App />);
  const addCandidateButton = screen.getByTestId('add-candidate-link');
  expect(addCandidateButton).toBeInTheDocument();
});
