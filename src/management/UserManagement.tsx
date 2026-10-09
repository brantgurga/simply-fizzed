// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { ClientAuthorization } from "../authorization";
import AuditHistory from "./AuditHistory";
import {
  applyManagementChanges,
  loadUserAuditHistory,
  revealManagedUserEmail,
  searchManagedUsers,
  type AuditHistory as AuditHistoryData,
  type ManagedUser,
  type ManagementChanges,
  type SearchMode,
} from "./api";

interface Draft {
  disabled: boolean;
  moderator: boolean;
  restricted: boolean;
  publicReason: string;
  internalReason: string;
  expiresAt: string;
}

interface UserManagementProps {
  authorization: ClientAuthorization;
  searcher?: typeof searchManagedUsers;
  revealer?: typeof revealManagedUserEmail;
  historyLoader?: typeof loadUserAuditHistory;
  saver?: typeof applyManagementChanges;
}

/** Track browser connectivity for online-only management controls. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/** Convert a server ISO timestamp into a local datetime input value. */
function localDateTime(iso: string | null): string {
  if (iso === null) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** Create an editable draft from confirmed server state. */
function draftFor(user: ManagedUser): Draft {
  return {
    disabled: user.disabled,
    moderator: user.moderator,
    restricted: user.restriction !== null,
    publicReason: user.restriction?.publicReason ?? "",
    internalReason: user.restriction?.internalReason ?? "",
    expiresAt: localDateTime(user.restriction?.expiresAt ?? null),
  };
}

/** Compare complete management drafts for unsaved changes. */
function sameDraft(left: Draft, right: Draft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Render online-only, capability-gated user search and management controls. */
export default function UserManagement({
  authorization,
  searcher = searchManagedUsers,
  revealer = revealManagedUserEmail,
  historyLoader = loadUserAuditHistory,
  saver = applyManagementChanges,
}: UserManagementProps) {
  const online = useOnline();
  const [mode, setMode] = useState<SearchMode>("displayName");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ManagedUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ManagedUser>();
  const [draft, setDraft] = useState<Draft>();
  const [revealedEmail, setRevealedEmail] = useState<string | null>();
  const [revealing, setRevealing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionReason, setActionReason] = useState("");
  const [history, setHistory] = useState<AuditHistoryData>();
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [message, setMessage] = useState<{ severity: "error" | "success"; text: string }>();
  const revealRequest = useRef(0);
  const auditRequest = useRef(0);

  const confirmedDraft = useMemo(
    () => (selected === undefined ? undefined : draftFor(selected)),
    [selected],
  );
  const dirty =
    draft !== undefined && confirmedDraft !== undefined && !sameDraft(draft, confirmedDraft);
  const validRestriction = draft?.restricted !== true || draft.publicReason.trim().length > 0;

  /** Load history for the selected user while discarding stale responses. */
  async function loadHistory(targetUid: string): Promise<void> {
    const request = ++auditRequest.current;
    setHistoryLoading(true);
    setHistoryLoadingMore(false);
    try {
      const loaded = await historyLoader(targetUid);
      if (auditRequest.current === request) setHistory(loaded);
    } catch {
      if (auditRequest.current === request) setHistory(undefined);
    } finally {
      if (auditRequest.current === request) setHistoryLoading(false);
    }
  }

  /** Append one bounded page of older history for the current user. */
  async function loadMoreHistory(): Promise<void> {
    if (selected === undefined || history?.nextBeforeSequence === undefined) return;
    const request = ++auditRequest.current;
    setHistoryLoadingMore(true);
    setMessage(undefined);
    try {
      const loaded = await historyLoader(selected.uid, history.nextBeforeSequence);
      if (auditRequest.current !== request) return;
      setHistory((current) => {
        if (current === undefined) return loaded;
        const identities = new Map(current.identities.map((value) => [value.uid, value]));
        for (const value of loaded.identities) identities.set(value.uid, value);
        return {
          events: [...current.events, ...loaded.events],
          identities: [...identities.values()],
          version: loaded.version,
          ...(loaded.nextBeforeSequence === undefined
            ? {}
            : { nextBeforeSequence: loaded.nextBeforeSequence }),
        };
      });
    } catch {
      if (auditRequest.current === request) {
        setMessage({
          severity: "error",
          text: "Older user history failed to load. Confirm connectivity and retry.",
        });
      }
    } finally {
      if (auditRequest.current === request) setHistoryLoadingMore(false);
    }
  }

  /** Select a result and reset transient, user-specific state. */
  function choose(user: ManagedUser): void {
    revealRequest.current += 1;
    setSelected(user);
    setDraft(draftFor(user));
    setActionReason("");
    setHistory(undefined);
    setHistoryLoadingMore(false);
    setRevealedEmail(undefined);
    setRevealing(false);
    setMessage(undefined);
    void loadHistory(user.uid);
  }

  /** Run an explicit bounded user search and replace the current results. */
  async function search(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!online || query.trim().length === 0) return;
    revealRequest.current += 1;
    auditRequest.current += 1;
    setSearching(true);
    setMessage(undefined);
    setSelected(undefined);
    setDraft(undefined);
    setRevealedEmail(undefined);
    setRevealing(false);
    setHistory(undefined);
    setHistoryLoading(false);
    setHistoryLoadingMore(false);
    try {
      setResults(await searcher(mode, query.trim()));
    } catch {
      setResults([]);
      setMessage({
        severity: "error",
        text: "User search failed. Confirm connectivity and retry.",
      });
    } finally {
      setSearching(false);
    }
  }

  /** Reveal the selected email only in component memory. */
  async function reveal(): Promise<void> {
    if (!online || selected === undefined) return;
    const currentRequest = ++revealRequest.current;
    const selectedUid = selected.uid;
    setRevealing(true);
    setMessage(undefined);
    try {
      const email = await revealer(selectedUid);
      if (revealRequest.current === currentRequest) setRevealedEmail(email);
    } catch {
      if (revealRequest.current === currentRequest) {
        setRevealedEmail(undefined);
        setMessage({ severity: "error", text: "The email could not be revealed." });
      }
    } finally {
      if (revealRequest.current === currentRequest) setRevealing(false);
    }
  }

  /** Persist staged changes and reload confirmed server state after failures. */
  async function save(): Promise<void> {
    if (!online || selected === undefined || draft === undefined || confirmedDraft === undefined) {
      return;
    }
    const changes: ManagementChanges = {
      targetUid: selected.uid,
      expectedVersion: selected.auditVersion,
      reason: actionReason.trim(),
    };
    if (authorization.operator && draft.disabled !== confirmedDraft.disabled) {
      changes.disabled = draft.disabled;
    }
    if (authorization.operator && draft.moderator !== confirmedDraft.moderator) {
      changes.moderator = draft.moderator;
    }
    if (
      draft.restricted !== confirmedDraft.restricted ||
      draft.publicReason !== confirmedDraft.publicReason ||
      draft.internalReason !== confirmedDraft.internalReason ||
      draft.expiresAt !== confirmedDraft.expiresAt
    ) {
      changes.restriction = draft.restricted
        ? {
            publicReason: draft.publicReason.trim(),
            ...(draft.internalReason.trim().length === 0
              ? {}
              : { internalReason: draft.internalReason.trim() }),
            ...(draft.expiresAt.length === 0
              ? {}
              : { expiresAt: new Date(draft.expiresAt).toISOString() }),
          }
        : null;
    }

    setSaving(true);
    setMessage(undefined);
    try {
      const confirmed = await saver(changes);
      setSelected(confirmed);
      setDraft(draftFor(confirmed));
      setActionReason("");
      void loadHistory(confirmed.uid);
      setResults((current) =>
        current.map((candidate) => (candidate.uid === confirmed.uid ? confirmed : candidate)),
      );
      setMessage({ severity: "success", text: "User changes were applied." });
    } catch {
      setRevealedEmail(undefined);
      try {
        const [reloaded] = await searcher("uid", selected.uid);
        if (reloaded !== undefined) {
          setSelected(reloaded);
          setDraft(draftFor(reloaded));
          setActionReason("");
          void loadHistory(reloaded.uid);
        } else {
          setSelected(undefined);
          setDraft(undefined);
        }
      } catch {
        setDraft(draftFor(selected));
      }
      setMessage({
        severity: "error",
        text: "Changes were not confirmed. The latest server state was reloaded where possible.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Link href="#/">← Back to browse</Link>
        <Typography variant="h4" component="h2">
          Manage users
        </Typography>
        <Typography color="text.secondary">
          Search and review a user, stage changes, then explicitly save them.
        </Typography>
      </Stack>

      {!online && (
        <Alert severity="warning">
          User management is online-only. Existing information remains visible, but search, reveal,
          and save controls are disabled.
        </Alert>
      )}
      {message !== undefined && <Alert severity={message.severity}>{message.text}</Alert>}

      <Stack
        component="form"
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        onSubmit={(event) => void search(event)}
      >
        <FormControl sx={{ minWidth: 170 }}>
          <InputLabel id="user-search-mode-label">Search by</InputLabel>
          <Select<SearchMode>
            labelId="user-search-mode-label"
            label="Search by"
            value={mode}
            disabled={!online || searching}
            onChange={(event) => setMode(event.target.value)}
          >
            <MenuItem value="displayName">Display name</MenuItem>
            <MenuItem value="email">Exact email</MenuItem>
            <MenuItem value="uid">Exact UID</MenuItem>
          </Select>
        </FormControl>
        <TextField
          label="User search"
          value={query}
          disabled={!online || searching}
          onChange={(event) => setQuery(event.target.value)}
          fullWidth
        />
        <Button
          type="submit"
          variant="contained"
          disabled={!online || searching || query.trim().length === 0}
        >
          {searching ? "Searching…" : "Search"}
        </Button>
      </Stack>

      {searching ? (
        <CircularProgress size={24} aria-label="Searching users" />
      ) : results.length === 0 ? (
        <Typography color="text.secondary">No management search results.</Typography>
      ) : (
        <List aria-label="User search results" disablePadding>
          {results.map((result) => (
            <ListItemButton
              key={result.uid}
              selected={selected?.uid === result.uid}
              onClick={() => choose(result)}
            >
              <ListItemText
                primary={result.displayName ?? result.obfuscatedEmail ?? result.uid}
                secondary={`${result.obfuscatedEmail ?? "No email"} · ${result.uid}`}
              />
            </ListItemButton>
          ))}
        </List>
      )}

      {selected !== undefined && draft !== undefined && (
        <Stack component="section" spacing={2} aria-labelledby="managed-user-heading">
          <Typography id="managed-user-heading" variant="h5" component="h3">
            {selected.displayName ?? selected.obfuscatedEmail ?? selected.uid}
          </Typography>
          <Typography>UID: {selected.uid}</Typography>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ alignItems: "flex-start" }}
          >
            <Typography>
              Email: {revealedEmail ?? selected.obfuscatedEmail ?? "Unavailable"}
            </Typography>
            {selected.canManage && revealedEmail === undefined && (
              <Button size="small" disabled={!online || revealing} onClick={() => void reveal()}>
                {revealing ? "Revealing…" : "Reveal full email"}
              </Button>
            )}
          </Stack>

          {selected.canManage && (
            <>
              {authorization.operator && (
                <>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={draft.disabled}
                        disabled={saving}
                        onChange={(_event, checked) => setDraft({ ...draft, disabled: checked })}
                      />
                    }
                    label="Account disabled"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={draft.moderator}
                        disabled={saving}
                        onChange={(_event, checked) => setDraft({ ...draft, moderator: checked })}
                      />
                    }
                    label="Moderator"
                  />
                </>
              )}
              {selected.restriction !== null && (
                <Typography variant="body2" color="text.secondary">
                  Originally restricted by {selected.restriction.originallyRestrictedBy} at{" "}
                  {new Date(selected.restriction.originallyRestrictedAt).toLocaleString()}; last
                  updated by {selected.restriction.restrictionLastUpdatedBy} at{" "}
                  {new Date(selected.restriction.restrictionLastUpdatedAt).toLocaleString()}.
                </Typography>
              )}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={draft.restricted}
                    disabled={saving}
                    onChange={(_event, checked) => setDraft({ ...draft, restricted: checked })}
                  />
                }
                label="Restrict community contributions"
              />
              {draft.restricted && (
                <Stack spacing={2}>
                  <TextField
                    label="User-visible reason"
                    value={draft.publicReason}
                    required
                    disabled={saving}
                    slotProps={{ htmlInput: { maxLength: 500 } }}
                    onChange={(event) => setDraft({ ...draft, publicReason: event.target.value })}
                  />
                  <TextField
                    label="Internal reason"
                    value={draft.internalReason}
                    multiline
                    disabled={saving}
                    slotProps={{ htmlInput: { maxLength: 2000 } }}
                    onChange={(event) => setDraft({ ...draft, internalReason: event.target.value })}
                  />
                  <TextField
                    label="Expires at"
                    type="datetime-local"
                    value={draft.expiresAt}
                    disabled={saving}
                    slotProps={{ inputLabel: { shrink: true } }}
                    onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })}
                  />
                </Stack>
              )}

              <TextField
                label="Action reason"
                value={actionReason}
                required
                multiline
                disabled={saving || !dirty}
                slotProps={{ htmlInput: { maxLength: 2000 } }}
                onChange={(event) => setActionReason(event.target.value)}
              />

              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  disabled={
                    !online ||
                    saving ||
                    !dirty ||
                    !validRestriction ||
                    actionReason.trim().length === 0
                  }
                  onClick={() => void save()}
                >
                  {saving ? "Saving…" : "Save changes"}
                </Button>
                <Button
                  disabled={saving || !dirty}
                  onClick={() => {
                    if (confirmedDraft !== undefined) setDraft(confirmedDraft);
                    setActionReason("");
                  }}
                >
                  Reset
                </Button>
              </Stack>
            </>
          )}

          {historyLoading ? (
            <CircularProgress size={24} aria-label="Loading user change history" />
          ) : history === undefined ? (
            <Alert severity="info">User change history is unavailable.</Alert>
          ) : (
            <AuditHistory
              history={history}
              loadingMore={historyLoadingMore}
              onLoadMore={() => void loadMoreHistory()}
            />
          )}
        </Stack>
      )}
    </Stack>
  );
}
