export type Goal = {
  id: string;
  label: string;
  category: string;
  description: string;
};

export const STREAM_GOALS: Record<string, Goal[]> = {
  Science: [
    {
      id: "jee",
      label: "JEE",
      category: "Engineering",
      description: "IITs, NITs & top engineering colleges",
    },
    {
      id: "neet",
      label: "NEET",
      category: "Medical",
      description: "MBBS, BDS & allied medical sciences",
    },
    {
      id: "nest",
      label: "NEST",
      category: "Research",
      description: "National Entrance Screening Test",
    },
    {
      id: "iiser",
      label: "IISER",
      category: "Research",
      description: "Indian Institutes of Science Education & Research",
    },
  ],
  Commerce: [
    { id: "cat", label: "CAT", category: "Management", description: "IIMs and top B-schools" },
    {
      id: "cuet",
      label: "CUET",
      category: "University",
      description: "Central university entrance",
    },
    { id: "ca", label: "CA", category: "Finance", description: "Chartered Accountancy" },
    { id: "cs", label: "CS", category: "Finance", description: "Company Secretary" },
  ],
  Arts: [
    { id: "upsc", label: "UPSC", category: "Civil Services", description: "IAS, IPS, IFS" },
    {
      id: "ssc-cgl",
      label: "SSC-CGL",
      category: "Government",
      description: "Staff Selection Commission",
    },
    { id: "clat", label: "CLAT", category: "Law", description: "National Law Universities" },
    {
      id: "state-pcs",
      label: "State PCS",
      category: "Civil Services",
      description: "State Public Service Commission",
    },
  ],
};

export const BOARDS = ["CBSE", "ICSE", "State Board"] as const;
export const DISABILITIES = [
  { id: "none", label: "None" },
  { id: "blind", label: "Blind (Visually impaired)" },
  { id: "deaf", label: "Deaf (Hearing impaired)" },
  { id: "mute", label: "Mute (Speech impaired)" },
] as const;

export const ASSESSMENT_QUESTIONS = [
  {
    id: 1,
    level: "School",
    question: "If f(x) = 2x + 3, what is f(4)?",
    options: ["9", "11", "10", "14"],
    answer: 1,
  },
  {
    id: 2,
    level: "School",
    question: "Acceleration due to gravity (average) on Earth is:",
    options: ["9.8 m/s²", "8.9 m/s²", "10.8 m/s²", "11 m/s²"],
    answer: 0,
  },
  {
    id: 3,
    level: "School",
    question: "The chemical symbol for Sodium is:",
    options: ["So", "Sd", "Na", "S"],
    answer: 2,
  },
  {
    id: 4,
    level: "Competitive",
    question: "∫ x·e^x dx equals:",
    options: ["x·e^x + C", "e^x(x − 1) + C", "e^x(x + 1) + C", "x²·e^x/2 + C"],
    answer: 1,
  },
  {
    id: 5,
    level: "Competitive",
    question: "A ball is thrown up at 20 m/s. Max height (g=10):",
    options: ["10 m", "20 m", "40 m", "15 m"],
    answer: 1,
  },
  {
    id: 6,
    level: "Competitive",
    question: "Hybridisation of carbon in CO₂:",
    options: ["sp", "sp²", "sp³", "dsp²"],
    answer: 0,
  },
  {
    id: 7,
    level: "Competitive",
    question: "Rank of matrix [[1,2],[2,4]] is:",
    options: ["0", "1", "2", "Undefined"],
    answer: 1,
  },
  {
    id: 8,
    level: "Competitive",
    question: "SI unit of magnetic flux:",
    options: ["Tesla", "Weber", "Henry", "Gauss"],
    answer: 1,
  },
  {
    id: 9,
    level: "Competitive",
    question: "pH of 0.01 M HCl:",
    options: ["1", "2", "3", "12"],
    answer: 1,
  },
  {
    id: 10,
    level: "Competitive",
    question: "Derivative of sin(x²) is:",
    options: ["cos(x²)", "2x·cos(x²)", "2·cos(x²)", "x·cos(x²)"],
    answer: 1,
  },
];

