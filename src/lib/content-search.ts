import { contentTypeLabel } from "./content-labels";

export interface ContentSearchConfig {
  /** Server-side query parameter, when Pulp exposes a contains filter. */
  parameter?: string;
  placeholder: string;
  /** True when the filter only applies to the currently loaded page. */
  pageScoped: boolean;
}

/**
 * Content endpoints agree on pagination but not on text search. Only these
 * types expose a `__contains` filter; everything else gets a page-scoped
 * filter instead of pretending the API can search the whole collection.
 */
const SERVER_SEARCH_PARAMS: Record<string, string> = {
  "file/files": "relative_path__contains",
  "rpm/packages": "name__contains",
  "python/packages": "name__contains",
  "deb/packages": "package__contains",
  "ansible/namespaces": "name__contains",
  "container/signatures": "name__contains",
  "core/openpgp_userid": "user_id__contains",
};

export function contentSearchConfig(plugin: string, type: string): ContentSearchConfig {
  const parameter = SERVER_SEARCH_PARAMS[`${plugin}/${type}`];
  return {
    parameter,
    placeholder: parameter
      ? `Search ${contentTypeLabel(type).toLowerCase()}…`
      : "Filter this page…",
    pageScoped: !parameter,
  };
}
