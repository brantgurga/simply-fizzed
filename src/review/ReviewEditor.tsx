// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { publicContributorName, type ContributorIdentity } from "../contributor";
import { db } from "../firebase";
import { REVIEW_CONTENT_LIMIT } from "../model/firestore";
import type { SodaDocument } from "../soda/sodas";
import { ConstrainedMarkdown } from "./markdown";
import { prepareReviewMarkdown, reviewContentLength } from "./markdownFormat";
import {
  loadCurrentReview,
  saveCurrentReview,
  type CurrentReviewLoad,
  type CurrentReviewRecord,
} from "./reviews";

interface ReviewEditorProps {
  soda: SodaDocument;
  user: { uid: string } & ContributorIdentity;
  hasPointRating: boolean;
  canReview: boolean;
  loader?: (authorId: string, sodaId: string) => Promise<CurrentReviewLoad>;
  saver?: (
    author: { id: string; name: string },
    soda: SodaDocument,
    input: string,
    current?: CurrentReviewRecord,
  ) => Promise<{ markdown: string | null; version: number }>;
  synchronizedCurrent?: CurrentReviewRecord;
  onCurrentChange?: (review: CurrentReviewRecord | undefined) => void;
}

interface ReviewLoadState {
  authorId: string;
  sodaId: string;
  loader: ReviewEditorProps["loader"];
  status: "loading" | "ready" | "error";
}

const defaultLoader = (authorId: string, sodaId: string) => loadCurrentReview(db, authorId, sodaId);
const defaultSaver = (
  author: { id: string; name: string },
  soda: SodaDocument,
  input: string,
  current?: CurrentReviewRecord,
) => saveCurrentReview(db, author, soda, input, current);

