'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Simulator, SimulatorSession, PilotPriority, Engineer } from '@/services/api';

interface DailyResourceCalendarProps {
  simulators: Simulator[];
  sessions: SimulatorSession[];
  pilots: PilotPriority[];
  engineers: Engineer[];
  selectedDate: Date;
  selectedSlot: { dayKey: string; hour: number } | null;
  selectedSimulatorId: string;
  draftDuration: number;
  draftTraineeName: string | null;
  onDateChange: (date: Date) => void;
  onSlotSelect: (simulatorId: string, dayKey: string, hour: number) => void;
  onSessionClick: (session: SimulatorSession) => void;
}

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 23;
const HOUR_HEIGHT = 60;
const TOTAL_ROWS = DAY_END_HOUR - DAY_START_HOUR;
const GRID_HEIGHT = TOTAL_ROWS * HOUR_HEIGHT;
const COL_WIDTH = 170;

const hours = Array.from({ length: TOTAL_ROWS }, (_, i) => DAY_START_HOUR + i);

const toLocalDateKey = (value: Date) => {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const addLocalDays = (value: Date, days: number) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);

const isDownStatus = (status: Simulator['status']) => status === 'AOG' || status === 'Down';
const isDegradedStatus = (status: Simulator['status']) => status === 'MEL' || status === 'Defect';

const getSimulatorTone = (status: Simulator['status']) => {
  if (isDownStatus(status)) return { dot: 'bg-brand-red', label: 'Down' };
  if (isDegradedStatus(status)) return { dot: 'bg-orange-500', label: 'Degraded' };
  return { dot: 'bg-green-500', label: 'Operational' };
};

const sessionBlockClass = (status: SimulatorSession['status']): string => {
  switch (status) {
    case 'Draft':
    case 'Scheduled':
      return 'bg-amber-400 hover:bg-amber-500 border-amber-600 text-amber-950';
    case 'InProgress':
      return 'bg-brand-red hover:bg-red-600 border-red-800 text-white';
    case 'Completed':
      return 'bg-emerald-500 hover:bg-emerald-600 border-emerald-700 text-white';
    case 'TerminatedEarly':
      return 'bg-purple-500 hover:bg-purple-600 border-purple-800 text-white';
    case 'Cancelled':
      return 'bg-gray-300 border-gray-400 text-gray-500 line-through opacity-70';
    default:
      return 'bg-amber-400 hover:bg-amber-500 border-amber-600 text-amber-950';
  }
};

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <span className={`w-2.5 h-2.5 rounded ${className} shrink-0`} />
      <span className="text-gray-500 truncate">{label}</span>
    </span>
  );
}

