# Restructuration Admin / Utilisateur — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Séparer l'application en deux zones distinctes — admin (Firebase Auth) et utilisateur (public) — avec gestion des questionnaires JSON, suivi en direct des sessions, et export HTML avec radar chart.

**Architecture:** React Router v6 avec lazy loading pour isoler le code admin du bundle utilisateur. L'admin accède à `/admin/*` après authentification Firebase. Les utilisateurs accèdent à `/s/:sessionId` (individuel) ou `/q/:questionnaireId` (collectif).

**Tech Stack:** React 19, TypeScript, Vite, React Router v6, Firebase Auth + Firestore, Mistral AI, Tailwind CSS, lucide-react, qrcode.react, Chart.js (embarqué dans l'export HTML)

> **Note :** Le projet n'est pas un dépôt git. Les étapes de commit sont remplacées par des vérifications TypeScript (`npm run lint`).

---

## Structure des fichiers

```
src/
├── App.tsx                          MODIFIÉ — devient le wrapper RouterProvider
├── router.tsx                       CRÉÉ — routes avec lazy loading
├── types.ts                         MODIFIÉ — nouveaux types
├── lib/
│   ├── firebase.ts                  MODIFIÉ — ajout export auth
│   ├── mistral.ts                   CONSERVÉ tel quel
│   ├── auth.ts                      CRÉÉ — helpers Firebase Auth
│   ├── questionnaire.ts             CRÉÉ — CRUD questionnaires Firestore
│   ├── sessions.ts                  CRÉÉ — CRUD sessions Firestore
│   └── export.ts                    CRÉÉ — génération HTML + calcul scores
├── components/
│   ├── admin/
│   │   ├── AdminLogin.tsx           CRÉÉ
│   │   ├── AdminProtectedRoute.tsx  CRÉÉ
│   │   ├── AdminLayout.tsx          CRÉÉ — sidebar + Outlet
│   │   ├── AdminDashboard.tsx       CRÉÉ — stats + tableau sessions + modales
│   │   ├── AdminQuestionnaires.tsx  CRÉÉ — import JSON + activation
│   │   ├── AdminSessionList.tsx     CRÉÉ — liste filtrée
│   │   └── AdminSessionMonitor.tsx  CRÉÉ — suivi temps réel + export
│   ├── user/
│   │   ├── UserEntry.tsx            CRÉÉ — lien collectif (prénom → crée session → redirect)
│   │   └── UserChat.tsx             CRÉÉ — chat utilisateur (remplace ChatInterface)
│   └── shared/
│       └── QRCodePanel.tsx          CRÉÉ — composant QR code réutilisable
└── ChatInterface.tsx                SUPPRIMÉ après création de UserChat
firestore.rules                      MODIFIÉ
```

---

## Task 1 : Dépendances + Types + Firebase Auth

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `src/types.ts`
- Modify: `src/lib/firebase.ts`

- [ ] **Étape 1 : Installer react-router-dom**

```bash
cd /Users/sebastienveitl/Downloads/zip && npm install react-router-dom
```

Résultat attendu : `added X packages` sans erreur.

- [ ] **Étape 2 : Remplacer src/types.ts**

```typescript
// src/types.ts
export interface Questionnaire {
  id: string;
  name: string;
  content: string; // JSON sérialisé
  isActive: boolean;
  categoriesCount: number;
  questionsCount: number;
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

export interface Session {
  id: string;
  questionnaireId: string;
  userName: string;
  type: 'individual' | 'collective';
  status: 'pending' | 'active' | 'completed';
  createdAt: string;
  completedAt?: string;
  currentQuestionIndex?: number;
  scores?: Record<string, number>;
}

export interface Message {
  id?: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}
```

- [ ] **Étape 3 : Mettre à jour src/lib/firebase.ts**

```typescript
// src/lib/firebase.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
```

- [ ] **Étape 4 : Vérifier le typage**

```bash
cd /Users/sebastienveitl/Downloads/zip && npm run lint
```

Résultat attendu : erreurs sur les imports de `ChatInterface` et `DocumentData` dans les anciens fichiers — normal, ces fichiers seront remplacés dans les tâches suivantes. Vérifiez qu'il n'y a pas d'autres erreurs inattendues.

---

## Task 2 : Router setup

**Files:**
- Create: `src/router.tsx`
- Modify: `src/App.tsx`

- [ ] **Étape 1 : Créer src/router.tsx**

```tsx
// src/router.tsx
import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';

const AdminLogin = lazy(() => import('./components/admin/AdminLogin'));
const AdminProtectedRoute = lazy(() => import('./components/admin/AdminProtectedRoute'));
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'));
const AdminQuestionnaires = lazy(() => import('./components/admin/AdminQuestionnaires'));
const AdminSessionList = lazy(() => import('./components/admin/AdminSessionList'));
const AdminSessionMonitor = lazy(() => import('./components/admin/AdminSessionMonitor'));
const UserEntry = lazy(() => import('./components/user/UserEntry'));
const UserChat = lazy(() => import('./components/user/UserChat'));

const router = createBrowserRouter([
  { path: '/admin', element: <AdminLogin /> },
  {
    element: <AdminProtectedRoute />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: '/admin/dashboard', element: <AdminDashboard /> },
          { path: '/admin/questionnaires', element: <AdminQuestionnaires /> },
          { path: '/admin/sessions', element: <AdminSessionList /> },
          { path: '/admin/sessions/:sessionId', element: <AdminSessionMonitor /> },
        ],
      },
    ],
  },
  { path: '/s/:sessionId', element: <UserChat /> },
  { path: '/q/:questionnaireId', element: <UserEntry /> },
  { path: '/', element: <Navigate to="/admin" replace /> },
]);

export default function Router() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center text-slate-400 text-sm">
        Chargement...
      </div>
    }>
      <RouterProvider router={router} />
    </Suspense>
  );
}
```

- [ ] **Étape 2 : Remplacer src/App.tsx**

```tsx
// src/App.tsx
import Router from './router';

export default function App() {
  return <Router />;
}
```

---

## Task 3 : Firebase Auth + AdminLogin + AdminProtectedRoute

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/components/admin/AdminLogin.tsx`
- Create: `src/components/admin/AdminProtectedRoute.tsx`

- [ ] **Étape 1 : Créer src/lib/auth.ts**

```typescript
// src/lib/auth.ts
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from './firebase';

export async function adminLogin(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function adminLogout(): Promise<void> {
  await signOut(auth);
}

export function onAdminAuthChanged(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}
```

- [ ] **Étape 2 : Créer src/components/admin/AdminLogin.tsx**

```tsx
// src/components/admin/AdminLogin.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin, onAdminAuthChanged } from '../../lib/auth';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    return onAdminAuthChanged(user => {
      if (user) navigate('/admin/dashboard', { replace: true });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await adminLogin(email, password);
    } catch {
      setError('Email ou mot de passe incorrect.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
            <div className="w-4 h-4 bg-indigo-600 rounded-full" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Posi-octo</h1>
          <p className="text-sm text-slate-500">Espace Administration</p>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl border border-red-100">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors mt-1"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Étape 3 : Créer src/components/admin/AdminProtectedRoute.tsx**

```tsx
// src/components/admin/AdminProtectedRoute.tsx
import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { onAdminAuthChanged } from '../../lib/auth';

export default function AdminProtectedRoute() {
  const [user, setUser] = useState<User | null | 'loading'>('loading');

  useEffect(() => {
    return onAdminAuthChanged(setUser);
  }, []);

  if (user === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center text-slate-400 text-sm">
        Vérification...
      </div>
    );
  }
  if (!user) return <Navigate to="/admin" replace />;
  return <Outlet />;
}
```

- [ ] **Étape 4 : Activer Firebase Auth dans la console Firebase**

Dans la console Firebase du projet :
1. Aller dans Authentication → Sign-in method
2. Activer "Email/Mot de passe"
3. Aller dans Authentication → Users → Ajouter un utilisateur admin avec l'email et mot de passe souhaités

- [ ] **Étape 5 : Vérification TypeScript**

```bash
cd /Users/sebastienveitl/Downloads/zip && npm run lint
```

Résultat attendu : erreurs uniquement sur les fichiers non encore créés (AdminLayout, AdminDashboard, etc.). Aucune erreur sur auth.ts, AdminLogin.tsx, AdminProtectedRoute.tsx.

---

## Task 4 : Couche de données (questionnaire.ts + sessions.ts)

**Files:**
- Create: `src/lib/questionnaire.ts`
- Create: `src/lib/sessions.ts`

- [ ] **Étape 1 : Créer src/lib/questionnaire.ts**

```typescript
// src/lib/questionnaire.ts
import {
  collection, doc, addDoc, updateDoc, getDocs,
  query, where, writeBatch, onSnapshot
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

export async function activateQuestionnaire(id: string): Promise<void> {
  const snap = await getDocs(query(collection(db, 'questionnaires'), where('isActive', '==', true)));
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.update(d.ref, { isActive: false }));
  batch.update(doc(db, 'questionnaires', id), { isActive: true });
  await batch.commit();
}

export async function getActiveQuestionnaire(): Promise<Questionnaire | null> {
  const snap = await getDocs(query(collection(db, 'questionnaires'), where('isActive', '==', true)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as Questionnaire;
}

export async function getQuestionnaireById(id: string): Promise<Questionnaire | null> {
  const snap = await getDocs(collection(db, 'questionnaires'));
  const d = snap.docs.find(d => d.id === id);
  if (!d) return null;
  return { id: d.id, ...d.data() } as Questionnaire;
}
```

- [ ] **Étape 2 : Créer src/lib/sessions.ts**

```typescript
// src/lib/sessions.ts
import {
  collection, doc, addDoc, setDoc, updateDoc,
  getDoc, getDocs, query, orderBy, onSnapshot
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { db } from './firebase';
import type { Session, Message } from '../types';

export async function createSession(
  questionnaireId: string,
  type: 'individual' | 'collective',
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
```

- [ ] **Étape 3 : Vérification TypeScript**

```bash
cd /Users/sebastienveitl/Downloads/zip && npm run lint
```

Résultat attendu : aucune erreur sur `questionnaire.ts` et `sessions.ts`. Les erreurs restantes concernent les composants non encore créés.

---

## Task 5 : Bibliothèque d'export (export.ts)

**Files:**
- Create: `src/lib/export.ts`

- [ ] **Étape 1 : Créer src/lib/export.ts**

```typescript
// src/lib/export.ts
import { chatWithMistral } from './mistral';
import type { Session, Message, QuestionnaireData } from '../types';

export async function computeScores(
  messages: Message[],
  questionnaire: QuestionnaireData
): Promise<Record<string, number>> {
  const transcript = messages
    .map(m => `${m.role === 'user' ? 'Candidat' : 'Évaluateur'}: ${m.content}`)
    .join('\n\n');
  const categories = questionnaire.categories.map(c => c.name);
  const emptyResult = Object.fromEntries(categories.map(c => [c, 0]));

  const prompt = `Tu es un évaluateur. Sur la base de la transcription suivante d'une session d'évaluation, donne un score de 0 à 100 pour chaque catégorie ci-dessous. Sois objectif.

Catégories : ${categories.join(', ')}

Transcription :
${transcript}

Réponds UNIQUEMENT avec un objet JSON valide, sans texte ni markdown autour. Format exact (utilise exactement ces noms de catégories) :
{${categories.map(c => `"${c}": 75`).join(', ')}}`;

  try {
    const response = await chatWithMistral([{ role: 'user', content: prompt }], 'mistral-small-latest');
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return emptyResult;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return emptyResult;
  }
}

export async function computeSynthesis(
  session: Session,
  messages: Message[],
  scores: Record<string, number>
): Promise<string> {
  const scoresStr = Object.entries(scores).map(([k, v]) => `${k}: ${v}/100`).join(', ');
  const transcript = messages
    .filter(m => m.role !== 'system')
    .slice(-20) // limiter le contexte
    .map(m => `${m.role === 'user' ? session.userName : 'IA'}: ${m.content}`)
    .join('\n\n');

  const prompt = `Génère une synthèse d'évaluation professionnelle en 3-4 phrases pour ${session.userName}. Scores obtenus : ${scoresStr}. Mentionne les points forts et les axes d'amélioration. Sois encourageant mais honnête. Base-toi sur ces échanges : ${transcript}`;

  return chatWithMistral([{ role: 'user', content: prompt }], 'mistral-small-latest');
}

export function generateExportHTML(
  session: Session,
  messages: Message[],
  scores: Record<string, number>,
  synthesis: string,
  questionnaireTitle: string
): string {
  const categories = Object.keys(scores);
  const values = Object.values(scores);

  const transcriptHTML = messages
    .filter(m => m.role !== 'system')
    .map(m => {
      const name = m.role === 'user' ? session.userName : 'Posi-octo';
      const cls = m.role === 'user' ? 'user' : 'assistant';
      const escaped = m.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      return `<div class="msg ${cls}"><div class="msg-label">${name}</div><div class="msg-content">${escaped}</div></div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport — ${session.userName}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"><\/script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 860px; margin: 0 auto; padding: 48px 24px; color: #1e293b; line-height: 1.6; }
  h1 { font-size: 26px; font-weight: 700; margin-bottom: 6px; }
  .meta { color: #64748b; font-size: 14px; margin-bottom: 40px; }
  .section { margin-bottom: 48px; }
  h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #94a3b8; margin-bottom: 16px; }
  .synthesis { background: #f8fafc; border-left: 4px solid #6c63ff; padding: 20px 24px; border-radius: 0 10px 10px 0; font-size: 15px; line-height: 1.75; }
  .radar-wrap { max-width: 420px; margin: 0 auto; }
  .score-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-top: 16px; }
  .score-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; }
  .score-card .val { font-size: 28px; font-weight: 700; color: #6c63ff; }
  .score-card .lbl { font-size: 12px; color: #64748b; margin-top: 2px; }
  .msg { margin-bottom: 20px; }
  .msg-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 6px; }
  .msg.user .msg-content { background: #ede9fe; padding: 12px 16px; border-radius: 12px; font-size: 14px; }
  .msg.assistant .msg-content { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 16px; border-radius: 12px; font-size: 14px; }
</style>
</head>
<body>
<h1>Rapport — ${session.userName}</h1>
<div class="meta">${questionnaireTitle} &nbsp;·&nbsp; ${new Date(session.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} &nbsp;·&nbsp; Session ${session.id.substring(0, 8)}</div>

<div class="section">
  <h2>Synthèse</h2>
  <div class="synthesis">${synthesis}</div>
</div>

<div class="section">
  <h2>Scores par catégorie</h2>
  <div class="score-grid">
    ${categories.map((c, i) => `<div class="score-card"><div class="val">${values[i]}<span style="font-size:14px;color:#94a3b8">/100</span></div><div class="lbl">${c}</div></div>`).join('')}
  </div>
  <div class="radar-wrap" style="margin-top:32px">
    <canvas id="radar"></canvas>
  </div>
</div>

<div class="section">
  <h2>Transcription complète</h2>
  ${transcriptHTML}
</div>

<script>
new Chart(document.getElementById('radar'), {
  type: 'radar',
  data: {
    labels: ${JSON.stringify(categories)},
    datasets: [{
      label: '${session.userName}',
      data: ${JSON.stringify(values)},
      backgroundColor: 'rgba(108, 99, 255, 0.15)',
      borderColor: 'rgba(108, 99, 255, 1)',
      borderWidth: 2,
      pointBackgroundColor: 'rgba(108, 99, 255, 1)',
      pointRadius: 4,
    }]
  },
  options: {
    scales: { r: { min: 0, max: 100, ticks: { stepSize: 20, font: { size: 10 } } } },
    plugins: { legend: { display: false } }
  }
});
<\/script>
</body>
</html>`;
}

export function downloadHTML(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## Task 6 : Composant partagé QRCodePanel

**Files:**
- Create: `src/components/shared/QRCodePanel.tsx`

- [ ] **Étape 1 : Créer le dossier shared et QRCodePanel.tsx**

```bash
mkdir -p /Users/sebastienveitl/Downloads/zip/src/components/shared
mkdir -p /Users/sebastienveitl/Downloads/zip/src/components/admin
mkdir -p /Users/sebastienveitl/Downloads/zip/src/components/user
```

- [ ] **Étape 2 : Créer src/components/shared/QRCodePanel.tsx**

```tsx
// src/components/shared/QRCodePanel.tsx
import { QRCodeSVG } from 'qrcode.react';

interface Props {
  url: string;
  label?: string;
  size?: number;
}

export default function QRCodePanel({
  url,
  label = 'Scannez pour accéder sur mobile',
  size = 120,
}: Props) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="bg-white p-3 border border-slate-200 rounded-xl">
        <QRCodeSVG value={url} size={size} />
      </div>
      <p className="text-[10px] text-center text-slate-500 leading-tight max-w-[140px]">{label}</p>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(url)}
        className="text-[10px] text-indigo-500 hover:underline"
      >
        Copier le lien
      </button>
    </div>
  );
}
```

---

## Task 7 : AdminLayout

**Files:**
- Create: `src/components/admin/AdminLayout.tsx`

- [ ] **Étape 1 : Créer src/components/admin/AdminLayout.tsx**

```tsx
// src/components/admin/AdminLayout.tsx
import { useNavigate, NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, FileText, Users, LogOut } from 'lucide-react';
import { adminLogout } from '../../lib/auth';

const navItems = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/questionnaires', icon: FileText, label: 'Questionnaires' },
  { to: '/admin/sessions', icon: Users, label: 'Sessions' },
];

export default function AdminLayout() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await adminLogout();
    navigate('/admin', { replace: true });
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <aside className="w-52 bg-indigo-950 text-indigo-300 flex flex-col shrink-0">
        <div className="p-5 border-b border-indigo-900">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-indigo-400 rounded-full" />
            <span className="text-white font-bold text-sm tracking-tight">Posi-octo</span>
          </div>
          <div className="text-indigo-500 text-[10px] mt-1 ml-4">Administration</div>
        </div>

        <nav className="flex-1 py-3">
          <div className="px-4 mb-2 text-[9px] font-bold uppercase tracking-widest text-indigo-700">
            Navigation
          </div>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-xs border-l-2 transition-colors ${
                  isActive
                    ? 'bg-indigo-900 border-indigo-400 text-white font-medium'
                    : 'border-transparent hover:bg-indigo-900/50 hover:text-white'
                }`
              }
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-indigo-900">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs text-indigo-400 hover:text-white transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
```

---

## Task 8 : AdminDashboard

**Files:**
- Create: `src/components/admin/AdminDashboard.tsx`

- [ ] **Étape 1 : Créer src/components/admin/AdminDashboard.tsx**

```tsx
// src/components/admin/AdminDashboard.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribeToSessions, createSession } from '../../lib/sessions';
import { getActiveQuestionnaire, getQuestionnaires } from '../../lib/questionnaire';
import QRCodePanel from '../shared/QRCodePanel';
import type { Session, Questionnaire } from '../../types';

function StatusBadge({ status }: { status: Session['status'] }) {
  const styles = {
    pending: 'bg-yellow-100 text-yellow-700',
    active: 'bg-green-100 text-green-700',
    completed: 'bg-slate-100 text-slate-600',
  };
  const labels = { pending: 'En attente', active: '● Actif', completed: 'Terminé' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function AdminDashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeQ, setActiveQ] = useState<Questionnaire | null>(null);
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);

  // Modales
  const [showIndividualModal, setShowIndividualModal] = useState(false);
  const [showCollectiveModal, setShowCollectiveModal] = useState(false);
  const [individualName, setIndividualName] = useState('');
  const [selectedQId, setSelectedQId] = useState('');
  const [createdLink, setCreatedLink] = useState('');
  const [creating, setCreating] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const unsub = subscribeToSessions(setSessions);
    getActiveQuestionnaire().then(q => {
      setActiveQ(q);
      if (q) setSelectedQId(q.id);
    });
    getQuestionnaires().then(qs => setQuestionnaires(qs));
    return unsub;
  }, []);

  const activeSessions = sessions.filter(s => s.status === 'active').length;
  const completedSessions = sessions.filter(s => s.status === 'completed').length;
  const avgScore = (() => {
    const withScores = sessions.filter(s => s.scores);
    if (!withScores.length) return null;
    const avg = withScores.reduce((sum, s) => {
      const vals = Object.values(s.scores!);
      return sum + (vals.reduce((a, b) => a + b, 0) / vals.length);
    }, 0) / withScores.length;
    return Math.round(avg);
  })();

  const handleCreateIndividual = async () => {
    if (!individualName.trim() || !selectedQId) return;
    setCreating(true);
    try {
      const id = await createSession(selectedQId, 'individual', individualName.trim());
      setCreatedLink(`${window.location.origin}/s/${id}`);
    } finally {
      setCreating(false);
    }
  };

  const collectiveLink = activeQ ? `${window.location.origin}/q/${activeQ.id}` : '';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
        <h2 className="font-semibold text-sm text-slate-800">Tableau de bord</h2>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowIndividualModal(true); setCreatedLink(''); }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors"
          >
            + Session individuelle
          </button>
          <button
            onClick={() => setShowCollectiveModal(true)}
            disabled={!activeQ}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            Lien collectif
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Sessions actives', value: activeSessions, color: 'text-green-600' },
            { label: 'Sessions terminées', value: completedSessions, color: 'text-slate-700' },
            { label: 'Score moyen', value: avgScore !== null ? `${avgScore}%` : '—', color: 'text-indigo-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-slate-500 mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Questionnaire actif */}
        {activeQ && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Questionnaire actif</span>
              <div className="text-sm font-semibold text-indigo-800 mt-0.5">{activeQ.name}</div>
            </div>
            <span className="text-xs text-indigo-500">{activeQ.categoriesCount} catégories · {activeQ.questionsCount} questions</span>
          </div>
        )}

        {/* Table sessions */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-700">Sessions récentes</span>
            <button onClick={() => navigate('/admin/sessions')} className="text-xs text-indigo-500 hover:underline">
              Voir tout →
            </button>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                {['Utilisateur', 'Type', 'Statut', 'Score', 'Action'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 8).map(s => (
                <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium">{s.userName || <span className="text-slate-400 italic">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.type === 'individual' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                      {s.type === 'individual' ? 'Individuel' : 'Collectif'}
                    </span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-3 text-slate-500">
                    {s.scores ? `${Math.round(Object.values(s.scores).reduce((a, b) => a + b, 0) / Object.values(s.scores).length)}%` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/admin/sessions/${s.id}`)} className="text-indigo-500 hover:underline">
                      {s.status === 'completed' ? 'Exporter' : 'Suivre'}
                    </button>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic">Aucune session.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modale session individuelle */}
      {showIndividualModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowIndividualModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-sm mb-4">Nouvelle session individuelle</h3>
            {!createdLink ? (
              <>
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Prénom de l'utilisateur</label>
                    <input
                      type="text"
                      value={individualName}
                      onChange={e => setIndividualName(e.target.value)}
                      placeholder="Ex: Sophie"
                      className="w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Questionnaire</label>
                    <select
                      value={selectedQId}
                      onChange={e => setSelectedQId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Sélectionner...</option>
                      {questionnaires.map(q => (
                        <option key={q.id} value={q.id}>{q.name}{q.isActive ? ' (actif)' : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowIndividualModal(false)} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium">Annuler</button>
                  <button
                    onClick={handleCreateIndividual}
                    disabled={creating || !individualName.trim() || !selectedQId}
                    className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium disabled:opacity-40"
                  >
                    {creating ? 'Création...' : 'Créer'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <p className="text-xs text-slate-500 text-center">Session créée pour <strong>{individualName}</strong>. Partagez ce QR code ou ce lien.</p>
                <QRCodePanel url={createdLink} size={140} />
                <button onClick={() => setShowIndividualModal(false)} className="text-xs text-slate-500 hover:underline">Fermer</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modale lien collectif */}
      {showCollectiveModal && activeQ && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCollectiveModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-sm">Lien collectif — {activeQ.name}</h3>
            <p className="text-xs text-slate-500 text-center">Tout utilisateur avec ce lien peut démarrer une session sur le questionnaire actif.</p>
            <QRCodePanel url={collectiveLink} size={160} label="Scannez pour rejoindre" />
            <button onClick={() => setShowCollectiveModal(false)} className="text-xs text-slate-500 hover:underline">Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Task 9 : AdminQuestionnaires

**Files:**
- Create: `src/components/admin/AdminQuestionnaires.tsx`

- [ ] **Étape 1 : Créer src/components/admin/AdminQuestionnaires.tsx**

```tsx
// src/components/admin/AdminQuestionnaires.tsx
import { useState, useEffect } from 'react';
import { Paperclip, Check } from 'lucide-react';
import {
  subscribeToQuestionnaires,
  addQuestionnaire,
  activateQuestionnaire,
  validateQuestionnaireJSON,
} from '../../lib/questionnaire';
import type { Questionnaire } from '../../types';

export default function AdminQuestionnaires() {
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activating, setActivating] = useState<string | null>(null);
  const [preview, setPreview] = useState<Questionnaire | null>(null);

  useEffect(() => {
    return subscribeToQuestionnaires(qs =>
      setQuestionnaires([...qs].sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0)))
    );
  }, []);

  const handleFileUpload = async (file: File) => {
    setError('');
    setSuccess('');
    if (!file.name.endsWith('.json')) {
      setError('Veuillez importer un fichier .json');
      return;
    }
    const content = await file.text();
    try {
      validateQuestionnaireJSON(content);
      const name = file.name.replace('.json', '');
      await addQuestionnaire(name, content);
      setSuccess(`"${name}" importé avec succès.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'JSON invalide.');
    }
  };

  const handleActivate = async (id: string) => {
    setActivating(id);
    try {
      await activateQuestionnaire(id);
    } finally {
      setActivating(null);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
        <h2 className="font-semibold text-sm text-slate-800">Questionnaires</h2>
        <label className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-indigo-700 transition-colors">
          + Importer un JSON
          <input type="file" accept=".json" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
        </label>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {error && <div className="mb-4 px-4 py-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">{error}</div>}
        {success && <div className="mb-4 px-4 py-3 bg-green-50 text-green-700 text-sm rounded-xl border border-green-100">{success}</div>}

        <div className="space-y-3 mb-6">
          {questionnaires.map(q => (
            <div
              key={q.id}
              className={`bg-white rounded-xl border p-4 flex items-center justify-between gap-4 transition-colors ${q.isActive ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="font-semibold text-sm text-slate-800 truncate">{q.name}</span>
                  {q.isActive && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">● Actif</span>
                  )}
                </div>
                <div className="text-xs text-slate-400 mt-1 ml-6">
                  {q.categoriesCount} catégories · {q.questionsCount} questions · {new Date(q.createdAt).toLocaleDateString('fr-FR')}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setPreview(q)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors"
                >
                  Aperçu
                </button>
                {!q.isActive && (
                  <button
                    onClick={() => handleActivate(q.id)}
                    disabled={activating === q.id}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    {activating === q.id ? 'Activation...' : 'Activer'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {questionnaires.length === 0 && (
            <p className="text-sm text-slate-400 italic text-center py-8">Aucun questionnaire importé.</p>
          )}
        </div>

        {/* Zone drag & drop */}
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-10 cursor-pointer hover:bg-slate-50 transition-colors text-slate-400">
          <Paperclip className="w-6 h-6" />
          <span className="text-sm">Glissez un fichier JSON ou cliquez pour importer</span>
          <span className="text-xs">Format requis : title + categories[].name + categories[].questions[]</span>
          <input type="file" accept=".json" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
        </label>
      </div>

      {/* Modale aperçu */}
      {preview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-base mb-4">{preview.name}</h3>
            {(() => {
              try {
                const data = JSON.parse(preview.content);
                return data.categories.map((cat: { name: string; questions: { question: string }[] }) => (
                  <div key={cat.name} className="mb-4">
                    <div className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-2">{cat.name}</div>
                    <ul className="space-y-1">
                      {cat.questions.map((q: { question: string }, i: number) => (
                        <li key={i} className="text-sm text-slate-600 pl-2 border-l-2 border-slate-200">{q.question}</li>
                      ))}
                    </ul>
                  </div>
                ));
              } catch {
                return <p className="text-sm text-red-500">JSON invalide.</p>;
              }
            })()}
            <button onClick={() => setPreview(null)} className="mt-4 text-xs text-slate-400 hover:underline">Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Task 10 : AdminSessionList

**Files:**
- Create: `src/components/admin/AdminSessionList.tsx`

- [ ] **Étape 1 : Créer src/components/admin/AdminSessionList.tsx**

```tsx
// src/components/admin/AdminSessionList.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribeToSessions } from '../../lib/sessions';
import type { Session } from '../../types';

type Filter = 'all' | Session['status'];

function StatusBadge({ status }: { status: Session['status'] }) {
  const map = {
    pending: 'bg-yellow-100 text-yellow-700',
    active: 'bg-green-100 text-green-700',
    completed: 'bg-slate-100 text-slate-600',
  };
  const labels = { pending: 'En attente', active: '● Actif', completed: 'Terminé' };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${map[status]}`}>{labels[status]}</span>;
}

export default function AdminSessionList() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const navigate = useNavigate();

  useEffect(() => {
    return subscribeToSessions(setSessions);
  }, []);

  const filtered = filter === 'all' ? sessions : sessions.filter(s => s.status === filter);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
        <h2 className="font-semibold text-sm text-slate-800">Sessions ({sessions.length})</h2>
        <div className="flex gap-1">
          {(['all', 'active', 'pending', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {{ all: 'Toutes', active: 'Actives', pending: 'En attente', completed: 'Terminées' }[f]}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white border-b border-slate-100">
            <tr>
              {['Utilisateur', 'Type', 'Statut', 'Score', 'Créée le', 'Action'].map(h => (
                <th key={h} className="text-left px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="px-6 py-3 font-medium">{s.userName || <span className="text-slate-400 italic">—</span>}</td>
                <td className="px-6 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.type === 'individual' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                    {s.type === 'individual' ? 'Individuel' : 'Collectif'}
                  </span>
                </td>
                <td className="px-6 py-3"><StatusBadge status={s.status} /></td>
                <td className="px-6 py-3 text-slate-500">
                  {s.scores
                    ? `${Math.round(Object.values(s.scores).reduce((a, b) => a + b, 0) / Object.values(s.scores).length)}%`
                    : '—'}
                </td>
                <td className="px-6 py-3 text-slate-400">
                  {new Date(s.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-6 py-3">
                  <button onClick={() => navigate(`/admin/sessions/${s.id}`)} className="text-indigo-500 hover:underline">
                    {s.status === 'completed' ? 'Voir / Exporter' : 'Suivre'}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">Aucune session.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

## Task 11 : AdminSessionMonitor

**Files:**
- Create: `src/components/admin/AdminSessionMonitor.tsx`

- [ ] **Étape 1 : Créer src/components/admin/AdminSessionMonitor.tsx**

```tsx
// src/components/admin/AdminSessionMonitor.tsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  subscribeToSession,
  subscribeToMessages,
  updateSession,
  getMessages,
} from '../../lib/sessions';
import { getQuestionnaireById } from '../../lib/questionnaire';
import { computeScores, computeSynthesis, generateExportHTML, downloadHTML } from '../../lib/export';
import type { Session, Message, Questionnaire } from '../../types';

export default function AdminSessionMonitor() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
  const [exporting, setExporting] = useState(false);
  const [closing, setClosing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) return;
    const unsubSession = subscribeToSession(sessionId, s => {
      setSession(s);
      if (!questionnaire && s.questionnaireId) {
        getQuestionnaireById(s.questionnaireId).then(setQuestionnaire);
      }
    });
    const unsubMsgs = subscribeToMessages(sessionId, setMessages);
    return () => { unsubSession(); unsubMsgs(); };
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleClose = async () => {
    if (!session || !sessionId) return;
    setClosing(true);
    await updateSession(sessionId, { status: 'completed', completedAt: new Date().toISOString() });
    setClosing(false);
  };

  const handleExport = async () => {
    if (!session || !questionnaire || !sessionId) return;
    setExporting(true);
    try {
      const allMessages = await getMessages(sessionId);
      const qData = JSON.parse(questionnaire.content);
      const scores = session.scores ?? await computeScores(allMessages, qData);

      if (!session.scores) {
        await updateSession(sessionId, { scores });
      }

      const synthesis = await computeSynthesis(session, allMessages, scores);
      const html = generateExportHTML(session, allMessages, scores, synthesis, qData.title ?? questionnaire.name);
      downloadHTML(html, `TypBot-${session.userName}-${sessionId.substring(0, 8)}.html`);
    } finally {
      setExporting(false);
    }
  };

  if (!session) {
    return <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Chargement...</div>;
  }

  const totalQuestions = questionnaire ? JSON.parse(questionnaire.content).categories.reduce(
    (sum: number, c: { questions: unknown[] }) => sum + c.questions.length, 0
  ) : '?';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin/sessions')} className="p-1 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{session.userName || 'Session'}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${session.status === 'active' ? 'bg-green-100 text-green-700' : session.status === 'completed' ? 'bg-slate-100 text-slate-600' : 'bg-yellow-100 text-yellow-700'}`}>
                {session.status === 'active' ? '● En direct' : session.status === 'completed' ? 'Terminé' : 'En attente'}
              </span>
            </div>
            <div className="text-[10px] text-slate-400">{questionnaire?.name}</div>
          </div>
        </div>
        <div className="flex gap-2">
          {session.status !== 'completed' && (
            <button
              onClick={handleClose}
              disabled={closing}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {closing ? 'Clôture...' : 'Clore la session'}
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={exporting || session.status !== 'completed'}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
          >
            {exporting ? <><Loader2 className="w-3 h-3 animate-spin" /> Export...</> : '⬇ Exporter HTML'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Zone messages (lecture seule) */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              En attente des premiers échanges...
            </div>
          )}
          {messages.map(m => (
            <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold ${m.role === 'user' ? 'bg-slate-200 text-slate-600' : 'bg-indigo-600 text-white'}`}>
                {m.role === 'user' ? (session.userName?.charAt(0).toUpperCase() ?? 'U') : 'SV'}
              </div>
              <div className={`p-3 rounded-2xl max-w-[75%] text-sm leading-relaxed ${m.role === 'user' ? 'bg-indigo-100 text-indigo-900 rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}`}>
                {m.role === 'user'
                  ? <p className="whitespace-pre-wrap">{m.content}</p>
                  : <div className="prose prose-sm prose-slate max-w-none"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                }
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Panel latéral info */}
        <aside className="w-52 border-l border-slate-200 bg-white p-4 shrink-0 flex flex-col gap-5 overflow-y-auto">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Progression</div>
            <div className="text-sm font-bold">{messages.filter(m => m.role === 'user').length} réponses</div>
            <div className="text-[10px] text-slate-400 mt-0.5">/ {totalQuestions} questions</div>
            <div className="mt-2 bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-indigo-500 h-full transition-all"
                style={{ width: `${Math.min(100, (messages.filter(m => m.role === 'user').length / (Number(totalQuestions) || 1)) * 100)}%` }}
              />
            </div>
          </div>

          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Échanges total</div>
            <div className="text-sm font-bold">{messages.length}</div>
          </div>

          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Type</div>
            <div className="text-sm capitalize">{session.type === 'individual' ? 'Individuel' : 'Collectif'}</div>
          </div>

          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Créée le</div>
            <div className="text-xs text-slate-600">
              {new Date(session.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>

          {session.scores && (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Scores</div>
              {Object.entries(session.scores).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600 truncate">{k}</span>
                  <span className="font-bold text-indigo-600">{v}</span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
```

---

## Task 12 : UserChat

**Files:**
- Create: `src/components/user/UserChat.tsx`
- Delete: `src/components/ChatInterface.tsx` (après vérification que UserChat fonctionne)

- [ ] **Étape 1 : Créer src/components/user/UserChat.tsx**

```tsx
// src/components/user/UserChat.tsx
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { subscribeToSession, subscribeToMessages, addMessage, updateSession, getSession } from '../../lib/sessions';
import { getQuestionnaireById } from '../../lib/questionnaire';
import { chatWithMistral } from '../../lib/mistral';
import QRCodePanel from '../shared/QRCodePanel';
import type { Session, Message, Questionnaire } from '../../types';

function buildSystemPrompt(questionnaireContent: string): string {
  return `Tu es un ingénieur pédagogique et d'évaluation. L'utilisateur t'utilise pour réviser à l'aide du questionnaire JSON ci-dessous.

Rôle et Déroulement :
1. Le JSON ci-dessous est ton support exclusif. Respecte rigoureusement l'ordre des questions et les réponses attendues.
2. Pour chaque réponse, analyse en silence la validité par rapport au JSON et le nombre d'échecs consécutifs sur la question en cours.
3. Formule toujours une réflexion/analyse constructive pour chaque réponse.
4. SI LA RÉPONSE EST INCORRECTE (1ère tentative) : reste sur le même concept, pose des questions intermédiaires plus simples.
5. SI LE CANDIDAT S'EST TROMPÉ DEUX FOIS : explique le concept de façon didactique, puis propose de passer à la suivante.
6. SI LA RÉPONSE EST CORRECTE : valide brièvement et passe à la question suivante.
7. Si tu poses des QCM, formate les options en liste Markdown (cliquables).
8. Utilise le Markdown pour structurer tes réponses. Sois clair et concis.
9. Personnalise toujours tes messages avec le prénom de l'utilisateur.

Questionnaire JSON :
${questionnaireContent}`;
}

export default function UserChat() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Écran prénom (session individuelle en attente)
  const [nameInput, setNameInput] = useState('');
  const [startingSession, setStartingSession] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) return;

    // Vérifier que la session existe
    getSession(sessionId).then(s => {
      if (!s) setNotFound(true);
    });

    const unsubSession = subscribeToSession(sessionId, s => {
      setSession(s);
      if (s.questionnaireId && !questionnaire) {
        getQuestionnaireById(s.questionnaireId).then(setQuestionnaire);
      }
    });
    const unsubMsgs = subscribeToMessages(sessionId, setMessages);
    return () => { unsubSession(); unsubMsgs(); };
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Défini avant les useEffects qui l'appellent pour éviter la temporal dead zone
  const triggerWelcome = async (userName: string) => {
    if (!questionnaire) return;
    setIsLoading(true);
    const systemPrompt = buildSystemPrompt(questionnaire.content);
    const welcomeInstruction = `${systemPrompt}\n\nInstruction spéciale : L'utilisateur vient de démarrer. Accueille ${userName} brièvement et pose-lui directement la première question du questionnaire JSON. Ne lui redemande pas son prénom.`;
    try {
      const response = await chatWithMistral([{ role: 'system', content: welcomeInstruction }], 'mistral-small-latest');
      await addMessage(sessionId!, 'assistant', response);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de connexion.');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-démarrer le message d'accueil pour les sessions collectives (déjà active, pas de messages)
  const welcomeTriggeredRef = useRef(false);
  useEffect(() => {
    if (
      session?.status === 'active' &&
      session.type === 'collective' &&
      messages.length === 0 &&
      questionnaire &&
      !welcomeTriggeredRef.current
    ) {
      welcomeTriggeredRef.current = true;
      triggerWelcome(session.userName);
    }
  }, [session?.status, session?.type, messages.length, questionnaire?.id]);

  // Démarrer la session avec le prénom (session individuelle)
  const handleStart = async () => {
    if (!nameInput.trim() || !sessionId || !session) return;
    setStartingSession(true);
    try {
      await updateSession(sessionId, { userName: nameInput.trim(), status: 'active' });
      await triggerWelcome(nameInput.trim());
    } finally {
      setStartingSession(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading || !sessionId || !session || !questionnaire) return;
    setIsLoading(true);
    setError(null);
    try {
      await addMessage(sessionId, 'user', text);
      const systemPrompt = buildSystemPrompt(questionnaire.content);
      const history = [
        { role: 'system' as const, content: systemPrompt },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: text },
      ];
      const response = await chatWithMistral(history, 'mistral-small-latest');
      await addMessage(sessionId, 'assistant', response);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de connexion.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput('');
    await sendMessage(text);
  };

  if (notFound) {
    return (
      <div className="h-screen flex items-center justify-center text-slate-500 text-sm">
        Session introuvable ou expirée.
      </div>
    );
  }

  if (!session) {
    return <div className="h-screen flex items-center justify-center text-slate-400 text-sm">Chargement...</div>;
  }

  // Session individuelle en attente du prénom
  if (session.status === 'pending') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-sm flex flex-col items-center gap-6">
          <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
            <div className="w-4 h-4 bg-indigo-600 rounded-full" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">Posi-octo</h1>
            <p className="text-sm text-slate-500 mt-1">{questionnaire?.name ?? 'Évaluation'}</p>
          </div>
          <div className="w-full">
            <label className="text-xs font-semibold text-slate-600 block mb-2">Votre prénom</label>
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStart()}
              placeholder="Ex : Sophie"
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={handleStart}
            disabled={!nameInput.trim() || startingSession || !questionnaire}
            className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            {startingSession ? 'Démarrage...' : 'Commencer l\'évaluation →'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {/* Zone chat principale */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center gap-3 px-6 shrink-0">
          <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full" />
          <div>
            <div className="font-bold text-sm">Posi-octo</div>
          </div>
          <div className="ml-auto text-[10px] text-slate-400">
            {session.userName} · {questionnaire?.name}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5" id="chat-export-content">
          {messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Démarrage en cours...
            </div>
          )}
          {messages.map(m => (
            <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${m.role === 'user' ? 'bg-slate-200 text-slate-600' : 'bg-indigo-600 text-white'}`}>
                {m.role === 'user' ? (session.userName?.charAt(0).toUpperCase() ?? 'U') : 'SV'}
              </div>
              <div className={`p-4 rounded-2xl max-w-[80%] text-sm leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}`}>
                {m.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                ) : (
                  <div className="prose prose-sm prose-slate max-w-none">
                    <ReactMarkdown
                      components={{
                        li: ({ children, ...props }) => {
                          const isLastMsg = m.id === messages[messages.length - 1]?.id;
                          if (isLastMsg) {
                            return (
                              <li
                                {...props}
                                className="cursor-pointer list-none -ml-4 my-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-all font-medium shadow-sm"
                                onClick={e => {
                                  const text = (e.currentTarget.textContent ?? '').trim();
                                  if (text) setInput(text);
                                }}
                              >
                                {children}
                              </li>
                            );
                          }
                          return <li {...props}>{children}</li>;
                        },
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">SV</div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-4 flex items-center gap-2 text-slate-400 text-sm shadow-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Posi-octoanalyse...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-white border-t border-slate-200 shrink-0">
          {error && (
            <div className="max-w-3xl mx-auto mb-3 px-4 py-2.5 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex justify-between items-center">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700 font-bold ml-3">×</button>
            </div>
          )}
          <form onSubmit={handleSend} className="relative flex items-center max-w-3xl w-full mx-auto">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Répondez à la question..."
              disabled={isLoading || session.status === 'completed'}
              className="w-full pl-5 pr-28 py-3.5 bg-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading || session.status === 'completed'}
              className="absolute right-3 bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              <Send className="w-3 h-3" /> Envoyer
            </button>
          </form>
          {session.status === 'completed' && (
            <p className="text-center text-xs text-slate-400 mt-2">Session terminée.</p>
          )}
        </div>
      </div>

      {/* Panel QR code */}
      <aside className="w-56 border-l border-slate-200 bg-white p-5 flex flex-col gap-4 shrink-0">
        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Accès Mobile</div>
        <QRCodePanel
          url={`${window.location.origin}/s/${sessionId}`}
          size={140}
          label="Scannez pour continuer sur mobile"
        />
      </aside>
    </div>
  );
}
```

- [ ] **Étape 2 : Supprimer l'ancien ChatInterface**

```bash
rm /Users/sebastienveitl/Downloads/zip/src/components/ChatInterface.tsx
```

---

## Task 13 : UserEntry (lien collectif)

**Files:**
- Create: `src/components/user/UserEntry.tsx`

- [ ] **Étape 1 : Créer src/components/user/UserEntry.tsx**

```tsx
// src/components/user/UserEntry.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getQuestionnaireById } from '../../lib/questionnaire';
import { createSession } from '../../lib/sessions';
import QRCodePanel from '../shared/QRCodePanel';
import type { Questionnaire } from '../../types';

export default function UserEntry() {
  const { questionnaireId } = useParams<{ questionnaireId: string }>();
  const navigate = useNavigate();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!questionnaireId) return;
    getQuestionnaireById(questionnaireId).then(q => {
      if (!q) setNotFound(true);
      else setQuestionnaire(q);
    });
  }, [questionnaireId]);

  const handleStart = async () => {
    if (!nameInput.trim() || !questionnaireId || !questionnaire) return;
    setLoading(true);
    try {
      // 'active' directement : le prénom est déjà connu ici
      const sessionId = await createSession(questionnaireId, 'collective', nameInput.trim(), 'active');
      navigate(`/s/${sessionId}`, { replace: true });
    } finally {
      setLoading(false);
    }
  };

  if (notFound) {
    return (
      <div className="h-screen flex items-center justify-center text-slate-500 text-sm">
        Lien invalide ou questionnaire introuvable.
      </div>
    );
  }

  if (!questionnaire) {
    return <div className="h-screen flex items-center justify-center text-slate-400 text-sm">Chargement...</div>;
  }

  const currentUrl = window.location.href;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-sm flex flex-col items-center gap-6">
        <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
          <div className="w-4 h-4 bg-indigo-600 rounded-full" />
        </div>

        <div className="text-center">
          <h1 className="text-xl font-bold tracking-tight">Posi-octo</h1>
          <p className="text-sm text-slate-500 mt-1">{questionnaire.name}</p>
          <p className="text-xs text-slate-400 mt-0.5">{questionnaire.categoriesCount} catégories · {questionnaire.questionsCount} questions</p>
        </div>

        <QRCodePanel url={currentUrl} size={130} label="Partagez ce QR code pour inviter d'autres participants" />

        <div className="w-full">
          <label className="text-xs font-semibold text-slate-600 block mb-2">Votre prénom</label>
          <input
            type="text"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleStart()}
            placeholder="Ex : Sophie"
            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          onClick={handleStart}
          disabled={!nameInput.trim() || loading}
          className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          {loading ? 'Création de la session...' : 'Commencer l\'évaluation →'}
        </button>

        <p className="text-[10px] text-slate-400 text-center">
          Lien collectif — chaque participant crée sa propre session indépendante.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Étape 2 : Ajouter l'import de updateSession dans UserEntry**

En haut de `UserEntry.tsx`, vérifier que l'import de `sessions` est correct (updateSession n'est pas nécessaire ici car `createSession` passe directement `'active'`) :

```typescript
import { getQuestionnaireById } from '../../lib/questionnaire';
import { createSession } from '../../lib/sessions';
```

---

## Task 14 : Mise à jour des règles Firestore + vérification finale

**Files:**
- Modify: `firestore.rules`

- [ ] **Étape 1 : Mettre à jour firestore.rules**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Questionnaires : lecture publique, écriture admin uniquement
    match /questionnaires/{id} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // Sessions : lecture/écriture publique
    // (les utilisateurs créent et écrivent leur propre session)
    match /sessions/{sessionId} {
      allow read, write: if true;

      match /messages/{messageId} {
        allow read, write: if true;
      }
    }
  }
}
```

- [ ] **Étape 2 : Vérification TypeScript globale**

```bash
cd /Users/sebastienveitl/Downloads/zip && npm run lint
```

Résultat attendu : 0 erreur.

- [ ] **Étape 3 : Lancer l'application et tester**

```bash
cd /Users/sebastienveitl/Downloads/zip && npm run dev
```

Ouvrez `http://localhost:5173` et vérifiez le parcours complet :

**Parcours admin :**
1. `http://localhost:5173/admin` → écran de connexion Firebase Auth
2. Connexion → redirection vers `/admin/dashboard`
3. Aller dans Questionnaires → importer un JSON au format requis
4. Activer le questionnaire
5. Dashboard → créer une session individuelle → vérifier QR code + lien
6. Dashboard → lien collectif → vérifier QR code

**Parcours utilisateur — session individuelle :**
1. Ouvrir le lien `/s/:sessionId` généré
2. Saisir le prénom → vérifier que le chat démarre automatiquement
3. Répondre à quelques questions
4. Revenir dans le monitor admin → vérifier le suivi en direct
5. Clore la session → exporter HTML → vérifier radar chart + synthèse

**Parcours utilisateur — lien collectif :**
1. Ouvrir le lien `/q/:questionnaireId`
2. Saisir le prénom → vérifier la redirection vers `/s/:newId`
3. Le chat démarre

- [ ] **Étape 4 : Déployer les règles Firestore**

```bash
cd /Users/sebastienveitl/Downloads/zip && npx firebase deploy --only firestore:rules
```

---

## Notes

- **Modèle Mistral :** `mistral-small-latest` par défaut partout. Pour changer de modèle, modifier la constante dans `UserChat.tsx` et `export.ts` (ou ajouter un paramètre dans les paramètres admin — hors scope de ce plan).
- **Format JSON questionnaire :** Voir `docs/superpowers/specs/2026-06-18-restructuration-admin-user-design.md` pour le format complet avec exemple.
- **UserEntry collectif :** La session créée a `status: 'active'` dès le départ (contrairement à l'individuelle qui est `pending`). La fonction `createSession` crée en `pending` ; pour le collectif, appeler `updateSession(id, { status: 'active' })` juste après. Voir la note ci-dessous.

- **Session collective vs individuelle :** `createSession` accepte un 4ème paramètre `initialStatus`. `UserEntry` passe `'active'` directement (prénom déjà saisi). `AdminDashboard` laisse `'pending'` pour les sessions individuelles (l'utilisateur saisit son prénom à l'arrivée dans UserChat). `UserChat` déclenche automatiquement le message d'accueil IA si la session est `active` avec 0 message (cas collectif).
