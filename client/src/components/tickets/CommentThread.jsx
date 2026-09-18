import { useState } from "react";
import {
  Stack,
  Paper,
  Box,
  Typography,
  Avatar,
  TextField,
  Button,
  FormControlLabel,
  Switch,
  Chip,
} from "@mui/material";
import { format } from "date-fns";
import SafeHtml from "../common/SafeHtml";
import EmptyState from "../common/EmptyState";

// Renders the public + internal comment thread and the reply box. Internal
// notes (isInternal) are visually flagged and — per RBAC — the API has
// already stripped them out server-side before an END USER ever sees this
// list, so no client-side filtering is needed here.
export default function CommentThread({ comments, isStaff, onAddComment, submitting }) {
  const [body, setBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    onAddComment({ body, isInternal }).then(() => {
      setBody("");
      setIsInternal(false);
    });
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h6">Comments</Typography>

      {comments.length === 0 && <EmptyState title="No comments yet" subtitle="Be the first to reply." />}

      {comments.map((c) => (
        <Paper
          key={c.id}
          variant="outlined"
          sx={{
            p: 2,
            bgcolor: c.isInternal ? "warning.light" : "background.paper",
            borderColor: c.isInternal ? "warning.main" : "divider",
          }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Avatar sx={{ width: 28, height: 28, fontSize: 14 }}>{c.author.name[0]}</Avatar>
              <Typography variant="body2" fontWeight={600}>{c.author.name}</Typography>
              {c.isInternal && <Chip label="Internal note" size="small" color="warning" />}
            </Box>
            <Typography variant="caption" color="text.secondary">
              {format(new Date(c.createdAt), "MMM d, yyyy h:mm a")}
            </Typography>
          </Box>
          <SafeHtml html={c.body} />
        </Paper>
      ))}

      <Box component="form" onSubmit={handleSubmit}>
        <TextField
          multiline
          minRows={3}
          fullWidth
          placeholder="Write a reply..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
          {isStaff ? (
            <FormControlLabel
              control={<Switch checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />}
              label="Internal note (hidden from requester)"
            />
          ) : (
            <span />
          )}
          <Button type="submit" variant="contained" disabled={submitting || !body.trim()}>
            {submitting ? "Posting..." : "Post Reply"}
          </Button>
        </Box>
      </Box>
    </Stack>
  );
}
