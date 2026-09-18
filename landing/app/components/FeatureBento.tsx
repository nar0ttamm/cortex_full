import {
  IconCalendar,
  IconChart,
  IconChat,
  IconPhone,
  IconShield,
  IconUsers,
} from "./icons";
import { ScrollReveal } from "./ScrollReveal";

const FEATURES = [
  {
    title: "AI calling that sounds like your best closer",
    desc: "Outbound campaigns run overnight. The agent qualifies budget, urgency, and next step — then writes the CRM so your team walks into a warm conversation.",
    icon: IconPhone,
    span: "md:col-span-4",
    visual: "call",
  },
  {
    title: "Lead desk, not a spreadsheet",
    desc: "Filter, tag, and import lists. Every contact has a living timeline instead of scattered notes.",
    icon: IconUsers,
    span: "md:col-span-2",
  },
  {
    title: "WhatsApp, email, voice — one thread",
    desc: "No more switching apps to remember what was promised on the last call.",
    icon: IconChat,
    span: "md:col-span-2",
  },
  {
    title: "Live conversion board",
    desc: "See reach, connect, qualify, and book rates as they move. Not a report you open on Friday.",
    icon: IconChart,
    span: "md:col-span-4",
    visual: "bars",
  },
  {
    title: "Appointments that actually show up",
    desc: "Booked on the call, confirmed on WhatsApp, nudged again 3 hours before.",
    icon: IconCalendar,
    span: "md:col-span-3",
  },
  {
    title: "Private by default",
    desc: "Tenant isolation, encrypted credentials, and OAuth access. Your pipeline stays yours.",
    icon: IconShield,
    span: "md:col-span-3",
  },
];

export function FeatureBento() {
  return (
    <div className="grid gap-4 md:grid-cols-6">
      {FEATURES.map((f, i) => (
        <ScrollReveal key={f.title} delay={i * 60} className={f.span}>
          <article className="flex h-full flex-col rounded-[1.6rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-[var(--shadow-sm)]">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-5 text-lg font-extrabold tracking-tight">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--fg-muted)]">{f.desc}</p>
            {"visual" in f && f.visual === "call" && <CallGraphic />}
            {"visual" in f && f.visual === "bars" && <BarsGraphic />}
          </article>
        </ScrollReveal>
      ))}
    </div>
  );
}

function CallGraphic() {
  return (
    <div className="mt-6 grid gap-3 rounded-2xl bg-[var(--bg)] p-4 sm:grid-cols-3">
      {["Script loaded", "Objection handled", "Slot offered"].map((item, i) => (
        <div key={item} className="rounded-xl bg-white px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--fg-muted)]">Step {i + 1}</p>
          <p className="mt-1 text-sm font-semibold">{item}</p>
        </div>
      ))}
    </div>
  );
}

function BarsGraphic() {
  return (
    <div className="mt-6 flex h-20 items-end gap-2 rounded-2xl bg-[var(--bg)] px-4 py-3">
      {[40, 62, 48, 78, 55, 88, 70].map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-md bg-[var(--teal)]"
          style={{ height: `${h}%`, opacity: 0.35 + i * 0.08 }}
        />
      ))}
    </div>
  );
}
