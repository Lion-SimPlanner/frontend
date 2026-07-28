'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const loggedUser = await login(email, password);
      if (loggedUser) {
        const role = loggedUser.role.toLowerCase();
        if (role === 'admin') {
          router.push('/admin');
        } else if (role === 'engineer') {
          router.push('/engineer');
        } else if (role === 'instructor') {
          router.push('/instructor');
        } else if (role === 'pilot') {
          router.push('/pilot');
        } else {
          router.push('/login');
        }
      } else {
        setError('Invalid corporate email or password. Use default credentials.');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex bg-white text-gray-900 overflow-hidden font-sans">
      <div
        className={`hidden lg:flex lg:w-1/2 items-center justify-center border-r border-gray-200 bg-white transition-opacity duration-700 ${
          mounted ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="max-w-md w-full px-8 text-center">
          <img
            src="/lion air.png"
            alt="Lion Air Logo"
            className="mx-auto h-64 w-full object-contain"
          />
          <div className="mt-8 flex flex-col items-center gap-1">
            <span className="text-2xl font-black tracking-widest text-gray-950 uppercase">
              Lion SimPlanner
            </span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Validation-Driven Simulator Operations Portal
            </span>
          </div>
        </div>
      </div>

      <div
        className={`w-full lg:w-1/2 flex items-center justify-center px-8 bg-white transition-opacity duration-700 delay-100 ${
          mounted ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="max-w-md w-full border border-gray-150 rounded p-6 bg-white shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <img src="/lion logo.png" alt="Lion Logo" className="w-8 h-8 object-contain shrink-0" />
            <div className="flex flex-col">
              <span className="text-xs font-black tracking-widest text-gray-950">LION SIMPLANNER</span>
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Flight Sim Portal</span>
            </div>
          </div>

          <div className="mb-6">
            <h1 className="text-sm font-black uppercase text-gray-900 tracking-wider">
              Operations Sign In
            </h1>
            <p className="mt-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Enter corporate credentials to access your dashboard.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-brand-red text-[10px] font-bold rounded">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1"
              >
                Corporate Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-xs font-bold text-gray-900 px-3 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:border-brand-red"
                placeholder="name@lionair.co.id"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full text-xs font-bold text-gray-900 px-3 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:border-brand-red"
                placeholder="••••••••"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[9px] text-gray-400 font-black uppercase tracking-wider">
                Default: password (e.g. admin@lionair.co.id / password)
              </span>
              <a
                href="#"
                className="text-[9px] font-black text-gray-400 hover:text-brand-red transition-colors uppercase tracking-wider"
              >
                Forgot Password?
              </a>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-brand-red hover:bg-red-700 text-white font-black text-[10px] uppercase tracking-wider rounded transition-colors focus:outline-none focus:ring-2 focus:ring-brand-red cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Authenticating...' : 'Login'}
              </button>
            </div>
          </form>

          <p className="mt-6 text-center text-[9px] text-gray-400 font-black uppercase tracking-wider">
            Need to register new staff?{' '}
            <Link
              href="/register"
              className="text-brand-red hover:text-red-700 transition-colors font-black"
            >
              Register New Personnel
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
