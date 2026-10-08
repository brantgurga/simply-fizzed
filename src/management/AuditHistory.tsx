// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Details from "@mui/material/AccordionDetails";
import Summary from "@mui/material/AccordionSummary";
import Accordion from "@mui/material/Accordion";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import type { AuditEvent, AuditHistory as AuditHistoryData, AuditIdentity, AuditJson } from "./api";

interface AuditHistoryProps {
  history: AuditHistoryData;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

const labels: Record<string, string> = {
  "account.created": "Account created",
  "profile.updated": "Profile updated",
  "credential.changed": "Credential changed",
  "user.restricted": "Restricted",
  "user.restriction-updated": "Restriction updated",
  "user.unrestricted": "Unrestricted",
  "user.disabled": "Disabled",
  "user.enabled": "Enabled",
  "user.moderator-promoted": "Promoted to Moderator",
  "user.moderator-demoted": "Removed from Moderator",
  "user.management-updated": "User management updated",
};

/** Safely tokenize JSON text; React escapes every token before rendering it. */
function highlightedJson(value: AuditJson): ReactNode[] {
  const json = JSON.stringify(value, null, 2) ?? "null";
  const token =
    /("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b)/g;
  const output: ReactNode[] = [];
  let cursor = 0;
  for (const match of json.matchAll(token)) {
    const index = match.index;
    if (index > cursor) output.push(json.slice(cursor, index));
    const text = match[0];
    const color = text.startsWith('"')
      ? json.slice(index + text.length).match(/^\s*:/) === null
        ? "success.main"
        : "primary.main"
      : text === "true" || text === "false" || text === "null"
        ? "secondary.main"
        : "warning.dark";
    output.push(
      <Typography key={`${index}-${text}`} component="span" sx={{ color, fontFamily: "inherit" }}>
        {text}
      </Typography>,
    );
    cursor = index + text.length;
  }
  if (cursor < json.length) output.push(json.slice(cursor));
  return output;
}

function identity(identityMap: Map<string, AuditIdentity>, uid: string): ReactNode {
  const value = identityMap.get(uid);
  if (value?.unavailable === true || value === undefined) {
    return (
      <Chip color="warning" variant="outlined" label={`Deleted or unavailable user · ${uid}`} />
    );
  }
  return `${value.displayName ?? value.email ?? uid} · ${uid}`;
}

function restriction(snapshot: AuditJson): Record<string, AuditJson> | undefined {
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot))
    return undefined;
  const value = snapshot["restriction"];
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}

function AuditEventEntry({
  event,
  identityMap,
  discontinuity,
}: {
  event: AuditEvent;
  identityMap: Map<string, AuditIdentity>;
  discontinuity: boolean;
}) {
  const details = restriction(event.after) ?? restriction(event.before);
  return (
    <Stack
      component="article"
      spacing={1}
      sx={{ borderBlockEnd: 1, borderColor: "divider", pb: 2 }}
    >
      <Typography variant="h6">{labels[event.type] ?? event.type}</Typography>
      <Typography variant="body2">{new Date(event.occurredAt).toLocaleString()}</Typography>
      <Typography component="div">
        Actor:{" "}
        {event.actor.kind === "system" ? (
          <Chip label="Firebase Auth system" />
        ) : (
          identity(identityMap, event.actor.uid)
        )}
      </Typography>
      <Typography component="div">Subject: {identity(identityMap, event.subjectUid)}</Typography>
      {event.reason !== undefined && <Typography>Action reason: {event.reason}</Typography>}
      {typeof details?.["internalReason"] === "string" && (
        <Typography>Internal restriction reason: {details["internalReason"]}</Typography>
      )}
      {typeof details?.["publicReason"] === "string" && (
        <Typography>User-visible restriction reason: {details["publicReason"]}</Typography>
      )}
      {event.changedFields !== undefined && event.changedFields.length > 0 && (
        <Typography>Changed: {event.changedFields.join(", ")}</Typography>
      )}
      {discontinuity && (
        <Alert severity="warning">
          An unexplained break exists between this event and the preceding observed history.
        </Alert>
      )}
      <Accordion disableGutters>
        <Summary>Inspect before and after snapshots</Summary>
        <Details>
          <Typography variant="subtitle2">Before</Typography>
          <Typography component="pre" sx={{ overflowX: "auto", fontFamily: "monospace" }}>
            {highlightedJson(event.before)}
          </Typography>
          <Typography variant="subtitle2">After</Typography>
          <Typography component="pre" sx={{ overflowX: "auto", fontFamily: "monospace" }}>
            {highlightedJson(event.after)}
          </Typography>
        </Details>
      </Accordion>
    </Stack>
  );
}

/** Render immutable user history newest-first with expandable audit evidence. */
export default function AuditHistory({
  history,
  loadingMore = false,
  onLoadMore,
}: AuditHistoryProps) {
  const identityMap = new Map(history.identities.map((value) => [value.uid, value]));
  return (
    <Stack component="section" spacing={2} aria-labelledby="audit-history-heading">
      <Typography id="audit-history-heading" variant="h5" component="h3">
        User change history
      </Typography>
      {history.events.length === 0 ? (
        <Typography color="text.secondary">No post-rollout user changes are recorded.</Typography>
      ) : (
        history.events.map((event, index) => {
          const older = history.events[index + 1];
          const discontinuity =
            older !== undefined && JSON.stringify(event.before) !== JSON.stringify(older.after);
          return (
            <AuditEventEntry
              key={event.id}
              event={event}
              identityMap={identityMap}
              discontinuity={discontinuity}
            />
          );
        })
      )}
      {history.nextBeforeSequence !== undefined && onLoadMore !== undefined && (
        <Button disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? "Loading older history…" : "Load older history"}
        </Button>
      )}
    </Stack>
  );
}
