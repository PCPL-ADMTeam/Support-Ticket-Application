import { useRef, useState } from "react";
import { Stack, Paper, Typography, Box, Button, Link as MuiLink } from "@mui/material";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1").replace(/\/api\/v1\/?$/, "");

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentList({ attachments, onUpload, uploading }) {
  const inputRef = useRef(null);
  const [error, setError] = useState("");

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("File exceeds the 10 MB limit");
      return;
    }
    setError("");
    onUpload(file);
    e.target.value = "";
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          <AttachFileIcon fontSize="small" sx={{ verticalAlign: "middle", mr: 0.5 }} />
          Attachments
        </Typography>
        <Button size="small" startIcon={<UploadFileIcon />} onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading..." : "Upload"}
        </Button>
        <input ref={inputRef} type="file" hidden onChange={handleFileChange} />
      </Box>
      {error && <Typography variant="caption" color="error">{error}</Typography>}
      {attachments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No attachments</Typography>
      ) : (
        <Stack spacing={1}>
          {attachments.map((a) => (
            <Box key={a.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <InsertDriveFileIcon fontSize="small" color="action" />
              <MuiLink href={`${API_ORIGIN}/uploads/${a.filePath}`} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ flex: 1 }}>
                {a.fileName}
              </MuiLink>
              <Typography variant="caption" color="text.secondary">{formatSize(a.fileSize)}</Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
