'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

export default function RegisterPage() {
  const { registerPersonnel } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Pilot');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStatusMsg('');
    setLoading(true);

    try {
      const success = await registerPersonnel(fullName, employeeId, email, role);
      if (success) {
        let schemaDest = 'hr';
        let tableDest = 'pilots';
        if (role === 'Engineer') {
          schemaDest = 'maint';
          tableDest = 'engineers';
        } else if (role === 'Instructor') {
          schemaDest = 'hr';
          tableDest = 'instructors';
        } else if (role === 'Admin') {
          schemaDest = 'sched';
          tableDest = 'admins';
        }

        setStatusMsg(`Successfully registered personnel. Payload routed to schema: "${schemaDest}", table: "${tableDest}".`);
        setFullName('');
        setEmployeeId('');
        setEmail('');
      } else {
        setError('Registration failed.');
      }
    } catch {
      setError('An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col justify-center items-center px-4 py-12">
      <div className="bg-white border border-gray-100 p-8 rounded-lg shadow-xl max-w-md w-full">
        <div className="flex justify-center mb-6">
          <div className="text-brand-red">
            <svg className="h-16 w-16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
            </svg>
          </div>
        </div>

        <h2 className="text-2xl font-black text-center text-gray-900 tracking-tight uppercase mb-8">
          Register New Personnel
        </h2>

        {statusMsg && (
          <div className="mb-6 p-3 bg-green-50 border border-green-500 text-green-700 text-xs font-bold rounded">
            {statusMsg}
          </div>
        )}

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-brand-red text-brand-red text-xs font-bold rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm text-gray-900 bg-white"
              placeholder="e.g. Capt. Roger Smith"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-1">
              Employee ID
            </label>
            <input
              type="text"
              required
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm text-gray-900 bg-white"
              placeholder="e.g. EMP-998"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm text-gray-900 bg-white"
              placeholder="e.g. rsmith@lionair.co.id"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-1">
              Select Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm text-gray-900 bg-white"
            >
              <option value="Admin">Admin (Sched Schema)</option>
              <option value="Pilot">Pilot (HR Schema)</option>
              <option value="Instructor">Instructor (HR Schema)</option>
              <option value="Engineer">Engineer (Maint Schema)</option>
            </select>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded shadow-sm text-xs font-black uppercase tracking-widest text-white bg-brand-red hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-red transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </div>
        </form>

        <p className="mt-8 text-center text-xs text-gray-500 font-bold uppercase tracking-wider">
          Already registered?{' '}
          <Link
            href="/"
            className="text-brand-red hover:text-red-700 transition-colors font-black"
          >
            Sign In Here
          </Link>
        </p>
      </div>
    </div>
  );
}
