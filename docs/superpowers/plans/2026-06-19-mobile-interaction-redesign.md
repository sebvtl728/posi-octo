# Mobile Interaction Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les bugs critiques du prompt IA et refondre l'interaction mobile dans `UserChat.tsx` pour proposer des boutons multi-sélection avec validation explicite.

**Architecture:** Toutes les modifications sont concentrées dans `src/components/user/UserChat.tsx`. On corrige d'abord le prompt (cause des auto-réponses et fuites de réponses), puis le layout (scroll horizontal), puis on remplace le système de chips par des boutons multi-sélection mobiles.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, react-markdown v10, Vite

## Global Constraints

- Mobile uniquement pour les boutons : wrapper `sm:hidden`
- Sur desktop (≥ `sm`) : le textarea reste toujours visible
- Aucune dépendance nouvelle à installer
- Vérification TypeScript : `npm run lint` doit passer sans erreur après chaque tâche
- Un seul fichier modifié : `src/components/user/UserChat.tsx`

---

### Task 1 : Corriger le prompt IA — supprimer les réponses attendues et ajouter les contraintes strictes

**Files:**
- Modify: `src/components/user/UserChat.tsx` — fonction `buildSystemPrompt`

**Interfaces:**
- Produces: `buildSystemPrompt(userName: string): string` — inchangé en signature, corrigé en contenu

- [ ] **Step 1 : Localiser `buildSystemPrompt` dans le fichier**

Ouvrir `src/components/user/UserChat.tsx`, lignes 75–90. La fonction ressemble à :

```ts
const buildSystemPrompt = (userName: string): string => {
  if (session?.type === 'positioning') {
    return `Tu es TypBot, un assistant de positionnement Qualiopi...
Domaines à explorer : ${JSON.stringify(questionnaire?.categories?.map((c: { name: string }) => c.name))}.
...`;
  }
  return `Tu es TypBot, un assistant IA qui guide des utilisateurs à travers un questionnaire interactif. Le questionnaire s'appelle "${questionnaire?.title}". Voici les catégories et questions:\n\n${JSON.stringify(questionnaire?.categories, null, 2)}\n\nSois bienveillant, encourageant et guide l'utilisateur à travers chaque question du questionnaire.`;
};
```

- [ ] **Step 2 : Remplacer `buildSystemPrompt` par la version corrigée**

Remplacer l'intégralité de la fonction par :

```ts
const buildSystemPrompt = (userName: string): string => {
  const strictRules = `

Règles absolues — tu dois les respecter sans exception :
- Pose UNE seule question par message. Jamais deux.
- N'avance JAMAIS vers la question suivante sans avoir reçu une réponse explicite de l'utilisateur dans ce chat.
- Ne réponds JAMAIS à une question à la place de l'utilisateur, même à titre d'exemple ou d'illustration.
- Ne révèle jamais les réponses attendues ou correctes.
- N'inclus aucun indice, suggestion orientée ou exemple de réponse dans tes messages.
- Si l'utilisateur n'a pas encore répondu, attends. Ne continue pas.`;

  if (session?.type === 'positioning') {
    return `Tu es TypBot, un assistant de positionnement Qualiopi. Avant la formation "${questionnaire?.title}", tu conduis un entretien de positionnement individuel avec ${userName} pour évaluer son niveau initial et identifier ses besoins, conformément aux indicateurs I5, I6 et I9 du référentiel Qualiopi 2021.

Explore avec bienveillance, en posant UNE question à la fois :
- Ses acquis et connaissances actuelles dans les domaines abordés (I5)
- Ses attentes et objectifs vis-à-vis de la formation (I5)
- Ses éventuels besoins spécifiques : situation de handicap, contraintes, rythme d'apprentissage (I6)
- Son contexte professionnel et sa motivation

Domaines à explorer : ${JSON.stringify(questionnaire?.categories?.map((c: { name: string }) => c.name))}.

