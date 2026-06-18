# Restructuration Posi-octo — Admin / Utilisateur

**Date :** 2026-06-18  
**Statut :** Approuvé

---

## Vue d'ensemble

Refonte complète de l'application Posi-octo pour séparer clairement deux espaces distincts :

- **Zone admin** (protégée par Firebase Auth) : gestion des questionnaires JSON, création de sessions, suivi en direct, export des résultats.
- **Zone utilisateur** (publique) : accès via lien ou QR code, saisie du prénom, chat avec l'IA.

L'objectif est que la vue actuelle (dashboard complet) devienne exclusivement la zone admin, et que les utilisateurs aient leur propre interface épurée.

---

## Architecture technique

### Stack conservée
- React + TypeScript + Vite
- Firebase Firestore (persistance) + Firebase Auth (authentification admin)
- Mistral AI (LLM)
- React Router v6 avec lazy loading

### Routes

| Route | Accès | Description |
|---|---|---|
| `/admin` | Firebase Auth | Écran de connexion admin |
| `/admin/dashboard` | Firebase Auth | Tableau de bord général |
| `/admin/questionnaires` | Firebase Auth | Gestion des JSON |
| `/admin/sessions` | Firebase Auth | Liste de toutes les sessions |
| `/admin/sessions/:id` | Firebase Auth | Suivi en direct d'une session |
| `/s/:sessionId` | Public | Chat utilisateur (session individuelle) |
| `/q/:questionnaireId` | Public | Entrée collective (prénom → session → chat) |

Le module admin est chargé en **lazy loading** via `React.lazy()` : le code admin n'est pas inclus dans le bundle utilisateur.

---

## Modèle de données Firestore

### `/questionnaires/{id}`
```json
{
  "id": "string",
  "name": "string",
  "content": "string (JSON sérialisé)",
  "isActive": "boolean",
  "categoriesCount": "number",
  "questionsCount": "number",
  "createdAt": "datetime"
}
```
Un seul questionnaire peut avoir `isActive: true` à la fois. L'activation d'un questionnaire désactive automatiquement le précédent.

### `/sessions/{id}`
```json
{
  "id": "string",
  "questionnaireId": "string",
  "userName": "string",
  "type": "individual | collective",
  "status": "pending | active | completed",
  "createdAt": "datetime",
  "completedAt": "datetime (optionnel)",
  "currentQuestionIndex": "number (mis à jour en temps réel par l'IA)",
  "scores": "{ [categorie: string]: number } (calculé en fin de session, stocké ici)"
}
```

### `/sessions/{id}/messages/{id}`
```json
{
  "role": "user | assistant",
  "content": "string",
  "createdAt": "datetime"
}
```

---

## Format JSON des questionnaires

Le fichier JSON importé par l'admin doit respecter cette structure :

```json
{
  "title": "Architecture Logicielle",
  "categories": [
    {
      "name": "Conception",
      "questions": [
        {
          "question": "Qu'est-ce que le principe SOLID ?",
          "expectedAnswers": ["5 principes de conception OO", "Single Responsibility..."],
          "hint": "Pensez aux initiales de chaque principe."
        }
      ]
    },
    {
      "name": "Base de données",
      "questions": [...]
    }
  ]
}
```

Les **catégories** définissent les axes du radar chart dans l'export.

---

## Flux admin

### Authentification
- Page `/admin` → formulaire email/mot de passe Firebase Auth
- Redirection vers `/admin/dashboard` si déjà authentifié
- Déconnexion disponible dans la sidebar

