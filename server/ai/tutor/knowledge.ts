export type KnowledgeContext = {
  prompt: string;
  policy: string;
  sources: readonly ('standards' | 'document' | 'conversation' | 'image')[];
};

/** Adapter boundary for future owner-scoped pgvector/course retrieval; no invented corpus. */
export interface TutorKnowledgeSource {
  retrieve(): Promise<KnowledgeContext>;
}

export function existingTutorKnowledge(context: KnowledgeContext): TutorKnowledgeSource {
  return { async retrieve() { return context; } };
}
