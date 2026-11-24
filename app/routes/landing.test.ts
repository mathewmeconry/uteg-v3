import { RouterContextProvider } from 'react-router';
import { languageContext, userContext } from '~/context';
import { getT } from '~/middlewares/i18n.server';
import { loader as indexLoader } from './index';
import { middleware } from './landing';

function createContext(isSignedIn = false) {
  const context = new RouterContextProvider();
  context.set(userContext, isSignedIn ? ({ id: 'a' } as any) : null);
  return context;
}

async function open(path: string, context: RouterContextProvider) {
  const request = new Request(`http://localhost${path}`);
  const next = async () => new Response(getT(context)('landing:faq.title'));
  return (await middleware[0]({ request, context } as any, next)) as Response;
}

it.each([
  ['/de', 'Häufige Fragen'],
  ['/fr', 'Questions fréquentes'],
  ['/fr.data', 'Questions fréquentes'],
  ['/EN/', 'Frequently asked questions'],
])('%s is in its language, whatever the one of the visitor', async (path, title) => {
  const context = createContext();
  context.set(languageContext, 'de');
  const response = await open(path, context);
  expect(await response.text()).toBe(title);
  expect(response.headers.get('Set-Cookie')).toMatch(/^language=/);
});

it('sends who is signed in to the competitions', async () => {
  const response = await open('/de', createContext(true)).catch((thrown) => thrown);
  expect(response.headers.get('Location')).toBe('/home');
  const index = indexLoader({ context: createContext(true) } as any);
  expect(index.headers.get('Location')).toBe('/home');
});

it('opens in the language of the visitor', () => {
  const context = createContext();
  context.set(languageContext, 'fr');
  expect(indexLoader({ context } as any).headers.get('Location')).toBe('/fr');
});
