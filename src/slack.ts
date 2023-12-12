import { Block, KnownBlock } from '@slack/types';
import axios from 'axios';

if (!process.env.SLACK_WEBHOOK_TOKEN) {
    throw new Error('Slack webhook token is not defined.');
}

const slackWebHookUrl = 'https://hooks.slack.com/services/${process.env.SLACK_WEB_HOOK_TOKEN}';

export type SlackBlock = KnownBlock | Block;

export interface SlackBlockkitMessage {
    blocks?: SlackBlock[];
}

export async function sendSlackNotification(message: SlackBlockkitMessage) {
    try {
        const payload = JSON.stringify(message);
        await axios.post(slackWebHookUrl, payload, {
            headers: {
              "Content-Type": "application/json"
            }
          });
    } catch (error) {
        throw new Error(`Failed to send message. Error: ${error}`);
    }
}
