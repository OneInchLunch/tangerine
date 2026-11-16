import { cn } from "@/lib/utils";

export type ContentView = "packages" | "units";

/** Switch between grouped packages and the flat unit list. */
export function ContentViewToggle({
  view,
  onChange,
}: {
  view: ContentView;
  onChange: (view: ContentView) => void;
}) {
  const options: Array<{ value: ContentView; label: string }> = [
    { value: "packages", label: "Packages" },
    { value: "units", label: "Units" },
  ];

  return (
    <fieldset
      aria-label="Content view"
      className="m-0 inline-flex min-w-0 overflow-hidden rounded-md border border-zinc-300 p-0 shadow-sm dark:border-zinc-700"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={view === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "px-2.5 py-1.5 text-xs font-medium transition-colors",
            view === option.value
              ? "bg-orange-600 text-white"
              : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800",
          )}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
