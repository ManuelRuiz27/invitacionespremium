import { Box } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { colorWithOpacity, countdownFonts, countdownParts, type CountdownStyle } from './countdown-style';
import { useElementSize } from './useElementSize';

export interface CountdownVisualProps {
  appearance: CountdownStyle;
  seconds: number | null;
}

/** Renders a duration only. Dates, authorization and persistence belong to the consuming app. */
export function CountdownVisual({ appearance, seconds }: CountdownVisualProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const previousSeconds = useRef(seconds);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (seconds === 0 && previousSeconds.current !== null && previousSeconds.current > 0) {
      setAnnouncement('El evento ha comenzado');
    } else if (seconds !== 0) {
      setAnnouncement('');
    }
    previousSeconds.current = seconds;
  }, [seconds]);
  const parts = countdownParts(seconds);
  const grid = appearance.layout === 'grid' || (size.width > 0 && size.width < 220);
  const columns = grid ? 2 : 4;
  const compact = size.width < 310;
  const padding = size.width > 360 ? 14 : 6;
  const maxDigits = Math.max(2, ...parts.map((part) => part.value.length));
  const availableWidth = Math.max(1, size.width - padding * 2 - (columns - 1) * 4);
  const availableHeight = Math.max(1, size.height - padding * 2 - (grid ? 4 : 0) - (seconds === 0 ? 17 : 0));
  const numberSize = Math.max(
    20,
    Math.min(64, availableWidth / columns / (maxDigits * 0.72), (availableHeight / (grid ? 2 : 1) - 17) / 1.15)
  );
  const labelSize = Math.max(12, Math.min(16, numberSize * 0.36));
  const shadow =
    appearance.shadow === 'none'
      ? 'none'
      : appearance.shadow === 'soft'
        ? `0 3px 12px ${colorWithOpacity(appearance.shadowColor, 0.2)}`
        : `0 6px 22px ${colorWithOpacity(appearance.shadowColor, 0.38)}`;
  const border =
    appearance.frame === 'none'
      ? 'none'
      : `${appearance.frame === 'double' ? '3px double' : '1px solid'} ${appearance.borderColor}`;

  return (
    <Box
      ref={ref}
      data-countdown-layout={grid ? 'grid' : 'row'}
      role="timer"
      aria-live="off"
      aria-label={
        seconds === null
          ? 'Cuenta regresiva sin fecha definida'
          : seconds === 0
            ? 'El evento ha comenzado'
            : `Faltan ${parts.map((part) => `${Number(part.value)} ${part.label}`).join(', ')}`
      }
      sx={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: `${padding}px`,
        pointerEvents: 'none',
        userSelect: 'none',
        backgroundColor: colorWithOpacity(appearance.backgroundColor, appearance.backgroundOpacity),
        border,
        borderRadius: appearance.frame === 'rounded' ? '12px' : 0,
        boxShadow: shadow,
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'center'
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: '4px',
          alignItems: 'center'
        }}
      >
        {parts.map((part) => (
          <Box key={part.label}>
            <Box
              sx={{
                color: appearance.numberColor,
                fontFamily: countdownFonts[appearance.numberFont],
                fontWeight: appearance.numberWeight,
                fontSize: `${numberSize}px`,
                lineHeight: 1.15,
                whiteSpace: 'nowrap'
              }}
            >
              {part.value}
            </Box>
            <Box
              sx={{
                color: appearance.labelColor,
                fontFamily: countdownFonts[appearance.labelFont],
                fontWeight: appearance.labelWeight,
                fontSize: `${labelSize}px`,
                lineHeight: 1.4,
                whiteSpace: 'nowrap'
              }}
            >
              {compact ? part.shortLabel : part.label}
            </Box>
          </Box>
        ))}
      </Box>
      {seconds === 0 ? (
        <Box
          aria-hidden="true"
          sx={{
            color: appearance.labelColor,
            fontFamily: countdownFonts[appearance.labelFont],
            fontSize: 12,
            lineHeight: '17px'
          }}
        >
          {size.width > 0 && size.width < 220 ? '¡Comenzó!' : 'El evento ha comenzado'}
        </Box>
      ) : null}
      <Box
        role="status"
        aria-live="polite"
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          p: 0,
          m: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap'
        }}
      >
        {announcement}
      </Box>
    </Box>
  );
}
