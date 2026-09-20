import Link from "next/link";

export function Logo({ compact = false, flush = false }: { compact?: boolean; flush?: boolean }) {
  if (flush) {
    return (
      <Link
        href="/"
        className="flex h-full shrink-0 items-center self-stretch pl-3 pr-2 md:pl-4 md:pr-3"
        aria-label="CortexFlow AI"
      >
        <img
          src="/logo.png"
          alt="CortexFlow"
          className="h-7 w-auto object-contain md:h-8"
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
