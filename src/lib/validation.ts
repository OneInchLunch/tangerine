/**
 * HTML `pattern` values shared by forms.
 *
 * Browsers compile these with the `v` regex flag, where an unescaped `-` at
 * the end (or anywhere) inside a character class is a syntax error. An invalid
 * pattern is ignored silently, which disables client-side validation, so keep
 * every value valid under `v` and cover that with a unit test.
 */
export const REPOSITORY_NAME_PATTERN = "[A-Za-z0-9._\\-]+";
export const SSO_PROVIDER_ID_PATTERN = "[a-z0-9][a-z0-9._\\-]*";
