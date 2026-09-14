import app from './app.js';
import { ENV } from './config/env.config.js';

app.listen(ENV.PORT, () => {
  console.log(`🚀 [Server] Backend đang chạy tại http://localhost:${ENV.PORT}`);
  console.log(`📡 [HealthCheck] http://localhost:${ENV.PORT}/api/v1/health`);
});