Sois chaleureux, professionnel et rassurant. À la fin, annonce que l'entretien est terminé et que le formateur recevra un compte-rendu personnalisé.${strictRules}`;
  }

  const categoriesForAI = questionnaire?.categories.map(c => ({
    name: c.name,
    questions: c.questions.map((q: { question: string }) => ({ question: q.question })),
  }));

  return `Tu es TypBot, un assistant IA qui guide des utilisateurs à travers un questionnaire interactif. Le questionnaire s'appelle "${questionnaire?.title}". Voici les catégories et questions :\n\n${JSON.stringify(categoriesForAI, null, 2)}\n\nSois bienveillant et encourageant.${strictRules}`;
};
```

- [ ] **Step 3 : Vérifier TypeScript**

```bash
npm run lint
```

Attendu : aucune erreur TypeScript.

- [ ] **Step 4 : Test manuel — vérifier que l'IA ne s'auto-répond plus**

Démarrer l'app (`npm run dev`), ouvrir une session en mode collectif ou individuel.
- L'IA doit poser une question et **attendre** la réponse de l'utilisateur
- L'IA ne doit pas enchaîner 2 ou 3 questions dans le même message
- L'IA ne doit pas proposer d'exemples de réponses orientés

- [ ] **Step 5 : Commit**

```bash
git add src/components/user/UserChat.tsx
git commit -m "fix: strip expectedAnswers from AI prompt and add strict one-question-at-a-time rules"
```

---

### Task 2 : Corriger le scroll horizontal et neutraliser les coches markdown

**Files:**
- Modify: `src/components/user/UserChat.tsx` — conteneur racine, bulles de messages, rendu ReactMarkdown

**Interfaces:**
- Consumes: rien de Task 1 directement (modifications indépendantes dans le JSX)
- Produces: layout sans scroll horizontal, messages sans cases cochées vertes

- [ ] **Step 1 : Ajouter `overflow-x-hidden` sur le conteneur racine**

Trouver la ligne (environ ligne 239) :
```tsx
<div className="flex h-screen bg-slate-50 overflow-hidden">
```

Si `overflow-hidden` est déjà présent, il couvre les deux axes — vérifier. Sinon remplacer par :
```tsx
<div className="flex h-screen bg-slate-50 overflow-hidden">
```

`overflow-hidden` en Tailwind équivaut à `overflow: hidden` (x et y). C'est suffisant.

- [ ] **Step 2 : Ajouter `break-words` sur les bulles de messages**

Trouver la `div` de bulle (environ ligne 257–263) :
```tsx
<div
  className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm ${
    isUser
      ? 'bg-indigo-600 text-white rounded-br-sm'
      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
  }`}
>
```

Remplacer par :
```tsx
<div
  className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm break-words min-w-0 ${
    isUser
      ? 'bg-indigo-600 text-white rounded-br-sm'
      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
  }`}
>
```

- [ ] **Step 3 : Ajouter `overflow-hidden` sur le wrapper ReactMarkdown et neutraliser les checkboxes**

Trouver le bloc ReactMarkdown (environ ligne 267–269) :
```tsx
<div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1">
  <ReactMarkdown>{msg.content}</ReactMarkdown>
</div>
```

Remplacer par :
```tsx
<div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 overflow-hidden">
  <ReactMarkdown
    components={{
      input: () => null,
    }}
  >
    {msg.content}
  </ReactMarkdown>
</div>
```

Le `components={{ input: () => null }}` supprime le rendu des cases à cocher `- [x]` et `- [ ]` générées par le bot en markdown GFM.

- [ ] **Step 4 : Vérifier TypeScript**

```bash
npm run lint
```

Attendu : aucune erreur TypeScript.

- [ ] **Step 5 : Test manuel — vérifier le scroll et les coches**

Ouvrir la session sur un vrai mobile (ou DevTools en mode responsive, largeur 390px) :
- Faire défiler une conversation longue → aucun scroll horizontal ne doit apparaître
- Si le bot a généré un message avec `- [x] Option`, ce texte doit s'afficher sans case à cocher verte

- [ ] **Step 6 : Commit**

```bash
git add src/components/user/UserChat.tsx
git commit -m "fix: prevent horizontal scroll on mobile and strip markdown checkboxes from bot messages"
```

---

### Task 3 : Remplacer les chips par des boutons multi-sélection avec "Valider"

**Files:**
- Modify: `src/components/user/UserChat.tsx` — état `selectedOptions`, détection `buttonOptions`, rendu de la zone d'interaction en bas

**Interfaces:**
- Consumes: `handleSend(content: string): Promise<void>` — défini dans le composant, inchangé
- Consumes: `messages: Message[]`, `sending: boolean` — état existant du composant
- Produces: zone d'interaction bas d'écran avec boutons mobiles multi-sélection

- [ ] **Step 1 : Ajouter l'état `selectedOptions`**

Après la ligne déclarant `const [sendError, setSendError] = useState('');` (environ ligne 128), ajouter :

```ts
const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
```

- [ ] **Step 2 : Réinitialiser `selectedOptions` à chaque nouveau message**

Après le `useEffect` qui scrolle vers le bas (environ ligne 69–71), ajouter :

```ts
useEffect(() => {
  setSelectedOptions([]);
}, [messages]);
```

- [ ] **Step 3 : Remplacer la détection `quickReplies` par `buttonOptions`**

Trouver le bloc `quickReplies` existant (environ ligne 139–148) :
```ts
const quickReplies = (() => {
  const last = [...messages].reverse().find(m => m.role === 'assistant');
  if (!last) return null;
  const lines = last.content.split('\n')
    .map(l => l.trim())
    .filter(l => /^\d+[.)]\s+\S/.test(l))
    .map(l => l.replace(/^\d+[.)]\s+/, '').trim())
    .filter(l => l.length > 0 && l.length <= 80);
  return lines.length >= 2 && lines.length <= 6 ? lines : null;
})();
```

Remplacer par :
```ts
const buttonOptions = (() => {
  if (sending) return null;
  const last = [...messages].reverse().find(m => m.role === 'assistant');
  if (!last) return null;
  const lines = last.content.split('\n')
    .map(l => l.trim())
    .filter(l => /^\d+[.)]\s+\S/.test(l))
    .map(l => l.replace(/^\d+[.)]\s+/, '').trim())
    .filter(l => l.length > 0 && l.length <= 100);
  return lines.length >= 2 && lines.length <= 8 ? lines : null;
})();
```

- [ ] **Step 4 : Ajouter les handlers de toggle et validation**

Après la déclaration de `handleSend` (environ ligne 171), ajouter :

```ts
const toggleOption = (option: string) => {
  setSelectedOptions(prev =>
    prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option]
  );
};

