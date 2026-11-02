import { apiClient } from './api';

export type ReportKind = 'bookings' | 'revenue';

export interface ReportExportParams {
  startDate: string;
  endDate: string;
  paymentStatus?: 'PAID' | 'UNPAID';
}

/** Downloads an ADMIN CSV report (CWB-69) through the authenticated API client. */
export const adminReportApi = {
  async download(kind: ReportKind, params: ReportExportParams): Promise<Blob> {
    const response = await apiClient.get<Blob>(`/admin/reports/${kind}.csv`, {
      params,
      responseType: 'blob',
    });
    return response.data;
  },
};

/** Saves a blob as a file in the browser. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
