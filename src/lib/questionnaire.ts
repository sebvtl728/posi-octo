import {
  collection, doc, addDoc, updateDoc, getDocs, getDoc,
  onSnapshot
} from 'firebase/firestore';
import { db } from './firebase';
import type { Questionnaire, QuestionnaireData } from '../types';

export function validateQuestionnaireJSON(content: string): QuestionnaireData {
  const parsed = JSON.parse(content);
  if (!parsed.title || !Array.isArray(parsed.categories)) {
    throw new Error('Le JSON doit avoir un champ "title" et un tableau "categories".');
  }
  for (const cat of parsed.categories) {
    if (!cat.name || !Array.isArray(cat.questions)) {
      throw new Error('Chaque catégorie doit avoir un "name" et un tableau "questions".');
    }
  }
  return parsed as QuestionnaireData;
}

export async function addQuestionnaire(name: string, content: string): Promise<string> {
  const parsed = validateQuestionnaireJSON(content);
  const categoriesCount = parsed.categories.length;
  const questionsCount = parsed.categories.reduce((sum, c) => sum + c.questions.length, 0);
  const ref = await addDoc(collection(db, 'questionnaires'), {
    name,
    content,
    isActive: false,
    categoriesCount,
    questionsCount,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function getQuestionnaires(): Promise<Questionnaire[]> {
  const snap = await getDocs(collection(db, 'questionnaires'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Questionnaire));
}

export function subscribeToQuestionnaires(callback: (qs: Questionnaire[]) => void): () => void {
  return onSnapshot(collection(db, 'questionnaires'), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Questionnaire)));
  });
}

export async function getQuestionnaireById(id: string): Promise<Questionnaire | null> {
  const snap = await getDoc(doc(db, 'questionnaires', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Questionnaire;
}

export async function updateQuestionnaire(id: string, data: Partial<Questionnaire>): Promise<void> {
  await updateDoc(doc(db, 'questionnaires', id), data as Record<string, unknown>);
}
