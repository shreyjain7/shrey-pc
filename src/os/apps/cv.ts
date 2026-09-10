import {
  achievements,
  education,
  experience,
  links,
  profile,
  projects,
  resumePath,
  skills,
  type Entry,
} from '../../data/cv';
import { el } from '../ui';

/**
 * The CV, rendered.
 *
 * These live apart from the app registry because two things draw them: the
 * standalone desktop apps (About, Projects, Resume…) and the Showcase window,
 * which stacks the same sections behind one vertical nav.
 */

export function page(...children: (Node | null)[]) {
  const root = el('div', 'doc');
  for (const child of children) if (child) root.append(child);
  return root;
}

export function heading(text: string, sub?: string) {
  const wrap = el('div', 'doc__head');
  wrap.append(el('h1', 'doc__title', text));
  if (sub) wrap.append(el('p', 'doc__sub', sub));
  return wrap;
}

export function entryCard(entry: Entry) {
  const card = el('article', 'entry');

  const top = el('div', 'entry__top');
  const left = el('div', 'entry__left');
  left.append(el('h2', 'entry__title', entry.title));
  if (entry.subtitle) left.append(el('p', 'entry__subtitle', entry.subtitle));
  top.append(left);

  if (entry.period) top.append(el('span', 'entry__period', entry.period));
  card.append(top);

  if (entry.meta) card.append(el('p', 'entry__meta', entry.meta));

  if (entry.bullets?.length) {
    const list = el('ul', 'entry__bullets');
    for (const bullet of entry.bullets) list.append(el('li', undefined, bullet));
    card.append(list);
  }

  return card;
}

export function entryList(entries: Entry[]) {
  const list = el('div', 'entries');
  for (const entry of entries) list.append(entryCard(entry));
  return list;
}

export function linkRow(label: string, href: string, display: string) {
  const row = el('a', 'link-row');
  row.href = href;
  if (!href.startsWith('mailto:')) {
    row.target = '_blank';
    row.rel = 'noreferrer noopener';
  }
  row.append(el('span', 'link-row__label', label));
  row.append(el('span', 'link-row__value', display));
  row.append(el('span', 'link-row__arrow', '→'));
  return row;
}

export function renderAbout() {
  const hero = el('div', 'hero');

  const avatar = el('div', 'hero__avatar');
  avatar.textContent = profile.name
    .split(' ')
    .map((part) => part[0])
    .join('');

  const meta = el('div', 'hero__meta');
  meta.append(el('h1', 'hero__name', profile.name));
  meta.append(el('p', 'hero__role', profile.role));
  meta.append(el('p', 'hero__tagline', profile.tagline));

  const place = el('p', 'hero__location');
  place.textContent = profile.location;
  meta.append(place);

  hero.append(avatar, meta);

  const body = el('div', 'prose');
  for (const paragraph of profile.summary) body.append(el('p', undefined, paragraph));

  return page(hero, body);
}

export function renderExperience() {
  return page(
    heading('Experience & Activities', 'Internships, student teams and chapters.'),
    entryList(experience),
  );
}

export function renderProjects() {
  return page(
    heading('Projects', 'Things I have designed, built and shipped.'),
    entryList(projects),
  );
}

export function renderEducation() {
  return page(heading('Education'), entryList(education));
}

export function renderAchievements() {
  return page(heading('Achievements & Certifications'), entryList(achievements));
}

export function renderSkills() {
  const grid = el('div', 'skill-grid');

  for (const group of skills) {
    const card = el('div', 'skill-card');
    card.append(el('h2', 'skill-card__label', group.label));

    const tags = el('div', 'skill-card__tags');
    for (const item of group.items) tags.append(el('span', 'tag', item));
    card.append(tags);

    grid.append(card);
  }

  return page(heading('Skills'), grid);
}

export function renderContact() {
  const list = el('div', 'links');
  for (const link of links) {
    list.append(linkRow(link.label, link.href, link.display ?? link.href));
  }

  const note = el('p', 'doc__note');
  note.textContent =
    'Open to internships and collaboration in software engineering and applied machine learning.';

  return page(heading('Contact', 'The quickest ways to reach me.'), list, note);
}

export function renderResume() {
  const toolbar = el('div', 'resume__toolbar');
  const download = el('a', 'button');
  download.href = resumePath;
  download.target = '_blank';
  download.rel = 'noreferrer noopener';
  download.textContent = 'Open PDF';
  toolbar.append(el('span', 'resume__filename', 'Shrey_Jain_Resume.pdf'), download);

  const sheet = el('div', 'sheet');

  const head = el('header', 'sheet__head');
  head.append(el('h1', undefined, profile.name));
  const contactLine = el('p', 'sheet__contact');
  contactLine.textContent = links
    .map((link) => link.display ?? link.href)
    .concat(profile.location)
    .join('  ·  ');
  head.append(contactLine);
  sheet.append(head);

  const sections: Array<[string, Entry[]]> = [
    ['Education', education],
    ['Projects', projects],
    ['Experience and Extracurricular', experience],
    ['Achievements and Certifications', achievements],
  ];

  const skillSection = el('section', 'sheet__section');
  skillSection.append(el('h2', undefined, 'Skills Summary'));
  for (const group of skills) {
    const line = el('p', 'sheet__skill');
    line.append(el('strong', undefined, group.label + ': '));
    line.append(document.createTextNode(group.items.join(', ')));
    skillSection.append(line);
  }

  const [first, ...rest] = sections;
  const buildSection = ([title, entries]: [string, Entry[]]) => {
    const section = el('section', 'sheet__section');
    section.append(el('h2', undefined, title));
    for (const entry of entries) section.append(entryCard(entry));
    return section;
  };

  sheet.append(buildSection(first), skillSection, ...rest.map(buildSection));

  return page(toolbar, sheet);
}
