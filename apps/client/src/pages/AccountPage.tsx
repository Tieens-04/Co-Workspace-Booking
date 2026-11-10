import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Loader2, LogOut, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Field } from '@/components/common/Field';
import { ErrorState } from '@/components/common/EmptyState';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmailVerificationNotice } from '../components/auth/EmailVerificationNotice';
import { PasswordInput } from '../components/auth/PasswordInput';
import { useAuth } from '../hooks/useAuth';
import { useReturnFocus } from '../hooks/useReturnFocus';
import { useToast } from '../hooks/useToast';
import { meApi } from '../services/me.api';
import { DeletionBlockingBooking, SafeUser } from '../types/auth';
import { formatVietnamDateTime } from '../components/booking/formatBookingTime';
import { normalizePhoneNumber, optionalPhoneRule } from '../utils/validation';

type ApiError = {
  response?: {
    status?: number;
    data?: {
      code?: string;
      message?: string;
      details?:
        | Array<{ field?: string; path?: (string | number)[]; message?: string }>
        | { bookings?: DeletionBlockingBooking[] };
    };
  };
};

const errorMessage = (err: unknown, fallback: string) =>
  (err as ApiError).response?.data?.message || fallback;

/** Personal profile (name, phone) and password change for any signed-in role. */
export const AccountPage: React.FC = () => {
  const { principal, login, logout, applyProfile } = useAuth();
  const { showToast } = useToast();
  const principalId = principal?.id;
  const activePrincipalRef = useRef(principalId);
  activePrincipalRef.current = principalId;

  const [profile, setProfile] = useState<SafeUser | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [isLogoutAllOpen, setIsLogoutAllOpen] = useState(false);
  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);
  const [logoutAllError, setLogoutAllError] = useState<string | null>(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [blockingBookings, setBlockingBookings] = useState<DeletionBlockingBooking[]>([]);
  const deleteDialogFocus = useReturnFocus();

  const loadProfile = useCallback(() => {
    const controller = new AbortController();
    const requestedFor = principalId;
    setIsLoading(true);
    setLoadError(null);
    meApi
      .getMe(controller.signal)
      .then((res) => {
        if (controller.signal.aborted || activePrincipalRef.current !== requestedFor) return;
        setProfile(res.data);
        setFullName(res.data.fullName);
        setPhoneNumber(res.data.phoneNumber ?? '');
        applyProfile(res.data);
        setIsLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted || activePrincipalRef.current !== requestedFor) return;
        setLoadError(errorMessage(err, 'Không thể tải thông tin tài khoản.'));
        setIsLoading(false);
      });
    return controller;
  }, [principalId, applyProfile]);

  // Reload whenever the signed-in account changes; drop the previous account's data at once.
  useEffect(() => {
    setProfile(null);
    const controller = loadProfile();
    return () => controller.abort();
  }, [loadProfile]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingProfile) return;
    setProfileSaved(false);
    setProfileError(null);
    setPhoneError(null);

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setProfileError('Họ và tên không được để trống.');
      return;
    }

    const phoneValidation = optionalPhoneRule.safeParse(phoneNumber);
    if (!phoneValidation.success) {
      setPhoneError(phoneValidation.error.issues[0].message);
      return;
    }
    const trimmedPhone = phoneNumber.trim();

    setIsSavingProfile(true);
    try {
      const res = await meApi.updateMe({
        fullName: trimmedName,
        phoneNumber: trimmedPhone ? normalizePhoneNumber(trimmedPhone) : '',
      });
      setProfile(res.data);
      setFullName(res.data.fullName);
      setPhoneNumber(res.data.phoneNumber ?? '');
      applyProfile(res.data);
      setProfileSaved(true);
      showToast('Đã cập nhật thông tin tài khoản', 'success');
    } catch (err) {
      const apiErr = err as ApiError;
      const issues = apiErr.response?.data?.details;
      const phoneIssue = Array.isArray(issues)
        ? issues.find((i) => i.field === 'phoneNumber' || (Array.isArray(i.path) && i.path.includes('phoneNumber')))
        : null;
      if (phoneIssue) {
        setPhoneError(phoneIssue.message || 'Số điện thoại không đúng định dạng');
      } else {
        setProfileError(errorMessage(err, 'Không thể cập nhật thông tin. Vui lòng thử lại.'));
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingPassword) return;
    setPasswordSaved(false);
    if (!currentPassword || newPassword.length < 8) {
      setPasswordError('Nhập mật khẩu hiện tại và mật khẩu mới có ít nhất 8 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Mật khẩu xác nhận không khớp.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('Mật khẩu mới phải khác mật khẩu hiện tại.');
      return;
    }
    setPasswordError(null);
    setIsSavingPassword(true);
    try {
      const res = await meApi.changePassword({ currentPassword, newPassword });
      // Continue this session with the token issued for the new password.
      login(res.data.accessToken, res.data.user);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSaved(true);
      showToast('Đã đổi mật khẩu', 'success');
    } catch (err) {
      setPasswordError(errorMessage(err, 'Không thể đổi mật khẩu. Vui lòng thử lại.'));
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleLogoutAllOpenChange = (open: boolean) => {
    // Keep the dialog open while the request is in flight.
    if (!open && isLoggingOutAll) return;
    if (open) setLogoutAllError(null);
    setIsLogoutAllOpen(open);
  };

  const handleLogoutAll = async () => {
    if (isLoggingOutAll) return;
    setLogoutAllError(null);
    setIsLoggingOutAll(true);
    try {
      await meApi.logoutAll();
      // The server revoked this token too, so end the local session as well.
      showToast('Đã đăng xuất khỏi mọi thiết bị', 'success');
      logout('userAction');
    } catch (err) {
      // A 401 is handled by the interceptor (session already ended); show anything else here.
      setLogoutAllError(errorMessage(err, 'Không thể đăng xuất mọi thiết bị. Vui lòng thử lại.'));
      setIsLoggingOutAll(false);
    }
  };

  const handleDeleteOpenChange = (open: boolean) => {
    if (!open && isDeleting) return;
    if (open) {
      setDeleteError(null);
      setBlockingBookings([]);
      setDeletePassword('');
    }
    setIsDeleteOpen(open);
  };

  const handleDeleteAccount = async () => {
    if (isDeleting) return;
    if (!deletePassword) {
      setDeleteError('Nhập mật khẩu hiện tại để xác nhận.');
      return;
    }
    setDeleteError(null);
    setBlockingBookings([]);
    setIsDeleting(true);
    try {
      await meApi.deleteAccount({ currentPassword: deletePassword });
      // Every token of the account is revoked server-side; end the local session too.
      showToast('Tài khoản của bạn đã được xóa', 'success');
      logout('userAction');
    } catch (err) {
      const data = (err as ApiError).response?.data;
      const details = data?.details;
      if (data?.code === 'ACCOUNT_HAS_ACTIVE_BOOKINGS' && details && !Array.isArray(details)) {
        setBlockingBookings(details.bookings ?? []);
      }
      setDeleteError(errorMessage(err, 'Không thể xóa tài khoản. Vui lòng thử lại.'));
      setIsDeleting(false);
    }
  };

  return (
    <div className="container-page py-10 md:py-14">
      <PageHeader
        eyebrow="Tài khoản của bạn"
        title="Thông tin tài khoản"
        description="Cập nhật họ tên, số điện thoại và mật khẩu đăng nhập."
      />

      {isLoading && (
        <div className="mt-8 grid gap-4" data-testid="account-loading" aria-busy="true">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-10 w-full max-w-md" />
        </div>
      )}

      {!isLoading && loadError && (
        <ErrorState
          className="mt-8"
          title={loadError}
          onRetry={() => loadProfile()}
          retryTestId="account-retry"
          data-testid="account-load-error"
        />
      )}

      {!isLoading && !loadError && profile && (
        <>
          {profile.emailVerifiedAt === null && (
            <EmailVerificationNotice className="mt-8" />
          )}
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card className="p-5 sm:p-6">
            <form noValidate onSubmit={handleProfileSubmit} data-testid="account-profile-form">
              <h2 className="text-lg font-semibold">Hồ sơ</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Email đăng nhập: <strong className="text-foreground">{profile.email}</strong> · Vai
                trò {profile.role}
              </p>
              <div className="mt-5 grid gap-4">
                <Field id="account-full-name" label="Họ và tên">
                  <Input
                    value={fullName}
                    maxLength={191}
                    autoComplete="name"
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </Field>
                <Field id="account-phone" label="Số điện thoại" hint="Để trống nếu muốn xóa." error={phoneError || undefined}>
                  <Input
                    value={phoneNumber}
                    maxLength={191}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    onChange={(e) => {
                      setPhoneNumber(e.target.value);
                      if (phoneError) setPhoneError(null);
                    }}
                  />
                </Field>
                {profileError && (
                  <Alert variant="destructive" data-testid="account-profile-error">
                    <CircleAlert aria-hidden="true" />
                    <AlertDescription>{profileError}</AlertDescription>
                  </Alert>
                )}
                {profileSaved && (
                  <p
                    role="status"
                    className="flex items-center gap-2 text-sm text-status-confirmed"
                  >
                    <CircleCheck aria-hidden="true" className="size-4" />
                    Đã lưu thay đổi.
                  </p>
                )}
                <Button type="submit" disabled={isSavingProfile} className="justify-self-start">
                  {isSavingProfile && <Loader2 aria-hidden="true" className="animate-spin" />}
                  {isSavingProfile ? 'Đang lưu…' : 'Lưu thông tin'}
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-5 sm:p-6">
            <form noValidate onSubmit={handlePasswordSubmit} data-testid="account-password-form">
              <h2 className="text-lg font-semibold">Đổi mật khẩu</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Phiên hiện tại tiếp tục với mật khẩu mới. Mọi thiết bị khác sẽ bị đăng xuất.
              </p>
              <div className="mt-5 grid gap-4">
                <Field id="account-current-password" label="Mật khẩu hiện tại">
                  <PasswordInput
                    value={currentPassword}
                    autoComplete="current-password"
                    visible={showPasswords}
                    onToggleVisible={() => setShowPasswords((v) => !v)}
                    showLabel="Hiện mật khẩu"
                    hideLabel="Ẩn mật khẩu"
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </Field>
                <Field id="account-new-password" label="Mật khẩu mới" hint="Ít nhất 8 ký tự.">
                  <PasswordInput
                    value={newPassword}
                    autoComplete="new-password"
                    visible={showPasswords}
                    onToggleVisible={() => setShowPasswords((v) => !v)}
                    showLabel="Hiện mật khẩu"
                    hideLabel="Ẩn mật khẩu"
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </Field>
                <Field id="account-confirm-password" label="Nhập lại mật khẩu mới">
                  <PasswordInput
                    value={confirmPassword}
                    autoComplete="new-password"
                    visible={showPasswords}
                    onToggleVisible={() => setShowPasswords((v) => !v)}
                    showLabel="Hiện mật khẩu"
                    hideLabel="Ẩn mật khẩu"
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </Field>
                {passwordError && (
                  <Alert variant="destructive" data-testid="account-password-error">
                    <CircleAlert aria-hidden="true" />
                    <AlertDescription>{passwordError}</AlertDescription>
                  </Alert>
                )}
                {passwordSaved && (
                  <p
                    role="status"
                    className="flex items-center gap-2 text-sm text-status-confirmed"
                  >
                    <CircleCheck aria-hidden="true" className="size-4" />
                    Mật khẩu đã được đổi.
                  </p>
                )}
                <Button type="submit" disabled={isSavingPassword} className="justify-self-start">
                  {isSavingPassword && <Loader2 aria-hidden="true" className="animate-spin" />}
                  {isSavingPassword ? 'Đang đổi…' : 'Đổi mật khẩu'}
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-5 sm:p-6 lg:col-span-2" data-testid="account-sessions">
            <h2 className="text-lg font-semibold">Phiên đăng nhập</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Đăng xuất tài khoản khỏi mọi thiết bị và trình duyệt, kể cả thiết bị này. Bạn sẽ cần
              đăng nhập lại.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => handleLogoutAllOpenChange(true)}
              data-testid="account-logout-all-btn"
            >
              <LogOut aria-hidden="true" />
              Đăng xuất mọi thiết bị
            </Button>
            <AlertDialog open={isLogoutAllOpen} onOpenChange={handleLogoutAllOpenChange}>
              <AlertDialogContent data-testid="account-logout-all-dialog">
                <AlertDialogHeader>
                  <AlertDialogTitle>Đăng xuất khỏi mọi thiết bị?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Mọi phiên đăng nhập của tài khoản này, kể cả phiên hiện tại, sẽ kết thúc ngay.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {logoutAllError && (
                  <Alert variant="destructive" data-testid="account-logout-all-error">
                    <CircleAlert aria-hidden="true" />
                    <AlertDescription>{logoutAllError}</AlertDescription>
                  </Alert>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel variant="ghost" disabled={isLoggingOutAll}>
                    Hủy
                  </AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={isLoggingOutAll}
                    aria-busy={isLoggingOutAll || undefined}
                    onClick={(e) => {
                      // Stay open until the request settles; errors render inside the dialog.
                      e.preventDefault();
                      void handleLogoutAll();
                    }}
                    data-testid="account-logout-all-confirm"
                  >
                    {isLoggingOutAll && <Loader2 aria-hidden="true" className="animate-spin" />}
                    {isLoggingOutAll ? 'Đang đăng xuất…' : 'Đăng xuất mọi thiết bị'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Card>

          {profile.role === 'CUSTOMER' && (
            <Card
              className="border-destructive/40 p-5 sm:p-6 lg:col-span-2"
              data-testid="account-delete-section"
            >
              <h2 className="text-lg font-semibold text-destructive">Xóa tài khoản</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Email, họ tên và số điện thoại sẽ bị xóa vĩnh viễn và bạn không thể đăng nhập lại.
                Lịch sử đặt phòng được giữ ở dạng ẩn danh cho mục đích kế toán. Bạn cần hủy mọi
                lịch đặt phòng chưa kết thúc trước khi xóa.
              </p>
              <Button
                type="button"
                variant="destructive"
                className="mt-4"
                onClick={() => handleDeleteOpenChange(true)}
                data-testid="account-delete-btn"
              >
                <Trash2 aria-hidden="true" />
                Xóa tài khoản
              </Button>
              <AlertDialog open={isDeleteOpen} onOpenChange={handleDeleteOpenChange}>
                <AlertDialogContent data-testid="account-delete-dialog" {...deleteDialogFocus}>
                  <form
                    noValidate
                    className="grid gap-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleDeleteAccount();
                    }}
                  >
                    <AlertDialogHeader>
                      <AlertDialogTitle>Xóa vĩnh viễn tài khoản?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Thao tác này không thể hoàn tác. Mọi phiên đăng nhập sẽ kết thúc và dữ liệu
                        cá nhân của bạn bị ẩn danh hóa.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Field id="account-delete-password" label="Mật khẩu hiện tại">
                      <PasswordInput
                        value={deletePassword}
                        autoComplete="current-password"
                        visible={showDeletePassword}
                        onToggleVisible={() => setShowDeletePassword((v) => !v)}
                        showLabel="Hiện mật khẩu"
                        hideLabel="Ẩn mật khẩu"
                        disabled={isDeleting}
                        onChange={(e) => setDeletePassword(e.target.value)}
                      />
                    </Field>
                    {deleteError && (
                      <Alert variant="destructive" data-testid="account-delete-error">
                        <CircleAlert aria-hidden="true" />
                        <AlertDescription>
                          {deleteError}
                          {blockingBookings.length > 0 && (
                            <ul
                              className="mt-2 list-disc space-y-1 pl-5"
                              data-testid="account-delete-blocking"
                            >
                              {blockingBookings.map((booking) => (
                                <li key={booking.id}>
                                  <strong>{booking.bookingCode}</strong> · {booking.roomName} ·{' '}
                                  {formatVietnamDateTime(booking.startTime)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </AlertDescription>
                      </Alert>
                    )}
                    <AlertDialogFooter>
                      <AlertDialogCancel variant="ghost" disabled={isDeleting}>
                        Hủy
                      </AlertDialogCancel>
                      <Button
                        type="submit"
                        variant="destructive"
                        disabled={isDeleting}
                        aria-busy={isDeleting || undefined}
                        data-testid="account-delete-confirm"
                      >
                        {isDeleting && <Loader2 aria-hidden="true" className="animate-spin" />}
                        {isDeleting ? 'Đang xóa…' : 'Xóa vĩnh viễn'}
                      </Button>
                    </AlertDialogFooter>
                  </form>
                </AlertDialogContent>
              </AlertDialog>
            </Card>
          )}
        </div>
        </>
      )}
    </div>
  );
};
