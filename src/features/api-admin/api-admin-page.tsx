import { apiRequestWithStatus, ApiError } from "@/api/client";
import { FormError } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorPanel } from "@/components/ui/error-panel";
import { Input } from "@/components/ui/input";
import { MultipartFields } from "@/components/ui/multipart-fields";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { useOpenApiSchema } from "@/hooks/queries";
import { copyText } from "@/lib/clipboard";
import { buildMultipartForm, multipartContentForOperation } from "@/lib/multipart";
import { cn } from "@/lib/utils";
import { Braces, Copy, Play, RefreshCw, Search, Terminal } from "lucide-react";
import { useMemo, useState } from "react";
import {
  type Endpoint,
  type HttpMethod,
  type OpenApiDocument,
  flattenEndpoints,
  pathParameterNames,
  requestBodyExample,
} from "./openapi";

interface ResultState {
  ok: boolean;
  status?: number;
  data?: unknown;
  error?: string;
  durationMs: number;
}

const methodTone: Record<HttpMethod, "success" | "info" | "warning" | "danger" | "neutral"> = {
  get: "info",
  post: "success",
  put: "warning",
  patch: "warning",
  delete: "danger",
  head: "neutral",
  options: "neutral",
  trace: "neutral",
};

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <Badge tone={methodTone[method]} className="w-14 justify-center font-mono uppercase">
      {method}
    </Badge>
  );
}

