import { EllipsisVerticalIcon, FileTextIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useBlocker } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/templates';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { EmptyState } from '~/components/EmptyState';
import { FormField } from '~/components/FormField';
import { PageHeader } from '~/components/PageHeader';
import { CoverSection } from '~/components/ranking/CoverSection';
import { TemplateFields } from '~/components/ranking/TemplateFields';
import { TemplatePreview, type PreviewGroup } from '~/components/ranking/TemplatePreview';
import { SubmitButton } from '~/components/SubmitButton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { competitionContext } from '~/context';
import { useActionErrors, useActionFetcher } from '~/hooks/useActionFetcher';
import { useCompetition } from '~/hooks/useCompetition';
import { findBrokenCovers, removeCover, setCover } from '~/lib/covers.server';
import {
  defaultRankingTemplate,
  rankingTemplateSchema,
  type RankingTemplateOptions,
} from '~/lib/domain/rankingTemplate';
import { domainErrorMessage } from '~/lib/domainErrors.server';
import { parseForm, readForm } from '~/lib/forms.server';
import { listRankingGroups } from '~/lib/ranking.server';
import {
  createRankingTemplate,
  deleteRankingTemplate,
  duplicateRankingTemplate,
  listRankingTemplates,
  setDefaultRankingTemplate,
  updateRankingTemplate,
} from '~/lib/rankingTemplates.server';
import { safeClientAction } from '~/lib/safeClientAction';
import { cn } from '~/lib/utils';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { enqueueToast } from '~/middlewares/toast.server';

const NEW = 'new';
const NAME_LENGTH = 100;

