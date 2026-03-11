"use client";

import { useEffect, useRef } from "react";

const CRM_URL = "https://crm.cortexflow.in";

const PRICING_PLANS = [
  {
    name: "Starter",
    desc: "For small teams getting started with AI calling and lead management.",
    features: ["Up to 500 leads", "AI calling basics", "Email & WhatsApp history", "CSV import/export"],
    price: "Soon to be revealed",
    highlighted: false,
  },
  {
    name: "Growth",
    desc: "For growing teams that need more scale and automation.",
    features: ["Unlimited leads", "Advanced AI workflows", "Full communication timeline", "Google Sheets sync", "Priority support"],
    price: "Soon to be revealed",
    highlighted: true,
  },
  {
    name: "Enterprise",
    desc: "For large teams with custom needs and compliance.",
    features: ["Everything in Growth", "Dedicated account manager", "Custom integrations", "SSO & audit logs", "SLA guarantee"],
    price: "Soon to be revealed",
    highlighted: false,
  },
];

export function PricingCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof window === "undefined") return;
    const isMobile = window.innerWidth < 768;
    if (!isMobile) return;
    const cardWidth = Math.min(window.innerWidth * 0.72, 320);
    const gap = 12;
    el.scrollLeft = cardWidth + gap;
  }, []);

  return (
    <>
      {/* Mobile: carousel with center card + peek */}
      <div
        ref={scrollRef}
        className="mx-auto mt-12 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[7%] pb-4 md:hidden [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {PRICING_PLANS.map((plan) => (
          <div
            key={plan.name}
            className="relative w-[72vw] max-w-[320px] shrink-0 snap-center rounded-2xl p-5"
            style={{ scrollSnapAlign: "center" }}
          >
            <div
              className={`relative h-full rounded-2xl p-5 ${
                plan.highlighted
                  ? "cta-gradient-border shadow-[0_0_40px_var(--glow)]"
                  : "border border-[var(--border)] bg-[var(--bg-elevated)]/60"
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-xs font-medium text-[var(--bg)]">
                  Popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-[var(--fg)]">{plan.name}</h3>
              <p className="mt-1.5 text-xs text-[var(--fg-muted)]">{plan.desc}</p>
              <p className="mt-4 text-xl font-bold text-[var(--accent)]">{plan.price}</p>
              <ul className="mt-4 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                    <span className="text-[var(--accent)]">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href={CRM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 block w-full rounded-full border border-[var(--border)] py-2.5 text-center text-sm font-medium text-[var(--fg)] transition hover:border-[var(--accent)] hover:bg-[var(--accent)]/10"
              >
                Get started
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: grid */}
      <div className="mt-16 hidden grid-cols-1 gap-6 md:grid md:grid-cols-3">
        {PRICING_PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`relative rounded-2xl p-6 md:p-8 ${
              plan.highlighted
                ? "cta-gradient-border shadow-[0_0_40px_var(--glow)]"
                : "border border-[var(--border)] bg-[var(--bg-elevated)]/60"
            }`}
          >
            {plan.highlighted && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--accent)] px-3 py-0.5 text-xs font-medium text-[var(--bg)]">
                Popular
              </span>
            )}
            <h3 className="text-xl font-semibold text-[var(--fg)]">{plan.name}</h3>
            <p className="mt-2 text-sm text-[var(--fg-muted)]">{plan.desc}</p>
            <p className="mt-6 text-2xl font-bold text-[var(--accent)]">{plan.price}</p>
            <ul className="mt-6 space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
                  <span className="text-[var(--accent)]">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <a
              href={CRM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 block w-full rounded-full border border-[var(--border)] py-3 text-center text-sm font-medium text-[var(--fg)] transition hover:border-[var(--accent)] hover:bg-[var(--accent)]/10"
            >
              Get started
            </a>
          </div>
        ))}
      </div>
    </>
  );
}
