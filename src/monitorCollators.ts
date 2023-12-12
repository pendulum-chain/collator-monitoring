import { request, gql } from 'graphql-request';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { encodeAddress } from '@polkadot/util-crypto';
import { hexToU8a } from '@polkadot/util';
import { Block, QueryResult, BlockProduction, ChainConfig } from './types';
import { sendSlackNotification } from './slack';

// Chain configurations
const chains: ChainConfig[] = [
    { name: "pendulum", wsUrl: 'wss://rpc-pendulum.prd.pendulumchain.tech', gqlUrl: 'https://squid.subsquid.io/pendulum-squid/graphql', ss58Prefix: 56 },
    { name: "amplitude", wsUrl: 'wss://rpc-amplitude.pendulumchain.tech', gqlUrl: 'https://squid.subsquid.io/amplitude-squid/graphql', ss58Prefix: 57 },
    { name: "foucoco", wsUrl: 'wss://rpc-foucoco.pendulumchain.tech', gqlUrl: 'https://squid.subsquid.io/foucoco-squid/graphql', ss58Prefix: 57 },
];

async function fetchCollators(wsUrl: string): Promise<string[]> {
    const wsProvider = new WsProvider(wsUrl);
    const api = await ApiPromise.create({ provider: wsProvider });

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
        let message = `Chain Analysis for ${chainConfig.name}:\n`;

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
            const { validator: collator, timestamp } = block;
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
            message += `Inactive collators: ${inactiveCollators.join(', ')}\n`;
        }

        if (slowCollators.length > 0) {
            message += `Slow collators: ${slowCollators.join(', ')}\n`;
        }

        if (inactiveCollators.length > 0 || slowCollators.length > 0) {
            await sendSlackNotification(message);
        }

        console.log('Inactive collators:', inactiveCollators);
        console.log('Slow collators:', slowCollators);
    } catch (error) {
        console.error('Error analyzing collator activity:', error);
        await sendSlackNotification(`Error analyzing collator activity for chain ${chainConfig.name}: ${error}`);
    }
}

chains.forEach(chain => {
    console.log(`Analyzing chain ${chain.name}...`);
    analyzeCollatorActivity(chain)
        .then(() => console.log(`Analysis completed for chain ${chain.name}.`))
        .catch(error => console.error(`Error analyzing collator activity for chain ${chain.name}:`, error));
});

