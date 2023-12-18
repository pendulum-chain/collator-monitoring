import {request, gql} from 'graphql-request';
import {ApiPromise, WsProvider} from '@polkadot/api';
import {encodeAddress} from '@polkadot/util-crypto';
import {hexToU8a} from '@polkadot/util';
import {Block, QueryResult, BlockProduction, ChainConfig} from './types.js';
import {SlackBlock, sendSlackNotification} from './slack.js';

// Chain configurations
const chains: ChainConfig[] = [
    {
        name: "pendulum",
        wsUrl: 'wss://rpc-pendulum.prd.pendulumchain.tech',
        gqlUrl: 'https://squid.subsquid.io/pendulum-squid/graphql',
        ss58Prefix: 56
    },
    {
        name: "amplitude",
        wsUrl: 'wss://rpc-amplitude.pendulumchain.tech',
        gqlUrl: 'https://squid.subsquid.io/amplitude-squid/graphql',
        ss58Prefix: 57
    },
    {
        name: "foucoco",
        wsUrl: 'wss://rpc-foucoco.pendulumchain.tech',
        gqlUrl: 'https://squid.subsquid.io/foucoco-squid/graphql',
        ss58Prefix: 57
    },
];

async function fetchCollators(wsUrl: string): Promise<string[]> {
    const wsProvider = new WsProvider(wsUrl);
    const api = await ApiPromise.create({provider: wsProvider});

    // Query the current set of collators
    const collators = await api.query.session.validators();

    // Cast the result to an array and process it
    const collatorAddresses = collators.toJSON() as string[];

    // Disconnect from the WebSocket
    await api.disconnect();

    // Return the list of collator addresses
    return collatorAddresses;
}

// GraphQL query used for fetching blocks produced in the last 24 hours
const getQuery = (timestamp: string) => gql`
    {
        blocks(
            limit: 7200,
            orderBy: timestamp_DESC,
            where: { timestamp_gte: "${timestamp}" }
        ) {
            height
            timestamp
            validator
        }
    }
`;

async function fetchBlocks(gqlUrl: string, timestamp: string): Promise<Block[]> {
    try {
        const query = getQuery(timestamp);
        const data = await request<QueryResult>(gqlUrl, query);
        return data.blocks;
    } catch (error) {
        console.error('Error fetching block data:', error);
        throw error;
    }
}

// Fetch all collators and blocks, then identify inactive and slow collators
async function analyzeCollatorActivity(chainConfig: ChainConfig) {
    try {
        let slackBlocks: SlackBlock[] = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": `Chain analysis for *${chainConfig.name}:*`
                }
            }
        ];

        // Fetch all collators
        const allCollators = await fetchCollators(chainConfig.wsUrl);

        // Calculate the timestamp for 24 hours ago
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Fetch blocks produced in the last 24 hours
        const blocks = await fetchBlocks(chainConfig.gqlUrl, oneDayAgo);

        // Convert collator addresses to Substrate format
        const convertedBlocks = blocks.map(block => ({
            ...block,
            validator: encodeAddress(hexToU8a(block.validator), chainConfig.ss58Prefix)
        }));

        // Track block production
        const blockProduction: BlockProduction = {};
        convertedBlocks.forEach(block => {
            const {validator: collator, timestamp} = block;
            blockProduction[collator] = blockProduction[collator] || [];
            blockProduction[collator].push(timestamp);
        });

        // Identify inactive collators
        const inactiveCollators = allCollators.filter(collator =>
            !blockProduction[collator] || blockProduction[collator].length === 0
        );

        // Target block time is 12s, so 7200 blocks are expected in 24 hours
        const targetBlocksIn24Hours = 7200;
        const expectedBlocksPerCollator = targetBlocksIn24Hours / allCollators.length;
        // Get the percentage from env var and set it to 75% by default
        // Used to determine the threshold for slow collators and is a percentage of the expected blocks produced per collator in 24 hours
        const percentage = process.env.PERCENTAGE ? parseInt(process.env.PERCENTAGE) : 75;
        const blocksProducedThreshold = expectedBlocksPerCollator * percentage / 100;

        // Identify slow collators among active collators
        const slowCollators = allCollators.filter(collator => {
            const producedBlocks = blockProduction[collator]?.length || 0;
            // If a collator produced less than 75% of the expected blocks, it's considered slow
            return producedBlocks < blocksProducedThreshold && !inactiveCollators.includes(collator);
        });

        if (inactiveCollators.length > 0) {
            slackBlocks.push({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": `*Inactive collators:*\n ${inactiveCollators.join(', ')}`
                }
            });
        }

        if (slowCollators.length > 0) {
            slackBlocks.push({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": `*Slow collators*: (produced <${percentage}% of expected blocks)\n ${slowCollators.join(', ')}`
                }
            });
        }

        console.log('On network: ', chainConfig.name);
        console.log('Inactive collators:', inactiveCollators);
        console.log('Slow collators:', slowCollators);

        if (inactiveCollators.length > 0 || slowCollators.length > 0) {
            return slackBlocks
        }
        // We don't want to send a slack message if there are no inactive or slow collators
        return []
    } catch (error) {
        console.error('Error analyzing collator activity:', error);
        await sendSlackNotification({
            blocks: [{
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": `:x: Error analyzing chain ${chainConfig.name}: ${error}`
                }
            }]
        });
    }
}

async function run() {
// Combining the results of multiple promises to a single slack message
    let slackBlocks: SlackBlock[] = [];
    for (const chain of chains) {
        console.log(`Analyzing chain ${chain.name}...`);
        await analyzeCollatorActivity(chain)
            .then((blocks) => {
                console.log(`Analysis completed for chain ${chain.name}.`)

                if (blocks && blocks.length > 0) {
                    slackBlocks.push(...blocks)
                }
            })
            .catch(error => console.error(`Error analyzing collator activity for chain ${chain.name}:`, error));

    }

    if (slackBlocks.length > 0) {
        // Prepend a header to the Slack message
        slackBlocks.unshift({
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": `Collator activity analysis`
            }
        });
        await sendSlackNotification({blocks: slackBlocks});
    }
}

// Infinitely call the run function
while (true) {
    await run();
    // Wait for some days, defaults to 7 days
    const waitTimeDays = process.env.WAIT_TIME_DAYS ? parseInt(process.env.WAIT_TIME_DAYS) : 7;
    console.log("Sleeping for ", waitTimeDays, " days");
    const ms = waitTimeDays * 24 * 60 * 60 * 1000;

    await new Promise(resolve => setTimeout(resolve, ms));
}
