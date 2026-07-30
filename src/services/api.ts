import axios from 'axios';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5011';

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
  isExternalUser: boolean;
  nextTrainingDue: string;
  requiredSyllabus?: string;
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
  typeRatings?: string[];
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
  checkoutTime?: string;
}

export interface Simulator {
  id: string;
  name: string;
  typeRating: string;
  status: 'Ready' | 'AOG' | 'MEL' | 'Defect' | 'Up' | 'Down';
  lastChangedAt?: string;
  lastDailySignOffDate: string | null;
}

export interface SimulatorSession {
  sessionId: string;
  simulatorId: string;
  sessionType: string;
  status: 'Draft' | 'Scheduled' | 'InProgress' | 'Completed' | 'Cancelled' | 'TerminatedEarly';
  startTime: string;
  endTime: string;
  originalEndTime?: string;
  terminationReason?: string;
  captainId?: string;
  captainName?: string;
  firstOfficerId?: string;
  firstOfficerName?: string;
  instructorId?: string;
  instructorName?: string;
  engineerId?: string;
  syllabusId: string;
  traineeEmployeeCode: string;
  traineeName?: string;
  traineeRole?: 'Captain' | 'First Officer';
  isGraded: boolean;
  gradeStatus?: string;
  instructorNotes?: string;
  cancellationReason?: string;
}

export interface ValidationGateErrorResponse {
  message: string;
  violations: string[];
}

export interface TimeDebtRecord {
  pilotId?: string;
  traineeName: string;
  traineeEmployeeCode: string;
  typeRating: string;
  totalDebtMinutes: number;
  terminatedSessionCount: number;
  lastTerminationReason?: string;
}

export function calculateTimeDebts(
  sessions: SimulatorSession[],
  pilots: PilotPriority[] = []
): TimeDebtRecord[] {
  const debtMap = new Map<string, TimeDebtRecord>();

  for (const s of sessions) {
    if (s.status !== 'TerminatedEarly') continue;

    let debtMinutes = 0;
    if (s.originalEndTime && s.endTime) {
      const orig = new Date(s.originalEndTime).getTime();
      const actual = new Date(s.endTime).getTime();
      if (!isNaN(orig) && !isNaN(actual) && orig > actual) {
        debtMinutes = Math.round((orig - actual) / (1000 * 60));
      }
    }

    if (debtMinutes <= 0) {
      debtMinutes = 120;
    }

    const code = s.traineeEmployeeCode || s.captainId || 'UNKNOWN';
    const pilotObj = pilots.find(
      (p) => p.employeeCode === code || p.pilotId === s.captainId
    );
    const name =
      s.traineeName ||
      s.captainName ||
      pilotObj?.fullName ||
      `Trainee (${code})`;
    const typeRating =
      pilotObj?.typeRatings?.[0] ||
      (s.syllabusId ? s.syllabusId.split('_')[0] : 'B737');

    if (!debtMap.has(code)) {
      debtMap.set(code, {
        pilotId: pilotObj?.pilotId || s.captainId,
        traineeName: name,
        traineeEmployeeCode: code,
        typeRating,
        totalDebtMinutes: debtMinutes,
        terminatedSessionCount: 1,
        lastTerminationReason: s.terminationReason || 'Simulator AOG',
      });
    } else {
      const existing = debtMap.get(code)!;
      existing.totalDebtMinutes += debtMinutes;
      existing.terminatedSessionCount += 1;
      if (s.terminationReason) {
        existing.lastTerminationReason = s.terminationReason;
      }
    }
  }

  return Array.from(debtMap.values()).sort(
    (a, b) => b.totalDebtMinutes - a.totalDebtMinutes
  );
}

