import { Link } from 'react-router-dom';

function Navbar() {
  return (
    <nav className="fixed top-0 z-50 w-full border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <span className="text-lg font-bold text-white">PostMail</span>
        <div className="flex items-center gap-6 text-sm">
          <a href="#features" className="text-gray-400 transition hover:text-white">Features</a>
          <a href="#pricing" className="text-gray-400 transition hover:text-white">Pricing</a>
          <Link to="/login" className="text-gray-400 transition hover:text-white">Login</Link>
          <Link
            to="/signup"
            className="rounded-lg bg-gradient-to-r from-[#0066FF] to-[#7C3AED] px-4 py-2 font-semibold text-white transition hover:opacity-90"
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-[#0a0a0a] to-[#1a1a2e]">
      {/* Glow orbs */}
      <div className="pointer-events-none absolute left-[10%] top-[20%] h-[400px] w-[400px] rounded-full bg-[#0066FF] opacity-[0.07] blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[10%] right-[5%] h-[300px] w-[300px] rounded-full bg-[#7C3AED] opacity-[0.07] blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
        {/* Pill badge */}
        <div className="mb-8 inline-block rounded-full border border-white/10 px-4 py-1.5 text-xs text-gray-400">
          Now with Gmail &amp; Outlook support
        </div>

        {/* Headline */}
        <h1 className="bg-gradient-to-b from-white to-white/70 bg-clip-text text-5xl font-extrabold leading-tight text-transparent md:text-7xl">
          Never send blind
          <br />
          emails again
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mt-6 max-w-lg text-lg text-gray-400">
          Track opens in real-time. Get notified instantly. Close deals faster.
        </p>

        {/* CTA */}
        <div className="mt-10">
          <Link
            to="/signup"
            className="inline-block rounded-xl bg-gradient-to-r from-[#0066FF] to-[#7C3AED] px-8 py-4 text-lg font-bold text-white transition hover:opacity-90"
          >
            Get Started Free
          </Link>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    title: 'Real-time open tracking',
    description: 'Know the moment a recipient opens your email with pixel-precise tracking.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
  {
    title: 'Instant notifications',
    description: 'Get notified via Discord webhook the second an email is read.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
      </svg>
    ),
  },
  {
    title: 'Gmail Chrome extension',
    description: 'One-click install. Works seamlessly inside your Gmail compose window.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.491 48.491 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .657-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z" />
      </svg>
    ),
  },
  {
    title: 'Team dashboard',
    description: "Track all your team's email engagement from a single dashboard.",
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
      </svg>
    ),
  },
];

function Features() {
  return (
    <section id="features" className="bg-[#0a0a0a] py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-3xl font-bold text-white md:text-4xl">
          Everything you need to track engagement
        </h2>
        <div className="mt-16 grid gap-6 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-white/5 bg-white/[0.03] p-8 transition hover:-translate-y-1 hover:border-white/10"
            >
              <div className="text-[#0066FF]">{f.icon}</div>
              <h3 className="mt-4 text-lg font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { number: '1', title: 'Install the extension', description: 'Add PostMail to Chrome in one click. No config needed.' },
  { number: '2', title: 'Compose your email', description: 'Write emails in Gmail as usual. PostMail works invisibly in the background.' },
  { number: '3', title: 'Track opens live', description: 'See who opened what, when — in real-time on your dashboard.' },
];

function HowItWorks() {
  return (
    <section className="bg-[#0a0a0a] py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-3xl font-bold text-white md:text-4xl">
          Up and running in 3 steps
        </h2>
        <div className="mt-16 grid gap-12 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, i) => (
            <div key={step.number} className="relative text-center">
              {/* Connecting line (hidden on mobile, shown between items on desktop) */}
              {i < STEPS.length - 1 && (
                <div className="pointer-events-none absolute left-[60%] top-8 hidden h-px w-[80%] bg-gradient-to-r from-white/10 to-transparent md:block" />
              )}
              {/* Number circle */}
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#0066FF]/20 to-[#7C3AED]/20 ring-1 ring-white/10">
                <span className="bg-gradient-to-r from-[#0066FF] to-[#7C3AED] bg-clip-text text-2xl font-bold text-transparent">
                  {step.number}
                </span>
              </div>
              <h3 className="mt-6 text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm text-gray-400">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const TIERS = [
  {
    name: 'Free',
    price: '$0',
    period: '/mo',
    features: ['50 tracked emails/mo', '1 user', 'Basic dashboard', 'Chrome extension'],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$12',
    period: '/mo',
    features: ['Unlimited tracking', '5 users', 'Discord notifications', 'Priority support'],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    features: ['Unlimited everything', 'SSO', 'Dedicated support', 'Custom integrations'],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

function Pricing() {
  return (
    <section id="pricing" className="bg-[#0a0a0a] py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-3xl font-bold text-white md:text-4xl">
          Simple, transparent pricing
        </h2>
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-xl border p-8 ${
                tier.highlighted
                  ? 'border-[#0066FF]/50 bg-white/[0.05]'
                  : 'border-white/5 bg-white/[0.02]'
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#0066FF] to-[#7C3AED] px-3 py-0.5 text-xs font-semibold text-white">
                  Most Popular
                </div>
              )}
              <h3 className="text-lg font-semibold text-white">{tier.name}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-white">{tier.price}</span>
                {tier.period && <span className="text-gray-400">{tier.period}</span>}
              </div>
              <ul className="mt-8 space-y-3">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                    <svg className="h-4 w-4 shrink-0 text-[#0066FF]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/signup"
                className={`mt-8 block w-full rounded-lg py-3 text-center text-sm font-semibold transition ${
                  tier.highlighted
                    ? 'bg-gradient-to-r from-[#0066FF] to-[#7C3AED] text-white hover:opacity-90'
                    : 'border border-white/10 text-white hover:bg-white/5'
                }`}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaBanner() {
  return (
    <section className="bg-gradient-to-r from-[#0066FF]/10 to-[#7C3AED]/10 py-24">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl font-bold text-white md:text-4xl">
          Ready to know when your emails get opened?
        </h2>
        <p className="mt-4 text-gray-400">
          Join hundreds of teams already tracking with PostMail
        </p>
        <div className="mt-8">
          <Link
            to="/signup"
            className="inline-block rounded-xl bg-white px-8 py-4 text-lg font-bold text-[#0a0a0a] transition hover:bg-gray-200"
          >
            Get Started Free
          </Link>
        </div>
      </div>
    </section>
  );
}

const FOOTER_LINKS = {
  Product: [
    { label: 'Features', href: '#features' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Chrome Extension', href: '#' },
    { label: 'Dashboard', href: '/dashboard' },
  ],
  Company: [
    { label: 'About', href: '#' },
    { label: 'Blog', href: '#' },
    { label: 'Careers', href: '#' },
    { label: 'Contact', href: '#' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '#' },
    { label: 'Terms of Service', href: '#' },
  ],
};

function Footer() {
  return (
    <footer className="border-t border-white/5 bg-[#111] py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          {/* Brand */}
          <div>
            <span className="text-lg font-bold text-white">PostMail</span>
            <p className="mt-2 text-sm text-gray-500">Email open tracking for modern teams.</p>
          </div>
          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
            <div key={heading}>
              <h4 className="text-sm font-semibold text-white">{heading}</h4>
              <ul className="mt-3 space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm text-gray-400 transition hover:text-white">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-white/5 pt-8 text-center text-sm text-gray-500">
          &copy; 2026 PostMail. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
      <CtaBanner />
      <Footer />
    </div>
  );
}
