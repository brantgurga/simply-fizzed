// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { expect } from "expect";
import { auditableSnapshot, changedSnapshotFields } from "./audit.js";

const user = {
  uid: "fan-uid",
  disabled: false,
  displayName: "Fiona Fan",
  email: "fan@example.com",
  photoURL: "https://example.com/current-photo.png",
  customClaims: { moderator: true },
  password: "must-never-appear",
  accessToken: "must-never-appear",
};

describe("audit snapshots", () => {
  it("keeps complete auditable state without credentials or historical image content", () => {
    const snapshot = auditableSnapshot(
      user,
      { publicName: "Fiona" },
      {
        publicReason: "Pause contributions",
        originallyRestrictedBy: "moderator-uid",
        originallyRestrictedAt: new Date("2026-10-01T00:00:00.000Z"),
        restrictionLastUpdatedBy: "moderator-uid",
        restrictionLastUpdatedAt: new Date("2026-10-02T00:00:00.000Z"),
      },
      { internalReason: "Repeated abuse" },
    );

    expect(snapshot.auth).toEqual({
      disabled: false,
      displayName: "Fiona Fan",
      email: "fan@example.com",
      hasProfileImage: true,
      moderator: true,
    });
    expect(JSON.stringify(snapshot)).not.toContain("must-never-appear");
    expect(JSON.stringify(snapshot)).not.toContain("current-photo.png");
    expect(snapshot.restriction).toMatchObject({
      publicReason: "Pause contributions",
      internalReason: "Repeated abuse",
    });
  });

  it("uses changed fields only as shallow summary metadata", () => {
    const before = auditableSnapshot(user, { publicName: "Fiona" }, undefined, {});
    const after = auditableSnapshot(
      { ...user, disabled: true },
      { publicName: "Fiona Fan" },
      undefined,
      {},
    );

    expect(changedSnapshotFields(before, after)).toEqual(["auth", "profile"]);
  });
});
