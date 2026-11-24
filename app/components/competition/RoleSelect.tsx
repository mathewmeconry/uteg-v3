import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import type { Role } from '~/generated/prisma/enums';

export const ROLES: Role[] = ['CHECK_IN', 'VIEWER', 'EDITOR', 'OWNER'];

/** Select of a member's role. The remaining props go to the trigger. */
export function RoleSelect({
  name,
  value,
  onChange,
  defaultValue,
  ...props
}: {
  name?: string;
  value?: Role;
  defaultValue?: Role;
  onChange?: (role: Role) => void;
} & Omit<ComponentProps<typeof SelectTrigger>, 'onChange' | 'value' | 'defaultValue'>) {
  const { t } = useTranslation();
  return (
    <Select name={name} value={value} defaultValue={defaultValue} onValueChange={onChange}>
      <SelectTrigger {...props}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((role) => (
          <SelectItem key={role} value={role}>
            {t(`role.${role}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
