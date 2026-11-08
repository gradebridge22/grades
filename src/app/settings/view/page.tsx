import { requireMe } from '@/lib/auth/session';
import { getViewPrefs } from '@/lib/viewPrefs.server';
import { ACCENTS, SECTIONS, type SectionId } from '@/lib/viewPrefs';
import { Card, PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { saveView, resetView } from './actions';

function Choice({ name, value, current, label, sub }: { name: string; value: string; current: string; label: string; sub?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-line bg-white px-3.5 py-2.5 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
      <input type="radio" name={name} value={value} defaultChecked={current === value} className="accent-[var(--color-brand)]" />
      <span><span className="block text-sm font-semibold">{label}</span>{sub && <span className="block text-xs text-muted">{sub}</span>}</span>
    </label>
  );
}

export default async function ViewSettings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireMe();
  const v = await getViewPrefs();
  const ids = Object.keys(SECTIONS) as SectionId[];
  const sorted = [...v.order, ...ids.filter((id) => !v.order.includes(id))];
  return (
    <div className="grid gap-5">
      <PageHeader title="Customize your view" sub="Make the dashboard look and read the way you like. Saved on this device." back={sp.back ? { href: sp.back, label: 'Back' } : undefined} />
      {sp.saved && <p className="rounded-xl bg-brand-soft p-3 text-sm font-medium text-brand">Saved. Your view is updated.</p>}
      <form action={saveView} className="grid gap-5">
        <input type="hidden" name="back" value={sp.back ?? ''} />
        <Card title="Color">
          <div className="flex flex-wrap gap-2">
            {Object.entries(ACCENTS).map(([k, hex]) => (
              <label key={k} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-white py-1.5 pl-1.5 pr-4 text-sm font-semibold capitalize has-[:checked]:ring-2 has-[:checked]:ring-ink">
                <input type="radio" name="accent" value={k} defaultChecked={v.accent === k} className="sr-only" />
                <span aria-hidden className="h-8 w-8 rounded-full" style={{ background: hex }} />{k === 'ink' ? 'Charcoal' : k}
              </label>
            ))}
          </div>
        </Card>
        <div className="grid gap-5 md:grid-cols-2">
          <Card title="Font">
            <div className="grid gap-2">
              <Choice name="font" value="friendly" current={v.font} label="Friendly" sub="Rounded, bold headings" />
              <Choice name="font" value="classic" current={v.font} label="Classic" sub="Clean and neutral" />
            </div>
          </Card>
          <Card title="Spacing">
            <div className="grid gap-2">
              <Choice name="density" value="comfy" current={v.density} label="Comfortable" sub="Bigger text and space" />
              <Choice name="density" value="compact" current={v.density} label="Compact" sub="More on screen" />
            </div>
          </Card>
          <Card title="Show courses as">
            <div className="grid gap-2">
              <Choice name="courses" value="tiles" current={v.courses} label="Colorful tiles" sub="Big grade per course" />
              <Choice name="courses" value="table" current={v.courses} label="Table" sub="Every count in one grid" />
            </div>
          </Card>
          <Card title="When I open a course">
            <div className="grid gap-2">
              <Choice name="coursePage" value="gradebook" current={v.coursePage} label="Gradebook" sub="By category with weights, like Canvas" />
              <Choice name="coursePage" value="report" current={v.coursePage} label="Report card" sub="Grading periods on top, like Skyward" />
            </div>
          </Card>
        </div>
        <Card title="Dashboard sections">
          <p className="mb-3 text-xs text-muted">Turn sections on or off and number them to set the order (1 shows first).</p>
          <ul className="grid gap-2">
            {sorted.map((id, i) => (
              <li key={id} className="flex min-h-11 items-center gap-3 rounded-2xl border border-line bg-white px-3.5 py-2">
                <input id={`show_${id}`} type="checkbox" name={`show_${id}`} defaultChecked={v.order.includes(id)} className="h-5 w-5 accent-[var(--color-brand)]" />
                <label htmlFor={`show_${id}`} className="flex-1 text-sm font-semibold">{SECTIONS[id]}</label>
                <label className="flex items-center gap-1.5 text-xs text-muted">Position
                  <input type="number" name={`pos_${id}`} min={1} max={9} defaultValue={i + 1} className="input w-16 text-center" />
                </label>
              </li>
            ))}
          </ul>
        </Card>
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending="Saving…">Save my view</SubmitButton>
        </div>
      </form>
      <form action={resetView}><button className="btn-ghost">Reset to default</button></form>
    </div>
  );
}
