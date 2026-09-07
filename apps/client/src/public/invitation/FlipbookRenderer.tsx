import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ApiClient, PublicInvitationView } from '@invitaciones/api-client';
import HTMLFlipBook, { type BookSnapshot, type FlipBookHandle } from '@gullabs/react-flipbook';
import { Box, Button, Stack, Typography } from '@mui/material';
import { FlipbookPage } from './FlipbookPage';
import { useReducedMotion } from '../useReducedMotion';

const initialSnapshot: BookSnapshot = { page: 0, pageCount: 0, orientation: 'portrait', visiblePages: [0] };

function preloadPageIndexes(pageCount: number, visiblePages: number[]): Set<number> {
  if (pageCount <= 0 || visiblePages.length === 0) return new Set();
  const first = Math.max(0, visiblePages[0]! - 1);
  const last = Math.min(pageCount - 1, visiblePages[visiblePages.length - 1]! + 1);
  return new Set(Array.from({ length: last - first + 1 }, (_, index) => first + index));
}

export function FlipbookRenderer({
  apiClient,
  token,
  view,
  onRsvp,
  onQr,
  onUnavailableQr
}: {
  apiClient: ApiClient;
  token: string;
  view: PublicInvitationView;
  onRsvp: () => void;
  onQr: () => void;
  onUnavailableQr: () => void;
}) {
  const pages = useMemo(() => [...(view.design?.pages ?? [])].sort((a, b) => a.position - b.position), [view.design?.pages]);
  const reducedMotion = useReducedMotion();
  const bookRef = useRef<FlipBookHandle | null>(null);
  const turningRef = useRef(false);
  const [snapshot, setSnapshot] = useState<BookSnapshot>(initialSnapshot);
  const [transitionState, setTransitionState] = useState<'idle' | 'turning' | 'settling'>('idle');
  const [preloadedPageIndexes, setPreloadedPageIndexes] = useState<Set<number>>(() => new Set([0]));
  const bookKey = `${token}:${pages.map((page) => page.id).join(':')}:${reducedMotion}`;
  const visiblePageIndexes = snapshot.visiblePages.filter((pageIndex) => pageIndex >= 0 && pageIndex < pages.length);
  const visiblePageKey = visiblePageIndexes.join(',');
  const canGoPrevious = snapshot.page > 0;
  const canGoNext = visiblePageIndexes.at(-1) !== pages.length - 1;

  useEffect(() => {
    setSnapshot(initialSnapshot);
    setPreloadedPageIndexes(new Set([0]));
    turningRef.current = false;
    setTransitionState('idle');
  }, [bookKey]);

  useEffect(() => {
    const preload = window.setTimeout(() => {
      setPreloadedPageIndexes((current) => {
        const next = new Set(current);
        for (const pageIndex of preloadPageIndexes(pages.length, visiblePageIndexes)) next.add(pageIndex);
        return next.size === current.size ? current : next;
      });
    }, 0);
    return () => window.clearTimeout(preload);
  }, [pages.length, visiblePageKey]);

  const syncSnapshot = useCallback((next: BookSnapshot) => {
    setSnapshot(next);
  }, []);
  const syncOrientation = useCallback(() => {
    const book = bookRef.current?.pageFlip();
    if (!book) return;
    syncSnapshot({
      page: book.getCurrentPageIndex(),
      pageCount: book.getPageCount(),
      orientation: book.getOrientation(),
      visiblePages: book.getVisiblePages()
    });
  }, [syncSnapshot]);

  const navigate = useCallback(
    (direction: 'next' | 'prev') => {
      if (turningRef.current) return;
      const book = bookRef.current;
      if (!book) return;

      turningRef.current = true;
      setTransitionState(reducedMotion ? 'settling' : 'turning');
      const moved = direction === 'next' ? book.flipNext() : book.flipPrev();
      if (!moved) {
        turningRef.current = false;
        setTransitionState('idle');
      }
    },
    [reducedMotion]
  );

  if (!pages.length) return <Typography>No pudimos cargar este contenido.</Typography>;
  const progress = visiblePageIndexes.map((pageIndex) => pageIndex + 1).join('–') || '1';

  return (
    <Box
      tabIndex={0}
      aria-label="Invitación en páginas"
      data-reduced-motion={reducedMotion || undefined}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          navigate('prev');
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          navigate('next');
        }
      }}
      sx={{ outline: 'none', '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 4 } }}
    >
      <Box
        sx={{
          py: { xs: 1, md: 2 },
          px: { xs: 0, md: 2 },
          overflow: 'hidden',
          bgcolor: '#201d18',
          backgroundImage: 'radial-gradient(circle at 50% 30%, rgba(255,255,255,.14), transparent 55%)',
          boxShadow: '0 28px 90px rgba(30,23,12,.28)',
          // The engine writes minWidth * 2 on its responsive host before it
          // evaluates portrait mode. Remove that host floor so usePortrait can
          // actually select one physical leaf below the available width.
          '& .flipbook-magazine-engine.stf__parent': { minWidth: '0 !important' }
        }}
      >
        <HTMLFlipBook
          key={bookKey}
          ref={bookRef}
          className="flipbook-magazine-engine"
          width={480}
          height={680}
          sizing="responsive"
          minWidth={280}
          maxWidth={480}
          minHeight={396}
          maxHeight={680}
          autoSize
          initialPage={0}
          page={snapshot.page}
          pageTransition={reducedMotion ? 'instant' : 'animate'}
          hardCovers
          usePortrait
          flippingTime={reducedMotion ? 0 : 720}
          respectReducedMotion
          drawShadow
          maxShadowOpacity={0.48}
          pageBackground="#f3eee6"
          flipOnClick="never"
          respectInteractiveContent
          allowTouchScroll
          swipeDistance={40}
          lazyRadius={1}
          useKeyboard={false}
          controls="none"
          liveRegion={false}
          aria-label="Invitación en formato revista"
          roleDescription="Libro de invitación"
          onReady={syncSnapshot}
          onPageChange={syncSnapshot}
          onChangeOrientation={syncOrientation}
          onChangeState={({ state }) => {
            if (state === 'read') {
              turningRef.current = false;
              setTransitionState('idle');
            } else {
              setTransitionState((current) => (current === 'turning' ? 'settling' : 'turning'));
            }
          }}
        >
          {pages.map((page, pageIndex) => (
            <FlipbookPage
              key={page.id}
              apiClient={apiClient}
              token={token}
              page={page}
              pageNumber={pageIndex + 1}
              pageCount={pages.length}
              hotspots={(view.design?.hotspots ?? []).filter((hotspot) => hotspot.flipbookPageId === page.id)}
              visible={visiblePageIndexes.includes(pageIndex)}
              interactive={transitionState === 'idle'}
              shouldLoad={preloadedPageIndexes.has(pageIndex)}
              onRsvp={onRsvp}
              onQr={onQr}
              onUnavailableQr={onUnavailableQr}
              qrAvailable={view.qr?.available === true}
            />
          ))}
        </HTMLFlipBook>
      </Box>
      <Stack direction="row" spacing={2} sx={{ mt: 2, justifyContent: 'center', alignItems: 'center' }}>
        <Button
          disabled={!canGoPrevious || transitionState !== 'idle'}
          onClick={() => navigate('prev')}
          sx={{ minWidth: 44, minHeight: 44 }}
        >
          Anterior
        </Button>
        <Typography aria-live="polite">
          Página {progress} de {pages.length}
        </Typography>
        <Button
          disabled={!canGoNext || transitionState !== 'idle'}
          onClick={() => navigate('next')}
          sx={{ minWidth: 44, minHeight: 44 }}
        >
          Siguiente
        </Button>
      </Stack>
    </Box>
  );
}
