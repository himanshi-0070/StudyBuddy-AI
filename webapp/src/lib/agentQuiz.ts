
export type AgentQuiz = {
  subject: string;
  className: string;
  questions: {
    id: string;
    question: string;
    options: [string, string, string, string];
    correctIndex: number;
    topic: string;
    explanation: string;
    isRetry?: boolean;
  }[];
  level: string;
  explanation: string;
};

let pendingQuiz: AgentQuiz | null = null;

export function setAgentQuiz(quiz: AgentQuiz) {
  pendingQuiz = quiz;
}

export function consumeAgentQuiz(): AgentQuiz | null {
  const quiz = pendingQuiz;
  pendingQuiz = null;
  return quiz;
}
