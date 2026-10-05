import { useEffect, useId, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import {
  ArrowRight,
  ClipboardCheck,
  Crosshair,
  FileSpreadsheet,
  FileText,
  GitCompare,
  Layers3,
  Menu,
  Radar,
  ScanLine,
  ScrollText,
  ShieldCheck,
  X,
} from 'lucide-react'

import { ButtonAnchor, ButtonLink } from '@/components/common/Button'
import { Logo } from '@/components/common/Logo'
import { Tabs, useTabs } from '@/components/common/Tabs'
import { HeroMockup } from '@/components/landing/HeroMockup'
import { OWASP_2025_ORDER, OWASP_CATEGORIES } from '@/data/owasp'
import { useIsAuthenticated } from '@/hooks/useAuth'
import { cn } from '@/utils/cn'

/**
 * Public landing page.
 *
 * This is the only page outside the authenticated shell, so it deliberately owns
 * none of `AppLayout`'s furniture: its own header, its own footer, and a single
 * scrolling column. Section navigation is native fragment links (`#about`), which
 * means it works with the keyboard, is announced correctly, and deep-links — no
 * scroll library and no router involvement.
 *
 * A visitor who already has a session is sent straight to the dashboard rather
 * than through the marketing page.
 */

const NAV_LINKS = [
  { href: '#about', label: 'About' },
  { href: '#workflow', label: 'How it works' },
  { href: '#capabilities', label: 'Capabilities' },
  { href: '#standards', label: 'Standards' },
] as const

const ABOUT_TABS = [
  {
    id: 'discovery',
    label: 'Discovery',
    icon: <Radar className="size-4" aria-hidden="true" />,
    headline: 'Nothing stays hidden',
    body: 'Crawls the agreed scope, fingerprints the stack and catalogues every endpoint worth testing.',
  },
  {
    id: 'evidence',
    label: 'Evidence',
    icon: <ScrollText className="size-4" aria-hidden="true" />,
    headline: 'Findings, not noise',
    body: 'Each issue keeps its raw request and response, so a result can be defended rather than believed.',
  },
  {
    id: 'verification',
    label: 'Verification',
    icon: <ShieldCheck className="size-4" aria-hidden="true" />,
    headline: 'A human signs it off',
    body: 'Potential signals stay separate from confirmed vulnerabilities until an analyst accepts them.',
  },
  {
    id: 'reporting',
    label: 'Reporting',
    icon: <GitCompare className="size-4" aria-hidden="true" />,
    headline: 'Repeatable, not retyped',
    body: 'Scan-to-scan comparison and OWASP-aligned deliverables, regenerated from live data on demand.',
  },
] as const

const WORKFLOW_STEPS = [
  {
    icon: Crosshair,
    title: 'Scope',
    body: 'Define targets, intensity and the modules to exercise.',
  },
  {
    icon: ScanLine,
    title: 'Scan',
    body: 'Queued jobs run the test catalogue against the target.',
  },
  {
    icon: ClipboardCheck,
    title: 'Verify',
    body: 'Analysts confirm, retest or dismiss every signal.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Report',
    body: 'Publish a deliverable mapped to OWASP, exportable as PDF or CSV.',
  },
] as const

const CAPABILITIES = [
  {
    icon: Radar,
    title: 'Automated discovery',
    body: 'Endpoints, parameters and technology fingerprinting across the agreed scope.',
  },
  {
    icon: ScrollText,
    title: 'Evidence capture',
    body: 'Raw HTTP request and response retained for every flagged issue.',
  },
  {
    icon: ShieldCheck,
    title: 'Analyst verification',
    body: 'Potential and confirmed findings are kept visibly distinct.',
  },
  {
    icon: GitCompare,
    title: 'Scan comparison',
    body: 'Resolved, introduced, reopened and persisting issues between two runs.',
  },
  {
    icon: Layers3,
    title: 'Module catalogue',
    body: 'Tests grouped by OWASP category, with per-module enable and intensity.',
  },
  {
    icon: FileText,
    title: 'Client reporting',
    body: 'Cover, summary, methodology and activity composed into one document.',
  },
] as const

export function LandingPage() {
  const isAuthenticated = useIsAuthenticated()

  useEffect(() => {
    document.title = 'VAPTFlow — Vulnerability Assessment & Penetration Testing'
  }, [])

  // Smooth in-page navigation, applied to the document element only while this
  // page is mounted. Scoping it here rather than in the stylesheet means client
  // side route changes elsewhere in the app are never animated, and the visitor's
  // reduced-motion preference is honoured instead of overridden.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const root = document.documentElement
    const previous = root.style.scrollBehavior
    root.style.scrollBehavior = 'smooth'
    return () => {
      root.style.scrollBehavior = previous
    }
  }, [])

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-accent-fg"
      >
        Skip to content
      </a>

      <LandingNav />

      <main id="main-content">
        <Hero />
        <About />
        <Workflow />
        <Capabilities />
        <Standards />
        <ClosingCta />
      </main>

      <LandingFooter />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Navigation                                                                  */
