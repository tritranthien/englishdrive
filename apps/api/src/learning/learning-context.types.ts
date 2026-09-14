export type LearningContextSnapshot = {
  currentFocus: string[];
  recurringMistakes: Array<{
    pattern: string;
    occurrenceCount: number;
    suggestion: string;
  }>;
  reviewVocabulary: Array<{
    term: string;
    meaningVi: string;
    example: string;
  }>;
  recentTopics: string[];
  recentSessionSummaries: string[];
};
