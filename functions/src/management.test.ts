import { describe, expect, it, vi } from "vitest";
import {
  changeModeratorClaim,
  claimsWithModerator,
  isRestrictionActive,
  parseOperatorUids,
  UserManagementService,
  type AuthGateway,
  type AuthUser,
  type ManagementStore,
  type RestrictionRecord,
} from "./management.js";

const NOW = new Date("2026-10-03T12:00:00.000Z");

function restriction(expiresAt?: Date): RestrictionRecord {
  return {
    publicReason: "Repeated inaccurate contributions",
    originallyRestrictedBy: "moderator-uid",
    originallyRestrictedAt: new Date("2026-10-01T12:00:00.000Z"),
    restrictionLastUpdatedBy: "moderator-uid",
    restrictionLastUpdatedAt: new Date("2026-10-02T12:00:00.000Z"),
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
}

function gateways(events: string[]) {
  const setCustomUserClaims = vi.fn(async () => {
    events.push("claim");
  });
  const clearModeratorGrant = vi.fn(async () => {
    events.push("cleanup");
  });
  const auth: AuthGateway = {
    getUser: vi.fn(),
    getUserByEmail: vi.fn(),
    listUsers: vi.fn(),
    setCustomUserClaims,
  };
  const store: ManagementStore = {
    getRestriction: vi.fn(),
    getPrivateUserData: vi.fn(),
    saveRestriction: vi.fn(),
    removeRestriction: vi.fn(),
    writeModeratorGrant: vi.fn(async () => {
      events.push("metadata");
    }),
    clearModeratorGrant,
  };
  return { auth, store, setCustomUserClaims, clearModeratorGrant };
}

const fan: AuthUser = {
  uid: "fan-uid",
  disabled: false,
  customClaims: { existing: "preserved" },
};

const moderator: AuthUser = {
  ...fan,
  customClaims: { existing: "preserved", moderator: true },
};

describe("Operator configuration", () => {
  it.each([undefined, "", "not-json", "[]", "{}", '["same","same"]', '[" spaced "]'])(
    "fails closed for %s",
    (value) => {
      expect(parseOperatorUids(value)).toMatchObject({ valid: false });
      expect(parseOperatorUids(value).uids.size).toBe(0);
    },
  );

  it("accepts multiple unique, structurally valid UIDs", () => {
    const result = parseOperatorUids('["operator-one","operator-two"]');

    expect(result.valid).toBe(true);
    expect([...result.uids]).toEqual(["operator-one", "operator-two"]);
  });
});

describe("restriction expiration", () => {
  it("is active without expiration and strictly before expiration", () => {
    expect(isRestrictionActive(restriction(), NOW)).toBe(true);
    expect(isRestrictionActive(restriction(new Date("2026-10-03T12:00:00.001Z")), NOW)).toBe(true);
  });

  it("is inactive exactly at and after expiration", () => {
    expect(isRestrictionActive(restriction(NOW), NOW)).toBe(false);
    expect(isRestrictionActive(restriction(new Date("2026-10-03T11:59:59.999Z")), NOW)).toBe(false);
  });

  it("fails closed for malformed persisted expiration", () => {
    expect(isRestrictionActive({ ...restriction(), invalidExpiration: true }, NOW)).toBe(true);
  });
});

describe("combined transition ordering", () => {
  it("does not revoke before an intended restriction is durably saved", async () => {
    const setCustomUserClaims = vi.fn();
    const auth: AuthGateway = {
      getUser: vi.fn(async (uid) =>
        uid === "operator-uid"
          ? { uid, disabled: false }
          : { uid, disabled: false, customClaims: { moderator: true } },
      ),
      getUserByEmail: vi.fn(),
      listUsers: vi.fn(),
      setCustomUserClaims,
    };
    const saveRestriction = vi.fn().mockRejectedValue(new Error("Firestore unavailable"));
    const store: ManagementStore = {
      getRestriction: vi.fn(),
      getPrivateUserData: vi.fn(),
      saveRestriction,
      removeRestriction: vi.fn(),
      writeModeratorGrant: vi.fn(),
      clearModeratorGrant: vi.fn(),
    };
    const service = new UserManagementService(
      auth,
      store,
      () => '["operator-uid"]',
      () => NOW,
      () => "operation-one",
    );

    await expect(
      service.applyUserManagement("operator-uid", {
        targetUid: "moderator-uid",
        moderator: false,
        restriction: { publicReason: "Community access paused" },
      }),
    ).rejects.toThrow("Firestore unavailable");
    expect(saveRestriction).toHaveBeenCalledOnce();
    expect(setCustomUserClaims).not.toHaveBeenCalled();
  });
});

describe("Moderator claim changes", () => {
  it("preserves unrelated custom claims", () => {
    expect(claimsWithModerator(fan.customClaims, true)).toEqual({
      existing: "preserved",
      moderator: true,
    });
    expect(claimsWithModerator(moderator.customClaims, false)).toEqual({
      existing: "preserved",
    });
  });

  it("writes grant metadata before setting the authoritative claim", async () => {
    const events: string[] = [];
    const { auth, store, setCustomUserClaims } = gateways(events);

    await changeModeratorClaim(auth, store, fan, true, "operator-uid", NOW, "operation-one");

    expect(events).toEqual(["metadata", "claim"]);
    expect(setCustomUserClaims).toHaveBeenCalledWith("fan-uid", {
      existing: "preserved",
      moderator: true,
    });
  });

  it("attempts cleanup after a failed grant without treating stale metadata as authority", async () => {
    const events: string[] = [];
    const { auth, store, setCustomUserClaims, clearModeratorGrant } = gateways(events);
    setCustomUserClaims.mockImplementation(async () => {
      events.push("claim");
      throw new Error("claim failed");
    });

    await expect(
      changeModeratorClaim(auth, store, fan, true, "operator-uid", NOW, "operation-one"),
    ).rejects.toThrow("claim failed");
    expect(events).toEqual(["metadata", "claim", "cleanup"]);
    expect(clearModeratorGrant).toHaveBeenCalledWith("fan-uid", "operation-one");
  });

  it("keeps claim failure authoritative even when metadata cleanup also fails", async () => {
    const events: string[] = [];
    const { auth, store, setCustomUserClaims, clearModeratorGrant } = gateways(events);
    setCustomUserClaims.mockRejectedValue(new Error("claim failed"));
    clearModeratorGrant.mockRejectedValue(new Error("cleanup failed"));

    await expect(
      changeModeratorClaim(auth, store, fan, true, "operator-uid", NOW, "operation-one"),
    ).rejects.toThrow("claim failed");
    expect(setCustomUserClaims).toHaveBeenCalledOnce();
  });

  it("removes the claim before best-effort revocation cleanup", async () => {
    const events: string[] = [];
    const { auth, store, setCustomUserClaims, clearModeratorGrant } = gateways(events);
    clearModeratorGrant.mockImplementation(async () => {
      events.push("cleanup");
      throw new Error("cleanup failed");
    });

    await expect(
      changeModeratorClaim(auth, store, moderator, false, "operator-uid", NOW, "operation-two"),
    ).resolves.toBeUndefined();
    expect(events).toEqual(["claim", "cleanup"]);
    expect(setCustomUserClaims).toHaveBeenCalledWith("fan-uid", {
      existing: "preserved",
    });
  });
});
