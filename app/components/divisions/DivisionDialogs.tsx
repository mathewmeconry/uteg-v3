import { ChevronRightIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { categoryName } from '~/lib/categoryName';
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
import { Checkbox } from '~/components/ui/checkbox';
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
import { useSexes } from '~/hooks/useSexes';
import { getStartWarnings, type Division } from './divisionList';
import { useDivisionName } from './useDivisionName';

/** The dialogs stay open until the action worked, see useActionFetcher. */
type DialogProps = {
  Form: ReturnType<typeof useActionFetcher>['Form'];
  pending: boolean;
  /** Where the divisions are, on other pages. */
  action?: string;
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
  action,
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
        <Form method="post" action={action} onSubmit={onSubmit}>
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

/** Other planned divisions that are started together with the chosen one. */
function OtherDivisions({
  divisions,
  chosen,
  onChange,
}: {
  divisions: Division[];
  chosen: ReadonlySet<string>;
  onChange: (chosen: ReadonlySet<string>) => void;
}) {
  const { t } = useTranslation(['divisions', 'common']);
  const name = useDivisionName();
  const count = divisions.filter(({ id }) => chosen.has(id)).length;

  return (
    <details className="group overflow-hidden rounded-lg border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 bg-muted px-3 text-sm [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon aria-hidden className="size-4 shrink-0 group-open:rotate-90" />
        <span className="flex-1 font-semibold">{t('start.others')}</span>
        <span className="text-muted-foreground">
          {count > 0
            ? t('start.othersChosen', { count })
            : t('start.othersPlanned', { count: divisions.length })}
        </span>
      </summary>
      <ul className="max-h-64 divide-y overflow-y-auto border-t">
        {divisions.map((division) => (
          <li key={division.id}>
            <label
              htmlFor={`start-${division.id}`}
              className="flex min-h-12 items-center gap-3 px-3 py-1.5 text-sm"
            >
              <Checkbox
                id={`start-${division.id}`}
                checked={chosen.has(division.id)}
                onCheckedChange={(checked) => {
                  const next = new Set(chosen);
                  if (checked === true) next.add(division.id);
                  else next.delete(division.id);
                  onChange(next);
                }}
              />
              <span className="grid">
                <span className="font-semibold">{name(division)}</span>
                <span className="text-muted-foreground">
                  {t('common:starterCount', { count: division.starterCount })}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Starts the given divisions that are not running yet. Ended ones are restarted. `planned` are those
 * that can be started together with a single one, in running order.
 */
export function StartDialog({
  divisions: selected,
  planned = [],
  running,
  ...dialog
}: DialogProps & { divisions: Division[]; planned?: Division[]; running: Division[] }) {
  const { t } = useTranslation(['divisions', 'common']);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  // Live updates come before the answer.
  const [sent, setSent] = useState<Division[]>([]);
  const isSent = dialog.pending && sent.length > 0;
  const [first] = selected;
  const others =
    selected.length === 1 && first.state === 'PENDING'
      ? planned.filter(({ id, ground }) => id !== first.id && ground === first.ground)
      : [];
  const current = [...selected, ...others.filter(({ id }) => chosen.has(id))].filter(
    ({ state }) => state !== 'RUNNING',
  );
  const divisions = isSent ? sent : current;
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
      confirmLabel={
        onlyRestarts ? t('start.restart') : t('start.submit', { count: divisions.length || 1 })
      }
      destructive={ended.length > 0}
      fields={{ intent: 'start', ...(ended.length > 0 && { restart: 'true' }) }}
      divisions={divisions}
      {...dialog}
      onSubmit={() => {
        setSent(divisions);
        dialog.onSubmit();
      }}
    >
      {pending.length > 0 && <DivisionNames divisions={pending} detail={ground} />}
      {others.length > 0 && !isSent && (
        <OtherDivisions divisions={others} chosen={chosen} onChange={setChosen} />
      )}
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

export function CreateDialog({
  categories,
  grounds,
  ...dialog
}: DialogProps & { categories: Record<Sex, readonly string[]>; grounds: number }) {
  const { t } = useTranslation(['divisions', 'common']);
  const sexes = useSexes();
  const [sex, setSex] = useState<Sex>(sexes[0]);
  const [chosen, setCategory] = useState(categories[sexes[0]][0]);
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
      {sexes.length > 1 ? (
        <RadioChips
          legend={t('common:fields.sex')}
          name="sex"
          value={sex}
          options={sexes.map((value) => ({ value, label: t(`common:sex.${value}`) }))}
          onChange={setSex}
        />
      ) : (
        <input type="hidden" name="sex" value={sex} />
      )}
      <RadioChips
        legend={t('common:fields.category')}
        name="category"
        value={category}
        options={categories[sex].map((value) => ({ value, label: categoryName(value, t) }))}
        onChange={setCategory}
      />
      <GroundField grounds={grounds} defaultValue={1} />
    </FormDialog>
  );
}

export function GroundField({
  grounds,
  defaultValue,
  onChange,
}: {
  grounds: number;
  defaultValue: number;
  onChange?: (ground: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <FormField label={t('fields.ground')}>
      {(props) => (
        <Select
          name="ground"
          defaultValue={String(defaultValue)}
          onValueChange={(value) => onChange?.(Number(value))}
        >
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
