import type { ReactNode } from "react";

export function RemoveIcon(): ReactNode {
  return (
    <svg aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 16 16">
      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
    </svg>
  );
}
