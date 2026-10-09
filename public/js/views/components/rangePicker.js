// View: date range with quick presets. The chosen preset is remembered, and relative presets
// ("Today", "Last 7 days") move forward with the calendar.
import { localDate, addDays } from '../../core/format.js';

export const PRESETS = {
  today: ['Today', () => ({ from: localDate(), to: localDate() })],
  yesterday: ['Yesterday', () => { const y = addDays(localDate(), -1); return { from: y, to: y }; }],
  '7d': ['7 days', () => ({ from: addDays(localDate(), -6), to: localDate() })],
  '30d': ['30 days', () => ({ from: addDays(localDate(), -29), to: localDate() })],
  month: ['This month', () => ({ from: localDate().slice(0, 8) + '01', to: localDate() })],
  year: ['This year', () => ({ from: localDate().slice(0, 4) + '-01-01', to: localDate() })],
};

/** Bring a remembered state's dates up to date (for relative presets). */
export function resolveRange(state) {
  if (state.preset && PRESETS[state.preset]) Object.assign(state, PRESETS[state.preset][1]());
  if (!state.from || !state.to) Object.assign(state, PRESETS.today[1]());
  if (state.from > state.to) [state.from, state.to] = [state.to, state.from];
  return state;
}

export function rangeHtml(state) {
  return `<div class="range">
    <select data-preset aria-label="Period">${Object.entries(PRESETS).map(([k, [label]]) => `<option value="${k}" ${state.preset === k ? 'selected' : ''}>${label}</option>`).join('')}
      <option value="" ${state.preset ? '' : 'selected'}>Custom dates</option></select>
    <input type="date" data-k="from" value="${state.from}" aria-label="From">
    <input type="date" data-k="to" value="${state.to}" aria-label="To"></div>`;
}

export function bindRange(el, state, onChange) {
  el.addEventListener('change', e => {
    if (e.target.matches('[data-preset]')) {
      state.preset = e.target.value;
      if (state.preset) resolveRange(state);
    } else if (e.target.dataset.k) {
      state[e.target.dataset.k] = e.target.value; state.preset = '';
      el.querySelector('[data-preset]').value = '';
    } else return;
    resolveRange(state);
    el.querySelector('[data-k=from]').value = state.from;
    el.querySelector('[data-k=to]').value = state.to;
    state.save(); onChange();
  });
}
