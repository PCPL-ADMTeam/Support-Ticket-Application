import { TablePagination } from "@mui/material";

export default function PaginationBar({ pagination, onPageChange, onLimitChange }) {
  if (!pagination) return null;
  return (
    <TablePagination
      component="div"
      count={pagination.total}
      page={pagination.page - 1}
      rowsPerPage={pagination.limit}
      onPageChange={(_e, newPage) => onPageChange(newPage + 1)}
      onRowsPerPageChange={(e) => onLimitChange(parseInt(e.target.value, 10))}
      rowsPerPageOptions={[10, 20, 50]}
    />
  );
}