### Gestion des questionnaires (`/admin/questionnaires`)
- Liste des JSON importés avec nom, nb de catégories, nb de questions, date
- Bouton "Importer un JSON" → file picker, validation JSON + structure, upload en Firestore
- Bouton "Activer" sur chaque questionnaire (désactive automatiquement l'actif en cours)
- Bouton "Aperçu" pour visualiser les questions
- Zone drag-and-drop pour l'import

### Tableau de bord (`/admin/dashboard`)
- Statistiques : sessions actives, sessions terminées, score moyen
- Tableau des sessions récentes (nom, questionnaire, type, statut, score, actions)
- Bouton "Session individuelle" : modale → saisir le nom de l'utilisateur → génère un lien + QR code unique (`/s/:newSessionId`)
- Bouton "Lien collectif" : modale → affiche le lien + QR code vers `/q/:questionnaireActifId`

### Suivi en direct (`/admin/sessions/:id`)
- Lecture en temps réel du chat (onSnapshot Firestore), mode lecture seule
- Panel latéral : progression (question X/N), catégorie en cours, durée, indicateurs de réponses (✓/~)
- Bouton "Clore la session" → passe `status` à `completed`, déclenche le calcul des scores
- Bouton "Exporter HTML" → disponible dès la fin de session

---

## Flux utilisateur

### Session individuelle (`/s/:sessionId`)
- L'admin a créé la session en amont (`status: pending`)
- À l'arrivée : écran d'accueil avec nom du questionnaire + champ prénom
- Validation du prénom → `status: active`, `userName` sauvegardé en Firestore → chat démarre
- Interface : header simple (nom du bot + info session), zone de messages, input, panel QR code mobile

### Lien collectif (`/q/:questionnaireId`)
- Écran d'accueil : titre du questionnaire + QR code + champ prénom
- Validation du prénom → création automatique d'une nouvelle session (`type: collective`) → redirection vers `/s/:newSessionId`
- Même interface de chat ensuite

### Interface de chat (commune)
- Messages utilisateur à droite (bulle indigo), messages IA à gauche (bulle blanche)
- Rendu Markdown pour les réponses IA
- Options à choix multiples cliquables (même comportement qu'actuellement)
- Panel latéral droit : QR code pointant vers `/s/:sessionId` pour reprendre sur mobile
- Pas de sidebar de gestion (réservée à l'admin)

---

## Export HTML

Déclenché depuis `/admin/sessions/:id` une fois la session `completed`.

### Contenu du fichier HTML généré
1. **En-tête** : nom de l'utilisateur, questionnaire, date, durée
2. **Radar chart** : score par catégorie (0–100), rendu via Chart.js embarqué inline
3. **Synthèse textuelle** : paragraphe généré par Mistral résumant les forces et axes d'amélioration
4. **Historique complet** : transcript du chat formaté

### Calcul des scores
Après `status: completed`, un appel Mistral est effectué avec le transcript complet + le JSON du questionnaire. Mistral retourne un JSON `{ "Conception": 85, "Base de données": 72, ... }`. Ces scores sont sauvegardés dans le champ `scores` du document `sessions/{id}` et utilisés pour le radar.

---

## Composants à créer / modifier

### Nouveaux composants admin (lazy-loaded)
- `AdminLogin` — formulaire Firebase Auth
- `AdminLayout` — sidebar nav + outlet
- `AdminDashboard` — stats + tableau sessions
- `AdminQuestionnaires` — gestion JSON
- `AdminSessionList` — liste filtrée
- `AdminSessionMonitor` — suivi temps réel + export

### Nouveaux composants utilisateur
- `UserEntry` — écran d'accueil prénom (individuel et collectif)
- `UserChat` — interface chat épurée (refactoring de ChatInterface.tsx)

### Modifié
- `App.tsx` — devient le routeur principal avec lazy loading
- `types.ts` — ajout des nouveaux types (Questionnaire, scores)
- `firestore.rules` — règles d'accès par route

---

## Firestore Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Questionnaires : lecture publique (pour afficher le titre), écriture admin seulement
    match /questionnaires/{id} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // Sessions : lecture/écriture publique (l'utilisateur crée et écrit sa session)
    match /sessions/{sessionId} {
      allow read, write: if true;
      match /messages/{messageId} {
        allow read, write: if true;
      }
    }
  }
}
```

---

## Ce qui est conservé

- La logique Mistral (`lib/mistral.ts`) et le prompt système pédagogique
- Le rendu Markdown et les options cliquables
- L'export PDF/Markdown (déplacé côté admin)
- Firebase Firestore comme base de données
- Le QR code mobile dans l'interface utilisateur

---

## Ce qui est supprimé / déplacé

- L'import JSON depuis le chat utilisateur → déplacé dans l'admin
- La sélection de modèle Mistral depuis le chat → déplacé dans les paramètres admin
- La page d'accueil actuelle (bouton "Nouvelle Session") → remplacée par le flux user entry
