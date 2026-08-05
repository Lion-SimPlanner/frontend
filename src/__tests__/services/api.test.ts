import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockPost, mockUse } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockUse: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: mockGet,
      post: mockPost,
      interceptors: { request: { use: mockUse } },
    })),
  },
}));

import { getSessions, getPilotsPriorityQueue, calculateTimeDebts, SimulatorSession } from '@/services/api';

describe('api service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSessions', () => {
    const rawSessions = [
      {
        sessionId: 's1',
        simulatorId: 'sim-1',
        sessionType: 'Recurrent',
        status: 'Completed',
        startTime: '2026-07-29T08:00:00Z',
        endTime: '2026-07-29T10:00:00Z',
        syllabusId: 'B737_RecurrentTraining',
        traineeEmployeeCode: 'PLT001',
        isGraded: true,
        gradeStatus: 'PASSED',
      },
      {
        sessionId: 's2',
        simulatorId: 'sim-1',
        sessionType: 'OPC',
        status: 'Scheduled',
        startTime: '2026-07-30T08:00:00.000Z',
        endTime: '2026-07-30T10:00:00.000Z',
        syllabusId: 'B737_OPC',
        traineeEmployeeCode: 'PLT002',
        isGraded: false,
      },
    ];

    it('returns mapped sessions from API response', async () => {
      mockGet.mockResolvedValue({ data: rawSessions });

      const result = await getSessions();

      expect(result).toHaveLength(2);
      expect(result[0].sessionId).toBe('s1');
      expect(result[0].status).toBe('Completed');
      expect(result[0].gradeStatus).toBe('PASSED');
      expect(result[1].sessionId).toBe('s2');
      expect(result[1].status).toBe('Scheduled');
    });

    it('normalizes startTime and endTime via normalizeUtcIso', async () => {
      mockGet.mockResolvedValue({ data: rawSessions });

      const result = await getSessions();

      expect(result[0].startTime).toBe('2026-07-29T08:00:00.000Z');
      expect(result[0].endTime).toBe('2026-07-29T10:00:00.000Z');
      expect(result[1].startTime).toBe('2026-07-30T08:00:00.000Z');
    });

    it('calls the correct API endpoint', async () => {
      mockGet.mockResolvedValue({ data: [] });

      await getSessions();

      expect(mockGet).toHaveBeenCalledWith('/api/scheduling/sessions');
    });

    it('returns empty array when API returns empty', async () => {
      mockGet.mockResolvedValue({ data: [] });

      const result = await getSessions();

      expect(result).toEqual([]);
    });

    it('throws when API call fails', async () => {
      mockGet.mockRejectedValue(new Error('Network error'));

      await expect(getSessions()).rejects.toThrow('Network error');
    });
  });

  describe('getPilotsPriorityQueue', () => {
    const rawPilots = [
      {
        pilotId: 'p1',
        employeeCode: 'PLT001',
        fullName: 'Alice Pilot',
        rank: 'Captain',
        isExternalUser: false,
        nextTrainingDue: '2026-09-01T00:00:00Z',
        requiredSyllabus: 'RecurrentTraining',
        typeRatings: ['B737'],
        medicalExpiry: '2027-01-15T00:00:00Z',
        lastDutyEndTime: '2026-07-28T18:00:00Z',
        nextDutyStartTime: '2026-07-29T14:00:00Z',
      },
    ];

    it('returns mapped pilots from API response', async () => {
      mockGet.mockResolvedValue({ data: rawPilots });

      const result = await getPilotsPriorityQueue();

      expect(result).toHaveLength(1);
      expect(result[0].employeeCode).toBe('PLT001');
      expect(result[0].rank).toBe('Captain');
      expect(result[0].isExternalUser).toBe(false);
    });

    it('passes query params when filters are provided', async () => {
      mockGet.mockResolvedValue({ data: [] });

      await getPilotsPriorityQueue('RecurrentTraining', 'B737');

      expect(mockGet).toHaveBeenCalledWith(
        '/api/personnel/pilots/priority-queue',
        { params: { syllabusFilter: 'RecurrentTraining', typeRating: 'B737' } }
      );
    });

    it('calls endpoint without params when no filters', async () => {
      mockGet.mockResolvedValue({ data: [] });

      await getPilotsPriorityQueue();

      expect(mockGet).toHaveBeenCalledWith(
        '/api/personnel/pilots/priority-queue',
        { params: {} }
      );
    });

    it('returns empty array when API returns empty', async () => {
      mockGet.mockResolvedValue({ data: [] });

      const result = await getPilotsPriorityQueue();

      expect(result).toEqual([]);
    });

    it('throws when API call fails', async () => {
      mockGet.mockRejectedValue(new Error('Server error'));

      await expect(getPilotsPriorityQueue()).rejects.toThrow('Server error');
    });
  });

  describe('calculateTimeDebts', () => {
    const base = (overrides: Partial<SimulatorSession>): SimulatorSession => ({
      sessionId: 's-' + Math.random(),
      simulatorId: 'sim-1',
      sessionType: 'Recurrent',
      status: 'Scheduled',
      startTime: '2026-08-01T08:00:00.000Z',
      endTime: '2026-08-01T10:00:00.000Z',
      syllabusId: 'B737_RecurrentTraining',
      traineeEmployeeCode: 'PLT001',
      isGraded: false,
      ...overrides,
    });

    it('returns empty when no sessions are terminated early', () => {
      const sessions = [base({ status: 'Completed' })];
      const result = calculateTimeDebts(sessions);
      expect(result).toEqual([]);
    });

    it('counts the shortfall of a terminated session as debt', () => {
      const terminated = base({
        status: 'TerminatedEarly',
        startTime: '2026-08-01T08:00:00.000Z',
        endTime: '2026-08-01T09:00:00.000Z',
        originalEndTime: '2026-08-01T10:28:00.000Z',
        terminationReason: 'Simulator AOG',
      });
      const result = calculateTimeDebts([terminated]);
      expect(result).toHaveLength(1);
      expect(result[0].traineeEmployeeCode).toBe('PLT001');
      expect(result[0].totalDebtMinutes).toBe(88);
      expect(result[0].terminatedSessionCount).toBe(1);
    });

    it('clears a trainee from the queue when a completed session covers the debt', () => {
      const terminated = base({
        status: 'TerminatedEarly',
        startTime: '2026-08-01T08:00:00.000Z',
        endTime: '2026-08-01T09:00:00.000Z',
        originalEndTime: '2026-08-01T10:28:00.000Z',
        terminationReason: 'Simulator AOG',
      });
      const completed = base({
        status: 'Completed',
        startTime: '2026-08-02T08:00:00.000Z',
        endTime: '2026-08-02T12:00:00.000Z',
        isGraded: true,
      });
      const result = calculateTimeDebts([terminated, completed]);
      expect(result).toHaveLength(0);
    });

    it('keeps the remaining debt when the completed session is shorter than the shortfall', () => {
      const terminated = base({
        status: 'TerminatedEarly',
        startTime: '2026-08-01T08:00:00.000Z',
        endTime: '2026-08-01T09:00:00.000Z',
        originalEndTime: '2026-08-01T10:28:00.000Z',
        terminationReason: 'Simulator AOG',
      });
      const completed = base({
        status: 'Completed',
        startTime: '2026-08-02T08:00:00.000Z',
        endTime: '2026-08-02T09:20:00.000Z',
        isGraded: true,
      });
      const result = calculateTimeDebts([terminated, completed]);
      expect(result).toHaveLength(1);
      expect(result[0].totalDebtMinutes).toBe(8);
    });

    it('ignores completed sessions that started before the termination', () => {
      const terminated = base({
        status: 'TerminatedEarly',
        startTime: '2026-08-01T08:00:00.000Z',
        endTime: '2026-08-01T09:00:00.000Z',
        originalEndTime: '2026-08-01T10:28:00.000Z',
        terminationReason: 'Simulator AOG',
      });
      const earlierCompleted = base({
        status: 'Completed',
        startTime: '2026-07-30T08:00:00.000Z',
        endTime: '2026-07-30T12:00:00.000Z',
        isGraded: true,
      });
      const result = calculateTimeDebts([terminated, earlierCompleted]);
      expect(result).toHaveLength(1);
      expect(result[0].totalDebtMinutes).toBe(88);
    });

    it('does not affect other trainees when one repays their debt', () => {
      const traineeA = base({
        status: 'TerminatedEarly',
        traineeEmployeeCode: 'PLT001',
        startTime: '2026-08-01T08:00:00.000Z',
        endTime: '2026-08-01T09:00:00.000Z',
        originalEndTime: '2026-08-01T10:00:00.000Z',
        terminationReason: 'Simulator AOG',
      });
      const traineeB = base({
        status: 'TerminatedEarly',
        traineeEmployeeCode: 'PLT002',
        startTime: '2026-08-01T08:00:00.000Z',
        endTime: '2026-08-01T09:00:00.000Z',
        originalEndTime: '2026-08-01T10:00:00.000Z',
        terminationReason: 'Simulator AOG',
      });
      const makeupForA = base({
        status: 'Completed',
        traineeEmployeeCode: 'PLT001',
        startTime: '2026-08-02T08:00:00.000Z',
        endTime: '2026-08-02T12:00:00.000Z',
        isGraded: true,
      });
      const result = calculateTimeDebts([traineeA, traineeB, makeupForA]);
      expect(result).toHaveLength(1);
      expect(result[0].traineeEmployeeCode).toBe('PLT002');
      expect(result[0].totalDebtMinutes).toBe(60);
    });
  });
});
