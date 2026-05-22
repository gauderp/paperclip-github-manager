# @cus/github-manager

Paperclip connector plugin for GitHub — repository listing, PR/issue sync, and webhook registration.

## Features

- List repositories for the authenticated user
- Sync open pull requests and issues (manual actions + scheduled job)
- Register GitHub webhooks pointing at the Paperclip host inbound URL
- Dashboard health widget and full **GitHub** page in the host UI

## Requirements

- Paperclip instance with plugin runtime
- Company secret `github_token` (GitHub PAT or fine-grained token)
- For webhook registration: token scope `admin:repo_hook` on target repos

## Repository

Source: [felipeespitalher/github-manager](https://github.com/felipeespitalher/github-manager)

## Local development

```bash
npm install
npm run dev
paperclipai plugin install /absolute/path/to/plugins/github-manager
```

## Production install (npm)

After the package is published:

```bash
paperclipai plugin install @cus/github-manager
```

Configure `github_token` in company secrets, then open the **GitHub** page in Paperclip.

## Build

```bash
npm run typecheck
npm test
npm run build
```

`prepublishOnly` runs build automatically before `npm publish`.

## Manifest

- Plugin id: `cus.github-manager`
- Webhook endpoint: `github-events`
- Scheduled job: `sync-github` (every 6 hours)
