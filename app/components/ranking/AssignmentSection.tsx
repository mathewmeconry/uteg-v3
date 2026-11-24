import { useTranslation } from 'react-i18next';
import { categoryName } from '~/lib/categoryName';
import { Checkbox } from '~/components/ui/checkbox';
import { Label } from '~/components/ui/label';
import type { Sex } from '~/generated/prisma/enums';
import { useActionFetcher } from '~/hooks/useActionFetcher';
import { useSexes } from '~/hooks/useSexes';
import { Section } from './TemplateFields';

type Assignment = { sex: Sex; category: string };
type Template = { id: string; name: string; assignments: Assignment[] };

/** The categories whose rankings use the template. Changes are saved at once. */
export function AssignmentSection({
  templateId,
  templates,
  categories,
}: {
  templateId: string;
  templates: Template[];
  categories: Record<Sex, string[]>;
}) {
  const { t } = useTranslation('pdf');
  const sexes = useSexes();
  return (
    <Section title={t('assignments.title')}>
      <p className="text-sm text-muted-foreground">{t('assignments.hint')}</p>
      <div className="grid grid-cols-1 gap-4">
        {sexes.map((sex) => (
          <div key={sex} role="group" aria-label={t(`sex.${sex}`)} className="min-w-0">
            <p aria-hidden className="mb-2 text-sm font-semibold">
              {t(`sex.${sex}`)}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {categories[sex].map((category) => (
                <AssignmentField
                  key={category}
                  templateId={templateId}
                  assignment={{ sex, category }}
                  owner={templates.find(({ assignments }) =>
                    assignments.some((item) => item.sex === sex && item.category === category),
                  )}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function AssignmentField({
  templateId,
  assignment: { sex, category },
  owner,
}: {
  templateId: string;
  assignment: Assignment;
  /** The template that has the category. */
  owner: Template | undefined;
}) {
  const { t } = useTranslation('pdf');
  // Each has its own, so that quick clicks don't cancel each other.
  const { submit, pending, formData } = useActionFetcher();
  const checked = formData ? formData.get('intent') === 'assign' : owner?.id === templateId;

  return (
    <Label className="min-h-11 min-w-0 cursor-pointer rounded-md border border-input bg-card px-3 py-1 leading-tight hover:bg-accent has-data-[state=checked]:border-primary has-data-[state=checked]:bg-accent">
      <Checkbox
        checked={checked}
        // Not disabled, that would drop the focus.
        aria-disabled={pending}
        className="aria-disabled:opacity-50"
        onCheckedChange={(next) => {
          if (pending) return;
          void submit(
            {
              intent: next === true ? 'assign' : 'unassign',
              id: templateId,
              group: `${sex}:${category}`,
            },
            { method: 'post' },
          );
        }}
      />
      <span className="min-w-0">
        {categoryName(category, t)}
        {owner && owner.id !== templateId && (
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {t('assignments.of', { name: owner.name })}
          </span>
        )}
      </span>
    </Label>
  );
}

/** "K1, K2 Turner": without the sex if both are assigned. */
export function AssignmentSummary({ assignments }: { assignments: Assignment[] }) {
  const { t } = useTranslation('pdf');
  if (assignments.length === 0) return null;
  const byCategory = Map.groupBy(assignments, ({ category }) => category);
  const texts = [...byCategory].map(([category, sexes]) => {
    const name = categoryName(category, t);
    return sexes.length > 1 ? name : `${name} ${t(`sex.${sexes[0].sex}`)}`;
  });
  return <p className="text-sm text-muted-foreground">{texts.join(', ')}</p>;
}
