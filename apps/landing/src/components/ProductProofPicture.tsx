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
  return (
    <Box component="picture" {...props}>
      <source srcSet={avif} type="image/avif" />
      <source srcSet={webp} type="image/webp" />
      <img
        src={webp}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        style={{ display: 'block', width: '100%', height: 'auto', ...imageStyle }}
      />
    </Box>
  );
}
