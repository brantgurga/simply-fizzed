import { describe, expect, it } from "vitest";
import { publicContributorName } from "./contributor";

describe("publicContributorName", () => {
  it("prefers an intentional display name even when it resembles an email", () => {
    expect(
      publicContributorName({ displayName: " fan@example.test ", email: "private@example.test" }),
    ).toBe("fan@example.test");
  });

  it.each([
    ["fan@example.test", "fa…@example.test"],
    ["ab@example.test", "a…@example.test"],
    ["a@example.test", "…@example.test"],
  ])("redacts the local part of fallback email %s", (email, expected) => {
    expect(publicContributorName({ displayName: null, email })).toBe(expected);
  });

  it("omits attribution when no usable identity is available", () => {
    expect(publicContributorName({ displayName: " ", email: "not-an-email" })).toBeUndefined();
  });
});
