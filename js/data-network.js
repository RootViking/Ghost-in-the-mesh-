/* ============================================================
   data-network.js — THE SIMULATED NETWORK (pure data, no logic)
   ------------------------------------------------------------
   Everything about the map lives here: the nodes, the cables
   between them, the weaknesses an attacker can abuse, and the
   credentials that can be stolen. Nothing here is a real host
   or a real exploit: it is a board-game board written as data.

   Want a new level? Edit this file only. The rules engine
   (rules.js) reads whatever you put here.
   ============================================================ */
window.GM = window.GM || {};

/* NODES ------------------------------------------------------
   x,y   : position on the 960x600 canvas
   kind  : which pixel sprite to draw (see map.js)
   zone  : network segment, used by the Blue-phase IDS hints
   services[].critical : the business needs this port open, so
                         the Guard is not allowed to firewall it */
GM.NODES = {
  NET: { id: 'NET', name: 'INTERNET', ip: '203.0.113.66', kind: 'internet', zone: 'OUTSIDE', x: 90, y: 300,
         role: 'Where the attacker starts. Not part of the company network.', services: [] },

  RTR: { id: 'RTR', name: 'RTR-01', ip: '10.0.0.1', kind: 'router', zone: 'EDGE', x: 290, y: 440,
         role: 'Edge router. Gateway between the internet and the office LAN.',
         services: [{ port: 23, name: 'Telnet' }, { port: 443, name: 'HTTPS admin', critical: true }] },

  WEB: { id: 'WEB', name: 'WEB-01', ip: '10.0.0.5', kind: 'web', zone: 'EDGE', x: 290, y: 160,
         role: 'Public web server running the company CMS. Talks to the database.',
         services: [{ port: 80, name: 'HTTP', critical: true }, { port: 22, name: 'SSH' }] },

  WS2: { id: 'WS2', name: 'WS-02', ip: '10.0.0.22', kind: 'workstation', zone: 'LAN', x: 530, y: 260,
         role: 'IT admin workstation. Holds an SSH key for the file server.',
         services: [{ port: 22, name: 'SSH' }] },

  WS1: { id: 'WS1', name: 'WS-01', ip: '10.0.0.21', kind: 'workstation', zone: 'LAN', x: 530, y: 440,
         role: 'Office workstation of j.doe, who reads a lot of email.',
         services: [{ port: 22, name: 'SSH' }] },

  FS:  { id: 'FS', name: 'FS-01', ip: '10.0.0.10', kind: 'fileserver', zone: 'CORE', x: 780, y: 440,
         role: 'File server. Runs the nightly database backup script.',
         services: [{ port: 22, name: 'SSH' }, { port: 445, name: 'SMB', critical: true }] },

  DB:  { id: 'DB', name: 'DB-01', ip: '10.0.0.50', kind: 'database', zone: 'CORE', x: 780, y: 160,
         role: 'CROWN JEWEL. Customer database. Reaching it ends the attack.',
         crown: true,
         services: [{ port: 3306, name: 'MySQL', critical: true }, { port: 22, name: 'SSH' }] }
};

/* EDGES ------------------------------------------------------
   A normal edge is a network path: you can scan, exploit and
   pivot along it. The one "email" edge is not a network path.
   It only exists so a ping sweep from the internet also turns
   up j.doe's address (OSINT), making WS-01 phishable. */
GM.EDGES = [
  { a: 'NET', b: 'RTR' },
  { a: 'NET', b: 'WEB' },
  { a: 'NET', b: 'WS1', email: true },
  { a: 'RTR', b: 'WEB' },
  { a: 'RTR', b: 'WS2' },
  { a: 'RTR', b: 'WS1' },
  { a: 'WS1', b: 'WS2' },
  { a: 'WS1', b: 'FS' },
  { a: 'WS2', b: 'FS' },
  { a: 'WEB', b: 'DB' },
  { a: 'FS',  b: 'DB' }
];

/* WEAKNESSES -------------------------------------------------
   kind 'entry'   : gets you ONTO a node (EXPLOIT action)
   kind 'privesc' : user -> admin on a node you are on (ESCALATE)
   tech   : MITRE ATT&CK technique ID (cards in data-codex.js)
   port   : service the attack rides on; firewalling it blocks it
   remote : true = works from anywhere (phishing arrives by mail)
   needsScan : must port-scan the node before you can use it
   noise  : how much it raises the detection meter
   loot   : credential (see CREDS) handed over when you get admin
   fix    : what the Guard's PATCH action really means here      */
