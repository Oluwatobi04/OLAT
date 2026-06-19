import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Mic,
  Sparkles,
  FileText,
  ArrowRight,
  Brain,
  MessageSquare,
  BarChart3,
  Check,
  Zap,
} from "lucide-react";
import { Button } from "~/components/ui/button";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
};

function LandingPage() {
  return (
    <div className="bg-aurora relative min-h-screen overflow-hidden bg-background">
      {/* floating AI particles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float absolute left-[10%] top-32 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="animate-float absolute right-[8%] top-64 h-80 w-80 rounded-full bg-purple-500/20 blur-3xl [animation-delay:2s]" />
        <div className="animate-float absolute bottom-32 left-1/3 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl [animation-delay:4s]" />
      </div>

      <header className="relative z-10">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5 font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] text-white shadow-lg shadow-blue-500/30">
              O
            </span>
            <span className="text-lg tracking-tight">OLat5</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link to="/signup">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="relative z-10">
        {/* HERO */}
        <section className="mx-auto max-w-6xl px-6 pb-24 pt-20 text-center">
          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            transition={{ duration: 0.6 }}
            className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur"
          >
            <Sparkles className="h-4 w-4 text-[#8B5CF6]" /> AI copilot for interviews &amp; meetings
          </motion.div>

          <motion.h1
            initial="hidden"
            animate="show"
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mx-auto mt-8 max-w-4xl text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-7xl"
          >
            Land Your Next Opportunity{" "}
            <span className="text-gradient">With AI</span>
          </motion.h1>

          <motion.p
            initial="hidden"
            animate="show"
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground"
          >
            AI-powered interview preparation, coaching, and meeting intelligence — resume
            analysis, mock interviews, live transcription, and instant summaries.
          </motion.p>

          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button size="lg" asChild>
              <Link to="/signup">
                Start free <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link to="/login">Log in</Link>
            </Button>
          </motion.div>

          {/* animated dashboard preview */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="glass-strong mx-auto mt-16 max-w-4xl rounded-2xl p-2 shadow-2xl shadow-blue-500/10"
          >
            <div className="rounded-xl border border-white/5 bg-[#0d1117] p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-red-500/70" />
                <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
                <span className="h-3 w-3 rounded-full bg-green-500/70" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                {["Resume Score", "ATS Match", "Readiness"].map((m, i) => (
                  <div key={m} className="gradient-border rounded-xl p-4 text-left">
                    <p className="text-xs text-muted-foreground">{m}</p>
                    <p className="mt-1 text-2xl font-bold text-gradient">{[92, 88, 95][i]}%</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6]"
                        style={{ width: `${[92, 88, 95][i]}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </section>

        {/* FEATURES */}
        <Section id="features" title="Everything you need to win the interview" subtitle="Features">
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { icon: FileText, title: "Resume Analyzer", body: "ATS scoring, skill gaps, and AI rewrite suggestions in seconds." },
              { icon: MessageSquare, title: "Mock Interviews", body: "Realistic AI interviewer with scored feedback and coaching." },
              { icon: Mic, title: "Live Intelligence", body: "Real-time transcription and AI insights during interviews." },
            ].map((f, i) => (
              <FeatureCard key={f.title} {...f} delay={i * 0.1} />
            ))}
          </div>
        </Section>

        {/* AI CAPABILITIES */}
        <Section id="ai" title="AI that works the way you do" subtitle="AI Capabilities">
          <div className="grid gap-6 sm:grid-cols-2">
            {[
              { icon: Brain, title: "Multi-model AI", body: "Powered by Claude, GPT, and Gemini via a unified engine." },
              { icon: Zap, title: "Streaming responses", body: "Instant, premium AI experiences with live token streaming." },
              { icon: BarChart3, title: "Performance analytics", body: "Track communication, confidence, and technical scores over time." },
              { icon: Sparkles, title: "Coaching reports", body: "Personalized improvement plans after every session." },
            ].map((f, i) => (
              <FeatureCard key={f.title} {...f} delay={i * 0.08} />
            ))}
          </div>
        </Section>

        {/* PRICING */}
        <Section id="pricing" title="Simple, credit-based pricing" subtitle="Pricing">
          <div className="grid gap-6 md:grid-cols-3">
            <PriceCard name="Free" price="$0" credits="10 credits / month" features={["All core features", "Community support"]} cta="Get started" />
            <PriceCard
              name="Pro"
              price="$12.99"
              credits="60 credits / month"
              features={["Priority AI processing", "PDF exports", "Advanced analytics", "Full prep toolkit"]}
              cta="Upgrade to Pro"
              popular
            />
            <PriceCard name="Team" price="$49" credits="200 credits / month" features={["Shared credit pool", "Team workspaces", "Admin controls"]} cta="Start team plan" />
          </div>
        </Section>

        {/* TESTIMONIALS */}
        <Section id="testimonials" title="Loved by ambitious professionals" subtitle="Testimonials">
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { name: "Sarah K.", role: "Software Engineer", quote: "The mock interviews felt shockingly real. I walked into my FAANG loop calm and prepared." },
              { name: "David M.", role: "Product Manager", quote: "Resume analyzer caught ATS issues I'd missed for years. Got 3x more callbacks." },
              { name: "Aisha R.", role: "Data Scientist", quote: "Live insights during interviews are a game-changer. It's like having a coach in your ear." },
            ].map((t, i) => (
              <motion.div
                key={t.name}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
                variants={fadeUp}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="glass rounded-2xl p-6"
              >
                <p className="text-sm text-foreground/90">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] text-sm font-semibold text-white">
                    {t.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* FAQ */}
        <Section id="faq" title="Frequently asked questions" subtitle="FAQ">
          <div className="mx-auto max-w-3xl space-y-4">
            {[
              { q: "How do credits work?", a: "Every AI action costs credits. Plans refresh monthly — Free 10, Pro 60, Team 200." },
              { q: "Which AI models power OLat5?", a: "Claude, GPT, and Gemini through a unified multi-model engine." },
              { q: "Can I use it during live interviews?", a: "Yes — Live Sessions provide real-time transcription and AI insights." },
              { q: "Is my data private?", a: "Your data is isolated per account with row-level security and encrypted storage." },
            ].map((f) => (
              <div key={f.q} className="glass rounded-xl p-5">
                <p className="font-medium">{f.q}</p>
                <p className="mt-1 text-sm text-muted-foreground">{f.a}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="gradient-border relative overflow-hidden rounded-3xl p-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to <span className="text-gradient">stand out</span>?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              Join thousands preparing smarter with OLat5.
            </p>
            <Button size="lg" className="mt-8" asChild>
              <Link to="/signup">
                Start free <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/5 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] text-xs font-bold text-white">O</span>
            OLat5
          </div>
          <p>© {new Date().getFullYear()} OLat5. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-6xl px-6 py-20">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        variants={fadeUp}
        transition={{ duration: 0.5 }}
        className="mb-12 text-center"
      >
        <p className="text-sm font-medium uppercase tracking-widest text-[#8B5CF6]">{subtitle}</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      </motion.div>
      {children}
    </section>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
  delay,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  delay: number;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true }}
      variants={fadeUp}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -6 }}
      className="glass group rounded-2xl p-6 transition-shadow hover:shadow-xl hover:shadow-blue-500/10"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 ring-1 ring-inset ring-white/10">
        <Icon className="h-6 w-6 text-[#60a5fa]" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </motion.div>
  );
}

function PriceCard({
  name,
  price,
  credits,
  features,
  cta,
  popular,
}: {
  name: string;
  price: string;
  credits: string;
  features: string[];
  cta: string;
  popular?: boolean;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true }}
      variants={fadeUp}
      transition={{ duration: 0.5 }}
      whileHover={{ y: -6 }}
      className={
        popular
          ? "gradient-border relative rounded-2xl p-6 shadow-2xl shadow-purple-500/20"
          : "glass relative rounded-2xl p-6"
      }
    >
      {popular ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] px-3 py-1 text-xs font-semibold text-white shadow-lg">
          Most Popular
        </span>
      ) : null}
      <h3 className="text-lg font-semibold">{name}</h3>
      <div className="mt-2">
        <span className="text-4xl font-bold">{price}</span>
        {price !== "$0" ? <span className="text-sm text-muted-foreground">/mo</span> : null}
      </div>
      <p className="mt-1 text-sm text-[#60a5fa]">{credits}</p>
      <ul className="mt-6 space-y-2.5 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-muted-foreground">
            <Check className="h-4 w-4 text-emerald-400" /> {f}
          </li>
        ))}
      </ul>
      <Button variant={popular ? "default" : "secondary"} className="mt-6 w-full" asChild>
        <Link to="/signup">{cta}</Link>
      </Button>
    </motion.div>
  );
}
