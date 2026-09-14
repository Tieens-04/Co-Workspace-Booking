import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface HealthCheckData {
  status: string;
  timestamp: string;
  uptime: number;
  service: string;
}

export const getHealthCheck = async () => {
  const response = await apiClient.get<{
    success: boolean;
    message: string;
    data: HealthCheckData;
  }>('/health');
  return response.data;
};
