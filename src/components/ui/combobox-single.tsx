import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ComboboxPanel, matchesSearch, useComboboxPanel, useOutsideClose } from "./combobox-panel";
import type { ComboboxOption, ComboboxProps } from "./combobox-types";

export function Combobox({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  emptyLabel,
  pinnedLabel = "Current selection",
  searchValue,
  onSearchChange,
  searchPlaceholder,
  isLoading = false,
  isError = false,
  onRetry,
  helper,
  helperId,
  disabled = false,
  required = false,
  hasMore = false,
  loadedCount = 0,
  totalCount = 0,
  onLoadMore,
  hideLabel = false,
  className,
  triggerClassName,
  allowCustom = false,
  customLabel,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const descriptionId = helperId ?? `${id}-description`;
  const controlledSearch = onSearchChange !== undefined;
  const search = controlledSearch ? (searchValue ?? "") : localSearch;
  const selectedValues = new Set([value]);
  const seenLabels = useRef(new Map<string, string>());
  for (const option of options) {
    seenLabels.current.set(option.value, option.label);
  }

  const visibleOptions = controlledSearch
    ? options
    : options.filter((option) => matchesSearch(option, localSearch));
  const selectedOption = visibleOptions.find((option) => option.value === value);
  const selectedLabel = selectedOption?.label ?? seenLabels.current.get(value);
  const pinnedOption: ComboboxOption | null =
    value && !selectedOption ? { value, label: selectedLabel ?? pinnedLabel } : null;
  const displayed: ComboboxOption[] = [];
  if (emptyLabel) {
    displayed.push({ value: "", label: emptyLabel });
  }
  if (pinnedOption) {
    displayed.push(pinnedOption);
  }
  for (const option of visibleOptions) {
    if (!displayed.some((item) => item.value === option.value)) {
      displayed.push(option);
    }
  }
  const customValue = localSearch.trim();
  if (allowCustom && customValue && !displayed.some((item) => item.value === customValue)) {
    displayed.push({
      value: customValue,
      label: customLabel ? customLabel(customValue) : `Use “${customValue}”`,
    });
  }

  const position = useComboboxPanel(
    open,
    triggerRef,
    panelRef,
    `${search}|${displayed.length}|${isLoading}|${isError}|${hasMore}`,
  );

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  useOutsideClose(open, triggerRef, panelRef, close);

  useEffect(() => {
    if (!open) {
      setLocalSearch("");
    }
  }, [open]);

  function openPanel() {
    if (disabled) {
      return;
    }
    setOpen(true);
    const selectedIndex = displayed.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : displayed.findIndex((o) => !o.disabled));
  }

  function choose(option: ComboboxOption) {
    if (option.disabled) {
      return;
    }
    onChange(option.value);
    setOpen(false);
    setActiveIndex(-1);
    triggerRef.current?.focus();
  }

  const displayText =
    selectedOption?.label ?? pinnedOption?.label ?? (value ? value : (emptyLabel ?? placeholder));

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} id={`${id}-label`} className={hideLabel ? "sr-only" : undefined}>
        {label}
      </Label>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-labelledby={`${id}-label`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-describedby={helper || isError ? descriptionId : undefined}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openPanel();
          }
        }}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-zinc-300 bg-white px-3 text-left text-sm text-zinc-900 shadow-sm transition-colors focus-visible:border-orange-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
          triggerClassName,
        )}
      >
        <span className={cn("truncate", !selectedOption && !value && "text-zinc-400")}>
          {displayText}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <ComboboxPanel
          id={id}
          label={label}
          listboxId={listboxId}
          panelRef={panelRef}
          position={position}
          search={search}
          setSearch={setLocalSearch}
          controlledSearch={controlledSearch}
          onSearchChange={onSearchChange}
          searchPlaceholder={searchPlaceholder ?? `Search ${label.toLowerCase()}…`}
          isLoading={isLoading}
          isError={isError}
          onRetry={onRetry}
          emptyMessage="No matches."
          hasMore={hasMore}
          loadedCount={loadedCount}
          totalCount={totalCount}
          onLoadMore={onLoadMore}
          displayed={displayed}
          activeIndex={activeIndex}
          setActiveIndex={setActiveIndex}
          selectedValues={selectedValues}
          onChoose={choose}
          onClose={close}
          multiple={false}
        />
      ) : null}

      {helper || isError ? (
        <p id={descriptionId} className="text-meta text-zinc-400 dark:text-zinc-500">
          {helper}
          {isError && onRetry ? (
            <>
              {helper ? " " : null}
              <button
                type="button"
                onClick={onRetry}
                className="font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                Retry
              </button>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
