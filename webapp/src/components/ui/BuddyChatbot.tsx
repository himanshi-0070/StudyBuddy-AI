
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Bot,
  X,
  Send,
  Sparkles,
  MessageCircle,
  Minimize2,
  BookOpen,
  Mic,
  BrainCircuit,
} from "lucide-react";

type Message = {
  id: number;
  role: "assistant" | "user";
  content: string;
};

type AgentResponse = {
  reply: string;
  action: "practice" | "doubt_solver" | "talk_with_buddy" | "none";
  query: string;
};

const AGENT_URL =
  import.meta.env.VITE_BUDDY_AGENT_URL ||
  "http://127.0.0.1:8001/agent/chat";

/*
  IMPORTANT:
  Replace these paths with the ACTUAL paths
  registered in your TanStack Router project.
*/
const ROUTES = {
  practice: "/practice",
  doubt_solver: "/doubtsolver",
  talk_with_buddy: "/interview",
} as const;

const suggestions = [
  {
    icon: BookOpen,
    label: "Generate a practice quiz",
    prompt: "Generate a DBMS practice quiz based on my weak topics.",
  },
  {
    icon: BrainCircuit,
    label: "Solve a doubt",
    prompt: "Help me understand deadlock in Operating Systems.",
  },
  {
    icon: Mic,
    label: "Talk with Buddy",
    prompt: "I want to revise DBMS through a conversation.",
  },
];

const initialMessage: Message = {
  id: 1,
  role: "assistant",
  content:
    "Hey! I'm Buddy, your AI study companion. What would you like to learn today?",
};

export default function BuddyChatbot() {
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    initialMessage,
  ]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const sendingRef = useRef(false);

  const navigationTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    }
  }, [messages, loading, open]);

  useEffect(() => {
    return () => {
      if (navigationTimerRef.current) {
        clearTimeout(navigationTimerRef.current);
      }
    };
  }, []);

  async function sendMessage(value: string) {
    const text = value.trim();

    if (!text || sendingRef.current) return;

    sendingRef.current = true;

    if (navigationTimerRef.current) {
      clearTimeout(navigationTimerRef.current);
      navigationTimerRef.current = null;
    }

    // Conversation history before the new user message
    const history = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    setMessages((previous) => [
      ...previous,
      {
        id: Date.now(),
        role: "user",
        content: text,
      },
    ]);

    setInput("");
    setLoading(true);

    try {
      const response = await fetch(AGENT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          history,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();

        console.error("Buddy agent error:", errorBody);

        throw new Error(
          `Agent returned HTTP ${response.status}`
        );
      }

      const result: AgentResponse = await response.json();

      setMessages((previous) => [
        ...previous,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: result.reply || "How can I help you?",
        },
      ]);

      // Gemini decides the action.
      // TanStack Router performs the navigation.
      if (
        result.action !== "none" &&
        result.query?.trim()
      ) {
        navigationTimerRef.current = setTimeout(() => {
          setOpen(false);

          const buddyQuery = result.query.trim();

          switch (result.action) {
            case "practice":
              void navigate({
                to: ROUTES.practice,
                search: (previous) => ({
                  ...previous,
                  buddyQuery,
                }),
              });
              break;

            case "doubt_solver":
              void navigate({
                to: ROUTES.doubt_solver,
                search: (previous) => ({
                  ...previous,
                  buddyQuery,
                }),
              });
              break;

            case "talk_with_buddy":
              void navigate({
                to: ROUTES.talk_with_buddy,
                search: (previous) => ({
                  ...previous,
                  buddyQuery,
                }),
              });
              break;

            default:
              break;
          }

          navigationTimerRef.current = null;
        }, 900);
      }
    } catch (error) {
      console.error("StudyBuddy chatbot:", error);

      setMessages((previous) => [
        ...previous,
        {
          id: Date.now() + 2,
          role: "assistant",
          content:
            "Sorry, I couldn't connect to Buddy right now. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <div className="fixed bottom-6 right-6 z-[9999] font-sans">
      {open && (
        <div className="mb-4 flex h-[min(620px,calc(100dvh-110px))] w-[min(390px,calc(100vw-32px))] flex-col overflow-hidden rounded-3xl border border-indigo-100 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
                <Bot size={25} />
              </div>

              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  StudyBuddy AI
                  <Sparkles size={15} />
                </h2>

                <p className="text-xs text-indigo-100">
                  Your personal learning companion
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-2 transition hover:bg-white/20"
              aria-label="Minimize chatbot"
            >
              <Minimize2 size={19} />
            </button>
          </div>

          {/* Chat messages */}
          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 px-4 py-5">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user"
                    ? "justify-end"
                    : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    message.role === "user"
                      ? "rounded-br-md bg-indigo-600 text-white"
                      : "rounded-bl-md border border-slate-100 bg-white text-slate-700"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {/* Loading animation */}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-2xl bg-white px-4 py-3 shadow-sm">
                  {[0, 1, 2].map((index) => (
                    <span
                      key={index}
                      className="h-2 w-2 animate-bounce rounded-full bg-indigo-400"
                      style={{
                        animationDelay: `${index * 130}ms`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Suggested prompts */}
            {messages.length === 1 && (
              <div className="space-y-2 pt-3">
                <p className="px-1 text-xs font-medium text-slate-400">
                  TRY ASKING BUDDY
                </p>

                {suggestions.map((suggestion) => {
                  const Icon = suggestion.icon;

                  return (
                    <button
                      key={suggestion.label}
                      type="button"
                      disabled={loading}
                      onClick={() =>
                        void sendMessage(suggestion.prompt)
                      }
                      className="flex w-full items-center gap-3 rounded-xl border border-indigo-100 bg-white px-3 py-3 text-left text-sm text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      <Icon
                        size={18}
                        className="shrink-0 text-indigo-500"
                      />

                      {suggestion.label}
                    </button>
                  );
                })}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-slate-100 bg-white p-3"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask Buddy anything..."
              disabled={loading}
              className="min-w-0 flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-200 disabled:opacity-60"
            />

            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          </form>

          <p className="bg-white pb-3 text-center text-[10px] text-slate-400">
            Powered by StudyBuddy AI
          </p>
        </div>
      )}

      {/* Floating launcher */}
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="ml-auto flex h-15 w-15 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-300 transition hover:scale-105"
        aria-label={open ? "Close Buddy" : "Open Buddy"}
      >
        {open ? (
          <X size={25} />
        ) : (
          <MessageCircle size={28} />
        )}
      </button>
    </div>
  );
}
