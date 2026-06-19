import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "~/components/ui/button";
import { Mic, Sparkles, FileText, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              O
            </span>
            OLat5
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

      <main className="flex-1">
        <section className="container flex flex-col items-center py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" /> AI copilot for interviews &amp; meetings
          </div>
          <h1 className="mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Real-time transcription, summaries, and coaching for every conversation
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            OLat5 listens to your interviews and meetings, transcribes them live,
            and gives you AI-powered suggestions and summaries — so you never miss
            a beat.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link to="/signup">
                Start free <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/login">Log in</Link>
            </Button>
          </div>
        </section>

        <section className="container grid gap-8 pb-24 sm:grid-cols-3">
          {[
            { icon: Mic, title: "Live transcription", body: "Capture every word from your meetings and interviews in real time." },
            { icon: Sparkles, title: "AI suggestions", body: "Get coaching cues and suggested answers as the conversation unfolds." },
            { icon: FileText, title: "Instant summaries", body: "Walk away with action items, decisions, and a clean recap." },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border p-6">
              <f.icon className="h-8 w-8 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} OLat5. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
