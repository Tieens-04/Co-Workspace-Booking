import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ToastProvider } from '../context/ToastContext';
import { useToast } from '../hooks/useToast';

const TestComponent = () => {
  const { showToast } = useToast();
  return (
    <div>
      <button onClick={() => showToast('Đặt phòng thành công!', 'success')}>
        Trigger Success
      </button>
      <button onClick={() => showToast('Đã có lỗi xảy ra!', 'error')}>
        Trigger Error
      </button>
    </div>
  );
};

describe('ToastContext & Toast Notification UI', () => {
  it('renders and displays a success toast when triggered', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    const btn = screen.getByText('Trigger Success');
    fireEvent.click(btn);

    const toast = screen.getByRole('status');
    expect(toast).toBeInTheDocument();
    expect(toast).toHaveTextContent('Đặt phòng thành công!');
  });

  it('renders and displays an error toast with role="alert"', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    const btn = screen.getByText('Trigger Error');
    fireEvent.click(btn);

    const alertToast = screen.getByRole('alert');
    expect(alertToast).toBeInTheDocument();
    expect(alertToast).toHaveTextContent('Đã có lỗi xảy ra!');
  });

  it('dismisses toast when close button is clicked', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText('Trigger Success'));
    expect(screen.getByText('Đặt phòng thành công!')).toBeInTheDocument();

    const closeBtn = screen.getByLabelText('Đóng thông báo');
    fireEvent.click(closeBtn);

    expect(screen.queryByText('Đặt phòng thành công!')).not.toBeInTheDocument();
  });

  it('auto-dismisses toast after duration', () => {
    vi.useFakeTimers();

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText('Trigger Success'));
    expect(screen.getByText('Đặt phòng thành công!')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4500);
    });

    expect(screen.queryByText('Đặt phòng thành công!')).not.toBeInTheDocument();

    vi.useRealTimers();
  });
});
