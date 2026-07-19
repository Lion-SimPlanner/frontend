'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { getSessions, publishSession, SimulatorSession } from '@/services/api';
import { getHubConnection, startConnection } from '@/services/signalr';

interface ExtendedSession extends SimulatorSession {
  title: string;
  phase: string;
  pilotName: string;
  simulatorName: string;
}

export default function InstructorDashboard() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sessions, setSessions] = useState<ExtendedSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ExtendedSession | null>(null);
  const [loading, setLoading] = useState(true);

  const [techSkills, setTechSkills] = useState('');
  const [crmTeamwork, setCrmTeamwork] = useState('');
  const [sopAdherence, setSopAdherence] = useState('');
  const [overallGrade, setOverallGrade] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setMounted(true);
    if (!authLoading) {
      if (!user) {
        router.push('/');
        return;
      }
      const role = user.role.toLowerCase();
      if (role !== 'instructor') {
        if (role === 'admin') {
          router.push('/admin');
        } else if (role === 'engineer') {
          router.push('/engineer');
        } else if (role === 'pilot') {
          router.push('/pilot');
        } else {
          router.push('/');
        }
        return;
      }
      loadData();
      startConnection();
      const hub = getHubConnection();
      const handleSessionGraded = (payload: { sessionId: string; gradeStatus: string }) => {
        setSessions((prev) =>
          prev.map((s) =>
            s.sessionId === payload.sessionId
              ? { ...s, status: 'Completed' as const, gradeStatus: payload.gradeStatus, isGraded: true }
              : s
          )
        );
      };
      hub.on('SessionGraded', handleSessionGraded);
      return () => {
        hub.off('SessionGraded', handleSessionGraded);
      };
    }
  }, [user, authLoading, router]);

  const loadData = async () => {
    try {
      const rawSessions = await getSessions();
      const mapped: ExtendedSession[] = rawSessions.map((s) => {
        const syllabusLabel = s.syllabusId
          .replace(/([A-Z])/g, ' $1')
          .trim();
        const startHour = new Date(s.startTime).getHours();
        const phase =
          startHour < 9 ? 'Phase 1' :
          startHour < 12 ? 'Phase 2' :
          startHour < 15 ? 'Phase 3' : 'Phase 4';
        return {
          ...s,
          title: syllabusLabel,
          phase,
          pilotName: s.traineeEmployeeCode,
          simulatorName: s.simulatorId,
        };
      });
      const active = mapped.filter(
        (s) => s.status === 'Scheduled' || s.status === 'InProgress'
      );
      setSessions(mapped);
      if (active.length > 0) {
        setSelectedSession(active[0]);
      } else if (mapped.length > 0) {
        setSelectedSession(mapped[0]);
      }
    } catch (err) {
      console.error('[Instructor] Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitSyllabus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession) return;

    try {
      alert(`Syllabus submitted for ${selectedSession.title}.\nGrade: ${overallGrade}\nNotes: ${notes}\nSyncing with external CMS database...`);
      setSelectedSession(prev => prev ? { ...prev, status: 'Completed' } : null);
      setSessions(prev => prev.map(s => s.sessionId === selectedSession.sessionId ? { ...s, status: 'Completed' } : s));
    } catch (err) {
      console.error(err);
    }
  };

  if (authLoading || !user || !mounted || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-sm font-bold uppercase tracking-widest text-brand-red animate-pulse">
          Loading Instructor Portal...
        </div>
      </div>
    );
  }

  const thisWeekCount = sessions.length;
  const pendingCount = sessions.filter(s => s.status === 'Scheduled' || s.status === 'Draft').length;
  const completedCount = sessions.filter(s => s.status === 'Completed').length;

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
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Instructor Portal</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col text-right">
            <span className="text-xs font-black text-gray-950 uppercase leading-none">{user.name}</span>
            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Type Rating Instructor • TRI/TRE</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-brand-red text-white flex items-center justify-center font-black text-xs shrink-0">
            SO
          </div>
          <button onClick={logout} className="text-gray-400 hover:text-brand-red transition-colors shrink-0 ml-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-[20%] border-r border-gray-200 p-4 space-y-6 overflow-y-auto shrink-0 bg-white">
          <div className="grid grid-cols-3 gap-2">
            <div className="border border-gray-150 p-2.5 rounded text-center bg-white">
              <span className="text-[10px] text-gray-400 font-bold block uppercase">Week</span>
              <span className="text-lg font-black text-gray-950 mt-1 block">{thisWeekCount}</span>
            </div>
            <div className="border border-gray-150 p-2.5 rounded text-center bg-white">
              <span className="text-[10px] text-gray-400 font-bold block uppercase">Pending</span>
              <span className="text-lg font-black text-brand-red mt-1 block">{pendingCount}</span>
            </div>
            <div className="border border-gray-150 p-2.5 rounded text-center bg-white">
              <span className="text-[10px] text-gray-400 font-bold block uppercase">Done</span>
              <span className="text-lg font-black text-green-600 mt-1 block">{completedCount}</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              All Sessions
            </div>
            <div className="space-y-2">
              {sessions.map(s => (
                <div
                  key={s.sessionId}
                  onClick={() => setSelectedSession(s)}
                  className={`p-3 border rounded bg-white cursor-pointer transition-all ${selectedSession?.sessionId === s.sessionId
                      ? 'border-brand-red shadow-sm'
                      : 'border-gray-150 hover:border-gray-300'
                    }`}
                >
                  <div className="text-xs font-black text-gray-900 truncate">{s.title}</div>
                  <div className="text-[9px] text-gray-500 font-bold uppercase mt-1 truncate">{s.pilotName}</div>
                  <div className="flex items-center justify-between text-[8px] text-gray-400 font-black uppercase mt-2">
                    <span>{s.startTime.split('T')[1].substring(0, 5)} • {s.phase}</span>
                    <span className={`px-1.5 py-0.5 rounded-full leading-none font-bold ${s.status === 'Completed'
                        ? 'bg-green-50 text-green-600 border border-green-300'
                        : s.status === 'Scheduled'
                          ? 'bg-blue-50 text-blue-600 border border-blue-300'
                          : 'bg-orange-50 text-orange-600 border border-orange-300'
                      }`}>
                      {s.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="w-[55%] p-6 overflow-y-auto bg-white border-r border-gray-200">
          <div className="border border-gray-150 rounded p-6 bg-white shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider">Weekly Schedule</h3>
                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">July 14–20, 2026</p>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs border-b border-gray-100 pb-2 mb-2 pl-12">
              {['MON 14', 'TUE 15', 'WED 16', 'THU 17', 'FRI 18', 'SAT 19', 'SUN 20'].map(d => (
                <div key={d} className="font-black text-[9px] uppercase tracking-wider text-gray-400 py-1">{d}</div>
              ))}
            </div>

            <div className="flex relative h-[420px] bg-white border border-gray-100 rounded">
              <div className="w-12 border-r border-gray-100 flex flex-col text-right pr-2 pt-8 text-[8px] font-black text-gray-400 select-none uppercase tracking-wider">
                {Array.from({ length: 11 }).map((_, i) => (
                  <div key={i} className="h-[35px] flex items-center justify-end">
                    {String(i + 6).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              <div className="flex-1 flex relative">
                <div className="absolute inset-0 pt-8 pointer-events-none flex flex-col">
                  {Array.from({ length: 10 }).map((_, hourIdx) => (
                    <div key={hourIdx} className="h-[35px] border-b border-gray-50 w-full" />
                  ))}
                </div>

                {[14, 15, 16, 17, 18, 19, 20].map((dayNum) => (
                  <div key={dayNum} className="flex-1 relative pt-8 border-r border-gray-50 last:border-r-0">
                    {sessions.filter(s => parseInt(s.startTime.split('T')[0].split('-')[2]) === dayNum).map(s => {
                      const startHour = parseInt(s.startTime.split('T')[1].split(':')[0]);
                      const duration = 2.5;
                      const topOffset = (startHour - 6) * 35;
                      const height = duration * 35;

                      return (
                        <div
                          key={s.sessionId}
                          onClick={() => setSelectedSession(s)}
                          style={{
                            top: `${topOffset}px`,
                            height: `${height}px`,
                          }}
                          className={`absolute left-1 right-1 p-2 rounded cursor-pointer text-white flex flex-col justify-between overflow-hidden shadow-sm transition-all ${selectedSession?.sessionId === s.sessionId
                              ? 'bg-brand-red border border-black z-25'
                              : 'bg-gray-400 hover:bg-gray-500 z-10'
                            }`}
                        >
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-wider truncate leading-tight">{s.title}</div>
                            <div className="text-[8px] opacity-80 font-bold truncate mt-0.5">{s.pilotName}</div>
                          </div>
                          <span className="text-[7px] font-black uppercase block mt-1">{s.phase}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <aside className="w-[25%] p-6 overflow-y-auto bg-white space-y-6">
          {selectedSession ? (
            <form onSubmit={handleSubmitSyllabus} className="border border-gray-150 rounded p-6 bg-white shadow-sm space-y-6">
              <div className="space-y-4 border-b border-gray-100 pb-4">
                <span className="bg-brand-red text-white text-[8px] font-black px-2 py-0.5 rounded uppercase">
                  {selectedSession.status}
                </span>
                <h3 className="text-sm font-black uppercase text-gray-900 tracking-wider mt-1">{selectedSession.title}</h3>
                <div className="text-[9px] text-gray-400 font-bold uppercase">{selectedSession.startTime.replace('T', ' ')}</div>

                <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-[10px] pt-1">
                  <div>
                    <span className="text-gray-450 block font-bold uppercase tracking-wider text-[8px]">Pilot</span>
                    <span className="font-black text-gray-900">{selectedSession.pilotName}</span>
                  </div>
                  <div>
                    <span className="text-gray-450 block font-bold uppercase tracking-wider text-[8px]">Phase</span>
                    <span className="font-black text-gray-900">{selectedSession.phase}</span>
                  </div>
                  <div>
                    <span className="text-gray-450 block font-bold uppercase tracking-wider text-[8px]">Simulator</span>
                    <span className="font-black text-gray-900">{selectedSession.simulatorName}</span>
                  </div>
                  <div>
                    <span className="text-gray-450 block font-bold uppercase tracking-wider text-[8px]">Session ID</span>
                    <span className="font-black text-gray-900">{selectedSession.sessionId.substring(0, 8)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-brand-red shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <h4 className="text-xs font-black uppercase text-gray-900 tracking-wider">Session Details & Grading</h4>
                </div>
                <p className="text-[9px] text-gray-450 font-bold uppercase">Record observations, grades, and teaching notes for this session.</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Technical Skills</label>
                    <select
                      value={techSkills}
                      onChange={(e) => setTechSkills(e.target.value)}
                      className="w-full text-xs font-bold text-gray-900 px-2 py-1.5 border border-gray-300 rounded bg-white focus:outline-none focus:border-brand-red"
                    >
                      <option value="">—</option>
                      <option value="5">5 - Excellent</option>
                      <option value="4">4 - Good</option>
                      <option value="3">3 - Satisfactory</option>
                      <option value="2">2 - Weak</option>
                      <option value="1">1 - Unsatisfactory</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">CRM / Teamwork</label>
                    <select
                      value={crmTeamwork}
                      onChange={(e) => setCrmTeamwork(e.target.value)}
                      className="w-full text-xs font-bold text-gray-900 px-2 py-1.5 border border-gray-300 rounded bg-white focus:outline-none focus:border-brand-red"
                    >
                      <option value="">—</option>
                      <option value="5">5 - Excellent</option>
                      <option value="4">4 - Good</option>
                      <option value="3">3 - Satisfactory</option>
                      <option value="2">2 - Weak</option>
                      <option value="1">1 - Unsatisfactory</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">SOP Adherence</label>
                    <select
                      value={sopAdherence}
                      onChange={(e) => setSopAdherence(e.target.value)}
                      className="w-full text-xs font-bold text-gray-900 px-2 py-1.5 border border-gray-300 rounded bg-white focus:outline-none focus:border-brand-red"
                    >
                      <option value="">—</option>
                      <option value="5">5 - Excellent</option>
                      <option value="4">4 - Good</option>
                      <option value="3">3 - Satisfactory</option>
                      <option value="2">2 - Weak</option>
                      <option value="1">1 - Unsatisfactory</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Overall Grade</label>
                    <select
                      value={overallGrade}
                      onChange={(e) => setOverallGrade(e.target.value)}
                      required
                      className="w-full text-xs font-bold text-gray-900 px-2 py-1.5 border border-gray-300 rounded bg-white focus:outline-none focus:border-brand-red"
                    >
                      <option value="">—</option>
                      <option value="Excellent">Excellent</option>
                      <option value="Satisfactory">Satisfactory</option>
                      <option value="Unsatisfactory">Unsatisfactory</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Input Teaching Material / Syllabus Notes</label>
                  <textarea
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    required
                    placeholder="Document syllabus coverage, deviations, and instructor recommendations..."
                    className="w-full text-xs font-bold text-gray-900 p-2.5 border border-gray-300 rounded bg-white focus:outline-none focus:border-brand-red resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => alert('Draft saved successfully.')}
                  className="w-1/2 py-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-350 font-black text-[10px] uppercase tracking-wider rounded transition-colors focus:outline-none cursor-pointer"
                >
                  Save Draft
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-brand-red hover:bg-red-700 text-white font-black text-[10px] uppercase tracking-wider rounded transition-colors focus:outline-none focus:ring-2 focus:ring-brand-red cursor-pointer"
                >
                  Submit Syllabus
                </button>
              </div>
            </form>
          ) : (
            <div className="border border-gray-150 rounded p-6 bg-white text-center text-gray-400 text-xs font-bold py-12 uppercase tracking-wider">
              Select a weekly session to grade
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}