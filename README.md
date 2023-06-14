# Discord Workflow Status Action

Notify Discord of workflow statuses 🤖

## Inputs

 Input Name | Description | Required |
| --- | --- | --- |
| `github-token` | GitHub Token[*](#note) | ✅ |
| `discord-webhook` | Discord Webhook URL | ✅ |
| `username` | Overrides the current username of the webhook | |
| `avatar-url` | Overrides the current avatar of the webhook | |

> <a name="note"></a> The GitHub token is required because this action reads the current workflow's jobs.
See [`octokit.actions.listJobsForWorkflowRun`](https://octokit.github.io/rest.js/v19#actions-list-jobs-for-workflow-run) for more information.

## Example

```yaml
name: Build and Test
on: [ pull_request ]

jobs:
  build:
    name: Build the Code
    steps:
      - run: make all
  notify:
    name: Notify Discord
    runs-on: ubuntu-latest
    if: ${{ always() }} # You always want to be notified: success, failure, or cancelled
    needs:
      - build
    steps:
      - name: Notify
        uses: jmg-duarte/workflow-notify-discord@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          discord-webhook: ${{ secrets.DISCORD_WEBHOOK }}
```
