import type { ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getContrastRatio } from "@mui/material/styles";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import theme, { rootBeerPalettes } from "./theme";

const auth = vi.hoisted(() => ({
  currentUser: null as {
    uid: string;
    displayName: string | null;
    email: string | null;
  } | null,
  signOut: vi.fn(),
  addLocation: vi.fn(),
  savePublicProfile: vi.fn(),
  isFirestoreAvailable: vi.fn(),
}));

vi.mock("./firebase", () => ({
  app: {},
  auth: {},
  db: {},
  isFirestoreAvailable: auth.isFirestoreAvailable,
}));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth, listener: (user: typeof auth.currentUser) => void) => {
    listener(auth.currentUser);
    return vi.fn();
  }),
  signOut: auth.signOut,
}));
vi.mock("@firebase-oss/ui-core", () => ({ initializeUI: vi.fn(() => ({})) }));
vi.mock("./location/LocationInput", () => ({
  default: ({ onResolveError }: { onResolveError: () => void }) => (
    <button onClick={onResolveError}>Fail location search</button>
  ),
}));
vi.mock("./location/addLocation", () => ({ addLocation: auth.addLocation }));
vi.mock("./rating/ratings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./rating/ratings")>()),
  savePublicProfile: auth.savePublicProfile,
}));
vi.mock("./location/AddLocationForm", () => ({
  default: ({
    onSave,
    onAdded,
  }: {
    onSave: (input: {
      name: string;
      street: string;
      city: string;
      state: string;
      postalCode: string;
    }) => Promise<void>;
    onAdded: (name: string) => void;
  }) => (
    <section aria-label="Add location form">
      <button
        onClick={() => {
          void onSave({
            name: "Corner Shop",
            street: "1 Main St",
            city: "Kansas City",
            state: "MO",
            postalCode: "64106",
          }).then(() => onAdded("Corner Shop"));
        }}
      >
        Save location
      </button>
    </section>
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
    auth.addLocation.mockReset();
    auth.addLocation.mockResolvedValue(undefined);
    auth.savePublicProfile.mockReset();
    auth.savePublicProfile.mockResolvedValue(undefined);
    auth.isFirestoreAvailable.mockReset();
    auth.isFirestoreAvailable.mockResolvedValue(true);
    window.localStorage.clear();
    window.history.replaceState(null, "", "#/");
  });

  it("provides accessible root beer palettes selected by the device color scheme", () => {
    expect(theme).toHaveProperty("colorSchemes.light.palette.mode", "light");
    expect(theme).toHaveProperty("colorSchemes.dark.palette.mode", "dark");
    expect(theme).toHaveProperty("colorSchemeSelector", "media");

    for (const mode of ["light", "dark"] as const) {
      const palette = rootBeerPalettes[mode].palette;
      expect(
        getContrastRatio(palette.text.primary, palette.background.default),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        getContrastRatio(palette.text.secondary, palette.background.default),
      ).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(palette.divider, palette.background.paper)).toBeGreaterThanOrEqual(3);

      for (const role of ["primary", "secondary", "success", "warning", "error", "info"] as const) {
        expect(
          getContrastRatio(palette[role].main, palette[role].contrastText),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("maps FirebaseUI onto the active MUI color scheme", () => {
    expect(theme.components?.MuiCssBaseline?.styleOverrides).toMatchObject({
      ":root": {
        "--fui-primary": "var(--mui-palette-primary-main)",
        "--fui-primary-surface": "var(--mui-palette-primary-contrastText)",
        "--fui-text": "var(--mui-palette-text-primary)",
        "--fui-background": "var(--mui-palette-background-paper)",
        "--fui-input": "var(--mui-palette-divider)",
        "--fui-error": "var(--mui-palette-error-main)",
      },
    });
  });

  it("keeps browsing available without signing in", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Simply Fizzed" })).toBeInTheDocument();
    expect(
      screen.getByText("Find soda near you. Set your location to start searching."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  it("surfaces an unavailable Firestore backend before a search starts", async () => {
    auth.isFirestoreAvailable.mockResolvedValue(false);

    render(<App />);

    expect(await screen.findByText(/soda data is currently unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/no soda found/i)).not.toBeInTheDocument();
  });

  it("removes the backend alert when cached offline browsing takes over", async () => {
    auth.isFirestoreAvailable.mockResolvedValue(false);
    render(<App />);
    await screen.findByText(/soda data is currently unavailable/i);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.queryByText(/soda data is currently unavailable/i)).not.toBeInTheDocument();
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

  it("takes a guest directly to sign-up before adding a location", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add a location" }));

    expect(await screen.findByLabelText("FirebaseUI sign up")).toBeVisible();
    expect(screen.getByRole("button", { name: "Back to browsing" })).toBeVisible();
  });

  it("opens centered FirebaseUI and switches between sign-in and sign-up", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const signInScreen = await screen.findByLabelText("FirebaseUI sign in");
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

  it("allows an authenticated fan to add an attributed location", async () => {
    auth.currentUser = { uid: "fan-123", displayName: null, email: "fan@example.com" };
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add a location" }));
    expect(screen.getByLabelText("Add location form")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Save location" }));
    expect(auth.addLocation).toHaveBeenCalledWith(
      {},
      expect.anything(),
      { id: "fan-123", name: "fa…@example.com" },
      expect.objectContaining({ name: "Corner Shop" }),
    );
    expect(await screen.findByText("Thanks — Corner Shop was added.")).toBeVisible();
  });

  it("waits for public profile provisioning before linking to it", async () => {
    auth.currentUser = { uid: "fan-123", displayName: null, email: "fan@example.com" };
    let finishProfile: (() => void) | undefined;
    auth.savePublicProfile.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishProfile = resolve;
        }),
    );
    render(<App />);

    expect(screen.queryByRole("link", { name: "fan@example.com" })).not.toBeInTheDocument();
    finishProfile?.();
    expect(await screen.findByRole("link", { name: "fan@example.com" })).toHaveAttribute(
      "href",
      "#/profiles/fan-123",
    );
  });

  it("shows the authenticated user and allows sign-out", async () => {
    auth.currentUser = { uid: "fan-123", displayName: null, email: "fan@example.com" };
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText("fan@example.com")).toBeVisible();
    expect(auth.savePublicProfile).toHaveBeenCalledWith({}, "fan-123", "fa…@example.com");
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenCalledOnce();
  });
});