const handleValidate = () => {
  if (selectedOptions.length === 0 || sending) return;
  handleSend(selectedOptions.join(', '));
  setSelectedOptions([]);
};
```

- [ ] **Step 5 : Remplacer le bloc chips et la zone d'input dans le JSX**

Trouver le bloc chips existant (environ lignes 287–299) :
```tsx
{/* Chips de réponse rapide — mobile uniquement, si le dernier message contient des options numérotées */}
{quickReplies && !sending && (
  <div className="sm:hidden px-4 pb-2 bg-white border-t border-slate-100 flex flex-wrap gap-2 pt-2">
    {quickReplies.map((option, i) => (
      <button
        key={i}
        onClick={() => handleSend(option)}
        className="px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-sm font-medium active:bg-indigo-100 transition-colors"
      >
        {option}
      </button>
    ))}
  </div>
)}
```

Supprimer ce bloc entièrement.

Trouver ensuite la zone d'input (environ lignes 301–331) :
```tsx
<div className="p-3 border-t border-slate-200 bg-white pb-safe">
  <div className="flex gap-2 items-end">
    <textarea ... />
    <button ... >↑</button>
  </div>
</div>
```

Remplacer ce bloc par :
```tsx
{/* Zone d'interaction — mobile : boutons si options détectées, sinon textarea */}
{buttonOptions ? (
  <div className="sm:hidden border-t border-slate-200 bg-white pb-safe">
    <div className={`px-3 pt-3 flex flex-col gap-2 ${buttonOptions.length > 4 ? 'max-h-60 overflow-y-auto' : ''}`}>
      {buttonOptions.map((option, i) => {
        const isSelected = selectedOptions.includes(option);
        return (
          <button
            key={i}
            onClick={() => toggleOption(option)}
            className={`w-full min-h-[52px] px-4 py-3 rounded-xl text-[15px] text-left font-medium transition-colors flex items-center justify-between gap-3 ${
              isSelected
                ? 'bg-indigo-50 border-2 border-indigo-400 text-indigo-800'
                : 'bg-white border border-slate-200 text-slate-800 active:bg-slate-50'
            }`}
          >
            <span>{option}</span>
            {isSelected && <span className="text-indigo-600 shrink-0">✓</span>}
          </button>
        );
      })}
    </div>
    {selectedOptions.length > 0 && (
      <div className="px-3 py-3">
        <button
          onClick={handleValidate}
          disabled={sending}
          className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors active:bg-indigo-700"
        >
          Valider
        </button>
      </div>
    )}
  </div>
) : null}

{/* Textarea — desktop toujours visible, mobile visible uniquement si pas de boutons */}
<div className={`${buttonOptions ? 'hidden sm:block' : ''} p-3 border-t border-slate-200 bg-white pb-safe`}>
  <div className="flex gap-2 items-end">
    <textarea
      ref={textareaRef}
      rows={1}
      value={input}
      onChange={e => { setInput(e.target.value); resizeTextarea(); }}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend(input);
          if (textareaRef.current) textareaRef.current.style.height = 'auto';
        }
      }}
      placeholder="Votre réponse…"
      disabled={sending}
      className="flex-1 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 resize-none leading-snug"
    />
    <button
      onClick={() => {
        handleSend(input);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      }}
      disabled={sending || !input.trim()}
      className="px-4 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
    >
      ↑
    </button>
  </div>
</div>
```

- [ ] **Step 6 : Vérifier TypeScript**

```bash
npm run lint
```

Attendu : aucune erreur TypeScript.

- [ ] **Step 7 : Test manuel — boutons multi-sélection**

Ouvrir la session sur mobile (DevTools 390px ou vrai appareil) :

**Scénario A — question à choix (bot liste des options numérotées) :**
- Les boutons pleine largeur apparaissent en bas à la place du textarea
- Tapper un bouton → il passe en indigo clair avec ✓, le bouton "Valider" apparaît
- Tapper un second bouton → il s'ajoute à la sélection
- Re-tapper un bouton sélectionné → il se désélectionne
- Tapper "Valider" → les options sélectionnées s'envoient en un message joint par ", "
- Après envoi : les boutons disparaissent, le textarea réapparaît

**Scénario B — question ouverte (pas de liste numérotée dans le message du bot) :**
- Le textarea s'affiche normalement, les boutons n'apparaissent pas

**Scénario C — desktop (≥ 640px) :**
- Le textarea est toujours visible, les boutons n'apparaissent jamais

- [ ] **Step 8 : Commit**

```bash
git add src/components/user/UserChat.tsx
git commit -m "feat: replace quick-reply chips with multi-select buttons and explicit Valider on mobile"
```
