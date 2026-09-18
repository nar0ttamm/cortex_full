import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../components/AuthShell";
import { IconArrow, IconLock, IconShield } from "../components/icons";
import { CRM_SIGNIN } from "../lib/site";

export const metadata: Metadata = {
  title: "Sign in — CortexFlow AI",
  description: "Continue to your CortexFlow AI CRM workspace.",
};

export default function SignInPage() {
  return (
    <AuthShell
      kicker="Welcome back"
      title={
        <>
          Sign in to your
          <span className="italic text-[var(--accent)]"> sales floor.</span>
        </>
      }
      subtitle="Continue to the CortexFlow AI CRM to pick up live calls, pipeline, and conversation history."
      aside={
        <>
          <p className="font-serif text-4xl leading-tight">
            Your desk is already warm.
          </p>
          <p className="mt-4 text-[var(--fg-muted)]">
            Open the workspace to see overnight connects, booked visits, and every WhatsApp thread waiting for a human.
          </p>
          <dl className="mt-10 grid grid-cols-2 gap-4">
            {[
              ["<2 min", "Speed to first ring"],
              ["24/7", "Coverage"],
              ["1 login", "Whole pipeline"],
              ["Private", "Tenant isolation"],
            ].map(([k, v]) => (
              <div key={v} className="rounded-2xl border border-[var(--border)] bg-white p-4">
                <dt className="font-serif text-2xl">{k}</dt>
                <dd className="mt-1 text-xs font-semibold text-[var(--fg-muted)]">{v}</dd>
              </div>
            ))}
          </dl>
        </>
      }
    >
      <a href={CRM_SIGNIN} className="btn-primary w-full !py-3.5">
        Continue to CRM
        <IconArrow className="h-4 w-4" />
      </a>
      <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 text-sm text-[var(--fg-muted)]">
        <p className="flex items-center gap-2 font-semibold text-[var(--fg)]">
          <IconLock className="h-4 w-4 text-[var(--accent)]" />
          You&apos;ll finish sign-in on the secure CRM
        </p>
        <p className="mt-1 pl-6">
          Email and password stay on crm.cortexflow.in — this page never collects credentials.
        </p>
      </div>
      <div className="mt-8 flex items-start gap-3 rounded-2xl border border-[var(--border)] p-4">
        <IconShield className="mt-0.5 h-5 w-5 text-[var(--teal)]" />
        <p className="text-sm text-[var(--fg-muted)]">
          Row-level isolation, OAuth access, and encrypted credentials. Your leads are not a shared inbox.
        </p>
      </div>
      <p className="mt-8 text-sm text-[var(--fg-muted)]">
        New team?{" "}
        <Link href="/get-started" className="font-bold text-[var(--accent)]">
          Get started
        </Link>
      </p>
    </AuthShell>
  );
}
