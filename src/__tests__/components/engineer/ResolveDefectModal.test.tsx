import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ResolveDefectModal from '@/components/engineer/ResolveDefectModal';

const defaultProps = {
  isOpen: true,
  simulatorName: 'Sim-07',
  resolutionDetails: '',
  onResolutionDetailsChange: vi.fn(),
  onClose: vi.fn(),
  onSubmit: vi.fn(),
  isSubmitting: false,
  errorMessage: null,
};

describe('ResolveDefectModal', () => {
  it('renders nothing when isOpen is false', () => {
    render(<ResolveDefectModal {...defaultProps} isOpen={false} />);

    expect(screen.queryByText('Resolve Simulator Defect')).not.toBeInTheDocument();
  });

  it('renders modal title when isOpen is true', () => {
    render(<ResolveDefectModal {...defaultProps} />);

    expect(screen.getByText('Resolve Simulator Defect')).toBeInTheDocument();
  });

  it('renders simulator name', () => {
    render(<ResolveDefectModal {...defaultProps} />);

    expect(screen.getByText('Sim-07')).toBeInTheDocument();
  });

  it('renders textarea for resolution details', () => {
    render(<ResolveDefectModal {...defaultProps} />);

    const textarea = screen.getByPlaceholderText(
      'Document corrective actions, replaced components, verification steps, and release criteria...'
    );
    expect(textarea).toBeInTheDocument();
  });

  it('textarea displays the provided resolutionDetails value', () => {
    render(<ResolveDefectModal {...defaultProps} resolutionDetails="Replaced actuator" />);

    const textarea = screen.getByPlaceholderText(
      'Document corrective actions, replaced components, verification steps, and release criteria...'
    );
    expect(textarea).toHaveValue('Replaced actuator');
  });

  it('calls onResolutionDetailsChange when textarea value changes', () => {
    const onChange = vi.fn();
    render(<ResolveDefectModal {...defaultProps} onResolutionDetailsChange={onChange} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Calibrated sensors' } });

    expect(onChange).toHaveBeenCalledWith('Calibrated sensors');
  });

  it('renders Submit Resolution button', () => {
    render(<ResolveDefectModal {...defaultProps} />);

    expect(screen.getByText('Submit Resolution')).toBeInTheDocument();
  });

  it('submit button is disabled when resolutionDetails is empty', () => {
    render(<ResolveDefectModal {...defaultProps} resolutionDetails="" />);

    expect(screen.getByText('Submit Resolution')).toBeDisabled();
  });

  it('submit button is enabled when resolutionDetails is non-empty', () => {
    render(<ResolveDefectModal {...defaultProps} resolutionDetails="Fixed motion system" />);

    expect(screen.getByText('Submit Resolution')).not.toBeDisabled();
  });

  it('submit button is disabled when isSubmitting is true', () => {
    render(
      <ResolveDefectModal
        {...defaultProps}
        resolutionDetails="Fixed motion system"
        isSubmitting={true}
      />
    );

    expect(screen.getByText('Resolving Defect...')).toBeDisabled();
  });

  it('renders "Resolving Defect..." when isSubmitting is true', () => {
    render(
      <ResolveDefectModal
        {...defaultProps}
        resolutionDetails="Fixed motion system"
        isSubmitting={true}
      />
    );

    expect(screen.getByText('Resolving Defect...')).toBeInTheDocument();
  });

  it('calls onSubmit when Submit Resolution is clicked', () => {
    const onSubmit = vi.fn();
    render(
      <ResolveDefectModal
        {...defaultProps}
        resolutionDetails="Fixed motion system"
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByText('Submit Resolution'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<ResolveDefectModal {...defaultProps} onClose={onClose} />);

    const closeButton = document.querySelector('button[type="button"]');
    if (closeButton) fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onSubmit when button is disabled', () => {
    const onSubmit = vi.fn();
    render(<ResolveDefectModal {...defaultProps} onSubmit={onSubmit} resolutionDetails="" />);

    fireEvent.click(screen.getByText('Submit Resolution'));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders error message when errorMessage is provided', () => {
    render(
      <ResolveDefectModal {...defaultProps} errorMessage="Failed to resolve defect." />
    );

    expect(screen.getByText('Failed to resolve defect.')).toBeInTheDocument();
  });

  it('does not render error message when errorMessage is null', () => {
    render(<ResolveDefectModal {...defaultProps} errorMessage={null} />);

    expect(screen.queryByText('Failed to resolve defect.')).not.toBeInTheDocument();
  });

  it('disables textarea when isSubmitting is true', () => {
    render(
      <ResolveDefectModal
        {...defaultProps}
        resolutionDetails="Fixed"
        isSubmitting={true}
      />
    );

    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
