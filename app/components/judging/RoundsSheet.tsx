import { ListOrderedIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GradeDrafts } from '~/components/grading/useGradeDrafts';
import { Badge } from '~/components/ui/badge';
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
  onSelect: (entryId: string) => void;
}) {
  const { t } = useTranslation(['judging', 'common']);
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-11">
          <ListOrderedIcon aria-hidden />
          {t('list.all')}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="text-lg">{t('list.all')}</SheetTitle>
          <SheetDescription>{t('list.allText')}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-6 overflow-y-auto p-4">
          {rounds.map(({ round, slots }) => {
            const isCurrent = round === currentRound;
            const isDone = currentRound === null || round < currentRound;
            return (
              <section key={round} aria-current={isCurrent ? 'step' : undefined}>
                <h3 className="mb-2 flex items-center gap-2 text-lg font-bold">
                  {t('common:round', { number: round + 1 })}
                  <Badge variant={isCurrent ? 'default' : 'outline'}>
                    {t(isCurrent ? 'list.now' : isDone ? 'list.done' : 'list.later')}
                  </Badge>
                </h3>
                <StarterList
                  slots={slots}
                  drafts={drafts}
                  currentId={isCurrent ? currentId : undefined}
                  onSelect={
                    isCurrent
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
