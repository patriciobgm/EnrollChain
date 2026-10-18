import { AlertCircle } from "lucide-react";
import {
  cloneElement,
  isValidElement,
  useId,
  type PropsWithChildren,
  type ReactElement,
} from "react";

interface AccessibleControlProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export function Field({
  label,
  children,
  hint,
  error,
}: PropsWithChildren<{ label: string; hint?: string; error?: string }>) {
  const generatedId = useId();
  const control = isValidElement<AccessibleControlProps>(children)
    ? children
    : null;
  const id = control?.props.id ?? generatedId;
  const descriptions = [
    control?.props["aria-describedby"],
    hint ? `${id}-hint` : null,
    error ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {control
        ? cloneElement(control as ReactElement<AccessibleControlProps>, {
            id,
            "aria-describedby": descriptions || undefined,
            "aria-invalid": error ? true : control.props["aria-invalid"],
          })
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      {error && (
        <small id={`${id}-error`} className="text-red-800">
          {error}
        </small>
      )}
    </div>
  );
}
export function ErrorMessage({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="error-box flex items-start gap-3">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{error instanceof Error ? error.message : String(error)}</p>
    </div>
  );
}
export function Page({
  title,
  children,
}: PropsWithChildren<{ title: string }>) {
  return (
    <div className="page-enter mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
      <div className="mb-8 border-b border-line pb-6">
        <h1
          tabIndex={-1}
          className="font-display text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          {title}
        </h1>
      </div>
      <div className="page-content">{children}</div>
    </div>
  );
}
