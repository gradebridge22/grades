import { canvasReader, skywardReader, pageOutline } from './readers.js';

const $ = (id) => document.getElementById(id);
const VERSION = chrome.runtime.getManifest().version;
const status = (msg, kind = '') => { $('status').textContent = msg; $('status').className = kind; };
let lastPayload = null;

async function getState() { return (await chrome.storage.local.get(['appUrl', 'token', 'provider', 'childName'])) || {}; }

async function render() {
  const st = await getState();
  $('pair').hidden = !!st.token; $('sync').hidden = !st.token;
  if (st.token) {
    $('who').textContent = `Syncing for ${st.childName}`;
    $('sys').textContent = st.provider === 'skyward' ? 'Skyward Family Access' : 'Canvas';
  } else if (st.appUrl) $('appUrl').value = st.appUrl;
}

$('pairBtn').addEventListener('click', async () => {
  const appUrl = $('appUrl').value.replace(/\/+$/, '');
  if (!/^https:\/\/|^http:\/\/localhost(:\d+)?$/.test(appUrl)) return status('Use an https:// address (or http://localhost for testing).', 'err');
  status('Pairing…');
  try {
    const res = await fetch(`${appUrl}/api/extension/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: $('code').value, label: `Chrome (${navigator.platform || 'browser'})` }) });
    const j = await res.json();
    if (!res.ok) return status(j.error || 'Pairing failed', 'err');
    await chrome.storage.local.set({ appUrl, token: j.token, provider: j.provider, childName: j.childName });
    status('Paired.', 'ok'); render();
  } catch (e) { status('Could not reach OnTrack Grades at that address.', 'err'); }
});

async function activeTab() { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); return t; }

$('readBtn').addEventListener('click', async () => {
  const st = await getState(); const tab = await activeTab();
  $('preview').hidden = true; lastPayload = null;
  if (!tab || !/^https:\/\//.test(tab.url || '')) return status('Open your school page in this tab first.', 'err');
  status('Reading the page…');
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: st.provider === 'skyward' ? skywardReader : canvasReader,
      args: st.provider === 'skyward' ? [] : [{ childName: st.childName }],
    });
    if (!result || (!result.courses.length && !result.grades.length)) {
      status((result && result.warnings[0]) || 'Nothing recognised on this page.', 'err'); return;
    }
    lastPayload = { provider: st.provider, extensionVersion: VERSION, capturedAt: new Date().toISOString(),
      courses: result.courses, assignments: result.assignments, grades: result.grades };
    $('counts').innerHTML = '';
    for (const [n, label] of [[result.courses.length, 'courses'], [result.assignments.length, 'assignments'], [result.grades.length, 'grades']]) {
      const li = document.createElement('li'); li.textContent = `${n} ${label}`; $('counts').appendChild(li);
    }
    if (result.studentName) { const li = document.createElement('li'); li.textContent = `Student on page: ${result.studentName}`; $('counts').appendChild(li); }
    $('warn').innerHTML = '';
    for (const w of result.warnings.slice(0, 5)) { const li = document.createElement('li'); li.textContent = w; $('warn').appendChild(li); }
    $('preview').hidden = false; status('Check the counts, then send.');
  } catch (e) { status(String(e.message || e), 'err'); }
});

$('sendBtn').addEventListener('click', async () => {
  if (!lastPayload) return;
  const st = await getState(); status('Sending…');
  try {
    const res = await fetch(`${st.appUrl}/api/extension/ingest`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${st.token}` }, body: JSON.stringify(lastPayload) });
    const j = await res.json();
    if (res.status === 401) { await chrome.storage.local.remove(['token']); render(); return status('This browser was unpaired. Pair again.', 'err'); }
    if (!res.ok) return status(j.error || 'Sync failed', 'err');
    status(`Saved ${j.assignments} assignments and ${j.grades} grades.${j.warnings.length ? ` ${j.warnings.length} notes — see sync runs in OnTrack Grades.` : ''}`, 'ok');
    $('preview').hidden = true; lastPayload = null;
  } catch (e) { status('Could not reach OnTrack Grades.', 'err'); }
});

$('outlineBtn').addEventListener('click', async () => {
  const tab = await activeTab();
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageOutline });
    await navigator.clipboard.writeText(result);
    status('Outline copied (structure only, no personal data).', 'ok');
  } catch (e) { status('Could not read this page.', 'err'); }
});

$('unpair').addEventListener('click', async () => { await chrome.storage.local.clear(); status('Unpaired. Revoke it in OnTrack Grades too.'); render(); });

render();
