import React from 'react';
import {
  AlertCircle,
  Bot,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  X,
} from 'lucide-react';

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({ variant = 'primary', className, type = 'button', ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={classes('eq-button', `eq-button--${variant}`, className)} {...props} />;
}

export function Surface({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('eq-surface', className)} {...props} />;
}

export type BadgeTone = 'neutral' | 'primary' | 'ai' | 'reward' | 'success' | 'danger';

export function Badge({ tone = 'neutral', className, ...props }:
  React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={classes('eq-badge', `eq-badge--${tone}`, className)} {...props} />;
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const bounded = Math.min(100, Math.max(0, value));
  return (
    <div className="eq-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={bounded}>
      <span style={{ width: `${bounded}%` }} />
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <div className="eq-state eq-state--empty"><strong>{title}</strong>{description && <p>{description}</p>}{action}</div>;
}

export function ErrorState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <div className="eq-state eq-state--error" role="alert"><AlertCircle aria-hidden="true" /> <strong>{title}</strong>{description && <p>{description}</p>}{action}</div>;
}

export function LoadingState({ label }: { label: string }) {
  return <div className="eq-state eq-state--loading" role="status"><LoaderCircle aria-hidden="true" className="animate-spin" /><span>{label}</span></div>;
}

export type ContextKind = 'document' | 'image' | 'ai';

export function ContextChip({ kind, label, onRemove, removeLabel }: {
  kind: ContextKind;
  label: string;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const Icon = kind === 'document' ? FileText : kind === 'image' ? ImageIcon : Bot;
  return (
    <span className={`eq-context-chip eq-context-chip--${kind}`}>
      <Icon aria-hidden="true" />
      <span title={label}>{label}</span>
      {onRemove && <button type="button" onClick={onRemove} aria-label={removeLabel ?? `Remove ${label}`}><X aria-hidden="true" /></button>}
    </span>
  );
}

export function StatusBadge({ status, children }: {
  status: 'uploading' | 'ready' | 'error' | 'selected';
  children: React.ReactNode;
}) {
  return <Badge tone={status === 'ready' ? 'success' : status === 'error' ? 'danger' : status === 'selected' ? 'ai' : 'neutral'}>{children}</Badge>;
}
