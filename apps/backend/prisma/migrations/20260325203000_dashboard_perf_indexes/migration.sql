CREATE INDEX IF NOT EXISTS users_role_created_at_idx
  ON users (role, created_at DESC);

CREATE INDEX IF NOT EXISTS classes_status_start_date_idx
  ON classes (status, start_date);

CREATE INDEX IF NOT EXISTS enrollments_student_status_idx
  ON enrollments (student_id, status);

CREATE INDEX IF NOT EXISTS enrollments_status_created_at_idx
  ON enrollments (status, created_at DESC);

CREATE INDEX IF NOT EXISTS monthly_charges_status_due_date_idx
  ON monthly_charges (status, due_date);

CREATE INDEX IF NOT EXISTS monthly_charges_enrollment_status_idx
  ON monthly_charges (enrollment_id, status);
