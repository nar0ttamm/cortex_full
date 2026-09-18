import { IconChart, IconLayers, IconPhone, IconUsers } from "./icons";
import { ScrollReveal } from "./ScrollReveal";

const CASES = [
  {
    title: "Lead & pipeline desk",
    desc: "Own every stage from first touch to closed-won. Notes, owners, and next actions live on the contact — not in chat.",
    icon: IconLayers,
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=70",
  },
  {
    title: "Always-on outbound",
    desc: "Launch campaigns that dial hundreds of leads while the floor is empty. Morning standup starts with booked meetings.",
    icon: IconPhone,
    image: "https://images.unsplash.com/photo-1596526131083-e8c633c242ba?auto=format&fit=crop&w=800&q=70",
  },
  {
    title: "Full conversation memory",
    desc: "WhatsApp, email, and call transcripts sit on one timeline so no one asks “what did we last say?”",
    icon: IconChart,
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=800&q=70",
  },
  {
    title: "Team-wide visibility",
    desc: "Managers see connect rates and stalled deals in real time. Reps see only the work that needs a human.",
    icon: IconUsers,
    image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=70",
  },
];

export function UseCases() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {CASES.map((item, i) => (
        <ScrollReveal key={item.title} delay={i * 70}>
          <article className="overflow-hidden rounded-[1.6rem] border border-[var(--border)] bg-[var(--bg-elevated)]">
            <img src={item.image} alt="" className="h-40 w-full object-cover" />
            <div className="flex gap-4 p-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--bg)] text-[var(--accent)]">
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold tracking-tight">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--fg-muted)]">{item.desc}</p>
              </div>
            </div>
          </article>
        </ScrollReveal>
      ))}
    </div>
  );
}
