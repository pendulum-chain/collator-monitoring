"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_request_1 = require("graphql-request");
const util_crypto_1 = require("@polkadot/util-crypto");
const util_1 = require("@polkadot/util");
// Chain configurations
const chains = [
    { name: "pendulum", wsUrl: 'wss://rpc-pendulum.prd.pendulumchain.tech', gqlUrl: 'https://squid.subsquid.io/pendulum-squid/graphql', ss58Prefix: 56 },
    { name: "amplitude", wsUrl: 'wss://rpc-amplitude.pendulumchain.tech', gqlUrl: 'https://squid.subsquid.io/amplitude-squid/graphql', ss58Prefix: 57 },
    { name: "foucoco", wsUrl: 'wss://rpc-foucoco.pendulumchain.tech', gqlUrl: 'https://squid.subsquid.io/foucoco-squid/graphql', ss58Prefix: 57 },
];
const api_1 = require("@polkadot/api");
async function fetchCollators(wsUrl) {
    const wsProvider = new api_1.WsProvider(wsUrl);
    const api = await api_1.ApiPromise.create({ provider: wsProvider });
    // Query the current set of collators
    const collators = await api.query.session.validators();
    // Cast the result to an array and process it
    const collatorAddresses = collators.toJSON();
    // Disconnect from the WebSocket
    await api.disconnect();
    // Return the list of collator addresses
    return collatorAddresses;
}
// GraphQL query
const getQuery = (timestamp) => (0, graphql_request_1.gql) `
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
// Fetch blocks
async function fetchBlocks(gqlUrl, timestamp) {
    try {
        const query = getQuery(timestamp);
        const data = await (0, graphql_request_1.request)(gqlUrl, query);
        return data.blocks;
    }
    catch (error) {
        console.error('Error fetching block data:', error);
        throw error;
    }
}
// Fetch all collators and blocks, then identify inactive and slow collators
async function analyzeCollatorActivity(wsUrl, gqlUrl, ss58Prefix) {
    try {
        // Fetch all collators
        const allCollators = await fetchCollators(wsUrl);
        // Calculate the timestamp for 24 hours ago
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        // Fetch blocks produced in the last 24 hours
        const blocks = await fetchBlocks(gqlUrl, oneDayAgo);
        // Convert collator addresses to Substrate format
        const convertedBlocks = blocks.map(block => ({
            ...block,
            validator: (0, util_crypto_1.encodeAddress)((0, util_1.hexToU8a)(block.validator), ss58Prefix)
        }));
        // Target block time is 12s, so 7200 blocks are expected in 24 hours
        const targetBlocksIn24Hours = 7200;
        const expectedBlocksPerCollator = targetBlocksIn24Hours / allCollators.length;
        // Track block production
        const blockProduction = {};
        convertedBlocks.forEach(block => {
            const { validator: collator, timestamp } = block;
            blockProduction[collator] = blockProduction[collator] || [];
            blockProduction[collator].push(timestamp);
        });
        // Identify inactive collators
        const inactiveCollators = allCollators.filter(collator => !blockProduction[collator] || blockProduction[collator].length === 0);
        // Identify slow collators among active collators
        const slowCollators = allCollators.filter(collator => {
            const producedBlocks = blockProduction[collator]?.length || 0;
            // If a collator produced less than 75% of the expected blocks, it's considered slow
            return producedBlocks < expectedBlocksPerCollator * 0.75 && !inactiveCollators.includes(collator);
        });
        console.log('Inactive collators:', inactiveCollators);
        console.log('Slow collators:', slowCollators);
    }
    catch (error) {
        console.error('Error analyzing collator activity:', error);
    }
}
chains.forEach(chain => {
    console.log(`Analyzing chain ${chain.name}...`);
    analyzeCollatorActivity(chain.wsUrl, chain.gqlUrl, chain.ss58Prefix)
        .then(() => console.log(`Analysis completed for chain ${chain.name}.`))
        .catch(error => console.error(`Error analyzing chain ${chain.name}:`, error));
});
