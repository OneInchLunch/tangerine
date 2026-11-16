import { BrandMark } from "@/components/brand-mark";
import { Spinner } from "@/components/ui/spinner";

export function SplashScreen({ label = "Connecting to Pulp…" }: { label?: string }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 bg-zinc-50 dark:bg-zinc-950">
      <BrandMark className="size-14 drop-shadow-lg" />
      <div className="text-center">
        <p className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Tangerine
        </p>
        <p className="mt-1 flex items-center justify-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <Spinner className="size-3.5" />
          {label}
        </p>
      </div>
    </div>
  );
}
