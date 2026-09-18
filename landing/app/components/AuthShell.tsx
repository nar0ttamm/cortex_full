import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarMark, GmailMark, SheetsMark, WhatsAppMark } from "./BrandMarks";
import { Logo } from "./Logo";

export function AuthShell({
  kicker,
  title,
  subtitle,
  children,
  aside,
}: {
  kicker: string;
  title: ReactNode;
  subtitle: string;
  children: ReactNode;
  aside: ReactNode;
}) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[0.92fr_1.08fr]">
      <aside className="relative hidden overflow-hidden bg-[var(--bg)] p-10 lg:flex lg:flex-col">
        <img
          src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=70"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#f4f0ea_0%,rgba(244,240,234,0.92)_45%,#f4f0ea_100%)]" />
        <div className="relative z-10">
          <Logo />
        </div>
        <div className="relative z-10 my-auto max-w-md">{aside}</div>
        <div className="relative z-10 flex items-center gap-2">
          {[WhatsAppMark, GmailMark, CalendarMark, SheetsMark].map((Mark, i) => (
            <span key={i} className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white">
              <Mark className="h-4 w-4" />
            </span>
          ))}
          <p className="ml-2 text-sm text-[var(--fg-muted)]">Secure workspace · India</p>
        </div>
      </aside>
      <section className="flex min-h-screen flex-col bg-[var(--bg-elevated)] px-5 py-8 md:px-12">
        <div className="mb-8 flex items-center justify-between lg:justify-end">
          <span className="lg:hidden">
            <Logo />
          </span>
          <Link href="/" className="text-sm font-semibold text-[var(--fg-muted)] hover:text-[var(--fg)]">
            ← Back to site
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center pb-10">
          <p className="eyebrow">{kicker}</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight md:text-[2.7rem]">{title}</h1>
          <p className="mt-3 text-[var(--fg-muted)]">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </div>
  );
}
