import type { ReactNode } from "react";
import type { SocialNetwork } from "@/lib/validations/digital-cards";

type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      {children}
    </svg>
  );
}

export function SocialBrandIcon({ network, className }: { network: SocialNetwork; className?: string }) {
  switch (network) {
    case "INSTAGRAM":
      return (
        <Svg className={className}>
          <path d="M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5zm8 1.8H8A3.2 3.2 0 0 0 4.8 8v8A3.2 3.2 0 0 0 8 19.2h8a3.2 3.2 0 0 0 3.2-3.2V8A3.2 3.2 0 0 0 16 4.8zM12 8.2A3.8 3.8 0 1 1 8.2 12 3.8 3.8 0 0 1 12 8.2zm0 1.6A2.2 2.2 0 1 0 14.2 12 2.2 2.2 0 0 0 12 9.8zM17.15 6.4a1.05 1.05 0 1 1-1.05 1.05 1.05 1.05 0 0 1 1.05-1.05z" />
        </Svg>
      );
    case "FACEBOOK":
      return (
        <Svg className={className}>
          <path d="M14.2 8.5h2.3V5.2h-2.3c-2.5 0-4.2 1.6-4.2 4.3v1.7H8v3.2h2v7.4h3.3v-7.4h2.5l.5-3.2h-3v-1.4c0-.8.4-1.3 1.4-1.3z" />
        </Svg>
      );
    case "LINKEDIN":
      return (
        <Svg className={className}>
          <path d="M5.7 8.7H2.9V21h2.8V8.7zM4.3 3C3.3 3 2.5 3.8 2.5 4.8S3.3 6.6 4.3 6.6 6.1 5.8 6.1 4.8 5.3 3 4.3 3zM21 21h-2.8v-6.2c0-1.8-.7-2.4-1.7-2.4s-1.9.8-1.9 2.5V21H11.8V8.7h2.7v1.7c.5-.9 1.6-1.9 3.4-1.9 2.3 0 4.1 1.5 4.1 4.7V21z" />
        </Svg>
      );
    case "X":
      return (
        <Svg className={className}>
          <path d="M4 4h3.4l4.1 5.7L16.2 4H20l-6.3 7.4L20.4 20h-3.4l-4.6-6.3L7.6 20H4l6.7-7.8L4 4z" />
        </Svg>
      );
    case "TIKTOK":
      return (
        <Svg className={className}>
          <path d="M14.2 3c.4 2.4 1.8 4 4.1 4.3v2.6c-1.4 0-2.7-.4-3.9-1.2v6.5c0 3.4-2.6 6-6.1 6S2.2 18.6 2.2 15.2c0-3.3 2.5-5.8 5.7-6v2.7c-1.6.2-2.8 1.5-2.8 3.2 0 1.8 1.4 3.2 3.2 3.2s3.1-1.4 3.1-3.2V3h2.8z" />
        </Svg>
      );
    case "YOUTUBE":
      return (
        <Svg className={className}>
          <path d="M21.6 8.2a2.8 2.8 0 0 0-2-2C17.8 5.8 12 5.8 12 5.8s-5.8 0-7.6.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 3.8 2.8 2.8 0 0 0 2 2c1.8.4 7.6.4 7.6.4s5.8 0 7.6-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-3.8zM10.2 15.2V8.8L15.6 12l-5.4 3.2z" />
        </Svg>
      );
    default:
      return (
        <Svg className={className}>
          <path d="M10.6 13.4a3.5 3.5 0 0 0 4.9.1l2-2a3.5 3.5 0 0 0-4.9-5L11.4 7.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M13.4 10.6a3.5 3.5 0 0 0-4.9-.1l-2 2a3.5 3.5 0 0 0 4.9 5l1.2-1.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </Svg>
      );
  }
}
