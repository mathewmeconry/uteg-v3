import { data } from 'react-router';
import { DomainError } from '~/lib/errors';
import type { ServerT } from '~/locales';
import type { EgtApparatus } from '~/modules/egt/module';

const MAX_LISTED = 5;

/**
 * The translated message of a DomainError. Missing records and roles become 404 and 403 pages,
 * everything that is not a DomainError is thrown again.
 */
export function domainErrorMessage(error: unknown, t: ServerT): string {
  if (!(error instanceof DomainError)) throw error;
  if (error.code === 'NOT_FOUND') throw data(null, 404);
  if (error.code === 'FORBIDDEN') throw data(null, 403);
  const message = t(`common:domainErrors.${error.code}`);
  const { missing = [] } = error.details;
  if (missing.length === 0) return message;

  const list = missing
    .slice(0, MAX_LISTED)
    .map(
      ({ firstname, lastname, apparatus }) =>
        `${firstname} ${lastname} (${t(`common:apparatus.${apparatus as EgtApparatus}`)})`,
    );
  return `${message} ${list.join(', ')}${missing.length > MAX_LISTED ? ' …' : ''}`;
}

/**
 * What an action returns after a DomainError. Also for missing records: somebody else may just have
 * deleted them, the page is still right. useActionFetcher shows it.
 */
export function actionError(error: unknown, t: ServerT) {
  if (error instanceof DomainError && error.code === 'NOT_FOUND') {
    return data({ error: t('common:domainErrors.NOT_FOUND') }, 404);
  }
  return data({ error: domainErrorMessage(error, t) }, 400);
}
