import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDoc, getDocs, query, orderBy, onSnapshot
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { db } from './firebase';
import type { Session, Message } from '../types';

export async function createSession(
  questionnaireId: string,
  type: Session['type'],
  userName = '',
  initialStatus: Session['status'] = 'pending'
): Promise<string> {
  const id = uuidv4();
  await setDoc(doc(db, 'sessions', id), {
    id,
    questionnaireId,
    userName,
    type,
    status: initialStatus,
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const snap = await getDoc(doc(db, 'sessions', sessionId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Session;
}

export async function updateSession(sessionId: string, data: Partial<Session>): Promise<void> {
  await updateDoc(doc(db, 'sessions', sessionId), data as Record<string, unknown>);
}

export async function getSessions(): Promise<Session[]> {
  const snap = await getDocs(query(collection(db, 'sessions'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Session));
}

export function subscribeToSessions(callback: (sessions: Session[]) => void): () => void {
  const q = query(collection(db, 'sessions'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Session)));
  });
}

export function subscribeToSession(sessionId: string, callback: (session: Session) => void): () => void {
  return onSnapshot(doc(db, 'sessions', sessionId), snap => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() } as Session);
  });
}

export function subscribeToMessages(sessionId: string, callback: (messages: Message[]) => void): () => void {
  const q = query(
    collection(db, `sessions/${sessionId}/messages`),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)));
  });
}

export async function addMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  await addDoc(collection(db, `sessions/${sessionId}/messages`), {
    sessionId,
    role,
    content,
    createdAt: new Date().toISOString(),
  });
}

export async function getMessages(sessionId: string): Promise<Message[]> {
  const snap = await getDocs(
    query(collection(db, `sessions/${sessionId}/messages`), orderBy('createdAt', 'asc'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
}

export async function deleteSessionsWithoutQuestionnaire(): Promise<number> {
  const snap = await getDocs(collection(db, 'sessions'));
  const toDelete = snap.docs.filter(d => !d.data().questionnaireId);
  await Promise.all(toDelete.map(d => deleteDoc(d.ref)));
  return toDelete.length;
}
