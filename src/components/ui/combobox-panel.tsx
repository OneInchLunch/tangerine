import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { ComboboxOption, PanelPosition } from "./combobox-types";

const PANEL_MARGIN = 8;
const PANEL_GAP = 4;
const PANEL_MAX_HEIGHT = 288;

export function matchesSearch(option: ComboboxOption, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return `${option.label} ${option.description ?? ""} ${option.value}`
    .toLowerCase()
    .includes(needle);
}

export function useComboboxPanel(
  open: boolean,
  triggerRef: RefObject<HTMLButtonElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
  refreshKey: string,
) {
  const [position, setPosition] = useState<PanelPosition | null>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(
      Math.max(rect.width, 260),
      Math.max(200, window.innerWidth - PANEL_MARGIN * 2),
    );
    const panelHeight = panelRef.current?.offsetHeight ?? PANEL_MAX_HEIGHT;
    const spaceBelow = window.innerHeight - rect.bottom - PANEL_MARGIN - PANEL_GAP;
    const spaceAbove = rect.top - PANEL_MARGIN - PANEL_GAP;
    const openUp = spaceBelow < Math.min(panelHeight, 160) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(PANEL_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow));
    const top = openUp
      ? Math.max(PANEL_MARGIN, rect.top - Math.min(panelHeight, maxHeight) - PANEL_GAP)
      : rect.bottom + PANEL_GAP;
    const left = Math.min(
      Math.max(rect.left, PANEL_MARGIN),
      Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN),
    );
    setPosition({ top, left, width, maxHeight });
  }, [panelRef, triggerRef]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
    // Position can change whenever the trigger moves or the panel resizes.
  }, [open, refreshKey, updatePosition]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, updatePosition]);

  return position;
}

export function useOutsideClose(
  open: boolean,
  triggerRef: RefObject<HTMLButtonElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
  close: () => void,
) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      close();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [close, open, panelRef, triggerRef]);
}

function optionDomId(listboxId: string, index: number): string {
  return `${listboxId}-option-${index}`;
}

interface SharedPanelProps {
  id: string;
  label: string;
  listboxId: string;
  panelRef: RefObject<HTMLDivElement | null>;
  position: PanelPosition | null;
  search: string;
  setSearch: (value: string) => void;
  controlledSearch: boolean;
  onSearchChange?: (value: string) => void;
  searchPlaceholder: string;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  emptyMessage: string;
  hasMore: boolean;
  loadedCount: number;
  totalCount: number;
  onLoadMore?: () => void;
  displayed: ComboboxOption[];
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  selectedValues: Set<string>;
  onChoose: (option: ComboboxOption) => void;
  onClose: () => void;
  multiple: boolean;
  footer?: ReactNode;
}

export function ComboboxPanel({
  id,
  label,
  listboxId,
  panelRef,
  position,
  search,
  setSearch,
  controlledSearch,
  onSearchChange,
  searchPlaceholder,
  isLoading,
  isError,
  onRetry,
  emptyMessage,
  hasMore,
  loadedCount,
  totalCount,
  onLoadMore,
  displayed,
  activeIndex,
  setActiveIndex,
  selectedValues,
  onChoose,
  onClose,
  multiple,
  footer,
}: SharedPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (activeIndex < 0) {
      return;
    }
    document.getElementById(optionDomId(listboxId, activeIndex))?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIndex, listboxId]);

  function moveActive(direction: 1 | -1) {
    if (!displayed.length) {
      return;
    }
    let next = activeIndex;
    for (let step = 0; step < displayed.length; step += 1) {
      next = (next + direction + displayed.length) % displayed.length;
      if (!displayed[next]?.disabled) {
        setActiveIndex(next);
        return;
      }
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(displayed.findIndex((option) => !option.disabled));
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      for (let index = displayed.length - 1; index >= 0; index -= 1) {
        if (!displayed[index]?.disabled) {
          setActiveIndex(index);
          return;
        }
      }
      return;
    }
    if (event.key === "Enter") {
      const option = displayed[activeIndex];
      if (option && !option.disabled) {
        event.preventDefault();
        onChoose(option);
      }
    }
  }

  return (
    <div
      ref={panelRef}
      style={
        position
          ? {
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
            }
          : { visibility: "hidden" }
      }
      role="dialog"
      aria-label={label}
      className="fixed z-[70] flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      data-combobox-panel={id}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="shrink-0 border-b border-zinc-200 p-2 dark:border-zinc-800">
        <Input
          ref={inputRef}
          value={search}
          onChange={(event) => {
            if (controlledSearch) {
              onSearchChange?.(event.target.value);
            } else {
              setSearch(event.target.value);
            }
          }}
          onKeyDown={onKeyDown}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          role="combobox"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optionDomId(listboxId, activeIndex) : undefined}
          autoComplete="off"
          className="h-8 text-xs"
        />
      </div>

      <div
        id={listboxId}
        role="listbox"
        aria-label={label}
        aria-multiselectable={multiple || undefined}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-1"
      >
        {isError ? (
          <div className="flex items-center justify-between gap-2 px-2 py-2 text-xs text-red-600 dark:text-red-400">
            <span>Could not load options.</span>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="font-medium underline underline-offset-2"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : isLoading && displayed.length === 0 ? (
          <div className="px-2 py-2 text-xs text-zinc-400 dark:text-zinc-500">Loading…</div>
        ) : displayed.length === 0 ? (
          <div className="px-2 py-2 text-xs text-zinc-400 dark:text-zinc-500">{emptyMessage}</div>
        ) : (
          displayed.map((option, index) => {
            const selected = selectedValues.has(option.value);
            return (
              <div
                key={`${option.value}-${index}`}
                id={optionDomId(listboxId, index)}
                role="option"
                tabIndex={-1}
                aria-selected={selected}
                aria-disabled={option.disabled || undefined}
                title={option.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (!option.disabled) {
                    onChoose(option);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (!option.disabled) {
                      onChoose(option);
                    }
                  }
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs",
                  index === activeIndex
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-700 dark:text-zinc-300",
                  option.disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  {option.description ? (
                    <span className="block truncate text-micro text-zinc-400 dark:text-zinc-500">
                      {option.description}
                    </span>
                  ) : null}
                </span>
                {selected ? (
                  <Check className="mt-0.5 size-3.5 shrink-0 text-orange-600 dark:text-orange-400" />
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {hasMore && onLoadMore ? (
        <div className="shrink-0 border-t border-zinc-200 p-2 dark:border-zinc-800">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading
              ? "Loading…"
              : totalCount
                ? `Load more (${loadedCount} of ${totalCount})`
                : "Load more"}
          </Button>
        </div>
      ) : null}

      {footer ? (
        <div className="shrink-0 border-t border-zinc-200 p-2 dark:border-zinc-800">{footer}</div>
      ) : null}
    </div>
  );
}
