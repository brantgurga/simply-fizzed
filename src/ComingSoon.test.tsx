import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ComingSoon from "./ComingSoon";

describe("ComingSoon", () => {
  it("renders a static placeholder instead of the app shell", () => {
    render(<ComingSoon />);

    expect(screen.getByRole("heading", { name: "Simply Fizzed" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Coming soon" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
  });
});