export const PI_QUESTIONS = [
  {
    id: 1,
    topic: "Introduction",
    question: "Tell me about yourself and why you chose this stream.",
  },
  { id: 2, topic: "Physics", question: "Explain Newton's third law with a real-world example." },
  {
    id: 3,
    topic: "Current Affairs",
    question: "What is your opinion on India's space mission progress?",
  },
  {
    id: 4,
    topic: "Aptitude",
    question: "How would you approach solving a problem you've never seen before?",
  },
  { id: 5, topic: "Closing", question: "Where do you see yourself in 5 years?" },
];

export const COURSES = [
  { id: "physics", name: "Physics", icon: "⚛️", lectures: 124, pdfs: 48 },
  { id: "chemistry", name: "Chemistry", icon: "🧪", lectures: 98, pdfs: 36 },
  { id: "maths", name: "Maths", icon: "📐", lectures: 156, pdfs: 52 },
  { id: "commerce", name: "Commerce", icon: "💼", lectures: 72, pdfs: 28 },
  { id: "arts", name: "Arts", icon: "🎨", lectures: 64, pdfs: 22 },
];

export const DEGREE_COURSES = {
  UG: [
    { id: "btech", label: "B.Tech", category: "Engineering" },
    { id: "bsc", label: "B.Sc", category: "Science" },
    { id: "bba", label: "BBA", category: "Management" },
    { id: "bcom", label: "B.Com", category: "Commerce" },
  ],
  PG: [
    { id: "mtech", label: "M.Tech", category: "Engineering" },
    { id: "msc", label: "M.Sc", category: "Science" },
    { id: "mba", label: "MBA", category: "Management" },
    { id: "mcom", label: "M.Com", category: "Commerce" },
  ],
} as const;

export const COURSE_BRANCHES = {
  btech: [
    { id: "cse", label: "Computer Science & Engineering" },
    { id: "mech", label: "Mechanical Engineering" },
    { id: "civil", label: "Civil Engineering" },
    { id: "eee", label: "Electrical & Electronics Engineering" },
    { id: "ece", label: "Electronics & Communication Engineering" },
  ],
  mtech: [
    { id: "cse", label: "Computer Science & Engineering" },
    { id: "mech", label: "Mechanical Engineering" },
    { id: "civil", label: "Civil Engineering" },
    { id: "eee", label: "Electrical & Electronics Engineering" },
    { id: "ece", label: "Electronics & Communication Engineering" },
  ],
  bsc: [
    { id: "physics", label: "Physics" },
    { id: "chemistry", label: "Chemistry" },
    { id: "maths", label: "Mathematics" },
    { id: "biology", label: "Biology" },
    { id: "computer_science", label: "Computer Science" },
  ],
  msc: [
    { id: "physics", label: "Physics" },
    { id: "chemistry", label: "Chemistry" },
    { id: "maths", label: "Mathematics" },
    { id: "biology", label: "Biology" },
    { id: "computer_science", label: "Computer Science" },
  ],
  bba: [
    { id: "finance", label: "Finance" },
    { id: "marketing", label: "Marketing" },
    { id: "hr", label: "Human Resources" },
    { id: "operations", label: "Operations Management" },
    { id: "international_business", label: "International Business" },
  ],
  mba: [
    { id: "finance", label: "Finance" },
    { id: "marketing", label: "Marketing" },
    { id: "hr", label: "Human Resources" },
    { id: "operations", label: "Operations Management" },
    { id: "international_business", label: "International Business" },
  ],
  bcom: [
    { id: "accounting", label: "Accounting & Finance" },
    { id: "taxation", label: "Taxation" },
    { id: "auditing", label: "Auditing" },
    { id: "business_law", label: "Business Law" },
    { id: "economics", label: "Economics" },
  ],
  mcom: [
    { id: "accounting", label: "Accounting & Finance" },
    { id: "taxation", label: "Taxation" },
    { id: "auditing", label: "Auditing" },
    { id: "business_law", label: "Business Law" },
    { id: "economics", label: "Economics" },
  ],
} as const;

