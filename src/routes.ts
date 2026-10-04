import { useEffect, useState } from "react";

export type AppRoute =
  | { page: "home" }
  | { page: "location"; id: string }
  | { page: "soda"; id: string }
  | { page: "profile"; id: string }
  | { page: "manageUsers" }
  | { page: "notFound" };

function decodeId(value: string): string | undefined {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length > 0 ? decoded : undefined;
  } catch {
    return undefined;
  }
}

/** Parse the dependency-free hash routes supported by the application. */
export function parseHashRoute(hash: string): AppRoute {
  if (hash === "" || hash === "#" || hash === "#/") return { page: "home" };
  if (hash === "#/manage/users") return { page: "manageUsers" };

  const match = /^#\/(locations|sodas|profiles)\/([^/]+)$/.exec(hash);
  if (match === null) return { page: "notFound" };
  const id = decodeId(match[2] ?? "");
  if (id === undefined) return { page: "notFound" };
  if (match[1] === "locations") return { page: "location", id };
  if (match[1] === "sodas") return { page: "soda", id };
  return { page: "profile", id };
}

export function locationRoute(id: string): string {
  return `#/locations/${encodeURIComponent(id)}`;
}

export function sodaRoute(id: string): string {
  return `#/sodas/${encodeURIComponent(id)}`;
}

export function profileRoute(id: string): string {
  return `#/profiles/${encodeURIComponent(id)}`;
}

export const manageUsersRoute = "#/manage/users";

/** Keep React in sync with browser back/forward navigation between hash routes. */
export function useHashRoute(): AppRoute {
  const [route, setRoute] = useState(() => parseHashRoute(window.location.hash));

  useEffect(() => {
    const update = () => setRoute(parseHashRoute(window.location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  return route;
}
