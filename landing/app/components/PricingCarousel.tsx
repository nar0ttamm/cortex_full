"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { IconCheck } from "./icons";

const PRICING_PLANS = [
  {
    name: "Starter",
    desc: "For compact teams turning on AI calling for the first time.",
    features: ["Up to 500 leads", "AI calling basics", "Email & WhatsApp history", "CSV import / export"],
    price: "Trial first",
    highlighted: false,
  },
  {
    name: "Growth",
    desc: "For sales floors that need volume, workflows, and a live board.",
    features: ["Unlimited leads", "Advanced AI workflows", "Full communication timeline", "Google Sheets sync", "Priority support"],
    price: "Most teams",
    highlighted: true,
  },
  {
    name: "Enterprise",
    desc: "For organisations with custom routing, SSO, and a named partner.",
    features: ["Everything in Growth", "Dedicated account manager", "Custom integrations", "SSO & audit logs", "SLA guarantee"],
    price: "Let’s talk",
    highlighted: false,
  },
];

export function PricingCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof window === "undefined") return;
    if (window.innerWidth >= 768) return;
    const cardWidth = Math.min(window.innerWidth * 0.78, 340);
    el.scrollLeft = cardWidth + 16;
  }, []);

  return (
    <>
      <div
        ref={scrollRef}
        className="mx-auto mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-[8%] pb-4 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {PRICING_PLANS.map((plan) => (
          <div key={plan.name} className="w-[78vw] max-w-[340px] shrink-0 snap-center">
            <PlanCard plan={plan} />
          </div>
        ))}
      </div>

      <div className="mt-12 hidden gap-5 md:grid md:grid-cols-3">
        {PRICING_PLANS.map((plan) => (
          <PlanCard key={plan.name} plan={plan} />
        ))}
      </div>
    </>
  );
}

function PlanCard({
  plan,
}: {
  plan: (typeof PRICING_PLANS)[number];
}) {
  return (
    <article
      className={`relative flex h-full flex-col rounded-[1.7rem] p-6 ${
        plan.highlighted
          ? "bg-[var(--bg-ink)] text-white shadow-[var(--shadow-lg)]"
          : "border border-[var(--border)] bg-[var(--bg-elevated)]"
      }`}
    >
      {plan.highlighted && (
        <span className="absolute -top-3 left-6 rounded-full bg-[var(--accent)] px-3 py-1 text-[11px] font-bold text-white">
          Popular
        </span>
      )}
      <h3 className="text-xl font-extrabold">{plan.name}</h3>
      <p className={`mt-2 text-sm ${plan.highlighted ? "text-white/70" : "text-[var(--fg-muted)]"}`}>
        {plan.desc}
      </p>
      <p className={`mt-6 font-serif text-3xl ${plan.highlighted ? "text-white" : "text-[var(--accent)]"}`}>
        {plan.price}
      </p>
      <p className={`text-xs font-semibold ${plan.highlighted ? "text-white/50" : "text-[var(--fg-muted)]"}`}>
        Pricing revealed on onboarding
      </p>
      <ul className="mt-6 flex-1 space-y-3">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <IconCheck className={`mt-0.5 h-4 w-4 shrink-0 ${plan.highlighted ? "text-[#f0a07c]" : "text-[var(--teal)]"}`} />
            <span className={plan.highlighted ? "text-white/85" : "text-[var(--fg-muted)]"}>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/get-started"
        className={`mt-8 block rounded-full py-3 text-center text-sm font-bold transition ${
          plan.highlighted
            ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
            : "border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        }`}
      >
        Get started
      </Link>
    </article>
  );
}
