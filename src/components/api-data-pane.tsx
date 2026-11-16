import { apiUrl } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { BottomPane } from "@/components/ui/bottom-pane";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/ui/error-panel";
import { LoadingBlock } from "@/components/ui/spinner";
import { useApiResource } from "@/hooks/queries";
import { copyText } from "@/lib/clipboard";
import { errorMessage } from "@/lib/errors";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowLeft, Braces, Check, Copy, RefreshCw, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "@tanstack/react-router";

export interface ApiDataSelection {
  href: string;
  title: string;
}

interface ApiDataPaneContextValue {
  openApiData: (selection: ApiDataSelection) => void;
}

const ApiDataPaneContext = createContext<ApiDataPaneContextValue | null>(null);

export function ApiDataPaneProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<ApiDataSelection | null>(null);
  const location = useLocation();

  useEffect(() => {
    setSelection(null);
  }, [location.pathname, location.searchStr]);

  const openApiData = useCallback((next: ApiDataSelection) => {
    setSelection(next);
  }, []);

  const value = useMemo(() => ({ openApiData }), [openApiData]);

  return (
    <ApiDataPaneContext.Provider value={value}>
      {children}
      <ApiDataPane selection={selection} onClose={() => setSelection(null)} />
    </ApiDataPaneContext.Provider>
  );
}

export function useApiDataPane() {
  const context = useContext(ApiDataPaneContext);
  if (!context) {
    throw new Error("useApiDataPane must be used inside ApiDataPaneProvider");
  }
  return context;
}

function useApiDataState(href: string | undefined) {
  const query = useApiResource(href);
  const [copied, setCopied] = useState(false);
  const payload = query.data?.data;
  const status = query.data?.status;
  const endpoint = href ? apiUrl(href) : "";
  const json = payload === undefined ? "" : JSON.stringify(payload, null, 2);
  const canCopy = json.length > 0;

  useEffect(() => {
    setCopied(false);
  }, [href]);

  async function copyJson() {
    if (!canCopy) {
      return;
    }
    if (!(await copyText(json))) {
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return { query, payload, status, endpoint, json, canCopy, copied, copyJson };
}

type ApiDataState = ReturnType<typeof useApiDataState>;

function ApiDataActions({ state }: { state: ApiDataState }) {
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void state.query.refetch()}
        disabled={state.query.isFetching}
      >
        <RefreshCw className={cn("size-3.5", state.query.isFetching && "animate-spin")} />
        Refresh
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void state.copyJson()}
        disabled={!state.canCopy}
      >
        {state.copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {state.copied ? "Copied" : "Copy JSON"}
      </Button>
    </>
  );
}

function ApiDataBody({ state }: { state: ApiDataState }) {
  const { query, payload, status, json, canCopy } = state;

  if (query.isPending) {
    return <LoadingBlock label="Loading API data…" />;
  }
  if (query.isError) {
    return (
      <ErrorPanel
        title="Unable to load API data"
        message={errorMessage(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <ApiDataStat
          label="Status"
          value={
            <Badge tone={status && status >= 200 && status < 300 ? "success" : "warning"}>
              {status ?? "—"}
            </Badge>
          }
        />
        <ApiDataStat label="Payload" value={describePayload(payload)} />
        <ApiDataStat label="JSON size" value={formatBytes(new Blob([json]).size)} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-micro font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Response body
          </p>
          <span className="text-micro text-zinc-400 dark:text-zinc-500">
            {json.length.toLocaleString()} characters
          </span>
        </div>
        {canCopy ? (
          <pre className="scrollbar-thin overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-meta leading-5 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            {json}
          </pre>
        ) : (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            No JSON body was returned.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * API data rendered inside another surface, such as the content drawer. Unlike
 * `ApiDataPane` it is not a portal: it fills the container and offers a back
 * action so the surrounding view can stay open.
 */
export function InlineApiDataPanel({
  selection,
  onBack,
  onClose,
}: {
  selection: ApiDataSelection;
  onBack: () => void;
  onClose: () => void;
}) {
  const state = useApiDataState(selection.href);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      aria-label={`${selection.title} API data`}
      className="flex flex-col gap-4 outline-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close content pane"
            title="Close"
          >
            <X className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="size-3.5" />
            Back to content
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ApiDataActions state={state} />
        </div>
      </div>

      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300">
          <Braces className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {selection.title}
          </h3>
          <p className="mt-0.5 break-all font-mono text-meta text-zinc-500 dark:text-zinc-400">
            GET {state.endpoint}
          </p>
        </div>
      </div>

      <ApiDataBody state={state} />
    </section>
  );
}

function ApiDataPane({
  selection,
  onClose,
}: {
  selection: ApiDataSelection | null;
  onClose: () => void;
}) {
  const state = useApiDataState(selection?.href);
  const { endpoint } = state;

  if (!selection) {
    return null;
  }

  return (
    <BottomPane
      onClose={onClose}
      title={selection.title || "API resource"}
      description={<span className="break-all font-mono">GET {endpoint}</span>}
      icon={<Braces className="size-4" />}
      footer={<ApiDataActions state={state} />}
    >
      <ApiDataBody state={state} />
    </BottomPane>
  );
}

function ApiDataStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
      <p className="text-micro font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {label}
      </p>
      <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{value}</div>
    </div>
  );
}

function describePayload(payload: unknown): string {
  if (payload === undefined) {
    return "Empty";
  }
  if (payload === null) {
    return "null";
  }
  if (Array.isArray(payload)) {
    return `Array · ${payload.length.toLocaleString()} items`;
  }
  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.count === "number" && Array.isArray(record.results)) {
      return `Paginated · ${record.count.toLocaleString()} results`;
    }
    return `Object · ${Object.keys(record).length.toLocaleString()} fields`;
  }
  return typeof payload;
}
