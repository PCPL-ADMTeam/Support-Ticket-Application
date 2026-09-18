import { useState } from "react";
import { Stack, Paper, Typography, Box, Link as MuiLink, IconButton, Dialog } from "@mui/material";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import CloseIcon from "@mui/icons-material/Close";

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1").replace(/\/api\/v1\/?$/, "");

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(a) {
  return a.mimeType?.startsWith("image/");
}

export default function AttachmentList({ attachments }) {
  const [preview, setPreview] = useState(null);

  const images = attachments.filter(isImage);
  const files = attachments.filter((a) => !isImage(a));

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
        <AttachFileIcon fontSize="small" sx={{ verticalAlign: "middle", mr: 0.5 }} />
        Attachments
      </Typography>
      {attachments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No attachments</Typography>
      ) : (
        <Stack spacing={2}>
          {images.length > 0 && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
              {images.map((a) => (
                <Box key={a.id} sx={{ width: 96 }}>
                  <Box sx={{ position: "relative", width: 96, height: 96 }}>
                    <Box
                      component="img"
                      src={`${API_ORIGIN}/uploads/${a.filePath}`}
                      alt={a.fileName}
                      onClick={() => setPreview(a)}
                      sx={{
                        width: 96,
                        height: 96,
                        objectFit: "cover",
                        borderRadius: 2,
                        border: 1,
                        borderColor: "divider",
                        display: "block",
                        cursor: "pointer",
                      }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => setPreview(a)}
                      title="Expand"
                      sx={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        p: 0.5,
                        bgcolor: "rgba(0, 0, 0, 0.55)",
                        color: "#fff",
                        "&:hover": { bgcolor: "rgba(0, 0, 0, 0.75)" },
                      }}
                    >
                      <OpenInFullIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", mt: 0.5 }}>
                    {a.fileName}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}

          {files.length > 0 && (
            <Stack spacing={1}>
              {files.map((a) => (
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
        </Stack>
      )}

      <Dialog open={Boolean(preview)} onClose={() => setPreview(null)} maxWidth="lg">
        {preview && (
          <Box sx={{ position: "relative", lineHeight: 0 }}>
            <IconButton
              onClick={() => setPreview(null)}
              title="Close"
              sx={{
                position: "absolute",
                top: 8,
                right: 8,
                bgcolor: "rgba(0, 0, 0, 0.55)",
                color: "#fff",
                "&:hover": { bgcolor: "rgba(0, 0, 0, 0.75)" },
              }}
            >
              <CloseIcon />
            </IconButton>
            <Box
              component="img"
              src={`${API_ORIGIN}/uploads/${preview.filePath}`}
              alt={preview.fileName}
              sx={{ display: "block", maxWidth: "90vw", maxHeight: "85vh" }}
            />
          </Box>
        )}
      </Dialog>
    </Paper>
  );
}
