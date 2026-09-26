import { useEffect, useMemo, useState } from "react";
import SportsBarIcon from "@mui/icons-material/SportsBar";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Rating from "@mui/material/Rating";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { db } from "../firebase";
import { sodaRoute } from "../routes";
import {
  compareAlphabetically,
  compareRecentlyRated,
  loadInventory,
  sodaOfferingLabel,
  type InventoryLoad,
} from "../rating/ratings";

interface UserProfileProps {
  userId: string;
  loader?: (id: string) => Promise<InventoryLoad>;
}

type State = { status: "loading" } | { status: "error" } | InventoryLoad;
type SortOrder = "alphabetical" | "recent";

const defaultLoader = (id: string) => loadInventory(db, id);
const ratingLabel = (value: number) => `${value} mug${value === 1 ? "" : "s"}`;

export default function UserProfile({ userId, loader = defaultLoader }: UserProfileProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [sortOrder, setSortOrder] = useState<SortOrder>("alphabetical");
  const [request, setRequest] = useState({ userId, loader });

  if (request.userId !== userId || request.loader !== loader) {
    setRequest({ userId, loader });
    setState({ status: "loading" });
  }

  useEffect(() => {
    let active = true;
    loader(userId)
      .then((result) => {
        if (active) setState(result);
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [loader, userId]);

  const sortedRatings = useMemo(() => {
    if (state.status !== "found") return [];
    const comparator = sortOrder === "alphabetical" ? compareAlphabetically : compareRecentlyRated;
    return state.ratings.toSorted(comparator);
  }, [sortOrder, state]);

  if (state.status === "loading") {
    return (
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <CircularProgress size={20} />
        <span>Loading sampling inventory…</span>
      </Stack>
    );
  }
  if (state.status === "error") {
    return <Alert severity="error">This sampling inventory could not be loaded.</Alert>;
  }
  if (state.status === "missing") {
    return <Alert severity="warning">This sampling profile could not be found.</Alert>;
  }
  if (state.status === "malformed") {
    return <Alert severity="error">This sampling inventory contains malformed data.</Alert>;
  }

  return (
    <Stack spacing={3}>
      <Link href="#/">← Back to browse</Link>
      <Typography variant="h4" component="h2">
        {state.profile.publicName || "Soda fan"}
      </Typography>
      <Typography color="text.secondary">Sampled soda inventory</Typography>

      <FormControl size="small" sx={{ maxWidth: 240 }}>
        <InputLabel id="inventory-sort-label">Sort by</InputLabel>
        <Select<SortOrder>
          labelId="inventory-sort-label"
          label="Sort by"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value)}
        >
          <MenuItem value="alphabetical">Soda offering</MenuItem>
          <MenuItem value="recent">Recently rated</MenuItem>
        </Select>
      </FormControl>

      {sortedRatings.length === 0 ? (
        <Typography color="text.secondary">No sampled sodas yet.</Typography>
      ) : (
        <List disablePadding>
          {sortedRatings.map((rating) => {
            const displayRating = rating.rating === null ? null : Math.round(rating.rating);
            const label = sodaOfferingLabel(rating);
            return (
              <ListItem key={rating.id} divider disableGutters>
                <ListItemText
                  primary={<Link href={sodaRoute(rating.sodaOfferingId)}>{label}</Link>}
                />
                {displayRating === null ? (
                  <Typography color="text.secondary">Unrated</Typography>
                ) : (
                  <Rating
                    aria-label={`${label}: ${ratingLabel(displayRating)}`}
                    value={displayRating}
                    max={5}
                    precision={1}
                    readOnly
                    icon={<SportsBarIcon fontSize="inherit" />}
                    emptyIcon={<SportsBarIcon fontSize="inherit" />}
                    getLabelText={ratingLabel}
                  />
                )}
              </ListItem>
            );
          })}
        </List>
      )}
    </Stack>
  );
}
