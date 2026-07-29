'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  getSimulators,
  setSimulatorStatus,
  submitMaintenanceChecklist,
  getEngineers,
  getSessions,
  resolveDefect,
  checkoutEngineerShift,
  getDefectReports,
  resolveDefectReport,
  DefectReport,
  Simulator,
  Engineer,
  SimulatorSession
} from '@/services/api';
import { getHubConnection, startConnection } from '@/services/signalr';
import ResolveDefectModal from '@/components/engineer/ResolveDefectModal';

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

const modalBackdrop: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } }
};

const modalContent: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } },
  exit: { opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.15 } }
};

const slideInTop: Variants = {
  hidden: { opacity: 0, y: -20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.15 } }
};

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

const defectSeverityBadgeClass = (severity: DefectReport['severity']) => {
  if (severity === 'AOG') return 'bg-red-100 text-brand-red border-red-300';
  if (severity === 'MEL') return 'bg-orange-100 text-orange-800 border-orange-300';
  return 'bg-yellow-100 text-yellow-800 border-yellow-300';
};

const formatDowntimeDuration = (reportedAt?: string, resolvedAt?: string | null) => {
  const start = toLocalDate(reportedAt);
  const end = toLocalDate(resolvedAt ?? undefined);
  if (!start || !end) return null;
  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) return null;
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

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
  const [activeFault, setActiveFault] = useState(false);

  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  const [showAogModal, setShowAogModal] = useState(false);
  const [showMaintModal, setShowMaintModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [affectedSystem, setAffectedSystem] = useState('');
  const [failureDescription, setFailureDescription] = useState('');
  const [maintTargetSimId, setMaintTargetSimId] = useState('');
  const [maintIsCleared, setMaintIsCleared] = useState(true);
  const [maintNotes, setMaintNotes] = useState('');
  const [maintPending, setMaintPending] = useState(false);
  const [maintError, setMaintError] = useState<string | null>(null);
  const [resolutionDetails, setResolutionDetails] = useState('');
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [severity, setSeverity] = useState('AOG');
  const [checkoutTime, setCheckoutTime] = useState<string | null>(null);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const [defects, setDefects] = useState<DefectReport[]>([]);
  const [selectedDefectToResolve, setSelectedDefectToResolve] = useState<DefectReport | null>(null);

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

      const handleDefectReported = (payload: DefectReport) => {
        setDefects((prev) => [payload, ...prev.filter((d) => d.defectId !== payload.defectId)]);
        loadData();
      };

      const handleDefectResolved = (payload: { defectId: string; simulatorId: string; resolvedAt?: string }) => {
        setDefects((prev) =>
          prev.map((d) =>
            d.defectId === payload.defectId
              ? { ...d, status: 'Resolved', resolvedAt: payload.resolvedAt ?? new Date().toISOString() }
              : d
          )
        );
        loadData();
      };

      hub.on('AogReported', handleAogReported);
      hub.on('DefectReported', handleDefectReported);
      hub.on('DefectResolved', handleDefectResolved);

      return () => {
        hub.off('AogReported', handleAogReported);
        hub.off('DefectReported', handleDefectReported);
        hub.off('DefectResolved', handleDefectResolved);
      };
    }
  }, [user, authLoading, router, mounted]);

  const loadData = async () => {
    try {
      const [sims, engs, sess, defectReports] = await Promise.all([
        getSimulators(),
        getEngineers(),
        getSessions(),
        getDefectReports(true),
      ]);
      setSimulators(sims);
      setEngineers(engs);
      setSessions(sess);
      setDefects(defectReports);
      setActiveFault(sims.some((sim) => !isReadyStatus(sim.status)) || defectReports.some((d) => d.status !== 'Resolved'));
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
      const targetSimId = currentSimulator?.id ?? '';
      if (!targetSimId) throw new Error('No simulator selected for AOG report');
      const capturedSystem = affectedSystem;
      const capturedDescription = failureDescription;
      await setSimulatorStatus(targetSimId, status, `[${severity}] [${capturedSystem}] ${capturedDescription}`);
      setActiveFault(true);
      setShowAogModal(false);
      setAffectedSystem('');
      setFailureDescription('');
      setShowSuccessToast(true);
      await loadData();
      // Optimistic UI: immediately show the report as a local defect entry.
      // The backend's setSimulatorStatus writes to MaintenanceLogs (not the
      // Defects table), so getDefectReports() never returns it.  We keep the
      // entry in local state until a full page reload.
      setDefects((prev) => [
        {
          defectId: `local-${Date.now()}`,
          simulatorId: targetSimId,
          sessionId: null,
          reportedBy: user!.name,
          systemAffected: capturedSystem,
          severity: status as 'AOG' | 'MEL' | 'Defect',
          instructorNotes: capturedDescription,
          status: 'Open',
          resolutionNotes: null,
          reportedAt: new Date().toISOString(),
          resolvedAt: null,
        },
        ...prev,
      ]);
      setTimeout(() => {
        setShowSuccessToast(false);
      }, 5000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolveDefect = async () => {
    setResolveError(null);
    setIsResolving(true);
    try {
      if (selectedDefectToResolve) {
        await resolveDefectReport(selectedDefectToResolve.defectId, resolutionDetails.trim() || 'Defect resolved by engineer.');
        setSelectedDefectToResolve(null);
      } else {
        const targetSimulator = currentSimulator;
        if (!targetSimulator) {
          setResolveError('No active simulator defect to resolve.');
          return;
        }
        await resolveDefect(targetSimulator.id, resolutionDetails.trim() || 'Defect resolved.');
      }
      setShowResolveModal(false);
      setResolutionDetails('');
      setShowSuccessToast(true);
      await loadData();
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
    const targetSimId = currentSimulator?.id ?? simulators[0]?.id ?? '';
    if (!targetSimId) return;
    setMaintTargetSimId(targetSimId);
    setMaintIsCleared(true);
    setMaintNotes('Pre-flight calibration check passed.');
    setMaintError(null);
    setShowMaintModal(true);
  };

  const handleSubmitMaintenanceSignOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintTargetSimId) {
      setMaintError('No simulator selected for maintenance sign-off.');
      return;
    }

    setMaintPending(true);
    setMaintError(null);
    try {
      const checklistDate = toLocalDateKey(new Date());
      await submitMaintenanceChecklist({
        simulatorId: maintTargetSimId,
        checklistDate,
        isCleared: maintIsCleared,
        notes: maintNotes,
      });

      setSimulators((prev) =>
        prev.map((sim) =>
          sim.id === maintTargetSimId
            ? { ...sim, lastDailySignOffDate: maintIsCleared ? checklistDate : null }
            : sim
        )
      );

      setShowMaintModal(false);
      setMaintNotes('');
      await loadData();
      setShowSuccessToast(true);
      setTimeout(() => {
        setShowSuccessToast(false);
      }, 5000);
    } catch (err) {
      setMaintError('Failed to submit daily readiness checklist.');
    }
    setMaintPending(false);
  };

  if (authLoading || !user || !mounted || loading || !currentTime) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
          className="text-sm font-bold uppercase tracking-widest text-brand-red text-center"
        >
          Loading Engineering Portal...
        </motion.div>
      </div>
    );
  }

  const primaryEngineer =
    engineers.find((e) => e.employeeCode === user.employeeId)
    ?? engineers[0]
    ?? null;

  const assignedSimulator = primaryEngineer
    ? simulators.find((sim) => sim.typeRating === primaryEngineer.assignedSim)
    : null;

  const currentSimulator = assignedSimulator ?? simulators[0] ?? null;
  const todayDateKey = toLocalDateKey(currentTime);
  const currentSimulatorSignOffDate = currentSimulator?.lastDailySignOffDate ?? null;
  const isCurrentSimulatorSignedOffToday = currentSimulatorSignOffDate === todayDateKey;
  const currentStatus = currentSimulator ? normalizeStatusLabel(currentSimulator.status) : 'Ready';
  const faultCount = simulators.filter((s) => {
    const normalized = normalizeStatusLabel(s.status);
    return normalized === 'AOG' || normalized === 'Defect' || normalized === 'MEL';
  }).length;
  const degradedCount = simulators.filter((s) => normalizeStatusLabel(s.status) === 'MEL').length;

  const topBarDateLabel = currentTime.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const defectHistory = [...defects].sort((a, b) => {
    const aTime = toLocalDate(a.reportedAt)?.getTime() ?? 0;
    const bTime = toLocalDate(b.reportedAt)?.getTime() ?? 0;
    return bTime - aTime;
  });

  const hardwareComponents = [
    { label: 'Motion Platform', value: '99.2%', statusClass: 'text-green-600', dotClass: 'bg-green-500' },
    { label: 'Visual System', value: '120 Hz', statusClass: 'text-green-600', dotClass: 'bg-green-500' },
    { label: 'Image Generators', value: '74 °C', statusClass: 'text-green-600', dotClass: 'bg-green-500' },
    { label: 'Comms / Audio', value: 'DEGRADED', statusClass: 'text-orange-500', dotClass: 'bg-orange-500' },
    { label: 'Hydraulic Power', value: '3000 psi', statusClass: 'text-green-600', dotClass: 'bg-green-500' },
    { label: 'Thermal / HVAC', value: '21.4 °C', statusClass: 'text-green-600', dotClass: 'bg-green-500' },
    { label: 'Data Recorder', value: '2.1 TB', statusClass: 'text-green-600', dotClass: 'bg-green-500' },
    { label: 'FMS / Avionics Bus', value: 'ERR', statusClass: 'text-brand-red', dotClass: 'bg-brand-red' }
  ];

  return (
    <div className="h-screen w-full flex flex-col md:flex-row bg-white text-gray-900 overflow-hidden font-sans">
      <aside className="w-full md:w-64 lg:w-72 border-b md:border-b-0 md:border-r border-gray-200 bg-white flex flex-col justify-between p-4 shrink-0 shadow-[10px_0_15px_-3px_rgba(0,0,0,0.02)] z-10 overflow-y-auto">
        <div className="space-y-4 md:space-y-6">
          <div className="flex items-center gap-3">
            <img src="/lion logo.png" alt="Lion Logo" className="w-8 h-8 object-contain shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-black tracking-widest text-gray-950 truncate">LION SIMPLANNER</span>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider truncate">Engineering</span>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="p-3 bg-red-50 border border-brand-red rounded shadow-sm hover:shadow-md transition-shadow"
          >
            <span className="text-[9px] font-black text-brand-red uppercase tracking-wider block">Engineer Portal</span>
            <span className="text-xs font-bold text-gray-900 mt-1 block truncate">{currentSimulator ? `${currentSimulator.name}` : 'No simulator loaded'}</span>
          </motion.div>

          <nav className="space-y-1">
            <button className="w-full flex items-center gap-3 px-3 py-2 text-xs font-black uppercase tracking-wider rounded bg-brand-red text-white transition-all active:scale-95 shadow-sm cursor-pointer">
              Overview
            </button>
          </nav>
        </div>

        <div className="space-y-4 mt-4 md:mt-0">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-red-50 border border-brand-red rounded text-[10px] space-y-1 shadow-sm"
          >
            <div className="font-black text-brand-red uppercase flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-brand-red rounded-full animate-pulse shrink-0" /> Active Alerts
            </div>
            <div className="text-gray-900 font-bold truncate">{faultCount} FAULT — action required</div>
            <div className="text-gray-900 font-bold truncate">{degradedCount} DEGRADED — monitor</div>
          </motion.div>

          <div className="flex items-center justify-between border-t border-gray-150 pt-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-black text-xs text-gray-700 shrink-0 transition-transform hover:scale-110">
                {user.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-gray-950 truncate uppercase leading-none">{user.name}</div>
                <div className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5 truncate">Sim Engineer • Day</div>
              </div>
            </div>
            <button onClick={logout} className="text-gray-400 hover:text-brand-red transition-all cursor-pointer shrink-0 active:scale-90 ml-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
        <header className="min-h-[4rem] border-b border-gray-200 bg-white flex flex-wrap items-center justify-between px-4 sm:px-6 py-2 gap-2 shrink-0 z-30">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <h1 className="text-xs sm:text-sm font-black uppercase text-gray-950 truncate">Maintenance & Shift Overview</h1>
            <AnimatePresence>
              {activeFault && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="bg-red-50 text-brand-red border border-brand-red text-[8px] font-black px-2 py-0.5 rounded uppercase leading-none shrink-0 shadow-sm"
                >
                  {faultCount} Fault Active
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <span className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-wider hidden lg:block truncate max-w-md">
              {topBarDateLabel} • {formatLocalTime(primaryEngineer?.shiftStart)}-{formatLocalTime(primaryEngineer?.shiftEnd)} Local • {user.name}
            </span>
            <button
              onClick={handleCheckout}
              disabled={checkoutPending}
              className="px-2.5 py-1 border border-green-600 text-green-700 text-[9px] font-black uppercase rounded hover:bg-green-50 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow-sm cursor-pointer whitespace-nowrap"
            >
              {checkoutPending ? 'Checking Out...' : 'Checkout Shift'}
            </button>
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-2 sm:px-2.5 py-1 rounded shadow-inner shrink-0">
              <span className="w-1.5 h-1.5 bg-brand-red rounded-full animate-ping shrink-0" />
              <span className="text-[8px] sm:text-[9px] font-black text-gray-900 whitespace-nowrap">{currentTime.toLocaleTimeString('en-GB', { hour12: false })} LOCAL</span>
            </div>
          </div>
        </header>

        <AnimatePresence>
          {(checkoutTime || checkoutError) && (
            <motion.div
              variants={slideInTop}
              initial="hidden"
              animate="show"
              exit="exit"
              className={`mx-4 sm:mx-6 mt-4 p-3 rounded border text-xs font-bold shadow-sm ${checkoutError ? 'bg-red-50 border-red-300 text-brand-red' : 'bg-green-50 border-green-400 text-green-800'}`}
            >
              {checkoutError
                ? checkoutError
                : `Checkout verified at ${formatLocalDateTime(checkoutTime ?? undefined)}`}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto lg:overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:flex-1 lg:min-h-0 lg:overflow-hidden min-w-0">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full lg:w-7/12 xl:w-3/5 h-auto lg:h-full overflow-y-auto p-4 sm:p-6 space-y-6 shrink-0 lg:shrink min-w-0"
          >
            <div className="border border-gray-150 rounded p-4 sm:p-6 bg-white shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between border-b border-gray-100 pb-3 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 bg-brand-red rounded-full animate-pulse shrink-0" />
                  <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider truncate">
                    Defect Triage Board
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <span className="px-2 py-0.5 bg-red-100 border border-red-300 text-brand-red text-[8px] font-black rounded-full whitespace-nowrap">
                    {defects.filter((d) => d.severity === 'AOG' && d.status !== 'Resolved').length} AOG
                  </span>
                  <span className="px-2 py-0.5 bg-orange-100 border border-orange-300 text-orange-800 text-[8px] font-black rounded-full whitespace-nowrap">
                    {defects.filter((d) => d.severity === 'MEL' && d.status !== 'Resolved').length} MEL
                  </span>
                  <span className="px-2 py-0.5 bg-yellow-100 border border-yellow-300 text-yellow-800 text-[8px] font-black rounded-full whitespace-nowrap">
                    {defects.filter((d) => d.severity === 'Defect' && d.status !== 'Resolved').length} Defect
                  </span>
                </div>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <div className="border border-red-300 bg-red-50/50 rounded-lg p-3 sm:p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-brand-red animate-ping shrink-0" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-brand-red truncate">
                        Red Zone — AOG (Grounding Faults)
                      </h4>
                    </div>
                    <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-brand-red text-white rounded shrink-0 whitespace-nowrap">
                      Locks Simulator
                    </span>
                  </div>

                  {defects.filter((d) => d.severity === 'AOG' && d.status !== 'Resolved').length === 0 ? (
                    <div className="p-3 bg-white/80 border border-red-200 rounded text-center text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                      ✓ No active AOG grounding defects reported.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {defects
                        .filter((d) => d.severity === 'AOG' && d.status !== 'Resolved')
                        .map((d, idx) => {
                          const targetSim = simulators.find((s) => s.id === d.simulatorId);
                          return (
                            <motion.div
                              key={d.defectId || idx}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.25, delay: idx * 0.05 }}
                              className="p-3 bg-white border border-red-300 rounded shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                            >
                              <div className="space-y-1 flex-1 min-w-0 w-full">
                                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                  <span className="text-xs font-black text-gray-900 truncate max-w-full">
                                    {targetSim ? targetSim.name : 'Simulator'} — {d.systemAffected}
                                  </span>
                                  <span className="px-1.5 py-0.5 bg-red-100 text-brand-red border border-red-300 text-[7.5px] font-black rounded uppercase whitespace-nowrap">
                                    🔒 AOG LOCKED
                                  </span>
                                </div>
                                <p className="text-[10px] text-gray-700 font-bold leading-snug break-words">
                                  "{d.instructorNotes}"
                                </p>
                                <div className="text-[8px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5 flex-wrap">
                                  <span className="truncate">Reported by {d.reportedBy}</span>
                                  <span>·</span>
                                  <span className="whitespace-nowrap">{formatLocalDateTime(d.reportedAt)}</span>
                                  {d.sessionId && (
                                    <>
                                      <span>·</span>
                                      <span className="truncate">Session {d.sessionId.substring(0, 8)}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  setSelectedDefectToResolve(d);
                                  setResolutionDetails('');
                                  setResolveError(null);
                                  setShowResolveModal(true);
                                }}
                                className="w-full sm:w-auto px-3 py-1.5 bg-green-600 hover:bg-green-700 active:scale-95 text-white font-black text-[9px] uppercase tracking-wider rounded transition-all cursor-pointer shrink-0 shadow-sm text-center whitespace-nowrap"
                              >
                                Resolve & Clear
                              </button>
                            </motion.div>
                          );
                        })}
                    </div>
                  )}
                </div>

                <div className="border border-orange-300 bg-orange-50/50 rounded-lg p-3 sm:p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-orange-950 truncate">
                        Orange Zone — MEL (Degraded System Limits)
                      </h4>
                    </div>
                    <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-orange-500 text-white rounded shrink-0 whitespace-nowrap">
                      Operates with Limits
                    </span>
                  </div>

                  {defects.filter((d) => d.severity === 'MEL' && d.status !== 'Resolved').length === 0 ? (
                    <div className="p-3 bg-white/80 border border-orange-200 rounded text-center text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                      ✓ No open MEL restrictions logged.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {defects
                        .filter((d) => d.severity === 'MEL' && d.status !== 'Resolved')
                        .map((d, idx) => {
                          const targetSim = simulators.find((s) => s.id === d.simulatorId);
                          return (
                            <motion.div
                              key={d.defectId || idx}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.25, delay: idx * 0.05 }}
                              className="p-3 bg-white border border-orange-300 rounded shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                            >
                              <div className="space-y-1 flex-1 min-w-0 w-full">
                                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                  <span className="text-xs font-black text-gray-900 truncate max-w-full">
                                    {targetSim ? targetSim.name : 'Simulator'} — {d.systemAffected}
                                  </span>
                                  <span className="px-1.5 py-0.5 bg-orange-100 text-orange-800 border border-orange-300 text-[7.5px] font-black rounded uppercase whitespace-nowrap">
                                    MEL DISPATCH
                                  </span>
                                </div>
                                <p className="text-[10px] text-gray-700 font-bold leading-snug break-words">
                                  "{d.instructorNotes}"
                                </p>
                                <div className="text-[8px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5 flex-wrap">
                                  <span className="truncate">Reported by {d.reportedBy}</span>
                                  <span>·</span>
                                  <span className="whitespace-nowrap">{formatLocalDateTime(d.reportedAt)}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  setSelectedDefectToResolve(d);
                                  setResolutionDetails('');
                                  setResolveError(null);
                                  setShowResolveModal(true);
                                }}
                                className="w-full sm:w-auto px-3 py-1.5 bg-green-600 hover:bg-green-700 active:scale-95 text-white font-black text-[9px] uppercase tracking-wider rounded transition-all cursor-pointer shrink-0 shadow-sm text-center whitespace-nowrap"
                              >
                                Resolve & Clear
                              </button>
                            </motion.div>
                          );
                        })}
                    </div>
                  )}
                </div>

                <div className="border border-yellow-300 bg-yellow-50/50 rounded-lg p-3 sm:p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-yellow-950 truncate">
                        Yellow Zone — Defect (Minor Log & Monitor)
                      </h4>
                    </div>
                    <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-yellow-600 text-white rounded shrink-0 whitespace-nowrap">
                      Monitoring
                    </span>
                  </div>

                  {defects.filter((d) => d.severity === 'Defect' && d.status !== 'Resolved').length === 0 ? (
                    <div className="p-3 bg-white/80 border border-yellow-200 rounded text-center text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                      ✓ No minor defects logged.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {defects
                        .filter((d) => d.severity === 'Defect' && d.status !== 'Resolved')
                        .map((d, idx) => {
                          const targetSim = simulators.find((s) => s.id === d.simulatorId);
                          return (
                            <motion.div
                              key={d.defectId || idx}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.25, delay: idx * 0.05 }}
                              className="p-3 bg-white border border-yellow-300 rounded shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                            >
                              <div className="space-y-1 flex-1 min-w-0 w-full">
                                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                  <span className="text-xs font-black text-gray-900 truncate max-w-full">
                                    {targetSim ? targetSim.name : 'Simulator'} — {d.systemAffected}
                                  </span>
                                  <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 border border-yellow-300 text-[7.5px] font-black rounded uppercase whitespace-nowrap">
                                    LOGGED
                                  </span>
                                </div>
                                <p className="text-[10px] text-gray-700 font-bold leading-snug break-words">
                                  "{d.instructorNotes}"
                                </p>
                                <div className="text-[8px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5 flex-wrap">
                                  <span className="truncate">Reported by {d.reportedBy}</span>
                                  <span>·</span>
                                  <span className="whitespace-nowrap">{formatLocalDateTime(d.reportedAt)}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  setSelectedDefectToResolve(d);
                                  setResolutionDetails('');
                                  setResolveError(null);
                                  setShowResolveModal(true);
                                }}
                                className="w-full sm:w-auto px-3 py-1.5 bg-green-600 hover:bg-green-700 active:scale-95 text-white font-black text-[9px] uppercase tracking-wider rounded transition-all cursor-pointer shrink-0 shadow-sm text-center whitespace-nowrap"
                              >
                                Resolve & Clear
                              </button>
                            </motion.div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full lg:w-5/12 xl:w-2/5 h-auto lg:h-full border-t lg:border-t-0 lg:border-l border-gray-200 p-4 sm:p-6 overflow-y-auto space-y-6 bg-gray-50/30 shrink-0 lg:shrink min-w-0"
          >
            <div className="border border-gray-150 rounded p-4 sm:p-6 bg-white shadow-sm hover:shadow-md transition-shadow space-y-6">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 min-w-0 gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="text-[8px] font-black text-brand-red uppercase tracking-wider truncate">Hardware Health Monitor</span>
                  <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider mt-0.5 truncate">Hardware Status</h3>
                </div>
                <span className={`text-[8px] shrink-0 font-black px-1.5 py-0.5 rounded uppercase border transition-colors whitespace-nowrap ${currentStatus === 'Ready'
                  ? 'bg-green-50 text-green-700 border-green-500'
                  : currentStatus === 'MEL'
                    ? 'bg-orange-50 text-orange-700 border-orange-400'
                    : 'bg-red-50 text-brand-red border-brand-red'
                  }`}>{currentStatus}</span>
              </div>

              <div className="space-y-1 min-w-0">
                <h4 className="text-xs font-black text-gray-900 truncate">Target Machine: {currentSimulator?.name ?? 'N/A'}</h4>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider truncate">{currentSimulator ? `${currentSimulator.typeRating} • STATUS: ${currentStatus}` : 'No simulator selected'}</p>
                <div className={`mt-2 inline-flex items-center gap-2 px-2 py-1 rounded border text-[8px] font-black uppercase tracking-wider transition-colors max-w-full ${isCurrentSimulatorSignedOffToday ? 'bg-green-50 text-green-700 border-green-400 shadow-sm' : 'bg-orange-50 text-orange-700 border-orange-300'}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isCurrentSimulatorSignedOffToday ? 'bg-green-500' : 'bg-orange-500 animate-pulse'}`} />
                  <span className="truncate">{isCurrentSimulatorSignedOffToday ? 'Daily Sign-Off Cleared' : 'Daily Sign-Off Pending'}</span>
                </div>
              </div>

              <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-2.5">
                {hardwareComponents.map((comp, idx) => (
                  <motion.div variants={listItem} key={idx} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 px-1 rounded hover:bg-gray-50 transition-colors gap-2 min-w-0">
                    <span className="font-bold text-gray-800 truncate">{comp.label}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`${comp.statusClass} font-black whitespace-nowrap`}>{comp.value}</span>
                      <span className={`w-2 h-2 rounded-full ${comp.dotClass} shrink-0`} />
                    </div>
                  </motion.div>
                ))}
              </motion.div>

              <div className="space-y-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => setShowAogModal(true)}
                  className="w-full py-3 bg-brand-red hover:bg-red-700 text-white font-black text-xs uppercase tracking-widest rounded transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-red cursor-pointer active:scale-[0.98] text-center whitespace-nowrap px-2 truncate"
                >
                  Report Hardware Breakdown (AOG)
                </button>
                <button
                  onClick={() => {
                    setResolveError(null);
                    setShowResolveModal(true);
                  }}
                  disabled={!currentSimulator || isReadyStatus(currentSimulator.status)}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase tracking-widest rounded transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-green-600 cursor-pointer disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] text-center whitespace-nowrap px-2 truncate"
                >
                  Resolve Defect
                </button>
                <button
                  onClick={handleSignOff}
                  disabled={maintPending}
                  className="w-full py-3 bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 font-black text-xs uppercase tracking-widest rounded transition-all focus:outline-none focus:ring-2 focus:ring-gray-300 cursor-pointer disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] text-center whitespace-nowrap px-2 truncate"
                >
                  {maintPending ? 'Submitting Checklist...' : 'Sign-off Daily Maintenance'}
                </button>
              </div>
            </div>
          </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="shrink-0 border-t border-gray-200 p-4 sm:p-6 bg-gray-50/30"
          >
            <div className="border border-gray-150 rounded p-4 sm:p-6 bg-white shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between border-b border-gray-100 pb-3 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 bg-gray-400 rounded-full shrink-0" />
                  <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider truncate">
                    Historical Defect & Resolution Log
                  </h3>
                </div>
                <span className="px-2 py-0.5 bg-gray-100 border border-gray-300 text-gray-600 text-[8px] font-black rounded-full whitespace-nowrap shrink-0">
                  {defectHistory.length} Records
                </span>
              </div>

              {defectHistory.length === 0 ? (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded text-center text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                  No defect history recorded.
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto border border-gray-100 rounded">
                  <div className="hidden md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,1.5fr)] gap-3 px-3 py-2 border-b border-gray-100 bg-gray-50/80 sticky top-0 z-10 text-[8px] font-black uppercase tracking-wider text-gray-400">
                    <span className="truncate">Simulator</span>
                    <span className="truncate">System & Severity</span>
                    <span className="truncate">Reported</span>
                    <span className="truncate">Resolved</span>
                    <span className="truncate">Downtime</span>
                    <span className="truncate">Resolution Notes</span>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {defectHistory.map((d, idx) => {
                      const targetSim = simulators.find((s) => s.id === d.simulatorId);
                      const isResolved = d.status === 'Resolved';
                      const downtime = formatDowntimeDuration(d.reportedAt, d.resolvedAt);
                      const notes = d.resolutionNotes?.trim()
                        ? d.resolutionNotes
                        : isResolved
                          ? 'Marked as resolved.'
                          : '—';
                      return (
                        <motion.div
                          key={d.defectId || idx}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, delay: idx * 0.03 }}
                          className="p-3 flex flex-col gap-2 md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,1.5fr)] md:gap-3 md:items-center hover:bg-gray-50 transition-colors min-w-0"
                        >
                          <div className="min-w-0">
                            <span className="md:hidden block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-0.5">Simulator</span>
                            <span className="text-[11px] font-black text-gray-900 truncate block">
                              {targetSim ? targetSim.name : `SIM ${d.simulatorId.substring(0, 8)}`}
                            </span>
                          </div>

                          <div className="min-w-0">
                            <span className="md:hidden block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-0.5">System & Severity</span>
                            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                              <span className="text-[10px] font-bold text-gray-800 truncate">{d.systemAffected}</span>
                              <span className={`px-1.5 py-0.5 border text-[7.5px] font-black rounded uppercase whitespace-nowrap shrink-0 ${defectSeverityBadgeClass(d.severity)}`}>
                                {d.severity}
                              </span>
                            </div>
                          </div>

                          <div className="min-w-0">
                            <span className="md:hidden block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-0.5">Reported</span>
                            <span className="text-[10px] font-bold text-gray-800 truncate block">{formatLocalDateTime(d.reportedAt)}</span>
                            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider truncate block">by {d.reportedBy}</span>
                          </div>

                          <div className="min-w-0">
                            <span className="md:hidden block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-0.5">Resolved</span>
                            {isResolved && d.resolvedAt ? (
                              <span className="text-[10px] font-bold text-gray-800 truncate block">{formatLocalDateTime(d.resolvedAt)}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 bg-blue-50 border border-blue-300 text-blue-700 text-[7.5px] font-black rounded uppercase whitespace-nowrap">
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shrink-0" />
                                Ongoing
                              </span>
                            )}
                          </div>

                          <div className="min-w-0">
                            <span className="md:hidden block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-0.5">Downtime</span>
                            <span className="text-[10px] font-black text-gray-900 whitespace-nowrap">{downtime ?? '—'}</span>
                          </div>

                          <div className="min-w-0">
                            <span className="md:hidden block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-0.5">Resolution Notes</span>
                            <span className="text-[10px] font-bold text-gray-700 truncate block" title={notes}>
                              {notes}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </main>

      <AnimatePresence>
        {showAogModal && (
          <motion.div
            variants={modalBackdrop}
            initial="hidden"
            animate="show"
            exit="exit"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
          >
            <motion.div
              variants={modalContent}
              className="w-full max-w-md bg-white rounded border border-gray-200 shadow-2xl overflow-hidden my-auto"
            >
              <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between bg-red-50/50 gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-brand-red flex items-center justify-center text-white shrink-0 shadow-sm">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xs sm:text-sm font-black uppercase text-gray-955 leading-none tracking-wider truncate">
                      Aircraft On Ground — AOG Report
                    </h2>
                    <p className="text-[9px] text-gray-500 font-bold uppercase mt-1 tracking-wide truncate">
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
                  className="text-gray-400 hover:text-brand-red transition-colors shrink-0 active:scale-90 p-1"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleAogSubmit} className="p-4 sm:p-5 space-y-4">
                <div>
                  <label className="block text-[9px] font-black text-gray-500 uppercase tracking-wider mb-2">
                    Affected System
                  </label>
                  <select
                    required
                    value={affectedSystem}
                    onChange={(e) => setAffectedSystem(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded text-xs font-bold text-gray-905 bg-white focus:outline-none focus:ring-1 focus:ring-brand-red focus:border-brand-red transition-colors"
                  >
                    <option value="">Select system...</option>
                    <option value="Motion System">Motion System</option>
                    <option value="Visual System">Visual System</option>
                    <option value="Flight Controls">Flight Controls</option>
                    <option value="Avionics & Instruments">Avionics & Instruments</option>
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
                      className={`p-2.5 sm:p-3 border rounded text-left transition-all relative active:scale-95 cursor-pointer ${severity === 'AOG'
                        ? 'border-brand-red bg-red-50 text-brand-red shadow-sm'
                        : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50'
                        }`}
                    >
                      <span className="text-[10px] font-black uppercase tracking-wider block truncate">AOG</span>
                      <span className="text-[8px] font-bold text-gray-400 block mt-0.5 leading-none truncate">Grounded</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSeverity('MEL')}
                      className={`p-2.5 sm:p-3 border rounded text-left transition-all relative active:scale-95 cursor-pointer ${severity === 'MEL'
                        ? 'border-orange-500 bg-orange-50 text-orange-600 shadow-sm'
                        : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50'
                        }`}
                    >
                      <span className="text-[10px] font-black uppercase tracking-wider block truncate">MEL</span>
                      <span className="text-[8px] font-bold text-gray-400 block mt-0.5 leading-none truncate">Limits</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSeverity('Defect')}
                      className={`p-2.5 sm:p-3 border rounded text-left transition-all relative active:scale-95 cursor-pointer ${severity === 'Defect'
                        ? 'border-yellow-500 bg-yellow-50 text-yellow-700 shadow-sm'
                        : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50'
                        }`}
                    >
                      <span className="text-[10px] font-black uppercase tracking-wider block truncate">Defect</span>
                      <span className="text-[8px] font-bold text-gray-400 block mt-0.5 leading-none truncate">Monitor</span>
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
                    className="w-full p-3 border border-gray-300 rounded text-xs font-bold text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-brand-red focus:border-brand-red resize-none transition-colors"
                  />
                </div>

                <AnimatePresence>
                  {severity === 'AOG' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 bg-red-50/70 border border-red-200 rounded flex items-start gap-2.5 mt-2">
                        <svg className="w-4 h-4 text-brand-red mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p className="text-[9px] text-brand-red font-bold leading-normal">
                          Submitting this report will immediately ground the selected machine and notify the Shift Supervisor, Safety Officer, and CAA compliance desk.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  className={`w-full py-3.5 flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest rounded transition-all focus:outline-none cursor-pointer text-white shadow-md active:scale-95 ${severity === 'AOG'
                    ? 'bg-brand-red hover:bg-red-700 focus:ring-2 focus:ring-brand-red'
                    : severity === 'MEL'
                      ? 'bg-orange-500 hover:bg-orange-600 focus:ring-2 focus:ring-orange-500'
                      : 'bg-yellow-600 hover:bg-yellow-700 focus:ring-2 focus:ring-yellow-600'
                    }`}
                >
                  <svg className="w-4 h-4 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="truncate">Submit {severity} Report</span>
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ResolveDefectModal
        isOpen={showResolveModal}
        simulatorName={currentSimulator?.name ?? 'No Simulator Assigned'}
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

      <AnimatePresence>
        {showMaintModal && (
          <motion.div
            variants={modalBackdrop}
            initial="hidden"
            animate="show"
            exit="exit"
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              variants={modalContent}
              className="bg-white border border-gray-100 p-5 sm:p-6 rounded shadow-2xl max-w-md w-full my-auto"
            >
              <h3 className="text-xs sm:text-sm font-black text-gray-900 uppercase tracking-widest mb-4 truncate">
                Maintenance Shield Checklist Sign-Off
              </h3>
              <form onSubmit={handleSubmitMaintenanceSignOff} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Select Simulator
                  </label>
                  <select
                    value={maintTargetSimId}
                    onChange={(e) => setMaintTargetSimId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-xs font-bold bg-white text-gray-900 focus:border-brand-red focus:ring-1 focus:ring-brand-red transition-colors focus:outline-none"
                  >
                    {simulators.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} - {s.typeRating}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="engineer-cleared"
                    checked={maintIsCleared}
                    onChange={(e) => setMaintIsCleared(e.target.checked)}
                    className="w-4 h-4 text-brand-red border-gray-300 rounded focus:ring-brand-red cursor-pointer shrink-0"
                  />
                  <label htmlFor="engineer-cleared" className="text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer select-none truncate">
                    Checklist Cleared (Raise Shield)
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Engineering Notes
                  </label>
                  <textarea
                    required
                    value={maintNotes}
                    onChange={(e) => setMaintNotes(e.target.value)}
                    placeholder="Notes from safety checks and compliance checklist..."
                    className="w-full px-3 py-2 border border-gray-300 rounded text-xs font-bold text-gray-900 bg-white focus:border-brand-red focus:ring-1 focus:ring-brand-red transition-colors focus:outline-none resize-none"
                    rows={3}
                  />
                </div>

                <AnimatePresence>
                  {maintError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border border-red-200 bg-red-50 rounded p-2 text-[10px] text-brand-red font-bold overflow-hidden"
                    >
                      {maintError}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowMaintModal(false)}
                    className="px-4 py-2 border border-gray-200 rounded text-xs font-bold uppercase text-gray-600 hover:bg-gray-50 active:scale-95 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={maintPending}
                    className="px-4 py-2 bg-brand-red hover:bg-red-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50 disabled:pointer-events-none active:scale-95 transition-all shadow-md"
                  >
                    {maintPending ? 'Submitting...' : 'Sign Off Checklist'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-5 right-5 z-55 bg-green-50 border border-green-500 text-green-800 text-xs font-bold rounded p-3 shadow-lg flex items-center gap-2 max-w-sm"
          >
            <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="truncate">{activeFault ? 'AOG breakdown report broadcasted.' : 'Defect resolved. Simulator status set to READY.'}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}