/** Offline-capable constrained Markdown authoring with matching preview. */
export default function ReviewEditor({
  soda,
  user,
  hasPointRating,
  canReview,
  loader = defaultLoader,
  saver = defaultSaver,
  synchronizedCurrent,
  onCurrentChange,
}: ReviewEditorProps) {
  const [current, setCurrent] = useState<CurrentReviewRecord>();
  const [loadState, setLoadState] = useState<ReviewLoadState>({
    authorId: user.uid,
    sodaId: soda.id,
    loader,
    status: "loading",
  });
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<"saved" | "error">();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const currentReference = useRef(current);
  const draftReference = useRef(input);

  useEffect(() => {
    currentReference.current = current;
    draftReference.current = input;
  }, [current, input]);

  useEffect(() => {
    let active = true;
    void loader(user.uid, soda.id).then(
      (result) => {
        if (!active) return;
        if (result.status === "malformed") {
          setLoadState({ authorId: user.uid, sodaId: soda.id, loader, status: "error" });
          return;
        }
        const loaded = result.status === "found" ? result.value : undefined;
        setCurrent(loaded);
        setInput(loaded?.markdown ?? "");
        setEditing(loaded?.markdown !== null && loaded?.markdown !== undefined);
        setPreview(false);
        setMessage(undefined);
        setLoadState({ authorId: user.uid, sodaId: soda.id, loader, status: "ready" });
        onCurrentChange?.(loaded);
      },
      () => {
        if (active) {
          setLoadState({ authorId: user.uid, sodaId: soda.id, loader, status: "error" });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [loader, onCurrentChange, soda.id, user.uid]);

  useEffect(() => {
    if (
      synchronizedCurrent === undefined ||
      (synchronizedCurrent.version === currentReference.current?.version &&
        synchronizedCurrent.markdown === currentReference.current?.markdown)
    ) {
      return;
    }
    // Rating clears are atomic with review clears, so mirror that committed revision here.
    // oxlint-disable-next-line react/set-state-in-effect
    setCurrent(synchronizedCurrent);
    setInput(synchronizedCurrent.markdown ?? "");
    setEditing(synchronizedCurrent.markdown !== null);
    setPreview(false);
  }, [synchronizedCurrent]);

  const apply = (before: string, after = before) => {
    const element = textarea.current;
    if (element === null) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = input.slice(start, end) || "text";
    const next = `${input.slice(0, start)}${before}${selected}${after}${input.slice(end)}`;
    setInput(next);
    queueMicrotask(() => {
      element.focus();
      element.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };
  const prefixLines = (prefix: string) => {
    const element = textarea.current;
    if (element === null) return;
    const start = input.lastIndexOf("\n", Math.max(0, element.selectionStart - 1)) + 1;
    const endBreak = input.indexOf("\n", element.selectionEnd);
    const end = endBreak < 0 ? input.length : endBreak;
    const next = input
      .slice(start, end)
      .split("\n")
      .map((line, index) => `${prefix === "1. " ? `${index + 1}. ` : prefix}${line}`)
      .join("\n");
    setInput(`${input.slice(0, start)}${next}${input.slice(end)}`);
  };
  const save = async (value = input) => {
    setSaving(true);
    setMessage(undefined);
    try {
      const result = await saver(
        { id: user.uid, name: publicContributorName(user) ?? "" },
        soda,
        value,
        current,
      );
      const needsModeration =
        current?.moderationStatus === "pending" || current?.moderationStatus === "hidden";
      const optimistic: CurrentReviewRecord = {
        ...(current ?? {
          id: soda.id,
          authorId: user.uid,
          authorName: publicContributorName(user) ?? "",
          sodaOfferingId: soda.id,
          sodaName: soda.name,
          sodaBrand: soda.brand,
          sodaFlavor: soda.flavor,
          authoredAt: new Date(),
          baseModerationCycle: 0,
          baseApprovedVersion: null,
          mutationId: "local",
          contentLength: 0,
        }),
        markdown: result.markdown,
        contentLength: result.markdown === null ? 0 : reviewContentLength(result.markdown),
        version: result.version,
        authoredAt: new Date(),
        moderationStatus:
          result.markdown === null
            ? needsModeration
              ? (current?.moderationStatus ?? "none")
              : "none"
            : needsModeration
              ? "pending"
              : "visible",
        approvedVersion: result.markdown === null ? null : (current?.approvedVersion ?? null),
        ...(needsModeration && result.markdown !== null
          ? { hiddenReason: null }
          : current?.hiddenReason === undefined
            ? {}
            : { hiddenReason: current.hiddenReason }),
      };
      const draftUnchanged = draftReference.current === value;
      setCurrent(optimistic);
      setInput((draft) => (draft === value ? (result.markdown ?? "") : draft));
      if (draftUnchanged) setEditing(result.markdown !== null);
      setPreview(false);
      setMessage("saved");
      onCurrentChange?.(optimistic);
    } catch {
      setMessage("error");
    } finally {
      setSaving(false);
    }
  };
  const prepared = (() => {
    try {
      return prepareReviewMarkdown(input);
    } catch {
      return undefined;
    }
  })();
  const remaining = REVIEW_CONTENT_LIMIT - reviewContentLength(input);
  const status = current?.moderationStatus;
  const matchesRequest =
    loadState.authorId === user.uid && loadState.sodaId === soda.id && loadState.loader === loader;

  if (!matchesRequest || loadState.status === "loading") {
    return <Typography color="text.secondary">Loading your review…</Typography>;
  }
  if (loadState.status === "error") {
    return <Alert severity="error">Your review could not be loaded.</Alert>;
  }
  return (
    <Stack component="section" spacing={1.5} aria-labelledby="your-review-heading">
      <Typography id="your-review-heading" variant="h6" component="h3">
        Your review
      </Typography>
      {status === "pending" && (
        <Alert severity="info">
          This review is temporarily unavailable while awaiting moderator review.
        </Alert>
      )}
      {status === "hidden" && (
        <Alert severity="warning">
          A moderator hid this review. Reason:{" "}
          {current?.hiddenReason || "No public reason was provided."}
        </Alert>
      )}
      {!hasPointRating && current?.markdown == null && (
        <Typography color="text.secondary">Add a point rating before writing a review.</Typography>
      )}
      {!canReview && current?.markdown !== null && current?.markdown !== undefined && (
        <Alert severity="warning">
          Review editing is unavailable while contribution access is restricted.
        </Alert>
      )}
      {!editing && hasPointRating && canReview && (
        <Button
          variant="outlined"
          sx={{ alignSelf: "flex-start" }}
          onClick={() => setEditing(true)}
        >
          Write a review
        </Button>
      )}
      {editing && (
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            Share a meaningful opinion about this soda. Paragraphs, headings, lists, bold, and
            emphasis are available. Links, images, HTML, code, and embeds are not supported. Limit:{" "}
            {REVIEW_CONTENT_LIMIT.toLocaleString()} characters.
          </Typography>
          <ButtonGroup size="small" aria-label="Review formatting">
            <Button onClick={() => apply("**")}>Bold</Button>
            <Button onClick={() => apply("*")}>Emphasis</Button>
            <Button onClick={() => prefixLines("## ")}>Heading</Button>
            <Button onClick={() => prefixLines("- ")}>Bulleted list</Button>
            <Button onClick={() => prefixLines("1. ")}>Numbered list</Button>
          </ButtonGroup>
          {!preview ? (
            <TextField
              label="Review"
              multiline
              minRows={7}
              fullWidth
              value={input}
              inputRef={textarea}
              onChange={(event) => setInput(event.target.value)}
              onPaste={(event) => {
                event.preventDefault();
                const plain = event.clipboardData.getData("text/plain");
                const element = event.currentTarget.querySelector("textarea");
                if (element === null) return;
                setInput(
                  `${input.slice(0, element.selectionStart)}${plain}${input.slice(element.selectionEnd)}`,
                );
              }}
              error={remaining < 0 || prepared === undefined}
              helperText={`${remaining.toLocaleString()} characters remaining`}
              slotProps={{
                formHelperText: { role: "status", "aria-live": "polite" },
              }}
            />
          ) : (
            <Stack sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2 }}>
              <Typography variant="overline">Preview</Typography>
              {prepared?.markdown == null ? (
                <Typography color="text.secondary">No review content.</Typography>
              ) : (
                <ConstrainedMarkdown markdown={prepared.markdown} headingBaseLevel={4} />
              )}
            </Stack>
          )}
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            <Button onClick={() => setPreview((value) => !value)}>
              {preview ? "Edit" : "Preview"}
            </Button>
            <Button
              variant="contained"
              disabled={
                saving ||
                !canReview ||
                !hasPointRating ||
                prepared === undefined ||
                prepared.markdown === null
              }
              onClick={() => void save()}
            >
              {current?.markdown == null ? "Publish review" : "Save review"}
            </Button>
            {current?.markdown !== null && current?.markdown !== undefined && (
              <Button color="warning" disabled={saving} onClick={() => void save("")}>
                Clear review
              </Button>
            )}
          </Stack>
        </Stack>
      )}
      {message === "saved" && <Alert severity="success">Review saved.</Alert>}
      {message === "error" && <Alert severity="error">The review could not be saved.</Alert>}
    </Stack>
  );
}
