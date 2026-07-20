'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { getSimulators, setSimulatorStatus, submitMaintenanceChecklist, getEngineers, getSessions, resolveDefect, checkoutEngineerShift, Simulator, Engineer, SimulatorSession } from '@/services/api';
import { getHubConnection, startConnection } from '@/services/signalr';
import ResolveDefectModal from '@/components/engineer/ResolveDefectModal';

const toLocalDate = (value?: string) => {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
};

const formatLocalTime = (value?: string) => {
  const dt = toLocalDate(value);
  if (!dt) return 'N/A';
  return dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const formatLocalDateTime = (value?: string) => {
  const dt = toLocalDate(value);
  if (!dt) return 'N/A';
  return dt.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  });
};

const isReadyStatus = (status: Simulator['status']) => status === 'Ready' || status === 'Up';

const normalizeStatusLabel = (status: Simulator['status']) => {
  if (status === 'Up') return 'Ready';
  if (status === 'Down') return 'AOG';
  return status;
};

export default function EngineerDashboard() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [simulators, setSimulators] = useState<Simulator[]>([]);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [sessions, setSessions] = useState<SimulatorSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [maintSignedOff, setMaintSignedOff] = useState(false);
  const [activeFault, setActiveFault] = useState(false);

  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  const [showAogModal, setShowAogModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [affectedSystem, setAffectedSystem] = useState('');
  const [failureDescription, setFailureDescription] = useState('');
  const [resolutionDetails, setResolutionDetails] = useState('');
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [severity, setSeverity] = useState('AOG');
  const [checkoutTime, setCheckoutTime] = useState<string | null>(null);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setCurrentTime(new Date());
    
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!authLoading && mounted) {
      if (!user) {
        router.push('/');
        return;
      }
      const role = user.role.toLowerCase();
      if (role !== 'engineer') {
        if (role === 'admin') {
          router.push('/admin');
        } else if (role === 'instructor') {
          router.push('/instructor');
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
      const handleAogReported = (payload: { simulatorId: string; status: string }) => {
        setSimulators((prev) =>
          prev.map((s) =>
            s.id === payload.simulatorId
              ? {
                  ...s,
                  status:
                    payload.status === 'AOG' || payload.status === 'MEL' || payload.status === 'Defect' || payload.status === 'Ready'
                      ? payload.status
                      : payload.status === 'Down'
                        ? 'AOG'
                        : 'Ready',
                }
              : s
          )
        );
      };
      hub.on('AogReported', handleAogReported);
      return () => {
        hub.off('AogReported', handleAogReported);
      };
    }
  }, [user, authLoading, router, mounted]);

  const loadData = async () => {
    try {
      const [sims, engs, sess] = await Promise.all([getSimulators(), getEngineers(), getSessions()]);
      setSimulators(sims);
      setEngineers(engs);
      setSessions(sess);
      setActiveFault(sims.some((sim) => !isReadyStatus(sim.status)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const status = severity;
      const targetSimId = simulators.length > 0 ? simulators[0].id : '';
      if (!targetSimId) throw new Error('No simulator selected for AOG report');
      await setSimulatorStatus(targetSimId, status, `[${severity}] [${affectedSystem}] ${failureDescription}`);
      setActiveFault(true);
      setShowAogModal(false);
      setAffectedSystem('');
      setFailureDescription('');
      setShowSuccessToast(true);
      await loadData();
      setTimeout(() => {
        setShowSuccessToast(false);
      }, 5000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolveDefect = async () => {
    const targetSimulator = simulators.find((s) => !isReadyStatus(s.status));
    if (!targetSimulator) {
      setResolveError('No active simulator defect to resolve.');
      return;
    }

    setResolveError(null);
    setIsResolving(true);
    try {
      const result = await resolveDefect(targetSimulator.id, resolutionDetails.trim());
      const resolvedAt = result.resolvedAt ?? new Date().toISOString();
      setSimulators((prev) =>
        prev.map((sim) =>
          sim.id === targetSimulator.id
            ? { ...sim, status: 'Ready', lastChangedAt: resolvedAt }
            : sim
        )
      );
      setActiveFault(false);
      setShowResolveModal(false);
      setResolutionDetails('');
      setShowSuccessToast(true);
      setTimeout(() => {
        setShowSuccessToast(false);
      }, 5000);
    } catch (err: any) {
      setResolveError(err?.response?.data?.error ?? 'Failed to resolve defect.');
    } finally {
      setIsResolving(false);
    }
  };

  const handleCheckout = async () => {
    if (!primaryEngineer?.id) {
      setCheckoutError('No engineer profile available for checkout.');
      return;
    }

    setCheckoutError(null);
    setCheckoutPending(true);
    try {
      const result = await checkoutEngineerShift(primaryEngineer.id);
      if (!result.verified) {
        setCheckoutError('Checkout was not verified by the server.');
        return;
      }
      setCheckoutTime(result.checkoutTime);
      setEngineers((prev) =>
        prev.map((engineer) =>
          engineer.id === result.engineerId
            ? { ...engineer, checkoutTime: result.checkoutTime }
            : engineer
        )
      );
    } catch (err: any) {
      setCheckoutError(err?.response?.data?.error ?? 'Checkout failed.');
    } finally {
      setCheckoutPending(false);
    }
  };

  const handleSignOff = async () => {
    try {
      const targetSimId = simulators.length > 0 ? simulators[0].id : '';
      if (!targetSimId) throw new Error('No simulator selected for maintenance sign-off');
      const checklistDate = new Date().toISOString().split('T')[0];
      await submitMaintenanceChecklist({
        simulatorId: targetSimId,
        checklistDate,
        isCleared: true,
        notes: 'Pre-flight calibration check passed.',
      });
      setMaintSignedOff(true);
      await loadData();
      alert('Daily simulator checklist signed off successfully.');
    } catch (err) {
      console.error(err);
    }
  };

  if (authLoading || !user || !mounted || loading || !currentTime) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-sm font-bold uppercase tracking-widest text-brand-red animate-pulse">
          Loading Engineering Portal...
        </div>
      </div>
    );
  }

  const primaryEngineer = engineers[0];
  const activeDefectSimulator = simulators.find((sim) => !isReadyStatus(sim.status));
  const currentSimulator = activeDefectSimulator ?? simulators[0] ?? null;
  const currentStatus = currentSimulator ? normalizeStatusLabel(currentSimulator.status) : 'Ready';
  const faultCount = simulators.filter((s) => {
    const normalized = normalizeStatusLabel(s.status);
    return normalized === 'AOG' || normalized === 'Defect' || normalized === 'MEL';
  }).length;
  const degradedCount = simulators.filter((s) => normalizeStatusLabel(s.status) === 'MEL').length;
  
  const shiftDays = Array.from(new Set(engineers.map((e) => toLocalDate(e.shiftStart)?.getDate()).filter((d): d is number => typeof d === 'number')));
  const sessionDays = Array.from(new Set(sessions.map((s) => toLocalDate(s.startTime)?.getDate()).filter((d): d is number => typeof d === 'number')));
  const signedOffDays = sessionDays;
  const aogDays = simulators
    .filter((s) => (s.status === 'AOG' || s.status === 'Down') && s.lastChangedAt)
    .map((s) => toLocalDate(s.lastChangedAt)?.getDate())
    .filter((d): d is number => typeof d === 'number');

  const todayDayNumber = currentTime.getDate();
  const topBarDateLabel = currentTime.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="h-screen flex bg-white text-gray-900 overflow-hidden font-sans">
      <aside className="w-64 border-r border-gray-200 bg-white flex flex-col justify-between p-4 shrink-0">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <img src="/lion logo.png" alt="Lion Logo" className="w-8 h-8 object-contain" />
            <div className="flex flex-col">
              <span className="text-xs font-black tracking-widest text-gray-950">SIMFLIGHT</span>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Engineering</span>
            </div>
          </div>

          <div className="p-3 bg-red-50 border border-brand-red rounded">
            <span className="text-[9px] font-black text-brand-red uppercase tracking-wider block">Engineer Portal</span>
            <span className="text-xs font-bold text-gray-900 mt-1 block">{currentSimulator ? `${currentSimulator.name}` : 'No simulator loaded'}</span>
          </div>

          <nav className="space-y-1">
            <button className="w-full flex items-center gap-3 px-3 py-2 text-xs font-black uppercase tracking-wider rounded bg-brand-red text-white">
              Overview
            </button>
          </nav>
        </div>

        <div className="space-y-4">
          <div className="p-3 bg-red-50 border border-brand-red rounded text-[10px] space-y-1">
            <div className="font-black text-brand-red uppercase">Active Alerts</div>
            <div className="text-gray-900 font-bold">{faultCount} FAULT — action required</div>
            <div className="text-gray-900 font-bold">{degradedCount} DEGRADED — monitor</div>
          </div>

          <div className="flex items-center justify-between border-t border-gray-150 pt-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-black text-xs text-gray-700 shrink-0">
                MK
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-gray-950 truncate uppercase leading-none">{user.name}</div>
                <div className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Sim Engineer • Day</div>
              </div>
            </div>
            <button onClick={logout} className="text-gray-400 hover:text-brand-red transition-colors shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden bg-white">
        <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 shrink-0 z-30">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-black uppercase text-gray-950">Maintenance & Shift Overview</h1>
            {activeFault && (
              <span className="bg-red-50 text-brand-red border border-brand-red text-[8px] font-black px-2 py-0.5 rounded uppercase leading-none">
                {faultCount} Fault Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
              {topBarDateLabel} • {formatLocalTime(primaryEngineer?.shiftStart)}-{formatLocalTime(primaryEngineer?.shiftEnd)} Local • {user.name}
            </span>
            <button
              onClick={handleCheckout}
              disabled={checkoutPending}
              className="px-2.5 py-1 border border-green-600 text-green-700 text-[9px] font-black uppercase rounded hover:bg-green-50 disabled:opacity-50"
            >
              {checkoutPending ? 'Checking Out...' : 'Checkout Shift'}
            </button>
            <div className="flex items-center gap-1 bg-gray-50 border border-gray-150 px-2 py-1 rounded">
              <span className="w-1.5 h-1.5 bg-brand-red rounded-full animate-ping" />
              <span className="text-[9px] font-black text-gray-900">{currentTime.toLocaleTimeString('en-GB', { hour12: false })} LOCAL</span>
            </div>
          </div>
        </header>

        {(checkoutTime || checkoutError) && (
          <div className={`mx-6 mt-4 p-3 rounded border text-xs font-bold ${checkoutError ? 'bg-red-50 border-red-300 text-brand-red' : 'bg-green-50 border-green-300 text-green-700'}`}>
            {checkoutError
              ? checkoutError
              : `Checkout verified at ${formatLocalDateTime(checkoutTime ?? undefined)}`}
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          <div className="w-3/5 h-full overflow-y-auto p-6 space-y-6">
            <div className="border border-gray-150 rounded p-6 bg-white shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider">
                    {currentTime.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                  </h3>
                  <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Maintenance Shift Calendar</p>
                </div>
                <div className="flex gap-1">
                  <button className="p-1 border border-gray-200 rounded hover:bg-gray-50 text-xs font-bold text-gray-600">&lt;</button>
                  <button className="p-1 border border-gray-200 rounded hover:bg-gray-50 text-xs font-bold text-gray-600">&gt;</button>
                </div>
              </div>

              <div className="flex gap-4 text-[9px] font-black uppercase tracking-wider mb-4 border-b border-gray-100 pb-2 text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-red" /> Shift Day</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Signed Off</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> AOG Event</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" /> Off</span>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} className="font-black text-[9px] uppercase tracking-wider text-gray-400 py-1">{d}</div>
                ))}

                <div className="border border-transparent py-4 text-transparent">30</div>
                <div className="border border-transparent py-4 text-transparent">31</div>
                
                {Array.from({ length: 31 }, (_, i) => i + 1).map(day => {
                  const isToday = day === todayDayNumber;
                  const isShift = shiftDays.includes(day);
                  const isSignedOff = signedOffDays.includes(day);
                  const isAog = aogDays.includes(day);

                  return (
                    <div key={day} className={`border border-gray-100 py-2 relative flex flex-col items-center justify-between h-14 ${isToday ? 'bg-red-50 border-brand-red shadow-sm' : 'bg-white'}`}>
                      <span className={`text-[10px] font-black ${isToday ? 'text-brand-red text-xs' : 'text-gray-900'}`}>{day}</span>
                      {isToday && <span className="text-[7px] font-black text-brand-red uppercase leading-none">NOW</span>}
                      <div className="flex gap-0.5 justify-center mt-auto pb-1">
                        {isShift && <span className="w-1.5 h-1.5 rounded-full bg-brand-red" />}
                        {isSignedOff && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                        {isAog && <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 border-t border-gray-150 pt-4 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-900">
                  {currentTime.toLocaleDateString('en-GB', { month: 'long', day: 'numeric', year: 'numeric' })} • Daily checklist signed off
                </span>
                <span className="bg-green-50 text-green-600 border border-green-500 text-[8px] font-black px-2 py-0.5 rounded uppercase">Complete</span>
              </div>
            </div>

            <div className="border border-gray-150 rounded p-6 bg-white shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-brand-red rounded-full" />
                  <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider">Today's Shift Log</h3>
                </div>
                <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">
                  {currentTime.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()} • Day Shift
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 text-xs">
                  <span className="text-brand-red font-black text-[9px] tracking-wider pt-0.5 shrink-0">06:00</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                    <p className="text-gray-600 truncate">Shift handover received from Night Eng. R. Yamada</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-xs">
                  <span className="text-brand-red font-black text-[9px] tracking-wider pt-0.5 shrink-0">06:15</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                    <p className="text-gray-600 truncate">Motion platform pre-flight check — PASSED (all 6 axes nominal)</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-xs">
                  <span className="text-brand-red font-black text-[9px] tracking-wider pt-0.5 shrink-0">07:30</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                    <p className="text-gray-600 truncate">Visual system calibration completed — 3-channel alignment verified</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-xs">
                  <span className="text-brand-red font-black text-[9px] tracking-wider pt-0.5 shrink-0">09:12</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                    <p className="text-gray-600 truncate">FMS / Avionics Bus — B737 FMC comms fault detected. Investigating.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-xs">
                  <span className="text-brand-red font-black text-[9px] tracking-wider pt-0.5 shrink-0">09:45</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                    <p className="text-gray-600 truncate">CH-2 VHF dropout logged. Intermittent — monitoring.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-xs">
                  <span className="text-brand-red font-black text-[9px] tracking-wider pt-0.5 shrink-0">11:00</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                    <p className="text-gray-600 truncate">Instructor briefing support — SIM-01 session Type Rating (Capt. Holt)</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-xs">
                  <span className="text-brand-red font-black text-[9px] tracking-wider pt-0.5 shrink-0">12:30</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                    <p className="text-gray-600 truncate">Hydraulic system pressure check — 3000 psi nominal</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-150 pt-4 flex justify-between items-center">
                <button className="text-brand-red hover:underline text-xs font-black uppercase tracking-wider">
                  Export Full Shift Report (PDF)
                </button>
              </div>
            </div>
          </div>

          <div className="w-2/5 h-full border-l border-gray-200 p-6 overflow-y-auto space-y-6">
            <div className="border border-gray-150 rounded p-6 bg-white shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-brand-red uppercase tracking-wider">Hardware Health Monitor</span>
                  <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider mt-0.5">Hardware Status</h3>
                </div>
                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase border ${
                  currentStatus === 'Ready'
                    ? 'bg-green-50 text-green-700 border-green-500'
                    : currentStatus === 'MEL'
                      ? 'bg-orange-50 text-orange-600 border-orange-400'
                      : 'bg-red-50 text-brand-red border-brand-red'
                }`}>{currentStatus}</span>
              </div>

              <div className="space-y-1">
                <h4 className="text-xs font-black text-gray-900">Target Machine: {currentSimulator?.name ?? 'N/A'}</h4>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{currentSimulator ? `${currentSimulator.typeRating} • STATUS: ${currentStatus}` : 'No simulator selected'}</p>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                  <span className="font-bold text-gray-800">Motion Platform</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-green-600 font-black">99.2%</span>
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                  <span className="font-bold text-gray-800">Visual System</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-green-600 font-black">120 Hz</span>
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                  <span className="font-bold text-gray-800">Image Generators</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-green-600 font-black">74 °C</span>
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                  <span className="font-bold text-gray-800">Comms / Audio</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-orange-500 font-black">DEGRADED</span>
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                  <span className="font-bold text-gray-800">Hydraulic Power</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-green-600 font-black">3000 psi</span>
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                  <span className="font-bold text-gray-800">Thermal / HVAC</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-green-600 font-black">21.4 °C</span>
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                  <span className="font-bold text-gray-800">Data Recorder</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-green-600 font-black">2.1 TB</span>
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                  <span className="font-bold text-gray-855">FMS / Avionics Bus</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-brand-red font-black">ERR</span>
                    <span className="w-2 h-2 rounded-full bg-brand-red" />
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => setShowAogModal(true)}
                  className="w-full py-3 bg-brand-red hover:bg-red-700 text-white font-black text-xs uppercase tracking-widest rounded transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-red cursor-pointer"
                >
                  Report Hardware Breakdown (AOG)
                </button>
                <button
                  onClick={() => {
                    setResolveError(null);
                    setShowResolveModal(true);
                  }}
                  disabled={!activeDefectSimulator}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase tracking-widest rounded transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-green-600 cursor-pointer disabled:opacity-50"
                >
                  Resolve Defect
                </button>
                <button
                  onClick={handleSignOff}
                  disabled={maintSignedOff}
                  className="w-full py-3 bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 font-black text-xs uppercase tracking-widest rounded transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 cursor-pointer disabled:opacity-50"
                >
                  {maintSignedOff ? 'Maintenance Signed Off' : 'Sign-off Daily Maintenance'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {showAogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded border border-gray-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-red-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-red flex items-center justify-center text-white shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-black uppercase text-gray-955 leading-none tracking-wider">
                    Aircraft On Ground — AOG Report
                  </h2>
                  <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 tracking-wide">
                    {currentSimulator ? currentSimulator.name : 'Simulator'} · {currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAogModal(false);
                  setAffectedSystem('');
                  setFailureDescription('');
                }}
                className="text-gray-400 hover:text-brand-red transition-colors shrink-0"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleAogSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-[9px] font-black text-gray-500 uppercase tracking-wider mb-2">
                  Affected System
                </label>
                <select
                  required
                  value={affectedSystem}
                  onChange={(e) => setAffectedSystem(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded text-xs font-bold text-gray-905 bg-white focus:outline-none focus:ring-1 focus:ring-brand-red focus:border-brand-red"
                >
                  <option value="">Select system...</option>
                  <option value="Motion System">Motion System</option>
                  <option value="Visual System">Visual System</option>
                  <option value="Flight Controls">Flight Controls</option>
                  <option value="Avionics & Instruments">Avionics & Instruments</option>
                  <option value="Host Computer">Host Computer</option>
                  <option value="Host Computer">Host Computer</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-black text-gray-500 uppercase tracking-wider mb-2">
                  Severity Classification
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSeverity('AOG')}
                    className={`p-3 border rounded text-left transition-all relative ${
                      severity === 'AOG'
                        ? 'border-brand-red bg-red-50 text-brand-red shadow-sm'
                        : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-[10px] font-black uppercase tracking-wider block">AOG</span>
                    <span className="text-[8px] font-bold text-gray-400 block mt-0.5 leading-none">Grounded</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSeverity('MEL')}
                    className={`p-3 border rounded text-left transition-all relative ${
                      severity === 'MEL'
                        ? 'border-orange-500 bg-orange-50 text-orange-500 shadow-sm'
                        : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-[10px] font-black uppercase tracking-wider block">MEL</span>
                    <span className="text-[8px] font-bold text-gray-400 block mt-0.5 leading-none">Dispatch with limits</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSeverity('Defect')}
                    className={`p-3 border rounded text-left transition-all relative ${
                      severity === 'Defect'
                        ? 'border-yellow-500 bg-yellow-50 text-yellow-600 shadow-sm'
                        : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-[10px] font-black uppercase tracking-wider block">Defect</span>
                    <span className="text-[8px] font-bold text-gray-400 block mt-0.5 leading-none">Log & monitor</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-black text-gray-500 uppercase tracking-wider mb-2">
                  Fault Description
                </label>
                <textarea
                  required
                  rows={4}
                  value={failureDescription}
                  onChange={(e) => setFailureDescription(e.target.value)}
                  placeholder="Describe the fault in technical detail..."
                  className="w-full p-3 border border-gray-300 rounded text-xs font-bold text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-brand-red focus:border-brand-red resize-none"
                />
              </div>

              {severity === 'AOG' && (
                <div className="p-3 bg-red-50/70 border border-red-100 rounded flex items-start gap-2.5">
                  <svg className="w-4 h-4 text-brand-red mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-[9px] text-brand-red font-bold leading-normal">
                    Submitting this report will immediately ground the selected machine and notify the Shift Supervisor, Safety Officer, and CAA compliance desk.
                  </p>
                </div>
              )}

              <button
                type="submit"
                className={`w-full py-3.5 flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest rounded transition-all focus:outline-none cursor-pointer text-white ${
                  severity === 'AOG'
                    ? 'bg-brand-red hover:bg-red-700 focus:ring-2 focus:ring-brand-red'
                    : severity === 'MEL'
                    ? 'bg-orange-500 hover:bg-orange-600 focus:ring-2 focus:ring-orange-500'
                    : 'bg-yellow-600 hover:bg-yellow-700 focus:ring-2 focus:ring-yellow-600'
                }`}
              >
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Submit {severity} Report</span>
              </button>
            </form>
          </div>
        </div>
      )}

      <ResolveDefectModal
        isOpen={showResolveModal}
        simulatorName={activeDefectSimulator?.name ?? 'No Active Defect'}
        resolutionDetails={resolutionDetails}
        onResolutionDetailsChange={setResolutionDetails}
        onClose={() => {
          setShowResolveModal(false);
          setResolveError(null);
          setResolutionDetails('');
        }}
        onSubmit={handleResolveDefect}
        isSubmitting={isResolving}
        errorMessage={resolveError}
      />

      {showSuccessToast && (
        <div className="fixed bottom-5 right-5 z-55 bg-green-50 border border-green-500 text-green-800 text-xs font-bold rounded p-3 shadow-md flex items-center gap-2 animate-in slide-in-from-bottom-5">
          <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{activeFault ? 'AOG breakdown report broadcasted.' : 'Defect resolved. Simulator status set to READY.'}</span>
        </div>
      )}
    </div>
  );
}