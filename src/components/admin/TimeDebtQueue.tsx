'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  SimulatorSession,
  PilotPriority,
  calculateTimeDebts,
  formatDebtDuration,
  TimeDebtRecord,
} from '@/services/api';

interface TimeDebtQueueProps {
  sessions: SimulatorSession[];
  pilots: PilotPriority[];
  selectedSimId?: string;
  selectedSlot?: { dayKey: string; hour: number } | null;
  onSelectPilotForMakeup?: (pilot: PilotPriority) => void;
}

export default function TimeDebtQueue({
  sessions,
  pilots,
  selectedSimId,
  selectedSlot,
  onSelectPilotForMakeup,
}: TimeDebtQueueProps) {
  const debts = calculateTimeDebts(sessions, pilots);

  return (
    <div className="border border-amber-300 rounded-lg p-3.5 bg-amber-50/70 shadow-sm space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
          <h3 className="text-xs font-black tracking-widest uppercase text-amber-950 truncate">
            Time Debt Queue
          </h3>
        </div>
        <span className="px-2 py-0.5 bg-amber-600 text-white text-[8px] font-black rounded-full shrink-0">
          {debts.length} {debts.length === 1 ? 'Pilot' : 'Pilots'}
        </span>
      </div>

      <p className="text-[9px] font-bold text-amber-800 uppercase tracking-wider leading-tight">
        Owed makeup hours from early session terminations
      </p>

      {debts.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 border border-emerald-300 bg-emerald-50 rounded text-center text-[9px] font-black uppercase text-emerald-800 tracking-wider flex items-center justify-center gap-1.5 shadow-sm"
        >
          <span className="text-xs font-bold text-emerald-600">✓</span>
          <span>No outstanding time debt. All pilot schedules are fulfilled.</span>
        </motion.div>
      ) : (
        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
          {debts.map((d: TimeDebtRecord, idx: number) => {
            const matchedPilot = pilots.find(
              (p) =>
                p.employeeCode === d.traineeEmployeeCode ||
                p.pilotId === d.pilotId
            );

            return (
              <motion.div
                key={d.traineeEmployeeCode || idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.05 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                className="p-2.5 border border-amber-300 rounded bg-white shadow-sm flex items-start justify-between gap-2 min-w-0 transition-all hover:border-amber-400 hover:shadow-md cursor-pointer"
                onClick={() => {
                  if (matchedPilot && onSelectPilotForMakeup) {
                    onSelectPilotForMakeup(matchedPilot);
                  }
                }}
              >
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center font-black text-[10px] shrink-0 mt-0.5 border border-amber-300">
                    {d.traineeName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .substring(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-black text-gray-900 truncate">
                      {d.traineeName}
                    </div>
                    <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wider truncate">
                      {d.traineeEmployeeCode} · {d.typeRating}
                    </div>
                    {d.lastTerminationReason && (
                      <div className="mt-1 text-[8px] text-amber-800 font-bold uppercase truncate bg-amber-100/80 px-1.5 py-0.5 rounded w-fit border border-amber-200">
                        {d.lastTerminationReason}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="px-2 py-0.5 bg-amber-500 text-white text-[9px] font-black rounded uppercase tracking-wider leading-none shadow-sm">
                    {formatDebtDuration(d.totalDebtMinutes)}
                  </span>
                  <span className="text-[7.5px] font-black text-amber-800 uppercase tracking-widest">
                    {d.terminatedSessionCount}{' '}
                    {d.terminatedSessionCount === 1 ? 'Session' : 'Sessions'}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
