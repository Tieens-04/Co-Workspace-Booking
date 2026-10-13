import { apiClient } from './api';
import {
  DashboardKpiData,
  DashboardScheduleData,
  DashboardPeriodType,
} from '../types/admin-dashboard';

export interface AdminDashboardKpiApiResponse {
  success: boolean;
  message: string;
  data: DashboardKpiData;
}

export interface AdminDashboardScheduleApiResponse {
  success: boolean;
  message: string;
  data: DashboardScheduleData;
}

export interface GetDashboardKpiParams {
  date?: string;
  period?: DashboardPeriodType;
}

export interface GetDashboardScheduleParams {
  date?: string;
}

export const adminDashboardApi = {
  getDashboardKpi: async (
    params?: GetDashboardKpiParams,
    signal?: AbortSignal,
  ): Promise<AdminDashboardKpiApiResponse> => {
    const response = await apiClient.get<AdminDashboardKpiApiResponse>(
      '/admin/dashboard/kpi',
      {
        params,
        signal,
      },
    );
    return response.data;
  },

  getDashboardSchedule: async (
    params?: GetDashboardScheduleParams,
    signal?: AbortSignal,
  ): Promise<AdminDashboardScheduleApiResponse> => {
    const response = await apiClient.get<AdminDashboardScheduleApiResponse>(
      '/admin/dashboard/schedule',
      {
        params,
        signal,
      },
    );
    return response.data;
  },
};
