"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconBolt, IconCalendar, IconChart, IconCheck, IconClock, IconLock, IconPhone } from "./icons";
import { Logo } from "./Logo";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://cortex-backend-api.vercel.app";

type FormState = "idle" | "loading" | "success" | "error";

const FEATURES = [
  {
    icon: IconPhone,
    title: "AI calls every lead in under 2 minutes",
    desc: "The agent dials the moment a lead arrives — day or night.",
  },
  {
    icon: IconBolt,
    title: "Project-centric CRM",
    desc: "Organise by project, assign owners, and keep every note on the contact.",
  },
  {
    icon: IconChart,
    title: "Live pipeline, not a weekly report",
    desc: "See connect, qualify, and book rates while the floor is still moving.",
  },
];

export function BookDemoButton({
  className = "btn-secondary",
  label = "Book a live demo",
}: {
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => nameRef.current?.focus(), 120);
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        window.clearTimeout(id);
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !whatsapp.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    const cleaned = whatsapp.replace(/\s/g, "");
    if (!/^\+?[0-9]{10,15}$/.test(cleaned)) {
      setError("Enter a valid WhatsApp number with country code, e.g. +919876543210.");
      return;
    }
    setState("loading");
    setError("");
    try {
      const res = await fetch(`${BACKEND_URL}/v1/demo/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), whatsapp_number: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      setState("success");
    } catch (err: unknown) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  function handleClose() {
    setOpen(false);
    window.setTimeout(() => {
      setState("idle");
      setError("");
      setName("");
      setWhatsapp("");
    }, 280);
  }

  const modal =
    open && mounted
      ? createPortal(
          <div className="fixed inset-0 z-[1000] isolate flex items-center justify-center p-3 sm:p-6">
            <div className="absolute inset-0 bg-[#1a1714]/55 backdrop-blur-md" onClick={handleClose} />
            <div className="relative z-10 flex max-h-[min(92vh,760px)] w-full max-w-3xl overflow-hidden rounded-[1.6rem] bg-white shadow-[var(--shadow-lg)]">
              <div className="hidden w-[42%] shrink-0 flex-col justify-between overflow-y-auto bg-[#f7f3ec] p-8 lg:flex">
                <div>
                  <Logo />
                  <h2 className="mt-8 font-serif text-3xl leading-tight">
                    Hear the floor
                    <span className="italic text-[var(--accent)]"> in two minutes.</span>
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--fg-muted)]">
                    Leave your number. Our AI agent calls you with a live walkthrough of calling, CRM, and booking.
                  </p>
                  <ul className="mt-8 space-y-5">
                    {FEATURES.map((f) => (
                      <li key={f.title} className="flex gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--accent)]">
                          <f.icon className="h-5 w-5" />
                        </span>
                        <span>
                          <p className="text-sm font-bold">{f.title}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-[var(--fg-muted)]">{f.desc}</p>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <blockquote className="mt-8 rounded-2xl border border-[var(--border)] bg-white p-4">
                  <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
                    “Lead response dropped from hours to seconds. The calendar filled before lunch.”
                  </p>
                  <p className="mt-2 text-xs font-bold">Meera Kamat, Head of sales · Pune</p>
                </blockquote>
              </div>

              <div className="relative min-h-0 flex-1 overflow-y-auto bg-white p-6 sm:p-8">
                <button
                  type="button"
                  onClick={handleClose}
                  className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-lg"
                  aria-label="Close"
                >
                  ×
                </button>

                {state === "success" ? (
                  <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--teal-soft)] text-[var(--teal)]">
                      <IconCheck className="h-8 w-8" />
                    </span>
                    <h3 className="mt-5 font-serif text-3xl">You&apos;re booked</h3>
                    <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--fg-muted)]">
                      The agent is dialling now. Pick up for the live demo. Reply RETRY on WhatsApp if you miss it.
                    </p>
                    <button type="button" onClick={handleClose} className="btn-primary mt-8">
                      Done
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mb-6 pr-10">
                      <h2 className="font-serif text-3xl">Get the demo call</h2>
                      <p className="mt-1 text-sm text-[var(--fg-muted)]">
                        Name and WhatsApp. That&apos;s the whole form.
                      </p>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                          Your name
                        </label>
                        <input
                          ref={nameRef}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Ananya Krishnan"
                          disabled={state === "loading"}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                          WhatsApp number
                        </label>
                        <input
                          type="tel"
                          value={whatsapp}
                          onChange={(e) => setWhatsapp(e.target.value)}
                          placeholder="+91 98765 43210"
                          disabled={state === "loading"}
                          className="input-field"
                        />
                        <p className="mt-1.5 text-xs text-[var(--fg-muted)]">Include country code — +91 for India</p>
                      </div>
                      {error && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                          {error}
                        </div>
                      )}
                      <button type="submit" disabled={state === "loading"} className="btn-primary w-full !py-3.5">
                        {state === "loading" ? "Connecting your demo…" : "Call me now"}
                      </button>
                      <div className="flex justify-center gap-5 pt-1 text-xs font-medium text-[var(--fg-muted)]">
                        <span className="inline-flex items-center gap-1">
                          <IconLock className="h-3.5 w-3.5" /> No spam
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <IconClock className="h-3.5 w-3.5" /> Under 2 min
                        </span>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <IconCalendar className="h-4 w-4" />
        {label}
      </button>
      {modal}
    </>
  );
}
