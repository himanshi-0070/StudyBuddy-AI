
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send,
  Sparkles,
  Volume2,
  Bot,
  User,
  Loader2,
  BookOpen,
  ChevronDown,
} from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { useAuth } from "@/context/AuthContext";
import { db, functions } from "@/firebase";

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { httpsCallable } from "firebase/functions";

// --------------------------------------------------
// ROUTE + AGENT QUERY
// --------------------------------------------------

export const Route = createFileRoute("/doubtsolver")({
  validateSearch: (search: Record<string, unknown>) => ({
    buddyQuery:
      typeof search.buddyQuery === "string"
        ? search.buddyQuery
        : undefined,
  }),
  component: DoubtSolver,
});

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type DebugChunk = {
  docId: string;
  text: string;
  subject: string;
  chunkIndex: number | null;
  fileName: string;
};

type Msg = {
  id: number;
  from: "user" | "ai";
  text: string;
  steps?: string[];
  voice?: boolean;
  debugChunks?: DebugChunk[];
};

const SUGGESTED = [
  "Explain Newton's second law with a real example",
  "How does photosynthesis work? Step-by-step",
  "Solve: ∫ x·sin(x) dx",
  "Why is the sky blue?",
];

// --------------------------------------------------
// FIREBASE FUNCTION
// --------------------------------------------------

const solveDoubtFn = httpsCallable<
  {
    question: string;
    subject: string | null;
    class: string | null;
    history: Array<{ from: string; text: string }>;
  },
  {
    answer: string;
    steps: string[];
    chunksUsed: number;
    debugChunks: DebugChunk[];
    vectorSearchError?: string;
  }
>(functions, "solve_doubt");

// --------------------------------------------------
// COMPONENT
// --------------------------------------------------

