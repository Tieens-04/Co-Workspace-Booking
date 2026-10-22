import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Stagger, StaggerItem } from '../components/motion/Stagger';
import { SwapValue } from '../components/motion/SwapValue';
import { SuccessMark } from '../components/motion/SuccessMark';
import { ThemeProvider } from '../context/ThemeContext';
import { useTheme } from '../hooks/useTheme';

describe('motion primitives', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Stagger renders every item and forwards DOM props', () => {
    render(
      <Stagger aria-label="Danh sách" data-testid="group">
        <StaggerItem>Phòng A</StaggerItem>
        <StaggerItem>Phòng B</StaggerItem>
      </Stagger>,
    );
    expect(screen.getByTestId('group')).toHaveAttribute('aria-label', 'Danh sách');
    expect(screen.getByText('Phòng A')).toBeInTheDocument();
    expect(screen.getByText('Phòng B')).toBeInTheDocument();
  });

  it('SwapValue replaces the old value immediately (never two values in the DOM)', () => {
    const { rerender } = render(
      <p data-testid="total">
        <SwapValue value="360000">360.000 đ</SwapValue>
      </p>,
    );
    expect(screen.getByTestId('total')).toHaveTextContent('360.000 đ');

    rerender(
      <p data-testid="total">
        <SwapValue value="540000">540.000 đ</SwapValue>
      </p>,
    );
    expect(screen.getByTestId('total')).toHaveTextContent(/^540\.000 đ$/);
    expect(screen.queryByText('360.000 đ')).not.toBeInTheDocument();
  });

  it('SuccessMark is decorative', () => {
    const { container } = render(<SuccessMark />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('cross-fades colours only briefly when the user switches theme', () => {
    vi.useFakeTimers();
    const Switcher = () => {
      const { setTheme } = useTheme();
      return <button onClick={() => setTheme('dark')}>Tối</button>;
    };
    render(
      <ThemeProvider>
        <Switcher />
      </ThemeProvider>,
    );

    expect(document.documentElement).not.toHaveClass('theme-transition');
    fireEvent.click(screen.getByText('Tối'));
    expect(document.documentElement).toHaveClass('theme-transition');
    expect(document.documentElement).toHaveClass('dark');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(document.documentElement).not.toHaveClass('theme-transition');
  });
});
