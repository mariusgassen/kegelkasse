import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'doc',
      id: 'intro',
      label: 'Übersicht',
    },
    {
      type: 'doc',
      id: 'erste-schritte',
      label: 'Erste Schritte',
    },
    {
      type: 'category',
      label: 'Benutzerrollen',
      collapsed: false,
      items: [
        'rollen/uebersicht',
        'rollen/mitglied',
        'rollen/admin',
        'rollen/superadmin',
      ],
    },
    {
      type: 'category',
      label: 'Funktionen',
      collapsed: false,
      items: [
        'funktionen/abende',
        'funktionen/termine',
        'funktionen/spiele',
        'funktionen/strafen',
        'funktionen/getraenke',
        'funktionen/kasse',
        'funktionen/historie',
        'funktionen/statistiken',
        'funktionen/praesidenten',
        'funktionen/pins',
        'funktionen/push',
      ],
    },
  ],
};

export default sidebars;
