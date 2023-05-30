import * as https from "https"

import * as core from '@actions/core'
import * as GitHub from '@actions/github'

import DiscordWebhook, { EmbedField } from './types'

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

        let payload: DiscordWebhook = {
          username: username,
          avatar_url: avatarURL,
          embeds: [
            {
              author: {
                name: context.actor,
                url: `https://github.com/${context.actor}`,
                icon_url: `https://github.com/${context.actor}.png`
              },
              title: `[${context.repo.owner}/${context.repo.repo}@${context.sha}] ${GITHUB_WORKFLOW}: ${workflowStatus}`,
              url: `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${GITHUB_RUN_ID}`,
              color: colors[workflowStatus]
            }
          ]
        }

        if (workflowStatus !== "Failure") {
          let fields: EmbedField[] = []

          finishedJobs.forEach(job => {
            fields.push({
              name: job.name,
              value: `[\`${job.status}\`](${job.url})`,
              inline: false
            })
          })

          payload.embeds[0].fields = fields
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
