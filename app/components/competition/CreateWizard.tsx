import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Form } from 'react-router';
import { z } from 'zod';
import { FormField } from '~/components/FormField';
import { SubmitButton } from '~/components/SubmitButton';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { FieldError, FieldLabel } from '~/components/ui/field';
import type { MemberInput } from '~/lib/competitions.server';
import { formatDateRange } from '~/lib/format';
import { cn } from '~/lib/utils';
import { egtModule } from '~/modules/egt/module';
import { CompetitionFields, GroundsField } from './CompetitionFields';
import { HonourPercentFields } from './HonourPercentFields';
import { LogoField } from './LogoField';
import { RoleSelect } from './RoleSelect';

const STEPS = ['general', 'setup', 'modules', 'members', 'review'] as const;
type Step = (typeof STEPS)[number];

const FIELD_STEPS: Record<string, Step> = {
  grounds: 'setup',
  modules: 'setup',
  config: 'modules',
  members: 'members',
};

const MODULES = ['egt'] as const;

const DOUBLE_CLICK_MS = 500;

type Errors = Record<string, string | undefined>;
const NO_ERRORS: Errors = {};

/** The step of the first error the server reported. */
export function getErrorStep(errors: Errors): Step | undefined {
  const steps = Object.keys(errors).map((field) => FIELD_STEPS[field] ?? 'general');
  return STEPS.find((step) => steps.includes(step));
}

/**
 * All steps are one form. The inactive ones stay mounted but hidden, so nothing is lost when
 * going back and everything is posted at the end.
 */
