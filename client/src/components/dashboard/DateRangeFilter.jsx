import { ToggleButtonGroup, ToggleButton } from "@mui/material";

const OPTIONS = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

export default function DateRangeFilter({ days, onChange }) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={days}
      onChange={(_e, value) => value && onChange(value)}
    >
      {OPTIONS.map((opt) => (
        <ToggleButton key={opt.value} value={opt.value}>{opt.label}</ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
