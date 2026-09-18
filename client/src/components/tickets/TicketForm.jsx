import { useMemo, useState } from "react";

import {
  Stack,
  TextField,
  MenuItem,
  Button,
  Typography,
  Box,
  Autocomplete,
  Chip,
  Paper,
  Divider,
} from "@mui/material";

import AttachFileIcon from "@mui/icons-material/AttachFile";
import CloseIcon from "@mui/icons-material/Close";


import { useAuth } from "../../context/AuthContext";


// ======================================================
// DEPARTMENT CONFIGURATION
// Replace this later with your department API.
// ======================================================

const DEPARTMENT_DATA = {
  IT: {
    label: "IT",
    managers: [
      "IT Manager",
      "Infrastructure Manager",
      "Application Manager",
    ],
    issues: [
      "Laptop / Desktop Issue",
      "Network Issue",
      "Internet Connectivity",
      "Software Installation",
      "Application Access",
      "Email / Outlook Issue",
      "VPN Issue",
      "Password Reset",
      "System Performance",
      "Printer Issue",
      "Others",
    ],
  },

  HR: {
    label: "HR",
    managers: [
      "HR Manager",
      "HR Operations Manager",
    ],
    issues: [
      "Leave Issue",
      "Attendance Issue",
      "Payroll Issue",
      "Employee Information Update",
      "Onboarding Issue",
      "Offboarding Issue",
      "Policy Clarification",
      "Document Request",
      "Others",
    ],
  },

  FINANCE: {
    label: "Finance",
    managers: [
      "Finance Manager",
      "Accounts Manager",
    ],
    issues: [
      "Invoice Issue",
      "Payment Issue",
      "Expense Claim",
      "Purchase Request",
      "Billing Issue",
      "Budget Request",
      "Others",
    ],
  },

  ADMIN: {
    label: "Administration",
    managers: [
      "Admin Manager",
      "Facilities Manager",
    ],
    issues: [
      "Facility Issue",
      "Office Equipment",
      "Access Card",
      "Transport Issue",
      "Housekeeping Issue",
      "Maintenance Issue",
      "Others",
    ],
  },

  SALES: {
    label: "Sales",
    managers: [
      "Sales Manager",
      "Sales Operations Manager",
    ],
    issues: [
      "CRM Issue",
      "Customer Data Issue",
      "Sales Application Access",
      "Report Issue",
      "Customer Support Issue",
      "Others",
    ],
  },
};





// ======================================================
// COMPONENT
// ======================================================

