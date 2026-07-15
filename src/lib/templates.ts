import {
  collection, doc, addDoc, getDocs, getDoc, deleteDoc, onSnapshot, updateDoc
} from 'firebase/firestore';
import { db } from './firebase';
import type { HTMLTemplate } from '../types';

export async function addTemplate(
  name: string,
  htmlContent: string,
  type: HTMLTemplate['type']
): Promise<string> {
  const ref = await addDoc(collection(db, 'templates'), {
    name,
    htmlContent,
    type,
    createdAt: new Date().toISOString()
  });
  return ref.id;
}

export async function updateTemplate(
  id: string,
  updates: Partial<Omit<HTMLTemplate, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, 'templates', id), updates);
}

export async function getTemplates(): Promise<HTMLTemplate[]> {
  const snap = await getDocs(collection(db, 'templates'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as HTMLTemplate));
}

export function subscribeToTemplates(
  callback: (ts: HTMLTemplate[]) => void,
  onError?: (err: Error) => void
): () => void {
  return onSnapshot(
    collection(db, 'templates'),
    snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as HTMLTemplate)));
    },
    err => {
      if (onError) onError(err);
    }
  );
}

export async function getTemplateById(id: string): Promise<HTMLTemplate | null> {
  const snap = await getDoc(doc(db, 'templates', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as HTMLTemplate;
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, 'templates', id));
}
