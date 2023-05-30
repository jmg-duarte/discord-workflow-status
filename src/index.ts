import * as https from "https"

import * as core from '@actions/core'
import * as GitHub from '@actions/github'

type JobData = {
  name: string
  status: string | null
  url: string
}

const { GITHUB_RUN_ID, GITHUB_WORKFLOW } = process.env

function workflowStatusFromJobs(jobs: JobData[]): 'Success' | 'Failure' | 'Cancelled' {
  for (let job of jobs) {
    if (job.status === "cancelled") {
      return "Cancelled"
    } else if (job.status === "failure") {
      return "Failure"
    }
  }
  return "Success"
}

// FIXME: the payload type is wrong, it should be something like WebhookWithEmbed
function notify(webhook: string, payload: object) {
  const request = https.request(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  })
  request.write(JSON.stringify(payload))
  request.end()
  core.debug(JSON.stringify(payload))
}


async function run(): Promise<void> {
  if (GITHUB_RUN_ID == undefined) {
    core.setFailed('Unable to locate the current run id... Something is very wrong')
    return
  }

  try {
    const githubToken = core.getInput('github-token', { required: true })
    const discordWebhook = core.getInput('discord-webhook', { required: true })
    const username = core.getInput('username')
    const avatarURL = core.getInput('avatar-url')

    const colors = {
      "Success": 0x17cf48,
      "Cancelled": 0xd3d3d3,
      "Failure": 0xe72727
    }

    core.setSecret(githubToken)
    core.setSecret(discordWebhook)

    const octokit = GitHub.getOctokit(githubToken)
    const context = GitHub.context

    octokit.actions.listJobsForWorkflowRun({
      owner: context.repo.owner,
      repo: context.repo.repo,
      run_id: parseInt(GITHUB_RUN_ID, 10)
    })
      .then(response => {
        let finishedJobs = []
        for (const job of response.data.jobs) {
          if (job.status === "completed") {
            finishedJobs.push({ name: job.name, status: job.conclusion, url: job.html_url })
          }
        }
        let workflowStatus = workflowStatusFromJobs(finishedJobs)

        // FIXME: the payload is untyped because I removed the existing typing
        // it was unnecessarily complex
        let payload = {
          username: username,
          avatar_url: avatarURL,
          embeds: [
            {
              author: {
                name: context.actor,
                url: `https://github.com/${context.actor}`,
                icon_url: `https://github.com/${context.actor}.png`
              },
              color: colors[workflowStatus],
              title: `${GITHUB_WORKFLOW}: ${workflowStatus}`,
              url: `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${GITHUB_RUN_ID}`,
              fields: [
                {
                  name: "Repository",
                  value: `[${context.repo.owner}/${context.repo.repo}](https://github.com/${context.repo.owner}/${context.repo.repo})`,
                  inline: false
                },
                {
                  name: "Ref",
                  value: context.ref,
                  inline: true
                },
                {
                  name: "Commit",
                  value: context.sha.substring(0, 8),
                  inline: true
                }
              ]
            }
          ]
        }

        if (workflowStatus !== "Failure") {
          finishedJobs.forEach(job => {
            payload.embeds[0].fields.push({
              name: job.name,
              value: `[\`${job.status}\`](${job.url})`,
              inline: false
            })
          })
        }

        notify(discordWebhook, payload)

      })
      .catch(error => {
        core.setFailed(error.message)
      })

  } catch (error) {
    core.setFailed((error as any).message)
  }

}

run()
