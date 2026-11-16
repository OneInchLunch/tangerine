/** Cards for the SSO settings panel: gateway status, bootstrap, policies, audit. */

import { probeHeaderStripping, type GatewayDiagnostics } from "@/api/gateway";
import { InlineAlert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailRow } from "@/components/ui/detail-row";
import { Spinner } from "@/components/ui/spinner";
import {
  useAccessPolicyStatus,
  useGatewayBootstrap,
  useProviderAudit,
  useSecretStatus,
} from "@/hooks/queries";
import { getConfig } from "@/lib/config";
import { errorMessage } from "@/lib/errors";
import { formatRelative } from "@/lib/format";
import { gatewayPath } from "@/lib/sso";
import { Check, Copy, Download, Play } from "lucide-react";
import { useState } from "react";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={copy}>
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export function DiagnosticsCard({ diagnostics }: { diagnostics: GatewayDiagnostics | undefined }) {
  const [probe, setProbe] = useState<"idle" | "running" | "safe" | "unsafe" | "error">("idle");

  async function runProbe() {
    if (!diagnostics) {
      return;
    }
    setProbe("running");
    try {
      const accepted = await probeHeaderStripping(diagnostics.stripProbe);
      setProbe(accepted ? "unsafe" : "safe");
    } catch {
      setProbe("error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gateway status</CardTitle>
        <CardDescription>
          Live state of the gateway and Pulp's header authentication.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <DetailRow
          label="Pulp reachable"
          value={diagnostics ? (diagnostics.pulpReachable ? "Yes" : "No") : "Checking…"}
        />
        <DetailRow
          label="Header authentication"
          value={
            diagnostics ? (diagnostics.headerAuthActive ? "Active" : "Not active") : "Checking…"
          }
        />
        <DetailRow label="Mode" value={diagnostics?.additiveMode ? "Additive" : "Enforced"} />
        <DetailRow
          label="HTTP issuers"
          value={
            diagnostics
              ? diagnostics.allowHttpIssuers
                ? "Allowed (development)"
                : "Disabled"
              : "Checking…"
          }
        />
        <DetailRow label="Providers" value={diagnostics?.providerCount ?? "—"} />
        <DetailRow label="Active sessions" value={diagnostics?.sessionCount ?? "—"} />
        <DetailRow label="Callback URL" value={diagnostics?.callbackUrl ?? "—"} mono />

        {diagnostics && !diagnostics.headerAuthActive ? (
          <InlineAlert tone="warning" compact title="Pulp is not accepting identity headers">
            Apply the bootstrap settings below and restart Pulp.
          </InlineAlert>
        ) : null}

        {diagnostics?.allowHttpIssuers ? (
          <InlineAlert tone="danger" compact title="Plain-HTTP identity providers are allowed">
            This is a development-only setting. Use HTTPS issuers outside a disposable cluster.
          </InlineAlert>
        ) : null}

        <div className="space-y-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={runProbe}
            disabled={!diagnostics || probe === "running"}
          >
            {probe === "running" ? <Spinner /> : <Play className="size-3.5" />}
            Run header-strip test
          </Button>
          {probe === "safe" ? (
            <InlineAlert tone="success" compact title="Edge strips the identity header">
              A client-supplied header was rejected, as expected.
            </InlineAlert>
          ) : null}
          {probe === "unsafe" ? (
            <InlineAlert tone="danger" compact title="Identity header is not being stripped">
              Pulp authenticated a request carrying a client-supplied header. Fix the ingress
              middleware before relying on singlesign-on.
            </InlineAlert>
          ) : null}
          {probe === "error" ? (
            <InlineAlert tone="warning" compact title="Test could not run">
              The diagnostic request failed. Check the Pulp API route.
            </InlineAlert>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function BootstrapCard() {
  const bootstrap = useGatewayBootstrap();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pulp bootstrap</CardTitle>
        <CardDescription>
          One-time settings. Copy this block into{" "}
          <code className="font-mono">spec.pulp_settings</code> and let Pulp restart once.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {bootstrap.isLoading ? <p className="text-sm text-zinc-500">Loading…</p> : null}
        {bootstrap.isError ? (
          <InlineAlert tone="danger" compact title="Bootstrap unavailable">
            Sign in as a Pulp administrator to read the settings block.
          </InlineAlert>
        ) : null}
        {bootstrap.data ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-meta font-medium uppercase tracking-wide text-zinc-500">
                settings.py
              </span>
              <CopyButton value={bootstrap.data.settingsBlock} />
            </div>
            <pre className="max-h-72 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-meta leading-relaxed text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              {bootstrap.data.settingsBlock}
            </pre>
            <div className="flex items-center justify-between gap-2">
              <span className="text-meta font-medium uppercase tracking-wide text-zinc-500">
                Callback URL
              </span>
              <CopyButton value={bootstrap.data.callbackUrl} />
            </div>
            <code className="block break-all rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-meta text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              {bootstrap.data.callbackUrl}
            </code>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function AccessPoliciesCard() {
  const status = useAccessPolicyStatus();
  const rows = status.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Access policies</CardTitle>
        <CardDescription>
          Read-only users, roles, and signing-service access for SSO administrators. Writes stay
          superuser-only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {status.isError ? (
          <InlineAlert tone="danger" compact title="Could not read access policies">
            {errorMessage(status.error, "The gateway could not query Pulp.")}
          </InlineAlert>
        ) : null}
        {rows.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{item.name}</span>
            <Badge tone={item.matchesExpected ? "success" : item.present ? "warning" : "danger"}>
              {item.matchesExpected ? "Matched" : item.present ? "Drifted" : "Not applied"}
            </Badge>
          </div>
        ))}
        <p className="text-meta text-zinc-400 dark:text-zinc-500">
          Apply with{" "}
          <code className="font-mono">gateway/scripts/bootstrap_access_policies.py --apply</code>{" "}
          (dry-run by default).
        </p>
      </CardContent>
    </Card>
  );
}

export function SecurityActivityCard() {
  const audit = useProviderAudit();
  const secrets = useSecretStatus();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Security activity</CardTitle>
        <CardDescription>
          Mounted client secrets and recent provider changes. The gateway re-reads a secret on each
          login; rotate it by updating the Kubernetes Secret.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <h3 className="mb-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            Mounted secrets
          </h3>
          {secrets.data?.length ? (
            <div className="space-y-1">
              {secrets.data.map((secret) => (
                <div
                  key={secret.name}
                  className="flex items-center justify-between gap-2 border-b border-zinc-100 py-1 text-xs dark:border-zinc-800"
                >
                  <span className="font-mono">{secret.name}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={secret.readable ? "success" : "danger"}>
                      {secret.readable ? "Readable" : "Unreadable"}
                    </Badge>
                    <span className="text-zinc-400">
                      {secret.modifiedAt ? formatRelative(secret.modifiedAt) : "—"}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-400">No mounted secret files.</p>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              Provider changes
            </h3>
            <a
              href={gatewayPath(getConfig(), "admin/audit/export")}
              className="inline-flex items-center gap-1 text-meta text-zinc-500 hover:text-orange-600 dark:text-zinc-400"
            >
              <Download className="size-3.5" />
              Export CSV
            </a>
          </div>
          {audit.data?.length ? (
            <div className="space-y-1">
              {audit.data.slice(0, 10).map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 py-1 text-xs dark:border-zinc-800"
                >
                  <span>
                    <strong className="font-medium">{entry.actor}</strong> {entry.action}{" "}
                    <span className="font-mono">{entry.providerId}</span>
                  </span>
                  <span className="text-zinc-400">{formatRelative(entry.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-400">No provider changes recorded yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
