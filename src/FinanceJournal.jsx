import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, JOURNAL_ACTIONS, JOURNAL_KINDS, REIMBURSEMENT_STATUSES } from './model.js';

const euro = cents => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const timestamp = at => new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(at));
const delta = cents => `${cents > 0 ? '+' : ''}${euro(cents)}`;

function eventTitle(entry) {
  if (entry.action === 'baseline') return 'Journal gestartet';
  if (entry.kind === 'expense' && entry.action === 'update') {
    if (entry.before.reimbursementStatus !== 'reimbursed' && entry.after.reimbursementStatus === 'reimbursed') return 'Auslage erstattet';
    if (entry.before.reimbursementStatus === 'reimbursed' && entry.after.reimbursementStatus !== 'reimbursed') return 'Erstattung zurückgenommen';
  }
  return `${JOURNAL_KINDS[entry.kind]} ${JOURNAL_ACTIONS[entry.action].toLocaleLowerCase('de-DE')}`;
}

function ChangeDetails({ entry }) {
  const fields = [['description', 'Beschreibung'], ['amountCents', entry.kind === 'treasury' ? 'Startbestand' : 'Betrag'], ['date', 'Buchungsdatum'], ['category', 'Kategorie'], ['matchId', 'Spieltag-ID'], ['matchName', 'Gegner'], ['paidByName', 'Bezahlt von'], ['reimbursementStatus', 'Erstattung'], ['note', 'Notiz']];
  function value(snapshot, field) {
    if (!snapshot || snapshot[field] === undefined || snapshot[field] === null || snapshot[field] === '') return '-';
    if (field === 'amountCents') return euro(snapshot[field]);
    if (field === 'category') return (entry.kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)[snapshot[field]];
    if (field === 'reimbursementStatus') return REIMBURSEMENT_STATUSES[snapshot[field]];
    return snapshot[field];
  }
  const changed = fields.filter(([field]) => entry.before?.[field] !== entry.after?.[field]);
  return <details className="journal-details"><summary>Details</summary><table className="journal-change-table"><thead><tr><th>Feld</th><th>Vorher</th><th>Nachher</th></tr></thead><tbody>{changed.map(([field, label]) => <tr key={field}><th>{label}</th><td>{value(entry.before, field)}</td><td>{value(entry.after, field)}</td></tr>)}</tbody></table></details>;
}

export default function FinanceJournal({ data, entity }) {
  const [filters, setFilters] = useState({ query: '', kind: '', action: '', from: '', to: '', cashOnly: false });
  const field = (key, value) => setFilters(current => ({ ...current, [key]: value }));
  const scoped = (data.financeJournal || []).filter(entry => !entity || (entry.kind === entity.kind && entry.entityId === entity.id));
  const entries = [...scoped].reverse().filter(entry => {
    const date = new Date(entry.at).toLocaleDateString('en-CA');
    return (!filters.kind || entry.kind === filters.kind) && (!filters.action || entry.action === filters.action) &&
      (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to) && (!filters.cashOnly || entry.deltaCents !== 0) &&
      `${eventTitle(entry)} ${entry.before?.description || ''} ${entry.after?.description || ''} ${entry.before?.paidByName || ''} ${entry.after?.paidByName || ''}`.toLocaleLowerCase('de-DE').includes(filters.query.toLocaleLowerCase('de-DE'));
  });
  const hasFilters = Object.values(filters).some(Boolean);
  return <section className="journal-section" aria-label={entity ? 'Buchungsverlauf' : 'Kassenjournal'}>
    {!entity && <div className="section-heading"><h3>Kassenjournal <span className="count-badge">{scoped.length}</span></h3></div>}
    <div className="expense-filters">
      <div className="search-box"><Search size={17} /><input aria-label="Verlauf suchen" placeholder="Verlauf suchen" value={filters.query} onChange={event => field('query', event.target.value)} /></div>
      {!entity && <label>Bereich<select value={filters.kind} onChange={event => field('kind', event.target.value)}><option value="">Alle Bereiche</option>{Object.entries(JOURNAL_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
      <label>Vorgang<select value={filters.action} onChange={event => field('action', event.target.value)}><option value="">Alle Vorgänge</option>{Object.entries(JOURNAL_ACTIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Von<input type="date" value={filters.from} max={filters.to || undefined} onChange={event => field('from', event.target.value)} /></label>
      <label>Bis<input type="date" value={filters.to} min={filters.from || undefined} onChange={event => field('to', event.target.value)} /></label>
      <label className="journal-cash-filter"><input type="checkbox" checked={filters.cashOnly} onChange={event => field('cashOnly', event.target.checked)} />Nur Kassenbewegungen</label>
      {hasFilters && <button className="text-button" onClick={() => setFilters({ query: '', kind: '', action: '', from: '', to: '', cashOnly: false })}>Filter zurücksetzen</button>}
    </div>
    <div className="expense-scroll"><table className="expense-table journal-table"><thead><tr><th>Zeitpunkt</th><th>Vorgang</th><th>Buchung</th><th>Kassenänderung</th><th>Kassenstand danach</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id}>
      <td className="journal-timestamp"><time dateTime={entry.at}>{timestamp(entry.at)}</time></td><td>{eventTitle(entry)}</td>
      <td className="journal-description"><strong>{entry.after?.description || entry.before?.description || JOURNAL_KINDS[entry.kind]}</strong><ChangeDetails entry={entry} /></td>
      <td className={`expense-amount journal-delta ${entry.deltaCents > 0 ? 'journal-positive' : entry.deltaCents < 0 ? 'journal-negative' : ''}`}>{delta(entry.deltaCents)}</td><td className="expense-amount">{euro(entry.balanceAfterCents)}</td>
    </tr>)}</tbody></table></div>
    {!entries.length && <p className="empty-copy">{scoped.length ? 'Keine passenden Vorgänge.' : 'Noch keine protokollierten Änderungen.'}</p>}
  </section>;
}