import { CameraIcon, XIcon } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '~/components/ui/dialog';
import type { Point } from '~/lib/judgingSheet';
import { locatePage } from '~/lib/scan/scanPhoto.client';
import { cn } from '~/lib/utils';

/** Long side of the frames looked at for a sheet: enough to find its corners, and quick. */
const FRAME_SIDE = 1000;
/** Milliseconds between frames. */
const INTERVAL = 150;
/** Frames the sheet has to stay put before it is taken. */
const STEADY_FRAMES = 3;
/** How far its corners may move from frame to frame, as a share of the frame's diagonal. */
const STEADY_SHARE = 0.015;
/** How far a sheet has to move after being taken to be taken again, e.g. the next one on top. */
const NEW_SHARE = 0.1;

type Status = 'starting' | 'searching' | 'hold' | 'taken' | 'noCamera';

/** Read, scanned before, or not read. */
export type ScannerNotice = { text: string; tone: 'success' | 'warning' | 'error' };

const TONES = {
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  error: 'bg-destructive text-destructive-foreground',
};

/**
 * The camera, full screen. Takes a photo by itself when a sheet is in view and held still, then
 * waits for the next one: taken away and put down, or another one on top.
 */
export function PageScanner({
  notice,
  onPhoto,
  onClose,
}: {
  /** What came of the last photo taken. */
  notice: ScannerNotice | null;
  onPhoto: (photo: Blob) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('judging');
  const video = useRef<HTMLVideoElement>(null);
  // Opened without a trigger of the dialog, so it does not know where the focus goes back to.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const [status, setStatus] = useState<Status>('starting');
  const [corners, setCorners] = useState<Point[] | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [count, setCount] = useState(0);

  async function take() {
    const element = video.current;
    if (!element?.videoWidth) return;
    const canvas = new OffscreenCanvas(element.videoWidth, element.videoHeight);
    canvas.getContext('2d')!.drawImage(element, 0, 0);
    onPhoto(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 }));
    setCount((current) => current + 1);
  }
  const takeByItself = useEffectEvent(() => void take());

  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let previous: Point[] | null = null;
    let taken: Point[] | null = null;
    let steady = 0;
    const context = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true })!;

    async function look() {
      const element = video.current;
      if (stopped || !element) return;
      const { videoWidth: width, videoHeight: height } = element;
      if (!width) {
        timer = setTimeout(look, INTERVAL);
        return;
      }
      const scale = Math.min(1, FRAME_SIDE / Math.max(width, height));
      context.canvas.width = Math.round(width * scale);
      context.canvas.height = Math.round(height * scale);
      context.drawImage(element, 0, 0, context.canvas.width, context.canvas.height);
      const found = await locatePage(
        context.getImageData(0, 0, context.canvas.width, context.canvas.height),
      ).catch(() => null);
      const shown = found?.map(({ x, y }) => ({ x: x / scale, y: y / scale })) ?? null;

      const diagonal = Math.hypot(width, height);
      const distance = (a: Point[] | null) =>
        shown && a
          ? Math.max(...shown.map(({ x, y }, index) => Math.hypot(x - a[index].x, y - a[index].y)))
          : Infinity;
      steady = distance(previous) < STEADY_SHARE * diagonal ? steady + 1 : 0;
      // The taken sheet went away, or another one lies elsewhere.
      if (!shown || distance(taken) > NEW_SHARE * diagonal) taken = null;
      previous = shown;
      if (shown && !taken && steady >= STEADY_FRAMES) {
        taken = shown;
        takeByItself();
      }
      setSize({ width, height });
      setCorners(shown);
      setStatus(!shown ? 'searching' : taken ? 'taken' : 'hold');
      timer = setTimeout(look, INTERVAL);
    }

    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        // The back camera, as sharp as it gets: the digits are small.
        video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } },
      })
      .then(async (started) => {
        stream = started;
        // Closed while the camera started, e.g. during the question for access.
        if (stopped || !video.current) {
          for (const track of started.getTracks()) track.stop();
          return;
        }
        video.current.srcObject = started;
        await video.current.play();
        setStatus('searching');
        void look();
      })
      .catch(() => setStatus('noCamera'));

    return () => {
      stopped = true;
      clearTimeout(timer);
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, []);

  return (
    // A dialog: Escape closes it, focus stays in it and goes back afterwards.
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener?.focus();
        }}
        className="inset-0 top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-black p-0 text-white sm:max-w-none"
      >
        <DialogTitle className="sr-only">{t('scan.title')}</DialogTitle>
        <div className="relative min-h-0 flex-1">
          <video ref={video} muted playsInline className="size-full object-contain" />
          {corners && (
            <svg
              aria-hidden
              viewBox={`0 0 ${size.width} ${size.height}`}
              preserveAspectRatio="xMidYMid meet"
              className="pointer-events-none absolute inset-0 size-full"
            >
              <polygon
                points={corners.map(({ x, y }) => `${x},${y}`).join(' ')}
                vectorEffect="non-scaling-stroke"
                className={cn(
                  'fill-none stroke-4',
                  status === 'taken' ? 'stroke-success' : 'stroke-warning',
                )}
              />
            </svg>
          )}
          {/* On the picture, where the eyes are while scanning. */}
          <div
            role="status"
            className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))] text-center"
          >
            <p className="rounded-full bg-black/70 px-4 py-2 text-base font-semibold">
              {t(`scanner.${status}`)}
            </p>
            {notice && (
              <p
                className={cn('rounded-full px-4 py-2 text-base font-semibold', TONES[notice.tone])}
              >
                {notice.text}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="min-w-0 flex-1 text-sm text-white/70">
            {count > 0 && t('scanner.count', { count })}
          </p>
          <Button
            size="icon"
            variant="secondary"
            disabled={status === 'starting' || status === 'noCamera'}
            aria-label={t('scanner.take')}
            className="size-14 rounded-full"
            onClick={() => void take()}
          >
            <CameraIcon aria-hidden className="size-6" />
          </Button>
          <Button size="icon" variant="ghost" aria-label={t('scanner.close')} onClick={onClose}>
            <XIcon aria-hidden />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
