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

import { getSessions, getPilotsPriorityQueue } from '@/services/api';

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
});
