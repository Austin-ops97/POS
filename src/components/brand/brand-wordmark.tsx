import { cn } from "@/lib/utils";
import { PRODUCT_NAME } from "@/lib/brand";

type BrandWordmarkProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  /**
   * Contrast against a known background.
   * The app chrome is light even when the OS prefers dark, so the default stays dark-on-light.
   * Use `on-dark` on navy or near-black surfaces.
   */
  tone?: "on-light" | "on-dark";
};

const sizeClass = {
  sm: "text-[1.125rem]",
  md: "text-[1.75rem]",
  lg: "text-4xl sm:text-5xl",
} as const;

/**
 * Product wordmark: Emerald in near-black (or white on dark surfaces), One in emerald green.
 * Rendered as one word with no space.
 */
export function BrandWordmark({
  className,
  size = "sm",
  tone = "on-light",
}: BrandWordmarkProps) {
  const emerald = tone === "on-dark" ? "text-white" : "text-slate-950";
  const one = tone === "on-dark" ? "text-emerald-400" : "text-emerald-700";

  return (
    <span
      className={cn(
        "inline-flex items-baseline font-sans font-semibold leading-none tracking-[-0.045em]",
        sizeClass[size],
        className
      )}
      role="img"
      aria-label={PRODUCT_NAME}
    >
      <span className={emerald}>Emerald</span>
      <span className={one}>One</span>
    </span>
  );
}
