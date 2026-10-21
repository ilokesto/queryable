import authoringMode from './docs-mode.json';

export function isDevelopmentDocs(slugs: readonly string[] | undefined): boolean {
  return slugs?.[0] === authoringMode.package
    && slugs[1] === authoringMode.channel;
}