export async function loader({ request, context }: Route.LoaderArgs) {
  const { id, contests } = context.get(competitionContext);
  const selected = new URL(request.url).searchParams.get('template');
  const templates = await listRankingTemplates(id);
  // In the address, so the editor keeps its template when the default changes.
  const fallback = templates.find(({ isDefault }) => isDefault);
  if (fallback && selected !== NEW && !templates.some((template) => template.id === selected)) {
    throw redirect(`/competitions/${id}/templates?template=${fallback.id}`);
  }
  const brokenCovers = await findBrokenCovers(id);
  const groups = await Promise.all(
    contests.map(async (contest) =>
      (await listRankingGroups(id, contest.id))
        .filter(({ hasEnded }) => hasEnded)
        .map(({ sex, category }): PreviewGroup => ({
          contestId: contest.id,
          contestName: contest.name,
          sex,
          category,
        })),
    ),
  );
  return {
    templates: templates.map(({ id: templateId, name, isDefault, options, coverPages }) => ({
      id: templateId,
      coverPages,
      isCoverBroken: brokenCovers.has(templateId),
      name,
      isDefault,
      options,
    })),
    // Without templates the address may still name a deleted one.
    selected: templates.length > 0 || selected === NEW ? selected : null,
    previewGroups: groups.flat(),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { id } = requireRole(context, 'EDITOR');
  const t = getT(context);
  const formData = await readForm(request, { allowFiles: true });
  const page = `/competitions/${id}/templates`;
  const templateId = z.string().min(1).safeParse(formData.get('id')).data;

  try {
    switch (formData.get('intent')) {
      case 'save': {
        const { data: values, errors } = parseForm(
          formData,
          z.object({
            name: z
              .string()
              .trim()
              .min(1, t('errors.required'))
              .max(NAME_LENGTH, t('errors.invalid')),
            options: z
              .string()
              .transform((text, refinement) => {
                try {
                  return JSON.parse(text) as unknown;
                } catch {
                  refinement.addIssue({ code: 'custom' });
                  return z.NEVER;
                }
              })
              .pipe(rankingTemplateSchema),
          }),
        );
        if (errors) return data({ errors }, 400);
        if (templateId) {
          await updateRankingTemplate(id, templateId, values);
          enqueueToast(context, { type: 'success', message: t('pdf:templates.saved') });
          return redirect(`${page}?template=${templateId}`);
        }
        const created = await createRankingTemplate(id, values);
        enqueueToast(context, { type: 'success', message: t('pdf:templates.created') });
        return redirect(`${page}?template=${created.id}`);
      }

      case 'duplicate': {
        const templates = await listRankingTemplates(id);
        const source = templates.find((template) => template.id === templateId);
        if (!source) throw data(null, 404);
        const name = t('pdf:templates.copyName', { name: source.name }).slice(0, NAME_LENGTH);
        await duplicateRankingTemplate(id, source.id, name);
        enqueueToast(context, { type: 'success', message: t('pdf:templates.created') });
        return { errors: undefined };
      }

      case 'setDefault': {
        if (!templateId) throw data(null, 400);
        await setDefaultRankingTemplate(id, templateId);
        enqueueToast(context, { type: 'success', message: t('pdf:templates.defaultSet') });
        return { errors: undefined };
      }

      case 'cover': {
        if (!templateId) throw data(null, 400);
        const files = formData.getAll('page').filter((page) => page instanceof File);
        try {
          const pages = await Promise.all(files.map((file) => file.arrayBuffer()));
          await setCover(
            id,
            templateId,
            pages.map((page) => new Uint8Array(page)),
          );
        } catch (error) {
          const message = domainErrorMessage(error, t);
          return data({ errors: { cover: message } as Record<string, string> }, 400);
        }
        enqueueToast(context, { type: 'success', message: t('pdf:cover.saved') });
        return { errors: undefined };
      }

      case 'removeCover': {
        if (!templateId) throw data(null, 400);
        await removeCover(id, templateId);
        enqueueToast(context, { type: 'success', message: t('pdf:cover.removed') });
        return { errors: undefined };
      }

      case 'delete': {
        if (!templateId) throw data(null, 400);
        await deleteRankingTemplate(id, templateId);
        enqueueToast(context, { type: 'success', message: t('pdf:templates.deleted') });
        const shown = new URL(request.url).searchParams.get('template');
        return redirect(shown && shown !== templateId ? `${page}?template=${shown}` : page);
      }

      default:
        throw data(null, 400);
    }
  } catch (error) {
    return data({ errors: { name: domainErrorMessage(error, t) } as Record<string, string> }, 400);
  }
}

export const clientAction = safeClientAction;

type Template = Route.ComponentProps['loaderData']['templates'][number];

export default function Templates({ loaderData, actionData }: Route.ComponentProps) {
  const { templates, selected, previewGroups } = loaderData;
  const { t } = useTranslation('pdf');
  const { canEdit } = useCompetition();
  const errors = useActionErrors(actionData);
  const [discards, setDiscards] = useState(0);
  const template = templates.find(({ id }) => id === selected);
  const createButton = canEdit && (
    <Button asChild>
      <Link to={`?template=${NEW}`}>
        <PlusIcon aria-hidden />
        {t('templates.create')}
      </Link>
    </Button>
  );

  return (
    <>
      <title>{`${t('templatesTitle')} · UTEG`}</title>
      <PageHeader
        title={t('templatesTitle')}
        description={t('templatesDescription')}
        actions={templates.length > 0 && selected !== NEW && createButton}
      />
      {!canEdit && <p className="mb-4 text-muted-foreground">{t('templates.readOnly')}</p>}

      {templates.length > 0 && (
        <ul className="mb-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((item) => (
            <li key={item.id}>
              <TemplateItem template={item} selected={item.id === selected} />
            </li>
          ))}
        </ul>
      )}
      {templates.length === 0 && selected !== NEW && (
        <EmptyState
          icon={FileTextIcon}
          title={t('templates.emptyTitle')}
          text={t('templates.emptyText')}
          action={createButton}
        />
      )}
      {canEdit && selected && (
        <TemplateEditor
          // A new template or another one starts over, and after discarding changes.
          key={`${selected} ${discards}`}
          onDiscard={() => setDiscards((count) => count + 1)}
          template={template}
          previewGroups={previewGroups}
          errors={errors}
        />
      )}
    </>
  );
}

