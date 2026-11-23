import { FileTextIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import { FieldLegend, FieldSet } from '~/components/ui/field';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import type { Sex } from '~/generated/prisma/enums';

type Group = { sex: Sex; category: string };
type Template = {
  id: string;
  name: string;
  isDefault: boolean;
  assignments: Group[];
  isCoverBroken: boolean;
};

/** Each category with its own template. */
const AUTO = 'auto';

const toKey = ({ sex, category }: Group) => `${sex}:${category}`;

/** Opens the PDF of the shown category, or of several, with a chosen template. */
export function RankingExport({
  competitionId,
  contestId,
  groups,
  current,
  provisional,
  templates,
}: {
  competitionId: string;
  contestId: string;
  groups: Group[];
  current: Group;
  provisional: boolean;
  templates: Template[];
}) {
  const { t } = useTranslation(['ranking', 'pdf', 'common']);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  // Until the user picks one, it follows the selected categories.
  const [pickedTemplate, setPickedTemplate] = useState<string | null>(null);

  const hasAssignments = templates.some(({ assignments }) => assignments.length > 0);
  const findTemplate = (key: string) =>
    templates.find(({ assignments }) => assignments.some((item) => toKey(item) === key)) ??
    templates.find(({ isDefault }) => isDefault);
  const suggested =
    selected.length > 1 && hasAssignments
      ? AUTO
      : findTemplate(selected.length === 1 ? selected[0] : '')?.id;
  const template = pickedTemplate ?? suggested;
  const used =
    template === AUTO ? selected.map(findTemplate) : [templates.find(({ id }) => id === template)];

  function onOpenChange(next: boolean) {
    const key = toKey(current);
    if (next) {
      setSelected(groups.some((group) => toKey(group) === key) ? [key] : []);
      setPickedTemplate(null);
    }
    setOpen(next);
  }

  function select(key: string, checked: boolean) {
    setSelected((keys) => (checked ? [...keys, key] : keys.filter((item) => item !== key)));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button disabled={groups.length === 0}>
          <FileTextIcon aria-hidden />
          {t('export.button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form
          method="get"
          action={`/api/competitions/${competitionId}/pdf/ranking`}
          target="_blank"
          className="grid gap-5"
          // Later, because browsers don't submit forms that are gone.
          onSubmit={() => setTimeout(() => setOpen(false))}
        >
          <DialogHeader>
            <DialogTitle>{t('export.title')}</DialogTitle>
            <DialogDescription>{t('export.text')}</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="contest" value={contestId} />
          {provisional && <input type="hidden" name="provisional" value="1" />}
          {template && <input type="hidden" name="template" value={template} />}
          {/* In the order of the list, not of the clicks. */}
          {groups
            .map(toKey)
            .filter((key) => selected.includes(key))
            .map((key) => (
              <input key={key} type="hidden" name="group" value={key} />
            ))}
          {(['FEMALE', 'MALE'] as const).map((sex) => {
            const keys = groups.filter((group) => group.sex === sex);
            if (keys.length === 0) return null;
            return (
              <FieldSet key={sex} className="gap-2">
                <FieldLegend variant="label">{t(`common:sex.${sex}`)}</FieldLegend>
                <div className="grid grid-cols-3 gap-x-4 sm:grid-cols-4">
                  {keys.map((group) => {
                    const key = toKey(group);
                    return (
                      <Label key={key} className="min-h-11">
                        <Checkbox
                          checked={selected.includes(key)}
                          onCheckedChange={(checked) => select(key, checked === true)}
                        />
                        {group.category}
                      </Label>
                    );
                  })}
                </div>
              </FieldSet>
            );
          })}
          {templates.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="ranking-template">{t('export.template')}</Label>
              <Select value={template} onValueChange={setPickedTemplate}>
                <SelectTrigger id="ranking-template" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {hasAssignments && <SelectItem value={AUTO}>{t('export.auto')}</SelectItem>}
                  {templates.map(({ id, name }) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {used.some((item) => item?.isCoverBroken) && (
                <p role="alert" className="text-sm text-destructive">
                  {t('pdf:cover.broken')}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="items-center">
            {selected.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('export.noneSelected')}</p>
            )}
            <Button type="submit" disabled={selected.length === 0}>
              {t('export.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
