import { Box, FormControlLabel, Radio, RadioGroup, Typography } from '@mui/material';
import type { CommercialIntent } from '../commercial-selection';
import { LandingContainer } from './primitives';

export function LandingIntents({
  value,
  onChange
}: {
  value: CommercialIntent | null;
  onChange: (value: CommercialIntent) => void;
}) {
  return (
    <Box
      component="section"
      id="como-contratar"
      aria-labelledby="intent-heading"
      sx={{ py: { xs: 5, md: 7 }, scrollMarginTop: 100 }}
    >
      <LandingContainer>
        <Typography id="intent-heading" component="h2" variant="h4">
          ¿Cómo quieres contratar?
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Elige tu caso para conocer el siguiente paso. El precio estándar por evento no cambia.
        </Typography>
        <RadioGroup
          aria-labelledby="intent-heading"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value as CommercialIntent)}
          sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1 }}
        >
          {(
            [
              ['INDIVIDUAL', 'Organizo mi evento'],
              ['PLANNER_AGENCY', 'Soy Planner/agencia'],
              ['VENUE', 'Tengo salón o jardín']
            ] as const
          ).map(([intent, label]) => (
            <FormControlLabel
              key={intent}
              value={intent}
              control={<Radio slotProps={{ input: { id: `intent-${intent}` } }} />}
              label={label}
              sx={{ minHeight: 48, m: 0 }}
            />
          ))}
        </RadioGroup>
        <Typography role="status" aria-live="polite" variant="body2" sx={{ mt: 1 }}>
          {value
            ? 'Selección guardada para consultar servicios y precios.'
            : 'Selecciona una opción; no crea una cuenta ni asigna tarifas.'}
        </Typography>
      </LandingContainer>
    </Box>
  );
}