/* -------------------------------------------------------------------------- */

function LandingNav() {
  const [open, setOpen] = useState(false)

  // Escape closes the mobile panel. A disclosure that traps the page behind an
  // overlay it cannot be dismissed from is a keyboard trap.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <header className="sticky top-0 z-40 border-b border-border-base bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-6">
        <Logo />

        <nav aria-label="Sections" className="ml-auto hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <ButtonLink to="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
            Sign in
          </ButtonLink>
          <ButtonLink
            to="/login"
            size="sm"
            className="hidden sm:inline-flex"
            trailingIcon={<ArrowRight className="size-3.5" aria-hidden="true" />}
          >
            Getting started
          </ButtonLink>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="landing-mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="inline-flex size-8 items-center justify-center rounded-md border border-border-base text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg md:hidden"
          >
            {open ? (
              <X className="size-4" aria-hidden="true" />
            ) : (
              <Menu className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="landing-mobile-nav"
          aria-label="Sections"
          className="border-t border-border-base bg-bg px-6 py-3 md:hidden"
        >
          <ul className="space-y-0.5">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-2 border-t border-border-base pt-3">
            <ButtonLink to="/login" variant="secondary" size="sm">
              Sign in
            </ButtonLink>
            <ButtonLink
              to="/login"
              size="sm"
              trailingIcon={<ArrowRight className="size-3.5" aria-hidden="true" />}
            >
              Getting started
            </ButtonLink>
          </div>
        </nav>
      ) : null}
    </header>
  )
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-16 sm:py-20 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:py-24">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-text">
            Vulnerability assessment &amp; penetration testing
          </p>
          <h1 className="mt-4 max-w-xl text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-4xl">
            Ship security assessments you can defend.
          </h1>
          <p className="mt-4 max-w-lg text-[13px] leading-relaxed text-fg-muted">
            VAPTFlow turns automated discovery into verified, OWASP-mapped findings and a
            client-ready report — with every step in between traceable.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <ButtonLink
              to="/login"
              size="lg"
              trailingIcon={<ArrowRight className="size-4" aria-hidden="true" />}
            >
              Getting started
            </ButtonLink>
            <ButtonAnchor href="#about" variant="outline" size="lg">
              Read more
            </ButtonAnchor>
          </div>

          <dl className="mt-9 grid max-w-md grid-cols-3 gap-6">
            {[
              { value: '412', label: 'Endpoints per scan' },
              { value: 'OWASP', label: 'Mapped to Top 10' },
              { value: '100%', label: 'Evidence retained' },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="sr-only">{stat.label}</dt>
                <dd className="text-[22px] font-semibold leading-none tracking-tight tabular-nums text-fg">
                  {stat.value}
                </dd>
                <p aria-hidden="true" className="mt-1.5 text-[11px] leading-relaxed text-fg-subtle">
                  {stat.label}
                </p>
              </div>
            ))}
          </dl>
        </div>

        <HeroMockup />
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Shared section furniture                                                    */
/* -------------------------------------------------------------------------- */

function Section({
  id,
  eyebrow,
  title,
  lede,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  lede: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border-base py-16 sm:py-20">
      <div className="mx-auto w-full max-w-6xl px-6">
        <SectionIntro eyebrow={eyebrow} title={title} lede={lede} />
        <div className="mt-10">{children}</div>
      </div>
    </section>
  )
}

