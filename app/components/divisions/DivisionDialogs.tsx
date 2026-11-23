import { InfoIcon, TriangleAlertIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '~/components/FormField';
import { RadioChips } from '~/components/RadioChips';
import { SubmitButton } from '~/components/SubmitButton';
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
import type { useActionFetcher } from '~/hooks/useActionFetcher';
import { getStartWarnings, type Division } from './divisionList';
import { useDivisionName } from './useDivisionName';

/** The dialogs stay open until the action worked, see useActionFetcher. */
type DialogProps = {
  Form: ReturnType<typeof useActionFetcher>['Form'];
  pending: boolean;
  onSubmit: () => void;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
};

/** Confirms an action on divisions. */
function DivisionConfirm({
  title,
  text,
  confirmLabel,
  destructive,
  fields,
  divisions,
  Form,
  pending,
  onSubmit,
  onClose,
  onCloseAutoFocus,
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
  const isEmpty = divisions.length === 0;

  return (
    <AlertDialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{isEmpty ? t('nothingLeft') : text}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <Form method="post" onSubmit={onSubmit}>
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {divisions.map(({ id }) => (
            <input key={id} type="hidden" name="division" value={id} />
          ))}
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>
              {t('common:actions.cancel')}
            </AlertDialogCancel>
            <SubmitButton
              pending={pending}
              variant={destructive ? 'destructive' : 'default'}
              disabled={isEmpty}
            >
              {confirmLabel}
            </SubmitButton>
          </AlertDialogFooter>
        </Form>
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
    <Alert role="group" variant={severe ? 'destructive' : 'warning'}>
      <TriangleAlertIcon aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
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
  ...dialog
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
      {...dialog}
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
  ...dialog
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
      {...dialog}
    >
      <DivisionNames
        divisions={divisions}
        detail={({ round, rounds }) => t('roundOf', { round: round + 1, rounds })}
      />
    </DivisionConfirm>
  );
}

/** Deletes the given divisions that are not running. */
export function DeleteDialog({
  divisions: selected,
  ...dialog
}: DialogProps & { divisions: Division[] }) {
  const { t } = useTranslation(['divisions', 'common']);
  const divisions = selected.filter(({ state }) => state !== 'RUNNING');
  const pending = divisions.filter(({ state }) => state === 'PENDING');
  const ended = divisions.filter(({ state }) => state === 'ENDED');
  const starterCount = divisions.reduce((sum, division) => sum + division.starterCount, 0);
  const starters = (division: Division) =>
    t('common:starterCount', { count: division.starterCount });

  return (
    <DivisionConfirm
      title={t('remove.title', { count: divisions.length })}
      text={t('remove.text', { count: starterCount })}
      confirmLabel={t('common:actions.delete')}
      destructive
      fields={{ intent: 'delete' }}
      divisions={divisions}
      {...dialog}
    >
      {pending.length > 0 && <DivisionNames divisions={pending} detail={starters} />}
      {ended.length > 0 && (
        <Warning severe title={t('start.ended')} text={t('remove.endedText')}>
          <DivisionNames divisions={ended} detail={starters} />
        </Warning>
      )}
    </DivisionConfirm>
  );
}

/** A form in a dialog that stays open, with its values, until it was saved. */
function FormDialog({
  intent,
  title,
  text,
  submitLabel,
  Form,
  pending,
  onSubmit,
  onClose,
  onCloseAutoFocus,
  children,
}: DialogProps & {
  intent: string;
  title: string;
  text: string;
  submitLabel: string;
  children: ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <Form method="post" onSubmit={onSubmit} className="grid gap-4">
          <input type="hidden" name="intent" value={intent} />
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{text}</DialogDescription>
          </DialogHeader>
          {children}
          <DialogFooter>
            <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function GroundDialog({
  division,
  grounds,
  ...dialog
}: DialogProps & { division: Division; grounds: number }) {
  const { t } = useTranslation(['divisions', 'common']);
  const name = useDivisionName();

  return (
    <FormDialog
      intent="ground"
      title={t('ground.title')}
      text={name(division)}
      submitLabel={t('common:actions.save')}
      {...dialog}
    >
      <input type="hidden" name="division" value={division.id} />
      <GroundField grounds={grounds} defaultValue={division.ground} />
      {division.state === 'RUNNING' && (
        <Alert role="note">
          <InfoIcon aria-hidden />
          <AlertDescription>{t('ground.running')}</AlertDescription>
        </Alert>
      )}
    </FormDialog>
  );
}

const SEXES: Sex[] = ['FEMALE', 'MALE'];

export function CreateDialog({
  categories,
  grounds,
  ...dialog
}: DialogProps & { categories: Record<Sex, readonly string[]>; grounds: number }) {
  const { t } = useTranslation(['divisions', 'common']);
  const [sex, setSex] = useState<Sex>('FEMALE');
  const [chosen, setCategory] = useState(categories.FEMALE[0]);
  // KD and KH exist for one sex only.
  const category = categories[sex].includes(chosen) ? chosen : categories[sex][0];

  return (
    <FormDialog
      intent="create"
      title={t('create.title')}
      text={t('create.text')}
      submitLabel={t('common:actions.create')}
      {...dialog}
    >
      <RadioChips
        legend={t('common:fields.sex')}
        name="sex"
        value={sex}
        options={SEXES.map((value) => ({ value, label: t(`common:sex.${value}`) }))}
        onChange={setSex}
      />
      <RadioChips
        legend={t('common:fields.category')}
        name="category"
        value={category}
        options={categories[sex].map((value) => ({ value, label: value }))}
        onChange={setCategory}
      />
      <GroundField grounds={grounds} defaultValue={1} />
    </FormDialog>
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