export function formatDebtDuration(totalMinutes: number): string {
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m owed`;
  if (hrs > 0) return `${hrs}h 00m owed`;
  return `${mins}m owed`;
}

export const getPilotsPriorityQueue = async (
  syllabusFilter?: string,
  typeRating?: string
): Promise<PilotPriority[]> => {
  const params: Record<string, string> = {};
  if (syllabusFilter) params.syllabusFilter = syllabusFilter;
  if (typeRating) params.typeRating = typeRating;
  const response = await apiClient.get<any[]>('/api/personnel/pilots/priority-queue', { params });
  return response.data.map((p) => ({
    pilotId: p.pilotId,
    employeeCode: p.employeeCode,
    fullName: p.fullName,
    rank: p.rank,
    isExternalUser: Boolean(p.isExternalUser),
    nextTrainingDue: normalizeUtcIso(p.nextTrainingDue) ?? new Date().toISOString(),
    requiredSyllabus: typeof p.requiredSyllabus === 'string' ? p.requiredSyllabus : undefined,
    typeRatings: Array.isArray(p.typeRatings) ? p.typeRatings : [],
    medicalExpiry: normalizeUtcIso(p.medicalExpiry) ?? new Date().toISOString(),
    lastDutyEndTime: normalizeUtcIso(p.lastDutyEndTime),
    nextDutyStartTime: normalizeUtcIso(p.nextDutyStartTime),
  }));
};

export const createExternalPilot = async (req: {
  fullName: string;
  email?: string;
  contactNumber?: string;
  companyName?: string;
}): Promise<PilotPriority> => {
  const response = await apiClient.post('/api/pilots/external', req);
  const p = response.data;
  return {
    pilotId: p.pilotId,
    employeeCode: p.employeeCode,
    fullName: p.fullName,
    rank: p.rank,
    isExternalUser: Boolean(p.isExternalUser),
    nextTrainingDue: normalizeUtcIso(p.nextTrainingDue) ?? new Date().toISOString(),
    requiredSyllabus: typeof p.requiredSyllabus === 'string' ? p.requiredSyllabus : undefined,
    typeRatings: Array.isArray(p.typeRatings) ? p.typeRatings : [],
    medicalExpiry: normalizeUtcIso(p.medicalExpiry) ?? new Date().toISOString(),
    lastDutyEndTime: normalizeUtcIso(p.lastDutyEndTime),
    nextDutyStartTime: normalizeUtcIso(p.nextDutyStartTime),
  };
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
    checkoutTime: normalizeUtcIso(e.checkoutTime),
  }));
};

export const getSimulators = async (): Promise<Simulator[]> => {
  const response = await apiClient.get<any[]>('/api/asset/simulators');
  return response.data.map((s) => ({
    id: s.id,
    name: s.name,
    typeRating: s.aircraftType,
    status:
      s.status === 'AOG' || s.status === 'MEL' || s.status === 'Defect' || s.status === 'Ready'
        ? s.status
        : s.status === 'Down'
          ? 'AOG'
          : 'Ready',
    lastChangedAt: normalizeUtcIso(s.lastChangedAt),
    lastDailySignOffDate: typeof s.lastDailySignOffDate === 'string' && s.lastDailySignOffDate.trim() !== ''
      ? s.lastDailySignOffDate
      : null,
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
  const response = await apiClient.post('/api/sessions', sanitized);
  return response.data;
};

export const rescheduleSession = async (
  sessionId: string,
  startTime: string,
  endTime: string
): Promise<{ sessionId: string; status: string; startTime: string; endTime: string }> => {
  const valid = ensureUuid(sessionId);
  if (!valid) throw new Error('Invalid session id');
  const normalizedStart = normalizeUtcIso(startTime);
  const normalizedEnd = normalizeUtcIso(endTime);
  if (!normalizedStart || !normalizedEnd) throw new Error('Invalid reschedule datetime payload');
  const response = await apiClient.put(`/api/sessions/${valid}`, {
    startTime: normalizedStart,
    endTime: normalizedEnd,
  });
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

export const startSession = async (id: string): Promise<SimulatorSession> => {
  const valid = ensureUuid(id);
  if (!valid) throw new Error('Invalid session id');
  const response = await apiClient.patch(`/api/sessions/${valid}/start`);
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

export const terminateSessionEarly = async (
  id: string,
  actualEndTime: string,
  reason: string
): Promise<SimulatorSession> => {
  const valid = ensureUuid(id);
  if (!valid) throw new Error('Invalid session id');
  const normalizedActualEnd = normalizeUtcIso(actualEndTime);
  if (!normalizedActualEnd) throw new Error('Invalid actual end time payload');
  const response = await apiClient.patch(`/api/sessions/${valid}/terminate-early`, {
    actualEndTime: normalizedActualEnd,
    reason,
  });
  return response.data;
};

export const completeGrading = async (
  id: string,
  req: { gradeStatus: string; instructorNotes: string; traineeEmployeeCode: string }
): Promise<{ sessionId: string; status: string; cmsSyncTriggered: boolean }> => {
  const valid = ensureUuid(id);
  if (!valid) throw new Error('Invalid session id');
  const response = await apiClient.post(`/api/sessions/${valid}/grades`, req);
  return response.data;
};

export const submitMaintenanceChecklist = async (req: {
  simulatorId: string;
  checklistDate: string;
  isCleared: boolean;
  notes: string;
  blockingReason?: string;
  lastDailySignOffDate?: string | null;
}): Promise<{ checklistId: string; simulatorId: string; isCleared: boolean; shieldStatus: string }> => {
  const sanitized = sanitizePayload(req as Record<string, any>, ['simulatorId'], ['simulatorId', 'checklistDate']);
  if (sanitized.isCleared === true) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    sanitized.lastDailySignOffDate = `${year}-${month}-${day}`;
  } else {
    sanitized.lastDailySignOffDate = null;
  }
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

export const resolveDefect = async (
  simulatorId: string,
  resolutionDetails: string
): Promise<{ simulatorId: string; newStatus: string; resolvedAt?: string; verified?: boolean }> => {
  const valid = ensureUuid(simulatorId);
  if (!valid) throw new Error('Invalid simulator id');
  const response = await apiClient.post(`/api/asset/simulators/${valid}/ResolveDefect`, {
    resolutionDetails,
  });
  return {
    ...response.data,
    resolvedAt: normalizeUtcIso(response.data?.resolvedAt),
  };
};

export const checkoutEngineerShift = async (
  engineerId: string
): Promise<{ engineerId: string; checkoutTime: string; verified: boolean }> => {
  const valid = ensureUuid(engineerId);
  if (!valid) throw new Error('Invalid engineer id');
  const response = await apiClient.post(`/api/asset/engineers/${valid}/checkout`, {});
  const checkoutTime = normalizeUtcIso(response.data?.checkoutTime) ?? new Date().toISOString();
  return {
    engineerId: response.data?.engineerId ?? valid,
    checkoutTime,
    verified: Boolean(response.data?.verified),
  };
};

export interface DefectReport {
  defectId: string;
  simulatorId: string;
  sessionId?: string | null;
  reportedBy: string;
  systemAffected: string;
  severity: 'AOG' | 'MEL' | 'Defect';
  instructorNotes: string;
  status: 'Open' | 'Investigating' | 'Resolved';
  resolutionNotes?: string | null;
  reportedAt: string;
  resolvedAt?: string | null;
}

export const submitDefectReport = async (
  simulatorId: string,
  payload: {
    sessionId?: string | null;
    reportedBy: string;
    systemAffected: string;
    severity: 'AOG' | 'MEL' | 'Defect';
    instructorNotes: string;
  }
): Promise<{ defectId: string; simulatorId: string; severity: string; status: string }> => {
  const valid = ensureUuid(simulatorId);
  if (!valid) throw new Error('Invalid simulator id');
  const response = await apiClient.post(`/api/asset/simulators/${valid}/defects`, payload);
  return response.data;
};

export const getDefectReports = async (includeResolved = false): Promise<DefectReport[]> => {
  const response = await apiClient.get<any[]>('/api/asset/defects', {
    params: includeResolved ? { includeResolved: true } : undefined,
  });
  return response.data.map((d) => ({
    defectId: d.defectId,
    simulatorId: d.simulatorId,
    sessionId: d.sessionId ?? null,
    reportedBy: d.reportedBy,
    systemAffected: d.systemAffected,
    severity: d.severity as 'AOG' | 'MEL' | 'Defect',
    instructorNotes: d.instructorNotes,
    status: d.status as 'Open' | 'Investigating' | 'Resolved',
    resolutionNotes: d.resolutionNotes ?? null,
    reportedAt: normalizeUtcIso(d.reportedAt) ?? d.reportedAt,
    resolvedAt: normalizeUtcIso(d.resolvedAt) ?? null,
  }));
};

export const resolveDefectReport = async (
  defectId: string,
  resolutionNotes: string
): Promise<{ defectId: string; resolvedAt?: string }> => {
  const valid = ensureUuid(defectId);
  if (!valid) throw new Error('Invalid defect id');
  const response = await apiClient.post(`/api/asset/defects/${valid}/resolve`, { resolutionNotes });
  return {
    defectId: response.data?.defectId ?? valid,
    resolvedAt: normalizeUtcIso(response.data?.resolvedAt),
  };
};
