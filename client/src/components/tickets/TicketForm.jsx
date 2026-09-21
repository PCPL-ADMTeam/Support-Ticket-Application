import { useEffect, useMemo, useState } from "react";
import {
  Stack,
  TextField,
  Button,
  Typography,
  Box,
  Autocomplete,
  Chip,
  Paper,
  Divider,
  Alert,
} from "@mui/material";

import AttachFileIcon from "@mui/icons-material/AttachFile";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import CloseIcon from "@mui/icons-material/Close";
import FlagIcon from "@mui/icons-material/Flag";

import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

import { useAuth } from "../../context/AuthContext";
import { departmentsApi } from "../../api/departments";
import { prioritiesApi } from "../../api/catalog";

const MAX_ATTACHMENT_MB = 10;

const ALLOWED_ATTACHMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/jpg",
];

/* =========================================================
   QUILL TOOLBAR
========================================================= */

const quillModules = {
  toolbar: [
    [{ font: [] }],
    [{ size: ["small", false, "large", "huge"] }],
    ["bold", "italic", "underline", "strike"],
    [{ color: [] }, { background: [] }],
    [{ script: "sub" }, { script: "super" }],
    [{ header: [1, 2, 3, 4, 5, 6, false] }],
    [{ align: [] }],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ indent: "-1" }, { indent: "+1" }],
    ["blockquote", "code-block"],
    ["link"],
    ["clean"],
  ],
};

const quillFormats = [
  "font",
  "size",
  "bold",
  "italic",
  "underline",
  "strike",
  "color",
  "background",
  "script",
  "header",
  "align",
  "list",
  "indent",
  "blockquote",
  "code-block",
  "link",
];

const fieldLabelSx = {
  fontSize: 14,
  fontWeight: 600,
  color: "text.primary",
  mb: 1,
};

const sectionTitleSx = {
  fontSize: 16,
  fontWeight: 700,
  color: "text.primary",
  mb: 0.5,
};

const sectionSubtitleSx = {
  fontSize: 13,
  color: "text.secondary",
};

/* =========================================================
   COMPONENT
========================================================= */

