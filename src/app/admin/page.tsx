'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import {
  getPilotsPriorityQueue,
  getInstructors,
  getEngineers,
  getSimulators,
  getSessions,
  createSession,
  publishSession,
  cancelSession,
  setSimulatorStatus,
  submitMaintenanceChecklist,
  PilotPriority,
  Instructor,
  Engineer,
  Simulator,
  SimulatorSession
} from '@/services/api';
import { getHubConnection, startConnection } from '@/services/signalr';

const parseIsoDateTime = (isoStr: string) => {
  const parts = isoStr.split('T');
  const dateParts = parts[0].split('-');
  const timeParts = parts[1].split(':');
  return {
    year: parseInt(dateParts[0]),
    month: parseInt(dateParts[1]),
    day: parseInt(dateParts[2]),
    hour: parseInt(timeParts[0]),
    minute: parseInt(timeParts[1])
  };
};

const getDurationInHours = (startTime: string, endTime: string) => {
  const start = parseIsoDateTime(startTime);
  const end = parseIsoDateTime(endTime);
  const startDecimal = start.hour + start.minute / 60;
  const endDecimal = end.hour + end.minute / 60;
  return Math.max(0.5, endDecimal - startDecimal);
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

  const [selectedSlot, setSelectedSlot] = useState<{ day: number; hour: number } | null>(null);
  const [viewedSession, setViewedSession] = useState<SimulatorSession | null>(null);

  const [sessionDay, setSessionDay] = useState<number>(14);
  const [sessionStartHour, setSessionStartHour] = useState<string>('08');
  const [sessionStartMin, setSessionStartMin] = useState<string>('00');
  const [sessionEndHour, setSessionEndHour] = useState<string>('12');
  const [sessionEndMin, setSessionEndMin] = useState<string>('00');
  const [sessionDuration, setSessionDuration] = useState<number>(4);

  const [selectedSimId, setSelectedSimId] = useState('');
  const [selectedSessionType, setSelectedSessionType] = useState('Type Rating');

  const [assignedCaptain, setAssignedCaptain] = useState<PilotPriority | null>(null);
  const [assignedFO, setAssignedFO] = useState<PilotPriority | null>(null);
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

  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Engineers' | 'Instructors'>('Dashboard');
  const [selectedHwSimId, setSelectedHwSimId] = useState('sim-01');

  const mockSimHardware: Record<string, { name: string; level: string; caaId: string; status: string; components: { label: string; value: string; state: 'ok' | 'warn' | 'err' }[] }> = {
    'sim-01': {
      name: 'Jakarta B737-800NG Simulator',
      level: 'Level D',
      caaId: 'IDN-SIM-0042',
      status: 'Fault',
      components: [
        { label: 'Motion Platform', value: '99.2%', state: 'ok' },
        { label: 'Visual System', value: '120 Hz', state: 'ok' },
        { label: 'Image Generators', value: '74 °C', state: 'ok' },
        { label: 'Comms / Audio', value: 'DEGRADED', state: 'warn' },
        { label: 'Hydraulic Power', value: '3000 psi', state: 'ok' },
        { label: 'Thermal / HVAC', value: '21.4 °C', state: 'ok' },
        { label: 'Data Recorder', value: '2.1 TB', state: 'ok' },
        { label: 'FMS / Avionics Bus', value: 'ERR', state: 'err' },
      ],
    },
    'sim-02': {
      name: 'Jakarta A330-900neo Simulator',
      level: 'Level D',
      caaId: 'IDN-SIM-0043',
      status: 'Operational',
      components: [
        { label: 'Motion Platform', value: '100%', state: 'ok' },
        { label: 'Visual System', value: '120 Hz', state: 'ok' },
        { label: 'Image Generators', value: '71 °C', state: 'ok' },
        { label: 'Comms / Audio', value: 'NOMINAL', state: 'ok' },
        { label: 'Hydraulic Power', value: '3000 psi', state: 'ok' },
        { label: 'Thermal / HVAC', value: '22.1 °C', state: 'ok' },
        { label: 'Data Recorder', value: '1.8 TB', state: 'ok' },
        { label: 'FMS / Avionics Bus', value: 'NOMINAL', state: 'ok' },
      ],
    },
    'sim-03': {
      name: 'Jakarta B737 MAX 8 Simulator',
      level: 'Level D',
      caaId: 'IDN-SIM-0044',
      status: 'Down',
      components: [
        { label: 'Motion Platform', value: 'OFFLINE', state: 'err' },
        { label: 'Visual System', value: 'OFFLINE', state: 'err' },
        { label: 'Image Generators', value: 'OFFLINE', state: 'err' },
        { label: 'Comms / Audio', value: 'OFFLINE', state: 'err' },
        { label: 'Hydraulic Power', value: '0 psi', state: 'err' },
        { label: 'Thermal / HVAC', value: 'N/A', state: 'warn' },
        { label: 'Data Recorder', value: '3.0 TB', state: 'ok' },
        { label: 'FMS / Avionics Bus', value: 'OFFLINE', state: 'err' },
      ],
    },
    'sim-04': {
      name: 'Jakarta A320neo Simulator',
      level: 'Level C',
      caaId: 'IDN-SIM-0045',
      status: 'Operational',
      components: [
        { label: 'Motion Platform', value: '98.7%', state: 'ok' },
        { label: 'Visual System', value: '60 Hz', state: 'warn' },
        { label: 'Image Generators', value: '80 °C', state: 'warn' },
        { label: 'Comms / Audio', value: 'NOMINAL', state: 'ok' },
        { label: 'Hydraulic Power', value: '2950 psi', state: 'ok' },
        { label: 'Thermal / HVAC', value: '23.5 °C', state: 'ok' },
        { label: 'Data Recorder', value: '2.5 TB', state: 'ok' },
        { label: 'FMS / Avionics Bus', value: 'NOMINAL', state: 'ok' },
      ],
    },
  };

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
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  const loadData = async () => {
    try {
      const pilotsData = await getPilotsPriorityQueue();
      const instData = await getInstructors();
      const engData = await getEngineers();
      const simsData = await getSimulators();
      const sessData = await getSessions();

      setPilots(pilotsData);
      setInstructors(instData);
      setEngineers(engData);
      setSimulators(simsData);
      setSessions(sessData);
      setSelectedSimId(prev => (prev === '' && simsData.length > 0) ? simsData[0].id : prev);
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
    if (!assignedCaptain) {
      violations.push('No Captain assigned. Dual-crew simulator sessions require an PIC/Captain.');
    }
    if (!assignedFO && selectedSessionType !== 'Single-Pilot') {
      violations.push('No First Officer assigned. Dual-crew sessions require an FO.');
    }
    if (!assignedInstructor) {
      violations.push('No Instructor assigned. Qualified Instructor is required for regulatory grading.');
    }
    const currentSim = simulators.find(s => s.id === selectedSimId);
    if (currentSim && currentSim.status === 'Down') {
      violations.push(`Simulator ${currentSim.name} is currently Down (AOG). Resolve engineering issues first.`);
    }
    setValidationViolations(violations);
  }, [assignedCaptain, assignedFO, assignedInstructor, selectedSimId, selectedSessionType, simulators, selectedSlot]);

  const handleCellClick = (day: number, hour: number) => {
    const isOccupied = sessions.some(s => {
      if (s.status === 'Cancelled') return false;
      const start = parseIsoDateTime(s.startTime);
      const end = parseIsoDateTime(s.endTime);
      return start.day === day && hour >= start.hour && hour < end.hour;
    });

    if (isOccupied) return;

    setViewedSession(null);
    setSelectedSlot({ day, hour });
    setSessionDay(day);
    setSessionStartHour(hour.toString().padStart(2, '0'));
    setSessionStartMin('00');
    setSessionDuration(4);
    
    const endHourNum = Math.min(23, hour + 4);
    setSessionEndHour(endHourNum.toString().padStart(2, '0'));
    setSessionEndMin('00');

    setAssignedCaptain(null);
    setAssignedFO(null);
    setAssignedInstructor(null);
  };

  const handleDurationChange = (duration: number) => {
    setSessionDuration(duration);
    const startHourNum = parseInt(sessionStartHour);
    const startMinNum = parseInt(sessionStartMin);
    const startDecimal = startHourNum + startMinNum / 60;
    const endDecimal = startDecimal + duration;

    let endHourNum = Math.floor(endDecimal);
    let endMinNum = Math.round((endDecimal - endHourNum) * 60);

    if (endHourNum >= 24) {
      endHourNum = 23;
      endMinNum = 59;
    }

    setSessionEndHour(endHourNum.toString().padStart(2, '0'));
    setSessionEndMin(endMinNum.toString().padStart(2, '0'));
  };

  const handleStartTimeChange = (hour: string, minute: string) => {
    setSessionStartHour(hour);
    setSessionStartMin(minute);
    
    const duration = sessionDuration;
    const startDecimal = parseInt(hour) + parseInt(minute) / 60;
    const endDecimal = startDecimal + duration;

    let endHourNum = Math.floor(endDecimal);
    let endMinNum = Math.round((endDecimal - endHourNum) * 60);

    if (endHourNum >= 24) {
      endHourNum = 23;
      endMinNum = 59;
    }

    setSessionEndHour(endHourNum.toString().padStart(2, '0'));
    setSessionEndMin(endMinNum.toString().padStart(2, '0'));
  };

  const handleAssignCrew = (p: PilotPriority) => {
    if (!selectedSlot) return;
    if (p.rank === 'Captain') {
      setAssignedCaptain(p);
    } else {
      setAssignedFO(p);
    }
  };

  const handleAssignInstructor = (i: Instructor) => {
    if (!selectedSlot) return;
    setAssignedInstructor(i);
  };

  const handlePublish = async () => {
    if (!selectedSlot) return;

    const preflightErrors: string[] = [];

    if (!selectedSimId) {
      preflightErrors.push('No Simulator selected. Select a valid simulator from the dropdown before publishing.');
    }
    if (!assignedCaptain) {
      preflightErrors.push('No Captain assigned. Dual-crew simulator sessions require a PIC/Captain.');
    }
    if (!assignedInstructor) {
      preflightErrors.push('No Instructor assigned. A qualified Instructor is required for regulatory grading.');
    }
    if (preflightErrors.length > 0) {
      setValidationViolations(preflightErrors);
      return;
    }

    const startTime = new Date(
      Date.UTC(2026, 6, sessionDay, parseInt(sessionStartHour, 10), parseInt(sessionStartMin, 10), 0)
    ).toISOString();
    const endTime = new Date(
      Date.UTC(2026, 6, sessionDay, parseInt(sessionEndHour, 10), parseInt(sessionEndMin, 10), 0)
    ).toISOString();

    const syllabusId = assignedCaptain!.requiredSyllabus
      || `${selectedSessionType.replace(/\s+/g, '_').toUpperCase()}_CUSTOM`;

    const payload = {
      simulatorId: selectedSimId,
      sessionType: selectedSessionType,
      startTime,
      endTime,
      captainId: assignedCaptain?.pilotId || null,
      firstOfficerId: assignedFO?.pilotId || null,
      instructorId: assignedInstructor?.id || null,
      engineerId: null,
      syllabusId,
      traineeEmployeeCode: assignedCaptain!.employeeCode,
    };

    try {
      const sessResult = await createSession(payload);
      const publishResult = await publishSession(sessResult.sessionId);
      setPublishSuccess(publishResult.message);

      setAssignedCaptain(null);
      setAssignedFO(null);
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
      await setSimulatorStatus(aogSimId, 'Down', aogFault);
      setShowAogModal(false);
      setAogFault('');
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearAog = async (simId: string) => {
    try {
      await setSimulatorStatus(simId, 'Up');
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
        <div className="text-sm font-bold uppercase tracking-widest text-brand-red animate-pulse">
          Loading Simulator Operations Interface...
        </div>
      </div>
    );
  }

  const filteredPilots = pilots.filter(p => {
    const matchesSearch = p.fullName.toLowerCase().includes(pilotSearch.toLowerCase()) || p.employeeCode.toLowerCase().includes(pilotSearch.toLowerCase());
    const matchesRating = selectedRatingFilter === 'ALL' || p.typeRatings.includes(selectedRatingFilter);
    return matchesSearch && matchesRating;
  });

  const getDayName = (dayNum: number) => {
    switch (dayNum) {
      case 14: return 'Monday';
      case 15: return 'Tuesday';
      case 16: return 'Wednesday';
      case 17: return 'Thursday';
      case 18: return 'Friday';
      case 19: return 'Saturday';
      case 20: return 'Sunday';
      default: return '';
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white text-gray-900">
      <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 shrink-0 z-30">
        <div className="flex items-center gap-3">
          <img src="/lion logo.png" alt="Lion Logo" className="w-8 h-8 object-contain" />
          <div className="flex flex-col">
            <span className="text-xs font-black tracking-widest text-gray-950">LION SIMPLANNER</span>
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Flight Simulator Ops</span>
          </div>
        </div>

        <nav className="flex items-center gap-6">
          {(['Dashboard', 'Engineers', 'Instructors'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-xs font-black uppercase tracking-wider py-5 px-1 transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-brand-red text-brand-red'
                  : 'text-gray-600 hover:text-brand-red'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          {user.role === 'Engineer' && (
            <button
              onClick={() => {
                setAogSimId(simulators[0]?.id || '');
                setShowAogModal(true);
              }}
              className="bg-brand-red hover:bg-red-700 text-white font-black text-[9px] px-3 py-1.5 uppercase tracking-wider rounded cursor-pointer transition-colors"
            >
              DECLARE AOG
            </button>
          )}

          <div className="flex items-center gap-3 pl-4 border-l border-gray-150">
            <div className="w-7 h-7 rounded-full bg-brand-red text-white flex items-center justify-center font-black text-xs">
              {user.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div className="hidden md:flex flex-col">
              <span className="text-xs font-black text-gray-950 uppercase leading-none">{user.name}</span>
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{user.role}</span>
            </div>
            <button
              onClick={logout}
              className="text-gray-400 hover:text-brand-red transition-colors cursor-pointer ml-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {publishSuccess && (
        <div className="m-4 p-3 bg-green-50 border border-green-500 text-green-800 text-xs font-bold rounded flex items-center gap-3 shrink-0">
          <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{publishSuccess}</span>
        </div>
      )}

      {activeTab === 'Engineers' && (
        <div className="flex-1 flex overflow-hidden bg-white">
          <div className="w-[30%] h-full border-r border-gray-200 p-4 overflow-y-auto space-y-2">
            <div className="mb-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-gray-950 mb-1">Simulator Machines</h3>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Select a machine to view hardware details</p>
            </div>
            {Object.entries(mockSimHardware).map(([simId, sim]) => (
              <button
                key={simId}
                onClick={() => setSelectedHwSimId(simId)}
                className={`w-full text-left p-4 border rounded transition-all ${
                  selectedHwSimId === simId
                    ? 'border-brand-red bg-red-50 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-black text-gray-900 leading-tight">{sim.name}</div>
                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-1">{sim.level} · {sim.caaId}</div>
                  </div>
                  <span className={`shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded uppercase leading-none ${
                    sim.status === 'Down' ? 'bg-red-50 text-brand-red border border-brand-red'
                    : sim.status === 'Fault' ? 'bg-orange-50 text-orange-600 border border-orange-400'
                    : 'bg-green-50 text-green-600 border border-green-400'
                  }`}>
                    {sim.status}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="flex-1 h-full overflow-y-auto p-6">
            {(() => {
              const hw = mockSimHardware[selectedHwSimId];
              return (
                <div className="max-w-xl space-y-6">
                  <div className="border border-gray-150 rounded p-6 bg-white shadow-sm space-y-6">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                      <div>
                        <span className="text-[8px] font-black text-brand-red uppercase tracking-wider block">Hardware Health Monitor</span>
                        <h3 className="text-sm font-black uppercase text-gray-900 tracking-wider mt-1">{hw.name}</h3>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">{hw.level} · CAA-ID: {hw.caaId}</p>
                      </div>
                      <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase leading-none border ${
                        hw.status === 'Down' ? 'bg-red-50 text-brand-red border-brand-red'
                        : hw.status === 'Fault' ? 'bg-orange-50 text-orange-600 border-orange-400'
                        : 'bg-green-50 text-green-600 border-green-400'
                      }`}>
                        {hw.status}
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {hw.components.map(c => (
                        <div key={c.label} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50">
                          <span className="font-bold text-gray-800">{c.label}</span>
                          <div className="flex items-center gap-2">
                            <span className={`font-black ${
                              c.state === 'err' ? 'text-brand-red'
                              : c.state === 'warn' ? 'text-orange-500'
                              : 'text-green-600'
                            }`}>{c.value}</span>
                            <span className={`w-2 h-2 rounded-full ${
                              c.state === 'err' ? 'bg-brand-red'
                              : c.state === 'warn' ? 'bg-orange-500'
                              : 'bg-green-500'
                            }`} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-gray-100">
                      <div className="flex gap-3">
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
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {activeTab === 'Instructors' && (
        <div className="flex-1 overflow-auto bg-white p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black uppercase text-gray-950 tracking-wider">Pilot Training Grades</h2>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">All completed simulator sessions graded by instructors</p>
            </div>
            <span className="bg-brand-red text-white text-[9px] font-black px-2.5 py-1 rounded uppercase tracking-wider">
              {mockPilotGrades.length} Records
            </span>
          </div>

          <div className="border border-gray-200 rounded overflow-hidden shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Pilot', 'Emp Code', 'Rank', 'Date', 'Session', 'Tech', 'CRM', 'SOP', 'Overall', 'Instructor', 'Notes'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-wider text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {mockPilotGrades.map((g, i) => (
                  <tr key={i} className="bg-white hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3 font-black text-gray-900 whitespace-nowrap">{g.pilot}</td>
                    <td className="px-3 py-3 font-bold text-gray-500 whitespace-nowrap">{g.empCode}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase leading-none ${
                        g.rank === 'Captain' ? 'bg-blue-50 text-blue-600 border border-blue-300' : 'bg-gray-50 text-gray-500 border border-gray-300'
                      }`}>{g.rank}</span>
                    </td>
                    <td className="px-3 py-3 font-bold text-gray-500 whitespace-nowrap">{g.date}</td>
                    <td className="px-3 py-3 font-bold text-gray-800 max-w-[160px] truncate" title={g.session}>{g.session}</td>
                    <td className="px-3 py-3 font-black text-center text-gray-900">{g.techSkills}</td>
                    <td className="px-3 py-3 font-black text-center text-gray-900">{g.crm}</td>
                    <td className="px-3 py-3 font-black text-center text-gray-900">{g.sop}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase leading-none border ${
                        g.overall === 'Excellent' ? 'bg-green-50 text-green-600 border-green-400'
                        : g.overall === 'Unsatisfactory' ? 'bg-red-50 text-brand-red border-brand-red'
                        : 'bg-blue-50 text-blue-600 border-blue-300'
                      }`}>{g.overall}</span>
                    </td>
                    <td className="px-3 py-3 font-bold text-gray-500 whitespace-nowrap">{g.instructor}</td>
                    <td className="px-3 py-3 font-bold text-gray-400 max-w-[200px] truncate" title={g.notes}>{g.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'Dashboard' && <div className="flex-1 flex overflow-hidden bg-white">
        <div className="w-[25%] h-full overflow-y-auto border-r border-gray-200 p-4 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black tracking-widest uppercase text-gray-950">
                Available Pilots
              </h3>
              <span className="px-2 py-0.5 bg-brand-red text-white text-[8px] font-black rounded-full">
                {filteredPilots.length}
              </span>
            </div>

            <div className="space-y-3 mb-4">
              <input
                type="text"
                value={pilotSearch}
                onChange={(e) => setPilotSearch(e.target.value)}
                placeholder="Search pilots..."
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs font-bold text-gray-900 focus:outline-none focus:border-brand-red bg-white"
              />
              <div className="flex flex-wrap gap-1">
                {['ALL', 'B737-800NG', 'B737-900ER', 'B737 MAX 8', 'A320-200', 'A320neo', 'A330-300', 'A330-900neo', 'ATR 72-500', 'ATR 72-600'].map(rating => (
                  <button
                    key={rating}
                    onClick={() => setSelectedRatingFilter(rating)}
                    className={`px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded border ${
                      selectedRatingFilter === rating
                        ? 'bg-brand-red text-white border-brand-red'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {rating}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {filteredPilots.map(p => {
                const expiryDays = Math.max(0, Math.ceil((new Date(p.nextTrainingDue).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));
                let expiryColorClass = '';
                if (expiryDays <= 10) {
                  expiryColorClass = 'text-brand-red bg-red-50 border border-brand-red';
                } else if (expiryDays > 20) {
                  expiryColorClass = 'text-green-600 bg-green-50 border border-green-500';
                } else {
                  expiryColorClass = 'text-gray-500 bg-gray-50 border border-gray-300';
                }
                return (
                  <div key={p.pilotId} className="p-2 border border-gray-150 rounded bg-white flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center font-black text-[10px] shrink-0">
                        {p.fullName.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-black text-gray-900 truncate">{p.fullName}</div>
                        <div className="text-[9px] text-gray-400 uppercase truncate flex items-center gap-1.5 mt-0.5">
                          <span>{p.rank}</span>
                          <span className={`text-[8px] font-black uppercase px-1 py-0.5 rounded leading-none ${expiryColorClass}`}>
                            EXP IN {expiryDays}D
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[8px] border border-brand-red text-brand-red px-1 rounded font-black uppercase leading-none">
                        {p.typeRatings.join(', ')}
                      </span>
                      {selectedSlot && (
                        <button
                          onClick={() => handleAssignCrew(p)}
                          className="bg-brand-red hover:bg-red-700 text-white text-[8px] font-black uppercase px-1 py-0.5 rounded cursor-pointer leading-none"
                        >
                          Assign
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black tracking-widest uppercase text-gray-950">
                Available Instructors
              </h3>
              <span className="px-2 py-0.5 bg-brand-red text-white text-[8px] font-black rounded-full">
                {instructors.length}
              </span>
            </div>
            <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
              {instructors.map(i => (
                <div key={i.id} className="p-2 border border-gray-150 rounded bg-white flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center font-black text-[10px] shrink-0">
                      {i.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-gray-900 truncate">{i.name}</div>
                      <div className="text-[9px] text-gray-400 uppercase truncate">{i.status}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[8px] border border-brand-red text-brand-red px-1 rounded font-black uppercase leading-none">
                      {i.rating}
                    </span>
                    {selectedSlot && (
                      <button
                        onClick={() => handleAssignInstructor(i)}
                        className="bg-brand-red hover:bg-red-700 text-white text-[8px] font-black uppercase px-1 py-0.5 rounded cursor-pointer leading-none"
                      >
                        Assign
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black tracking-widest uppercase text-gray-950">
                On-Shift Engineers
              </h3>
              <span className="px-2 py-0.5 bg-brand-red text-white text-[8px] font-black rounded-full">
                {engineers.length}
              </span>
            </div>
            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
              {engineers.map(e => (
                <div key={e.id} className="p-2 border border-gray-150 rounded bg-white flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center font-black text-[10px] shrink-0">
                      {e.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-gray-900 truncate">{e.name}</div>
                      <div className="text-[9px] text-gray-400 uppercase truncate">{e.status}</div>
                    </div>
                  </div>
                  <span className="text-[8px] border border-gray-300 text-gray-600 px-1 rounded font-black uppercase shrink-0 leading-none">
                    {e.assignedSim}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black tracking-widest uppercase text-gray-950">
                Hardware Status
              </h3>
              <span className="px-2 py-0.5 bg-brand-red text-white text-[8px] font-black rounded-full">
                {simulators.length}
              </span>
            </div>
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {simulators.map(sim => (
                <div key={sim.id} className="p-2 border border-gray-150 rounded bg-white flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-black text-gray-900 truncate">Target Machine: {sim.name}</div>
                    <div className="text-[8px] text-gray-400 uppercase mt-0.5">{sim.typeRating}</div>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${sim.status === 'Up' ? 'bg-green-500' : 'bg-brand-red'} shrink-0`} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="w-1/2 h-full overflow-y-auto p-6">
          <div className="border border-gray-100 rounded p-6 bg-white shadow-sm">
            <div className="mb-4">
              <h3 className="text-sm font-black uppercase text-gray-900">
                Weekly Schedule Grid
              </h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                July 14 – 20, 2026 • Click empty cell to build • Click session to view crew
              </p>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[550px] border border-gray-100 rounded">
                <div className="grid grid-cols-8 bg-gray-50 border-b border-gray-100 text-center font-bold text-[10px] text-gray-500 uppercase py-3">
                  <div>Time</div>
                  {[14, 15, 16, 17, 18, 19, 20].map(day => (
                    <div key={day} className="border-l border-gray-100 flex flex-col justify-center">
                      <span>{getDayName(day).substring(0, 3)}</span>
                      <span className="text-xs font-black text-gray-900 mt-0.5">{day}</span>
                    </div>
                  ))}
                </div>

                <div className="divide-y divide-gray-100">
                  {['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'].map(time => {
                    const hour = parseInt(time.split(':')[0]);
                    return (
                      <div key={time} className="grid grid-cols-8 min-h-[56px] text-xs">
                        <div className="flex items-center justify-center font-bold text-gray-400 bg-gray-50 border-r border-gray-100 py-2">
                          {time}
                        </div>
                        {[14, 15, 16, 17, 18, 19, 20].map(day => {
                          const daySessions = sessions.filter(s => {
                            if (s.status === 'Cancelled') return false;
                            const start = parseIsoDateTime(s.startTime);
                            return start.day === day;
                          });

                          const startingSessions = daySessions.filter(s => {
                            const start = parseIsoDateTime(s.startTime);
                            return start.hour === hour;
                          });

                          const isSelectedDraft = selectedSlot &&
                            selectedSlot.day === day &&
                            hour >= selectedSlot.hour &&
                            hour < Math.min(24, selectedSlot.hour + Math.ceil(sessionDuration));

                          const startHourSelected = selectedSlot && selectedSlot.day === day && selectedSlot.hour === hour;

                          return (
                            <div
                              key={day}
                              onClick={() => handleCellClick(day, hour)}
                              className={`border-r border-gray-100 p-1 relative min-h-[56px] transition-colors ${
                                isSelectedDraft
                                  ? 'bg-red-50'
                                  : 'hover:bg-red-50/20 cursor-pointer bg-white'
                              }`}
                            >
                              {isSelectedDraft && startHourSelected && (
                                  <div
                                    style={{
                                      top: `${Math.round((parseInt(sessionStartMin) / 60) * 56) + 2}px`,
                                      height: `${(sessionDuration * 56) - 4}px`
                                    }}
                                    className="absolute left-0.5 right-0.5 p-1 text-[8px] leading-tight font-black rounded z-10 flex flex-col justify-between border bg-brand-red text-white border-brand-red animate-pulse"
                                  >
                                    <div>
                                      <div className="uppercase">DRAFT</div>
                                      <div className="truncate opacity-95">
                                        {assignedCaptain ? assignedCaptain.fullName : 'No Captain'}
                                      </div>
                                    </div>
                                    <div className="uppercase tracking-widest text-[7px] truncate opacity-90">
                                      {simulators.find(sim => sim.id === selectedSimId)?.name || 'SIM'}
                                    </div>
                                  </div>
                              )}

                              {startingSessions.map(s => {
                                const start = parseIsoDateTime(s.startTime);
                                const duration = getDurationInHours(s.startTime, s.endTime);
                                const heightPx = (duration * 56) - 4;
                                const topOffsetPx = Math.round((start.minute / 60) * 56) + 2;
                                const isSpecial = s.sessionType === 'Type Rating' || s.sessionType === 'OPC';

                                return (
                                  <div
                                    key={s.sessionId}
                                    style={{
                                      top: `${topOffsetPx}px`,
                                      height: `${heightPx}px`
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedSlot(null);
                                      setViewedSession(s);
                                    }}
                                    className={`absolute left-0.5 right-0.5 p-1 text-[8px] leading-tight font-black rounded z-20 flex flex-col justify-between cursor-pointer border ${
                                      isSpecial
                                        ? 'bg-brand-red text-white border-brand-red hover:bg-red-800'
                                        : 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200'
                                    }`}
                                  >
                                    <div>
                                      <div className="uppercase truncate">{s.sessionType}</div>
                                      <div className="truncate opacity-95">
                                        {pilots.find(p => p.pilotId === s.captainId)?.fullName || 'No Pilot'}
                                      </div>
                                    </div>
                                    <div className="uppercase tracking-widest text-[7px] truncate opacity-90 flex items-center justify-between">
                                      <span>{simulators.find(sim => sim.id === s.simulatorId)?.name || 'SIM'}</span>
                                      <span>{duration}h</span>
                                    </div>
                                  </div>
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

        <div className="w-1/4 h-full overflow-y-auto border-l border-gray-200 p-4 shrink-0 bg-white">
          {viewedSession ? (
            <div className="border border-gray-200 rounded p-4 bg-white space-y-5">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black text-gray-900 uppercase">
                    Session Details
                  </h3>
                  <p className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">
                    Scheduled • Read-Only
                  </p>
                </div>
                <button
                  onClick={() => setViewedSession(null)}
                  className="text-xs font-black uppercase text-gray-400 hover:text-brand-red cursor-pointer"
                >
                  Close
                </button>
              </div>

              <div className="space-y-3.5 text-xs font-bold text-gray-700">
                <div>
                  <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider">Session Type</span>
                  <span className="text-xs font-black text-gray-900 uppercase">{viewedSession.sessionType}</span>
                </div>

                <div>
                  <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider">Schedule</span>
                  <span className="text-gray-950">
                    {getDayName(parseIsoDateTime(viewedSession.startTime).day)}, July {parseIsoDateTime(viewedSession.startTime).day}
                  </span>
                  <div className="text-[9px] text-gray-500 mt-0.5">
                    {parseIsoDateTime(viewedSession.startTime).hour.toString().padStart(2, '0')}:
                    {parseIsoDateTime(viewedSession.startTime).minute.toString().padStart(2, '0')} - {' '}
                    {parseIsoDateTime(viewedSession.endTime).hour.toString().padStart(2, '0')}:
                    {parseIsoDateTime(viewedSession.endTime).minute.toString().padStart(2, '0')}
                  </div>
                </div>

                <div>
                  <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">Simulator</span>
                  <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-850 text-[9px]">
                    {simulators.find(sim => sim.id === viewedSession.simulatorId)?.name || 'SIM'}
                  </span>
                </div>

                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">Crew</span>
                  
                  <div className="flex items-center gap-2 p-1.5 bg-gray-50 border border-gray-100 rounded">
                    <div className="w-6 h-6 rounded-full bg-brand-red text-white flex items-center justify-center font-black text-[10px]">
                      C
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-gray-900 text-xs truncate">
                        {pilots.find(p => p.pilotId === viewedSession.captainId)?.fullName || 'Unassigned'}
                      </div>
                      <div className="text-[8px] text-gray-400 uppercase">Captain</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-1.5 bg-gray-50 border border-gray-100 rounded">
                    <div className="w-6 h-6 rounded-full bg-brand-red text-white flex items-center justify-center font-black text-[10px]">
                      F
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-gray-900 text-xs truncate">
                        {pilots.find(p => p.pilotId === viewedSession.firstOfficerId)?.fullName || 'Unassigned'}
                      </div>
                      <div className="text-[8px] text-gray-400 uppercase">First Officer</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-1.5 bg-gray-50 border border-gray-100 rounded">
                    <div className="w-6 h-6 rounded-full bg-brand-red text-white flex items-center justify-center font-black text-[10px]">
                      I
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-gray-900 text-xs truncate">
                        {instructors.find(i => i.id === viewedSession.instructorId)?.name || 'Unassigned'}
                      </div>
                      <div className="text-[8px] text-gray-400 uppercase">Instructor</div>
                    </div>
                  </div>
                </div>
              </div>

              {user.role === 'Admin' && (
                <button
                  onClick={() => handleCancelSession(viewedSession.sessionId)}
                  className="w-full bg-brand-red hover:bg-red-700 text-white font-black py-2 rounded text-xs uppercase tracking-wider cursor-pointer transition-colors"
                >
                  Cancel Session
                </button>
              )}
            </div>
          ) : selectedSlot ? (
            <div className="border border-gray-200 rounded p-4 bg-white space-y-5">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black text-gray-950 uppercase">
                    Session Builder
                  </h3>
                  <p className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">
                    {getDayName(sessionDay)}, July {sessionDay}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedSlot(null)}
                  className="text-xs font-black uppercase text-gray-400 hover:text-brand-red cursor-pointer"
                >
                  Deselect
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">
                      Start
                    </label>
                    <div className="flex gap-0.5">
                      <select
                        value={sessionStartHour}
                        onChange={(e) => handleStartTimeChange(e.target.value, sessionStartMin)}
                        className="text-xs font-black text-gray-900 border border-gray-200 rounded p-1 bg-white focus:outline-none focus:border-brand-red w-full"
                      >
                        {['06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18'].map(hr => (
                          <option key={hr} value={hr}>{hr}</option>
                        ))}
                      </select>
                      <select
                        value={sessionStartMin}
                        onChange={(e) => handleStartTimeChange(sessionStartHour, e.target.value)}
                        className="text-xs font-black text-gray-900 border border-gray-200 rounded p-1 bg-white focus:outline-none focus:border-brand-red w-full"
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
                      className="text-xs font-black text-gray-900 border border-gray-200 rounded p-1 bg-white focus:outline-none focus:border-brand-red w-full"
                    >
                      {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7, 8].map(h => (
                        <option key={h} value={h}>{h} {h === 1 ? 'Hr' : 'Hrs'}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">
                      Simulator
                    </label>
                    <select
                      value={selectedSimId}
                      onChange={(e) => setSelectedSimId(e.target.value)}
                      className="text-xs font-black text-gray-905 border border-gray-200 rounded p-1 bg-white focus:outline-none focus:border-brand-red w-full"
                    >
                      {simulators.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
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
                      className="text-xs font-black text-gray-905 border border-gray-200 rounded p-1 bg-white focus:outline-none focus:border-brand-red w-full"
                    >
                      <option value="Type Rating">Type Rating</option>
                      <option value="OPC">OPC</option>
                      <option value="Recurrent">Recurrent</option>
                      <option value="Single-Pilot">Single-Pilot</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  <div>
                    <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">Captain Zone</span>
                    {assignedCaptain ? (
                      <div className="flex items-center justify-between p-1.5 border border-gray-200 rounded bg-white text-xs">
                        <span className="font-black text-gray-900 truncate max-w-[120px]">{assignedCaptain.fullName}</span>
                        <button onClick={() => setAssignedCaptain(null)} className="text-brand-red font-bold px-1">×</button>
                      </div>
                    ) : (
                      <div className="border border-dashed border-gray-300 rounded p-2 text-center text-[9px] font-bold text-gray-400 bg-gray-50 uppercase tracking-wider">
                        Select Captain Card
                      </div>
                    )}
                  </div>

                  <div>
                    <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">First Officer Zone</span>
                    {assignedFO ? (
                      <div className="flex items-center justify-between p-1.5 border border-gray-200 rounded bg-white text-xs">
                        <span className="font-black text-gray-900 truncate max-w-[120px]">{assignedFO.fullName}</span>
                        <button onClick={() => setAssignedFO(null)} className="text-brand-red font-bold px-1">×</button>
                      </div>
                    ) : (
                      <div className="border border-dashed border-gray-300 rounded p-2 text-center text-[9px] font-bold text-gray-400 bg-gray-50 uppercase tracking-wider">
                        Select First Officer Card
                      </div>
                    )}
                  </div>

                  <div>
                    <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">Instructor Zone</span>
                    {assignedInstructor ? (
                      <div className="flex items-center justify-between p-1.5 border border-gray-200 rounded bg-white text-xs">
                        <span className="font-black text-gray-900 truncate max-w-[120px]">{assignedInstructor.name}</span>
                        <button onClick={() => setAssignedInstructor(null)} className="text-brand-red font-bold px-1">×</button>
                      </div>
                    ) : (
                      <div className="border border-dashed border-gray-300 rounded p-2 text-center text-[9px] font-bold text-gray-400 bg-gray-50 uppercase tracking-wider">
                        Select Instructor Card
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {validationViolations.length > 0 && (
                <div className="border border-red-200 bg-red-50 rounded p-2 text-[10px] text-brand-red font-bold">
                  <ul className="list-disc list-inside space-y-0.5">
                    {validationViolations.map((v, idx) => (
                      <li key={idx} className="leading-tight">{v}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={handlePublish}
                disabled={validationViolations.length > 0}
                className="w-full flex justify-center items-center gap-1.5 py-3 border border-transparent rounded shadow text-xs font-black uppercase tracking-widest text-white bg-brand-red hover:bg-red-700 cursor-pointer disabled:opacity-50"
              >
                <span>Validate & Publish</span>
              </button>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 bg-gray-50 rounded">
              <svg className="w-8 h-8 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h4 className="text-xs font-black text-gray-450 uppercase tracking-wider text-center">
                Pairing Builder Inactive
              </h4>
              <p className="text-[9px] font-bold text-gray-400 text-center uppercase tracking-wider mt-1 leading-relaxed">
                Select an empty calendar grid cell in the center canvas to start scheduling
              </p>
            </div>
          )}
        </div>
      </div>}

      {showAogModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-100 p-6 rounded shadow-xl max-w-md w-full">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded text-xs font-bold bg-white text-gray-900"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded text-xs font-bold text-gray-900 bg-white"
                  rows={3}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAogModal(false)}
                  className="px-4 py-2 border border-gray-200 rounded text-xs font-bold uppercase text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-red hover:bg-red-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer"
                >
                  Trigger Shutdown
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showMaintModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-100 p-6 rounded shadow-xl max-w-md w-full">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded text-xs font-bold bg-white text-gray-900"
                >
                  {simulators.map(s => (
                    <option key={s.id} value={s.id}>{s.name} - {s.typeRating}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="cleared"
                  checked={maintIsCleared}
                  onChange={(e) => setMaintIsCleared(e.target.checked)}
                  className="w-4 h-4 text-brand-red border-gray-300 rounded focus:ring-brand-red"
                />
                <label htmlFor="cleared" className="text-xs font-bold text-gray-700 uppercase tracking-wider">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded text-xs font-bold text-gray-900 bg-white"
                  rows={3}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowMaintModal(false)}
                  className="px-4 py-2 border border-gray-200 rounded text-xs font-bold uppercase text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-red hover:bg-red-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer"
                >
                  Sign Off Checklist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
