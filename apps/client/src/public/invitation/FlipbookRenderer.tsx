import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ApiClient, PublicInvitationView } from '@invitaciones/api-client';
import { Box, Button, Stack, Typography, useMediaQuery } from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import Pause from '@mui/icons-material/Pause';
import PlayArrow from '@mui/icons-material/PlayArrow';
import { FlipEngine, type FlipEngineHandle } from './flip-engine/FlipEngine';
import { useResponsiveLayout } from './flip-engine/responsive-layout';
import type { BookSnapshot, FlipEnginePhase } from './flip-engine/types';
import { FlipbookPage } from './FlipbookPage';
import { useReducedMotion } from '../useReducedMotion';
import './FlipbookRenderer.css';

const initialSnapshot: BookSnapshot = { page: 0, pageCount: 0, orientation: 'portrait', visiblePages: [0] };
const MIN_PAGE_STACK_DEPTH_PX = 1;
const MAX_PAGE_STACK_DEPTH_PX = 7;
type IntroState = 'closed' | 'opening' | 'open';

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
  const mobileReader = useMediaQuery('(orientation: portrait), (max-width: 639px)');
  const engineRef = useRef<FlipEngineHandle | null>(null);
  const readerRef = useRef<HTMLDivElement | null>(null);
  const { layout } = useResponsiveLayout(readerRef);
  const volumeRef = useRef<HTMLDivElement | null>(null);
  const snapshotRef = useRef<BookSnapshot>(initialSnapshot);
  const controlsTimerRef = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState<BookSnapshot>(initialSnapshot);
  const [phase, setPhase] = useState<FlipEnginePhase>('idle');
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
  const isTurning = phase !== 'idle';
  const showMobileSpine = snapshot.page > 0 || isTurning || introState === 'opening';

  const setPageStackDepth = useCallback((pagePosition: number, pageCount: number) => {
    const volume = volumeRef.current;
    if (!volume) return;
    const depth = pageStackDepth(pagePosition, pageCount);
    volume.style.setProperty('--flipbook-accumulated-depth', depth.accumulated);
    volume.style.setProperty('--flipbook-remaining-depth', depth.remaining);
    volume.style.setProperty('--flipbook-accumulated-scale', depth.accumulatedScale);
    volume.style.setProperty('--flipbook-remaining-scale', depth.remainingScale);
  }, []);

  const setTurnOptics = useCallback((turnProgress: number) => {
    const volume = volumeRef.current;
    if (!volume) return;
    const lift = Math.sin(Math.PI * Math.min(1, Math.max(0, turnProgress)));
    volume.style.setProperty('--flipbook-contact-shadow-opacity', (0.24 + 0.04 * lift).toFixed(3));
    volume.style.setProperty('--flipbook-contact-shadow-scale', (0.96 + 0.04 * lift).toFixed(3));
  }, []);

  const revealMobileControls = useCallback(() => {
    setMobileControlsVisible(true);
    if (controlsTimerRef.current !== null) window.clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => {
      controlsTimerRef.current = null;
      setMobileControlsVisible(false);
    }, 2500);
  }, []);

  const syncSnapshot = useCallback(
    (next: BookSnapshot) => {
      snapshotRef.current = next;
      setSnapshot(next);
      setPageStackDepth(next.page, next.pageCount);
      setTurnOptics(0);
      setIntroState(next.page === 0 ? 'closed' : 'open');
    },
    [setPageStackDepth, setTurnOptics]
  );

  useLayoutEffect(() => {
    setSnapshot(initialSnapshot);
    snapshotRef.current = initialSnapshot;
    setPreloadedPageIndexes(new Set([0]));
    setPhase('idle');
    setIntroState('closed');
    setAutoActive(true);
    setMobileControlsVisible(false);
    if (controlsTimerRef.current !== null) window.clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = null;
  }, [bookKey]);

  useEffect(
    () => () => {
      if (controlsTimerRef.current !== null) window.clearTimeout(controlsTimerRef.current);
    },
    []
  );

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

  const navigate = useCallback(
    (direction: 'next' | 'prev', automated = false) => {
      if (!automated) setAutoActive(false);
      revealMobileControls();
      if (direction === 'next' && snapshotRef.current.page === 0) setIntroState('opening');
      return direction === 'next' ? engineRef.current?.flipNext() === true : engineRef.current?.flipPrev() === true;
    },
    [revealMobileControls]
  );

  useEffect(() => {
    if (
      !autoActive ||
      !readerVisible ||
      !documentVisible ||
      reducedMotion ||
      isTurning ||
      !snapshot.pageCount ||
      !canGoNext
    )
      return;
    const timer = window.setTimeout(() => navigate('next', true), snapshot.page === 0 ? 2400 : 3200);
    return () => window.clearTimeout(timer);
  }, [
    autoActive,
    canGoNext,
    documentVisible,
    isTurning,
    navigate,
    readerVisible,
    reducedMotion,
    snapshot.page,
    snapshot.pageCount
  ]);

  if (!pages.length) return <Typography>No pudimos cargar este contenido.</Typography>;
  const progress = visiblePageIndexes.map((pageIndex) => pageIndex + 1).join('–') || '1';

  return (
    <Box
      ref={readerRef}
      className="flipbook-reader"
      tabIndex={0}
      aria-label="Invitación en páginas"
      data-transition={isTurning ? 'turning' : 'idle'}
      data-intro={introState}
      data-visible-pages={visiblePageKey}
      data-mobile-controls={mobileControlsVisible || undefined}
      data-reduced-motion={reducedMotion || undefined}
      onFocusCapture={(event) => {
        revealMobileControls();
        if (!(event.target instanceof Element) || !event.target.closest('[data-auto-control]')) setAutoActive(false);
      }}
      onPointerDownCapture={(event) => {
        revealMobileControls();
        if (!(event.target instanceof Element) || !event.target.closest('[data-auto-control]')) setAutoActive(false);
      }}
      onKeyDown={(event) => {
        revealMobileControls();
        if (!(event.target instanceof Element) || !event.target.closest('[data-auto-control]')) setAutoActive(false);
        if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget && coverCanOpen) {
          event.preventDefault();
          navigate('next');
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
      <Typography component="h1" className="flipbook-reader-title" aria-hidden={!mobileReader || undefined}>
        {view.event?.name ?? 'Invitación'}
      </Typography>
      <Box
        className="flipbook-stage"
        sx={{
          py: { xs: 4, md: 7 },
          px: { xs: 1, md: 4 },
          flexDirection: 'column',
          bgcolor: '#201d18',
          backgroundImage: 'radial-gradient(ellipse at 50% 34%, rgba(226,196,147,.2), transparent 65%)',
          boxShadow: '0 28px 90px rgba(30,23,12,.28)'
        }}
      >
        <Box
          ref={volumeRef}
          className="flipbook-volume"
          data-intro={introState}
          data-orientation={snapshot.orientation}
          data-layout={layout}
          data-cover="none"
          data-can-open={coverCanOpen ? 'true' : undefined}
          data-flip-engine
          data-mobile-spine={showMobileSpine || undefined}
          onClick={(event) => {
            if (snapshotRef.current.page !== 0 || !(event.target instanceof Element)) return;
            if (event.target.closest('button, a, input, select, textarea, [role="button"]')) return;
            navigate('next');
          }}
        >
          <FlipEngine
            key={bookKey}
            ref={engineRef}
            className="flipbook-magazine-engine stf__parent"
            layout={layout}
            onChangeState={setPhase}
            onPageChange={syncSnapshot}
            onReady={syncSnapshot}
            onTurnProgress={({ progress: turnProgress, direction }) => {
              const signed = direction === 'next' ? turnProgress : -turnProgress;
              setPageStackDepth(snapshotRef.current.page + signed, snapshotRef.current.pageCount);
              setTurnOptics(turnProgress);
            }}
            pageCount={pages.length}
            reducedMotion={reducedMotion}
            renderPage={({ folded, index, interactive, shouldLoad, visible }) => {
              const page = pages[index]!;
              return (
                <FlipbookPage
                  apiClient={apiClient}
                  token={token}
                  page={page}
                  pageNumber={index + 1}
                  pageCount={pages.length}
                  hotspots={(view.design?.hotspots ?? []).filter((hotspot) => hotspot.flipbookPageId === page.id)}
                  visible={visible}
                  folded={folded}
                  interactive={interactive}
                  shouldLoad={shouldLoad || preloadedPageIndexes.has(index)}
                  onRsvp={onRsvp}
                  rsvpConfirmed={view.invitation?.responseStatus === 'CONFIRMED'}
                  onUnavailableQr={onUnavailableQr}
                  qrAvailable={view.qr?.available === true}
                />
              );
            }}
          />
        </Box>
        <Stack
          className="flipbook-controls"
          direction="row"
          spacing={2}
          sx={{ mt: 2, justifyContent: 'center', alignItems: 'center' }}
        >
          <Button
            aria-label="Anterior"
            disabled={!canGoPrevious || isTurning}
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
              disabled={!canGoNext || isTurning}
              onClick={() => setAutoActive((current) => !current)}
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              {autoActive ? <Pause /> : <PlayArrow />}
            </Button>
          )}
          <Button
            aria-label={snapshot.page === 0 ? 'Abrir invitación' : 'Siguiente'}
            disabled={!canGoNext || (snapshot.page === 0 && !coverCanOpen) || isTurning}
            onClick={() => navigate('next')}
            sx={{ minWidth: 44, minHeight: 44 }}
          >
            <span className="flipbook-desktop-control">{snapshot.page === 0 ? 'Abrir invitación' : 'Siguiente'}</span>
            <ChevronRight className="flipbook-mobile-control" />
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
