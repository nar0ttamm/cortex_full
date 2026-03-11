"use client";

import { useState } from "react";

const faqs = [
  {
    id: "1",
    q: "What is CortexFlow?",
    a: "CortexFlow is an AI-powered CRM that combines lead management with AI calling automation. Manage leads, track WhatsApp, email, and call history, and run your sales pipeline from one dashboard.",
  },
  {
    id: "2",
    q: "How does CortexFlow work?",
    a: "Connect your data (Google Sheets or CSV), set up AI calling workflows, and track every touchpoint in the CRM. All communications appear in a single timeline so you never lose context.",
  },
  {
    id: "3",
    q: "Can I import my existing leads?",
    a: "Yes. Bulk import via CSV or connect a Google Sheet. Your pipeline moves in without re-typing.",
  },
  {
    id: "4",
    q: "Is my data secure?",
    a: "We use OAuth for access and keep your data under your control. Communications and lead data are stored securely.",
  },
  {
    id: "5",
    q: "What channels are supported?",
    a: "CortexFlow tracks WhatsApp, email, and voice calls in one place. View full communication history per lead.",
  },
];

export function FaqAccordion() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {faqs.map((faq) => {
        const isOpen = openId === faq.id;
        return (
          <div
            key={faq.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 overflow-hidden transition-colors hover:border-[var(--accent)]/40 md:rounded-2xl"
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : faq.id)}
              className="flex w-full items-center justify-between gap-2 px-4 py-4 text-left md:gap-4 md:px-6 md:py-5"
            >
              <span className="text-xs font-medium text-[var(--fg-muted)] shrink-0 mr-1 md:mr-2 md:text-sm">
                {faq.id.padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1 text-left text-sm font-semibold text-[var(--fg)] md:text-base">
                {faq.q}
              </span>
              <span
                className={`text-2xl text-[var(--accent)] transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}
              >
                +
              </span>
            </button>
            <div
              className={`grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <div className="overflow-hidden">
                <p className="px-4 pb-4 pt-0 text-[var(--fg-muted)] text-xs leading-relaxed md:px-6 md:pb-5 md:text-sm">
                  {faq.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
