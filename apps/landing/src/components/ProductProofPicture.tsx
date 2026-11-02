import { Box, type BoxProps } from '@mui/material';

export interface ProductProofPictureProps extends Omit<BoxProps<'picture'>, 'component'> {
  avif: string;
  webp: string;
  alt: string;
  width: number;
  height: number;
  imageStyle?: React.CSSProperties;
  /** Frame the operational area of an existing screenshot without retouching it. */
  crop?: { top: number; left: number } | undefined;
}

export function ProductProofPicture({
  avif,
  webp,
  alt,
  width,
  height,
  imageStyle,
  crop,
  ...props
}: ProductProofPictureProps) {
  const isAvif = avif.endsWith('.avif');
  const isWebp = webp.endsWith('.webp') || avif.endsWith('.webp');
  const webpSrc = webp.endsWith('.webp') ? webp : avif.endsWith('.webp') ? avif : '';
  const fallbackSrc = webp || avif;

  return (
    <Box
      component="picture"
      {...props}
      sx={[
        ...(crop
          ? [
              {
                display: 'block',
                position: 'relative',
                overflow: 'hidden',
                aspectRatio: `${width * (1 - crop.left)} / ${height * (1 - crop.top)}`
              }
            ]
          : []),
        ...(Array.isArray(props.sx) ? props.sx : props.sx ? [props.sx] : [])
      ]}
    >
      {isAvif ? <source srcSet={avif} type="image/avif" /> : null}
      {isWebp && webpSrc ? <source srcSet={webpSrc} type="image/webp" /> : null}
      <img
        src={fallbackSrc}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          aspectRatio: `${width} / ${height}`,
          ...imageStyle,
          ...(crop
            ? {
                position: 'absolute',
                left: `${(-crop.left / (1 - crop.left)) * 100}%`,
                top: `${(-crop.top / (1 - crop.top)) * 100}%`,
                width: `${100 / (1 - crop.left)}%`,
                height: `${100 / (1 - crop.top)}%`,
                maxHeight: 'none',
                minHeight: 0,
                maxWidth: 'none'
              }
            : {})
        }}
      />
    </Box>
  );
}
