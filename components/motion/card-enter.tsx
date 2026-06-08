import { cn } from "@/lib/utils";

interface CardEnterProps {
  /** Position in the grid — drives a small, capped stagger delay. */
  index?: number;
  className?: string;
  children: React.ReactNode;
}

// Stagger is capped so later cards (and infinite-scroll appends) never lag
// behind by more than ~270ms — keeps the entrance feeling crisp, not laggy.
const STAGGER_STEP_MS = 30;
const STAGGER_MAX_STEPS = 9;

/**
 * Wraps a grid card in a restrained fade + slight rise on mount. The entrance
 * lives on this wrapper (not the card) so the card's own hover transform never
 * collides with the animation's final transform. Honors reduced-motion.
 */
export function CardEnter({ index = 0, className, children }: CardEnterProps) {
  const delayMs = Math.min(index, STAGGER_MAX_STEPS) * STAGGER_STEP_MS;
  return (
    <div
      style={{ "--tw-animation-delay": `${delayMs}ms` } as React.CSSProperties}
      className={cn(
        "animate-in fade-in slide-in-from-bottom-2 duration-300 ease-[var(--ease-out)] fill-mode-both motion-reduce:animate-none",
        className,
      )}
    >
      {children}
    </div>
  );
}
