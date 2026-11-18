# Lichess Study Trainer

[![CI](https://github.com/Tendoskria/lichess-study-trainer/actions/workflows/ci.yml/badge.svg)](https://github.com/Tendoskria/lichess-study-trainer/actions/workflows/ci.yml)

Entraîne-toi sur tes ouvertures en rejouant les lignes de **tes propres études Lichess** :
l’application affiche une position tirée de ton étude et tu dois retrouver le coup prévu.

> Projet indépendant, non affilié à Lichess.

## Fonctionnalités

- Position aléatoire à n’importe quel moment d’une ligne, ou départ depuis le début du chapitre ;
  l’adversaire répond avec les coups de l’étude (au hasard parmi les variantes).
- Toutes les variantes de l’étude sont acceptées comme bonnes réponses.
- Page dédiée au chargement (bouton réglages ⚙) avec deux sources : **Pseudo** (toutes tes études
  publiques, ou un lien d’étude) ou **PGN** (collé ou depuis un fichier).
- Page d’accueil qui te guide tant qu’aucune étude n’est chargée.
- Filtres par étude et par chapitre ; le nom du chapitre est masqué jusqu’à ta première bonne réponse.
- Une erreur déclenche un effet façon jeu vidéo (échiquier qui tremble, flash rouge, case jouée à tort
  en surbrillance) ; réduit automatiquement si le système demande moins d’animations.
- Une ligne terminée déclenche une bannière de victoire qui apparaît en fondu, avec confettis et
  étincelles (réduits à un simple fondu si le système demande moins d’animations).
- Indice (annotations de l’auteur ou case de départ) et « Voir le coup ».
- Les flèches et cases colorées de ton étude (`[%cal]`, `[%csl]`) s’affichent après une bonne réponse.
- Échiquier SVG : clic ou glisser-déposer, coups légaux et captures signalés comme sur Lichess.
- Navigation dans l’historique : `←` `→` `↑` `↓` / `Début` `Fin`, ou clic sur un coup.
- Thème clair/sombre automatique, étude mémorisée dans le navigateur.

## Démarrage

Prérequis : Node.js ≥ 20 (`.nvmrc` : 22).

```bash
npm ci
npm run dev        # http://localhost:5173
```

Au premier lancement, la page d’accueil te mène à la page de chargement : saisis ton pseudo Lichess.

## Scripts

| Commande                | Rôle                                                  |
| ----------------------- | ----------------------------------------------------- |
| `npm run dev`           | Serveur de développement Vite                         |
| `npm run build`         | Vérification des types puis build de production       |
| `npm run preview`       | Sert le build localement                              |
| `npm run check`         | Typecheck + lint + format + tests (ce que fait la CI) |
| `npm test`              | Tests unitaires (Vitest)                              |
| `npm run test:coverage` | Tests avec couverture                                 |
| `npm run lint`          | ESLint                                                |
| `npm run format`        | Prettier (écriture)                                   |

## Architecture

```
src/
├─ domain/            Logique pure, sans DOM — testable sous Node
│  ├─ types.ts        Modèle (Chapter, MoveNode, Shapes…)
│  ├─ pgn.ts          PGN → arbre de coups (variantes, commentaires)
│  ├─ shapes.ts       Annotations %cal / %csl
│  ├─ study.ts        Requêtes sur les chapitres, validation
│  └─ training.ts     TrainingSession : machine d’état de l’exercice
├─ services/
│  ├─ lichess.ts      Client de l’API Lichess (fetch injectable)
│  └─ storage.ts      Persistance locale tolérante aux pannes
├─ ui/
│  ├─ app.ts          Contrôleur : relie pages, échiquier et session
│  ├─ router.ts       Choix de la page affichée (hash `#/settings`)
│  ├─ board.ts        Rendu SVG + saisie (clic, glisser-déposer)
│  ├─ geometry.ts     Calculs de coordonnées purs
│  ├─ move-list.ts    Liste des coups
│  ├─ victory.ts      Bannière de victoire (confettis, étincelles)
│  ├─ import-panel.ts Formulaire de chargement (Pseudo / PGN)
│  └─ messages.ts     Tous les textes affichés
├─ assets/pieces/     Jeu de pièces SVG
└─ styles/main.css    Thème (variables CSS) et mise en page
tests/                Miroir de src/, plus tests DOM (jsdom)
```

Principes :

- **Dépendances à sens unique** : `ui → domain` et `ui → services`, jamais l’inverse. Le domaine
  n’utilise ni `document`, ni `fetch`, ni timers.
- **Navigation par hash** (`#/settings`) : liens, bouton Précédent et favoris fonctionnent sans
  bibliothèque de routage, et sans configuration serveur sur GitHub Pages.
- **L’échiquier ne connaît pas les règles** : il reçoit un état à afficher et délègue la légalité
  des coups via `BoardHandlers`.
- **Effets de bord injectés** (`fetch`, stockage, générateur aléatoire, délais) pour des tests
  déterministes.
- Règles d’échecs : [chess.js](https://github.com/jhlywa/chess.js). Pas de framework UI : l’interface
  tient en quelques centaines de lignes de TypeScript.

## Déploiement (GitHub Pages)

1. Pousse le dépôt sur GitHub (branche `main`).
2. _Settings → Pages → Source : **GitHub Actions**_.
3. Chaque push sur `main` lance `.github/workflows/pages.yml` (checks, build, déploiement).

Servie depuis `https://<utilisateur>.github.io/…`, l’application peut interroger l’API Lichess
directement depuis le navigateur.

## Limites connues

- Les chapitres démarrant d’une position personnalisée (en-tête `FEN`) ou contenant un coup illégal
  sont ignorés.
- La promotion se fait toujours en dame.
- Les commentaires texte des études ne sont pas affichés, seulement les flèches et cases colorées.
- Interface en français uniquement (textes centralisés dans `src/ui/messages.ts` pour faciliter
  une internationalisation).

## Licences et crédits

Code sous licence **GPL-3.0-or-later** (voir `LICENSE`), choisie notamment parce que le jeu de
pièces est sous GPL-2.0-or-later.

- Pièces « cburnett » © Colin M.L. Burnett, GPL-2.0-or-later, via le dépôt Lichess
  (voir `src/assets/pieces/README.md`).
- chess.js — BSD-2-Clause.
- Police Noto Sans via `@fontsource/noto-sans` — SIL OFL-1.1.
