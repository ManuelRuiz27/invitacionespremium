import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ApiClient, PublicInvitationView } from '@invitaciones/api-client';
import HTMLFlipBook, { type BookSnapshot, type FlipBookHandle } from '@gullabs/react-flipbook';
import { Box, Button, Stack, Typography, useMediaQuery } from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import Pause from '@mui/icons-material/Pause';
import PlayArrow from '@mui/icons-material/PlayArrow';
import { FlipbookPage } from './FlipbookPage';
import { useReducedMotion } from '../useReducedMotion';
import './FlipbookRenderer.css';

const initialSnapshot: BookSnapshot = { page: 0, pageCount: 0, orientation: 'portrait', visiblePages: [0] };
const MOBILE_INTRO_FLIP_DELAY_MS = 390;
const MOBILE_INTRO_DURATION_MS = 1200;
const MOBILE_PAGE_FLIP_DURATION_MS = 680;
const MOBILE_PAGE_SHADOW_OPACITY = 0.3;
const MIN_PAGE_STACK_DEPTH_PX = 1;
const MAX_PAGE_STACK_DEPTH_PX = 7;
const CONTINUOUS_DRAG_SWIPE_DISTANCE_PX = 10_000;
type IntroState = 'closed' | 'lifting' | 'opening' | 'open';

function preloadPageIndexes(pageCount: number, visiblePages: number[]): Set<number> {
  if (pageCount <= 0 || visiblePages.length === 0) return new Set();
  const first = Math.max(0, visiblePages[0]! - 1);
  const last = Math.min(pageCount - 1, visiblePages[visiblePages.length - 1]! + 1);
  return new Set(Array.from({ length: last - first + 1 }, (_, index) => first + index));
}

