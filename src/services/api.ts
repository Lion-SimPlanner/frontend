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

const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function ensureUuid(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v === '') return null;
  return uuidRegex.test(v) ? v : null;
}

function sanitizePayload(payload: Record<string, any>, uuidFields: string[], requiredFields: string[] = []): Record<string, any> {
  const out: Record<string, any> = { ...payload };
  for (const f of uuidFields) {
    if (Object.prototype.hasOwnProperty.call(out, f)) {
      const val = out[f];
      const ensured = ensureUuid(val);
      out[f] = ensured === null ? null : ensured;
    }
  }
  for (const r of requiredFields) {
    if (!out[r] || out[r] === null) throw new Error(`Missing required field: ${r}`);
  }
  return out;
}

function normalizeUtcIso(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return undefined;
  return dt.toISOString();
}

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
  ratings: string[];
  certifiedTypes: string[];
  authorizedSyllabi: string[];
  status: string;
  employeeCode: string;
  licenseExpiry?: string;
  lastDutyEndTime?: string;
  nextDutyStartTime?: string;
  currentMonthlyHours?: number;
  maxMonthlyHours?: number;
}

export interface Engineer {
  id: string;
  name: string;
  status: string;
  assignedSim: string;
  employeeCode: string;
  shiftStart?: string;
  shiftEnd?: string;
  isOnCall?: boolean;
}

export interface Simulator {
  id: string;
  name: string;
  typeRating: string;
  status: 'Up' | 'Down';
  lastChangedAt?: string;
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
    ratings: Array.isArray(i.certifiedTypes) ? i.certifiedTypes : [],
    certifiedTypes: Array.isArray(i.certifiedTypes) ? i.certifiedTypes : [],
    authorizedSyllabi: Array.isArray(i.authorizedSyllabi) ? i.authorizedSyllabi : [],
    status: 'On-Duty',
    employeeCode: i.employeeCode,
    licenseExpiry: normalizeUtcIso(i.licenseExpiry),
    lastDutyEndTime: normalizeUtcIso(i.lastDutyEndTime),
    nextDutyStartTime: normalizeUtcIso(i.nextDutyStartTime),
    currentMonthlyHours: typeof i.currentMonthlyHours === 'number' ? i.currentMonthlyHours : undefined,
    maxMonthlyHours: typeof i.maxMonthlyHours === 'number' ? i.maxMonthlyHours : undefined,
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
    shiftStart: normalizeUtcIso(e.shiftStart),
    shiftEnd: normalizeUtcIso(e.shiftEnd),
    isOnCall: typeof e.isOnCall === 'boolean' ? e.isOnCall : undefined,
  }));
};

export const getSimulators = async (): Promise<Simulator[]> => {
  const response = await apiClient.get<any[]>('/api/asset/simulators');
  return response.data.map((s) => ({
    id: s.id,
    name: s.name,
    typeRating: s.aircraftType,
    status: s.status === 'Down' ? 'Down' : 'Up',
    lastChangedAt: normalizeUtcIso(s.lastChangedAt),
  }));
};

export const getSessions = async (): Promise<SimulatorSession[]> => {
  const response = await apiClient.get<SimulatorSession[]>('/api/scheduling/sessions');
  return response.data.map((s) => ({
    ...s,
    startTime: normalizeUtcIso(s.startTime) ?? s.startTime,
    endTime: normalizeUtcIso(s.endTime) ?? s.endTime,
  }));
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
  const sanitized = sanitizePayload(req as Record<string, any>, ['simulatorId', 'captainId', 'firstOfficerId', 'instructorId', 'engineerId'], ['simulatorId', 'startTime', 'endTime', 'syllabusId', 'traineeEmployeeCode']);
  const normalizedStartTime = normalizeUtcIso(sanitized.startTime);
  const normalizedEndTime = normalizeUtcIso(sanitized.endTime);
  if (!normalizedStartTime || !normalizedEndTime) throw new Error('Invalid session datetime payload');
  sanitized.startTime = normalizedStartTime;
  sanitized.endTime = normalizedEndTime;
  const response = await apiClient.post('/api/scheduling/sessions', sanitized);
  return response.data;
};

export const publishSession = async (
  id: string
): Promise<{ sessionId: string; status: string; message: string }> => {
  const valid = ensureUuid(id);
  if (!valid) throw new Error('Invalid session id');
  const response = await apiClient.put(`/api/scheduling/sessions/${valid}/publish`);
  return response.data;
};

export const cancelSession = async (
  id: string,
  reason: string
): Promise<{ sessionId: string; status: string }> => {
  const valid = ensureUuid(id);
  if (!valid) throw new Error('Invalid session id');
  const response = await apiClient.put(`/api/scheduling/sessions/${valid}/cancel`, { reason });
  return response.data;
};

export const submitMaintenanceChecklist = async (req: {
  simulatorId: string;
  checklistDate: string;
  isCleared: boolean;
  notes: string;
  blockingReason?: string;
}): Promise<{ checklistId: string; simulatorId: string; isCleared: boolean; shieldStatus: string }> => {
  const sanitized = sanitizePayload(req as Record<string, any>, ['simulatorId'], ['simulatorId', 'checklistDate']);
  const response = await apiClient.post('/api/asset/maintenance/checklist', sanitized);
  return response.data;
};

export const setSimulatorStatus = async (
  id: string,
  status: string,
  faultDescription?: string
): Promise<{ simulatorId: string; newStatus: string; aogTriggered: boolean }> => {
  const valid = ensureUuid(id);
  if (!valid) throw new Error('Invalid simulator id');
  const response = await apiClient.post(`/api/asset/simulators/${valid}/status`, {
    status,
    faultDescription,
  });
  return response.data;
};
