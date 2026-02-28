import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ResultsChart } from './ResultsChart';

it('renders placeholder without results', () => {
  render(<ResultsChart results={null} />);
  expect(screen.getByText(/Run a simulation/i)).toBeInTheDocument();
});
