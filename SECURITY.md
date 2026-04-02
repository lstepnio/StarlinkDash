# Security Policy

## Supported Scope

The current supported deployment model is the latest `main` branch and the latest published container image.

## Reporting a Vulnerability

Please do not open a public issue for a suspected secret leak or security vulnerability.

Instead:

1. Describe the issue privately to the maintainer through the repository security reporting flow if enabled.
2. Include impact, reproduction steps, and any affected configuration.
3. Avoid posting credentials, tokens, or sensitive logs.

## Operational Security Notes

- Treat SNMP community strings and API tokens as secrets.
- Prefer secret stores or runtime environment injection over hardcoding values.
- Rotate any credential that has been pasted into chat, screenshots, shell history, or commits.
- Do not expose the dashboard publicly without authentication or network restrictions unless you have explicitly accepted that risk.

