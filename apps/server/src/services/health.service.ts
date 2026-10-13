import { prisma } from '../utils/prisma.util.js';

export interface HealthCheckResult {
  status: 'OK' | 'DEGRADED';
  timestamp: string;
  uptime: number;
  service: string;
  database: 'connected' | 'disconnected';
  environment: string;
  version: string;
}

export class HealthService {
  public static async checkDatabase(): Promise<boolean> {
    try {
      if (typeof prisma?.$queryRaw === 'function') {
        await prisma.$queryRaw`SELECT 1`;
        return true;
      }
      return true;
    } catch {
      return false;
    }
  }

  public static async getReadiness(): Promise<HealthCheckResult> {
    const isDbConnected = await this.checkDatabase();
    return {
      status: isDbConnected ? 'OK' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'Co-Space Working API',
      database: isDbConnected ? 'connected' : 'disconnected',
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
    };
  }

  public static getLiveness(): Omit<HealthCheckResult, 'database'> {
    return {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'Co-Space Working API',
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
    };
  }
}
