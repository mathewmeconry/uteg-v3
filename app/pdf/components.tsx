import { Image, Path, Rect, Svg, Text, View, type ViewProps } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { isValidElement, useRef, type ReactNode } from 'react';

type Style = Extract<NonNullable<ViewProps['style']>, { length?: never }> | Record<string, unknown>;

export const FONT = 'Roboto';
const BORDER = '#d4d4d8';
export const MUTED = '#52525b';

export type Logo = { mimeType: string; data: Uint8Array };

export function LogoImage({ logo, height }: { logo: Logo; height: number }) {
  return (
    <Image
      src={{ data: Buffer.from(logo.data), format: logo.mimeType === 'image/png' ? 'png' : 'jpg' }}
      style={{ height, maxWidth: height * 4, objectFit: 'contain' }}
    />
  );
}

const QUIET_ZONE = 4;

export function QrCode({ value, size }: { value: string; size: number }) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const total = modules.size + 2 * QUIET_ZONE;
  let path = '';
  for (let row = 0; row < modules.size; row++) {
    for (let column = 0; column < modules.size; column++) {
      if (modules.get(row, column)) {
        path += `M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
      }
    }
  }
  return (
    <Svg viewBox={`0 0 ${total} ${total}`} style={{ width: size, height: size }}>
      <Rect x={0} y={0} width={total} height={total} fill="#ffffff" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}

/** Cuts off text after some lines. */
export function clamp(maxLines: number) {
  return { maxLines, textOverflow: 'ellipsis' } as const;
}

/** A table column. Columns with `flex` share what the fixed ones leave. */
export type Column = { width: number } | { flex: number };

/**
 * Where a word may break: after its hyphens, and anywhere if it is long. The empty parts let
 * react-pdf break without adding a hyphen, which would change names.
 */
export function breakWord(word: string, maxLength: number) {
  return word
    .split(/(?<=[-/])(?=.)/u)
    .flatMap((part) =>
      part.length > maxLength ? (part.match(/.{1,4}(?!.{1,2}$)/gu) ?? [part]) : [part],
    )
    .flatMap((part, index) => (index === 0 ? [part] : ['', part]));
}

/** Text in a column. Long text wraps inside of it. */
export function Cell({
  column,
  align = 'left',
  style,
  children,
}: {
  column: Column;
  align?: 'left' | 'center' | 'right';
  style?: Style;
  children?: ReactNode;
}) {
  const size =
    'flex' in column
      ? // minWidth 0, otherwise the longest word makes columns differ between rows.
        { flexGrow: column.flex, flexShrink: 1, flexBasis: 0, minWidth: 0 }
      : { width: column.width, flexShrink: 0, flexGrow: 0 };
  const box = { ...size, paddingHorizontal: 3, paddingVertical: 2 };
  if (isValidElement(children)) {
    return <View style={{ ...box, alignItems: 'center' }}>{children}</View>;
  }
  return (
    <Text
      hyphenationCallback={(word) => breakWord(word, 12)}
      style={{ ...box, textAlign: align, ...style }}
    >
      {children}
    </Text>
  );
}

/**
 * A table whose header is repeated on every page it continues on. The first row stays together
 * with the header and with `title`. react-pdf's minPresenceAhead has no effect on tables that can
 * break, so the start is one block and the repeated header is left out on its page.
 */
export function Table({
  title,
  header,
  rows,
}: {
  title?: ReactNode;
  header: ReactNode;
  rows: ReactNode[];
}) {
  const startPage = useRef(0);
  return (
    <View style={{ marginBottom: 18 }}>
      <View wrap={false}>
        <View
          render={({ pageNumber }) => {
            startPage.current = pageNumber;
            return null;
          }}
        />
        {title}
        {header}
        {rows[0]}
      </View>
      {rows.length > 1 && (
        <View>
          <View
            fixed
            render={({ pageNumber }) => (pageNumber === startPage.current ? null : header)}
          />
          {rows.slice(1)}
        </View>
      )}
    </View>
  );
}

export function HeaderRow({ style, children }: { style?: Style; children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        fontWeight: 700,
        borderBottomWidth: 1.5,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

/** Never split between pages. */
export function Row({ style, children }: { style?: Style; children: ReactNode }) {
  return (
    <View
      wrap={false}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 0.5,
        borderBottomColor: BORDER,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

/** "1 / 3" at the bottom right, not counting covers. */
export function PageNumber({ before = 0, uncounted = 0 }) {
  return (
    <Text
      fixed
      style={{ position: 'absolute', bottom: 18, right: 40, fontSize: 8, color: MUTED }}
      render={({ pageNumber, totalPages }) => `${pageNumber - before} / ${totalPages - uncounted}`}
    />
  );
}
