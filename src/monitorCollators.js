"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_request_1 = require("graphql-request");
// GraphQL endpoint
// Will be added as an env variable in the future
const endpoint = 'https://squid.subsquid.io/foucoco-squid/graphql';
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
async function fetchBlocks(timestamp) {
    try {
        const query = getQuery(timestamp);
        const data = await (0, graphql_request_1.request)(endpoint, query);
        console.log(data);
        return data.blocks;
    }
    catch (error) {
        console.error('Error fetching block data:', error);
        throw error;
    }
}
// Identify inactive collators
async function identifyInactiveCollators() {
    try {
        // Calculate the timestamp for 24 hours ago
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const blocks = await fetchBlocks(oneDayAgo);
        // Track block production
        const blockProduction = {};
        blocks.forEach(block => {
            const { validator, timestamp } = block;
            blockProduction[validator] = blockProduction[validator] || [];
            blockProduction[validator].push(timestamp);
        });
        // Determine inactivity
        const inactiveCollators = Object.keys(blockProduction).filter(validator => {
            const timestamps = blockProduction[validator];
            // Find the most recent timestamp for the validator
            const lastProductionTime = timestamps.reduce((latest, current) => latest > current ? latest : current, '');
            return lastProductionTime < oneDayAgo;
        });
        console.log('Inactive collators:', inactiveCollators);
    }
    catch (error) {
        console.error('Error identifying inactive collators:', error);
    }
}
identifyInactiveCollators();
