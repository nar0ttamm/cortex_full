import Link from "next/link";
import { BookDemoButton } from "./components/BookDemoButton";
import { ChannelStrip } from "./components/ChannelStrip";
import { FaqAccordion } from "./components/FaqAccordion";
import { FeatureBento } from "./components/FeatureBento";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { HeroBackground } from "./components/HeroBackground";
import { HeroVisual } from "./components/HeroVisual";
import { HowItWorks } from "./components/HowItWorks";
import { IndustryGallery } from "./components/IndustryGallery";
import { IntegrationsGrid, LogoMarquee } from "./components/LogoMarquee";
import { PipelineInfographic } from "./components/PipelineInfographic";
import { PricingCarousel } from "./components/PricingCarousel";
import { ScrollReveal } from "./components/ScrollReveal";
import { SectionReveal } from "./components/SectionReveal";
import { UseCases } from "./components/UseCases";
import { CalendarMark, GmailMark, SheetsMark, WhatsAppMark } from "./components/BrandMarks";
import { IconArrow } from "./components/icons";
import { CONTACT_EMAIL } from "./lib/site";

export default function Home() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <section className="relative overflow-hidden px-4 pb-16 pt-28 md:px-6 md:pb-24 md:pt-36">
          <HeroBackground />
          <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <ScrollReveal>
                <p className="eyebrow">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  Built for sales floors, not slide decks
                </p>
              </ScrollReveal>
              <ScrollReveal delay={60}>
                <h1 className="mt-5 font-serif text-[2.6rem] leading-[1.05] tracking-tight sm:text-5xl md:text-6xl lg:text-[4.2rem]">
                  The sales floor that
                  <span className="italic text-[var(--accent)]"> never clocks out.</span>
                </h1>
              </ScrollReveal>
              <ScrollReveal delay={120}>
                <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--fg-muted)] md:text-lg">
                  CortexFlow AI calls every lead in under two minutes, qualifies the conversation,
                  and books the meeting — then keeps WhatsApp, email, and voice on one desk.
                </p>
              </ScrollReveal>
              <ScrollReveal delay={180}>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link href="/get-started" className="btn-primary">
                    Get started
                    <IconArrow className="h-4 w-4" />
                  </Link>
                  <BookDemoButton />
                </div>
              </ScrollReveal>
              <ScrollReveal delay={240}>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Works with</span>
                  {[WhatsAppMark, GmailMark, CalendarMark, SheetsMark].map((Mark, i) => (
                    <span key={i} className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white">
                      <Mark className="h-5 w-5" />
                    </span>
                  ))}
                </div>
              </ScrollReveal>
              <ScrollReveal delay={280}>
                <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    ["<2 min", "Lead response"],
                    ["24/7", "AI coverage"],
                    ["4", "Channels"],
                    ["1 desk", "Full context"],
                  ].map(([value, label]) => (
                    <div key={label}>
                      <p className="font-serif text-2xl md:text-3xl">{value}</p>
                      <p className="mt-1 text-xs font-semibold text-[var(--fg-muted)]">{label}</p>
                    </div>
                  ))}
                </div>
              </ScrollReveal>
            </div>
            <ScrollReveal delay={80}>
              <HeroVisual />
            </ScrollReveal>
          </div>
        </section>

        <LogoMarquee />

        <section id="product" className="px-4 py-16 md:px-6 md:py-24">
          <SectionReveal>
            <div className="container-page">
              <p className="eyebrow">Product</p>
              <h2 className="mt-3 max-w-3xl font-serif text-4xl leading-tight md:text-5xl">
                Everything a closer needs, <span className="italic text-[var(--accent)]">before they pick up.</span>
              </h2>
              <p className="mt-4 max-w-2xl text-[var(--fg-muted)]">
                Not six identical feature cards. A working floor: calling, context, and conversion in one place.
              </p>
              <div className="mt-10">
                <FeatureBento />
              </div>
            </div>
          </SectionReveal>
        </section>

        <section className="px-4 pb-8 md:px-6">
          <div className="container-page">
            <ChannelStrip />
          </div>
        </section>

        <section id="how-it-works" className="px-4 py-16 md:px-6 md:py-24">
          <SectionReveal>
            <div className="container-page">
              <p className="eyebrow">How it works</p>
              <h2 className="mt-3 max-w-2xl font-serif text-4xl leading-tight md:text-5xl">
                Three moves. <span className="italic text-[var(--accent)]">No extra tools.</span>
              </h2>
              <div className="mt-10">
                <HowItWorks />
              </div>
            </div>
          </SectionReveal>
        </section>

        <section className="bg-[var(--bg-warm)] px-4 py-16 md:px-6 md:py-24">
          <SectionReveal>
            <div className="container-page">
              <PipelineInfographic />
            </div>
          </SectionReveal>
        </section>

        <section className="px-4 py-16 md:px-6 md:py-24">
          <SectionReveal>
            <div className="container-page">
              <p className="eyebrow">On the floor</p>
              <h2 className="mt-3 max-w-2xl font-serif text-4xl leading-tight md:text-5xl">
                What teams actually <span className="italic text-[var(--accent)]">run on CortexFlow AI.</span>
              </h2>
              <div className="mt-10">
                <UseCases />
              </div>
              <div className="mt-10">
                <IndustryGallery />
              </div>
            </div>
          </SectionReveal>
        </section>

        <section className="px-4 pb-8 md:px-6">
          <SectionReveal>
            <div className="container-page">
              <IntegrationsGrid />
            </div>
          </SectionReveal>
        </section>

        <section id="pricing" className="px-4 py-16 md:px-6 md:py-24">
          <SectionReveal>
            <div className="container-page">
              <p className="eyebrow">Pricing</p>
              <h2 className="mt-3 font-serif text-4xl md:text-5xl">
                Simple on purpose. <span className="italic text-[var(--accent)]">Start on a trial.</span>
              </h2>
              <p className="mt-4 max-w-xl text-[var(--fg-muted)]">
                Choose a workspace size. Numbers are confirmed during onboarding — no surprise SKUs.
              </p>
              <PricingCarousel />
            </div>
          </SectionReveal>
        </section>

        <section id="faq" className="px-4 py-16 md:px-6 md:py-24">
          <SectionReveal>
            <div className="container-page grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="eyebrow">FAQ</p>
                <h2 className="mt-3 font-serif text-4xl leading-tight md:text-5xl">
                  Straight answers, <span className="italic text-[var(--accent)]">no theatre.</span>
                </h2>
                <p className="mt-4 text-[var(--fg-muted)]">
                  Still deciding? Book a two-minute demo call or write to the team.
                </p>
                <div className="mt-6">
                  <BookDemoButton className="btn-primary" label="Talk to the product" />
                </div>
              </div>
              <FaqAccordion />
            </div>
          </SectionReveal>
        </section>

        <section id="contact" className="px-4 pb-20 md:px-6">
          <SectionReveal>
            <div className="container-page overflow-hidden rounded-[2rem] bg-[var(--accent)] px-6 py-12 text-white md:px-14 md:py-16">
              <div className="grid items-center gap-8 md:grid-cols-[1.3fr_0.7fr]">
                <div>
                  <h2 className="font-serif text-4xl leading-tight md:text-5xl">
                    Ready when the next lead lands.
                  </h2>
                  <p className="mt-4 max-w-xl text-white/85">
                    Stand up a workspace, import a list, and let the floor start calling. Or write to sales if you need a custom rollout.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <Link href="/get-started" className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3.5 text-sm font-bold text-[var(--accent)]">
                    Get started
                  </Link>
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="inline-flex items-center justify-center rounded-full border border-white/30 px-6 py-3.5 text-sm font-bold text-white"
                  >
                    {CONTACT_EMAIL}
                  </a>
                </div>
              </div>
            </div>
          </SectionReveal>
        </section>
      </main>
      <Footer />
    </div>
  );
}
