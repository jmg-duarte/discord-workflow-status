"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const https = __importStar(require("https"));
const core = __importStar(require("@actions/core"));
const GitHub = __importStar(require("@actions/github"));
const { GITHUB_RUN_ID, GITHUB_WORKFLOW } = process.env;
function workflowStatusFromJobs(jobs) {
    for (let job of jobs) {
        if (job.status === "cancelled") {
            return "Cancelled";
        }
        else if (job.status === "failure") {
            return "Failure";
        }
    }
    return "Success";
}
// FIXME: the payload type is wrong, it should be something like WebhookWithEmbed
function notify(webhook, payload) {
    const request = https.request(webhook, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        }
    });
    request.write(JSON.stringify(payload));
    request.end();
    core.debug(JSON.stringify(payload));
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        if (GITHUB_RUN_ID == undefined) {
            core.setFailed('Unable to locate the current run id... Something is very wrong');
            return;
        }
        try {
            const githubToken = core.getInput('github-token', { required: true });
            const discordWebhook = core.getInput('discord-webhook', { required: true });
            const username = core.getInput('username');
            const avatarURL = core.getInput('avatar-url');
            const colors = {
                "Success": 0x17cf48,
                "Cancelled": 0xd3d3d3,
                "Failure": 0xe72727
            };
            core.setSecret(githubToken);
            core.setSecret(discordWebhook);
            const octokit = GitHub.getOctokit(githubToken);
            const context = GitHub.context;
            octokit.actions.listJobsForWorkflowRun({
                owner: context.repo.owner,
                repo: context.repo.repo,
                run_id: parseInt(GITHUB_RUN_ID, 10)
            })
                .then(response => {
                let finishedJobs = [];
                for (const job of response.data.jobs) {
                    if (job.status === "completed") {
                        finishedJobs.push({ name: job.name, status: job.conclusion, url: job.html_url });
                    }
                }
                let workflowStatus = workflowStatusFromJobs(finishedJobs);
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
                };
                if (workflowStatus !== "Failure") {
                    finishedJobs.forEach(job => {
                        payload.embeds[0].fields.push({
                            name: job.name,
                            value: `[\`${job.status}\`](${job.url})`,
                            inline: false
                        });
                    });
                }
                notify(discordWebhook, payload);
            })
                .catch(error => {
                core.setFailed(error.message);
            });
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
run();
