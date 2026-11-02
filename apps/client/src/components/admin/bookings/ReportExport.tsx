import { useState } from 'react';
import { CircleAlert, Download, Loader2 } from 'lucide-react';
import { Field } from '@/components/common/Field';
import { NativeSelect } from '@/components/common/NativeSelect';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { adminReportApi, ReportKind, saveBlob } from '../../../services/admin-report.api';
import { getVietnamTodayString } from '../../../utils/bookingTime';

const MAX_DAYS = 92;

/** Reads the JSON error carried in a blob error response. */
async function errorMessage(err: unknown): Promise<string> {
  const data = (err as { response?: { data?: unknown } }).response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { message?: string };
      if (parsed.message) return parsed.message;
    } catch {
      // fall through to the generic message
    }
  }
  return 'Không thể xuất báo cáo. Vui lòng thử lại.';
}

/** CSV export of bookings / daily revenue for a bounded Vietnam-date period (CWB-69). */
export function ReportExport() {
  const today = getVietnamTodayString();
  const [startDate, setStartDate] = useState(`${today.slice(0, 8)}01`);
  const [endDate, setEndDate] = useState(today);
  const [paymentStatus, setPaymentStatus] = useState<'' | 'PAID' | 'UNPAID'>('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ReportKind | null>(null);

  const download = async (kind: ReportKind) => {
    if (pending) return;
    if (!startDate || !endDate || startDate > endDate) {
      setError('Chọn kỳ hợp lệ: ngày bắt đầu không được sau ngày kết thúc.');
      return;
    }
    if ((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000 >= MAX_DAYS) {
      setError(`Kỳ xuất tối đa ${MAX_DAYS} ngày.`);
      return;
    }
    setError(null);
    setPending(kind);
    try {
      const blob = await adminReportApi.download(kind, {
        startDate,
        endDate,
        ...(paymentStatus ? { paymentStatus } : {}),
      });
      saveBlob(blob, `${kind}_${startDate}_${endDate}.csv`);
    } catch (err) {
      setError(await errorMessage(err));
    } finally {
      setPending(null);
    }
  };

  return (
    <Card className="gap-4 p-5" data-testid="report-export">
      <div>
        <h2 className="text-base font-semibold">Xuất báo cáo CSV</h2>
        <p className="text-sm text-muted-foreground">
          Theo ngày bắt đầu (giờ Việt Nam), tối đa {MAX_DAYS} ngày và 10.000 đơn mỗi lần.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="report-start" label="Từ ngày">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field id="report-end" label="Đến ngày">
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        <Field id="report-payment" label="Thanh toán">
          <NativeSelect
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value as '' | 'PAID' | 'UNPAID')}
          >
            <option value="">Tất cả</option>
            <option value="PAID">Đã thanh toán</option>
            <option value="UNPAID">Chưa thanh toán</option>
          </NativeSelect>
        </Field>
      </div>
      {error && (
        <Alert variant="destructive" data-testid="report-export-error">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        {(['bookings', 'revenue'] as const).map((kind) => (
          <Button
            key={kind}
            type="button"
            variant="outline"
            disabled={pending !== null}
            onClick={() => void download(kind)}
          >
            {pending === kind ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Download aria-hidden="true" />
            )}
            {kind === 'bookings' ? 'Xuất danh sách đơn' : 'Xuất doanh thu theo ngày'}
          </Button>
        ))}
      </div>
    </Card>
  );
}
