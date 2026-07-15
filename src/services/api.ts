import axios from 'axios';

const API_BASE_URL = 'http://localhost:5011';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export interface PilotPriority {
  pilotId: string;
  employeeCode: string;
  fullName: string;
  rank: string;
  nextTrainingDue: string;
  requiredSyllabus: string;
  typeRatings: string[];
  medicalExpiry: string;
  lastDutyEndTime?: string;
  nextDutyStartTime?: string;
}

export interface Instructor {
  id: string;
  name: string;
  rating: string;
  status: string;
  employeeCode: string;
}

export interface Engineer {
  id: string;
  name: string;
  status: string;
  assignedSim: string;
  employeeCode: string;
}

export interface Simulator {
  id: string;
  name: string;
  typeRating: string;
  status: 'Up' | 'Down';
}

export interface SimulatorSession {
  sessionId: string;
  simulatorId: string;
  sessionType: string;
  status: 'Draft' | 'Scheduled' | 'InProgress' | 'Completed' | 'Cancelled';
  startTime: string;
  endTime: string;
  captainId?: string;
  firstOfficerId?: string;
  instructorId?: string;
  engineerId?: string;
  syllabusId: string;
  traineeEmployeeCode: string;
  isGraded: boolean;
  gradeStatus?: string;
  instructorNotes?: string;
  cancellationReason?: string;
}

export interface ValidationGateErrorResponse {
  message: string;
  violations: string[];
}

const mockSimulators: Simulator[] = [
  { id: 'sim-01', name: 'Jakarta B737-800NG Simulator', typeRating: 'B737-800NG', status: 'Up' },
  { id: 'sim-02', name: 'Jakarta A320-200 Simulator', typeRating: 'A320-200', status: 'Up' },
  { id: 'sim-03', name: 'Jakarta A330-900neo Simulator', typeRating: 'A330-900neo', status: 'Up' },
  { id: 'sim-04', name: 'Jakarta B737 MAX 8 Simulator', typeRating: 'B737 MAX 8', status: 'Down' },
];

const mockInstructors: Instructor[] = [
  { id: 'ins-01', name: 'Instr. I. Nakamura', rating: 'A330-900neo', status: 'On-Duty', employeeCode: 'INS-001' },
  { id: 'ins-02', name: 'Instr. D. Reeves', rating: 'A320-200', status: 'On-Duty', employeeCode: 'INS-002' },
  { id: 'ins-03', name: 'Instr. P. Langley', rating: 'B737-800NG', status: 'On-Duty', employeeCode: 'INS-003' },
];

const mockEngineers: Engineer[] = [
  { id: 'eng-01', name: 'Eng. M. Kowalski', status: 'On-Shift', assignedSim: 'SIM-01', employeeCode: 'ENG-001' },
  { id: 'eng-02', name: 'Eng. F. Adisa', status: 'On-Shift', assignedSim: 'SIM-02', employeeCode: 'ENG-002' },
  { id: 'eng-03', name: 'Eng. T. Brennan', status: 'On-Shift', assignedSim: 'SIM-03', employeeCode: 'ENG-003' },
];

const mockPilots: PilotPriority[] = [
  {
    pilotId: 'pilot-01',
    employeeCode: 'PLT-001',
    fullName: 'Capt. R. Holt',
    rank: 'Captain',
    nextTrainingDue: '2026-07-19',
    requiredSyllabus: 'Type Rating',
    typeRatings: ['B737-800NG'],
    medicalExpiry: '2027-01-01',
  },
  {
    pilotId: 'pilot-02',
    employeeCode: 'PLT-002',
    fullName: 'F/O S. Chen',
    rank: 'First Officer',
    nextTrainingDue: '2026-08-10',
    requiredSyllabus: 'Recurrent',
    typeRatings: ['A320-200'],
    medicalExpiry: '2027-02-01',
  },
  {
    pilotId: 'pilot-03',
    employeeCode: 'PLT-003',
    fullName: 'Capt. M. Ellis',
    rank: 'Captain',
    nextTrainingDue: '2026-07-28',
    requiredSyllabus: 'OPC',
    typeRatings: ['A330-900neo'],
    medicalExpiry: '2026-12-15',
  },
  {
    pilotId: 'pilot-04',
    employeeCode: 'PLT-004',
    fullName: 'Capt. L. Beaumont',
    rank: 'Captain',
    nextTrainingDue: '2026-07-22',
    requiredSyllabus: 'Type Rating',
    typeRatings: ['B737-800NG'],
    medicalExpiry: '2026-11-30',
  },
  {
    pilotId: 'pilot-05',
    employeeCode: 'PLT-005',
    fullName: 'F/O D. Nakagawa',
    rank: 'First Officer',
    nextTrainingDue: '2026-08-25',
    requiredSyllabus: 'OPC',
    typeRatings: ['A320-200'],
    medicalExpiry: '2027-03-01',
  },
  {
    pilotId: 'pilot-06',
    employeeCode: 'PLT-006',
    fullName: 'Capt. S. Okonkwo',
    rank: 'Captain',
    nextTrainingDue: '2026-07-29',
    requiredSyllabus: 'Recurrent',
    typeRatings: ['B737 MAX 8'],
    medicalExpiry: '2027-05-01',
  },
];

