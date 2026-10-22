import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../context/ToastContext';
import { useToast } from '../hooks/useToast';

const TestComponent = () => {
  const { showToast } = useToast();
  return (
    <div>
      <button onClick={() => showToast('Đặt phòng thành công!', 'success')}>Trigger Success</button>
      <button onClick={() => showToast('Đã có lỗi xảy ra!', 'error')}>Trigger Error</button>
    </div>
  );
};

const renderWithProvider = () =>
  render(
    <ToastProvider>
      <TestComponent />
    </ToastProvider>,
  );

describe('ToastContext & Toast Notification UI', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders and displays a success toast when triggered', async () => {
    renderWithProvider();

    fireEvent.click(screen.getByText('Trigger Success'));

    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('Đặt phòng thành công!');
  });

  it('renders and displays an error toast with role="alert"', async () => {
    renderWithProvider();

    fireEvent.click(screen.getByText('Trigger Error'));

    const alertToast = await screen.findByRole('alert');
    expect(alertToast).toHaveTextContent('Đã có lỗi xảy ra!');
  });

  it('dismisses toast when close button is clicked', async () => {
    renderWithProvider();

    fireEvent.click(screen.getByText('Trigger Success'));
    expect(await screen.findByText('Đặt phòng thành công!')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Đóng thông báo'));

    await waitFor(() => {
      expect(screen.queryByText('Đặt phòng thành công!')).not.toBeInTheDocument();
    });
  });

  it('auto-dismisses toast after duration', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithProvider();

    fireEvent.click(screen.getByText('Trigger Success'));
    expect(await screen.findByText('Đặt phòng thành công!')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(4500);
    });

    await waitFor(() => {
      expect(screen.queryByText('Đặt phòng thành công!')).not.toBeInTheDocument();
    });
  });
});
