import { useEffect } from 'react';
import { useFetchers, useNavigation } from 'react-router';
import { showQueuedToasts } from '~/lib/toast';

/** Shows toasts queued with enqueueToast after every navigation and fetcher submission. */
export function useToasts() {
  const navigation = useNavigation();
  const fetchers = useFetchers();

  useEffect(() => {
    if (navigation.state === 'idle') showQueuedToasts();
  }, [navigation.state, fetchers]);
}
