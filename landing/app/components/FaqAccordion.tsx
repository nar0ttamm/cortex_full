"use client";

import { useState } from "react";

const faqs = [
  {
    id: "01",
    q: "What is CortexFlow AI?",
    a: "CortexFlow AI is an AI-powered CRM that pairs lead management with always-on calling. It dials new leads, qualifies conversations, books appointments, and keeps WhatsApp, email, and call history on one timeline.",
  },
  {
    id: "02",
    q: "How fast does the AI call a new lead?",
    a: "As soon as a lead lands — typically under two minutes. Speed-to-lead is the whole product thesis: the first team to speak usually wins the meeting.",
  },
  {
    id: "03",
    q: "Can I import my existing pipeline?",
    a: "Yes. Bulk import via CSV or connect a Google Sheet. Names, numbers, and project tags map in without re-typing.",
  },
  {
    id: "04",
    q: "Is my data isolated from other customers?",
    a: "Yes. We use tenant isolation, OAuth for access, and encrypted credentials. Your pipeline is not a shared spreadsheet.",
  },
  {
    id: "05",
    q: "Which channels sit in the CRM?",
    a: "Voice, WhatsApp, and email — plus calendar holds created during the call. Every touchpoint is visible before a human picks up.",
  },
];

export function FaqAccordion() {
  const [openId, setOpenId] = useState<string | null>("01");

  return (
    <div className="space-y-3">
      {faqs.map((faq) => {
        const isOpen = openId === faq.id;
        return (
          <div
            key={faq.id}
            className={`overflow-hidden rounded-2xl border transition ${
              isOpen ? "border-[var(--accent)]/30 bg-white shadow-[var(--shadow-sm)]" : "border-[var(--border)] bg-[var(--bg-elevated)]"
            }`}
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : faq.id)}
              className="flex w-full items-center gap-4 px-5 py-4 text-left"
              aria-expanded={isOpen}
            >
              <span className="font-serif text-lg text-[var(--accent)]">{faq.id}</span>
              <span className="flex-1 text-base font-bold">{faq.q}</span>
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-lg leading-none transition ${
                  isOpen ? "rotate-45 bg-[var(--accent)] text-white" : "bg-white"
                }`}
              >
                +
              </span>
            </button>
            <div className={`grid transition-all duration-300 ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                <p className="px-5 pb-5 pl-[4.25rem] text-sm leading-relaxed text-[var(--fg-muted)]">{faq.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
