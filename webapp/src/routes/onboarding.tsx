import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Sparkles,
  Eye,
  Ear,
  MessageSquare,
  Languages,
  UploadCloud,
  FileText,
  Mail,
  User,
  GraduationCap,
  BookOpen,
  Target,
} from "lucide-react";
import { STREAM_GOALS, BOARDS, DISABILITIES, ASSESSMENT_QUESTIONS, DEGREE_COURSES, COURSE_BRANCHES } from "@/lib/mock-data";

export const Route = createFileRoute("/onboarding")({
  component: Onboarding,
});

const CLASSES = ["6", "7", "8", "9", "10", "11", "12", "Dropper", "UG", "PG"];
const STREAMS = ["Science", "Commerce", "Arts"] as const;
const LANGUAGES = ["English", "हिन्दी", "தமிழ்", "বাংলা", "मराठी", "తెలుగు"];

const DISABILITY_ICONS: Record<string, typeof Eye> = {
  none: Sparkles,
  blind: Eye,
  deaf: Ear,
  mute: MessageSquare,
};

const STEPS = [
  "Identity",
  "Class",
  "Board",
  "Stream & Exams",
  "Language",
  "Accessibility",
  "Ready",
] as const;

function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // Identity
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (user && step === 0) {
      if (user.displayName) setName(user.displayName);
      if (user.email) setEmail(user.email);
      // Auto skip the name/email step if user logged in via Google
      setStep(1);
    }
  }, [user, step]);

  // Academic
  const [klass, setKlass] = useState<string | null>(null);
  const [course, setCourse] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [board, setBoard] = useState<(typeof BOARDS)[number] | null>(null);
  const [stream, setStream] = useState<(typeof STREAMS)[number] | null>(null);
  const [goals, setGoals] = useState<string[]>([]);

  // Prefs
  const [language, setLanguage] = useState("English");
  const [disability, setDisability] = useState("none");

  const goalsForStream = useMemo(() => (stream ? STREAM_GOALS[stream] : []), [stream]);

  const coursesForLevel = useMemo(() => {
    if (klass === "UG") return DEGREE_COURSES.UG;
    if (klass === "PG") return DEGREE_COURSES.PG;
    return [];
  }, [klass]);

  const branchesForCourse = useMemo(() => {
    if (course && course in COURSE_BRANCHES) {
      return COURSE_BRANCHES[course as keyof typeof COURSE_BRANCHES];
    }
    return [];
  }, [course]);

  // Determine if user is in degree program (UG/PG with course)
  const isDegreeProgram = klass === "UG" || klass === "PG";

  // Dynamic steps based on whether user selected degree program
  const getSteps = () => {
    const baseSteps = ["Identity"];
    
    if (isDegreeProgram) {
      baseSteps.push("Class & Course", "Branch");
    } else {
      baseSteps.push("Class", "Board", "Stream & Exams");
    }
    
    baseSteps.push("Language", "Accessibility", "Ready");
    return baseSteps;
  };

  const currentSteps = getSteps();

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const canNext =
    (step === 0 && name.trim().length > 1 && emailValid) ||
    (step === 1 && !!klass && (!isDegreeProgram || !!course)) ||
    (step === 2 && (isDegreeProgram ? !!branch : !!board)) ||
    (step === 3 && (isDegreeProgram ? !!language : !!stream && goals.length > 0)) ||
    (step === 4 && (isDegreeProgram ? !!disability : !!language)) ||
    (step === 5 && (isDegreeProgram ? true : !!disability)) ||
    step === (isDegreeProgram ? 6 : 7);

  const handleClassChange = (newKlass: string) => {
    setKlass(newKlass);
    // Clear course and branch when level changes
    if ((newKlass === "UG" || newKlass === "PG") !== (klass === "UG" || klass === "PG")) {
      setCourse(null);
      setBranch(null);
    }
  };

  const handleCourseChange = (newCourse: string) => {
    setCourse(newCourse);
    // Clear branch when course changes
    setBranch(null);
  };

  const toggleGoal = (id: string) => {
    setGoals((g) =>
      g.includes(id) ? g.filter((x) => x !== id) : g.length >= 3 ? g : [...g, id],
    );
  };

  const handleComplete = async (dest: string) => {
    try {
      const docId = user ? user.uid : email;
      if (docId) {
        await setDoc(doc(db, "user_plan", docId), {
          uid: user?.uid ?? null,
          name,
          email,
          class: klass,
          course,
          board,
          stream,
          goals,
          language,
          disability,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.error("Failed to save user plan:", e);
    }
    navigate({ to: dest });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 gradient-aurora opacity-60" />
      <div className="absolute inset-0 bg-grid opacity-30" />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          StudyBuddy AI
        </Link>
        <p className="text-sm text-muted-foreground">
          Step {Math.min(step + 1, currentSteps.length)} of {currentSteps.length}
        </p>
      </header>

      <div className="relative z-10 mx-auto max-w-3xl px-6 pb-24">
        <div className="mt-2 flex gap-1.5">
          {currentSteps.map((_, i) => (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full gradient-mint"
                initial={{ width: 0 }}
                animate={{ width: i <= step ? "100%" : "0%" }}
                transition={{ duration: 0.4 }}
              />
            </div>
          ))}
        </div>

        <div className="mt-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
            >
              {step === 0 && (
                <Pane
                  title="Let's get you set up"
                  subtitle="Your name and email become your StudyBuddy login."
                >
                  <div className="grid gap-4">
                    <Field icon={User} label="Full name">
                      <input
                        id="onboarding-name"
                        name="onboarding-name"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Aarav Mehta"
                        className="w-full bg-transparent py-1 text-lg outline-none placeholder:text-muted-foreground/60"
                      />
                    </Field>
                    <Field icon={Mail} label="Email">
                      <input
                        id="onboarding-email"
                        name="onboarding-email"
                        autoComplete="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@school.in"
                        className="w-full bg-transparent py-1 text-lg outline-none placeholder:text-muted-foreground/60"
                      />
                    </Field>
                    {email && !emailValid && (
                      <p className="text-sm text-coral">Please enter a valid email.</p>
                    )}
                  </div>
                </Pane>
              )}

              {step === 1 && (
                <Pane 
                  title={isDegreeProgram ? "Which level and course are you in?" : "Which class are you in?"} 
                  subtitle={isDegreeProgram ? "We'll align your roadmap to your degree program." : "We'll align your roadmap to your current syllabus."}
                >
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {CLASSES.map((c) => (
                      <Pill key={c} active={klass === c} onClick={() => handleClassChange(c)}>
                        {isNaN(Number(c)) ? c : `Class ${c}`}
                      </Pill>
                    ))}
                  </div>
                  
                  {(klass === "UG" || klass === "PG") && (
                    <div className="mt-6">
                      <label className="block text-sm font-medium text-foreground mb-3">
                        Select your course
                      </label>
                      <select
                        value={course || ""}
                        onChange={(e) => handleCourseChange(e.target.value)}
                        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      >
                        <option value="">Choose a course...</option>
                        {coursesForLevel.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label} ({c.category})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </Pane>
              )}

              {step === 2 && isDegreeProgram && (
                <Pane title="What's your specialization?" subtitle="Select your branch or area of focus.">
                  <div className="grid gap-3 md:grid-cols-2">
                    {branchesForCourse.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setBranch(b.id)}
                        className={`rounded-2xl border p-4 text-left transition-all ${
                          branch === b.id
                            ? "border-primary bg-surface ring-glow"
                            : "border-border bg-surface hover:bg-surface-elevated"
                        }`}
                      >
                        <p className="font-display text-lg">{b.label}</p>
                      </button>
                    ))}
                  </div>
                </Pane>
              )}

              {step === 2 && !isDegreeProgram && (
                <Pane title="Which board do you follow?" subtitle="Every concept will match your board's pattern and marking scheme.">
                  <div className="grid gap-4 md:grid-cols-3">
                    {BOARDS.map((b) => (
                      <button
                        key={b}
                        onClick={() => setBoard(b)}
                        className={`relative overflow-hidden rounded-3xl border p-6 text-left transition-all ${
                          board === b
                            ? "border-primary bg-surface ring-glow"
                            : "border-border bg-surface hover:bg-surface-elevated"
                        }`}
                      >
                        <div
                          className={`mb-6 grid h-12 w-12 place-items-center rounded-2xl ${
                            b === "CBSE" ? "gradient-mint" : b === "ICSE" ? "gradient-violet" : "bg-amber"
                          }`}
                        >
                          <BookOpen className="h-5 w-5 text-ink" />
                        </div>
                        <p className="font-display text-xl">{b}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {b === "CBSE" && "NCERT-based, widely followed"}
                          {b === "ICSE" && "Detailed & analytical curriculum"}
                          {b === "State Board" && "Regional language & state syllabus"}
                        </p>
                      </button>
                    ))}
                  </div>
                </Pane>
              )}

              {step === 3 && !isDegreeProgram && (
                <Pane
                  title="Pick your stream & target exams"
                  subtitle={`Select your stream, then up to 3 competitive exams. (${goals.length}/3)`}
                >
                  <div className="mb-6 grid gap-3 md:grid-cols-3">
                    {STREAMS.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setStream(s);
                          setGoals([]);
                        }}
                        className={`rounded-2xl border p-4 text-left transition-all ${
                          stream === s
                            ? "border-primary bg-surface ring-glow"
                            : "border-border bg-surface hover:bg-surface-elevated"
                        }`}
                      >
                        <p className="font-display text-lg">{s}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {s === "Science" && "PCM · PCB · PCMB"}
                          {s === "Commerce" && "Maths · Without Maths"}
                          {s === "Arts" && "Humanities focus"}
                        </p>
                      </button>
                    ))}
                  </div>

                  {stream && (
                    <div className="grid gap-3 md:grid-cols-2">
                      {goalsForStream.map((g) => {
                        const active = goals.includes(g.id);
                        return (
                          <button
                            key={g.id}
                            onClick={() => toggleGoal(g.id)}
                            className={`relative rounded-2xl border p-4 text-left transition-all ${
                              active
                                ? "border-primary bg-surface ring-glow"
                                : "border-border bg-surface hover:bg-surface-elevated"
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-display text-lg">{g.label}</p>
                                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                                  {g.category}
                                </p>
                              </div>
                              <div
                                className={`grid h-6 w-6 place-items-center rounded-full border ${
                                  active
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border"
                                }`}
                              >
                                {active && <Check className="h-3.5 w-3.5" />}
                              </div>
                            </div>
                            <p className="mt-3 text-sm text-muted-foreground">{g.description}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Pane>
              )}

              {step === 3 && isDegreeProgram && (
                <Pane title="Preferred language" subtitle="Lectures, notes and feedback in your language.">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {LANGUAGES.map((l) => (
                      <Pill key={l} active={language === l} onClick={() => setLanguage(l)}>
                        <Languages className="h-4 w-4 opacity-60" />
                        {l}
                      </Pill>
                    ))}
                  </div>
                </Pane>
              )}

              {step === 4 && !isDegreeProgram && (
                <Pane title="Preferred language" subtitle="Lectures, notes and feedback in your language.">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {LANGUAGES.map((l) => (
                      <Pill key={l} active={language === l} onClick={() => setLanguage(l)}>
                        <Languages className="h-4 w-4 opacity-60" />
                        {l}
                      </Pill>
                    ))}
                  </div>
                </Pane>
              )}

              {step === 4 && isDegreeProgram && (
                <Pane
                  title="Accessibility"
                  subtitle="We'll enable subtitles, text-to-speech or text-only mode automatically."
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    {DISABILITIES.map((a) => {
                      const Icon = DISABILITY_ICONS[a.id] ?? Sparkles;
                      const active = disability === a.id;
                      return (
                        <button
                          key={a.id}
                          onClick={() => setDisability(a.id)}
                          className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition-all ${
                            active
                              ? "border-primary bg-surface ring-glow"
                              : "border-border bg-surface hover:bg-surface-elevated"
                          }`}
                        >
                          <div
                            className={`grid h-11 w-11 place-items-center rounded-2xl ${
                              active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                            }`}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <p className="font-medium">{a.label}</p>
                        </button>
                      );
                    })}
                  </div>
                </Pane>
              )}

              {step === 5 && !isDegreeProgram && (
                <Pane
                  title="Accessibility"
                  subtitle="We'll enable subtitles, text-to-speech or text-only mode automatically."
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    {DISABILITIES.map((a) => {
                      const Icon = DISABILITY_ICONS[a.id] ?? Sparkles;
                      const active = disability === a.id;
                      return (
                        <button
                          key={a.id}
                          onClick={() => setDisability(a.id)}
                          className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition-all ${
                            active
                              ? "border-primary bg-surface ring-glow"
                              : "border-border bg-surface hover:bg-surface-elevated"
                          }`}
                        >
                          <div
                            className={`grid h-11 w-11 place-items-center rounded-2xl ${
                              active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                            }`}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <p className="font-medium">{a.label}</p>
                        </button>
                      );
                    })}
                  </div>
                </Pane>
              )}

              {step === 5 && isDegreeProgram && (
                <Pane title="Your plan is ready" subtitle="We've built a personalised roadmap for your degree program.">
                  <div className="rounded-3xl border border-border bg-surface p-8">
                    <div className="grid gap-6 md:grid-cols-2">
                      <Summary label="Name" value={name || "—"} />
                      <Summary label="Email" value={email || "—"} />
                      <Summary label="Level" value={klass ?? "—"} />
                      <Summary label="Course" value={DEGREE_COURSES[klass as "UG" | "PG"]?.find((c) => c.id === course)?.label ?? "—"} />
                      <Summary label="Specialization" value={branchesForCourse.find((b) => b.id === branch)?.label ?? "—"} />
                      <Summary label="Language" value={language} />
                      <Summary
                        label="Accessibility"
                        value={DISABILITIES.find((a) => a.id === disability)?.label ?? "—"}
                      />
                    </div>
                    <div className="mt-8 flex flex-wrap gap-3">
                      <button
                        onClick={() => handleComplete("/dashboard")}
                        className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground ring-glow transition-transform hover:-translate-y-0.5"
                      >
                        Open my dashboard <ArrowRight className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleComplete("/learn")}
                        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-6 py-3 font-medium hover:bg-surface-elevated"
                      >
                        Start first lecture
                      </button>
                    </div>
                  </div>
                </Pane>
              )}

              {step === 6 && !isDegreeProgram && (
                <Pane title="Your plan is ready" subtitle="We've built a personalised 18-month roadmap for you.">
                  <div className="rounded-3xl border border-border bg-surface p-8">
                    <div className="grid gap-6 md:grid-cols-2">
                      <Summary label="Name" value={name || "—"} />
                      <Summary label="Email" value={email || "—"} />
                      <Summary
                        label="Class"
                        value={klass ? (isNaN(Number(klass)) ? klass : `Class ${klass}`) : "—"}
                      />
                      <Summary label="Board" value={board ?? "—"} />
                      <Summary label="Stream" value={stream ?? "—"} />
                      <Summary
                        label="Target exams"
                        value={
                          goals.length
                            ? goalsForStream
                                .filter((g) => goals.includes(g.id))
                                .map((g) => g.label)
                                .join(" · ")
                            : "—"
                        }
                      />
                      <Summary label="Language" value={language} />
                      <Summary
                        label="Accessibility"
                        value={DISABILITIES.find((a) => a.id === disability)?.label ?? "—"}
                      />
                    </div>
                    <div className="mt-8 flex flex-wrap gap-3">
                      <button
                        onClick={() => handleComplete("/dashboard")}
                        className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground ring-glow transition-transform hover:-translate-y-0.5"
                      >
                        Open my dashboard <ArrowRight className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleComplete("/learn")}
                        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-6 py-3 font-medium hover:bg-surface-elevated"
                      >
                        Start first lecture
                      </button>
                    </div>
                  </div>
                </Pane>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {step < currentSteps.length - 1 && (
          <div className="mt-10 flex items-center justify-between">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={() => setStep((s) => Math.min(currentSteps.length - 1, s + 1))}
              disabled={!canNext}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Pane({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
      <p className="mt-2 text-muted-foreground">{subtitle}</p>
      <div className="mt-8">{children}</div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-all ${
        active
          ? "border-primary bg-primary text-primary-foreground ring-glow"
          : "border-border bg-surface text-foreground hover:bg-surface-elevated"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof User;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-3 focus-within:border-primary focus-within:ring-glow">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        {children}
      </div>
      <GraduationCap className="h-4 w-4 text-muted-foreground/30" />
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg">{value}</p>
    </div>
  );
}
