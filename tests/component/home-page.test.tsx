import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

describe('HomePage', () => {
  it('renders the application title', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Salary Management');
  });

  it('renders the bootstrapping notice', () => {
    render(<HomePage />);
    expect(screen.getByText(/bootstrapping in progress/i)).toBeInTheDocument();
  });
});
