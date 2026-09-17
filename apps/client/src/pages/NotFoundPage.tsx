import React from 'react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  return (
    <main className="page-container">
      <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <h1 style={{ fontSize: '3rem', color: 'var(--color-primary)', margin: '0 0 1rem 0' }}>
          404
        </h1>
        <h2 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem 0' }}>Không tìm thấy trang</h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
          Đường dẫn bạn yêu cầu không tồn tại trên hệ thống hoặc đã được di chuyển.
        </p>
        <div>
          <Link to="/" className="btn btn-primary">
            Về trang chủ
          </Link>
        </div>
      </div>
    </main>
  );
};
