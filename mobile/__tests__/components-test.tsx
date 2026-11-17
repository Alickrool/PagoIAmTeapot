// Components: the new validation UI (AV3/AV5), the toast (AV2/AV4) and older shared components without tests.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { Validation } from '../src/api/types';
import { Button } from '../src/components/Button';
import { ConfirmDialog } from '../src/components/ConfirmDialog';
import { SeverityBadge } from '../src/components/SeverityBadge';
import { Toast } from '../src/components/Toast';
import { ReviewMark, ValidationCard } from '../src/components/ValidationCard';

const review: Validation = {
  status: 'needs_review',
  assigned_month: '2026-09',
  is_current_month: false,
  confirmed_by_user: false,
  checks: [
    { id: 'not_current_month', severity: 'info', field: 'period_end', message: 'Factura e pentru septembrie 2026, am pus-o în luna ei.' },
    { id: 'vat_amount', severity: 'warning', field: 'line_items.vat', message: 'TVA-ul citit (61,18 lei) nu se potrivește.' },
  ],
};

describe('ValidationCard (AV3)', () => {
  it('renders nothing for a bill without checks', async () => {
    await render(<ValidationCard validation={{ ...review, status: 'accepted', checks: [] }} onConfirm={jest.fn()} />);
    expect(screen.queryByTestId('validation-card')).toBeNull();
  });

  it('shows warnings in one card and info checks as notes', async () => {
    await render(<ValidationCard validation={review} onConfirm={jest.fn()} />);
    expect(screen.getByText('Verifică datele citite de pe factură')).toBeTruthy();
    expect(screen.getByText(/TVA-ul citit/)).toBeTruthy();
    expect(screen.getByText(/am pus-o în luna ei/)).toBeTruthy();
  });

  it('"E corect" calls confirm', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    await render(<ValidationCard validation={review} onConfirm={onConfirm} />);
    await fireEvent.press(screen.getByText('E corect'));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it('shows the error when confirm fails and keeps the button', async () => {
    const onConfirm = jest.fn().mockRejectedValue(new Error('Nu am putut confirma.'));
    await render(<ValidationCard validation={review} onConfirm={onConfirm} />);
    await fireEvent.press(screen.getByText('E corect'));
    expect(await screen.findByText('Nu am putut confirma.')).toBeTruthy();
    expect(screen.getByText('E corect')).toBeTruthy();
  });

  it('after confirm: no button, "Confirmată" mark, warnings still visible', async () => {
    await render(<ValidationCard validation={{ ...review, status: 'accepted', confirmed_by_user: true }} onConfirm={jest.fn()} />);
    expect(screen.queryByText('E corect')).toBeNull();
    expect(screen.getByText('Confirmată')).toBeTruthy();
    expect(screen.getByText(/TVA-ul citit/)).toBeTruthy();
  });

  it('only info checks: notes, no card, no button (other month, all fine)', async () => {
    await render(<ValidationCard validation={{ ...review, status: 'accepted', checks: [review.checks[0]] }} onConfirm={jest.fn()} />);
    expect(screen.getByText(/am pus-o în luna ei/)).toBeTruthy();
    expect(screen.queryByText('E corect')).toBeNull();
  });
});

describe('ReviewMark (AV5)', () => {
  it('reads "De verificat"', async () => {
    await render(<ReviewMark />);
    expect(screen.getByText('De verificat')).toBeTruthy();
  });
});

describe('Toast (AV2/AV4)', () => {
  it('shows the message and hides when tapped', async () => {
    await render(<Toast message="Am pus factura în septembrie 2026." />);
    const msg = screen.getByText('Am pus factura în septembrie 2026.');
    await fireEvent.press(msg);
    expect(screen.queryByText('Am pus factura în septembrie 2026.')).toBeNull();
  });

  it('renders nothing without a message', async () => {
    await render(<Toast message={undefined} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('disappears by itself after the duration', async () => {
    jest.useFakeTimers();
    await render(<Toast message="Ai scanat deja factura asta." duration={1000} />);
    expect(screen.getByText('Ai scanat deja factura asta.')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    await waitFor(() => expect(screen.queryByText('Ai scanat deja factura asta.')).toBeNull());
    jest.useRealTimers();
  });
});

describe('older shared components', () => {
  it('SeverityBadge uses the mode wording (default mode = Millennials)', async () => {
    await render(<SeverityBadge severity="critical" />);
    expect(screen.getByText('Anomalie')).toBeTruthy();
  });

  it('Button calls onPress, but not when disabled', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(<Button title="Plătește" onPress={onPress} />);
    await fireEvent.press(screen.getByText('Plătește'));
    expect(onPress).toHaveBeenCalledTimes(1);
    await rerender(<Button title="Plătește" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByText('Plătește'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ConfirmDialog (pay a critical bill): safe answer first, both answers work', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(<ConfirmDialog visible title="Stai" body="Red flag" confirm="Plătesc oricum" cancel="Las-o" onConfirm={onConfirm} onCancel={onCancel} />);
    const texts = screen.getAllByText(/Plătesc oricum|Las-o/).map((n) => n.props.children);
    expect(texts).toEqual(['Las-o', 'Plătesc oricum']);
    await fireEvent.press(screen.getByText('Plătesc oricum'));
    await fireEvent.press(screen.getByText('Las-o'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('ConfirmDialog with primary="confirm" (add provider) puts the yes first', async () => {
    await render(<ConfirmDialog visible primary="confirm" title="Adaugi?" body="" confirm="Adaugă furnizorul" cancel="Nu acum" onConfirm={jest.fn()} onCancel={jest.fn()} />);
    const texts = screen.getAllByText(/Adaugă furnizorul|Nu acum/).map((n) => n.props.children);
    expect(texts).toEqual(['Adaugă furnizorul', 'Nu acum']);
  });
});
