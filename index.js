const express = require('express');
const { validate: validateEmail } = require('email-validator');
const dns = require('dns').promises;
const net = require('net');

const app = express();
app.use(express.json());

// Known hard-to-verify domains
const knownHardDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com'];

/**
 * Attempt SMTP-level verification of a mailbox.
 * This is only called if skip_smtp is false.
 */
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
            // Expecting 220
            if (code === 220) {
              socket.write('HELO example.com\r\n');
              step++;
              buffer = '';
            } else {
              result = { valid: false, reason: `Unexpected SMTP response: ${lastLine}` };
              socket.write('QUIT\r\n');
              step = 99;
              buffer = '';
            }
            break;
          case 1:
            // After HELO, expecting 250
            if (code === 250) {
              socket.write(`MAIL FROM:<${fromEmail}>\r\n`);
              step++;
              buffer = '';
            } else {
              result = { valid: false, reason: `HELO not accepted: ${lastLine}` };
              socket.write('QUIT\r\n');
              step = 99;
              buffer = '';
            }
            break;
          case 2:
            // After MAIL FROM, expecting 250
            if (code === 250) {
              socket.write(`RCPT TO:<${toEmail}>\r\n`);
              step++;
              buffer = '';
            } else {
              result = { valid: false, reason: `MAIL FROM not accepted: ${lastLine}` };
              socket.write('QUIT\r\n');
              step = 99;
              buffer = '';
            }
            break;
          case 3:
            // RCPT TO response
            if (code === 250) {
              result = { valid: true, reason: 'Mailbox exists (SMTP check passed)' };
            } else {
              result = { valid: false, reason: `Mailbox not found (SMTP ${code})` };
            }
            socket.write('QUIT\r\n');
            step++;
            buffer = '';
            break;
          case 4:
            // After QUIT, expecting 221
            if (code === 221) {
              socket.end();
            }
            break;
          default:
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

/**
 * Reusable function to verify a single email.
 * Returns an object: {status: 'valid'|'invalid'|'unknown', reason: string}
 */
async function verifyEmail(email, skip_smtp = false) {
  if (!email) {
    return { status: 'invalid', reason: 'No email provided.' };
  }

  // Syntax check
  if (!validateEmail(email)) {
    return { status: 'invalid', reason: 'Invalid email syntax.' };
  }

  const domain = email.split('@')[1];

  // MX record check
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

  // If skip_smtp is true, skip the mailbox-level check
  if (skip_smtp === true) {
    if (knownHardDomains.includes(domain)) {
      return {
        status: 'unknown',
        reason: `The domain (${domain}) can receive emails (MX records are valid), but individual mailbox verification was skipped.`
      };
    } else {
      return {
        status: 'unknown',
        reason: 'SMTP verification skipped. Domain is configured to receive email, but mailbox validation not performed.'
      };
    }
  }

  // If skip_smtp is not true, attempt SMTP verification
  const mxHost = mxRecords[0].exchange;
  const fromEmail = 'test@example.com'; // domain you control for best results
  let smtpResult;
  try {
    smtpResult = await verifyMailbox(mxHost, fromEmail, email);
  } catch (err) {
    smtpResult = { valid: false, reason: `SMTP attempt failed: ${err.message}` };
  }

  // Interpret the results
  if (smtpResult.valid === true) {
    // Mailbox confirmed
    return { status: 'valid', reason: smtpResult.reason };
  } else {
    if (knownHardDomains.includes(domain)) {
      // Hard domain: domain valid but mailbox can't be confirmed
      return {
        status: 'unknown',
        reason: `The domain (${domain}) is set up to receive emails (MX records are valid), but the server does not confirm individual mailboxes.`
      };
    } else {
      // Non-hard domain with failed SMTP check => invalid mailbox
      return {
        status: 'invalid',
        reason: smtpResult.reason
      };
    }
  }
}

// Single email verification endpoint (unchanged logic, just refactored)
app.post('/verify', async (req, res) => {
  const { email, skip_smtp } = req.body;
  const result = await verifyEmail(email, skip_smtp);
  return res.json(result);
});

/**
 * Batch endpoint:
 * POST /verify/batch
 * {
 *   "emails": ["user1@example.com", "user2@gmail.com"],
 *   "skip_smtp": true
 * }
 *
 * Returns:
 * {
 *   "summary": {
 *       "total": <number>,
 *       "valid": <number>,
 *       "invalid": <number>,
 *       "unknown": <number>
 *   },
 *   "results": [
 *       {"email": "...", "status": "...", "reason": "..."},
 *       ...
 *   ]
 * }
 */
app.post('/verify/batch', async (req, res) => {
  const { emails, skip_smtp } = req.body;

  if (!emails || !Array.isArray(emails)) {
    return res.status(400).json({ error: 'Please provide an array of emails.' });
  }

  // Optional: limit batch size to prevent server overload
  if (emails.length > 1000) {
    return res.status(400).json({ error: 'Batch size limit exceeded (max 1000).' });
  }

  const results = [];
  let validCount = 0;
  let invalidCount = 0;
  let unknownCount = 0;

  // Process each email
  for (const email of emails) {
    const result = await verifyEmail(email, skip_smtp);
    results.push({ email, ...result });

    // Tally counts
    if (result.status === 'valid') validCount++;
    else if (result.status === 'invalid') invalidCount++;
    else if (result.status === 'unknown') unknownCount++;
  }

  const summary = {
    total: emails.length,
    valid: validCount,
    invalid: invalidCount,
    unknown: unknownCount
  };

  return res.json({ summary, results });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Email Verification API is running on port ${PORT}`);
});