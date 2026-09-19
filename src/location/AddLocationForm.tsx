import { type FormEvent, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import type { NewLocationInput } from "./addLocation";

interface AddLocationFormProps {
  onSave: (input: NewLocationInput) => Promise<void>;
  onAdded: (name: string) => void;
  onCancel: () => void;
}

export default function AddLocationForm({ onSave, onAdded, onCancel }: AddLocationFormProps) {
  const [name, setName] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    const input = { name, street, city, state, postalCode };
    if (Object.values(input).some((value) => value.trim().length === 0)) {
      setError("Complete every field before adding the location.");
      return;
    }

    setSaving(true);
    setError(undefined);
    try {
      await onSave(input);
      onAdded(name.trim());
    } catch (caught) {
      console.error("Adding a soda location failed", caught);
      setError("We couldn't add this location. Check the address and try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Stack spacing={2}>
        {error !== undefined && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Location name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          disabled={saving}
          autoComplete="organization"
        />
        <TextField
          label="Street address"
          value={street}
          onChange={(event) => setStreet(event.target.value)}
          required
          disabled={saving}
          autoComplete="street-address"
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label="City"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            required
            disabled={saving}
            autoComplete="address-level2"
            fullWidth
          />
          <TextField
            label="State"
            value={state}
            onChange={(event) => setState(event.target.value)}
            required
            disabled={saving}
            autoComplete="address-level1"
            sx={{ maxWidth: { sm: 140 } }}
          />
          <TextField
            label="Postal code"
            value={postalCode}
            onChange={(event) => setPostalCode(event.target.value)}
            required
            disabled={saving}
            autoComplete="postal-code"
            sx={{ maxWidth: { sm: 180 } }}
          />
        </Stack>
        <Stack direction="row" spacing={2}>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? "Adding…" : "Add location"}
          </Button>
          <Button onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
