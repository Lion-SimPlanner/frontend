'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const success = await login(email, password);
      if (success) {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const userObj = JSON.parse(storedUser);
          if (userObj.role === 'Admin') {
            router.push('/admin');
          } else if (userObj.role === 'Engineer') {
            router.push('/engineer');
          } else if (userObj.role === 'Instructor') {
            router.push('/instructor');
          } else if (userObj.role === 'Pilot') {
            router.push('/pilot');
          } else {
            router.push('/admin');
          }
        } else {
          router.push('/admin');
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
    <div className="flex min-h-screen bg-white">
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center border-r border-gray-100 bg-white">
        <div className="max-w-md w-full px-8 text-center">
          <img
            src="/lion air.png"
            alt="Lion Air Logo"
            className="mx-auto h-64 w-full object-contain"
          />
          <div className="mt-8 text-2xl font-black tracking-widest text-gray-900 uppercase">
            LION SIMPLANNER
          </div>
          <div className="mt-2 text-xs font-medium tracking-wider text-gray-500 uppercase">
            Validation-Driven Simulator Operations Portal
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center px-8 bg-white">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">
              Flight Sim Portal
            </h1>
            <p className="mt-2 text-sm text-gray-500 font-medium">
              Enter corporate credentials to access operations dashboard.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 bg-red-50 border border-brand-red text-brand-red text-xs font-bold rounded">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-1"
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
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm text-gray-900 bg-white"
                placeholder="name@lionair.co.id"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-1"
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
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm text-gray-900 bg-white"
                placeholder="••••••••"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                Default: admin@lionair.co.id / admin123
              </span>
              <div className="text-sm">
                <a
                  href="#"
                  className="font-black text-xs text-gray-500 hover:text-brand-red transition-colors uppercase tracking-wider"
                >
                  Forgot Password?
                </a>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded shadow-sm text-xs font-black uppercase tracking-widest text-white bg-brand-red hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-red transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Authenticating...' : 'Login'}
              </button>
            </div>
          </form>

          <p className="mt-8 text-center text-xs text-gray-500 font-bold uppercase tracking-wider">
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
