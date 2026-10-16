// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

/* oxlint-disable react/no-array-index-key -- Audit entries have no client-visible stable IDs. */

import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Pagination from "@mui/material/Pagination";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { manageUsersRoute } from "../routes";
import { ConstrainedMarkdown } from "./markdown";

interface QueueItem {
  id: string;
  authorId: string;
  sodaOfferingId: string;
  latestVersion: number;
  cycle: number;
  queueVersion: number;
  categories?: string[];
  revisedSinceReport?: boolean;
  current: {
    markdown: string | null;
    protectedContent?: boolean;
    sodaBrand?: string;
    sodaName?: string;
  };
  history: {
    versions: Array<{
      version?: number;
      supersedesVersion?: number | null;
      review?: { markdown?: string };
    }>;
    reports: Array<{ reporterId?: string; category?: string; explanation?: string }>;
    decisions: Array<{
      moderatorId?: string;
      decision?: string;
      explanation?: string;
      reviewVersion?: number;
    }>;
  };
}

type QueueKind = "security" | "reported" | "revised";
interface QueueCursor {
  pendingSinceMillis: number;
  id: string;
}
interface QueuePage {
  items: QueueItem[];
  next?: QueueCursor;
}
type QueueLoader = (
  kind: QueueKind,
  cursor: QueueCursor | undefined,
  revealSecurity: boolean,
) => Promise<QueuePage>;

async function loadQueue(
  kind: QueueKind,
  cursor: QueueCursor | undefined,
  revealSecurity: boolean,
) {
  const callable = httpsCallable<
    { kind: QueueKind; cursor?: QueueCursor; revealSecurity?: boolean },
    QueuePage
  >(functions, "loadReviewModerationQueue");
  return (
    await callable({
      kind,
      ...(cursor === undefined ? {} : { cursor }),
      ...(revealSecurity ? { revealSecurity: true } : {}),
    })
  ).data;
}

async function decideReview(input: {
  authorId: string;
  sodaOfferingId: string;
  expectedVersion: number;
  expectedCycle: number;
  expectedQueueVersion: number;
  decision: "allow" | "hide";
  explanation?: string;
}) {
  const callable = httpsCallable<typeof input, void>(functions, "moderateReview");
  await callable(input);
}

