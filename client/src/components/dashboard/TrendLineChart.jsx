import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { Paper, Typography } from "@mui/material";
import { CATEGORICAL } from "../../theme/theme";
import { format } from "date-fns";

// Created-vs-resolved trend. Two named series -> two non-adjacent
// categorical slots (blue = created, green = resolved), both direct-labeled
// via the legend since there are only two.
export default function TrendLineChart({ data }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: 360 }}>
      <Typography variant="subtitle1" fontWeight={700} gutterBottom>Created vs Resolved</Typography>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d) => format(new Date(d), "MMM d")} tick={{ fontSize: 12 }} stroke="#898781" minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#898781" />
          <Tooltip labelFormatter={(d) => format(new Date(d), "MMM d, yyyy")} />
          <Legend />
          <Line type="monotone" dataKey="created" name="Created" stroke={CATEGORICAL[0]} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="resolved" name="Resolved" stroke={CATEGORICAL[5]} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </Paper>
  );
}
