import { Box, type BoxProps } from '@mui/material';

export interface ProductProofPictureProps extends Omit<BoxProps<'picture'>, 'component'> {
  avif: string;
  webp: string;
  alt: string;
  width: number;
  height: number;
  imageStyle?: React.CSSProperties;
}

export function ProductProofPicture({
  avif,
  webp,
  alt,
  width,
  height,
  imageStyle,
  ...props
}: ProductProofPictureProps) {
  const isAvif = avif.endsWith('.avif');
  const isWebp = webp.endsWith('.webp') || avif.endsWith('.webp');
  const webpSrc = webp.endsWith('.webp') ? webp : avif.endsWith('.webp') ? avif : '';
  const fallbackSrc = webp || avif;

  return (
    <Box component="picture" {...props}>
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
          ...imageStyle
        }}
      />
    </Box>
  );
}
