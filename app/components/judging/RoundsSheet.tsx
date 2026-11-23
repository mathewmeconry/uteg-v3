import { CheckIcon, ListOrderedIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GradeDrafts } from '~/components/grading/useGradeDrafts';
import { StatusBadge } from '~/components/StatusBadge';
import { Button } from '~/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { StarterList } from './StarterList';
import type { TabletRound } from './types';

/** Who starts on this apparatus in which round, also in the rounds to come. */
export function RoundsSheet({
  rounds,
  currentRound,
  currentId,
  drafts,
  onSelect,
}: {
  rounds: readonly TabletRound[];
  currentRound: number | null;
  currentId?: string;
  drafts: GradeDrafts;
  /** Only for starters of the current and of confirmed rounds. */
  onSelect: (entryId: string) => void;
}) {
  const { t } = useTranslation(['judging', 'common']);
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-14 px-5 text-lg">
          <ListOrderedIcon aria-hidden />
          {t('list.all')}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="pr-6 font-display text-2xl font-bold">{t('list.all')}</SheetTitle>
          <SheetDescription>{t('list.allText')}</SheetDescription>
        </SheetHeader>
        <div className="grid grid-cols-1 gap-6 overflow-y-auto p-4">
          {rounds.map(({ round, slots }) => {
            const isCurrent = round === currentRound;
            const isDone = currentRound === null || round < currentRound;
            return (
              <section key={round} aria-current={isCurrent ? 'step' : undefined}>
                <h3 className="mb-2 flex items-center gap-3 font-display text-xl">
                  {t('common:round', { number: round + 1 })}
                  <StatusBadge
                    tone={isCurrent ? 'live' : isDone ? 'done' : 'neutral'}
                    icon={isDone ? CheckIcon : undefined}
                  >
                    {t(isCurrent ? 'list.now' : isDone ? 'list.done' : 'list.later')}
                  </StatusBadge>
                </h3>
                <StarterList
                  slots={slots}
                  drafts={drafts}
                  currentId={isCurrent ? currentId : undefined}
                  showMissing={isDone}
                  onSelect={
                    isCurrent || isDone
                      ? (entryId) => {
                          onSelect(entryId);
                          setOpen(false);
                        }
                      : undefined
                  }
                />
              </section>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