function DoubtSolver() {
  const { buddyQuery } = Route.useSearch();

  const { user } = useAuth();

  const firstName =
    user?.displayName?.split(" ")[0] || "Student";

  const initialMessage: Msg = {
    id: 0,
    from: "ai",
    text: `Hi ${firstName}! I'm your AI tutor. Ask me anything — in voice or text — and I'll explain it simply, then work through it step by step.`,
  };

  // --------------------------------------------------
  // STATES
  // --------------------------------------------------

  const [input, setInput] = useState("");

  const [messages, setMessages] = useState<Msg[]>([
    initialMessage,
  ]);

  const [selectedSubjectId, setSelectedSubjectId] =
    useState<string | null>(null);

  const [thinking, setThinking] = useState(false);

  const [subjects, setSubjects] = useState<
    { id: string; name: string }[]
  >([]);

  const [userClass, setUserClass] =
    useState<string | null>(null);

  const [historyLoaded, setHistoryLoaded] =
    useState(false);

  // --------------------------------------------------
  // REFS
  // --------------------------------------------------

  const bottomRef = useRef<HTMLDivElement>(null);

  // Prevent duplicate Firebase submissions
  const askingRef = useRef(false);

  // Track which agent query was already submitted
  const autoSubmittedRef = useRef<string | null>(null);

  // Keep latest chat available to asynchronous callbacks
  const messagesRef = useRef<Msg[]>(messages);

  // Track the currently loaded Firestore thread
  const loadedThreadRef = useRef<string | null>(null);

  // --------------------------------------------------
  // HELPERS
  // --------------------------------------------------

  const subjectKey = selectedSubjectId || "all";

  const threadId = user
    ? `${user.uid}_${subjectKey}`
    : null;

  const getChatDocRef = () => {
    return doc(
      db,
      "doubt_solver_chat",
      `${user?.uid ?? "guest"}_${subjectKey}`,
    );
  };

  const getSelectedSubjectName = (): string | null => {
    if (!selectedSubjectId) return null;

    const subject = subjects.find(
      (s) => s.id === selectedSubjectId,
    );

    return subject?.name ?? null;
  };

  const updateMessages = (nextMessages: Msg[]) => {
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
  };

  // --------------------------------------------------
  // SAVE CHAT HISTORY
  // --------------------------------------------------

  const persistChat = async (
    messagesToSave: Msg[],
  ) => {
    if (!user) return;

    const docRef = getChatDocRef();

    try {
      await setDoc(
        docRef,
        {
          userId: user.uid,
          userEmail: user.email || "",
          subjectId: subjectKey,

          messages: messagesToSave.map((m) => ({
            id: m.id,
            from: m.from,
            text: m.text,
            steps: m.steps ?? [],
            voice: m.voice ?? false,
            debugChunks: m.debugChunks ?? [],
            email:
              m.from === "user"
                ? user.email || null
                : null,
          })),

          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err) {
      console.error(
        "Failed to save doubt solver chat history",
        err,
      );
    }
  };

  // --------------------------------------------------
  // LOAD FIRESTORE CHAT HISTORY
  // --------------------------------------------------

  useEffect(() => {
    if (!user || !threadId) {
      loadedThreadRef.current = null;
      setHistoryLoaded(false);
      return;
    }

    loadedThreadRef.current = null;
    setHistoryLoaded(false);

    const docRef = doc(
      db,
      "doubt_solver_chat",
      threadId,
    );

    const welcomeMessage: Msg[] = [
      {
        id: 0,
        from: "ai",
        text: `Hi ${firstName}! I'm your AI tutor. Ask me anything — in voice or text — and I'll explain it simply, then work through it step by step.`,
      },
    ];

    let active = true;

    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (!active) return;

        // Avoid overwriting an in-progress answer.
        if (!askingRef.current) {
          if (docSnap.exists()) {
            const data = docSnap.data();

            if (
              Array.isArray(data.messages) &&
              data.messages.length > 0
            ) {
              updateMessages(data.messages as Msg[]);
            } else {
              updateMessages(welcomeMessage);
            }
          } else {
            updateMessages(welcomeMessage);

            void setDoc(
              docRef,
              {
                userId: user.uid,
                userEmail: user.email || "",
                subjectId: subjectKey,
                messages: welcomeMessage,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            ).catch((err) => {
              console.error(
                "Failed to create initial chat thread",
                err,
              );
            });
          }
        }

        loadedThreadRef.current = threadId;
        setHistoryLoaded(true);
      },
      (err) => {
        console.error(
          "Failed to load doubt solver history",
          err,
        );
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [user, firstName, threadId]);

  // --------------------------------------------------
  // FETCH USER CLASS
  // --------------------------------------------------

  useEffect(() => {
    if (!user) {
      setUserClass(null);
      return;
    }

    let active = true;

    setUserClass(null);

    getDoc(doc(db, "user_plan", user.uid))
      .then((snap) => {
        if (!active) return;

        if (snap.exists()) {
          setUserClass(
            (snap.data().class as string) || null,
          );
        }
      })
      .catch((err) => {
        console.error(
          "Failed to fetch user class",
          err,
        );
      });

    return () => {
      active = false;
    };
  }, [user]);

  // --------------------------------------------------
  // LOAD SUBJECTS
  // --------------------------------------------------

  useEffect(() => {
    const subjectsQuery = query(
      collection(db, "subjects"),
      orderBy("name"),
    );

    return onSnapshot(subjectsQuery, (snap) => {
      setSubjects(
        snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name as string,
        })),
      );
    });
  }, []);

  // --------------------------------------------------
  // AUTO SCROLL
  // --------------------------------------------------

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, thinking]);

  // --------------------------------------------------
  // ASK DOUBT
  // Existing Firebase + RAG functionality
  // --------------------------------------------------

  const ask = async (
    prompt: string,
    voice = false,
  ) => {
    const question = prompt.trim();

    if (!question || askingRef.current) return;

    askingRef.current = true;

    const userMessage: Msg = {
      id: Date.now(),
      from: "user",
      text: question,
      voice,
    };

    const snapshot = messagesRef.current;

    const userMessages = [
      ...snapshot,
      userMessage,
    ];

    updateMessages(userMessages);

    setInput("");
    setThinking(true);

    try {
      const result = await solveDoubtFn({
        question,
        subject: getSelectedSubjectName(),
        class: userClass,
        history: snapshot.map((m) => ({
          from: m.from,
          text: m.text,
        })),
      });

      console.log(
        "[solve_doubt] chunksUsed:",
        result.data.chunksUsed,
        "vectorSearchError:",
        result.data.vectorSearchError ?? "(none)",
        "debugChunks:",
        result.data.debugChunks,
      );

      const aiMessage: Msg = {
        id: Date.now() + 1,
        from: "ai",
        text: result.data.answer,
        steps: result.data.steps,
        debugChunks: result.data.debugChunks ?? [],
      };

      const updatedMessages = [
        ...userMessages,
        aiMessage,
      ];

      updateMessages(updatedMessages);

      await persistChat(updatedMessages);

    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";

      const errorMessage: Msg = {
        id: Date.now() + 1,
        from: "ai",
        text: `Sorry, I couldn't answer that. ${msg}`,
      };

      const updatedMessages = [
        ...userMessages,
        errorMessage,
      ];

      updateMessages(updatedMessages);

      await persistChat(updatedMessages);

    } finally {
      askingRef.current = false;
      setThinking(false);
    }
  };

  // --------------------------------------------------
  // AGENT AUTO-SUBMIT
  //
  // Buddy chatbot navigates to:
  // /doubtsolver?buddyQuery=Explain+normalization
  //
  // This effect automatically invokes existing ask().
  // --------------------------------------------------

  useEffect(() => {
    const question = buddyQuery?.trim();

    if (!question) return;

    // Wait until user and chat history are ready.
    if (!user || !historyLoaded) return;

    if (loadedThreadRef.current !== threadId) return;

    // Avoid duplicate execution during re-renders/StrictMode.
    const requestKey = `${threadId}:${question}`;

    if (autoSubmittedRef.current === requestKey) {
      return;
    }

    if (askingRef.current) return;

    autoSubmittedRef.current = requestKey;

    console.log(
      "[Buddy Agent] Auto-submitting doubt:",
      question,
    );

    setInput(question);

    // Reuse the original Firebase doubt-solving function.
    void ask(question);

  }, [
    buddyQuery,
    historyLoaded,
    user,
    threadId,
  ]);

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8 md:grid-cols-[1fr_280px]">

        <section className="flex flex-col">

          {/* HEADER */}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-mint">
                AI Voice Doubt Solver
              </p>

              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight md:text-4xl">
                Ask anything. Get instant answers.
              </h1>
            </div>

            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs">
              <span className="h-2 w-2 rounded-full bg-mint" />
              Tutor online
            </span>
          </div>

          {/* SUBJECT SELECTOR */}

          <div className="mt-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              Subject
            </p>

            {subjects.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No subjects available.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">

                <button
                  onClick={() => setSelectedSubjectId(null)}
                  disabled={thinking}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    selectedSubjectId === null
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface hover:border-primary"
                  }`}
                >
                  All subjects
                </button>

                {subjects.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSubjectId(s.id)}
                    disabled={thinking}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      selectedSubjectId === s.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface hover:border-primary"
                    }`}
                  >
                    {s.name}
                  </button>
                ))}

              </div>
            )}
          </div>

          {/* CHAT MESSAGES */}

          <div className="mt-6 flex-1 space-y-4 rounded-3xl border border-border bg-surface p-5">

            <AnimatePresence initial={false}>

              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${
                    m.from === "user"
                      ? "justify-end"
                      : ""
                  }`}
                >

                  {m.from === "ai" && (
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-mint">
                      <Bot className="h-4 w-4 text-ink" />
                    </div>
                  )}

                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                      m.from === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface-elevated"
                    }`}
                  >

                    {m.voice && (
                      <p className="mb-1 flex items-center gap-1 text-xs opacity-70">
                        <Volume2 className="h-3 w-3" />
                        Voice input
                      </p>
                    )}

                    {m.from === "ai" ? (
                      <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-p:my-1 prose-p:text-foreground prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1 prose-headings:text-foreground prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-li:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:text-foreground prose-pre:bg-muted prose-pre:rounded-xl prose-pre:p-3 prose-pre:overflow-x-auto prose-blockquote:border-l-primary prose-strong:font-semibold prose-strong:text-foreground prose-a:text-primary">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {m.text}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="leading-relaxed">
                        {m.text}
                      </p>
                    )}

                    {/* SOLUTION STEPS */}

                    {m.steps && (
                      <ol className="mt-3 space-y-2 border-l-2 border-primary/40 pl-4">
                        {m.steps.map((s, i) => (
                          <li
                            key={i}
                            className="text-sm"
                          >
                            <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                              {i + 1}
                            </span>
                            {s}
                          </li>
                        ))}
                      </ol>
                    )}

                    {/* RAG DEBUG CHUNKS */}

                    {m.debugChunks &&
                      m.debugChunks.length > 0 && (

                      <details className="mt-3 rounded-xl border border-border/60 bg-background/50 text-xs">

                        <summary className="flex cursor-pointer select-none items-center gap-1.5 px-3 py-2 font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                          <ChevronDown className="h-3.5 w-3.5" />

                          Debug · {m.debugChunks.length} chunk
                          {m.debugChunks.length !== 1 ? "s" : ""} retrieved
                        </summary>

                        <ol className="divide-y divide-border/40">

                          {m.debugChunks.map((c, i) => (
                            <li
                              key={c.docId}
                              className="space-y-0.5 px-3 py-2"
                            >
                              <p className="font-semibold text-foreground/80">
                                #{i + 1}

                                {c.fileName
                                  ? ` · ${c.fileName}`
                                  : ""}

                                {c.subject
                                  ? ` · ${c.subject}`
                                  : ""}

                                {c.chunkIndex != null
                                  ? ` · chunk ${c.chunkIndex}`
                                  : ""}
                              </p>

                              <p className="line-clamp-3 leading-relaxed text-muted-foreground">
                                {c.text}
                              </p>
                            </li>
                          ))}

                        </ol>
                      </details>
                    )}

                  </div>

                  {m.from === "user" && (
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted">
                      <User className="h-4 w-4" />
                    </div>
                  )}

                </motion.div>
              ))}

            </AnimatePresence>

            {/* THINKING INDICATOR */}

            {thinking && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="grid h-9 w-9 place-items-center rounded-xl gradient-mint">
                  <Bot className="h-4 w-4 text-ink" />
                </div>

                <Loader2 className="h-4 w-4 animate-spin" />

                Thinking through your doubt…
              </div>
            )}

            <div ref={bottomRef} />

          </div>

          {/* COMPOSER */}

          <div className="mt-4 flex items-center gap-3 rounded-full border border-border bg-surface p-2 pl-5">

            <input
              id="doubt-input"
              name="doubt-input"
              autoComplete="off"
              value={input}
              onChange={(e) =>
                setInput(e.target.value)
              }
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  input.trim() &&
                  !thinking
                ) {
                  void ask(input.trim());
                }
              }}
              placeholder="Type your doubt…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />

            <button
              onClick={() => {
                if (input.trim()) {
                  void ask(input.trim());
                }
              }}
              disabled={!input.trim() || thinking}
              className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>

          </div>

        </section>

        {/* SIDEBAR */}

        <aside className="space-y-5">

          <div className="rounded-3xl border border-border bg-surface p-5">

            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-mint" />
              Try asking
            </p>

            <div className="mt-3 space-y-2">

              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => void ask(s)}
                  disabled={thinking}
                  className="w-full rounded-2xl border border-border bg-surface-elevated px-3 py-2 text-left text-sm hover:border-primary disabled:opacity-50"
                >
                  {s}
                </button>
              ))}

            </div>
          </div>

          <div className="rounded-3xl border border-border bg-surface p-5 text-sm">

            <p className="font-display text-lg">
              How it works
            </p>

            <ul className="mt-3 space-y-2 text-muted-foreground">
              <li>🎤 Ask by voice or text</li>
              <li>🧠 Get a simple plain-language answer</li>
              <li>🪜 Then a step-by-step breakdown</li>
              <li>🔁 Ask follow-ups — tutor remembers context</li>
            </ul>

          </div>

        </aside>

      </main>
    </div>
  );
}
