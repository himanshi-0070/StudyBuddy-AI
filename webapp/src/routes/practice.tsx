import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Timer, Loader2, AlertTriangle, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { httpsCallable } from "firebase/functions";
import { functions, db, auth } from "@/firebase";
import { collection, query, getDocs, where, orderBy, limit, doc, setDoc, serverTimestamp } from "firebase/firestore";

export const Route = createFileRoute("/practice")({
  component: Practice,
});

type Subject = {
  id: string;
  name: string;
  class: string;
};

type MCQQuestion = {
  id: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  topic: string;
  explanation: string;
  isRetry?: boolean;
};

const OPTION_LABELS = ["A", "B", "C", "D"] as const;

function Practice() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [questions, setQuestions] = useState<MCQQuestion[]>([]);
  const [level, setLevel] = useState<string>("");
  const [explanation, setExplanation] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(true);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // selectedAnswers: map of question index → chosen option index
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const activeSubject = subjects.find((s) => s.name === selectedSubject) ?? null;

  // Fetch available subjects (+ class) from the syllabus collection
  useEffect(() => {
    const fetchSubjects = async () => {
      setIsLoadingSubjects(true);
      try {
        const snap = await getDocs(collection(db, "syllabus"));
        const subjectList: Subject[] = [];
        const seen = new Set<string>();
        snap.docs.forEach((doc) => {
          const data = doc.data();
          const name = (data.subject || "").trim();
          const cls = (data.class || "").trim();
          if (name && !seen.has(name)) {
            seen.add(name);
            subjectList.push({ id: name.toLowerCase().replace(/\s+/g, "_"), name, class: cls });
          }
        });
        // Fallback: if no syllabus, load from study_material
        if (subjectList.length === 0) {
          const smSnap = await getDocs(collection(db, "study_material"));
          smSnap.docs.forEach((doc) => {
            const data = doc.data();
            const name = (data.subject || "").trim();
            if (name && !seen.has(name)) {
              seen.add(name);
              subjectList.push({ id: name.toLowerCase().replace(/\s+/g, "_"), name, class: "" });
            }
          });
        }
        subjectList.sort((a, b) => a.name.localeCompare(b.name));
        setSubjects(subjectList);
        if (subjectList.length > 0) {
          setSelectedSubject(subjectList[0].name);
        }
      } catch (err) {
        console.error("Failed to fetch subjects:", err);
        setError("Failed to load available subjects.");
      } finally {
        setIsLoadingSubjects(false);
      }
    };
    fetchSubjects();
  }, []);

  // Load existing questions from Firestore when subject changes,
  // excluding questions the user has already answered correctly
  useEffect(() => {
    if (!activeSubject) return;
    const loadExisting = async () => {
      setIsLoadingExisting(true);
      setQuestions([]);
      setLevel("");
      setExplanation("");
      setSelectedAnswers({});
      setSubmitted(false);
      try {
        const uid = auth.currentUser?.uid;

        // 1. Fetch IDs of questions this user already answered correctly
        const correctIds = new Set<string>();
        if (uid) {
          const solvedConstraints: Parameters<typeof query>[1][] = [
            where("uid", "==", uid),
            where("subject", "==", activeSubject.name),
            where("isCorrect", "==", true),
          ];
          if (activeSubject.class) {
            solvedConstraints.push(where("class", "==", activeSubject.class));
          }
          const solvedSnap = await getDocs(
            query(collection(db, "solved_practice_questions"), ...solvedConstraints)
          );
          solvedSnap.docs.forEach((d) => {
            const qid = d.data().questionId as string;
            if (qid) correctIds.add(qid);
          });
        }

        // 2. Fetch recent practice questions (fetch extra to account for filtering)
        const fetchLimit = 10 + correctIds.size + 5;
        const pqConstraints: Parameters<typeof query>[1][] = [
          where("subject", "==", activeSubject.name),
        ];
        if (activeSubject.class) {
          pqConstraints.push(where("class", "==", activeSubject.class));
        }
        pqConstraints.push(orderBy("generatedAt", "desc"), limit(fetchLimit));
        const snap = await getDocs(query(collection(db, "practice_questions"), ...pqConstraints));

        // 3. Filter out correctly answered questions, keep up to 10
        const loaded: MCQQuestion[] = snap.docs
          .filter((d) => !correctIds.has(d.id))
          .slice(0, 10)
          .map((d) => ({
            id: d.id,
            question: d.data().question,
            options: d.data().options,
            correctIndex: d.data().correctIndex,
            topic: d.data().topic,
            explanation: d.data().explanation ?? "",
          }));

        if (loaded.length > 0) {
          setQuestions(loaded);
          setLevel(snap.docs[0].data().level ?? "");
        }
      } catch (err) {
        console.error("Failed to load existing questions:", err);
      } finally {
        setIsLoadingExisting(false);
      }
    };
    loadExisting();
  }, [activeSubject?.name, activeSubject?.class]);

  const hasQuestions = questions.length > 0;

  const score = useMemo(() => {
    if (!submitted) return null;
    return questions.reduce((acc, q, i) => acc + (selectedAnswers[i] === q.correctIndex ? 1 : 0), 0);
  }, [submitted, questions, selectedAnswers]);

  const topicBreakdown = useMemo(() => {
    if (!submitted) return [];
    const map = new Map<string, { correct: number; total: number }>();
    questions.forEach((q, i) => {
      const entry = map.get(q.topic) ?? { correct: 0, total: 0 };
      entry.total += 1;
      if (selectedAnswers[i] === q.correctIndex) entry.correct += 1;
      map.set(q.topic, entry);
    });
    return Array.from(map.entries()).map(([topic, s]) => ({ topic, ...s }));
  }, [submitted, questions, selectedAnswers]);

  const generateDpp = async () => {
    if (!selectedSubject) {
      setError("Please select a subject first.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setQuestions([]);
    setLevel("");
    setExplanation("");
    setSelectedAnswers({});
    setSubmitted(false);

    try {
      const generateDppFn = httpsCallable<
        { subject: string; class?: string },
        { questions: MCQQuestion[]; level: string; explanation: string; chunksUsed: number }
      >(functions, "generate_dpp");
      const result = await generateDppFn({
        subject: selectedSubject,
        ...(activeSubject?.class ? { class: activeSubject.class } : {}),
      });
      const data = result.data;
      const generatedQuestions = Array.isArray(data.questions) ? data.questions : [];

      // Filter out questions the user already answered correctly
      const uid = auth.currentUser?.uid;
      let correctIds = new Set<string>();
      if (uid) {
        const solvedConstraints: Parameters<typeof query>[1][] = [
          where("uid", "==", uid),
          where("subject", "==", selectedSubject),
          where("isCorrect", "==", true),
        ];
        if (activeSubject?.class) solvedConstraints.push(where("class", "==", activeSubject.class));
        const solvedSnap = await getDocs(
          query(collection(db, "solved_practice_questions"), ...solvedConstraints)
        );
        solvedSnap.docs.forEach((d) => {
          const qid = d.data().questionId as string;
          if (qid) correctIds.add(qid);
        });
      }
      const filtered = generatedQuestions.filter((q) => !correctIds.has(q.id)).slice(0, 10);
      setQuestions(filtered as MCQQuestion[]);
      setLevel(data.level ?? "Unknown");
      setExplanation(data.explanation ?? "");

      if (filtered.length === 0) {
        setError("No questions could be generated. Please ensure study material and syllabus are uploaded for this subject.");
      }
    } catch (err: any) {
      console.error("generate_dpp failed", err);
      const errorMsg = err?.message || err?.toString() || "Unknown error";
      setError(`Failed to generate questions: ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!allAnswered || submitted) return;
    setSubmitted(true);
    setIsSaving(true);
    const uid = auth.currentUser?.uid;
    if (!uid) { setIsSaving(false); return; }
    try {
      await Promise.all(
        questions.map((q, i) => {
          const isCorrect = selectedAnswers[i] === q.correctIndex;
          return setDoc(doc(db, "solved_practice_questions", `${uid}_${q.id}`), {
            uid,
            questionId: q.id,
            subject: activeSubject?.name ?? "",
            class: activeSubject?.class ?? "",
            topic: q.topic,
            chosenIndex: selectedAnswers[i],
            correctIndex: q.correctIndex,
            isCorrect,
            attemptedAt: serverTimestamp(),
          });
        })
      );
    } catch (err) {
      console.error("Failed to save submitted answers:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const selectAnswer = (questionIndex: number, optionIndex: number) => {
    if (submitted) return;
    setSelectedAnswers((prev) => ({ ...prev, [questionIndex]: optionIndex }));
  };

  const allAnswered = questions.length > 0 && Object.keys(selectedAnswers).length === questions.length;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-violet">Practice Problem</p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Subject practice</h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5">
              <Timer className="h-3.5 w-3.5 text-amber" /> 10 MCQs · 10 marks
            </span>
            <span className="rounded-full border border-border bg-surface px-3 py-1.5">
              {selectedSubject || "No subject"}
              {activeSubject?.class ? ` · Class ${activeSubject.class}` : ""}
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_1.3fr]">
          {/* Subject selector */}
          <div className="rounded-3xl border border-border bg-surface p-5">
            <label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Select subject
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {isLoadingSubjects ? (
                <p className="text-xs text-muted-foreground">Loading subjects...</p>
              ) : subjects.length > 0 ? (
                subjects.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSubject(s.name)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      selectedSubject === s.name
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface hover:bg-surface-elevated"
                    }`}
                  >
                    {s.name}{s.class ? ` · ${s.class}` : ""}
                  </button>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No subjects available. Admin must upload study material first.</p>
              )}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              MCQ questions are generated from the subject syllabus and uploaded study material.
            </p>
          </div>

          {/* Generate panel */}
          <div className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Practice set</p>
                <p className="mt-1 text-sm text-foreground/80">10 MCQs across different syllabus topics, 4 options each.</p>
              </div>
              <button
                onClick={generateDpp}
                disabled={isLoading || !selectedSubject || isLoadingSubjects}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate questions"}
              </button>
            </div>

            {error && (
              <div className="mt-5 rounded-3xl border border-coral/30 bg-coral/10 p-4 text-sm text-coral">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{error}</span>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="mt-6 rounded-3xl border border-border/60 bg-background/75 p-6 text-center text-sm text-muted-foreground">
                Generating your MCQ questions from the syllabus. This may take a few seconds…
              </div>
            ) : isLoadingExisting ? (
              <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading existing questions…
              </div>
            ) : hasQuestions ? (
              <div className="mt-4 space-y-2">
                <div className="rounded-2xl border border-border bg-background/50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Predicted level</p>
                  <p className="mt-1 text-lg font-semibold">{level || "Unknown"}</p>
                  {explanation ? <p className="mt-1 text-xs text-foreground/70">{explanation}</p> : null}
                </div>
                {submitted && score !== null && (
                  <div className="rounded-2xl border border-border bg-background/50 p-4 space-y-3">
                    <div className="text-center">
                      <p className="text-3xl font-bold">{score} / {questions.length}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {score === questions.length
                          ? "Perfect score! Outstanding work."
                          : score >= Math.ceil(questions.length * 0.7)
                          ? "Great job! Keep it up."
                          : score >= Math.ceil(questions.length * 0.4)
                          ? "Good effort. Review your weak topics."
                          : "Keep practising — focus on the topics below."}
                      </p>
                    </div>
                    {topicBreakdown.length > 0 && (
                      <div className="space-y-1.5 border-t border-border pt-3">
                        <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Topic breakdown</p>
                        {topicBreakdown.map(({ topic, correct, total }) => (
                          <div key={topic} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate text-foreground/80">{topic}</span>
                            <span className={correct === total ? "font-medium text-green-600 dark:text-green-400" : correct === 0 ? "font-medium text-red-500" : "font-medium text-amber-500"}>
                              {correct}/{total}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {questions.some((q, i) => selectedAnswers[i] !== q.correctIndex) && (
                      <p className="text-xs text-muted-foreground border-t border-border pt-2">
                        Incorrect questions will be included in your next practice set.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-6 rounded-3xl border border-border/60 bg-background/75 p-6 text-sm text-muted-foreground">
                No questions yet for this subject{activeSubject?.class ? ` (Class ${activeSubject.class})` : ""}. Click Generate to create a new MCQ set.
              </div>
            )}
          </div>
        </div>

        {/* MCQ Questions */}
        {hasQuestions && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 space-y-5"
          >
            {questions.map((q, qi) => {
              const chosen = selectedAnswers[qi];
              return (
                <div key={q.id || qi} className="rounded-3xl border border-border bg-surface p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full bg-violet/10 px-2 py-0.5 text-violet">{q.topic}</span>
                        {q.isRetry && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber/10 px-2 py-0.5 text-amber">
                            <RotateCcw className="h-3 w-3" /> Retry
                          </span>
                        )}
                        <span>Question {qi + 1} of {questions.length}</span>
                        <span>· 1 mark</span>
                      </div>
                      <p className="mt-3 text-sm font-medium leading-6 text-foreground">{q.question}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {q.options.map((opt, oi) => {
                      const isSelected = chosen === oi;
                      const isCorrect = q.correctIndex === oi;
                      let optClass =
                        "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm text-left transition-colors cursor-pointer ";

                      if (!submitted) {
                        optClass += isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background hover:bg-surface-elevated";
                      } else {
                        if (isCorrect) {
                          optClass += "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400";
                        } else if (isSelected && !isCorrect) {
                          optClass += "border-red-400/50 bg-red-400/10 text-red-600 dark:text-red-400";
                        } else {
                          optClass += "border-border bg-background/50 text-muted-foreground";
                        }
                      }

                      return (
                        <button
                          key={oi}
                          className={optClass}
                          onClick={() => selectAnswer(qi, oi)}
                          disabled={submitted}
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-semibold">
                            {OPTION_LABELS[oi]}
                          </span>
                          <span className="flex-1">{opt}</span>
                          {submitted && isCorrect && (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                          )}
                          {submitted && isSelected && !isCorrect && (
                            <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {submitted && q.explanation && (
                    <p className="mt-3 rounded-2xl border border-border/60 bg-background/60 px-4 py-2 text-xs text-foreground/70">
                      <span className="font-semibold">Explanation: </span>{q.explanation}
                    </p>
                  )}
                </div>
              );
            })}

            {!submitted && (
              <div className="flex items-center justify-center gap-4 pt-2">
                <button
                  onClick={handleSubmit}
                  disabled={!allAnswered || isSaving}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3 text-sm font-medium text-primary-foreground transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit answers"}
                </button>
                {!allAnswered && (
                  <p className="text-xs text-muted-foreground">
                    Answer all {questions.length} questions to submit.
                  </p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </main>
    </div>
  );
}

