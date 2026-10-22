import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext';
import { THEME_STORAGE_KEY } from '../context/theme-context-base';
import { useTheme } from '../hooks/useTheme';

const Probe = () => {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme('dark')}>Tối</button>
      <button onClick={() => setTheme('light')}>Sáng</button>
    </div>
  );
};

const renderProbe = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );

describe('ThemeProvider', () => {
  it('defaults to the system theme and resolves to light when the OS is light', () => {
    renderProbe();
    expect(screen.getByTestId('theme')).toHaveTextContent('system');
    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('uses the saved preference over the system setting', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    renderProbe();
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('toggles the dark class on <html> and persists the choice', () => {
    renderProbe();

    fireEvent.click(screen.getByText('Tối'));
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    fireEvent.click(screen.getByText('Sáng'));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('ignores an invalid stored value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    renderProbe();
    expect(screen.getByTestId('theme')).toHaveTextContent('system');
  });

  it('falls back to a no-op value outside the provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('theme')).toHaveTextContent('system');
    fireEvent.click(screen.getByText('Tối'));
    expect(document.documentElement).not.toHaveClass('dark');
  });
});
