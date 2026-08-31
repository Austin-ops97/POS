import { cn } from "@/lib/utils";

type EmeraldWordmarkProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  tone?: "on-light" | "on-dark";
};

const sizeClass = {
  sm: "text-[1.125rem]",
  md: "text-2xl",
  lg: "text-4xl sm:text-5xl",
} as const;

/** Product wordmark used in the sidebar, marketing, and auth screens. */
export function EmeraldWordmark({
  className,
  size = "sm",
  tone = "on-light",
}: EmeraldWordmarkProps) {
  const emerald = tone === "on-dark" ? "text-white" : "text-slate-900";
  const pos = tone === "on-dark" ? "text-slate-300" : "text-primary";

  return (
    <span
      className={cn(
        "inline-flex items-baseline leading-none tracking-[-0.04em]",
        sizeClass[size],
        className
      )}
      aria-label="EmeraldPOS"
    >
      <span className={cn("font-semibold", emerald)}>Emerald</span>
      <span className={cn("font-semibold", pos)}>POS</span>
    </span>
  );
}
