// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Details from "@mui/material/AccordionDetails";
import Summary from "@mui/material/AccordionSummary";
import Accordion from "@mui/material/Accordion";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { Fragment, type ReactNode } from "react";
import { allExpanded, JsonView } from "react-json-view-lite";
import type { AuditEvent, AuditHistory as AuditHistoryData, AuditIdentity, AuditJson } from "./api";
import styles from "./AuditJsonView.module.css";

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

const jsonStyles = {
  container: styles["container"]!,
  basicChildStyle: styles["child"]!,
  childFieldsContainer: styles["childFields"]!,
  collapseIcon: `${styles["icon"]!} ${styles["collapseIcon"]!}`,
  expandIcon: `${styles["icon"]!} ${styles["expandIcon"]!}`,
  collapsedContent: styles["collapsedContent"]!,
  label: styles["label"]!,
  clickableLabel: `${styles["label"]!} ${styles["clickableLabel"]!}`,
  nullValue: styles["value"]!,
  undefinedValue: styles["value"]!,
  numberValue: styles["value"]!,
  stringValue: styles["value"]!,
  booleanValue: styles["value"]!,
  otherValue: styles["value"]!,
  punctuation: styles["punctuation"]!,
  quotesForFieldNames: true,
  stringifyStringValues: true,
  ariaLables: { collapseJson: "Collapse JSON", expandJson: "Expand JSON" },
};

/** Render immutable snapshots as an accessible, read-only JSON tree. */
function AuditJsonView({ label, value }: { label: string; value: AuditJson }) {
  const expandable = typeof value === "object" && value !== null;
  return (
    <Box
      sx={{
        bgcolor: "action.hover",
        borderRadius: 1,
        overflowX: "auto",
        p: 1.5,
        [`& .${styles["label"]!}`]: { color: "text.primary", fontWeight: 600 },
        [`& .${styles["value"]!}`]: { color: "secondary.main" },
        [`& .${styles["punctuation"]!}`]: { color: "text.secondary" },
      }}
    >
      {expandable ? (
        <JsonView
          aria-label={label}
          data={value}
          shouldExpandNode={allExpanded}
          style={jsonStyles}
        />
      ) : (
        <Box component="pre" aria-label={label} sx={{ fontFamily: "monospace", m: 0 }}>
          {JSON.stringify(value, null, 2) ?? "null"}
        </Box>
      )}
    </Box>
  );
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
  const internalReason = details?.["internalReason"];
  const publicReason = details?.["publicReason"];
  return (
    <Fragment>
      <TableRow>
        <TableCell component="th" scope="row">
          {labels[event.type] ?? event.type}
        </TableCell>
        <TableCell>{new Date(event.occurredAt).toLocaleString()}</TableCell>
        <TableCell>
          {event.actor.kind === "system" ? (
            <Chip size="small" label="Firebase Auth system" />
          ) : (
            identity(identityMap, event.actor.uid)
          )}
        </TableCell>
        <TableCell>{identity(identityMap, event.subjectUid)}</TableCell>
        <TableCell>{event.reason ?? "—"}</TableCell>
        <TableCell>{typeof internalReason === "string" ? internalReason : "—"}</TableCell>
        <TableCell>{typeof publicReason === "string" ? publicReason : "—"}</TableCell>
        <TableCell>{event.changedFields?.join(", ") || "—"}</TableCell>
        <TableCell sx={{ minWidth: 320 }}>
          <Accordion disableGutters>
            <Summary>Inspect snapshots</Summary>
            <Details>
              <Typography variant="subtitle2">Before</Typography>
              <AuditJsonView label="Before audit snapshot" value={event.before} />
              <Typography variant="subtitle2">After</Typography>
              <AuditJsonView label="After audit snapshot" value={event.after} />
            </Details>
          </Accordion>
        </TableCell>
      </TableRow>
      {discontinuity && (
        <TableRow>
          <TableCell colSpan={9}>
            <Alert severity="warning">
              An unexplained break exists between this event and the preceding observed history.
            </Alert>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
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
        <TableContainer>
          <Table size="small" aria-label="User change history">
            <TableHead>
              <TableRow>
                <TableCell>Event</TableCell>
                <TableCell>Occurred</TableCell>
                <TableCell>Actor</TableCell>
                <TableCell>Subject</TableCell>
                <TableCell>Action reason</TableCell>
                <TableCell>Internal restriction reason</TableCell>
                <TableCell>User-visible restriction reason</TableCell>
                <TableCell>Changed fields</TableCell>
                <TableCell>Evidence</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.events.map((event, index) => {
                const older = history.events[index + 1];
                const discontinuity =
                  older !== undefined &&
                  JSON.stringify(event.before) !== JSON.stringify(older.after);
                return (
                  <AuditEventEntry
                    key={event.id}
                    event={event}
                    identityMap={identityMap}
                    discontinuity={discontinuity}
                  />
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {history.nextBeforeSequence !== undefined && onLoadMore !== undefined && (
        <Button disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? "Loading older history…" : "Load older history"}
        </Button>
      )}
    </Stack>
  );
}
