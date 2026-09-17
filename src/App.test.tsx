import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import theme from "./theme";

const auth = vi.hoisted(() => ({
  currentUser: null as { displayName: string | null; email: string | null } | null,
  signOut: vi.fn(),
}));

vi.mock("./firebase", () => ({ app: {}, auth: {}, db: {} }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth, listener: (user: typeof auth.currentUser) => void) => {
    listener(auth.currentUser);
    return vi.fn();
  }),
  signOut: auth.signOut,
}));
vi.mock("@firebase-oss/ui-core", () => ({ initializeUI: vi.fn(() => ({})) }));
vi.mock("@firebase-oss/ui-react", () => ({
  FirebaseUIProvider: ({ children }: { children: ReactNode }) => children,
  SignInAuthScreen: ({ onSignUpClick }: { onSignUpClick: () => void }) => (
    <section aria-label="FirebaseUI sign in">
      <h2>Sign in</h2>
      <button onClick={onSignUpClick}>Create an account</button>
    </section>
  ),
  SignUpAuthScreen: ({ onSignInClick }: { onSignInClick: () => void }) => (
    <section aria-label="FirebaseUI sign up">
      <h2>Create an account</h2>
      <button onClick={onSignInClick}>Use an existing account</button>
    </section>
  ),
}));

describe("App", () => {
  beforeEach(() => {
    auth.currentUser = null;
    auth.signOut.mockReset();
  });

  it("follows the device light or dark color scheme", () => {
    expect(theme).toHaveProperty("colorSchemes.light.palette.mode", "light");
    expect(theme).toHaveProperty("colorSchemes.dark.palette.mode", "dark");
    expect(theme).toHaveProperty("colorSchemeSelector", "media");
  });

  it("keeps browsing available without signing in", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Simply Fizzed" })).toBeInTheDocument();
    expect(
      screen.getByText("Find soda near you. Set your location to start searching."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  it("opens FirebaseUI and switches between sign-in and sign-up", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByLabelText("FirebaseUI sign in")).toBeVisible();
    expect(screen.getAllByRole("heading", { name: "Sign in" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    expect(screen.getByLabelText("FirebaseUI sign up")).toBeVisible();
    expect(screen.getAllByRole("heading", { name: "Create an account" })).toHaveLength(1);
  });

  it("shows the authenticated user and allows sign-out", async () => {
    auth.currentUser = { displayName: null, email: "fan@example.test" };
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText("fan@example.test")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenCalledOnce();
  });
});
