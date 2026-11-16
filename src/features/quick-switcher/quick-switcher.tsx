import { resourceIdFromHref, remoteTypeFromHref, repositoryTypeFromHref } from "@/api/resources";
import type { GatewayCapabilities } from "@/api/gateway";
import type { Distribution, GenericRemote, Repository, Task, User } from "@/api/types";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/auth/auth-context";
import { useApiList, useScopedRepositoryHrefs } from "@/hooks/queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { isAdminUser, visibleNavigation } from "@/lib/navigation";
import {
  flattenSections,
  pageCommands,
  QUICK_SWITCHER_GROUPS,
  QUICK_SWITCHER_MIN_QUERY,
  taskSubtitle,
  type QuickSwitcherGroup,
  type QuickSwitcherItem,
  type QuickSwitcherSection,
} from "@/lib/quick-switcher";
import { entityIcons } from "@/lib/icons";
import { friendlyTaskName } from "@/lib/task-name";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

const GROUP_ICONS: Record<QuickSwitcherGroup, typeof Search> = {
  Pages: entityIcons.dashboard,
  Repositories: entityIcons.repositories,
  Remotes: entityIcons.remotes,
  Distributions: entityIcons.distributions,
  Tasks: entityIcons.tasks,
  Users: entityIcons.users,
};

function resultSections(
  query: string,
  options: {
    isAdmin: boolean;
    capabilities?: GatewayCapabilities;
    repositories: Repository[];
    remotes: GenericRemote[];
    distributions: Distribution[];
    tasks: Task[];
    users: User[];
  },
): QuickSwitcherSection[] {
  const sections: QuickSwitcherSection[] = [
    {
      group: "Pages",
      items: pageCommands(visibleNavigation(options.isAdmin, options.capabilities), query),
    },
    {
      group: "Repositories",
      items: options.repositories.flatMap((repository) =>
        repository.pulp_href
          ? [
              {
                id: `repository:${repository.pulp_href}`,
                group: "Repositories" as const,
                title: repository.name,
                subtitle: repositoryTypeFromHref(repository.pulp_href),
                to: "/repositories/detail",
                search: { href: repository.pulp_href },
              },
            ]
          : [],
      ),
    },
    {
      group: "Remotes",
      items: options.remotes.flatMap((remote) =>
        remote.pulp_href
          ? [
              {
                id: `remote:${remote.pulp_href}`,
                group: "Remotes" as const,
                title: remote.name,
                subtitle: remoteTypeFromHref(remote.pulp_href),
                to: "/remotes/detail",
                search: { href: remote.pulp_href },
              },
            ]
          : [],
      ),
    },
    {
      group: "Distributions",
      items: options.distributions.flatMap((distribution) =>
        distribution.pulp_href
          ? [
              {
                id: `distribution:${distribution.pulp_href}`,
                group: "Distributions" as const,
                title: distribution.name,
                subtitle: distribution.base_path ?? distribution.name,
                to: "/distributions/detail",
                search: { href: distribution.pulp_href },
              },
            ]
          : [],
      ),
    },
    {
      group: "Tasks",
      items: options.tasks.flatMap((task) =>
        task.pulp_href
          ? [
              {
                id: `task:${task.pulp_href}`,
                group: "Tasks" as const,
                title: friendlyTaskName(task.name),
                subtitle: taskSubtitle(task.name, task.state),
                to: "/tasks/$taskId",
                params: { taskId: resourceIdFromHref(task.pulp_href) },
              },
            ]
          : [],
      ),
    },
    {
      group: "Users",
      items: options.users.flatMap((user) =>
        user.username
          ? [
              {
                id: `user:${user.username}`,
                group: "Users" as const,
                title: user.username,
                subtitle: user.email || "User",
                to: "/users",
                search: { q: user.username },
              },
            ]
          : [],
      ),
    },
  ];
  return sections.filter((section) => section.items.length > 0);
}

