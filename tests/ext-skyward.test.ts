// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://skyward.example.test/scripts/wsisa.dll/WService=wsEAplus/sfgradebook001.w"}
import { describe, test, expect, beforeEach } from 'vitest';
// @ts-expect-error plain JS module
import { skywardReader, pageOutline } from '../extension/readers.js';

// SYNTHETIC fixture shaped like a Family Access gradebook (two tables with matching row order).
const FIXTURE = `
<table id="courses"><tbody>
  <tr><td class="classDesc"><a>Algebra I</a><div class="teacher">Mx. Demo Teacher</div></td></tr>
  <tr><td class="classDesc"><a>Biology</a></td></tr>
</tbody></table>
<table id="grades"><tbody>
  <tr><td><a data-cni="101" data-bkt="Q1">72</a></td><td><a data-cni="101" data-bkt="Q2">78</a></td><td><a data-cni="101" data-bkt="PR1">80</a></td><td><a data-cni="101" data-bkt="S1">B-</a></td></tr>
  <tr><td><a data-cni="202" data-bkt="Q1">84 B</a></td><td><a data-cni="202" data-bkt="Q2"></a></td></tr>
</tbody></table>`;

beforeEach(() => { document.body.innerHTML = FIXTURE; });

describe('Skyward reader (prototype)', () => {
  test('reads courses and grades by bucket; skips progress reports instead of guessing', () => {
    const r = skywardReader();
    expect(r.courses.map((c: { name: string; teacher: string | null }) => [c.name, c.teacher])).toEqual([['Algebra I', 'Mx. Demo Teacher'], ['Biology', null]]);
    const labels = r.grades.map((g: { courseExternalId: string; periodLabel: string }) => `${g.courseExternalId}:${g.periodLabel}`);
    expect(labels).toEqual(['sky-101:Q1', 'sky-101:Q2', 'sky-101:S1', 'sky-202:Q1']);
    expect(r.grades.find((g: { periodLabel: string }) => g.periodLabel === 'S1')).toMatchObject({ kind: 'semester', percent: null, letter: 'B-' });
    expect(r.grades.find((g: { courseExternalId: string }) => g.courseExternalId === 'sky-202')).toMatchObject({ percent: 84, letter: 'B' });
    expect(r.assignments).toEqual([]);
  });
  test('page outline contains structure only — no names or grades', () => {
    const o = pageOutline();
    expect(o).toContain('[data-cni][data-bkt]');
    expect(o).not.toMatch(/Algebra|Biology|Demo Teacher|\b72\b|\b84\b/);
    expect(o).toContain('«number»');
  });
});
