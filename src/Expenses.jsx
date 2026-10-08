import React, { useState } from 'react';
import { Check, History, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, REIMBURSEMENT_STATUSES, expenseTotals, expensePayer, incomeTotal, moneyCents, treasuryTotals, validateState } from './model.js';

const euro = cents => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const dateLabel = date => new Intl.DateTimeFormat('de-DE').format(new Date(`${date}T12:00:00`));

export function ExpenseForm({ data, expense, matchId = null, onSave, onClose, kind = 'expense' }) {
  const isIncome = kind === 'income';
  const categories = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const collection = isIncome ? 'incomes' : 'expenses';
  const [values, setValues] = useState(expense || {
    date: data.matches.find(match => match.id === matchId)?.date || new Date().toLocaleDateString('en-CA'), description: '', category: 'catering', matchId, note: '',
    ...(isIncome ? {} : { paidByPlayerId: null, reimbursementStatus: 'not_required' }),
  });
  const [amount, setAmount] = useState(expense ? (expense.amountCents / 100).toFixed(2).replace('.', ',') : '');
  const [error, setError] = useState('');
  const field = (key, value) => setValues(current => ({ ...current, [key]: value }));

  function selectMatch(id) {
    const match = data.matches.find(item => item.id === id);
    setValues(current => ({ ...current, matchId: id || null, date: match?.date || current.date }));
  }

  function submit(event) {
    event.preventDefault();
    try {
      const amountCents = moneyCents(amount);
      if (!isIncome && values.paidByPlayerId === undefined) throw new Error('Bitte einen Spieler oder die Mannschaftskasse auswählen.');
      const { paidBy, ...linkedValues } = values;
      const clean = { ...linkedValues, id: expense?.id || crypto.randomUUID(), amountCents, description: values.description.trim(), note: values.note.trim() };
      const next = validateState({ ...data, [collection]: expense ? data[collection].map(item => item.id === expense.id ? clean : item) : [...(data[collection] || []), clean] });
      onSave(next);
    } catch (caught) { setError(caught.message); }
  }

  return <form onSubmit={submit}>
    <label className="field">Beschreibung<input autoFocus required maxLength={160} value={values.description} onChange={event => field('description', event.target.value)} /></label>
    <div className="form-grid">
      <label className="field">Datum<input type="date" required value={values.date} onChange={event => field('date', event.target.value)} /></label>
      <label className="field">Betrag (€)<input inputMode="decimal" required maxLength={16} value={amount} onChange={event => setAmount(event.target.value)} /></label>
    </div>
    <label className="field">Kategorie<select value={values.category} onChange={event => field('category', event.target.value)}>{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label className="field">Spieltag<select value={values.matchId || ''} onChange={event => selectMatch(event.target.value)}><option value="">Ohne Spieltagsbezug</option>{[...data.matches].sort((first, second) => first.date.localeCompare(second.date)).map(match => <option key={match.id} value={match.id}>{match.id} · {dateLabel(match.date)} · {match.opponent}</option>)}</select></label>
    {!isIncome && <><label className="field">Bezahlt von<select required value={values.paidByPlayerId === undefined ? '' : values.paidByPlayerId === null ? 'treasury' : `player:${values.paidByPlayerId}`} onChange={event => field('paidByPlayerId', event.target.value === 'treasury' ? null : event.target.value.slice('player:'.length))}>{values.paidByPlayerId === undefined && <option value="" disabled>Bitte zuordnen: {values.paidBy}</option>}<option value="treasury">Mannschaftskasse</option>{[...data.players].sort((first, second) => first.name.localeCompare(second.name, 'de-DE')).map(player => <option key={player.id} value={`player:${player.id}`}>{player.name}</option>)}</select></label>
    <label className="field">Erstattung<select value={values.reimbursementStatus} onChange={event => field('reimbursementStatus', event.target.value)}>{Object.entries(REIMBURSEMENT_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></>}
    <label className="field">Notiz (optional)<textarea rows={3} maxLength={1000} value={values.note} onChange={event => field('note', event.target.value)} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Abbrechen</button><button className="button primary"><Check size={17} />{expense ? 'Speichern' : isIncome ? 'Einnahme anlegen' : 'Ausgabe anlegen'}</button></div>
  </form>;
}

export function TreasurySummary({ data, readOnly, onEdit }) {
  const totals = treasuryTotals(data);
  return <><section className="treasury-summary" aria-label="Mannschaftskasse" aria-live="polite">
    <div className="treasury-balance"><span>Kassenstand</span><strong className={totals.balanceCents < 0 ? 'negative-balance' : ''}>{euro(data.treasuryBalanceCents ?? totals.balanceCents)}</strong></div>
    <div><span>Einnahmen</span><strong>{euro(totals.incomeCents)}</strong></div>
    <div><span>Aus der Kasse bezahlt</span><strong>{euro(totals.paidCents)}</strong></div>
    <div><span className="treasury-opening-label">Anfangsbestand<button className="icon-button" title="Anfangsbestand bearbeiten" aria-label="Anfangsbestand bearbeiten" disabled={readOnly} onClick={onEdit}><Pencil size={15} /></button></span><strong>{euro(totals.openingCents)}</strong></div>
  </section>{data.treasuryResetAt && <div className="treasury-reset-note"><span>Reset-Ausgleich vom {new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(data.treasuryResetAt))}</span><strong>{euro(data.treasuryResetOffsetCents ?? 0)}</strong></div>}</>;
}

export function TreasuryForm({ data, onSave, onClose }) {
  const [amount, setAmount] = useState(((data.treasuryOpeningBalanceCents ?? 0) / 100).toFixed(2).replace('.', ','));
  const [error, setError] = useState('');
  return <form onSubmit={event => {
    event.preventDefault();
    try { onSave(validateState({ ...data, treasuryOpeningBalanceCents: moneyCents(amount, true) })); }
    catch (caught) { setError(caught.message); }
  }}>
    <label className="field">Anfangsbestand (€)<input autoFocus required inputMode="decimal" maxLength={17} value={amount} onChange={event => setAmount(event.target.value)} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Abbrechen</button><button className="button primary"><Check size={17} />Speichern</button></div>
  </form>;
}

export default function Expenses({ data, matchId, readOnly, onAdd, onEdit, onDelete, onHistory, kind = 'expense' }) {
  const isIncome = kind === 'income';
  const categories = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const plural = isIncome ? 'Einnahmen' : 'Ausgaben';
  const singular = isIncome ? 'Einnahme' : 'Ausgabe';
  const [filters, setFilters] = useState({ query: '', category: '', match: '', status: '', from: '', to: '' });
  const field = (key, value) => setFilters(current => ({ ...current, [key]: value }));
  const scoped = (data[isIncome ? 'incomes' : 'expenses'] || []).filter(expense => matchId === undefined || expense.matchId === matchId);
  const filtered = scoped.filter(expense =>
    (!filters.category || expense.category === filters.category) &&
    (!filters.match || (filters.match === 'none' ? expense.matchId === null : expense.matchId === filters.match)) &&
    (isIncome || !filters.status || expense.reimbursementStatus === filters.status) &&
    (!filters.from || expense.date >= filters.from) && (!filters.to || expense.date <= filters.to) &&
    `${expense.description} ${isIncome ? '' : expensePayer(data, expense)} ${expense.note}`.toLocaleLowerCase('de-DE').includes(filters.query.toLocaleLowerCase('de-DE'))
  ).sort((first, second) => second.date.localeCompare(first.date));
  const totals = isIncome ? { amountCents: incomeTotal(filtered) } : expenseTotals(filtered);
  const hasFilters = Object.values(filters).some(Boolean);

  return <section className="expenses-section" aria-label={matchId === undefined ? plural : `${plural} des Spieltags`}>
    <div className="section-heading"><h3>{matchId === undefined ? `${plural}liste` : `${plural} am Spieltag`} <span className="count-badge">{scoped.length}</span></h3><button className="button primary" disabled={readOnly} onClick={onAdd}><Plus size={17} />{singular} hinzufügen</button></div>
    <div className="expense-summary" aria-live="polite"><div><span>{hasFilters ? `${plural} · gefiltert` : `Gesamt${plural.toLocaleLowerCase('de-DE')}`}</span><strong>{euro(totals.amountCents)}</strong></div>{!isIncome && <div><span>{hasFilters ? 'Offene Erstattungen · gefiltert' : 'Offene Erstattungen'}</span><strong>{euro(totals.openCents)}</strong></div>}</div>
    <div className="expense-filters">
      <div className="search-box"><Search size={17} /><input aria-label={`${plural} suchen`} placeholder={`${plural} suchen`} value={filters.query} onChange={event => field('query', event.target.value)} /></div>
      <label>Kategorie<select value={filters.category} onChange={event => field('category', event.target.value)}><option value="">Alle Kategorien</option>{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {matchId === undefined && <label>Spieltag<select value={filters.match} onChange={event => field('match', event.target.value)}><option value="">Alle Spieltage</option><option value="none">Ohne Spieltagsbezug</option>{data.matches.map(match => <option key={match.id} value={match.id}>{match.id} · {match.opponent}</option>)}</select></label>}
      {!isIncome && <label>Erstattung<select value={filters.status} onChange={event => field('status', event.target.value)}><option value="">Alle Status</option>{Object.entries(REIMBURSEMENT_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
      <label>Von<input type="date" value={filters.from} max={filters.to || undefined} onChange={event => field('from', event.target.value)} /></label>
      <label>Bis<input type="date" value={filters.to} min={filters.from || undefined} onChange={event => field('to', event.target.value)} /></label>
      {hasFilters && <button className="text-button" onClick={() => setFilters({ query: '', category: '', match: '', status: '', from: '', to: '' })}>Filter zurücksetzen</button>}
    </div>
    <div className="expense-scroll"><table className="expense-table"><thead><tr><th>Datum</th><th>Beschreibung</th><th>Kategorie</th>{matchId === undefined && <th>Spieltag</th>}{!isIncome && <><th>Bezahlt von</th><th>Erstattung</th></>}<th>Betrag</th><th aria-label="Aktionen" /></tr></thead><tbody>{filtered.map(expense => {
      const match = data.matches.find(item => item.id === expense.matchId);
      return <tr key={expense.id}><td className="expense-date">{dateLabel(expense.date)}</td><td className="expense-description"><strong>{expense.description}</strong>{expense.note && <small>{expense.note}</small>}</td><td>{categories[expense.category]}</td>{matchId === undefined && <td>{match ? `${match.id} · ${match.opponent}` : 'Ohne Spieltagsbezug'}</td>}{!isIncome && <><td>{expensePayer(data, expense)}</td><td><span className={`expense-status expense-status-${expense.reimbursementStatus}`}>{REIMBURSEMENT_STATUSES[expense.reimbursementStatus]}</span></td></>}<td className="expense-amount">{euro(expense.amountCents)}</td><td><div className="row-actions"><button className="icon-button" title="Buchungsverlauf" aria-label={`Verlauf von ${expense.description}`} onClick={() => onHistory(expense)}><History size={16} /></button><button className="icon-button" title={`${singular} bearbeiten`} aria-label={`${expense.description} bearbeiten`} disabled={readOnly} onClick={() => onEdit(expense)}><Pencil size={16} /></button><button className="icon-button danger-hover" title={`${singular} löschen`} aria-label={`${expense.description} löschen`} disabled={readOnly} onClick={() => onDelete(expense)}><Trash2 size={16} /></button></div></td></tr>;
    })}</tbody></table></div>
    {!filtered.length && <p className="empty-copy">{scoped.length ? `Keine passenden ${plural}.` : `Noch keine ${plural} erfasst.`}</p>}
  </section>;
}