export default function TicketForm({
  onSubmit,
  submitting = false,
}) {
  const { user } = useAuth();

  const [departments, setDepartments] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  useEffect(() => {
    Promise.all([
      departmentsApi.list(),
      prioritiesApi.list(),
    ])
      .then(([deptRes, priorityRes]) => {
        setDepartments(deptRes.data.data);
        setPriorities(priorityRes.data.data);
      })
      .finally(() => {
        setLoadingOptions(false);
      });
  }, []);

  const [form, setForm] = useState({
    priorityId: "",
    toDepartmentId: "",
    issueId: "",
    customIssueText: "",
    description: "",
  });

  const [attachments, setAttachments] = useState([]);
  const [errors, setErrors] = useState({});

  /* =========================================================
     SELECTED VALUES
  ========================================================= */

  const selectedDepartment = useMemo(
    () =>
      departments.find(
        (d) => d.id === form.toDepartmentId
      ) || null,
    [departments, form.toDepartmentId]
  );

  const selectedIssue = useMemo(
    () =>
      selectedDepartment?.issues.find(
        (i) => i.id === form.issueId
      ) || null,
    [selectedDepartment, form.issueId]
  );

  const selectedPriority = useMemo(
    () =>
      priorities.find(
        (p) => p.id === form.priorityId
      ) || null,
    [priorities, form.priorityId]
  );

  /* =========================================================
     NORMAL FIELD CHANGE
  ========================================================= */

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    setErrors((prev) => ({
      ...prev,
      [name]: "",
    }));
  };

  /* =========================================================
     DEPARTMENT CHANGE
  ========================================================= */

  const handleDepartmentChange = (_, value) => {
    setForm((prev) => ({
      ...prev,
      toDepartmentId: value?.id || "",
      issueId: "",
      customIssueText: "",
    }));

    setErrors((prev) => ({
      ...prev,
      toDepartmentId: "",
      issueId: "",
      customIssueText: "",
    }));
  };

  /* =========================================================
     ISSUE CHANGE
  ========================================================= */

  const handleIssueChange = (_, value) => {
    setForm((prev) => ({
      ...prev,
      issueId: value?.id || "",
      customIssueText: value?.isOther
        ? prev.customIssueText
        : "",
    }));

    setErrors((prev) => ({
      ...prev,
      issueId: "",
      customIssueText: "",
    }));
  };

  /* =========================================================
     DESCRIPTION CHANGE
  ========================================================= */

  const handleDescriptionChange = (value) => {
    setForm((prev) => ({
      ...prev,
      description: value,
    }));

    setErrors((prev) => ({
      ...prev,
      description: "",
    }));
  };

  /* =========================================================
     ATTACHMENT
  ========================================================= */

  const handleAttachmentChange = (event) => {
    const files = Array.from(event.target.files || []);

    if (!files.length) return;

    const validFiles = [];
    let rejectionMessage = "";

    for (const file of files) {
      if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
        rejectionMessage =
          "Only PDF and image files (JPG/PNG) are supported.";
        continue;
      }

      if (
        file.size >
        MAX_ATTACHMENT_MB * 1024 * 1024
      ) {
        rejectionMessage = `Files must be under ${MAX_ATTACHMENT_MB} MB.`;
        continue;
      }

      validFiles.push(file);
    }

    setAttachments((prev) => [
      ...prev,
      ...validFiles,
    ]);

    setErrors((prev) => ({
      ...prev,
      attachments: rejectionMessage,
    }));

    event.target.value = "";
  };

  const removeAttachment = (index) => {
    setAttachments((prev) =>
      prev.filter(
        (_, fileIndex) => fileIndex !== index
      )
    );
  };

  /* =========================================================
     VALIDATION
  ========================================================= */

  const validateForm = () => {
    const newErrors = {};

    if (!form.priorityId) {
      newErrors.priorityId = "Priority is required";
    }

    if (!form.toDepartmentId) {
      newErrors.toDepartmentId =
        "Department is required";
    }

    if (!form.issueId) {
      newErrors.issueId = "Issue is required";
    }

    if (
      selectedIssue?.isOther &&
      !form.customIssueText.trim()
    ) {
      newErrors.customIssueText =
        "Please enter the issue";
    }

    const plainDescription = form.description
      .replace(/<(.|\n)*?>/g, "")
      .trim();

    if (!plainDescription) {
      newErrors.description =
        "Description is required";
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  /* =========================================================
     SUBMIT
  ========================================================= */

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validateForm()) return;

    /*
      TITLE IS NOW CREATED FROM ISSUE

      Normal issue:
      title = selectedIssue.name

      Other issue:
      title = customIssueText
    */

    const ticketTitle = selectedIssue?.isOther
      ? form.customIssueText.trim()
      : selectedIssue?.name || "";

    const formData = new FormData();

    formData.append("title", ticketTitle);
    formData.append(
      "description",
      form.description
    );
    formData.append(
      "priorityId",
      form.priorityId
    );
    formData.append(
      "toDepartmentId",
      form.toDepartmentId
    );
    formData.append(
      "issueId",
      form.issueId
    );

    if (selectedIssue?.isOther) {
      formData.append(
        "customIssueText",
        form.customIssueText.trim()
      );
    }

    attachments.forEach((file) => {
      formData.append("attachments", file);
    });

    await onSubmit(formData);
  };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <Paper
      elevation={0}
      sx={{
        width: "100%",
        maxWidth: 900,
        mx: "auto",
        border: 1,
        borderColor: "divider",
        borderRadius: 3,
        overflow: "hidden",
        backgroundColor: "#ffffff",
      }}
    >
      {/* ===================================================
          HEADER
      =================================================== */}

      <Box
        sx={{
          px: { xs: 3, md: 4 },
          py: 3,
          backgroundColor: "action.hover",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography
          sx={{
            fontSize: 22,
            fontWeight: 700,
            color: "text.primary",
          }}
        >
          Raise a Ticket
        </Typography>

        <Typography
          sx={{
            mt: 0.5,
            fontSize: 14,
            color: "text.secondary",
          }}
        >
          Provide the details below to create a
          support ticket.
        </Typography>
      </Box>

      {/* ===================================================
          FORM
      =================================================== */}

      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          p: { xs: 3, md: 4 },
        }}
      >
        <Stack spacing={3}>
          {!user.department ? (
            <Alert severity="warning">
              Your account has no department assigned,
              so you can't raise a ticket yet. Contact
              an administrator to have one assigned to
              you.
            </Alert>
          ) : (
            <>
              {/* =================================================
                  TICKET DETAILS
              ================================================= */}

              <Box>
                <Typography sx={sectionTitleSx}>
                  Ticket Details
                </Typography>

                <Typography
                  sx={sectionSubtitleSx}
                >
                  Select the department, issue
                  and priority for your request. It will be
                  routed to that department's manager.
                </Typography>
              </Box>

              <Divider />

              {/* =================================================
                  PRIORITY
              ================================================= */}

              <Box>
                <Typography sx={fieldLabelSx}>
                  Priority
                </Typography>

                <Autocomplete
                  fullWidth
                  size="small"
                  loading={loadingOptions}
                  options={priorities}
                  getOptionLabel={(p) => p.name}
                  value={selectedPriority}
                  onChange={(_, value) => {
                    setForm((prev) => ({
                      ...prev,
                      priorityId:
                        value?.id || "",
                    }));

                    setErrors((prev) => ({
                      ...prev,
                      priorityId: "",
                    }));
                  }}
                  renderOption={(props, option) => (
                    <li
                      {...props}
                      key={option.id}
                    >
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          bgcolor: option.color,
                          mr: 1.25,
                          flexShrink: 0,
                        }}
                      />

                      {option.name}
                    </li>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="Select priority"
                      error={Boolean(
                        errors.priorityId
                      )}
                      helperText={
                        errors.priorityId
                      }
                      InputProps={{
                        ...params.InputProps,
                        startAdornment: (
                          <>
                            <FlagIcon
                              fontSize="small"
                              sx={{
                                color:
                                  selectedPriority?.color ||
                                  "text.disabled",
                                mr: 0.5,
                              }}
                            />

                            {
                              params.InputProps
                                .startAdornment
                            }
                          </>
                        ),
                      }}
                    />
                  )}
                />
              </Box>

              {/* =================================================
                  FROM / TO DEPARTMENT
              ================================================= */}

              <Stack
                direction={{
                  xs: "column",
                  md: "row",
                }}
                spacing={2}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography
                    sx={fieldLabelSx}
                  >
                    From Department
                  </Typography>

                  <TextField
                    fullWidth
                    value={user.department.name}
                    helperText="Your department"
                    size="small"
                    InputProps={{
                      readOnly: true,
                    }}
                  />
                </Box>

                <Box sx={{ flex: 1 }}>
                  <Typography
                    sx={fieldLabelSx}
                  >
                    Department
                  </Typography>

                  <Autocomplete
                    fullWidth
                    size="small"
                    loading={loadingOptions}
                    options={departments}
                    getOptionLabel={(d) => d.name}
                    value={selectedDepartment}
                    onChange={
                      handleDepartmentChange
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="Select department"
                        error={Boolean(
                          errors.toDepartmentId
                        )}
                        helperText={
                          errors.toDepartmentId
                        }
                      />
                    )}
                  />
                </Box>
              </Stack>

              {/* =================================================
                  ISSUE
              ================================================= */}

              <Box>
                <Typography sx={fieldLabelSx}>
                  Issue
                </Typography>

                <Autocomplete
                  fullWidth
                  size="small"
                  disabled={!selectedDepartment}
                  options={
                    selectedDepartment?.issues ||
                    []
                  }
                  getOptionLabel={(i) => i.name}
                  value={selectedIssue}
                  onChange={handleIssueChange}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder={
                        selectedDepartment
                          ? "Search or select an issue"
                          : "Select department first"
                      }
                      error={Boolean(
                        errors.issueId
                      )}
                      helperText={
                        errors.issueId ||
                        "Search for a predefined issue"
                      }
                    />
                  )}
                />
              </Box>

              {/* =================================================
                  CUSTOM ISSUE
              ================================================= */}

              {selectedIssue?.isOther && (
                <Box>
                  <Typography
                    sx={fieldLabelSx}
                  >
                    Specify Issue
                  </Typography>

                  <TextField
                    fullWidth
                    name="customIssueText"
                    value={
                      form.customIssueText
                    }
                    onChange={handleChange}
                    placeholder="Enter the issue"
                    error={Boolean(
                      errors.customIssueText
                    )}
                    helperText={
                      errors.customIssueText
                    }
                    size="small"
                  />
                </Box>
              )}

              {/* =================================================
                  DESCRIPTION
              ================================================= */}

              <Box>
                <Typography sx={fieldLabelSx}>
                  Description
                </Typography>

                <Box
                  sx={{
                    "& .ql-toolbar": {
                      border:
                        "1px solid",
                      borderBottom: "none",
                      borderRadius:
                        "6px 6px 0 0",
                      backgroundColor:
                        "action.hover",
                    },

                    "& .ql-container": {
                      border:
                        "1px solid",
                      borderRadius:
                        "0 0 6px 6px",
                      minHeight: 170,
                      fontSize: 14,
                    },

                    "& .ql-editor": {
                      minHeight: 170,
                    },

                    "& .ql-editor.ql-blank::before":
                      {
                        color: "text.secondary",
                        fontStyle: "normal",
                      },

                    ...(errors.description && {
                      "& .ql-toolbar": {
                        borderColor:
                          "primary.main",
                      },

                      "& .ql-container": {
                        borderColor:
                          "primary.main",
                      },
                    }),
                  }}
                >
                  <ReactQuill
                    theme="snow"
                    value={form.description}
                    onChange={
                      handleDescriptionChange
                    }
                    modules={quillModules}
                    formats={quillFormats}
                    placeholder="Describe your issue in detail..."
                  />
                </Box>

                {errors.description && (
                  <Typography
                    sx={{
                      color: "primary.main",
                      fontSize: 12,
                      mt: 0.5,
                      ml: 1.5,
                    }}
                  >
                    {errors.description}
                  </Typography>
                )}
              </Box>

              {/* =================================================
                  ATTACHMENT
              ================================================= */}

              <Box>
                <Typography sx={fieldLabelSx}>
                  Attachment
                </Typography>

                <Button
                  component="label"
                  variant="outlined"
                  startIcon={
                    <AttachFileIcon />
                  }
                  sx={{
                    textTransform: "none",
                    borderRadius: 2,
                    px: 2,
                    py: 1,
                  }}
                >
                  Upload File

                  <input
                    type="file"
                    hidden
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={
                      handleAttachmentChange
                    }
                  />
                </Button>

                <Typography
                  sx={{
                    mt: 0.75,
                    fontSize: 12,
                    color: "text.secondary",
                  }}
                >
                  PDF, JPG or PNG — up to{" "}
                  {MAX_ATTACHMENT_MB} MB each
                </Typography>

                {errors.attachments && (
                  <Typography
                    sx={{
                      color: "primary.main",
                      fontSize: 12,
                      mt: 0.5,
                    }}
                  >
                    {errors.attachments}
                  </Typography>
                )}

                {attachments.length > 0 && (
                  <Stack
                    spacing={1}
                    sx={{ mt: 1.5 }}
                  >
                    {attachments.map(
                      (file, index) => (
                        <Paper
                          key={`${file.name}-${index}`}
                          variant="outlined"
                          sx={{
                            display: "flex",
                            alignItems:
                              "center",
                            gap: 1.5,
                            p: 1,
                            px: 1.5,
                            borderRadius: 2,
                            borderColor:
                              "divider",
                          }}
                        >
                          <InsertDriveFileIcon
                            fontSize="small"
                            sx={{
                              color:
                                "text.secondary",
                            }}
                          />

                          <Typography
                            variant="body2"
                            noWrap
                            sx={{
                              flex: 1,
                            }}
                          >
                            {file.name}
                          </Typography>

                          <Chip
                            label={`${(
                              file.size / 1024
                            ).toFixed(1)} KB`}
                            size="small"
                            variant="outlined"
                            onDelete={() =>
                              removeAttachment(
                                index
                              )
                            }
                            deleteIcon={
                              <CloseIcon />
                            }
                            sx={{
                              borderRadius: 1.5,
                            }}
                          />
                        </Paper>
                      )
                    )}
                  </Stack>
                )}
              </Box>

              {/* =================================================
                  ACTION BUTTON
              ================================================= */}

              <Divider />

              <Box
                sx={{
                  display: "flex",
                  justifyContent:
                    "flex-end",
                  gap: 1.5,
                }}
              >
                <Button
                  type="submit"
                  variant="contained"
                  disabled={
                    submitting ||
                    loadingOptions
                  }
                  sx={{
                    minWidth: 160,
                    py: 1.2,
                    borderRadius: 2,
                    textTransform:
                      "none",
                    fontWeight: 600,
                  }}
                >
                  {submitting
                    ? "Submitting..."
                    : "Raise a Ticket"}
                </Button>
              </Box>
            </>
          )}
        </Stack>
      </Box>
    </Paper>
  );
}
