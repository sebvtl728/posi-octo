export interface Questionnaire {
  id: string;
  name: string;
  content: string; // JSON sérialisé
  isActive: boolean;
  categoriesCount: number;
  questionsCount: number;
  createdAt: string;
  folderId?: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string;
  createdAt: string;
}

export interface QuestionnaireData {
  title: string;
  categories: {
    name: string;
    questions: {
      question: string;
      expectedAnswers: string[];
      hint?: string;
    }[];
  }[];
}

export interface HTMLTemplate {
  id: string;
  name: string;
  htmlContent: string;
  type: 'entry_self_assessment' | 'exit_assessment';
  createdAt: string;
}

export interface Session {
  id: string;
  questionnaireId?: string;
  userName: string;
  type: 'individual' | 'collective' | 'positioning' | 'entry_self_assessment' | 'exit_assessment';
  status: 'pending' | 'active' | 'completed';
  createdAt: string;
  completedAt?: string;
  currentQuestionIndex?: number;
  scores?: Record<string, number>;
  formData?: Record<string, any>;
  signatureData?: string;
  signatureDate?: string;
  entryTemplateId?: string;
  exitTemplateId?: string;
  entryCompleted?: boolean;
  entryCompletedAt?: string;
  isArchived?: boolean;
}

export interface Message {
  id?: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}
