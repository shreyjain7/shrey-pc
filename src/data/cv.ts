/**
 * Every word the site displays lives here.
 * Edit this file to update the CV — nothing else needs to change.
 */

export interface Link {
  label: string;
  href: string;
  /** Shown on the contact card instead of the raw href. */
  display?: string;
}

export interface Entry {
  title: string;
  subtitle?: string;
  meta?: string;
  period?: string;
  bullets?: string[];
}

export interface SkillGroup {
  label: string;
  items: string[];
}

export const profile = {
  name: 'Shrey Jain',
  role: 'Computer Science Engineer',
  tagline: 'B.Tech CSE @ Manipal Institute of Technology',
  location: 'Hyderabad, Telangana, India',
  /** Served from /public. */
  photo: './shrey.png',
  summary: [
    'Computer science undergraduate at Manipal Institute of Technology, building things at the intersection of full-stack development and applied machine learning.',
    'Most of my time goes into Python and C — FastAPI services, Django applications, and recommendation systems wired up to real databases. I like problems where a clean data model does most of the work.',
    'Outside the terminal I run sponsorship for a student racing team, lead AI initiatives for a student chapter, and occasionally end up on a stage.',
  ],
};

export const links: Link[] = [
  {
    label: 'Email',
    href: 'mailto:shreyjainengineering@gmail.com',
    display: 'shreyjainengineering@gmail.com',
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/shrey--jain0007',
    display: 'linkedin.com/in/shrey--jain0007',
  },
  {
    label: 'GitHub',
    href: 'https://github.com/shreyjain7',
    display: 'github.com/shreyjain7',
  },
  {
    label: 'Website',
    href: 'https://shreyjain.in',
    display: 'shreyjain.in',
  },
];

export const education: Entry[] = [
  {
    title: 'Manipal Institute of Technology (MIT)',
    subtitle: 'Bachelor of Technology — Computer Science',
    meta: 'MET Rank: 42',
    period: '2023 – 2027 (Expected)',
    bullets: [
      'Coursework: Data Structures & Algorithms, Database Management Systems, Operating Systems, Computer Networks, Object-Oriented Programming, Discrete Mathematics, Software Engineering, Artificial Intelligence and Machine Learning.',
    ],
  },
  {
    title: 'FIITJEE, Telangana State Board',
    subtitle: 'Class XI–XII',
    meta: '83.7%',
    period: '2021 – 2023',
  },
];

export const skills: SkillGroup[] = [
  { label: 'Languages', items: ['C', 'Python'] },
  { label: 'Developer Tools', items: ['VS Code', 'Git'] },
  { label: 'Databases', items: ['MySQL', 'DBMS concepts'] },
  { label: 'Operating Systems', items: ['Windows', 'Linux'] },
  {
    label: 'Core Competencies',
    items: [
      'Data Structures',
      'Algorithms',
      'Machine Learning Fundamentals',
      'IoT Security',
    ],
  },
];

export const projects: Entry[] = [
  {
    title: 'Local RAG-Based Document Q&A System',
    subtitle: 'Ollama · Llama 3 · nomic-embed-text',
    bullets: [
      'Built a fully local RAG pipeline that ingests PDF documents, embeds them using nomic-embed-text, and answers natural language queries via Llama 3 — no API keys or internet required.',
    ],
  },
  {
    title: 'Attendance Management System',
    subtitle: 'Python · Django',
    bullets: [
      "Implemented a robust security layer using Django's built-in authentication system, securing all views with session-based login and protecting against CSRF vulnerabilities.",
    ],
  },
];

export const experience: Entry[] = [
  {
    title: 'Greenko',
    subtitle: 'Intern',
    period: 'June 18 – July 18, 2026',
    bullets: [
      "Completed a learning-focused internship gaining exposure to Greenko's GEMOS (Green Energy Management and Operations System) platform, used for real-time monitoring of pumped-storage plant operations including energy generation, reservoir levels, and market data.",
      'Observed platform workflows and dashboard operations as part of onboarding into energy management systems and renewable energy operations.',
    ],
  },
  {
    title: 'Formula Manipal',
    subtitle: 'Management & Sponsorship',
    period: 'September 2024 – December 2024',
    bullets: [
      'Led sponsorship outreach and branding efforts for Formula Manipal, a student racing team.',
      'Designed team merchandise and visual assets, and supported external stakeholder communications.',
    ],
  },
  {
    title: "IE Mechatronics Students' Chapter, Manipal",
    subtitle: 'AI & Development (MANCOMM)',
    period: 'September 2024 – Present',
    bullets: [
      'Technical leadership role focused on artificial intelligence and software development initiatives.',
      'Organizing events and mentoring peers within the student chapter.',
    ],
  },
  {
    title: 'The Economics and Finance Society of Manipal (ESOM)',
    subtitle: 'Working Committee Member',
    period: 'July 2023 – July 2024',
    bullets: [
      'Member of the working committee responsible for organizing economics and finance events and initiatives at institute level.',
    ],
  },
  {
    title: 'AAINA Dramatics, Manipal Institute of Technology',
    subtitle: 'Performing Arts',
    period: 'July 2023 – Present',
    bullets: [
      "Active participant in the institute's dramatics club, contributing to stage performances and developing communication and teamwork skills.",
    ],
  },
];

export const achievements: Entry[] = [
  {
    title: 'MET Entrance Exam — Rank 42',
    subtitle: 'All-India rank in the Manipal Entrance Test for B.Tech admissions',
  },
  {
    title: 'Accounting Fundamentals',
    subtitle: 'Corporate Finance Institute',
    period: 'October 2024',
  },
  {
    title: 'Basics in IoT Security',
    subtitle: 'Manipal Institute of Technology',
    period: 'July 2023',
  },
];

/** Served from /public. */
export const resumePath = './Shrey_Jain_Resume.pdf';
