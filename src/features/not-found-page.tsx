import { BrandMark } from "@/components/brand-mark";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { Compass, Home } from "lucide-react";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <PageHeader
        title="Page not found"
        description="The requested route does not exist or is no longer available."
      />
      <Card className="w-full max-w-lg p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400">
          <Compass className="size-6" />
        </div>
        <p className="mt-4 text-meta font-semibold uppercase tracking-widest text-orange-600 dark:text-orange-400">
          404
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          This page is not on the map
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          The route may have moved, or the resource it pointed to no longer exists.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-9 items-center gap-2 rounded-md bg-orange-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-500"
        >
          <Home className="size-4" />
          Back to dashboard
        </Link>
        <div className="mt-6 flex items-center justify-center gap-2 text-meta text-zinc-400">
          <BrandMark className="size-4" />
          Tangerine
        </div>
      </Card>
    </div>
  );
}
