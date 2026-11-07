-- SYNTHETIC DEMO DATA. Every person, school and grade here is invented. Do not replace with real children's data.
-- Dates are relative to now() so the demo always looks current.
-- On hosted Supabase, create the demo users via the Auth dashboard first (same UUIDs), or skip the auth.users insert.

insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-00000000a001', 'demo-parent-a@example.test'),
  ('00000000-0000-4000-8000-00000000a002', 'demo-guardian-a@example.test'),
  ('00000000-0000-4000-8000-00000000a003', 'demo-student-ava@example.test'),
  ('00000000-0000-4000-8000-00000000b001', 'demo-parent-b@example.test'),
  ('00000000-0000-4000-8000-00000000b003', 'demo-student-cory@example.test')
on conflict do nothing;

insert into public.families(id, name, timezone, onboarded_at) values
  ('10000000-0000-4000-8000-00000000000a', 'Maple Family (demo)', 'America/New_York', now()),
  ('10000000-0000-4000-8000-00000000000b', 'Oak Family (demo)', 'America/Los_Angeles', now());

insert into public.children(id, family_id, display_name, grade_level, user_id) values
  ('20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-00000000000a', 'Ava (synthetic)', '9', '00000000-0000-4000-8000-00000000a003'),
  ('20000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-00000000000a', 'Ben (synthetic)', '6', null),
  ('20000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-00000000000b', 'Cory (synthetic)', '8', '00000000-0000-4000-8000-00000000b003');

insert into public.family_members(family_id, user_id, role, display_name, email, child_id) values
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000a001', 'parent', 'Demo Parent Alex', 'demo-parent-a@example.test', null),
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000a002', 'guardian', 'Demo Guardian Sam', 'demo-guardian-a@example.test', null),
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000a003', 'student', 'Ava (synthetic)', 'demo-student-ava@example.test', '20000000-0000-4000-8000-0000000000a1'),
  ('10000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000b001', 'parent', 'Demo Parent Blake', 'demo-parent-b@example.test', null),
  ('10000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000b003', 'student', 'Cory (synthetic)', 'demo-student-cory@example.test', '20000000-0000-4000-8000-0000000000b1');

insert into public.notification_prefs(family_id, user_id) values
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000a001'),
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000a002'),
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000a003'),
  ('10000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000b001'),
  ('10000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000b003');

insert into public.notification_consents(family_id, user_id, channel, consent_text_version) values
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000a001', 'email', 'v1'),
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000a001', 'in_app', 'v1'),
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000a003', 'in_app', 'v1'),
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000a003', 'email', 'v1'),
  ('10000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000b001', 'email', 'v1');

-- Grading periods for Ava: Q1 (finished), Q2 (current), S1 (spans both)
insert into public.grading_periods(id, family_id, child_id, name, kind, starts_on, ends_on) values
  ('30000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-0000000000a1', 'Quarter 1', 'quarter', current_date - 90, current_date - 22),
  ('30000000-0000-4000-8000-0000000000e2', '10000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-0000000000a1', 'Quarter 2', 'quarter', current_date - 21, current_date + 45),
  ('30000000-0000-4000-8000-0000000000e3', '10000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-0000000000a1', 'Semester 1', 'semester', current_date - 90, current_date + 45),
  ('30000000-0000-4000-8000-0000000000e4', '10000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-0000000000a2', 'Trimester 1', 'quarter', current_date - 60, current_date + 30),
  ('30000000-0000-4000-8000-0000000000e5', '10000000-0000-4000-8000-00000000000b', '20000000-0000-4000-8000-0000000000b1', 'Quarter 2', 'quarter', current_date - 21, current_date + 45);

