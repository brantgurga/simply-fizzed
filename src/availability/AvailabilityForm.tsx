import { useEffect, useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { db } from "../firebase";
import type { SodaForm } from "../model/firestore";
import {
  formatSodaCatalogLabel,
  loadSodaCatalog,
  rankSodas,
  type SodaDocument,
} from "../soda/sodas";

interface AvailabilityFormProps {
  onAdd: (soda: SodaDocument, form: SodaForm) => Promise<void>;
  loadCatalog?: () => Promise<SodaDocument[]>;
}

const defaultCatalogLoader = () => loadSodaCatalog(db);

export default function AvailabilityForm({
  onAdd,
  loadCatalog = defaultCatalogLoader,
}: AvailabilityFormProps) {
  const [catalog, setCatalog] = useState<SodaDocument[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<"loading" | "ready" | "error">("loading");
  const [soda, setSoda] = useState<SodaDocument | null>(null);
  const [form, setForm] = useState<SodaForm>("can");
  const [message, setMessage] = useState<{ severity: "error" | "success"; text: string }>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    loadCatalog()
      .then((loaded) => {
        if (active) {
          setCatalog(loaded);
          setCatalogStatus("ready");
        }
      })
      .catch(() => {
        if (active) setCatalogStatus("error");
      });
    return () => {
      active = false;
    };
  }, [loadCatalog]);

  async function save() {
    setMessage(undefined);
    if (soda === null) {
      setMessage({ severity: "error", text: "Choose an exact soda from the catalog." });
      return;
    }
    setSaving(true);
    try {
      await onAdd(soda, form);
      setMessage({ severity: "success", text: "Availability added." });
      setSoda(null);
    } catch (error) {
      setMessage({
        severity: "error",
        text: error instanceof Error ? error.message : "Availability could not be added.",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }

  if (catalogStatus === "loading") {
    return (
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <CircularProgress size={20} />
        <span>Loading soda catalog…</span>
      </Stack>
    );
  }
  if (catalogStatus === "error") {
    return <Alert severity="error">The soda catalog could not be loaded.</Alert>;
  }

  return (
    <Stack component="form" spacing={2} onSubmit={handleSubmit}>
      <Typography variant="h6" component="h3">
        Add availability
      </Typography>
      {message !== undefined && <Alert severity={message.severity}>{message.text}</Alert>}
      <Autocomplete
        options={catalog}
        value={soda}
        disabled={saving}
        onChange={(_event, value) => setSoda(value)}
        filterOptions={(_options, state) => rankSodas(catalog, state.inputValue)}
        getOptionKey={(option) => option.id}
        getOptionLabel={formatSodaCatalogLabel}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        renderInput={(parameters) => (
          <TextField {...parameters} label="Catalog soda" placeholder="Search names or aliases" />
        )}
        noOptionsText="No matching catalog sodas"
      />
      <FormControl>
        <InputLabel id="soda-form-label">Form</InputLabel>
        <Select
          labelId="soda-form-label"
          label="Form"
          value={form}
          disabled={saving}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "draft" || value === "can" || value === "bottle") setForm(value);
          }}
        >
          <MenuItem value="draft">Draft</MenuItem>
          <MenuItem value="can">Can</MenuItem>
          <MenuItem value="bottle">Bottle</MenuItem>
        </Select>
      </FormControl>
      <Button type="submit" variant="contained" disabled={saving || catalog.length === 0}>
        {saving ? "Adding…" : "Add soda"}
      </Button>
    </Stack>
  );
}
