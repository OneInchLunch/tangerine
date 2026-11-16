import { CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface UserFormValue {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  email: string;
  isStaff: boolean;
  isActive: boolean;
}

interface UserFormFieldsProps {
  idPrefix: string;
  value: UserFormValue;
  onChange: (changes: Partial<UserFormValue>) => void;
  passwordRequired?: boolean;
  passwordPlaceholder?: string;
  /** Hide the password field because the identity provider manages this account. */
  passwordManagedBySso?: boolean;
  showActive?: boolean;
  autoFocusUsername?: boolean;
}

/** Shared identity, password, email, and access fields for user dialogs. */
export function UserFormFields({
  idPrefix,
  value,
  onChange,
  passwordRequired = false,
  passwordPlaceholder,
  passwordManagedBySso = false,
  showActive = false,
  autoFocusUsername = true,
}: UserFormFieldsProps) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-username`}>Username</Label>
          <Input
            id={`${idPrefix}-username`}
            autoFocus={autoFocusUsername}
            required
            value={value.username}
            onChange={(event) => onChange({ username: event.target.value })}
            placeholder="jdoe"
            autoComplete="off"
          />
        </div>
        {passwordManagedBySso ? (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Password</span>
            <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-meta leading-relaxed text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              Managed by the identity provider. Remove the account from the SSO group to set a local
              password.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-password`}>
              {passwordRequired ? "Password" : "New password"}
            </Label>
            <Input
              id={`${idPrefix}-password`}
              type="password"
              required={passwordRequired}
              value={value.password}
              onChange={(event) => onChange({ password: event.target.value })}
              placeholder={passwordPlaceholder ?? "••••••••"}
              autoComplete="new-password"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-first-name`}>First name</Label>
          <Input
            id={`${idPrefix}-first-name`}
            value={value.firstName}
            onChange={(event) => onChange({ firstName: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-last-name`}>Last name</Label>
          <Input
            id={`${idPrefix}-last-name`}
            value={value.lastName}
            onChange={(event) => onChange({ lastName: event.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-email`}>Email</Label>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          value={value.email}
          onChange={(event) => onChange({ email: event.target.value })}
          placeholder="user@example.com"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckboxField
          checked={value.isStaff}
          onChange={(isStaff) => onChange({ isStaff })}
          label="Administrator access"
          description="Grants access to the Pulp admin site and staff-only operations."
        />
        {showActive ? (
          <CheckboxField
            checked={value.isActive}
            onChange={(isActive) => onChange({ isActive })}
            label="Active account"
            description="Inactive users cannot sign in or receive new session access."
          />
        ) : null}
      </div>
    </>
  );
}
