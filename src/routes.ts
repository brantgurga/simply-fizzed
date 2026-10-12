// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { useEffect, useState } from "react";

export type AppRoute =
  | { page: "home" }
  | { page: "catalog"; parameters: URLSearchParams }
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
  const catalogMatch = /^#\/sodas(?:\?(.*))?$/.exec(hash);
  if (catalogMatch !== null)
    return { page: "catalog", parameters: new URLSearchParams(catalogMatch[1]) };

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

export function sodaCatalogRoute(parameters = new URLSearchParams()): string {
  const query = parameters.toString();
  return query.length === 0 ? "#/sodas" : `#/sodas?${query}`;
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
