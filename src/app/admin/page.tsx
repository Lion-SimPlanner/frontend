'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  getPilotsPriorityQueue,
  getInstructors,
  getEngineers,
  getSimulators,
  getSessions,
  createSession,
  createExternalPilot,
  publishSession,
  rescheduleSession,
  cancelSession,
  terminateSessionEarly,
  startSession,
  setSimulatorStatus,
  submitMaintenanceChecklist,
  getDefectReports,
  PilotPriority,
  Instructor,
  Engineer,
  Simulator,
  SimulatorSession
} from '@/services/api';
import { getHubConnection, startConnection } from '@/services/signalr';
import TimeDebtQueue from '@/components/admin/TimeDebtQueue';
import GradeSummaryModal from '@/components/shared/GradeSummaryModal';

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

const slideInRight: Variants = {
  hidden: { opacity: 0, x: 20 },
  show: { opacity: 1, x: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } },
  exit: { opacity: 0, x: 20, transition: { duration: 0.15 } }
};

const toLocalDate = (value?: string) => {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
};

const getDurationInHours = (startTime: string, endTime: string) => {
  const start = toLocalDate(startTime);
  const end = toLocalDate(endTime);
  if (!start || !end) return 0.5;
  return Math.max(0.5, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
};

const formatLocalTimestamp = (value?: string) => {
  if (!value) return 'N/A';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'N/A';
  return dt.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const isTypeCompatible = (simType?: string, list?: string[]) => {
  if (!simType || !list || list.length === 0) return false;
  const cleanSim = simType.toUpperCase().replace(/\s+/g, '');
  return list.some(item => {
    const cleanItem = item.toUpperCase().replace(/\s+/g, '');
    return cleanSim.includes(cleanItem) || cleanItem.includes(cleanSim) || cleanSim.split('-')[0] === cleanItem.split('-')[0];
  });
};

const startOfLocalDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

const addLocalDays = (value: Date, days: number) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);

const getStartOfLocalWeek = (value: Date) => {
  const dt = startOfLocalDay(value);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return dt;
};

const toLocalDateKey = (value: Date) => {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const localDateFromKeyAndTime = (dateKey: string, hour: number, minute: number) => {
  const [year, month, day] = dateKey.split('-').map((segment) => parseInt(segment, 10));
  return new Date(year, month - 1, day, hour, minute, 0, 0);
};

const getEndFromStartAndDuration = (hour: string, minute: string, duration: number) => {
  const startDecimal = parseInt(hour, 10) + parseInt(minute, 10) / 60;
  const endDecimal = startDecimal + duration;

  let endHourNum = Math.floor(endDecimal);
  let endMinNum = Math.round((endDecimal - endHourNum) * 60);

  if (endHourNum >= 24) {
    endHourNum = 23;
    endMinNum = 59;
  }

  return {
    endHour: endHourNum.toString().padStart(2, '0'),
    endMinute: endMinNum.toString().padStart(2, '0'),
  };
};

const formatCalendarRange = (startDate: Date, days: number) => {
  const endDate = addLocalDays(startDate, days - 1);
  const sameMonth = startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear();

  if (sameMonth) {
    return `${startDate.toLocaleDateString('en-GB', { month: 'long' })} ${startDate.getDate()} - ${endDate.getDate()}, ${startDate.getFullYear()}`;
  }

  return `${startDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })} - ${endDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}`;
};

const getFtlState = (lastDutyEndTime: string | undefined, referenceUtcIso: string, minRestHours: number = 10) => {
  const lastDuty = toLocalDate(lastDutyEndTime);
  const reference = toLocalDate(referenceUtcIso);
  if (!lastDuty || !reference) {
    return { isClear: true, availableFrom: null as string | null };
  }

  const availableAt = new Date(lastDuty.getTime() + minRestHours * 60 * 60 * 1000);
  return {
    isClear: availableAt.getTime() <= reference.getTime(),
    availableFrom: availableAt.toISOString(),
  };
};

const getSimulatorStatusTone = (status?: string) => {
  const normalized = (status ?? '').trim().toLowerCase();

  if (normalized === 'up' || normalized === 'operational' || normalized === 'ready') {
    return {
      dot: 'bg-green-500',
      badge: 'bg-green-50 text-green-700 border-green-400',
      label: 'Operational',
    };
  }

  if (normalized === 'fault' || normalized === 'mel' || normalized === 'degraded' || normalized === 'defect') {
    return {
      dot: 'bg-orange-500',
      badge: 'bg-orange-50 text-orange-700 border-orange-400',
      label: 'Degraded',
    };
  }

  if (normalized === 'down' || normalized === 'aog') {
    return {
      dot: 'bg-brand-red',
      badge: 'bg-red-50 text-brand-red border-brand-red',
      label: 'Down',
    };
  }

  return {
    dot: 'bg-green-500',
    badge: 'bg-green-50 text-green-700 border-green-400',
    label: status?.trim() || 'Operational',
  };
};

const buildHardwareComponents = (status: string) => {
  const tone = getSimulatorStatusTone(status);
  const isDown = tone.label === 'Down';
  const isDegraded = tone.label === 'Degraded';

  return [
    { label: 'Motion Platform', value: isDown ? 'OFFLINE' : isDegraded ? 'LIMITED' : 'NOMINAL', state: isDown ? 'err' as const : isDegraded ? 'warn' as const : 'ok' as const },
    { label: 'Visual System', value: isDown ? 'OFFLINE' : isDegraded ? 'STABLE' : 'NOMINAL', state: isDown ? 'err' as const : isDegraded ? 'warn' as const : 'ok' as const },
    { label: 'Image Generators', value: isDown ? 'OFFLINE' : isDegraded ? 'MONITOR' : 'NOMINAL', state: isDown ? 'err' as const : isDegraded ? 'warn' as const : 'ok' as const },
    { label: 'Comms / Audio', value: isDown ? 'OFFLINE' : isDegraded ? 'DEGRADED' : 'NOMINAL', state: isDown ? 'err' as const : isDegraded ? 'warn' as const : 'ok' as const },
    { label: 'Hydraulic Power', value: isDown ? '0 psi' : isDegraded ? '2900 psi' : '3000 psi', state: isDown ? 'err' as const : isDegraded ? 'warn' as const : 'ok' as const },
    { label: 'Thermal / HVAC', value: isDown ? 'N/A' : isDegraded ? '23.8 °C' : '21.8 °C', state: isDown ? 'warn' as const : isDegraded ? 'warn' as const : 'ok' as const },
    { label: 'Data Recorder', value: isDown ? '3.0 TB' : isDegraded ? '2.4 TB' : '2.8 TB', state: 'ok' as const },
    { label: 'FMS / Avionics Bus', value: isDown ? 'OFFLINE' : isDegraded ? 'CHECK' : 'NOMINAL', state: isDown ? 'err' as const : isDegraded ? 'warn' as const : 'ok' as const },
  ];
};

export default function AdminPage() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [pilots, setPilots] = useState<PilotPriority[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [simulators, setSimulators] = useState<Simulator[]>([]);
  const [sessions, setSessions] = useState<SimulatorSession[]>([]);

  const [pilotSearch, setPilotSearch] = useState('');
  const [selectedRatingFilter, setSelectedRatingFilter] = useState<string>('ALL');

  const [selectedSlot, setSelectedSlot] = useState<{ dayKey: string; hour: number } | null>(null);
  const [viewedSession, setViewedSession] = useState<SimulatorSession | null>(null);
  const [isRescheduleMode, setIsRescheduleMode] = useState(false);
  const [editDateKey, setEditDateKey] = useState<string>('');
  const [editStartHour, setEditStartHour] = useState('08');
  const [editStartMin, setEditStartMin] = useState('00');
  const [editDuration, setEditDuration] = useState<number>(4);
  const [editEndHour, setEditEndHour] = useState('12');
  const [editEndMin, setEditEndMin] = useState('00');
  const [rescheduleViolations, setRescheduleViolations] = useState<string[]>([]);

  const [calendarStartDate, setCalendarStartDate] = useState<Date>(() => getStartOfLocalWeek(new Date()));
  const [sessionDateKey, setSessionDateKey] = useState<string>(() => toLocalDateKey(startOfLocalDay(new Date())));
  const [sessionStartHour, setSessionStartHour] = useState<string>('08');
  const [sessionStartMin, setSessionStartMin] = useState<string>('00');
  const [sessionEndHour, setSessionEndHour] = useState<string>('12');
  const [sessionEndMin, setSessionEndMin] = useState<string>('00');
  const [sessionDuration, setSessionDuration] = useState<number>(4);

  const [selectedSimId, setSelectedSimId] = useState('');
  const [selectedSessionType, setSelectedSessionType] = useState('InitialTypeRating');

  const [assignedTrainee, setAssignedTrainee] = useState<PilotPriority | null>(null);
  const [assignedTraineeRole, setAssignedTraineeRole] = useState<'Captain' | 'First Officer'>('Captain');
  const [assignedInstructor, setAssignedInstructor] = useState<Instructor | null>(null);

  const [validationViolations, setValidationViolations] = useState<string[]>([]);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);

  const [aogSimId, setAogSimId] = useState('');
  const [aogFault, setAogFault] = useState('');
  const [showAogModal, setShowAogModal] = useState(false);

  const [showMaintModal, setShowMaintModal] = useState(false);
  const [maintSimId, setMaintSimId] = useState('');
  const [maintIsCleared, setMaintIsCleared] = useState(true);
  const [maintNotes, setMaintNotes] = useState('');

  const [showExternalUserModal, setShowExternalUserModal] = useState(false);
  const [externalFullName, setExternalFullName] = useState('');
  const [externalEmail, setExternalEmail] = useState('');
  const [externalContactNumber, setExternalContactNumber] = useState('');
  const [externalCompanyName, setExternalCompanyName] = useState('');
  const [externalUserError, setExternalUserError] = useState<string | null>(null);

  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [lockedSimIds, setLockedSimIds] = useState<Set<string>>(new Set());
  const [terminateSessionTarget, setTerminateSessionTarget] = useState<SimulatorSession | null>(null);
  const [terminateReason, setTerminateReason] = useState('Simulator AOG');
  const [terminateActualEndHour, setTerminateActualEndHour] = useState('10');
  const [terminateActualEndMin, setTerminateActualEndMin] = useState('00');
  const [terminateError, setTerminateError] = useState<string | null>(null);
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [gradeModalSession, setGradeModalSession] = useState<SimulatorSession | null>(null);

  const handleOpenTerminateModal = (session: SimulatorSession) => {
    const now = new Date();
    setTerminateSessionTarget(session);
    setTerminateActualEndHour(now.getHours().toString().padStart(2, '0'));
    setTerminateActualEndMin(now.getMinutes().toString().padStart(2, '0'));
    setTerminateReason('Simulator AOG');
    setTerminateError(null);
    setShowTerminateModal(true);
  };

  const handleConfirmTerminateEarly = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminateSessionTarget) return;

    const start = toLocalDate(terminateSessionTarget.startTime);
    if (!start) return;

    const actualEndDate = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
      parseInt(terminateActualEndHour, 10),
      parseInt(terminateActualEndMin, 10)
    );

    try {
      const updated = await terminateSessionEarly(
        terminateSessionTarget.sessionId,
        actualEndDate.toISOString(),
        terminateReason
      );
      setShowTerminateModal(false);
      setViewedSession(updated);
      await loadData();
    } catch (err: any) {
      setTerminateError(err.response?.data?.message || 'Failed to terminate session early.');
    }
  };

  const handleStartSession = async (session: SimulatorSession) => {
    try {
      const updated = await startSession(session.sessionId);
      setViewedSession(updated);
      await loadData();
      alert(`Session started! Status is now IN PROGRESS.`);
    } catch (err: any) {
      console.error('[Admin] Failed to start session:', err);
      alert(err?.response?.data?.message || err?.response?.data?.error || 'Failed to start session.');
    }
  };

  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Engineers' | 'Instructors'>('Dashboard');
  const [selectedHwSimId, setSelectedHwSimId] = useState<string>('');

  const selectedSim = simulators.find((sim) => sim.id === selectedSimId);
  const selectedSimTypeRating = selectedSim?.typeRating ?? '';

  const filteredPilots = pilots.filter((p) => {
    const matchesSearch =
      p.fullName.toLowerCase().includes(pilotSearch.toLowerCase()) ||
      p.employeeCode.toLowerCase().includes(pilotSearch.toLowerCase());
    const matchesRating =
      selectedRatingFilter === 'ALL' ||
      (p.typeRatings ?? []).some((r) => r.toUpperCase() === selectedRatingFilter.toUpperCase());
    return matchesSearch && matchesRating;
  });

  const eligiblePilots = selectedSimId
    ? filteredPilots.filter(p => isTypeCompatible(selectedSimTypeRating, p.typeRatings))
    : [];

  const eligibleInstructors = selectedSimId
    ? instructors.filter(i => isTypeCompatible(selectedSimTypeRating, i.certifiedTypes ?? i.typeRatings ?? i.ratings))
    : [];

  const handleSimulatorChange = (simId: string) => {
    setSelectedSimId(simId);
    setAssignedTrainee(null);
    setAssignedInstructor(null);
  };

  const selectedHwSim = simulators.find((sim) => sim.id === selectedHwSimId) ?? simulators[0] ?? null;

  useEffect(() => {
    if (!selectedHwSimId && simulators.length > 0) {
      setSelectedHwSimId(simulators[0].id);
    }
  }, [selectedHwSimId, simulators]);

  const mockPilotGrades = [
    { pilot: 'Cpt. Arjun Mehta', empCode: 'LGA-001', rank: 'Captain', date: '2026-07-14', session: 'ILS Approach — CAT II', techSkills: '4', crm: '5', sop: '4', overall: 'Satisfactory', instructor: 'Instr. Sarah Okonkwo', notes: 'Good situational awareness. Minor FMA callout deviation.' },
    { pilot: 'Capt. M. Ellis', empCode: 'LGA-002', rank: 'Captain', date: '2026-07-14', session: 'VNAV Profile Review', techSkills: '5', crm: '5', sop: '5', overall: 'Excellent', instructor: 'Instr. I. Nakamura', notes: 'Excellent cockpit management. Recommend for upgrade.' },
    { pilot: 'F/O S. Chen', empCode: 'LGA-003', rank: 'First Officer', date: '2026-07-15', session: 'Emergency Procedures', techSkills: '3', crm: '3', sop: '4', overall: 'Satisfactory', instructor: 'Instr. Sarah Okonkwo', notes: 'Needs improvement on PAN-PAN comms timing.' },
    { pilot: 'Capt. L. Beaumont', empCode: 'LGA-004', rank: 'Captain', date: '2026-07-15', session: 'Engine Failure Drills', techSkills: '5', crm: '4', sop: '5', overall: 'Excellent', instructor: 'Instr. I. Nakamura', notes: 'Rapid and accurate ECAM actions.' },
    { pilot: 'Capt. S. Okonkwo', empCode: 'LGA-005', rank: 'Captain', date: '2026-07-16', session: 'Crosswind Landings', techSkills: '4', crm: '4', sop: '3', overall: 'Satisfactory', instructor: 'Instr. Sarah Okonkwo', notes: 'SOP callouts slightly rushed during approach phase.' },
    { pilot: 'F/O K. Rashid', empCode: 'LGA-006', rank: 'First Officer', date: '2026-07-16', session: 'Autoland Operations', techSkills: '2', crm: '3', sop: '2', overall: 'Unsatisfactory', instructor: 'Instr. I. Nakamura', notes: 'Failed to monitor ILS deviation correctly. Recheck required.' },
    { pilot: 'Capt. T. Wirawan', empCode: 'LGA-007', rank: 'Captain', date: '2026-07-17', session: 'Visual Approaches', techSkills: '4', crm: '4', sop: '4', overall: 'Satisfactory', instructor: 'Instr. Sarah Okonkwo', notes: 'Consistent energy management. Stable approaches.' },
  ];

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/');
      } else if (user.role !== 'Admin') {
        if (user.role === 'Engineer') {
          router.push('/engineer');
        } else if (user.role === 'Instructor') {
          router.push('/instructor');
        } else if (user.role === 'Pilot') {
          router.push('/pilot');
        } else {
          router.push('/');
        }
      }
    }
  }, [user, authLoading, router]);

  const loadData = async () => {
    try {
      const [pilotsData, instData, engData, simsData, sessData, defectsData] = await Promise.all([
        getPilotsPriorityQueue(),
        getInstructors(),
        getEngineers(),
        getSimulators(),
        getSessions(),
        getDefectReports(),
      ]);

      const locked = new Set<string>();
      defectsData.filter((d) => d.severity === 'AOG' && d.status !== 'Resolved').forEach((d) => locked.add(d.simulatorId));
      simsData.filter((s) => s.status === 'AOG' || s.status === 'Down').forEach((s) => locked.add(s.id));
      setLockedSimIds(locked);

      setPilots(pilotsData);
      setInstructors(instData);
      setEngineers(engData);
      setSimulators(simsData);
      setSessions(sessData);
      setSelectedSimId((prev) => (prev === '' && simsData.length > 0) ? simsData[0].id : prev);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
    setMounted(true);
    startConnection();
    const hub = getHubConnection();

    const handleAogReported = (payload: { simulatorId: string; status: string }) => {
      setSimulators((prev) =>
        prev.map((s) =>
          s.id === payload.simulatorId
            ? { ...s, status: payload.status === 'Down' ? 'Down' : 'Up' }
            : s
        )
      );
      setSessions((prev) =>
        prev.map((s) =>
          s.simulatorId === payload.simulatorId &&
            (s.status === 'Scheduled' || s.status === 'InProgress')
            ? { ...s, status: 'Cancelled' as const }
            : s
        )
      );
    };

    const handleSessionGraded = (payload: { sessionId: string; gradeStatus: string }) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.sessionId === payload.sessionId
            ? { ...s, status: 'Completed' as const, gradeStatus: payload.gradeStatus, isGraded: true }
            : s
        )
      );
    };

    hub.on('AogReported', handleAogReported);
    hub.on('SessionGraded', handleSessionGraded);

    return () => {
      hub.off('AogReported', handleAogReported);
      hub.off('SessionGraded', handleSessionGraded);
    };
  }, []);

  useEffect(() => {
    if (!selectedSlot) return;
    const violations: string[] = [];
    if (!selectedSimId) {
      violations.push('No Simulator selected. Step 1: Select a Simulator first to enable crew assignment.');
    } else {
      if (!assignedTrainee) {
        violations.push(`No Trainee assigned. Select an eligible Trainee qualified for ${selectedSim?.name ?? 'Simulator'} (${selectedSimTypeRating}).`);
      } else if (!isTypeCompatible(selectedSimTypeRating, assignedTrainee.typeRatings)) {
        violations.push(`Certification Mismatch: Trainee ${assignedTrainee.fullName} is not qualified for ${selectedSimTypeRating}.`);
      }

      if (!assignedInstructor) {
        violations.push(`No Instructor assigned. Select an eligible Instructor certified for ${selectedSim?.name ?? 'Simulator'} (${selectedSimTypeRating}).`);
      } else if (!isTypeCompatible(selectedSimTypeRating, assignedInstructor.certifiedTypes ?? assignedInstructor.typeRatings ?? assignedInstructor.ratings)) {
        violations.push(`Certification Mismatch: Instructor ${assignedInstructor.name} is not certified for ${selectedSimTypeRating}.`);
      }
    }
    setValidationViolations(violations);
  }, [assignedTrainee, assignedTraineeRole, assignedInstructor, selectedSimId, selectedSessionType, simulators, selectedSlot, selectedSimTypeRating]);

  const handleCellClick = (dayKey: string, hour: number) => {
    const isOccupied = sessions.some(s => {
      if (s.status === 'Cancelled') return false;
      const start = toLocalDate(s.startTime);
      const end = toLocalDate(s.endTime);
      if (!start || !end) return false;
      const endHour = end.getMinutes() > 0 ? end.getHours() + 1 : end.getHours();
      return toLocalDateKey(start) === dayKey && hour >= start.getHours() && hour < endHour;
    });

    if (isOccupied) return;

    setViewedSession(null);
    setIsRescheduleMode(false);
    setRescheduleViolations([]);
    setSelectedSlot({ dayKey, hour });
    setSessionDateKey(dayKey);
    setSessionStartHour(hour.toString().padStart(2, '0'));
    setSessionStartMin('00');
    setSessionDuration(4);

    const endHourNum = Math.min(23, hour + 4);
    setSessionEndHour(endHourNum.toString().padStart(2, '0'));
    setSessionEndMin('00');

    setSelectedSimId('');
    setAssignedTrainee(null);
    setAssignedTraineeRole('Captain');
    setAssignedInstructor(null);
  };

  const handleDurationChange = (duration: number) => {
    setSessionDuration(duration);
    const end = getEndFromStartAndDuration(sessionStartHour, sessionStartMin, duration);
    setSessionEndHour(end.endHour);
    setSessionEndMin(end.endMinute);
  };

  const handleStartTimeChange = (hour: string, minute: string) => {
    setSessionStartHour(hour);
    setSessionStartMin(minute);

    const end = getEndFromStartAndDuration(hour, minute, sessionDuration);
    setSessionEndHour(end.endHour);
    setSessionEndMin(end.endMinute);
  };

  const handleEditDurationChange = (duration: number) => {
    setEditDuration(duration);
    const end = getEndFromStartAndDuration(editStartHour, editStartMin, duration);
    setEditEndHour(end.endHour);
    setEditEndMin(end.endMinute);
  };

  const handleEditStartTimeChange = (hour: string, minute: string) => {
    setEditStartHour(hour);
    setEditStartMin(minute);
    const end = getEndFromStartAndDuration(hour, minute, editDuration);
    setEditEndHour(end.endHour);
    setEditEndMin(end.endMinute);
  };

  const handleAssignCrew = (p: PilotPriority) => {
    if (!selectedSlot || !selectedSimId) return;
    if (!isTypeCompatible(selectedSimTypeRating, p.typeRatings)) {
      alert(`Cannot assign ${p.fullName}. Trainee is not qualified for ${selectedSimTypeRating}.`);
      return;
    }
    const role: 'Captain' | 'First Officer' = p.rank === 'Captain' ? 'Captain' : 'First Officer';
    setAssignedTrainee(p);
    setAssignedTraineeRole(role);
  };

  const handleAssignInstructor = (i: Instructor) => {
    if (!selectedSlot || !selectedSimId) return;
    if (!isTypeCompatible(selectedSimTypeRating, i.certifiedTypes ?? i.typeRatings ?? i.ratings)) {
      alert(`Cannot assign ${i.name}. Instructor is not certified for ${selectedSimTypeRating}.`);
      return;
    }
    setAssignedInstructor(i);
  };

  const handleAddExternalUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setExternalUserError(null);

    if (!externalFullName.trim()) {
      setExternalUserError('Full name is required.');
      return;
    }

    try {
      const created = await createExternalPilot({
        fullName: externalFullName.trim(),
        email: externalEmail.trim() || undefined,
        contactNumber: externalContactNumber.trim() || undefined,
        companyName: externalCompanyName.trim() || undefined,
      });

      setPilots((prev) => [created, ...prev.filter((p) => p.pilotId !== created.pilotId)]);
      setShowExternalUserModal(false);
      setExternalFullName('');
      setExternalEmail('');
      setExternalContactNumber('');
      setExternalCompanyName('');
    } catch (err: any) {
      if (err.response?.data?.error) {
        setExternalUserError(err.response.data.error);
      } else {
        setExternalUserError('Failed to add external user.');
      }
    }
  };

  const handleStartReschedule = () => {
    if (!viewedSession) return;
    const start = toLocalDate(viewedSession.startTime);
    if (!start) return;
    const duration = getDurationInHours(viewedSession.startTime, viewedSession.endTime);
    const startHour = start.getHours().toString().padStart(2, '0');
    const startMin = start.getMinutes().toString().padStart(2, '0');
    const end = getEndFromStartAndDuration(startHour, startMin, duration);

    setEditDateKey(toLocalDateKey(start));
    setEditStartHour(startHour);
    setEditStartMin(startMin);
    setEditDuration(duration);
    setEditEndHour(end.endHour);
    setEditEndMin(end.endMinute);
    setRescheduleViolations([]);
    setIsRescheduleMode(true);
  };

  const handleSaveReschedule = async () => {
    if (!viewedSession || !editDateKey) return;

    const startTime = localDateFromKeyAndTime(editDateKey, parseInt(editStartHour, 10), parseInt(editStartMin, 10)).toISOString();
    const endTime = localDateFromKeyAndTime(editDateKey, parseInt(editEndHour, 10), parseInt(editEndMin, 10)).toISOString();

    try {
      await rescheduleSession(viewedSession.sessionId, startTime, endTime);
      const updatedSession: SimulatorSession = {
        ...viewedSession,
        startTime,
        endTime,
      };
      setSessions((prev) => prev.map((s) => s.sessionId === viewedSession.sessionId ? updatedSession : s));
      setViewedSession(updatedSession);
      setIsRescheduleMode(false);
      setRescheduleViolations([]);
    } catch (err: any) {
      if (err.response?.data?.violations) {
        setRescheduleViolations(err.response.data.violations);
      } else {
        setRescheduleViolations(['Failed to reschedule session.']);
      }
    }
  };

  const handlePublish = async () => {
    if (!selectedSlot) return;
    if (validationViolations.length > 0) return;

    const preflightErrors: string[] = [];

    if (!selectedSimId) {
      preflightErrors.push('No Simulator selected. Select a valid simulator from the dropdown before publishing.');
    }
    if (!assignedTrainee) {
      preflightErrors.push('No Trainee assigned. Each session requires one Trainee (Captain or First Officer).');
    }
    if (!assignedInstructor) {
      preflightErrors.push('No Instructor assigned. A qualified Instructor is required for regulatory grading.');
    }
    if (preflightErrors.length > 0) {
      setValidationViolations(preflightErrors);
      return;
    }

    const startTime = localDateFromKeyAndTime(
      sessionDateKey,
      parseInt(sessionStartHour, 10),
      parseInt(sessionStartMin, 10)
    ).toISOString();
    const endTime = localDateFromKeyAndTime(
      sessionDateKey,
      parseInt(sessionEndHour, 10),
      parseInt(sessionEndMin, 10)
    ).toISOString();

    const syllabusId = `${selectedSimTypeRating}_${assignedTrainee!.requiredSyllabus || selectedSessionType.replace(/\s+/g, '')}`;

    const payload = {
      simulatorId: selectedSimId,
      sessionType: selectedSessionType,
      startTime,
      endTime,
      traineeId: assignedTrainee?.pilotId ?? undefined,
      traineeRole: assignedTraineeRole,
      instructorId: assignedInstructor?.id ?? undefined,
      engineerId: undefined,
      syllabusId,
      traineeEmployeeCode: assignedTrainee!.employeeCode,
    };

    try {
      const sessResult = await createSession(payload);
      const publishResult = await publishSession(sessResult.sessionId);
      setPublishSuccess(publishResult.message);

      setAssignedTrainee(null);
      setAssignedTraineeRole('Captain');
      setAssignedInstructor(null);
      setSelectedSlot(null);

      await loadData();

      setTimeout(() => {
        setPublishSuccess(null);
      }, 2500);
    } catch (err: any) {
      if (err.response?.data?.violations) {
        setValidationViolations(err.response.data.violations);
      } else if (err.response?.data?.errors) {
        const bindingErrors = Object.entries(
          err.response.data.errors as Record<string, string[]>
        ).flatMap(([field, msgs]) => msgs.map((m: string) => `${field}: ${m}`));
        setValidationViolations(bindingErrors);
      } else {
        setValidationViolations(['Failed to publish session. Verify connection and retry.']);
      }
    }
  };

  const handleCancelSession = async (id: string) => {
    if (confirm('Cancel this simulator session?')) {
      try {
        await cancelSession(id, 'Cancelled via operations panel');
        setViewedSession(null);
        setIsRescheduleMode(false);
        setRescheduleViolations([]);
        await loadData();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleTriggerAog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aogSimId) return;

    try {
      await setSimulatorStatus(aogSimId, 'AOG', aogFault);
      setShowAogModal(false);
      setAogFault('');
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearAog = async (simId: string) => {
    try {
      await setSimulatorStatus(simId, 'Ready');
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmitMaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintSimId) return;

    try {
      await submitMaintenanceChecklist({
        simulatorId: maintSimId,
        checklistDate: new Date().toISOString().split('T')[0],
        isCleared: maintIsCleared,
        notes: maintNotes,
      });
      setShowMaintModal(false);
      setMaintNotes('');
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  if (authLoading || !user || !mounted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
          className="text-sm font-bold uppercase tracking-widest text-brand-red"
        >
          Loading Simulator Operations Interface...
        </motion.div>
      </div>
    );
  }

  const visibleDayCount = 7;
  const visibleDays = Array.from({ length: visibleDayCount }, (_, idx) => addLocalDays(calendarStartDate, idx));
  const calendarRangeLabel = formatCalendarRange(calendarStartDate, visibleDayCount);

  const goToPreviousWindow = () => {
    setCalendarStartDate((prev) => addLocalDays(prev, -visibleDayCount));
    setSelectedSlot(null);
    setViewedSession(null);
    setIsRescheduleMode(false);
    setRescheduleViolations([]);
  };

  const goToNextWindow = () => {
    setCalendarStartDate((prev) => addLocalDays(prev, visibleDayCount));
    setSelectedSlot(null);
    setViewedSession(null);
    setIsRescheduleMode(false);
    setRescheduleViolations([]);
  };

  const goToTodayWindow = () => {
    setCalendarStartDate(getStartOfLocalWeek(new Date()));
    setSelectedSlot(null);
    setViewedSession(null);
    setIsRescheduleMode(false);
    setRescheduleViolations([]);
  };

  const referenceSessionStartIso = selectedSlot
    ? localDateFromKeyAndTime(
      sessionDateKey,
      parseInt(sessionStartHour, 10),
      parseInt(sessionStartMin, 10)
    ).toISOString()
    : new Date().toISOString();

  const nowLocal = new Date();
  const selectedSimulator = simulators.find((sim) => sim.id === selectedSimId) ?? null;
  const selectedSimulatorIsAog = selectedSimulator?.status === 'Down' || selectedSimulator?.status === 'AOG';

  const getEngineerShiftLabel = (shiftStart?: string, shiftEnd?: string) => {
    const start = toLocalDate(shiftStart);
    const end = toLocalDate(shiftEnd);
    if (!start || !end) return 'Shift data unavailable';
    return `${start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })} - ${end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })} LOCAL`;
  };

  const isEngineerOnShiftNow = (shiftStart?: string, shiftEnd?: string) => {
    const start = toLocalDate(shiftStart);
    const end = toLocalDate(shiftEnd);
    if (!start || !end) return false;
    return nowLocal.getTime() >= start.getTime() && nowLocal.getTime() <= end.getTime();
  };

  const hasEngineerCoverage = (dayKey: string, hour: number) => {
    return engineers.some((engineer) => {
      const shiftStart = toLocalDate(engineer.shiftStart);
      const shiftEnd = toLocalDate(engineer.shiftEnd);
      if (!shiftStart || !shiftEnd) return false;
      if (toLocalDateKey(shiftStart) !== dayKey) return false;
      return hour >= shiftStart.getHours() && hour < shiftEnd.getHours();
    });
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white text-gray-900 w-full">
      <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 shrink-0 z-30 w-full">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/lion logo.png" alt="Lion Logo" className="w-8 h-8 object-contain shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-black tracking-widest text-gray-955 truncate">LION SIMPLANNER</span>
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider truncate">Flight Simulator Ops</span>
          </div>
        </div>

        <nav className="flex items-center gap-6 px-4">
          {(['Dashboard', 'Engineers'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="relative text-xs font-black uppercase tracking-wider py-5 px-1 transition-colors shrink-0 outline-none hover:text-brand-red focus-visible:ring-2 focus-visible:ring-brand-red"
            >
              <span className={activeTab === tab ? 'text-brand-red' : 'text-gray-600'}>
                {tab}
              </span>
              {activeTab === tab && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-red"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-4 shrink-0">
          {user.role === 'Engineer' && (
            <button
              onClick={() => {
                setAogSimId(simulators[0]?.id || '');
                setShowAogModal(true);
              }}
              className="bg-brand-red hover:bg-red-700 active:scale-95 text-white font-black text-[9px] px-3 py-1.5 uppercase tracking-wider rounded cursor-pointer transition-all duration-150"
            >
              DECLARE AOG
            </button>
          )}

          <div className="flex items-center gap-3 pl-4 border-l border-gray-150">
            <div className="w-7 h-7 rounded-full bg-brand-red text-white flex items-center justify-center font-black text-xs shrink-0 transition-transform duration-200 hover:scale-110">
              {user.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div className="hidden md:flex flex-col min-w-0">
              <span className="text-xs font-black text-gray-950 uppercase leading-none truncate">{user.name}</span>
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5 truncate">{user.role}</span>
            </div>
            <button
              onClick={logout}
              className="text-gray-400 hover:text-brand-red active:scale-90 transition-all cursor-pointer ml-1 shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {publishSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-40 m-4 p-3 bg-green-50 border border-green-500 text-green-800 text-xs font-bold rounded flex items-center gap-3 shadow-lg"
          >
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{publishSuccess}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {activeTab === 'Engineers' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 flex overflow-hidden bg-white w-full"
        >
          <div className="flex-none w-80 h-full border-r border-gray-200 p-4 overflow-y-auto space-y-2 min-w-0">
            <div className="mb-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-gray-950 mb-1">Simulator Machines</h3>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Select a machine to view hardware details</p>
            </div>
            <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-2">
              {simulators.map((sim) => {
                const tone = getSimulatorStatusTone(sim.status);
                return (
                  <motion.button
                    variants={listItem}
                    key={sim.id}
                    onClick={() => setSelectedHwSimId(sim.id)}
                    className={`w-full text-left p-4 border rounded transition-all duration-200 active:scale-[0.98] ${selectedHwSimId === sim.id
                      ? 'border-brand-red bg-red-50 shadow-sm scale-[1.02]'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 hover:scale-[1.02]'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black text-gray-900 leading-tight truncate">{sim.name}</div>
                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-1 truncate">{sim.typeRating} · Last sign-off {sim.lastDailySignOffDate ?? 'N/A'}</div>
                      </div>
                      <span className={`shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded uppercase leading-none border transition-colors ${tone.badge}`}>
                        {tone.label}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          </div>

          <div className="flex-1 h-full overflow-y-auto p-6 min-w-0">
            <AnimatePresence mode="wait">
              {(() => {
                const hw = selectedHwSim;
                if (!hw) {
                  return (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full max-w-xl"
                    >
                      <div className="border border-gray-150 rounded p-6 bg-white shadow-sm text-xs font-bold text-gray-500 uppercase tracking-wider">
                        No simulator records loaded.
                      </div>
                    </motion.div>
                  );
                }

                const tone = getSimulatorStatusTone(hw.status);
                const components = buildHardwareComponents(hw.status);

                return (
                  <motion.div
                    key={hw.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    className="w-full max-w-xl space-y-6"
                  >
                    <div className="border border-gray-150 rounded p-6 bg-white shadow-sm space-y-6 transition-all hover:shadow-md">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-4 gap-4 min-w-0">
                        <div className="min-w-0 flex-1">
                          <span className="text-[8px] font-black text-brand-red uppercase tracking-wider block">Hardware Health Monitor</span>
                          <h3 className="text-sm font-black uppercase text-gray-900 tracking-wider mt-1 truncate">{hw.name}</h3>
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 truncate">{hw.typeRating} · Last sign-off {hw.lastDailySignOffDate ?? 'N/A'}</p>
                        </div>
                        <span className={`shrink-0 text-[8px] font-black px-2 py-0.5 rounded uppercase leading-none border transition-colors ${tone.badge}`}>
                          {tone.label}
                        </span>
                      </div>

                      <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-2.5">
                        {components.map(c => (
                          <motion.div variants={listItem} key={c.label} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 gap-4 group hover:bg-gray-50 transition-colors rounded px-1">
                            <span className="font-bold text-gray-800 truncate">{c.label}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`font-black transition-colors ${c.state === 'err' ? 'text-brand-red'
                                : c.state === 'warn' ? 'text-orange-500'
                                  : 'text-green-600'
                                }`}>{c.value}</span>
                              <span className={`w-2 h-2 rounded-full transition-colors ${c.state === 'err' ? 'bg-brand-red shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                                : c.state === 'warn' ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]'
                                  : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]'
                                }`} />
                            </div>
                          </motion.div>
                        ))}
                      </motion.div>

                      <div className="pt-2 border-t border-gray-100 shrink-0">
                        <div className="flex flex-wrap gap-3">
                          <div className="flex items-center gap-1.5 text-[9px] font-black text-gray-500 uppercase tracking-wider">
                            <span className="w-2 h-2 rounded-full bg-green-500" /> OK
                          </div>
                          <div className="flex items-center gap-1.5 text-[9px] font-black text-gray-500 uppercase tracking-wider">
                            <span className="w-2 h-2 rounded-full bg-orange-500" /> Warning
                          </div>
                          <div className="flex items-center gap-1.5 text-[9px] font-black text-gray-500 uppercase tracking-wider">
                            <span className="w-2 h-2 rounded-full bg-brand-red" /> Fault / AOG
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })()}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {activeTab === 'Dashboard' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 flex overflow-hidden bg-white w-full"
        >
          <div className="flex-initial w-80 h-full overflow-y-auto border-r border-gray-200 p-4 space-y-6 min-w-0 shrink-0">
            <TimeDebtQueue
              sessions={sessions}
              pilots={pilots}
              selectedSimId={selectedSimId}
              selectedSlot={selectedSlot}
              onSelectPilotForMakeup={(pilot) => {
                if (!selectedSlot) {
                  alert('Select an open slot on the 14-day schedule first to book a makeup session.');
                  return;
                }
                handleAssignCrew(pilot);
              }}
            />
            <div className="min-w-0">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h3 className="text-xs font-black tracking-widest uppercase text-gray-955 truncate">
                  Available Pilots
                </h3>
                <span className="px-2 py-0.5 bg-brand-red text-white text-[8px] font-black rounded-full shrink-0 transition-transform hover:scale-110">
                  {filteredPilots.length}
                </span>
              </div>

              <button
                onClick={() => {
                  setExternalUserError(null);
                  setShowExternalUserModal(true);
                }}
                className="w-full mb-3 bg-brand-red hover:bg-red-700 active:scale-[0.98] transition-all duration-150 text-white text-[9px] font-black uppercase tracking-wider py-2 rounded cursor-pointer"
              >
                + Add External User
              </button>

              <div className="space-y-3 mb-4">
                <input
                  type="text"
                  value={pilotSearch}
                  onChange={(e) => setPilotSearch(e.target.value)}
                  placeholder="Search pilots..."
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs font-bold text-gray-900 focus:outline-none focus:border-brand-red bg-white transition-colors"
                />
                <div className="flex flex-wrap gap-1">
                  {['ALL', 'B737-800NG', 'B737 MAX 8', 'A320-200', 'A320neo', 'A330-300', 'ATR 72-600'].map(rating => (
                    <button
                      key={rating}
                      onClick={() => setSelectedRatingFilter(rating)}
                      className={`px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded border shrink-0 transition-all active:scale-95 ${selectedRatingFilter === rating
                        ? 'bg-brand-red text-white border-brand-red scale-105'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                      {rating}
                    </button>
                  ))}
                </div>
              </div>

              <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                <AnimatePresence>
                  {filteredPilots.map(p => {
                    const expiryDays = Math.max(0, Math.ceil((new Date(p.nextTrainingDue).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));
                    const ftl = getFtlState(p.lastDutyEndTime, referenceSessionStartIso);
                    let expiryColorClass = '';
                    if (expiryDays <= 10) {
                      expiryColorClass = 'text-brand-red bg-red-50 border border-brand-red';
                    } else if (expiryDays > 20) {
                      expiryColorClass = 'text-green-600 bg-green-50 border border-green-500';
                    } else {
                      expiryColorClass = 'text-gray-500 bg-gray-50 border border-gray-300';
                    }
                    return (
                      <motion.div
                        variants={listItem}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        key={p.pilotId}
                        className="p-2 border border-gray-150 rounded bg-white flex items-start justify-between gap-2 min-w-0 transition-all hover:scale-[1.02] hover:shadow-md cursor-default"
                      >
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center font-black text-[10px] shrink-0 mt-0.5">
                            {p.fullName.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-black text-gray-900 truncate flex items-center gap-1.5">
                              <span className="truncate">{p.fullName}</span>
                              {p.isExternalUser && (
                                <span className="shrink-0 text-[8px] font-black uppercase px-1 py-0.5 rounded border border-orange-400 bg-orange-50 text-orange-700 leading-none">
                                  EXT
                                </span>
                              )}
                            </div>
                            <div className="text-[9px] text-gray-400 uppercase flex flex-wrap items-center gap-1.5 mt-0.5 min-w-0">
                              <span className="truncate">{p.rank}</span>
                              <span className={`text-[8px] font-black uppercase px-1 py-0.5 rounded leading-none shrink-0 ${expiryColorClass}`}>
                                EXP IN {expiryDays}D
                              </span>
                            </div>
                            <div className="mt-1.5 p-1.5 border rounded bg-gray-50 flex flex-col gap-1 min-w-0">
                              {ftl.isClear ? (
                                <span className="inline-block px-1.5 py-0.5 rounded border border-green-500 bg-green-50 text-green-700 text-[8px] font-black uppercase tracking-wider w-fit shrink-0">
                                  Rest Clear
                                </span>
                              ) : (
                                <span className="inline-block px-1.5 py-0.5 rounded border border-brand-red bg-red-50 text-brand-red text-[8px] font-black uppercase tracking-wider max-w-full truncate">
                                  Mandatory Rest Until {formatLocalTimestamp(ftl.availableFrom ?? undefined)}
                                </span>
                              )}
                              <div className="text-[8px] text-gray-500 uppercase truncate">
                                Last Duty: {formatLocalTimestamp(p.lastDutyEndTime)} Local
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0 max-w-[35%]">
                          <div className="flex flex-wrap justify-end gap-1">
                            {p.typeRatings.map((rating, idx) => (
                              <span key={idx} className="text-[8px] border border-brand-red text-brand-red px-1 py-0.5 rounded font-black uppercase leading-none text-center shrink-0">
                                {rating}
                              </span>
                            ))}
                          </div>
                          {selectedSlot && (
                            (() => {
                              if (!selectedSimId) {
                                return (
                                  <button
                                    disabled
                                    title="Select a simulator first"
                                    className="bg-gray-100 text-gray-400 border border-gray-200 text-[8px] font-black uppercase px-1.5 py-1 rounded cursor-not-allowed leading-none shrink-0 opacity-60"
                                  >
                                    Select Sim First
                                  </button>
                                );
                              }
                              const isComp = isTypeCompatible(selectedSimTypeRating, p.typeRatings);
                              if (!isComp) {
                                return (
                                  <button
                                    disabled
                                    title={`Incompatible with ${selectedSimTypeRating}`}
                                    className="bg-gray-100 text-gray-400 border border-gray-200 text-[8px] font-black uppercase px-1.5 py-1 rounded cursor-not-allowed leading-none shrink-0 opacity-50"
                                  >
                                    Incompatible
                                  </button>
                                );
                              }
                              return (
                                <button
                                  onClick={() => handleAssignCrew(p)}
                                  className="bg-brand-red hover:bg-red-700 active:scale-90 text-white text-[8px] font-black uppercase px-2 py-1 rounded cursor-pointer leading-none shrink-0 transition-transform shadow-sm"
                                >
                                  Assign
                                </button>
                              );
                            })()
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            </div>

            <div className="border-t border-gray-100 pt-4 min-w-0">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h3 className="text-xs font-black tracking-widest uppercase text-gray-955 truncate">
                  Available Instructors
                </h3>
                <span className="px-2 py-0.5 bg-brand-red text-white text-[8px] font-black rounded-full shrink-0 transition-transform hover:scale-110">
                  {instructors.length}
                </span>
              </div>
              <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                {instructors.map(i => (
                  <motion.div
                    variants={listItem}
                    key={i.id}
                    className="p-2 border border-gray-150 rounded bg-white flex items-center justify-between gap-2 min-w-0 transition-all hover:scale-[1.02] hover:shadow-md"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center font-black text-[10px] shrink-0">
                        {i.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black text-gray-900 truncate">{i.name}</div>
                        <div className="text-[9px] text-gray-400 uppercase truncate">{i.status}</div>
                        <div className="mt-1.5 p-1.5 border rounded bg-gray-50 min-w-0">
                          {(() => {
                            const ftl = getFtlState(i.lastDutyEndTime, referenceSessionStartIso);
                            return ftl.isClear ? (
                              <span className="inline-block px-1.5 py-0.5 rounded border border-green-500 bg-green-50 text-green-700 text-[8px] font-black uppercase tracking-wider w-fit shrink-0">
                                Rest Clear
                              </span>
                            ) : (
                              <span className="inline-block px-1.5 py-0.5 rounded border border-brand-red bg-red-50 text-brand-red text-[8px] font-black uppercase tracking-wider max-w-full truncate">
                                Mandatory Rest Until {formatLocalTimestamp(ftl.availableFrom ?? undefined)}
                              </span>
                            );
                          })()}
                          <div className="text-[8px] text-gray-500 uppercase mt-1 truncate">
                            Last Duty: {formatLocalTimestamp(i.lastDutyEndTime)} Local
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {i.certifiedTypes.slice(0, 3).map((type) => (
                            <span key={`${i.id}-type-${type}`} className="text-[8px] border border-brand-red text-brand-red px-1 rounded font-black uppercase leading-none shrink-0">
                              {type}
                            </span>
                          ))}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {i.authorizedSyllabi.slice(0, 3).map((syllabus) => (
                            <span key={`${i.id}-syll-${syllabus}`} className="text-[8px] border border-gray-300 text-gray-600 px-1 rounded font-black uppercase leading-none shrink-0">
                              {syllabus}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {selectedSlot && (
                        (() => {
                          if (!selectedSimId) {
                            return (
                              <button
                                disabled
                                title="Select a simulator first"
                                className="bg-gray-100 text-gray-400 border border-gray-200 text-[8px] font-black uppercase px-1.5 py-0.5 rounded cursor-not-allowed leading-none shrink-0 opacity-60"
                              >
                                Select Sim First
                              </button>
                            );
                          }
                          const isComp = isTypeCompatible(selectedSimTypeRating, i.certifiedTypes ?? i.typeRatings ?? i.ratings);
                          if (!isComp) {
                            return (
                              <button
                                disabled
                                title={`Incompatible with ${selectedSimTypeRating}`}
                                className="bg-gray-100 text-gray-400 border border-gray-200 text-[8px] font-black uppercase px-1.5 py-0.5 rounded cursor-not-allowed leading-none shrink-0 opacity-50"
                              >
                                Incompatible
                              </button>
                            );
                          }
                          return (
                            <button
                              onClick={() => handleAssignInstructor(i)}
                              className="bg-brand-red hover:bg-red-700 active:scale-90 text-white text-[8px] font-black uppercase px-1 py-0.5 rounded cursor-pointer leading-none shrink-0 transition-transform shadow-sm"
                            >
                              Assign
                            </button>
                          );
                        })()
                      )}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>

            <div className="border-t border-gray-100 pt-4 min-w-0">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h3 className="text-xs font-black tracking-widest uppercase text-gray-955 truncate">
                  On-Shift Engineers
                </h3>
                <span className="px-2 py-0.5 bg-brand-red text-white text-[8px] font-black rounded-full shrink-0 transition-transform hover:scale-110">
                  {engineers.length}
                </span>
              </div>
              <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {engineers.map(e => (
                  <motion.div
                    variants={listItem}
                    key={e.id}
                    className="p-2 border border-gray-150 rounded bg-white flex items-center justify-between gap-2 text-xs min-w-0 transition-all hover:scale-[1.02] hover:shadow-md"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center font-black text-[10px] shrink-0">
                        {e.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black text-gray-900 truncate">{e.name}</div>
                        <div className="text-[9px] text-gray-400 uppercase truncate">{isEngineerOnShiftNow(e.shiftStart, e.shiftEnd) ? 'On-Shift' : 'Off-Shift'}</div>
                        <div className="text-[8px] text-gray-500 uppercase truncate">{getEngineerShiftLabel(e.shiftStart, e.shiftEnd)}</div>
                      </div>
                    </div>
                    <span className="text-[8px] border border-gray-300 text-gray-600 px-1 rounded font-black uppercase shrink-0 leading-none truncate max-w-[25%]">
                      {e.assignedSim}
                    </span>
                  </motion.div>
                ))}
              </motion.div>
            </div>

            <div className="border-t border-gray-100 pt-4 min-w-0">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h3 className="text-xs font-black tracking-widest uppercase text-gray-955 truncate">
                  Hardware Status
                </h3>
                <span className="px-2 py-0.5 bg-brand-red text-white text-[8px] font-black rounded-full shrink-0 transition-transform hover:scale-110">
                  {simulators.length}
                </span>
              </div>
              <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {simulators.map(sim => {
                  const tone = getSimulatorStatusTone(sim.status);
                  return (
                    <motion.div
                      variants={listItem}
                      key={sim.id}
                      className="p-2 border border-gray-150 rounded bg-white flex items-center justify-between gap-2 text-xs min-w-0 transition-all hover:scale-[1.02] hover:shadow-md"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-black text-gray-900 truncate">Target Machine: {sim.name}</div>
                        <div className="text-[8px] text-gray-400 uppercase mt-0.5 truncate">{sim.typeRating}</div>
                      </div>
                      <span className={`w-2 h-2 rounded-full ${tone.dot} shrink-0 transition-colors`} />
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>
          </div>

          <div className="flex-1 h-full overflow-y-auto p-6 min-w-0 flex-grow">
            <div className="border border-gray-100 rounded p-6 bg-white shadow-sm w-full transition-shadow hover:shadow-md">
              <div className="mb-4 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-black uppercase text-gray-900 truncate">
                      7-Day Schedule Grid
                    </h3>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">
                      {calendarRangeLabel} • Click empty cell to build • Click session to view crew
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={goToPreviousWindow}
                      className="px-2 py-1 border border-gray-200 text-gray-700 text-[9px] font-black uppercase rounded hover:bg-gray-50 shrink-0 active:scale-95 transition-all"
                    >
                      Prev Week
                    </button>
                    <button
                      onClick={goToTodayWindow}
                      className="px-2 py-1 border border-brand-red text-brand-red text-[9px] font-black uppercase rounded hover:bg-red-50 shrink-0 active:scale-95 transition-all"
                    >
                      Today
                    </button>
                    <button
                      onClick={goToNextWindow}
                      className="px-2 py-1 border border-gray-200 text-gray-700 text-[9px] font-black uppercase rounded hover:bg-gray-50 shrink-0 active:scale-95 transition-all"
                    >
                      Next Week
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto max-w-full border border-gray-100 rounded">
                <div className="min-w-[1200px]">
                  <div
                    className="grid bg-gray-50 border-b border-gray-100 text-center font-bold text-[10px] text-gray-500 uppercase py-3"
                    style={{ gridTemplateColumns: `80px repeat(${visibleDayCount}, minmax(70px, 1fr))` }}
                  >
                    <div>Time</div>
                    {visibleDays.map(dayDate => (
                      <div key={toLocalDateKey(dayDate)} className="border-l border-gray-100 flex flex-col justify-center min-w-0">
                        <span className="truncate">{dayDate.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                        <span className="text-xs font-black text-gray-900 mt-0.5">{dayDate.getDate()}</span>
                      </div>
                    ))}
                  </div>

                  <div className="divide-y divide-gray-100 bg-white">
                    {['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'].map(time => {
                      const hour = parseInt(time.split(':')[0]);
                      return (
                        <div
                          key={time}
                          className="grid min-h-[56px] text-xs"
                          style={{ gridTemplateColumns: `80px repeat(${visibleDayCount}, minmax(70px, 1fr))` }}
                        >
                          <div className="flex items-center justify-center font-bold text-gray-400 bg-gray-50 border-r border-gray-100 py-2 shrink-0">
                            {time}
                          </div>
                          {visibleDays.map(dayDate => {
                            const dayKey = toLocalDateKey(dayDate);
                            const daySessions = sessions.filter(s => {
                              if (s.status === 'Cancelled') return false;
                              const start = toLocalDate(s.startTime);
                              return !!start && toLocalDateKey(start) === dayKey;
                            });

                            const startingSessions = daySessions.filter(s => {
                              const start = toLocalDate(s.startTime);
                              return !!start && start.getHours() === hour;
                            });

                            const isSelectedDraft = selectedSlot &&
                              selectedSlot.dayKey === dayKey &&
                              hour >= selectedSlot.hour &&
                              hour < Math.min(24, selectedSlot.hour + Math.ceil(sessionDuration));

                            const startHourSelected = selectedSlot && selectedSlot.dayKey === dayKey && selectedSlot.hour === hour;
                            const engineerCovered = hasEngineerCoverage(dayKey, hour);

                            return (
                              <div
                                key={dayKey}
                                onClick={() => handleCellClick(dayKey, hour)}
                                className={`border-r border-gray-100 p-1 relative min-h-[56px] transition-colors duration-200 min-w-0 ${isSelectedDraft
                                  ? 'bg-red-50/50'
                                  : 'bg-white hover:bg-gray-50 cursor-pointer'
                                  }`}
                              >
                                {engineerCovered && (
                                  <span className="absolute top-1 right-1 text-[7px] font-black uppercase text-blue-700 bg-blue-100 border border-blue-200 px-1 rounded leading-none z-30 shrink-0">
                                    Eng
                                  </span>
                                )}
                                <AnimatePresence>
                                  {isSelectedDraft && startHourSelected && (
                                    <motion.div
                                      initial={{ opacity: 0, scaleY: 0.8, originY: 0 }}
                                      animate={{ opacity: 1, scaleY: 1 }}
                                      exit={{ opacity: 0, scaleY: 0.8 }}
                                      style={{
                                        top: `${Math.round((parseInt(sessionStartMin) / 60) * 56) + 2}px`,
                                        height: `${(sessionDuration * 56) - 4}px`
                                      }}
                                      className="absolute left-0.5 right-0.5 p-1 text-[8px] leading-tight font-black rounded z-10 flex flex-col justify-between border bg-brand-red text-white border-brand-red animate-pulse min-w-0 shadow-lg"
                                    >
                                      <div className="min-w-0">
                                        <div className="uppercase font-extrabold tracking-wide">DRAFT</div>
                                        <div className="truncate opacity-95">
                                          {assignedTrainee ? assignedTrainee.fullName : 'No Trainee'}
                                        </div>
                                      </div>
                                      <div className="uppercase tracking-widest text-[7px] truncate opacity-90">
                                        {simulators.find(sim => sim.id === selectedSimId)?.name || 'SIM'}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>

                                {startingSessions.map(s => {
                                  const start = toLocalDate(s.startTime);
                                  if (!start) return null;
                                  const duration = getDurationInHours(s.startTime, s.endTime);
                                  const heightPx = (duration * 56) - 4;
                                  const topOffsetPx = Math.round((start.getMinutes() / 60) * 56) + 2;

                                  return (
                                    <motion.div
                                      layout
                                      initial={{ opacity: 0, scale: 0.9 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                      key={s.sessionId}
                                      style={{
                                        top: `${topOffsetPx}px`,
                                        height: `${heightPx}px`
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedSlot(null);
                                        setViewedSession(s);
                                        setIsRescheduleMode(false);
                                        setRescheduleViolations([]);
                                      }}
                                      className={`absolute left-0.5 right-0.5 p-1 text-[8px] leading-tight font-black text-white rounded z-20 flex flex-col justify-between cursor-pointer border min-w-0 transition-transform active:scale-95 shadow-sm hover:shadow-md hover:z-30 ${viewedSession?.sessionId === s.sessionId
                                        ? 'bg-brand-red border-red-800 font-black z-30'
                                        : s.status === 'Scheduled' || s.status === 'Draft'
                                          ? 'bg-blue-500 hover:bg-blue-600 border-blue-700 font-bold'
                                          : s.status === 'InProgress'
                                            ? 'bg-green-600 hover:bg-green-700 border-green-800 font-bold animate-pulse'
                                            : s.status === 'Completed'
                                              ? 'bg-teal-600 hover:bg-teal-700 border-teal-800 font-bold'
                                              : s.status === 'TerminatedEarly'
                                                ? 'bg-purple-600 hover:bg-purple-700 border-purple-800 font-bold'
                                                : s.status === 'Cancelled'
                                                  ? 'bg-gray-300 hover:bg-gray-400 border-gray-400 opacity-70 font-medium'
                                                  : 'bg-blue-500 hover:bg-blue-600 border-blue-700 font-medium'
                                        }`}
                                    >
                                      <div className="min-w-0">
                                        <div className="uppercase truncate">{s.sessionType}</div>
                                        <div className="truncate opacity-95">
                                          {s.traineeName || s.traineeEmployeeCode || pilots.find(p => p.employeeCode === s.traineeEmployeeCode)?.fullName || 'No Trainee'}
                                        </div>
                                      </div>
                                      <div className="uppercase tracking-widest text-[7px] truncate opacity-90 flex items-center justify-between gap-1 min-w-0">
                                        <span className="truncate">{simulators.find(sim => sim.id === s.simulatorId)?.name || 'SIM'}</span>
                                        <span className="shrink-0">{duration}h</span>
                                      </div>
                                    </motion.div>
                                  );
                                })}
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

          <AnimatePresence mode="wait">
            {(viewedSession || selectedSlot) && (
              <motion.div
                key={viewedSession ? 'viewer' : 'builder'}
                variants={slideInRight}
                initial="hidden"
                animate="show"
                exit="exit"
                className="flex-initial w-80 h-full overflow-y-auto border-l border-gray-200 p-4 shrink-0 bg-white min-w-0 shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.05)] z-20"
              >
                {viewedSession ? (
                  <div className="border border-gray-200 rounded p-4 bg-white space-y-5 min-w-0">
                    <div className="border-b border-gray-100 pb-3 flex items-center justify-between gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-xs font-black text-gray-900 uppercase truncate">
                          Session Details
                        </h3>
                        <p className="text-[9px] font-bold text-gray-400 uppercase mt-0.5 truncate">
                          {viewedSession.status} {isRescheduleMode ? '• Edit Mode' : '• Read-Only'}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setViewedSession(null);
                          setIsRescheduleMode(false);
                          setRescheduleViolations([]);
                        }}
                        className="text-xs font-black uppercase text-gray-400 hover:text-brand-red cursor-pointer shrink-0 transition-colors active:scale-95"
                      >
                        Close
                      </button>
                    </div>

                    <AnimatePresence>
                      {(viewedSession.status === 'InProgress' || viewedSession.status === 'Scheduled') && !isRescheduleMode && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-2 shrink-0 overflow-hidden"
                        >
                          {viewedSession.status === 'Scheduled' && (
                            <button
                              onClick={() => handleStartSession(viewedSession)}
                              className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black py-2 rounded text-xs uppercase tracking-wider cursor-pointer transition-all shadow-sm"
                            >
                              Start Session
                            </button>
                          )}
                          {viewedSession.status === 'Scheduled' && (
                            <button
                              onClick={handleStartReschedule}
                              className="w-full bg-brand-red hover:bg-red-700 active:scale-95 text-white font-black py-2 rounded text-xs uppercase tracking-wider cursor-pointer transition-all"
                            >
                              Edit / Reschedule
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenTerminateModal(viewedSession)}
                            className="w-full bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-black py-2 rounded text-xs uppercase tracking-wider cursor-pointer transition-all"
                          >
                            Terminate Early
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="space-y-3.5 text-xs font-bold text-gray-700 min-w-0">
                      <div className="min-w-0">
                        <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">Status</span>
                        <motion.span
                          layout
                          className={`px-2 py-0.5 border text-[9px] font-black rounded uppercase inline-block transition-colors ${viewedSession.status === 'Completed'
                            ? 'bg-green-50 text-green-700 border-green-400'
                            : viewedSession.status === 'InProgress'
                              ? 'bg-amber-50 text-amber-700 border-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                              : viewedSession.status === 'TerminatedEarly'
                                ? 'bg-purple-50 text-purple-700 border-purple-400'
                                : viewedSession.status === 'Cancelled'
                                  ? 'bg-red-50 text-brand-red border-brand-red'
                                  : 'bg-blue-50 text-blue-700 border-blue-400'
                            }`}
                        >
                          {viewedSession.status}
                        </motion.span>
                        {viewedSession.terminationReason && (
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[9px] font-bold text-purple-700 mt-1">
                            Reason: {viewedSession.terminationReason}
                          </motion.div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider">Session Type</span>
                        <span className="text-xs font-black text-gray-900 uppercase truncate block">{viewedSession.sessionType}</span>
                      </div>

                      <motion.div layout className="min-w-0">
                        <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider">Schedule</span>
                        {(() => {
                          const viewedStart = toLocalDate(viewedSession.startTime);
                          const viewedEnd = toLocalDate(viewedSession.endTime);
                          if (!viewedStart || !viewedEnd) {
                            return <span className="text-gray-955">N/A</span>;
                          }

                          if (isRescheduleMode) {
                            return (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="space-y-2 mt-1 overflow-hidden"
                              >
                                <div>
                                  <label className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">Date</label>
                                  <input
                                    type="date"
                                    value={editDateKey}
                                    onChange={(e) => setEditDateKey(e.target.value)}
                                    className="text-xs font-black text-gray-900 border border-gray-200 rounded p-1 bg-white focus:outline-none focus:border-brand-red w-full transition-colors"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">Start Time</label>
                                    <div className="flex gap-1">
                                      <select
                                        value={editStartHour}
                                        onChange={(e) => handleEditStartTimeChange(e.target.value, editStartMin)}
                                        className="text-xs font-black text-gray-900 border border-gray-200 rounded p-1 bg-white focus:outline-none focus:border-brand-red w-full transition-colors"
                                      >
                                        {['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'].map(hr => (
                                          <option key={hr} value={hr}>{hr}</option>
                                        ))}
                                      </select>
                                      <select
                                        value={editStartMin}
                                        onChange={(e) => handleEditStartTimeChange(editStartHour, e.target.value)}
                                        className="text-xs font-black text-gray-900 border border-gray-200 rounded p-1 bg-white focus:outline-none focus:border-brand-red w-full transition-colors"
                                      >
                                        {['00', '15', '30', '45'].map(min => (
                                          <option key={min} value={min}>{min}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">Duration</label>
                                    <select
                                      value={editDuration}
                                      onChange={(e) => handleEditDurationChange(parseFloat(e.target.value))}
                                      className="text-xs font-black text-gray-900 border border-gray-200 rounded p-1 bg-white focus:outline-none focus:border-brand-red w-full transition-colors"
                                    >
                                      {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7, 8].map(h => (
                                        <option key={h} value={h}>{h} {h === 1 ? 'Hr' : 'Hrs'}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div className="text-[9px] text-gray-500 truncate">
                                  {editDateKey ? editDateKey : 'No Date selected'} • {editStartHour}:{editStartMin} - {editEndHour}:{editEndMin} Local
                                </div>
                              </motion.div>
                            );
                          }

                          return (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-w-0">
                              <span className="text-gray-955 block truncate">
                                {viewedStart.toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                              </span>
                              <div className="text-[9px] text-gray-500 mt-0.5 truncate">
                                {viewedStart.getHours().toString().padStart(2, '0')}:
                                {viewedStart.getMinutes().toString().padStart(2, '0')} - {' '}
                                {viewedEnd.getHours().toString().padStart(2, '0')}:
                                {viewedEnd.getMinutes().toString().padStart(2, '0')} Local
                              </div>
                            </motion.div>
                          );
                        })()}
                      </motion.div>

                      <div className="min-w-0">
                        <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">Simulator</span>
                        <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-850 text-[9px] block truncate">
                          {simulators.find(sim => sim.id === viewedSession.simulatorId)?.name || 'SIM'}
                        </span>
                      </div>

                      <div className="border-t border-gray-100 pt-3 space-y-2 min-w-0">
                        <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">Crew</span>

                        <div className="flex items-center gap-2 p-1.5 bg-gray-50 border border-gray-100 rounded min-w-0 transition-colors hover:bg-gray-100">
                          <div className="w-6 h-6 rounded-full bg-brand-red text-white flex items-center justify-center font-black text-[10px] shrink-0">
                            T
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-black text-gray-900 text-xs truncate">
                              {viewedSession.traineeName || viewedSession.traineeEmployeeCode || 'Unassigned'}
                            </div>
                            <div className="text-[8px] text-gray-400 uppercase">Trainee · {viewedSession.traineeRole || '—'}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 p-1.5 bg-gray-50 border border-gray-100 rounded min-w-0 transition-colors hover:bg-gray-100">
                          <div className="w-6 h-6 rounded-full bg-brand-red text-white flex items-center justify-center font-black text-[10px] shrink-0">
                            I
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-black text-gray-900 text-xs truncate">
                              {instructors.find(i => i.id === viewedSession.instructorId)?.name || 'Unassigned'}
                            </div>
                            <div className="text-[8px] text-gray-400 uppercase">Instructor</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <AnimatePresence>
                      {isRescheduleMode && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-3 overflow-hidden"
                        >
                          {rescheduleViolations.length > 0 && (
                            <div className="border border-red-200 bg-red-50 rounded p-2 text-[10px] text-brand-red font-bold max-w-full overflow-hidden">
                              <ul className="list-disc list-inside space-y-0.5 break-words">
                                {rescheduleViolations.map((v, idx) => (
                                  <li key={idx} className="leading-tight">{v}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => {
                                setIsRescheduleMode(false);
                                setRescheduleViolations([]);
                              }}
                              className="w-full border border-gray-200 hover:bg-gray-50 text-gray-700 font-black py-2 rounded text-xs uppercase tracking-wider cursor-pointer transition-all active:scale-95 shrink-0"
                            >
                              Cancel Edit
                            </button>
                            <button
                              onClick={handleSaveReschedule}
                              className="w-full bg-brand-red hover:bg-red-700 text-white font-black py-2 rounded text-xs uppercase tracking-wider cursor-pointer transition-all active:scale-95 shrink-0"
                            >
                              Save Changes
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {viewedSession.status === 'Completed' && (
                      <button
                        onClick={() => {
                          setGradeModalSession(viewedSession);
                          setShowGradeModal(true);
                        }}
                        className="w-full bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-black py-2 rounded text-xs uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-2 shadow-sm"
                      >
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                        </svg>
                        View Grade Report
                      </button>
                    )}
                    {user.role === 'Admin' && (
                      <button
                        onClick={() => handleCancelSession(viewedSession.sessionId)}
                        className="w-full bg-brand-red hover:bg-red-700 active:scale-95 text-white font-black py-2 rounded text-xs uppercase tracking-wider cursor-pointer transition-all shrink-0"
                      >
                        Cancel Session
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded p-4 bg-white space-y-5 min-w-0">
                    <div className="border-b border-gray-100 pb-3 flex items-center justify-between gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-xs font-black text-gray-955 uppercase truncate">
                          Session Builder
                        </h3>
                        <p className="text-[9px] font-bold text-gray-400 uppercase mt-0.5 truncate">
                          {localDateFromKeyAndTime(sessionDateKey, 0, 0).toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedSlot(null)}
                        className="text-xs font-black uppercase text-gray-400 hover:text-brand-red cursor-pointer shrink-0 transition-colors active:scale-95"
                      >
                        Deselect
                      </button>
                    </div>

                    <div className="space-y-4 min-w-0">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">
                            Start
                          </label>
                          <div className="flex gap-0.5">
                            <select
                              value={sessionStartHour}
                              onChange={(e) => handleStartTimeChange(e.target.value, sessionStartMin)}
                              className="text-xs font-black text-gray-900 border border-gray-200 rounded p-1 bg-white focus:outline-none focus:border-brand-red w-full transition-colors"
                            >
                              {['06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18'].map(hr => (
                                <option key={hr} value={hr}>{hr}</option>
                              ))}
                            </select>
                            <select
                              value={sessionStartMin}
                              onChange={(e) => handleStartTimeChange(sessionStartHour, e.target.value)}
                              className="text-xs font-black text-gray-900 border border-gray-200 rounded p-1 bg-white focus:outline-none focus:border-brand-red w-full transition-colors"
                            >
                              {['00', '15', '30', '45'].map(min => (
                                <option key={min} value={min}>{min}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">
                            Duration
                          </label>
                          <select
                            value={sessionDuration}
                            onChange={(e) => handleDurationChange(parseFloat(e.target.value))}
                            className="text-xs font-black text-gray-900 border border-gray-200 rounded p-1 bg-white focus:outline-none focus:border-brand-red w-full transition-colors"
                          >
                            {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7, 8].map(h => (
                              <option key={h} value={h}>{h} {h === 1 ? 'Hr' : 'Hrs'}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">
                            Simulator
                          </label>
                          <select
                            value={selectedSimId}
                            onChange={(e) => handleSimulatorChange(e.target.value)}
                            className="text-xs font-black text-gray-905 border border-gray-200 rounded p-1.5 bg-white focus:outline-none focus:border-brand-red w-full transition-colors"
                          >
                            <option value="">-- Select a Simulator --</option>
                            {simulators.map((s) => (
                              <option key={s.id} value={s.id}>{s.name} ({s.typeRating}) - {s.status}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">
                            Type
                          </label>
                          <select
                            value={selectedSessionType}
                            onChange={(e) => setSelectedSessionType(e.target.value)}
                            className="text-xs font-black text-gray-905 border border-gray-200 rounded p-1 bg-white focus:outline-none focus:border-brand-red w-full transition-colors"
                          >
                            <option value="Recurrent">Recurrent Training</option>
                            <option value="OPC">Operator Proficiency Check (OPC)</option>
                            <option value="LPC">License Proficiency Check (LPC)</option>
                            <option value="InitialTypeRating">Initial Type Rating</option>
                            <option value="CommandUpgrade">Command Upgrade Training</option>
                            <option value="Differences">Differences / Familiarization</option>
                            <option value="Requalification">Requalification Training</option>
                            <option value="LOFT">Line-Oriented Flight Training (LOFT)</option>
                            <option value="SinglePilotCRM">Single-Pilot CRM</option>
                            <option value="MCC">Multi-Crew Cooperation (MCC)</option>
                          </select>
                        </div>

                        <AnimatePresence>
                          {selectedSimulatorIsAog && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="border border-orange-300 bg-orange-50 rounded p-2 text-[10px] text-orange-700 font-black uppercase tracking-wider overflow-hidden"
                            >
                              Warning: Simulator is currently AOG. Maintenance resolution required before dispatch.
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div className="space-y-3 pt-1 min-w-0">
                          <div className="min-w-0">
                            <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">Trainee Zone</span>
                            {!selectedSimId ? (
                              <div className="border border-dashed border-gray-300 rounded p-2.5 text-center text-[9px] font-bold text-gray-400 bg-gray-100 uppercase tracking-wider opacity-60">
                                Select a simulator first...
                              </div>
                            ) : eligiblePilots.length === 0 ? (
                              <div className="border border-red-200 rounded p-2.5 text-center text-[9px] font-bold text-brand-red bg-red-50 uppercase tracking-wider">
                                No eligible trainees found for {selectedSimTypeRating}
                              </div>
                            ) : (
                              <div>
                                <div className="mb-2">
                                  <label className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">Trainee Role</label>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setAssignedTraineeRole('Captain')}
                                      className={`flex-1 py-1 text-[9px] font-black uppercase rounded border transition-colors cursor-pointer ${assignedTraineeRole === 'Captain'
                                        ? 'bg-brand-red text-white border-brand-red'
                                        : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                                        }`}
                                    >
                                      Captain
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setAssignedTraineeRole('First Officer')}
                                      className={`flex-1 py-1 text-[9px] font-black uppercase rounded border transition-colors cursor-pointer ${assignedTraineeRole === 'First Officer'
                                        ? 'bg-brand-red text-white border-brand-red'
                                        : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                                        }`}
                                    >
                                      First Officer
                                    </button>
                                  </div>
                                </div>
                                <AnimatePresence mode="popLayout">
                                  {assignedTrainee ? (
                                    <motion.div
                                      initial={{ opacity: 0, scale: 0.9 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 0.9 }}
                                      className="flex items-center justify-between p-1.5 border border-gray-200 rounded bg-white text-xs gap-2 min-w-0 shadow-sm"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <span className="font-black text-gray-900 truncate block">{assignedTrainee.fullName}</span>
                                        <span className="text-[8px] text-gray-400 uppercase">{assignedTraineeRole} · {assignedTrainee.employeeCode}</span>
                                      </div>
                                      <button onClick={() => setAssignedTrainee(null)} className="text-brand-red font-bold px-1 hover:scale-125 transition-transform shrink-0">×</button>
                                    </motion.div>
                                  ) : (
                                    <motion.div
                                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                      className="border border-dashed border-gray-300 rounded p-2 text-center text-[9px] font-bold text-gray-400 bg-gray-50 uppercase tracking-wider truncate transition-colors hover:bg-gray-100"
                                    >
                                      Select Trainee Card ({eligiblePilots.length} Eligible)
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">Instructor Zone</span>
                            {!selectedSimId ? (
                              <div className="border border-dashed border-gray-300 rounded p-2.5 text-center text-[9px] font-bold text-gray-400 bg-gray-100 uppercase tracking-wider opacity-60">
                                Select a simulator first...
                              </div>
                            ) : eligibleInstructors.length === 0 ? (
                              <div className="border border-red-200 rounded p-2.5 text-center text-[9px] font-bold text-brand-red bg-red-50 uppercase tracking-wider">
                                No eligible instructors found for {selectedSimTypeRating}
                              </div>
                            ) : (
                              <AnimatePresence mode="popLayout">
                                {assignedInstructor ? (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="flex items-center justify-between p-1.5 border border-gray-200 rounded bg-white text-xs gap-2 min-w-0 shadow-sm"
                                  >
                                    <span className="font-black text-gray-900 truncate flex-1">{assignedInstructor.name}</span>
                                    <button onClick={() => setAssignedInstructor(null)} className="text-brand-red font-bold px-1 hover:scale-125 transition-transform shrink-0">×</button>
                                  </motion.div>
                                ) : (
                                  <motion.div
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="border border-dashed border-gray-300 rounded p-2 text-center text-[9px] font-bold text-gray-400 bg-gray-50 uppercase tracking-wider truncate transition-colors hover:bg-gray-100"
                                  >
                                    Select Instructor Card ({eligibleInstructors.length} Eligible)
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            )}
                          </div>
                        </div>                </div>
                    </div>

                    <AnimatePresence>
                      {validationViolations.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="border border-red-200 bg-red-50 rounded p-2 text-[10px] text-brand-red font-bold max-w-full overflow-hidden"
                        >
                          <ul className="list-disc list-inside space-y-0.5 break-words">
                            {validationViolations.map((v, idx) => (
                              <li key={idx} className="leading-tight">{v}</li>
                            ))}
                          </ul>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <button
                      onClick={handlePublish}
                      disabled={validationViolations.length > 0}
                      className="w-full flex justify-center items-center gap-1.5 py-3 border border-transparent rounded shadow text-xs font-black uppercase tracking-widest text-white bg-brand-red hover:bg-red-700 cursor-pointer disabled:opacity-50 shrink-0 transition-all active:scale-95"
                    >
                      <span>Validate & Publish</span>
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      <AnimatePresence>
        {showExternalUserModal && (
          <motion.div
            variants={modalBackdrop}
            initial="hidden"
            animate="show"
            exit="exit"
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              variants={modalContent}
              className="bg-white border border-gray-100 p-6 rounded shadow-2xl max-w-md w-full"
            >
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-4">
                Add External User
              </h3>
              <form onSubmit={handleAddExternalUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Full Name
                  </label>
                  <input
                    required
                    value={externalFullName}
                    onChange={(e) => setExternalFullName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-xs font-bold text-gray-900 bg-white transition-colors focus:border-brand-red focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={externalEmail}
                    onChange={(e) => setExternalEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-xs font-bold text-gray-900 bg-white transition-colors focus:border-brand-red focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Contact Number
                  </label>
                  <input
                    value={externalContactNumber}
                    onChange={(e) => setExternalContactNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-xs font-bold text-gray-900 bg-white transition-colors focus:border-brand-red focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Company Name
                  </label>
                  <input
                    value={externalCompanyName}
                    onChange={(e) => setExternalCompanyName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-xs font-bold text-gray-900 bg-white transition-colors focus:border-brand-red focus:outline-none"
                  />
                </div>

                <AnimatePresence>
                  {externalUserError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border border-red-200 bg-red-50 rounded p-2 text-[10px] text-brand-red font-bold break-words overflow-hidden"
                    >
                      {externalUserError}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowExternalUserModal(false)}
                    className="px-4 py-2 border border-gray-200 rounded text-xs font-bold uppercase text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-brand-red hover:bg-red-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all shadow-md"
                  >
                    Add User
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAogModal && (
          <motion.div
            variants={modalBackdrop}
            initial="hidden"
            animate="show"
            exit="exit"
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              variants={modalContent}
              className="bg-white border border-gray-100 p-6 rounded shadow-2xl max-w-md w-full"
            >
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-4">
                Declare Simulator AOG (Down)
              </h3>
              <form onSubmit={handleTriggerAog} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Select Simulator
                  </label>
                  <select
                    value={aogSimId}
                    onChange={(e) => setAogSimId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-xs font-bold bg-white text-gray-900 transition-colors focus:border-brand-red focus:outline-none"
                  >
                    {simulators.map(s => (
                      <option key={s.id} value={s.id}>{s.name} - {s.typeRating}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Fault Description
                  </label>
                  <textarea
                    required
                    value={aogFault}
                    onChange={(e) => setAogFault(e.target.value)}
                    placeholder="Explain mechanical or software issues preventing operations..."
                    className="w-full px-3 py-2 border border-gray-300 rounded text-xs font-bold text-gray-900 bg-white transition-colors focus:border-brand-red focus:outline-none resize-none"
                    rows={3}
                  />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAogModal(false)}
                    className="px-4 py-2 border border-gray-200 rounded text-xs font-bold uppercase text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-brand-red hover:bg-red-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all shadow-md"
                  >
                    Trigger Shutdown
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMaintModal && (
          <motion.div
            variants={modalBackdrop}
            initial="hidden"
            animate="show"
            exit="exit"
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              variants={modalContent}
              className="bg-white border border-gray-100 p-6 rounded shadow-2xl max-w-md w-full"
            >
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-4">
                Maintenance Shield Checklist Sign-Off
              </h3>
              <form onSubmit={handleSubmitMaint} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Select Simulator
                  </label>
                  <select
                    value={maintSimId}
                    onChange={(e) => setMaintSimId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-xs font-bold bg-white text-gray-900 transition-colors focus:border-brand-red focus:outline-none"
                  >
                    {simulators.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.typeRating})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="maintIsCleared"
                    checked={maintIsCleared}
                    onChange={(e) => setMaintIsCleared(e.target.checked)}
                    className="rounded border-gray-300 text-brand-red focus:ring-brand-red cursor-pointer"
                  />
                  <label htmlFor="maintIsCleared" className="text-xs font-bold text-gray-700 uppercase cursor-pointer">
                    Clear Maintenance Shield (Ready for operations)
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Checklist Notes
                  </label>
                  <textarea
                    value={maintNotes}
                    onChange={(e) => setMaintNotes(e.target.value)}
                    placeholder="Notes from safety checks and compliance checklist..."
                    className="w-full px-3 py-2 border border-gray-300 rounded text-xs font-bold text-gray-900 bg-white transition-colors focus:border-brand-red focus:outline-none resize-none"
                    rows={3}
                  />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowMaintModal(false)}
                    className="px-4 py-2 border border-gray-200 rounded text-xs font-bold uppercase text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-brand-red hover:bg-red-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all shadow-md"
                  >
                    Sign Off Checklist
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTerminateModal && terminateSessionTarget && (
          <motion.div
            variants={modalBackdrop}
            initial="hidden"
            animate="show"
            exit="exit"
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              variants={modalContent}
              className="bg-white border border-gray-200 p-6 rounded-lg shadow-2xl max-w-md w-full space-y-4"
            >
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h3 className="text-sm font-black uppercase text-gray-900 tracking-wider">
                  Terminate Session Early
                </h3>
                <button
                  type="button"
                  onClick={() => setShowTerminateModal(false)}
                  className="text-xs font-black text-gray-400 hover:text-brand-red uppercase active:scale-95 transition-all"
                >
                  Cancel
                </button>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800 font-bold space-y-1 shadow-sm">
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
                      className="text-xs font-black text-gray-900 border border-gray-300 rounded p-2 bg-white focus:outline-none focus:border-brand-red w-1/2 transition-colors"
                    >
                      {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((hr) => (
                        <option key={hr} value={hr}>{hr}:00</option>
                      ))}
                    </select>
                    <select
                      value={terminateActualEndMin}
                      onChange={(e) => setTerminateActualEndMin(e.target.value)}
                      className="text-xs font-black text-gray-900 border border-gray-300 rounded p-2 bg-white focus:outline-none focus:border-brand-red w-1/2 transition-colors"
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
                    className="w-full text-xs font-black text-gray-900 border border-gray-300 rounded p-2 bg-white focus:outline-none focus:border-brand-red transition-colors"
                  >
                    <option value="Simulator AOG">Simulator AOG (Hardware Defect)</option>
                    <option value="Pilot Illness">Pilot Illness / Medical Incapacity</option>
                    <option value="Operational Emergency">Operational Emergency</option>
                    <option value="Weather / Environmental">Weather / Facility Failure</option>
                  </select>
                </div>

                <AnimatePresence>
                  {terminateError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-2 bg-red-50 border border-red-200 text-brand-red text-[10px] font-bold rounded overflow-hidden"
                    >
                      {terminateError}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowTerminateModal(false)}
                    className="w-1/2 py-2 border border-gray-300 text-gray-700 text-xs font-black uppercase rounded hover:bg-gray-50 cursor-pointer active:scale-95 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase rounded cursor-pointer transition-all active:scale-95 shadow-md"
                  >
                    Confirm Termination
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showGradeModal && gradeModalSession && (
        <GradeSummaryModal
          session={gradeModalSession}
          onClose={() => {
            setShowGradeModal(false);
            setGradeModalSession(null);
          }}
        />
      )}
    </div>
  );
}