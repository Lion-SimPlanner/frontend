import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GradeSummaryModal from '@/components/shared/GradeSummaryModal';

const baseSession = {
  sessionId: 'sess-001',
  simulatorId: 'sim-1',
  sessionType: 'Recurrent',
  status: 'Completed' as const,
  startTime: '2026-07-29T08:00:00.000Z',
  endTime: '2026-07-29T10:00:00.000Z',
  syllabusId: 'B737_RecurrentTraining',
  traineeEmployeeCode: 'PLT001',
  isGraded: true,
  gradeStatus: 'PASSED',
  instructorNotes: 'Well executed approach and landing.',
};

describe('GradeSummaryModal', () => {
  it('renders session syllabus ID in the title', () => {
    render(<GradeSummaryModal session={baseSession} onClose={vi.fn()} />);

    const headings = screen.getAllByText('B737_RecurrentTraining');
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Grade Report" subtitle', () => {
    render(<GradeSummaryModal session={baseSession} onClose={vi.fn()} />);

    expect(screen.getByText('Grade Report')).toBeInTheDocument();
  });

  it('renders Completed badge', () => {
    render(<GradeSummaryModal session={baseSession} onClose={vi.fn()} />);

    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders grade status badge when gradeStatus is present', () => {
    render(<GradeSummaryModal session={baseSession} onClose={vi.fn()} />);

    const badges = screen.getAllByText('PASSED');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('renders instructor notes when provided', () => {
    render(<GradeSummaryModal session={baseSession} onClose={vi.fn()} />);

    expect(screen.getByText('Well executed approach and landing.')).toBeInTheDocument();
  });

  it('renders "No teaching notes recorded" when instructorNotes is empty', () => {
    const sessionWithoutNotes = { ...baseSession, instructorNotes: '' };
    render(<GradeSummaryModal session={sessionWithoutNotes} onClose={vi.fn()} />);

    expect(screen.getByText('No teaching notes recorded')).toBeInTheDocument();
  });

  it('renders trainee employee code', () => {
    render(<GradeSummaryModal session={baseSession} onClose={vi.fn()} />);

    expect(screen.getByText('PLT001')).toBeInTheDocument();
  });

  it('renders syllabus in the info grid', () => {
    render(<GradeSummaryModal session={baseSession} onClose={vi.fn()} />);

    const syllabusCells = screen.getAllByText('B737_RecurrentTraining');
    expect(syllabusCells.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Assessment Scores section', () => {
    render(<GradeSummaryModal session={baseSession} onClose={vi.fn()} />);

    expect(screen.getByText('Assessment Scores')).toBeInTheDocument();
  });

  it('renders all score cells with placeholders', () => {
    render(<GradeSummaryModal session={baseSession} onClose={vi.fn()} />);

    expect(screen.getByText('Technical Skills')).toBeInTheDocument();
    expect(screen.getByText('CRM / Teamwork')).toBeInTheDocument();
    expect(screen.getByText('SOP Adherence')).toBeInTheDocument();
    expect(screen.getByText('Overall Grade')).toBeInTheDocument();
  });

  it('calls onClose when Close button is clicked', () => {
    const onClose = vi.fn();
    render(<GradeSummaryModal session={baseSession} onClose={onClose} />);

    fireEvent.click(screen.getByText('Close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Close Report button is clicked', () => {
    const onClose = vi.fn();
    render(<GradeSummaryModal session={baseSession} onClose={onClose} />);

    fireEvent.click(screen.getByText('Close Report'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders trainee name when traineeName is provided', () => {
    const sessionWithName = { ...baseSession, traineeName: 'John Doe' };
    render(<GradeSummaryModal session={sessionWithName} onClose={vi.fn()} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('renders trainee role when provided', () => {
    const sessionWithRole = { ...baseSession, traineeRole: 'Captain' as const };
    render(<GradeSummaryModal session={sessionWithRole} onClose={vi.fn()} />);

    expect(screen.getByText('Captain')).toBeInTheDocument();
  });

  it('renders instructor name when provided', () => {
    const sessionWithInstructor = { ...baseSession, instructorName: 'Jane Instructor' };
    render(<GradeSummaryModal session={sessionWithInstructor} onClose={vi.fn()} />);

    expect(screen.getByText('Jane Instructor')).toBeInTheDocument();
  });

  it('renders FAILED grade', () => {
    const failedSession = { ...baseSession, gradeStatus: 'FAILED' };
    render(<GradeSummaryModal session={failedSession} onClose={vi.fn()} />);

    const badges = screen.getAllByText('FAILED');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('renders custom title when title prop is provided', () => {
    const sessionWithTitle = { ...baseSession, title: 'Session 42' };
    render(<GradeSummaryModal session={sessionWithTitle} onClose={vi.fn()} />);

    expect(screen.getByText('Session 42')).toBeInTheDocument();
  });
});
