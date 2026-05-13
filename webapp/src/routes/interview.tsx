import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { db } from "@/firebase";
import { collection, doc, getDoc, onSnapshot, orderBy, query } from "firebase/firestore";
import { VoiceCoachAgent } from "@/components/voice-coach-agent";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/interview")({
  component: InterviewMode,
});

type Mode = "idle" | "voice";

function InterviewMode() {
  const { profile, updateProfile, loading: profileLoading } = useAuth();
  const [mode, setMode] = useState<Mode>("idle");
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [userClass, setUserClass] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!profile) return;
    getDoc(doc(db, "user_plan", profile.uid)).then((snap) => {
      if (snap.exists()) setUserClass((snap.data().class as string) || undefined);
    }).catch(() => {});
  }, [profile]);

  useEffect(() => {
    const q = query(collection(db, "subjects"), orderBy("name"));
    return onSnapshot(q, (snap) => {
      setSubjects(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string })));
    });
  }, []);

  const selectedName = subjects.find((s) => s.id === selectedSubject)?.name ?? "";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-violet">Voice Coaching Mode</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            AI-driven voice coaching
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Pick a subject · speak naturally · your AI coach explains concepts step by step using your study material.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {mode === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-3xl border border-border bg-surface p-8"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl gradient-violet">
                  <Sparkles className="h-6 w-6 text-ink" />
                </div>
                <div>
                  <h2 className="font-display text-xl">Choose a subject to start coaching</h2>
                  <p className="text-sm text-muted-foreground">
                    Your AI voice coach will guide you through any concept in your preferred language
                  </p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-4 gap-3 sm:grid-cols-8">
                {subjects.length === 0 && (
                  <p className="col-span-full text-xs text-muted-foreground">No subjects available.</p>
                )}
                {subjects.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSubject(s.id)}
                    title={s.name}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-4 transition-all hover:-translate-y-0.5 ${
                      selectedSubject === s.id
                        ? "border-violet bg-violet/10 ring-1 ring-violet"
                        : "border-border bg-surface-elevated hover:border-violet/40"
                    }`}
                  >
                    <p className="text-center text-xs font-medium leading-tight">{s.name}</p>
                  </button>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border pt-6">
                <p className="text-sm text-muted-foreground">
                  {selectedSubject
                    ? `Ready to coach: ${selectedName}`
                    : "Select a subject above to continue"}
                </p>
                <button
                  onClick={() => setMode("voice")}
                  disabled={!selectedSubject || profileLoading}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground ring-glow transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                >
                  Start session <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}

          {mode === "voice" && selectedSubject && (
            <motion.div
              key="voice"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <VoiceCoachAgent
                subject={selectedSubject}
                subjectName={selectedName}
                userName={profile?.displayName ?? ""}
                coachLanguage={profile?.coachLanguage ?? "English"}
                userClass={userClass}
                onLanguageChanged={(lang) => updateProfile({ coachLanguage: lang })}
                onEnd={() => {
                  setMode("idle");
                  setSelectedSubject(null);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
