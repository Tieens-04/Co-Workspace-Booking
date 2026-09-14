import { useEffect, useState } from 'react';
import { getHealthCheck, HealthCheckData } from './services/api';

export default function App() {
  const [health, setHealth] = useState<HealthCheckData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHealthCheck()
      .then((res) => {
        setHealth(res.data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Không thể kết nối đến Backend');
        setLoading(false);
      });
  }, []);

  return (
    <main
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '3rem',
        maxWidth: '800px',
        margin: '0 auto',
        lineHeight: '1.6',
      }}
    >
      <header
        style={{ borderBottom: '2px solid #eee', paddingBottom: '1rem', marginBottom: '2rem' }}
      >
        <h1 style={{ color: '#2563eb', margin: 0 }}>🏢 Co-Space Working</h1>
        <p style={{ color: '#666' }}>Hệ thống đặt chỗ làm việc thông minh (Co-Workspace Booking)</p>
      </header>

      <section
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.5rem',
          backgroundColor: '#f9fafb',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', marginTop: 0 }}>
          Kiểm tra trạng thái Backend (Health Check)
        </h2>

        {loading && <p>⏳ Đang kết nối tới Backend...</p>}

        {error && (
          <div
            style={{
              color: '#dc2626',
              backgroundColor: '#fee2e2',
              padding: '1rem',
              borderRadius: '6px',
            }}
          >
            ❌ Lỗi kết nối: {error}
          </div>
        )}

        {health && (
          <div
            style={{
              color: '#16a34a',
              backgroundColor: '#dcfce7',
              padding: '1rem',
              borderRadius: '6px',
            }}
          >
            <p style={{ margin: 0, fontWeight: 'bold' }}>✅ Kết nối Backend thành công!</p>
            <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.2rem', color: '#1f2937' }}>
              <li>
                <strong>Trạng thái:</strong> {health.status}
              </li>
              <li>
                <strong>Dịch vụ:</strong> {health.service}
              </li>
              <li>
                <strong>Uptime:</strong> {health.uptime.toFixed(1)} giây
              </li>
              <li>
                <strong>Thời gian server:</strong> {health.timestamp}
              </li>
            </ul>
          </div>
        )}
      </section>

      <footer style={{ marginTop: '3rem', fontSize: '0.875rem', color: '#9ca3af' }}>
        Task 2001: Monorepo React + Express Setup Completed.
      </footer>
    </main>
  );
}
