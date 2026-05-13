import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import {
  Flame, TrendingUp, Target, Clock, ArrowUpRight, ArrowDownRight, ArrowRight,
  Play, BookOpen, Brain, MessageSquare, Mic, Trophy, ChevronRight, Sparkles,
  BarChart2, CheckCircle2,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { StatCard } from "@/components/stat-card";
import { db } from "@/firebase";
import { useAuth } from "@/context/AuthContext";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

// ── Types ──────────────────────────────────────────────────────────────────────

type PerformanceData = { week: string; score: number; target: number }[];
type SubjectData = { subject: string; score: number; fullMark: number }[];
type WeakTopic = { topic: string; subject: string; mastery: number; trend: "up" | "down" };

type ActivityEntry = {
  id: string;
  type: "quiz" | "dpp" | "doubt";
  title: string;
  subtitle: string;
  score?: number;
  scoreTotal?: number;
  timestamp: Date;
  icon: "learn" | "practice" | "doubt";
};

type Achievement = {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  icon: string;
};

type ModeStats = {
  learn: { lecturesWatched: number; totalLectures: number; quizzesDone: number; avgQuizScore: number };
  practice: { totalAttempted: number; correct: number; accuracy: number; subjectsDone: number };
  doubt: { totalDoubts: number };
};

// ── Utilities ──────────────────────────────────────────────────────────────────

function getTimeOfDay(): "Good morning" | "Good afternoon" | "Good evening" {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatDate(): string {
  const d = new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${days[d.getDay()]} · ${d.getDate()} ${months[d.getMonth()]}`;
}

function getCurrentTime(): string {
  const n = new Date();
  const h = String(n.getHours()).padStart(2, "0");
  const m = String(n.getMinutes()).padStart(2, "0");
  return `${h}:${m} ${n.getHours() >= 12 ? "pm" : "am"}`;
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function computeAchievements(stats: ModeStats, streak: number): Achievement[] {
  return [
    { id: "first_lecture", title: "First Class", description: "Watched your first lecture", unlocked: stats.learn.lecturesWatched >= 1, icon: "🎓" },
    { id: "five_lectures", title: "Dedicated Learner", description: "Completed 5 lectures", unlocked: stats.learn.lecturesWatched >= 5, icon: "📚" },
    { id: "first_dpp", title: "Problem Solver", description: "Completed your first practice session", unlocked: stats.practice.totalAttempted >= 1, icon: "🧠" },
    { id: "first_doubt", title: "Curious Mind", description: "Asked your first doubt", unlocked: stats.doubt.totalDoubts >= 1, icon: "💬" },
    { id: "streak_3", title: "On a Roll", description: "3-day practice streak", unlocked: streak >= 3, icon: "🔥" },
    { id: "streak_7", title: "Week Warrior", description: "7-day practice streak", unlocked: streak >= 7, icon: "⚡" },
    { id: "accuracy_80", title: "Sharp Mind", description: "Achieved 80%+ accuracy", unlocked: stats.practice.accuracy >= 80, icon: "🎯" },
    { id: "multi_subject", title: "All-Rounder", description: "Practiced 3+ subjects", unlocked: stats.practice.subjectsDone >= 3, icon: "🌟" },
    { id: "quiz_pro", title: "Quiz Pro", description: "Completed 5+ lecture quizzes", unlocked: stats.learn.quizzesDone >= 5, icon: "📋" },
    { id: "doubt_10", title: "Knowledge Seeker", description: "Asked 10+ doubts", unlocked: stats.doubt.totalDoubts >= 10, icon: "🔍" },
  ];
}

function Dashboard() {
  const { profile } = useAuth();
  const [currentDate, setCurrentDate] = useState(formatDate());
  const [currentTime, setCurrentTime] = useState(getCurrentTime());
  const [greeting, setGreeting] = useState(getTimeOfDay());
  const [streak, setStreak] = useState(0);
  const [timeToday, setTimeToday] = useState(0);
  const [mastery, setMastery] = useState(0);
  const [performanceTrend, setPerformanceTrend] = useState<PerformanceData>([]);
  const [subjectRadar, setSubjectRadar] = useState<SubjectData>([]);
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([]);
  const [lastLecture, setLastLecture] = useState<string>("");
  const [modeStats, setModeStats] = useState<ModeStats>({
    learn: { lecturesWatched: 0, totalLectures: 0, quizzesDone: 0, avgQuizScore: 0 },
    practice: { totalAttempted: 0, correct: 0, accuracy: 0, subjectsDone: 0 },
    doubt: { totalDoubts: 0 },
  });
  const [recentActivity, setRecentActivity] = useState<ActivityEntry[]>([]);

  // ── Update clock every minute ──────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(formatDate());
      setCurrentTime(getCurrentTime());
      setGreeting(getTimeOfDay());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // ── Learn mode: lecture_progress + lecture_materials + lecture_mcq_results ─
  useEffect(() => {
    if (!profile?.uid) return;

    // All available lectures
    const unsubLectures = onSnapshot(
      query(collection(db, "lecture_materials"), orderBy("uploadedAt", "desc")),
      (snap) => {
        setModeStats((prev) => ({ ...prev, learn: { ...prev.learn, totalLectures: snap.docs.length } }));
        if (snap.docs.length > 0) setLastLecture(snap.docs[0].data().title || "");
      },
    );

    // Completed lectures by this user
    const unsubProgress = onSnapshot(
      query(collection(db, "lecture_progress"), where("userId", "==", profile.uid)),
      (snap) => {
        const completed = snap.docs.filter((d) => d.data().completed).length;
        setModeStats((prev) => ({ ...prev, learn: { ...prev.learn, lecturesWatched: completed } }));
      },
    );

    // Quiz results from learn mode (submittedAt field)
    const unsubMcq = onSnapshot(
      query(
        collection(db, "lecture_mcq_results"),
        where("userId", "==", profile.uid),
        orderBy("submittedAt", "desc"),
        limit(30),
      ),
      (snap) => {
        const results = snap.docs.map((d) => d.data());
        const avgScore =
          results.length > 0
            ? Math.round(results.reduce((s, r) => s + ((r.score / r.total) * 100), 0) / results.length)
            : 0;
        setModeStats((prev) => ({
          ...prev,
          learn: { ...prev.learn, quizzesDone: results.length, avgQuizScore: avgScore },
        }));

        const activities: ActivityEntry[] = snap.docs.slice(0, 6).map((d) => ({
          id: `mcq_${d.id}`,
          type: "quiz" as const,
          title: `Quiz · ${d.data().lectureTitle || d.data().subject || "Lecture"}`,
          subtitle: `${d.data().score}/${d.data().total} correct · ${d.data().subject || ""}`,
          score: d.data().score,
          scoreTotal: d.data().total,
          timestamp: d.data().submittedAt?.toDate?.() || new Date(),
          icon: "learn" as const,
        }));
        setRecentActivity((prev) => [...prev.filter((a) => !a.id.startsWith("mcq_")), ...activities]);
      },
    );

    return () => {
      unsubLectures();
      unsubProgress();
      unsubMcq();
    };
  }, [profile?.uid]);



  // ── DPP attempts: streak + mastery + trend + subject radar + activity feed ─
  useEffect(() => {
    if (!profile?.uid) return;

    const unsub = onSnapshot(
      query(
        collection(db, "dpp_attempts"),
        where("userId", "==", profile.uid),
        orderBy("completedAt", "desc"),
        limit(50),
      ),
      (snap) => {
        const attempts = snap.docs.map((d) => {
          const data = d.data();
          return {
            score: (data.score as number) || 0,
            timeSpent: (data.timeSpent as number) || 0,
            topic: (data.topic as string) || "",
            subject: (data.subject as string) || "",
            completedAt: data.completedAt?.toDate?.() as Date || new Date(),
          };
        });

        // Mastery & DPP Stats
        if (attempts.length > 0) {
          const avg =
            attempts.slice(0, 20).reduce((s, a) => s + (a.score || 0), 0) /
            Math.min(20, attempts.length);
          setMastery(Math.round(avg));
          
          // Update practice stats with DPP data
          const totalDPP = attempts.length;
          const avgScore = Math.round(
            attempts.reduce((s, a) => s + (a.score || 0), 0) / totalDPP
          );
          setModeStats((prev) => ({
            ...prev,
            practice: { totalAttempted: totalDPP, correct: Math.round((avgScore / 100) * totalDPP), accuracy: avgScore, subjectsDone: new Set(attempts.map((a) => a.subject)).size },
          }));
        }

        // Streak
        const days = new Set<string>();
        attempts.forEach((a) => days.add(new Date(a.completedAt).toISOString().split("T")[0]));
        const sorted = Array.from(days).sort().reverse();
        let streakCount = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (let i = 0; i < sorted.length; i++) {
          const exp = new Date(today);
          exp.setDate(exp.getDate() - i);
          if (sorted[i] === exp.toISOString().split("T")[0]) streakCount++;
          else break;
        }
        setStreak(streakCount);

        // Time today (fallback 15 min per attempt if no timeSpent)
        const todayStr = new Date().toISOString().split("T")[0];
        const todayAttempts = attempts.filter(
          (a) => new Date(a.completedAt).toISOString().split("T")[0] === todayStr,
        );
        setTimeToday(todayAttempts.reduce((s, a) => s + (a.timeSpent || 15), 0));

        // Weekly trend
        const weeklyScores: Record<string, number[]> = {};
        attempts.forEach((a) => {
          const wk = `W${Math.ceil(new Date(a.completedAt).getDate() / 7)}`;
          if (!weeklyScores[wk]) weeklyScores[wk] = [];
          weeklyScores[wk].push(a.score || 0);
        });
        const trend = Object.entries(weeklyScores)
          .slice(0, 8)
          .reverse()
          .map(([week, scores], i) => ({
            week,
            score: Math.round(scores.reduce((a, b) => a + b) / scores.length),
            target: 65 + i * 2,
          }));
        if (trend.length > 0) setPerformanceTrend(trend);

        // Subject radar + weak topics
        const topicScores: Record<string, number[]> = {};
        const subjectScores: Record<string, number[]> = {};
        attempts.forEach((a) => {
          const topic = a.topic || "General";
          const subject = a.subject || topic.split("—")?.[0]?.trim() || "General";
          if (!topicScores[topic]) topicScores[topic] = [];
          topicScores[topic].push(a.score || 0);
          if (!subjectScores[subject]) subjectScores[subject] = [];
          subjectScores[subject].push(a.score || 0);
        });

        const weak = Object.entries(topicScores)
          .map(([topic, scores]) => {
            const avg = Math.round(scores.reduce((a, b) => a + b) / scores.length);
            const subject = topic.split("—")?.[0]?.trim() || "General";
            return {
              topic: topic.split("—")?.[1]?.trim() || topic,
              subject,
              mastery: avg,
              trend: avg >= 60 ? ("up" as const) : ("down" as const),
            };
          })
          .filter((t) => t.mastery < 60)
          .sort((a, b) => a.mastery - b.mastery)
          .slice(0, 4);
        setWeakTopics(weak);

        const radarData = Object.entries(subjectScores)
          .map(([subject, scores]) => ({
            subject,
            score: Math.round(scores.reduce((a, b) => a + b) / scores.length),
            fullMark: 100,
          }))
          .sort((a, b) => b.score - a.score);
        if (radarData.length > 0) setSubjectRadar(radarData);

        // DPP activity feed
        const dppActivities: ActivityEntry[] = snap.docs.slice(0, 6).map((d) => ({
          id: `dpp_${d.id}`,
          type: "dpp" as const,
          title: `DPP · ${d.data().subject || "Practice"}`,
          subtitle: `Score: ${d.data().score || 0}% · ${d.data().topic || ""}`,
          score: d.data().score,
          scoreTotal: 100,
          timestamp: d.data().completedAt?.toDate?.() || new Date(),
          icon: "practice" as const,
        }));
        setRecentActivity((prev) => [...prev.filter((a) => !a.id.startsWith("dpp_")), ...dppActivities]);
      },
    );

    return () => unsub();
  }, [profile?.uid]);

  // ── Doubt solver: count user messages across all chat docs ─────────────────
  useEffect(() => {
    if (!profile?.uid) return;

    const unsub = onSnapshot(
      query(collection(db, "doubt_solver_chat"), where("userId", "==", profile.uid)),
      (snap) => {
        let totalDoubts = 0;
        const doubtActivities: ActivityEntry[] = [];

        snap.docs.forEach((d) => {
          const data = d.data();
          const messages = (data.messages || []) as Array<{ from: string; text: string }>;
          const userMsgs = messages.filter((m) => m.from === "user");
          totalDoubts += userMsgs.length;

          if (userMsgs.length > 0) {
            doubtActivities.push({
              id: `doubt_${d.id}`,
              type: "doubt" as const,
              title: `Doubt session · ${data.subjectId || "General"}`,
              subtitle: `${userMsgs.length} question${userMsgs.length !== 1 ? "s" : ""} asked`,
              timestamp: data.updatedAt?.toDate?.() || new Date(),
              icon: "doubt" as const,
            });
          }
        });

        setModeStats((prev) => ({ ...prev, doubt: { totalDoubts } }));
        setRecentActivity((prev) => [
          ...prev.filter((a) => !a.id.startsWith("doubt_")),
          ...doubtActivities.slice(0, 4),
        ]);
      },
    );

    return () => unsub();
  }, [profile?.uid]);

  // ── Derived values ────────────────────────────────────────────────────────
  const achievements = useMemo(() => computeAchievements(modeStats, streak), [modeStats, streak]);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  const sortedActivity = useMemo(
    () => [...recentActivity].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 8),
    [recentActivity],
  );

  const displayName = profile?.displayName?.split(" ")[0] || "Student";
  const goalMinutes = 270; // 4.5h
  const hours = Math.floor(timeToday / 60);
  const mins = timeToday % 60;
  const goalPct = Math.min(100, Math.round((timeToday / goalMinutes) * 100));
  const lectureCompletionPct =
    modeStats.learn.totalLectures > 0
      ? Math.round((modeStats.learn.lecturesWatched / modeStats.learn.totalLectures) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-6 py-10">

        {/* ── Hero Header ────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{currentDate} · {currentTime}</p>
            <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">
              {greeting}, <span className="text-gradient-mint">{displayName}</span>
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
              {streak > 0 && (
                <span className="inline-flex items-center gap-1 font-medium text-coral text-sm">
                  <Flame className="h-4 w-4" /> {streak} day streak
                </span>
              )}
              {streak > 0 && <span className="text-border">·</span>}
              <span className="text-sm">{unlockedCount}/{achievements.length} achievements unlocked</span>
              {modeStats.learn.totalLectures > 0 && (
                <>
                  <span className="text-border">·</span>
                  <span className="text-sm">{modeStats.learn.lecturesWatched}/{modeStats.learn.totalLectures} lectures done</span>
                </>
              )}
            </p>
          </div>
          <Link
            to="/learn"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground ring-glow hover:-translate-y-0.5 transition-transform"
          >
            <Play className="h-4 w-4" />
            {lastLecture ? `Resume: ${lastLecture.slice(0, 28)}${lastLecture.length > 28 ? "…" : ""}` : "Start learning"}
          </Link>
        </div>

        {/* ── Top Stats ──────────────────────────────────────────────────── */}
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Predicted score"
            value={mastery > 0 ? `${Math.min(99, mastery + 5)}%` : "—"}
            hint={mastery > 0 ? `Based on ${subjectRadar.length} subject${subjectRadar.length !== 1 ? "s" : ""}` : "Complete a DPP to see"}
            accent="mint"
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <StatCard
            label="Practice streak"
            value={`${streak} day${streak !== 1 ? "s" : ""}`}
            hint={streak >= 7 ? "🔥 Week warrior!" : streak >= 3 ? "On a roll — keep going!" : streak > 0 ? "Keep the streak alive!" : "Start your first DPP"}
            accent="coral"
            icon={<Flame className="h-4 w-4" />}
          />
          <StatCard
            label="Overall mastery"
            value={mastery > 0 ? `${mastery}%` : "—"}
            hint={modeStats.practice.totalAttempted > 0 ? `${modeStats.practice.accuracy}% DPP accuracy · ${modeStats.practice.totalAttempted} DPP${modeStats.practice.totalAttempted !== 1 ? "s" : ""} attempted` : "Complete a DPP to track"}
            accent="violet"
            icon={<Target className="h-4 w-4" />}
          />
          <StatCard
            label="Study today"
            value={timeToday > 0 ? `${hours}h ${mins}m` : "0h 0m"}
            hint={`${goalPct}% of ${Math.floor(goalMinutes / 60)}h ${goalMinutes % 60}m daily goal`}
            accent="amber"
            icon={<Clock className="h-4 w-4" />}
          />
        </div>

        {/* ── Mode Overview Cards ────────────────────────────────────────── */}
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Learn */}
          <Link
            to="/learn"
            className="group rounded-3xl border border-border/60 bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-mint/50 hover:shadow-[0_0_24px_oklch(0.86_0.18_165_/_12%)]"
          >
            <div className="flex items-center justify-between">
              <div className="grid h-10 w-10 place-items-center rounded-2xl gradient-mint">
                <BookOpen className="h-5 w-5 text-ink" />
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-4 text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">Learn</p>
            <p className="mt-1 font-display text-3xl font-semibold">
              {modeStats.learn.lecturesWatched}
              <span className="text-lg text-muted-foreground font-normal">/{modeStats.learn.totalLectures}</span>
            </p>
            <p className="text-sm text-muted-foreground">lectures completed</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full gradient-mint transition-all duration-700" style={{ width: `${lectureCompletionPct}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {modeStats.learn.quizzesDone > 0
                ? `${modeStats.learn.quizzesDone} quiz${modeStats.learn.quizzesDone !== 1 ? "zes" : ""} · avg ${modeStats.learn.avgQuizScore}%`
                : "Take a quiz after watching"}
            </p>
          </Link>

          {/* DPP */}
          <Link
            to="/practice"
            className="group rounded-3xl border border-border/60 bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-violet/50 hover:shadow-[0_0_24px_oklch(0.68_0.22_295_/_12%)]"
          >
            <div className="flex items-center justify-between">
              <div className="grid h-10 w-10 place-items-center rounded-2xl gradient-violet">
                <Brain className="h-5 w-5 text-ink" />
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-4 text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">DPP</p>
            <p className="mt-1 font-display text-3xl font-semibold">{modeStats.practice.accuracy}%</p>
            <p className="text-sm text-muted-foreground">Score & Accuracy</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full gradient-violet transition-all duration-700" style={{ width: `${modeStats.practice.accuracy}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {modeStats.practice.totalAttempted > 0
                ? `${modeStats.practice.totalAttempted} DPP${modeStats.practice.totalAttempted !== 1 ? "s" : ""} attempted · ${modeStats.practice.accuracy}% accuracy`
                : "Start your first DPP"}
            </p>
          </Link>

          {/* Doubt Solver */}
          <Link
            to="/doubtsolver"
            className="group rounded-3xl border border-border/60 bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-amber/50 hover:shadow-[0_0_24px_oklch(0.85_0.18_85_/_12%)]"
          >
            <div className="flex items-center justify-between">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-amber/20">
                <MessageSquare className="h-5 w-5 text-amber" />
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-4 text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">Doubt Solver</p>
            <p className="mt-1 font-display text-3xl font-semibold">{modeStats.doubt.totalDoubts}</p>
            <p className="text-sm text-muted-foreground">doubts asked</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-amber transition-all duration-700" style={{ width: `${Math.min(100, modeStats.doubt.totalDoubts * 10)}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {modeStats.doubt.totalDoubts >= 10
                ? "Knowledge Seeker 🔍 unlocked"
                : modeStats.doubt.totalDoubts > 0
                ? `${10 - modeStats.doubt.totalDoubts} more to unlock badge`
                : "Ask your first question"}
            </p>
          </Link>

          {/* Voice Coaching */}
          <Link
            to="/interview"
            className="group rounded-3xl border border-border/60 bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-coral/50 hover:shadow-[0_0_24px_oklch(0.75_0.18_30_/_12%)]"
          >
            <div className="flex items-center justify-between">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-coral/20">
                <Mic className="h-5 w-5 text-coral" />
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-4 text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">Voice Coaching</p>
            <p className="mt-1 font-display text-3xl font-semibold">AI</p>
            <p className="text-sm text-muted-foreground">your personal tutor</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-coral transition-all duration-700" style={{ width: "100%" }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Speak naturally · get step-by-step help</p>
          </Link>
        </div>

        {/* ── Charts ─────────────────────────────────────────────────────── */}
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* Performance trend */}
          <div className="rounded-3xl border border-border/60 bg-surface p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display text-xl">Performance trend</p>
                <p className="text-sm text-muted-foreground">DPP scores · last 8 weeks · target line in violet</p>
              </div>
              {performanceTrend.length > 1 && (
                <span className="rounded-full bg-mint/15 px-3 py-1 text-xs text-mint">
                  {(performanceTrend[performanceTrend.length - 1]?.score || 0) >= (performanceTrend[0]?.score || 0)
                    ? `↑ +${(performanceTrend[performanceTrend.length - 1]?.score || 0) - (performanceTrend[0]?.score || 0)}% growth`
                    : `↓ ${(performanceTrend[0]?.score || 0) - (performanceTrend[performanceTrend.length - 1]?.score || 0)}% — keep practicing`}
                </span>
              )}
            </div>
            {performanceTrend.length > 0 ? (
              <div className="mt-6 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={performanceTrend}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="oklch(0.86 0.18 165)" stopOpacity={0.55} />
                        <stop offset="100%" stopColor="oklch(0.86 0.18 165)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="oklch(1 0 0 / 8%)" vertical={false} />
                    <XAxis dataKey="week" stroke="oklch(0.7 0.025 260)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="oklch(0.7 0.025 260)" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        background: "oklch(0.21 0.035 270)",
                        border: "1px solid oklch(1 0 0 / 10%)",
                        borderRadius: 12,
                        color: "white",
                        fontSize: 12,
                      }}
                    />
                    <Area type="monotone" dataKey="target" stroke="oklch(0.68 0.22 295)" strokeDasharray="4 4" fill="transparent" dot={false} />
                    <Area type="monotone" dataKey="score" stroke="oklch(0.86 0.18 165)" strokeWidth={2.5} fill="url(#g1)" dot={{ fill: "oklch(0.86 0.18 165)", r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="mt-6 flex h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-violet/30 bg-violet/5">
                <BarChart2 className="h-10 w-10 text-muted-foreground/40" />
                <div className="text-center">
                  <p className="font-medium text-muted-foreground">No data yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Complete a DPP to track your progress</p>
                </div>
                <Link to="/practice" className="text-sm text-violet hover:underline">Go to Practice →</Link>
              </div>
            )}
          </div>

          {/* Subject radar */}
          <div className="rounded-3xl border border-border/60 bg-surface p-6">
            <p className="font-display text-xl">Subject mastery</p>
            <p className="text-sm text-muted-foreground">Updated after every session</p>
            {subjectRadar.length > 0 ? (
              <div className="mt-2 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={subjectRadar} outerRadius="72%">
                    <PolarGrid stroke="oklch(1 0 0 / 10%)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "oklch(0.78 0.02 260)", fontSize: 11 }} />
                    <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                    <Radar dataKey="score" stroke="oklch(0.86 0.18 165)" fill="oklch(0.86 0.18 165)" fillOpacity={0.3} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="mt-2 flex h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-mint/30 bg-mint/5">
                <Target className="h-10 w-10 text-muted-foreground/40" />
                <div className="text-center">
                  <p className="text-muted-foreground">No subject data yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Practice to see mastery</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Daily Goal + Activity Feed ─────────────────────────────────── */}
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* Daily goal */}
          <div className="rounded-3xl border border-border/60 bg-surface p-6">
            <div className="flex items-center justify-between">
              <p className="font-display text-xl">Today's goal</p>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  goalPct >= 100 ? "bg-mint/15 text-mint" : "bg-muted text-muted-foreground"
                }`}
              >
                {goalPct >= 100 ? "✓ Done!" : `${goalPct}%`}
              </span>
            </div>
            <div className="mt-4 flex items-end gap-2">
              <p className="font-display text-4xl font-semibold">{hours}h {mins}m</p>
              <p className="mb-1 text-sm text-muted-foreground">/ {Math.floor(goalMinutes / 60)}h {goalMinutes % 60}m</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all duration-700 ${goalPct >= 100 ? "gradient-mint" : "bg-violet"}`}
                style={{ width: `${goalPct}%` }}
              />
            </div>

            <div className="mt-5 space-y-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <BookOpen className="h-3.5 w-3.5 text-mint" /> Learn
                </span>
                <span className="font-medium">{modeStats.learn.lecturesWatched} lecture{modeStats.learn.lecturesWatched !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Brain className="h-3.5 w-3.5 text-violet" /> DPP
                </span>
                <span className="font-medium">{modeStats.practice.accuracy}% accuracy</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5 text-amber" /> Doubts
                </span>
                <span className="font-medium">{modeStats.doubt.totalDoubts} asked</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Flame className="h-3.5 w-3.5 text-coral" /> Streak
                </span>
                <span className="font-medium text-coral">{streak} day{streak !== 1 ? "s" : ""}</span>
              </div>
            </div>

            {goalPct < 100 && (
              <div className="mt-5 rounded-2xl border border-violet/20 bg-violet/5 p-3 text-center">
                <p className="text-xs text-muted-foreground">
                  {goalPct === 0
                    ? "Start studying to make progress today 🚀"
                    : goalPct < 50
                    ? "You're getting started — great! Keep it going 💪"
                    : "More than halfway there — finish strong! 🎯"}
                </p>
              </div>
            )}
            {goalPct >= 100 && (
              <div className="mt-5 rounded-2xl border border-mint/30 bg-mint/10 p-3 text-center">
                <p className="text-xs font-medium text-mint">Daily goal complete! Exceptional work 🎉</p>
              </div>
            )}
          </div>

          {/* Activity Feed */}
          <div className="rounded-3xl border border-border/60 bg-surface p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <p className="font-display text-xl">Recent activity</p>
              <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">All modes</span>
            </div>
            {sortedActivity.length > 0 ? (
              <div className="mt-4 space-y-2">
                {sortedActivity.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-border/40 bg-background/30 p-3 transition-colors hover:bg-background/50">
                    <div
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${
                        a.icon === "learn"
                          ? "bg-mint/15 text-mint"
                          : a.icon === "practice"
                          ? "bg-violet/15 text-violet"
                          : "bg-amber/15 text-amber"
                      }`}
                    >
                      {a.icon === "learn" ? (
                        <BookOpen className="h-4 w-4" />
                      ) : a.icon === "practice" ? (
                        <Brain className="h-4 w-4" />
                      ) : (
                        <MessageSquare className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.subtitle}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {a.score !== undefined && a.scoreTotal !== undefined && (
                        <p
                          className={`text-sm font-semibold ${
                            (a.score / a.scoreTotal) * 100 >= 70 ? "text-mint" : "text-coral"
                          }`}
                        >
                          {a.scoreTotal === 100 ? `${a.score}%` : `${a.score}/${a.scoreTotal}`}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">{timeAgo(a.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/20 p-10 text-center">
                <Sparkles className="h-8 w-8 text-muted-foreground/40" />
                <p className="mt-2 font-medium text-muted-foreground">No activity yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Start learning, practicing or asking doubts</p>
                <div className="mt-4 flex gap-2">
                  <Link to="/learn" className="rounded-full border border-mint/30 px-4 py-1.5 text-xs text-mint hover:bg-mint/10 transition-colors">Learn</Link>
                  <Link to="/practice" className="rounded-full border border-violet/30 px-4 py-1.5 text-xs text-violet hover:bg-violet/10 transition-colors">Practice</Link>
                  <Link to="/doubtsolver" className="rounded-full border border-amber/30 px-4 py-1.5 text-xs text-amber hover:bg-amber/10 transition-colors">Ask a Doubt</Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Achievements ──────────────────────────────────────────────── */}
        <div className="mt-6 rounded-3xl border border-border/60 bg-surface p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-xl">Achievements</p>
              <p className="text-sm text-muted-foreground">
                {unlockedCount}/{achievements.length} unlocked
                {unlockedCount > 0 && ` · ${achievements.length - unlockedCount} more to go`}
              </p>
            </div>
            <Trophy className="h-5 w-5 text-amber" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10">
            {achievements.map((a) => (
              <div
                key={a.id}
                title={a.description}
                className={`relative rounded-2xl border p-3 text-center transition-all ${
                  a.unlocked
                    ? "border-amber/40 bg-amber/10 shadow-[0_0_16px_oklch(0.85_0.18_85_/_10%)]"
                    : "border-border/40 bg-background/20 opacity-35 grayscale"
                }`}
              >
                <p className="text-2xl">{a.icon}</p>
                <p className="mt-1 text-xs font-medium leading-tight">{a.title}</p>
                {a.unlocked && (
                  <div className="absolute -top-1 -right-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-amber" />
                  </div>
                )}
              </div>
            ))}
          </div>
          {unlockedCount === 0 && (
            <p className="mt-3 text-center text-sm text-muted-foreground">
              Complete your first activity to start unlocking achievements!
            </p>
          )}
        </div>

        {/* ── Progress Summary ───────────────────────────────────────────── */}
        <div className="mt-6">
          <div className="rounded-3xl border border-border/60 bg-surface p-6">
            <p className="font-display text-xl">Progress summary</p>
            <p className="text-sm text-muted-foreground">Across all modes</p>
            <ul className="mt-5 space-y-2.5">
              <li className="flex items-center justify-between rounded-2xl border border-border/40 bg-background/30 p-3">
                <span className="flex items-center gap-2 text-sm">
                  <BookOpen className="h-3.5 w-3.5 text-mint" /> Lectures
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-mint" style={{ width: `${lectureCompletionPct}%` }} />
                  </div>
                  <p className="w-8 text-right text-xs font-medium">{lectureCompletionPct}%</p>
                </div>
              </li>
              <li className="flex items-center justify-between rounded-2xl border border-border/40 bg-background/30 p-3">
                <span className="flex items-center gap-2 text-sm">
                  <Brain className="h-3.5 w-3.5 text-violet" /> Practice accuracy
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-violet" style={{ width: `${modeStats.practice.accuracy}%` }} />
                  </div>
                  <p className="w-8 text-right text-xs font-medium">{modeStats.practice.accuracy}%</p>
                </div>
              </li>
              <li className="flex items-center justify-between rounded-2xl border border-border/40 bg-background/30 p-3">
                <span className="flex items-center gap-2 text-sm">
                  <Target className="h-3.5 w-3.5 text-amber" /> Mastery score
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-amber" style={{ width: `${mastery}%` }} />
                  </div>
                  <p className="w-8 text-right text-xs font-medium">{mastery}%</p>
                </div>
              </li>
              <li className="flex items-center justify-between rounded-2xl border border-border/40 bg-background/30 p-3">
                <span className="flex items-center gap-2 text-sm">
                  <MessageSquare className="h-3.5 w-3.5 text-amber" /> Doubts resolved
                </span>
                <p className="text-xs font-medium">{modeStats.doubt.totalDoubts}</p>
              </li>
              <li className="flex items-center justify-between rounded-2xl border border-border/40 bg-background/30 p-3">
                <span className="flex items-center gap-2 text-sm">
                  <Flame className="h-3.5 w-3.5 text-coral" /> Practice streak
                </span>
                <p className="text-xs font-medium text-coral">{streak} day{streak !== 1 ? "s" : ""}</p>
              </li>
              <li className="flex items-center justify-between rounded-2xl border border-border/40 bg-background/30 p-3">
                <span className="flex items-center gap-2 text-sm">
                  <Trophy className="h-3.5 w-3.5 text-amber" /> Achievements
                </span>
                <p className="text-xs font-medium">{unlockedCount}/{achievements.length}</p>
              </li>
            </ul>
          </div>
        </div>

        {/* ── Weak Topics ───────────────────────────────────────────────── */}
        <div className="mt-6 rounded-3xl border border-border/60 bg-surface p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-xl">Topics to improve this week</p>
              <p className="text-sm text-muted-foreground">Score &lt; 60% — focus here for best results</p>
            </div>
            {weakTopics.length > 0 && (
              <Link to="/practice" className="text-sm text-mint hover:underline">
                Practice all →
              </Link>
            )}
          </div>
          {weakTopics.length > 0 ? (
            <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {weakTopics.map((w) => (
                <div key={`${w.subject}-${w.topic}`} className="rounded-2xl border border-border/40 bg-background/40 p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{w.subject}</p>
                  <p className="mt-1 font-medium line-clamp-2">{w.topic}</p>
                  <div className="mt-4 flex items-end justify-between">
                    <p className="font-display text-2xl">{w.mastery}%</p>
                    <span
                      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${
                        w.trend === "up" ? "bg-mint/15 text-mint" : "bg-coral/15 text-coral"
                      }`}
                    >
                      {w.trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {w.trend === "up" ? "improving" : "needs work"}
                    </span>
                  </div>
                  <Link
                    to="/practice"
                    className="mt-4 inline-flex w-full items-center justify-center gap-1 rounded-xl border border-border bg-surface py-2 text-xs transition-colors hover:bg-surface-elevated"
                  >
                    Practice <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-mint/30 bg-mint/5 p-12 text-center">
              <div className="space-y-3">
                <div className="flex justify-center">
                  <div className="rounded-full bg-mint/10 p-4">
                    <Target className="h-7 w-7 text-mint" />
                  </div>
                </div>
                <div>
                  <p className="font-semibold">
                    {modeStats.practice.totalAttempted > 0 ? "You're doing great — no weak topics!" : "No weak topics yet"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {modeStats.practice.totalAttempted > 0
                      ? "Keep practicing to maintain and improve your mastery."
                      : "Complete some DPPs to identify areas for improvement."}
                  </p>
                </div>
                <Link
                  to="/practice"
                  className="mt-2 inline-flex items-center gap-2 rounded-full border border-mint/30 px-4 py-2 text-sm text-mint transition-colors hover:bg-mint/10"
                >
                  <Brain className="h-4 w-4" /> Start practicing
                </Link>
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
