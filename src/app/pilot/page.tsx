'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { getSessions, SimulatorSession } from '@/services/api';

interface ExtendedSession extends SimulatorSession {
  title: string;
  phase: string;
  instructorName: string;
  simulatorName: string;
}

export default function PilotDashboard() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sessions, setSessions] = useState<ExtendedSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    if (!authLoading) {
      if (!user) {
        router.push('/');
        return;
      }
      const role = user.role.toLowerCase();
      if (role !== 'pilot') {
        if (role === 'admin') {
          router.push('/admin');
        } else if (role === 'engineer') {
          router.push('/engineer');
        } else if (role === 'instructor') {
          router.push('/instructor');
        } else {
          router.push('/');
        }
        return;
      }
      loadData();
    }
  }, [user, authLoading, router]);

  const loadData = async () => {
    try {
      const rawSessions = await getSessions();
      const mapped: ExtendedSession[] = rawSessions.map(s => {
        let title = 'Simulator Session';
        let phase = 'Phase 3';
        let instructorName = 'Instr. P. Langley';
        let simulatorName = 'Jakarta B737-800NG';

        if (s.sessionId === 'session-01') {
          title = 'ILS Approach — CAT II';
          phase = 'Phase 3';
          instructorName = 'Instr. P. Langley';
          simulatorName = 'Jakarta B737-800NG';
        } else if (s.sessionId === 'session-02') {
          title = 'VNAV Profile Review';
          phase = 'Phase 4';
          instructorName = 'Instr. I. Nakamura';
          simulatorName = 'Jakarta A330-900neo';
        } else if (s.sessionId === 'session-03') {
          title = 'Emergency Procedures';
          phase = 'Phase 2';
          instructorName = 'Instr. D. Reeves';
          simulatorName = 'Jakarta B737 MAX 8';
        } else if (s.sessionId === 'session-04') {
          title = 'Engine Failure Drills';
          phase = 'Phase 3';
          instructorName = 'Instr. P. Langley';
          simulatorName = 'Jakarta B737-800NG';
        } else if (s.sessionId === 'session-05') {
          title = 'Crosswind Landings';
          phase = 'Phase 1';
          instructorName = 'Instr. P. Langley';
          simulatorName = 'Jakarta B737 MAX 8';
        } else if (s.sessionId === 'session-06') {
          title = 'Autoland Operations';
          phase = 'Phase 4';
          instructorName = 'Instr. I. Nakamura';
          simulatorName = 'Jakarta A330-900neo';
        } else if (s.sessionId === 'session-07') {
          title = 'Visual Approaches';
          phase = 'Phase 2';
          instructorName = 'Instr. D. Reeves';
          simulatorName = 'Jakarta A320-200';
        }

        return {
          ...s,
          title,
          phase,
          instructorName,
          simulatorName,
        };
      });

      setSessions(mapped);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || !user || !mounted || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-sm font-bold uppercase tracking-widest text-brand-red animate-pulse">
          Loading Pilot Portal...
        </div>
      </div>
    );
  }

  const upcomingSession = sessions.find(s => s.status === 'Scheduled' || s.status === 'InProgress');
  const trainingDueDays = 4;

  return (
    <div className="h-screen flex flex-col bg-white text-gray-900 overflow-hidden font-sans">
      <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 shrink-0 z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded bg-brand-red text-white flex items-center justify-center font-black">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-black tracking-widest text-gray-950">SIMFLIGHT OPS</span>
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Pilot Portal</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col text-right">
            <span className="text-xs font-black text-gray-950 uppercase leading-none">{user.name}</span>
            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Commercial Airline Pilot</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-brand-red text-white flex items-center justify-center font-black text-xs shrink-0">
            RH
          </div>
          <button onClick={logout} className="text-gray-400 hover:text-brand-red transition-colors shrink-0 ml-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <main className="w-3/4 h-full p-6 overflow-y-auto bg-white border-r border-gray-200">
          <div className="border border-gray-150 rounded p-6 bg-white shadow-sm space-y-6">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider">Training & Certification Calendar</h3>
                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">July 2026</p>
              </div>
              <div className="flex gap-1">
                <button className="p-1 border border-gray-200 rounded hover:bg-gray-50 text-xs font-bold text-gray-600">&lt;</button>
                <button className="p-1 border border-gray-200 rounded hover:bg-gray-50 text-xs font-bold text-gray-600">&gt;</button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="font-black text-[9px] uppercase tracking-wider text-gray-400 py-1">{d}</div>
              ))}

              <div className="border border-transparent py-4 text-transparent">30</div>
              <div className="border border-transparent py-4 text-transparent">31</div>
              
              {Array.from({ length: 31 }, (_, i) => i + 1).map(day => {
                const isToday = day === 14;
                const isTraining = day === 14 || day === 17;

                return (
                  <div key={day} className={`border border-gray-100 py-2 relative flex flex-col items-center justify-between h-14 ${
                    isTraining ? 'bg-red-50 border-brand-red' : 'bg-white'
                  }`}>
                    <span className={`text-[10px] font-black ${isToday ? 'text-brand-red text-xs' : 'text-gray-900'}`}>{day}</span>
                    {isTraining && (
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-red mb-1 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </main>

        <aside className="w-1/4 p-6 overflow-y-auto bg-white space-y-6">
          <div className="border border-gray-150 rounded p-6 bg-white shadow-sm space-y-6">
            <div className="border-b border-gray-100 pb-3">
              <span className="text-[8px] font-black text-brand-red uppercase tracking-wider">Roster Notification</span>
              <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider mt-0.5">Compliance Notice</h3>
            </div>

            <div className="p-4 bg-red-50 border border-brand-red rounded space-y-2">
              <span className="text-brand-red font-black text-xs uppercase tracking-wider block">Training Session Overdue</span>
              <p className="text-[10px] text-gray-800 font-bold leading-relaxed">
                Next recurrent qualification training due date is in <span className="text-brand-red font-black underline">{trainingDueDays} days</span> (July 19, 2026). Report to flight simulator operations immediately.
              </p>
            </div>
          </div>

          {upcomingSession ? (
            <div className="border border-gray-150 rounded p-6 bg-white shadow-sm space-y-6">
              <div className="border-b border-gray-100 pb-3">
                <span className="text-[8px] font-black text-brand-red uppercase tracking-wider">Scheduled Training</span>
                <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider mt-0.5">Upcoming Session</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <span className="text-gray-400 block font-bold uppercase tracking-wider text-[8px]">Title</span>
                  <span className="font-black text-gray-900 text-xs">{upcomingSession.title}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-bold uppercase tracking-wider text-[8px]">Date & Time</span>
                  <span className="font-black text-brand-red text-xs">{upcomingSession.startTime.replace('T', ' ')} UTC</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-bold uppercase tracking-wider text-[8px]">Instructor</span>
                  <span className="font-black text-gray-900 text-xs">{upcomingSession.instructorName}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-bold uppercase tracking-wider text-[8px]">Simulator Model</span>
                  <span className="font-black text-gray-900 text-xs">{upcomingSession.simulatorName}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-gray-150 rounded p-6 bg-white text-center text-gray-400 text-xs font-bold py-12 uppercase tracking-wider">
              No upcoming scheduled training
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
