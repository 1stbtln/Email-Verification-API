const express = require('express');
const { validate: validateEmail } = require('email-validator');
const dns = require('dns').promises;
const net = require('net');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json());
app.use(helmet()); 

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

const knownHardDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com'];

app.use((req, res, next) => {
  const apiKey = req.headers['x-rapidapi-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing RapidAPI key.' });
  }

  console.log(`Request received with API key: ${apiKey}`); 
  next();
});

async function verifyMailbox(mxHost, fromEmail, toEmail) {
  return new Promise((resolve) => {
    let result = { valid: false, reason: 'Unknown error during SMTP check' };
    const socket = net.createConnection(25, mxHost);
    let step = 0;
    let buffer = '';

    socket.setTimeout(5000, () => {
      result = { valid: false, reason: 'SMTP connection timed out' };
      socket.destroy();
    });

    socket.on('data', (data) => {
      buffer += data.toString();
      if (buffer.endsWith('\r\n')) {
        const responseLines = buffer.split('\r\n').filter((line) => line);
        const lastLine = responseLines[responseLines.length - 1];
        const code = parseInt(lastLine.substring(0, 3), 10);

        switch (step) {
          case 0: 
            if (code === 220) {
              socket.write('HELO example.com\r\n');
              step++;
              buffer = '';
            } else {
              result = { valid: false, reason: `Unexpected SMTP response: ${lastLine}` };
              socket.write('QUIT\r\n');
              step = 99;
            }
            break;
          case 1:
            if (code === 250) {
              socket.write(`MAIL FROM:<${fromEmail}>\r\n`);
              step++;
              buffer = '';
            } else {
              result = { valid: false, reason: `HELO not accepted: ${lastLine}` };
              socket.write('QUIT\r\n');
              step = 99;
            }
            break;
          case 2: 
            if (code === 250) {
              socket.write(`RCPT TO:<${toEmail}>\r\n`);
              step++;
              buffer = '';
            } else {
              result = { valid: false, reason: `MAIL FROM not accepted: ${lastLine}` };
              socket.write('QUIT\r\n');
              step = 99;
            }
            break;
          case 3: 
            if (code === 250) {
              result = { valid: true, reason: 'Mailbox exists (SMTP check passed)' };
            } else {
              result = { valid: false, reason: `Mailbox not found (SMTP ${code})` };
            }
            socket.write('QUIT\r\n');
            step++;
            break;
          case 4: 
            socket.end();
            break;
        }
      }
    });

    socket.on('error', (err) => {
      result = { valid: false, reason: `SMTP connection error: ${err.message}` };
      socket.destroy();
    });

    socket.on('close', () => {
      resolve(result);
    });
  });
}

async function verifyEmail(email, skip_smtp = false) {
  if (!email) {
    return { status: 'invalid', reason: 'No email provided.' };
  }

  if (!validateEmail(email)) {
    return { status: 'invalid', reason: 'Invalid email syntax.' };
  }

  const domain = email.split('@')[1];

  let mxRecords;
  try {
    mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return { status: 'invalid', reason: 'No MX records found for domain.' };
    }
    mxRecords.sort((a, b) => a.priority - b.priority);
  } catch (err) {
    return { status: 'invalid', reason: 'Domain not found or no valid DNS records.' };
  }

  if (skip_smtp) {
    return {
      status: 'unknown',
      reason: 'SMTP verification skipped. Domain can receive emails, but mailbox not verified.',
    };
  }

  const mxHost = mxRecords[0].exchange;
  const smtpResult = await verifyMailbox(mxHost, 'test@example.com', email);

  return smtpResult.valid
    ? { status: 'valid', reason: smtpResult.reason }
    : { status: 'invalid', reason: smtpResult.reason };
}

app.post('/verify', async (req, res) => {
  const { email, skip_smtp } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Invalid email input.' });
  }

  try {
    const result = await verifyEmail(email, skip_smtp);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.', details: err.message });
  }
});

app.post('/verify/batch', async (req, res) => {
  const { emails, skip_smtp } = req.body;

  if (!emails || !Array.isArray(emails)) {
    return res.status(400).json({ error: 'Please provide an array of emails.' });
  }

  if (emails.length > 1000) {
    return res.status(400).json({ error: 'Batch size limit exceeded (max 1000).' });
  }

  try {
    const results = [];
    let validCount = 0;
    let invalidCount = 0;

    for (const email of emails) {
      const result = await verifyEmail(email, skip_smtp);
      results.push({ email, ...result });

      if (result.status === 'valid') validCount++;
      if (result.status === 'invalid') invalidCount++;
    }

    return res.json({ summary: { total: emails.length, valid: validCount, invalid: invalidCount }, results });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.', details: err.message });
  }
});

app.use((req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Email Verification API running on port ${PORT}`));