export default function TicketForm({
  onSubmit,
  submitting,
}) {
  const { user } = useAuth();

  // ----------------------------------------------------
  // Current user's department
  // ----------------------------------------------------

  const currentUserDepartment =
    user?.department?.name ||
    user?.department ||
    "";

  // ----------------------------------------------------
  // Form state
  // ----------------------------------------------------

  const [form, setForm] = useState({
    title: "",

    fromDepartment:
      currentUserDepartment,

    toDepartment: "",

    manager: "",

    issue: "",

    customIssue: "",

    description: "",

  });

  // ----------------------------------------------------
  // Attachment state
  // ----------------------------------------------------

  const [attachments, setAttachments] = useState([]);

  // ----------------------------------------------------
  // Validation errors
  // ----------------------------------------------------

  const [errors, setErrors] = useState({});


  // ====================================================
  // SELECTED DEPARTMENT
  // ====================================================

  const selectedDepartment = useMemo(() => {
    return DEPARTMENT_DATA[form.toDepartment] || null;
  }, [form.toDepartment]);


  // ====================================================
  // HANDLE FIELD CHANGE
  // ====================================================

  const handleChange = (field) => (event) => {
    const value = event.target.value;

    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));

    // Clear error when user starts editing
    setErrors((previous) => ({
      ...previous,
      [field]: "",
    }));
  };


  // ====================================================
  // DEPARTMENT CHANGE
  // ====================================================

  const handleDepartmentChange = (_, value) => {
    const departmentKey = value
      ? Object.keys(DEPARTMENT_DATA).find(
          (key) =>
            DEPARTMENT_DATA[key].label === value
        )
      : "";

    setForm((previous) => ({
      ...previous,

      toDepartment: departmentKey,

      // Reset dependent fields
      manager: "",
      issue: "",
      customIssue: "",
    }));

    setErrors((previous) => ({
      ...previous,
      toDepartment: "",
      manager: "",
      issue: "",
      customIssue: "",
    }));
  };


  // ====================================================
  // ISSUE CHANGE
  // ====================================================

  const handleIssueChange = (_, value) => {
    setForm((previous) => ({
      ...previous,
      issue: value || "",
      customIssue:
        value === "Others"
          ? previous.customIssue
          : "",
    }));

    setErrors((previous) => ({
      ...previous,
      issue: "",
      customIssue: "",
    }));
  };


  // ====================================================
  // ATTACHMENT UPLOAD
  // ====================================================

  const handleAttachmentChange = (event) => {
    const files = Array.from(
      event.target.files || []
    );

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/jpg",
    ];

    const validFiles = files.filter((file) =>
      allowedTypes.includes(file.type)
    );

    setAttachments((previous) => [
      ...previous,
      ...validFiles,
    ]);

    // Reset input so same file can be selected again
    event.target.value = "";
  };


  // ====================================================
  // REMOVE ATTACHMENT
  // ====================================================

  const removeAttachment = (index) => {
    setAttachments((previous) =>
      previous.filter(
        (_, fileIndex) => fileIndex !== index
      )
    );
  };


  // ====================================================
  // VALIDATION
  // ====================================================

  const validate = () => {
    const nextErrors = {};

    if (!form.title.trim()) {
      nextErrors.title = "Title is required";
    }

    if (!form.fromDepartment) {
      nextErrors.fromDepartment =
        "From department is required";
    }

    if (!form.toDepartment) {
      nextErrors.toDepartment =
        "Please select a department";
    }

    if (!form.manager) {
      nextErrors.manager =
        "Please select a manager";
    }

    if (!form.issue) {
      nextErrors.issue =
        "Please select an issue";
    }

    if (
      form.issue === "Others" &&
      !form.customIssue.trim()
    ) {
      nextErrors.customIssue =
        "Please enter the custom issue";
    }

    if (
      !form.description.trim() ||
      form.description === "<p><br></p>"
    ) {
      nextErrors.description =
        "Description is required";
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  };


  // ====================================================
  // SUBMIT
  // ====================================================

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    const finalIssue =
      form.issue === "Others"
        ? form.customIssue
        : form.issue;

    onSubmit({
      ...form,

      issue: finalIssue,

      attachments,
    });
  };


  // ====================================================
  // UI
  // ====================================================

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        width: "100%",
      }}
    >
      <Stack spacing={3}>

        {/* ============================================
            TITLE
            ============================================ */}

        <TextField
          label="Title"
          placeholder="Enter a short title for your issue"
          value={form.title}
          onChange={handleChange("title")}
          error={Boolean(errors.title)}
          helperText={errors.title}
          fullWidth
          required
        />


        {/* ============================================
            DEPARTMENTS
            ============================================ */}

        <Stack
          direction={{
            xs: "column",
            md: "row",
          }}
          spacing={2}
        >

          {/* FROM DEPARTMENT */}

          <TextField
            label="From Department"
            value={form.fromDepartment}
            onChange={handleChange(
              "fromDepartment"
            )}
            error={Boolean(
              errors.fromDepartment
            )}
            helperText={
              errors.fromDepartment ||
              "Your department"
            }
            fullWidth
            InputProps={{
              readOnly: true,
            }}
          />


          {/* TO DEPARTMENT */}

          <Autocomplete
            fullWidth
            options={Object.values(
              DEPARTMENT_DATA
            ).map((department) =>
              department.label
            )}
            value={
              form.toDepartment
                ? DEPARTMENT_DATA[
                    form.toDepartment
                  ]?.label || null
                : null
            }
            onChange={handleDepartmentChange}
            renderInput={(params) => (
              <TextField
                {...params}
                label="To Department"
                placeholder="Select department"
                required
                error={Boolean(
                  errors.toDepartment
                )}
                helperText={
                  errors.toDepartment
                }
              />
            )}
          />

        </Stack>


        {/* ============================================
            MANAGER
            ============================================ */}

        <Autocomplete
          fullWidth
          disabled={!selectedDepartment}
          options={
            selectedDepartment?.managers || []
          }
          value={
            form.manager || null
          }
          onChange={(_, value) => {
            setForm((previous) => ({
              ...previous,
              manager: value || "",
            }));

            setErrors((previous) => ({
              ...previous,
              manager: "",
            }));
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Manager"
              placeholder={
                selectedDepartment
                  ? "Select manager"
                  : "Select department first"
              }
              required
              error={Boolean(errors.manager)}
              helperText={errors.manager}
            />
          )}
        />


        {/* ============================================
            ISSUE
            ============================================ */}

        <Autocomplete
          fullWidth
          disabled={!selectedDepartment}
          options={
            selectedDepartment?.issues || []
          }
          value={
            form.issue || null
          }
          onChange={handleIssueChange}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Issue"
              placeholder={
                selectedDepartment
                  ? "Search or select an issue"
                  : "Select department first"
              }
              required
              error={Boolean(errors.issue)}
              helperText={
                errors.issue ||
                "Search for a predefined issue"
              }
            />
          )}
        />


        {/* ============================================
            CUSTOM ISSUE
            ============================================ */}

        {form.issue === "Others" && (
          <TextField
            label="Custom Issue"
            placeholder="Enter your issue"
            value={form.customIssue}
            onChange={handleChange(
              "customIssue"
            )}
            error={Boolean(
              errors.customIssue
            )}
            helperText={
              errors.customIssue
            }
            fullWidth
            required
          />
        )}


        {/* ============================================
            DESCRIPTION
            ============================================ */}

        <Box>

          <Typography
            variant="body2"
            sx={{
              mb: 1,
              fontWeight: 500,
            }}
            color={
              errors.description
                ? "error"
                : "text.secondary"
            }
          >
            Description
          </Typography>

          <ReactQuill
            theme="snow"
            value={form.description}
            onChange={(value) => {
              setForm((previous) => ({
                ...previous,
                description: value,
              }));

              setErrors((previous) => ({
                ...previous,
                description: "",
              }));
            }}
            modules={quillModules}
            formats={quillFormats}
            placeholder="Describe your issue in detail..."
          />

          {errors.description && (
            <Typography
              variant="caption"
              color="error"
              sx={{
                mt: 0.5,
                display: "block",
              }}
            >
              {errors.description}
            </Typography>
          )}

        </Box>


        {/* ============================================
            ATTACHMENTS
            ============================================ */}

        <Box>

          <Typography
            variant="body2"
            sx={{
              mb: 1,
              fontWeight: 500,
            }}
          >
            Attachment
          </Typography>

          <input
            id="ticket-attachment"
            type="file"
            hidden
            multiple
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={
              handleAttachmentChange
            }
          />

          <label htmlFor="ticket-attachment">
            <Button
              component="span"
              variant="outlined"
              startIcon={
                <AttachFileIcon />
              }
            >
              Upload Files
            </Button>
          </label>

          <Typography
            variant="caption"
            display="block"
            color="text.secondary"
            sx={{ mt: 0.5 }}
          >
            Supported formats: PDF, JPG,
            JPEG, PNG
          </Typography>


          {/* Uploaded files */}

          {attachments.length > 0 && (
            <Paper
              variant="outlined"
              sx={{
                mt: 2,
                p: 1.5,
              }}
            >
              <Stack spacing={1}>

                {attachments.map(
                  (file, index) => (
                    <Box
                      key={`${file.name}-${index}`}
                      sx={{
                        display: "flex",
                        alignItems:
                          "center",
                        justifyContent:
                          "space-between",
                        gap: 1,
                      }}
                    >

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
                      />

                    </Box>
                  )
                )}

              </Stack>
            </Paper>
          )}

        </Box>


        <Divider />


        {/* ============================================
            RAISE TICKET BUTTON
            ============================================ */}

        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={submitting}
            sx={{
              minWidth: 170,
              fontWeight: 600,
              textTransform: "none",
            }}
          >
            {submitting
              ? "Submitting..."
              : "Raise a Ticket"}
          </Button>
        </Box>

      </Stack>
    </Box>
  );
}