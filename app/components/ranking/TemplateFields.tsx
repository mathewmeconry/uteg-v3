import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '~/components/FormField';
import { Checkbox } from '~/components/ui/checkbox';
import { FieldLegend, FieldSet } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Textarea } from '~/components/ui/textarea';
import {
  PLACEHOLDERS,
  rankingTemplateSchema,
  type RankingTemplateOptions,
} from '~/lib/domain/rankingTemplate';

type Options = RankingTemplateOptions;
type Key = keyof Options;

const COLUMNS = Object.keys(
  rankingTemplateSchema.shape.columns.parse({}),
) as (keyof Options['columns'])[];

/** Every option of a template. */
export function TemplateFields({
  options,
  onChange,
}: {
  options: Options;
  onChange: (options: Options) => void;
}) {
  const { t } = useTranslation(['pdf', 'common']);
  const { error } = rankingTemplateSchema.safeParse(options);
  const errorOf = (key: Key) =>
    error?.issues.some(({ path }) => path[0] === key) ? t('common:errors.invalid') : undefined;

  function set<K extends Key>(key: K, value: Options[K]) {
    onChange({ ...options, [key]: value });
  }

  function text(key: 'title' | 'subtitle' | 'groupHeading', hint?: string) {
    return (
      <FormField
        label={t(`form.${key}`)}
        hint={hint}
        error={errorOf(key)}
        maxLength={200}
        value={options[key]}
        onChange={(event) => set(key, event.target.value)}
      />
    );
  }

  function number(key: 'fontSize' | 'rowHeight', min: number, max: number, hint?: string) {
    const value = options[key];
    return (
      <FormField
        label={t(`form.${key}`)}
        hint={hint}
        error={errorOf(key)}
        type="number"
        min={min}
        max={max}
        step="0.5"
        value={Number.isNaN(value) ? '' : value}
        onChange={(event) => set(key, event.target.valueAsNumber)}
      />
    );
  }

  function check(
    key:
      | 'showLogo'
      | 'showDate'
      | 'showPageNumbers'
      | 'newPagePerCategory'
      | 'highlightBest'
      | 'onlyAwarded',
  ) {
    return (
      <CheckField
        label={t(`form.${key}`)}
        checked={options[key]}
        onChange={(checked) => set(key, checked)}
      />
    );
  }

  return (
    <>
      <Section title={t('form.texts')}>
        <p className="text-sm text-muted-foreground">
          {t('form.placeholders', { list: PLACEHOLDERS.map((name) => `{${name}}`).join(' ') })}
        </p>
        {text('title')}
        {text('subtitle')}
        {text('groupHeading', t('form.groupHeadingHint'))}
        <FormField label={t('form.footer')} error={errorOf('footer')}>
          {(props) => (
            <Textarea
              {...props}
              maxLength={500}
              value={options.footer}
              onChange={(event) => set('footer', event.target.value)}
            />
          )}
        </FormField>
        <SignatureField
          labels={options.signatureLabels}
          error={errorOf('signatureLabels')}
          onChange={(labels) => set('signatureLabels', labels)}
        />
      </Section>

      <Section title={t('form.layout')}>
        <Columns>
          <SelectField
            label={t('form.orientation')}
            value={options.orientation}
            items={[
              ['portrait', t('form.orientations.portrait')],
              ['landscape', t('form.orientations.landscape')],
            ]}
            onChange={(value) => set('orientation', value)}
          />
          <FormField label={t('form.accentColor')}>
            {(props) => (
              <Input
                {...props}
                type="color"
                className="p-1"
                value={options.accentColor}
                onChange={(event) => set('accentColor', event.target.value)}
              />
            )}
          </FormField>
          {number('fontSize', 6, 16, t('form.fontSizeHint'))}
          {number('rowHeight', 10, 40)}
        </Columns>
        {check('showLogo')}
        {options.showLogo && (
          <SelectField
            label={t('form.logoPosition')}
            value={options.logoPosition}
            items={[
              ['left', t('form.logoPositions.left')],
              ['center', t('form.logoPositions.center')],
              ['right', t('form.logoPositions.right')],
            ]}
            onChange={(value) => set('logoPosition', value)}
          />
        )}
        {check('showDate')}
        {check('showPageNumbers')}
        {check('newPagePerCategory')}
      </Section>

      <Section title={t('form.columns')}>
        <Columns>
          {COLUMNS.map((column) => (
            <CheckField
              key={column}
              label={t(`form.column.${column}`)}
              checked={options.columns[column]}
              onChange={(checked) => set('columns', { ...options.columns, [column]: checked })}
            />
          ))}
        </Columns>
        <SelectField
          label={t('form.nameFormat')}
          value={options.nameFormat}
          items={[
            ['firstLast', t('form.nameFormats.firstLast')],
            ['lastFirst', t('form.nameFormats.lastFirst')],
            ['separate', t('form.nameFormats.separate')],
          ]}
          onChange={(value) => set('nameFormat', value)}
        />
      </Section>

      <Section title={t('form.results')}>
        <Columns>
          <SelectField
            label={t('form.decimals')}
            value={String(options.decimals)}
            items={[
              ['2', '2'],
              ['3', '3'],
            ]}
            onChange={(value) => set('decimals', value === '3' ? 3 : 2)}
          />
          <SelectField
            label={t('form.medalStyle')}
            value={options.medalStyle}
            items={[
              ['letters', t('form.medalStyles.letters')],
              ['icons', t('form.medalStyles.icons')],
              ['none', t('form.medalStyles.none')],
            ]}
            onChange={(value) => set('medalStyle', value)}
          />
        </Columns>
        {check('highlightBest')}
        {check('onlyAwarded')}
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <FieldSet className="gap-4 rounded-lg border bg-card p-4">
      <FieldLegend className="float-left mb-0 w-full">{title}</FieldLegend>
      {children}
    </FieldSet>
  );
}

function Columns({ children }: { children: ReactNode }) {
  return <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">{children}</div>;
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Label className="leading-normal pointer-coarse:min-h-11">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      {label}
    </Label>
  );
}

function SelectField<Value extends string>({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: Value;
  items: [Value, string][];
  onChange: (value: Value) => void;
}) {
  return (
    <FormField label={label}>
      {(props) => (
        <Select value={value} onValueChange={(next) => onChange(next as Value)}>
          <SelectTrigger {...props} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map(([item, itemLabel]) => (
              <SelectItem key={item} value={item}>
                {itemLabel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

function SignatureField({
  labels,
  error,
  onChange,
}: {
  labels: string[];
  error: string | undefined;
  onChange: (labels: string[]) => void;
}) {
  const { t } = useTranslation('pdf');
  // Keeps empty lines while typing.
  const [text, setText] = useState(labels.join('\n'));

  return (
    <FormField label={t('form.signatures')} hint={t('form.signaturesHint')} error={error}>
      {(props) => (
        <Textarea
          {...props}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            onChange(
              event.target.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            );
          }}
        />
      )}
    </FormField>
  );
}
