import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { Paper, Typography } from "@mui/material";

// Tickets-by-priority bar chart. Priority colors come from the server (the
// same good/warning/serious/critical steps used for SLA config), so this
// chart automatically matches the priority badges used elsewhere.
export default function PriorityBarChart({ data, onBarClick }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: 340 }}>
      <Typography variant="subtitle1" fontWeight={700} gutterBottom>Tickets by Priority</Typography>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
          <XAxis dataKey="priority" tick={{ fontSize: 12 }} stroke="#898781" />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#898781" />
          <Tooltip />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56} cursor={onBarClick ? "pointer" : "default"} onClick={(entry) => onBarClick?.(entry.priority)}>
            {data.map((entry) => (
              <Cell key={entry.priority} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Paper>
  );
}
