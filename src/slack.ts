import axios from 'axios';

if (!process.env.SLACK_WEBHOOK_TOKEN) {
    throw new Error('Slack webhook token is not defined.');
}

const slackWebHookUrl = 'https://hooks.slack.com/services/${process.env.SLACK_WEB_HOOK_TOKEN}';

export async function sendSlackNotification(message: string) {
    try {
        await axios.post(slackWebHookUrl, { text: message });
    } catch (error) {
        console.error('Error sending Slack notification:', error);
    }
}
