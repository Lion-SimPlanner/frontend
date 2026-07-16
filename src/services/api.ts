import axios from 'axios';

export const API_BASE_URL = 'http://localhost:5011';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
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

export const getPilotsPriorityQueue = async (
  syllabusFilter?: string,
  typeRating?: string
): Promise<PilotPriority[]> => {
  const params: Record<string, string> = {};
  if (syllabusFilter) params.syllabusFilter = syllabusFilter;
  if (typeRating) params.typeRating = typeRating;
  const response = await apiClient.get<PilotPriority[]>('/api/personnel/pilots/priority-queue', { params });
  return response.data;
};

export const getInstructors = async (): Promise<Instructor[]> => {
  const response = await apiClient.get<any[]>('/api/personnel/instructors');
  return response.data.map((i) => ({
    id: i.id,
    name: i.fullName,
    rating: (i.certifiedTypes as string[])?.[0] ?? '',
    status: 'On-Duty',
    employeeCode: i.employeeCode,
  }));
};

export const getEngineers = async (): Promise<Engineer[]> => {
  const response = await apiClient.get<any[]>('/api/asset/engineers');
  return response.data.map((e) => ({
    id: e.id,
    name: e.name,
    status: 'On-Shift',
    assignedSim: (e.hardwareRatings as string[])?.[0] ?? '',
    employeeCode: e.employeeCode,
  }));
};

export const getSimulators = async (): Promise<Simulator[]> => {
  const response = await apiClient.get<any[]>('/api/asset/simulators');
  return response.data.map((s) => ({
    id: s.id,
    name: s.name,
    typeRating: s.aircraftType,
    status: s.status === 'Down' ? 'Down' : 'Up',
  }));
};

export const getSessions = async (): Promise<SimulatorSession[]> => {
  const response = await apiClient.get<SimulatorSession[]>('/api/scheduling/sessions');
  return response.data;
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
  const response = await apiClient.post('/api/scheduling/sessions', req);
  return response.data;
};

export const publishSession = async (
  id: string
): Promise<{ sessionId: string; status: string; message: string }> => {
  const response = await apiClient.put(`/api/scheduling/sessions/${id}/publish`);
  return response.data;
};

export const cancelSession = async (
  id: string,
  reason: string
): Promise<{ sessionId: string; status: string }> => {
  const response = await apiClient.put(`/api/scheduling/sessions/${id}/cancel`, { reason });
  return response.data;
};

export const submitMaintenanceChecklist = async (req: {
  simulatorId: string;
  checklistDate: string;
  isCleared: boolean;
  notes: string;
  blockingReason?: string;
}): Promise<{ checklistId: string; simulatorId: string; isCleared: boolean; shieldStatus: string }> => {
  const response = await apiClient.post('/api/asset/maintenance/checklist', req);
  return response.data;
};

export const setSimulatorStatus = async (
  id: string,
  status: string,
  faultDescription?: string
): Promise<{ simulatorId: string; newStatus: string; aogTriggered: boolean }> => {
  const response = await apiClient.post(`/api/asset/simulators/${id}/status`, {
    status,
    faultDescription,
  });
  return response.data;
};
