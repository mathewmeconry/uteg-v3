import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TabletRound, TabletSlot } from '~/components/judging/types';
import { Badge } from '~/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { useApparatusName } from '~/hooks/useApparatusName';
import { GradingRow } from './GradingRow';
import type { GradeDrafts } from './useGradeDrafts';

/** The rounds of one apparatus. Follows the current round until another one is chosen. */
export function GradingTable({
  apparatus,
  rounds,
  currentRound,
  subtitle,
  footer,
  drafts,
  canEdit,
}: {
  apparatus: string;
  rounds: readonly TabletRound[];
  currentRound: number;
  subtitle?: ReactNode;
  /** Below the rows, e.g. to confirm the round. */
  footer?: (round: number) => ReactNode;
  drafts: GradeDrafts;
  canEdit: boolean;
}) {
  const { t } = useTranslation(['judging', 'common']);
  const name = useApparatusName()(apparatus);
  const [chosen, setChosen] = useState<number | null>(null);
  const [edited, setEdited] = useState<number | null>(null);

  const isDirty = (slot: TabletSlot) => drafts.get(slot).isDirty;
  // Rows that are being edited must not be replaced by the next round.
  const isEditing = edited !== null && rounds[edited]?.slots.some(isDirty);
  const selected = Math.min(chosen ?? (isEditing ? edited : currentRound), rounds.length - 1);

  return (
    <section
      aria-label={name}
      onChange={() => setEdited(selected)}
      className="overflow-hidden rounded-xl border bg-card"
    >
      <Tabs
        value={String(selected)}
        onValueChange={(value) => {
          const round = Number(value);
          setChosen(round === currentRound ? null : round);
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3">
          <div>
            <h2 className="text-xl font-bold">{name}</h2>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <TabsList
            aria-label={t('grading.roundsOf', { apparatus: name })}
            className="flex-wrap group-data-[orientation=horizontal]/tabs:h-auto"
          >
            {rounds.map(({ round, slots }) => {
              const dirty = slots.filter(isDirty).length;
              return (
                <TabsTrigger key={round} value={String(round)} className="h-9 pointer-coarse:h-11">
                  {t('common:round', { number: round + 1 })}
                  {dirty > 0 && (
                    <Badge
                      variant="destructive"
                      aria-label={t('grading.unsavedCount', { count: dirty })}
                    >
                      {dirty}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>
        {rounds.map(({ round, slots }) => (
          <TabsContent key={round} value={String(round)}>
            {slots.length === 0 ? (
              <p className="px-4 py-3 text-muted-foreground">{t('grading.nobody')}</p>
            ) : (
              <ol className="divide-y">
                {slots.map((slot, index) => (
                  <GradingRow
                    key={slot.entryId}
                    slot={slot}
                    position={index + 1}
                    drafts={drafts}
                    canEdit={canEdit}
                  />
                ))}
              </ol>
            )}
            {footer?.(round)}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
