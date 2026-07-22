'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { getSessions, publishSession, completeGrading, terminateSessionEarly, startSession, SimulatorSession } from '@/services/api';
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

const getStatusBadgeStyle = (status: string) => {
  switch (status) {
    case 'InProgress':
      return {
        badge: 'bg-amber-50 text-amber-700 border-amber-400 animate-pulse',
        label: 'IN PROGRESS',
      };
    case 'Completed':
      return {
        badge: 'bg-green-50 text-green-700 border-green-400',
        label: 'COMPLETED',
      };
    case 'TerminatedEarly':
      return {
        badge: 'bg-purple-50 text-purple-700 border-purple-400',
        label: 'TERMINATED EARLY',
      };
    case 'Cancelled':
      return {
        badge: 'bg-red-50 text-brand-red border-brand-red',
        label: 'CANCELLED',
      };
    case 'Scheduled':
      return {
        badge: 'bg-blue-50 text-blue-700 border-blue-400',
        label: 'SCHEDULED',
      };
    default:
      return {
        badge: 'bg-gray-50 text-gray-700 border-gray-300',
        label: status.toUpperCase(),
      };
  }
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

  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [terminateReason, setTerminateReason] = useState('Simulator AOG');
  const [terminateActualEndHour, setTerminateActualEndHour] = useState('10');
  const [terminateActualEndMin, setTerminateActualEndMin] = useState('00');
  const [terminateError, setTerminateError] = useState<string | null>(null);

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
          ? s.syllabusId.replace(/([A-Z])/g, ' $1').trim()
          : 'Simulator Session';
        const startHour = new Date(s.startTime).getHours();
        const phase =
          startHour < 9 ? 'Phase 1' :
            startHour < 12 ? 'Phase 2' :
              startHour < 15 ? 'Phase 3' : 'Phase 4';
        const captain = s.captainName || (s.captainId ? `Captain ${s.captainId.substring(0, 6)}` : 'Unassigned');
        const fo = s.firstOfficerName || (s.firstOfficerId ? `FO ${s.firstOfficerId.substring(0, 6)}` : 'Unassigned');
        const pilotName = s.traineeEmployeeCode ? `${s.traineeEmployeeCode} • ${captain}` : `${captain} / ${fo}`;
        return {
          ...s,
          title: syllabusLabel,
          phase,
          pilotName,
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

  const handleStartSession = async () => {
    if (!selectedSession) return;
    try {
      const updated = await startSession(selectedSession.sessionId);
      setSelectedSession(prev => prev ? { ...prev, status: 'InProgress' } : null);
      setSessions(prev => prev.map(s => s.sessionId === selectedSession.sessionId ? { ...s, status: 'InProgress' } : s));
      alert(`Session ${selectedSession.title} started! Status is now IN PROGRESS.`);
    } catch (err: any) {
      console.error('[Instructor] Failed to start session:', err);
      alert(err?.response?.data?.message || err?.response?.data?.error || 'Failed to start session.');
    }
  };

  const handleSubmitSyllabus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession) return;

    try {
      await completeGrading(selectedSession.sessionId, {
        gradeStatus: overallGrade || 'PASSED',
        instructorNotes: notes,
        traineeEmployeeCode: selectedSession.traineeEmployeeCode || 'LGA-001',
      });
      setSelectedSession(prev => prev ? { ...prev, status: 'Completed', isGraded: true, gradeStatus: overallGrade || 'PASSED', instructorNotes: notes } : null);
      setSessions(prev => prev.map(s => s.sessionId === selectedSession.sessionId ? { ...s, status: 'Completed', isGraded: true, gradeStatus: overallGrade || 'PASSED', instructorNotes: notes } : s));
      alert(`Syllabus grading submitted successfully for ${selectedSession.title}. Session marked as COMPLETED.`);
    } catch (err: any) {
      console.error('[Instructor] Failed to submit grading:', err);
      alert(err?.response?.data?.error || 'Failed to submit grading.');
    }
  };

  const handleOpenTerminateModal = () => {
    if (!selectedSession) return;
    const now = new Date();
    setTerminateActualEndHour(now.getHours().toString().padStart(2, '0'));
    setTerminateActualEndMin(now.getMinutes().toString().padStart(2, '0'));
    setTerminateReason('Simulator AOG');
    setTerminateError(null);
    setShowTerminateModal(true);
  };

  const handleConfirmTerminateEarly = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession) return;

    const start = toLocalDate(selectedSession.startTime);
    if (!start) return;

    const actualEndDate = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
      parseInt(terminateActualEndHour, 10),
      parseInt(terminateActualEndMin, 10)
    );

    try {
      await terminateSessionEarly(selectedSession.sessionId, actualEndDate.toISOString(), terminateReason);
      setShowTerminateModal(false);
      await loadData();
      alert(`Session ${selectedSession.title} terminated early. Schedule updated.`);
    } catch (err: any) {
      setTerminateError(err.response?.data?.message || 'Failed to terminate session early.');
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
            <img src="/lion logo.png" alt="Lion Logo" className="w-8 h-8 object-contain shrink-0" />
            <div className="flex flex-col">
              <span className="text-xs font-black tracking-widest text-gray-950">LION SIMPLANNER</span>
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Instructor Portal</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col text-right">
            <span className="text-xs font-black text-gray-955 uppercase leading-none">{user.name}</span>
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
              <span className="text-lg font-black text-gray-955 mt-1 block">{visibleCount}</span>
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
                const style = getStatusBadgeStyle(s.status);

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
                      <span className={`px-1.5 py-0.5 rounded border leading-none font-bold ${style.badge}`}>
                        {style.label}
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
                                  : s.status === 'TerminatedEarly'
                                    ? 'bg-purple-600 border border-purple-800 font-bold'
                                    : 'bg-gray-400 hover:bg-gray-500 font-medium'
                                  }`}
                              >
                                <div className="min-w-0">
                                  <div className="text-[7.5px] font-black uppercase tracking-wider truncate leading-tight">{s.title}</div>
                                  <div className="text-[7px] opacity-90 truncate font-bold mt-0.5">{s.pilotName}</div>
                                </div>
                                <span className="text-[6.5px] font-black uppercase block leading-none truncate mt-0.5">{s.phase} • {s.status}</span>
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
                <div className="flex items-center justify-between gap-2">
                  <span className={`px-2 py-0.5 rounded border text-[8px] font-black uppercase ${getStatusBadgeStyle(selectedSession.status).badge}`}>
                    {getStatusBadgeStyle(selectedSession.status).label}
                  </span>
                  {(selectedSession.status === 'InProgress' || selectedSession.status === 'Scheduled') && (
                    <button
                      type="button"
                      onClick={handleOpenTerminateModal}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-[8px] font-black px-2 py-1 rounded uppercase tracking-wider transition-colors cursor-pointer shrink-0"
                    >
                      Terminate Early
                    </button>
                  )}
                </div>

                {selectedSession.status === 'Scheduled' && (
                  <button
                    type="button"
                    onClick={handleStartSession}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2 px-3 rounded text-[10px] uppercase tracking-wider transition-colors cursor-pointer shadow-sm"
                  >
                    Start Session
                  </button>
                )}

                <h3 className="text-sm font-black uppercase text-gray-900 tracking-wider mt-1">{selectedSession.title}</h3>
                <div className="text-[9px] text-gray-400 font-bold uppercase">{toLocalDate(selectedSession.startTime)?.toLocaleString('en-GB', { hour12: false }) ?? 'N/A'}</div>

                {selectedSession.terminationReason && (
                  <div className="p-2 bg-purple-50 border border-purple-200 text-purple-800 rounded text-[9px] font-bold">
                    Termination Reason: {selectedSession.terminationReason}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-[10px] pt-1">
                  <div>
                    <span className="text-gray-450 block font-bold uppercase tracking-wider text-[8px]">Captain</span>
                    <span className="font-black text-gray-900 truncate block">{selectedSession.captainName || (selectedSession.captainId ? selectedSession.captainId.substring(0, 8) : 'Unassigned')}</span>
                  </div>
                  <div>
                    <span className="text-gray-450 block font-bold uppercase tracking-wider text-[8px]">First Officer</span>
                    <span className="font-black text-gray-900 truncate block">{selectedSession.firstOfficerName || (selectedSession.firstOfficerId ? selectedSession.firstOfficerId.substring(0, 8) : 'Unassigned')}</span>
                  </div>
                  <div>
                    <span className="text-gray-450 block font-bold uppercase tracking-wider text-[8px]">Instructor</span>
                    <span className="font-black text-gray-900 truncate block">{selectedSession.instructorName || (selectedSession.instructorId ? selectedSession.instructorId.substring(0, 8) : user.name)}</span>
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
                    <span className="text-gray-450 block font-bold uppercase tracking-wider text-[8px]">Trainee Code</span>
                    <span className="font-black text-gray-900">{selectedSession.traineeEmployeeCode || 'N/A'}</span>
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

                {selectedSession.status !== 'InProgress' && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded text-[9px] font-bold text-amber-800 flex items-center gap-2">
                    <span className="text-xs">🔒</span>
                    <span>Grading is locked. Start session to record grades.</span>
                  </div>
                )}

                <fieldset disabled={selectedSession.status !== 'InProgress'} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Technical Skills</label>
                      <select
                        value={techSkills}
                        onChange={(e) => setTechSkills(e.target.value)}
                        className="w-full text-xs font-bold text-gray-900 px-2 py-1.5 border border-gray-300 rounded bg-white focus:outline-none focus:border-brand-red disabled:bg-gray-100 disabled:text-gray-400"
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
                        className="w-full text-xs font-bold text-gray-900 px-2 py-1.5 border border-gray-300 rounded bg-white focus:outline-none focus:border-brand-red disabled:bg-gray-100 disabled:text-gray-400"
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
                        className="w-full text-xs font-bold text-gray-900 px-2 py-1.5 border border-gray-300 rounded bg-white focus:outline-none focus:border-brand-red disabled:bg-gray-100 disabled:text-gray-400"
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
                        required={selectedSession.status === 'InProgress'}
                        className="w-full text-xs font-bold text-gray-900 px-2 py-1.5 border border-gray-300 rounded bg-white focus:outline-none focus:border-brand-red disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        <option value="">—</option>
                        <option value="PASSED">PASSED</option>
                        <option value="FAILED">FAILED</option>
                        <option value="SATISFACTORY">SATISFACTORY</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Input Teaching Material / Syllabus Notes</label>
                    <textarea
                      rows={4}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      required={selectedSession.status === 'InProgress'}
                      placeholder="Document syllabus coverage, deviations, and instructor recommendations..."
                      className="w-full text-xs font-bold text-gray-900 p-2.5 border border-gray-300 rounded bg-white focus:outline-none focus:border-brand-red resize-none disabled:bg-gray-100 disabled:text-gray-400"
                    />
                  </div>
                </fieldset>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={selectedSession.status !== 'InProgress'}
                  onClick={() => alert('Draft saved successfully.')}
                  className="w-1/2 py-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-350 font-black text-[10px] uppercase tracking-wider rounded transition-colors focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Draft
                </button>
                <button
                  type="submit"
                  disabled={selectedSession.status !== 'InProgress'}
                  className="w-1/2 py-2.5 bg-brand-red hover:bg-red-700 text-white font-black text-[10px] uppercase tracking-wider rounded transition-colors focus:outline-none focus:ring-2 focus:ring-brand-red cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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

      {showTerminateModal && selectedSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full border border-gray-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-black uppercase text-gray-900 tracking-wider">
                Terminate Session Early
              </h3>
              <button
                type="button"
                onClick={() => setShowTerminateModal(false)}
                className="text-xs font-black text-gray-400 hover:text-brand-red uppercase"
              >
                Cancel
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800 font-bold space-y-1">
              <span className="font-black uppercase block text-amber-900">Warning</span>
              <p>This will log the completed hours and instantly release the remaining schedule block.</p>
            </div>

            <form onSubmit={handleConfirmTerminateEarly} className="space-y-4">
              <div>
                <label className="block text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">
                  Actual End Time
                </label>
                <div className="flex gap-2">
                  <select
                    value={terminateActualEndHour}
                    onChange={(e) => setTerminateActualEndHour(e.target.value)}
                    className="text-xs font-black text-gray-900 border border-gray-300 rounded p-2 bg-white focus:outline-none focus:border-brand-red w-1/2"
                  >
                    {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((hr) => (
                      <option key={hr} value={hr}>{hr}:00</option>
                    ))}
                  </select>
                  <select
                    value={terminateActualEndMin}
                    onChange={(e) => setTerminateActualEndMin(e.target.value)}
                    className="text-xs font-black text-gray-900 border border-gray-300 rounded p-2 bg-white focus:outline-none focus:border-brand-red w-1/2"
                  >
                    {['00', '15', '30', '45'].map((min) => (
                      <option key={min} value={min}>{min} min</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">
                  Termination Reason
                </label>
                <select
                  value={terminateReason}
                  onChange={(e) => setTerminateReason(e.target.value)}
                  className="w-full text-xs font-black text-gray-900 border border-gray-300 rounded p-2 bg-white focus:outline-none focus:border-brand-red"
                >
                  <option value="Simulator AOG">Simulator AOG (Hardware Defect)</option>
                  <option value="Pilot Illness">Pilot Illness / Medical Incapacity</option>
                  <option value="Operational Emergency">Operational Emergency</option>
                  <option value="Weather / Environmental">Weather / Facility Failure</option>
                </select>
              </div>

              {terminateError && (
                <div className="p-2 bg-red-50 border border-red-200 text-brand-red text-[10px] font-bold rounded">
                  {terminateError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTerminateModal(false)}
                  className="w-1/2 py-2 border border-gray-300 text-gray-700 text-xs font-black uppercase rounded hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase rounded cursor-pointer transition-colors"
                >
                  Confirm Termination
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}