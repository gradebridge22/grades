/**
 * Page readers. Each function is SELF-CONTAINED (no outside references) because the popup injects it
 * into the current tab with chrome.scripting.executeScript, only after the parent clicks.
 * Rules: read-only. No clicks, no form submits, no navigation. Never opens or touches a quiz/test session.
 */

/** Canvas: uses Canvas's own REST API from the page, with the parent's existing session. GET + allowlist only. */
export async function canvasReader(opts) {
  const ALLOW = [
    /^\/api\/v1\/users\/self$/, /^\/api\/v1\/users\/self\/observees$/, /^\/api\/v1\/users\/\d+\/courses$/,
    /^\/api\/v1\/courses$/, /^\/api\/v1\/courses\/\d+\/assignments$/,
  ];
  const FORBIDDEN = /(quiz_submissions|\/take\b|\/sessions?\b|\/questions|\/events|\/complete)/i;
  const get = async (url) => {
    const u = new URL(url, location.origin);
    if (u.origin !== location.origin) throw new Error('Blocked: other origin');
    if (FORBIDDEN.test(u.pathname) || !ALLOW.some((r) => r.test(u.pathname))) throw new Error('Blocked: ' + u.pathname);
    const res = await fetch(u.href, { method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (res.status === 401 || res.status === 403) throw new Error('Not signed in to Canvas in this tab');
    if (!res.ok) throw new Error('Canvas ' + res.status + ' on ' + u.pathname);
    const text = await res.text();
    const next = (res.headers.get('Link') || '').split(',').map((s) => s.match(/<([^>]+)>;\s*rel="next"/)).find(Boolean);
    return { data: JSON.parse(text.replace(/^while\(1\);/, '')), next: next ? next[1] : null };
  };
  const getAll = async (url, max = 20) => {
    const out = []; let n = url; let i = 0;
    while (n && i++ < max) { const r = await get(n); out.push(...(Array.isArray(r.data) ? r.data : [r.data])); n = r.next; }
    return out;
  };
  const self = (await get('/api/v1/users/self')).data;
  let observees = [];
  try { observees = await getAll('/api/v1/users/self/observees?per_page=50'); } catch (e) { observees = []; }
  const want = (opts.childName || '').toLowerCase().split(/[\s(]/)[0];
  const student = observees.find((o) => want && String(o.name || '').toLowerCase().includes(want)) || observees[0] || self;
  const isObserver = student.id !== self.id;
  let courses;
  try { courses = await getAll('/api/v1/users/' + student.id + '/courses?include[]=total_scores&include[]=teachers&enrollment_state=active&per_page=100'); }
  catch (e) { courses = await getAll('/api/v1/courses?include[]=total_scores&include[]=teachers&include[]=observed_users&enrollment_state=active&per_page=100'); }
  const warnings = [];
  if (observees.length > 1 && !want) warnings.push('Several students are linked to this observer account; used ' + student.name);
  const outCourses = [], assignments = [], grades = [];
  const iso = (v) => (v ? new Date(v).toISOString() : null);
  for (const c of courses) {
    if (!c || !c.id || !c.name) continue;
    const teacher = (c.teachers && c.teachers[0] && c.teachers[0].display_name) || null;
    outCourses.push({ externalId: String(c.id), name: String(c.name).slice(0, 160), teacher });
    const enr = (c.enrollments || []).find((e) => !isObserver || String(e.user_id) === String(student.id) || e.type === 'student') || (c.enrollments || [])[0];
    const score = enr && (enr.computed_current_score ?? (enr.grades && enr.grades.current_score));
    const letter = enr && (enr.computed_current_grade ?? (enr.grades && enr.grades.current_grade));
    if (score != null || letter) grades.push({ courseExternalId: String(c.id), periodLabel: 'current', kind: 'quarter', status: 'provisional', percent: score != null ? Number(score) : null, letter: letter ? String(letter).slice(0, 8) : null });
    let list = [];
    try { list = await getAll('/api/v1/courses/' + c.id + '/assignments?include[]=submission&include[]=observed_users&per_page=100'); }
    catch (e) { warnings.push('Could not read assignments for ' + c.name); continue; }
    for (const a of list) {
      let s = a.submission;
      if (Array.isArray(s)) s = s.find((x) => String(x.user_id) === String(student.id)) || null;
      let status = 'unknown';
      if (s) {
        if (s.excused) status = 'excused';
        else if (s.workflow_state === 'graded' && s.score != null) status = 'graded';
        else if (s.submitted_at || s.workflow_state === 'submitted' || s.workflow_state === 'pending_review') status = 'submitted';
        else if (s.missing) status = 'missing';
        else status = 'not_submitted';
      }
      const isQuiz = !!a.is_quiz_assignment || (a.submission_types || []).includes('online_quiz');
      assignments.push({
        courseExternalId: String(c.id), externalId: String(a.id), title: String(a.name || 'Untitled').slice(0, 300), kind: isQuiz ? 'quiz' : 'assignment',
        sourceUrl: a.html_url && String(a.html_url).startsWith('https://') ? String(a.html_url).slice(0, 500) : null,
        dueAt: iso(a.due_at), closesAt: iso(a.lock_at), pointsPossible: a.points_possible ?? null, score: s && s.score != null ? Number(s.score) : null,
        submissionStatus: status, submittedAt: iso(s && s.submitted_at), gradedAt: iso(s && s.graded_at),
        attemptsUsed: s && s.attempt != null ? Number(s.attempt) : null,
        attemptsAllowed: a.allowed_attempts > 0 ? Number(a.allowed_attempts) : null, attemptsUnlimited: a.allowed_attempts === -1,
      });
    }
  }
  return { provider: 'canvas', studentName: student.name || '', courses: outCourses.slice(0, 40), assignments: assignments.slice(0, 3000), grades, warnings };
}

/**
 * Skyward Family Access gradebook page. PROTOTYPE heuristics — district pages differ.
 * Looks for grade links that carry data-cni (course id) and data-bkt (grading bucket, e.g. Q1, S1).
 * Use "Copy page outline" to send a privacy-safe outline so the parser can be tuned to your district.
 */
export function skywardReader() {
  const warnings = [];
  if (!/sfgradebook/i.test(location.pathname + location.search) && !document.querySelector('[data-cni]')) {
    return { provider: 'skyward', courses: [], assignments: [], grades: [], warnings: ['Open the Gradebook page in Skyward Family Access first, then sync.'] };
  }
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const nameFor = (cni, link) => {
    const byAttr = document.querySelector('[data-cni="' + cni + '"].classDesc, .classDesc [data-cni="' + cni + '"]');
    if (byAttr) return { name: clean(byAttr.textContent), teacher: null };
    // Skyward often renders course names and grade cells as two tables with matching row order.
    const row = link.closest('tr');
    if (row && row.parentElement) {
      const idx = Array.prototype.indexOf.call(row.parentElement.children, row);
      const nameRows = Array.from(document.querySelectorAll('.classDesc')).map((e) => e.closest('tr')).filter(Boolean);
      const nr = nameRows.find((r) => r.parentElement && Array.prototype.indexOf.call(r.parentElement.children, r) === idx);
      if (nr) {
        const d = nr.querySelector('.classDesc a') || nr.querySelector('.classDesc');
        const t = nr.querySelector('.teacher');
        if (d) return { name: clean(d.textContent), teacher: t ? clean(t.textContent).slice(0, 120) : null };
      }
    }
    return null;
  };
  const courses = new Map(), grades = [];
  const links = Array.from(document.querySelectorAll('a[data-cni][data-bkt], [data-cni][data-bkt]'));
  for (const a of links) {
    const cni = a.getAttribute('data-cni'); const bkt = clean(a.getAttribute('data-lit') || a.getAttribute('data-bkt'));
    const txt = clean(a.textContent);
    if (!cni || !bkt || !txt) continue;
    if (!courses.has(cni)) {
      const found = nameFor(cni, a);
      if (!found) warnings.push('Course name not found for id ' + cni);
      courses.set(cni, { externalId: 'sky-' + cni, name: ((found && found.name) || 'Course ' + cni).slice(0, 160), teacher: found ? found.teacher : null });
    }
    const upper = bkt.toUpperCase();
    const kind = /^S\d|SEM/.test(upper) ? 'semester' : /^(FIN|Y|YR|EX)/.test(upper) ? 'report_card' : /^Q|^T\d|QTR/.test(upper) ? 'quarter' : null;
    if (!kind) continue; // progress reports, exams etc. are skipped rather than guessed
    const pct = txt.match(/^(\d{1,3}(?:\.\d+)?)/); const letter = txt.match(/^[A-F][+-]?$/i) ? txt.toUpperCase() : (txt.match(/[A-F][+-]?$/i) || [null])[0];
    grades.push({ courseExternalId: 'sky-' + cni, periodLabel: bkt.slice(0, 40), kind, status: kind === 'report_card' ? 'final' : 'provisional',
      percent: pct ? Number(pct[1]) : null, letter: letter ? String(letter).toUpperCase().slice(0, 8) : null });
  }
  if (!links.length) warnings.push('No grade cells recognised on this page. Use "Copy page outline" so the reader can be tuned.');
  return { provider: 'skyward', courses: Array.from(courses.values()).slice(0, 40), assignments: [], grades: grades.slice(0, 400), warnings };
}

/**
 * Privacy-safe outline of the page structure for tuning the reader: tag names, class names, ids and
 * data-* attribute NAMES only. All text and attribute VALUES are replaced, so no names or grades leave.
 */
export function pageOutline() {
  const lines = [];
  const walk = (el, depth) => {
    if (lines.length > 3000 || depth > 25) return;
    if (['SCRIPT', 'STYLE', 'SVG', 'NOSCRIPT'].includes(el.tagName)) return;
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).map((c) => '.' + c).join('');
    const id = el.id && !/\d{3,}/.test(el.id) ? '#' + el.id : el.id ? '#<id>' : '';
    const data = Array.from(el.attributes).filter((a) => a.name.startsWith('data-')).map((a) => '[' + a.name + ']').join('');
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
    const txt = own ? (/^\d+(\.\d+)?%?$/.test(own) ? ' «number»' : /^[A-F][+-]?$/.test(own) ? ' «letter»' : ' «text:' + own.length + '»') : '';
    lines.push('  '.repeat(depth) + el.tagName.toLowerCase() + id + cls + data + txt);
    for (const c of Array.from(el.children)) walk(c, depth + 1);
  };
  walk(document.body, 0);
  return lines.join('\n');
}
