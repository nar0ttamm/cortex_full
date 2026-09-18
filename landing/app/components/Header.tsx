"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CRM_SIGNIN, NAV_LINKS } from "../lib/site";
import { Logo } from "./Logo";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 md:px-6 md:pt-5">
      <nav
        className={`mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-4 py-3 transition-all duration-300 md:px-5 ${
          scrolled || open
            ? "border border-[var(--border)] bg-[var(--bg-elevated)]/90 shadow-[var(--shadow-md)] backdrop-blur-xl"
            : "border border-transparent bg-[var(--bg-elevated)]/55 backdrop-blur-md"
        }`}
      >
        <Logo />

        <div className="hidden items-center gap-7 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm font-semibold text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href="/signin"
            className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--fg)] transition hover:bg-[var(--bg-warm)]"
          >
            Sign in
          </Link>
          <Link href="/get-started" className="btn-primary !px-5 !py-2.5 text-sm">
            Get started
          </Link>
        </div>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
        >
          <span className="sr-only">Menu</span>
          <div className="flex flex-col gap-1.5">
            <span className={`h-0.5 w-4 bg-[var(--fg)] transition ${open ? "translate-y-2 rotate-45" : ""}`} />
            <span className={`h-0.5 w-4 bg-[var(--fg)] transition ${open ? "opacity-0" : ""}`} />
            <span className={`h-0.5 w-4 bg-[var(--fg)] transition ${open ? "-translate-y-2 -rotate-45" : ""}`} />
          </div>
        </button>
      </nav>

      {open && (
        <div className="mx-auto mt-2 max-w-6xl rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-lg)] lg:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-base font-semibold text-[var(--fg)] hover:bg-[var(--bg)]"
              >
                {link.label}
              </a>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link
              href="/signin"
              onClick={() => setOpen(false)}
              className="btn-secondary !py-3 text-sm"
            >
              Sign in
            </Link>
            <Link
              href="/get-started"
              onClick={() => setOpen(false)}
              className="btn-primary !py-3 text-sm"
            >
              Get started
            </Link>
          </div>
          <a
            href={CRM_SIGNIN}
            className="mt-3 block text-center text-xs font-medium text-[var(--fg-muted)]"
          >
            Already using the CRM? Open workspace
          </a>
        </div>
      )}
    </header>
  );
}
