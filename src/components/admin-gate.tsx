import { useAuth } from "@/auth/auth-context";
import { Card } from "@/components/ui/card";
import { isAdminUser } from "@/lib/navigation";
import { Link } from "@tanstack/react-router";
import { ShieldX } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import type { GatewayCapabilities } from "@/api/gateway";

/**
 * Renders children only for Pulp staff accounts. The router already handles the
 * signed-out case, so this gate covers authenticated users whose account is not
 * allowed to administer users, roles, or the raw API console.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { user, session, isLoading } = useAuth();
  if (isLoading) {
    return null;
  }
  if (!isAdminUser(user) || session?.capabilities?.repositoryAdmin) {
    return <AccessDenied />;
  }
  return <>{children}</>;
}

/** Wrap a route component so direct links to admin screens show a clear state. */
export function withAdminGate(Component: ComponentType) {
  return function AdminGatedRoute() {
    return (
      <AdminGate>
        <Component />
      </AdminGate>
    );
  };
}

type Capability = keyof Pick<
  GatewayCapabilities,
  "tasksRead" | "operationsRead" | "signingRead" | "importExportRead" | "contentRead"
>;

const CAPABILITY_COPY: Record<Capability, { title: string; message: string }> = {
  tasksRead: {
    title: "Task access required",
    message: "Tasks are available to maintainers and viewers, not repository-scoped accounts.",
  },
  operationsRead: {
    title: "Operations access required",
    message:
      "Maintenance operations are maintainer-only. Your account can still manage its assigned repositories.",
  },
  signingRead: {
    title: "Signing access required",
    message: "Signing services are visible to maintainers only.",
  },
  importExportRead: {
    title: "Import/export access required",
    message: "Import and export are not enabled for this account.",
  },
  contentRead: {
    title: "Content access required",
    message:
      "Repositories, remotes, distributions, publications, and content are not available for this account.",
  },
};

/**
 * Gate a route on a gateway capability. Local (non-gateway) sessions have no
 * capabilities and are allowed, preserving the existing behavior.
 */
export function CapabilityGate({
  capability,
  children,
}: {
  capability: Capability;
  children: ReactNode;
}) {
  const { session, isLoading } = useAuth();
  if (isLoading) {
    return null;
  }
  if (session?.capabilities?.[capability] === false) {
    return <CapabilityDenied capability={capability} />;
  }
  return <>{children}</>;
}

export function withCapabilityGate(capability: Capability, Component: ComponentType) {
  return function CapabilityGatedRoute() {
    return (
      <CapabilityGate capability={capability}>
        <Component />
      </CapabilityGate>
    );
  };
}

function CapabilityDenied({ capability }: { capability: Capability }) {
  const copy = CAPABILITY_COPY[capability];
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
          <ShieldX className="size-6" />
        </div>
        <h1 className="mt-4 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {copy.title}
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{copy.message}</p>
        <Link
          to="/"
          className="mt-5 inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Back to dashboard
        </Link>
      </Card>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
          <ShieldX className="size-6" />
        </div>
        <h1 className="mt-4 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Administrator access required
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          This screen manages Pulp users, groups, roles, or raw API requests. Your account can still
          use the content, tasks, and operations screens.
        </p>
        <Link
          to="/"
          className="mt-5 inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Back to dashboard
        </Link>
      </Card>
    </div>
  );
}
