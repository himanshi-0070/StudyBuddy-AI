import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, PhoneOff, Volume2, Loader2 } from "lucide-react";
import { functions } from "@/firebase";
import { httpsCallable } from "firebase/functions";
import { GoogleGenAI, Modality, Type } from "@google/genai";

// ── Types ──────────────────────────────────────────────────────────────────

type AgentStatus =
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error"
  | "ended";

type TranscriptMsg = { id: number; role: "agent" | "user"; text: string };

interface VoiceCoachAgentProps {
  /** Firestore subject document ID */
  subject: string;
  /** Human-readable subject name shown in the UI */
  subjectName: string;
  /** Student's display name from their profile */
  userName: string;
  /** Preferred coaching language, e.g. "English", "Hindi", "Hinglish" */
  coachLanguage: string;
  /** Student's class/grade, e.g. "12", "11", "UG" */
  userClass?: string;
  /** Called when the agent saves a new language preference */
  onLanguageChanged?: (lang: string) => void;
  onEnd: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function VoiceCoachAgent({ subject, subjectName, userName, coachLanguage, userClass, onLanguageChanged, onEnd }: VoiceCoachAgentProps) {
  const [status, setStatus] = useState<AgentStatus>("connecting");
  const [transcript, setTranscript] = useState<TranscriptMsg[]>([]);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Stable refs for async / audio-thread callbacks
  const sessionRef = useRef<ReturnType<InstanceType<typeof GoogleGenAI>["live"]["connect"]> extends Promise<infer T> ? T : never>(null as any);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const dialToneCtxRef = useRef<AudioContext | null>(null);
  const dialToneStopRef = useRef<(() => void) | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextPlayTimeRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const isMicMutedRef = useRef(false);
  const isSessionActiveRef = useRef(false);
  const sessionIdRef = useRef(0);
  const autoEndScheduledRef = useRef(false);
  // Keep a ref so startSession's async closure always reads the latest values
  const coachLanguageRef = useRef(coachLanguage);
  const userNameRef = useRef(userName);
  useEffect(() => { coachLanguageRef.current = coachLanguage; }, [coachLanguage]);
  useEffect(() => { userNameRef.current = userName; }, [userName]);
  const transcriptIdRef = useRef(0);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Append or extend the last message from the same role
  const appendTranscript = useCallback((role: "agent" | "user", text: string) => {
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === role) {
        return [...prev.slice(0, -1), { ...last, text: last.text + text }];
      }
      return [...prev, { id: ++transcriptIdRef.current, role, text }];
    });
  }, []);

  // Start on mount, clean up on unmount
  useEffect(() => {
    startSession();
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Session bootstrap ────────────────────────────────────────────────────

  async function startSession() {
    // Each invocation claims a unique ID; cleanup() increments the ID to
    // invalidate any in-flight continuations or callbacks from prior calls.
    const myId = ++sessionIdRef.current;
    const alive = () => sessionIdRef.current === myId;
    console.log(`[VoiceCoach] 🚀 startSession — invocation #${myId} | subject: "${subjectName}" (${subject})`);

    // Play dial tone immediately while connecting
    dialToneStopRef.current = playDialTone();

    try {
      // 1. Get API key + model from the auth-gated backend function
      console.log(`[VoiceCoach] #${myId} step 1/5 — fetching config from get_voice_coaching_config…`);
      const getConfig = httpsCallable<
        Record<string, never>,
        { apiKey: string; model: string }
      >(functions, "get_voice_coaching_config");
      const { data: cfg } = await getConfig({});
      if (!alive()) { console.warn(`[VoiceCoach] #${myId} aborted after getConfig (superseded by #${sessionIdRef.current})`); return; }
      // Strip "models/" prefix — the @google/genai SDK expects a bare model ID
      const modelId = cfg.model.replace(/^models\//, "");
      console.log(`[VoiceCoach] #${myId} config received — raw model: ${cfg.model} → using: ${modelId}`);

      // 2. Microphone access
      console.log(`[VoiceCoach] #${myId} step 2/5 — requesting microphone…`);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      if (!alive()) {
        stream.getTracks().forEach((t) => t.stop());
        console.warn(`[VoiceCoach] #${myId} aborted after getUserMedia (superseded by #${sessionIdRef.current})`);
        return;
      }
      console.log(`[VoiceCoach] #${myId} microphone acquired — tracks: ${stream.getAudioTracks().map((t) => t.label).join(", ")}`);
      streamRef.current = stream;

      // 3. AudioContexts
      console.log(`[VoiceCoach] #${myId} step 3/5 — creating AudioContexts…`);
      const captureCtx = new AudioContext({ sampleRate: 16000 });
      captureCtxRef.current = captureCtx;
      if (captureCtx.state === "suspended") await captureCtx.resume();
      if (!alive()) { console.warn(`[VoiceCoach] #${myId} aborted after captureCtx (superseded by #${sessionIdRef.current})`); return; }
      console.log(`[VoiceCoach] #${myId} captureCtx state: ${captureCtx.state}, sampleRate: ${captureCtx.sampleRate}`);

      const playbackCtx = new AudioContext();
      playbackCtxRef.current = playbackCtx;
      if (playbackCtx.state === "suspended") await playbackCtx.resume();
      console.log(`[VoiceCoach] #${myId} playbackCtx state: ${playbackCtx.state}, sampleRate: ${playbackCtx.sampleRate}`);

      // 4. Firebase callable for the knowledge-base tool
      const searchChunksFn = httpsCallable<
        { query: string; subject: string; class?: string },
        { chunks: string[] }
      >(functions, "search_chunks");

      // 5. Connect to Gemini Live
      console.log(`[VoiceCoach] #${myId} step 4/5 — calling genai.live.connect with model: ${modelId}…`);
      const genai = new GoogleGenAI({ apiKey: cfg.apiKey });

      const session = await genai.live.connect({
        model: modelId,
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          systemInstruction: {
            parts: [
              {
                text:
                  `LANGUAGE RULE (highest priority): You MUST speak and teach exclusively in ${coachLanguageRef.current}. ` +
                  `Every single response must be in ${coachLanguageRef.current}. Do not use any other language unless the student explicitly asks to switch, in which case call set_language_preference immediately and switch.\n\n` +
                  `You are an AI voice coach helping Indian students understand their study material. ` +
                  `Speak in a warm, encouraging, and conversational tone. ` +
                  `Do NOT use markdown, bullet points, or any text formatting — speak naturally as you would in a phone call. ` +
                  `The student's name is ${userNameRef.current || "the student"}. Greet them by name at the start — do NOT ask for their name.\n\n` +
                  `The subject for this session is: ${subjectName}. This is the ONLY subject you are allowed to coach on today.\n\n` +
                  `STRICT SUBJECT RULE: If the student asks about anything that is NOT related to ${subjectName}, you must politely decline and say something like: "I'm your ${subjectName} coach for today — I can only help with ${subjectName} topics in this session. Feel free to ask me anything about ${subjectName}!" Then invite them to ask a ${subjectName} question. Do not answer off-topic questions under any circumstances.\n\n` +
                  `You may use your own general knowledge about ${subjectName} to supplement explanations. Always search the knowledge base first for content from the student's own uploaded study material before explaining.\n\n` +
                  `Follow this coaching flow:\n` +
                  `1. Greet the student warmly by name in ${coachLanguageRef.current}.\n` +
                  `2. Ask what concept or topic from ${subjectName} they would like to understand today.\n` +
                  `3. Call the search_knowledge_base tool using their question to find relevant content from their uploaded study material.\n` +
                  `4. Based on the search results AND your own knowledge of ${subjectName}, explain the concept step by step in ${coachLanguageRef.current} using simple language, real-world examples, and analogies suited to students.\n` +
                  `5. After explaining, ask if they have any follow-up questions and keep coaching.\n` +
                  `If the search returns no results, use your own knowledge of ${subjectName} to explain and tell the student you are explaining from general knowledge.\n` +
                  `Always be patient and encouraging.`,
              },
            ],
          },
          tools: [
            {
              functionDeclarations: [
                {
                  name: "search_knowledge_base",
                  description:
                    "Search the student's uploaded study material for relevant passages about a topic or concept. Always call this before explaining anything.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: {
                        type: Type.STRING,
                        description: "The concept or topic to search for in the study material",
                      },
                      subject: {
                        type: Type.STRING,
                        description: "Subject name to filter the search (e.g. Physics)",
                      },
                    },
                    required: ["query"],
                  },
                },
                {
                  name: "set_language_preference",
                  description:
                    "Save the student's preferred coaching language so it is used in all future sessions. Call this whenever the student asks to switch languages.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      language: {
                        type: Type.STRING,
                        description: "The language to coach in, e.g. English, Hindi, Hinglish, Tamil, Telugu, Kannada, Bengali, Marathi",
                      },
                    },
                    required: ["language"],
                  },
                },
              ],
            },
          ],
        },
        callbacks: {
          onopen: () => {
            console.log(`[VoiceCoach] #${myId} ✅ WebSocket OPEN — session alive: ${alive()}, sessionIdRef: ${sessionIdRef.current}`);
            if (!alive()) { console.warn(`[VoiceCoach] #${myId} onopen ignored (superseded)`); return; }
            dialToneStopRef.current?.();
            dialToneStopRef.current = null;
            isSessionActiveRef.current = true;
            setStatus("listening");
          },
          onmessage: (msg: any) => {
            if (!alive()) { console.warn(`[VoiceCoach] #${myId} onmessage ignored (superseded)`); return; }
            handleMessage(msg, sessionRef, searchChunksFn, onLanguageChanged, () => {
              if (autoEndScheduledRef.current) return;
              autoEndScheduledRef.current = true;
              console.log(`[VoiceCoach] #${myId} 👋 Auto-end scheduled in 3 s`);
              // Give the agent ~3 s to deliver a farewell response before hanging up
              setTimeout(() => { if (alive()) endSession(); }, 3000);
            });
          },
          onerror: (e: any) => {
            console.error(`[VoiceCoach] #${myId} ❌ WebSocket ERROR — alive: ${alive()}`, e);
            if (!alive()) return;
            isSessionActiveRef.current = false;
            setErrorMsg(e?.message ?? String(e));
            setStatus("error");
          },
          onclose: (ev: any) => {
            console.log(`[VoiceCoach] #${myId} 🔌 WebSocket CLOSE — alive: ${alive()} | code: ${ev?.code} | reason: ${ev?.reason ?? "(none)"}`);
            if (!alive()) { console.warn(`[VoiceCoach] #${myId} onclose ignored (superseded)`); return; }
            isSessionActiveRef.current = false;
            setStatus("ended");
          },
        },
      });

      sessionRef.current = session;
      console.log(`[VoiceCoach] #${myId} step 5/5 — genai.live.connect resolved, starting mic capture…`);
      await startMicCapture(stream, captureCtx, session);
      if (!alive()) { console.warn(`[VoiceCoach] #${myId} aborted after startMicCapture (superseded by #${sessionIdRef.current})`); return; }
      console.log(`[VoiceCoach] #${myId} 🎉 session fully started`);
    } catch (e: any) {
      console.error(`[VoiceCoach] #${myId} 💥 startSession threw — alive: ${alive()}`, e);
      if (!alive()) return;
      dialToneStopRef.current?.();
      dialToneStopRef.current = null;
      setErrorMsg(
        e?.message ?? "Could not start voice session. Check microphone permissions.",
      );
      setStatus("error");
    }
  }

  // ── Dial tone (synthesized ring via Web Audio) ───────────────────────────

  function playDialTone(): () => void {
    try {
      const ctx = new AudioContext();
      dialToneCtxRef.current = ctx;
      let stopped = false;

      // Catchy 3-note ascending arpeggio ring: C5 → E5 → G5, repeat
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      const noteDuration = 0.15; // seconds per note
      const ringDuration = notes.length * noteDuration; // 0.45 s ring
      const silenceDuration = 0.6; // pause between rings
      const cycleDuration = ringDuration + silenceDuration;

      function scheduleRing(startTime: number) {
        if (stopped) return;
        notes.forEach((freq, i) => {
          const noteStart = startTime + i * noteDuration;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, noteStart);

          // Quick attack, smooth release
          gain.gain.setValueAtTime(0, noteStart);
          gain.gain.linearRampToValueAtTime(0.25, noteStart + 0.01);
          gain.gain.setValueAtTime(0.25, noteStart + noteDuration - 0.04);
          gain.gain.linearRampToValueAtTime(0, noteStart + noteDuration);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(noteStart);
          osc.stop(noteStart + noteDuration);
        });

        // Schedule next ring cycle
        const nextStart = startTime + cycleDuration;
        const timeoutMs = Math.max(0, (nextStart - ctx.currentTime) * 1000 - 20);
        setTimeout(() => scheduleRing(nextStart), timeoutMs);
      }

      scheduleRing(ctx.currentTime + 0.05);

      return () => {
        stopped = true;
        ctx.close().catch(() => {});
        dialToneCtxRef.current = null;
      };
    } catch {
      return () => {};
    }
  }



  // packet counter lives outside the worklet message handler to avoid closure churn
  const packetCountRef = useRef(0);

  // Inline AudioWorklet processor — buffers 2048 samples then posts a Float32Array
  const MIC_WORKLET_CODE = `
    class MicCaptureProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this._buf = new Float32Array(2048);
        this._filled = 0;
      }
      process(inputs) {
        const ch = inputs[0]?.[0];
        if (!ch) return true;
        let offset = 0;
        while (offset < ch.length) {
          const space = this._buf.length - this._filled;
          const n = Math.min(space, ch.length - offset);
          this._buf.set(ch.subarray(offset, offset + n), this._filled);
          this._filled += n;
          offset += n;
          if (this._filled === this._buf.length) {
            this.port.postMessage(this._buf.slice());
            this._filled = 0;
          }
        }
        return true;
      }
    }
    registerProcessor('mic-capture-processor', MicCaptureProcessor);
  `;

  async function startMicCapture(stream: MediaStream, ctx: AudioContext, session: any) {
    const blob = new Blob([MIC_WORKLET_CODE], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }

    const source = ctx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(ctx, "mic-capture-processor");
    source.connect(worklet);
    // No need to connect worklet to destination — capture only
    processorRef.current = worklet;

    const mimeType = `audio/pcm;rate=${ctx.sampleRate}`;

    worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
      // Don't send if session closed, mic muted, or agent is speaking
      if (!isSessionActiveRef.current || isSpeakingRef.current || isMicMutedRef.current) return;
      const base64 = float32ToBase64Pcm(e.data);
      session.sendRealtimeInput({ audio: { data: base64, mimeType } });
      packetCountRef.current += 1;
      // Log every 50 packets (~5 s at 2048/16000 Hz ≈ 128 ms/packet)
      if (packetCountRef.current % 50 === 0) {
        console.debug(
          `[VoiceCoach] 🎤 Audio packets sent: ${packetCountRef.current} | chunk: ${e.data.length} samples | mimeType: ${mimeType}`,
        );
      }
    };
  }

  // ── Incoming message handler ─────────────────────────────────────────────

  function handleMessage(msg: any, sRef: typeof sessionRef, searchChunksFn: any, onLangChanged?: (lang: string) => void, onAutoEnd?: () => void) {
    // Audio transcription (outputAudioTranscription) — delivered separately from modelTurn
    const transcriptText: string | undefined = msg?.serverContent?.outputTranscription?.text;
    if (transcriptText) {
      appendTranscript("agent", transcriptText);
    }

    // Input audio transcription — user's speech
    const inputText: string | undefined = msg?.serverContent?.inputTranscription?.text;
    if (inputText) {
      appendTranscript("user", inputText);
      // Auto-end on farewell / terminal phrases
      const lower = inputText.toLowerCase();
      const TERMINAL_PHRASES = [
        "thank you", "thanks", "goodbye", "good bye", "bye", "see you", "see ya",
        "that's all", "thats all", "that's it", "thats it",
        "i'm done", "im done", "all done", "we're done", "were done",
        "shukriya", "dhanyawad", "dhanyawaad", "alvida", "phir milenge", "bas karo", "bas ho gaya",
      ];
      if (TERMINAL_PHRASES.some((p) => lower.includes(p))) {
        console.log(`[VoiceCoach] 👋 Terminal phrase detected in: "${inputText}" — scheduling auto-end`);
        onAutoEnd?.();
      }
    }

    // Audio + any inline text parts from the model turn
    const parts: any[] = msg?.serverContent?.modelTurn?.parts ?? [];
    let audioChunks = 0;
    let textChunks = 0;
    for (const part of parts) {
      if (typeof part.text === "string" && part.text) {
        isSpeakingRef.current = true;
        setStatus("speaking");
        appendTranscript("agent", part.text);
        textChunks += 1;
      }
      if (part.inlineData?.mimeType?.startsWith("audio/pcm")) {
        isSpeakingRef.current = true;
        setStatus("speaking");
        playPcmChunk(part.inlineData.data);
        audioChunks += 1;
      }
    }
    if (audioChunks > 0 || textChunks > 0) {
      console.debug(
        `[VoiceCoach] 🔊 Received model turn — audio chunks: ${audioChunks}, text chunks: ${textChunks}`,
      );
    }

    // Model finished its turn
    if (msg?.serverContent?.turnComplete) {
      console.debug("[VoiceCoach] ✅ Model turn complete — switching to listening");
      isSpeakingRef.current = false;
      setStatus("listening");
    }

    // Tool calls — search_knowledge_base
    const calls: any[] = msg?.toolCall?.functionCalls ?? [];
    if (calls.length > 0) {
      console.debug(`[VoiceCoach] 🔧 Tool call(s) received:`, calls.map((c: any) => ({ name: c.name, args: c.args })));
      setStatus("thinking");
      isSpeakingRef.current = false;

      Promise.all(
        calls.map(async (call: any) => {
          if (call.name === "search_knowledge_base") {
            try {
              const { data } = await searchChunksFn({
                query: call.args?.query ?? "",
                subject: call.args?.subject ?? subject,
                ...(userClass ? { class: userClass } : {}),
              });
              return {
                id: call.id,
                name: call.name,
                response: {
                  result: data.chunks.length
                    ? data.chunks.join("\n\n---\n\n")
                    : "No relevant content was found in the uploaded study material for this topic.",
                },
              };
            } catch {
              return {
                id: call.id,
                name: call.name,
                response: { result: "Search failed — please try again." },
              };
            }
          }
          if (call.name === "set_language_preference") {
            const lang = String(call.args?.language ?? "English");
            console.log(`[VoiceCoach] 🌐 Language preference change: ${lang}`);
            try {
              onLangChanged?.(lang);
              return {
                id: call.id,
                name: call.name,
                response: { result: `Language preference saved: ${lang}. Continue the session in ${lang}.` },
              };
            } catch {
              return {
                id: call.id,
                name: call.name,
                response: { result: "Failed to save language preference, but please continue in the requested language." },
              };
            }
          }
          return { id: call.id, name: call.name, response: { result: "Unknown tool." } };
        }),
      ).then((responses) => {
        console.debug("[VoiceCoach] 📤 Sending tool responses:", responses.map((r: any) => ({ name: r.name, resultLength: String(r.response?.result ?? "").length })));
        sRef.current?.sendToolResponse({ functionResponses: responses });
      });
    }
  }

  // ── PCM audio playback ───────────────────────────────────────────────────

  function playPcmChunk(base64: string) {
    const ctx = playbackCtxRef.current;
    if (!ctx) return;
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / (int16[i] < 0 ? 32768 : 32767);
      }
      // Gemini Live outputs 24 kHz mono PCM
      const buffer = ctx.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      const startAt = Math.max(ctx.currentTime + 0.02, nextPlayTimeRef.current);
      src.start(startAt);
      nextPlayTimeRef.current = startAt + buffer.duration;
    } catch (err) {
      console.error("VoiceCoachAgent: audio playback error", err);
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  function cleanup() {
    const prevId = sessionIdRef.current;
    sessionIdRef.current++; // invalidates all in-flight startSession continuations + callbacks
    autoEndScheduledRef.current = false;
    console.log(`[VoiceCoach] 🧹 cleanup — invalidating session #${prevId} → new gate: #${sessionIdRef.current} | isSessionActive was: ${isSessionActiveRef.current}`);
    isSessionActiveRef.current = false;
    dialToneStopRef.current?.();
    dialToneStopRef.current = null;
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => { console.log(`[VoiceCoach] stopping track: ${t.label}`); t.stop(); });
    captureCtxRef.current?.close().catch(() => {});
    playbackCtxRef.current?.close().catch(() => {});
    try {
      (sessionRef.current as any)?.close?.();
      console.log(`[VoiceCoach] sessionRef.close() called`);
    } catch (err) {
      console.warn(`[VoiceCoach] sessionRef.close() threw`, err);
    }
  }

  // ── Controls ─────────────────────────────────────────────────────────────

  function toggleMic() {
    const next = !isMicMutedRef.current;
    isMicMutedRef.current = next;
    setIsMicMuted(next);
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
  }

  function endSession() {
    cleanup();
    onEnd();
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const STATUS_LABEL: Record<AgentStatus, string> = {
    connecting: "Connecting…",
    listening: "Listening — speak now",
    thinking: "Searching knowledge base…",
    speaking: "Coach is speaking",
    error: "Connection error",
    ended: "Session ended",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-3xl border border-border bg-surface"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div
            className={`relative grid h-10 w-10 place-items-center rounded-xl ${
              status === "speaking" ? "gradient-mint" : "gradient-violet"
            }`}
          >
            <Volume2 className="h-4 w-4 text-ink" />
            {(status === "speaking" || status === "thinking") && (
              <span className="absolute inset-0 animate-ping rounded-xl bg-white/20" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">AI Voice Coach</p>
            <p className="text-xs text-muted-foreground">{subjectName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-2 w-2 rounded-full ${
              status === "error" || status === "ended"
                ? "bg-coral"
                : status === "connecting"
                  ? "animate-pulse bg-amber"
                  : "bg-mint"
            }`}
          />
          <span className="text-xs text-muted-foreground">{STATUS_LABEL[status]}</span>
        </div>
      </div>

      {/* ── Transcript ── */}
      <div className="h-72 space-y-3 overflow-y-auto p-6">
        {status === "connecting" && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {status === "error" && errorMsg && (
          <div className="rounded-2xl border border-coral/30 bg-coral/10 p-4 text-sm text-coral">
            {errorMsg}
          </div>
        )}

        <AnimatePresence initial={false}>
          {transcript.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "agent"
                    ? "bg-surface-elevated text-foreground"
                    : "gradient-violet text-ink"
                }`}
              >
                {msg.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <div ref={transcriptEndRef} />
      </div>

      {/* ── Controls ── */}
      <div className="border-t border-border px-6 py-5">
        <div className="flex items-center justify-around">
          {/* Mic */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={toggleMic}
              title={isMicMuted ? "Unmute microphone" : "Mute microphone"}
              className={`relative grid h-16 w-16 place-items-center rounded-full transition-all ${
                isMicMuted
                  ? "bg-muted text-muted-foreground"
                  : status === "listening"
                    ? "bg-primary text-primary-foreground ring-glow"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {isMicMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              {status === "listening" && !isMicMuted && (
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
              )}
            </button>
            <p className="text-xs text-muted-foreground">{isMicMuted ? "Muted" : "Mic on"}</p>
          </div>

          {/* Coach speaking orb */}
          <div className="flex flex-col items-center gap-2">
            <div
              className={`relative grid h-16 w-16 place-items-center rounded-full transition-all ${
                status === "speaking" ? "gradient-mint" : "bg-muted"
              }`}
            >
              <Volume2
                className={`h-6 w-6 ${status === "speaking" ? "text-ink" : "text-muted-foreground"}`}
              />
              {status === "speaking" && (
                <span className="absolute inset-0 animate-ping rounded-full bg-mint/30" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {status === "speaking" ? "Speaking" : "Coach"}
            </p>
          </div>

          {/* End session */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={endSession}
              title="End voice session"
              className="grid h-16 w-16 place-items-center rounded-full bg-coral/10 text-coral transition hover:bg-coral/20"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
            <p className="text-xs text-muted-foreground">End</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Audio helpers ──────────────────────────────────────────────────────────

function float32ToBase64Pcm(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = Math.round(clamped < 0 ? clamped * 32768 : clamped * 32767);
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
