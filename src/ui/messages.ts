import { LichessError } from '../services/lichess';

/** All user-facing strings, in one place (French). */
export const messages = {
  yourTurn: (color: 'white' | 'black'): string =>
    `Tu joues les ${color === 'white' ? 'blancs' : 'noirs'} : trouve le coup de ton étude.`,
  correct: (san: string): string => `✔ Correct : ${san}`,
  /** Read by screen readers only: sighted users get the visual "hit" effect instead. */
  wrongAnnouncement: (tries: number): string => `Mauvais coup (essai ${tries}).`,
  hint: 'Indice : la pièce à jouer est en surbrillance.',
  solution: (sans: readonly string[]): string =>
    `Coup de l’étude : ${sans.join(' ou ')}. Joue-le pour continuer.`,
  /** Read by screen readers; sighted users get the victory banner. */
  lineCompleteAnnouncement: 'Ligne terminée. Bravo !',
  chapter: (name: string): string => `Chapitre : ${name}`,
  chapterHidden: 'Chapitre : ?',
  untitledChapter: 'Sans titre',
  untitledStudy: 'Sans nom',
  allStudies: (count: number): string => `Toutes les études (${count})`,
  allChapters: (count: number): string => `Tous les chapitres (${count})`,
  loading: 'Téléchargement…',
  noFileChosen: 'Aucun fichier choisi',
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
