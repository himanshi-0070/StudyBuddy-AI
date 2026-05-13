import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, BookOpen, Lightbulb, Sparkles, ExternalLink, Loader2, BrainCircuit, CheckCircle2, XCircle, ChevronRight } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { db, functions } from "@/firebase";
import { collection, onSnapshot, query, orderBy, doc, setDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/learn")({
  component: Learn,
});

type LectureMaterial = {
  id: string;
  title: string;
  subject: string;
  topic: string;
  url: string;
  fileName: string;
  uploadedAt: Date | null;
};

const TRANSCRIPT = [
  { t: "00:12", text: "Coordination compounds are formed when a central metal atom or ion bonds with surrounding molecules called ligands." },
  { t: "00:34", text: "A ligand donates a lone pair to the metal — this is a coordinate bond. Common ligands include H₂O, NH₃, Cl⁻, and CN⁻." },
  { t: "01:02", text: "When a single ligand binds through more than one donor atom, we call it a chelating ligand. EDTA is a classic hexadentate example." },
  { t: "01:34", text: "The denticity tells us how many donor atoms a ligand uses. Mono-, bi-, tri-, hexadentate — and so on." },
];

const CHAPTERS = [
  { name: "What are coordination compounds", time: "00:12", done: true },
  { name: "Werner's theory", time: "03:40", done: true },
  { name: "Ligands & denticity", time: "07:55", active: true },
  { name: "Nomenclature rules", time: "14:22", done: false },
  { name: "Isomerism", time: "21:08", done: false },
];

type McqQuestion = {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  answer: string;
  explanation: string;
};

type QuizState = "idle" | "generating" | "answering" | "submitted";

