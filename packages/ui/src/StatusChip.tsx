import { Chip, type ChipProps } from '@mui/material';

export interface StatusChipProps {
  label: string;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}

const colors: Record<NonNullable<StatusChipProps['tone']>, ChipProps['color']> = {
  neutral: 'default',
  info: 'primary',
  success: 'success',
  warning: 'warning',
  danger: 'error'
};

export function StatusChip({ label, tone = 'neutral' }: StatusChipProps) {
  return <Chip size="small" variant="outlined" color={colors[tone]} label={label} />;
}
