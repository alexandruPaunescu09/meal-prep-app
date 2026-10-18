"use client";

import { forwardRef } from "react";

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Required accessible name; also used as the tooltip (title). */
  label: string;
  tone?: "default" | "danger" | "primary";
  /** The icon, e.g. <Pencil size={16} />. */
  children: React.ReactNode;
}

const TONE = {
  default: "text-gray-500 hover:bg-gray-100 hover:text-gray-800",
  danger: "text-gray-500 hover:bg-red-50 hover:text-red-600",
  primary: "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700",
};

/** Icon-only button: 40x40 touch target on mobile, 32x32 on md+. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, tone = "default", className = "", type = "button", children, ...rest },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:pointer-events-none disabled:opacity-40 md:h-8 md:w-8 ${TONE[tone]} ${className}`}
        {...rest}
      >
        {children}
      </button>
    );
  }
);
