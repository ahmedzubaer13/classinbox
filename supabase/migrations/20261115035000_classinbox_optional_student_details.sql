-- Allow Student Name and Student ID to be omitted on a submission.
-- The application stores empty strings when those optional fields are blank.
alter table public.submissions
  drop constraint if exists submissions_student_id_check,
  drop constraint if exists submissions_student_name_check;

alter table public.submissions
  add constraint submissions_student_id_check
    check (char_length(student_id) between 0 and 50),
  add constraint submissions_student_name_check
    check (char_length(student_name) between 0 and 100);
