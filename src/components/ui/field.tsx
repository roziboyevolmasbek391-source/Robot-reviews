import type { ReactNode } from 'react';

export function Field({
  label,
  error,
  children
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-gray-900 dark:text-slate-300">
      <span>{label}</span>
      {children}
      {error ? <span className="text-xs font-normal text-danger-600">{error}</span> : null}
    </label>
  );
}
