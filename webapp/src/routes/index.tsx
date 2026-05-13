import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import {
  ArrowRight,
  Sparkles,
  BrainCircuit,
  ScanText,
  GraduationCap,
  Mic,
  Eye,
  MessageSquare,
  LineChart,
  ShieldCheck,
  Compass,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignInGoogle = async () => {
    if (signingIn) return; // Prevent duplicate clicks
    
    try {
      setSigningIn(true);
      setError(null);
      await signInWithGoogle();
      navigate({ to: "/onboarding" });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      
      // Handle specific Firebase errors
      if (errorMessage.includes("popup-closed-by-user") || errorMessage.includes("cancelled-popup-request")) {
        setError("Sign-in was cancelled. Please try again.");
      } else if (errorMessage.includes("popup-blocked")) {
        setError("Popup was blocked. Please allow popups and try again.");
      } else {
        setError("Sign-in failed. Please try again.");
      }
      console.error("Sign-in error:", err);
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignInNormal = () => {
    navigate({ to: "/onboarding" });
  };

  const handleSignUpNormal = () => {
    navigate({ to: "/"})
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Error message */}
      {error && (
        <div className="fixed top-4 left-4 right-4 z-50 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border/40 glass">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            StudyBuddy AI
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#access" className="hover:text-foreground">Accessibility</a>
            <a href="#exams" className="hover:text-foreground">Exams</a>
          </nav>
          <div className="flex items-center gap-3">
            {user ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
              >
                Go to Dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSignUpNormal}
                  className="inline-flex items-center gap-1.5 rounded-full bg-secondary/80 px-4 py-2 text-sm font-medium text-secondary-foreground transition-transform hover:-translate-y-0.5"
                >
                  Already have an account? Sign In
                </button>
                <button
                  onClick={handleSignInNormal}
                  className="inline-flex items-center gap-1.5 rounded-full bg-secondary/80 px-4 py-2 text-sm font-medium text-secondary-foreground transition-transform hover:-translate-y-0.5"
                >
                  Sign Up
                </button>
                <button
                  onClick={handleSignInGoogle}
                  disabled={signingIn}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {signingIn ? "Signing in..." : "Sign in with Google"} {!signingIn && <ArrowRight className="h-4 w-4" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-50" />
        <div className="absolute inset-0 gradient-aurora" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 pb-24 pt-20 lg:grid-cols-12 lg:pt-28">
          <div className="lg:col-span-7">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs text-muted-foreground"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-mint animate-pulse-ring" />
              Now teaching · evaluating · adapting
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.05 }}
              className="mt-6 font-display text-5xl font-semibold leading-[1.02] tracking-tight md:text-7xl"
            >
              Learn anything.{" "}
              <span className="text-gradient-mint">Get evaluated</span>{" "}
              like it's the real exam.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15 }}
              className="mt-6 max-w-xl text-lg text-muted-foreground text-pretty"
            >
              StudyBuddy AI is the AI learning ecosystem that builds your roadmap, teaches at your level, grades your hand-written
              answers, and is designed for every kind of learner — including hearing, visually and speech-impaired students.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.25 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Link
                to="/onboarding"
                className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground ring-glow transition-transform hover:-translate-y-0.5"
              >
                Build my roadmap
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-6 py-3 font-medium text-foreground hover:bg-surface"
              >
                See live dashboard
              </Link>
            </motion.div>
            <div className="mt-10 grid max-w-xl grid-cols-3 gap-4 text-sm">
              {[
                { k: "12.4k", v: "active learners" },
                { k: "94%", v: "OCR accuracy" },
                { k: "<2s", v: "AI response" },
              ].map((s) => (
                <div key={s.v} className="rounded-2xl border border-border/60 bg-surface/40 p-4">
                  <p className="font-display text-2xl font-semibold">{s.k}</p>
                  <p className="text-xs text-muted-foreground">{s.v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right visual: stacked product cards */}
          <div className="relative lg:col-span-5">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative mx-auto h-[520px] w-full max-w-md"
            >
              {/* Roadmap card */}
              <div className="absolute left-0 top-0 w-72 rotate-[-4deg] rounded-3xl border border-border/60 bg-surface p-5 shadow-card animate-float">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Your roadmap</p>
                <p className="mt-2 font-display text-xl">JEE · 18 months</p>
                <div className="mt-4 space-y-2">
                  {[
                    { l: "Foundation", p: 100 },
                    { l: "Consolidation", p: 64 },
                    { l: "Acceleration", p: 12 },
                  ].map((r) => (
                    <div key={r.l}>
                      <div className="flex justify-between text-xs">
                        <span>{r.l}</span>
                        <span className="text-muted-foreground">{r.p}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full gradient-mint" style={{ width: `${r.p}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Eval card */}
              <div
                className="absolute right-0 top-32 w-72 rotate-[5deg] rounded-3xl border border-border/60 bg-surface p-5 shadow-card animate-float"
                style={{ animationDelay: "1.2s" }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Subjective</p>
                  <span className="rounded-full bg-mint/15 px-2 py-0.5 text-xs text-mint">Graded</span>
                </div>
                <p className="mt-2 font-display text-3xl">78<span className="text-base text-muted-foreground">/100</span></p>
                <ul className="mt-3 space-y-1.5 text-xs">
                  <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-mint"/>Strong intro definition</li>
                  <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-amber"/>Light-reaction equation incomplete</li>
                  <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-coral"/>Calvin cycle out of order</li>
                </ul>
              </div>
              {/* Lecture card */}
              <div
                className="absolute bottom-0 left-6 w-80 rotate-[-2deg] rounded-3xl border border-border/60 bg-surface p-5 shadow-card animate-float"
                style={{ animationDelay: "0.6s" }}
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl gradient-violet">
                    <BrainCircuit className="h-5 w-5 text-ink" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Live lecture · with subtitles</p>
                    <p className="text-xs text-muted-foreground">Coordination Compounds · Adaptive</p>
                  </div>
                </div>
                <div className="mt-4 rounded-xl bg-ink/40 p-3 text-xs text-muted-foreground">
                  "A chelating ligand binds the central metal through more than one donor atom — like EDTA's six..."
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative border-t border-border/40">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-xl">
              <p className="text-xs uppercase tracking-[0.2em] text-mint">Six engines, one platform</p>
              <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">
                Everything between curiosity and the result sheet.
              </h2>
            </div>
            <p className="max-w-md text-muted-foreground">
              Most apps stop at content. StudyBuddy AI teaches, makes you practice, evaluates your subjective answers and
              re-plans your week — automatically.
            </p>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Compass, title: "AI Roadmap", desc: "A 2–4 year plan built from your class, stream and goals — broken into daily blocks." , accent: "mint"},
              { icon: BrainCircuit, title: "Adaptive Teaching", desc: "Beginners get depth. Advanced learners get speed. Same syllabus, different pace." , accent: "violet"},
              { icon: ScanText, title: "Subjective Eval", desc: "Upload your hand-written answer. OCR + AI grade it like a real board examiner." , accent: "amber"},
              { icon: GraduationCap, title: "MCQ + DPP + Mocks", desc: "Diagnostics, daily practice problems and weekly full-length mock tests." , accent: "coral"},
              { icon: MessageSquare, title: "Doubt Solver", desc: "Real-time Q&A grounded in your textbooks via a RAG pipeline." , accent: "mint"},
              { icon: LineChart, title: "Performance OS", desc: "Weak topics, mastery curves and predicted scores — updated after every session." , accent: "violet"},
            ].map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className="group relative overflow-hidden rounded-3xl border border-border/60 bg-surface p-6 transition-colors hover:bg-surface-elevated"
              >
                <div
                  className={`grid h-11 w-11 place-items-center rounded-2xl ${
                    f.accent === "mint" ? "bg-mint/15 text-mint" : f.accent === "violet" ? "bg-violet/15 text-violet" : f.accent === "amber" ? "bg-amber/15 text-amber" : "bg-coral/15 text-coral"
                  }`}
                >
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-display text-xl font-medium">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Accessibility */}
      <section id="access" className="relative border-t border-border/40 bg-surface/30">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-24 lg:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-violet">Built inclusive — by default</p>
            <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">
              Education that adapts to <em className="not-italic text-gradient-mint">every learner</em>.
            </h2>
            <p className="mt-5 max-w-lg text-muted-foreground">
              Real-time subtitles for every lecture, screen-reader optimised flows, and a fully text-based interaction
              mode. Accessibility isn't a toggle — it's the foundation.
            </p>
            <Link
              to="/onboarding"
              className="mt-8 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-medium hover:bg-surface-elevated"
            >
              Personalise my experience <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: Eye, title: "Visually impaired", desc: "Text-to-speech for every lecture, note and feedback line.", color: "mint" },
              { icon: Mic, title: "Hearing impaired", desc: "Real-time, accurate subtitles. Fully text-based learning mode.", color: "violet" },
              { icon: MessageSquare, title: "Speech impaired", desc: "Type-first chat interface for doubts, evals and tests.", color: "amber" },
              { icon: ShieldCheck, title: "Privacy-first", desc: "Your work, your answers, your data — encrypted end-to-end.", color: "coral" },
            ].map((c) => (
              <div key={c.title} className="rounded-3xl border border-border/60 bg-surface p-6">
                <div
                  className={`grid h-10 w-10 place-items-center rounded-2xl ${
                    c.color === "mint" ? "bg-mint/15 text-mint" : c.color === "violet" ? "bg-violet/15 text-violet" : c.color === "amber" ? "bg-amber/15 text-amber" : "bg-coral/15 text-coral"
                  }`}
                >
                  <c.icon className="h-5 w-5" />
                </div>
                <p className="mt-4 font-display text-lg">{c.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Exams strip */}
      <section id="exams" className="border-t border-border/40">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <p className="text-xs uppercase tracking-[0.2em] text-amber">Stream-aware exam mapping</p>
          <h2 className="mt-3 max-w-3xl font-display text-4xl font-semibold tracking-tight md:text-5xl">
            One platform, every path — Science, Commerce, Arts.
          </h2>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              { stream: "Science", color: "mint", exams: ["JEE", "NEET", "NEST", "NDA", "CUET", "Boards"] },
              { stream: "Commerce", color: "violet", exams: ["CAT", "IPMAT", "CA", "CS", "SSC", "Banking"] },
              { stream: "Arts", color: "amber", exams: ["UPSC", "CLAT", "SSC-CGL", "State PCS", "CUET", "Boards"] },
            ].map((s) => (
              <div key={s.stream} className="rounded-3xl border border-border/60 bg-surface p-6">
                <div className="flex items-center justify-between">
                  <p className="font-display text-2xl">{s.stream}</p>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      s.color === "mint" ? "bg-mint" : s.color === "violet" ? "bg-violet" : "bg-amber"
                    }`}
                  />
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {s.exams.map((e) => (
                    <span key={e} className="rounded-full border border-border bg-background/50 px-3 py-1 text-xs text-muted-foreground">
                      {e}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="how" className="relative overflow-hidden border-t border-border/40">
        <div className="absolute inset-0 gradient-aurora opacity-70" />
        <div className="relative mx-auto max-w-5xl px-6 py-24 text-center">
          <h2 className="font-display text-4xl font-semibold tracking-tight md:text-6xl text-balance">
            Stop juggling 7 apps. <span className="text-gradient-mint">Start one ecosystem.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-muted-foreground">
            Onboard in 90 seconds. Get your roadmap, first lecture and a diagnostic test today.
          </p>
          <Link
            to="/onboarding"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 font-medium text-primary-foreground ring-glow transition-transform hover:-translate-y-0.5"
          >
            Get my plan <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border/40">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-6 py-10 md:flex-row md:items-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            © {new Date().getFullYear()} StudyBuddy. Built for every learner.
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground">Privacy</a>
            <a href="#" className="hover:text-foreground">Terms</a>
            <a href="#" className="hover:text-foreground">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
