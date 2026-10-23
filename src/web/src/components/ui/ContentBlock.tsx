import type { ComponentPropsWithoutRef, ReactNode } from "react";

export function ContentToolbar({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="content-toolbar">
      <span className="content-toolbar-label">{label}</span>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </div>
  );
}

export function ResultBlock({
  error = false,
  className = "",
  ...props
}: ComponentPropsWithoutRef<"pre"> & { error?: boolean }) {
  return (
    <pre
      {...props}
      className={`tool-result text-[13px] leading-[20px] whitespace-pre-wrap break-words overflow-x-auto ${error ? "tool-result-error" : ""} ${className}`}
    />
  );
}
