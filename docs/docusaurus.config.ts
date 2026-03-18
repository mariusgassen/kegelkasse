import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Kegelkasse',
  tagline: 'Kegelclub-Verwaltung leicht gemacht',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
  },

  url: 'https://kasse.kc-eichorn.de',
  baseUrl: '/docs/',

  organizationName: 'mariusgassen',
  projectName: 'kegelkasse',

  onBrokenLinks: 'warn',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'de',
    locales: ['de'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Kegelkasse',
      logo: {
        alt: 'Kegelkasse Logo',
        src: 'img/logo.svg',
        srcDark: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Dokumentation',
        },
        {
          href: 'https://github.com/mariusgassen/kegelkasse',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Dokumentation',
          items: [
            {label: 'Übersicht', to: '/'},
            {label: 'Erste Schritte', to: '/erste-schritte'},
            {label: 'Benutzerrollen', to: '/rollen/uebersicht'},
          ],
        },
        {
          title: 'Rollen',
          items: [
            {label: 'Mitglied', to: '/rollen/mitglied'},
            {label: 'Admin', to: '/rollen/admin'},
            {label: 'Superadmin', to: '/rollen/superadmin'},
          ],
        },
        {
          title: 'Funktionen',
          items: [
            {label: 'Abende', to: '/funktionen/abende'},
            {label: 'Spiele', to: '/funktionen/spiele'},
            {label: 'Strafen', to: '/funktionen/strafen'},
            {label: 'Kasse', to: '/funktionen/kasse'},
          ],
        },
      ],
      copyright: `© 2026 Marius Gassen — Kegelkasse. Erstellt mit Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
