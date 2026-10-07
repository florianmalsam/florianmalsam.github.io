import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpFromLine, CalendarDays, Car, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Euro, LogOut, MapPin, Pencil, Plus, Search, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { STORAGE_KEY, dutyPoints, exampleData, validateState, addPlayer, addEntry, updateEntry, matchFactor, playerMatchBreakdown, statistics, nextMatchId } from './model.js';

const number = value => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value);
const euro = value => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
const dateLabel = value => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
const shortDate = value => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00`));
const initials = name => name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return { data: saved ? validateState(JSON.parse(saved)) : exampleData(), warning: '' };
  } catch {
    return { data: exampleData(), warning: 'Gespeicherte Daten konnten nicht geladen werden. Beispieldaten sind geöffnet. Änderungen ersetzen die lokale Speicherung.' };
  }
}

function IconButton({ label, children, className = '', ...props }) {
  return <button className={`icon-button ${className}`} title={label} aria-label={label} {...props}>{children}</button>;
}

function ScoreHelp({ label, text }) {
  const tooltipId = useId();
  const buttonRef = useRef(null);
  const hideTimer = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  function showTooltip() {
    clearTimeout(hideTimer.current);
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(140, Math.min(window.innerWidth - 140, rect.left + rect.width / 2));
    const below = rect.bottom + 96 < window.innerHeight;
    setTooltip({ left, top: below ? rect.bottom + 8 : rect.top - 8, placement: below ? 'below' : 'above' });
  }

  function hideTooltip(delay = true) {
    clearTimeout(hideTimer.current);
    if (delay) hideTimer.current = setTimeout(() => setTooltip(null), 160);
    else setTooltip(null);
  }

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  return <>
    <button ref={buttonRef} type="button" className="icon-button score-help" aria-label={label} aria-describedby={tooltip ? tooltipId : undefined} onPointerEnter={showTooltip} onPointerLeave={() => hideTooltip()} onFocus={showTooltip} onBlur={() => hideTooltip(false)}>
      <CircleHelp size={14} />
    </button>
    {tooltip && createPortal(<div id={tooltipId} className="score-tooltip" role="tooltip" data-placement={tooltip.placement} style={{ left: tooltip.left, top: tooltip.top }} onPointerEnter={() => clearTimeout(hideTimer.current)} onPointerLeave={() => hideTooltip()}>{text}</div>, document.body)}
  </>;
}

function Avatar({ name, index = 0, scoreSoll, scoreIst }) {
  const ratio = scoreSoll > 0 ? scoreIst / scoreSoll : scoreIst > 0 ? 1 : null;
  const hue = ratio === null ? null : Math.round(120 * Math.min(ratio, 1));
  const style = hue === null ? undefined : { backgroundColor: `hsl(${hue} 75% 89%)`, color: `hsl(${hue} 60% 30%)` };
  return <span className={`avatar avatar-${index % 4}`} style={style} aria-hidden="true">{initials(name)}</span>;
}

function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} onCancel={onClose} onClick={event => { if (event.target === ref.current) onClose(); }}>
    <div className="modal-heading"><h2>{title}</h2><IconButton label="Schließen" onClick={onClose}><X size={20} /></IconButton></div>
    {children}
  </dialog>;
}

function NumericInput({ value, onChange, label, integer = false, disabled = false, className = '', decimalPlaces = null }) {
  const format = amount => decimalPlaces === null ? String(amount) : amount.toFixed(decimalPlaces);
  const [draft, setDraft] = useState(format(value));
  useEffect(() => setDraft(current => current !== '' && Number(current) === value ? current : decimalPlaces === null ? String(value) : value.toFixed(decimalPlaces)), [value, decimalPlaces]);
  function submit() {
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isSafeInteger(parsed))) {
      setDraft(format(value));
      return;
    }
    setDraft(format(parsed));
    onChange(parsed);
  }
  return <input className={`number-input ${className}`} type="number" min="0" step={integer ? '1' : '0.01'} inputMode={integer ? 'numeric' : 'decimal'} value={draft} disabled={disabled} aria-label={label} onChange={event => {
    setDraft(event.target.value);
    const parsed = Number(event.target.value);
    if (event.target.value !== '' && Number.isFinite(parsed) && parsed >= 0 && (!integer || Number.isSafeInteger(parsed))) onChange(parsed);
  }} onBlur={submit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
}

function Toggle({ value, onChange, label, driver = false, disabled = false }) {
  return <label className={`check-toggle ${value ? 'is-checked' : ''} ${driver ? 'driver-toggle' : ''} ${disabled ? 'is-disabled' : ''}`} title={label}>
    <input type="checkbox" checked={value} disabled={disabled} onChange={event => onChange(event.target.checked)} aria-label={label} />
    <span>{value ? (driver ? <Car size={16} /> : <Check size={16} />) : <span className="check-empty" />}</span>
  </label>;
}

function PlayerForm({ data, player, onSave, onClose, fromRoster }) {
  const [name, setName] = useState(player?.name || '');
  const [error, setError] = useState('');
  return <Modal title={player ? 'Spieler bearbeiten' : 'Spieler anlegen'} onClose={onClose}>
    <form onSubmit={event => {
      event.preventDefault();
      try {
        const next = player ? validateState({ ...data, players: data.players.map(item => item.id === player.id ? { ...item, name: name.trim().replace(/\s+/g, ' ') } : item) }) : addPlayer(data, name);
        onSave(next, fromRoster ? next.players.at(-1).id : null);
      } catch (caught) { setError(caught.message); }
    }}>
      <label className="field">Name<input autoFocus required maxLength={80} placeholder="Vorname, bei Bedarf Nachname" value={name} onChange={event => setName(event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Abbrechen</button><button className="button primary"><Check size={17} />{player ? 'Speichern' : 'Spieler anlegen'}</button></div>
    </form>
  </Modal>;
}

function MatchForm({ data, match, onSave, onClose }) {
  const [values, setValues] = useState(match || { id: nextMatchId(data), date: new Date().toLocaleDateString('en-CA'), location: '', opponent: '', standardKm: 0 });
  const [error, setError] = useState('');
  const field = (key, value) => setValues(current => ({ ...current, [key]: value }));
  return <Modal title={match ? 'Spieltag bearbeiten' : 'Neuer Spieltag'} onClose={onClose}>
    <form onSubmit={event => {
      event.preventDefault();
      try {
        const clean = { ...values, location: values.location.trim(), opponent: values.opponent.trim() };
        const next = validateState({ ...data, matches: match ? data.matches.map(item => item.id === match.id ? clean : item) : [...data.matches, clean] });
        onSave(next, clean.id);
      } catch (caught) { setError(caught.message); }
    }}>
      <div className="form-grid"><label className="field">Spieltag-ID<input value={values.id} readOnly /></label><label className="field">Datum<input type="date" required value={values.date} onChange={event => field('date', event.target.value)} /></label></div>
      <label className="field">Spielort<input autoFocus required maxLength={160} placeholder="Sporthalle" value={values.location} onChange={event => field('location', event.target.value)} /></label>
      <label className="field">Gegner<input required maxLength={160} placeholder="Ein oder mehrere Teams" value={values.opponent} onChange={event => field('opponent', event.target.value)} /></label>
      <label className="field">Standard-km · Hin- und Rückfahrt<input type="number" min="0" step="0.01" required value={values.standardKm} onChange={event => field('standardKm', Number(event.target.value))} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Abbrechen</button><button className="button primary"><Check size={17} />{match ? 'Speichern' : 'Spieltag anlegen'}</button></div>
    </form>
  </Modal>;
}

function RosterPicker({ data, matchId, onSave, onClose, onNewPlayer }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const totalsById = new Map(statistics(data).map(player => [player.id, player]));
  const present = new Set(data.entries.filter(entry => entry.matchId === matchId).map(entry => entry.playerId));
  const available = data.players.filter(player => !present.has(player.id));
  const filtered = available.filter(player => player.name.toLocaleLowerCase('de-DE').includes(query.toLocaleLowerCase('de-DE')));
  return <Modal title="Spieler auswählen" onClose={onClose}>
    <div className="search-box"><Search size={17} /><input autoFocus placeholder="Spieler suchen" aria-label="Spieler im Team suchen" value={query} onChange={event => setQuery(event.target.value)} /></div>
    <div className="picker-list">
      {filtered.map(player => { const stats = totalsById.get(player.id); return <label className="picker-row" key={player.id}><Avatar name={player.name} index={data.players.indexOf(player)} scoreSoll={stats.scoreSoll} scoreIst={stats.scoreIst} /><span>{player.name}</span><input type="checkbox" checked={selected.includes(player.id)} onChange={event => setSelected(current => event.target.checked ? [...current, player.id] : current.filter(id => id !== player.id))} /></label>; })}
      {!filtered.length && <p className="empty-copy">{available.length ? 'Keine Spieler gefunden.' : 'Alle Spieler sind bereits dabei.'}</p>}
    </div>
    <div className="picker-tools"><button className="text-button" onClick={onNewPlayer}><Plus size={16} />Neuen Spieler anlegen</button>{filtered.length > 0 && <button className="text-button" onClick={() => setSelected(current => [...new Set([...current, ...filtered.map(player => player.id)])])}><CheckCheck size={16} />Alle auswählen</button>}</div>
    <div className="modal-actions"><button className="button secondary" onClick={onClose}>Abbrechen</button><button className="button primary" disabled={!selected.length} onClick={() => {
      const next = selected.reduce((state, playerId) => addEntry(state, matchId, playerId), data);
      onSave(next);
    }}><Plus size={17} />{selected.length ? `${selected.length} hinzufügen` : 'Hinzufügen'}</button></div>
  </Modal>;
}

export default function App({ initialData, persist, cloudStatus, readOnly = false, onSignOut } = {}) {
  const [initial] = useState(() => initialData ? { data: initialData, warning: '' } : loadData());
  const [data, setData] = useState(initial.data);
  const [view, setView] = useState('matches');
  const [selectedId, setSelectedId] = useState(initial.data.matches[0]?.id || null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [statsSort, setStatsSort] = useState({ field: 'name', direction: 'asc' });
  const [expandedPlayers, setExpandedPlayers] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(initial.warning ? { text: initial.warning, error: true } : null);
  const [saveError, setSaveError] = useState(false);
  const fileInput = useRef(null);
  const match = data.matches.find(item => item.id === selectedId);
  const totals = statistics(data).sort((first, second) => {
    const firstValue = first[statsSort.field];
    const secondValue = second[statsSort.field];
    const comparison = typeof firstValue === 'string' ? firstValue.localeCompare(secondValue, 'de-DE', { numeric: true }) : firstValue - secondValue;
    return statsSort.direction === 'asc' ? comparison : -comparison;
  });
  const totalsById = new Map(totals.map(player => [player.id, player]));
  const matchEntries = data.entries.filter(entry => entry.matchId === selectedId);
  const matchTarget = match ? matchFactor(data, match.id) : 0;
  const filteredEntries = matchEntries.filter(entry => {
    const player = data.players.find(item => item.id === entry.playerId);
    return player.name.toLocaleLowerCase('de-DE').includes(query.toLocaleLowerCase('de-DE')) && (filter === 'all' || (filter === 'played' && entry.played) || (filter === 'drivers' && entry.drove) || (filter === 'duties' && entry.ref1 + entry.ref2 + entry.table + (entry.lines || 0) + (entry.extra || 0) > 0));
  });
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  function commit(next, message) {
    if (readOnly) return false;
    try {
      validateState(next);
      setData(next);
      try {
        if (persist) persist(next);
        else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setSaveError(false);
        if (message) setNotice({ text: message });
      } catch {
        setSaveError(true);
        setNotice({ text: 'Lokale Speicherung nicht verfügbar. Bitte ein Backup exportieren, bevor du die Seite schließt.', error: true });
      }
      return true;
    } catch (caught) { setNotice({ text: caught.message, error: true }); return false; }
  }

  function changeEntry(playerId, patch) {
    try { commit(updateEntry(data, selectedId, playerId, patch)); } catch (caught) { setNotice({ text: caught.message, error: true }); }
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tsb-herren-2-stats-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice({ text: 'Backup exportiert.' });
  }

  async function importData(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('Die Backup-Datei ist zu groß (maximal 5 MB).');
      const imported = validateState(JSON.parse(await file.text()));
      setDialog({ type: 'import', data: imported });
    } catch (caught) { setNotice({ text: caught instanceof SyntaxError ? 'Die Datei enthält kein gültiges JSON-Backup.' : caught.message, error: true }); }
  }

  function chooseMatch(id) { setSelectedId(id); setQuery(''); setFilter('all'); }
  const closeDialog = () => setDialog(null);
  const sum = field => totals.reduce((total, item) => total + item[field], 0);
  const totalSoll = sum('scoreSoll');
  const totalIst = sum('scoreIst');
  const eligiblePlayers = totals.filter(player => player.played > 0 || player.scoreIst > 0);
  const playersBelowTarget = eligiblePlayers.filter(player => player.scoreIst + 1e-9 < player.scoreSoll).length;
  const playersAtOrAboveTarget = eligiblePlayers.length - playersBelowTarget;
  const outstandingScore = totals.reduce((total, player) => total + Math.max(0, player.scoreSoll - player.scoreIst), 0);
  const targetReachedPercent = eligiblePlayers.length ? playersAtOrAboveTarget / eligiblePlayers.length * 100 : 0;

  return <div className="app">
    <header className="topbar">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); setView('matches'); }}><span className="brand-mark"><img src="/tsbLogoNeu-black.png" alt="TSB Ravensburg" /></span><span>TSB Herren 2 Stats</span></a>
      <nav className="main-nav" aria-label="Hauptnavigation"><button className={view === 'matches' ? 'active' : ''} onClick={() => { setView('matches'); setQuery(''); }}><CalendarDays size={18} />Spieltage</button><button className={view === 'team' ? 'active' : ''} onClick={() => { setView('team'); setQuery(''); }}><Users size={18} />Mannschaft</button></nav>
      <div className="header-tools"><span className={`save-status ${saveError || cloudStatus === 'error' ? 'save-failed' : ''}`} role="status"><span />{readOnly ? 'Nur Lesen' : saveError || cloudStatus === 'error' ? 'Nicht gespeichert' : cloudStatus === 'saving' ? 'Wird gespeichert …' : cloudStatus === 'saved' ? 'Gemeinsam gespeichert' : 'Lokal gespeichert'}</span><div className="backup-tools"><IconButton label="Backup importieren" disabled={readOnly} onClick={() => fileInput.current.click()}><ArrowUpFromLine size={18} /></IconButton><IconButton label="Backup exportieren" onClick={exportData}><ArrowDownToLine size={18} /></IconButton>{onSignOut && <IconButton label="Abmelden" disabled={cloudStatus === 'saving'} onClick={onSignOut}><LogOut size={18} /></IconButton>}</div><input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={importData} /></div>
    </header>

    {view === 'matches' ? <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-title"><div><span className="eyebrow">DEIN TEAMKALENDER</span><h1>Spieltage<span className="count-badge">{data.matches.length}</span></h1></div><IconButton label="Neuer Spieltag" className="add-match-icon" disabled={readOnly} onClick={() => setDialog({ type: 'match' })}><Plus size={20} /></IconButton></div>
        <div className="match-list">{[...data.matches].sort((first, second) => first.date.localeCompare(second.date)).map(item => <button key={item.id} className={`match-item ${item.id === selectedId ? 'selected' : ''}`} onClick={() => chooseMatch(item.id)}><div className="match-date"><span>{new Date(`${item.date}T12:00:00`).getDate()}</span><small>{new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(new Date(`${item.date}T12:00:00`)).replace('.', '')}</small></div><div className="match-item-info"><strong>{item.opponent}</strong><span>{item.location}</span><small>{item.id} <span>·</span> {new Date(`${item.date}T12:00:00`).getFullYear()}</small></div><ChevronRight size={16} /></button>)}</div>
        {!data.matches.length && <p className="empty-copy">Noch keine Spieltage.</p>}
        <button className="button sidebar-add" disabled={readOnly} onClick={() => setDialog({ type: 'match' })}><Plus size={17} />Spieltag anlegen</button>
        <div className="sidebar-bottom"><span className="local-label"><ShieldCheck size={14} />{persist ? 'Geschützter Mannschaftsspeicher' : 'Auf diesem Gerät gespeichert'}</span></div>
      </aside>
      <main className="main-content">
        {match ? <>
          <div className="breadcrumb">Spieltage <ChevronRight size={13} /><span>{match.id}</span></div>
          <div className="match-heading"><div><div className="date-kicker"><CalendarDays size={15} />{dateLabel(match.date)}</div><h2>{match.opponent}</h2><div className="match-meta"><span><MapPin size={16} />{match.location}</span><span className="meta-divider" /><span><Car size={16} />{number(match.standardKm)} km Standardstrecke</span></div></div><div className="heading-actions"><IconButton label="Spieltag bearbeiten" disabled={readOnly} onClick={() => setDialog({ type: 'match', match })}><Pencil size={18} /></IconButton><IconButton label="Spieltag löschen" className="danger-hover" disabled={readOnly} onClick={() => setDialog({ type: 'deleteMatch', match })}><Trash2 size={18} /></IconButton></div></div>
          <div className="match-summary">
            <div><span className="summary-icon yellow"><ClipboardList size={20} /></span><span><strong>{number(matchTarget)}<small> Pkt.</small></strong><span>Zielbeitrag je Teilnahme</span></span></div>
            <div><span className="summary-icon green"><Users size={20} /></span><span><strong>{matchEntries.filter(entry => entry.played).length}<small> / {matchEntries.length}</small></strong><span>Spieler auf dem Feld</span></span></div>
            <div><span className="summary-icon blue"><Car size={20} /></span><span><strong>{matchEntries.filter(entry => entry.drove).length}</strong><span>Fahrer</span></span></div>
            <div><span className="summary-icon coral"><MapPin size={20} /></span><span><strong>{number(matchEntries.reduce((total, entry) => total + entry.km, 0))}<small> km</small></strong><span>Gefahrene Strecke</span></span></div>
          </div>
          <section className="roster-section">
            <div className="section-heading"><div><h3>Aufstellung & Dienste <span className="count-badge">{matchEntries.length}</span></h3></div><button className="button primary" disabled={readOnly} onClick={() => setDialog({ type: 'roster' })}><Plus size={17} />Spieler hinzufügen</button></div>
            <div className="table-toolbar"><div className="search-box"><Search size={17} /><input placeholder="Spieler suchen …" aria-label="Aufstellung nach Spieler filtern" value={query} onChange={event => setQuery(event.target.value)} /></div><select aria-label="Einsätze filtern" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Alle Spieler</option><option value="played">Gespielt</option><option value="drivers">Fahrer</option><option value="duties">Mit Dienst</option></select><span className="roster-counter">{filteredEntries.length} Spieler</span></div>
            <div className="roster-table" role="table" aria-label="Aufstellung und Dienste">
              <div className="roster-table-head" role="row"><span role="columnheader">Spieler</span><span role="columnheader">Gespielt</span><span role="columnheader">Gefahren</span><span role="columnheader">Kilometer ↔</span><span role="columnheader">1. Schiri</span><span role="columnheader">2. Schiri</span><span role="columnheader">Tafel</span><span role="columnheader">Linien</span><span role="columnheader">Extra</span><span role="columnheader" aria-label="Aktionen" /></div>
              {filteredEntries.map(entry => {
                const player = data.players.find(item => item.id === entry.playerId);
                return <div className="roster-row" key={entry.playerId} role="row">
                  <div className="player-cell" role="cell"><Avatar name={player.name} index={data.players.indexOf(player)} scoreSoll={totalsById.get(player.id).scoreSoll} scoreIst={totalsById.get(player.id).scoreIst} /><div><strong>{player.name}</strong><span>{entry.played ? 'Im Einsatz' : 'Nicht gespielt'}</span></div></div>
                  <div className="roster-cell checkbox-cell" role="cell" data-label="Gespielt"><Toggle value={entry.played} disabled={readOnly} onChange={played => changeEntry(player.id, { played })} label={`${player.name}: Gespielt`} /></div>
                  <div className="roster-cell checkbox-cell" role="cell" data-label="Gefahren"><Toggle driver value={entry.drove} disabled={readOnly} onChange={drove => changeEntry(player.id, { drove })} label={`${player.name}: Gefahren`} /></div>
                  <div className="roster-cell km-cell" role="cell" data-label="Kilometer ↔"><div className="km-input"><NumericInput value={entry.km} disabled={readOnly || !entry.drove} label={`${player.name}: Kilometer hin und zurück`} onChange={km => changeEntry(player.id, { km })} /><span>km</span></div></div>
                  {['ref1', 'ref2', 'table', 'lines'].map((field, index) => <div className="roster-cell duty-cell" role="cell" data-label={['1. Schiri', '2. Schiri', 'Tafel', 'Linien'][index]} key={field}><Toggle value={(entry[field] || 0) > 0} disabled={readOnly} onChange={checked => changeEntry(player.id, { [field]: checked ? 1 : 0 })} label={`${player.name}: ${['1. Schiri', '2. Schiri', 'Tafel', 'Linien'][index]}`} /></div>)}
                  <div className="roster-cell extra-cell" role="cell" data-label="Extra"><div className="extra-input"><NumericInput value={entry.extra || 0} disabled={readOnly} integer label={`${player.name}: Extra-Punkte`} onChange={extra => changeEntry(player.id, { extra })} /></div></div>
                  <div className="remove-cell" role="cell"><IconButton label={`${player.name} aus Spieltag entfernen`} className="danger-hover" disabled={readOnly} onClick={() => setDialog({ type: 'removeEntry', player })}><X size={16} /></IconButton></div>
                </div>;
              })}
              {!filteredEntries.length && <div className="empty-state"><Users size={30} /><h4>{matchEntries.length ? 'Keine passenden Spieler' : 'Wer ist dabei?'}</h4>{!matchEntries.length && <button className="button secondary" disabled={readOnly} onClick={() => setDialog({ type: 'roster' })}><Plus size={16} />Spieler auswählen</button>}{matchEntries.length > 0 && <button className="text-button" onClick={() => { setQuery(''); setFilter('all'); }}>Filter zurücksetzen</button>}</div>}
            </div>
            <div className="roster-footer"><span><CheckCheck size={15} />{match.id} · {shortDate(match.date)}</span><span>{euro(matchEntries.reduce((total, entry) => total + entry.km, 0) * data.rate)} Fahrtkostenerstattung</span></div>
          </section>
          <div className="match-bottom"><span className="tiny-label">MANNSCHAFTSBILANZ</span><button className="text-button" onClick={() => { setView('team'); setQuery(''); }}>Zur Gesamtübersicht <ChevronRight size={16} /></button></div>
        </> : <div className="empty-state page-empty"><CalendarDays size={40} /><h2>Dein erster Spieltag</h2><button className="button primary" disabled={readOnly} onClick={() => setDialog({ type: 'match' })}><Plus size={17} />Spieltag anlegen</button></div>}
      </main>
    </div> : <main className="team-page">
      <div className="breadcrumb">Dein Team <ChevronRight size={13} /><span>Mannschaft</span></div>
      <div className="team-heading"><div><span className="eyebrow">ZUSAMMEN IM EINSATZ</span><h1>Mannschaft</h1><p>{data.players.length} Spieler · {data.matches.length} Spieltage</p></div><button className="button primary" disabled={readOnly} onClick={() => setDialog({ type: 'player' })}><Plus size={17} />Spieler anlegen</button></div>
      <div className="team-summary"><div><span>Gespielte Einsätze</span><strong>{sum('played')}</strong></div><div><span>Gefahrene Kilometer</span><strong>{number(sum('km'))}<small> km</small></strong></div><div><span>Übernommene Dienste</span><strong>{sum('ref1') + sum('ref2') + sum('table') + sum('lines')}</strong></div><div><span>Fahrtkostenerstattung</span><strong>{euro(sum('reimbursement'))}</strong></div></div>
      <section className="score-overview" aria-label="Gesamt-Punktebilanz">
        <div className="score-overview-heading"><span className="eyebrow">INDIVIDUELLER AUSGLEICH</span><strong>Wie ausgewogen ist das Team?</strong></div>
        <div className="score-overview-values"><div className="score-overview-metric score-metric-behind"><span>Unter Ziel</span><strong>{playersBelowTarget}<small> Spieler</small></strong></div><div className="score-overview-metric score-metric-reached"><span>Ziel erreicht</span><strong>{playersAtOrAboveTarget}<small> Spieler</small></strong></div><div className="score-overview-metric"><span>Offener Ausgleich</span><strong>{number(outstandingScore)}<small> Pkt.</small></strong></div></div>
        <div className="score-overview-progress"><div><span>Spieler im oder über Ziel</span><strong>{number(targetReachedPercent)}%</strong></div><div className="score-progress-track" role="progressbar" aria-label="Spieler im oder über Ziel" aria-valuemin="0" aria-valuemax="100" aria-valuenow={targetReachedPercent}><span style={{ width: `${targetReachedPercent}%` }} /></div></div>
      </section>
      <div className="team-section-heading"><h3>Die Mannschaftsbilanz</h3><div className="team-controls"><label className="rate-control"><Euro size={16} /><span>pro km</span><NumericInput value={data.rate} disabled={readOnly} decimalPlaces={2} label="Euro pro Kilometer" onChange={rate => commit({ ...data, rate })} /><span>€</span></label><div className="score-control"><span>Punkte je Aufgabe</span>{[['ref1', '1. Schiri'], ['ref2', '2. Schiri'], ['table', 'Tafel'], ['lines', 'Linien'], ['drive', 'Fahren']].map(([field, label]) => <label key={field}>{label}<NumericInput value={dutyPoints(data)[field]} disabled={readOnly} label={`${label}: Punkte`} onChange={value => commit({ ...data, dutyPoints: { ...dutyPoints(data), [field]: value } })} /></label>)}</div></div></div>
      <div className="table-toolbar"><div className="search-box"><Search size={17} /><input placeholder="Spieler suchen …" aria-label="Mannschaft nach Spieler filtern" value={query} onChange={event => setQuery(event.target.value)} /></div><div className="stats-sort-control"><label htmlFor="stats-sort">Sortieren nach</label><select id="stats-sort" value={statsSort.field} onChange={event => setStatsSort(current => ({ ...current, field: event.target.value }))}><option value="name">Spieler</option><option value="played">Gespielt</option><option value="drove">Fahrtage</option><option value="km">Kilometer</option><option value="ref1">1. Schiri</option><option value="ref2">2. Schiri</option><option value="table">Tafel</option><option value="lines">Linien</option><option value="extra">Extra</option><option value="scoreSoll">Zielbeitrag</option><option value="scoreIst">Beitrag</option><option value="reimbursement">Erstattung</option></select><IconButton label={`Sortierung ${statsSort.direction === 'asc' ? 'aufsteigend' : 'absteigend'}`} onClick={() => setStatsSort(current => ({ ...current, direction: current.direction === 'asc' ? 'desc' : 'asc' }))}>{statsSort.direction === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}</IconButton></div><span className="roster-counter">Alle Spieltage</span></div>
      <div className="stats-scroll"><table className="stats-table"><thead><tr><th>Spieler</th><th>Gespielt</th><th>Fahrtage</th><th>Kilometer</th><th>1. Schiri</th><th>2. Schiri</th><th>Tafel</th><th>Linien</th><th>Extra</th><th className="score-column score-column-soll"><span className="score-help-label">Zielbeitrag<ScoreHelp label="Zielbeitrag erklären" text="Dein anteiliger Teamaufwand. Dienste, Fahren und Extra-Punkte eines Spieltags werden auf alle dort gespielten Teilnahmen verteilt." /></span></th><th className="score-column score-column-ist"><span className="score-help-label">Beitrag<ScoreHelp label="Beitrag erklären" text="Deine gesammelten Punkte aus übernommenen Diensten, Fahren und Extra-Punkten." /></span></th><th>Erstattung</th><th aria-label="Aktionen" /></tr></thead><tbody>{totals.filter(player => player.name.toLocaleLowerCase('de-DE').includes(query.toLocaleLowerCase('de-DE'))).flatMap(player => { const expanded = expandedPlayers.includes(player.id); const breakdown = expanded ? playerMatchBreakdown(data, player.id) : []; return [<tr key={player.id}><td><div className="player-cell"><button type="button" className={`player-expand ${expanded ? 'is-open' : ''}`} aria-expanded={expanded} aria-label={`Spieltage von ${player.name} ${expanded ? 'ausblenden' : 'anzeigen'}`} onClick={() => setExpandedPlayers(current => current.includes(player.id) ? current.filter(id => id !== player.id) : [...current, player.id])}><Avatar name={player.name} index={data.players.findIndex(item => item.id === player.id)} scoreSoll={player.scoreSoll} scoreIst={player.scoreIst} /><strong>{player.name}</strong><ChevronDown size={15} className="player-expand-icon" /></button></div></td><td><span className="played-stat">{player.played}</span></td><td>{player.drove}</td><td>{number(player.km)}<span className="unit"> km</span></td><td>{player.ref1}</td><td>{player.ref2}</td><td>{player.table}</td><td>{player.lines}</td><td>{player.extra}</td><td className="score-cell score-column-soll">{number(player.scoreSoll)}</td><td className="score-cell score-column-ist">{number(player.scoreIst)}</td><td className="money-cell">{euro(player.reimbursement)}</td><td><div className="row-actions"><IconButton label={`${player.name} bearbeiten`} disabled={readOnly} onClick={() => setDialog({ type: 'player', player })}><Pencil size={15} /></IconButton><IconButton label={`${player.name} löschen`} className="danger-hover" disabled={readOnly} onClick={() => setDialog({ type: 'deletePlayer', player })}><Trash2 size={15} /></IconButton></div></td></tr>, expanded && <tr key={`${player.id}-details`} className="player-breakdown-row"><td colSpan={13}>{breakdown.length ? <div className="player-breakdown"><div className="player-breakdown-head"><span>Spieltag</span><span>Status</span><span>Zielbeitrag</span><span>Beitrag</span><span>Differenz</span></div>{breakdown.map(row => <div className="player-breakdown-item" key={row.matchId}><span><strong>{row.opponent}</strong><small>{row.matchId} · {shortDate(row.date)}</small></span><span>{row.played ? 'Gespielt' : 'Nicht gespielt'}</span><span>{number(row.zielbeitrag)}</span><span>{number(row.beitrag)}</span><span className={row.beitrag - row.zielbeitrag < -1e-9 ? 'breakdown-behind' : row.beitrag - row.zielbeitrag > 1e-9 ? 'breakdown-ahead' : ''}>{row.beitrag - row.zielbeitrag > 1e-9 ? '+' : ''}{number(row.beitrag - row.zielbeitrag)}</span></div>)}</div> : <p className="empty-copy">Noch keine Spieltage für {player.name}.</p>}</td></tr>]; })}</tbody><tfoot><tr><td>Gesamt</td><td>{sum('played')}</td><td>{sum('drove')}</td><td>{number(sum('km'))} km</td><td>{sum('ref1')}</td><td>{sum('ref2')}</td><td>{sum('table')}</td><td>{sum('lines')}</td><td>{sum('extra')}</td><td className="score-column-soll">{number(totalSoll)}</td><td className="score-column-ist">{number(totalIst)}</td><td>{euro(sum('reimbursement'))}</td><td /></tr></tfoot></table></div>
      {!data.players.length && <div className="empty-state"><Users size={32} /><h4>Deine Mannschaft beginnt hier</h4><button className="button secondary" disabled={readOnly} onClick={() => setDialog({ type: 'player' })}><Plus size={17} />Spieler anlegen</button></div>}
    </main>}
    <footer className="app-footer"><span>TSB Herren 2 Stats</span><span>Dein Team. Euer Spiel.</span><span>Volleyball · Teamorganisation</span></footer>
    {notice && <div className={`toast ${notice.error ? 'toast-error' : ''}`} role={notice.error ? 'alert' : 'status'}>{!notice.error && <Check size={18} />}<span>{notice.text}</span><IconButton label="Meldung schließen" onClick={() => setNotice(null)}><X size={16} /></IconButton></div>}
    {dialog?.type === 'player' && <PlayerForm key={dialog.player?.id || 'new'} data={data} player={dialog.player} fromRoster={dialog.fromRoster} onClose={closeDialog} onSave={(next, playerId) => {
      const final = playerId ? addEntry(next, selectedId, playerId) : next;
      if (commit(final, dialog.player ? 'Spieler aktualisiert.' : 'Spieler angelegt.')) closeDialog();
    }} />}
    {dialog?.type === 'match' && <MatchForm data={data} match={dialog.match} onClose={closeDialog} onSave={(next, id) => { if (commit(next, 'Spieltag gespeichert.')) { chooseMatch(id); closeDialog(); } }} />}
    {dialog?.type === 'roster' && <RosterPicker data={data} matchId={selectedId} onClose={closeDialog} onNewPlayer={() => setDialog({ type: 'player', fromRoster: true })} onSave={next => { if (commit(next, 'Aufstellung ergänzt.')) closeDialog(); }} />}
    {['deletePlayer', 'deleteMatch', 'removeEntry'].includes(dialog?.type) && <Modal title={dialog.type === 'deletePlayer' ? 'Spieler löschen?' : dialog.type === 'deleteMatch' ? 'Spieltag löschen?' : 'Spieler entfernen?'} onClose={closeDialog}><p className="confirm-copy">{dialog.type === 'deletePlayer' ? `${dialog.player.name} und alle zugehörigen Einsätze werden endgültig gelöscht.` : dialog.type === 'deleteMatch' ? `${dialog.match.id} gegen ${dialog.match.opponent} und alle zugehörigen Einsätze werden endgültig gelöscht.` : `Der Eintrag von ${dialog.player.name} für ${selectedId} wird gelöscht. Der Spieler bleibt in der Mannschaft.`}</p><div className="modal-actions"><button className="button secondary" onClick={closeDialog}>Abbrechen</button><button className="button danger" onClick={() => {
      const next = dialog.type === 'deletePlayer' ? { ...data, players: data.players.filter(player => player.id !== dialog.player.id), entries: data.entries.filter(entry => entry.playerId !== dialog.player.id) } : dialog.type === 'deleteMatch' ? { ...data, matches: data.matches.filter(item => item.id !== dialog.match.id), entries: data.entries.filter(entry => entry.matchId !== dialog.match.id) } : { ...data, entries: data.entries.filter(entry => !(entry.playerId === dialog.player.id && entry.matchId === selectedId)) };
      if (commit(next, 'Eintrag gelöscht.')) { if (dialog.type === 'deleteMatch') chooseMatch(next.matches[0]?.id || null); closeDialog(); }
    }}><Trash2 size={16} />{dialog.type === 'removeEntry' ? 'Entfernen' : 'Endgültig löschen'}</button></div></Modal>}
    {dialog?.type === 'import' && <Modal title="Backup wiederherstellen?" onClose={closeDialog}><p className="confirm-copy">{dialog.data.players.length} Spieler, {dialog.data.matches.length} Spieltage und {dialog.data.entries.length} Einsätze werden geladen. Die aktuellen Daten werden vollständig ersetzt.</p><div className="modal-actions"><button className="button secondary" onClick={closeDialog}>Abbrechen</button><button className="button primary" onClick={() => { if (commit(dialog.data, 'Backup wiederhergestellt.')) { chooseMatch(dialog.data.matches[0]?.id || null); setView('matches'); closeDialog(); } }}><ArrowUpFromLine size={16} />Wiederherstellen</button></div></Modal>}
  </div>;
}