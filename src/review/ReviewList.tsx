// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { useEffect, useRef, useState } from "react";
import SportsBarIcon from "@mui/icons-material/SportsBar";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Pagination from "@mui/material/Pagination";
import Rating from "@mui/material/Rating";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { profileRoute, sodaRoute } from "../routes";
import { ConstrainedMarkdown } from "./markdown";
import {
  moderateReview,
  REPORT_CATEGORIES,
  reportReview,
  type PublishedReviewRecord,
  type ReportCategory,
  type ReviewPage,
} from "./reviews";

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  "off-topic-spam": "Off-topic/Spam",
  copyright: "Copyright",
  offensive: "Offensive",
  "security-safety": "Security/Safety",
  other: "Other",
};

function ReportDialog({
  review,
  open,
  onClose,
}: {
  review: PublishedReviewRecord;
  open: boolean;
  onClose: (submitted: boolean) => void;
}) {
  const [category, setCategory] = useState<ReportCategory>("off-topic-spam");
  const [explanation, setExplanation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const explanationRequired = category === "other";
  const submit = async () => {
    if (!navigator.onLine || (explanationRequired && explanation.trim().length === 0)) return;
    setSaving(true);
    setError(false);
    try {
      await reportReview({
        authorId: review.authorId,
        sodaOfferingId: review.sodaOfferingId,
        version: review.version,
        category,
        ...(explanation.trim().length === 0 ? {} : { explanation: explanation.trim() }),
      });
      onClose(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onClose={() => onClose(false)} fullWidth maxWidth="sm">
      <DialogTitle>Report this review</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography>
            Reports temporarily remove a review from public view while a moderator evaluates it.
          </Typography>
          <FormControl required fullWidth>
            <InputLabel id="report-category-label">Category</InputLabel>
            <Select<ReportCategory>
              labelId="report-category-label"
              label="Category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {REPORT_CATEGORIES.map((value) => (
                <MenuItem key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Explanation"
            required={explanationRequired}
            multiline
            minRows={3}
            value={explanation}
            slotProps={{ htmlInput: { maxLength: 1_000 } }}
            onChange={(event) => setExplanation(event.target.value)}
            helperText={
              explanationRequired
                ? "An explanation is required for Other."
                : "Optional; visible only to moderators."
            }
          />
          {!navigator.onLine && <Alert severity="warning">Reporting requires a connection.</Alert>}
          {error && <Alert severity="error">The report could not be submitted.</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)}>Cancel</Button>
        <Button
          variant="contained"
          disabled={
            saving || !navigator.onLine || (explanationRequired && explanation.trim().length === 0)
          }
          onClick={() => void submit()}
        >
          Submit report
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** A bounded public review with Schema.org Review semantics. */
export function ReviewCard({
  review,
  viewerId,
  onSignIn,
  showSoda = false,
  canModerate = false,
}: {
  review: PublishedReviewRecord;
  viewerId?: string | undefined;
  onSignIn?: (() => void) | undefined;
  showSoda?: boolean | undefined;
  canModerate?: boolean | undefined;
}) {
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [moderationError, setModerationError] = useState(false);
  const proactivelyHide = async () => {
    const reason = globalThis.prompt("Author-visible reason for proactively hiding this review:");
    if (!reason?.trim()) return;
    setModerationError(false);
    try {
      await moderateReview({
        authorId: review.authorId,
        sodaOfferingId: review.sodaOfferingId,
        expectedVersion: review.version,
        expectedCycle: review.moderationCycle,
        expectedQueueVersion: null,
        decision: "hide",
        explanation: reason.trim(),
      });
      setReported(true);
    } catch {
      setModerationError(true);
    }
  };
  const rating = Math.round(review.rating);
  const sodaLabel = review.sodaUnavailable
    ? "[deleted soda]"
    : `${review.sodaBrand} ${review.sodaName}`;
  if (reported) return <Alert severity="success">The review was sent to moderation.</Alert>;
  return (
    <Box
      component="article"
      itemScope
      itemType="https://schema.org/Review"
      sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2 }}
    >
      <Stack spacing={1}>
        <Box itemProp="itemReviewed" itemScope itemType="https://schema.org/Product">
          {showSoda && !review.sodaUnavailable && (
            <Link href={sodaRoute(review.sodaOfferingId)} itemProp="url">
              <span itemProp="name">{sodaLabel}</span>
            </Link>
          )}
          {showSoda && review.sodaUnavailable && <span itemProp="name">{sodaLabel}</span>}
          {!showSoda && <meta itemProp="name" content={sodaLabel} />}
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography
            component="span"
            itemProp="author"
            itemScope
            itemType="https://schema.org/Person"
          >
            <Link href={profileRoute(review.authorId)} itemProp="url">
              <span itemProp="name">{review.authorName || "Soda fan"}</span>
            </Link>
          </Typography>
          <Box itemProp="reviewRating" itemScope itemType="https://schema.org/Rating">
            <meta itemProp="worstRating" content="1" />
            <meta itemProp="bestRating" content="5" />
            <meta itemProp="ratingValue" content={String(review.rating)} />
            <Rating
              aria-label={`${rating} mug${rating === 1 ? "" : "s"}`}
              value={rating}
              readOnly
              icon={<SportsBarIcon fontSize="inherit" />}
              emptyIcon={<SportsBarIcon fontSize="inherit" />}
            />
          </Box>
        </Stack>
        <Box itemProp="reviewBody">
          <ConstrainedMarkdown markdown={review.markdown} headingBaseLevel={4} />
        </Box>
        <Typography variant="caption" color="text.secondary">
          <time itemProp="datePublished" dateTime={review.publishedAt.toISOString()}>
            {review.publishedAt.toLocaleDateString()}
          </time>
          {review.revisedAt !== null && (
            <>
              {" "}
              · Edited{" "}
              <time itemProp="dateModified" dateTime={review.revisedAt.toISOString()}>
                {review.revisedAt.toLocaleDateString()}
              </time>
            </>
          )}
        </Typography>
        {viewerId !== review.authorId && (
          <Button
            size="small"
            sx={{ alignSelf: "flex-start" }}
            onClick={() => {
              if (viewerId === undefined) onSignIn?.();
              else setReporting(true);
            }}
          >
            Report
          </Button>
        )}
        {canModerate && (
          <Button
            color="warning"
            size="small"
            sx={{ alignSelf: "flex-start" }}
            onClick={() => void proactivelyHide()}
          >
            Proactively hide
          </Button>
        )}
        {moderationError && (
          <Alert severity="error">The review could not be hidden. Reload and try again.</Alert>
        )}
      </Stack>
      {viewerId !== undefined && viewerId !== review.authorId && (
        <ReportDialog
          review={review}
          open={reporting}
          onClose={(submitted) => {
            setReporting(false);
            setReported(submitted);
          }}
        />
      )}
    </Box>
  );
}

/** Paginated public review list; edits retain original publication ordering. */
export function PublicReviewList({
  label,
  loader,
  viewerId,
  onSignIn,
  showSoda,
  canModerate,
}: {
  label: string;
  loader: (cursor?: ReviewPage["next"]) => Promise<ReviewPage>;
  viewerId?: string | undefined;
  onSignIn?: (() => void) | undefined;
  showSoda?: boolean | undefined;
  canModerate?: boolean | undefined;
}) {
  const [pages, setPages] = useState<ReviewPage[]>([]);
  const [page, setPage] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadIdentity, setLoadIdentity] = useState({ loader });
  const activeLoader = useRef(loader);
  const latestRequest = useRef(0);
  useEffect(() => {
    activeLoader.current = loader;
  }, [loader]);
  useEffect(() => {
    let active = true;
    const request = ++latestRequest.current;
    void loader().then(
      (result) => {
        if (active && request === latestRequest.current && activeLoader.current === loader) {
          setPages([result]);
          setPage(0);
          setState("ready");
          setLoadIdentity({ loader });
        }
      },
      () => {
        if (active && request === latestRequest.current && activeLoader.current === loader) {
          setState("error");
          setLoadIdentity({ loader });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [loader]);

  const matchesRequest = loadIdentity.loader === loader;
  const visibleState = matchesRequest ? state : "loading";
  const current = matchesRequest ? pages[page] : undefined;
  const changePage = async (nextOneBased: number) => {
    const next = nextOneBased - 1;
    if (pages[next] !== undefined) {
      setPage(next);
      return;
    }
    const cursor = pages.at(-1)?.next;
    if (cursor === undefined) return;
    const requestedLoader = loader;
    const request = ++latestRequest.current;
    setState("loading");
    try {
      const loaded = await requestedLoader(cursor);
      if (request !== latestRequest.current || activeLoader.current !== requestedLoader) return;
      setPages((value) => [...value, loaded]);
      setPage(next);
      setState("ready");
    } catch {
      if (request === latestRequest.current && activeLoader.current === requestedLoader) {
        setState("error");
      }
    }
  };

  return (
    <Stack component="section" spacing={2} aria-label={label}>
      <Typography variant="h5" component="h3">
        {label}
      </Typography>
      {visibleState === "loading" && <Typography>Loading reviews…</Typography>}
      {visibleState === "error" && <Alert severity="error">Reviews could not be loaded.</Alert>}
      {visibleState === "ready" && current?.reviews.length === 0 && (
        <Typography color="text.secondary">No public reviews yet.</Typography>
      )}
      {current?.reviews.map((review) => (
        <ReviewCard
          key={review.id}
          review={review}
          viewerId={viewerId}
          onSignIn={onSignIn}
          showSoda={showSoda}
          canModerate={canModerate}
        />
      ))}
      {current !== undefined && (pages.length > 1 || current.next !== undefined) && (
        <Pagination
          page={page + 1}
          count={pages.length + (pages.at(-1)?.next === undefined ? 0 : 1)}
          onChange={(_event, value) => void changePage(value)}
        />
      )}
    </Stack>
  );
}
