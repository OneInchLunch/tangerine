import type { components } from "./schema";

export type Status = components["schemas"]["StatusResponse"];
export type Task = components["schemas"]["TaskResponse"];
export type User = components["schemas"]["UserResponse"] & {
  /** Pulp omits this from the generated schema but returns it for superusers. */
  is_superuser?: boolean | null;
};
export type Repository = components["schemas"]["RepositoryResponse"];
/**
 * Repository hrefs returned by the combined `/repositories/` endpoint are
 * plugin-specific, so a detail fetch returns the full plugin record. The
 * combined response itself omits plugin settings such as `autopublish`.
 */
export type RepositoryDetail = Repository & {
  autopublish?: boolean;
  [key: string]: unknown;
};

export interface ContentSummaryEntry {
  count: number;
  href: string;
}

export interface RepositoryContentSummary {
  added?: Record<string, ContentSummaryEntry>;
  removed?: Record<string, ContentSummaryEntry>;
  present?: Record<string, ContentSummaryEntry>;
}

/**
 * The generated schema types content summary values as `Record<string, never>`.
 * Pulp actually returns `{ count, href }` objects for each content type, so
 * override that property with the runtime shape.
 */
export type RepositoryVersion = Omit<
  components["schemas"]["RepositoryVersionResponse"],
  "content_summary"
> & {
  content_summary?: RepositoryContentSummary;
};
export type ContainerTag = components["schemas"]["container.TagResponse"];
export type ContainerManifest = components["schemas"]["container.ManifestResponse"];
export type Worker = components["schemas"]["WorkerResponse"];
export type Distribution = components["schemas"]["DistributionResponse"];
export type DistributionDetail = Distribution & {
  publication?: string | null;
  checkpoint?: boolean;
  [key: string]: unknown;
};
export type Publication = components["schemas"]["PublicationResponse"];
export type PublicationDetail = Publication & Record<string, unknown>;
export type GenericRemote = components["schemas"]["GenericRemoteResponse"];

export interface RemoteDetail extends GenericRemote {
  [key: string]: unknown;
}
export type Group = components["schemas"]["GroupResponse"];
export type Role = components["schemas"]["RoleResponse"];
export type RoleAssignment = components["schemas"]["UserRoleResponse"];
export type GroupUser = components["schemas"]["GroupUserResponse"];

export interface ObjectRole {
  role: string;
  users: string[];
  groups: string[];
}

export interface ObjectRolesResponse {
  roles: ObjectRole[];
}
export type SigningService = components["schemas"]["SigningServiceResponse"];
export type PulpExporter = components["schemas"]["PulpExporterResponse"];
export type FilesystemExporter = components["schemas"]["FilesystemExporterResponse"];
export type PulpImporter = components["schemas"]["PulpImporterResponse"];
export type PulpExport = components["schemas"]["PulpExportResponse"];
export type PulpImport = components["schemas"]["ImportResponse"];
export type TaskSchedule = components["schemas"]["TaskScheduleResponse"];
export type AsyncOperationResponse = components["schemas"]["AsyncOperationResponse"];

export interface Paginated<T> {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
}

export interface QueryParams {
  [key: string]: string | number | boolean | undefined;
}