function pageStackDepth(pagePosition: number, pageCount: number) {
  if (pageCount <= 1)
    return { accumulated: '1px', remaining: '1px', accumulatedScale: '0.142857', remainingScale: '0.142857' };
  const progress = Math.min(1, Math.max(0, pagePosition / (pageCount - 1)));
  const depthRange = MAX_PAGE_STACK_DEPTH_PX - MIN_PAGE_STACK_DEPTH_PX;
  const formatDepth = (value: number) => `${Number(value.toFixed(3))}px`;
  const accumulated = MIN_PAGE_STACK_DEPTH_PX + depthRange * progress;
  const remaining = MIN_PAGE_STACK_DEPTH_PX + depthRange * (1 - progress);
  return {
    accumulated: formatDepth(accumulated),
    remaining: formatDepth(remaining),
    accumulatedScale: (accumulated / MAX_PAGE_STACK_DEPTH_PX).toFixed(6),
    remainingScale: (remaining / MAX_PAGE_STACK_DEPTH_PX).toFixed(6)
  };
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
  const readerRef = useRef<HTMLDivElement | null>(null);
  const volumeRef = useRef<HTMLDivElement | null>(null);
  const snapshotRef = useRef<BookSnapshot>(initialSnapshot);
  const focalPageRef = useRef(0);
  const orientationRef = useRef<BookSnapshot['orientation']>('portrait');
  const turningRef = useRef(false);
  const turnCommittedRef = useRef(false);
  const introTimerRef = useRef<number | null>(null);
  const introCameraTimerRef = useRef<number | null>(null);
  const introCameraReadyRef = useRef(false);
  const introTurnReadyRef = useRef(false);
  const mobileControlsTimerRef = useRef<number | null>(null);
  const introStateRef = useRef<IntroState>('closed');
  const [snapshot, setSnapshot] = useState<BookSnapshot>(initialSnapshot);
  const [transitionState, setTransitionState] = useState<'idle' | 'turning' | 'settling'>('idle');
  const [introState, setIntroState] = useState<IntroState>('closed');
  const [preloadedPageIndexes, setPreloadedPageIndexes] = useState<Set<number>>(() => new Set([0]));
  const [autoActive, setAutoActive] = useState(true);
  const [mobileControlsVisible, setMobileControlsVisible] = useState(false);
  const [readerVisible, setReaderVisible] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(() => !document.hidden);
  const bookKey = `${token}:${pages.map((page) => page.id).join(':')}`;
  const visiblePageIndexes = snapshot.visiblePages.filter((pageIndex) => pageIndex >= 0 && pageIndex < pages.length);
  const visiblePageKey = visiblePageIndexes.join(',');
  const canGoPrevious = snapshot.page > 0;
  const canGoNext = visiblePageIndexes.at(-1) !== pages.length - 1;
  const coverCanOpen = snapshot.page === 0 && snapshot.pageCount > 0 && pages.length > 1;
  const isOpening = introState === 'lifting' || introState === 'opening';
  const showMobileSpine = snapshot.page > 0 || transitionState !== 'idle' || introState === 'opening';
  const setPageStackDepth = useCallback((pagePosition: number, pageCount: number) => {
    const volume = volumeRef.current;
    if (!volume) return;
    const depth = pageStackDepth(pagePosition, pageCount);
    volume.style.setProperty('--flipbook-accumulated-depth', depth.accumulated);
    volume.style.setProperty('--flipbook-remaining-depth', depth.remaining);
    volume.style.setProperty('--flipbook-accumulated-scale', depth.accumulatedScale);
    volume.style.setProperty('--flipbook-remaining-scale', depth.remainingScale);
  }, []);
  const setTurnOptics = useCallback((progress: number) => {
    const volume = volumeRef.current;
    if (!volume) return;
    const clamped = Math.min(1, Math.max(0, progress));
    // A physical sheet lifts the contact shadow most at mid-turn and lays it
    // back down at either end. Deriving this from the engine's real fold
    // progress avoids the lighting jump produced by turning/settling classes.
    const lift = Math.sin(Math.PI * clamped);
    volume.style.setProperty('--flipbook-contact-shadow-opacity', (0.24 + 0.04 * lift).toFixed(3));
    volume.style.setProperty('--flipbook-contact-shadow-scale', (0.96 + 0.04 * lift).toFixed(3));
  }, []);
  const updateIntroState = useCallback((next: IntroState) => {
    introStateRef.current = next;
    setIntroState(next);
  }, []);
  const finishMobileIntro = useCallback(() => {
    if (introStateRef.current === 'opening' && introCameraReadyRef.current && introTurnReadyRef.current) {
      updateIntroState('open');
    }
  }, [updateIntroState]);
  const revealMobileControls = useCallback(() => {
    setMobileControlsVisible(true);
    if (mobileControlsTimerRef.current !== null) window.clearTimeout(mobileControlsTimerRef.current);
    mobileControlsTimerRef.current = window.setTimeout(() => {
      mobileControlsTimerRef.current = null;
      setMobileControlsVisible(false);
    }, 2500);
  }, []);

  useLayoutEffect(() => {
    setSnapshot(initialSnapshot);
    snapshotRef.current = initialSnapshot;
    setPreloadedPageIndexes(new Set([0]));
    turningRef.current = false;
    turnCommittedRef.current = false;
    focalPageRef.current = 0;
    if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current);
    introTimerRef.current = null;
    if (introCameraTimerRef.current !== null) window.clearTimeout(introCameraTimerRef.current);
    introCameraTimerRef.current = null;
    introCameraReadyRef.current = false;
    introTurnReadyRef.current = false;
    if (mobileControlsTimerRef.current !== null) window.clearTimeout(mobileControlsTimerRef.current);
    mobileControlsTimerRef.current = null;
    setTransitionState('idle');
    introStateRef.current = 'closed';
    setIntroState('closed');
    setAutoActive(true);
    setMobileControlsVisible(false);
  }, [bookKey]);

  useLayoutEffect(() => {
    setPageStackDepth(snapshot.page, snapshot.pageCount);
    setTurnOptics(0);
  }, [setPageStackDepth, setTurnOptics, snapshot.page, snapshot.pageCount]);

  useEffect(() => {
    const reader = readerRef.current;
    if (!reader) return;
    if (typeof IntersectionObserver === 'undefined') {
      setReaderVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setReaderVisible((entry?.intersectionRatio ?? 0) >= 0.6), {
      threshold: [0, 0.6, 1]
    });
    observer.observe(reader);
    return () => observer.disconnect();
  }, [bookKey]);

  useEffect(() => {
    const syncVisibility = () => setDocumentVisible(!document.hidden);
    document.addEventListener('visibilitychange', syncVisibility);
    return () => document.removeEventListener('visibilitychange', syncVisibility);
  }, []);

  useEffect(
    () => () => {
      if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current);
      if (introCameraTimerRef.current !== null) window.clearTimeout(introCameraTimerRef.current);
      if (mobileControlsTimerRef.current !== null) window.clearTimeout(mobileControlsTimerRef.current);
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

  const syncSnapshot = useCallback(
    (next: BookSnapshot) => {
      // Core exposes a spread head, not the last real leaf read in portrait.
      // Resize can emit `flip` before `changeOrientation`; retain that leaf until
      // the orientation callback restores it through the public instant API.
      if (next.orientation === orientationRef.current && !next.visiblePages.includes(focalPageRef.current)) {
        focalPageRef.current = next.page;
      }
      snapshotRef.current = next;
      setPageStackDepth(next.page, next.pageCount);
      setSnapshot(next);
      if (next.page === 0) updateIntroState('closed');
      else if (introStateRef.current === 'closed') updateIntroState('open');
    },
    [setPageStackDepth, updateIntroState]
  );
  const syncTurnProgress = useCallback(
    ({ progress, direction }: { progress: number; direction: 'next' | 'prev' }) => {
      const current = snapshotRef.current;
      const signedProgress = direction === 'next' ? progress : -progress;
      setPageStackDepth(current.page + signedProgress, current.pageCount);
      setTurnOptics(progress);
    },
    [setPageStackDepth, setTurnOptics]
  );
  const syncPageChange = useCallback(
    (next: BookSnapshot) => {
      syncSnapshot(next);
      if (!turningRef.current) return;

      // The engine commits the new leaf before it reports READ. That commit is
      // the physical landing point; keep it distinct from the moving curl.
      turnCommittedRef.current = true;
      setTransitionState('settling');
    },
    [syncSnapshot]
  );
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

  const turnPage = useCallback((direction: 'next' | 'prev') => {
    if (turningRef.current) return;
    const book = bookRef.current;
    if (!book) return;

    turningRef.current = true;
    turnCommittedRef.current = false;
    setTransitionState('turning');
    const moved = direction === 'next' ? book.flipNext() : book.flipPrev('bottom');
    if (!moved) {
      turningRef.current = false;
      turnCommittedRef.current = false;
      setTransitionState('idle');
    }
  }, []);

  const openCover = useCallback(
    (automated = false) => {
      if (!automated) setAutoActive(false);
      if (!coverCanOpen || turningRef.current || introTimerRef.current !== null) return;
      if (reducedMotion) {
        updateIntroState('opening');
        turnPage('next');
        return;
      }
      if (mobileReader) {
        introCameraReadyRef.current = false;
        introTurnReadyRef.current = false;
        updateIntroState('opening');
        introTimerRef.current = window.setTimeout(() => {
          introTimerRef.current = null;
          turnPage('next');
        }, MOBILE_INTRO_FLIP_DELAY_MS);
        introCameraTimerRef.current = window.setTimeout(() => {
          introCameraTimerRef.current = null;
          introCameraReadyRef.current = true;
          finishMobileIntro();
        }, MOBILE_INTRO_DURATION_MS);
        return;
      }
      updateIntroState('lifting');
      introTimerRef.current = window.setTimeout(() => {
        introTimerRef.current = null;
        updateIntroState('opening');
        turnPage('next');
      }, 560);
    },
    [coverCanOpen, finishMobileIntro, mobileReader, reducedMotion, turnPage, updateIntroState]
  );

  const navigate = useCallback(
    (direction: 'next' | 'prev') => {
      setAutoActive(false);
      revealMobileControls();
      if (direction === 'next' && snapshot.page === 0) {
        openCover();
        return;
      }
      turnPage(direction);
    },
    [openCover, revealMobileControls, snapshot.page, turnPage]
  );

  useEffect(() => {
    if (
      !autoActive ||
      !readerVisible ||
      !documentVisible ||
      reducedMotion ||
      transitionState !== 'idle' ||
      isOpening ||
      !snapshot.pageCount ||
      !canGoNext
    )
      return;
    const timer = window.setTimeout(
      () => {
        if (turningRef.current) return;
        if (snapshot.page === 0) openCover(true);
        else turnPage('next');
      },
      snapshot.page === 0 ? 2400 : 3200
    );
    return () => window.clearTimeout(timer);
  }, [
    autoActive,
    readerVisible,
    documentVisible,
    reducedMotion,
    transitionState,
    isOpening,
    snapshot.page,
    snapshot.pageCount,
    canGoNext,
    openCover,
    turnPage
  ]);

  if (!pages.length) return <Typography>No pudimos cargar este contenido.</Typography>;
  const progress = visiblePageIndexes.map((pageIndex) => pageIndex + 1).join('–') || '1';

  return (
    <Box
      ref={readerRef}
      className="flipbook-reader"
      tabIndex={0}
      aria-label="Invitación en páginas"
      data-transition={transitionState}
      data-intro={introState}
      data-visible-pages={visiblePageKey}
      data-mobile-controls={mobileControlsVisible || undefined}
      onFocusCapture={(event) => {
        revealMobileControls();
        if (!(event.target instanceof Element) || !event.target.closest('[data-auto-control]')) setAutoActive(false);
      }}
      onPointerDownCapture={(event) => {
        revealMobileControls();
        if (!(event.target instanceof Element) || !event.target.closest('[data-auto-control]')) setAutoActive(false);
        if (turningRef.current || introTimerRef.current !== null) {
          event.stopPropagation();
          return;
        }
      }}
      data-reduced-motion={reducedMotion || undefined}
      onKeyDown={(event) => {
        revealMobileControls();
        if (!(event.target instanceof Element) || !event.target.closest('[data-auto-control]')) setAutoActive(false);
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
          ref={volumeRef}
          className="flipbook-volume"
          data-intro={introState}
          data-orientation={snapshot.orientation}
          data-cover={snapshot.page === 0 && snapshot.orientation === 'landscape' ? 'landscape' : 'none'}
          data-can-open={coverCanOpen ? 'true' : undefined}
          data-mobile-spine={showMobileSpine || undefined}
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
            flippingTime={reducedMotion ? 0 : mobileReader ? MOBILE_PAGE_FLIP_DURATION_MS : 720}
            respectReducedMotion
            drawShadow
            maxShadowOpacity={mobileReader ? MOBILE_PAGE_SHADOW_OPACITY : 0.48}
            pageBackground="#f3eee6"
            flipOnClick="never"
            respectInteractiveContent
            allowTouchScroll
            // Disable the engine's separate fast-swipe shortcut. Every drag now
            // releases through stopMove(), which settles the live fold from its
            // current geometry instead of cancelling it and restarting at a corner.
            swipeDistance={CONTINUOUS_DRAG_SWIPE_DISTANCE_PX}
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
            onPageChange={syncPageChange}
            onChangeOrientation={syncOrientation}
            onTurnProgress={syncTurnProgress}
            onChangeState={({ state }) => {
              if (state === 'read') {
                const current = snapshotRef.current;
                setPageStackDepth(current.page, current.pageCount);
                setTurnOptics(0);
                turningRef.current = false;
                turnCommittedRef.current = false;
                setTransitionState('idle');
                if (introStateRef.current === 'opening') {
                  if (reducedMotion || !mobileReader) {
                    updateIntroState('open');
                  } else {
                    introTurnReadyRef.current = true;
                    finishMobileIntro();
                  }
                }
              } else {
                if (!turningRef.current) turnCommittedRef.current = false;
                turningRef.current = true;
                // FOLD_CORNER, USER_FOLD and FLIPPING are all moving-paper
                // phases. Repeated engine events are idempotent and cannot
                // fabricate a landing before the page index actually commits.
                if (!turnCommittedRef.current) setTransitionState('turning');
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
                folded={snapshot.page > 0 && pageIndex === visiblePageIndexes[0]}
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
        {pages.length > 1 && !reducedMotion && (
          <Button
            data-auto-control
            aria-label={autoActive ? 'Pausar animación automática' : 'Reanudar animación automática'}
            disabled={!canGoNext || transitionState !== 'idle' || isOpening}
            onClick={() => setAutoActive((current) => !current)}
            sx={{ minWidth: 44, minHeight: 44 }}
          >
            {autoActive ? <Pause /> : <PlayArrow />}
          </Button>
        )}
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
