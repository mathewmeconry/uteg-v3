import { InfoIcon, TriangleAlertIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { FormField } from '~/components/FormField';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import type { Sex } from '~/generated/prisma/enums';
import { cn } from '~/lib/utils';
import { getStartWarnings, type Division } from './divisionList';
import { useDivisionName } from './useDivisionName';

type DialogProps = { onClose: () => void };

/** Confirms an action on divisions. Closes at once, the result is shown as a toast. */
function DivisionConfirm({
  title,
  text,
  confirmLabel,
  destructive,
  fields,
  divisions,
  onClose,
  children,
}: DialogProps & {
  title: string;
  text: string;
  confirmLabel: string;
  destructive?: boolean;
  fields: Record<string, string>;
  divisions: Division[];
  children?: ReactNode;
}) {
  const { t } = useTranslation(['divisions', 'common']);
  const fetcher = useFetcher();
  const isEmpty = divisions.length === 0;

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{isEmpty ? t('nothingLeft') : text}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <fetcher.Form method="post" onSubmit={onClose}>
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {divisions.map(({ id }) => (
            <input key={id} type="hidden" name="division" value={id} />
          ))}
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{t('common:actions.cancel')}</AlertDialogCancel>
            <Button
              type="submit"
              variant={destructive ? 'destructive' : 'default'}
              disabled={isEmpty}
            >
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </fetcher.Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DivisionNames({
  divisions,
  detail,
}: {
  divisions: Division[];
  detail?: (division: Division) => string;
}) {
  const name = useDivisionName();
  return (
    <ul className="list-disc space-y-0.5 pl-5">
      {divisions.map((division) => (
        <li key={division.id}>
          {name(division)}
          {detail && ` (${detail(division)})`}
        </li>
      ))}
    </ul>
  );
}

function Warning({
  title,
  text,
  severe,
  children,
}: {
  title: string;
  text: string;
  severe?: boolean;
  children: ReactNode;
}) {
  return (
    // Part of the dialog's content, which is announced anyway.
    <Alert
      role="group"
      className={cn(severe ? 'border-destructive' : 'border-warning bg-warning/10')}
    >
      <TriangleAlertIcon
        aria-hidden
        className={severe ? 'text-destructive' : 'dark:text-warning'}
      />
      <AlertTitle className="line-clamp-none">{title}</AlertTitle>
      <AlertDescription className="text-foreground">
        <p>{text}</p>
        {children}
      </AlertDescription>
    </Alert>
  );
}

/** Starts the given divisions that are not running yet. Ended ones are restarted. */
export function StartDialog({
  divisions: selected,
  running,
  onClose,
}: DialogProps & { divisions: Division[]; running: Division[] }) {
  const { t } = useTranslation(['divisions', 'common']);
  const divisions = selected.filter(({ state }) => state !== 'RUNNING');
  const { ended, progress, unassigned, behind } = getStartWarnings(divisions, running);
  const pending = divisions.filter(({ state }) => state === 'PENDING');
  const onlyRestarts = ended.length > 0 && pending.length === 0;
  const ground = (division: Division) => t('common:ground', { number: division.ground });

  return (
    <DivisionConfirm
      title={
        onlyRestarts && ended.length === 1
          ? t('start.restartTitle')
          : t('start.title', { count: divisions.length })
      }
      text={t('start.text')}
      confirmLabel={onlyRestarts ? t('start.restart') : t('common:actions.start')}
      destructive={ended.length > 0}
      fields={{ intent: 'start', ...(ended.length > 0 && { restart: 'true' }) }}
      divisions={divisions}
      onClose={onClose}
    >
      {pending.length > 0 && <DivisionNames divisions={pending} detail={ground} />}
      {ended.length > 0 && (
        <Warning severe title={t('start.ended')} text={t('start.endedText')}>
          <DivisionNames divisions={ended} detail={ground} />
        </Warning>
      )}
      {progress.length > 0 && (
        <Warning severe title={t('start.progress')} text={t('start.progressText')}>
          <DivisionNames divisions={progress} />
        </Warning>
      )}
      {behind.length > 0 && (
        <Warning title={t('start.behind')} text={t('start.behindText')}>
          <DivisionNames divisions={behind} detail={ground} />
        </Warning>
      )}
      {unassigned.length > 0 && (
        <Warning title={t('start.unassigned')} text={t('start.unassignedText')}>
          <DivisionNames
            divisions={unassigned}
            detail={({ unassignedCount }) => t('unassigned', { count: unassignedCount })}
          />
        </Warning>
      )}
    </DivisionConfirm>
  );
}

export function StopDialog({
  divisions: selected,
  onClose,
}: DialogProps & { divisions: Division[] }) {
  const { t } = useTranslation(['divisions', 'common']);
  const divisions = selected.filter(({ state }) => state === 'RUNNING');
  return (
    <DivisionConfirm
      title={t('stop.title', { count: divisions.length })}
      text={t('stop.text')}
      confirmLabel={t('common:actions.stop')}
      destructive
      fields={{ intent: 'stop' }}
      divisions={divisions}
      onClose={onClose}
    >
      <DivisionNames
        divisions={divisions}
        detail={({ round, rounds }) => t('roundOf', { round: round + 1, rounds })}
      />
    </DivisionConfirm>
  );
}

export function DeleteDialog({ division, onClose }: DialogProps & { division: Division }) {
  const { t } = useTranslation(['divisions', 'common']);
  return (
    <DivisionConfirm
      title={t('remove.title')}
      text={t('remove.text', { count: division.starterCount })}
      confirmLabel={t('common:actions.delete')}
      destructive
      fields={{ intent: 'delete' }}
      divisions={division.state === 'RUNNING' ? [] : [division]}
      onClose={onClose}
    >
      <DivisionNames divisions={[division]} />
    </DivisionConfirm>
  );
}

export function GroundDialog({
  division,
  grounds,
  onClose,
}: DialogProps & { division: Division; grounds: number }) {
  const { t } = useTranslation(['divisions', 'common']);
  const fetcher = useFetcher();
  const name = useDivisionName();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <fetcher.Form method="post" onSubmit={onClose} className="grid gap-4">
          <input type="hidden" name="intent" value="ground" />
          <input type="hidden" name="division" value={division.id} />
          <DialogHeader>
            <DialogTitle>{t('ground.title')}</DialogTitle>
            <DialogDescription>{name(division)}</DialogDescription>
          </DialogHeader>
          <GroundField grounds={grounds} defaultValue={division.ground} />
          {division.state === 'RUNNING' && (
            <Alert role="note">
              <InfoIcon aria-hidden />
              <AlertDescription>{t('ground.running')}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="submit">{t('common:actions.save')}</Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

const SEXES: Sex[] = ['FEMALE', 'MALE'];

export function CreateDialog({
  categories,
  grounds,
  onClose,
}: DialogProps & { categories: Record<Sex, readonly string[]>; grounds: number }) {
  const { t } = useTranslation(['divisions', 'common']);
  const fetcher = useFetcher();
  const [sex, setSex] = useState<Sex>('FEMALE');
  const [chosen, setCategory] = useState(categories.FEMALE[0]);
  // KD and KH exist for one sex only.
  const category = categories[sex].includes(chosen) ? chosen : categories[sex][0];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <fetcher.Form method="post" onSubmit={onClose} className="grid gap-4">
          <input type="hidden" name="intent" value="create" />
          <DialogHeader>
            <DialogTitle>{t('create.title')}</DialogTitle>
            <DialogDescription>{t('create.text')}</DialogDescription>
          </DialogHeader>
          <FormField label={t('common:fields.sex')}>
            {(props) => (
              <Select name="sex" value={sex} onValueChange={(value) => setSex(value as Sex)}>
                <SelectTrigger {...props} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEXES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`common:sex.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label={t('common:fields.category')}>
            {(props) => (
              // Remounted for its options to match, Radix would reset the value otherwise.
              <Select key={sex} name="category" value={category} onValueChange={setCategory}>
                <SelectTrigger {...props} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories[sex].map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <GroundField grounds={grounds} defaultValue={1} />
          <DialogFooter>
            <Button type="submit">{t('common:actions.create')}</Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

function GroundField({ grounds, defaultValue }: { grounds: number; defaultValue: number }) {
  const { t } = useTranslation();
  return (
    <FormField label={t('fields.ground')}>
      {(props) => (
        <Select name="ground" defaultValue={String(defaultValue)}>
          <SelectTrigger {...props} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: grounds }, (_, index) => (
              <SelectItem key={index} value={String(index + 1)}>
                {t('ground', { number: index + 1 })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}
