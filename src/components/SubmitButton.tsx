'use client';
import { useFormStatus } from 'react-dom';

/** Submit button that shows progress and blocks double submits (slow syncs looked "broken"). */
export function SubmitButton({ children, pending = 'Working…', className = 'btn-primary' }: { children: React.ReactNode; pending?: string; className?: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button className={`${className} ${busy ? 'cursor-wait opacity-70' : ''}`} disabled={busy} aria-busy={busy}>
      {busy ? pending : children}
    </button>
  );
}
