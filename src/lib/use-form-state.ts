import { useCallback, useMemo, useState } from "react";

/**
 * Compare a form value with its original. Form values are plain objects, so a
 * structural comparison is enough; a value that cannot be serialized counts as
 * changed rather than silently clean.
 */
export function isDirtyValue<T>(value: T, initial: T): boolean {
  if (value === initial) {
    return false;
  }
  try {
    return JSON.stringify(value) !== JSON.stringify(initial);
  } catch {
    return true;
  }
}

/**
 * Small form-state helper for multi-field dialogs.
 *
 * It stays minimal: one value object, a partial update, a setter, a reset, and
 * dirty tracking for the unsaved-changes guard. Server field errors are
 * rendered from the mutation error, so validation stays out of here.
 */
export function useFormState<T extends object>(initial: T | (() => T)) {
  const makeInitial = useCallback(
    () => (typeof initial === "function" ? (initial as () => T)() : initial),
    [initial],
  );
  const [value, setValue] = useState<T>(makeInitial);

  const patch = useCallback((changes: Partial<T>) => {
    setValue((current) => ({ ...current, ...changes }));
  }, []);

  const reset = useCallback(
    (next?: T) => {
      setValue(next ?? makeInitial());
    },
    [makeInitial],
  );

  const isDirty = useMemo(() => isDirtyValue(value, makeInitial()), [value, makeInitial]);

  return { value, setValue, patch, reset, isDirty };
}
