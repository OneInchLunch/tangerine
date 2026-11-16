import { ApiError } from "@/api/client";

/**
 * Extract a human-readable message from an unknown caught value.
 */
export function errorMessage(caught: unknown, fallback = "Something went wrong."): string {
  if (caught instanceof Error && caught.message) {
    return caught.message;
  }
  if (typeof caught === "string" && caught.trim()) {
    return caught;
  }
  return fallback;
}

/**
 * Render DRF field errors as `field: message` pairs. Returns null when the
 * error has no field-level details.
 */
export function fieldErrorText(caught: unknown): string | null {
  if (!(caught instanceof ApiError) || !caught.fieldErrors) {
    return null;
  }
  const details = Object.entries(caught.fieldErrors)
    .map(([field, messages]) => `${field}: ${messages.join(" ")}`)
    .join(" · ");
  return details || null;
}

/**
 * Prefer field errors when Pulp rejected individual fields, otherwise use the
 * ApiError message or a caller-provided fallback.
 */
export function formatApiError(caught: unknown, fallback = "Something went wrong."): string {
  return fieldErrorText(caught) ?? errorMessage(caught, fallback);
}
