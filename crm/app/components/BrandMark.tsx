import Link from 'next/link';

export function BrandMark({ compact = false, href = '/' }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 min-w-0">
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-[0_8px_18px_var(--glow)]">
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 h-[18px] w-[18px]" fill="none" aria-hidden>
          <path
            d="M5 14c2.8-1.4 4.4-4.8 4.4-8.2M12 19c3.2-2 6.6-3 10-2.4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M5.5 8.5c3.6 0 6.2 2.4 8.8 7.2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="6.2" cy="14.4" r="1.5" fill="currentColor" />
        </svg>
      </span>
      {!compact && (
        <span className="truncate text-[0.95rem] font-extrabold tracking-tight text-[var(--fg)]">
          CortexFlow <span className="tracking-[0.06em]">AI</span>
        </span>
      )}
    </Link>
  );
}
