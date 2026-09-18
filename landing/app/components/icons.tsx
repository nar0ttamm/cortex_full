import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export function IconPhone(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12c-.98-2.46-1.63-5.01-1.93-8A2 2 0 0 1 5.05 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L9.91 9.91a16 16 0 0 0 6.18 6.18l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function IconChat(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function IconChart(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19V8" />
    </svg>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function IconBolt(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z" />
    </svg>
  );
}

export function IconMail(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function IconArrow(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconBuilding(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 21v-6h6v6M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01" />
    </svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconSpark(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v4M12 17v4M4.9 6.5l2.8 2.8M16.3 14.7l2.8 2.8M3 12h4M17 12h4M4.9 17.5l2.8-2.8M16.3 9.3l2.8-2.8" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IconTarget(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconLayers(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m12 3 9 5-9 5-9-5 9-5z" />
      <path d="m3 13 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function IconGraduation(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m3 9 9-5 9 5-9 5-9-5z" />
      <path d="M7 11.5v4.2c0 .5 2.2 2.3 5 2.3s5-1.8 5-2.3v-4.2" />
      <path d="M21 9v6" />
    </svg>
  );
}

export function IconHeart(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M19.5 12.6 12 20l-7.5-7.4a4.5 4.5 0 1 1 7.5-5.1 4.5 4.5 0 1 1 7.5 5.1z" />
    </svg>
  );
}

export function IconBank(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 10h16M6 10v8M10 10v8M14 10v8M18 10v8M3 18h18M12 4 3 10h18L12 4z" />
    </svg>
  );
}

export function IconCart(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
      <path d="M4 4h2.2l1.5 10.2a2 2 0 0 0 2 1.8h7.8a2 2 0 0 0 2-1.6L21 8H7" />
    </svg>
  );
}

export function IconChip(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4" />
    </svg>
  );
}

export function IconFactory(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 21V10l6 4V10l6 4V8l4-2v15H4z" />
    </svg>
  );
}

export function IconPlane(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 12h8l9-7-2 7 2 7-9-7H3z" />
    </svg>
  );
}

export function IconCar(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 14h16l-1.5-5.2A2 2 0 0 0 16.6 7H7.4a2 2 0 0 0-1.9 1.8L4 14z" />
      <path d="M6 17a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM18 17a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
      <path d="M4 14v3h2M18 17h2v-3" />
    </svg>
  );
}

export function IconDots(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
