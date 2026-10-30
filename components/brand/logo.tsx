import { useId } from "react";

import { cn } from "@/lib/utils";

/*
 * The Obsera mark, inlined from public/brand/obsera-mark*.svg (geometry and colors are final;
 * keep them in sync with those files). Inline rather than <img> so it stays sharp at any size
 * and the mono variant inherits currentColor.
 */

type MarkProps = { size: number; label: boolean; className?: string };

const FACES = {
  default: { left: "#0B1A33", right: "#1B3A63", top: "#9CC3EC" },
  "on-dark": { left: "#1B3A63", right: "#2E5C8A", top: "#B9D5F2" },
} as const;

function a11y(label: boolean) {
  return label ? { role: "img", "aria-label": "Obsera" } : { "aria-hidden": true };
}

function ColorMark({ faces, size, label, className }: MarkProps & { faces: (typeof FACES)[keyof typeof FACES] }) {
  // Unique per instance: several marks on one page must not share a clipPath id
  const clipId = useId();
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width={size} height={size} className={cn("shrink-0", className)} {...a11y(label)}>
      <defs>
        <clipPath id={clipId}>
          <path d="M32 12.5 L49.5 22 L32 31.5 L14.5 22 Z" />
        </clipPath>
      </defs>
      <path d="M10 20 L32 32 L32 56 L10 44 Z" fill={faces.left} />
      <path d="M32 32 L54 20 L54 44 L32 56 Z" fill={faces.right} />
      <path d="M32 8 L54 20 L32 32 L10 20 Z" fill={faces.top} />
      <g clipPath={`url(#${clipId})`}>
        <path d="M14.5 22 L32 12.5 L32 24 L14.5 33.5 Z" fill="#1B6AD1" />
        <path d="M32 12.5 L49.5 22 L49.5 33.5 L32 24 Z" fill="#0F4FA8" />
        <path d="M32 24 L49.5 33.5 L32 43 L14.5 33.5 Z" fill="#5BA4F5" />
      </g>
    </svg>
  );
}

function MonoMark({ size, label, className }: MarkProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width={size} height={size} className={cn("shrink-0", className)} {...a11y(label)}>
      <path fill="currentColor" fillRule="evenodd" d="M32 8 L54 20 L54 44 L32 56 L10 44 L10 20 Z M32 12.5 L14.5 22 L32 31.5 L49.5 22 Z" />
      <path d="M32 32 L32 56" stroke="var(--gap,#fff)" strokeWidth="2.5" />
      <path d="M10 20 L32 32 L54 20" fill="none" stroke="var(--gap,#fff)" strokeWidth="2.5" strokeLinejoin="miter" />
    </svg>
  );
}

type LogoProps = {
  /** default = light surfaces (switches to on-dark automatically under .dark); on-dark = navy sidebar */
  variant: "default" | "on-dark" | "mono";
  size?: number;
  withWordmark?: boolean;
  /** Extra classes for the wordmark, e.g. its color or responsive visibility */
  wordmarkClassName?: string;
  className?: string;
};

export function Logo({ variant, size = 28, withWordmark = false, wordmarkClassName, className }: LogoProps) {
  // With a visible wordmark the text names the brand; the mark is then decorative
  const label = !withWordmark;

  const mark =
    variant === "mono" ? (
      <MonoMark size={size} label={label} />
    ) : variant === "on-dark" ? (
      <ColorMark faces={FACES["on-dark"]} size={size} label={label} />
    ) : (
      // Both rendered, one hidden by CSS: follows the .dark class without a hydration mismatch
      <>
        <ColorMark faces={FACES.default} size={size} label={label} className="dark:hidden" />
        <ColorMark faces={FACES["on-dark"]} size={size} label={label} className="hidden dark:block" />
      </>
    );

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {mark}
      {withWordmark && (
        <span className={cn("font-sans font-semibold uppercase tracking-[0.2em] text-foreground", wordmarkClassName)}>Obsera</span>
      )}
    </span>
  );
}
