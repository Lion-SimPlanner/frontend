'use client';

import React from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { SimulatorSession } from '@/services/api';

interface GradeSummaryModalProps {
  session: SimulatorSession & { title?: string; phase?: string; pilotName?: string };
  onClose: () => void;
}

const backdrop: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

const panel: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 16 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 380, damping: 26 },
  },
  exit: { opacity: 0, scale: 0.94, y: 16, transition: { duration: 0.15 } },
};

function ScoreCell({ label, value }: { label: string; value?: string }) {
  const display = value || '—';
  return (
    <div className="bg-gray-50 border border-gray-100 rounded p-2.5 min-w-0">
      <span className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 truncate">
        {label}
      </span>
      <span className={`text-[11px] font-black truncate block ${value ? 'text-gray-900' : 'text-gray-300'}`}>
        {display}
      </span>
    </div>
  );
}

export default function GradeSummaryModal({ session, onClose }: GradeSummaryModalProps) {
  const gradeStatus = session.gradeStatus ?? '';
  const isPassed = gradeStatus.toUpperCase() === 'PASSED' || gradeStatus.toUpperCase() === 'SATISFACTORY';
  const isFailed = gradeStatus.toUpperCase() === 'FAILED';

  const overallBadge = isFailed
    ? 'bg-red-50 text-red-700 border-red-400'
    : isPassed
      ? 'bg-green-50 text-green-700 border-green-400'
      : 'bg-gray-50 text-gray-500 border-gray-300';

  return (
    <AnimatePresence>
      <motion.div
        key="grade-modal-backdrop"
        variants={backdrop}
        initial="hidden"
        animate="show"
        exit="exit"
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      >
        <motion.div
          key="grade-modal-panel"
          variants={panel}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded border border-gray-200 shadow-2xl w-full max-w-md overflow-hidden"
        >
          <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="bg-green-50 text-green-700 border border-green-400 text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wider shrink-0">
                  Completed
                </span>
                {gradeStatus && (
                  <span className={`border text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wider shrink-0 ${overallBadge}`}>
                    {gradeStatus}
                  </span>
                )}
              </div>
              <h2 className="text-sm font-black uppercase text-gray-900 tracking-wider truncate">
                {(session as any).title ?? session.syllabusId ?? 'Session'}
              </h2>
              <p className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">Grade Report</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-black text-gray-400 hover:text-brand-red uppercase transition-colors active:scale-90 shrink-0 cursor-pointer"
            >
              Close
            </button>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px] font-bold text-gray-700">
              <div className="min-w-0">
                <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider">Trainee</span>
                <span className="font-black text-gray-900 truncate block">
                  {session.traineeName || session.traineeEmployeeCode || '—'}
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider">Role</span>
                <span className="font-black text-gray-900 truncate block">{session.traineeRole || '—'}</span>
              </div>
              <div className="min-w-0">
                <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider">Instructor</span>
                <span className="font-black text-gray-900 truncate block">{session.instructorName || '—'}</span>
              </div>
              <div className="min-w-0">
                <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider">Syllabus</span>
                <span className="font-black text-gray-900 truncate block">{session.syllabusId || '—'}</span>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-5 space-y-3">
              <h4 className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                <svg className="w-3 h-3 text-brand-red shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
                Assessment Scores
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <ScoreCell label="Technical Skills" value={undefined} />
                <ScoreCell label="CRM / Teamwork" value={undefined} />
                <ScoreCell label="SOP Adherence" value={undefined} />
                <div className="bg-gray-900 border border-gray-800 rounded p-2.5 min-w-0">
                  <span className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 truncate">
                    Overall Grade
                  </span>
                  <span className={`text-[11px] font-black truncate block ${isFailed ? 'text-red-400' : isPassed ? 'text-green-400' : 'text-gray-400'}`}>
                    {gradeStatus || '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-5">
              <span className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-2">
                Teaching Notes / Syllabus Remarks
              </span>
              {session.instructorNotes ? (
                <div className="bg-gray-50 border border-gray-100 rounded p-3 text-[10px] font-bold text-gray-700 leading-relaxed max-h-28 overflow-y-auto">
                  {session.instructorNotes}
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-100 rounded p-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">
                  No teaching notes recorded
                </div>
              )}
            </div>
          </div>

          <div className="px-6 pb-6">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-black text-[10px] uppercase tracking-wider rounded transition-all active:scale-[0.98] cursor-pointer"
            >
              Close Report
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
