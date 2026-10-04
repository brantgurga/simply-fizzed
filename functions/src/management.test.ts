import { expect } from "expect";
import * as sinon from "sinon";
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

function gateways(events: string[], currentUser: AuthUser = fan) {
  const setCustomUserClaims = sinon.stub().callsFake(async () => {
    events.push("claim");
  });
  const clearModeratorGrant = sinon.stub().callsFake(async () => {
    events.push("cleanup");
  });
  const auth: AuthGateway = {
    getUser: sinon.stub().resolves(currentUser),
    getUserByEmail: sinon.stub(),
    listUsers: sinon.stub(),
    setCustomUserClaims,
  };
  const store: ManagementStore = {
    getRestriction: sinon.stub(),
    getPrivateUserData: sinon.stub(),
    saveRestriction: sinon.stub(),
    removeRestriction: sinon.stub(),
    writeModeratorGrant: sinon.stub().callsFake(async () => {
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
  for (const value of [undefined, "", "not-json", "[]", "{}", '["same","same"]', '[" spaced "]']) {
    it(`fails closed for ${String(value)}`, () => {
      expect(parseOperatorUids(value)).toMatchObject({ valid: false });
      expect(parseOperatorUids(value).uids.size).toBe(0);
    });
  }

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
    const setCustomUserClaims = sinon.stub();
    const auth: AuthGateway = {
      getUser: sinon
        .stub()
        .callsFake(async (uid: string) =>
          uid === "operator-uid"
            ? { uid, disabled: false }
            : { uid, disabled: false, customClaims: { moderator: true } },
        ),
      getUserByEmail: sinon.stub(),
      listUsers: sinon.stub(),
      setCustomUserClaims,
    };
    const saveRestriction = sinon.stub().rejects(new Error("Firestore unavailable"));
    const store: ManagementStore = {
      getRestriction: sinon.stub(),
      getPrivateUserData: sinon.stub(),
      saveRestriction,
      removeRestriction: sinon.stub(),
      writeModeratorGrant: sinon.stub(),
      clearModeratorGrant: sinon.stub(),
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
    sinon.assert.calledOnce(saveRestriction);
    sinon.assert.notCalled(setCustomUserClaims);
  });

  it("keeps a restriction when a combined promotion fails", async () => {
    const auth: AuthGateway = {
      getUser: sinon
        .stub()
        .callsFake(async (uid: string) =>
          uid === "operator-uid"
            ? { uid, disabled: false }
            : { uid, disabled: false, customClaims: { existing: "preserved" } },
        ),
      getUserByEmail: sinon.stub(),
      listUsers: sinon.stub(),
      setCustomUserClaims: sinon.stub().rejects(new Error("claim failed")),
    };
    const removeRestriction = sinon.stub();
    const store: ManagementStore = {
      getRestriction: sinon.stub().resolves(restriction()),
      getPrivateUserData: sinon.stub(),
      saveRestriction: sinon.stub(),
      removeRestriction,
      writeModeratorGrant: sinon.stub(),
      clearModeratorGrant: sinon.stub(),
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
        targetUid: "fan-uid",
        moderator: true,
        restriction: null,
      }),
    ).rejects.toThrow("claim failed");
    sinon.assert.notCalled(removeRestriction);
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

    await changeModeratorClaim(auth, store, fan.uid, true, "operator-uid", NOW, "operation-one");

    expect(events).toEqual(["metadata", "claim"]);
    sinon.assert.calledWithExactly(setCustomUserClaims, "fan-uid", {
      existing: "preserved",
      moderator: true,
    });
  });

  it("attempts cleanup after a failed grant without treating stale metadata as authority", async () => {
    const events: string[] = [];
    const { auth, store, setCustomUserClaims, clearModeratorGrant } = gateways(events);
    setCustomUserClaims.callsFake(async () => {
      events.push("claim");
      throw new Error("claim failed");
    });

    await expect(
      changeModeratorClaim(auth, store, fan.uid, true, "operator-uid", NOW, "operation-one"),
    ).rejects.toThrow("claim failed");
    expect(events).toEqual(["metadata", "claim", "cleanup"]);
    sinon.assert.calledWithExactly(clearModeratorGrant, "fan-uid", "operation-one");
  });

  it("keeps claim failure authoritative even when metadata cleanup also fails", async () => {
    const events: string[] = [];
    const { auth, store, setCustomUserClaims, clearModeratorGrant } = gateways(events);
    setCustomUserClaims.rejects(new Error("claim failed"));
    clearModeratorGrant.rejects(new Error("cleanup failed"));

    await expect(
      changeModeratorClaim(auth, store, fan.uid, true, "operator-uid", NOW, "operation-one"),
    ).rejects.toThrow("claim failed");
    sinon.assert.calledOnce(setCustomUserClaims);
  });

  it("removes the claim before best-effort revocation cleanup", async () => {
    const events: string[] = [];
    const { auth, store, setCustomUserClaims, clearModeratorGrant } = gateways(events, moderator);
    clearModeratorGrant.callsFake(async () => {
      events.push("cleanup");
      throw new Error("cleanup failed");
    });

    await expect(
      changeModeratorClaim(auth, store, moderator.uid, false, "operator-uid", NOW, "operation-two"),
    ).resolves.toBeUndefined();
    expect(events).toEqual(["claim", "cleanup"]);
    sinon.assert.calledWithExactly(setCustomUserClaims, "fan-uid", {
      existing: "preserved",
    });
  });

  it("reloads claims immediately before preserving unrelated values", async () => {
    const events: string[] = [];
    const currentUser: AuthUser = { ...fan, customClaims: { concurrent: "current" } };
    const { auth, store, setCustomUserClaims } = gateways(events, currentUser);

    await changeModeratorClaim(auth, store, fan.uid, true, "operator-uid", NOW, "operation-one");

    sinon.assert.calledWithExactly(setCustomUserClaims, fan.uid, {
      concurrent: "current",
      moderator: true,
    });
  });
});
