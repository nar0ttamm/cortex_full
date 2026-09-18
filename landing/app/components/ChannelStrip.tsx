import { CalendarMark, GmailMark, PhoneMark, WhatsAppMark } from "./BrandMarks";

const CHANNELS = [
  { label: "Voice", detail: "AI outbound + inbound recap", Icon: PhoneMark },
  { label: "WhatsApp", detail: "Instant recap & reminders", Icon: WhatsAppMark },
  { label: "Gmail & Outlook", detail: "Follow-ups that stay in thread", Icon: GmailMark },
  { label: "Calendar", detail: "Booked before the call ends", Icon: CalendarMark },
];

export function ChannelStrip() {
  return (
    <div className="overflow-hidden rounded-[1.8rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 md:p-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CHANNELS.map((c) => (
          <div key={c.label} className="flex items-center gap-3 rounded-2xl bg-[var(--bg)] p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-[var(--shadow-sm)]">
              <c.Icon className="h-7 w-7" />
            </div>
            <div>
              <p className="font-bold">{c.label}</p>
              <p className="text-xs text-[var(--fg-muted)]">{c.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
