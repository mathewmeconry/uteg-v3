import QRCode from 'qrcode';
import { cn } from '~/lib/utils';

const QUIET_ZONE = 4;

/** QR code as an inline SVG, always black on white so that every camera reads it. */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const size = modules.size + 2 * QUIET_ZONE;

  let path = '';
  for (let row = 0; row < modules.size; row++) {
    for (let column = 0; column < modules.size; column++) {
      if (modules.get(row, column)) {
        path += `M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
      }
    }
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={cn('size-48 rounded-md bg-white', className)}
    >
      <path d={path} fill="#000" />
    </svg>
  );
}