export function ModerationGrid({
  kind,
  title,
  loader = loadQueue,
  decider = decideReview,
}: {
  kind: QueueKind;
  title: string;
  loader?: QueueLoader;
  decider?: typeof decideReview;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [page, setPage] = useState(0);
  const [cursors, setCursors] = useState<Array<QueueCursor | undefined>>([undefined]);
  const [next, setNext] = useState<QueueCursor>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revealSecurity, setRevealSecurity] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const latestRequest = useRef(0);
  const cursor = cursors[page];
  const viewIdentity = `${kind}:${revealSecurity}:${cursor?.pendingSinceMillis ?? "start"}:${
    cursor?.id ?? ""
  }`;
  const activeView = useRef(viewIdentity);
  useEffect(() => {
    activeView.current = viewIdentity;
  }, [viewIdentity]);
  const reload = useCallback(async () => {
    const request = ++latestRequest.current;
    setLoading(true);
    try {
      const result = await loader(kind, cursor, revealSecurity);
      if (request !== latestRequest.current || activeView.current !== viewIdentity) return;
      setItems(result.items);
      setNext(result.next);
      setError(false);
    } catch {
      if (request === latestRequest.current && activeView.current === viewIdentity) setError(true);
    } finally {
      if (request === latestRequest.current && activeView.current === viewIdentity) {
        setLoading(false);
      }
    }
  }, [cursor, kind, loader, revealSecurity, viewIdentity]);

  useEffect(() => {
    // Loading the current external queue is the purpose of this synchronization effect.
    // oxlint-disable-next-line react/set-state-in-effect
    void reload();
  }, [reload]);

  const decide = async (item: QueueItem, decision: "allow" | "hide") => {
    const decidingView = viewIdentity;
    setLoading(true);
    setError(false);
    try {
      const explanation = (reasons[item.id] ?? "").trim();
      await decider({
        authorId: item.authorId,
        sodaOfferingId: item.sodaOfferingId,
        expectedVersion: item.latestVersion,
        expectedCycle: item.cycle,
        expectedQueueVersion: item.queueVersion,
        decision,
        ...(explanation.length === 0 ? {} : { explanation }),
      });
      if (activeView.current !== decidingView) return;
      setReasons((value) => ({ ...value, [item.id]: "" }));
      if (page === 0) await reload();
      else {
        setCursors([undefined]);
        setPage(0);
      }
    } catch {
      if (activeView.current === decidingView) {
        setError(true);
        setLoading(false);
      }
    }
  };

  if (!loading && !error && items.length === 0 && page === 0) return null;
  return (
    <Stack component="section" spacing={2} aria-labelledby={`${kind}-heading`}>
      <Typography id={`${kind}-heading`} variant="h5" component="h3">
        {title}
      </Typography>
      {kind === "security" && !revealSecurity && (
        <Alert severity="error">
          Content is protected by default because this cycle includes a Security/Safety report.
          <Button
            color="inherit"
            onClick={() => {
              setLoading(true);
              setCursors([undefined]);
              setPage(0);
              setRevealSecurity(true);
            }}
          >
            Deliberately inspect content
          </Button>
        </Alert>
      )}
      {loading && <Typography>Loading moderation queue…</Typography>}
      {error && <Alert severity="error">The moderation queue could not be loaded.</Alert>}
      {items.map((item) => (
        <Box key={item.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2 }}>
          <Stack spacing={1.5}>
            <Typography variant="subtitle1">
              {item.current.sodaBrand ?? "Soda"} {item.current.sodaName ?? item.sodaOfferingId} ·
              version {item.latestVersion}
            </Typography>
            <Typography variant="body2">
              Author: {item.authorId} · Categories:{" "}
              {item.categories?.join(", ") || "proactive hide"}
              {item.revisedSinceReport ? " · Revised since report" : ""}
            </Typography>
            {item.current.protectedContent ? (
              <Box component="pre" sx={{ whiteSpace: "pre-wrap" }}>
                [content protected until explicitly revealed]
              </Box>
            ) : item.current.markdown === null ? (
              <Typography color="text.secondary">No current text.</Typography>
            ) : (
              <Box sx={{ border: 1, borderColor: "divider", p: 1.5 }}>
                <ConstrainedMarkdown markdown={item.current.markdown} headingBaseLevel={5} />
              </Box>
            )}
            <Typography variant="body2">
              Audit context: {item.history.versions.length} version(s),{" "}
              {item.history.reports.length} report(s), {item.history.decisions.length} prior
              decision(s).
            </Typography>
            {item.history.versions.map((version, index) => (
              <Box
                key={`${item.id}-version-${index}`}
                sx={{ borderLeft: 2, borderColor: "divider", pl: 1 }}
              >
                <Typography variant="caption">
                  Version {version.version ?? index + 1}
                  {version.supersedesVersion
                    ? ` superseded version ${version.supersedesVersion}`
                    : ""}
                </Typography>
                {version.review?.markdown && !item.current.protectedContent && (
                  <Box component="pre" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {version.review.markdown}
                  </Box>
                )}
              </Box>
            ))}
            {item.history.reports.map((report, index) => (
              <Typography key={`${item.id}-report-${index}`} variant="caption">
                Report {index + 1}: {report.category ?? "unknown"}
                {report.explanation ? ` — ${report.explanation}` : ""}
                {report.reporterId ? ` (reporter ${report.reporterId})` : ""}
              </Typography>
            ))}
            {item.history.decisions.map((decision, index) => (
              <Typography key={`${item.id}-decision-${index}`} variant="caption">
                Decision on version {decision.reviewVersion ?? "?"}:{" "}
                {decision.decision ?? "unknown"}
                {decision.explanation ? ` — ${decision.explanation}` : ""}
                {decision.moderatorId ? ` (moderator ${decision.moderatorId})` : ""}
              </Typography>
            ))}
            <TextField
              label="Moderator explanation / hide reason"
              multiline
              minRows={2}
              value={reasons[item.id] ?? ""}
              slotProps={{ htmlInput: { maxLength: 1_000 } }}
              onChange={(event) =>
                setReasons((value) => ({ ...value, [item.id]: event.target.value }))
              }
            />
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
              <Button
                variant="contained"
                disabled={loading || item.current.protectedContent === true}
                onClick={() => void decide(item, "allow")}
              >
                Allow latest version
              </Button>
              <Button
                color="warning"
                disabled={loading || (reasons[item.id] ?? "").trim().length === 0}
                onClick={() => void decide(item, "hide")}
              >
                Hide latest version
              </Button>
              <Button href={manageUsersRoute}>Open restriction workflow</Button>
            </Stack>
          </Stack>
        </Box>
      ))}
      {(page > 0 || next !== undefined) && (
        <Pagination
          page={page + 1}
          count={page + 1 + (next === undefined ? 0 : 1)}
          onChange={(_event, value) => {
            const requestedPage = value - 1;
            if (requestedPage > page) {
              if (next === undefined) return;
              setCursors((existing) => [...existing.slice(0, page + 1), next]);
            }
            setLoading(true);
            setPage(requestedPage);
          }}
        />
      )}
    </Stack>
  );
}

/** Responsive, priority-separated review moderation queues. */
export default function ModerationPage() {
  if (!navigator.onLine) {
    return <Alert severity="warning">Review moderation requires a connection.</Alert>;
  }
  return (
    <Stack spacing={4}>
      <Typography variant="h4" component="h2">
        Review moderation
      </Typography>
      <ModerationGrid kind="security" title="Security/Safety" />
      <ModerationGrid kind="reported" title="Reported" />
      <ModerationGrid kind="revised" title="Revised" />
    </Stack>
  );
}
