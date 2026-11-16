import { apiRequest } from "@/api/client";
import { deleteAndWait, mutateAndWait } from "@/api/resources";
import { scopeCreateObject, scopeImportExport, scopeMutateObject } from "@/api/gateway";
import type {
  AsyncOperationResponse,
  FilesystemExporter,
  PulpExporter,
  PulpImporter,
} from "@/api/types";

export const PULP_EXPORTERS = "exporters/core/pulp/";
export const FILESYSTEM_EXPORTERS = "exporters/core/filesystem/";
export const PULP_IMPORTERS = "importers/core/pulp/";

function scopePath(relative: string): string {
  return `/pulp/api/v3/${relative}`;
}

function taskFromScopeResult(result: unknown): string {
  const task = (result as AsyncOperationResponse | null)?.task;
  if (!task) {
    throw new Error("Pulp did not return a task for the operation.");
  }
  return task;
}

export async function createPulpExporter(
  body: {
    name: string;
    path: string;
    repositories: string[];
  },
  csrfToken?: string,
): Promise<PulpExporter> {
  if (csrfToken) {
    const response = await scopeCreateObject(scopePath(PULP_EXPORTERS), body, csrfToken);
    return response.result as PulpExporter;
  }
  return apiRequest<PulpExporter>(PULP_EXPORTERS, { method: "POST", body });
}

export async function updatePulpExporter(
  href: string,
  body: { name: string; path: string; repositories: string[] },
  csrfToken?: string,
): Promise<PulpExporter> {
  if (csrfToken) {
    const response = await scopeMutateObject("PATCH", href, body, csrfToken);
    return response.result as PulpExporter;
  }
  return apiRequest<PulpExporter>(href, { method: "PATCH", body });
}

export async function createFilesystemExporter(
  body: {
    name: string;
    path: string;
    method: "write" | "hardlink" | "symlink";
  },
  csrfToken?: string,
): Promise<FilesystemExporter> {
  if (csrfToken) {
    const response = await scopeCreateObject(scopePath(FILESYSTEM_EXPORTERS), body, csrfToken);
    return response.result as FilesystemExporter;
  }
  return apiRequest<FilesystemExporter>(FILESYSTEM_EXPORTERS, {
    method: "POST",
    body,
  });
}

export async function updateFilesystemExporter(
  href: string,
  body: { name: string; path: string; method: "write" | "hardlink" | "symlink" },
  csrfToken?: string,
): Promise<FilesystemExporter> {
  if (csrfToken) {
    const response = await scopeMutateObject("PATCH", href, body, csrfToken);
    return response.result as FilesystemExporter;
  }
  return apiRequest<FilesystemExporter>(href, { method: "PATCH", body });
}

export async function deleteExporter(href: string, csrfToken?: string): Promise<void> {
  if (csrfToken) {
    await scopeMutateObject("DELETE", href, null, csrfToken);
    return;
  }
  await deleteAndWait(href);
}

export async function createPulpImporter(
  body: {
    name: string;
    repo_mapping?: Record<string, string>;
  },
  csrfToken?: string,
): Promise<PulpImporter> {
  if (csrfToken) {
    const response = await scopeCreateObject(scopePath(PULP_IMPORTERS), body, csrfToken);
    return response.result as PulpImporter;
  }
  return apiRequest<PulpImporter>(PULP_IMPORTERS, { method: "POST", body });
}

export async function updatePulpImporter(
  href: string,
  body: { name: string; repo_mapping?: Record<string, string> },
  csrfToken?: string,
): Promise<PulpImporter> {
  if (csrfToken) {
    const response = await scopeMutateObject("PATCH", href, body, csrfToken);
    return response.result as PulpImporter;
  }
  return apiRequest<PulpImporter>(href, { method: "PATCH", body });
}

export async function deleteImporter(href: string, csrfToken?: string): Promise<void> {
  if (csrfToken) {
    await scopeMutateObject("DELETE", href, null, csrfToken);
    return;
  }
  await deleteAndWait(href);
}

export async function runPulpExport(
  exporterHref: string,
  body: {
    full: boolean;
    dry_run: boolean;
    chunk_size?: string;
    versions?: string[];
  },
  csrfToken?: string,
): Promise<string> {
  if (csrfToken) {
    const response = await scopeImportExport(`${exporterHref}exports/`, body, csrfToken);
    return taskFromScopeResult(response.result);
  }
  const response = await apiRequest<AsyncOperationResponse>(`${exporterHref}exports/`, {
    method: "POST",
    body,
  });
  if (!response?.task) {
    throw new Error("Pulp did not return a task for the export.");
  }
  return response.task;
}

export async function runFilesystemExport(
  exporterHref: string,
  body: {
    publication?: string;
    repository_version?: string;
    start_repository_version?: string;
  },
  csrfToken?: string,
): Promise<string> {
  if (csrfToken) {
    const response = await scopeImportExport(`${exporterHref}exports/`, body, csrfToken);
    return taskFromScopeResult(response.result);
  }
  const response = await apiRequest<AsyncOperationResponse>(`${exporterHref}exports/`, {
    method: "POST",
    body,
  });
  if (!response?.task) {
    throw new Error("Pulp did not return a task for the export.");
  }
  return response.task;
}

export async function runPulpImport(
  importerHref: string,
  body: { path: string; toc?: string; create_repositories: boolean },
  csrfToken?: string,
): Promise<string> {
  if (csrfToken) {
    const response = await scopeImportExport(`${importerHref}imports/`, body, csrfToken);
    return taskFromScopeResult(response.result);
  }
  const response = await apiRequest<AsyncOperationResponse>(`${importerHref}imports/`, {
    method: "POST",
    body,
  });
  if (!response?.task) {
    throw new Error("Pulp did not return a task for the import.");
  }
  return response.task;
}

export async function checkPulpImport(
  body: {
    path?: string;
    toc?: string;
    repo_mapping?: string;
  },
  csrfToken?: string,
): Promise<void> {
  if (csrfToken) {
    await scopeImportExport("/pulp/api/v3/importers/core/pulp/import-check/", body, csrfToken);
    return;
  }
  await mutateAndWait("importers/core/pulp/import-check/", {
    method: "POST",
    body,
  });
}