function TemplateItem({ template, selected }: { template: Template; selected: boolean }) {
  const { t } = useTranslation(['pdf', 'common']);
  const { canEdit } = useCompetition();
  const { submit: post, pending } = useActionFetcher();
  const { id, name, isDefault } = template;

  function submit(intent: string) {
    void post({ intent, id }, { method: 'post' });
  }

  return (
    <div
      className={cn(
        'flex min-h-14 items-center gap-2 rounded-lg border bg-card pl-4',
        selected && 'border-primary ring-1 ring-primary',
      )}
    >
      <div className="min-w-0 flex-1 py-2">
        {canEdit ? (
          <Link
            to={`?template=${id}`}
            preventScrollReset
            aria-current={selected ? 'true' : undefined}
            className="block truncate font-medium hover:underline"
          >
            {name}
          </Link>
        ) : (
          <span className="block truncate font-medium">{name}</span>
        )}
      </div>
      {isDefault && <Badge variant="secondary">{t('templates.default')}</Badge>}
      {canEdit ? (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('templates.actionsFor', { name })}
                disabled={pending}
              >
                <EllipsisVerticalIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isDefault && (
                <DropdownMenuItem onSelect={() => submit('setDefault')}>
                  {t('templates.setDefault')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => submit('duplicate')}>
                {t('templates.duplicate')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ConfirmDialog
            destructive
            title={t('templates.deleteTitle', { name })}
            description={t('templates.deleteText')}
            confirmLabel={t('common:actions.delete')}
            fields={{ intent: 'delete', id }}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="mr-2"
                aria-label={`${t('common:actions.delete')}: ${name}`}
              >
                <TrashIcon aria-hidden />
              </Button>
            }
          />
        </>
      ) : (
        <span className="pr-4" />
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  previewGroups,
  errors,
  onDiscard,
}: {
  template: Template | undefined;
  previewGroups: PreviewGroup[];
  errors: Record<string, string | undefined>;
  onDiscard: () => void;
}) {
  const { t } = useTranslation(['pdf', 'common']);
  const { competition } = useCompetition();
  const saved = {
    name: template?.name ?? '',
    options: template?.options ?? defaultRankingTemplate,
  };
  const [name, setName] = useState(saved.name);
  const [options, setOptions] = useState<RankingTemplateOptions>(saved.options);
  const isValid = rankingTemplateSchema.safeParse(options).success;
  // Saving trims the name.
  const isDirty =
    name.trim() !== saved.name || JSON.stringify(options) !== JSON.stringify(saved.options);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="grid content-start gap-4">
        <CoverSection template={template} options={options} onChange={setOptions} />
        <Form method="post" className="grid content-start gap-4">
          {template && <input type="hidden" name="id" value={template.id} />}
          <input type="hidden" name="options" value={JSON.stringify(options)} />
          <FormField
            label={t('form.name')}
            name="name"
            required
            maxLength={NAME_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={errors.name}
          />
          <TemplateFields options={options} onChange={setOptions} />
          <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t bg-background px-1 py-3">
            <SubmitButton name="intent" value="save" disabled={!isValid}>
              {template ? t('common:actions.save') : t('common:actions.create')}
            </SubmitButton>
            {!isValid && (
              <p role="alert" className="text-sm text-destructive">
                {t('common:errors.invalid')}
              </p>
            )}
          </div>
        </Form>
      </div>
      <div className="xl:sticky xl:top-20 xl:self-start">
        <TemplatePreview
          competitionId={competition.id}
          template={template}
          options={options}
          groups={previewGroups}
        />
      </div>
      <DiscardDialog
        when={isDirty}
        // The target may show the same template, e.g. the link in the sidebar.
        onDiscard={onDiscard}
      />
    </div>
  );
}

/** Asks before leaving a form with changes. */
function DiscardDialog({ when, onDiscard }: { when: boolean; onDiscard: () => void }) {
  const { t } = useTranslation(['pdf', 'common']);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );

  return (
    <AlertDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => !open && blocker.reset?.()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('templates.discardTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('templates.discardText')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              blocker.proceed?.();
              onDiscard();
            }}
          >
            {t('templates.discard')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
