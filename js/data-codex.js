/* ============================================================
   data-codex.js — CODEX CARDS (the security lessons)
   ------------------------------------------------------------
   One card per MITRE ATT&CK technique that appears in the game.
   IDs and names follow the ATT&CK Enterprise matrix
   (https://attack.mitre.org). Mitigation IDs (M1xxx) are the
   ATT&CK mitigations listed for each technique.

   A card unlocks the first time the technique is USED (Red
   phase) or IDENTIFIED by the Analyst (Blue phase).
   ============================================================ */
window.GM = window.GM || {};

GM.TECH = {
  'T1018': {
    id: 'T1018', name: 'Remote System Discovery', tactic: 'Discovery', nick: 'Ping sweep',
    what: 'Finding out which other machines exist on a network. A ping sweep sends a small "are you there?" probe to every address in a range and notes who answers.',
    attack: 'An attacker cannot hit what they cannot see. The sweep turns a blank network into a target list. Real tool: nmap -sn 10.0.0.0/24 (host discovery only, no port scan).',
    detect: 'One source contacting dozens of addresses within seconds. Normal computers talk to a handful of servers, not to every address in the subnet.',
    defend: 'Segment the network so one machine cannot see everything (M1030 Network Segmentation), limit ICMP between segments, and alert on sweep patterns with an IDS (M1031 Network Intrusion Prevention).',
    ingame: 'The SCAN action with no target. It reveals neighbours of your current position.'
  },
  'T1046': {
    id: 'T1046', name: 'Network Service Discovery', tactic: 'Discovery', nick: 'Port scan',
    what: 'Checking which network ports are open on a host, and what software answers on them. Each open port is a door: 22 is SSH, 23 Telnet, 80 HTTP, 3306 MySQL.',
    attack: 'The service list tells the attacker which weaknesses are worth trying. Telnet suggests old gear with default passwords; an old web app suggests a public exploit.',
    detect: 'A single source touching many ports on one host in a short time, often half-open connections (a SYN that never completes the handshake).',
    defend: 'Close or remove services nobody needs (M1042 Disable or Remove Feature or Program), firewall the rest to known sources (M1030), and let an IDS/IPS flag scans (M1031).',
    ingame: 'The SCAN action on a discovered host. You type the nmap command yourself.'
  },
  'T1190': {
    id: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'Initial Access', nick: 'Unpatched web app',
    what: 'Abusing a bug in software that is reachable from the internet (a website, VPN portal, mail gateway) to run commands on the server behind it.',
    attack: 'Public servers must accept traffic from anyone, so a known bug in an unpatched CMS is an open invitation. The attacker lands as the web service account.',
    detect: 'Odd requests in the web access log (uploads to plugin paths, very long parameters) and, most telling, the web server process starting a shell.',
    defend: 'Patch quickly (M1051 Update Software), scan for known vulnerabilities (M1016 Vulnerability Scanning), keep public servers in a DMZ (M1030) and run the service with least privilege (M1026).',
    ingame: 'EXPLOIT on WEB-01 over HTTP 80. Loud, but it needs no credentials.'
  },
  'T1078.001': {
    id: 'T1078.001', name: 'Valid Accounts: Default Accounts', tactic: 'Initial Access', nick: 'Default password',
    what: 'Logging in with the username and password a device ships with from the factory (admin/admin and friends). No bug is exploited: the login is "legitimate".',
    attack: 'Default credentials are published in vendor manuals. Routers, cameras and printers are often installed and never reconfigured, so the attacker simply logs in.',
    detect: 'Logins to built-in accounts from unexpected addresses, especially over Telnet, which also sends the password in clear text.',
    defend: 'Change every default credential before a device goes live (M1027 Password Policies). Disable Telnet and use SSH. Restrict management interfaces to an admin network.',
    ingame: 'EXPLOIT on RTR-01 over Telnet 23. Grants admin straight away.'
  },
  'T1566.001': {
    id: 'T1566.001', name: 'Phishing: Spearphishing Attachment', tactic: 'Initial Access', nick: 'Phishing email',
    what: 'Sending a targeted email with a malicious attachment and a convincing story. When the person opens it, code runs on their computer as them.',
    attack: 'It skips the firewall entirely, because the victim opens the door from the inside. It is quiet, cheap, and people are easier to fool than patched servers.',
    detect: 'Mail from look-alike domains, and an office or PDF application spawning a shell or script interpreter right after an attachment is opened.',
    defend: 'User training (M1017), attachment scanning and sandboxing (M1049 Antivirus/Antimalware), macros disabled by policy, and limiting what one user account can reach.',
    ingame: 'EXPLOIT on WS-01. Works from anywhere and barely moves the detection meter.'
  },
  'T1110.001': {
    id: 'T1110.001', name: 'Brute Force: Password Guessing', tactic: 'Credential Access', nick: 'Password guessing',
    what: 'Trying many likely passwords against a login until one works.',
    attack: 'If SSH accepts passwords and the password is weak, patience is all it takes. It is the noisiest way in: every wrong guess is written to a log.',
    detect: 'A burst of "Failed password" lines from one source in auth.log, followed by "Accepted password". That pattern is exactly what the Scout greps for.',
    defend: 'Multi-factor authentication (M1032), lockout after repeated failures (M1036 Account Use Policies), strong passwords (M1027), or better, key-only SSH.',
    ingame: 'EXPLOIT on WS-02 or WEB-01 over SSH 22. Works, but the meter jumps.'
  },
  'T1548.003': {
    id: 'T1548.003', name: 'Abuse Elevation Control Mechanism: Sudo and Sudo Caching', tactic: 'Privilege Escalation', nick: 'Misconfigured sudo',
    what: 'sudo lets chosen users run chosen commands as root. If the rules in /etc/sudoers are too generous, a normal user can turn them into a full root shell.',
    attack: 'After landing as a low-privilege user the attacker runs sudo -l to list what they may run. A NOPASSWD rule for a program that can start other programs means root.',
    detect: 'sudo log entries from service accounts, sudo with no terminal attached, and root shells whose parent process is a web server or backup job.',
    defend: 'Grant sudo sparingly and never NOPASSWD for programs that can run other programs (M1026 Privileged Account Management, M1028 Operating System Configuration). Review sudoers regularly.',
    ingame: 'ESCALATE on WEB-01, WS-02 or FS-01. Admin lets you loot stored credentials.'
  },
  'T1552.004': {
    id: 'T1552.004', name: 'Unsecured Credentials: Private Keys', tactic: 'Credential Access', nick: 'Exposed SSH key',
    what: 'An SSH private key is a file that proves who you are. Whoever holds a copy can log in as the owner, with no password, anywhere that key is trusted.',
    attack: 'Attackers search home folders, backups and shares for key files (id_rsa, *.pem). A key with no passphrase and loose file permissions is a free login.',
    detect: 'File-access auditing on key locations, and key-based logins arriving from hosts that never used that key before.',
    defend: 'Keys readable only by their owner (M1022 Restrict File and Directory Permissions), protected by a passphrase (M1027), never copied into backups, and audited regularly (M1047 Audit).',
    ingame: 'ESCALATE on WS-01 uses a stray admin key. It also unlocks a pivot into FS-01.'
  },
  'T1552.001': {
    id: 'T1552.001', name: 'Unsecured Credentials: Credentials In Files', tactic: 'Credential Access', nick: 'Passwords in files',
    what: 'Passwords stored in plain text inside config files, scripts or notes on disk.',
    attack: 'Web apps need a database password and often keep it in a config file. Once the attacker can read that file, they hold the keys to the database.',
    detect: 'Hard to see, because reading a file is normal. Audit access to sensitive files and watch for the credential being used from a new place afterwards.',
    defend: 'Keep secrets in a secrets manager instead of files, restrict file permissions (M1022), audit for stored passwords (M1047), and rotate anything that may have been read.',
    ingame: 'Automatic when you become admin on WEB-01 or FS-01: you loot the DB password.'
  },
  'T1021.004': {
    id: 'T1021.004', name: 'Remote Services: SSH', tactic: 'Lateral Movement', nick: 'SSH lateral movement',
    what: 'Using SSH with stolen credentials or keys to hop from one compromised machine to the next.',
    attack: 'It looks just like an administrator doing their job. No exploit is needed, so patching the target does nothing to stop it.',
    detect: '"Accepted publickey" entries from hosts that never connected before, such as a workstation logging in to a server at 3 a.m.',
    defend: 'Rotate keys the moment theft is suspected, limit which hosts may SSH where (M1042, network segmentation), require MFA (M1032) and review who has access (M1018 User Account Management).',
    ingame: 'PIVOT into FS-01 with the stolen key. Blue stops it by rotating the key or firewalling 22.'
  },
  'T1078': {
    id: 'T1078', name: 'Valid Accounts', tactic: 'Initial Access / Persistence / Privilege Escalation', nick: 'Stolen login',
    what: 'Using real, working credentials that belong to someone (or something) else. The system cannot tell the attacker from the rightful owner.',
    attack: 'With the application\'s own database password the attacker simply logs in and reads every table. Nothing is "hacked" at this point.',
    detect: 'The account being used from an unusual host or at an unusual time, and unusual behaviour such as a full-table dump.',
    defend: 'Rotate credentials after any suspected compromise (M1027), give each account the least privilege it needs (M1026, M1018), and add MFA where possible (M1032).',
    ingame: 'The final PIVOT into DB-01. Blue stops it by rotating the DB password, but only for good once the attacker is evicted.'
  }
};

/* Order the cards are shown in the codex screen. */
GM.TECH_ORDER = ['T1018', 'T1046', 'T1190', 'T1078.001', 'T1566.001', 'T1110.001',
                 'T1548.003', 'T1552.004', 'T1552.001', 'T1021.004', 'T1078'];

/* Codex unlock tracking. Saved in localStorage so the collection
   survives between runs (wrapped in try/catch: storage can be
   blocked, and the game must still work without it). */
GM.Codex = {
  unlocked: {},
  load: function () {
    try { GM.Codex.unlocked = JSON.parse(localStorage.getItem('gitm-codex') || '{}') || {}; }
    catch (e) { GM.Codex.unlocked = {}; }
  },
  /* Returns true only the first time, so the UI can show a toast. */
  unlock: function (techId) {
    if (!GM.TECH[techId] || GM.Codex.unlocked[techId]) return false;
    GM.Codex.unlocked[techId] = true;
    try { localStorage.setItem('gitm-codex', JSON.stringify(GM.Codex.unlocked)); } catch (e) { /* ignore */ }
    return true;
  },
  count: function () { return Object.keys(GM.Codex.unlocked).length; }
};
