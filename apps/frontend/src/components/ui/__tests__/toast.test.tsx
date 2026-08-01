import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it } from 'vitest';

import { createToastManager, Toaster } from '../toast';

function renderToaster() {
  const manager = createToastManager();
  render(<Toaster toastManager={manager} />);
  return manager;
}

describe('toast', () => {
  it('renders an error toast with title and description', () => {
    const manager = renderToaster();

    act(() => {
      manager.add({
        title: 'Call error',
        description: 'camera missing',
        type: 'error',
        timeout: 0
      });
    });

    expect(screen.getByText('Call error')).toBeDefined();
    expect(screen.getByText('camera missing')).toBeDefined();
  });

  it('renders an info toast', () => {
    const manager = renderToaster();

    act(() => {
      manager.add({
        title: 'Looking for peer',
        description: 'Searching for a stranger...',
        type: 'info',
        timeout: 0
      });
    });

    expect(screen.getByText('Looking for peer')).toBeDefined();
  });
});