function SectionIntro({ eyebrow, title, lede }: { eyebrow: string; title: string; lede: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-text">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-fg">{title}</h2>
      <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">{lede}</p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* About                                                                       */
/* -------------------------------------------------------------------------- */

function About() {
  const { value, setValue } = useTabs(ABOUT_TABS[0].id)
  const tabPrefix = useId()
  const active = ABOUT_TABS.find((tab) => tab.id === value) ?? ABOUT_TABS[0]

  return (
    <Section
      id="about"
      eyebrow="What it is"
      title="One workflow, from discovery to sign-off"
      lede="Four things VAPTFlow does that a scanner and a spreadsheet do not do together."
    >
      <Tabs
        items={ABOUT_TABS.map(({ id, label, icon }) => ({ id, label, icon }))}
        value={value}
        onChange={setValue}
        idPrefix={tabPrefix}
        showCounts={false}
        className="max-w-2xl"
      />

      <div
        role="tabpanel"
        id={`${tabPrefix}-panel-${active.id}`}
        aria-labelledby={`${tabPrefix}-tab-${active.id}`}
        tabIndex={0}
        className="mt-6 max-w-2xl rounded-card border border-border-base bg-surface p-5"
      >
        <p className="text-[15px] font-semibold tracking-tight text-fg">{active.headline}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{active.body}</p>
      </div>
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/* Workflow                                                                    */
/* -------------------------------------------------------------------------- */

function Workflow() {
  return (
    <Section
      id="workflow"
      eyebrow="How it works"
      title="Four steps, no black box"
      lede="Every result can be traced back to the test that produced it."
    >
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {WORKFLOW_STEPS.map((step, index) => (
          <li key={step.title} className="rounded-card border border-border-base bg-surface p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-base bg-surface-2 text-accent-text">
                <step.icon className="size-4" aria-hidden="true" />
              </span>
              <span className="text-[11px] font-semibold tabular-nums text-fg-subtle">
                0{index + 1}
              </span>
            </div>
            <p className="mt-3.5 text-[15px] font-semibold tracking-tight text-fg">
              {step.title}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/* Capabilities                                                                */
/* -------------------------------------------------------------------------- */

function Capabilities() {
  return (
    <Section
      id="capabilities"
      eyebrow="Capabilities"
      title="What you get"
      lede="The parts of an assessment that usually live in separate tools."
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map((item) => (
          <li key={item.title} className="rounded-card border border-border-base bg-surface p-5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-base bg-surface-2 text-accent-text">
              <item.icon className="size-4" aria-hidden="true" />
            </span>
            <p className="mt-3.5 text-[15px] font-semibold tracking-tight text-fg">{item.title}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{item.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/* Standards                                                                   */
/* -------------------------------------------------------------------------- */

function Standards() {
  return (
    <Section
      id="standards"
      eyebrow="Standards"
      title="Mapped to OWASP as you go"
      lede="Findings carry their category, the CWE behind it and the test that raised it."
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {OWASP_2025_ORDER.map((id) => {
          const category = OWASP_CATEGORIES[id]
          if (!category) return null
          return (
            <li
              key={id}
              className="flex items-center gap-3 rounded-card border border-border-base bg-surface px-4 py-2.5"
            >
              <span className="shrink-0 font-mono text-[11px] font-semibold text-accent-text">
                {category.id.split(':')[0]}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-fg">
                {category.title}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 text-xs text-fg-subtle">
        Coverage per category is reported separately, so a category that was never tested is
        never mistaken for a category that found nothing.
      </p>
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/* Closing call to action                                                      */
/* -------------------------------------------------------------------------- */

function ClosingCta() {
  return (
    <section className="border-t border-border-base py-16 sm:py-20">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="flex flex-col items-start gap-6 rounded-card border border-border-base bg-surface-2 p-8 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold leading-tight tracking-tight text-fg">
              Start your first assessment
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">
              Sign in to open a workspace, define a target and produce a verified report.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink
              to="/login"
              size="lg"
              trailingIcon={<ArrowRight className="size-4" aria-hidden="true" />}
            >
              Getting started
            </ButtonLink>
            <ButtonAnchor href="#about" variant="ghost" size="lg">
              Read more
            </ButtonAnchor>
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Footer                                                                      */
/* -------------------------------------------------------------------------- */

function LandingFooter() {
  return (
    <footer className="border-t border-border-base py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Logo showTagline />
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className={cn(
                    'rounded-md text-[13px] text-fg-muted transition-colors hover:text-fg',
                  )}
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href="/login"
                className="rounded-md text-[13px] text-fg-muted transition-colors hover:text-fg"
              >
                Sign in
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}