import type { ComponentPropsWithRef, ReactNode } from "react";

type FieldProps<T extends "input" | "textarea" | "select"> =
  ComponentPropsWithRef<T> & { invalid?: boolean };

export function TextField({
  invalid,
  className = "",
  ...props
}: FieldProps<"input">) {
  return (
    <input
      {...props}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={`ui-field ${className}`}
    />
  );
}

export function TextArea({
  invalid,
  className = "",
  ...props
}: FieldProps<"textarea">) {
  return (
    <textarea
      {...props}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={`ui-field ui-field--multiline ${className}`}
    />
  );
}

export function SelectField({
  invalid,
  className = "",
  ...props
}: FieldProps<"select">) {
  return (
    <select
      {...props}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={`ui-field ${className}`}
    />
  );
}

export function FormField({
  label,
  htmlFor,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="ui-form-field">
      <label htmlFor={htmlFor} className="ui-field-label">
        {label}
      </label>
      {children}
    </div>
  );
}
