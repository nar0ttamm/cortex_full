"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AuthShell } from "../components/AuthShell";
import {
  IconArrow,
  IconBank,
  IconBuilding,
  IconCar,
  IconCart,
  IconCheck,
  IconChip,
  IconDots,
  IconFactory,
  IconGraduation,
  IconHeart,
  IconHome,
  IconLayers,
  IconPhone,
  IconPlane,
  IconUsers,
} from "../components/icons";
import { CRM_SIGNUP } from "../lib/site";

const INDUSTRIES = [
  { id: "Real Estate", icon: IconHome },
  { id: "Education", icon: IconGraduation },
  { id: "Healthcare", icon: IconHeart },
  { id: "Finance & Insurance", icon: IconBank },
  { id: "Retail & E-commerce", icon: IconCart },
  { id: "Technology", icon: IconChip },
  { id: "Manufacturing", icon: IconFactory },
  { id: "Travel & Hospitality", icon: IconPlane },
  { id: "Automotive", icon: IconCar },
  { id: "Other", icon: IconDots },
];

const GOALS = [
  {
    id: "calling",
    title: "AI calling first",
    desc: "Dial every new lead in under two minutes and qualify before a human steps in.",
    icon: IconPhone,
  },
  {
    id: "crm",
    title: "Pipeline desk",
    desc: "One timeline for WhatsApp, email, and voice so the team never loses context.",
    icon: IconLayers,
  },
  {
    id: "both",
    title: "The full floor",
    desc: "Calling, CRM, reminders, and booking — the motion most teams actually need.",
    icon: IconUsers,
  },
];

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Compact teams turning the lights on.",
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "The default for scaling sales floors.",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Custom routing, SSO, and a named partner.",
  },
];

export function GetStartedFlow() {
  const [step, setStep] = useState(1);
  const [industry, setIndustry] = useState("Real Estate");
  const [goal, setGoal] = useState("both");
  const [plan, setPlan] = useState("growth");

  const signupHref = useMemo(() => {
    const params = new URLSearchParams({ industry, goal, plan });
    return `${CRM_SIGNUP}?${params.toString()}`;
  }, [industry, goal, plan]);

  return (
    <AuthShell
      kicker={`Step ${step} of 3`}
      title={
        step === 1 ? (
          <>
            Where should the
            <span className="italic text-[var(--accent)]"> floor live?</span>
          </>
        ) : step === 2 ? (
          <>
            What should it
            <span className="italic text-[var(--accent)]"> do first?</span>
          </>
        ) : (
          <>
            Pick a workspace
            <span className="italic text-[var(--accent)]"> to start.</span>
          </>
        )
      }
      subtitle={
        step === 1
          ? "We’ll tune scripts and examples around your industry. You can change this later."
          : step === 2
            ? "This just shapes onboarding. You still get calling, CRM, and reminders in the product."
            : "Every plan starts with a 3-day trial. No card on this page — billing happens in the CRM if you continue."
      }
      aside={
        <>
          <p className="font-serif text-4xl leading-tight">Stand up a floor in a coffee break.</p>
          <ol className="mt-8 space-y-4">
            {["Choose the industry", "Set the first motion", "Open the CRM workspace"].map((item, i) => (
              <li key={item} className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                    step > i + 1
                      ? "bg-[var(--teal)] text-white"
                      : step === i + 1
                        ? "bg-[var(--accent)] text-white"
                        : "bg-white text-[var(--fg-muted)]"
                  }`}
                >
                  {step > i + 1 ? <IconCheck className="h-4 w-4" /> : i + 1}
                </span>
                <span className="font-semibold">{item}</span>
              </li>
            ))}
          </ol>
          <div className="mt-10 rounded-2xl border border-[var(--border)] bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Your setup</p>
            <p className="mt-2 text-sm font-semibold">{industry}</p>
            <p className="text-sm text-[var(--fg-muted)]">
              {GOALS.find((g) => g.id === goal)?.title} · {PLANS.find((p) => p.id === plan)?.name}
            </p>
          </div>
        </>
      }
    >
      <div className="mb-6 flex gap-2 lg:hidden">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="grid grid-cols-2 gap-3">
          {INDUSTRIES.map((item) => {
            const active = industry === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndustry(item.id)}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border)] bg-white hover:border-[#d4cbbd]"
                }`}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${active ? "bg-white text-[var(--accent)]" : "bg-[var(--bg)] text-[var(--fg)]"}`}>
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-bold leading-tight">{item.id}</span>
              </button>
            );
          })}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          {GOALS.map((item) => {
            const active = goal === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setGoal(item.id)}
                className={`flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition ${
                  active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-white"
                }`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--accent)]">
                  <item.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-extrabold">{item.title}</span>
                  <span className="mt-1 block text-sm text-[var(--fg-muted)]">{item.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          {PLANS.map((item) => {
            const active = plan === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPlan(item.id)}
                className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left ${
                  active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-white"
                }`}
              >
                <span>
                  <span className="block font-extrabold">{item.name}</span>
                  <span className="text-sm text-[var(--fg-muted)]">{item.tagline}</span>
                </span>
                {item.id === "growth" && (
                  <span className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    Popular
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        {step > 1 && (
          <button type="button" onClick={() => setStep((s) => s - 1)} className="btn-secondary flex-1">
            Back
          </button>
        )}
        {step < 3 ? (
          <button type="button" onClick={() => setStep((s) => s + 1)} className="btn-primary flex-[2]">
            Continue
            <IconArrow className="h-4 w-4" />
          </button>
        ) : (
          <a href={signupHref} className="btn-primary flex-[2]">
            Create workspace
            <IconArrow className="h-4 w-4" />
          </a>
        )}
      </div>
      <p className="mt-6 text-sm text-[var(--fg-muted)]">
        Already have a desk?{" "}
        <Link href="/signin" className="font-bold text-[var(--accent)]">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
