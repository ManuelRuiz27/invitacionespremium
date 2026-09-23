import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ApiClient, PublicInvitationView } from '@invitaciones/api-client';
import HTMLFlipBook, { type BookSnapshot, type FlipBookHandle } from '@gullabs/react-flipbook';
import { Box, Button, Stack, Typography, useMediaQuery } from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import { FlipbookPage } from './FlipbookPage';
import { useReducedMotion } from '../useReducedMotion';
import './FlipbookRenderer.css';

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
  onUnavailableQr
}: {
  apiClient: ApiClient;
  token: string;
  view: PublicInvitationView;
  onRsvp: () => void;
  onUnavailableQr: () => void;
}) {
  const pages = useMemo(
    () => [...(view.design?.pages ?? [])].sort((a, b) => a.position - b.position),
    [view.design?.pages]
  );
  const reducedMotion = useReducedMotion();
  // Matches the existing 767px reader breakpoint. Short touch landscapes keep
  // the same single-leaf shell; the engine still decides orientation from its host.
  const mobileReader = useMediaQuery('(max-width: 767px), (pointer: coarse) and (max-height: 500px)');
  const bookRef = useRef<FlipBookHandle | null>(null);
  const focalPageRef = useRef(0);
  const orientationRef = useRef<BookSnapshot['orientation']>('portrait');
  const turningRef = useRef(false);
  const touchRef = useRef<{ id: number; x: number; y: number; time: number; scrolling: boolean } | null>(null);
  const introTimerRef = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState<BookSnapshot>(initialSnapshot);
  const [transitionState, setTransitionState] = useState<'idle' | 'turning' | 'settling'>('idle');
  const [introState, setIntroState] = useState<'closed' | 'lifting' | 'opening' | 'open'>('closed');
  const [preloadedPageIndexes, setPreloadedPageIndexes] = useState<Set<number>>(() => new Set([0]));
  const bookKey = `${token}:${pages.map((page) => page.id).join(':')}`;
  const visiblePageIndexes = snapshot.visiblePages.filter((pageIndex) => pageIndex >= 0 && pageIndex < pages.length);
  const visiblePageKey = visiblePageIndexes.join(',');
  const canGoPrevious = snapshot.page > 0;
  const canGoNext = visiblePageIndexes.at(-1) !== pages.length - 1;
  const coverCanOpen = snapshot.page === 0 && snapshot.pageCount > 0 && pages.length > 1;
  const isOpening = introState === 'lifting' || introState === 'opening';

  useLayoutEffect(() => {
    setSnapshot(initialSnapshot);
    setPreloadedPageIndexes(new Set([0]));
    turningRef.current = false;
    focalPageRef.current = 0;
    if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current);
    introTimerRef.current = null;
    setTransitionState('idle');
    setIntroState('closed');
  }, [bookKey]);

  useEffect(
    () => () => {
      if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current);
    },
    []
  );

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
    // Core exposes a spread head, not the last real leaf read in portrait.
    // Resize can emit `flip` before `changeOrientation`; retain that leaf until
    // the orientation callback restores it through the public instant API.
    if (next.orientation === orientationRef.current && !next.visiblePages.includes(focalPageRef.current)) {
      focalPageRef.current = next.page;
    }
    setSnapshot(next);
    setIntroState(next.page === 0 ? 'closed' : 'open');
  }, []);
  const syncOrientation = useCallback(() => {
    const book = bookRef.current?.pageFlip();
    if (!book || book.getPageCount() === 0) return;
    orientationRef.current = book.getOrientation();
    if (book.getOrientation() === 'portrait' && book.getCurrentPageIndex() !== focalPageRef.current) {
      bookRef.current?.turnToPage(focalPageRef.current);
    }
    syncSnapshot({
      page: book.getCurrentPageIndex(),
      pageCount: book.getPageCount(),
      orientation: book.getOrientation(),
      visiblePages: book.getVisiblePages()
    });
  }, [syncSnapshot]);

  const turnPage = useCallback(
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

  const openCover = useCallback(() => {
    if (!coverCanOpen || turningRef.current || introTimerRef.current !== null) return;
    if (reducedMotion) {
      setIntroState('opening');
      turnPage('next');
      return;
    }
    setIntroState('lifting');
    introTimerRef.current = window.setTimeout(
      () => {
        introTimerRef.current = null;
        setIntroState('opening');
        turnPage('next');
      },
      mobileReader ? 180 : 560
    );
  }, [coverCanOpen, mobileReader, reducedMotion, turnPage]);

  const navigate = useCallback(
    (direction: 'next' | 'prev') => {
      if (direction === 'next' && snapshot.page === 0) {
        openCover();
        return;
      }
      turnPage(direction);
    },
    [openCover, snapshot.page, turnPage]
  );

  if (!pages.length) return <Typography>No pudimos cargar este contenido.</Typography>;
  const progress = visiblePageIndexes.map((pageIndex) => pageIndex + 1).join('–') || '1';

  return (
    <Box
      className="flipbook-reader"
      tabIndex={0}
      aria-label="Invitación en páginas"
      data-transition={transitionState}
      data-visible-pages={visiblePageKey}
      onPointerDownCapture={(event) => {
        if (turningRef.current || introTimerRef.current !== null) {
          event.stopPropagation();
          return;
        }
        if (!mobileReader || event.pointerType !== 'touch' || !event.isPrimary || !(event.target instanceof Element))
          return;
        if (
          !event.target.closest('.stf__block') ||
          event.target.closest('button, a, input, select, textarea, [role="button"]')
        )
          return;
        touchRef.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          time: event.timeStamp,
          scrolling: false
        };
      }}
      onPointerMoveCapture={(event) => {
        const touch = touchRef.current;
        if (!touch || touch.id !== event.pointerId) return;
        const dx = Math.abs(event.clientX - touch.x);
        const dy = Math.abs(event.clientY - touch.y);
        if (dy > 10 && dy > dx) touch.scrolling = true;
      }}
      onPointerCancelCapture={() => {
        touchRef.current = null;
      }}
      onPointerUpCapture={(event) => {
        const touch = touchRef.current;
        if (!touch || touch.id !== event.pointerId) return;
        touchRef.current = null;
        const dx = event.clientX - touch.x;
        const dy = Math.abs(event.clientY - touch.y);
        if (touch.scrolling || Math.abs(dx) < 40 || Math.abs(dx) <= dy * 1.5 || event.timeStamp - touch.time > 1000)
          return;
        const book = bookRef.current?.pageFlip();
        if (!book || (book.getState() !== 'read' && book.getState() !== 'user_fold')) return;
        // Keep core's finger-following fold and pan-y scrolling. On release,
        // commit the intentional swipe through the same engine, without its
        // fixed 250ms cutoff making ordinary slower swipes snap back.
        event.preventDefault();
        event.stopPropagation();
        // End the engine's captured drag before requesting the turn. Otherwise
        // native touch pointerleave can abandon the new animation on release.
        event.target.dispatchEvent(
          new PointerEvent('pointercancel', {
            bubbles: true,
            pointerId: event.pointerId,
            pointerType: 'touch',
            isPrimary: true
          })
        );
        turningRef.current = false;
        turnPage(dx < 0 ? 'next' : 'prev');
      }}
      data-reduced-motion={reducedMotion || undefined}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget && coverCanOpen) {
          event.preventDefault();
          openCover();
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          navigate('prev');
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          navigate('next');
        }
      }}
      sx={{
        outline: 'none',
        '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 4 }
      }}
    >
      <Box
        className="flipbook-stage"
        sx={{
          py: { xs: 4, md: 7 },
          px: { xs: 1, md: 4 },
          bgcolor: '#201d18',
          backgroundImage: 'radial-gradient(ellipse at 50% 34%, rgba(226,196,147,.2), transparent 65%)',
          boxShadow: '0 28px 90px rgba(30,23,12,.28)',
          // The engine writes minWidth * 2 on its responsive host before it
          // evaluates portrait mode. Remove that host floor so usePortrait can
          // actually select one physical leaf below the available width.
          '& .flipbook-magazine-engine.stf__parent': { minWidth: '0 !important' }
        }}
      >
        <Box
          className="flipbook-volume"
          data-intro={introState}
          data-orientation={snapshot.orientation}
          data-cover={snapshot.page === 0 && snapshot.orientation === 'landscape' ? 'landscape' : 'none'}
          data-can-open={coverCanOpen ? 'true' : undefined}
          onClick={(event) => {
            if (snapshot.page !== 0 || !(event.target instanceof Element)) return;
            if (event.target.closest('button, a, input, select, textarea, [role="button"]')) return;
            openCover();
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
            minHeight={1}
            maxHeight={680}
            autoSize
            initialPage={0}
            page={snapshot.page}
            pageTransition={reducedMotion ? 'instant' : 'animate'}
            hardCovers
            usePortrait
            flippingTime={reducedMotion ? 0 : mobileReader ? 450 : 720}
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
            onReady={(next) => {
              orientationRef.current = next.orientation;
              syncSnapshot(next);
            }}
            onPageChange={syncSnapshot}
            onChangeOrientation={syncOrientation}
            onChangeState={({ state }) => {
              if (state === 'read') {
                turningRef.current = false;
                setTransitionState('idle');
              } else {
                turningRef.current = true;
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
                interactive={transitionState === 'idle' && !isOpening}
                shouldLoad={preloadedPageIndexes.has(pageIndex)}
                onRsvp={onRsvp}
                rsvpConfirmed={view.invitation?.responseStatus === 'CONFIRMED'}
                onUnavailableQr={onUnavailableQr}
                qrAvailable={view.qr?.available === true}
              />
            ))}
          </HTMLFlipBook>
        </Box>
      </Box>
      <Stack
        className="flipbook-controls"
        direction="row"
        spacing={2}
        sx={{ mt: 2, justifyContent: 'center', alignItems: 'center' }}
      >
        <Button
          aria-label="Anterior"
          disabled={!canGoPrevious || transitionState !== 'idle' || isOpening}
          onClick={() => navigate('prev')}
          sx={{ minWidth: 44, minHeight: 44 }}
        >
          <ChevronLeft className="flipbook-mobile-control" />
          <span className="flipbook-desktop-control">Anterior</span>
        </Button>
        <Typography aria-live="polite" aria-atomic="true">
          <span className="flipbook-desktop-control">
            Página {progress} de {pages.length}
          </span>
          <span className="flipbook-mobile-control" aria-hidden="true">
            {progress} / {pages.length}
          </span>
        </Typography>
        <Button
          aria-label={snapshot.page === 0 ? 'Abrir invitación' : 'Siguiente'}
          disabled={!canGoNext || (snapshot.page === 0 && !coverCanOpen) || transitionState !== 'idle' || isOpening}
          onClick={() => navigate('next')}
          sx={{ minWidth: 44, minHeight: 44 }}
        >
          <span className="flipbook-desktop-control">{snapshot.page === 0 ? 'Abrir invitación' : 'Siguiente'}</span>
          <ChevronRight className="flipbook-mobile-control" />
        </Button>
      </Stack>
    </Box>
  );
}
