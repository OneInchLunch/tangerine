# Data layer

All screen data flows through one HTTP client, one resource layer, one React
Query cache, and one mutation layer.

## Client

`src/api/client.ts`:

- adds `Accept: application/json`;
- adds `Authorization: TangerineSession` when no auth header is set, which
  suppresses cached browser Basic credentials after logout;
- serializes object bodies as JSON;
- sends `X-CSRFToken` from the `csrftoken` cookie for writes;
- uses `credentials: "same-origin"`;
- normalizes absolute and relative Pulp hrefs onto `apiBasePath`;
- throws `ApiError` with status, detail, field errors, correlation ID, and body.

Use `apiUrl(path)` for links that intentionally open the Pulp API, and
`useApiDataPane().openApiData()` when the UI should show JSON in a pane.

## Resources

`src/api/resources.ts` contains the common Pulp operations and helpers:

- list/create/read/update/delete wrappers;
- `waitForTask()` and `cancelTask()`;
- `repositoryTypeFromHref`, `repositoryVersionNumber`, `resourceIdFromHref`;
- publication and distribution helpers.

Do not build Pulp URLs by string concatenation. Use the helpers.

## Queries

`src/hooks/queries.ts` owns screen data and polling:

- resource lists use `["api-list", endpoint, params]`;
- accumulated pages use `["api-list", endpoint, "pages", params]`;
- repositories use `["repositories", params]`;
- a single repository uses `["repository", href]`;
- tasks use `["tasks", params]`; a task uses `["task", id]`.

Add keys to `src/lib/query-keys.ts`; never inline a new key shape in a
component.

## Pagination

| Helper | Use |
| --- | --- |
| `listResource` | One page |
| `listAllResource` | Every page for a lookup |
| `useAllList` | Hook form of the above |
| `useLoadMoreList` | Server search + explicit load more |
| `useApiPages` | Accumulate pages without refetching earlier rows |

Do not hide records behind a fixed `limit` in a selector that should see
everything.

## Writes

`src/hooks/use-api-mutation.ts`:

- `useApiMutation` — custom mutation function + invalidation;
- `usePulpWrite` — POST/PATCH through `mutateAndWait`;
- `usePulpDelete` — deletes that return `204` or a task;
- `useScopedMutation` — chooses `/sso/scope/*` for repository-scoped sessions or
  a direct call otherwise.

Conventions:

- Keep the invalidation list next to the hook.
- The hook invalidates before calling `onSuccess`, so dialogs close after lists
  refresh.
- Use `formatApiError(mutation.error, fallback)` for inline errors.
- Set `successMessage` for action-specific copy; task-backed writes add a
  **View task** link.
- Failures toast by default; inline dialogs pass `errorMode: "inline"`.
- Multipart uploads may use a custom `FormData` mutation function but still go
  through the hook.

## Query client

The shared client retries transient failures but not `401`, `403`, or `404`.
Active tasks and workers poll on intervals; idle screens back off.

## Adding a screen

1. Add the route in `src/router.tsx`.
2. Add query keys and hooks.
3. Add a `ResourceList` or a focused view.
4. Add a mutation hook if it writes.
5. Add a Playwright spec for the workflow.