-- Courses (Ava has six, including Art I with no posted grade yet)
insert into public.courses(id, family_id, child_id, name, teacher, source, external_id) values
  ('40000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-0000000000a1', 'Algebra I', 'Mx. Demo Teacher', 'canvas', 'demo-c1'),
  ('40000000-0000-4000-8000-0000000000c2', '10000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-0000000000a1', 'Biology', 'Dr. Sample', 'canvas', 'demo-c2'),
  ('40000000-0000-4000-8000-0000000000c3', '10000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-0000000000a1', 'English 9', 'Ms. Example', 'canvas', 'demo-c3'),
  ('40000000-0000-4000-8000-0000000000c4', '10000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-0000000000a1', 'World History', 'Mr. Placeholder', 'canvas', 'demo-c4'),
  ('40000000-0000-4000-8000-0000000000c5', '10000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-0000000000a1', 'Spanish I', 'Sra. Ficticia', 'canvas', 'demo-c5'),
  ('40000000-0000-4000-8000-0000000000c6', '10000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-0000000000a1', 'Art I', null, 'manual', null),
  ('40000000-0000-4000-8000-0000000000c7', '10000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-0000000000a2', 'Math 6', 'Mrs. Invented', 'manual', null),
  ('40000000-0000-4000-8000-0000000000c8', '10000000-0000-4000-8000-00000000000b', '20000000-0000-4000-8000-0000000000b1', 'Science 8', 'Mr. Madeup', 'manual', null);

-- Grades: official (school SIS, CSV-imported) vs platform (learning platform). Inserted then updated to build history.
insert into public.grade_records(id, family_id, child_id, course_id, period_id, source, source_type, kind, status, percent, letter, recorded_at) values
  -- Q1 finalized report-card grades (official)
  ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c1','30000000-0000-4000-8000-0000000000e1','csv','official','report_card','final',72,'C',now()-interval '20 days'),
  ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c2','30000000-0000-4000-8000-0000000000e1','csv','official','report_card','final',84,'B',now()-interval '20 days'),
  ('60000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c3','30000000-0000-4000-8000-0000000000e1','csv','official','report_card','final',88,'B+',now()-interval '20 days'),
  ('60000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c4','30000000-0000-4000-8000-0000000000e1','csv','official','report_card','final',79,'C+',now()-interval '20 days'),
  ('60000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c5','30000000-0000-4000-8000-0000000000e1','csv','official','report_card','final',91,'A-',now()-interval '20 days'),
  -- Q2 current-quarter official (provisional)
  ('60000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c1','30000000-0000-4000-8000-0000000000e2','csv','official','quarter','provisional',74,'C',now()-interval '14 days'),
  ('60000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c2','30000000-0000-4000-8000-0000000000e2','csv','official','quarter','provisional',80,'B-',now()-interval '14 days'),
  -- Q2 platform grades (Canvas)
  ('60000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c1','30000000-0000-4000-8000-0000000000e2','canvas','platform','quarter','provisional',71,null,now()-interval '12 days'),
  ('60000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c2','30000000-0000-4000-8000-0000000000e2','canvas','platform','quarter','provisional',80,null,now()-interval '12 days'),
  ('60000000-0000-4000-8000-000000000023','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c3','30000000-0000-4000-8000-0000000000e2','canvas','platform','quarter','provisional',86.5,null,now()-interval '2 days'),
  ('60000000-0000-4000-8000-000000000024','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c4','30000000-0000-4000-8000-0000000000e2','canvas','platform','quarter','provisional',68,null,now()-interval '2 days'),
  ('60000000-0000-4000-8000-000000000025','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c5','30000000-0000-4000-8000-0000000000e2','canvas','platform','quarter','provisional',89,null,now()-interval '2 days'),
  ('60000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c1','30000000-0000-4000-8000-0000000000e3','csv','official','semester','provisional',73,'C',now()-interval '14 days'),
  ('60000000-0000-4000-8000-000000000041','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a2','40000000-0000-4000-8000-0000000000c7','30000000-0000-4000-8000-0000000000e4','manual','official','quarter','provisional',93,'A',now()-interval '5 days'),
  ('60000000-0000-4000-8000-000000000051','10000000-0000-4000-8000-00000000000b','20000000-0000-4000-8000-0000000000b1','40000000-0000-4000-8000-0000000000c8','30000000-0000-4000-8000-0000000000e5','manual','official','quarter','provisional',77,'C+',now()-interval '5 days');
-- Trend: Algebra platform grade improves, Biology dips (each update appends grade_history)
update public.grade_records set percent = 74.5, recorded_at = now()-interval '6 days' where id = '60000000-0000-4000-8000-000000000021';
update public.grade_records set percent = 78, recorded_at = now()-interval '2 days' where id = '60000000-0000-4000-8000-000000000021';
update public.grade_records set percent = 76, recorded_at = now()-interval '2 days' where id = '60000000-0000-4000-8000-000000000022';

