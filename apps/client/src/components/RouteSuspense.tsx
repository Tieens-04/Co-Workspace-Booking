import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ErrorState } from '@/components/common/EmptyState';
import { PageLoading } from './PageLoading';

interface BoundaryProps {
  resetKey: string;
  children: ReactNode;
}

interface BoundaryState {
  error: Error | null;
  resetKey: string;
}

/**
 * Catches a failed lazy chunk (network drop, stale deploy) or render error for one route,
 * keeps the surrounding layout usable and resets when the user navigates elsewhere.
 */
class RouteErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState) {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Route failed to render', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-12">
        <ErrorState
          title="Không thể tải trang"
          description="Kết nối có thể đã bị gián đoạn hoặc ứng dụng vừa được cập nhật. Tải lại trang để thử lại."
          retryLabel="Tải lại trang"
          retryTestId="route-error-retry"
          onRetry={() => window.location.reload()}
          data-testid="route-error"
        />
      </div>
    );
  }
}

/** Suspense + error fallback for lazily loaded routes and layouts. */
export function RouteSuspense({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <RouteErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageLoading />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}
