import { useEffect, useState } from 'react';
import type { suggestAthletes } from '~/lib/athletes.server';

export type AthleteSuggestion = Awaited<ReturnType<typeof suggestAthletes>>[number];

const DEBOUNCE_MS = 200;

/** Athletes whose names or STV-ID contain the words of the query. */
export function useAthleteSuggestions(competitionId: string, query: string) {
  const [result, setResult] = useState<{ query: string; athletes: AthleteSuggestion[] }>();

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => void load(), DEBOUNCE_MS);

    async function load() {
      try {
        const response = await fetch(`/api/competitions/${competitionId}/athletes`, {
          method: 'POST',
          body: new URLSearchParams({ query }),
          signal: controller.signal,
        });
        const { athletes } = (await response.json()) as { athletes: AthleteSuggestion[] };
        setResult({ query, athletes });
      } catch {
        // Aborted or offline. The form works without suggestions.
      }
    }

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [competitionId, query]);

  return result && result.query === query ? result.athletes : [];
}
