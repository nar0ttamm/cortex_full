import Link from "next/link";
import { FaqAccordion } from "./components/FaqAccordion";
import { HeroBackground } from "./components/HeroBackground";
import { PricingCarousel } from "./components/PricingCarousel";
import { ScrollReveal } from "./components/ScrollReveal";
import { SectionReveal } from "./components/SectionReveal";

const CRM_URL = "https://crm.cortexflow.in";

const NAV_LINKS = [
  { label: "Home", href: "#" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
];

const FEATURES = [
  {
    title: "Real-Time Lead Management",
    desc: "View, filter, and manage all leads in one place. Import via CSV. Never lose a contact again.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    title: "AI Calling Automation",
    desc: "Automate outbound calls with AI. Your agent calls leads 24/7, qualifies them, and schedules appointments.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12c-.98-2.46-1.63-5.01-1.93-8a2 2 0 0 1 1.99-2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L9.91 9.91a16 16 0 0 0 6.18 6.18l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    ),
  },
  {
    title: "Unified Communications",
    desc: "WhatsApp, email, and call transcripts in a single timeline — full context for every lead, always.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    title: "Live Dashboard & Analytics",
    desc: "Real-time conversion rates, call stats, and appointment pipeline. Know exactly where your business stands.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    title: "Appointment Scheduling",
    desc: "AI books appointments during calls. Auto-reminders via WhatsApp at 24h and 3h before — zero no-shows.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    title: "Secure & Private",
    desc: "Encrypted credentials, row-level data isolation, and OAuth access. Your pipeline stays yours.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
];

const USE_CASES = [
  {
    title: "Lead & Pipeline Management",
    desc: "Manage leads and deals in one place. Track status, add notes, and never drop a follow-up.",
  },
  {
    title: "Outbound Call Campaigns",
    desc: "Reach hundreds of leads automatically. Launch AI-powered outbound campaigns for follow-ups and reminders.",
  },
  {
    title: "Communication History",
    desc: "Every WhatsApp, email, and call in one timeline. Full context for every lead before you pick up the phone.",
  },
  {
    title: "Team Visibility",
    desc: "Dashboard and activity feed so the whole team sees recent actions and pipeline health in real time.",
  },
];

const LOGO_WORDS = ["Leads", "Calls", "WhatsApp", "Email", "CRM", "AI", "Pipeline", "Dashboard"];

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Nav — mobile: compact; desktop: full */}
      <header className="fixed left-3 right-3 top-3 z-50 md:left-6 md:right-6 lg:left-1/2 lg:right-auto lg:top-6 lg:w-full lg:max-w-7xl lg:-translate-x-1/2">
        <nav className="flex items-center justify-between border border-[var(--border)]/60 bg-[var(--bg)]/80 px-3 py-2.5 backdrop-blur-xl rounded-none md:px-10 md:py-5">
          <Link href="/" className="text-base font-semibold tracking-tight md:text-2xl">
            <span className="gradient-text">CortexFlow</span>
          </Link>
          <div className="hidden items-center gap-8 md:flex md:gap-10">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-base font-medium text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
              >
                {link.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <a
              href="#contact"
              className="rounded-none border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--fg)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] md:px-5 md:py-3 md:text-sm"
            >
              Talk to Sales
            </a>
            <a
              href={CRM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-none bg-[var(--accent)] px-3 py-2 text-xs font-medium text-[var(--bg)] transition hover:bg-[var(--accent-dim)] hover:shadow-[0_0_20px_var(--glow)] md:px-6 md:py-3.5 md:text-base"
            >
              Sign in
            </a>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero — 100% viewport */}
        <section className="relative flex min-h-screen min-h-[100dvh] flex-col overflow-hidden px-4 pt-24 pb-8 md:px-6 md:pt-36 md:pb-16">
          <HeroBackground />
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center">
            <div className="mx-auto max-w-4xl text-center">
              <ScrollReveal>
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-1.5 text-xs font-medium text-[var(--fg-muted)] mb-6 md:mb-8">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                  AI-Powered CRM Platform
                </div>
              </ScrollReveal>
              <ScrollReveal delay={50}>
                <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl md:text-6xl lg:text-7xl">
                  Turn Every Lead Into{" "}
                  <span className="block gradient-text">
                    a Closed Deal
                  </span>
                </h1>
              </ScrollReveal>
              <ScrollReveal delay={150}>
                <p className="mt-4 text-sm text-[var(--fg-muted)] sm:mt-6 sm:text-base md:mt-8 md:text-xl max-w-2xl mx-auto">
                  AI calls your leads, qualifies them, books appointments, and sends
                  WhatsApp + email follow-ups — fully automated.
                </p>
              </ScrollReveal>
              <ScrollReveal delay={250}>
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 md:mt-12">
                  <a
                    href={CRM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-7 py-3.5 text-sm font-semibold text-[var(--bg)] transition hover:bg-[var(--accent-dim)] hover:shadow-[0_0_32px_var(--glow)] sm:text-base"
                  >
                    Open CRM
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </a>
                  <a
                    href="#features"
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-7 py-3.5 text-sm font-medium text-[var(--fg-muted)] transition hover:border-[var(--accent)]/60 hover:text-[var(--fg)] sm:text-base"
                  >
                    See Features
                  </a>
                </div>
              </ScrollReveal>
            </div>
          </div>
          {/* Stats bar */}
          <div className="relative z-10 mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto mb-8 md:mb-0">
            {[
              { value: '24/7', label: 'AI Calling' },
              { value: '4', label: 'Channels' },
              { value: '<2min', label: 'Lead Response' },
              { value: '100%', label: 'Automated' },
            ].map((s) => (
              <div key={s.label} className="text-center border border-[var(--border)]/60 rounded-xl py-3 px-2 bg-[var(--bg-elevated)]/50 backdrop-blur-sm">
                <p className="text-lg font-bold text-[var(--fg)] md:text-2xl gradient-text">{s.value}</p>
                <p className="text-xs text-[var(--fg-muted)] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="relative z-10 mt-auto border-t border-[var(--border)]/50 bg-[var(--bg)] py-5 md:py-10">
            <ScrollReveal>
              <p className="text-center text-xs font-medium text-[var(--fg-muted)] sm:text-sm">
                Helping businesses connect with leads through AI & CRM
              </p>
            </ScrollReveal>
            <div className="mt-4 overflow-hidden md:mt-6">
              <div className="flex w-max animate-marquee gap-8 px-2 md:gap-12 md:px-4">
                {[...LOGO_WORDS, ...LOGO_WORDS].map((word, i) => (
                  <span
                    key={i}
                    className="shrink-0 text-sm font-semibold text-[var(--fg-muted)]/60 md:text-lg"
                  >
                    {word}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features — 6 cards */}
        <section
          id="features"
          className="border-t border-[var(--border)]/50 px-4 pb-16 md:px-6 md:pb-32"
        >
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent" />
          <SectionReveal>
          <div className="mx-auto max-w-6xl px-2 pt-16 md:px-6 md:pt-32">
            <ScrollReveal>
              <p className="text-center text-xs font-medium uppercase tracking-wider text-[var(--accent)] md:text-sm">
                Features
              </p>
            </ScrollReveal>
            <ScrollReveal delay={30}>
              <h2 className="mt-2 text-center text-2xl font-bold sm:text-3xl md:text-4xl">
                Features That Power Lead-First Experiences
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={50}>
              <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-[var(--fg-muted)] md:mt-4 md:text-base">
                Transform your pipeline with one platform for leads, AI calling,
                and communication history.
              </p>
            </ScrollReveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <ScrollReveal key={i} delay={i * 80} direction="up">
                  <div className="group rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/60 p-4 transition hover:border-[var(--accent)]/40 hover:shadow-[0_0_40px_var(--glow)] md:rounded-2xl md:p-6">
                    <div className="mb-3 w-10 h-10 rounded-xl border border-[var(--border)] bg-[var(--bg)] flex items-center justify-center text-[var(--accent)] md:mb-4">
                      {f.icon}
                    </div>
                    <h3 className="text-base font-semibold text-[var(--fg)] md:text-lg">
                      {f.title}
                    </h3>
                    <p className="mt-2 text-xs text-[var(--fg-muted)] leading-relaxed md:mt-3 md:text-sm">
                      {f.desc}
                    </p>
                    <a
                      href={CRM_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-block text-sm font-medium text-[var(--accent)] transition hover:underline"
                    >
                      Open CRM →
                    </a>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
          </SectionReveal>
        </section>

        {/* What You Can Do */}
        <section className="border-t border-[var(--border)]/50 px-4 pb-16 md:px-6 md:pb-32">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent" />
          <SectionReveal>
          <div className="mx-auto max-w-4xl px-2 pt-16 md:px-6 md:pt-32">
            <ScrollReveal>
              <h2 className="text-center text-2xl font-bold sm:text-3xl md:text-4xl">
                What You Can Do with CortexFlow.
              </h2>
            </ScrollReveal>
            <div className="mt-10 space-y-4 md:mt-16 md:space-y-6">
              {USE_CASES.map((u, i) => (
                <ScrollReveal key={i} delay={i * 80}>
                  <div className="flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-4 transition hover:border-[var(--accent)]/30 md:gap-4 md:rounded-2xl md:p-6">
                    <span className="mt-0.5 shrink-0 text-[var(--accent)]">
                      <svg className="h-5 w-5 md:h-6 md:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--fg)] md:text-base">{u.title}</h3>
                      <p className="mt-0.5 text-xs text-[var(--fg-muted)] md:mt-1 md:text-sm">{u.desc}</p>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
            <ScrollReveal>
              <p className="mt-8 text-center text-sm text-[var(--fg-muted)] md:mt-10 md:text-base">
                Discover how CortexFlow can streamline your pipeline, automate
                calls, and keep every touchpoint in one place — with zero manual
                effort.
              </p>
              <div className="mt-6 flex justify-center md:mt-8">
                <a
                  href="#contact"
                  className="cta-gradient-border inline-block rounded-none px-6 py-3 text-sm font-medium text-[var(--fg)] transition md:px-8 md:py-4 md:text-base"
                >
                  Talk to Sales
                </a>
              </div>
            </ScrollReveal>
          </div>
          </SectionReveal>
        </section>

        {/* Pricing — mobile: carousel (center + peek); desktop: grid */}
        <section
          id="pricing"
          className="border-t border-[var(--border)]/50 px-0 pb-16 md:px-6 md:pb-32"
        >
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent" />
          <SectionReveal>
          <div className="mx-auto max-w-6xl px-4 pt-16 md:px-6 md:pt-32">
            <ScrollReveal>
              <p className="text-center text-xs font-medium uppercase tracking-wider text-[var(--accent)] md:text-sm">
                Pricing
              </p>
            </ScrollReveal>
            <ScrollReveal delay={30}>
              <h2 className="mt-2 text-center text-2xl font-bold sm:text-3xl md:text-4xl">
                Simple, transparent pricing.
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={50}>
              <p className="mx-auto mt-3 max-w-xl text-center text-sm text-[var(--fg-muted)] md:mt-4 md:text-base">
                Choose the plan that fits your team. Prices coming soon.
              </p>
            </ScrollReveal>
            <PricingCarousel />
          </div>
          </SectionReveal>
        </section>

        {/* FAQ */}
        <section
          id="faq"
          className="border-t border-[var(--border)]/50 px-4 pb-16 md:px-6 md:pb-32"
        >
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent" />
          <SectionReveal>
          <div className="mx-auto max-w-4xl px-2 pt-16 md:px-6 md:pt-32">
          <ScrollReveal>
            <h2 className="text-center text-2xl font-bold sm:text-3xl md:text-4xl">
              Frequently Asked Questions.
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={50}>
            <p className="mx-auto mt-3 max-w-xl text-center text-sm text-[var(--fg-muted)] md:mt-4 md:text-base">
              Quick answers to common questions about CortexFlow.
            </p>
          </ScrollReveal>
          <div className="mt-10 md:mt-16">
            <ScrollReveal delay={100}>
              <FaqAccordion />
            </ScrollReveal>
          </div>
          </div>
          </SectionReveal>
        </section>

        {/* Contact */}
        <section
          id="contact"
          className="border-t border-[var(--border)]/50 px-4 pb-16 md:px-6 md:pb-32"
        >
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent" />
          <SectionReveal>
            <div className="cta-gradient-border mx-auto max-w-3xl rounded-none p-6 text-center pt-12 md:p-14 md:pt-20">
              <h2 className="text-2xl font-bold sm:text-3xl md:text-4xl">
                Talk to Sales
              </h2>
              <p className="mt-3 text-sm text-[var(--fg-muted)] md:mt-4 md:text-base">
                Get in touch to see how CortexFlow can streamline your pipeline and automate your outreach.
              </p>
              <a
                href="mailto:hello@cortexflow.in"
                className="mt-6 inline-block rounded-none bg-[var(--accent)]/20 px-6 py-3 text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/30 md:mt-8 md:px-8 md:py-4 md:text-base"
              >
                hello@cortexflow.in
              </a>
            </div>
          </SectionReveal>
        </section>

        {/* CTA */}
        <section className="border-t border-[var(--border)]/50 px-4 py-16 md:px-6 md:py-32">
          <SectionReveal>
          <ScrollReveal>
            <div className="cta-gradient-border mx-auto max-w-3xl rounded-none p-8 text-center md:p-16">
              <h2 className="text-2xl font-bold sm:text-3xl md:text-4xl">
                Ready to streamline your pipeline?
              </h2>
              <p className="mt-3 text-sm text-[var(--fg-muted)] md:mt-4 md:text-base">
                Log in to the CRM and start managing leads with AI-powered
                workflows today.
              </p>
              <a
                href={CRM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-7 py-3.5 text-sm font-semibold text-[var(--bg)] transition hover:bg-[var(--accent-dim)] hover:shadow-[0_0_40px_var(--glow)] md:mt-8 md:px-8 md:py-4 md:text-base"
              >
                Open CRM Now
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </a>
            </div>
          </ScrollReveal>
          </SectionReveal>
        </section>

        {/* Footer — two columns: Brand | Office + Contact + Quick Links (adjacent) */}
        <footer className="border-t border-[var(--border)] px-4 py-12 md:px-6 md:py-20">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent" />
          <SectionReveal>
          <div className="mx-auto max-w-6xl px-2 pt-12 md:px-6 md:pt-20">
            <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:gap-16">
              <div>
                <span className="gradient-text text-lg font-semibold md:text-xl">CortexFlow</span>
                <p className="mt-2 max-w-sm text-xs text-[var(--fg-muted)] leading-relaxed md:mt-3 md:text-sm">
                  AI calling & lead management CRM. One dashboard for your entire pipeline. Automate outreach and track every touchpoint.
                </p>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-10">
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg)] md:text-sm">Our Office</h4>
                    <p className="mt-2 text-xs text-[var(--fg-muted)] md:mt-3 md:text-sm">
                      India
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--fg-muted)] md:mt-1 md:text-sm">
                      Get in touch for details.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg)] md:text-sm">Contact</h4>
                    <a
                      href="mailto:hello@cortexflow.in"
                      className="mt-2 block text-xs text-[var(--fg-muted)] hover:text-[var(--accent)] md:mt-3 md:text-sm"
                    >
                      hello@cortexflow.in
                    </a>
                    <a
                      href="#contact"
                      className="mt-1 block text-xs font-medium text-[var(--accent)] hover:underline md:mt-2 md:text-sm"
                    >
                      Talk to Sales →
                    </a>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg)] md:text-sm">Quick Links</h4>
                  <a
                    href={CRM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block text-xs text-[var(--fg-muted)] hover:text-[var(--accent)] md:mt-3 md:text-sm"
                  >
                    Open CRM
                  </a>
                  <a href="#features" className="mt-1 block text-xs text-[var(--fg-muted)] hover:text-[var(--accent)] md:mt-2 md:text-sm">
                    Features
                  </a>
                  <a href="#pricing" className="mt-1 block text-xs text-[var(--fg-muted)] hover:text-[var(--accent)] md:mt-2 md:text-sm">
                    Pricing
                  </a>
                  <a href="#faq" className="mt-1 block text-xs text-[var(--fg-muted)] hover:text-[var(--accent)] md:mt-2 md:text-sm">
                    FAQ
                  </a>
                  <a href="#contact" className="mt-1 block text-xs text-[var(--fg-muted)] hover:text-[var(--accent)] md:mt-2 md:text-sm">
                    Contact
                  </a>
                </div>
              </div>
            </div>
            <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-[var(--border)] pt-6 md:mt-12 md:flex-row md:pt-8">
              <span className="text-center text-xs text-[var(--fg-muted)] md:text-left md:text-sm">
                © {new Date().getFullYear()} CortexFlow. All rights reserved.
              </span>
              <span className="text-center text-xs text-[var(--fg-muted)]/80 md:text-right">
                Secure by design · Your data stays yours
              </span>
            </div>
          </div>
          </SectionReveal>
        </footer>
      </main>
    </div>
  );
}