function Learn() {
  const { profile, user } = useAuth();
  const [lectures, setLectures] = useState<LectureMaterial[]>([]);
  const [selectedLectureId, setSelectedLectureId] = useState<string | null>(null);
  const [loadingLectures, setLoadingLectures] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSavedRef = useRef<number>(0);

  // MCQ quiz state
  const [quizState, setQuizState] = useState<QuizState>("idle");
  const [mcqQuestions, setMcqQuestions] = useState<McqQuestion[]>([]);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [savingResults, setSavingResults] = useState(false);
  
  // Get the current selected lecture from the lectures array (always latest data)
  const selectedLecture = selectedLectureId 
    ? lectures.find(l => l.id === selectedLectureId) ?? null
    : lectures[0] ?? null;
  
  // Load lectures from Firebase in real-time
  useEffect(() => {
    const q = query(collection(db, "lecture_materials"), orderBy("uploadedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const lecturesList: LectureMaterial[] = snap.docs.map((d) => ({
        id: d.id,
        title: d.data().title ?? "",
        subject: d.data().subject ?? "",
        topic: d.data().topic ?? "",
        url: d.data().url ?? "",
        fileName: d.data().fileName ?? "",
        uploadedAt: d.data().uploadedAt?.toDate?.() ?? null,
      }));
      setLectures(lecturesList);
      // Set first lecture as selected if none is selected yet
      if (lecturesList.length > 0 && !selectedLectureId) {
        setSelectedLectureId(lecturesList[0].id);
      }
      setLoadingLectures(false);
    });
    return () => unsub();
  }, [selectedLectureId]);
  
  // Auto-refresh when selected lecture has no URL (video still processing)
  useEffect(() => {
    if (selectedLecture && !selectedLecture.url) {
      const timer = setTimeout(() => {
        setRefreshKey(k => k + 1);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [selectedLecture, refreshKey]);

  // Save progress to Firestore
  const saveProgress = useCallback(async (
    lectureId: string,
    currentTime: number,
    duration: number,
    completed: boolean,
  ) => {
    if (!user || !lectureId || !duration) return;
    const progressPct = Math.round((currentTime / duration) * 100);
    const docId = `${user.uid}_${lectureId}`;
    try {
      await setDoc(
        doc(db, "lecture_progress", docId),
        {
          userId: user.uid,
          lectureId,
          currentTime: Math.floor(currentTime),
          duration: Math.floor(duration),
          progressPct,
          completed,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err) {
      console.error("Failed to save lecture progress", err);
    }
  }, [user]);

  // Throttled timeupdate handler — saves every 10 s of real time
  const handleTimeUpdate = useCallback(() => {
    if (!selectedLecture) return;
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const now = Date.now();
    if (now - lastSavedRef.current < 10_000) return; // 10 s throttle
    lastSavedRef.current = now;
    void saveProgress(selectedLecture.id, video.currentTime, video.duration, false);
  }, [selectedLecture, saveProgress]);

  const handleEnded = useCallback(() => {
    if (!selectedLecture) return;
    const video = videoRef.current;
    if (!video) return;
    void saveProgress(selectedLecture.id, video.duration, video.duration, true);
  }, [selectedLecture, saveProgress]);

  // Reset throttle timer when lecture changes
  useEffect(() => {
    lastSavedRef.current = 0;
    // Reset quiz when lecture changes
    setQuizState("idle");
    setMcqQuestions([]);
    setUserAnswers({});
  }, [selectedLectureId]);

  // Generate MCQ questions
  const generateMcq = useCallback(async () => {
    if (!selectedLecture) return;
    setQuizState("generating");
    setMcqQuestions([]);
    setUserAnswers({});
    try {
      const fn = httpsCallable<
        { lectureId: string; subject: string; topic: string },
        { questions: McqQuestion[]; lectureId: string }
      >(functions, "generate_lecture_mcq");
      const result = await fn({
        lectureId: selectedLecture.id,
        subject: selectedLecture.subject,
        topic: selectedLecture.topic || "",
      });
      setMcqQuestions(result.data.questions);
      setQuizState("answering");
    } catch (err) {
      console.error("Failed to generate MCQ", err);
      setQuizState("idle");
    }
  }, [selectedLecture]);

  // Submit quiz and save results
  const submitQuiz = useCallback(async () => {
    if (!user || !selectedLecture || !mcqQuestions.length) return;
    setSavingResults(true);
    const score = mcqQuestions.reduce(
      (acc, q, i) => acc + (userAnswers[i] === q.answer ? 1 : 0),
      0,
    );
    try {
      await addDoc(collection(db, "lecture_mcq_results"), {
        userId: user.uid,
        lectureId: selectedLecture.id,
        lectureTitle: selectedLecture.title,
        subject: selectedLecture.subject,
        topic: selectedLecture.topic || "",
        score,
        total: mcqQuestions.length,
        answers: userAnswers,
        questions: mcqQuestions.map((q, i) => ({
          question: q.question,
          correct: q.answer,
          chosen: userAnswers[i] ?? null,
          isCorrect: userAnswers[i] === q.answer,
        })),
        submittedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to save MCQ results", err);
    } finally {
      setSavingResults(false);
      setQuizState("submitted");
    }
  }, [user, selectedLecture, mcqQuestions, userAnswers]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-12">
        <div className="lg:col-span-8">
          {loadingLectures ? (
            <div className="flex min-h-[400px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : lectures.length === 0 ? (
            <div className="rounded-3xl border border-border/60 bg-surface p-12 text-center">
              <Sparkles className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
              <h2 className="font-display text-xl font-semibold">No lectures available yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Check back soon! Lectures are being prepared by your instructors.
              </p>
            </div>
          ) : selectedLecture ? (
            <>
              <p className="text-xs uppercase tracking-[0.2em] text-mint">{selectedLecture.subject}</p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-4xl">
                {selectedLecture.title}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Adaptive lecture · with real-time subtitles
                {selectedLecture.uploadedAt ? ` · Uploaded ${selectedLecture.uploadedAt.toLocaleDateString("en-IN")}` : ""}
              </p>

              {/* Video Player */}
              <div className="mt-6 overflow-hidden rounded-3xl border border-border/60 bg-surface">
                <div className="relative aspect-video w-full bg-gradient-to-br from-violet/40 via-ink to-mint/30">
                  <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
                  {!selectedLecture.url ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/40">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-mint" />
                        <div className="text-center">
                          <p className="text-sm font-medium text-white">Processing video...</p>
                          <p className="mt-1 text-xs text-white/70">
                            This typically takes a few minutes depending on video size
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setRefreshKey(k => k + 1)}
                        className="mt-2 rounded-lg bg-primary/20 px-3 py-1.5 text-xs text-primary hover:bg-primary/30 transition-colors"
                      >
                        Check now
                      </button>
                    </div>
                  ) : (
                    <video
                      ref={videoRef}
                      key={selectedLecture.id}
                      src={selectedLecture.url}
                      className="h-full w-full object-contain bg-black"
                      controls
                      controlsList="nodownload"
                      onTimeUpdate={handleTimeUpdate}
                      onEnded={handleEnded}
                    />
                  )}
                </div>
              </div>

              {/* MCQ Quiz Section */}
              <div className="mt-6">
                {quizState === "idle" && (
                  <button
                    onClick={generateMcq}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/5 px-5 py-3 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
                  >
                    <BrainCircuit className="h-4 w-4" />
                    Generate DPP (10 questions)
                  </button>
                )}

                {quizState === "generating" && (
                  <div className="flex items-center justify-center gap-3 rounded-2xl border border-border bg-surface py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Generating quiz questions…
                  </div>
                )}

                {(quizState === "answering" || quizState === "submitted") && mcqQuestions.length > 0 && (
                  <div className="rounded-3xl border border-border bg-surface p-6">
                    <div className="flex items-center justify-between">
                      <p className="font-display text-lg">Practice Quiz</p>
                      {quizState === "submitted" && (
                        <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                          {mcqQuestions.reduce((a, q, i) => a + (userAnswers[i] === q.answer ? 1 : 0), 0)}
                          /{mcqQuestions.length} correct
                        </span>
                      )}
                    </div>

                    <div className="mt-5 space-y-6">
                      {mcqQuestions.map((q, qi) => {
                        const chosen = userAnswers[qi];
                        return (
                          <div key={qi} className="space-y-3">
                            <p className="font-medium text-sm">
                              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{qi + 1}</span>
                              {q.question}
                            </p>
                            <div className="grid gap-2">
                              {(["A", "B", "C", "D"] as const).map((opt) => {
                                const isChosen = chosen === opt;
                                const isAnswer = q.answer === opt;
                                let cls = "flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm cursor-pointer transition-colors ";
                                if (quizState === "submitted") {
                                  if (isAnswer) cls += "border-green-500/60 bg-green-500/10 text-green-700 dark:text-green-400";
                                  else if (isChosen && !isAnswer) cls += "border-red-400/60 bg-red-400/10 text-red-600 dark:text-red-400";
                                  else cls += "border-border bg-surface-elevated text-muted-foreground";
                                } else {
                                  cls += isChosen
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border bg-surface-elevated hover:border-primary/50";
                                }
                                return (
                                  <button
                                    key={opt}
                                    disabled={quizState === "submitted"}
                                    onClick={() => setUserAnswers((prev) => ({ ...prev, [qi]: opt }))}
                                    className={cls}
                                  >
                                    <span className="shrink-0 font-semibold w-5">{opt}</span>
                                    <span>{q.options[opt]}</span>
                                    {quizState === "submitted" && isAnswer && (
                                      <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-green-500" />
                                    )}
                                    {quizState === "submitted" && isChosen && !isAnswer && (
                                      <XCircle className="ml-auto h-4 w-4 shrink-0 text-red-500" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            {quizState === "submitted" && q.explanation && (
                              <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-4 py-2 leading-relaxed">
                                <span className="font-semibold text-foreground">Explanation: </span>
                                {q.explanation}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {quizState === "answering" && (
                      <button
                        onClick={submitQuiz}
                        disabled={Object.keys(userAnswers).length < mcqQuestions.length || savingResults}
                        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground ring-glow disabled:opacity-40"
                      >
                        {savingResults ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                        {savingResults ? "Saving…" : `Submit (${Object.keys(userAnswers).length}/${mcqQuestions.length} answered)`}
                      </button>
                    )}

                    {quizState === "submitted" && (
                      <button
                        onClick={generateMcq}
                        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-primary/40 bg-primary/5 px-5 py-2.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        <BrainCircuit className="h-4 w-4" /> Retake Quiz
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Sidebar */}
        <aside className="space-y-6 lg:col-span-4">
          <div className="rounded-3xl border border-border/60 bg-surface p-6">
            <p className="font-display text-lg">Available Lectures</p>
            {loadingLectures ? (
              <div className="mt-5 flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : lectures.length === 0 ? (
              <p className="mt-5 text-sm text-muted-foreground">No lectures available yet.</p>
            ) : (
              <ul className="mt-4 space-y-2 max-h-[400px] overflow-y-auto pr-2">
                {lectures.map((lecture) => (
                  <li
                    key={lecture.id}
                    onClick={() => setSelectedLectureId(lecture.id)}
                    className={`cursor-pointer flex items-center justify-between rounded-2xl border p-3 text-sm transition-all ${
                      selectedLecture?.id === lecture.id
                        ? "border-primary bg-mint/5"
                        : "border-border/40 bg-background/30 hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          selectedLecture?.id === lecture.id ? "bg-mint animate-pulse" : "bg-muted"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className={`truncate ${selectedLecture?.id === lecture.id ? "font-medium" : "text-muted-foreground"}`}>
                          {lecture.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {lecture.topic || "General"}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selectedLecture && (
            <>
              <div className="rounded-3xl border border-border/60 bg-surface p-6">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber" />
                  <p className="font-display text-lg">Lecture Details</p>
                </div>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <p><span className="text-foreground font-medium">Subject:</span> {selectedLecture.subject}</p>
                  <p><span className="text-foreground font-medium">Topic:</span> {selectedLecture.topic || "General"}</p>
                  {selectedLecture.uploadedAt && (
                    <p><span className="text-foreground font-medium">Uploaded:</span> {selectedLecture.uploadedAt.toLocaleDateString("en-IN")}</p>
                  )}
                  {!selectedLecture.url ? (
                    <div className="mt-3 rounded-2xl border border-amber/40 bg-amber/5 px-3 py-2">
                      <p className="flex items-center gap-2 text-xs text-amber font-medium">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Video is being processed...
                      </p>
                      <p className="mt-1 text-xs text-amber/70">
                        Large videos may take 5-15 minutes. The page will auto-refresh.
                      </p>
                    </div>
                  ) : (
                    <a
                      href={selectedLecture.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex items-center gap-1.5 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open in new tab
                    </a>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-border/60 bg-surface p-6">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-mint" />
                  <p className="font-display text-lg">Tips</p>
                </div>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>• Use the Subtitles button for better comprehension</li>
                  <li>• Adjust difficulty level based on your pace</li>
                  <li>• Take notes while watching</li>
                  <li>• Rewatch sections as needed</li>
                </ul>
              </div>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
