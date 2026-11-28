import type { Sla, TargetStatus } from '../../../sla';
import styles from './sla-badge.module.css';

const LABEL: Record<TargetStatus, string> = {
  met: 'SLA met',
  on_track: 'SLA on track',
  at_risk: 'SLA at risk',
  missed: 'SLA missed',
  breached: 'SLA breached',
};

/** Overall SLA status of a ticket, with the next due time when one is still open. */
export function SlaBadge({ sla }: { sla: Sla }) {
  const open =
    sla.firstResponse === 'on_track' ||
    sla.firstResponse === 'at_risk' ||
    sla.firstResponse === 'breached';
  const due = open ? sla.firstResponseDueAt : sla.resolutionDueAt;
  return (
    <span className={`${styles.badge} ${styles[sla.overall]}`}>
      {LABEL[sla.overall]}
      {sla.overall !== 'met' && sla.overall !== 'missed' && (
        <> · due {new Date(due).toLocaleString('en')}</>
      )}
    </span>
  );
}

/** Both targets, for the ticket page. */
export function SlaDetail({ sla }: { sla: Sla }) {
  return (
    <dl className={styles.detail}>
      <dt>First response</dt>
      <dd className={styles[sla.firstResponse]}>
        {LABEL[sla.firstResponse].replace('SLA ', '')} · due{' '}
        {new Date(sla.firstResponseDueAt).toLocaleString('en')}
      </dd>
      <dt>Resolution</dt>
      <dd className={styles[sla.resolution]}>
        {LABEL[sla.resolution].replace('SLA ', '')} · due{' '}
        {new Date(sla.resolutionDueAt).toLocaleString('en')}
      </dd>
    </dl>
  );
}