export const ADMIN_LECTURES = [
  {
    id: "l1",
    title: "Rotational Dynamics — Moment of Inertia",
    subject: "Physics",
    topic: "Rotational Motion",
    difficulty: "Hard",
    duration: "42 min",
    uploaded: "2 days ago",
  },
  {
    id: "l2",
    title: "Coordination Compounds — Intro",
    subject: "Chemistry",
    topic: "Inorganic",
    difficulty: "Medium",
    duration: "36 min",
    uploaded: "5 days ago",
  },
  {
    id: "l3",
    title: "3D Geometry — Direction Cosines",
    subject: "Maths",
    topic: "3D Geometry",
    difficulty: "Medium",
    duration: "48 min",
    uploaded: "1 week ago",
  },
];

export const ADMIN_PDFS = [
  {
    id: "p1",
    title: "JEE Physics — Rotational PYQs",
    subject: "Physics",
    pages: 24,
    size: "3.2 MB",
  },
  {
    id: "p2",
    title: "NEET Biology — Genetics Notes",
    subject: "Biology",
    pages: 58,
    size: "8.1 MB",
  },
  { id: "p3", title: "CAT Quant — Number Theory", subject: "Commerce", pages: 41, size: "4.7 MB" },
];

export const PERFORMANCE_TREND = [
  { week: "W1", score: 48, target: 60 },
  { week: "W2", score: 55, target: 62 },
  { week: "W3", score: 61, target: 64 },
  { week: "W4", score: 58, target: 66 },
  { week: "W5", score: 67, target: 68 },
  { week: "W6", score: 72, target: 70 },
  { week: "W7", score: 78, target: 72 },
  { week: "W8", score: 84, target: 74 },
];

export const SUBJECT_RADAR = [
  { subject: "Physics", score: 72, fullMark: 100 },
  { subject: "Chemistry", score: 84, fullMark: 100 },
  { subject: "Math", score: 65, fullMark: 100 },
  { subject: "Biology", score: 78, fullMark: 100 },
  { subject: "English", score: 88, fullMark: 100 },
  { subject: "Logic", score: 70, fullMark: 100 },
];

export const WEAK_TOPICS = [
  { topic: "Rotational Dynamics", subject: "Physics", mastery: 42, trend: "down" as const },
  { topic: "Coordination Compounds", subject: "Chemistry", mastery: 51, trend: "up" as const },
  { topic: "3D Geometry", subject: "Math", mastery: 38, trend: "down" as const },
  { topic: "Human Reproduction", subject: "Biology", mastery: 56, trend: "up" as const },
];

export const ROADMAP = [
  {
    phase: "Foundation",
    months: "Months 1–4",
    focus: "Build conceptual base — NCERT mastery",
    progress: 100,
    color: "mint" as const,
  },
  {
    phase: "Consolidation",
    months: "Months 5–10",
    focus: "Topic-wise PYQs, weekly mocks, error logs",
    progress: 64,
    color: "violet" as const,
  },
  {
    phase: "Acceleration",
    months: "Months 11–18",
    focus: "Advanced problems, full-length tests",
    progress: 12,
    color: "amber" as const,
  },
  {
    phase: "Peak",
    months: "Months 19–24",
    focus: "Revision, simulation, mental conditioning",
    progress: 0,
    color: "coral" as const,
  },
];

export const TODAY_SCHEDULE = [
  { time: "07:00", title: "Physics — Rotational Dynamics", type: "Lecture", duration: "45 min" },
  { time: "08:30", title: "DPP — Mechanics Mixed", type: "Practice", duration: "30 min" },
  {
    time: "10:00",
    title: "Chemistry — Coordination Compounds",
    type: "Lecture",
    duration: "50 min",
  },
  { time: "16:00", title: "Math — 3D Geometry", type: "Lecture", duration: "55 min" },
  { time: "18:00", title: "Subjective — Bio Long Answer", type: "Eval", duration: "25 min" },
  { time: "20:00", title: "Weekly Mock #07", type: "Mock", duration: "180 min" },
];

