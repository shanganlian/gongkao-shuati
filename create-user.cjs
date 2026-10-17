const https = require('https');

const data = JSON.stringify({
  email: 'test@xingan.com',
  password: 'test123',
  email_confirm: true,
  user_metadata: {}
});

const options = {
  hostname: 'axcezfmqjotwcgqnaqro.supabase.co',
  path: '/auth/v1/admin/users',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4Y2V6Zm1xam90d2NncW5hcXJvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTcwNzIwNywiZXhwIjoyMTA3MjgzMjA3fQ.Cx19elFzmrMyGkAKkuaKdgXnTh9mxMd2olaSqKkRbl0',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4Y2V6Zm1xam90d2NncW5hcXJvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTcwNzIwNywiZXhwIjoyMTA3MjgzMjA3fQ.Cx19elFzmrMyGkAKkuaKdgXnTh9mxMd2olaSqKkRbl0',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log(res.statusCode, body));
});
req.on('error', e => console.error(e));
req.write(data);
req.end();
