import Link from "next/link";
import { CONTACT_EMAIL, CRM_URL, NAV_LINKS } from "../lib/site";
import { CalendarMark, ExcelMark, GmailMark, SheetsMark, WhatsAppMark } from "./BrandMarks";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--bg-elevated)]">
      <div className="container-page py-14 md:py-20">
        <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[var(--fg-muted)]">
              The sales floor that never clocks out. AI calling, pipeline, and
              conversation history — designed for teams that answer every lead.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {[WhatsAppMark, GmailMark, CalendarMark, SheetsMark, ExcelMark].map((Mark, i) => (
                <span key={i} className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white">
                  <Mark className="h-4 w-4" />
                </span>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--fg-muted)]">
              Product
            </h4>
            <div className="mt-4 space-y-2.5">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="block text-sm font-medium text-[var(--fg)] hover:text-[var(--accent)]"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--fg-muted)]">
              Workspace
            </h4>
            <div className="mt-4 space-y-2.5">
              <Link href="/signin" className="block text-sm font-medium hover:text-[var(--accent)]">
                Sign in
              </Link>
              <Link href="/get-started" className="block text-sm font-medium hover:text-[var(--accent)]">
                Get started
              </Link>
              <a href={CRM_URL} className="block text-sm font-medium hover:text-[var(--accent)]">
                Open CRM
              </a>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--fg-muted)]">
              Contact
            </h4>
            <div className="mt-4 space-y-2.5">
              <a href={`mailto:${CONTACT_EMAIL}`} className="block text-sm font-medium hover:text-[var(--accent)]">
                {CONTACT_EMAIL}
              </a>
              <p className="text-sm text-[var(--fg-muted)]">India · Remote-first</p>
            </div>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-[var(--border)] pt-6 text-sm text-[var(--fg-muted)] md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} CortexFlow AI. All rights reserved.</p>
          <p>Secure by design · Your pipeline stays yours</p>
        </div>
      </div>
    </footer>
  );
}
