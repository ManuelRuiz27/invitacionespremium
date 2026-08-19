import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { floorplanStickerPresets } from './floorplan-sticker-catalog';
import type { FloorplanStickerPreset, FloorplanStickerPresetId } from './floorplan-sticker-catalog';

export function FloorplanStickerCatalog({
  selectedId,
  disabled,
  onSelect
}: {
  selectedId?: FloorplanStickerPresetId | undefined;
  disabled: boolean;
  onSelect: (presetId: FloorplanStickerPresetId) => void;
}) {
  return (
    <Stack component="section" aria-labelledby="sticker-catalog-title" spacing={1.5}>
      <Box>
        <Typography id="sticker-catalog-title" variant="overline" color="text.secondary">
          Elementos
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Elige uno y colócalo en el plano.
        </Typography>
      </Box>
      <StickerGroup
        label="Mesas"
        presets={floorplanStickerPresets.filter(({ group }) => group === 'TABLES')}
        selectedId={selectedId}
        disabled={disabled}
        onSelect={onSelect}
      />
      <StickerGroup
        label="Zonas"
        presets={floorplanStickerPresets.filter(({ group }) => group === 'ZONES')}
        selectedId={selectedId}
        disabled={disabled}
        onSelect={onSelect}
      />
    </Stack>
  );
}

function StickerGroup({
  label,
  presets,
  selectedId,
  disabled,
  onSelect
}: {
  label: string;
  presets: readonly FloorplanStickerPreset[];
  selectedId?: FloorplanStickerPresetId | undefined;
  disabled: boolean;
  onSelect: (presetId: FloorplanStickerPresetId) => void;
}) {
  return (
    <Stack component="section" aria-label={label} spacing={0.75}>
      <Typography variant="subtitle2">{label}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.75 }}>
        {presets.map((preset) => {
          const selected = preset.id === selectedId;
          return (
            <ButtonBase
              key={preset.id}
              disabled={disabled}
              aria-label={preset.label}
              aria-pressed={selected}
              onClick={() => onSelect(preset.id)}
              sx={{
                minHeight: 64,
                border: '1px solid',
                borderColor: selected ? 'primary.main' : 'divider',
                borderRadius: 2,
                px: 0.75,
                py: 0.75,
                display: 'grid',
                gridTemplateColumns: '32px minmax(0, 1fr)',
                gap: 0.75,
                alignItems: 'center',
                justifyItems: 'start',
                textAlign: 'left',
                bgcolor: selected ? 'rgba(49, 87, 200, 0.09)' : 'background.paper',
                color: selected ? 'primary.dark' : 'text.primary',
                '&:hover': { bgcolor: selected ? 'rgba(49, 87, 200, 0.13)' : 'action.hover' },
                '&.Mui-disabled': { opacity: 0.45 },
                '&:focus-visible': { outline: '3px solid', outlineColor: 'warning.main', outlineOffset: 2 }
              }}
            >
              <StickerPreview preset={preset} />
              <Typography component="span" variant="caption" sx={{ fontWeight: 750, lineHeight: 1.2 }}>
                {preset.label}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>
    </Stack>
  );
}

function StickerPreview({ preset }: { preset: FloorplanStickerPreset }) {
  const table = preset.group === 'TABLES';
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: preset.preview === 'wide' ? 30 : preset.preview === 'rectangle' ? 26 : 22,
        height: preset.preview === 'low' ? 10 : preset.preview === 'wide' ? 14 : 22,
        borderRadius: preset.preview === 'circle' ? '50%' : 0.75,
        border: '2px solid',
        borderColor: table ? 'primary.main' : 'warning.dark',
        bgcolor: table ? 'rgba(49, 87, 200, 0.1)' : 'rgba(185, 123, 24, 0.11)',
        justifySelf: 'center'
      }}
    />
  );
}
