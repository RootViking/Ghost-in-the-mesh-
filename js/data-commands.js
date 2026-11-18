/* ============================================================
   data-commands.js — THE TYPED COMMANDS (terminal mini-game)
   ------------------------------------------------------------
   Three real commands the player types: nmap, grep and ufw.
   Nothing is executed. Each entry only knows how to:

     task(ctx)      describe the job in plain English
     parts(ctx)     give a reference command split into parts,
                    each with a hover explanation
     validate(s,ctx) decide if what was typed is a reasonable
                    way to do the job -> { ok, msg }
     output(ctx)    print a believable result

   The validators accept sensible variations (sudo, extra
   flags, different quoting) and reject mistakes with a
   message that teaches why it would not work for real.
   ============================================================ */
window.GM = window.GM || {};

(function () {
  /* Collapse repeated spaces and trim, so "nmap   -p 22" is fine. */
  function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }

  GM.COMMANDS = {

    /* ---------- nmap: Red's port scan ------------------------- */
    nmap: {
      prompt: 'ghost@kali:~$', side: 'red',
      title: 'PORT SCAN',
      task: function (c) { return 'Scan ' + c.name + ' at ' + c.ip + ' for open ports. Check at least ports 22 and 80.'; },
      parts: function (c) {
        return [
          { t: 'nmap', d: 'Network Mapper: the standard tool for finding hosts and open ports.' },
          { t: '-p 22,23,80', d: '-p picks which ports to probe. A list (22,23,80), a range (1-1024), or -p- for all 65535. Fewer ports is quicker and quieter.' },
          { t: c.ip, d: 'The target. One IP address here; a range such as 10.0.0.0/24 would scan the whole subnet.' }
        ];
      },
      validate: function (raw, c) {
        var tok = norm(raw).split(' ');
        if (tok[0] === 'sudo') tok.shift();
        if (tok[0] !== 'nmap') return { ok: false, msg: 'Start with the tool name: nmap' };
        var sawTarget = false;
        for (var i = 1; i < tok.length; i++) {
          var k = tok[i];
          if (k === c.ip) { sawTarget = true; continue; }
          if (/^\d+\.\d+\.\d+\.\d+(\/\d+)?$/.test(k)) return { ok: false, msg: 'Wrong target. ' + c.name + ' is at ' + c.ip + '.' };
          if (k === '-sn') return { ok: false, msg: '-sn means "ping sweep only, skip the port scan". Drop it to see ports.' };
          if (k === '-p') {                      // "-p 22,80": port list is the next word
            if (!/^[\d,\-]+$/.test(tok[i + 1] || '')) return { ok: false, msg: '-p needs a port list after it, e.g. -p 22,80' };
            i++; continue;
          }
          if (/^-p[\d,\-]+$/.test(k)) continue;  // "-p22,80" or "-p-"
          if (/^-(sS|sT|sV|sC|Pn|n|v|vv|A|F|O|T[0-5]|-open)$/.test(k)) continue;  // common harmless flags
          return { ok: false, msg: 'nmap does not need "' + k + '" here. Try: nmap -p 22,80 ' + c.ip };
        }
        if (!sawTarget) return { ok: false, msg: 'No target given. Add the IP address: ' + c.ip };
        return { ok: true };
      },
      output: function (c) {
        var out = ['Starting Nmap ( simulated ) ...', 'Nmap scan report for ' + c.ip, 'PORT      STATE  SERVICE'];
        c.services.forEach(function (s) {
          out.push((s.port + '/tcp').padEnd(10) + 'open   ' + s.name);
        });
        out.push('Nmap done: 1 IP address (1 host up)');
        return out;
      }
    },

    /* ---------- grep: Blue Scout's log search ----------------- */
    grep: {
      prompt: 'scout@soc:~$', side: 'blue',
      title: 'LOG HUNT',
      task: function (c) { return 'Open the hunt on ' + c.name + ': search auth.log for failed SSH logins.'; },
      parts: function () {
        return [
          { t: 'grep', d: 'Prints every line of a file that contains a pattern. The defender\'s most used tool.' },
          { t: '"Failed password"', d: 'The pattern. sshd writes this exact text for every wrong password. Quotes are required because of the space; without them grep would treat "password" as a file name.' },
          { t: 'auth.log', d: 'The file to search. On Debian/Ubuntu logins are recorded in /var/log/auth.log (on Red Hat it is /var/log/secure).' }
        ];
      },
      validate: function (raw) {
        var s = norm(raw).replace(/[“”]/g, '"').replace(/[‘’]/g, "'"); // tidy "smart quotes"
        var m = s.match(/^(?:sudo )?grep ((?:-[a-zA-Z]+ )*)(["'])(.+?)\2 (\S+)$/);        // grep [flags] "pat" file
        var flags, pat, file;
        if (m) { flags = m[1]; pat = m[3]; file = m[4]; }
        else {
          m = s.match(/^(?:sudo )?cat (\S+) ?\| ?grep ((?:-[a-zA-Z]+ )*)(["'])(.+?)\3$/); // cat file | grep "pat"
          if (m) { file = m[1]; flags = m[2]; pat = m[4]; }
        }
        if (!m) {
          if (/^(sudo )?grep /.test(s) && !/["']/.test(s) && /failed password/i.test(s))
            return { ok: false, msg: 'Quote the pattern. Without quotes grep searches for "Failed" in a file called "password".' };
          if (!/grep/.test(s)) return { ok: false, msg: 'Use grep: grep "pattern" file' };
          return { ok: false, msg: 'Shape is: grep "pattern" file   e.g. grep "Failed password" auth.log' };
        }
        var insensitive = /i/.test(flags);
        if (!/^failed( password)?$/i.test(pat))
          return { ok: false, msg: 'Search for the text sshd writes on a wrong password: "Failed password"' };
        if (!insensitive && !/^Failed( password)?$/.test(pat))
          return { ok: false, msg: 'grep is case-sensitive. The log says "Failed password" (capital F), or add -i to ignore case.' };
        if (!/^(\/var\/log\/)?(auth\.log(\.1)?|secure)$/.test(file))
          return { ok: false, msg: 'SSH logins are recorded in auth.log (full path /var/log/auth.log).' };
        return { ok: true };
      },
      output: function (c) { return c.outLines; }
    },

    /* ---------- ufw: Blue Guard's firewall rule --------------- */
    ufw: {
      prompt: 'guard@soc:~$', side: 'blue',
      title: 'FIREWALL RULE',
      task: function (c) { return 'Block incoming ' + c.service + ' (port ' + c.port + ') on ' + c.name + '.'; },
      parts: function (c) {
        return [
          { t: 'ufw', d: 'Uncomplicated Firewall: a friendly front end to the Linux packet filter. Changing rules needs root, so real use is "sudo ufw ...".' },
          { t: 'deny', d: 'Silently drop matching traffic. "reject" also blocks but tells the sender; "allow" does the opposite.' },
          { t: String(c.port), d: 'The port number to block. Add /tcp to block only TCP, e.g. ' + c.port + '/tcp.' }
        ];
      },
      validate: function (raw, c) {
        var s = norm(raw).toLowerCase();
        if (/^(sudo )?ufw allow/.test(s)) return { ok: false, msg: '"allow" opens the port. You want deny.' };
        var m = s.match(/^(?:sudo )?ufw (?:deny|reject) (?:in )?(\d+)(?:\/(tcp|udp))?$/) ||
                s.match(/^(?:sudo )?ufw (?:deny|reject) (?:in )?(?:proto (tcp|udp) )?(?:from any )?to any port (\d+)(?: proto (tcp|udp))?$/);
        if (!m) return { ok: false, msg: 'Shape is: ufw deny <port>   e.g. ufw deny ' + c.port };
        // The two patterns put the port in different capture groups; find it either way.
        var port = /^\d+$/.test(m[1] || '') ? m[1] : m[2];
        if (s.indexOf('udp') !== -1) return { ok: false, msg: c.service + ' uses TCP, so a UDP rule would block nothing.' };
        if (String(port) !== String(c.port)) return { ok: false, msg: 'Wrong port. ' + c.service + ' listens on ' + c.port + '.' };
        return { ok: true };
      },
      output: function (c) { return ['Rule added', 'Rule added (v6)', 'Port ' + c.port + ' on ' + c.name + ' now drops incoming connections.']; }
    }
  };
})();
