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
import PersonAddAlt1Icon from "@mui/icons-material/PersonAddAlt1";

import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

import { useAuth } from "../../context/AuthContext";
import { departmentsApi } from "../../api/departments";
import { prioritiesApi } from "../../api/catalog";
import AttachmentList from "./AttachmentList";
import SearchableUserSelector from "../common/SearchableUserSelector";

const MAX_ATTACHMENT_MB = 10;

// Mirrors ticket.service.js's MAX_ATTACHMENTS_PER_TICKET exactly — this is
// a UX convenience only (rejects an obviously over-limit selection
// immediately instead of round-tripping to the server first); the backend
// remains the authoritative, unbypassable check.
const MAX_ATTACHMENTS_PER_TICKET = 5;

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
  // "edit" reuses this exact form to let a ticket's own requester update
  // the ticket's issue/priority/description (and add more attachments) —
  // see EditTicketPage.jsx. Department is fixed once a ticket exists (its
  // ticket number/manager are already derived from it — see
  // ticket.service.js#createTicket's comment on stable ticket numbers), so
  // it's shown read-only rather than as a picker in this mode.
  mode = "create",
  initialTicket = null,
  onCancel = null,
}) {
  const { user } = useAuth();
  const isEdit = mode === "edit";
  // A Manager may hold several departments (UserDepartmentAccess) — unlike
  // an Employee/Team Lead, who each have exactly one unambiguous "From
  // Department," a Manager must pick which of theirs this request is from
  // (see the "From Department" field below and
  // ticket.service.js#resolveFromDepartmentId, which independently
  // validates whatever is submitted here against their real access).
  const isManagerRole = user.role.name === "MANAGER";

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

  const [form, setForm] = useState(() =>
    isEdit && initialTicket
      ? {
          priorityId: initialTicket.priority.id,
          toDepartmentId: initialTicket.toDepartment?.id || "",
          issueId: initialTicket.issue?.id || "",
          customIssueText: initialTicket.customIssueText || "",
          description: initialTicket.description || "",
        }
      : {
          priorityId: "",
          toDepartmentId: "",
          issueId: "",
          customIssueText: "",
          description: "",
          fromDepartmentId: isManagerRole ? (user.departmentAccess?.[0]?.id || "") : "",
        }
  );

  const [attachments, setAttachments] = useState([]);
  const [errors, setErrors] = useState({});

  /* =========================================================
     CUSTOM CC (create mode only — the ticket's CC list is fixed at
     creation time and there is no post-creation CC-editing UI, see
     ticket.service.js#createTicket / TicketCC). Search/debounce/loading are
     all handled by the shared SearchableUserSelector below.
  ========================================================= */

  const [ccOpen, setCcOpen] = useState(false);
  const [ccSelected, setCcSelected] = useState([]);

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

  // Manager-only — which of their own UserDepartmentAccess departments this
  // request is "from" (see the "From Department" field below).
  const selectedFromDepartment = useMemo(
    () => (user.departmentAccess || []).find((d) => d.id === form.fromDepartmentId) || null,
    [user.departmentAccess, form.fromDepartmentId]
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

  // A ticket may have at most MAX_ATTACHMENTS_PER_TICKET total — counting
  // both what's already saved on the ticket (edit mode only; a new ticket
  // always starts at 0) and whatever's already staged for upload in this
  // form session.
  const existingAttachmentCount = isEdit ? initialTicket?.attachments?.length || 0 : 0;
  const remainingAttachmentSlots = Math.max(MAX_ATTACHMENTS_PER_TICKET - existingAttachmentCount - attachments.length, 0);

  const handleAttachmentChange = (event) => {
    const files = Array.from(event.target.files || []);

    if (!files.length) return;

    // The limit is checked against the WHOLE selection first — a user
    // picking more files than the remaining slots gets a clear rejection,
    // never a silent truncation to "however many happened to fit."
    if (files.length > remainingAttachmentSlots) {
      setErrors((prev) => ({
        ...prev,
        attachments: `Maximum ${MAX_ATTACHMENTS_PER_TICKET} attachments are allowed per ticket. You can upload only ${remainingAttachmentSlots} more file(s).`,
      }));
      event.target.value = "";
      return;
    }

    // General file types are allowed (images, documents, archives, etc.) —
    // this is a UX convenience for the size limit only, same as the count
    // check above; the backend's multer fileFilter (see
    // server/src/config/multer.js) is the authoritative, unbypassable
    // check, and blocks only genuinely dangerous file types, not a fixed
    // allowlist of "safe" ones.
    const validFiles = [];
    let rejectionMessage = "";

    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
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

    if (isEdit) {
      // PATCH /tickets/:id only ever takes JSON (no multer on that route —
      // see ticket.routes.js), so edits go through as a plain object; any
      // newly-added attachment files are uploaded separately afterward via
      // the existing POST /tickets/:id/attachments endpoint, same as
      // comment attachments already do (see TicketDetailPage's
      // handleAddComment). Existing attachments are left untouched.
      const payload = {
        title: ticketTitle,
        description: form.description,
        priorityId: form.priorityId,
        issueId: form.issueId,
        customIssueText: selectedIssue?.isOther ? form.customIssueText.trim() : "",
      };
      await onSubmit(payload, attachments);
      return;
    }

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

    // Manager-only — see ticket.service.js#resolveFromDepartmentId, which
    // independently validates this against the caller's real
    // UserDepartmentAccess; never sent for Employee/Team Lead, both of whom
    // have their From Department derived server-side instead.
    if (isManagerRole && form.fromDepartmentId) {
      formData.append("fromDepartmentId", form.fromDepartmentId);
    }

    ccSelected.forEach((u) => {
      formData.append("ccUserIds", u.id);
    });

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
          {isEdit ? "Edit Ticket" : "Raise a Ticket"}
        </Typography>

        <Typography
          sx={{
            mt: 0.5,
            fontSize: 14,
            color: "text.secondary",
          }}
        >
          {isEdit
            ? "Update the issue, priority, or description of this ticket."
            : "Provide the details below to create a support ticket."}
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
          {/* A home department is required to raise a ticket at all — for an
              EMPLOYEE that's User.departmentId, for a MANAGER it's having
              at least one UserDepartmentAccess department to pick from. A
              TEAMLEAD always has exactly one (enforced elsewhere) so is
              never blocked here. */}
          {(!user.department && user.role.name === "EMPLOYEE") || (isManagerRole && !user.departmentAccess?.length) ? (
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
                  Select the department, issue and
                  priority for your request.
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

                  {isManagerRole ? (
                    // A Manager has no single home department — they pick
                    // which of their own accessible departments this
                    // request is from; the backend independently validates
                    // the selection against their real UserDepartmentAccess
                    // (see ticket.service.js#resolveFromDepartmentId) and
                    // never trusts this value alone.
                    <Autocomplete
                      fullWidth
                      size="small"
                      options={user.departmentAccess || []}
                      getOptionLabel={(d) => d.name}
                      value={selectedFromDepartment}
                      onChange={(_, value) => setForm((prev) => ({ ...prev, fromDepartmentId: value?.id || "" }))}
                      renderInput={(params) => (
                        <TextField {...params} placeholder="Select department" helperText="Your department" />
                      )}
                    />
                  ) : (
                    // Employee/Team Lead each have exactly one unambiguous
                    // department — Employee via User.departmentId, Team
                    // Lead via their one UserDepartmentAccess row (both
                    // already resolved into `user.department` by
                    // authService#buildAuthenticatedUser) — so this stays a
                    // plain read-only field, never a picker, for either.
                    <TextField
                      fullWidth
                      value={user.department?.name || "—"}
                      helperText="Your department"
                      size="small"
                      InputProps={{
                        readOnly: true,
                      }}
                    />
                  )}
                </Box>

                <Box sx={{ flex: 1 }}>
                  <Typography
                    sx={fieldLabelSx}
                  >
                    Department
                  </Typography>

                  {isEdit ? (
                    // A ticket's department is fixed once raised — its
                    // ticket number/manager are already derived from it
                    // (see ticket.service.js#createTicket) — so this is
                    // shown for context only, not editable here.
                    <TextField
                      fullWidth
                      size="small"
                      value={selectedDepartment?.name || ""}
                      helperText="Fixed at creation — cannot be changed"
                      InputProps={{ readOnly: true }}
                    />
                  ) : (
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
                  )}
                </Box>
              </Stack>

              {/* =================================================
                  CUSTOM CC (create mode only)
              ================================================= */}

              {!isEdit && (
                <Box>
                  <Typography sx={fieldLabelSx}>
                    Custom CC (optional)
                  </Typography>

                  {!ccOpen ? (
                    <Button
                      variant="outlined"
                      startIcon={<PersonAddAlt1Icon />}
                      onClick={() => setCcOpen(true)}
                      sx={{
                        textTransform: "none",
                        borderRadius: 2,
                        px: 2,
                        py: 1,
                      }}
                    >
                      Custom CC
                    </Button>
                  ) : (
                    <SearchableUserSelector
                      multiple
                      placeholder="Search employee name..."
                      excludeIds={[user.id]}
                      value={ccSelected}
                      onChange={setCcSelected}
                      autoFocus
                    />
                  )}

                  <Typography
                    sx={{
                      mt: 0.75,
                      fontSize: 12,
                      color: "text.secondary",
                    }}
                  >
                    These people will be CC'd on all email notifications for this ticket.
                  </Typography>
                </Box>
              )}

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

              {isEdit && initialTicket?.attachments?.length > 0 && (
                <AttachmentList ticketId={initialTicket.id} attachments={initialTicket.attachments} />
              )}

              <Box>
                <Typography sx={fieldLabelSx}>
                  {isEdit ? "Add Attachment" : "Attachment"}
                </Typography>

                {remainingAttachmentSlots > 0 ? (
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
                      onChange={
                        handleAttachmentChange
                      }
                    />
                  </Button>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Maximum attachments reached — remove one to add another.
                  </Typography>
                )}

                <Typography
                  sx={{
                    mt: 0.75,
                    fontSize: 12,
                    color: "text.secondary",
                  }}
                >
                  Any file type — up to{" "}
                  {MAX_ATTACHMENT_MB} MB each. Maximum attachments: {MAX_ATTACHMENTS_PER_TICKET}
                  {" "}({existingAttachmentCount + attachments.length}/{MAX_ATTACHMENTS_PER_TICKET} used)
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
                {isEdit && onCancel && (
                  <Button
                    onClick={onCancel}
                    disabled={submitting}
                    sx={{ py: 1.2, borderRadius: 2, textTransform: "none", fontWeight: 600 }}
                  >
                    Cancel
                  </Button>
                )}
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
                    : isEdit
                      ? "Update Ticket"
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
