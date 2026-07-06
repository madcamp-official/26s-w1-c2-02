import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Most feature pages use router hooks (useNavigate/useLocation), so wrap them.
export function renderWithRouter(ui: ReactElement, initialEntries: string[] = ['/']) {
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>);
}
