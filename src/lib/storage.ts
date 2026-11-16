/**
 * localStorage can throw in restricted or private browser contexts. All
 * persistence goes through these helpers so a blocked store never crashes the
 * application.
 */
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage is unavailable; the in-memory value still applies for this tab.
  }
}

export function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage is unavailable; there is nothing to clean up.
  }
}
