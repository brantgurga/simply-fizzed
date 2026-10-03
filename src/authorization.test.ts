import { describe, expect, it } from "vitest";
import {
  communityWriteErrorMessage,
  conservativeRestrictedAuthorization,
  type ClientAuthorization,
} from "./authorization";
import type { RestrictionView } from "./management/api";

const expiredRestriction: RestrictionView = {
  publicReason: "Pause community edits",
  originallyRestrictedBy: "moderator-uid",
  originallyRestrictedAt: "2026-10-01T00:00:00.000Z",
  restrictionLastUpdatedBy: "moderator-uid",
  restrictionLastUpdatedAt: "2026-10-01T00:00:00.000Z",
  expiresAt: "2026-10-02T00:00:00.000Z",
};

describe("conservative authorization", () => {
  it("does not restore capability from a locally expired cached restriction", () => {
    const previous: ClientAuthorization = {
      moderator: true,
      operator: false,
      restricted: false,
      canWriteCommunity: true,
      canManageUsers: true,
      evaluatedAt: "2026-10-01T12:00:00.000Z",
      restriction: null,
      source: "server",
    };

    expect(conservativeRestrictedAuthorization(previous, expiredRestriction)).toMatchObject({
      moderator: true,
      restricted: true,
      canWriteCommunity: false,
      canManageUsers: false,
      source: "cachedRestriction",
    });
  });

  it("preserves only Operator management authority through a cached restriction", () => {
    const previous: ClientAuthorization = {
      moderator: false,
      operator: true,
      restricted: false,
      canWriteCommunity: true,
      canManageUsers: true,
      evaluatedAt: "2026-10-01T12:00:00.000Z",
      restriction: null,
      source: "server",
    };

    expect(conservativeRestrictedAuthorization(previous, expiredRestriction)).toMatchObject({
      operator: true,
      restricted: true,
      canWriteCommunity: false,
      canManageUsers: true,
    });
  });

  it("grants nothing when a cached restriction is the only available state", () => {
    expect(conservativeRestrictedAuthorization(null, expiredRestriction)).toMatchObject({
      moderator: false,
      operator: false,
      restricted: true,
      canWriteCommunity: false,
      canManageUsers: false,
    });
  });
});

describe("community synchronization errors", () => {
  it("identifies Firestore permission rejection as restriction-related", () => {
    expect(communityWriteErrorMessage({ code: "firestore/permission-denied" })).toContain(
      "contribution access is restricted",
    );
  });

  it("keeps a generic retry message for unrelated failures", () => {
    expect(communityWriteErrorMessage(new Error("network"))).toContain("retry while online");
  });
});