GM.WEAKNESSES = {
  'rtr-default': { id: 'rtr-default', node: 'RTR', kind: 'entry', port: 23, tech: 'T1078.001',
    label: 'Factory-default admin password on Telnet', grants: 'admin', noise: 10, needsScan: true, severity: 'HIGH',
    fix: 'Change the default password, then disable Telnet and manage the router over SSH.' },

  'web-cms': { id: 'web-cms', node: 'WEB', kind: 'entry', port: 80, tech: 'T1190',
    label: 'Unpatched CMS plugin (remote code execution)', grants: 'user', noise: 25, needsScan: true, severity: 'CRITICAL',
    fix: 'Apply the vendor security update to the CMS and its plugins.' },

  'web-ssh': { id: 'web-ssh', node: 'WEB', kind: 'entry', port: 22, tech: 'T1110.001',
    label: 'Guessable SSH password on the deploy account', grants: 'user', noise: 30, needsScan: true, severity: 'HIGH',
    fix: 'Disable SSH password logins (keys only) and lock accounts after repeated failures.' },

  'ws1-phish': { id: 'ws1-phish', node: 'WS1', kind: 'entry', port: null, remote: true, tech: 'T1566.001',
    label: 'User opens unexpected email attachments', grants: 'user', noise: 5, needsScan: false, severity: 'HIGH',
    fix: 'Phishing-awareness training, attachment sandboxing and macros disabled by policy.' },

  'ws2-ssh': { id: 'ws2-ssh', node: 'WS2', kind: 'entry', port: 22, tech: 'T1110.001',
    label: 'Guessable SSH password on the admin workstation', grants: 'user', noise: 30, needsScan: true, severity: 'HIGH',
    fix: 'Disable SSH password logins (keys only) and lock accounts after repeated failures.' },

  'web-sudo': { id: 'web-sudo', node: 'WEB', kind: 'privesc', tech: 'T1548.003',
    label: 'Misconfigured sudo: web account may run a program as root with no password', noise: 8, loot: 'db-creds', severity: 'HIGH',
    fix: 'Remove the NOPASSWD sudoers entry for the web service account.' },

  'ws1-key': { id: 'ws1-key', node: 'WS1', kind: 'privesc', tech: 'T1552.004',
    label: 'Admin SSH private key left world-readable in a backup folder', noise: 4, loot: 'fs-key', severity: 'HIGH',
    fix: 'Delete the stray key copy; private keys must be owner-only (chmod 600) and passphrase-protected.' },

  'ws2-sudo': { id: 'ws2-sudo', node: 'WS2', kind: 'privesc', tech: 'T1548.003',
    label: 'Misconfigured sudo: every user may run a text editor as root', noise: 8, loot: 'fs-key', severity: 'HIGH',
    fix: 'Remove the over-broad sudoers rule; grant root only to named admins.' },

  'fs-sudo': { id: 'fs-sudo', node: 'FS', kind: 'privesc', tech: 'T1548.003',
    label: 'Misconfigured sudo: backup account may run a script it can also edit', noise: 8, loot: 'db-creds', severity: 'HIGH',
    fix: 'Make the backup script root-owned and read-only, or drop the sudo rule.' }
};

/* CREDS ------------------------------------------------------
   Stolen secrets. Holding one lets the attacker PIVOT into
   `target` over `port` with no exploit at all, which is why
   real defenders care so much about credential hygiene.
   lootTech : technique for STEALING it
   tech     : technique for USING it                           */
GM.CREDS = {
  'fs-key':   { id: 'fs-key', target: 'FS', port: 22, tech: 'T1021.004', lootTech: 'T1552.004',
                label: 'SSH private key for backup@FS-01', grants: 'user', noise: 6, severity: 'HIGH',
                fix: 'Rotate the SSH key pair and remove the old public key from authorized_keys.' },
  'db-creds': { id: 'db-creds', target: 'DB', port: 3306, tech: 'T1078', lootTech: 'T1552.001',
                label: 'Database password found in a config file', grants: 'admin', noise: 6, severity: 'CRITICAL',
                fix: 'Rotate the database password and move it from plain files into a secrets manager.' }
};
