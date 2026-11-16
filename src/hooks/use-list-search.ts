import { useMemo, useState } from "react";
import { useDebouncedValue } from "./use-debounced-value";

export interface ListSearch {
  /** Raw input value, bound to the text field. */
  input: string;
  setInput: (value: string) => void;
  /** Debounced, trimmed search term. */
  term: string;
  /** `term` when present, otherwise `undefined` for a Pulp query parameter. */
  queryParam: string | undefined;
}

/**
 * Debounced server-side list search shared by resource tables and pickers.
 * Pair `queryParam` with `name__contains`/`username__contains` style filters.
 */
export function useListSearch(initial = "", delay = 250): ListSearch {
  const [input, setInput] = useState(initial);
  const term = useDebouncedValue(input, delay).trim();
  const queryParam = useMemo(() => (term ? term : undefined), [term]);
  return { input, setInput, term, queryParam };
}
