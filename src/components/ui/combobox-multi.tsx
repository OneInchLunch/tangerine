import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ComboboxPanel, matchesSearch, useComboboxPanel, useOutsideClose } from "./combobox-panel";
import type { ComboboxOption, MultiComboboxProps } from "./combobox-types";

export function MultiCombobox({
  id,
  label,
  values,
  onChange,
  options,
  placeholder = "Select…",
  selectedOptions = [],
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
  emptyMessage = "No options available.",
  maxSelected,
  maxSelectedMessage,
  doneLabel = "Done",
  hideLabel = false,
  className,
  triggerClassName,
}: MultiComboboxProps) {
  const [open, setOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const descriptionId = helperId ?? `${id}-description`;
  const controlledSearch = onSearchChange !== undefined;
  const search = controlledSearch ? (searchValue ?? "") : localSearch;
  const selected = new Set(values);
  const seenLabels = useRef(new Map<string, ComboboxOption>());
  for (const option of options) {
    seenLabels.current.set(option.value, option);
  }
  for (const option of selectedOptions) {
    seenLabels.current.set(option.value, option);
  }

  const visibleOptions = controlledSearch
    ? options
    : options.filter((option) => matchesSearch(option, localSearch));
  const pinned: ComboboxOption[] = values
    .filter((item) => !visibleOptions.some((option) => option.value === item))
    .map((item) => seenLabels.current.get(item) ?? { value: item, label: item });
  const entries: ComboboxOption[] = [...pinned];
  for (const option of visibleOptions) {
    if (!entries.some((item) => item.value === option.value)) {
      entries.push(option);
    }
  }
  const atLimit = maxSelected !== undefined && values.length >= maxSelected;
  const displayed = entries.map((option) =>
    atLimit && !selected.has(option.value) ? { ...option, disabled: true } : option,
  );

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
    setActiveIndex(displayed.findIndex((option) => !option.disabled));
  }

  function toggle(option: ComboboxOption) {
    if (option.disabled) {
      return;
    }
    if (selected.has(option.value)) {
      onChange(values.filter((item) => item !== option.value));
      return;
    }
    if (maxSelected !== undefined && values.length >= maxSelected) {
      return;
    }
    onChange([...values, option.value]);
  }

  const displayText =
    values.length === 0
      ? placeholder
      : values.length === 1
        ? (seenLabels.current.get(values[0])?.label ?? "1 selected")
        : `${values.length} selected`;

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
        <span className={cn("truncate", values.length === 0 && "text-zinc-400")}>
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
          emptyMessage={emptyMessage}
          hasMore={hasMore}
          loadedCount={loadedCount}
          totalCount={totalCount}
          onLoadMore={onLoadMore}
          displayed={displayed}
          activeIndex={activeIndex}
          setActiveIndex={setActiveIndex}
          selectedValues={selected}
          onChoose={toggle}
          onClose={close}
          multiple
          footer={
            <div className="flex items-center justify-between gap-2">
              <span className="text-meta text-zinc-500 dark:text-zinc-400">
                {values.length} selected
                {maxSelected !== undefined ? ` · up to ${maxSelected}` : ""}
              </span>
              <Button type="button" size="sm" variant="outline" onClick={close}>
                {doneLabel}
              </Button>
            </div>
          }
        />
      ) : null}

      {atLimit && maxSelectedMessage ? (
        <p className="text-meta text-amber-600 dark:text-amber-400">{maxSelectedMessage}</p>
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
