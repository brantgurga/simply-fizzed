import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import {
  loadMyAuthorization,
  type AuthorizationView,
  type RestrictionView,
} from "./management/api";

export type ClientAuthorization = AuthorizationView & {
  source: "server" | "cachedRestriction";
};

interface AuthorizationEntry {
  userId: string;
  authorization: ClientAuthorization | null;
  loading: boolean;
}

export interface AuthorizationState {
  authorization: ClientAuthorization | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

function timestampIso(value: unknown): string {
  return value instanceof Timestamp ? value.toDate().toISOString() : new Date(0).toISOString();
}

function cachedRestriction(data: Record<string, unknown>): RestrictionView {
  const expiresAt = data["expiresAt"];
  return {
    publicReason:
      typeof data["publicReason"] === "string"
        ? data["publicReason"]
        : "Community access is restricted.",
    originallyRestrictedBy:
      typeof data["originallyRestrictedBy"] === "string"
        ? data["originallyRestrictedBy"]
        : "unknown",
    originallyRestrictedAt: timestampIso(data["originallyRestrictedAt"]),
    restrictionLastUpdatedBy:
      typeof data["restrictionLastUpdatedBy"] === "string"
        ? data["restrictionLastUpdatedBy"]
        : "unknown",
    restrictionLastUpdatedAt: timestampIso(data["restrictionLastUpdatedAt"]),
    expiresAt: expiresAt instanceof Timestamp ? expiresAt.toDate().toISOString() : null,
  };
}

/**
 * Apply a cached restriction conservatively. Its local expiration is never used
 * to restore community or Moderator capability.
 */
export function conservativeRestrictedAuthorization(
  previous: ClientAuthorization | null,
  restriction: RestrictionView,
): ClientAuthorization {
  const operator = previous?.operator ?? false;
  return {
    moderator: previous?.moderator ?? false,
    operator,
    restricted: true,
    canWriteCommunity: false,
    canManageUsers: operator,
    evaluatedAt: previous?.evaluatedAt ?? "",
    restriction,
    source: "cachedRestriction",
  };
}

/** Convert a server rule rejection into the restriction-aware synchronization message. */
export function communityWriteErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  return code.endsWith("permission-denied")
    ? "A saved community change could not be synchronized because contribution access is restricted."
    : "A saved change could not be synchronized. Please retry while online.";
}

/**
 * Keep a conservative in-memory authorization view and observe the user's
 * self-readable restriction document through Firestore's normal offline cache.
 */
export function useAuthorization(user: Pick<User, "uid"> | null): AuthorizationState {
  const [entry, setEntry] = useState<AuthorizationEntry>();
  const request = useRef(0);
  const userId = user?.uid;

  const refresh = useCallback(async () => {
    if (userId === undefined || !navigator.onLine) return;
    const currentRequest = ++request.current;
    try {
      const confirmed = await loadMyAuthorization();
      if (request.current === currentRequest) {
        setEntry({
          userId,
          authorization: { ...confirmed, source: "server" },
          loading: false,
        });
      }
    } catch {
      if (request.current === currentRequest && navigator.onLine) {
        setEntry((current) => ({
          userId,
          authorization:
            current?.userId === userId && current.authorization?.restricted === true
              ? current.authorization
              : null,
          loading: false,
        }));
      }
    }
  }, [userId]);

  useEffect(() => {
    request.current += 1;
    if (userId === undefined) {
      // Reset state when Auth signs out; this effect owns the external Auth subscription.
      // oxlint-disable-next-line react/set-state-in-effect
      setEntry(undefined);
      return undefined;
    }

    setEntry((current) =>
      current?.userId === userId ? current : { userId, authorization: null, loading: true },
    );
    const unsubscribe = onSnapshot(
      doc(db, "restrictions", userId),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.exists()) {
          const restriction = cachedRestriction(snapshot.data());
          setEntry((current) => ({
            userId,
            authorization: conservativeRestrictedAuthorization(
              current?.userId === userId ? current.authorization : null,
              restriction,
            ),
            loading: false,
          }));
        }
        if (!snapshot.metadata.fromCache && navigator.onLine) void refresh();
      },
      () => undefined,
    );
    const handleOnline = () => void refresh();
    window.addEventListener("online", handleOnline);
    void refresh();

    return () => {
      request.current += 1;
      unsubscribe();
      window.removeEventListener("online", handleOnline);
    };
  }, [refresh, userId]);

  const authorization = entry !== undefined && entry.userId === userId ? entry.authorization : null;
  useEffect(() => {
    if (
      authorization?.restricted !== true ||
      authorization.restriction?.expiresAt === null ||
      authorization.restriction?.expiresAt === undefined ||
      authorization.evaluatedAt.length === 0
    ) {
      return undefined;
    }
    const remaining =
      Date.parse(authorization.restriction.expiresAt) - Date.parse(authorization.evaluatedAt);
    const delay = Math.min(Math.max(remaining + 100, 100), 2_147_483_647);
    const timer = window.setTimeout(() => {
      if (navigator.onLine) void refresh();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [authorization, refresh]);

  return {
    authorization,
    loading: entry !== undefined && entry.userId === userId ? entry.loading : userId !== undefined,
    refresh,
  };
}
