import React from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Button, Container } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import AddCandidateForm from './components/AddCandidateForm';

const Dashboard: React.FC = () => (
  <Container className="py-5 text-center">
    <h1 className="mb-4">LTI ATS Dashboard</h1>
    <p className="text-muted mb-4">Welcome to the talent acquisition system.</p>
    <Link to="/candidates/new">
      <Button
        variant="primary"
        size="lg"
        data-testid="add-candidate-link"
        aria-label="Add new candidate"
      >
        Add New Candidate
      </Button>
    </Link>
  </Container>
);

const App: React.FC = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/candidates/new" element={<AddCandidateForm />} />
    </Routes>
  </BrowserRouter>
);

export default App;