export function ApiAdminPage() {
  const schemaQuery = useOpenApiSchema();
  const document = schemaQuery.data as OpenApiDocument | undefined;
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Endpoint | null>(null);
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [queryJson, setQueryJson] = useState("{}");
  const [bodyJson, setBodyJson] = useState("");
  const [multipartValues, setMultipartValues] = useState<Record<string, string | boolean>>({});
  const [multipartFiles, setMultipartFiles] = useState<Record<string, File | null>>({});
  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const endpoints = useMemo(() => (document ? flattenEndpoints(document) : []), [document]);
  const filteredEndpoints = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return endpoints;
    }
    return endpoints.filter((endpoint) => {
      const haystack = [
        endpoint.method,
        endpoint.path,
        endpoint.operation.summary,
        endpoint.operation.operationId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [endpoints, search]);

  const visibleEndpoints = filteredEndpoints.slice(0, 300);
  const pathNames = selected ? pathParameterNames(selected.path) : [];
  const multipart = useMemo(
    () =>
      selected && document ? multipartContentForOperation(document, selected.operation) : null,
    [document, selected],
  );
  const useMultipart = Boolean(multipart?.hasBinary);

  function selectEndpoint(endpoint: Endpoint) {
    if (!document) {
      return;
    }
    const values: Record<string, string> = {};
    for (const name of pathParameterNames(endpoint.path)) {
      const parameter = endpoint.parameters.find(
        (candidate) => candidate.in === "path" && candidate.name === name,
      );
      const defaultValue = parameter?.schema?.default;
      values[name] = defaultValue === undefined ? "" : String(defaultValue);
    }
    const multipartContent = multipartContentForOperation(document, endpoint.operation);
    const fieldValues: Record<string, string | boolean> = {};
    for (const field of multipartContent?.fields ?? []) {
      if (field.kind === "boolean") {
        fieldValues[field.name] = field.defaultValue === true;
      } else {
        fieldValues[field.name] =
          field.defaultValue === undefined ? "" : String(field.defaultValue);
      }
    }

    setSelected(endpoint);
    setPathValues(values);
    setQueryJson("{}");
    setBodyJson(requestBodyExample(document, endpoint.operation));
    setMultipartValues(fieldValues);
    setMultipartFiles({});
    setResult(null);
    setError(null);
    setCopied(false);
  }

  async function sendRequest() {
    if (!selected) {
      return;
    }

    const missing = pathNames.filter((name) => !pathValues[name]?.trim());
    if (missing.length) {
      setError(`Path parameters are required: ${missing.join(", ")}`);
      return;
    }

    let query: Record<string, unknown>;
    try {
      const parsed = queryJson.trim() ? JSON.parse(queryJson) : {};
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Query parameters must be a JSON object.");
      }
      query = parsed as Record<string, unknown>;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invalid query JSON.");
      return;
    }

    let body: unknown;
    const method = selected.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      if (useMultipart && multipart) {
        try {
          body = buildMultipartForm(multipart.fields, multipartValues, multipartFiles);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Invalid multipart body.");
          return;
        }
      } else if (bodyJson.trim()) {
        try {
          body = JSON.parse(bodyJson);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Invalid request body JSON.");
          return;
        }
      }
    }

    let path = selected.path;
    for (const name of pathNames) {
      path = path.replaceAll(`{${name}}`, encodeURIComponent(pathValues[name] ?? ""));
    }

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          searchParams.append(key, String(item));
        }
      } else {
        searchParams.set(key, String(value));
      }
    }
    const fullPath = searchParams.size ? `${path}?${searchParams.toString()}` : path;

    setError(null);
    setResult(null);
    setIsSending(true);
    const startedAt = performance.now();
    try {
      const response = await apiRequestWithStatus<unknown>(fullPath, { method, body });
      setResult({
        ok: true,
        status: response.status,
        data: response.data,
        durationMs: Math.round(performance.now() - startedAt),
      });
    } catch (caught) {
      const durationMs = Math.round(performance.now() - startedAt);
      if (caught instanceof ApiError) {
        setResult({
          ok: false,
          status: caught.status,
          data: caught.body,
          error: caught.message,
          durationMs,
        });
      } else {
        setResult({
          ok: false,
          error: caught instanceof Error ? caught.message : String(caught),
          durationMs,
        });
      }
    } finally {
      setIsSending(false);
    }
  }

  async function copyResult() {
    if (!result) {
      return;
    }
    const text = JSON.stringify(result.data ?? result.error ?? null, null, 2);
    if (!(await copyText(text))) {
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="API admin"
        description="A schema-driven console for every endpoint exposed by this Pulp installation."
        actions={
          <Button variant="outline" size="sm" onClick={() => void schemaQuery.refetch()}>
            <RefreshCw className={cn("size-3.5", schemaQuery.isFetching && "animate-spin")} />
            Refresh schema
          </Button>
        }
      />

      {schemaQuery.isError ? (
        <ErrorPanel
          title="Could not load the OpenAPI schema"
          message={
            schemaQuery.error instanceof Error
              ? schemaQuery.error.message
              : String(schemaQuery.error)
          }
          onRetry={() => void schemaQuery.refetch()}
        />
      ) : schemaQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500 dark:text-zinc-400">
          <Spinner />
          Loading API schema…
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <Card className="flex min-h-0 flex-col">
            <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Endpoints
                  </p>
                  <p className="text-meta text-zinc-500 dark:text-zinc-400">
                    {endpoints.length} operations · OpenAPI {document?.openapi}
                  </p>
                </div>
                <Badge tone="neutral">{filteredEndpoints.length}</Badge>
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Filter paths, methods, summaries…"
                  className="pl-9"
                  aria-label="Filter API endpoints"
                />
              </div>
            </div>
            <div className="scrollbar-thin max-h-[38rem] min-h-0 flex-1 overflow-y-auto p-2">
              {visibleEndpoints.length ? (
                <div className="space-y-1">
                  {visibleEndpoints.map((endpoint) => {
                    const active =
                      selected?.method === endpoint.method && selected?.path === endpoint.path;
                    return (
                      <button
                        key={`${endpoint.method}-${endpoint.path}`}
                        type="button"
                        onClick={() => selectEndpoint(endpoint)}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors",
                          active
                            ? "bg-orange-50 dark:bg-orange-950/30"
                            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
                        )}
                      >
                        <MethodBadge method={endpoint.method} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-meta text-zinc-800 dark:text-zinc-200">
                            {endpoint.path.replace("/pulp/api/v3", "")}
                          </span>
                          <span className="mt-0.5 block truncate text-meta text-zinc-400 dark:text-zinc-500">
                            {endpoint.operation.summary ?? endpoint.operation.operationId ?? "—"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  {filteredEndpoints.length > visibleEndpoints.length ? (
                    <p className="px-2 py-3 text-center text-meta text-zinc-400">
                      Showing the first {visibleEndpoints.length} of {filteredEndpoints.length}.
                      Refine the filter to see more.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="p-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  No endpoints match “{search}”.
                </p>
              )}
            </div>
          </Card>

          {selected ? (
            <Card className="min-w-0">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <MethodBadge method={selected.method} />
                  <code className="break-all font-mono text-xs text-zinc-700 dark:text-zinc-300">
                    {selected.path}
                  </code>
                  {selected.operation.deprecated ? <Badge tone="danger">Deprecated</Badge> : null}
                </div>
                <CardTitle className="mt-3 text-base">
                  {selected.operation.summary ?? selected.operation.operationId ?? "API operation"}
                </CardTitle>
                {selected.operation.description ? (
                  <CardDescription className="max-w-3xl whitespace-pre-line">
                    {selected.operation.description}
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-5">
                {pathNames.length ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Path parameters
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {pathNames.map((name) => {
                        const parameter = selected.parameters.find(
                          (candidate) => candidate.in === "path" && candidate.name === name,
                        );
                        return (
                          <div key={name} className="space-y-1.5">
                            <Label htmlFor={`path-${name}`} className="font-mono">
                              {name}
                            </Label>
                            <Input
                              id={`path-${name}`}
                              value={pathValues[name] ?? ""}
                              onChange={(event) =>
                                setPathValues((current) => ({
                                  ...current,
                                  [name]: event.target.value,
                                }))
                              }
                              placeholder={parameter?.description ?? name}
                              className="font-mono text-xs"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor="query-json">Query parameters (JSON)</Label>
                  <textarea
                    id="query-json"
                    value={queryJson}
                    onChange={(event) => setQueryJson(event.target.value)}
                    rows={3}
                    spellCheck={false}
                    className="flex w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 shadow-sm focus-visible:border-orange-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    placeholder='{"limit": 10}'
                  />
                  {selected.parameters.some((parameter) => parameter.in === "query") ? (
                    <p className="text-meta text-zinc-400 dark:text-zinc-500">
                      This operation accepts query parameters such as{" "}
                      {selected.parameters
                        .filter((parameter) => parameter.in === "query")
                        .slice(0, 4)
                        .map((parameter) => parameter.name)
                        .filter(Boolean)
                        .join(", ")}
                      .
                    </p>
                  ) : null}
                </div>

                {selected.operation.requestBody && useMultipart && multipart ? (
                  <div className="space-y-3">
                    <div>
                      <Label>Request body (multipart/form-data)</Label>
                      <p className="mt-1 text-meta text-zinc-400 dark:text-zinc-500">
                        Fields are generated from the live OpenAPI schema. File fields use the
                        selected file; object and array fields accept JSON.
                      </p>
                    </div>
                    <MultipartFields
                      idPrefix="api-admin-multipart"
                      fields={multipart.fields}
                      values={multipartValues}
                      files={multipartFiles}
                      onChange={(name, value) =>
                        setMultipartValues((current) => ({ ...current, [name]: value }))
                      }
                      onFileChange={(name, file) =>
                        setMultipartFiles((current) => ({ ...current, [name]: file }))
                      }
                    />
                  </div>
                ) : selected.operation.requestBody ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="body-json">Request body (JSON)</Label>
                    <textarea
                      id="body-json"
                      value={bodyJson}
                      onChange={(event) => setBodyJson(event.target.value)}
                      rows={10}
                      spellCheck={false}
                      className="flex w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 shadow-sm focus-visible:border-orange-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      placeholder="{}"
                    />
                    <p className="text-meta text-zinc-400 dark:text-zinc-500">
                      Accepts:{" "}
                      {Object.keys(selected.operation.requestBody.content ?? {}).join(", ") ||
                        "application/json"}
                      . The example is generated from the schema; replace placeholder values before
                      sending.
                    </p>
                  </div>
                ) : null}

                {error ? <FormError>{error}</FormError> : null}

                <div className="flex items-center gap-2">
                  <Button onClick={() => void sendRequest()} disabled={isSending}>
                    {isSending ? <Spinner /> : <Play className="size-4" />}
                    {isSending ? "Sending…" : "Send request"}
                  </Button>
                  <span className="text-meta text-zinc-400 dark:text-zinc-500">
                    Requests use your active Pulp session and CSRF token.
                  </span>
                </div>

                {result ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge tone={result.ok ? "success" : "danger"}>
                          {result.status
                            ? `${result.status} ${result.ok ? "OK" : "Error"}`
                            : "Error"}
                        </Badge>
                        <span className="text-meta text-zinc-400">{result.durationMs} ms</span>
                        {result.error ? (
                          <span className="text-xs text-red-600 dark:text-red-400">
                            {result.error}
                          </span>
                        ) : null}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => void copyResult()}>
                        <Copy className="size-3.5" />
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <pre className="scrollbar-thin max-h-96 overflow-auto rounded-lg border border-zinc-200 bg-zinc-950 p-3 font-mono text-meta leading-5 text-zinc-100 dark:border-zinc-800">
                      {JSON.stringify(result.data ?? result.error ?? null, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon={Terminal}
                title="Select an API endpoint"
                description="Browse every operation in the live Pulp OpenAPI schema, fill in path parameters, and send a request using your current session."
                action={
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <Braces className="size-4" />
                    {endpoints.length} operations discovered
                  </div>
                }
              />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
