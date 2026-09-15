import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { formatAddress, formatSodaAvailability, type NearbyLocation } from "./results";

interface SearchResultsProps {
  results: readonly NearbyLocation[];
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
              {entry.location.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatAddress(entry.location.address)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {entry.distanceMiles.toFixed(1)} miles away
            </Typography>
            {entry.availability.length > 0 ? (
              <List dense disablePadding>
                {entry.availability.map((item) => (
                  <ListItem key={`${item.sodaId}-${item.form}`} disableGutters sx={{ py: 0 }}>
                    <Typography variant="body2">{formatSodaAvailability(item)}</Typography>
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
