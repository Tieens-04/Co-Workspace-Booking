import React from 'react';
import { Boxes } from 'lucide-react';
import styles from './AppFooter.module.css';

export const AppFooter: React.FC = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.topRow}>
          <div className={styles.brandNote}>
            <Boxes size={16} color="var(--color-primary, #4f46e5)" />
            <span>Co-Space Working</span>
            <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
              — Nền tảng đặt phòng làm việc hiện đại & linh hoạt
            </span>
          </div>

          <div className={styles.metaInfo}>
            <span className={styles.statusIndicator}>
              <span className={styles.statusDot} />
              <span>Hệ thống hoạt động bình thường</span>
            </span>
            <span>Múi giờ: GMT+7 (Việt Nam)</span>
          </div>
        </div>

        <div className={styles.bottomRow}>
          <span>© {new Date().getFullYear()} Co-Space Working. All rights reserved.</span>
          <span>Designed with Linear Minimalist Aesthetic</span>
        </div>
      </div>
    </footer>
  );
};
