import Link from 'next/link';

export function BrandMark({
  compact = false,
  flush = false,
  href = '/',
}: {
  compact?: boolean;
  flush?: boolean;
  href?: string;
}) {
  if (flush) {
    return (
      <Link href={href} className="flex h-full shrink-0 self-stretch" aria-label="CortexFlow AI">
        <img src="/logo.png" alt="CortexFlow" className="h-full w-auto object-cover object-left" />
      </Link>
    );
  }

  return (
    <Link href={href} className="inline-flex min-w-0 items-center" aria-label="CortexFlow AI">
      {compact ? (
        <img
          src="/favicon.png"
          alt=""
          className="h-8 w-8 shrink-0 rounded-lg bg-[#050505] object-contain ring-1 ring-[var(--border)]"
        />
      ) : (
        <span className="inline-flex rounded-lg bg-[#050505] ring-1 ring-black/10 dark:bg-white dark:p-0.5 dark:ring-[var(--border)]">
          <img src="/logo.png" alt="CortexFlow" className="h-7 w-auto max-w-[168px] rounded-md object-contain object-left sm:h-8" />
        </span>
      )}
    </Link>
  );
}
