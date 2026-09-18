import { useEffect, useRef, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Avatar,
  TextField,
  IconButton,
  FormControlLabel,
  Switch,
  Chip,
  Link as MuiLink,
} from "@mui/material";
import { format } from "date-fns";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import SendIcon from "@mui/icons-material/Send";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import CloseIcon from "@mui/icons-material/Close";
import SafeHtml from "../common/SafeHtml";
import EmptyState from "../common/EmptyState";

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1").replace(/\/api\/v1\/?$/, "");
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Renders the public + internal comment thread as a single chat-style panel:
// a scrollable message list on top and a reply composer pinned to the
// bottom of the same container. Internal notes (isInternal) are visually
// flagged and — per RBAC — the API has already stripped them out
// server-side before an END USER ever sees this list, so no client-side
// filtering is needed here.
export default function CommentThread({ comments, isStaff, onAddComment, submitting }) {
  const [body, setBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments.length]);

  const handleFileChange = (e) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    if (picked.size > MAX_FILE_SIZE) {
      setFileError("File exceeds the 10 MB limit");
      return;
    }
    setFileError("");
    setFile(picked);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    onAddComment({ body, isInternal }, file).then(() => {
      setBody("");
      setIsInternal(false);
      setFile(null);
    });
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 3,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "none",
      }}
    >
      <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <Typography variant="subtitle1" fontWeight={700}>Comments</Typography>
      </Box>

      {/* Message list — the only scrollable part of this panel */}
      <Box
        ref={listRef}
        sx={{
          maxHeight: { xs: 320, sm: 420 },
          overflowY: comments.length > 0 ? "auto" : "visible",
          p: 2,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {comments.length === 0 ? (
          <EmptyState title="No comments yet" subtitle="Be the first to reply." />
        ) : (
          comments.map((c) => (
            <Box key={c.id} sx={{ display: "flex", gap: 1.25 }}>
              <Avatar sx={{ width: 30, height: 30, fontSize: 14, flexShrink: 0 }}>{c.author.name[0]}</Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography variant="body2" fontWeight={600}>{c.author.name}</Typography>
                  {c.isInternal && <Chip label="Internal note" size="small" color="warning" />}
                  <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
                    {format(new Date(c.createdAt), "MMM d, h:mm a")}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    mt: 0.5,
                    p: 1.25,
                    borderRadius: 2,
                    bgcolor: c.isInternal ? "warning.light" : "background.default",
                  }}
                >
                  <SafeHtml html={c.body} />
                  {c.attachments?.length > 0 && (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 1 }}>
                      {c.attachments.map((a) => (
                        <Box key={a.id} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                          <InsertDriveFileIcon fontSize="small" color="action" />
                          <MuiLink href={`${API_ORIGIN}/uploads/${a.filePath}`} target="_blank" rel="noopener noreferrer" underline="hover" variant="body2" sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {a.fileName}
                          </MuiLink>
                          <Typography variant="caption" color="text.secondary">{formatSize(a.fileSize)}</Typography>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              </Box>
            </Box>
          ))
        )}
      </Box>

      {/* Reply composer — fixed at the bottom of the panel, never scrolls */}
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{ borderTop: 1, borderColor: "divider", p: 1.5, bgcolor: "background.paper" }}
      >
        {file && (
          <Chip
            sx={{ mb: 1 }}
            icon={<InsertDriveFileIcon />}
            label={`${file.name} (${formatSize(file.size)})`}
            onDelete={() => setFile(null)}
            deleteIcon={<CloseIcon />}
          />
        )}
        {fileError && <Typography variant="caption" color="error" display="block" sx={{ mb: 0.5 }}>{fileError}</Typography>}

        <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1 }}>
          <IconButton size="small" onClick={() => inputRef.current?.click()} title="Attach a file" sx={{ mb: 0.5 }}>
            <AttachFileIcon fontSize="small" />
          </IconButton>
          <input ref={inputRef} type="file" hidden onChange={handleFileChange} />

          <TextField
            multiline
            maxRows={4}
            fullWidth
            size="small"
            placeholder="Write a reply..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3, bgcolor: "background.default" } }}
          />

          <IconButton type="submit" color="primary" disabled={submitting || !body.trim()} sx={{ mb: 0.5 }} title="Send">
            <SendIcon fontSize="small" />
          </IconButton>
        </Box>

        {isStaff && (
          <FormControlLabel
            sx={{ mt: 0.5, ml: 0 }}
            control={<Switch size="small" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />}
            label={<Typography variant="caption" color="text.secondary">Internal note (hidden from requester)</Typography>}
          />
        )}
      </Box>
    </Paper>
  );
}
