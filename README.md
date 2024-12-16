Batch Email Validation API

Validate multiple email addresses for syntax, domain validity, and optional SMTP mailbox existence.
Overview
The Batch Email Validation API allows developers to validate email addresses quickly and efficiently. It checks for:

Syntax Validation: Ensures the email format is correct.
Domain Validation: Confirms the domain has MX records configured to receive emails.
Optional SMTP Mailbox Verification: (Advanced) Checks mailbox existence by communicating with the email server.
Features
Batch Validation: Verify up to 1,000 email addresses in a single request.
Single Email Validation: Validate one email address at a time.
Fast and Scalable: Optimized for performance.
Optional SMTP Check: Skip deeper SMTP-level checks if faster validation is required.
Endpoints
1. Single Email Validation
URL: POST /verify
Description: Validates a single email for syntax, domain, and (optional) SMTP mailbox existence.
Request Example
json
Copy code
POST /verify
Headers:
- Content-Type: application/json
- X-RapidAPI-Key: YOUR_RAPIDAPI_KEY
- X-RapidAPI-Host: your-api-host

Body:
{
  "email": "test@example.com",
  "skip_smtp": false
}
Response Example
json
Copy code
{
  "status": "valid",
  "reason": "Mailbox exists (SMTP check passed)"
}
2. Batch Email Validation
URL: POST /verify/batch
Description: Validates up to 1,000 email addresses in a single request.
Request Example
json
Copy code
POST /verify/batch
Headers:
- Content-Type: application/json
- X-RapidAPI-Key: YOUR_RAPIDAPI_KEY
- X-RapidAPI-Host: your-api-host

Body:
{
  "emails": ["valid1@example.com", "valid2@example.com", "invalid@example.com"],
  "skip_smtp": false
}
Response Example
json
Copy code
{
  "summary": {
    "total": 3,
    "valid": 2,
    "invalid": 1,
    "unknown": 0
  },
  "results": [
    {
      "email": "valid1@example.com",
      "status": "valid",
      "reason": "Mailbox exists (SMTP check passed)"
    },
    {
      "email": "valid2@example.com",
      "status": "valid",
      "reason": "Mailbox exists (SMTP check passed)"
    },
    {
      "email": "invalid@example.com",
      "status": "invalid",
      "reason": "No MX records found for domain."
    }
  ]
}
Installation
To use this API locally or for testing, follow these steps:

Clone the Repository:

bash
Copy code
git clone https://github.com/yourusername/email-validation-api.git
cd email-validation-api
Install Dependencies: Ensure you have Node.js installed. Run:

bash
Copy code
npm install
Set Up Environment Variables: Create a .env file in the root directory:

env
Copy code
PORT=3000
API_KEY=YOUR_RAPIDAPI_KEY
Run the Server: Start the API server:

bash
Copy code
npm start
Test the Endpoints: Use tools like Postman, curl, or any HTTP client.

Usage Example (Node.js Axios)
Here’s how to call the API using Axios in Node.js:

javascript
Copy code
const axios = require('axios');

const options = {
  method: 'POST',
  url: 'https://your-api-host/verify/batch',
  headers: {
    'Content-Type': 'application/json',
    'X-RapidAPI-Key': 'YOUR_RAPIDAPI_KEY',
    'X-RapidAPI-Host': 'your-api-host'
  },
  data: {
    emails: ["test1@example.com", "test2@example.com"],
    skip_smtp: false
  }
};

axios.request(options)
  .then(response => console.log(response.data))
  .catch(error => console.error(error));
Error Codes
Status Code	Description
200 OK	Successful validation request.
400 Bad Request	Missing or invalid input.
500 Server Error	Internal server error occurred.
Example 400 Response:

json
Copy code
{
  "error": "Please provide an array of emails."
}
Rate Limiting
Free Tier: 5,000 requests/month
Paid Plans: Scale up to 500,000 requests/month with overage support.
Contributing
We welcome contributions!

Fork the repository.
Create a new branch (feature/your-feature-name).
Submit a pull request.
Support
For questions or issues, please create a GitHub issue or contact support at:
Email: ewag57dev@gmail.com

License
This project is licensed under the MIT License.
