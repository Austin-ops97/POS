import { cn } from "@/lib/utils";

type EmeraldMarkProps = {
  className?: string;
  title?: string;
};

/** Dark green emerald-cut gem used as the app mark — no wordmark. */
export function EmeraldMark({ className, title = "Home" }: EmeraldMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("h-9 w-9 shrink-0", className)}
      role="img"
      aria-label={title}
    >
      <rect width="32" height="32" rx="8" fill="#042f24" />
      <path d="M8.2 12.4 12.1 7h7.8l3.9 5.4-7.8 13.1z" fill="#059669" />
      <path d="M16 25.5 8.2 12.4h15.6z" fill="#047857" />
      <path d="M12.1 7h7.8L16 12.4z" fill="#6ee7b7" />
      <path d="M12.1 7 8.2 12.4h7.8z" fill="#34d399" />
      <path d="M19.9 7 16 12.4h7.8z" fill="#10b981" />
      <path d="M8.2 12.4 16 25.5 16 12.4z" fill="#065f46" />
      <path d="M23.8 12.4 16 25.5 16 12.4z" fill="#064e3b" />
      <path d="M8.2 12.4h15.6" stroke="#a7f3d0" strokeWidth="0.45" opacity="0.7" />
      <path d="M16 7v18.5" stroke="#ecfdf5" strokeWidth="0.35" opacity="0.35" />
    </svg>
  );
}