export function QuickSwitcher({ onClose }: { onClose: () => void }) {
  const { user, session } = useAuth();
  const capabilities = session?.capabilities;
  const isScopedAdmin = Boolean(capabilities?.repositoryAdmin);
  const isAdmin = isAdminUser(user) && !isScopedAdmin;
  const tasksRead = capabilities?.tasksRead !== false;
  const scopedPrns = isScopedAdmin ? session?.repositoryPrns : undefined;
  const scopedRepositories = useScopedRepositoryHrefs(scopedPrns);
  const scopedHrefs = (scopedRepositories.data?.results ?? [])
    .map((repository) => repository.pulp_href)
    .filter((href): href is string => Boolean(href));
  const scopeQuery = scopedPrns ? scopedHrefs.join(",") : undefined;
  const scopeEnabled = !scopedPrns || scopedHrefs.length > 0;
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const debounced = useDebouncedValue(query.trim(), 200);
  const search = debounced.length >= QUICK_SWITCHER_MIN_QUERY ? debounced : "";
  const enabled = search.length > 0;

  const repositories = useApiList<Repository>(
    "repositories",
    {
      name__contains: search,
      prn__in: scopedPrns?.join(","),
      limit: 5,
      ordering: "name",
      fields: "name,pulp_href,pulp_type",
    },
    { enabled: enabled && scopeEnabled },
  );
  const remotes = useApiList<GenericRemote>(
    "remotes",
    { name__contains: search, limit: 5, ordering: "name", fields: "name,pulp_href,pulp_type" },
    { enabled: enabled && !isScopedAdmin },
  );
  const distributions = useApiList<Distribution>(
    "distributions",
    {
      name__contains: search,
      repository__in: scopeQuery || undefined,
      limit: 5,
      ordering: "name",
      fields: "name,pulp_href,base_path,pulp_type",
    },
    { enabled: enabled && scopeEnabled },
  );
  const tasks = useApiList<Task>(
    "tasks",
    {
      name__contains: search,
      limit: 5,
      ordering: "-pulp_created",
      fields: "name,pulp_href,logging_cid,state",
    },
    { enabled: enabled && tasksRead },
  );
  const users = useApiList<User>(
    "users",
    { username__contains: search, limit: 5, ordering: "username", fields: "username,email" },
    { enabled: enabled && isAdmin },
  );

  const sections = useMemo(
    () =>
      resultSections(query, {
        isAdmin,
        capabilities,
        repositories: repositories.data?.results ?? [],
        remotes: remotes.data?.results ?? [],
        distributions: distributions.data?.results ?? [],
        tasks: tasks.data?.results ?? [],
        users: isAdmin ? (users.data?.results ?? []) : [],
      }),
    [
      query,
      isAdmin,
      capabilities,
      repositories.data,
      remotes.data,
      distributions.data,
      tasks.data,
      users.data,
    ],
  );
  const items = useMemo(() => flattenSections(sections), [sections]);
  const isLoading = enabled
    ? repositories.isFetching ||
      remotes.isFetching ||
      distributions.isFetching ||
      tasks.isFetching ||
      (isAdmin && users.isFetching)
    : false;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, items.length]);

  const activeItem = items[activeIndex];

  function activate(item: QuickSwitcherItem | undefined) {
    if (!item) {
      return;
    }
    void navigate({
      to: item.to,
      params: item.params,
      search: item.search,
    } as never);
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (items.length ? (index + 1) % items.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (items.length ? (index - 1 + items.length) % items.length : 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, items.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      activate(activeItem);
    }
  }

  let renderedIndex = -1;

  return (
    <Modal
      open
      onClose={onClose}
      title="Quick switcher"
      description="Jump to a page or a Pulp resource. Use ↑ ↓ to move and Enter to open."
      className="max-w-xl"
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <Input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search repositories, remotes, distributions, tasks, users…"
            aria-label="Quick switcher search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeItem ? `${listId}-${activeItem.id}` : undefined}
            className="pl-9"
          />
        </div>

        <div
          id={listId}
          role="listbox"
          aria-label="Quick switcher results"
          className="max-h-80 overflow-y-auto overscroll-contain"
        >
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {isLoading
                ? "Searching…"
                : query.trim().length > 0 && query.trim().length < QUICK_SWITCHER_MIN_QUERY
                  ? `Type at least ${QUICK_SWITCHER_MIN_QUERY} characters to search Pulp.`
                  : "No matches. Try another name."}
            </p>
          ) : (
            QUICK_SWITCHER_GROUPS.filter((group) => items.some((item) => item.group === group)).map(
              (group) => {
                const section = {
                  group,
                  items: items.filter((item) => item.group === group),
                };
                const Icon = GROUP_ICONS[section.group];
                return (
                  <div key={section.group} className="pb-1">
                    <p className="px-2 pb-1 pt-2 text-micro font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                      {section.group}
                    </p>
                    {section.items.map((item) => {
                      renderedIndex += 1;
                      const isActive = renderedIndex === activeIndex;
                      return (
                        <button
                          key={item.id}
                          id={`${listId}-${item.id}`}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onMouseEnter={() => setActiveIndex(renderedIndex)}
                          onClick={() => activate(item)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left",
                            isActive
                              ? "bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200"
                              : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
                          )}
                        >
                          <Icon className="size-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{item.title}</span>
                            {item.subtitle ? (
                              <span className="block truncate text-micro text-zinc-500 dark:text-zinc-400">
                                {item.subtitle}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              },
            )
          )}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 pt-2 text-micro text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          <span>{isLoading ? <Spinner className="size-3" /> : "⌘/Ctrl + K to open"}</span>
          <span>Esc to close</span>
        </div>
      </div>
    </Modal>
  );
}