-- Assignments covering every state the app must distinguish
insert into public.assignments(id, family_id, child_id, course_id, period_id, source, external_id, title, kind, teacher, source_url,
  due_at, closes_at, points_possible, score, submission_status, submitted_at, graded_at, planner_checked,
  attempts_used, attempts_allowed, attempts_unlimited, retake_status, retake_closes_at, retake_note, retake_verified_at) values
  ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c1','30000000-0000-4000-8000-0000000000e2','canvas','demo-a1','Unit 4 practice set','assignment','Mx. Demo Teacher','https://canvas.example.test/courses/1/assignments/1',
   now()+interval '2 days', now()+interval '9 days', 20, null, 'not_submitted', null, null, false, null, null, false, 'none', null, null, null),
  ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c1','30000000-0000-4000-8000-0000000000e2','canvas','demo-a2','Quiz 3.2: Linear equations','quiz','Mx. Demo Teacher','https://canvas.example.test/courses/1/quizzes/2',
   now()-interval '8 days', now()-interval '8 days', 10, 6, 'graded', now()-interval '8 days', now()-interval '7 days', false, 1, 3, false, 'unknown', null, 'Two attempts unused; quiz window may be closed', null),
  ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c2','30000000-0000-4000-8000-0000000000e2','canvas','demo-a3','Lab report: Osmosis','assignment','Dr. Sample','https://canvas.example.test/courses/2/assignments/3',
   now()-interval '3 days', now()+interval '4 days', 50, null, 'not_submitted', null, null, false, null, null, false, 'none', null, null, null),
  ('50000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c2','30000000-0000-4000-8000-0000000000e2','canvas','demo-a4','Cell structure quiz','quiz','Dr. Sample','https://canvas.example.test/courses/2/quizzes/4',
   now()-interval '10 days', now()-interval '10 days', 100, 55, 'graded', now()-interval '10 days', now()-interval '9 days', false, 1, 2, false, 'closed', now()-interval '2 days', 'Retake window ended', now()-interval '2 days'),
  ('50000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c3','30000000-0000-4000-8000-0000000000e2','canvas','demo-a5','Persuasive essay draft','assignment','Ms. Example','https://canvas.example.test/courses/3/assignments/5',
   now()-interval '6 days', null, 100, null, 'missing', null, null, false, null, null, false, 'none', null, null, null),
  ('50000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c3','30000000-0000-4000-8000-0000000000e2','canvas','demo-a6','Reading log week 5','assignment','Ms. Example','https://canvas.example.test/courses/3/assignments/6',
   now()-interval '4 days', null, 10, null, 'submitted', now()-interval '4 days', null, false, null, null, false, 'none', null, null, null),
  ('50000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c4','30000000-0000-4000-8000-0000000000e2','canvas','demo-a7','Map quiz: River civilizations','quiz','Mr. Placeholder','https://canvas.example.test/courses/4/quizzes/7',
   now()-interval '5 days', now()-interval '5 days', 100, 62, 'graded', now()-interval '5 days', now()-interval '4 days', false, 1, null, true, 'confirmed_open', now()+interval '5 days', 'Teacher posted retake window in Canvas', now()-interval '1 day'),
  ('50000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c4','30000000-0000-4000-8000-0000000000e1','canvas','demo-a8','Q1 timeline project','assignment','Mr. Placeholder','https://canvas.example.test/courses/4/assignments/8',
   now()-interval '40 days', null, 100, null, 'missing', null, null, false, null, null, false, 'none', null, null, null),
  ('50000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c5','30000000-0000-4000-8000-0000000000e2','canvas','demo-a9','Vocabulary practice 6','assignment','Sra. Ficticia','https://canvas.example.test/courses/5/assignments/9',
   now()-interval '1 day', now()+interval '6 days', 20, null, 'not_submitted', null, null, true, null, null, false, 'none', null, null, null),
  ('50000000-0000-4000-8000-00000000000a','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c5','30000000-0000-4000-8000-0000000000e2','canvas','demo-a10','Oral quiz 2','quiz','Sra. Ficticia',null,
   now()-interval '7 days', now()-interval '7 days', 50, 34, 'graded', now()-interval '7 days', now()-interval '6 days', false, 1, 1, false, 'teacher_approved', now()+interval '7 days', 'Teacher agreed by email to a retake during lunch', now()-interval '3 days'),
  ('50000000-0000-4000-8000-00000000000b','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c1','30000000-0000-4000-8000-0000000000e2','csv','demo-a11','Chapter 3 test (external testing system)','test','Mx. Demo Teacher',null,
   now()-interval '9 days', null, 100, 64, 'graded', now()-interval '9 days', now()-interval '8 days', false, null, null, false, 'unknown', null, 'Testing system does not expose attempts; ask teacher', null),
  ('50000000-0000-4000-8000-00000000000c','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c2','30000000-0000-4000-8000-0000000000e2','canvas','demo-a12','Optional extra-credit worksheet','assignment','Dr. Sample',null,
   now()-interval '2 days', null, 10, null, 'missing', null, null, false, null, null, false, 'none', null, null, null),
  ('50000000-0000-4000-8000-00000000000d','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c3','30000000-0000-4000-8000-0000000000e2','canvas','demo-a13','Vocabulary unit 4','assignment','Ms. Example',null,
   now()-interval '1 day', now()+interval '3 days', 20, null, 'not_submitted', null, null, false, null, null, false, 'none', null, null, null),
  ('50000000-0000-4000-8000-00000000000e','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000c6','30000000-0000-4000-8000-0000000000e2','manual',null,'Sketchbook week 6','assignment',null,null,
   now()+interval '4 days', null, null, null, 'not_submitted', null, null, false, null, null, false, 'none', null, null, null),
  ('50000000-0000-4000-8000-00000000000f','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a2','40000000-0000-4000-8000-0000000000c7','30000000-0000-4000-8000-0000000000e4','manual',null,'Fractions worksheet','assignment','Mrs. Invented',null,
   now()+interval '1 day', null, 10, null, 'not_submitted', null, null, false, null, null, false, 'none', null, null, null),
  ('50000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-00000000000b','20000000-0000-4000-8000-0000000000b1','40000000-0000-4000-8000-0000000000c8','30000000-0000-4000-8000-0000000000e5','manual',null,'Oak family private assignment','assignment','Mr. Madeup',null,
   now()-interval '2 days', now()+interval '3 days', 10, null, 'not_submitted', null, null, false, null, null, false, 'none', null, null, null);

