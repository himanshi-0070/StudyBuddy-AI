import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Video,
  FileText,
  UploadCloud,
  Plus,
  Trash2,
  Check,
  ShieldOff,
  ExternalLink,
  Loader2,
  Cpu,
  RefreshCw,
  ChevronDown,
  ScrollText,
  ChevronRight,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { COURSES } from "@/lib/mock-data";
import { useAuth } from "@/context/AuthContext";
import { db, storage, functions } from "@/firebase";
import { ref, uploadBytesResumable } from "firebase/storage";
import {
  collection,
  addDoc,
  setDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin")({
  component: AdminDashboard,
});

type Tab = "lectures" | "pdfs" | "syllabus" | "models";

type GeminiModel = {
  name: string;
  displayName: string;
  supportedMethods: string[];
};

type ModelConfig = {
  useCase: string;
  model: string;
  description: string;
  updatedAt: Date | null;
};

type LectureMaterial = {
  id: string;
  title: string;
  subject: string;
  topic: string;
  url: string;
  fileName: string;
  storagePath: string;
  uploadedAt: Date | null;
};

type StudyMaterial = {
  id: string;
  title: string;
  subject: string;
  class: string;
  url: string;
  fileName: string;
  storagePath: string;
  uploadedAt: Date | null;
};

type SyllabusTopic = {
  name: string;
  subtopics: string[];
};

type SyllabusEntry = {
  id: string;
  subject: string;
  class: string;
  topics: SyllabusTopic[];
  parsedFrom: string;
  updatedAt: Date | null;
};

