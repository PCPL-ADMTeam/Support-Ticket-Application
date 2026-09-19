import { useState } from "react";
import { Stack, Typography, Box, Link as MuiLink, IconButton, Dialog } from "@mui/material";
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
    <Box>
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

      <Dialog
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        maxWidth={false}
        PaperProps={{
          sx: {
            bgcolor: "transparent",
            boxShadow: "none",
            overflow: "visible",
            m: 2,
            maxWidth: "95vw",
            maxHeight: "95vh",
          },
        }}
      >
        {preview && (
          <Box
            sx={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              maxWidth: "95vw",
              maxHeight: "95vh",
            }}
          >
            <IconButton
              onClick={() => setPreview(null)}
              title="Close"
              sx={{
                position: "absolute",
                top: -16,
                right: -16,
                bgcolor: "rgba(0, 0, 0, 0.65)",
                color: "#fff",
                "&:hover": { bgcolor: "rgba(0, 0, 0, 0.85)" },
              }}
            >
              <CloseIcon />
            </IconButton>
            <Box
              component="img"
              src={`${API_ORIGIN}/uploads/${preview.filePath}`}
              alt={preview.fileName}
              sx={{
                display: "block",
                width: "auto",
                height: "auto",
                maxWidth: "95vw",
                maxHeight: "95vh",
                objectFit: "contain",
                borderRadius: 1,
                boxShadow: 6,
                bgcolor: "background.paper",
              }}
            />
          </Box>
        )}
      </Dialog>
    </Box>
  );
}
