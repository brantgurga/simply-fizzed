import { expect } from "expect";
import { Timestamp } from "firebase-admin/firestore";
import { privateUserDataDocumentSchema, restrictionDocumentSchema } from "./firestore-store.js";

const ORIGINAL_AT = new Date("2026-10-01T12:00:00.000Z");
const UPDATED_AT = new Date("2026-10-02T12:00:00.000Z");

/** Build a valid persisted restriction document for schema tests. */
function persistedRestriction() {
  return {
    publicReason: "Repeated inaccurate contributions",
    originallyRestrictedBy: "moderator-uid",
    originallyRestrictedAt: Timestamp.fromDate(ORIGINAL_AT),
    restrictionLastUpdatedBy: "operator-uid",
    restrictionLastUpdatedAt: Timestamp.fromDate(UPDATED_AT),
  };
}

describe("private moderation document schema", () => {
  it("accepts missing data and ignores malformed internal reasons", () => {
    expect(privateUserDataDocumentSchema.parse({})).toEqual({});
    expect(privateUserDataDocumentSchema.parse({ internalReason: 42 })).toEqual({});
  });

  it("preserves a non-empty internal reason", () => {
    expect(privateUserDataDocumentSchema.parse({ internalReason: "Confirmed abuse" })).toEqual({
      internalReason: "Confirmed abuse",
    });
  });
});

describe("restriction document schema", () => {
  it("converts valid Admin timestamps and preserves attribution", () => {
    expect(restrictionDocumentSchema.parse(persistedRestriction())).toEqual({
      publicReason: "Repeated inaccurate contributions",
      originallyRestrictedBy: "moderator-uid",
      originallyRestrictedAt: ORIGINAL_AT,
      restrictionLastUpdatedBy: "operator-uid",
      restrictionLastUpdatedAt: UPDATED_AT,
    });
  });

  it("fails closed when a persisted expiration is present but malformed", () => {
    expect(
      restrictionDocumentSchema.parse({ ...persistedRestriction(), expiresAt: "invalid" }),
    ).toMatchObject({ invalidExpiration: true });
  });

  it("uses safe attribution defaults without inventing an expiration", () => {
    expect(restrictionDocumentSchema.parse({})).toEqual({
      publicReason: "Community access is restricted.",
      originallyRestrictedBy: "unknown",
      originallyRestrictedAt: new Date(0),
      restrictionLastUpdatedBy: "unknown",
      restrictionLastUpdatedAt: new Date(0),
    });
  });
});
