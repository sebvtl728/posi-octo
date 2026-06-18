import { collection, doc, addDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import type { Folder } from '../types';

export function subscribeToFolders(callback: (folders: Folder[]) => void): () => void {
  return onSnapshot(collection(db, 'folders'), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Folder)));
  });
}

export async function addFolder(name: string, parentId?: string): Promise<string> {
  const ref = await addDoc(collection(db, 'folders'), {
    name: name.trim(),
    ...(parentId ? { parentId } : {}),
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function deleteFolder(id: string): Promise<void> {
  await deleteDoc(doc(db, 'folders', id));
}