export const MCQ_BANK = [
  {
    id: 1,
    question:
      "A solid sphere rolls down an incline without slipping. What fraction of its kinetic energy is rotational?",
    options: ["1/2", "2/5", "2/7", "1/7"],
    answer: 2,
    explanation:
      "For a solid sphere, I = (2/5)MR². Rotational KE / Total KE = (2/5) / (1 + 2/5) = 2/7.",
  },
  {
    id: 2,
    question: "Which of the following is a chelating ligand?",
    options: ["NH₃", "Cl⁻", "EDTA⁴⁻", "H₂O"],
    answer: 2,
    explanation:
      "EDTA⁴⁻ is a hexadentate chelating ligand — it binds the metal ion through six donor atoms.",
  },
  {
    id: 3,
    question:
      "The shortest distance between the lines (x-1)/2 = (y+1)/3 = z/1 and x/1 = (y-2)/2 = (z+1)/3 is approximately:",
    options: ["1.41", "0.93", "2.05", "0.41"],
    answer: 1,
    explanation:
      "Using the shortest distance formula |(a₂-a₁)·(b₁×b₂)| / |b₁×b₂|, we get ≈ 0.93 units.",
  },
  {
    id: 4,
    question: "In meiosis, crossing over occurs during:",
    options: ["Leptotene", "Zygotene", "Pachytene", "Diplotene"],
    answer: 2,
    explanation:
      "Crossing over — the exchange of segments between non-sister chromatids — happens in pachytene of prophase I.",
  },
  {
    id: 5,
    question: "If sin x + cos x = 1, then sin 2x equals:",
    options: ["0", "1", "-1", "1/2"],
    answer: 0,
    explanation: "Squaring both sides: 1 + 2 sin x cos x = 1 ⇒ sin 2x = 0.",
  },
];

export const SUBJECTIVE_FEEDBACK = {
  score: 78,
  breakdown: [
    {
      criteria: "Content Accuracy",
      weight: 50,
      scored: 41,
      comment: "Core mechanism described correctly. Missed role of NADPH in dark reactions.",
    },
    {
      criteria: "Concept Clarity",
      weight: 20,
      scored: 16,
      comment: "Good logical flow, but the link between light and dark reactions could be sharper.",
    },
    {
      criteria: "Structure",
      weight: 15,
      scored: 12,
      comment: "Used headings well. Add a labelled diagram for full marks.",
    },
    {
      criteria: "Keywords",
      weight: 15,
      scored: 9,
      comment: "Missing: photolysis, chemiosmosis, Z-scheme.",
    },
  ],
  highlights: [
    { type: "good" as const, text: "Strong opening definition of photosynthesis." },
    { type: "warn" as const, text: "Equation for light reaction is incomplete." },
    { type: "bad" as const, text: "Calvin cycle steps stated out of order." },
  ],
  ideal:
    "Photosynthesis is the anabolic process by which green plants synthesise glucose from CO₂ and H₂O using light energy. It occurs in two phases — the light-dependent reactions in thylakoids (involving photolysis of water, the Z-scheme of electron transport, and chemiosmotic ATP synthesis) and the light-independent Calvin cycle in the stroma (carboxylation, reduction, regeneration). The overall equation: 6CO₂ + 12H₂O → C₆H₁₂O₆ + 6O₂ + 6H₂O.",
};

export const DOUBT_THREAD = [
  {
    from: "user" as const,
    text: "Why is the second ionisation enthalpy of Na so much higher than the first?",
  },
  {
    from: "ai" as const,
    text: "Once Na loses its single 3s electron, it attains the stable [Ne] noble-gas configuration. Removing the next electron means breaking into a fully-filled inner shell, where electrons are much closer to the nucleus and far more tightly held. So IE₂ jumps dramatically — roughly 10× IE₁.",
  },
];
