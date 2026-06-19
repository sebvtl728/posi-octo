# Design : Refonte de l'interaction mobile côté utilisateur

**Date :** 2026-06-19  
**Scope :** `src/components/user/UserChat.tsx` — zone d'interaction en bas de l'écran  
**Objectif :** Remplacer les chips de réponse rapide par de gros boutons tactiles adaptés au mobile, avec gestion du mode multi-sélection.

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
| Options détectées + mot-clé multi (`plusieurs`, `cochez`, `sélectionnez`, `choisissez`, `plusieurs réponses`) | `multi` |
| Options détectées, sans mot-clé multi | `single` |

La détection tourne uniquement côté client, sans modification du prompt IA ni du backend.

---

## Comportement par mode

### Mode `text`
- Affiche le textarea + bouton ↑ existants, **inchangés**
- Cas : questions ouvertes, questions de positionnement libres

### Mode `single`
- **Remplace** la zone textarea par une liste verticale de boutons pleine largeur
- Tap sur un bouton → envoie immédiatement la réponse correspondante
- Feedback visuel au tap : fond indigo, texte blanc (flash avant disparition)
- Textarea masquée

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

## Ce qui ne change pas

- Header, messages, typing indicator, gestion des erreurs : inchangés
- Panneau QR desktop : inchangé
- Écran d'entrée (`UserEntry.tsx`) : inchangé
- Écran de complétion : inchangé
- Les boutons sont **mobiles uniquement** (`sm:hidden`), comme les chips actuels. Sur desktop (≥ `sm`), le textarea reste toujours visible quel que soit le mode détecté.

---

## Fichier modifié

- `src/components/user/UserChat.tsx` : remplacement du bloc `quickReplies` et de la zone d'input par le nouveau système à 3 modes
