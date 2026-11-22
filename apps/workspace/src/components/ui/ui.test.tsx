import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Button,
  CodeBlock,
  DiffBlock,
  EmptyState,
  ErrorState,
  LoadingState,
  SideNav,
  Stat,
  StatusChip,
  Table,
  Tabs,
  TextField,
  type Status,
} from './index';

afterEach(cleanup);

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('type')).toBe('button');
  });

  it('busy disables the button and announces it', () => {
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Approve
      </Button>,
    );
    const b = screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('TextField', () => {
  it('is labelled and links hint and error to the input', () => {
    render(<TextField label="Project name" hint="Shown in the sidebar" error="Required" />);
    const input = screen.getByLabelText('Project name');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = (input.getAttribute('aria-describedby') ?? '').split(' ');
    const texts = described.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(['Shown in the sidebar', 'Required']);
    expect(screen.getByRole('alert').textContent).toBe('Required');
  });

  it('is not marked invalid without an error', () => {
    render(<TextField label="Name" />);
    expect(screen.getByLabelText('Name').hasAttribute('aria-invalid')).toBe(false);
  });
});

describe('Tabs', () => {
  const items = [
    { id: 'spec', label: 'Specification', content: <p>spec body</p> },
    { id: 'plan', label: 'Plan', content: <p>plan body</p> },
    { id: 'runs', label: 'Runs', content: <p>runs body</p> },
  ];

  it('shows the first tab and keeps only the selected tab in the tab order', () => {
    render(<Tabs label="Project" items={items} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(screen.getByRole('tabpanel').textContent).toBe('spec body');
  });

  it('moves with arrow keys, wraps, and supports Home and End', () => {
    const onChange = vi.fn();
    render(<Tabs label="Project" items={items} onChange={onChange} />);
    const [spec, , runs] = screen.getAllByRole('tab') as [HTMLElement, HTMLElement, HTMLElement];
    fireEvent.keyDown(spec, { key: 'ArrowLeft' });
    expect(runs.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(runs);
    fireEvent.keyDown(runs, { key: 'ArrowRight' });
    expect(spec.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(spec, { key: 'End' });
    expect(runs.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(runs, { key: 'Home' });
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(['runs', 'spec', 'runs', 'spec']);
  });

  it('links each tab to its panel', () => {
    render(<Tabs label="Project" items={items} />);
    const tab = screen.getAllByRole('tab')[0];
    const panel = screen.getByRole('tabpanel');
    expect(tab?.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(tab?.id);
  });
});

describe('StatusChip', () => {
  const all: Status[] = [
    'DEFINED',
    'PLANNED',
    'BUILDING',
    'VERIFYING',
    'REPAIRING',
    'AWAITING_APPROVAL',
    'DELIVERED',
    'FAILED',
    'CANCELLED',
    'passed',
    'failed',
    'error',
    'not_run',
  ];

  it.each(all)('%s has a text label, not only a color', (status) => {
    const { container } = render(<StatusChip status={status} />);
    const chip = container.firstElementChild as HTMLElement;
    const symbol = chip.querySelector('[aria-hidden="true"]');
    const visibleText = (chip.textContent ?? '').replace(symbol?.textContent ?? '', '').trim();
    expect(visibleText.length).toBeGreaterThan(2);
    expect(chip.dataset['tone']).toMatch(/^(success|danger|warning|info|neutral)$/);
  });

  it('marks failures and passes with different tones', () => {
    const { container } = render(
      <>
        <StatusChip status="passed" />
        <StatusChip status="failed" />
      </>,
    );
    const tones = [...container.querySelectorAll('[data-tone]')].map(
      (el) => (el as HTMLElement).dataset['tone'],
    );
    expect(tones).toEqual(['success', 'danger']);
  });
});

describe('Table', () => {
  const columns = [{ key: 'name', header: 'Name', cell: (r: { name: string }) => r.name }] as const;

  it('uses column headers and a caption', () => {
    render(
      <Table
        caption="Recent runs"
        columns={columns}
        rows={[{ name: 'a' }]}
        rowKey={(r) => r.name}
        empty={<EmptyState title="No runs" />}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Name' }).getAttribute('scope')).toBe('col');
    expect(screen.getByRole('table').querySelector('caption')?.textContent).toBe('Recent runs');
  });

  it('shows the empty state instead of an empty table', () => {
    render(
      <Table
        caption="Recent runs"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.name}
        empty={<EmptyState title="No runs yet" />}
      />,
    );
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('No runs yet')).toBeTruthy();
  });
});

describe('CodeBlock and DiffBlock render untrusted text as text', () => {
  const evil = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

  it('CodeBlock never creates elements from its text', () => {
    const { container } = render(<CodeBlock label="Agent output" text={evil} />);
    expect(container.querySelector('img, script')).toBeNull();
    expect(container.querySelector('code')?.textContent).toBe(evil);
  });

  it('CodeBlock keeps the last lines and says how many were dropped', () => {
    const text = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n');
    render(<CodeBlock label="Log" text={text} maxLines={3} />);
    expect(screen.getByText('7 earlier lines not shown')).toBeTruthy();
    expect(document.querySelector('code')?.textContent).toBe('line 8\nline 9\nline 10');
  });

  it('DiffBlock marks added and removed lines for screen readers, and stays text', () => {
    const diff = ['--- a/x', '+++ b/x', '@@ -1 +1 @@', `-${evil}`, '+safe'].join('\n');
    const { container } = render(<DiffBlock label="Patch" diff={diff} />);
    expect(container.querySelector('img, script')).toBeNull();
    const kinds = [...container.querySelectorAll('[data-kind]')].map(
      (el) => (el as HTMLElement).dataset['kind'],
    );
    expect(kinds).toEqual(['meta', 'meta', 'hunk', 'remove', 'add']);
    expect(screen.getByText('removed:', { exact: false })).toBeTruthy();
    expect(screen.getByText('added:', { exact: false })).toBeTruthy();
  });
});

describe('states', () => {
  it('LoadingState is a polite status', () => {
    render(<LoadingState label="Loading runs" />);
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  });

  it('ErrorState is an alert and shows the request id', () => {
    render(<ErrorState message="The Engine is unavailable" requestId="7f3c-1" />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('The Engine is unavailable');
    expect(alert.textContent).toContain('7f3c-1');
  });

  it('Stat shows an em dash, never 0, while the value is unknown', () => {
    render(<Stat label="Running runs" value={null} />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });
});

describe('SideNav', () => {
  const items = [
    { href: '/overview', label: 'Overview' },
    { href: '/projects', label: 'Projects' },
  ];

  it('marks the current page, including nested paths', () => {
    render(<SideNav label="Workspace" items={items} current="/projects/abc" />);
    expect(screen.getByRole('link', { name: 'Projects' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Overview' }).hasAttribute('aria-current')).toBe(false);
  });

  it('keeps labels for screen readers when collapsed', () => {
    render(<SideNav label="Workspace" items={items} current="/overview" collapsed />);
    expect(screen.getByRole('link', { name: 'Overview' })).toBeTruthy();
  });
});
