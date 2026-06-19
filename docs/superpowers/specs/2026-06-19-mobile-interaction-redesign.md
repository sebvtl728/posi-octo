# Design : Refonte de l'interaction mobile côté utilisateur

**Date :** 2026-06-19  
**Scope :** `src/components/user/UserChat.tsx` — zone d'interaction en bas de l'écran  
**Objectif :** Remplacer les chips de réponse rapide par de gros boutons tactiles adaptés au mobile, avec gestion du mode multi-sélection. Corriger également la fuite des réponses attendues dans le prompt IA.

---

## Contexte

L'interface de chat utilisateur (`UserChat.tsx`) propose actuellement :
- Un textarea + bouton ↑ pour la saisie libre
- Des chips de réponse rapide (`sm:hidden`) qui apparaissent quand le bot liste des options numérotées

Les chips sont petits et le mode multi-sélection n'existe pas. L'expérience sur mobile est contraignante.

---

## Détection du mode d'interaction

À chaque mise à jour des messages, on analyse le **dernier message `assistant`** pour déterminer le mode :

| Condition | Mode |
|---|---|
| Aucune option numérotée (`/^\d+[.)]\s+\S/`) | `text` |
| Options détectées + mot-clé multi (`plusieurs`, `cochez`, `sélectionnez`, `choisissez`, `plusieurs réponses`, `toutes les`, `tout ce qui`) | `multi` |
| Options détectées, sans mot-clé multi | `multi` par défaut |

**Règle de sécurité : en présence d'options numérotées, on utilise toujours le mode `multi`.** Cela évite l'envoi immédiat involontaire sur les questions à réponse unique. L'utilisateur clique sur un bouton puis tape "Valider" — une étape de plus, mais zéro risque de valider trop tôt. Le mode `single` (tap = envoi immédiat) est supprimé pour éviter toute ambiguïté.

La détection tourne uniquement côté client, sans modification du prompt IA ni du backend.

---

## Comportement par mode

### Mode `text`
- Affiche le textarea + bouton ↑ existants, **inchangés**
- Cas : questions ouvertes, questions de positionnement libres

### Mode `single` — supprimé
Le mode single (tap = envoi immédiat) est supprimé. Toutes les questions avec options numérotées passent par le mode `multi` pour éviter toute validation prématurée.

### Mode `multi`
- Même boutons, avec état **sélectionné** persistant (fond indigo clair + coche ✓)
- Re-tapper un bouton sélectionné le désélectionne
- Un bouton **"Valider"** fixe apparaît dès qu'au moins une option est sélectionnée
- Validation : les options sélectionnées sont joinées par `", "` en un seul message
- Textarea masquée

---

## UI des boutons

- Largeur : pleine largeur (`w-full`)
- Hauteur minimum : 52px (`min-h-[52px]`)
- Padding : `px-4 py-3`
- Texte : 15px (`text-[15px]`), aligné à gauche
- Style par défaut : `bg-white border border-slate-200 text-slate-800 rounded-xl`
- Style sélectionné (multi) : `bg-indigo-50 border-indigo-400 text-indigo-800` + coche à droite
- Style au tap (single) : flash `bg-indigo-600 text-white`
- Si > 4 options : zone scrollable avec `max-h-[240px] overflow-y-auto`

### Bouton "Valider" (mode multi uniquement)
- Apparaît sous la liste une fois ≥ 1 option sélectionnée
- Style : `w-full bg-indigo-600 text-white rounded-xl py-3 text-sm font-medium`
- Désactivé pendant l'envoi (`sending`)

---

## Correction critique — fuite des réponses attendues dans le prompt IA

**Problème :** `buildSystemPrompt` passe `JSON.stringify(questionnaire?.categories)` à l'IA, ce qui inclut le champ `expectedAnswers` de chaque question. L'IA voit donc les bonnes réponses et les révèle implicitement sous forme de conseils ou d'indices dans ses messages, ce qui annule l'intérêt du questionnaire.

**Correction :**
- Filtrer les catégories avant de les envoyer à l'IA : ne garder que `name` et `questions[].question` (supprimer `expectedAnswers` et `hint`)
- Ajouter une consigne explicite dans le prompt : _"Ne révèle jamais les réponses attendues, ne suggère pas la bonne réponse, ne donne aucun indice orienté. Pose les questions telles quelles et laisse l'utilisateur répondre librement."_

```ts
// Avant (fuite des réponses)
JSON.stringify(questionnaire?.categories, null, 2)

// Après (filtré)
JSON.stringify(
  questionnaire?.categories.map(c => ({
    name: c.name,
    questions: c.questions.map(q => ({ question: q.question }))
  })),
  null, 2
)
```

---

## Rendu des messages IA — suppression des coches markdown

Le bot génère parfois des listes de cases cochées en markdown (`- [x] Option`) rendues par ReactMarkdown avec une coche verte. Ce rendu est **trompeur** : il suggère que la réponse est déjà sélectionnée alors que l'utilisateur n'a rien choisi.

**Correction :** désactiver le composant `input` de type `checkbox` dans le rendu ReactMarkdown des messages `assistant`, en passant un `components` prop qui remplace `input[type=checkbox]` par `null` (ou un span neutre). Les options restent lisibles comme texte mais sans case cochée.

---

## Correction du scroll horizontal sur mobile

Le layout actuel (`flex h-screen`) peut générer un scroll horizontal si un élément enfant dépasse la largeur du viewport (messages longs, conteneur sans `max-w`, etc.).

**Corrections à appliquer sur le conteneur racine et la zone messages :**
- Ajouter `overflow-x: hidden` sur le conteneur racine (`<div className="flex h-screen ...">`)
- S'assurer que les bulles de messages ont bien `max-w-[78%]` ET `break-words` (`break-words overflow-wrap-anywhere`)
- S'assurer que le rendu ReactMarkdown dans les bulles n'élargit pas la bulle (ajouter `overflow-hidden` sur le wrapper de la bulle assistant si nécessaire)

---

## Ce qui ne change pas

- Header, messages, typing indicator, gestion des erreurs : inchangés
- Panneau QR desktop : inchangé
- Écran d'entrée (`UserEntry.tsx`) : inchangé
- Écran de complétion : inchangé
- Les boutons sont **mobiles uniquement** (`sm:hidden`), comme les chips actuels. Sur desktop (≥ `sm`), le textarea reste toujours visible quel que soit le mode détecté.

---

## Fichiers modifiés

- `src/components/user/UserChat.tsx` :
  - Filtrage de `expectedAnswers` dans `buildSystemPrompt` + consigne anti-fuite dans le prompt
  - Remplacement du bloc `quickReplies` et de la zone d'input par le nouveau système à 3 modes
  - Correction scroll horizontal
  - Neutralisation des checkboxes markdown dans les bulles du bot
