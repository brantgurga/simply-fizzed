// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { locationRoute, sodaRoute } from "../routes";
import {
  formatAddress,
  formatLocationUpdatedAt,
  formatSodaAvailability,
  type NearbyLocation,
} from "./results";

interface SearchResultsProps {
  results: readonly NearbyLocation[];
}

function AttributionValue({ value }: { value: string | undefined }) {
  return (
    <Typography
      component="span"
      variant="inherit"
      color={value === undefined ? "text.disabled" : undefined}
      style={value === undefined ? { fontStyle: "italic" } : undefined}
    >
      {value ?? "Unknown"}
    </Typography>
  );
}

/**
 * Presentational list of nearby soda locations. Each entry shows the location
 * name, address, distance in miles, and the sodas available there with their
 * form. Purely driven by props so it has no data-fetching concerns.
 */
export default function SearchResults({ results }: SearchResultsProps) {
  return (
    <List disablePadding>
      {results.map((entry) => (
        <ListItem key={entry.location.id} divider alignItems="flex-start" disableGutters>
          <Stack spacing={0.5} sx={{ width: "100%" }}>
            <Typography variant="subtitle1" component="h2">
              <Link href={locationRoute(entry.location.id)}>{entry.location.name}</Link>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatAddress(entry.location.address)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {entry.distanceMiles.toFixed(1)} miles away
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Last updated:{" "}
              <AttributionValue
                value={
                  entry.location.updatedAt === undefined
                    ? undefined
                    : formatLocationUpdatedAt(entry.location.updatedAt)
                }
              />
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Last updated by: <AttributionValue value={entry.location.updatedByName} />
            </Typography>
            {entry.availability.length > 0 ? (
              <List dense disablePadding>
                {entry.availability.map((item) => (
                  <ListItem key={`${item.sodaId}-${item.form}`} disableGutters sx={{ py: 0 }}>
                    <Typography variant="body2">
                      <Link href={sodaRoute(item.sodaId)}>{formatSodaAvailability(item)}</Link>
                    </Typography>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No sodas listed yet.
              </Typography>
            )}
          </Stack>
        </ListItem>
      ))}
    </List>
  );
}
