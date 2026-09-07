import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ApiClient, PublicInvitationView } from '@invitaciones/api-client';
import HTMLFlipBook, { type BookSnapshot, type FlipBookHandle } from '@gullabs/react-flipbook';
import { Box, Button, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import { FlipbookPage } from './FlipbookPage';
import { createFlipbookViews, preloadFlipbookPageIndexes, type FlipbookMode } from './flipbook-model';
import { useReducedMotion } from '../useReducedMotion';

const initialSnapshot: BookSnapshot = { page: 0, pageCount: 0, orientation: 'portrait', visiblePages: [0] };

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
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const reducedMotion = useReducedMotion();
  const bookRef = useRef<FlipBookHandle | null>(null);
  const turningRef = useRef(false);
  const userTurnRef = useRef(false);
  const desiredViewRef = useRef(0);
  const [snapshot, setSnapshot] = useState<BookSnapshot>(initialSnapshot);
  const [focalPageIndex, setFocalPageIndex] = useState(0);
  const [transitionState, setTransitionState] = useState<'idle' | 'turning' | 'settling'>('idle');
  const [preloadedPageIndexes, setPreloadedPageIndexes] = useState<Set<number>>(() => new Set([0]));
  const mode: FlipbookMode = isDesktop ? 'spread' : 'single';
  const bookKey = `${mode}:${reducedMotion}`;
  const activeBookKey = useRef(bookKey);
  const renderedMode = useRef(mode);
  const restoringViewRef = useRef(false);
  if (renderedMode.current !== mode) {
    renderedMode.current = mode;
    restoringViewRef.current = true;
  }
  activeBookKey.current = bookKey;
  const views = useMemo(() => createFlipbookViews(pages.length, mode), [mode, pages.length]);
  const initialViewIndex = Math.max(0, views.findIndex((logicalView) => logicalView.pageIndexes.includes(focalPageIndex)));
  const visibleViewIndexes = snapshot.visiblePages.filter((viewIndex) => viewIndex >= 0 && viewIndex < views.length);
  const visiblePageIndexes = visibleViewIndexes.flatMap((viewIndex) => views[viewIndex]!.pageIndexes);
  const visiblePageKey = visiblePageIndexes.join(',');
  const canGoPrevious = snapshot.page > 0;
  const canGoNext = snapshot.page < views.length - 1;

  useEffect(() => {
    setSnapshot(initialSnapshot);
    setPreloadedPageIndexes(new Set([0]));
    setFocalPageIndex(0);
    desiredViewRef.current = 0;
    turningRef.current = false;
    setTransitionState('idle');
  }, [pages.length, token]);

  useEffect(() => {
    const settlePreload = window.setTimeout(() => {
      setPreloadedPageIndexes((current) => {
        const next = new Set(current);
        for (const pageIndex of preloadFlipbookPageIndexes(views, snapshot.page)) {
          next.add(pageIndex);
        }
        return next.size === current.size ? current : next;
      });
    }, 0);
    return () => window.clearTimeout(settlePreload);
  }, [snapshot.page, visiblePageKey, views]);

  const syncSnapshot = useCallback(
    (next: BookSnapshot) => {
      if (activeBookKey.current !== bookKey) return;
      const resolved = next;
      const restoring = restoringViewRef.current || (!userTurnRef.current && next.page !== desiredViewRef.current);
      if (restoring) {
        const desired = desiredViewRef.current;
        if (next.page !== desired) {
          const book = bookRef.current?.pageFlip();
          if (book) {
            book.turnToPage(desired);
            // turnToPage is asynchronous in the flip engine. Wait for its
            // onPageChange snapshot instead of committing the old page.
            return;
          } else {
            return;
          }
        }
        restoringViewRef.current = false;
      }
      userTurnRef.current = false;
      desiredViewRef.current = resolved.page;
      setSnapshot(resolved);
      const focal = resolved.visiblePages.flatMap((viewIndex) => views[viewIndex]?.pageIndexes ?? [])[0];
      if (focal !== undefined) setFocalPageIndex(focal);
    },
    [bookKey, views]
  );
  useEffect(() => {
    if (!restoringViewRef.current) return;
    const restore = window.setTimeout(() => {
      const book = bookRef.current?.pageFlip();
      if (!book) return;
      book.turnToPage(desiredViewRef.current);
    }, 0);
    return () => window.clearTimeout(restore);
  }, [bookKey, syncSnapshot]);
  const navigate = useCallback(
    (direction: 'next' | 'prev') => {
      if (turningRef.current) return;
      const book = bookRef.current;
      if (!book) return;
      desiredViewRef.current = snapshot.page + (direction === 'next' ? 1 : -1);
      turningRef.current = true;
      setTransitionState(reducedMotion ? 'settling' : 'turning');
      const moved = direction === 'next' ? book.flipNext() : book.flipPrev();
      if (!moved) {
        turningRef.current = false;
        setTransitionState('idle');
      }
    },
    [reducedMotion, snapshot.page]
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
          boxShadow: '0 28px 90px rgba(30,23,12,.28)'
        }}
      >
        <HTMLFlipBook
          key={bookKey}
          ref={bookRef}
          width={isDesktop ? 1120 : 560}
          height={760}
          sizing="responsive"
          minWidth={isDesktop ? 600 : 280}
          maxWidth={isDesktop ? 1120 : 560}
          minHeight={300}
          maxHeight={760}
          autoSize
          initialPage={initialViewIndex}
          page={initialViewIndex}
          pageTransition={reducedMotion ? 'instant' : 'animate'}
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
          onChangeState={({ state }) => {
            if (state === 'read') {
              turningRef.current = false;
              setTransitionState('idle');
            } else {
              if (!turningRef.current) userTurnRef.current = true;
              setTransitionState((current) => (current === 'turning' ? 'settling' : current));
            }
          }}
        >
          {views.map((logicalView, viewIndex) => (
            <div key={logicalView.pageIndexes.map((pageIndex) => pages[pageIndex]!.id).join(':')} style={{ height: '100%' }}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${logicalView.pageIndexes.length}, minmax(0, 1fr))`,
                  height: '100%',
                  bgcolor: '#f3eee6',
                  ...(logicalView.pageIndexes.length === 2
                    ? { columnGap: '2px', backgroundImage: 'linear-gradient(90deg, transparent 49.7%, rgba(25,20,14,.24) 50%, transparent 50.3%)' }
                    : {})
                }}
              >
                {logicalView.pageIndexes.map((pageIndex) => {
                  const page = pages[pageIndex]!;
                  return (
                    <FlipbookPage
                      key={page.id}
                      apiClient={apiClient}
                      token={token}
                      page={page}
                      pageNumber={pageIndex + 1}
                      pageCount={pages.length}
                      hotspots={(view.design?.hotspots ?? []).filter((hotspot) => hotspot.flipbookPageId === page.id)}
                      visible={visibleViewIndexes.includes(viewIndex)}
                      interactive={transitionState === 'idle'}
                      shouldLoad={preloadedPageIndexes.has(pageIndex)}
                      onRsvp={onRsvp}
                      onQr={onQr}
                      onUnavailableQr={onUnavailableQr}
                      qrAvailable={view.qr?.available === true}
                    />
                  );
                })}
              </Box>
            </div>
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
