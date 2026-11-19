import { describe, it, expect } from 'vitest';
import {
  formatReturnTo,
  getLoginRedirectFrom,
  isLoginPathname,
  isProtectedPathname,
  resolvePostLoginRedirect,
} from '../utils/authRedirect';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

describe('authRedirect utilities (CWB-119)', () => {
  describe('formatReturnTo', () => {
    it('combines pathname and search when search is present', () => {
      expect(formatReturnTo({ pathname: '/bookings', search: '?view=UPCOMING&page=2' })).toBe(
        '/bookings?view=UPCOMING&page=2',
      );
      expect(formatReturnTo({ pathname: '/account', search: '' })).toBe('/account');
      expect(formatReturnTo({ pathname: '/rooms' })).toBe('/rooms');
    });
  });

  describe('isProtectedPathname', () => {
    it.each([
      '/bookings',
      '/Bookings',
      '/Bookings/',
      `/bookings/${VALID_UUID}`,
      '/booking-confirmation',
      `/booking-confirmation/${VALID_UUID}`,
      '/account',
      '/Account/',
      '/account/settings',
      '/admin',
      '/admin/bookings',
      '/ADMIN/bookings',
    ])('returns true for protected route %s', (pathname) => {
      expect(isProtectedPathname(pathname)).toBe(true);
    });

    it.each([
      '/',
      '/rooms',
      '/rooms/room-1',
      '/verify-email',
      '/forgot-password',
      '/reset-password',
      '/login',
      '/register',
      '/admin-fake',
      '/404',
    ])('returns false for non-protected route %s', (pathname) => {
      expect(isProtectedPathname(pathname)).toBe(false);
    });
  });

  describe('resolvePostLoginRedirect', () => {
    it.each([
      '/rooms',
      '/rooms?page=2&capacity=4',
      '/rooms/room-uuid-1',
      '/rooms/room-uuid-1?date=2026-11-20',
      '/bookings',
      '/bookings?view=UPCOMING&page=2',
      `/bookings/${VALID_UUID}`,
      '/booking-confirmation',
      `/booking-confirmation/${VALID_UUID}`,
      '/account',
      '/account?section=security',
    ])('allows CUSTOMER destination %s', (target) => {
      expect(resolvePostLoginRedirect('CUSTOMER', target)).toBe(target);
    });

    it.each([
      undefined,
      null,
      '',
      'https://evil.com',
      '//evil.com',
      '/rooms\\evil',
      '/bookings/../admin',
      '/admin/%2e%2e/rooms',
      '/rooms/id#hash',
      '/rooms/id\n/evil',
      '/bookings/not-a-uuid',
      '/booking-confirmation/not-a-uuid',
      '/admin',
      '/admin/bookings',
    ])('falls back CUSTOMER destination %s to /', (target) => {
      expect(resolvePostLoginRedirect('CUSTOMER', target)).toBe('/');
    });

    it.each([
      '/admin',
      '/admin/bookings?status=CONFIRMED&page=2',
      '/admin/users',
      '/admin/closures?upcoming=true',
      '/account',
      '/account?tab=password',
    ])('allows ADMIN destination %s', (target) => {
      expect(resolvePostLoginRedirect('ADMIN', target)).toBe(target);
    });

    it('normalizes single trailing slashes and case-insensitive static segments while keeping query params', () => {
      expect(resolvePostLoginRedirect('CUSTOMER', '/bookings/?view=UPCOMING')).toBe(
        '/bookings?view=UPCOMING',
      );
      expect(resolvePostLoginRedirect('CUSTOMER', '/Account/?tab=security')).toBe(
        '/Account?tab=security',
      );
      expect(resolvePostLoginRedirect('ADMIN', '/admin/bookings/?page=2')).toBe(
        '/admin/bookings?page=2',
      );
      expect(resolvePostLoginRedirect('ADMIN', '/ADMIN/bookings?status=CONFIRMED')).toBe(
        '/ADMIN/bookings?status=CONFIRMED',
      );
    });

    it.each([
      undefined,
      null,
      '',
      '/rooms/room-uuid-1',
      '/bookings',
      '//evil.com',
      '/admin/../login',
      '/admin//users',
      '/admin/users#frag',
    ])('falls back ADMIN destination %s to /admin', (target) => {
      expect(resolvePostLoginRedirect('ADMIN', target)).toBe('/admin');
    });
  });

  describe('isLoginPathname & getLoginRedirectFrom', () => {
    it('matches /login case-insensitively with optional trailing slash', () => {
      expect(isLoginPathname('/login')).toBe(true);
      expect(isLoginPathname('/Login/')).toBe(true);
      expect(isLoginPathname('/register')).toBe(false);
    });

    it('preserves safe existing state.from when already on /login and drops unsafe/non-returnable values', () => {
      expect(
        getLoginRedirectFrom({
          pathname: '/login',
          search: '',
          state: { from: '/account?tab=security' },
        }),
      ).toBe('/account?tab=security');
      expect(
        getLoginRedirectFrom({
          pathname: '/Login/',
          search: '',
          state: { from: '/bookings?view=UPCOMING' },
        }),
      ).toBe('/bookings?view=UPCOMING');
      expect(
        getLoginRedirectFrom({
          pathname: '/login',
          search: '',
          state: { from: '//evil.com' },
        }),
      ).toBeUndefined();
      expect(
        getLoginRedirectFrom({
          pathname: '/login',
          search: '',
          state: { from: '/verify-email?token=secret' },
        }),
      ).toBeUndefined();
    });

    it.each([
      { pathname: '/verify-email', search: '?token=secret' },
      { pathname: '/Verify-Email', search: '?token=secret' },
      { pathname: '/reset-password', search: '?token=secret' },
      { pathname: '/Reset-Password/', search: '?token=secret' },
      { pathname: '/forgot-password', search: '' },
      { pathname: '/register', search: '' },
      { pathname: '/', search: '' },
    ])('omits non-returnable path $pathname$search from state.from', (loc) => {
      expect(getLoginRedirectFrom(loc)).toBeUndefined();
    });

    it('keeps returnable routes with query strings', () => {
      expect(getLoginRedirectFrom({ pathname: '/rooms/room-1', search: '?date=2026-11-20' })).toBe(
        '/rooms/room-1?date=2026-11-20',
      );
      expect(getLoginRedirectFrom({ pathname: '/admin/bookings/', search: '?page=2' })).toBe(
        '/admin/bookings?page=2',
      );
    });
  });
});
