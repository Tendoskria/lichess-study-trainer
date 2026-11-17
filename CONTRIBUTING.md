# Contribuer

## Mise en place

```bash
nvm use          # Node 22 (voir .nvmrc)
npm ci
npm run dev
```

## Avant chaque commit

```bash
npm run check    # typecheck + lint + format + tests
```

La CI exécute la même commande ; une PR doit être verte pour être fusionnée.

## Règles de code

- **`src/domain` ne dépend jamais du DOM** (ni de `window`, `document`, `fetch`…). Toute la
  logique d’entraînement doit rester testable sous Node.
- `src/ui` ne contient pas de règles d’échecs : elles viennent de `domain` via des callbacks
  (voir `BoardHandlers`).
- Les textes affichés sont centralisés dans `src/ui/messages.ts`.
- TypeScript strict, pas de `any`, pas d’assertion non nulle (`!`) — le lint le vérifie.
- Toute fonctionnalité ou correction de bug s’accompagne d’un test.

## Commits

Messages au format [Conventional Commits](https://www.conventionalcommits.org/) :
`feat: …`, `fix: …`, `refactor: …`, `test: …`, `docs: …`, `chore: …`.
