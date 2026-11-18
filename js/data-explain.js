/* ============================================================
   data-explain.js — "WHAT DID THAT JUST DO?" (terminal explanations)
   ------------------------------------------------------------
   Every time anyone acts, the in-game terminal prints a block:

     TURN 3 | RED | EXPLOIT WEB-01
     ghost@kali:~$ <the command a real operator would type>
       WHAT    what the action does, in plain English
       WHY     why someone would do it
       RESULT  what happened in this game
       COST    noise and the ATT&CK technique        (Red)
       LIMIT   what the action does NOT do           (Blue)

   The commands are illustrations only. Nothing is executed,
   and attack steps are described rather than implemented
   (lines starting with "# (simulated)" are not real commands).
   ============================================================ */
window.GM = window.GM || {};

(function () {
  var E = GM.Explain = {};

  /* Print one explanation block into the terminal feed. */
  E.block = function (state, o) {
    var L = GM.State.log;
    L(state, o.title, 'head ' + o.side);
    if (o.cmd) L(state, o.prompt + ' ' + o.cmd, 'cmd');
    if (o.what) L(state, o.what, 'ex', 'WHAT');
    if (o.why) L(state, o.why, 'ex', 'WHY');
    (o.result || []).forEach(function (r, i) { L(state, r, 'res', i === 0 ? 'RESULT' : ' '); });
    if (o.cost) L(state, o.cost, 'cost', 'COST');
    if (o.limit) L(state, o.limit, 'limit', 'LIMIT');
  };

  /* ---------------- RED: one entry per kind of move ---------------- */
  var EXPLOIT = {
    'rtr-default': {
      cmd: function (n) { return 'telnet ' + n.ip + '      # login: admin   password: admin'; },
      what: 'Connects to the router\'s Telnet service and logs in with the username and password it left the factory with. No bug is used: as far as the router can tell, this is a normal login.',
      why: 'Default passwords are printed in the vendor manual, and this router was never reconfigured.' },
    'web-cms': {
      cmd: function (n) { return '# (simulated) send a specially crafted upload request to the old CMS plugin on http://' + n.ip + '/'; },
      what: 'The outdated plugin does not check what is uploaded to it. A crafted request makes the server run a command of the attacker\'s choosing, which hands over a shell as the web service account (www-data).',
      why: 'A public website must accept requests from anyone, so a known bug in unpatched software is reachable by the whole internet. It needs no password, but it is loud.' },
    'web-ssh': {
      cmd: function (n) { return '# (simulated) try 50 common passwords:   ssh deploy@' + n.ip; },
      what: 'Tries one likely password after another against the SSH login until one is accepted.',
      why: 'SSH here still allows password logins and the password is weak. Every wrong guess is written to auth.log, so this is the noisiest way in.' },
    'ws2-ssh': {
      cmd: function (n) { return '# (simulated) try 50 common passwords:   ssh admin@' + n.ip; },
      what: 'Tries one likely password after another against the SSH login until one is accepted.',
      why: 'SSH here still allows password logins and the password is weak. Every wrong guess is written to auth.log, so this is the noisiest way in.' },
    'ws1-phish': {
      cmd: function () { return '# (simulated) email j.doe@meshcorp.example  subject "Q4 bonus statement"  + attachment'; },
      what: 'Sends a convincing email with a booby-trapped attachment. When j.doe opens it, a program runs on the workstation as j.doe and connects back to you.',
      why: 'It skips the firewall completely, because the victim opens the door from the inside. It is quiet: there is nothing for a network sensor to see.' }
  };
  var ESCALATE = {
    sudo: {
      cmd: 'sudo -l',
      what: 'Asks the system "what am I allowed to run as root?". One entry is marked NOPASSWD and points at a program that can start other programs, so it can be used to open a root shell.',
      why: 'A normal user cannot read protected files. Root can read everything, including stored passwords.' },
    'ws1-key': {
      cmd: 'ls -l /opt/backup/      # admin_id_rsa is readable by everyone',
      what: 'Finds a forgotten copy of the administrator\'s SSH private key with loose file permissions. A private key IS a login: whoever holds the file can act as that administrator.',
      why: 'People copy keys into backups and forget them. No bug needed, only a file that should not be readable.' }
  };
  var CRED_USE = {
    'fs-key': {
      cmd: function (n) { return 'ssh -i admin_id_rsa backup@' + n.ip; },
      what: 'Logs in to the file server with the stolen private key (-i picks the key file). The server sees a correct key and lets you in.' },
    'db-creds': {
      cmd: function (n) { return 'mysql -h ' + n.ip + ' -u app -p      # password copied from the config file'; },
      what: 'Logs in to the database with the application\'s own username and password (-h host, -u user, -p ask for password), then reads the customer table.' }
  };

  E.red = function (state, a, res, noise) {
    var n = GM.NODES[a.target], w = a.weak ? GM.WEAKNESSES[a.weak] : null, o = {};
    switch (a.type) {
      case 'sweep':
        o.cmd = 'nmap -sn 10.0.0.0/24';
        o.what = 'Sends a small "are you there?" probe to every address in the range and lists the ones that answer. -sn means "find hosts only, do not scan their ports".';
        o.why = 'You cannot attack what you cannot see. This turns a blank network into a list of targets.';
        break;
      case 'portscan':
        o.cmd = 'nmap -p 22,23,80,443,445,3306 ' + n.ip;
        o.what = 'Knocks on the listed ports of one machine and reports which are open and which service answers on each. Every open port is a door.';
        o.why = 'The services tell you which weaknesses are worth trying: Telnet hints at default passwords, an old web app at a known bug.';
        break;
      case 'exploit':
        o.cmd = EXPLOIT[a.weak].cmd(n); o.what = EXPLOIT[a.weak].what; o.why = EXPLOIT[a.weak].why;
        break;
      case 'escalate': {
        var x = ESCALATE[a.weak] || ESCALATE.sudo;
        o.cmd = x.cmd; o.what = x.what; o.why = x.why;
        break;
      }
      case 'pivot':
        if (a.cred) {
          o.cmd = CRED_USE[a.cred].cmd(n); o.what = CRED_USE[a.cred].what;
          o.why = 'Stolen credentials need no exploit, so patching the target does not stop this. To the server it is a valid login.';
        } else {
          o.cmd = '# switch to the shell you already hold on ' + n.name;
          o.what = 'No new attack. You start working from a machine you already control.';
          o.why = 'Scans, exploits and stolen logins only reach the machines next to where you stand, so you move closer to the target.';
        }
        break;
      case 'wait':
        o.cmd = 'sleep 3600';
        o.what = 'Does nothing for a while. Alerts age out and analysts move on to other things, so the detection meter drops.';
        o.why = 'Patience is a real attacker tactic. The price: the AI will copy this pause, which hands the defender a free turn.';
        break;
    }
    var t = res.techs.filter(function (id, i) { return res.techs.indexOf(id) === i; }).map(function (id) { return id + ' ' + GM.TECH[id].name; }).join('  +  ');
    E.block(state, {
      side: 'red', prompt: 'ghost@kali:~$',
      title: 'TURN ' + state.red.turn + '  |  RED  |  ' + GM.Rules.describe(a).toUpperCase(),
      cmd: o.cmd, what: o.what, why: o.why, result: res.lines,
      cost: (noise >= 0 ? '+' : '') + noise + ' detection' + (t ? '   |   ATT&CK: ' + t : '')
    });
  };

  /* ---------------- BLUE ---------------- */
  var PATCH_CMD = {
    'rtr-default': 'passwd admin      # then turn Telnet off and manage the router over SSH',
    'web-cms':     'sudo apt update && sudo apt install --only-upgrade cms-gallery-plugin',
    'web-ssh':     '# in /etc/ssh/sshd_config set:  PasswordAuthentication no     then:  sudo systemctl restart ssh',
    'ws2-ssh':     '# in /etc/ssh/sshd_config set:  PasswordAuthentication no     then:  sudo systemctl restart ssh',
    'ws1-phish':   '# policy change: block macro attachments at the mail gateway, run phishing training',
    'web-sudo':    'sudo visudo      # delete the NOPASSWD line for www-data',
    'ws2-sudo':    'sudo visudo      # delete the rule that lets every user run an editor as root',
    'ws1-key':     'rm /opt/backup/admin_id_rsa && chmod 600 ~/.ssh/id_rsa',
    'fs-sudo':     'sudo chown root:root /opt/scripts/db_backup.sh && sudo chmod 755 /opt/scripts/db_backup.sh'
  };
  var ROTATE_CMD = {
    'fs-key':   'ssh-keygen -t ed25519 -f new_backup_key      # then delete the old key from ~/.ssh/authorized_keys',
    'db-creds': "ALTER USER 'app'@'%' IDENTIFIED BY '<new password>';      -- then update the app's config"
  };

  E.scout = function (state, n) {
    E.block(state, { side: 'blue', prompt: 'scout@soc:~$',
      title: 'TURN ' + state.blue.turn + '  |  SCOUT  |  SCAN LOGS ON ' + n.name,
      cmd: 'grep "Failed password" /var/log/auth.log      # ...then the rest of this machine\'s logs',
      what: 'Reads the logs on ' + n.name + ' looking for traces attackers leave behind, and checks whether the machine is compromised right now.',
      why: 'You cannot see the attacker directly. Logs are the evidence, and one Scout scan covers one machine, so choose where to look (the IDS hints help).' });
  };
  E.analyst = function (state, e) {
    E.block(state, { side: 'blue', prompt: 'analyst@soc:~$',
      title: 'TURN ' + state.blue.turn + '  |  ANALYST  |  IDENTIFY ANOMALY ON ' + GM.NODES[e.node].name,
      cmd: '# compare the evidence with the MITRE ATT&CK knowledge base',
      what: 'Matches the anomaly ("' + GM.Logs.anomaly[e.tech] + '") to a known attacker technique.',
      why: 'A name gives you the root cause and the standard fix. It also lets the Analyst forecast what an attacker who did this will try next.' });
  };
  E.guard = function (state, kind, key, node, text) {
    var n = GM.NODES[node], o = { side: 'green', prompt: 'guard@soc:~$', result: [text] };
    o.title = 'TURN ' + state.blue.turn + '  |  GUARD  |  ' + kind.toUpperCase() + ' ' + n.name;
    if (kind === 'patch') {
      var w = GM.WEAKNESSES[key];
      o.cmd = PATCH_CMD[key];
      o.what = 'Removes the weakness itself: ' + w.label + '.';
      o.why = 'With the weakness gone, technique ' + w.tech + ' (' + GM.TECH[w.tech].name + ') no longer works on ' + n.name + '.';
      o.limit = 'A patch closes the door. It does not remove an attacker who is already inside.';
    } else if (kind === 'firewall') {
      var port = key.split(':')[1];
      o.cmd = 'sudo ufw deny ' + port + '/tcp';
      o.what = 'Tells ' + n.name + ' to drop every incoming connection on port ' + port + ', so the service behind it cannot be reached at all.';
      o.why = 'Every attack that rides on that service is cut off, including ones you have not identified yet.';
      o.limit = 'Ports the business depends on (marked critical) cannot be closed; those weaknesses have to be patched.';
    } else if (kind === 'rotate') {
      o.cmd = ROTATE_CMD[key];
      o.what = 'Replaces the secret with a new one. Every stolen copy of the old one stops working.';
      o.why = 'Stolen credentials need no exploit, so patching does nothing against them. Changing the secret does.';
      o.limit = 'If the attacker is still admin on a machine where the new secret is stored, they simply read it again. Evict first, then rotate.';
    } else if (kind === 'isolate') {
      o.cmd = 'sudo ip link set eth0 down      # or shut the switch port';
      o.what = 'Unplugs ' + n.name + ' from the network. Any attacker session on it dies, and nothing can travel through it.';
      o.why = 'It is the only action that throws an attacker OUT of a machine.';
      o.limit = 'The business loses this machine: it costs score, and you may only do it twice.';
    } else if (kind === 'tripwire') {
      o.cmd = 'sudo auditctl -w /srv/share/passwords_2026.xlsx -p r -k canary';
      o.what = 'Plants a bait file nobody has a reason to open and watches it (-w watch this path, -p r on read, -k tag the alert "canary").';
      o.why = 'Any touch means an intruder. You get an instant alert and the machine\'s true status without spending a Scout scan.';
      o.limit = 'A tripwire stops nothing. It only tells you.';
    }
    E.block(state, o);
  };

  /* One-line explanations of what the defender is told after the AI moves. */
  E.blocked = {
    patch:    'The weakness it relied on no longer exists, so the same attack simply fails. It lost a turn.',
    firewall: 'The port it needed is closed, so its connection was dropped before reaching the service. It lost a turn.',
    isolate:  'The machine is unplugged, so there is nothing there to attack or move through. It lost a turn.',
    rotate:   'The password or key it stole is no longer valid, so its login was refused. It lost a turn.'
  };
  E.idsLoud = 'IDS = intrusion detection system. It noticed loud traffic but can only say roughly where. Send the Scout to a machine in that zone.';
  E.idsQuiet = 'Quiet does not mean safe: phishing, reading a file or moving between shells make no noise on the network.';
  E.stalled = 'The attacker knows of no route to the database. One more turn like this and it gives up.';
})();
