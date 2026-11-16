import type { ReactNode } from "react";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface ComboboxBaseProps {
  id: string;
  label: string;
  options: ComboboxOption[];
  /** Text shown when nothing is selected. */
  placeholder?: string;
  /** Label for the clearing option; only rendered when provided. */
  emptyLabel?: string;
  /** Label used when the current value is not in the loaded options. */
  pinnedLabel?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  helper?: ReactNode;
  helperId?: string;
  disabled?: boolean;
  required?: boolean;
  hasMore?: boolean;
  loadedCount?: number;
  totalCount?: number;
  onLoadMore?: () => void;
  /** Hide the visible label while keeping it available to assistive technology. */
  hideLabel?: boolean;
  className?: string;
  triggerClassName?: string;
}

export interface ComboboxProps extends ComboboxBaseProps {
  value: string;
  onChange: (value: string) => void;
  /** Accept a typed value that is not in the option list (free text with suggestions). */
  allowCustom?: boolean;
  /** Label for the synthetic free-text option. Defaults to `Use “<query>”`. */
  customLabel?: (query: string) => string;
}

export interface MultiComboboxProps extends ComboboxBaseProps {
  values: string[];
  onChange: (values: string[]) => void;
  /** Labels for selected values that may not be in the currently loaded options. */
  selectedOptions?: ComboboxOption[];
  emptyMessage?: string;
  maxSelected?: number;
  maxSelectedMessage?: string;
  doneLabel?: string;
}

export interface PanelPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}
