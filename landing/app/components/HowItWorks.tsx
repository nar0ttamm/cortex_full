import { IconBolt, IconCalendar, IconPhone } from "./icons";
import { ScrollReveal } from "./ScrollReveal";

const STEPS = [
  {
    n: "01",
    title: "Import the list",
    desc: "Drop a CSV or connect a sheet. CortexFlow AI maps names, numbers, and project tags in seconds.",
    icon: IconBolt,
    tone: "bg-[var(--accent-soft)] text-[var(--accent)]",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=720&q=70",
  },
  {
    n: "02",
    title: "AI starts calling",
    desc: "Every new lead is dialled in under two minutes — 24/7, in your voice, with your script.",
    icon: IconPhone,
    tone: "bg-[var(--gold-soft)] text-[var(--gold)]",
    image: "https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?auto=format&fit=crop&w=720&q=70",
  },
  {
    n: "03",
    title: "Meetings land on calendar",
    desc: "Qualified conversations become appointments, with WhatsApp and email reminders baked in.",
    icon: IconCalendar,
    tone: "bg-[var(--teal-soft)] text-[var(--teal)]",
    image: "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=720&q=70",
  },
];

export function HowItWorks() {
  return (
    <div className="relative grid gap-5 md:grid-cols-3">
      {STEPS.map((step, i) => (
        <ScrollReveal key={step.n} delay={i * 90}>
          <article className="relative h-full overflow-hidden rounded-[1.6rem] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)]">
            <img src={step.image} alt="" className="h-36 w-full object-cover" />
            <div className="p-6">
              <div className="flex items-center justify-between">
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${step.tone}`}>
                  <step.icon className="h-5 w-5" />
                </span>
                <span className="font-serif text-3xl text-[var(--fg-muted)]/40">{step.n}</span>
              </div>
              <h3 className="mt-6 text-xl font-extrabold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--fg-muted)]">{step.desc}</p>
            </div>
          </article>
        </ScrollReveal>
      ))}
    </div>
  );
}
