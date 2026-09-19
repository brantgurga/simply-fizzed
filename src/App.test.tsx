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
const firebaseClient = vi.hoisted(() => ({
  app: { name: "test-app" },
  auth: { name: "test-auth" },
  db: { name: "test-db" },
  initializeUI: vi.fn(() => ({})),
}));

vi.mock("./firebase", () => ({
  app: firebaseClient.app,
  auth: firebaseClient.auth,
  db: firebaseClient.db,
}));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth, listener: (user: typeof auth.currentUser) => void) => {
    listener(auth.currentUser);
    return vi.fn();
  }),
  signOut: auth.signOut,
}));
vi.mock("@firebase-oss/ui-core", () => ({ initializeUI: firebaseClient.initializeUI }));
vi.mock("./location/LocationInput", () => ({
  default: ({ onResolveError }: { onResolveError: () => void }) => (
    <button onClick={onResolveError}>Fail location search</button>
  ),
}));
vi.mock("@firebase-oss/ui-react", () => ({
  FirebaseUIProvider: ({ children }: { children: ReactNode }) => children,
  SignInAuthScreen: ({ onSignUpClick }: { onSignUpClick: () => void }) => (
    <section aria-label="FirebaseUI sign in">
      <h2>Sign in</h2>
      <label>
        Email
        <input type="email" />
      </label>
      <label>
        Password
        <input type="password" />
      </label>
      <button onClick={onSignUpClick}>Create an account</button>
    </section>
  ),
  SignUpAuthScreen: ({ onSignInClick }: { onSignInClick: () => void }) => (
    <section aria-label="FirebaseUI sign up">
      <h2>Create an account</h2>
      <label>
        Email
        <input type="email" />
      </label>
      <label>
        Password
        <input type="password" />
      </label>
      <button onClick={onSignInClick}>Use an existing account</button>
    </section>
  ),
}));

describe("App", () => {
  beforeEach(() => {
    auth.currentUser = null;
    auth.signOut.mockReset();
    window.localStorage.clear();
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

  it("hides a stale search center when location resolution fails", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "simply-fizzed:last-search-center",
      JSON.stringify({ lat: 39.7684, lng: -86.1581 }),
    );
    render(<App />);

    expect(screen.getByText("Searching near 39.7684, -86.1581.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Fail location search" }));
    expect(screen.queryByText(/searching near/i)).not.toBeInTheDocument();
    expect(window.localStorage.getItem("simply-fizzed:last-search-center")).toBe(
      JSON.stringify({ lat: 39.7684, lng: -86.1581 }),
    );
  });

  it("opens centered FirebaseUI and switches between sign-in and sign-up", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const signInScreen = await screen.findByLabelText("FirebaseUI sign in");
    expect(firebaseClient.initializeUI).toHaveBeenCalledWith({
      app: firebaseClient.app,
      auth: firebaseClient.auth,
    });
    expect(signInScreen).toBeVisible();
    expect(signInScreen.parentElement).toHaveStyle({
      display: "flex",
      justifyContent: "center",
      width: "100%",
    });
    expect(screen.getAllByRole("heading", { name: "Sign in" })).toHaveLength(1);
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    expect(screen.getByLabelText("FirebaseUI sign up")).toBeVisible();
    expect(screen.getAllByRole("heading", { name: "Create an account" })).toHaveLength(1);
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
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