const mockSessions: SimulatorSession[] = [
  {
    sessionId: 'session-01',
    simulatorId: 'sim-01',
    sessionType: 'Type Rating',
    status: 'Scheduled',
    startTime: '2026-07-14T07:00:00',
    endTime: '2026-07-14T09:00:00',
    captainId: 'pilot-01',
    instructorId: 'ins-03',
    syllabusId: 'SYLL-01',
    traineeEmployeeCode: 'PLT-001',
    isGraded: false,
  },
  {
    sessionId: 'session-02',
    simulatorId: 'sim-03',
    sessionType: 'OPC',
    status: 'Scheduled',
    startTime: '2026-07-15T06:00:00',
    endTime: '2026-07-15T09:00:00',
    captainId: 'pilot-03',
    instructorId: 'ins-01',
    syllabusId: 'SYLL-02',
    traineeEmployeeCode: 'PLT-003',
    isGraded: false,
  },
  {
    sessionId: 'session-03',
    simulatorId: 'sim-04',
    sessionType: 'Recurrent',
    status: 'Scheduled',
    startTime: '2026-07-16T08:00:00',
    endTime: '2026-07-16T10:00:00',
    captainId: 'pilot-02',
    instructorId: 'ins-02',
    syllabusId: 'SYLL-03',
    traineeEmployeeCode: 'PLT-002',
    isGraded: false,
  },
  {
    sessionId: 'session-04',
    simulatorId: 'sim-01',
    sessionType: 'Type Rating',
    status: 'Scheduled',
    startTime: '2026-07-17T07:00:00',
    endTime: '2026-07-17T09:00:00',
    captainId: 'pilot-04',
    instructorId: 'ins-03',
    syllabusId: 'SYLL-01',
    traineeEmployeeCode: 'PLT-004',
    isGraded: false,
  },
  {
    sessionId: 'session-05',
    simulatorId: 'sim-04',
    sessionType: 'Recurrent',
    status: 'Scheduled',
    startTime: '2026-07-18T06:00:00',
    endTime: '2026-07-18T08:00:00',
    captainId: 'pilot-06',
    instructorId: 'ins-03',
    syllabusId: 'SYLL-03',
    traineeEmployeeCode: 'PLT-006',
    isGraded: false,
  },
  {
    sessionId: 'session-06',
    simulatorId: 'sim-03',
    sessionType: 'OPC',
    status: 'Scheduled',
    startTime: '2026-07-18T10:00:00',
    endTime: '2026-07-18T12:00:00',
    captainId: 'pilot-03',
    instructorId: 'ins-01',
    syllabusId: 'SYLL-02',
    traineeEmployeeCode: 'PLT-003',
    isGraded: false,
  },
  {
    sessionId: 'session-07',
    simulatorId: 'sim-02',
    sessionType: 'Line Check',
    status: 'Scheduled',
    startTime: '2026-07-20T09:00:00',
    endTime: '2026-07-20T11:00:00',
    captainId: 'pilot-02',
    instructorId: 'ins-02',
    syllabusId: 'SYLL-04',
    traineeEmployeeCode: 'PLT-002',
    isGraded: false,
  },
];

let localSessions = [...mockSessions];
let localSimulators = [...mockSimulators];

export const getPilotsPriorityQueue = async (syllabusFilter?: string, typeRating?: string): Promise<PilotPriority[]> => {
  try {
    const params: Record<string, string> = {};
    if (syllabusFilter) params.syllabusFilter = syllabusFilter;
    if (typeRating) params.typeRating = typeRating;
    const response = await apiClient.get<PilotPriority[]>('/api/personnel/pilots/priority-queue', { params });
    return response.data;
  } catch {
    let filtered = [...mockPilots];
    if (syllabusFilter) {
      filtered = filtered.filter(p => p.requiredSyllabus.toLowerCase() === syllabusFilter.toLowerCase());
    }
    if (typeRating) {
      filtered = filtered.filter(p => p.typeRatings.includes(typeRating));
    }
    return filtered;
  }
};

export const getInstructors = async (): Promise<Instructor[]> => {
  return mockInstructors;
};

export const getEngineers = async (): Promise<Engineer[]> => {
  return mockEngineers;
};

export const getSimulators = async (): Promise<Simulator[]> => {
  return localSimulators;
};

export const getSessions = async (): Promise<SimulatorSession[]> => {
  return localSessions;
};

