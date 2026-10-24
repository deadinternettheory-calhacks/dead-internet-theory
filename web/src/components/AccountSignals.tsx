import type { Report } from '../analysis/report';
import { ACCOUNT_RULES } from '../analysis/sources';
import { Sources } from './Sources';

/** Sampled accounts with their automation-signal index (rubric family B). Not a bot probability. */
export function AccountSignals({ report }: { report: Report }) {
  if (!report.accounts.length) return null;
  const used = [...new Set(report.accounts.flatMap(a => a.signals.map(s => s.ruleId)))];
  const sources = [...new Map(used.flatMap(id => ACCOUNT_RULES[id]?.sources ?? []).map(s => [s.label, s])).values()];
  return <section className="report-accounts" aria-labelledby="accounts-heading">
    <h2 id="accounts-heading">Account signals</h2>
    <ul>{report.accounts.map(a => <li key={a.authorId}>
      <span className="account-name">{a.author ?? 'Unknown author'}</span>
      <span className={`account-score${(a.score ?? 0) >= 55 ? ' is-high' : (a.score ?? 0) >= 35 ? ' is-medium' : ''}`}>{a.score === null ? '–' : a.score}<small>/100</small></span>
      <span className="account-signals">{a.signals.length
        ? a.signals.map(s => <span key={s.ruleId} title={s.evidence}>{ACCOUNT_RULES[s.ruleId]?.label ?? s.ruleId}</span>)
        : <span className="is-none">None found</span>}</span>
    </li>)}</ul>
    <Sources sources={sources}/>
  </section>;
}
