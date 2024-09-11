import * as https from "https";

import * as core from "@actions/core";
import * as GitHub from "@actions/github";
import { WebhookPayload } from "@actions/github/lib/interfaces";

type JobData = {
  name: string;
  status: string | null;
  url: string;
};

const { GITHUB_RUN_ID, GITHUB_WORKFLOW } = process.env;

function workflowStatusFromJobs(
  jobs: JobData[]
): "Success" | "Failure" | "Cancelled" {
  for (let job of jobs) {
    if (job.status === "cancelled") {
      return "Cancelled";
    } else if (job.status === "failure") {
      return "Failure";
    }
  }
  return "Success";
}

// FIXME: the payload type is wrong, it should be something like WebhookWithEmbed
function notify(webhook: string, payload: object) {
  const request = https.request(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
  request.write(JSON.stringify(payload));
  request.end();
}

function getBody(payload: WebhookPayload) {
  // NOTE: The title property is "stolen" from the actual JSON, it's not actually part of the type
  if (payload.hasOwnProperty("pull_request")) {
    const title = payload.pull_request?.title;
    const number = payload.pull_request?.number;
    const url = payload.pull_request?.html_url;
    return `[${title} (${number})](${url})`;
  } else if (payload.hasOwnProperty("issue")) {
    const title = payload.issue?.title;
    const number = payload.issue?.number;
    const url = payload.issue?.html_url;
    return `[${title} (${number})](${url})`;
  } else {
    // FIXME: figure out if we should support this case
    return "";
  }
}

function formatDuration(timeCompleted: string, timeStarted: string) {
  let durationMs = Date.parse(timeCompleted) - Date.parse(timeStarted);
  let seconds = Math.floor((durationMs / 1000) % 60);
  let minutes = Math.floor((durationMs / (1000 * 60)) % 60);
  let hours = Math.floor((durationMs / (1000 * 60 * 60)));
  let formattedDuration = '';
  if (hours > 0) {
    formattedDuration += `${hours}h `;
  }
  if (minutes > 0) {
    formattedDuration += `${minutes}m `;
  }
  formattedDuration += `${seconds}s`;

  return formattedDuration.trim();
}

async function run(): Promise<void> {
  if (GITHUB_RUN_ID == undefined) {
    core.setFailed(
      "Unable to locate the current run id... Something is very wrong"
    );
    return;
  }

  const strict: boolean = core.getBooleanInput("strict");
  const discordWebhook: string = core
    .getInput("discord-webhook", { required: false })
    .trim();

  if (!discordWebhook) {
    core.warning("`discord-webhook` is empty");
    if (strict) {
      core.setFailed("`discord-webhook` is missing or empty");
    }
    return;
  }

  try {
    const githubToken: string = core
      .getInput("github-token", { required: true })
      .trim();

    const username = core.getInput("username");
    const avatarURL = core.getInput("avatar-url");

    const colors = {
      Success: 0x17cf48,
      Cancelled: 0xd3d3d3,
      Failure: 0xe72727,
    };

    core.setSecret(githubToken);
    core.setSecret(discordWebhook);

    const octokit = GitHub.getOctokit(githubToken);
    const context = GitHub.context;

    octokit.actions
      .listJobsForWorkflowRun({
        owner: context.repo.owner,
        repo: context.repo.repo,
        run_id: parseInt(GITHUB_RUN_ID, 10),
      })
      // FIXME: add typing
      .then((response) => {
        let finishedJobs = [];
        for (const job of response.data.jobs) {
          if (job.status === "completed") {
            finishedJobs.push({
              name: job.name,
              status: job.conclusion,
              url: job.html_url,
              duration: formatDuration(job.completed_at, job.started_at),
            });
          }
        }
        let workflowStatus = workflowStatusFromJobs(finishedJobs);

        // FIXME: the payload is untyped because I removed the existing typing
        // it was unnecessarily complex
        // FIXME: Could the payload use the builder pattern for typechecking and readability??
        let payload = {
          username: username,
          avatar_url: avatarURL,
          embeds: [
            {
              author: {
                name: context.actor,
                url: `https://github.com/${context.actor}`,
                icon_url: `https://github.com/${context.actor}.png`,
              },
              color: colors[workflowStatus],
              title: `${GITHUB_WORKFLOW} - ${workflowStatus}`,
              url: `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${GITHUB_RUN_ID}`,
              description: getBody(context.payload),
              fields: [
                {
                  name: "Repository",
                  value: `[${context.repo.owner}/${context.repo.repo}](https://github.com/${context.repo.owner}/${context.repo.repo})`,
                  inline: true,
                },
                {
                  name: "Reference",
                  value: context.ref,
                  inline: true,
                },
                {
                  name: "Commit",
                  value: context.sha.substring(0, 8),
                  inline: true,
                },
              ],
            },
          ],
        };

        if (workflowStatus !== "Success") {
          for (const job of finishedJobs) {
            if (job.status !== "success") {
              payload.embeds[0].fields.push({
                name: job.name,
                value: `[\`${job.status}\`](${job.url}) - ${job.duration}`,
                inline: false,
              });
            }
          }
        }

        notify(discordWebhook, payload);
      })
      // FIXME: add typing
      .catch((error) => {
        core.setFailed(error.message);
      });
  } catch (error) {
    core.setFailed((error as any).message);
  }
}

run();
