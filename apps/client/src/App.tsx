import { lazy } from 'react';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';
import { LazyMotion, MotionConfig } from 'motion/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { GuestRoute, AdminRoute, CustomerRoute } from './components/RouteGuard';
import { RouteSuspense } from './components/RouteSuspense';
import { PublicLayout } from './layouts/PublicLayout';

// Animation features load after first paint; one retry covers a transient network blip.
const loadMotionFeatures = () =>
  import('./lib/motion-features')
    .catch(() => import('./lib/motion-features'))
    .then((mod) => mod.default);

// Route-level code splitting: the landing page's GSAP and the admin screens load on demand.
// Layouts wrap their <Outlet /> in <RouteSuspense>, so the shell stays visible while a page loads.
// Auth/admin shells are lazy too; their route guards stay eager so RBAC runs before any download.
const AuthLayout = lazy(() =>
  import('./layouts/AuthLayout').then((m) => ({ default: m.AuthLayout })),
);
const AdminLayout = lazy(() =>
  import('./layouts/AdminLayout').then((m) => ({ default: m.AdminLayout })),
);
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const RoomsPage = lazy(() => import('./pages/RoomsPage').then((m) => ({ default: m.RoomsPage })));
const RoomDetailPage = lazy(() =>
  import('./pages/RoomDetailPage').then((m) => ({ default: m.RoomDetailPage })),
);
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() =>
  import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const AdminBookingsPage = lazy(() =>
  import('./pages/AdminBookingsPage').then((m) => ({ default: m.AdminBookingsPage })),
);
const AdminDashboardPage = lazy(() =>
  import('./pages/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })),
);
const BookingConfirmationPage = lazy(() =>
  import('./pages/BookingConfirmationPage').then((m) => ({ default: m.BookingConfirmationPage })),
);
const BookingHistoryPage = lazy(() =>
  import('./pages/BookingHistoryPage').then((m) => ({ default: m.BookingHistoryPage })),
);
const BookingDetailPage = lazy(() =>
  import('./pages/BookingDetailPage').then((m) => ({ default: m.BookingDetailPage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);

export default function App() {
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        <LazyMotion features={loadMotionFeatures} strict>
          <TooltipProvider delayDuration={300}>
            <BrowserRouter>
              <AuthProvider>
                <ToastProvider>
                  <Routes>
                    <Route element={<PublicLayout />}>
                      <Route index element={<HomePage />} />
                      <Route path="rooms" element={<RoomsPage />} />
                      <Route path="rooms/:id" element={<RoomDetailPage />} />
                      <Route
                        element={
                          <CustomerRoute>
                            <Outlet />
                          </CustomerRoute>
                        }
                      >
                        <Route path="booking-confirmation" element={<BookingConfirmationPage />} />
                        <Route path="bookings" element={<BookingHistoryPage />} />
                        <Route path="bookings/:id" element={<BookingDetailPage />} />
                      </Route>
                      <Route path="*" element={<NotFoundPage />} />
                    </Route>

                    <Route
                      element={
                        <GuestRoute>
                          <RouteSuspense>
                            <AuthLayout />
                          </RouteSuspense>
                        </GuestRoute>
                      }
                    >
                      <Route path="login" element={<LoginPage />} />
                      <Route path="register" element={<RegisterPage />} />
                    </Route>

                    <Route
                      path="admin"
                      element={
                        <AdminRoute>
                          <RouteSuspense>
                            <AdminLayout />
                          </RouteSuspense>
                        </AdminRoute>
                      }
                    >
                      <Route index element={<AdminPage />} />
                      <Route path="dashboard" element={<AdminDashboardPage />} />
                      <Route path="bookings" element={<AdminBookingsPage />} />
                    </Route>
                  </Routes>
                </ToastProvider>
              </AuthProvider>
            </BrowserRouter>
          </TooltipProvider>
        </LazyMotion>
      </MotionConfig>
    </ThemeProvider>
  );
}