export const createSession = async (req: {
  simulatorId: string;
  sessionType: string;
  startTime: string;
  endTime: string;
  captainId?: string;
  firstOfficerId?: string;
  instructorId?: string;
  engineerId?: string;
  syllabusId: string;
  traineeEmployeeCode: string;
}): Promise<{ sessionId: string; status: string }> => {
  try {
    const response = await apiClient.post('/api/scheduling/sessions', req);
    return response.data;
  } catch {
    const newSession: SimulatorSession = {
      sessionId: 'sess-' + Math.random().toString(36).substr(2, 9),
      simulatorId: req.simulatorId,
      sessionType: req.sessionType,
      status: 'Draft',
      startTime: req.startTime,
      endTime: req.endTime,
      captainId: req.captainId,
      firstOfficerId: req.firstOfficerId,
      instructorId: req.instructorId,
      engineerId: req.engineerId,
      syllabusId: req.syllabusId,
      traineeEmployeeCode: req.traineeEmployeeCode,
      isGraded: false,
    };
    localSessions.push(newSession);
    return { sessionId: newSession.sessionId, status: 'Draft' };
  }
};

export const publishSession = async (id: string): Promise<{ sessionId: string; status: string; message: string }> => {
  try {
    const response = await apiClient.put(`/api/scheduling/sessions/${id}/publish`);
    return response.data;
  } catch {
    const session = localSessions.find(s => s.sessionId === id);
    if (!session) {
      throw new Error('Session not found');
    }
    const violations: string[] = [];
    if (!session.captainId) {
      violations.push('Validation Gate Blocked: No Captain assigned. Assign a Captain before publishing.');
    }
    if (!session.instructorId) {
      violations.push('Validation Gate Blocked: No Instructor assigned. Assign a qualified Instructor before publishing.');
    }
    const sim = localSimulators.find(s => s.id === session.simulatorId);
    if (sim && sim.status === 'Down') {
      violations.push(`Validation Gate Blocked: Simulator ${sim.name} is currently Down (AOG) and cannot host published sessions.`);
    }

    if (violations.length > 0) {
      const error: any = new Error('Validation Gate Blocked');
      error.response = {
        status: 422,
        data: {
          message: 'Session publish blocked by Validation Gate. Resolve all violations and retry.',
          violations: violations,
        },
      };
      throw error;
    }

    session.status = 'Scheduled';
    return {
      sessionId: id,
      status: 'Scheduled',
      message: 'Session published. Crew notification emails dispatched.',
    };
  }
};

export const cancelSession = async (id: string, reason: string): Promise<{ sessionId: string; status: string }> => {
  try {
    const response = await apiClient.put(`/api/scheduling/sessions/${id}/cancel`, { reason });
    return response.data;
  } catch {
    const session = localSessions.find(s => s.sessionId === id);
    if (session) {
      session.status = 'Cancelled';
      session.cancellationReason = reason;
    }
    return { sessionId: id, status: 'Cancelled' };
  }
};

export const submitMaintenanceChecklist = async (req: {
  simulatorId: string;
  checklistDate: string;
  isCleared: boolean;
  notes: string;
  blockingReason?: string;
}): Promise<{ checklistId: string; simulatorId: string; isCleared: boolean; shieldStatus: string }> => {
  try {
    const response = await apiClient.post('/api/asset/maintenance/checklist', req);
    return response.data;
  } catch {
    const sim = localSimulators.find(s => s.id === req.simulatorId);
    if (sim) {
      sim.status = req.isCleared ? 'Up' : 'Down';
    }
    return {
      checklistId: 'chk-' + Math.random().toString(36).substr(2, 9),
      simulatorId: req.simulatorId,
      isCleared: req.isCleared,
      shieldStatus: req.isCleared ? 'RAISED' : 'BLOCKED',
    };
  }
};

export const setSimulatorStatus = async (id: string, status: string, faultDescription?: string): Promise<{ simulatorId: string; newStatus: string; aogTriggered: boolean }> => {
  try {
    const response = await apiClient.post(`/api/asset/simulators/${id}/status`, { status, faultDescription });
    return response.data;
  } catch {
    const sim = localSimulators.find(s => s.id === id);
    if (sim) {
      sim.status = status as 'Up' | 'Down';
    }
    const isDown = status.toLowerCase() === 'down';
    if (isDown) {
      localSessions = localSessions.map(s => {
        if (s.simulatorId === id && (s.status === 'Scheduled' || s.status === 'InProgress')) {
          return {
            ...s,
            status: 'Cancelled',
            cancellationReason: `SIMULATOR AOG - Taken offline. Fault: ${faultDescription || 'Mechanical Fault'}`
          };
        }
        return s;
      });
    }
    return {
      simulatorId: id,
      newStatus: status,
      aogTriggered: isDown,
    };
  }
};
