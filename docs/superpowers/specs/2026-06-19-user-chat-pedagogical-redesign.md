# Design : Refonte pédagogique de l'interface utilisateur (chat + interaction)

**Date :** 2026-06-19
**Scope :** `src/components/user/UserChat.tsx`
**Objectif :** Repositionner l'IA comme examinateur pédagogique de soutenance, piloter les boutons de réponse depuis les données du questionnaire (et non depuis l'output textuel de l'IA), améliorer le ton et la qualité des questions.

---

## Contexte et problèmes résolus

L'itération précédente avait :
- Des boutons pilotés par détection de listes numérotées dans l'output IA
- Des règles IA trop strictes ("n'inclus aucun indice") qui empêchaient l'IA de lister des options → **zéro bouton affiché**
- Un ton formulaïque répétant le prénom à chaque message
- Des questions vagues car les thèmes JSON n'étaient pas bien reformulés

---

## Architecture — Index de question côté client

### Liste plate de questions

```ts
const allQuestions = questionnaire.categories.flatMap(c => c.questions);
// [{question, expectedAnswers, hint?}, ...]
```

### État `questionIndex`

- Initialisé à `0` au montage du composant
- **Incrémenté dans `handleSend` uniquement**, après `addMessage` (couvre les deux paths : textarea et boutons, car `handleValidate` appelle `handleSend`)
- Clampé à `allQuestions.length - 1` pour ne pas dépasser la fin
- Utilisé pour lookup : `allQuestions[questionIndex]`

### Détection du mode UI

| Condition | Mode |
|---|---|
| `allQuestions[questionIndex]?.expectedAnswers?.length > 0` | **Boutons** multi-sélection |
| Sinon (vide, absent, ou index hors bornes) | **Textarea** libre |

Cette détection est recalculée à chaque rendu. Elle s'adapte automatiquement quand `questionIndex` change.

---

## Prompt IA — Redesign pédagogique

### Ce que l'IA reçoit

Pour le mode collectif/individuel, le prompt inclut les données complètes de chaque question :

```ts
const categoriesForAI = questionnaire.categories.map(c => ({
  name: c.name,
  questions: c.questions.map(q => ({
    question: q.question,
    expectedAnswers: q.expectedAnswers,   // pour évaluation uniquement
    ...(q.hint ? { hint: q.hint } : {}),
  })),
}));
```

### Consignes du prompt

```
Tu es TypBot, un examinateur pédagogique qui prépare {userName} à une soutenance orale sur "{title}".

Ton rôle : poser les questions du questionnaire une par une, évaluer les réponses, donner un feedback bref et naturel, puis passer à la suivante.

Les champs "question" sont des thèmes ou mots-clés. Reformule chaque thème en une vraie question orale, précise et pédagogique.

Les "expectedAnswers" sont uniquement pour ton évaluation interne. Ne les cite jamais dans tes questions. Ne révèle pas les réponses attendues avant que l'utilisateur ait répondu.

Si un "hint" est présent, utilise-le pour mieux formuler ta question — sans en révéler le contenu.

Ton : bienveillant mais direct, comme un jury de soutenance encourageant. N'utilise le prénom de l'utilisateur qu'occasionnellement (pas à chaque message). Varie tes formulations de feedback. Sois concis.

Règles absolues :
- Une seule question par message.
- N'avance pas vers la question suivante sans réponse explicite de l'utilisateur.
- Ne réponds jamais à une question à la place de l'utilisateur.
```

### Mode positionnement (inchangé)
Le prompt positioning reste tel quel — il n'utilise pas `expectedAnswers`.

---

## UI — Boutons multi-sélection (tous écrans)

Les boutons sont désormais visibles sur **toutes les tailles d'écran** (suppression du `sm:hidden`).

### Quand des boutons sont affichés

- La zone textarea est **masquée**
- Les `expectedAnswers` de la question courante sont affichés comme boutons pleine largeur
- Multi-sélection : tap/clic = sélectionné (fond indigo clair + ✓), re-tap = désélectionné
- Bouton **"Valider"** apparaît dès qu'≥ 1 option est cochée
- `handleValidate` envoie `selectedOptions.join(', ')` et incrémente `questionIndex`

### Quand le textarea est affiché

- Comportement inchangé : textarea auto-resize + bouton ↑
- `handleSend` incrémente `questionIndex` après envoi

### Réinitialisation

- `selectedOptions` se remet à `[]` dans `handleSend`, juste avant le `setSending(false)` final
- **Supprimer** le `useEffect(() => { setSelectedOptions([]); }, [messages])` existant — le reset se fait désormais dans le handler

### Boutons — styles

| État | Classes Tailwind |
|---|---|
| Par défaut | `bg-white border border-slate-200 text-slate-800 rounded-xl` |
| Sélectionné | `bg-indigo-50 border-2 border-indigo-400 text-indigo-800` |
| Bouton Valider | `w-full bg-indigo-600 text-white rounded-xl py-3 font-semibold` |

Hauteur minimum : `min-h-[52px]`. Texte aligné à gauche, `text-[15px]`.
Si > 4 options : zone scrollable `max-h-60 overflow-y-auto`.

---

## Ce qui est supprimé

- Détection `buttonOptions` basée sur les listes numérotées de l'IA → remplacée par lookup `allQuestions[questionIndex].expectedAnswers`
- `sm:hidden` sur les boutons → boutons visibles sur tous les écrans
- Règle "N'inclus aucun indice, suggestion orientée" → remplacée par "Ne révèle pas les réponses attendues dans tes questions"

## Ce qui est conservé

- Neutralisation des cases à cocher markdown (`components={{ input: () => null }}`)
- `break-words min-w-0` sur les bulles
- `overflow-hidden` sur le wrapper ReactMarkdown
- Mode positionnement inchangé
- Écrans pending, completed, loading inchangés

---

## Fichier modifié

`src/components/user/UserChat.tsx` uniquement.
