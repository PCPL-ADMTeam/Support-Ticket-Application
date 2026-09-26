import { useEffect, useState } from "react";
import { Autocomplete, TextField, Box, Typography } from "@mui/material";
import { usersApi } from "../../api/users";

// The ONE shared, debounced, server-searched "pick a person" control —
// backs every user-selection screen that needs to search across a
// potentially large (100+) user base rather than rendering a giant static
// list (Add Manager / Add Team Lead / Add Employee on Department Details,
// Custom CC on Raise Ticket). Each caller supplies only what makes its own
// eligibility rule different (a `role` filter, which ids to hide entirely
// via `excludeIds`, and/or `isOptionDisabled`/`getOptionSecondaryText` for
// "show them, but explain why they can't be picked") — the search
// mechanics (debounce, min-length, loading state, dedupe) live here once.
//
// Deliberately NOT used for the Ticket Detail assignee picker — that list
// is already fetched once, department-scoped, and normally small (a single
// department's employees), so it uses a plain Autocomplete with local
// filtering over that already-small list instead of a second server round
// trip; see TicketDetailPage.jsx.
export default function SearchableUserSelector({
  label,
  placeholder = "Search name or email...",
  role,
  multiple = false,
  value,
  onChange,
  excludeIds = [],
  isOptionDisabled,
  getOptionSecondaryText,
  size = "small",
  autoFocus = false,
  sx,
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setOptions([]);
      return undefined;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      usersApi.search(trimmed, role ? { role } : {})
        .then(({ data }) => setOptions(data.data))
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, role]);

  const visibleOptions = options.filter((o) => !excludeIds.includes(o.id));

  return (
    <Autocomplete
      multiple={multiple}
      size={size}
      sx={sx}
      filterOptions={(x) => x}
      loading={loading}
      options={visibleOptions}
      value={value}
      inputValue={query}
      onInputChange={(_e, newValue) => setQuery(newValue)}
      onChange={(_e, newValue) => onChange(newValue)}
      getOptionLabel={(u) => u.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      getOptionDisabled={isOptionDisabled}
      renderOption={(props, option) => {
        const secondary = getOptionSecondaryText?.(option);
        return (
          <li {...props} key={option.id}>
            <Box>
              <Typography variant="body2">{option.name}</Typography>
              <Typography variant="caption" color={secondary ? "warning.main" : "text.secondary"}>
                {secondary || option.email}
              </Typography>
            </Box>
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder={placeholder} autoFocus={autoFocus} />
      )}
    />
  );
}
