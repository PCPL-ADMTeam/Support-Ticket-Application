import { createTheme } from "@mui/material/styles";

// Validated categorical palette (fixed hue order — never cycled/reassigned;
// see the dataviz skill's references/palette.md for the CVD-safety proof).
export const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

// Fixed good/warning/serious/critical steps — reserved for state, never
// reused as a plain series color.
export const STATUS_SCALE = { good: "#0ca30c", warning: "#fab219", serious: "#ec835a", critical: "#d03b3b" };

// Ticket workflow stages are mapped onto the categorical palette by fixed
// slot (identity, not severity) so badges/charts/legends all agree.
export const statusColors = {
  OPEN: { color: CATEGORICAL[0] },
  IN_PROGRESS: { color: CATEGORICAL[1] },
  ON_HOLD: { color: CATEGORICAL[3] },
  RESOLVED: { color: CATEGORICAL[5] },
  CLOSED: { color: "#898781" },
  REOPENED: { color: CATEGORICAL[7] },
};

export function buildTheme(mode) {
  return createTheme({
    palette: {
      mode,
      primary: { main: "#1565C0" },
      secondary: { main: "#00897B" },
      background:
        mode === "dark"
          ? { default: "#0f1620", paper: "#161f2c" }
          : { default: "#f4f6f8", paper: "#ffffff" },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: ['"Inter"', '"Segoe UI"', "Roboto", "sans-serif"].join(","),
      h4: { fontWeight: 700 },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 600 },
    },
    components: {
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
      MuiButton: { styleOverrides: { root: { textTransform: "none", fontWeight: 600 } } },
      MuiTableCell: { styleOverrides: { head: { fontWeight: 700 } } },
    },
  });
}
