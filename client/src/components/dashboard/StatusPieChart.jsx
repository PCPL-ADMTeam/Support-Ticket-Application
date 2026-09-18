import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Paper, Typography, Box } from "@mui/material";
import { statusColors } from "../../theme/theme";

// Tickets-by-status donut. Uses the fixed workflow-stage -> categorical-slot
// mapping from theme.js so colors always agree with StatusBadge chips.
export default function StatusPieChart({ data, onSliceClick }) {
  const chartData = data.filter((d) => d.count > 0);

  return (
    <Paper variant="outlined" sx={{ p: 2, height: 340 }}>
      <Typography variant="subtitle1" fontWeight={700} gutterBottom>Tickets by Status</Typography>
      {chartData.length === 0 ? (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: 260, color: "text.secondary" }}>
          No data for this range
        </Box>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="count"
              nameKey="status"
              innerRadius={60}
              outerRadius={95}
              paddingAngle={2}
              cornerRadius={4}
              onClick={(entry) => onSliceClick?.(entry.status)}
              cursor={onSliceClick ? "pointer" : "default"}
            >
              {chartData.map((entry) => (
                <Cell key={entry.status} fill={statusColors[entry.status]?.color || "#898781"} stroke="var(--mui-palette-background-paper, #fff)" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip formatter={(value, _name, item) => [value, item.payload.status]} />
            <Legend verticalAlign="bottom" height={36} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Paper>
  );
}
