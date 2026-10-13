import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { GuestRoute, AdminRoute, CustomerRoute } from './components/RouteGuard';
import { HomePage } from './pages/HomePage';
import { RoomDetailPage } from './pages/RoomDetailPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AdminPage } from './pages/AdminPage';
import { AdminBookingsPage } from './pages/AdminBookingsPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { BookingConfirmationPage } from './pages/BookingConfirmationPage';
import { BookingHistoryPage } from './pages/BookingHistoryPage';
import { BookingDetailPage } from './pages/BookingDetailPage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/rooms/:id" element={<RoomDetailPage />} />
          <Route
            path="/booking-confirmation"
            element={
              <CustomerRoute>
                <BookingConfirmationPage />
              </CustomerRoute>
            }
          />
          <Route
            path="/bookings"
            element={
              <CustomerRoute>
                <BookingHistoryPage />
              </CustomerRoute>
            }
          />
          <Route
            path="/bookings/:id"
            element={
              <CustomerRoute>
                <BookingDetailPage />
              </CustomerRoute>
            }
          />
          <Route
            path="/login"
            element={
              <GuestRoute>
                <LoginPage />
              </GuestRoute>
            }
          />
          <Route
            path="/register"
            element={
              <GuestRoute>
                <RegisterPage />
              </GuestRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <AdminRoute>
                <AdminDashboardPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/bookings"
            element={
              <AdminRoute>
                <AdminBookingsPage />
              </AdminRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
