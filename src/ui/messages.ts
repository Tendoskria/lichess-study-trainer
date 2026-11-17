import { LichessError } from '../services/lichess';

/** All user-facing strings, in one place (French). */
export const messages = {
  emptyState: 'Entre ton pseudo Lichess ci-dessous pour charger tes études.',
  yourTurn: (color: 'white' | 'black'): string =>
    `Tu joues les ${color === 'white' ? 'blancs' : 'noirs'} : trouve le coup de ton étude.`,
  correct: (san: string): string => `✔ Correct : ${san}`,
  wrong: (tries: number): string =>
    `✘ Ce n’est pas le coup de l’étude (essai ${tries}). Réessaie, ou demande un indice.`,
  hint: 'Indice : regarde les annotations ou la case de départ en surbrillance.',
  solution: (sans: readonly string[]): string =>
    `Coup de l’étude : ${sans.join(' ou ')}. Joue-le pour continuer.`,
  finished: 'Ligne terminée ✔ Lance une nouvelle position.',
  chapter: (name: string): string => `Chapitre : ${name}`,
  chapterHidden: 'Chapitre : ?',
  untitledChapter: 'Sans titre',
  untitledStudy: 'Sans nom',
  allStudies: (count: number): string => `Toutes les études (${count})`,
  allChapters: (count: number): string => `Tous les chapitres (${count})`,
  loading: 'Téléchargement…',
  noChapters: 'Aucune ligne exploitable dans ce PGN.',
  invalidChapter: 'Ce chapitre contient un coup illégal et ne peut pas être joué.',
  lichessError: (error: unknown): string => {
    if (error instanceof LichessError) {
      if (error.kind === 'not-found') {
        return 'Pseudo ou étude introuvable (seules les études publiques sont accessibles).';
      }
      if (error.kind === 'http') return `Lichess a répondu avec une erreur (${error.status}).`;
    }
    return 'Impossible de joindre Lichess. Vérifie ta connexion.';
  },
} as const;
