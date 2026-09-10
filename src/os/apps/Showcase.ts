import { profile, resumePath } from '../../data/cv';
import { el, svg } from '../ui';
import {
  renderAbout,
  renderAchievements,
  renderContact,
  renderEducation,
  renderExperience,
  renderProjects,
  renderResume,
  renderSkills,
} from './cv';

/**
 * Showcase — the whole CV behind one vertical nav.
 *
 * The same sections exist as standalone desktop apps; this is the version for
 * reading straight through, without opening eight windows to do it.
 */

interface Section {
  id: string;
  label: string;
  icon: string;
  render: () => HTMLElement;
}

const SECTIONS: Section[] = [
  {
    id: 'about',
    label: 'About',
    icon: svg('<circle cx="12" cy="8" r="3.4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
    render: renderAbout,
  },
  {
    id: 'experience',
    label: 'Experience',
    icon: svg(
      '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/>' +
        '<path d="M8.5 7.5V5.8A1.8 1.8 0 0 1 10.3 4h3.4a1.8 1.8 0 0 1 1.8 1.8v1.7"/>',
    ),
    render: renderExperience,
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: svg(
      '<path d="M3 7.4A1.4 1.4 0 0 1 4.4 6h4.2l1.9 2.2h9.1A1.4 1.4 0 0 1 21 9.6v8A1.4 1.4 0 0 1 19.6 19H4.4A1.4 1.4 0 0 1 3 17.6z"/>',
    ),
    render: renderProjects,
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: svg('<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m13.5 5-3 14"/>'),
    render: renderSkills,
  },
  {
    id: 'education',
    label: 'Education',
    icon: svg(
      '<path d="m12 4 9 4.5-9 4.5-9-4.5z"/>' +
        '<path d="M6.5 10.6V15c0 1.6 2.5 3 5.5 3s5.5-1.4 5.5-3v-4.4"/>',
    ),
    render: renderEducation,
  },
  {
    id: 'achievements',
    label: 'Awards',
    icon: svg('<circle cx="12" cy="9" r="5"/><path d="m8.6 13.2-1.1 6.3 4.5-2.3 4.5 2.3-1.1-6.3"/>'),
    render: renderAchievements,
  },
  {
    id: 'resume',
    label: 'Resume',
    icon: svg(
      '<path d="M14 3H7a1.8 1.8 0 0 0-1.8 1.8v14.4A1.8 1.8 0 0 0 7 21h10a1.8 1.8 0 0 0 1.8-1.8V8z"/>' +
        '<path d="M14 3v5h4.8"/>',
    ),
    render: renderResume,
  },
  {
    id: 'contact',
    label: 'Contact',
    icon: svg('<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.6 7 8.4 6 8.4-6"/>'),
    render: renderContact,
  },
];

export function createShowcase(): HTMLElement {
  const root = el('div', 'showcase');

  const sidebar = el('nav', 'showcase__nav');

  const brand = el('div', 'showcase__brand');
  const mark = el('span', 'showcase__mark');
  mark.textContent = profile.name
    .split(' ')
    .map((part) => part[0])
    .join('');
  brand.append(mark);
  const brandMeta = el('span', 'showcase__brand-meta');
  brandMeta.append(el('span', 'showcase__brand-name', profile.name));
  brandMeta.append(el('span', 'showcase__brand-role', profile.role));
  brand.append(brandMeta);
  sidebar.append(brand);

  const pane = el('div', 'showcase__pane');
  const buttons: HTMLElement[] = [];
  let active = 0;

  // Sections are built on demand and kept, so scroll position survives a
  // round trip through the nav.
  const built = new Map<number, HTMLElement>();

  function show(next: number) {
    active = next;
    buttons.forEach((node, i) => node.classList.toggle('is-active', i === active));

    let view = built.get(active);
    if (!view) {
      view = SECTIONS[active].render();
      built.set(active, view);
    }

    pane.replaceChildren(view);
  }

  SECTIONS.forEach((section, index) => {
    const item = el('button', 'showcase__item');
    item.type = 'button';

    const icon = el('span', 'showcase__item-icon');
    icon.innerHTML = section.icon;
    item.append(icon);
    item.append(el('span', 'showcase__item-label', section.label));

    item.addEventListener('click', () => show(index));
    buttons.push(item);
    sidebar.append(item);
  });

  const download = el('a', 'showcase__resume');
  download.href = resumePath;
  download.target = '_blank';
  download.rel = 'noreferrer noopener';
  download.textContent = 'Download CV';
  sidebar.append(download);

  root.append(sidebar, pane);

  root.tabIndex = 0;
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.stopPropagation();
    event.preventDefault();
    show((active + (event.key === 'ArrowDown' ? 1 : -1) + SECTIONS.length) % SECTIONS.length);
  });

  show(0);
  return root;
}
