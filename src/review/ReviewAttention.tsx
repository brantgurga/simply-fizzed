// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { useEffect, useState } from "react";
import NotificationsIcon from "@mui/icons-material/Notifications";
import Badge from "@mui/material/Badge";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { db } from "../firebase";
import { sodaRoute } from "../routes";
import { observeReviewAttention, type ReviewAttentionItem } from "./reviews";

/** Compact app-bar list of the signed-in author's pending and hidden reviews. */
export default function ReviewAttention({ userId }: { userId: string }) {
  const [items, setItems] = useState<ReviewAttentionItem[]>([]);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  useEffect(() => {
    try {
      return observeReviewAttention(db, userId, setItems);
    } catch {
      return undefined;
    }
  }, [userId]);
  if (items.length === 0) return null;
  return (
    <>
      <IconButton
        color="inherit"
        aria-label={`${items.length} review${items.length === 1 ? "" : "s"} need attention`}
        aria-controls={anchor === null ? undefined : "review-attention-menu"}
        aria-haspopup="true"
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <Badge badgeContent={items.length} color="warning">
          <NotificationsIcon />
        </Badge>
      </IconButton>
      <Menu
        id="review-attention-menu"
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
      >
        {items.map((item) => (
          <MenuItem
            key={item.id}
            component="a"
            href={sodaRoute(item.sodaOfferingId)}
            onClick={() => setAnchor(null)}
          >
            <Stack>
              <Typography variant="body2">
                {item.sodaBrand} {item.sodaName}
              </Typography>
              <Typography variant="caption">
                {item.moderationStatus === "hidden"
                  ? "Hidden — review the reason and revise"
                  : "Pending moderator review"}
              </Typography>
            </Stack>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
