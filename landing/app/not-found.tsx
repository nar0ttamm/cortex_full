import Link from "next/link";
import { Logo } from "./components/Logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Logo />
      <h1 className="mt-8 font-serif text-5xl">This page isn&apos;t on the floor.</h1>
      <p className="mt-3 max-w-md text-[var(--fg-muted)]">The link may be old. Head back to the site or open a workspace.</p>
      <div className="mt-8 flex gap-3">
        <Link href="/" className="btn-primary">
          Home
        </Link>
        <Link href="/get-started" className="btn-secondary">
          Get started
        </Link>
      </div>
    </div>
  );
}
