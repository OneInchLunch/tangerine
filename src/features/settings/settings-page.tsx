import { useAuth } from "@/auth/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailRow } from "@/components/ui/detail-row";
import { PageHeader } from "@/components/ui/page-header";
import { useAdminCsrf, useStatus } from "@/hooks/queries";
import { getConfig } from "@/lib/config";
import { isSsoManagedUser } from "@/lib/sso";
import { coreVersion } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme/theme-provider";
import { Check, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { SsoPanel } from "./sso-panel";

export function SettingsPage() {
  const config = getConfig();
  const { user, session, logout } = useAuth();
  // Pulp does not expose is_superuser on the user record, so a local
  // break-glass administrator is identified by the superuser-only CSRF
  // endpoint. Gateway sessions carry the resolved `manageSso` capability.
  const adminCsrf = useAdminCsrf();
  const capabilities = session?.capabilities;
  const canManageSso = capabilities
    ? capabilities.manageSso
    : Boolean(user?.is_staff && adminCsrf.isSuccess);
  const ssoManaged = isSsoManagedUser(user, config.ssoManagedGroup);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const status = useStatus();
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  }

  const version = coreVersion(status.data);
  const sections = [
    { id: "settings-runtime", label: "Runtime" },
    { id: "settings-connection", label: "Connection" },
    { id: "settings-appearance", label: "Appearance" },
    { id: "settings-session", label: "Session" },
    ...(config.authMode === "gateway" && canManageSso
      ? [{ id: "settings-sso", label: "SSO" }]
      : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Runtime configuration, appearance, and the current session."
      />

      <nav aria-label="Settings sections" className="flex flex-wrap gap-1.5">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-orange-300 hover:text-orange-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-orange-900/70 dark:hover:text-orange-300"
          >
            {section.label}
          </a>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-2 3xl:grid-cols-4">
        <Card id="settings-runtime" className="scroll-mt-24">
          <CardHeader>
            <CardTitle>Runtime configuration</CardTitle>
            <CardDescription>
              Loaded from <code className="font-mono">config.json</code> at startup.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow label="API base path" value={config.apiBasePath} mono />
            <DetailRow label="UI base path" value={config.uiBasePath} mono />
            <DetailRow label="Auth mode" value={config.authMode} />
            <DetailRow
              label="Password login"
              value={config.passwordLoginEnabled ? "Enabled" : "Disabled"}
            />
            <DetailRow label="Poll interval" value={`${config.pollIntervalMs} ms`} />
            {config.externalLoginUri ? (
              <DetailRow label="External login" value={config.externalLoginUri} mono />
            ) : null}
            {config.authMode === "gateway" ? (
              <DetailRow label="Gateway base path" value={config.gatewayBasePath} mono />
            ) : null}
            {config.ssoManagedGroup ? (
              <DetailRow label="SSO managed group" value={config.ssoManagedGroup} mono />
            ) : null}
            {config.extraVersion ? (
              <DetailRow label="Extra version" value={config.extraVersion} />
            ) : null}
          </CardContent>
        </Card>

        <Card id="settings-connection" className="scroll-mt-24">
          <CardHeader>
            <CardTitle>Connection</CardTitle>
            <CardDescription>The live Pulp deployment behind this UI.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow
              label="Status"
              value={status.isError ? "Unreachable" : status.isLoading ? "Checking…" : "Connected"}
            />
            <DetailRow label="pulpcore" value={version ?? "Unknown"} mono />
            <DetailRow
              label="Content origin"
              value={status.data?.content_settings?.content_origin ?? "Not reported"}
              mono
            />
            <DetailRow
              label="Domains"
              value={status.data?.domain_enabled ? "Enabled" : "Disabled"}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {status.data?.versions?.map((item) => (
                <Badge key={item.component} tone="neutral" className="font-mono">
                  {item.component} {item.version}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card id="settings-appearance" className="scroll-mt-24">
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose how Tangerine looks on this device.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "light", label: "Light", icon: Sun },
                { value: "dark", label: "Dark", icon: Moon },
                { value: "system", label: "System", icon: Monitor },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value as "light" | "dark" | "system")}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-4 text-xs font-medium transition-colors",
                    theme === option.value
                      ? "border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-500/60 dark:bg-orange-950/40 dark:text-orange-300"
                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800",
                  )}
                >
                  <option.icon className="size-5" />
                  {option.label}
                  {theme === option.value ? <Check className="size-3.5" /> : null}
                </button>
              ))}
            </div>
            <p className="mt-3 text-meta text-zinc-400 dark:text-zinc-500">
              Currently rendering in {resolvedTheme} mode.
            </p>
          </CardContent>
        </Card>

        <Card id="settings-session" className="scroll-mt-24">
          <CardHeader>
            <CardTitle>Session</CardTitle>
            <CardDescription>
              {ssoManaged
                ? "Authentication is handled by your identity provider and carried by a secure Pulp session."
                : "Authentication is handled by Pulp using a secure browser session."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow label="Username" value={user?.username ?? "Unknown"} />
            {ssoManaged ? <DetailRow label="Provisioned by" value="Identity provider" /> : null}
            <DetailRow label="Email" value={user?.email || "Not set"} />
            <DetailRow label="Administrator" value={user?.is_staff ? "Yes" : "No"} />
            <DetailRow label="User href" value={user?.pulp_href ?? "—"} mono />
            <Button variant="outline" onClick={handleLogout} disabled={signingOut} className="mt-2">
              <LogOut className="size-4" />
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {config.authMode === "gateway" && canManageSso ? (
        <div id="settings-sso" className="scroll-mt-24">
          <SsoPanel />
        </div>
      ) : null}
    </div>
  );
}
