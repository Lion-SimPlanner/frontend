'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { getSessions, SimulatorSession } from '@/services/api';
import { getHubConnection, startConnection } from '@/services/signalr';

interface ExtendedSession extends SimulatorSession {
  title: string;
  phase: string;
  pilotName: string;
  simulatorName: string;
}

interface NotificationItem {
  id: string;
  type: 'Red' | 'Green' | 'Blue' | 'Orange';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
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

export default function PilotDashboard() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sessions, setSessions] = useState<ExtendedSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ExtendedSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendarStartDate, setCalendarStartDate] = useState<Date>(() => startOfLocalDay(new Date()));

  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif-1',
      type: 'Red',
      title: 'Training Qualification Notice',
      message: 'Recurrent qualification due date in 4 days (July 26, 2026). Check-in with Flight Ops.',
      timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      read: false,
    },
    {
      id: 'notif-2',
      type: 'Green',
      title: 'End-Early Slot Available',
      message: 'Jakarta B737-800NG Slot #2 opened early for voluntary proficiency practice.',
      timestamp: new Date(Date.now() - 3600000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      read: false,
    },
    {
      id: 'notif-3',
      type: 'Blue',
      title: 'Syllabus Roster Updated',
      message: 'Captain assignment confirmed for ILS Approach CAT II simulator session.',
      timestamp: new Date(Date.now() - 7200000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      read: true,
    },
  ]);
  const [showNotifications, setShowNotifications] = useState(false);

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
      startConnection();
      const hub = getHubConnection();

      const handleAogReported = (payload: { simulatorId: string; status: string; reason?: string }) => {
        const newNotif: NotificationItem = {
          id: `aog-${Date.now()}`,
          type: 'Red',
          title: `Simulator ${payload.status} Grounding Alert`,
          message: `Simulator ${payload.simulatorId} reported as ${payload.status}. ${payload.reason || 'Maintenance in progress.'}`,
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          read: false,
        };
        setNotifications((prev) => [newNotif, ...prev]);
      };

      const handleSessionGraded = (payload: { sessionId: string; gradeStatus: string }) => {
        setSessions((prev) =>
          prev.map((s) =>
            s.sessionId === payload.sessionId
              ? { ...s, status: 'Completed' as const, gradeStatus: payload.gradeStatus, isGraded: true }
              : s
          )
        );
        const newNotif: NotificationItem = {
          id: `grade-${Date.now()}`,
          type: 'Green',
          title: 'Session Grading Completed',
          message: `Grading report submitted with status: ${payload.gradeStatus}.`,
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          read: false,
        };
        setNotifications((prev) => [newNotif, ...prev]);
      };

      hub.on('AogReported', handleAogReported);
      hub.on('SessionGraded', handleSessionGraded);

      return () => {
        hub.off('AogReported', handleAogReported);
        hub.off('SessionGraded', handleSessionGraded);
      };
    }
  }, [user, authLoading, router]);

  const loadData = async () => {
    try {
      const rawSessions = await getSessions();
      const mapped: ExtendedSession[] = rawSessions.map((s) => {
        let title = s.syllabusId ? s.syllabusId.replace(/([A-Z])/g, ' $1').trim() : 'Simulator Session';
        let phase = 'Phase 3';

        if (s.sessionId === 'session-01') title = 'ILS Approach — CAT II';
        else if (s.sessionId === 'session-02') title = 'VNAV Profile Review';
        else if (s.sessionId === 'session-03') title = 'Emergency Procedures';
        else if (s.sessionId === 'session-04') title = 'Engine Failure Drills';
        else if (s.sessionId === 'session-05') title = 'Crosswind Landings';
        else if (s.sessionId === 'session-06') title = 'Autoland Operations';
        else if (s.sessionId === 'session-07') title = 'Visual Approaches';

        const startHour = new Date(s.startTime).getHours();
        phase = startHour < 9 ? 'Phase 1' : startHour < 12 ? 'Phase 2' : startHour < 15 ? 'Phase 3' : 'Phase 4';

        const captain = s.captainName || (s.captainId ? `Captain ${s.captainId.substring(0, 6)}` : 'Unassigned');
        const fo = s.firstOfficerName || (s.firstOfficerId ? `FO ${s.firstOfficerId.substring(0, 6)}` : 'Unassigned');
        const instructor = s.instructorName || (s.instructorId ? `Instr. ${s.instructorId.substring(0, 6)}` : 'Instr. P. Langley');

        return {
          ...s,
          title,
          phase,
          pilotName: `${captain} / ${fo}`,
          instructorName: instructor,
          simulatorName: s.simulatorId,
        };
      });

      setSessions(mapped);
      const active = mapped.filter((s) => s.status === 'Scheduled' || s.status === 'InProgress');
      if (active.length > 0) {
        setSelectedSession(active[0]);
      } else if (mapped.length > 0) {
        setSelectedSession(mapped[0]);
      }
    } catch (err) {
      console.error('[Pilot] Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
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
  const pendingCount = visibleSessions.filter((s) => s.status === 'Scheduled' || s.status === 'Draft').length;
  const completedCount = visibleSessions.filter((s) => s.status === 'Completed').length;
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="h-screen flex flex-col bg-white text-gray-900 overflow-hidden font-sans">
      <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 shrink-0 z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <img src="/lion logo.png" alt="Lion Logo" className="w-8 h-8 object-contain shrink-0" />
            <div className="flex flex-col">
              <span className="text-xs font-black tracking-widest text-gray-955">LION SIMPLANNER</span>
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Pilot Portal</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 text-gray-500 hover:text-brand-red transition-colors relative cursor-pointer focus:outline-none"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-brand-red text-white text-[9px] font-black rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="p-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-gray-900 tracking-wider">Pilot Notifications</span>
                    {unreadCount > 0 && (
                      <span className="bg-brand-red text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={markAllAsRead}
                      className="text-[8px] font-bold uppercase text-gray-400 hover:text-gray-700"
                    >
                      Read All
                    </button>
                    <button
                      onClick={clearNotifications}
                      className="text-[8px] font-bold uppercase text-brand-red hover:text-red-700"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                  {notifications.length > 0 ? (
                    notifications.map((n) => {
                      const colorClass =
                        n.type === 'Red'
                          ? 'bg-red-50 border-l-4 border-brand-red text-brand-red'
                          : n.type === 'Green'
                            ? 'bg-green-50 border-l-4 border-green-500 text-green-700'
                            : n.type === 'Orange'
                              ? 'bg-orange-50 border-l-4 border-orange-400 text-orange-700'
                              : 'bg-blue-50 border-l-4 border-blue-400 text-blue-700';

                      return (
                        <div key={n.id} className={`p-3 transition-colors ${colorClass} ${!n.read ? 'font-bold' : 'opacity-80'}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-wider block">{n.title}</span>
                            <span className="text-[8px] font-bold text-gray-400">{n.timestamp}</span>
                          </div>
                          <p className="text-[9px] text-gray-700 mt-1 leading-tight">{n.message}</p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-4 text-center text-xs text-gray-400 font-bold uppercase tracking-wider">
                      No Active Notifications
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="hidden md:flex flex-col text-right">
            <span className="text-xs font-black text-gray-955 uppercase leading-none">{user.name}</span>
            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Commercial Airline Pilot</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-brand-red text-white flex items-center justify-center font-black text-xs shrink-0">
            RH
          </div>
          <button onClick={logout} className="text-gray-400 hover:text-brand-red transition-colors shrink-0 ml-1 cursor-pointer">
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
              My Scheduled Sessions
            </div>
            <div className="space-y-2">
              {visibleSessions.map((s) => {
                const localStart = toLocalDate(s.startTime);
                const timeLabel = localStart
                  ? localStart.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
                  : 'N/A';

                return (
                  <div
                    key={s.sessionId}
                    onClick={() => setSelectedSession(s)}
                    className={`p-3 border rounded bg-white cursor-pointer transition-all ${
                      selectedSession?.sessionId === s.sessionId
                        ? 'border-brand-red shadow-sm'
                        : 'border-gray-150 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-xs font-black text-gray-900 truncate">{s.title}</div>
                    <div className="text-[9px] text-gray-500 font-bold uppercase mt-1 truncate">{s.simulatorName}</div>
                    <div className="flex items-center justify-between text-[8px] text-gray-400 font-black uppercase mt-2">
                      <span>{timeLabel} • {s.phase}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full leading-none font-bold ${
                          s.status === 'Completed'
                            ? 'bg-green-50 text-green-600 border border-green-300'
                            : s.status === 'Scheduled'
                              ? 'bg-blue-50 text-blue-600 border border-blue-300'
                              : 'bg-orange-50 text-orange-600 border border-orange-300'
                        }`}
                      >
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
                <h3 className="text-sm font-black uppercase text-gray-900 tracking-wider">Pilot 14-Day Schedule Grid</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">{calendarRangeLabel}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={goToPreviousWindow}
                  className="px-2 py-1 border border-gray-200 text-gray-700 text-[9px] font-black uppercase rounded hover:bg-gray-50 cursor-pointer"
                >
                  Prev 14d
                </button>
                <button
                  onClick={goToTodayWindow}
                  className="px-2 py-1 border border-brand-red text-brand-red text-[9px] font-black uppercase rounded hover:bg-red-50 cursor-pointer"
                >
                  Today
                </button>
                <button
                  onClick={goToNextWindow}
                  className="px-2 py-1 border border-gray-200 text-gray-700 text-[9px] font-black uppercase rounded hover:bg-gray-50 cursor-pointer"
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
                          {visibleSessions
                            .filter((s) => {
                              const startDate = toLocalDate(s.startTime);
                              return !!startDate && toLocalDateKey(startDate) === dayKey;
                            })
                            .map((s) => {
                              const startDate = toLocalDate(s.startTime);
                              if (!startDate) return null;
                              const startHour = startDate.getHours();
                              const startMinute = startDate.getMinutes();
                              const duration = getSessionDurationHours(s.startTime, s.endTime);
                              const topOffset = (startHour - 6) * 35 + (startMinute / 60) * 35;
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
                                  className={`absolute left-0.5 right-0.5 p-1 rounded cursor-pointer text-white flex flex-col justify-between overflow-hidden shadow-sm transition-all z-20 ${
                                    selectedSession?.sessionId === s.sessionId
                                      ? 'bg-brand-red border border-red-800 font-black'
                                      : 'bg-gray-400 hover:bg-gray-500 font-medium'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="text-[7.5px] font-black uppercase tracking-wider truncate leading-tight">{s.title}</div>
                                    <div className="text-[7px] opacity-90 truncate font-bold mt-0.5">{s.simulatorName}</div>
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
            <div className="border border-gray-150 rounded p-6 bg-white shadow-sm space-y-6">
              <div className="space-y-4 border-b border-gray-100 pb-4">
                <span className="bg-brand-red text-white text-[8px] font-black px-2 py-0.5 rounded uppercase">
                  {selectedSession.status}
                </span>
                <h3 className="text-sm font-black uppercase text-gray-900 tracking-wider mt-1">{selectedSession.title}</h3>
                <div className="text-[9px] text-gray-400 font-bold uppercase">
                  {toLocalDate(selectedSession.startTime)?.toLocaleString('en-GB', { hour12: false }) ?? 'N/A'}
                </div>

                <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-[10px] pt-1">
                  <div>
                    <span className="text-gray-400 block font-bold uppercase tracking-wider text-[8px]">Captain</span>
                    <span className="font-black text-gray-900 truncate block">
                      {selectedSession.captainName || (selectedSession.captainId ? selectedSession.captainId.substring(0, 8) : 'Unassigned')}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-bold uppercase tracking-wider text-[8px]">First Officer</span>
                    <span className="font-black text-gray-900 truncate block">
                      {selectedSession.firstOfficerName || (selectedSession.firstOfficerId ? selectedSession.firstOfficerId.substring(0, 8) : 'Unassigned')}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-bold uppercase tracking-wider text-[8px]">Instructor</span>
                    <span className="font-black text-gray-900 truncate block">
                      {selectedSession.instructorName || (selectedSession.instructorId ? selectedSession.instructorId.substring(0, 8) : 'Instr. P. Langley')}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-bold uppercase tracking-wider text-[8px]">Phase</span>
                    <span className="font-black text-gray-900">{selectedSession.phase}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-bold uppercase tracking-wider text-[8px]">Simulator</span>
                    <span className="font-black text-gray-900 truncate max-w-[110px] block" title={selectedSession.simulatorName}>
                      {selectedSession.simulatorName}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-bold uppercase tracking-wider text-[8px]">Syllabus ID</span>
                    <span className="font-black text-gray-900 truncate block">{selectedSession.syllabusId}</span>
                  </div>
                </div>
              </div>

              {selectedSession.isGraded && (
                <div className="space-y-2 border border-green-200 bg-green-50 p-3 rounded text-[10px]">
                  <span className="font-black text-green-700 uppercase block tracking-wider">Grading Completed</span>
                  <div className="font-bold text-gray-800">Status: {selectedSession.gradeStatus || 'Passed'}</div>
                  {selectedSession.instructorNotes && (
                    <div className="text-[9px] text-gray-600 mt-1 leading-relaxed">
                      Notes: {selectedSession.instructorNotes}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="border border-gray-150 rounded p-6 bg-white text-center text-gray-400 text-xs font-bold py-12 uppercase tracking-wider">
              Select a session in the 14-day window to view details
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