function MiniCalendar({
  viewDate,
  selectedDate,
  today,
  onSelect,
  onPrevMonth,
  onNextMonth,
}: {
  viewDate: Date;
  selectedDate: Date;
  today: Date;
  onSelect: (date: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const todayKey = toLocalDateKey(today);
  const selectedKey = toLocalDateKey(selectedDate);

  return (
    <div className="w-60 bg-white border border-gray-200 rounded-lg shadow-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={onPrevMonth}
          className="w-7 h-7 flex items-center justify-center text-sm font-black text-gray-500 hover:bg-gray-100 rounded transition-colors cursor-pointer"
        >
          ‹
        </button>
        <span className="text-[10px] font-black uppercase text-gray-800 tracking-wider truncate">
          {viewDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </span>
        <button
          type="button"
          onClick={onNextMonth}
          className="w-7 h-7 flex items-center justify-center text-sm font-black text-gray-500 hover:bg-gray-100 rounded transition-colors cursor-pointer"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[8px] font-black uppercase text-gray-400 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <span key={d} className="py-0.5">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) =>
          date ? (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(date)}
              className={`h-7 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                toLocalDateKey(date) === selectedKey
                  ? 'bg-brand-red text-white'
                  : toLocalDateKey(date) === todayKey
                    ? 'bg-red-50 text-brand-red border border-brand-red'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {date.getDate()}
            </button>
          ) : (
            <span key={i} />
          )
        )}
      </div>
    </div>
  );
}

export default function DailyResourceCalendar({
  simulators,
  sessions,
  pilots,
  engineers,
  selectedDate,
  selectedSlot,
  selectedSimulatorId,
  draftDuration,
  draftTraineeName,
  onDateChange,
  onSlotSelect,
  onSessionClick,
}: DailyResourceCalendarProps) {
  const dayKey = toLocalDateKey(selectedDate);
  const dateLabel = selectedDate.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerViewDate, setPickerViewDate] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );

  const toggleDatePicker = () => {
    setPickerViewDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    setShowDatePicker((v) => !v);
  };

  const daySessions = sessions.filter((s) => {
    const start = new Date(s.startTime);
    if (Number.isNaN(start.getTime())) return false;
    return toLocalDateKey(start) === dayKey;
  });

  const hasEngineerCoverage = (simId: string, hour: number) =>
    engineers.some((engineer) => {
      const shiftStart = engineer.shiftStart ? new Date(engineer.shiftStart) : null;
      const shiftEnd = engineer.shiftEnd ? new Date(engineer.shiftEnd) : null;
      if (!shiftStart || !shiftEnd || Number.isNaN(shiftStart.getTime()) || Number.isNaN(shiftEnd.getTime())) return false;
      if (toLocalDateKey(shiftStart) !== dayKey) return false;
      return hour >= shiftStart.getHours() && hour < shiftEnd.getHours();
    });

  const isPastSlot = (hour: number) => {
    const slotDate = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      hour,
      0,
      0,
      0
    );
    return slotDate.getTime() <= Date.now();
  };

  const getTraineeName = (s: SimulatorSession) =>
    s.traineeName ||
    s.traineeEmployeeCode ||
    pilots.find((p) => p.employeeCode === s.traineeEmployeeCode)?.fullName ||
    'No Trainee';

  return (
    <div className="border border-gray-100 rounded bg-white shadow-sm w-full min-w-0">
      <div className="relative flex flex-wrap items-center justify-between gap-2 p-3 border-b border-gray-100">
        <div className="min-w-0">
          <h3 className="text-sm font-black uppercase text-gray-900 truncate">
            Daily Resource Calendar
          </h3>
          <button
            type="button"
            onClick={toggleDatePicker}
            className="text-[10px] font-bold text-brand-red uppercase tracking-wider truncate hover:underline cursor-pointer flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {dateLabel}
          </button>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onDateChange(addLocalDays(selectedDate, -1))}
            className="px-2 py-1 border border-gray-200 text-gray-700 text-[9px] font-black uppercase rounded hover:bg-gray-50 shrink-0 active:scale-95 transition-all cursor-pointer"
          >
            Prev Day
          </button>
          <button
            onClick={() => onDateChange(new Date())}
            className="px-2 py-1 border border-brand-red text-brand-red text-[9px] font-black uppercase rounded hover:bg-red-50 shrink-0 active:scale-95 transition-all cursor-pointer"
          >
            Today
          </button>
          <button
            onClick={() => onDateChange(addLocalDays(selectedDate, 1))}
            className="px-2 py-1 border border-gray-200 text-gray-700 text-[9px] font-black uppercase rounded hover:bg-gray-50 shrink-0 active:scale-95 transition-all cursor-pointer"
          >
            Next Day
          </button>
        </div>

        {showDatePicker && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowDatePicker(false)} />
            <div className="absolute top-full left-3 z-50 mt-1">
              <MiniCalendar
                viewDate={pickerViewDate}
                selectedDate={selectedDate}
                today={new Date()}
                onSelect={(date) => {
                  onDateChange(date);
                  setShowDatePicker(false);
                }}
                onPrevMonth={() =>
                  setPickerViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                }
                onNextMonth={() =>
                  setPickerViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                }
              />
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-gray-100 text-[8px] font-black uppercase tracking-wider">
        <LegendDot className="bg-amber-400" label="Scheduled" />
        <LegendDot className="bg-brand-red" label="In Progress" />
        <LegendDot className="bg-emerald-500" label="Completed" />
        <LegendDot className="bg-purple-500" label="Terminated" />
        <LegendDot className="bg-orange-500" label="Degraded (MEL)" />
        <LegendDot className="bg-gray-300" label="Maintenance" />
      </div>

      <div className="overflow-auto max-w-full">
        <div style={{ minWidth: 60 + simulators.length * COL_WIDTH }}>
          <div
            className="grid bg-gray-50 border-b border-gray-100 sticky top-0 z-30"
            style={{ gridTemplateColumns: `60px repeat(${simulators.length}, ${COL_WIDTH}px)` }}
          >
            <div className="sticky left-0 z-40 bg-gray-50 border-r border-gray-100 py-3 flex items-center justify-center text-[9px] font-black uppercase text-gray-500">
              Time
            </div>
            {simulators.map((sim) => {
              const tone = getSimulatorTone(sim.status);
              return (
                <div key={sim.id} className="border-l border-gray-100 px-2 py-2 min-w-0 flex flex-col justify-center">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`} />
                    <span className="text-[10px] font-black text-gray-900 truncate">{sim.name}</span>
                  </div>
                  <span className="text-[8px] text-gray-400 uppercase tracking-wider truncate">
                    {sim.typeRating} · {sim.status}
                  </span>
                </div>
              );
            })}
          </div>

          <div
            className="grid"
            style={{ gridTemplateColumns: `60px repeat(${simulators.length}, ${COL_WIDTH}px)` }}
          >
            <div className="sticky left-0 z-20 bg-white border-r border-gray-100">
              {hours.map((h) => (
                <div
                  key={h}
                  className="flex items-start justify-center pt-0.5 text-[8px] font-bold text-gray-400 border-t border-gray-100"
                  style={{ height: HOUR_HEIGHT }}
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {simulators.map((sim) => {
              const down = isDownStatus(sim.status);
              const degraded = isDegradedStatus(sim.status);
              const columnSessions = daySessions.filter((s) => s.simulatorId === sim.id);
              const isSelectedColumn = selectedSimulatorId === sim.id;

              return (
                <div
                  key={sim.id}
                  className="relative border-l border-gray-100"
                  style={{ height: GRID_HEIGHT }}
                >
                  {hours.map((h) => {
                    const past = isPastSlot(h);
                    const covered = hasEngineerCoverage(sim.id, h);
                    const isDraftCell =
                      isSelectedColumn &&
                      selectedSlot?.dayKey === dayKey &&
                      selectedSlot.hour === h;
                    const occupied = columnSessions.some((s) => {
                      if (s.status === 'Cancelled') return false;
                      const start = new Date(s.startTime);
                      const end = new Date(s.endTime);
                      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
                      const endHour = end.getMinutes() > 0 ? end.getHours() + 1 : end.getHours();
                      return h >= start.getHours() && h < endHour;
                    });
                    const disabled = down || past || occupied;

                    return (
                      <div
                        key={h}
                        onClick={() => {
                          if (!disabled) onSlotSelect(sim.id, dayKey, h);
                        }}
                        className={`relative border-t border-gray-100 transition-colors ${isDraftCell ? 'bg-red-50/40' : ''} ${past ? 'bg-gray-100/60' : 'bg-white'} ${disabled ? '' : 'cursor-pointer hover:bg-gray-50'}`}
                        style={{ height: HOUR_HEIGHT }}
                      >
                        {covered && !down && (
                          <span className="absolute top-1 right-1 text-[7px] font-black uppercase text-blue-700 bg-blue-100 border border-blue-200 px-1 rounded leading-none z-30 shrink-0">
                            Eng
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {down && (
                    <div className="absolute inset-0 z-20 bg-gray-300/80 flex items-center justify-center pointer-events-none">
                      <span className="text-[10px] font-black uppercase text-gray-600 border border-gray-400 bg-gray-100 px-2 py-1 rounded -rotate-6 shadow-sm">
                        Maintenance
                      </span>
                    </div>
                  )}

                  {degraded && !down && (
                    <div className="absolute top-0 inset-x-0 z-10 h-5 bg-orange-500/85 flex items-center justify-center pointer-events-none">
                      <span className="text-[7px] font-black uppercase text-white tracking-widest">
                        Degraded · MEL
                      </span>
                    </div>
                  )}

                  {isSelectedColumn && selectedSlot?.dayKey === dayKey && draftDuration > 0 && (
                    <div
                      className="absolute left-1 right-1 z-10 flex flex-col justify-between border bg-brand-red text-white border-brand-red animate-pulse rounded px-1.5 py-1 shadow-lg pointer-events-none"
                      style={{
                        top: `${(selectedSlot.hour - DAY_START_HOUR) * HOUR_HEIGHT + 2}px`,
                        height: `${draftDuration * HOUR_HEIGHT - 4}px`,
                      }}
                    >
                      <div className="min-w-0">
                        <div className="uppercase font-extrabold tracking-wide text-[8px]">DRAFT</div>
                        <div className="truncate opacity-95 text-[8px]">{draftTraineeName || 'No Trainee'}</div>
                      </div>
                      <div className="uppercase tracking-widest text-[7px] truncate opacity-90">{sim.name}</div>
                    </div>
                  )}

                  <AnimatePresence>
                    {columnSessions.map((s) => {
                      const start = new Date(s.startTime);
                      const end = new Date(s.endTime);
                      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
                      const startMinutes = start.getHours() * 60 + start.getMinutes();
                      const endMinutes = end.getHours() * 60 + end.getMinutes();
                      const dayStartMinutes = DAY_START_HOUR * 60;
                      const topPx = Math.max(0, (startMinutes - dayStartMinutes) / 60) * HOUR_HEIGHT;
                      const durationHours = Math.max(0.5, (endMinutes - startMinutes) / 60);
                      const heightPx = Math.max(22, durationHours * HOUR_HEIGHT - 2);

                      return (
                        <motion.div
                          layout
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                          key={s.sessionId}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSessionClick(s);
                          }}
                          style={{ top: topPx, height: heightPx }}
                          className={`absolute left-1 right-1 p-1.5 text-[8px] leading-tight font-black rounded z-20 flex flex-col justify-between cursor-pointer border min-w-0 transition-transform active:scale-95 shadow-sm hover:shadow-md ${sessionBlockClass(s.status)}`}
                        >
                          <div className="min-w-0">
                            <div className="uppercase truncate">
                              {String(start.getHours()).padStart(2, '0')}:{String(start.getMinutes()).padStart(2, '0')} · {s.sessionType}
                            </div>
                            <div className="truncate opacity-95">{getTraineeName(s)}</div>
                          </div>
                          <div className="uppercase tracking-widest text-[7px] truncate opacity-90 flex items-center justify-between gap-1 min-w-0">
                            <span className="truncate">{sim.name}</span>
                            <span className="shrink-0">{durationHours}h</span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
