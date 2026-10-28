/**
 * True when changes are locked at this spot on the page: a Manager login (view only everywhere), or an Office login
 * outside the parts marked [data-office-edit] (billing, Master Sheet money, owner billing info, customer logins).
 * Same rule as the CSS in globals.css.
 */
export function locked(el?: Element | null): boolean {
  if (typeof document === "undefined") return false;
  const root = document.querySelector("[data-view]");
  if (!root) return false;
  return !(root.getAttribute("data-view") === "office" && !!el?.closest("[data-office-edit]"));
}
