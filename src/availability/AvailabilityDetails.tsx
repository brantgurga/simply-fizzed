import { useState } from "react";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { AvailabilityValue } from "../model/firestore";
import type { AvailabilityDetails } from "./addAvailability";

const LABELS: Record<AvailabilityValue, string> = {
  yes: "Yes",
  no: "No",
  unknown: "Unknown",
};

interface AvailabilityDetailFieldsProps {
  value: AvailabilityDetails;
  onChange: (value: AvailabilityDetails) => void;
  disabled?: boolean;
  idPrefix: string;
}

export function AvailabilityDetailFields({
  value,
  onChange,
  disabled = false,
  idPrefix,
}: AvailabilityDetailFieldsProps) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel id={`${idPrefix}-sample-label`}>Can sample</InputLabel>
        <Select
          labelId={`${idPrefix}-sample-label`}
          label="Can sample"
          value={value.canSample}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, canSample: event.target.value })}
        >
          {Object.entries(LABELS).map(([option, label]) => (
            <MenuItem key={option} value={option}>
              {label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel id={`${idPrefix}-purchase-label`}>Can purchase</InputLabel>
        <Select
          labelId={`${idPrefix}-purchase-label`}
          label="Can purchase"
          value={value.canPurchase}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, canPurchase: event.target.value })}
        >
          {Object.entries(LABELS).map(([option, label]) => (
            <MenuItem key={option} value={option}>
              {label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Stack>
  );
}

interface AvailabilityDetailsDisplayProps {
  value: AvailabilityDetails;
}

export function AvailabilityDetailsDisplay({ value }: AvailabilityDetailsDisplayProps) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 0, sm: 2 }}>
      <Typography variant="body2">Can sample: {LABELS[value.canSample]}</Typography>
      <Typography variant="body2">Can purchase: {LABELS[value.canPurchase]}</Typography>
    </Stack>
  );
}

interface AvailabilityDetailsEditorProps {
  value: AvailabilityDetails;
  idPrefix: string;
  onSave?: (value: AvailabilityDetails) => Promise<void>;
}

export function AvailabilityDetailsEditor({
  value,
  idPrefix,
  onSave,
}: AvailabilityDetailsEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  if (!editing || onSave === undefined) {
    return (
      <Stack spacing={0.5}>
        <AvailabilityDetailsDisplay value={value} />
        {onSave !== undefined && (
          <Button
            size="small"
            sx={{ alignSelf: "flex-start" }}
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
          >
            Edit availability details
          </Button>
        )}
      </Stack>
    );
  }

  return (
    <Stack spacing={1}>
      <AvailabilityDetailFields
        value={draft}
        onChange={setDraft}
        disabled={saving}
        idPrefix={idPrefix}
      />
      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          variant="contained"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void onSave(draft).then(
              () => {
                setSaving(false);
                setEditing(false);
              },
              () => setSaving(false),
            );
          }}
        >
          {saving ? "Saving…" : "Save details"}
        </Button>
        <Button size="small" disabled={saving} onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </Stack>
    </Stack>
  );
}
