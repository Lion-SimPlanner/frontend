import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jwtDecode } from 'jwt-decode';

const { mockPush, mockApiPost } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockApiPost: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('jwt-decode');

vi.mock('@/services/api', () => ({
  apiClient: {
    post: mockApiPost,
  },
}));

import { AuthProvider, useAuth } from '@/context/AuthContext';

const fakeAdminToken = {
  sub: 'usr-001',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name': 'Alice Admin',
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': 'Admin',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'alice@test.com',
  employee_code: 'ADM001',
};

const fakeEngineerToken = {
  sub: 'usr-002',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name': 'Bob Engineer',
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': 'Engineer',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'bob@test.com',
  employee_code: 'ENG001',
};

const fakeInstructorToken = {
  sub: 'usr-003',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name': 'Carol Instructor',
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': 'Instructor',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'carol@test.com',
  employee_code: 'INS001',
};

const fakePilotToken = {
  sub: 'usr-004',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name': 'Dave Pilot',
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': 'Pilot',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'dave@test.com',
  employee_code: 'PLT001',
};

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    mockPush.mockClear();
    mockApiPost.mockReset();
    vi.mocked(jwtDecode).mockReset();
  });

  describe('initial load from localStorage', () => {
    it('restores user when valid token is stored', async () => {
      vi.mocked(jwtDecode).mockReturnValue(fakeAdminToken);
      localStorage.setItem('token', 'valid-jwt');

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.user).toEqual({
        id: 'usr-001',
        name: 'Alice Admin',
        email: 'alice@test.com',
        employeeId: 'ADM001',
        role: 'Admin',
      });
      expect(result.current.token).toBe('valid-jwt');
    });

    it('restores Engineer role from stored token', async () => {
      vi.mocked(jwtDecode).mockReturnValue(fakeEngineerToken);
      localStorage.setItem('token', 'eng-jwt');

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.user!.role).toBe('Engineer');
      expect(result.current.user!.name).toBe('Bob Engineer');
    });

    it('restores Instructor role from stored token', async () => {
      vi.mocked(jwtDecode).mockReturnValue(fakeInstructorToken);
      localStorage.setItem('token', 'ins-jwt');

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.user!.role).toBe('Instructor');
    });

    it('restores Pilot role from stored token', async () => {
      vi.mocked(jwtDecode).mockReturnValue(fakePilotToken);
      localStorage.setItem('token', 'plt-jwt');

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.user!.role).toBe('Pilot');
    });

    it('clears localStorage when stored token is invalid', async () => {
      vi.mocked(jwtDecode).mockImplementation(() => { throw new Error('Invalid'); });
      localStorage.setItem('token', 'bad-jwt');

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(localStorage.getItem('token')).toBeNull();
    });

    it('sets loading to false when no token exists', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
    });
  });

  describe('login', () => {
    it('sets user state on successful login', async () => {
      vi.mocked(jwtDecode).mockReturnValue(fakeAdminToken);
      mockApiPost.mockResolvedValue({
        data: {
          token: 'new-jwt',
          userId: 'usr-001',
          name: 'Alice Admin',
          email: 'alice@test.com',
          employeeCode: 'ADM001',
          role: 'Admin',
        },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      await waitFor(() => expect(result.current.loading).toBe(false));

      let user: Awaited<ReturnType<typeof result.current.login>>;
      await act(async () => {
        user = await result.current.login('alice@test.com', 'pass');
      });

      expect(user!).not.toBeNull();
      expect(user!.role).toBe('Admin');
      expect(result.current.user).toEqual(user!);
      expect(localStorage.getItem('token')).toBe('new-jwt');
      expect(mockApiPost).toHaveBeenCalledWith('/api/auth/login', {
        email: 'alice@test.com',
        password: 'pass',
      });
    });

    it('falls back to response fields when JWT decode fails on login', async () => {
      vi.mocked(jwtDecode).mockImplementation(() => { throw new Error('corrupt'); });
      mockApiPost.mockResolvedValue({
        data: {
          token: 'corrupt-jwt',
          userId: 'usr-005',
          name: 'Eve Fallback',
          email: 'eve@test.com',
          employeeCode: 'EXT001',
          role: 'Pilot',
        },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      await waitFor(() => expect(result.current.loading).toBe(false));

      let user: Awaited<ReturnType<typeof result.current.login>>;
      await act(async () => {
        user = await result.current.login('eve@test.com', 'x');
      });

      expect(user!).not.toBeNull();
      expect(user!.name).toBe('Eve Fallback');
      expect(user!.role).toBe('Pilot');
      expect(user!.employeeId).toBe('EXT001');
    });

    it('returns null when API call fails', async () => {
      mockApiPost.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      await waitFor(() => expect(result.current.loading).toBe(false));

      const user = await act(async () => result.current.login('x@y.com', 'wrong'));

      expect(user).toBeNull();
      expect(result.current.user).toBeNull();
    });
  });

  describe('logout', () => {
    it('clears user, token, and localStorage', () => {
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      act(() => {
        result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(localStorage.getItem('token')).toBeNull();
    });

    it('calls router.push with / on logout', () => {
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      act(() => {
        result.current.logout();
      });

      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  describe('useAuth', () => {
    it('throws when used outside AuthProvider', () => {
      expect(() => renderHook(() => useAuth())).toThrow(
        'useAuth must be used within an AuthProvider'
      );
    });
  });
});
