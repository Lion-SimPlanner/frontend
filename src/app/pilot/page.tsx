'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
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

const listContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const listItem: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } }
};

const slideInRight: Variants = {
  hidden: { opacity: 0, x: 20 },
  show: { opacity: 1, x: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } },
  exit: { opacity: 0, x: 20, transition: { duration: 0.15 } }
};

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

const getStartOfLocalWeek = (value: Date) => {
  const dt = startOfLocalDay(value);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return dt;
};

export default function PilotDashboard() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sessions, setSessions] = useState<ExtendedSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ExtendedSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendarStartDate, setCalendarStartDate] = useState<Date>(() => getStartOfLocalWeek(new Date()));

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

        const traineeName = s.traineeName || 'Unassigned';
        const traineeRole = s.traineeRole || '';
        const instructor = s.instructorName || (s.instructorId ? `Instr. ${s.instructorId.substring(0, 6)}` : 'Instr. P. Langley');

        return {
          ...s,
          title,
          phase,
          pilotName: s.traineeEmployeeCode
            ? `${s.traineeEmployeeCode} • ${traineeName}${traineeRole ? ` (${traineeRole})` : ''}`
            : traineeName,
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
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
          className="text-sm font-bold uppercase tracking-widest text-brand-red text-center"
        >
          Loading Pilot Portal...
        </motion.div>
      </div>
    );
  }

  const visibleDayCount = 7;
  const visibleDays = Array.from({ length: visibleDayCount }, (_, idx) => addLocalDays(calendarStartDate, idx));
  const visibleDayKeys = new Set(visibleDays.map(toLocalDateKey));
  const visibleSessions = sessions.filter((s) => {
    const start = toLocalDate(s.startTime);
    if (!start) return false;
    if (!visibleDayKeys.has(toLocalDateKey(start))) return false;
    const byEmployeeCode =
      user?.employeeId && s.traineeEmployeeCode &&
      s.traineeEmployeeCode.toLowerCase() === user.employeeId.toLowerCase();
    const byCaptainId =
      user?.id && s.captainId && s.captainId === user.id;
    const byFirstOfficerId =
      user?.id && s.firstOfficerId && s.firstOfficerId === user.id;
    const byTraineeName =
      user?.name && s.traineeName &&
      s.traineeName.toLowerCase().includes(user.name.split(' ').pop()!.toLowerCase());
    return !!(byEmployeeCode || byCaptainId || byFirstOfficerId || byTraineeName || !s.traineeEmployeeCode);
  });
  const calendarRangeLabel = formatCalendarRange(calendarStartDate, visibleDayCount);

  const goToPreviousWindow = () => setCalendarStartDate((prev) => addLocalDays(prev, -visibleDayCount));
  const goToNextWindow = () => setCalendarStartDate((prev) => addLocalDays(prev, visibleDayCount));
  const goToTodayWindow = () => setCalendarStartDate(getStartOfLocalWeek(new Date()));

  const visibleCount = visibleSessions.length;
  const pendingCount = visibleSessions.filter((s) => s.status === 'Scheduled' || s.status === 'Draft').length;
  const completedCount = visibleSessions.filter((s) => s.status === 'Completed').length;
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="h-screen w-full flex flex-col bg-white text-gray-900 overflow-hidden font-sans">
      <header className="min-h-[4rem] border-b border-gray-200 bg-white flex flex-wrap items-center justify-between px-4 sm:px-6 py-2 gap-2 shrink-0 z-30 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <div className="flex items-center gap-2">
            <img src="/lion logo.png" alt="Lion Logo" className="w-8 h-8 object-contain shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-black tracking-widest text-gray-955 truncate">LION SIMPLANNER</span>
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider truncate">Pilot Portal</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
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

            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-72 sm:w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden"
                >
                  <div className="p-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-black uppercase text-gray-900 tracking-wider truncate">Pilot Notifications</span>
                      {unreadCount > 0 && (
                        <span className="bg-brand-red text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={markAllAsRead}
                        className="text-[8px] font-bold uppercase text-gray-400 hover:text-gray-700 cursor-pointer"
                      >
                        Read All
                      </button>
                      <button
                        onClick={clearNotifications}
                        className="text-[8px] font-bold uppercase text-brand-red hover:text-red-700 cursor-pointer"
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
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-black uppercase tracking-wider block truncate">{n.title}</span>
                              <span className="text-[8px] font-bold text-gray-400 shrink-0">{n.timestamp}</span>
                            </div>
                            <p className="text-[9px] text-gray-700 mt-1 leading-tight break-words">{n.message}</p>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-4 text-center text-xs text-gray-400 font-bold uppercase tracking-wider">
                        No Active Notifications
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="hidden md:flex flex-col text-right min-w-0">
            <span className="text-xs font-black text-gray-955 uppercase leading-none truncate">{user.name}</span>
            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5 truncate">Commercial Airline Pilot</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-brand-red text-white flex items-center justify-center font-black text-xs shrink-0 transition-transform hover:scale-110">
            {user.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
          </div>
          <button onClick={logout} className="text-gray-400 hover:text-brand-red transition-all cursor-pointer shrink-0 ml-1 active:scale-90 p-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden min-w-0">
        <aside className="w-full lg:w-[22%] xl:w-[20%] border-b lg:border-b-0 lg:border-r border-gray-200 p-4 space-y-4 sm:space-y-6 overflow-y-auto shrink-0 bg-white shadow-[10px_0_15px_-3px_rgba(0,0,0,0.02)] z-10">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-3 gap-2"
          >
            <div className="border border-gray-150 p-2 sm:p-2.5 rounded text-center bg-white shadow-sm hover:shadow-md transition-shadow">
              <span className="text-[9px] sm:text-[10px] text-gray-400 font-bold block uppercase truncate">Window</span>
              <span className="text-base sm:text-lg font-black text-gray-955 mt-0.5 sm:mt-1 block">{visibleCount}</span>
            </div>
            <div className="border border-gray-150 p-2 sm:p-2.5 rounded text-center bg-white shadow-sm hover:shadow-md transition-shadow">
              <span className="text-[9px] sm:text-[10px] text-gray-400 font-bold block uppercase truncate">Pending</span>
              <span className="text-base sm:text-lg font-black text-brand-red mt-0.5 sm:mt-1 block">{pendingCount}</span>
            </div>
            <div className="border border-gray-150 p-2 sm:p-2.5 rounded text-center bg-white shadow-sm hover:shadow-md transition-shadow">
              <span className="text-[9px] sm:text-[10px] text-gray-400 font-bold block uppercase truncate">Done</span>
              <span className="text-base sm:text-lg font-black text-green-600 mt-0.5 sm:mt-1 block">{completedCount}</span>
            </div>
          </motion.div>

          <div className="space-y-3">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-red shrink-0" /> My Scheduled Sessions
            </div>
            <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-2 max-h-[300px] lg:max-h-none overflow-y-auto pr-1">
              {visibleSessions.map((s) => {
                const localStart = toLocalDate(s.startTime);
                const timeLabel = localStart
                  ? localStart.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
                  : 'N/A';

                return (
                  <motion.div
                    variants={listItem}
                    key={s.sessionId}
                    onClick={() => setSelectedSession(s)}
                    className={`p-3 border rounded bg-white cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] ${selectedSession?.sessionId === s.sessionId
                        ? 'border-brand-red shadow-sm'
                        : 'border-gray-150 hover:border-gray-300'
                      }`}
                  >
                    <div className="text-xs font-black text-gray-900 truncate">{s.title}</div>
                    <div className="text-[9px] text-gray-500 font-bold uppercase mt-1 truncate">{s.simulatorName}</div>
                    <div className="flex items-center justify-between text-[8px] text-gray-400 font-black uppercase mt-2 gap-2">
                      <span className="truncate">{timeLabel} • {s.phase}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded border leading-none font-bold transition-colors shrink-0 whitespace-nowrap ${s.status === 'Completed'
                            ? 'bg-green-50 text-green-600 border-green-300'
                            : s.status === 'Scheduled'
                              ? 'bg-blue-50 text-blue-600 border-blue-300'
                              : 'bg-orange-50 text-orange-600 border-orange-300'
                          }`}
                      >
                        {s.status}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </aside>

        <section className="w-full lg:w-[53%] xl:w-[55%] p-4 sm:p-6 overflow-y-auto bg-gray-50/30 border-b lg:border-b-0 lg:border-r border-gray-200 flex flex-col min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="border border-gray-150 rounded p-4 sm:p-6 bg-white shadow-sm flex-1 flex flex-col overflow-hidden hover:shadow-md transition-shadow"
          >
            <div className="flex flex-wrap items-center justify-between mb-4 shrink-0 min-w-0 gap-2">
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-black uppercase text-gray-900 tracking-wider truncate">Pilot 7-Day Schedule Grid</h3>
                <p className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 truncate">{calendarRangeLabel}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={goToPreviousWindow}
                  className="px-2 py-1 border border-gray-200 text-gray-700 text-[9px] font-black uppercase rounded hover:bg-gray-50 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                >
                  Prev Week
                </button>
                <button
                  onClick={goToTodayWindow}
                  className="px-2 py-1 border border-brand-red text-brand-red text-[9px] font-black uppercase rounded hover:bg-red-50 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                >
                  Today
                </button>
                <button
                  onClick={goToNextWindow}
                  className="px-2 py-1 border border-gray-200 text-gray-700 text-[9px] font-black uppercase rounded hover:bg-gray-50 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                >
                  Next Week
                </button>
              </div>
            </div>

            <div className="overflow-x-auto flex-1 flex flex-col border border-gray-100 rounded min-w-0">
              <div className="min-w-[1000px] flex flex-col flex-1">
                <div
                  className="grid bg-gray-50 border-b border-gray-100 text-center font-bold text-[10px] text-gray-500 uppercase py-3 shrink-0"
                  style={{ gridTemplateColumns: `50px repeat(${visibleDayCount}, minmax(65px, 1fr))` }}
                >
                  <div>Time</div>
                  {visibleDays.map((day) => (
                    <div key={toLocalDateKey(day)} className="border-l border-gray-100 flex flex-col justify-center min-w-0">
                      <span className="truncate">{day.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                      <span className="text-xs font-black text-gray-900 mt-0.5 truncate">{day.getDate()}</span>
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
                      const daySessions = visibleSessions.filter((s) => {
                        const startDate = toLocalDate(s.startTime);
                        return !!startDate && toLocalDateKey(startDate) === dayKey;
                      });

                      const columnOf: Record<string, number> = {};
                      const totalColumnsOf: Record<string, number> = {};
                      const sorted = [...daySessions].sort(
                        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
                      );
                      sorted.forEach((s) => {
                        const sStart = new Date(s.startTime).getTime();
                        const sEnd = new Date(s.endTime || s.startTime).getTime();
                        const overlapping = sorted.filter((o) => {
                          if (o.sessionId === s.sessionId) return false;
                          const oStart = new Date(o.startTime).getTime();
                          const oEnd = new Date(o.endTime || o.startTime).getTime();
                          return sStart < oEnd && sEnd > oStart;
                        });
                        const usedCols = new Set(overlapping.map((o) => columnOf[o.sessionId]).filter((c) => c !== undefined));
                        let col = 0;
                        while (usedCols.has(col)) col++;
                        columnOf[s.sessionId] = col;
                        const group = [s, ...overlapping];
                        const maxCol = Math.max(...group.map((g) => columnOf[g.sessionId] ?? 0)) + 1;
                        group.forEach((g) => {
                          totalColumnsOf[g.sessionId] = Math.max(totalColumnsOf[g.sessionId] ?? 1, maxCol);
                        });
                      });

                      return (
                        <div key={dayKey} className="relative border-r border-gray-50 last:border-r-0 h-full">
                          {daySessions.map((s) => {
                            const startDate = toLocalDate(s.startTime);
                            if (!startDate) return null;
                            const startHour = startDate.getHours();
                            const startMinute = startDate.getMinutes();
                            const duration = getSessionDurationHours(s.startTime, s.endTime);
                            const topOffset = (startHour - 6) * 35 + (startMinute / 60) * 35;
                            const height = duration * 35;

                            if (topOffset < 0 || topOffset > 455) return null;

                            const col = columnOf[s.sessionId] ?? 0;
                            const total = totalColumnsOf[s.sessionId] ?? 1;
                            const widthPct = 100 / total;
                            const leftPct = col * widthPct;

                            return (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                whileHover={{ scale: 1.03, zIndex: 30 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                key={s.sessionId}
                                onClick={() => setSelectedSession(s)}
                                style={{
                                  top: `${topOffset}px`,
                                  height: `${height - 2}px`,
                                  left: `calc(${leftPct}% + 2px)`,
                                  width: `calc(${widthPct}% - 4px)`,
                                }}
                                className={`absolute p-1 rounded cursor-pointer text-white flex flex-col justify-between overflow-hidden shadow-sm transition-colors active:scale-95 ${selectedSession?.sessionId === s.sessionId
                                    ? 'bg-brand-red border border-red-800 font-black z-30'
                                    : s.status === 'Scheduled' || s.status === 'Draft'
                                      ? 'bg-blue-500 hover:bg-blue-600 border border-blue-700 font-bold z-20'
                                      : s.status === 'InProgress'
                                        ? 'bg-green-600 hover:bg-green-700 border border-green-800 font-bold z-20 animate-pulse'
                                        : s.status === 'Completed'
                                          ? 'bg-teal-600 hover:bg-teal-700 border border-teal-800 font-bold z-20'
                                          : s.status === 'TerminatedEarly'
                                            ? 'bg-purple-600 hover:bg-purple-700 border border-purple-800 font-bold z-20'
                                            : s.status === 'Cancelled'
                                              ? 'bg-gray-300 hover:bg-gray-400 border border-gray-400 font-medium z-10 opacity-70'
                                              : 'bg-blue-500 hover:bg-blue-600 border border-blue-700 font-medium z-20'
                                  }`}
                              >
                                <div className="min-w-0">
                                  <div className="text-[7.5px] font-black uppercase tracking-wider truncate leading-tight">{s.title}</div>
                                  <div className="text-[7px] opacity-90 truncate font-bold mt-0.5">{s.simulatorName}</div>
                                </div>
                                <span className="text-[6.5px] font-black uppercase block leading-none truncate mt-0.5">{s.phase}</span>
                              </motion.div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <aside className="w-full lg:w-[25%] p-4 sm:p-6 overflow-y-auto bg-white space-y-6 shrink-0 shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.02)] z-10">
          <AnimatePresence mode="wait">
            {selectedSession ? (
              <motion.div
                key={selectedSession.sessionId}
                variants={slideInRight}
                initial="hidden"
                animate="show"
                exit="exit"
                className="border border-gray-150 rounded p-4 sm:p-6 bg-white shadow-sm space-y-6 hover:shadow-md transition-shadow"
              >
                <div className="space-y-4 border-b border-gray-100 pb-4 min-w-0">
                  <span className="bg-brand-red text-white text-[8px] font-black px-2 py-0.5 rounded uppercase inline-block whitespace-nowrap">
                    {selectedSession.status}
                  </span>
                  <h3 className="text-sm font-black uppercase text-gray-900 tracking-wider mt-1 truncate">{selectedSession.title}</h3>
                  <div className="text-[9px] text-gray-400 font-bold uppercase truncate">
                    {toLocalDate(selectedSession.startTime)?.toLocaleString('en-GB', { hour12: false }) ?? 'N/A'}
                  </div>

                  <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-[10px] pt-1 min-w-0">
                    <div className="min-w-0">
                      <span className="text-gray-400 block font-bold uppercase tracking-wider text-[8px] truncate">Trainee</span>
                      <span className="font-black text-gray-900 truncate block">
                        {selectedSession.traineeName || selectedSession.traineeEmployeeCode || 'Unassigned'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-gray-400 block font-bold uppercase tracking-wider text-[8px] truncate">Trainee Role</span>
                      <span className="font-black text-gray-900 truncate block">
                        {selectedSession.traineeRole || '—'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-gray-400 block font-bold uppercase tracking-wider text-[8px] truncate">Instructor</span>
                      <span className="font-black text-gray-900 truncate block">
                        {selectedSession.instructorName || (selectedSession.instructorId ? selectedSession.instructorId.substring(0, 8) : 'Instr. P. Langley')}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-gray-400 block font-bold uppercase tracking-wider text-[8px] truncate">Phase</span>
                      <span className="font-black text-gray-900 truncate block">{selectedSession.phase}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-gray-400 block font-bold uppercase tracking-wider text-[8px] truncate">Simulator</span>
                      <span className="font-black text-gray-900 truncate block" title={selectedSession.simulatorName}>
                        {selectedSession.simulatorName}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-gray-400 block font-bold uppercase tracking-wider text-[8px] truncate">Syllabus ID</span>
                      <span className="font-black text-gray-900 truncate block">{selectedSession.syllabusId}</span>
                    </div>
                  </div>
                </div>

                {selectedSession.isGraded && (
                  <div className="space-y-2 border border-green-200 bg-green-50 p-3 rounded text-[10px]">
                    <span className="font-black text-green-700 uppercase block tracking-wider truncate">Grading Completed</span>
                    <div className="font-bold text-gray-800 truncate">Status: {selectedSession.gradeStatus || 'Passed'}</div>
                    {selectedSession.instructorNotes && (
                      <div className="text-[9px] text-gray-600 mt-1 leading-relaxed break-words">
                        Notes: {selectedSession.instructorNotes}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="border border-gray-150 rounded p-6 bg-white text-center text-gray-400 text-xs font-bold py-12 uppercase tracking-wider shadow-sm"
              >
                Select a session in the 7-day window to view details
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
    </div>
  );
}