export function CreateWizard({
  ownEmail,
  errors = NO_ERRORS,
}: {
  ownEmail: string;
  errors?: Errors;
}) {
  const { t, i18n } = useTranslation(['competition', 'common', 'settings']);
  const [step, setStep] = useState<Step>('general');
  const [modules, setModules] = useState<string[]>([...MODULES]);
  const [modulesError, setModulesError] = useState(false);
  const [honourPercent, setHonourPercent] = useState(egtModule.defaultConfig.honourPercent);
  const [members, setMembers] = useState<MemberInput[]>([]);
  const [draft, setDraft] = useState<MemberInput>({ email: '', role: 'EDITOR' });
  const [draftError, setDraftError] = useState<'Invalid' | 'Duplicate' | 'Self'>();
  const [review, setReview] = useState<FormData>();
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const isFirstRender = useRef(true);
  const openedAt = useRef(0);
  const index = STEPS.indexOf(step);

  const [seenErrors, setSeenErrors] = useState(errors);
  // The list the server's message is about.
  const [refusedMembers, setRefusedMembers] = useState(members);
  if (errors !== seenErrors) {
    setSeenErrors(errors);
    setRefusedMembers(members);
    setStep(getErrorStep(errors) ?? step);
  }

  useEffect(() => {
    if (!isFirstRender.current) heading.current?.focus();
    isFirstRender.current = false;
    openedAt.current = Date.now();
  }, [step]);

  function goTo(next: Step) {
    if (next === 'review') setReview(new FormData(form.current!));
    setStep(next);
  }

  function addMember() {
    const email = draft.email.trim().toLowerCase();
    const isDuplicate = members.some((member) => member.email === email);
    const isInvalid = !z.email().safeParse(email).success;
    const error = isInvalid
      ? 'Invalid'
      : email === ownEmail
        ? 'Self'
        : isDuplicate
          ? 'Duplicate'
          : undefined;
    setDraftError(error);
    if (error) return false;
    setMembers([...members, { ...draft, email }]);
    setDraft({ ...draft, email: '' });
    return true;
  }

  function next() {
    const section = form.current!.querySelector(`[data-step="${step}"]`)!;
    const invalid = [...section.querySelectorAll('input')].find((input) => !input.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    if (step === 'setup') {
      setModulesError(modules.length === 0);
      if (modules.length === 0) return;
    }
    // Someone who typed an address and forgot to add it wants it added.
    if (step === 'members' && draft.email.trim() && !addMember()) return;
    goTo(STEPS[index + 1]);
  }

  function onSubmit(event: FormEvent) {
    // The second half of a double click on "Next" must not create the competition.
    const isDoubleClick = Date.now() - openedAt.current < DOUBLE_CLICK_MS;
    if (step === 'review' && !isDoubleClick) return;
    event.preventDefault();
    if (step !== 'review') next();
  }

  return (
    <Form ref={form} method="post" encType="multipart/form-data" noValidate onSubmit={onSubmit}>
      <StepList current={step} onSelect={goTo} />
      {modules.map((module) => (
        <input key={module} type="hidden" name="modules" value={module} />
      ))}
      <input
        type="hidden"
        name="config.egt"
        value={JSON.stringify({ ...egtModule.defaultConfig, honourPercent })}
      />
      <input type="hidden" name="members" value={JSON.stringify(members)} />

      <div className="rounded-xl border bg-card">
        <div className="p-5 sm:p-7">
          <h2 ref={heading} tabIndex={-1} className="mb-5 font-display text-xl outline-none">
            {t(`wizard.steps.${step}`)}
          </h2>
          <Section step="general" current={step}>
            <CompetitionFields errors={errors} />
            <LogoField error={errors.logo} />
          </Section>

          <Section step="setup" current={step}>
            <GroundsField error={errors.grounds} />
            <fieldset className="grid gap-3">
              <legend className="mb-2 text-sm font-semibold">{t('fields.modules')}</legend>
              {MODULES.map((module) => (
                <FieldLabel
                  key={module}
                  className="w-full cursor-pointer items-start gap-3 rounded-md border p-4"
                >
                  <Checkbox
                    checked={modules.includes(module)}
                    onCheckedChange={(checked) => {
                      setModules(
                        checked ? [...modules, module] : modules.filter((item) => item !== module),
                      );
                      setModulesError(false);
                    }}
                  />
                  <span className="grid gap-1">
                    {t(`modules.${module}`)}
                    <span className="font-normal text-muted-foreground">
                      {t(`modules.${module}Text`)}
                    </span>
                  </span>
                </FieldLabel>
              ))}
              {(modulesError || errors.modules) && (
                <FieldError>{modulesError ? t('errors.modules') : errors.modules}</FieldError>
              )}
            </fieldset>
          </Section>

          <Section step="modules" current={step}>
            <p className="text-muted-foreground">{t('wizard.modulesText')}</p>
            <HonourPercentFields value={honourPercent} onChange={setHonourPercent} />
            {errors.config && <FieldError>{errors.config}</FieldError>}
          </Section>

          <Section step="members" current={step}>
            <p className="text-muted-foreground">{t('wizard.membersText')}</p>
            <div className="grid items-start gap-4 sm:grid-cols-[1fr_11rem]">
              <FormField
                label={t('common:fields.email')}
                error={draftError && t(`wizard.member${draftError}`)}
                type="email"
                autoComplete="off"
                value={draft.email}
                onChange={(event) => {
                  setDraft({ ...draft, email: event.target.value });
                  setDraftError(undefined);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  addMember();
                }}
              />
              <FormField label={t('settings:members.role')}>
                {(props) => (
                  <RoleSelect
                    {...props}
                    value={draft.role}
                    onChange={(role) => setDraft({ ...draft, role })}
                    className="w-full"
                  />
                )}
              </FormField>
            </div>
            <Button
              type="button"
              variant="outline"
              className="justify-self-start"
              onClick={addMember}
            >
              {t('common:actions.add')}
            </Button>
            {errors.members && members === refusedMembers && (
              <FieldError>{errors.members}</FieldError>
            )}
            {members.length > 0 && (
              <ul className="divide-y rounded-md border">
                {members.map(({ email, role }) => (
                  <li key={email} className="flex items-center gap-3 py-1 pr-1 pl-3">
                    <span className="min-w-0 flex-1 truncate">{email}</span>
                    <span className="text-sm text-muted-foreground">
                      {t(`common:role.${role}`)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('wizard.removeMember', { email })}
                      onClick={() => setMembers(members.filter((item) => item.email !== email))}
                    >
                      <Trash2Icon aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {step === 'review' && review && (
            <div className="grid gap-4">
              <p className="text-muted-foreground">{t('wizard.reviewText')}</p>
              <dl className="divide-y">
                <ReviewRow step="general" onEdit={goTo}>
                  <p className="font-medium wrap-anywhere">{String(review.get('name'))}</p>
                  <p className="wrap-anywhere">{String(review.get('location'))}</p>
                  <p>
                    {formatDateRange(
                      new Date(String(review.get('startDate'))),
                      new Date(String(review.get('endDate'))),
                      i18n.language,
                    )}
                  </p>
                  <p className="wrap-anywhere text-muted-foreground">
                    {getFileName(review.get('logo')) || t('wizard.noLogo')}
                  </p>
                </ReviewRow>
                <ReviewRow step="setup" onEdit={goTo}>
                  <p>{`${t('fields.grounds')}: ${Number(review.get('grounds'))}`}</p>
                  {MODULES.filter((module) => modules.includes(module)).map((module) => (
                    <p key={module}>{t(`modules.${module}`)}</p>
                  ))}
                </ReviewRow>
                <ReviewRow step="modules" onEdit={goTo}>
                  <HonourSummary percents={Object.values(honourPercent).flatMap(Object.values)} />
                </ReviewRow>
                <ReviewRow step="members" onEdit={goTo}>
                  {members.length === 0 && (
                    <p className="text-muted-foreground">{t('wizard.noMembers')}</p>
                  )}
                  {members.map(({ email, role }) => (
                    <p key={email} className="wrap-anywhere">
                      {`${email}, ${t(`common:role.${role}`)}`}
                    </p>
                  ))}
                </ReviewRow>
              </dl>
            </div>
          )}
        </div>
        <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-b-xl border-t bg-card px-5 py-4 sm:px-7">
          <Button
            type="button"
            variant="ghost"
            disabled={index === 0}
            className="-ml-3.5 disabled:invisible"
            onClick={() => goTo(STEPS[index - 1])}
          >
            <ArrowLeftIcon aria-hidden />
            {t('common:actions.back')}
          </Button>
          {step === 'review' ? (
            <SubmitButton key="create">{t('wizard.create')}</SubmitButton>
          ) : (
            <Button key="next" type="submit">
              {t('common:actions.next')}
              <ArrowRightIcon aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </Form>
  );
}

function StepList({ current, onSelect }: { current: Step; onSelect: (step: Step) => void }) {
  const { t } = useTranslation('competition');
  const index = STEPS.indexOf(current);

  return (
    <div className="mb-5 grid gap-2">
      <p className="text-sm text-muted-foreground sm:sr-only" aria-live="polite">
        {t('wizard.progress', { step: index + 1, count: STEPS.length })}
      </p>
      <ol className="grid grid-cols-5 gap-1.5 sm:gap-3">
        {STEPS.map((step, position) => (
          <li key={step} aria-current={step === current ? 'step' : undefined}>
            <button
              type="button"
              disabled={position >= index}
              onClick={() => onSelect(step)}
              className={cn(
                'group w-full rounded-sm text-left text-sm enabled:cursor-pointer enabled:hover:text-primary max-sm:py-3',
                position > index && 'text-muted-foreground',
                step === current && 'font-semibold',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'block h-1.5 rounded-sm bg-primary/15',
                  position < index && 'bg-primary',
                  step === current && 'bg-primary',
                )}
              />
              <span className="sr-only sm:not-sr-only sm:mt-2 sm:flex sm:items-center sm:gap-1.5">
                {position < index && (
                  <CheckIcon aria-hidden className="size-4 shrink-0 text-success" />
                )}
                <span className="truncate">{`${position + 1}. ${t(`wizard.steps.${step}`)}`}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Section({ step, current, children }: { step: Step; current: Step; children: ReactNode }) {
  return (
    <div data-step={step} className={step === current ? 'grid grid-cols-1 gap-6' : 'hidden'}>
      {children}
    </div>
  );
}

function ReviewRow({
  step,
  onEdit,
  children,
}: {
  step: Step;
  onEdit: (step: Step) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation(['competition', 'common']);
  const name = t(`wizard.steps.${step}`);
  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-x-3 py-3 sm:grid-cols-[10rem_1fr_auto]">
      <dt className="text-sm text-muted-foreground">{name}</dt>
      <dd className="col-span-2 row-start-2 grid min-w-0 gap-1 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        {children}
      </dd>
      <dd className="col-start-2 sm:col-start-3">
        <Button
          type="button"
          variant="ghost"
          aria-label={t('wizard.editStep', { step: name })}
          onClick={() => onEdit(step)}
        >
          {t('common:actions.edit')}
        </Button>
      </dd>
    </div>
  );
}

function HonourSummary({ percents }: { percents: number[] }) {
  const { t } = useTranslation('competition');
  const min = Math.min(...percents);
  const max = Math.max(...percents);
  return (
    <p>
      {min === max
        ? t('wizard.honourSame', { percent: min })
        : t('wizard.honourMixed', { min, max })}
    </p>
  );
}

function getFileName(file: FormDataEntryValue | null) {
  return file instanceof File ? file.name : '';
}
