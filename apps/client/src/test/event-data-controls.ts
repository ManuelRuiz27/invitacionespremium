import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';

export async function chooseEventTime(value: string) {
  await userEvent.click(await screen.findByRole('button', { name: /^Hora de inicio:/ }));
  if (!value) await userEvent.click(screen.getByRole('button', { name: 'Quitar hora' }));
  else {
    const [hour, minute] = value.split(':');
    if (minute === undefined) throw new Error('Expected HH:mm in the time fixture.');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Hora' }));
    fireEvent.click(await screen.findByRole('option', { name: String(Number(hour) % 12 || 12) }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Minutos' }));
    fireEvent.click(await screen.findByRole('option', { name: minute }));
    await userEvent.click(screen.getByRole('button', { name: Number(hour) < 12 ? 'a. m.' : 'p. m.' }));
    await userEvent.click(screen.getByRole('button', { name: 'Usar hora' }));
  }
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Hora de inicio' })).not.toBeInTheDocument());
}

export async function chooseEventZone(value: string) {
  await userEvent.click(await screen.findByRole('button', { name: /^Cambiar zona horaria:/ }));
  const label = value === 'America/Tijuana' ? 'Tijuana' : value;
  const input = await screen.findByRole('combobox', { name: 'Zona horaria' });
  await userEvent.click(input);
  fireEvent.change(input, { target: { value: label } });
  fireEvent.click(await screen.findByRole('option', { name: label }));
}
