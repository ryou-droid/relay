export function isAdminRole(role) {
  return role === "organization_admin" || role === "department_admin";
}

/** Server gate reused by every admin page and mutation, not only its layout. */
export async function requireAdminSession(loadSession, redirect, organizationOnly = false) {
  const context = await loadSession();
  if (!isAdminRole(context.membership?.role) ||
      (organizationOnly && context.membership.role !== "organization_admin")) {
    return redirect("/app");
  }
  return context;
}