function AdminDashboard() {
  const { profile, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("lectures");
  const [lectures, setLectures] = useState<LectureMaterial[]>([]);
  const [pdfs, setPdfs] = useState<StudyMaterial[]>([]);

  // Lecture form
  const [lTitle, setLTitle] = useState("");
  const [lSubject, setLSubject] = useState("Physics");
  const [lTopic, setLTopic] = useState("");
  const [lFile, setLFile] = useState<File | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // PDF form
  const [pTitle, setPTitle] = useState("");
  const [pSubject, setPSubject] = useState("Physics");
  const [pClass, setPClass] = useState("12");
  const [pFile, setPFile] = useState<File | null>(null);

  // Syllabus form
  const [sSubject, setSSubject] = useState("Physics");
  const [sClass, setSClass] = useState("12");
  const [sFile, setSFile] = useState<File | null>(null);
  const [syllabi, setSyllabi] = useState<SyllabusEntry[]>([]);
  const [parsingSyllabus, setParsingSyllabus] = useState(false);
  const [syllabusResult, setSyllabusResult] = useState<SyllabusTopic[] | null>(null);

  const CLASS_OPTIONS = ["6", "7", "8", "9", "10", "11", "12", "Dropper", "UG", "PG"];
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Lecture delete confirmation
  const [lectureToDelete, setLectureToDelete] = useState<LectureMaterial | null>(null);
  const [deletingLecture, setDeletingLecture] = useState(false);

  // PDF delete confirmation
  const [pdfToDelete, setPdfToDelete] = useState<StudyMaterial | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Models tab state
  const [geminiModels, setGeminiModels] = useState<GeminiModel[]>([]);
  const [modelConfigs, setModelConfigs] = useState<ModelConfig[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [newUseCase, setNewUseCase] = useState("");
  const [newUseCaseDesc, setNewUseCaseDesc] = useState("");
  const [newUseCaseModel, setNewUseCaseModel] = useState("");
  const [savingModel, setSavingModel] = useState<string | null>(null);

  // Auto-fetch Gemini models when switching to the models tab
  useEffect(() => {
    if (tab === "models" && geminiModels.length === 0 && !modelsLoading) {
      fetchGeminiModels();
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time subscription to models collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "models"), (snap) => {
      setModelConfigs(
        snap.docs.map((d) => ({
          useCase: d.id,
          model: d.data().model ?? "",
          description: d.data().description ?? "",
          updatedAt: d.data().updatedAt?.toDate?.() ?? null,
        }))
      );
    });
    return () => unsub();
  }, []);

  // Load lecture_materials collection from Firestore in real-time
  useEffect(() => {
    const q = query(collection(db, "lecture_materials"), orderBy("uploadedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setLectures(
        snap.docs.map((d) => ({
          id: d.id,
          title: d.data().title ?? "",
          subject: d.data().subject ?? "",
          topic: d.data().topic ?? "",
          url: d.data().url ?? "",
          fileName: d.data().fileName ?? "",
          storagePath: d.data().storagePath ?? "",
          uploadedAt: d.data().uploadedAt?.toDate?.() ?? null,
        }))
      );
    });
    return () => unsub();
  }, []);

  // Load study_material collection from Firestore in real-time
  useEffect(() => {
    const q = query(collection(db, "study_material"), orderBy("uploadedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setPdfs(
        snap.docs.map((d) => ({
          id: d.id,
          title: d.data().title ?? "",
          subject: d.data().subject ?? "",
          class: d.data().class ?? "",
          url: d.data().url ?? "",
          fileName: d.data().fileName ?? "",
          storagePath: d.data().storagePath ?? "",
          uploadedAt: d.data().uploadedAt?.toDate?.() ?? null,
        }))
      );
    });
    return () => unsub();
  }, []);

  // Load syllabus collection from Firestore in real-time
  useEffect(() => {
    const q = query(collection(db, "syllabus"), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setSyllabi(
        snap.docs.map((d) => ({
          id: d.id,
          subject: d.data().subject ?? "",
          class: d.data().class ?? "",
          topics: d.data().topics ?? [],
          parsedFrom: d.data().parsedFrom ?? "",
          updatedAt: d.data().updatedAt?.toDate?.() ?? null,
        }))
      );
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!profile || profile.type !== "admin") {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <ShieldOff className="h-12 w-12 text-destructive/60" />
          <h1 className="font-display text-2xl font-semibold">Access Denied</h1>
          <p className="text-sm text-muted-foreground">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const addLecture = async () => {
    if (!lTitle || !lFile) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const safeSubject = lSubject.replace(/\s+/g, "_");
      const storagePath = `lecture_materials/${safeSubject}/${Date.now()}_${lFile.name}`;
      const storageRef = ref(storage, storagePath);

      // Upload the video to Firebase Storage with progress tracking
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, lFile);
        task.on(
          "state_changed",
          (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          resolve,
        );
      });

      // Finalize on the backend: creates Firestore doc + generates permanent download URL
      const fn = httpsCallable<
        { storagePath: string; title: string; subject: string; topic: string; fileName: string },
        { docId: string; url: string }
      >(functions, "upload_lecture_material");
      await fn({
        storagePath,
        title: lTitle,
        subject: lSubject,
        topic: lTopic || "General",
        fileName: lFile.name,
      });

      setLTitle("");
      setLTopic("");
      setLFile(null);
      flash("Lecture published successfully");
    } catch (err) {
      console.error("Lecture upload failed", err);
      flash("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const addPdf = async () => {
    if (!pTitle || !pFile) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      // 1. Upload PDF to storage (non-blocking)
      const safeSubject = pSubject.replace(/\s+/g, "_");
      const storageRef = ref(storage, `study_material_bucket/${safeSubject}/${Date.now()}_${pFile.name}`);
      
      const uploadTask = uploadBytesResumable(storageRef, pFile);

      uploadTask.on(
        "state_changed",
        (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        (err) => {
          console.error("Upload error", err);
          flash("Upload failed. Please try again.");
          setUploading(false);
          setUploadProgress(0);
        }
      );

      // 2. Save metadata immediately without waiting for upload
      await setDoc(doc(db, "subjects", safeSubject), { name: pSubject }, { merge: true });

      const docRef = await addDoc(collection(db, "study_material"), {
        title: pTitle,
        subject: pSubject,
        class: pClass,
        url: "", // Temporary, will be updated when upload completes
        fileName: pFile.name,
        storagePath: storageRef.fullPath,
        uploadedAt: serverTimestamp(),
      });

      // 3. Update URL in background when upload completes
      uploadTask.then(async () => {
        try {
          const url = await getDownloadURL(storageRef);
          await setDoc(doc(db, "study_material", docRef.id), { url }, { merge: true });
        } catch (err) {
          console.error("Failed to update download URL", err);
        }
      });

      setPTitle("");
      setPFile(null);
      flash("PDF upload started — will be ready shortly");
      setUploading(false);
    } catch (err) {
      console.error("Upload failed", err);
      flash("Upload failed. Please try again.");
      setUploading(false);
    } finally {
      setUploadProgress(0);
    }
  };

  const confirmDeleteLecture = async () => {
    if (!lectureToDelete) return;
    setDeletingLecture(true);
    try {
      const fn = httpsCallable(functions, "delete_lecture_material");
      await fn({ docId: lectureToDelete.id });
      flash("Lecture deleted successfully");
    } catch (err) {
      console.error("Delete failed", err);
      flash("Delete failed. Please try again.");
    } finally {
      setDeletingLecture(false);
      setLectureToDelete(null);
    }
  };

  const confirmDeletePdf = async () => {
    if (!pdfToDelete) return;
    setDeleting(true);
    try {
      const fn = httpsCallable(functions, "delete_study_material");
      await fn({ docId: pdfToDelete.id });
      flash("PDF deleted successfully");
    } catch (err) {
      console.error("Delete failed", err);
      flash("Delete failed. Please try again.");
    } finally {
      setDeleting(false);
      setPdfToDelete(null);
    }
  };

  const parseSyllabus = async () => {
    if (!sFile) return;
    setParsingSyllabus(true);
    setSyllabusResult(null);
    try {
      // 1. Upload PDF to storage without blocking
      const safeSubject = sSubject.replace(/\s+/g, "_");
      const storageRef = ref(
        storage,
        `syllabus_pdfs/${safeSubject}/${sClass}/${Date.now()}_${sFile.name}`
      );

      const uploadTask = uploadBytesResumable(storageRef, sFile);
      let uploadedPath = "";

      uploadTask.on(
        "state_changed",
        undefined,
        (err) => {
          console.error("Upload error", err);
          flash("Upload failed. Please try again.");
          setParsingSyllabus(false);
        },
        () => {
          uploadedPath = storageRef.fullPath;
        }
      );

      // 2. Call the parse_syllabus function immediately with the storage path
      const fn = httpsCallable<unknown, { success: boolean; topics: SyllabusTopic[]; topicCount: number }>(
        functions,
        "parse_syllabus"
      );

      // Start the parsing in the background
      uploadTask.then(async () => {
        try {
          const result = await fn({
            storagePath: uploadedPath,
            subject: sSubject,
            class: sClass,
            fileName: sFile.name,
          });
          setSyllabusResult(result.data.topics);
          flash(`Syllabus parsed — ${result.data.topicCount} topics saved`);
        } catch (err) {
          console.error("Syllabus parse failed", err);
          flash("Syllabus parse failed. Please try again.");
        } finally {
          setParsingSyllabus(false);
        }
      });

      setSFile(null);
      flash("Syllabus upload started — parsing in progress");
    } catch (err) {
      console.error("Syllabus parse failed", err);
      flash("Syllabus upload failed. Please try again.");
      setParsingSyllabus(false);
    }
  };

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const fetchGeminiModels = async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const fn = httpsCallable<unknown, { availableModels: GeminiModel[]; configuredModels: unknown[] }>(
        functions,
        "list_gemini_models"
      );
      const result = await fn({});
      setGeminiModels(result.data.availableModels);
      // configuredModels come from the onSnapshot subscription — ignore the callable's copy
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load models.";
      setModelsError(msg);
    } finally {
      setModelsLoading(false);
    }
  };

  const saveModelConfig = async (useCase: string, model: string, description: string) => {
    if (!useCase || !model) return;
    setSavingModel(useCase);
    try {
      await setDoc(
        doc(db, "models", useCase),
        { model, description, updatedAt: serverTimestamp() },
        { merge: true }
      );
      // modelConfigs updates automatically via onSnapshot
      flash(`Model saved for "${useCase}"`);
    } catch (err) {
      console.error("Failed to save model config", err);
      flash("Failed to save. Please try again.");
    } finally {
      setSavingModel(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber">Mentor / Admin</p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Content studio
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Upload lectures, notes and structure courses that power every learner's roadmap.
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <Stat label="Lectures" value={lectures.length} />
            <Stat label="PDFs" value={pdfs.length} />
            <Stat label="Syllabi" value={syllabi.length} />
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-8 inline-flex rounded-full border border-border bg-surface p-1">
          {(
            [
              { id: "lectures", label: "Lectures", icon: Video },
              { id: "pdfs", label: "Study material", icon: FileText },
              { id: "syllabus", label: "Syllabus", icon: ScrollText },
              { id: "models", label: "AI Models", icon: Cpu },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition-colors ${
                tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-8">
          {tab === "lectures" && (
            <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
              <div className="rounded-3xl border border-border bg-surface p-6">
                <p className="font-display text-lg">Upload a new lecture</p>
                <div className="mt-5 grid gap-3">
                  <Input label="Title" value={lTitle} onChange={setLTitle} placeholder="e.g. Rotational Dynamics — Part 1" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select label="Subject" value={lSubject} onChange={setLSubject} options={COURSES.map((c) => c.name)} />
                    <Input label="Topic" value={lTopic} onChange={setLTopic} placeholder="Moment of Inertia" />
                  </div>
                  <FileDrop
                    accept="video/*"
                    file={lFile}
                    onFile={setLFile}
                    hint="MP4, MOV · up to 2 GB"
                    icon={Video}
                    maxSize={2 * 1024 * 1024 * 1024}
                    onSizeError={flash}
                  />
                  {uploading && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Uploading…</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <button
                    onClick={addLecture}
                    disabled={!lTitle || !lFile || uploading}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground ring-glow disabled:opacity-40"
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    {uploading ? "Uploading…" : "Publish lecture"}
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-border bg-surface p-6">
                <p className="font-display text-lg">Recent lectures</p>
                {lectures.length === 0 ? (
                  <p className="mt-5 text-sm text-muted-foreground">No lectures uploaded yet.</p>
                ) : (
                  <div className="mt-5 space-y-2">
                    {lectures.map((l) => (
                      <div
                        key={l.id}
                        className="flex items-center justify-between rounded-2xl border border-border bg-surface-elevated p-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted">
                            <Video className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{l.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {l.subject} · {l.topic}
                              {l.uploadedAt
                                ? ` · ${l.uploadedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                                : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <a
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
                            aria-label="Play video"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                          <button
                            onClick={() => setLectureToDelete(l)}
                            className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-coral/20 hover:text-coral"
                            aria-label="Delete lecture"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "pdfs" && (
            <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
              <div className="rounded-3xl border border-border bg-surface p-6">
                <p className="font-display text-lg">Upload study material</p>
                <div className="mt-5 grid gap-3">
                  <Input label="Title" value={pTitle} onChange={setPTitle} placeholder="JEE Physics — Rotational PYQs" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select label="Subject" value={pSubject} onChange={setPSubject} options={COURSES.map((c) => c.name)} />
                    <Select label="Class" value={pClass} onChange={setPClass} options={CLASS_OPTIONS} />
                  </div>
                  <FileDrop
                    accept=".pdf"
                    file={pFile}
                    onFile={setPFile}
                    hint="PDF · up to 50 MB"
                    icon={FileText}
                    maxSize={50 * 1024 * 1024}
                    onSizeError={flash}
                  />
                  {uploading && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Uploading…</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <button
                    onClick={addPdf}
                    disabled={!pTitle || !pFile || uploading}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground ring-glow disabled:opacity-40"
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    {uploading ? "Uploading…" : "Publish PDF"}
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-border bg-surface p-6">
                <p className="font-display text-lg">Library</p>
                {pdfs.length === 0 ? (
                  <p className="mt-5 text-sm text-muted-foreground">No study material uploaded yet.</p>
                ) : (
                  <div className="mt-5 space-y-2">
                    {pdfs.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-2xl border border-border bg-surface-elevated p-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 place-items-center rounded-xl bg-muted">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{p.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {p.subject}{p.class ? ` · Class ${p.class}` : ""}
                              {p.uploadedAt
                                ? ` · ${p.uploadedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                                : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
                            aria-label="Open PDF"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                          <button
                            onClick={() => setPdfToDelete(p)}
                            className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-coral/20 hover:text-coral"
                            aria-label="Delete PDF"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "syllabus" && (
            <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
              {/* Upload form */}
              <div className="rounded-3xl border border-border bg-surface p-6">
                <p className="font-display text-lg">Upload syllabus PDF</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Gemini will extract every topic and subtopic and save them to the syllabus collection.
                </p>
                <div className="mt-5 grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select label="Subject" value={sSubject} onChange={setSSubject} options={COURSES.map((c) => c.name)} />
                    <Select label="Class" value={sClass} onChange={setSClass} options={CLASS_OPTIONS} />
                  </div>
                  <FileDrop
                    accept=".pdf"
                    file={sFile}
                    onFile={setSFile}
                    hint="PDF · up to 50 MB"
                    icon={ScrollText}
                    maxSize={50 * 1024 * 1024}
                    onSizeError={flash}
                  />
                  {parsingSyllabus && (
                    <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface-elevated px-4 py-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      Uploading and parsing syllabus with AI…
                    </div>
                  )}
                  <button
                    onClick={parseSyllabus}
                    disabled={!sFile || parsingSyllabus}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground ring-glow disabled:opacity-40"
                  >
                    {parsingSyllabus ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ScrollText className="h-4 w-4" />
                    )}
                    {parsingSyllabus ? "Parsing…" : "Parse & save syllabus"}
                  </button>
                </div>

                {/* Inline preview of last parsed result */}
                {syllabusResult && syllabusResult.length > 0 && (
                  <div className="mt-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Parsed topics ({syllabusResult.length})
                    </p>
                    <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                      {syllabusResult.map((topic, i) => (
                        <div key={i} className="rounded-xl border border-border bg-surface-elevated px-3 py-2">
                          <p className="text-sm font-medium">{topic.name}</p>
                          {topic.subtopics.length > 0 && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {topic.subtopics.join(" · ")}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Saved syllabi list */}
              <div className="rounded-3xl border border-border bg-surface p-6">
                <p className="font-display text-lg">Saved syllabi</p>
                {syllabi.length === 0 ? (
                  <p className="mt-5 text-sm text-muted-foreground">No syllabi uploaded yet.</p>
                ) : (
                  <div className="mt-5 space-y-3 max-h-[600px] overflow-y-auto pr-1">
                    {syllabi.map((s) => (
                      <details
                        key={s.id}
                        className="group rounded-2xl border border-border bg-surface-elevated"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted">
                              <ScrollText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {s.subject} · Class {s.class}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {s.topics.length} topics
                                {s.parsedFrom ? ` · ${s.parsedFrom}` : ""}
                                {s.updatedAt
                                  ? ` · ${s.updatedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                                  : ""}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                        </summary>
                        <div className="border-t border-border px-4 py-3 space-y-1.5">
                          {s.topics.map((topic, i) => (
                            <div key={i}>
                              <p className="text-sm font-medium">{topic.name}</p>
                              {topic.subtopics.length > 0 && (
                                <p className="mt-0.5 text-xs text-muted-foreground pl-3">
                                  {topic.subtopics.join(" · ")}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "models" && (
            <ModelsTab
              geminiModels={geminiModels}
              modelConfigs={modelConfigs}
              loading={modelsLoading}
              error={modelsError}
              savingModel={savingModel}
              newUseCase={newUseCase}
              newUseCaseDesc={newUseCaseDesc}
              newUseCaseModel={newUseCaseModel}
              onNewUseCase={setNewUseCase}
              onNewUseCaseDesc={setNewUseCaseDesc}
              onNewUseCaseModel={setNewUseCaseModel}
              onFetch={fetchGeminiModels}
              onSave={saveModelConfig}
            />
          )}
        </div>

        {/* Lecture delete confirmation dialog */}
        <Dialog open={!!lectureToDelete} onOpenChange={(open) => { if (!open && !deletingLecture) setLectureToDelete(null); }}>
          <DialogContent className="rounded-3xl">
            <DialogHeader>
              <DialogTitle>Delete lecture?</DialogTitle>
              <DialogDescription>
                <span className="font-medium text-foreground">{lectureToDelete?.title}</span> will be permanently removed from storage. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-2 flex gap-2">
              <button
                onClick={() => setLectureToDelete(null)}
                disabled={deletingLecture}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-surface-elevated disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteLecture}
                disabled={deletingLecture}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-coral px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {deletingLecture ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deletingLecture ? "Deleting…" : "Delete"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* PDF delete confirmation dialog */}
        <Dialog open={!!pdfToDelete} onOpenChange={(open) => { if (!open && !deleting) setPdfToDelete(null); }}>
          <DialogContent className="rounded-3xl">
            <DialogHeader>
              <DialogTitle>Delete study material?</DialogTitle>
              <DialogDescription>
                <span className="font-medium text-foreground">{pdfToDelete?.title}</span> will be permanently removed from storage and the library. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-2 flex gap-2">
              <button
                onClick={() => setPdfToDelete(null)}
                disabled={deleting}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-surface-elevated disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletePdf}
                disabled={deleting}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-coral px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground ring-glow"
          >
            <Check className="h-4 w-4" /> {toast}
          </motion.div>
        )}
      </main>
    </div>
  );
}

function ModelsTab({
  geminiModels,
  modelConfigs,
  loading,
  error,
  savingModel,
  newUseCase,
  newUseCaseDesc,
  newUseCaseModel,
  onNewUseCase,
  onNewUseCaseDesc,
  onNewUseCaseModel,
  onFetch,
  onSave,
}: {
  geminiModels: GeminiModel[];
  modelConfigs: ModelConfig[];
  loading: boolean;
  error: string | null;
  savingModel: string | null;
  newUseCase: string;
  newUseCaseDesc: string;
  newUseCaseModel: string;
  onNewUseCase: (v: string) => void;
  onNewUseCaseDesc: (v: string) => void;
  onNewUseCaseModel: (v: string) => void;
  onFetch: () => void;
  onSave: (useCase: string, model: string, description: string) => void;
}) {
  // Per-row pending selections before saving
  const [pending, setPending] = useState<Record<string, string>>({});

  const setPendingFor = (useCase: string, model: string) =>
    setPending((p) => ({ ...p, [useCase]: model }));

  const notLoaded = geminiModels.length === 0 && !loading && !error;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      {/* Left: configured use-cases */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-display text-lg">Configured models</p>
          <button
            onClick={onFetch}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs hover:bg-surface-elevated disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : notLoaded ? "Load models" : "Refresh"}
          </button>
        </div>

        {error && (
          <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {modelConfigs.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">No model assignments yet. Add one below.</p>
        )}

        <div className="space-y-3">
          {modelConfigs.map((cfg) => {
            const selected = pending[cfg.useCase] ?? cfg.model;
            const isSaving = savingModel === cfg.useCase;
            return (
              <div key={cfg.useCase} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium capitalize">{cfg.useCase.replace(/_/g, " ")}</p>
                    {cfg.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{cfg.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => onSave(cfg.useCase, selected, cfg.description)}
                    disabled={isSaving || selected === cfg.model}
                    className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
                  >
                    {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Save
                  </button>
                </div>
                <div className="mt-3 relative">
                  <select
                    value={selected}
                    onChange={(e) => setPendingFor(cfg.useCase, e.target.value)}
                    disabled={geminiModels.length === 0}
                    className="w-full appearance-none rounded-xl border border-border bg-surface-elevated px-3 py-2 pr-8 text-sm outline-none focus:border-primary disabled:opacity-50"
                  >
                    <option value={cfg.model}>{cfg.model}</option>
                    {geminiModels
                      .filter((m) => m.name !== cfg.model)
                      .map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.displayName || m.name}
                        </option>
                      ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
                {cfg.updatedAt && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Updated {cfg.updatedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: add new use-case + available models list */}
      <div className="space-y-4">
        <div className="rounded-3xl border border-border bg-surface p-6">
          <p className="font-display text-lg">Add use case</p>
          <div className="mt-4 grid gap-3">
            <Input
              label="Use case ID"
              value={newUseCase}
              onChange={onNewUseCase}
              placeholder="e.g. embedding_model"
            />
            <Input
              label="Description"
              value={newUseCaseDesc}
              onChange={onNewUseCaseDesc}
              placeholder="Used to generate embeddings for RAG"
            />
            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Model</span>
              <div className="relative mt-1">
                <select
                  value={newUseCaseModel}
                  onChange={(e) => onNewUseCaseModel(e.target.value)}
                  disabled={geminiModels.length === 0}
                  className="w-full appearance-none rounded-2xl border border-border bg-surface-elevated px-4 py-2.5 pr-9 text-sm outline-none focus:border-primary disabled:opacity-50"
                >
                  <option value="">
                    {geminiModels.length === 0 ? "Load models first ↑" : "Select a model…"}
                  </option>
                  {geminiModels.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.displayName || m.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </label>
            <button
              onClick={() => {
                onSave(newUseCase.trim(), newUseCaseModel, newUseCaseDesc.trim());
                onNewUseCase("");
                onNewUseCaseDesc("");
                onNewUseCaseModel("");
              }}
              disabled={!newUseCase.trim() || !newUseCaseModel || savingModel === newUseCase.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground ring-glow disabled:opacity-40"
            >
              {savingModel === newUseCase.trim() ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add use case
            </button>
          </div>
        </div>

        {geminiModels.length > 0 && (
          <div className="rounded-3xl border border-border bg-surface p-6">
            <p className="font-display text-lg">Available Gemini models</p>
            <div className="mt-4 space-y-2 max-h-72 overflow-y-auto pr-1">
              {geminiModels.map((m) => (
                <div key={m.name} className="rounded-2xl border border-border bg-surface-elevated px-4 py-3">
                  <p className="text-sm font-medium">{m.displayName || m.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{m.name}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {m.supportedMethods.map((method) => (
                      <span
                        key={method}
                        className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {method}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-2">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="font-display text-lg">{value}</p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <input
        id={`input-${label.replace(/\s+/g, '-').toLowerCase()}`}
        name={`input-${label.replace(/\s+/g, '-').toLowerCase()}`}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-2xl border border-border bg-surface-elevated px-4 py-2.5 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-2xl border border-border bg-surface-elevated px-4 py-2.5 text-sm outline-none focus:border-primary"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function FileDrop({
  accept,
  file,
  onFile,
  hint,
  icon: Icon,
  maxSize,
  onSizeError,
}: {
  accept: string;
  file: File | string | null;
  onFile: (f: File) => void;
  hint: string;
  icon: typeof Video;
  maxSize?: number; // in bytes
  onSizeError?: (msg: string) => void;
}) {
  const displayName = file instanceof File ? file.name : file;
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface-elevated p-6 text-center transition-colors hover:border-primary">
      {displayName ? (
        <>
          <div className="grid h-10 w-10 place-items-center rounded-xl gradient-mint">
            <Icon className="h-5 w-5 text-ink" />
          </div>
          <p className="text-sm font-medium">{displayName}</p>
          <p className="text-xs text-muted-foreground">Tap to replace</p>
        </>
      ) : (
        <>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-muted">
            <UploadCloud className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium">Drop a file</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </>
      )}
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            if (maxSize && f.size > maxSize) {
              const maxSizeMB = Math.round(maxSize / 1024 / 1024);
              const fileSizeMB = Math.round(f.size / 1024 / 1024);
              onSizeError?.(
                `File is too large (${fileSizeMB}MB). Maximum allowed: ${maxSizeMB}MB`
              );
              return;
            }
            onFile(f);
          }
        }}
      />
    </label>
  );
}
