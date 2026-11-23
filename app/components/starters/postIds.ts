/** Posts ids like a form, so the browser handles the file it gets back. */
export function postIds(
  action: string,
  ids: readonly string[],
  { contestId, target }: { contestId: string; target?: '_blank' },
) {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = action;
  if (target) form.target = target;
  for (const [name, value] of [['contest', contestId], ...ids.map((id) => ['id', id])]) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
  form.remove();
}
