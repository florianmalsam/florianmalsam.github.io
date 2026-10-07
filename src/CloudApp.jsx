import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Eye, EyeOff, LockKeyhole, LogIn, RefreshCw } from 'lucide-react';
import App from './App.jsx';
import { cloud, configured, readerEmail, teamEmail } from './cloud.js';
import { exampleData, validateState } from './model.js';
import { createSaveQueue } from './save-queue.js';

function Gate({ children }) {
  return <main className="login-page"><div className="login-photo"><img src="/tsbLogoNeu-black.png" alt="" /><span>TSB Herren 2 Stats</span></div><section className="login-content"><div className="brand"><span className="brand-mark"><img src="/tsbLogoNeu-black.png" alt="TSB Ravensburg" /></span><span>TSB Herren 2 Stats</span></div>{children}</section></main>;
}

function Login() {
  const [access, setAccess] = useState('edit');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <Gate><div className="login-title"><LockKeyhole size={22} /><span className="eyebrow">TSB HERREN 2 STATS</span><h1>Willkommen zurück.</h1></div><form onSubmit={async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await cloud.auth.signInWithPassword({ email: access === 'read' ? readerEmail : teamEmail, password });
      if (result.error) throw result.error;
      setPassword('');
    } catch (caught) {
      setError(caught.status === 400 || caught.code === 'invalid_credentials' ? 'Das Masterpasswort ist nicht korrekt.' : caught.status === 429 ? 'Zu viele Anmeldeversuche. Bitte später erneut versuchen.' : 'Anmeldung nicht möglich. Bitte Verbindung und Supabase-Einrichtung prüfen.');
    } finally { setBusy(false); }
  }}><label className="field">Zugriff<select value={access} onChange={event => setAccess(event.target.value)}><option value="edit">Bearbeiten</option><option value="read">Nur lesen</option></select></label><label className="field">Passwort<div className="password-field"><input autoFocus type={visible ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /><button type="button" title={visible ? 'Passwort verbergen' : 'Passwort anzeigen'} aria-label={visible ? 'Passwort verbergen' : 'Passwort anzeigen'} onClick={() => setVisible(current => !current)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary login-submit" disabled={busy}><LogIn size={18} />{busy ? 'Anmeldung …' : 'Anmelden'}</button></form></Gate>;
}

function downloadBackup(data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `tsb-herren-2-stats-ungespeichert-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function RemoteWorkspace({ user }) {
  const [loaded, setLoaded] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const queue = useRef(null);
  const ownerId = useRef(user.id);
  const readOnly = useRef(false);
  const statusRef = useRef('loading');
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    function updateStatus(value) {
      statusRef.current = value;
      if (!cancelled) setStatus(value);
    }
    let latestRevision = null;
    function showReadOnly(row) {
      latestRevision = row.revision;
      setLoaded({ data: validateState(row.payload), revision: row.revision, readOnly: true });
      updateStatus('saved');
    }
    function setQueue(row) {
      queue.current = createSaveQueue(async (payload, revision) => {
        const result = await cloud.rpc('save_team_state', { new_payload: payload, expected_revision: revision });
        if (result.error) throw result.error;
        if (!Number.isSafeInteger(result.data) || result.data <= revision) throw new Error('Ungültige Speicherantwort.');
        return result.data;
      }, row.revision, updateStatus, caught => {
        if (!cancelled) setError({ source: 'save', conflict: caught.code === 'P0001', text: caught.code === 'P0001' ? 'Die Daten wurden auf einem anderen Gerät geändert. Sichere deine Änderungen als Backup und lade den aktuellen Stand neu.' : 'Änderungen wurden nicht gespeichert. Bitte prüfe die Internetverbindung und versuche es erneut.' });
      });
      latestRevision = row.revision;
      setLoaded({ data: validateState(row.payload), revision: row.revision, readOnly: false });
      updateStatus('saved');
    }
    async function read() {
      const result = await cloud.from('team_state').select('owner_id, payload, revision').eq('owner_id', ownerId.current).maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    }
    async function initialize() {
      try {
        const membership = await cloud.from('team_readers').select('owner_id').eq('reader_id', user.id).maybeSingle();
        if (membership.error) throw membership.error;
        readOnly.current = Boolean(membership.data);
        ownerId.current = membership.data?.owner_id || user.id;
        let row = await read();
        if (cancelled) return;
        if (!row) {
          if (readOnly.current) throw new Error('The team linked to this reader account does not exist.');
          const payload = exampleData();
          const result = await cloud.rpc('save_team_state', { new_payload: payload, expected_revision: 0 });
          if (result.error && result.error.code !== 'P0001') throw result.error;
          row = result.error ? await read() : { payload, revision: result.data };
        }
        if (!cancelled) {
          if (readOnly.current) showReadOnly(row);
          else setQueue(row);
        }
      } catch {
        if (!cancelled) { updateStatus('error'); setError({ source: 'load', text: 'Die Mannschaftsdaten konnten nicht geladen werden. Bitte prüfe die Internetverbindung und die Supabase-Einrichtung.' }); }
      }
    }
    async function refresh() {
      if (cancelled || statusRef.current !== 'saved') return;
      if (readOnly.current) {
        try {
          const row = await read();
          if (cancelled || statusRef.current !== 'saved') return;
          if (!row) throw new Error('Team data is missing.');
          if (row.revision !== latestRevision) showReadOnly(row);
        } catch {
          if (!cancelled && statusRef.current === 'saved') { updateStatus('error'); setError({ source: 'refresh', text: 'Der gemeinsame Datenstand konnte nicht geprüft werden. Bitte lade die Seite neu.' }); }
        }
        return;
      }
      if (!queue.current) return;
      const revision = queue.current.revision();
      try {
        const row = await read();
        if (cancelled || statusRef.current !== 'saved' || queue.current.revision() !== revision) return;
        if (!row) throw new Error('Mannschaftsdaten fehlen.');
        if (row.revision !== revision) setQueue(row);
      } catch {
        if (!cancelled && statusRef.current === 'saved') { updateStatus('error'); setError({ source: 'refresh', text: 'Der gemeinsame Datenstand konnte nicht geprüft werden. Bitte lade die Seite neu, bevor du weiterbearbeitest.' }); }
      }
    }
    initialize();
    const interval = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    const beforeUnload = event => {
      if (statusRef.current === 'saving' || (statusRef.current === 'error' && queue.current?.latest())) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { cancelled = true; mounted.current = false; clearInterval(interval); window.removeEventListener('focus', refresh); window.removeEventListener('beforeunload', beforeUnload); };
  }, [user.id]);

  async function signOut() {
    if (statusRef.current === 'saving') return;
    const result = await cloud.auth.signOut({ scope: 'local' });
    if (result.error && mounted.current) setError({ source: 'logout', text: 'Abmelden ist fehlgeschlagen. Bitte versuche es erneut.' });
  }
  if (!loaded && !error) return <Gate><div className="login-title"><RefreshCw className="spinning" size={23} /><h1>Mannschaft wird geladen …</h1></div></Gate>;
  return <>
    {loaded && !error && <App key={`${user.id}:${loaded.revision}`} initialData={loaded.readOnly ? loaded.data : queue.current?.latest() || loaded.data} persist={loaded.readOnly ? undefined : next => queue.current.enqueue(next)} cloudStatus={status} readOnly={loaded.readOnly} onSignOut={signOut} />}
    {error && <div className="cloud-error-backdrop"><section className="cloud-error" role="alertdialog" aria-modal="true" aria-labelledby="cloud-error-title" tabIndex={-1} ref={element => element?.focus()}><LockKeyhole size={25} /><h2 id="cloud-error-title">{error.conflict ? 'Neuerer Datenstand vorhanden' : error.source === 'save' ? 'Nicht gespeichert' : 'Verbindung unterbrochen'}</h2><p>{error.text}</p><div className="cloud-error-actions">{queue.current?.latest() && <button className="button secondary" onClick={() => downloadBackup(queue.current.latest())}><ArrowDownToLine size={17} />Änderungen sichern</button>}{error.source === 'save' && !error.conflict ? <button className="button primary" onClick={() => { setError(null); queue.current.retry(); }}><RefreshCw size={17} />Erneut speichern</button> : <button className="button primary" onClick={() => window.location.reload()}><RefreshCw size={17} />Neu laden</button>}</div></section></div>}
  </>;
}

export default function CloudApp() {
  const [session, setSession] = useState(undefined);
  const [authError, setAuthError] = useState(false);
  const [localMode, setLocalMode] = useState(false);
  useEffect(() => {
    if (!cloud) return;
    let active = true;
    cloud.auth.getSession().then(result => {
      if (active) { setSession(result.data.session); if (result.error) setAuthError(true); }
    }).catch(() => { if (active) setAuthError(true); });
    const { data } = cloud.auth.onAuthStateChange((_event, next) => { if (active) setSession(next); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  if (!configured) {
    if (import.meta.env.DEV && localMode) return <App />;
    return <Gate><div className="login-title"><LockKeyhole size={23} /><h1>Verbindung fehlt.</h1><p>Die Supabase-Konfiguration fehlt. Bitte zuerst die Einrichtung in der Projektdatei SETUP.md abschließen.</p>{import.meta.env.DEV && <button className="button secondary login-submit" onClick={() => setLocalMode(true)}>Lokal mit Testdaten starten</button>}</div></Gate>;
  }
  if (authError) return <Gate><div className="login-title"><h1>Anmeldung nicht verfügbar.</h1><p>Bitte Browser-Speicherung und Verbindung prüfen.</p><button className="button primary" onClick={() => window.location.reload()}><RefreshCw size={17} />Neu laden</button></div></Gate>;
  if (session === undefined) return <Gate><div className="login-title"><h1>Anmeldung wird geprüft …</h1></div></Gate>;
  if (!session) return <Login />;
  return <RemoteWorkspace key={session.user.id} user={session.user} />;
}