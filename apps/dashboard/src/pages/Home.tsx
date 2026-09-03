import { Link } from 'react-router-dom';
import { Suspense, lazy, useState, useEffect, useRef } from 'react';
import '@designcodeio/threeui/style.css';

// Lazy-load ThreeUI components for code splitting
const FlowField = lazy(() => import('@designcodeio/threeui/components/FlowField').then(m => ({ default: m.FlowField })));



/* ─── Utility: animate elements on scroll ─── */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/* ─── Color Tokens ─── */
const C = {
  orange: '#F97316',
  orangeLight: '#FDBA74',
  orangePastel: '#FFF7ED',
  orangeNeon: '#FF6B00',
  white: '#FFFFFF',
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
};

/* ─── Bubble overlay for CTA buttons ─── */
function BubbleOverlay() {
  const bubbles = useRef(
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: 3 + Math.random() * 5,
      duration: 1.5 + Math.random() * 2,
      delay: Math.random() * 3,
      opacity: 0.25 + Math.random() * 0.35,
    }))
  ).current;

  return (
    <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
      {bubbles.map(b => (
        <span
          key={b.id}
          className="absolute rounded-full bg-white"
          style={{
            width: b.size,
            height: b.size,
            left: `${b.left}%`,
            bottom: -b.size,
            opacity: b.opacity,
            animation: `bubbleRise ${b.duration}s ${b.delay}s ease-in infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes bubbleRise {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: var(--bubble-opacity, 0.3); }
          100% { transform: translateY(-50px); opacity: 0; }
        }
      `}</style>
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   NAVBAR
   ════════════════════════════════════════════════════════════════════════════ */
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav className={`fixed top-0 z-50 w-full transition-all duration-300 ${scrolled ? 'bg-white/90 shadow-sm backdrop-blur-lg' : 'bg-transparent'}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <span className="text-xl font-extrabold tracking-tight" style={{ color: C.gray900 }}>
          Post<span style={{ color: C.orange }}>Mail</span>
        </span>

        {/* Desktop nav */}
        <div className="hidden items-center gap-8 text-sm font-medium md:flex">
          <button onClick={() => scrollTo('#features')} className="transition hover:text-orange-500" style={{ color: C.gray500 }}>Features</button>
          <button onClick={() => scrollTo('#how-it-works')} className="transition hover:text-orange-500" style={{ color: C.gray500 }}>How It Works</button>
          <button onClick={() => scrollTo('#integrations')} className="transition hover:text-orange-500" style={{ color: C.gray500 }}>Integrations</button>
          <button onClick={() => scrollTo('#pricing')} className="transition hover:text-orange-500" style={{ color: C.gray500 }}>Pricing</button>
          <Link to="/login" className="transition hover:text-orange-500" style={{ color: C.gray500 }}>Login</Link>
          <Link to="/signup" className="group relative overflow-hidden rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-200 transition hover:shadow-orange-300" style={{ background: `linear-gradient(135deg, ${C.orange}, ${C.orangeNeon})` }}>
            <BubbleOverlay />
            <span className="relative z-10">Get Started Now</span>
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden rounded-lg p-2 hover:bg-gray-100">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke={C.gray700}>
            {menuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-gray-100 bg-white px-6 pb-6 pt-2 md:hidden">
          <div className="flex flex-col gap-4 text-base font-medium" style={{ color: C.gray700 }}>
            <button onClick={() => scrollTo('#features')} className="text-left">Features</button>
            <button onClick={() => scrollTo('#how-it-works')} className="text-left">How It Works</button>
            <button onClick={() => scrollTo('#integrations')} className="text-left">Integrations</button>
            <button onClick={() => scrollTo('#pricing')} className="text-left">Pricing</button>
            <Link to="/login" onClick={() => setMenuOpen(false)}>Login</Link>
            <Link to="/signup" onClick={() => setMenuOpen(false)} className="mt-2 rounded-full py-3 text-center text-white font-semibold" style={{ background: `linear-gradient(135deg, ${C.orange}, ${C.orangeNeon})` }}>
              Get Started Free
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   HERO
   ════════════════════════════════════════════════════════════════════════════ */
function Hero() {
  const anim = useInView(0.1);
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden" style={{ background: `linear-gradient(170deg, ${C.white} 0%, ${C.orangePastel} 50%, ${C.white} 100%)` }}>
      {/* Background */}
      <div className="shader-frame absolute inset-0 " style={{ background: 'linear-gradient(170deg, #FFFFFF 10%,rgb(242, 192, 155) 50%, #FFFFFF 100%)' }}>
        
      </div>

      {/* Soft gradient orbs */}
      <div className="pointer-events-none absolute left-[5%] top-[15%] h-[500px] w-[500px] rounded-full opacity-20 blur-[100px]" style={{ background: C.orange }} />
      <div className="pointer-events-none absolute bottom-[10%] right-[10%] h-[400px] w-[400px] rounded-full opacity-15 blur-[120px]" style={{ background: C.orangeLight }} />

      <div ref={anim.ref} className={`relative z-10 mx-auto max-w-4xl px-6 text-center transition-all duration-1000 ${anim.visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium" style={{ borderColor: C.orangeLight, color: C.orange, background: 'rgba(255,247,237,0.8)' }}>
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: C.orange }} />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: C.orange }} />
          </span>
          Now with Gmail &amp; Outlook support
        </div>

        {/* Headline */}
        <h1 className="text-5xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl md:text-7xl lg:text-8xl" style={{ color: C.gray900 }}>
          Never send
          <br />
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(135deg, ${C.orange}, ${C.orangeNeon})` }}>
            blind emails
          </span>
          <br />
          again
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mt-8 max-w-xl text-lg leading-relaxed sm:text-xl" style={{ color: C.gray500 }}>
          Know the exact moment your email is opened. Get instant notifications. Make every follow-up count.
        </p>

        {/* CTA row */}
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link to="/signup" className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full px-8 py-4 text-lg font-bold text-white shadow-xl shadow-orange-200 transition-all hover:shadow-2xl hover:shadow-orange-300" style={{ background: `linear-gradient(135deg, ${C.orange}, ${C.orangeNeon})` }}>
            <BubbleOverlay />
            <span className="relative z-10 flex items-center gap-2">
              Start Tracking Free
              <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </span>
          </Link>
          <button onClick={() => document.querySelector('#how-it-works')?.scrollIntoView({ behavior: 'smooth' })} className="inline-flex items-center gap-2 rounded-full border px-6 py-4 text-base font-medium transition hover:bg-gray-50" style={{ borderColor: C.gray700, color: C.gray700 }}>
            See How It Works
          </button>
        </div>

        {/* Social proof */}
        <p className="mt-12 text-sm" style={{ color: C.gray400 }}>
          Trusted by 2,000+ sales teams, recruiters, and freelancers
        </p>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   LIVE DEMO BANNER — animated email open simulation
   ════════════════════════════════════════════════════════════════════════════ */
function LiveDemoBanner() {
  const [opens, setOpens] = useState(0);
  const [pulse, setPulse] = useState(false);
  const anim = useInView();

  useEffect(() => {
    if (!anim.visible) return;
    let timer: ReturnType<typeof setTimeout>;
    function tick() {
      const increment = Math.random() < 0.3 ? Math.floor(Math.random() * 3) + 2 : 1;
      setOpens(prev => prev + increment);
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
      timer = setTimeout(tick, 1500 + Math.random() * 4000);
    }
    timer = setTimeout(tick, 1000 + Math.random() * 2000);
    return () => clearTimeout(timer);
  }, [anim.visible]);

  return (
    <section ref={anim.ref} className="relative overflow-hidden py-3" style={{ background: `linear-gradient(90deg, ${C.orange}, ${C.orangeNeon})` }}>
      <div className="pointer-events-none absolute inset-0 opacity-20">
        <Suspense fallback={null}>
          <FlowField mode="light" hue={25} speed={0.3} className="h-full w-full" />
        </Suspense>
      </div>
      <div className="relative z-10 mx-auto flex max-w-6xl items-center justify-center gap-4 px-6 text-white">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-white/20 transition-transform ${pulse ? 'scale-125' : 'scale-100'}`}>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </div>
        <span className="text-sm font-semibold sm:text-base">
          <span className="text-lg font-bold">{opens.toLocaleString()}</span> emails tracked live right now
        </span>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   FEATURES
   ════════════════════════════════════════════════════════════════════════════ */
const FEATURE_SECTIONS = [
  {
    tag: 'Real-Time Tracking',
    title: 'Know the second your email is opened',
    description: 'PostMail injects an invisible tracking pixel into every email you send. The moment a recipient opens your email, we capture the open event with sub-second precision and surface it on your dashboard instantly.',
    bullets: ['Sub-second open detection', 'Device & location fingerprinting', 'Duplicate-filtered accuracy'],
    visual: 'flow',
    reverse: false,
  },
  {
    tag: 'Smart Notifications',
    title: 'Never miss a critical open',
    description: 'Configure Discord webhooks, browser push notifications, or email digests. Get alerted the instant a high-priority prospect opens your proposal — so you can follow up while you\'re top of mind.',
    bullets: ['Discord & Slack webhooks', 'Priority-based alert routing', 'Quiet hours & batching'],
    visual: 'connectivity',
    reverse: true,
  },
  {
    tag: 'Link Intelligence',
    title: 'Track every click, not just opens',
    description: 'Wrap any link in your email with PostMail\'s click tracker. See which links get clicked, when, and from what device — giving you a full picture of recipient engagement beyond simple opens.',
    bullets: ['Per-link click analytics', 'Real IP & device capture', 'Heatmap-style engagement scoring'],
    visual: 'interface',
    reverse: false,
  },
  {
    tag: 'Predictive Analytics',
    title: 'AI-powered follow-up timing',
    description: 'PostMail analyses open patterns across thousands of emails to predict the optimal time to follow up. Our AI engine learns each recipient\'s reading habits and recommends the perfect send window.',
    bullets: ['Recipient behaviour modelling', 'Optimal send-time predictions', 'Engagement scoring & ranking'],
    visual: 'predictive',
    reverse: true,
  },
];

function FeatureVisual({ type }: { type: string }) {
  return (
    <div className="relative h-[300px] w-full overflow-hidden rounded-2xl shadow-2xl shadow-orange-100 ring-1 ring-gray-100 sm:h-[350px] md:h-[400px]">
      {type === 'flow' ? (
        <Suspense fallback={<div className="flex h-full items-center justify-center bg-gray-50"><div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-orange-500" /></div>}>
          <FlowField mode="light" hue={25} saturation={0.8} brightness={1.1} className="h-full w-full" />
        </Suspense>
      ) : (
        <div className="relative h-full w-full" style={{ background: C.gray50 }}>
          {type === 'connectivity' && (
            <>
              <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 30% 40%, ${C.orangePastel} 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(249,115,22,0.08) 0%, transparent 50%)` }} />
              {[{ x: 20, y: 25 }, { x: 50, y: 50 }, { x: 80, y: 30 }, { x: 35, y: 70 }, { x: 65, y: 75 }].map((p, i) => (
                <div key={i} className="absolute h-3 w-3 rounded-full" style={{ left: `${p.x}%`, top: `${p.y}%`, background: C.orange, opacity: 0.6 + i * 0.08, boxShadow: `0 0 20px ${C.orangeLight}` }} />
              ))}
              <svg className="absolute inset-0 h-full w-full" style={{ opacity: 0.15 }}>
                <line x1="20%" y1="25%" x2="50%" y2="50%" stroke={C.orange} strokeWidth="1.5" />
                <line x1="50%" y1="50%" x2="80%" y2="30%" stroke={C.orange} strokeWidth="1.5" />
                <line x1="50%" y1="50%" x2="35%" y2="70%" stroke={C.orange} strokeWidth="1.5" />
                <line x1="50%" y1="50%" x2="65%" y2="75%" stroke={C.orange} strokeWidth="1.5" />
                <line x1="35%" y1="70%" x2="65%" y2="75%" stroke={C.orange} strokeWidth="1.5" />
              </svg>
            </>
          )}
          {type === 'interface' && (
            <div className="absolute inset-0" style={{
              background: `repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(249,115,22,0.06) 39px, rgba(249,115,22,0.06) 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(249,115,22,0.06) 39px, rgba(249,115,22,0.06) 40px)`,
            }}>
              <div className="absolute left-[15%] top-[20%] h-16 w-32 rounded-lg border" style={{ borderColor: C.orangeLight, opacity: 0.4 }} />
              <div className="absolute right-[20%] top-[35%] h-12 w-48 rounded-lg border" style={{ borderColor: C.orangeLight, opacity: 0.3 }} />
              <div className="absolute bottom-[25%] left-[25%] h-20 w-40 rounded-lg border" style={{ borderColor: C.orangeLight, opacity: 0.35 }} />
              <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 50%, rgba(249,115,22,0.06) 0%, transparent 60%)` }} />
            </div>
          )}
          {type === 'predictive' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 50%, ${C.orangePastel} 0%, transparent 60%)` }} />
              <svg className="h-3/4 w-3/4" viewBox="0 0 200 200" style={{ opacity: 0.5 }}>
                <circle cx="100" cy="100" r="80" fill="none" stroke={C.orangeLight} strokeWidth="1" strokeDasharray="4 4" />
                <circle cx="100" cy="100" r="55" fill="none" stroke={C.orangeLight} strokeWidth="1" strokeDasharray="4 4" />
                <circle cx="100" cy="100" r="30" fill="none" stroke={C.orange} strokeWidth="1.5" strokeDasharray="4 4" />
                <path d="M 30 140 Q 70 80 100 90 T 170 60" fill="none" stroke={C.orange} strokeWidth="2" opacity="0.6" />
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Features() {
  return (
    <section id="features" className="py-12 sm:py-16" style={{ background: C.white }}>
      <div className="mx-auto max-w-6xl px-6">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest" style={{ color: C.orange }}>Features</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl" style={{ color: C.gray900 }}>
            Everything you need to track engagement
          </h2>
          <p className="mt-4 text-lg" style={{ color: C.gray500 }}>
            From pixel-precise open detection to AI-powered follow-up recommendations.
          </p>
        </div>

        {/* Feature rows */}
        <div className="mt-20 space-y-28 sm:space-y-36">
          {FEATURE_SECTIONS.map((feature) => {
            const FadeIn = ({ children }: { children: React.ReactNode }) => {
              const a = useInView(0.2);
              return <div ref={a.ref} className={`transition-all duration-700 ${a.visible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>{children}</div>;
            };
            return (
              <FadeIn key={feature.tag}>
                <div className={`flex flex-col items-center gap-12 lg:gap-16 ${feature.reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'}`}>
                  {/* Text */}
                  <div className="flex-1 space-y-6">
                    <span className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider" style={{ color: C.orange, background: C.orangePastel }}>
                      {feature.tag}
                    </span>
                    <h3 className="text-2xl font-extrabold leading-tight sm:text-3xl" style={{ color: C.gray900 }}>
                      {feature.title}
                    </h3>
                    <p className="text-base leading-relaxed sm:text-lg" style={{ color: C.gray500 }}>
                      {feature.description}
                    </p>
                    <ul className="space-y-3">
                      {feature.bullets.map((b) => (
                        <li key={b} className="flex items-center gap-3 text-sm font-medium" style={{ color: C.gray700 }}>
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: C.orangePastel }}>
                            <svg className="h-3.5 w-3.5" style={{ color: C.orange }} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          </span>
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </FadeIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   HOW IT WORKS — 3-step flow with animated backgrounds
   ════════════════════════════════════════════════════════════════════════════ */
function HowItWorks() {
  const anim = useInView();
  const steps = [
    { num: '01', title: 'Install the extension', desc: 'Add PostMail to Chrome in one click. It works invisibly inside your Gmail compose window — zero configuration.', icon: 'puzzle' },
    { num: '02', title: 'Compose & send', desc: 'Write emails as you normally do. PostMail automatically injects an invisible tracking pixel before you hit send.', icon: 'send' },
    { num: '03', title: 'Track opens live', desc: 'See who opened your email, when, and on what device — all in real-time on your PostMail dashboard.', icon: 'chart' },
  ];

  return (
    <section id="how-it-works" className="relative overflow-hidden py-12 sm:py-16" style={{ background: C.gray50 }}>
      {/* Background — CSS dot matrix */}
      <div className="pointer-events-none absolute inset-0 opacity-30" style={{
        backgroundImage: `radial-gradient(circle, ${C.orangeLight} 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
      }} />

      <div ref={anim.ref} className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest" style={{ color: C.orange }}>How It Works</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl" style={{ color: C.gray900 }}>
            Up and running in 3 minutes
          </h2>
        </div>

        <div className="mt-16 grid gap-8 sm:mt-20 md:grid-cols-3">
          {steps.map((step, i) => (
            <div key={step.num} className={`relative rounded-2xl border bg-white/80 p-8 shadow-sm backdrop-blur-sm transition-all duration-700 ${anim.visible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`} style={{ borderColor: C.gray200, transitionDelay: `${i * 200}ms` }}>
              {/* Step number */}
              <span className="text-5xl font-black" style={{ color: C.orangeLight }}>{step.num}</span>
              <h3 className="mt-4 text-xl font-bold" style={{ color: C.gray900 }}>{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: C.gray500 }}>{step.desc}</p>

              {/* Connector line on desktop */}
              {i < steps.length - 1 && (
                <div className="pointer-events-none absolute right-0 top-1/2 hidden h-px w-8 -translate-y-1/2 translate-x-full md:block" style={{ background: `linear-gradient(90deg, ${C.orangeLight}, transparent)` }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   ANALYTICS SHOWCASE
   ════════════════════════════════════════════════════════════════════════════ */
function AnalyticsShowcase() {
  const anim = useInView();
  return (
    <section className="relative overflow-hidden py-12 sm:py-16" style={{ background: C.white }}>
      <div ref={anim.ref} className="mx-auto max-w-6xl px-6">
        <div className={`mx-auto max-w-2xl text-center transition-all duration-700 ${anim.visible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
          <p className="text-sm font-bold uppercase tracking-widest" style={{ color: C.orange }}>Analytics</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl" style={{ color: C.gray900 }}>
            Your engagement command centre
          </h2>
          <p className="mt-4 text-lg" style={{ color: C.gray500 }}>
            Real-time dashboards that turn raw open data into actionable intelligence.
          </p>
        </div>

        {/* Visual grid */}
        <div className={`mt-16 grid gap-6 sm:grid-cols-2 transition-all duration-1000 ${anim.visible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
          {/* Card 1: Privacy Shield */}
          <div className="overflow-hidden rounded-2xl ring-1 ring-gray-100" style={{ boxShadow: '0 0 24px rgba(249,115,22,0.15)' }}>
            <div className="relative h-[250px]" style={{ background: C.gray50 }}>
              <div className="absolute inset-0" style={{ background: `repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(249,115,22,0.04) 10px, rgba(249,115,22,0.04) 11px)` }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="h-24 w-24" style={{ color: C.orangeLight, opacity: 0.5 }} fill="none" viewBox="0 0 24 24" strokeWidth={0.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
            </div>
            <div className="border-t p-5" style={{ borderColor: C.gray100 }}>
              <h4 className="font-bold" style={{ color: C.gray900 }}>Privacy Shield</h4>
              <p className="mt-1 text-sm" style={{ color: C.gray500 }}>Bot & proxy filtering for accurate human-only metrics.</p>
            </div>
          </div>

          {/* Card 2: Engagement Heatmap */}
          <div className="overflow-hidden rounded-2xl ring-1 ring-gray-100" style={{ boxShadow: '0 0 24px rgba(249,115,22,0.15)' }}>
            <div className="flex h-[250px] gap-4 p-5" style={{ background: C.gray50 }}>
              {/* Heatmap */}
              <div className="flex min-w-0 flex-1 flex-col">
                {/* Hour labels */}
                <div className="ml-8 flex gap-[4px] text-[10px] font-medium" style={{ color: C.gray400 }}>
                  {['6am', '8am', '10am', '12pm', '2pm', '4pm', '6pm', '8pm', '10pm'].map(h => (
                    <div key={h} className="flex-1 text-center">{h}</div>
                  ))}
                </div>
                {/* Rows: day label + cells — flex-1 so the grid fills remaining height */}
                <div className="mt-1 flex flex-1 flex-col gap-[4px]">
                  {[
                    { day: 'Mon', vals: [0.1, 0.2, 0.6, 0.9, 0.8, 0.5, 0.3, 0.1, 0.05] },
                    { day: 'Tue', vals: [0.05, 0.3, 0.7, 0.85, 0.9, 0.6, 0.4, 0.15, 0.05] },
                    { day: 'Wed', vals: [0.1, 0.25, 0.8, 0.95, 0.7, 0.55, 0.35, 0.2, 0.1] },
                    { day: 'Thu', vals: [0.05, 0.2, 0.65, 0.8, 0.85, 0.5, 0.3, 0.1, 0.05] },
                    { day: 'Fri', vals: [0.1, 0.35, 0.7, 0.75, 0.6, 0.4, 0.2, 0.1, 0.05] },
                    { day: 'Sat', vals: [0.0, 0.05, 0.1, 0.15, 0.1, 0.05, 0.15, 0.3, 0.2] },
                    { day: 'Sun', vals: [0.0, 0.05, 0.05, 0.1, 0.05, 0.05, 0.1, 0.25, 0.15] },
                  ].map(({ day, vals }) => (
                    <div key={day} className="flex flex-1 items-center gap-[4px]">
                      <span className="w-7 shrink-0 text-right text-[10px] font-medium" style={{ color: C.gray400 }}>{day}</span>
                      {vals.map((v, ci) => (
                        <div
                          key={ci}
                          className="h-full flex-1 rounded-[4px]"
                          style={{
                            background: v === 0
                              ? C.gray100
                              : `rgba(249, 115, 22, ${0.15 + v * 0.75})`,
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              {/* Legend */}
              <div className="flex shrink-0 flex-col items-center justify-center gap-1.5 text-[10px] font-medium" style={{ color: C.gray400 }}>
                <span>Less</span>
                {[0.1, 0.3, 0.55, 0.8, 1].map((v, i) => (
                  <div key={i} className="h-3 w-3 rounded-[2px]" style={{ background: `rgba(249, 115, 22, ${0.15 + v * 0.75})` }} />
                ))}
                <span>More</span>
              </div>
            </div>
            <div className="border-t p-5" style={{ borderColor: C.gray100 }}>
              <h4 className="font-bold" style={{ color: C.gray900 }}>Engagement Heatmap</h4>
              <p className="mt-1 text-sm" style={{ color: C.gray500 }}>Visualise open patterns across time zones and days.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   INTEGRATIONS
   ════════════════════════════════════════════════════════════════════════════ */
function Integrations() {
  const anim = useInView();
  const integrations = [
    { name: 'Gmail', desc: 'Native Chrome extension for Gmail compose' },
    { name: 'Outlook', desc: 'Full Outlook OAuth integration' },
    { name: 'Discord', desc: 'Instant open notifications via webhooks' },
    { name: 'Slack', desc: 'Team-wide open alerts in any channel' },
    { name: 'Zapier', desc: 'Connect to 5,000+ apps automatically' },
    { name: 'API', desc: 'Full REST API for custom integrations' },
  ];

  return (
    <section id="integrations" className="relative overflow-hidden py-12 sm:py-16" style={{ background: `linear-gradient(180deg, ${C.white} 0%, ${C.orangePastel} 15%, ${C.orangePastel} 75%, ${C.white} 100%)` }}>
      {/* Background — CSS particle drift */}
      <div className="pointer-events-none absolute inset-0 opacity-20" style={{
        background: `radial-gradient(circle at 20% 55%, ${C.orangeLight} 0%, transparent 30%), radial-gradient(circle at 80% 70%, ${C.orangeLight} 0%, transparent 25%), radial-gradient(circle at 50% 60%, rgba(249,115,22,0.1) 0%, transparent 40%)`,
      }} />

      <div ref={anim.ref} className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest" style={{ color: C.orange }}>Integrations</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl" style={{ color: C.gray900 }}>
            Works with your entire stack
          </h2>
          <p className="mt-4 text-lg" style={{ color: C.gray500 }}>
            Connect PostMail to the tools you already use. No code required.
          </p>
        </div>

        <div className={`mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 transition-all duration-700 ${anim.visible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
          {integrations.map((item, i) => (
            <div key={item.name} className="group flex items-center gap-5 rounded-2xl border bg-white/80 p-6 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-orange-50" style={{ borderColor: C.gray200, transitionDelay: `${i * 100}ms` }}>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl" style={{ background: `linear-gradient(135deg, ${C.orangePastel}, rgba(249,115,22,0.15))` }}>
                <span className="text-lg font-bold" style={{ color: C.orange }}>{item.name.charAt(0)}</span>
              </div>
              <div>
                <h4 className="font-bold" style={{ color: C.gray900 }}>{item.name}</h4>
                <p className="mt-0.5 text-sm" style={{ color: C.gray500 }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   WORKFLOW SHOWCASE
   ════════════════════════════════════════════════════════════════════════════ */
function WorkflowShowcase() {
  const anim = useInView();
  return (
    <section className="relative overflow-hidden py-12 sm:py-16" style={{ background: C.white }}>
      <div ref={anim.ref} className="mx-auto max-w-6xl px-6">
        <div className={`mx-auto max-w-2xl text-center transition-all duration-700 ${anim.visible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
          <p className="text-sm font-bold uppercase tracking-widest" style={{ color: C.orange }}>Workflow</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl" style={{ color: C.gray900 }}>
            See the journey of every email
          </h2>
          <p className="mt-4 text-lg" style={{ color: C.gray500 }}>
            From compose to conversion — PostMail maps every touchpoint.
          </p>
        </div>

        {/* Full-width visual panels */}
        <div className="mt-16 grid gap-6 md:grid-cols-2">
          <div className="overflow-hidden rounded-2xl ring-1 ring-gray-100" style={{ boxShadow: '0 0 24px rgba(249,115,22,0.15)' }}>
            <div className="relative h-[280px]" style={{ background: C.gray50 }}>
              <div className="absolute inset-0 flex items-center justify-center px-8">
                {/* Pipeline stages with connectors */}
                <div className="flex w-full items-center justify-between">
                  {['Compose', 'Send', 'Deliver', 'Open'].map((stage, i) => (
                    <div key={stage} className="flex items-center" style={{ flex: i < 3 ? 1 : undefined }}>
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: `rgba(249,115,22,${0.1 + i * 0.08})`, border: `2px solid rgba(249,115,22,${0.2 + i * 0.15})` }}>
                          <span className="text-xs font-bold" style={{ color: C.orange }}>{i + 1}</span>
                        </div>
                        <span className="text-xs font-medium" style={{ color: C.gray500 }}>{stage}</span>
                      </div>
                      {i < 3 && <div className="mb-5 h-px flex-1 mx-2" style={{ background: `linear-gradient(90deg, ${C.orangeLight}, rgba(249,115,22,0.2))` }} />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6" style={{ background: C.gray50 }}>
              <h4 className="text-lg font-bold" style={{ color: C.gray900 }}>Email Delivery Pipeline</h4>
              <p className="mt-2 text-sm" style={{ color: C.gray500 }}>Watch your emails flow through compose, send, deliver, and open stages in real-time.</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl ring-1 ring-gray-100" style={{ boxShadow: '0 0 24px rgba(249,115,22,0.15)' }}>
            <div className="relative flex h-[280px] flex-col px-6 py-4" style={{ background: C.gray50 }}>
              {/* Mock engagement timeline / thread view */}
              <div className="flex flex-1 flex-col gap-2">
                {/* Thread header */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold" style={{ color: C.gray700 }}>Thread Activity</span>
                  <span className="text-[10px] font-medium" style={{ color: C.gray400 }}>Last 7 days</span>
                </div>
                {/* Thread rows */}
                {[
                  { initials: 'SC', name: 'Sarah Chen', subject: 'Q3 Proposal', opens: 5, clicks: 2, lastOpen: '2m ago', heat: 0.95 },
                  { initials: 'MJ', name: 'Marcus J.', subject: 'Interview Follow-up', opens: 3, clicks: 1, lastOpen: '1h ago', heat: 0.7 },
                  { initials: 'PP', name: 'Priya Patel', subject: 'Partnership Deck', opens: 8, clicks: 4, lastOpen: '15m ago', heat: 1.0 },
                  { initials: 'DK', name: 'David Kim', subject: 'Pricing Breakdown', opens: 1, clicks: 0, lastOpen: '2d ago', heat: 0.25 },
                ].map((row) => (
                  <div key={row.initials} className="flex flex-1 items-center gap-3 rounded-lg border bg-white px-3" style={{ borderColor: C.gray200 }}>
                    {/* Avatar */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: `rgba(249,115,22,${0.4 + row.heat * 0.6})` }}>
                      {row.initials}
                    </div>
                    {/* Name + subject */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold" style={{ color: C.gray800 }}>{row.name}</p>
                      <p className="truncate text-[10px]" style={{ color: C.gray400 }}>{row.subject}</p>
                    </div>
                    {/* Stats */}
                    <div className="flex shrink-0 items-center gap-3 text-[10px] font-medium" style={{ color: C.gray500 }}>
                      <span className="flex items-center gap-1">
                        <svg className="h-3 w-3" style={{ color: C.orange }} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        {row.opens}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="h-3 w-3" style={{ color: C.orange }} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.07a4.5 4.5 0 00-6.364-6.364L6.34 5.67" /></svg>
                        {row.clicks}
                      </span>
                    </div>
                    {/* Engagement bar */}
                    <div className="hidden h-2 w-16 shrink-0 overflow-hidden rounded-full sm:block" style={{ background: C.gray100 }}>
                      <div className="h-full rounded-full" style={{ width: `${row.heat * 100}%`, background: `linear-gradient(90deg, ${C.orangeLight}, ${C.orange})` }} />
                    </div>
                    {/* Last open */}
                    <span className="hidden shrink-0 text-[10px] sm:block" style={{ color: C.gray400 }}>{row.lastOpen}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-6" style={{ background: C.gray50 }}>
              <h4 className="text-lg font-bold" style={{ color: C.gray900 }}>Recipient Engagement Graph</h4>
              <p className="mt-2 text-sm" style={{ color: C.gray500 }}>Map relationships between email threads, opens, and follow-up actions.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   STATS BANNER — animated counters
   ════════════════════════════════════════════════════════════════════════════ */
function StatsBanner() {
  const anim = useInView();
  const stats = [
    { value: '2M+', label: 'Emails tracked' },
    { value: '99.9%', label: 'Uptime' },
    { value: '<1s', label: 'Open detection' },
    { value: '50+', label: 'Countries' },
  ];

  return (
    <section className="relative overflow-hidden py-8" style={{ background: `linear-gradient(90deg, ${C.orange}, ${C.orangeNeon})` }}>
      <div className="pointer-events-none absolute inset-0 opacity-20">
        <Suspense fallback={null}>
          <FlowField mode="light" hue={25} speed={0.3} className="h-full w-full" />
        </Suspense>
      </div>
      <div className="relative z-10 mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 md:grid-cols-4">
        {stats.map((stat, i) => (
          <div key={stat.label} ref={anim.ref} className={`text-center transition-all duration-700 ${anim.visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`} style={{ transitionDelay: `${i * 150}ms` }}>
            <p className="text-3xl font-extrabold text-white sm:text-4xl">{stat.value}</p>
            <p className="mt-1 text-sm text-white/80">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SECURITY SECTION
   ════════════════════════════════════════════════════════════════════════════ */
function Security() {
  const anim = useInView();
  return (
    <section className="relative overflow-hidden py-12 sm:py-16" style={{ background: C.gray50 }}>
      <div ref={anim.ref} className={`mx-auto max-w-6xl px-6 transition-all duration-700 ${anim.visible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
        <div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-16">
          {/* Text */}
          <div className="flex-1 space-y-6">
            <span className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider" style={{ color: C.orange, background: C.orangePastel }}>
              Privacy & Security
            </span>
            <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl" style={{ color: C.gray900 }}>
              Enterprise-grade security, built in
            </h2>
            <p className="text-base leading-relaxed sm:text-lg" style={{ color: C.gray500 }}>
              Your email data never touches our servers. Tracking pixels are stateless — we only record the open event, never the email content. All connections are encrypted with TLS 1.3.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {['End-to-end encryption', 'GDPR compliant', 'SOC 2 Type II', 'Zero email storage'].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm font-medium" style={{ color: C.gray700 }}>
                  <svg className="h-4 w-4 shrink-0" style={{ color: C.orange }} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   TESTIMONIALS
   ════════════════════════════════════════════════════════════════════════════ */
function Testimonials() {
  const anim = useInView();
  const testimonials = [
    { quote: 'PostMail completely changed how we follow up with prospects. We close 30% faster now.', name: 'Sarah Chen', role: 'Head of Sales, TechCorp', avatar: 'SC' },
    { quote: 'The instant notifications are a game-changer. I follow up within minutes of an open and it shows.', name: 'Marcus Johnson', role: 'Recruiter, HireFast', avatar: 'MJ' },
    { quote: 'Simple, fast, and just works. We tried 4 other trackers before finding PostMail.', name: 'Priya Patel', role: 'Founder, DevStudio', avatar: 'PP' },
  ];

  return (
    <section className="py-12 sm:py-16" style={{ background: C.white }}>
      <div ref={anim.ref} className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest" style={{ color: C.orange }}>Testimonials</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ color: C.gray900 }}>
            Loved by sales teams everywhere
          </h2>
        </div>

        <div className={`mt-16 grid gap-8 md:grid-cols-3 transition-all duration-700 ${anim.visible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
          {testimonials.map((t, i) => (
            <div key={t.name} className="rounded-2xl border p-8 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-orange-50" style={{ borderColor: C.gray200, transitionDelay: `${i * 100}ms` }}>
              {/* Stars */}
              <div className="flex gap-1">
                {[...Array(5)].map((_, j) => (
                  <svg key={j} className="h-4 w-4" style={{ color: C.orange }} fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="mt-4 text-sm leading-relaxed" style={{ color: C.gray700 }}>"{t.quote}"</p>
              <div className="mt-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: `linear-gradient(135deg, ${C.orange}, ${C.orangeNeon})` }}>
                  {t.avatar}
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: C.gray900 }}>{t.name}</p>
                  <p className="text-xs" style={{ color: C.gray500 }}>{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PRICING
   ════════════════════════════════════════════════════════════════════════════ */
const TIERS = [
  {
    name: 'Starter',
    price: '$0',
    period: '/mo',
    description: 'For individuals exploring email tracking.',
    features: ['50 tracked emails/mo', 'Track 1 account', 'Basic dashboard', 'Chrome extension', '24h open history'],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$12',
    period: '/mo',
    description: 'For professionals who need full visibility.',
    features: ['Unlimited tracking', 'Track 5 accounts', 'Discord & Slack notifications', 'Link click tracking', 'Priority support', '30-day analytics'],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For teams that need everything.',
    features: ['Unlimited everything', 'SSO & SAML', 'Dedicated account manager', 'Custom API integrations', 'SLA guarantee', 'On-premise option'],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

function Pricing() {
  const anim = useInView();
  return (
    <section id="pricing" className="relative overflow-hidden py-12 sm:py-16" style={{ background: `linear-gradient(180deg, ${C.white} 0%, ${C.orangePastel} 40%, ${C.orangePastel} 60%, ${C.white} 100%)` }}>
      <div ref={anim.ref} className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest" style={{ color: C.orange }}>Pricing</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl" style={{ color: C.gray900 }}>
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-lg" style={{ color: C.gray500 }}>
            Start free. Upgrade when you need more.
          </p>
        </div>

        <div className={`mt-16 grid gap-8 md:grid-cols-3 transition-all duration-700 ${anim.visible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl border bg-white p-8 transition-all hover:-translate-y-1 hover:shadow-xl ${
                tier.highlighted
                  ? 'shadow-xl shadow-orange-100 ring-2 ring-orange-500'
                  : 'shadow-sm'
              }`}
              style={{
                borderColor: tier.highlighted ? C.orange : C.gray200,
              }}
            >
              {tier.highlighted && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold text-white" style={{ background: `linear-gradient(135deg, ${C.orange}, ${C.orangeNeon})` }}>
                  Most Popular
                </div>
              )}
              <h3 className="text-xl font-bold" style={{ color: C.gray900 }}>{tier.name}</h3>
              <p className="mt-1 text-sm" style={{ color: C.gray500 }}>{tier.description}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold" style={{ color: C.gray900 }}>{tier.price}</span>
                {tier.period && <span className="text-sm" style={{ color: C.gray500 }}>{tier.period}</span>}
              </div>
              <ul className="mt-8 space-y-3">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color: C.gray700 }}>
                    <svg className="h-4 w-4 shrink-0" style={{ color: C.orange }} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/signup"
                className={`relative mt-8 block w-full overflow-hidden rounded-xl py-3.5 text-center text-sm font-bold transition ${
                  tier.highlighted
                    ? 'text-white shadow-lg shadow-orange-200 hover:shadow-orange-300'
                    : 'hover:bg-gray-50'
                }`}
                style={tier.highlighted
                  ? { background: `linear-gradient(135deg, ${C.orange}, ${C.orangeNeon})` }
                  : { border: `1px solid ${C.gray200}`, color: C.gray700 }
                }
              >
                {tier.highlighted && <BubbleOverlay />}
                <span className="relative z-10">{tier.cta}</span>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   FINAL CTA — immersive full-width with WarpField
   ════════════════════════════════════════════════════════════════════════════ */
function FinalCta() {
  const anim = useInView();
  return (
    <section className="relative overflow-hidden py-14 sm:py-18" style={{ background: C.gray900 }}>
      {/* CSS warp-like background */}
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{
        background: `radial-gradient(ellipse at 30% 40%, rgba(249,115,22,0.3) 0%, transparent 50%), radial-gradient(ellipse at 70% 60%, rgba(255,107,0,0.2) 0%, transparent 40%), radial-gradient(ellipse at 50% 50%, rgba(249,115,22,0.1) 0%, transparent 60%)`,
      }} />

      {/* Gradient overlay */}
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse at center, transparent 0%, ${C.gray900} 70%)` }} />

      <div ref={anim.ref} className={`relative z-10 mx-auto max-w-3xl px-6 text-center transition-all duration-1000 ${anim.visible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
        <h2 className="text-3xl font-extrabold text-white sm:text-4xl md:text-5xl lg:text-6xl">
          Ready to know when your
          <br />
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(135deg, ${C.orange}, ${C.orangeLight})` }}>
            emails get opened?
          </span>
        </h2>
        <p className="mx-auto mt-6 max-w-lg text-lg text-gray-400">
          Join thousands of sales teams, recruiters, and freelancers already tracking with PostMail.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link to="/signup" className="inline-flex items-center gap-2 rounded-full px-8 py-4 text-lg font-bold text-white shadow-xl shadow-orange-900/30 transition hover:shadow-2xl" style={{ background: `linear-gradient(135deg, ${C.orange}, ${C.orangeNeon})` }}>
            Start Tracking Free
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          <button onClick={() => document.querySelector('#how-it-works')?.scrollIntoView({ behavior: 'smooth' })} className="inline-flex items-center gap-2 rounded-full border border-gray-600 px-6 py-4 text-base font-medium text-gray-300 transition hover:border-gray-400 hover:text-white">
            Watch Demo
          </button>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   FOOTER
   ════════════════════════════════════════════════════════════════════════════ */
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
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
  ],
};

function Footer() {
  return (
    <footer className="border-t py-8" style={{ borderColor: C.gray200, background: C.white }}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          {/* Brand */}
          <div>
            <span className="text-xl font-extrabold tracking-tight" style={{ color: C.gray900 }}>
              Post<span style={{ color: C.orange }}>Mail</span>
            </span>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: C.gray500 }}>
              Email open tracking for modern teams. Know the moment your email is read.
            </p>
          </div>
          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
            <div key={heading}>
              <h4 className="text-sm font-bold uppercase tracking-wider" style={{ color: C.gray900 }}>{heading}</h4>
              <ul className="mt-4 space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('/') ? (
                      <Link to={link.href} className="text-sm transition hover:text-orange-500" style={{ color: C.gray500 }}>{link.label}</Link>
                    ) : (
                      <a href={link.href} className="text-sm transition hover:text-orange-500" style={{ color: C.gray500 }}>{link.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t pt-8 sm:flex-row" style={{ borderColor: C.gray200 }}>
          <p className="text-sm" style={{ color: C.gray400 }}>&copy; 2026 PostMail. All rights reserved.</p>
          <div className="flex gap-6">
            {['Twitter', 'GitHub', 'LinkedIn'].map((social) => (
              <a key={social} href="#" className="text-sm transition hover:text-orange-500" style={{ color: C.gray400 }}>{social}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   HOME — compose all sections
   ════════════════════════════════════════════════════════════════════════════ */
export default function Home() {
  return (
    <div className="min-h-screen" style={{ background: C.white }}>
      <Navbar />
      <Hero />
      <LiveDemoBanner />
      <Features />
      <HowItWorks />
      <AnalyticsShowcase />
      <WorkflowShowcase />
      <Integrations />
      <StatsBanner />
      <Security />
      <Testimonials />
      <Pricing />
      <FinalCta />
      <Footer />
    </div>
  );
}
