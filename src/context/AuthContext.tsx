'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export interface User {
  id: string;
  name: string;
  email: string;
  employeeId: string;
  role: 'Admin' | 'Pilot' | 'Instructor' | 'Engineer';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  registerPersonnel: (name: string, employeeId: string, email: string, role: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    let mockRole: 'Admin' | 'Pilot' | 'Instructor' | 'Engineer' | null = null;
    let mockName = '';
    let mockEmpId = '';

    if (email === 'admin@lionair.co.id' && password === 'admin123') {
      mockRole = 'Admin';
      mockName = 'J. Davidson';
      mockEmpId = 'EMP-001';
    } else if (email === 'pilot@lionair.co.id' && password === 'pilot123') {
      mockRole = 'Pilot';
      mockName = 'Capt. R. Holt';
      mockEmpId = 'EMP-102';
    } else if (email === 'instructor@lionair.co.id' && password === 'instructor123') {
      mockRole = 'Instructor';
      mockName = 'Instr. I. Nakamura';
      mockEmpId = 'EMP-203';
    } else if (email === 'engineer@lionair.co.id' && password === 'engineer123') {
      mockRole = 'Engineer';
      mockName = 'Eng. M. Kowalski';
      mockEmpId = 'EMP-304';
    }

    if (mockRole) {
      const payload = {
        sub: 'mock-user-id-' + mockRole.toLowerCase(),
        email: email,
        name: mockName,
        employee_code: mockEmpId,
        roles: [mockRole],
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8
      };
      
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const body = btoa(JSON.stringify(payload));
      const mockJwt = `${header}.${body}.mocksignature`;

      localStorage.setItem('token', mockJwt);
      const loggedUser: User = {
        id: payload.sub,
        name: mockName,
        email: email,
        employeeId: mockEmpId,
        role: mockRole
      };
      localStorage.setItem('user', JSON.stringify(loggedUser));
      setToken(mockJwt);
      setUser(loggedUser);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    router.push('/');
  };

  const registerPersonnel = async (name: string, employeeId: string, email: string, role: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(true);
      }, 500);
    });
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
