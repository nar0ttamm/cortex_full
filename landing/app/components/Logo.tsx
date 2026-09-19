import Link from "next/link";

export function Logo({ compact = false, flush = false }: { compact?: boolean; flush?: boolean }) {
  if (flush) {
    return (
      <Link href="/" className="flex h-full shrink-0 self-stretch" aria-label="CortexFlow AI">
        <img
          src="/logo.png"
          alt="CortexFlow"
          className="h-full w-auto object-cover object-left"
        />
      </Link>
    );
  }

  return (
    <Link href="/" className="inline-flex items-center" aria-label="CortexFlow AI">
      {compact ? (
        <img src="/favicon.png" alt="" className="h-9 w-9 rounded-xl object-contain" />
      ) : (
        <img src="/logo.png" alt="CortexFlow" className="h-8 w-auto rounded-lg object-contain sm:h-9" />
      )}
    </Link>
  );
}
