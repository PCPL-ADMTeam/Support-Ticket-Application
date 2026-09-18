import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Paper, Typography, Box } from "@mui/material";
import { CATEGORICAL } from "../../theme/theme";

// Tickets-by-category bar chart. Single-series magnitude, so one hue
// (categorical slot 1) is enough — color isn't carrying identity here.
export default function CategoryBarChart({ data }) {
  const top = data.slice(0, 8);

  return (
    <Paper variant="outlined" sx={{ p: 2, height: 340 }}>
      <Typography variant="subtitle1" fontWeight={700} gutterBottom>Tickets by Category</Typography>
      {top.length === 0 ? (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: 260, color: "text.secondary" }}>
          No data for this range
        </Box>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={top} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke="#898781" />
            <YAxis type="category" dataKey="category" width={110} tick={{ fontSize: 12 }} stroke="#898781" />
            <Tooltip />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22} fill={CATEGORICAL[0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Paper>
  );
}
