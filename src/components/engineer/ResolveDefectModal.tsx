'use client';

import React from 'react';

interface ResolveDefectModalProps {
  isOpen: boolean;
  simulatorName: string;
  resolutionDetails: string;
  onResolutionDetailsChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  errorMessage: string | null;
}

export default function ResolveDefectModal({
  isOpen,
  simulatorName,
  resolutionDetails,
  onResolutionDetailsChange,
  onClose,
  onSubmit,
  isSubmitting,
  errorMessage,
}: ResolveDefectModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded border border-gray-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-green-50/60">
          <div>
            <h2 className="text-sm font-black uppercase text-gray-900 tracking-wider">Resolve Simulator Defect</h2>
            <p className="text-[9px] text-gray-500 font-bold uppercase mt-1 tracking-wide">{simulatorName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-brand-red transition-colors shrink-0"
            disabled={isSubmitting}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[9px] font-black text-gray-500 uppercase tracking-wider mb-2">
              Resolution Details
            </label>
            <textarea
              value={resolutionDetails}
              onChange={(e) => onResolutionDetailsChange(e.target.value)}
              rows={6}
              placeholder="Document corrective actions, replaced components, verification steps, and release criteria..."
              className="w-full p-3 border border-gray-300 rounded text-xs font-bold text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-green-600 focus:border-green-600 resize-none"
              disabled={isSubmitting}
            />
          </div>

          {errorMessage && (
            <div className="text-[10px] text-brand-red font-bold border border-red-200 bg-red-50 rounded p-2.5">
              {errorMessage}
            </div>
          )}

          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting || resolutionDetails.trim().length === 0}
            className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase tracking-widest rounded transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Resolving Defect...' : 'Submit Resolution'}
          </button>
        </div>
      </div>
    </div>
  );
}
