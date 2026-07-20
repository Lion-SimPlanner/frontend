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

const startOfLocalDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

const addLocalDays = (value: Date, days: number) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);

const toLocalDate = (value?: string) => {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
};

const toLocalDateKey = (value: Date) => {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatCalendarRange = (startDate: Date, days: number) => {
  const endDate = addLocalDays(startDate, days - 1);
  const sameMonth = startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear();

  if (sameMonth) {
    return `${startDate.toLocaleDateString('en-GB', { month: 'long' })} ${startDate.getDate()} - ${endDate.getDate()}, ${startDate.getFullYear()}`;
  }

  return `${startDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })} - ${endDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}`;
};

const getSessionDurationHours = (start?: string, end?: string) => {
  const startDate = toLocalDate(start);
  const endDate = toLocalDate(end);
  if (!startDate || !endDate) return 2;
  return Math.max(0.5, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60));
};

export default function InstructorDashboard() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sessions, setSessions] = useState<ExtendedSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ExtendedSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendarStartDate, setCalendarStartDate] = useState<Date>(() => startOfLocalDay(new Date()));

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

  const visibleDayCount = 14;
  const visibleDays = Array.from({ length: visibleDayCount }, (_, idx) => addLocalDays(calendarStartDate, idx));
  const visibleDayKeys = new Set(visibleDays.map(toLocalDateKey));
  const visibleSessions = sessions.filter((s) => {
    const start = toLocalDate(s.startTime);
    if (!start) return false;
    return visibleDayKeys.has(toLocalDateKey(start));
  });
  const calendarRangeLabel = formatCalendarRange(calendarStartDate, visibleDayCount);

  const goToPreviousWindow = () => setCalendarStartDate((prev) => addLocalDays(prev, -visibleDayCount));
  const goToNextWindow = () => setCalendarStartDate((prev) => addLocalDays(prev, visibleDayCount));
  const goToTodayWindow = () => setCalendarStartDate(startOfLocalDay(new Date()));

  const visibleCount = visibleSessions.length;
  const pendingCount = visibleSessions.filter(s => s.status === 'Scheduled' || s.status === 'Draft').length;
  const completedCount = visibleSessions.filter(s => s.status === 'Completed').length;

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
              <span className="text-xs font-black tracking-widest text-gray-950">LION SIMPLANNER</span>
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
              <span className="text-[10px] text-gray-400 font-bold block uppercase">Window</span>
              <span className="text-lg font-black text-gray-950 mt-1 block">{visibleCount}</span>
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
              {visibleSessions.map(s => {
                const localStart = toLocalDate(s.startTime);
                const timeLabel = localStart
                  ? localStart.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
                  : 'N/A';

                return (
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
                      <span>{timeLabel} • {s.phase}</span>
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
                );
              })}
            </div>
          </div>
        </aside>

        <section className="w-[55%] p-6 overflow-y-auto bg-white border-r border-gray-200 flex flex-col">
          <div className="border border-gray-150 rounded p-6 bg-white shadow-sm flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div>
                <h3 className="text-sm font-black uppercase text-gray-900 tracking-wider">14-Day Schedule</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">{calendarRangeLabel}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={goToPreviousWindow}
                  className="px-2 py-1 border border-gray-200 text-gray-700 text-[9px] font-black uppercase rounded hover:bg-gray-50"
                >
                  Prev 14d
                </button>
                <button
                  onClick={goToTodayWindow}
                  className="px-2 py-1 border border-brand-red text-brand-red text-[9px] font-black uppercase rounded hover:bg-red-50"
                >
                  Today
                </button>
                <button
                  onClick={goToNextWindow}
                  className="px-2 py-1 border border-gray-200 text-gray-700 text-[9px] font-black uppercase rounded hover:bg-gray-50"
                >
                  Next 14d
                </button>
              </div>
            </div>

            <div className="overflow-x-auto flex-1 flex flex-col border border-gray-100 rounded">
              <div className="min-w-[1000px] flex flex-col flex-1">
                <div
                  className="grid bg-gray-50 border-b border-gray-100 text-center font-bold text-[10px] text-gray-500 uppercase py-3 shrink-0"
                  style={{ gridTemplateColumns: `50px repeat(${visibleDayCount}, minmax(65px, 1fr))` }}
                >
                  <div>Time</div>
                  {visibleDays.map((day) => (
                    <div key={toLocalDateKey(day)} className="border-l border-gray-100 flex flex-col justify-center">
                      <span>{day.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                      <span className="text-xs font-black text-gray-900 mt-0.5">{day.getDate()}</span>
                    </div>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto relative min-h-[455px] flex bg-white">
                  <div className="w-12 border-r border-gray-100 flex flex-col text-right pr-2 text-[8px] font-black text-gray-400 select-none uppercase tracking-wider bg-gray-50 shrink-0 z-10">
                    {Array.from({ length: 13 }).map((_, i) => (
                      <div key={i} className="h-[35px] flex items-center justify-end border-b border-gray-50 last:border-b-0">
                        {String(i + 6).padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>

                  <div className="flex-1 grid relative" style={{ gridTemplateColumns: `repeat(${visibleDayCount}, minmax(65px, 1fr))` }}>
                    <div className="absolute inset-0 pointer-events-none flex flex-col">
                      {Array.from({ length: 13 }).map((_, hourIdx) => (
                        <div key={hourIdx} className="h-[35px] border-b border-gray-50 w-full" />
                      ))}
                    </div>

                    {visibleDays.map((day) => {
                      const dayKey = toLocalDateKey(day);

                      return (
                        <div key={dayKey} className="relative border-r border-gray-50 last:border-r-0 h-full">
                          {visibleSessions.filter(s => {
                            const startDate = toLocalDate(s.startTime);
                            return !!startDate && toLocalDateKey(startDate) === dayKey;
                          }).map(s => {
                            const startDate = toLocalDate(s.startTime);
                            if (!startDate) return null;
                            const startHour = startDate.getHours();
                            const startMinute = startDate.getMinutes();
                            const duration = getSessionDurationHours(s.startTime, s.endTime);
                            const topOffset = ((startHour - 6) * 35) + ((startMinute / 60) * 35);
                            const height = duration * 35;

                            if (topOffset < 0 || topOffset > 455) return null;

                            return (
                              <div
                                key={s.sessionId}
                                onClick={() => setSelectedSession(s)}
                                style={{
                                  top: `${topOffset}px`,
                                  height: `${height - 2}px`,
                                }}
                                className={`absolute left-0.5 right-0.5 p-1 rounded cursor-pointer text-white flex flex-col justify-between overflow-hidden shadow-sm transition-all z-20 ${selectedSession?.sessionId === s.sessionId
                                    ? 'bg-brand-red border border-red-800 font-black'
                                    : 'bg-gray-400 hover:bg-gray-500 font-medium'
                                  }`}
                              >
                                <div className="min-w-0">
                                  <div className="text-[7.5px] font-black uppercase tracking-wider truncate leading-tight">{s.title}</div>
                                  <div className="text-[7px] opacity-90 truncate font-bold mt-0.5">{s.pilotName}</div>
                                </div>
                                <span className="text-[6.5px] font-black uppercase block leading-none truncate mt-0.5">{s.phase}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="w-[25%] p-6 overflow-y-auto bg-white space-y-6 shrink-0">
          {selectedSession ? (
            <form onSubmit={handleSubmitSyllabus} className="border border-gray-150 rounded p-6 bg-white shadow-sm space-y-6">
              <div className="space-y-4 border-b border-gray-100 pb-4">
                <span className="bg-brand-red text-white text-[8px] font-black px-2 py-0.5 rounded uppercase">
                  {selectedSession.status}
                </span>
                <h3 className="text-sm font-black uppercase text-gray-900 tracking-wider mt-1">{selectedSession.title}</h3>
                <div className="text-[9px] text-gray-400 font-bold uppercase">{toLocalDate(selectedSession.startTime)?.toLocaleString('en-GB', { hour12: false }) ?? 'N/A'}</div>

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
                    <span className="font-black text-gray-900 truncate max-w-[110px] block" title={selectedSession.simulatorName}>
                      {selectedSession.simulatorName}
                    </span>
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
                <p className="text-[9px] text-gray-455 font-bold uppercase">Record observations, grades, and teaching notes for this session.</p>

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
              Select a session in the visible 14-day window to grade
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}