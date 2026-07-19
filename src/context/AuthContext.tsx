'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { jwtDecode } from 'jwt-decode';
import { apiClient } from '@/services/api';

export interface User {
  id: string;
  name: string;
  email: string;
  employeeId: string;
  role: 'Admin' | 'Pilot' | 'Instructor' | 'Engineer';
}

interface DecodedToken {
  sub: string;
  email?: string;
  [key: string]: unknown;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User | null>;
  logout: () => void;
  registerPersonnel: (name: string, employeeId: string, email: string, role: string) => Promise<boolean>;
}

const CLAIM_NAME          = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name';
const CLAIM_ROLE          = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
const CLAIM_EMAIL         = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress';
const CLAIM_EMPLOYEE_CODE = 'employee_code';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeRole(role: string | undefined): User['role'] | null {
  if (!role) return null;
  const normalized = role.trim().toLowerCase();
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'engineer') return 'Engineer';
  if (normalized === 'instructor') return 'Instructor';
  if (normalized === 'pilot') return 'Pilot';
  return null;
}

function buildUserFromToken(token: string): User | null {
  try {
    const decoded = jwtDecode<DecodedToken & Record<string, unknown>>(token);
    const role = normalizeRole(decoded[CLAIM_ROLE] as string | undefined);
    if (!role) return null;
    return {
      id:         decoded.sub ?? '',
      name:       (decoded[CLAIM_NAME]  as string) ?? (decoded['name'] as string) ?? '',
      email:      (decoded[CLAIM_EMAIL] as string) ?? (decoded['email'] as string) ?? '',
      employeeId: (decoded[CLAIM_EMPLOYEE_CODE] as string) ?? '',
      role,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const router                = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      const parsed = buildUserFromToken(storedToken);
      if (parsed) {
        setToken(storedToken);
        setUser(parsed);
      } else {
        localStorage.removeItem('token');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<User | null> => {
    try {
      const response = await apiClient.post<{
        token: string;
        userId: string;
        name: string;
        email: string;
        employeeCode: string;
        role: string;
      }>('/api/auth/login', { email, password });

      const { token: jwt, name, employeeCode, role, userId } = response.data;

      const parsedFromToken = buildUserFromToken(jwt);
      const finalUser: User = parsedFromToken ?? {
        id: userId,
        name,
        email,
        employeeId: employeeCode,
        role: normalizeRole(role) ?? 'Pilot',
      };
      localStorage.setItem('token', jwt);
      localStorage.setItem('user', JSON.stringify(finalUser));
      setToken(jwt);
      setUser(finalUser);
      return finalUser;
    } catch {
      return null;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    router.push('/');
  };

  const registerPersonnel = async (
    _name: string,
    _employeeId: string,
    _email: string,
    _role: string
  ): Promise<boolean> => {
    return new Promise((resolve) => setTimeout(() => resolve(true), 500));
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, registerPersonnel }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
