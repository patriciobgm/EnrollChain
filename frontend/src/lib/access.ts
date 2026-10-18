import type { User } from "./auth";
export function hasPermission(user: User | null, permission: string) {
  return (
    !!user &&
    (user.is_superuser === true || user.permissions.includes(permission))
  );
}
export function isAdministrator(user: User | null) {
  return (
    !!user && (user.role === "ADMINISTRATOR" || user.is_superuser === true)
  );
}
export function landingPage(user: User) {
  if (user.role === "ADMINISTRATOR") return "/administration";
  return "/dashboard";
}
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