insert into public.assignment_exclusions(assignment_id, family_id, reason, created_by) values
  ('50000000-0000-4000-8000-00000000000c','10000000-0000-4000-8000-00000000000a','Teacher confirmed this was optional extra credit','00000000-0000-4000-8000-00000000a001');

insert into public.student_replies(family_id, child_id, assignment_id, status, note, channel, author_user_id, created_at) values
  ('10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','50000000-0000-4000-8000-000000000006','already_did',null,'email_link','00000000-0000-4000-8000-00000000a003', now()-interval '72 hours'),
  ('10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','50000000-0000-4000-8000-00000000000d','did_on_paper','Handed it in during class','app','00000000-0000-4000-8000-00000000a003', now()-interval '20 hours'),
  ('10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','50000000-0000-4000-8000-000000000003','working_on_it',null,'app','00000000-0000-4000-8000-00000000a003', now()-interval '30 hours'),
  ('10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','50000000-0000-4000-8000-000000000003','need_at_school','Need the lab microscope','app','00000000-0000-4000-8000-00000000a003', now()-interval '6 hours'),
  ('10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','50000000-0000-4000-8000-000000000009','needs_code','The practice site asks for a class code','app','00000000-0000-4000-8000-00000000a003', now()-interval '10 hours');

insert into public.integration_connections(id, family_id, child_id, provider, status, display_name, base_url, last_attempt_at, last_success_at, last_error, not_refreshed) values
  ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','canvas','reconnect_needed','Canvas (demo district)','https://canvas.example.test',
   now()-interval '1 hour', now()-interval '2 days', 'Access token expired (simulated)', 'Assignments, scores and course grades for Ava were not refreshed after the last successful sync.'),
  ('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','csv','connected','CSV import (official grades)',null, now()-interval '14 days', now()-interval '14 days', null, null),
  ('70000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-0000000000a1','skyward','pending_district','Skyward (district API not enabled)',null, null, null, null, null);
