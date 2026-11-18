/* ============================================================
   data-logs.js — SIMULATED LOG EVIDENCE
   ------------------------------------------------------------
   Every attacker action leaves traces. This file turns an
   ATT&CK technique into (a) a plain-English anomaly, which is
   what the Scout reports, and (b) realistic-looking log lines,
   which is the evidence the player reads.

   The line formats imitate real Linux logs (sshd in auth.log,
   Apache access.log, sudo, MySQL) so they will look familiar
   when you meet the real thing.
   ============================================================ */
window.GM = window.GM || {};

GM.Logs = {
  /* What the Scout says it found, BEFORE the Analyst names it. */
  anomaly: {
    'T1018':     'One source pinged every address on the subnet',
    'T1046':     'Rapid connection attempts across many ports',
    'T1190':     'Web server process spawned a shell',
    'T1078.001': 'Admin login over Telnet from an unusual address',
    'T1566.001': 'Office app spawned a shell after an email attachment',
    'T1110.001': '50 failed SSH logins, then one success',
    'T1548.003': 'Low-privilege account suddenly running as root via sudo',
    'T1552.004': 'World-readable private key file was read',
    'T1552.001': 'Config file holding a password was read from a shell',
    'T1021.004': 'First-ever SSH key login from this internal host',
    'T1078':     'Database login from a new host, then a bulk SELECT'
  },

  /* Build the evidence lines for one event.
     ev = { tech, node, src, turn }  (src = attacker's IP at the time) */
  lines: function (ev) {
    var n = GM.NODES[ev.node];
    var t = 'Nov 16 03:' + String(10 + (ev.turn || 0)).padStart(2, '0') + ':07';
    var host = n.name.toLowerCase();
    var s = ev.src;
    switch (ev.tech) {
      case 'T1018': return [
        t + ' ' + host + ' ids: ICMP echo sweep: ' + s + ' probed 254 addresses in 3s'];
      case 'T1046': return [
        t + ' ' + host + ' kernel: [UFW AUDIT] SRC=' + s + ' DST=' + n.ip + ' PROTO=TCP DPT=22 SYN',
        t + ' ' + host + ' kernel: [UFW AUDIT] SRC=' + s + ' DST=' + n.ip + ' PROTO=TCP DPT=80 SYN',
        t + ' ' + host + ' ids: port scan: ' + s + ' -> ' + n.ip + ' (1000 ports in 4s)'];
      case 'T1190': return [
        s + ' - - [16/Nov/2026:03:' + String(10 + (ev.turn || 0)).padStart(2, '0') + ':07 +0000] "POST /cms/plugins/upload.php HTTP/1.1" 200 41',
        t + ' ' + host + ' audit: apache2 (www-data) started /bin/sh   <-- a web server should never start a shell'];
      case 'T1078.001': return [
        t + ' ' + host + ' telnetd[311]: connect from ' + s,
        t + ' ' + host + ' login[312]: LOGIN ON pts/0 BY admin FROM ' + s + '   <-- factory-default account'];
      case 'T1566.001': return [
        t + ' ' + host + ' postfix/smtpd: from=<it-helpdesk@meshc0rp-support.example> to=<j.doe@meshcorp.example> attachment=Q4_bonus.docm',
        t + ' ' + host + ' audit: soffice.bin (j.doe) started /bin/sh   <-- an office app should never start a shell'];
      case 'T1110.001': return [
        t + ' ' + host + ' sshd[2211]: Failed password for admin from ' + s + ' port 51122 ssh2',
        t + ' ' + host + ' sshd[2211]: message repeated 49 times: [ Failed password for admin from ' + s + ' ]',
        t + ' ' + host + ' sshd[2260]: Accepted password for admin from ' + s + ' port 51171 ssh2'];
      case 'T1548.003': return [
        t + ' ' + host + ' sudo: svc-account : TTY=unknown ; PWD=/tmp ; USER=root ; COMMAND=(program allowed by sudoers)',
        t + ' ' + host + ' audit: root shell whose parent is a non-interactive service account'];
      case 'T1552.004': return [
        t + ' ' + host + ' audit: READ /opt/backup/admin_id_rsa (mode 0644: private key readable by everyone)'];
      case 'T1552.001': return [
        t + ' ' + host + ' audit: READ ' + (ev.node === 'WEB' ? '/var/www/cms/config.php' : '/opt/scripts/db_backup.sh') + ' (contains DB_PASSWORD in plain text)'];
      case 'T1021.004': return [
        t + ' ' + host + ' sshd[901]: Accepted publickey for backup from ' + s + ' port 40022 ssh2: RSA SHA256:Zk3...',
        t + ' ' + host + ' audit: first SSH login ever recorded from ' + s];
      case 'T1078': return [
        t + ' ' + host + " mysqld: Access granted for user 'app'@'" + s + "'",
        t + ' ' + host + ' mysqld: SELECT * FROM customers -- 48112 rows sent to ' + s];
      default: return [t + ' ' + host + ' (no log sample)'];
    }
  }
};
