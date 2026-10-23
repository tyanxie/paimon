import type { ComponentPropsWithRef } from "react";

interface MenuItemProps extends ComponentPropsWithRef<"button"> {
  selected?: boolean;
  danger?: boolean;
}

export function MenuItem({
  selected = false,
  danger = false,
  className = "",
  type = "button",
  ...props
}: MenuItemProps) {
  return (
    <button
      {...props}
      type={type}
      data-selected={selected || undefined}
      data-danger={danger || undefined}
      className={`ui-menu-item ${className}`}
    />
  );
}
