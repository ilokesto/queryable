# Queryable Authoring Documentation Design System

## 1. Atmosphere & Identity

A quiet, technical reading surface for Queryable's private authoring channel.
The application reuses ilokesto's existing Fumadocs neutral shell, navigation,
typography, code presentation, and light/dark behavior. The signature is the
clear separation between canonical package documentation and an unpublished
authoring route. It is not a product landing page and has no interactive
package demo.

Reference: the checked Fetcher renderer's `website/DESIGN.md`,
`website/DOCS_ARCHITECTURE.md`, and Fumadocs application components. Queryable
adapts that shared documentation system without copying release collections,
runtime aliases, package demos, or public package discovery.

## 2. Color

### Palette

| Role | Token | Source / use |
| --- | --- | --- |
| Page surface | `--color-fd-background` | Fumadocs neutral theme |
| Raised surface | `--color-fd-card` | Fumadocs neutral theme |
| Main text | `--color-fd-foreground` | Fumadocs neutral theme |
| Secondary text | `--color-fd-muted-foreground` | Fumadocs neutral theme |
| Dividers | `--color-fd-border` | Fumadocs neutral theme |
| Links and focus | `--color-fd-primary`, `--color-fd-ring` | Fumadocs neutral theme |
| Code surface and syntax | Existing Fumadocs code theme | Canonical MDX code blocks |

Queryable has no package-specific marketing accent. Do not invent one or add a
released-package color. Light and dark values come from the same Fumadocs
neutral tokens.

### Rules

- Do not place semantic state on color alone.
- Do not add raw color values outside this file.
- Keep channel status text explicit; a visual badge is supplementary.

## 3. Typography

- Use the existing documentation app's Inter sans stack and inherited
  monospace stack. Do not add a font family.
- Preserve Fumadocs heading and body scales.
- Use `break-keep` for Korean prose and headings where natural line breaking
  requires it.
- Keep body text at the existing readable documentation size; code blocks use
  the existing syntax theme and line-height.

## 4. Spacing & Layout

- Keep the existing Fumadocs documentation shell, responsive gutters, sidebar,
  table of contents, and content-width behavior.
- The document owns vertical scrolling; code blocks own horizontal overflow.
- Use the established Tailwind spacing scale and existing shell breakpoints.
- At mobile widths, preserve reading order and allow the Fumadocs navigation
  controls to collapse using their existing responsive behavior.
- Do not create a separate landing-page grid or duplicate navigation shell.

## 5. Components

### Documentation shell

- **Structure:** Fumadocs `DocsLayout` around a single authoring-only source.
- **Variants:** English and Korean; light and dark.
- **States:** Existing Fumadocs navigation, search, sidebar, and table of
  contents states.
- **Accessibility:** Native links and buttons, ordered headings, visible
  keyboard focus, localized labels.
- **Motion:** Existing library behavior only; respect reduced motion.
- **Layout:** Fumadocs responsive documentation shell. The document owns
  vertical scrolling.

### Private authoring notice

- **Structure:** A compact semantic status banner in the page content.
- **Variants:** English and Korean.
- **States:** Static. No release switcher or published-version state.
- **Accessibility:** Text states that the page is private, unpublished
  authoring documentation; not color-only.
- **Motion:** None.
- **Layout:** In document flow above the canonical MDX content.

### Search

- **Structure:** Existing Fumadocs search dialog and keyboard shortcut.
- **Variants:** Localized for English and Korean; queries only the next source.
- **States:** Empty, results, no results, and error behavior from Fumadocs.
- **Accessibility:** Keyboard-openable, labeled input, visible focus, Escape
  close.
- **Motion:** Existing Fumadocs behavior only.
- **Layout:** Existing dialog/popover layer; no duplicate search control.

### Language switcher

- **Structure:** Existing Fumadocs locale navigation.
- **Variants:** English and Korean.
- **States:** Keeps the selected `/next` authoring channel while changing
  locale.
- **Accessibility:** Native links with language names and `hreflang`.
- **Motion:** None required.
- **Layout:** Existing documentation header navigation.

### MDX page

- **Structure:** Canonical package MDX rendered through Fumadocs components.
- **Variants:** English and Korean source pages only.
- **States:** Existing code, heading, link, and table rendering.
- **Accessibility:** Semantic Markdown structure, keyboard-accessible links,
  readable code and CJK wrapping.
- **Motion:** None.
- **Layout:** Existing Fumadocs page, sidebar, and table of contents.

## 6. Motion & Interaction

- No decorative animation is added.
- Search, language navigation, and documentation links retain native
  interaction semantics and existing Fumadocs feedback.
- Keyboard search uses the library's standard shortcut; typing in an input must
  remain ordinary text entry.
- Respect `prefers-reduced-motion` through the inherited component library.

## 7. Depth & Surface

- Use the existing Fumadocs neutral surfaces and border tokens.
- Do not add custom shadows, colored edge stripes, glass surfaces, or a second
  component theme.
- Keep code surfaces visually distinct through the existing code theme.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- Target WCAG 2.2 AA.
- Preserve visible `:focus-visible` indicators and full keyboard navigation.
- Keep search, locale, channel, and page navigation as native links or buttons.
- Localize user-facing controls in Korean pages; API identifiers remain
  unchanged.
- Check contrast in both Fumadocs themes and verify 320px reflow, 390px mobile,
  and desktop layouts.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
| --- | --- | --- | --- |
| None | None | No debt accepted for the authoring renderer. | Task 7 |
